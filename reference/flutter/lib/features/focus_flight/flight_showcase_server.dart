import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Serves the BWP showcase from an in-process loopback HTTP server.
///
/// WebView is deliberately given an http:// URL instead of a file:// URL so
/// the module import in demo/flight-showcase.html behaves exactly like the
/// original preview server, while all bytes still come from Flutter assets.
class BwpFlightShowcaseServer {
  HttpServer? _server;
  final Map<String, Future<List<int>>> _assetCache = {};

  Future<Uri> start() async {
    final current = _server;
    if (current != null) {
      return _showcaseUri(current.port);
    }
    final server = await HttpServer.bind(
      InternetAddress.loopbackIPv4,
      0,
      shared: false,
    );
    _server = server;
    unawaited(_serve(server));
    return _showcaseUri(server.port);
  }

  Uri _showcaseUri(int port) => Uri(
        scheme: 'http',
        host: '127.0.0.1',
        port: port,
        path: '/demo/flight-showcase.html',
      );

  Future<void> _serve(HttpServer server) async {
    try {
      await for (final request in server) {
        unawaited(_handle(request));
      }
    } on StateError {
      // Closing the server ends the request stream normally for this owner.
    } on SocketException {
      // The WebView can disappear while the page is being torn down.
    }
  }

  Future<void> _handle(HttpRequest request) async {
    final response = request.response;
    try {
      if (request.method != 'GET' && request.method != 'HEAD') {
        response.statusCode = HttpStatus.methodNotAllowed;
        await response.close();
        return;
      }

      var path = Uri.decodeComponent(request.uri.path);
      if (path == '/' || path.isEmpty) path = '/demo/flight-showcase.html';
      if (!path.startsWith('/') || path.contains('..')) {
        response.statusCode = HttpStatus.notFound;
        await response.close();
        return;
      }

      final assetPath = 'assets/focus_flight/bwp$path';
      final bytes = await (_assetCache[assetPath] ??= _load(assetPath));
      response.statusCode = HttpStatus.ok;
      response.headers.contentType = _contentType(path);
      response.headers.set('cache-control', 'public, max-age=31536000');
      response.headers.contentLength = bytes.length;
      if (request.method == 'GET') response.add(bytes);
    } on FlutterError {
      response.statusCode = HttpStatus.notFound;
      debugPrint('BWP Flight HTTP 404: ${request.uri.path}');
    } on Object {
      response.statusCode = HttpStatus.internalServerError;
      debugPrint('BWP Flight HTTP 500: ${request.uri.path}');
    } finally {
      await response.close();
    }
  }

  Future<List<int>> _load(String assetPath) async {
    final data = await rootBundle.load(assetPath);
    return data.buffer
        .asUint8List(data.offsetInBytes, data.lengthInBytes)
        .toList(growable: false);
  }

  ContentType _contentType(String path) {
    final lower = path.toLowerCase();
    if (lower.endsWith('.html')) {
      return ContentType('text', 'html', charset: 'utf-8');
    }
    if (lower.endsWith('.js') || lower.endsWith('.mjs')) {
      return ContentType('application', 'javascript', charset: 'utf-8');
    }
    if (lower.endsWith('.json')) {
      return ContentType('application', 'json', charset: 'utf-8');
    }
    if (lower.endsWith('.png')) return ContentType('image', 'png');
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
      return ContentType('image', 'jpeg');
    }
    if (lower.endsWith('.obj')) {
      return ContentType('text', 'plain', charset: 'utf-8');
    }
    if (lower.endsWith('.mtl') || lower.endsWith('.txt')) {
      return ContentType('text', 'plain', charset: 'utf-8');
    }
    return ContentType('application', 'octet-stream');
  }

  Future<void> dispose() async {
    final server = _server;
    _server = null;
    _assetCache.clear();
    await server?.close(force: true);
  }
}

/// Serves the globe and its images over one local origin. Android WebView
/// restricts subresources referenced by file:// Flutter assets on some
/// devices, which previously left the globe on its coarse polygon texture.
class FocusGlobeAssetServer {
  HttpServer? _server;
  final Map<String, Future<List<int>>> _assetCache = {};

  Future<Uri> start() async {
    final current = _server;
    if (current != null) return _sceneUri(current.port);
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    _server = server;
    unawaited(_serve(server));
    return _sceneUri(server.port);
  }

  Uri _sceneUri(int port) => Uri(
      scheme: 'http', host: '127.0.0.1', port: port, path: '/globe_scene.html');

  Future<void> _serve(HttpServer server) async {
    try {
      await for (final request in server) {
        unawaited(_handle(request));
      }
    } on StateError {
      // Closing this server ends its request stream.
    } on SocketException {
      // WebView can disappear while the page is closing.
    }
  }

