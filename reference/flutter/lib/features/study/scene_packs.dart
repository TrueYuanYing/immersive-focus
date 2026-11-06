import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

class ScenePack {
  const ScenePack(
      {required this.id, required this.sha256, required this.bytes});
  final String id;
  final String sha256;
  final int bytes;
  factory ScenePack.fromJson(Map<String, dynamic> json) => ScenePack(
        id: json['id'] as String,
        sha256: json['sha256'] as String,
        bytes: json['bytes'] as int,
      );
}

/// The public beta executes only the released cafe pack; future saves are retained.
class ScenePacks {
  ScenePacks(this.root);
  final Directory root;
  static final _pending = <String, Future<void>>{};
  Future<T> _serialized<T>(ScenePack pack, Future<T> Function() action) async {
    final key = location(pack).absolute.path;
    final previous = _pending[key];
    final gate = Completer<void>();
    _pending[key] = gate.future;
    try {
      await previous;
      return await action();
    } finally {
      gate.complete();
      if (identical(_pending[key], gate.future)) _pending.remove(key);
    }
  }

  static const channel = MethodChannel('com.iko.study/resources');
  static Future<ScenePacks> open() async => ScenePacks(Directory(
      p.join((await getApplicationSupportDirectory()).path, 'study-packs')));
  static Future<List<ScenePack>> catalog() async {
    final items =
        jsonDecode(await rootBundle.loadString('assets/study/catalog.json'))
            as List;
    return items
        .map((e) => ScenePack.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Directory location(ScenePack pack) {
    if (pack.id != 'mado' || !RegExp(r'^[a-f0-9]{64}$').hasMatch(pack.sha256)) {
      throw const FormatException('资源清单无效');
    }
    return Directory(p.join(root.path, '${pack.id}-${pack.sha256}'));
  }

  Future<bool> installed(ScenePack pack) async =>
      File(p.join(location(pack).path, '.complete')).exists();

  Future<Directory> ensure(ScenePack pack) async {
    location(
        pack); // Apply this edition's released-scene allowlist before native access.
    final result = await const MethodChannel('com.iko.study/resource_packs')
        .invokeMapMethod<String, dynamic>('status', {'id': 'focus-${pack.id}'});
    final path = result?['path'] as String?;
    if (path == null) throw StateError('请先安装场景资源');
    return Directory(path);
  }

  static Future<void> release(String id) =>
      const MethodChannel('com.iko.study/resource_packs')
          .invokeMethod<void>('releaseScene', {'id': 'focus-$id'});

  Future<Directory> install(ScenePack pack, List<int> bytes) =>
      _serialized(pack, () => _install(pack, bytes));

  Future<Directory> _install(ScenePack pack, List<int> bytes) async {
    final target = location(pack);
    if (bytes.length != pack.bytes ||
        sha256.convert(bytes).toString() != pack.sha256) {
      throw const FormatException('资源包校验失败，请选择本版本配套的 ZIP 文件');
    }
    if (await installed(pack)) return target;
    final staging = Directory(
        '${target.path}.staging-${DateTime.now().microsecondsSinceEpoch}');
    try {
      final archive = ZipDecoder().decodeBytes(bytes, verify: true);
      var expanded = 0;
      final names = <String>{};
      for (final entry in archive) {
        expanded += entry.size;
        final name = entry.name.replaceAll('\\', '/');
        if (expanded > 350 * 1024 * 1024 ||
            archive.length > 2000 ||
            name.startsWith('/') ||
            name.contains(':') ||
            name.split('/').contains('..') ||
            entry.isSymbolicLink ||
            !names.add(name)) {
          throw const FormatException('资源包目录或大小无效');
        }
        if (!entry.isFile) continue;
        final file = File(p.join(staging.path, name));
        await file.parent.create(recursive: true);
        await file.writeAsBytes(entry.content);
      }
      if (!await File(p.join(staging.path, 'index.html')).exists()) {
        throw const FormatException('缺少场景入口');
      }
      await File(p.join(staging.path, '.complete')).writeAsString(pack.sha256);
      if (await target.exists()) await target.delete(recursive: true);
      await staging.rename(target.path);
      return target;
    } finally {
      if (await staging.exists()) await staging.delete(recursive: true);
    }
  }

  Future<void> import(ScenePack pack) async {
    final path = await channel.invokeMethod<String>('pickPack');
    if (path == null) return;
    final file = File(path);
    try {
      if (await file.length() != pack.bytes) {
        throw const FormatException('文件大小与本版本资源包不符');
      }
      await install(pack, await file.readAsBytes());
    } finally {
      if (await file.exists()) await file.delete();
    }
  }

  Future<void> download(ScenePack pack, String base, CancelToken token,
      void Function(int, int) progress) async {
    final uri = Uri.tryParse(base.trim());
    if (uri == null ||
        uri.scheme != 'https' ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        uri.hasQuery ||
        uri.hasFragment) {
      throw const FormatException('请输入 HTTPS 资源目录地址');
    }
    await root.create(recursive: true);
    final file = File(p.join(root.path, '${pack.id}.download'));
    final dio = Dio(BaseOptions(
        connectTimeout: const Duration(seconds: 20),
        receiveTimeout: const Duration(seconds: 60)));
    try {
      final url = uri.replace(
          path: '${uri.path.replaceFirst(RegExp(r'/+$'), '')}/${pack.id}.zip');
      await dio.download(url.toString(), file.path,
          cancelToken: token, options: Options(followRedirects: false),
          onReceiveProgress: (received, total) {
        if (received > pack.bytes) token.cancel('资源大小超出清单');
        progress(received, pack.bytes);
      });
      if (token.isCancelled) throw StateError('下载已取消');
      await install(pack, await file.readAsBytes());
    } finally {
      dio.close();
      if (await file.exists()) await file.delete();
    }
  }

  Future<void> remove(ScenePack pack) => _serialized(pack, () async {
        final target = location(pack);
        if (await target.exists()) await target.delete(recursive: true);
      });
}

/// A document per scene isolates all CSS. Native snapshots survive origin changes.
class StudySceneServer {
  StudySceneServer(this.directory, this.scene, this.snapshot,
      {this.uiFiles = const {}});
  final Set<String> uiFiles;
  final Directory directory;
  final String scene;
  final Map<String, dynamic> snapshot;
  HttpServer? _server;
  bool _restored = false;

  Future<Uri> start() async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    _server = server;
    server.listen((request) => unawaited(_handle(request)));
    return Uri.parse(
        'http://127.0.0.1:${server.port}/scenes/$scene/index.html');
  }

  Future<void> _handle(HttpRequest request) async {
    try {
      final prefix = '/scenes/$scene/';
      final path = request.uri.path;
      if (!{'GET', 'HEAD'}.contains(request.method) ||
          !path.startsWith(prefix)) {
        request.response.statusCode = 404;
        return;
      }
      final relative = path.substring(prefix.length);
      if (relative.contains('\\') ||
          relative.contains(':') ||
          relative.split('/').any((s) => s == '..' || s.startsWith('.'))) {
        request.response.statusCode = 404;
        return;
      }
      final isUi = uiFiles.contains(relative);
      final file = File(
          p.join(directory.path, relative.isEmpty ? 'index.html' : relative));
      if (!p.isWithin(directory.absolute.path, file.absolute.path) ||
          (!isUi && !await file.exists())) {
        request.response.statusCode = 404;
        return;
      }
      final ext = p.extension(file.path);
      request.response.headers.set(
          'Content-Type',
          switch (ext) {
            '.html' => 'text/html; charset=utf-8',
            '.js' => 'application/javascript',
            '.css' => 'text/css',
            '.json' => 'application/json',
            '.wasm' => 'application/wasm',
            '.glb' => 'model/gltf-binary',
            '.svg' => 'image/svg+xml',
            '.png' => 'image/png',
            _ => 'application/octet-stream',
          });
      request.response.headers.set('Cache-Control', 'no-store');
      if (request.method == 'HEAD') return;
      if (ext == '.html') {
        final encoded = jsonEncode(snapshot).replaceAll('<', '\\u003c');
        final bootstrap = _restored
            ? ''
            : '<script>try { const saved=$encoded; const keys=${jsonEncode(scene == 'mado' ? [
                'mado.session.v1',
                'mado.preferences.v1'
              ] : [
                'haijian.v1',
                'haijian.v1.recovery'
              ])}; for (const k of keys) { if (typeof saved[k] === \'string\') localStorage.setItem(k,saved[k]); else localStorage.removeItem(k); } } catch(e) { console.error(e); }</script>';
        _restored = true;
        final html = isUi
            ? await rootBundle.loadString('assets/study/mado-ui/$relative')
            : await file.readAsString();
        request.response.write(html.replaceFirst('<head>', '<head>$bootstrap'));
      } else {
        if (isUi) {
          final data = await rootBundle.load('assets/study/mado-ui/$relative');
          request.response.add(
              data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes));
        } else {
          await request.response.addStream(file.openRead());
        }
      }
    } catch (_) {
      request.response.statusCode = 500;
    } finally {
      await request.response.close();
    }
  }

  Future<void> dispose() async {
    await _server?.close(force: true);
    _server = null;
  }
}
