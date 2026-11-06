import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'scene_packs.dart';
import 'scene_snapshot.dart';
import 'mado_ui_files.dart';

class StudySceneScreen extends StatefulWidget {
  const StudySceneScreen({required this.pack, required this.title, super.key});
  final ScenePack pack;
  final String title;
  @override
  State<StudySceneScreen> createState() => _StudySceneScreenState();
}

class _StudySceneScreenState extends State<StudySceneScreen>
    with WidgetsBindingObserver {
  WebViewController? _web;
  StudySceneServer? _server;
  String? _error;
  bool _ready = false;
  bool _leaving = false;
  bool _canPop = false;
  String? _exitId;
  Future<void> _save = Future.value();
  Completer<void>? _disposed;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_load());
  }

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final directory = await (await ScenePacks.open()).ensure(widget.pack);
      if (!mounted || _leaving) return;
      final snapshot =
          jsonDecode(prefs.getString('iko.scene.${widget.pack.id}') ?? '{}')
              as Map<String, dynamic>;
      final server = StudySceneServer(directory, widget.pack.id, snapshot,
          uiFiles: widget.pack.id == 'mado' ? madoUiFiles : const {});
      _server = server;
      final uri = await server.start();
      if (!mounted || _leaving) {
        await server.dispose();
        return;
      }
      final web = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..setBackgroundColor(widget.pack.id == 'mado'
            ? const Color(0xFFEDE5D6)
            : Theme.of(context).scaffoldBackgroundColor)
        ..addJavaScriptChannel('IkoHost', onMessageReceived: (message) {
          _save = _save
              .then((_) => _message(message.message))
              .catchError((Object error) {
            if (mounted) setState(() => _error = '记录未能保存：$error');
          });
        })
        ..setNavigationDelegate(NavigationDelegate(
          onNavigationRequest: (request) =>
              request.url.startsWith('$uri'.replaceFirst('index.html', '')) ||
                      request.url == 'about:blank'
                  ? NavigationDecision.navigate
                  : NavigationDecision.prevent,
          onWebResourceError: (error) {
            if (mounted && error.isForMainFrame == true) {
              setState(() => _error = '场景加载失败：${error.description}');
            }
          },
        ));
      _web = web;
      await web.loadRequest(uri);
      if (mounted) setState(() {});
    } catch (e) {
      if (mounted) setState(() => _error = '场景尚未准备好：$e');
    }
  }

  Future<void> _message(String raw) async {
    if (raw.length > 6 * 1024 * 1024) throw const FormatException('场景记录过大');
    final message = jsonDecode(raw) as Map<String, dynamic>;
    if (message['scene'] != widget.pack.id) return;
    if (message['type'] == 'export') {
      unawaited(ScenePacks.channel.invokeMethod<void>('exportJson', {
        'name': '${widget.pack.id}-records.json',
        'data': message['data']
      }).catchError((Object error) {
        if (mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text('导出失败：$error')));
        }
      }));
      return;
    }
    final prefs = await SharedPreferences.getInstance();
    await saveSceneSnapshot(prefs, widget.pack.id, message);
    if (message['type'] == 'ready' && mounted) {
      setState(() {
        _ready = true;
        _error = null;
      });
      if (WidgetsBinding.instance.lifecycleState != AppLifecycleState.resumed) {
        await _command('pause');
      }
    }
    if (message['type'] == 'disposed' &&
        message['requestId'] == _exitId &&
        _disposed != null &&
        !_disposed!.isCompleted) {
      _disposed!.complete();
    }
  }

  Future<void> _command(String name, [Map<String, dynamic>? value]) async {
    try {
      await _web?.runJavaScript(
          'window.ikoScene?.command(${jsonEncode(name)},${jsonEncode(value)});');
    } catch (_) {/* Page can be unloading. */}
  }

  Future<void> _leave() async {
    if (_leaving) return;
    setState(() => _leaving = true);
    _exitId = DateTime.now().microsecondsSinceEpoch.toString();
    _disposed = Completer<void>();
    await _command('dispose', {'requestId': _exitId});
    if (_web != null) {
      try {
        await _disposed!.future.timeout(const Duration(seconds: 3));
      } on TimeoutException {/* Navigation still destroys the document. */}
      await _save;
      await _web?.loadRequest(Uri.parse('about:blank'));
    }
    await _server?.dispose();
    if (mounted) {
      setState(() => _canPop = true);
      await WidgetsBinding.instance.endOfFrame;
      if (mounted) Navigator.of(context).pop();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    unawaited(
        _command(state == AppLifecycleState.resumed ? 'visible' : 'pause'));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_command('dispose'));
    unawaited(_server?.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => PopScope(
        canPop: _canPop,
        onPopInvokedWithResult: (didPop, result) {
          if (!didPop) unawaited(_leave());
        },
        child: Scaffold(
          appBar: AppBar(
            title: Text(widget.title, style: const TextStyle(fontSize: 14)),
            leading: IconButton(
                tooltip: '保存并返回',
                onPressed: _leaving ? null : _leave,
                icon: const Icon(Icons.arrow_back)),
            actions: const [
              Padding(
                  padding: EdgeInsets.symmetric(horizontal: 16),
                  child: Center(
                      child: Text('IKO / 专注',
                          style: TextStyle(fontSize: 11, letterSpacing: 2))))
            ],
            toolbarHeight: 48,
          ),
          body: SafeArea(
              top: false,
              child: Stack(children: [
                if (_web != null) WebViewWidget(controller: _web!),
                if (!_ready && _error == null)
                  const LinearProgressIndicator(minHeight: 2),
                if (_error != null)
                  Center(
                      child: Container(
                    padding: const EdgeInsets.all(24),
                    color: Theme.of(context).colorScheme.surface,
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      Text(_error!,
                          style: Theme.of(context).textTheme.bodyMedium),
                      const SizedBox(height: 16),
                      FilledButton(onPressed: _leave, child: const Text('返回')),
                    ]),
                  )),
              ])),
        ),
      );
}