  Future<void> _handle(HttpRequest request) async {
    final response = request.response;
    try {
      if (request.method != 'GET' && request.method != 'HEAD') {
        response.statusCode = HttpStatus.methodNotAllowed;
        return;
      }
      final path = Uri.decodeComponent(request.uri.path);
      if (!path.startsWith('/') || path.contains('..')) {
        response.statusCode = HttpStatus.notFound;
        return;
      }
      final assetPath = 'assets/focus_flight$path';
      final bytes = await (_assetCache[assetPath] ??= _load(assetPath));
      response.statusCode = HttpStatus.ok;
      response.headers.contentType = _contentType(path);
      response.headers.set('cache-control', 'public, max-age=31536000');
      response.headers.contentLength = bytes.length;
      if (request.method == 'GET') response.add(bytes);
    } on FlutterError {
      response.statusCode = HttpStatus.notFound;
      debugPrint('Focus globe HTTP 404: ${request.uri.path}');
    } on Object catch (error) {
      response.statusCode = HttpStatus.internalServerError;
      debugPrint('Focus globe HTTP 500: ${request.uri.path}: $error');
    } finally {
      await response.close();
    }
  }

  Future<List<int>> _load(String path) async {
    final data = await rootBundle.load(path);
    return data.buffer
        .asUint8List(data.offsetInBytes, data.lengthInBytes)
        .toList(growable: false);
  }

  ContentType _contentType(String path) {
    if (path.endsWith('.html')) {
      return ContentType('text', 'html', charset: 'utf-8');
    }
    if (path.endsWith('.js') || path.endsWith('.mjs')) {
      return ContentType('application', 'javascript', charset: 'utf-8');
    }
    if (path.endsWith('.jpg')) return ContentType('image', 'jpeg');
    if (path.endsWith('.png')) return ContentType('image', 'png');
    return ContentType('application', 'octet-stream');
  }

  Future<void> dispose() async {
    final server = _server;
    _server = null;
    _assetCache.clear();
    await server?.close(force: true);
  }
}

/// Serves the original standalone WebGL battle scene on loopback HTTP.
///
/// Blue on Blue has its own camera follow, fighter, target missile and
/// projectile renderer. It deliberately does not reuse the scenic BWP page,
/// whose state bridge only owns the passenger-flight progress.
class FocusFlightBattleServer {
  HttpServer? _server;
  Future<List<int>>? _sceneBytes;

  Future<Uri> start() async {
    final current = _server;
    if (current != null) return _sceneUri(current.port);
    final server = await HttpServer.bind(
      InternetAddress.loopbackIPv4,
      0,
      shared: false,
    );
    _server = server;
    unawaited(_serve(server));
    return _sceneUri(server.port);
  }

  Uri _sceneUri(int port) => Uri(
        scheme: 'http',
        host: '127.0.0.1',
        port: port,
        path: '/flight_scene.html',
      );

  Future<void> _serve(HttpServer server) async {
    try {
      await for (final request in server) {
        unawaited(_handle(request));
      }
    } on StateError {
      // Closing the server ends the request stream normally for this owner.
    } on SocketException {
      // The WebView can disappear while the battle scene is being dismissed.
    }
  }

  Future<void> _handle(HttpRequest request) async {
    final response = request.response;
    try {
      if (request.method != 'GET' && request.method != 'HEAD') {
        response.statusCode = HttpStatus.methodNotAllowed;
        return;
      }

      var path = Uri.decodeComponent(request.uri.path);
      if (path == '/' || path.isEmpty) path = '/flight_scene.html';
      if (path != '/flight_scene.html') {
        response.statusCode = HttpStatus.notFound;
        return;
      }

      final bytes = await (_sceneBytes ??= _loadScene());
      response.statusCode = HttpStatus.ok;
      response.headers.contentType =
          ContentType('text', 'html', charset: 'utf-8');
      response.headers.set('cache-control', 'no-store');
      response.headers.contentLength = bytes.length;
      if (request.method == 'GET') response.add(bytes);
    } on FlutterError {
      response.statusCode = HttpStatus.notFound;
      debugPrint('Focus flight battle HTTP 404: ${request.uri.path}');
    } on Object {
      response.statusCode = HttpStatus.internalServerError;
      debugPrint('Focus flight battle HTTP 500: ${request.uri.path}');
    } finally {
      await response.close();
    }
  }

  Future<List<int>> _loadScene() async {
    final data = await rootBundle.load('assets/focus_flight/flight_scene.html');
    return data.buffer
        .asUint8List(data.offsetInBytes, data.lengthInBytes)
        .toList(growable: false);
  }

  Future<void> dispose() async {
    final server = _server;
    _server = null;
    _sceneBytes = null;
    await server?.close(force: true);
  }
}
