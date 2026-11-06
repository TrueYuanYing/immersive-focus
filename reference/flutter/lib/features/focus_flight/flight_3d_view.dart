import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'flight_showcase_server.dart';

/// BWP WebGL2 飞行展示场景。
///
/// BWP 页面内部只绘制真实 3D 地形和程序化民航客机；Flutter 保留 App
/// 外壳与业务 HUD。Blue on Blue 也复用同一套天空、地形和主客机，只把
/// 战斗几何与相机状态推入这张 WebGL 世界。
class Flight3DView extends StatefulWidget {
  const Flight3DView({
    required this.progress,
    this.seed = 42,
    this.incidentState = 'idle',
    this.fighterX = .76,
    this.fighterY = .22,
    this.fighterVelocityX = 0,
    this.fighterVelocityY = 0,
    this.missileX = .84,
    this.missileY = .70,
    this.missileHealth = 100,
    this.threats = const <Map<String, Object?>>[],
    this.activeThreatIndex = 0,
    this.projectiles = const <Map<String, Object?>>[],
    this.impactToken = 0,
    this.impactX = 0,
    this.impactY = 0,
    this.impactThreatIndex = 0,
    this.impactLarge = false,
    this.controlsTopInset = 88,
    this.showControls = true,
    this.onReady,
    super.key,
  });

  final double progress;
  final int seed;
  final String incidentState;
  final double fighterX;
  final double fighterY;
  final double fighterVelocityX;
  final double fighterVelocityY;
  final double missileX;
  final double missileY;
  final double missileHealth;
  final List<Map<String, Object?>> threats;
  final int activeThreatIndex;
  final List<Map<String, Object?>> projectiles;
  final int impactToken;
  final double impactX;
  final double impactY;
  final int impactThreatIndex;
  final bool impactLarge;
  final double controlsTopInset;
  final bool showControls;
  final VoidCallback? onReady;

  @override
  State<Flight3DView> createState() => _Flight3DViewState();
}

class _Flight3DViewState extends State<Flight3DView>
    with WidgetsBindingObserver {
  late final BwpFlightShowcaseServer _server;
  WebViewController? _controller;
  bool _ready = false;
  bool _paused = false;
  bool _windowView = false;
  double _speed = 22;
  String? _loadError;
  bool _pushInFlight = false;
  bool _pushQueued = false;
  String? _latestStateJson;
  String? _lastStateJson;

  bool get _supportsWebView =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _server = BwpFlightShowcaseServer();
    if (_supportsWebView) unawaited(_initWebView());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final controller = _controller;
    if (controller != null && _ready) {
      unawaited(controller
          .runJavaScript(
              'window.BWP_FLIGHT_SHOWCASE?.setVisible(${state == AppLifecycleState.resumed});')
          .catchError((_) {}));
    }
  }

  Future<void> _initWebView() async {
    try {
      final baseUri = await _server.start();
      final uri = baseUri.replace(queryParameters: {
        ...baseUri.queryParameters,
        'embedded': '1',
      });
      late final WebViewController controller;
      controller = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..setBackgroundColor(const Color(0xFF070809))
        ..setOnConsoleMessage((message) {
          debugPrint(
              'BWP Flight WebGL: ${message.level.name}: ${message.message}');
        })
        ..setNavigationDelegate(
          NavigationDelegate(
            onPageFinished: (_) {
              unawaited(_waitForShowcase(controller));
            },
            onWebResourceError: (error) {
              debugPrint(
                'BWP Flight WebGL resource error: '
                '${error.errorCode} ${error.description} ${error.url}',
              );
            },
          ),
        );
      await controller.loadRequest(uri);
      if (!mounted) {
        await _server.dispose();
        return;
      }
      setState(() {
        _controller = controller;
      });
      if (_ready) _pushState();
    } on Object catch (error) {
      await _server.dispose();
      if (!mounted) return;
      setState(() => _loadError = error.toString());
    }
  }

  Future<void> _waitForShowcase(WebViewController controller) async {
    for (var attempt = 0; attempt < 300 && mounted; attempt++) {
      try {
        final value = await controller.runJavaScriptReturningResult(
            'Boolean(window.BWP_FLIGHT_SHOWCASE && window.setFlightState)');
        final ready = value == true ||
            value.toString() == 'true' ||
            value.toString() == '"true"';
        if (ready) {
          if (!mounted) return;
          setState(() => _ready = true);
          await _pushState();
          if (mounted) widget.onReady?.call();
          return;
        }
      } catch (_) {
        // The page may still be parsing its module graph.
      }
      await Future<void>.delayed(const Duration(milliseconds: 100));
    }
    if (mounted && !_ready) setState(() => _loadError = '3D 场景资源加载超时');
  }

  @override
  void didUpdateWidget(covariant Flight3DView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_ready) _pushState();
  }

  Future<void> _pushState() async {
    final controller = _controller;
    if (!_ready || controller == null) return;
    final state = <String, Object?>{
      'progress': widget.progress.clamp(0.0, 1.0),
      'seed': widget.seed,
      'mode': widget.incidentState == 'idle' ? 'normal' : 'incident',
      'incidentState': widget.incidentState,
      'fighterX': widget.fighterX,
      'fighterY': widget.fighterY,
      'fighterVx': widget.fighterVelocityX,
      'fighterVy': widget.fighterVelocityY,
      'missileX': widget.missileX,
      'missileY': widget.missileY,
      'missileHealth': widget.missileHealth,
      'threats': widget.threats,
      'activeThreatIndex': widget.activeThreatIndex,
      'projectiles': widget.projectiles,
      'impact': {
        'token': widget.impactToken,
        'x': widget.impactX,
        'y': widget.impactY,
        'index': widget.impactThreatIndex,
        'large': widget.impactLarge,
      },
    };
    final json = jsonEncode(state);
    if (json == _lastStateJson && !_pushInFlight) return;
    _latestStateJson = json;
    if (_pushInFlight) {
      // WebView runJavaScript is asynchronous. Keep only the newest snapshot
      // instead of allowing a slow phone to accumulate stale battle frames.
      _pushQueued = true;
      return;
    }
    _pushInFlight = true;
    try {
      do {
        _pushQueued = false;
        final pending = _latestStateJson;
        _latestStateJson = null;
        if (pending == null || pending == _lastStateJson) continue;
        await controller.runJavaScript('window.setFlightState?.($pending);');
        _lastStateJson = pending;
      } while (_pushQueued && mounted && _ready);
    } catch (error) {
      debugPrint('BWP Flight state push skipped: $error');
    } finally {
      _pushInFlight = false;
      _pushQueued = false;
    }
  }

  void _runShowcaseCommand(String command) {
    final controller = _controller;
    if (!_ready || controller == null) return;
    unawaited(
        controller.runJavaScript('window.BWP_FLIGHT_SHOWCASE?.$command;'));
  }

  void _togglePaused() {
    final paused = !_paused;
    setState(() => _paused = paused);
    _runShowcaseCommand(paused ? 'pause()' : 'resume()');
  }

  void _changeSpeed(double value) {
    setState(() => _speed = value);
    _runShowcaseCommand('setSpeed(${value.toStringAsFixed(2)})');
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _ready = false;
    _latestStateJson = null;
    final controller = _controller;
    if (controller != null) {
      unawaited(() async {
        try {
          await controller
              .runJavaScript('window.BWP_FLIGHT_SHOWCASE?.dispose();');
        } catch (_) {
          // WebView 已销毁时不再执行场景清理，不能阻断页面退出。
        }
      }());
    }
    unawaited(_server.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    if (!_supportsWebView || controller == null) {
      return ColoredBox(
        color: Color(0xFF070809),
        child: Center(
          child: Text(
            _loadError == null ? '3D FLIGHT VIEW' : '3D FLIGHT UNAVAILABLE',
            style: const TextStyle(
              color: Color(0xFF8A9092),
              fontSize: 11,
              letterSpacing: 2.4,
            ),
          ),
        ),
      );
    }
    return ColoredBox(
      color: const Color(0xFF070809),
      child: Stack(
        fit: StackFit.expand,
        children: [
          RepaintBoundary(child: WebViewWidget(controller: controller)),
          if (widget.showControls)
            Positioned(
                left: 16,
                top: widget.controlsTopInset,
                child: FilledButton.tonalIcon(
                  style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFF101216),
                      foregroundColor: Colors.white),
                  onPressed: () {
                    setState(() => _windowView = !_windowView);
                    _runShowcaseCommand(
                        "setView('${_windowView ? 'window' : 'chase'}')");
                  },
                  icon:
                      Icon(_windowView ? Icons.flight : Icons.window_outlined),
                  label: MediaQuery.sizeOf(context).width < 520
                      ? const SizedBox.shrink()
                      : Text(_windowView ? '看整架飞机' : '坐到舷窗边'),
                )),
          if (widget.showControls)
            Positioned(
              right: 16,
              top: widget.controlsTopInset,
              child: _ShowcaseControls(
                paused: _paused,
                speed: _speed,
                onPauseChanged: (_) => _togglePaused(),
                onSpeedChanged: _changeSpeed,
              ),
            ),
        ],
      ),
    );
  }
}

/// Dedicated WebGL battle renderer for Blue on Blue.
///
/// This restores the independently modelled fighter, target missile,
/// projectiles and camera-follow choreography. It intentionally stays
/// separate from [Flight3DView], which owns only the BWP passenger showcase.
class FlightBattle3DView extends StatefulWidget {
  const FlightBattle3DView({
    required this.progress,
    required this.incidentState,
    required this.fighterX,
    required this.fighterY,
    required this.missileX,
    required this.missileY,
    required this.missileHealth,
    required this.projectiles,
    this.seed = 42,
    super.key,
  });

  final double progress;
  final int seed;
  final String incidentState;
  final double fighterX;
  final double fighterY;
  final double missileX;
  final double missileY;
  final double missileHealth;
  final List<Map<String, Object?>> projectiles;

  @override
  State<FlightBattle3DView> createState() => _FlightBattle3DViewState();
}

class _FlightBattle3DViewState extends State<FlightBattle3DView> {
  late final FocusFlightBattleServer _server;
  WebViewController? _controller;
  bool _ready = false;
  String? _loadError;

  bool get _supportsWebView =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);

  @override
  void initState() {
    super.initState();
    _server = FocusFlightBattleServer();
    if (_supportsWebView) unawaited(_initWebView());
  }

  Future<void> _initWebView() async {
    try {
      final uri = await _server.start();
      final controller = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..setBackgroundColor(const Color(0xFF070809))
        ..setOnConsoleMessage((message) {
          debugPrint(
            'Blue on Blue WebGL: ${message.level.name}: ${message.message}',
          );
        })
        ..setNavigationDelegate(
          NavigationDelegate(
            onPageFinished: (_) {
              if (!mounted) return;
              setState(() => _ready = true);
              _pushState();
            },
            onWebResourceError: (error) {
              debugPrint(
                'Blue on Blue WebGL resource error: '
                '${error.errorCode} ${error.description} ${error.url}',
              );
            },
          ),
        );
      if (!mounted) {
        await _server.dispose();
        return;
      }
      setState(() => _controller = controller);
      await controller.loadRequest(uri);
    } on Object catch (error) {
      await _server.dispose();
      if (!mounted) return;
      setState(() => _loadError = error.toString());
    }
  }

  @override
  void didUpdateWidget(covariant FlightBattle3DView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_ready) _pushState();
  }

  Future<void> _pushState() async {
    final controller = _controller;
    if (!_ready || controller == null) return;
    final state = <String, Object?>{
      'progress': widget.progress.clamp(0.0, 1.0),
      'seed': widget.seed,
      'mode': widget.incidentState == 'idle' ? 'normal' : 'incident',
      'incidentState': widget.incidentState,
      'fighterX': widget.fighterX,
      'fighterY': widget.fighterY,
      'missileX': widget.missileX,
      'missileY': widget.missileY,
      'missileHealth': widget.missileHealth,
      'projectiles': widget.projectiles,
    };
    await controller.runJavaScript(
      'window.setFlightState?.(${jsonEncode(state)});',
    );
  }

  @override
  void dispose() {
    _ready = false;
    final controller = _controller;
    if (controller != null) {
      unawaited(() async {
        try {
          await controller.clearCache();
        } catch (_) {
          // WebView 清理失败不阻断战斗页退出。
        }
      }());
    }
    unawaited(_server.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    if (!_supportsWebView || controller == null) {
      return ColoredBox(
        color: const Color(0xFF070809),
        child: Center(
          child: Text(
            _loadError == null ? 'BLUE ON BLUE' : 'BATTLE VIEW UNAVAILABLE',
            style: const TextStyle(
              color: Color(0xFF8A9092),
              fontSize: 11,
              letterSpacing: 2.4,
            ),
          ),
        ),
      );
    }
    return ColoredBox(
      color: const Color(0xFF070809),
      child: RepaintBoundary(child: WebViewWidget(controller: controller)),
    );
  }
}

class _ShowcaseControls extends StatefulWidget {
  const _ShowcaseControls({
    required this.paused,
    required this.speed,
    required this.onPauseChanged,
    required this.onSpeedChanged,
  });

  final bool paused;
  final double speed;
  final ValueChanged<bool> onPauseChanged;
  final ValueChanged<double> onSpeedChanged;

  @override
  State<_ShowcaseControls> createState() => _ShowcaseControlsState();
}

class _ShowcaseControlsState extends State<_ShowcaseControls>
    with SingleTickerProviderStateMixin {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) => AnimatedSize(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOutCubic,
        alignment: Alignment.topRight,
        child: Material(
          color: const Color(0xE8111214),
          clipBehavior: Clip.antiAlias,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(_expanded ? 18 : 23),
            side: const BorderSide(color: Color(0x4A747B83)),
          ),
          child: SizedBox(
            width: _expanded ? 248 : 46,
            child: _expanded ? _buildExpanded() : _buildCollapsed(),
          ),
        ),
      );

  Widget _buildCollapsed() => Semantics(
        button: true,
        label: '飞行控制',
        child: IconButton(
          tooltip: '飞行控制',
          onPressed: () => setState(() => _expanded = true),
          icon: const Icon(Icons.tune_rounded, color: Colors.white),
        ),
      );

  Widget _buildExpanded() => Padding(
        padding: const EdgeInsets.fromLTRB(6, 5, 7, 7),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                IconButton(
                  tooltip: widget.paused ? '继续飞行' : '暂停飞行',
                  onPressed: () => widget.onPauseChanged(!widget.paused),
                  icon: Icon(
                    widget.paused
                        ? Icons.play_arrow_rounded
                        : Icons.pause_rounded,
                    color: Colors.white,
                  ),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.paused ? '已暂停' : '巡航中',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const Text(
                        'FLIGHT CONTROL',
                        style: TextStyle(
                          color: Colors.white54,
                          fontSize: 8,
                          letterSpacing: 1.15,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: '收起飞行控制',
                  onPressed: () => setState(() => _expanded = false),
                  icon: const Icon(Icons.close_rounded,
                      color: Colors.white60, size: 19),
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 7),
              child: Row(
                children: [
                  const Text(
                    '速度',
                    style: TextStyle(color: Colors.white60, fontSize: 11),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Slider(
                      min: 6,
                      max: 38,
                      value: widget.speed,
                      onChanged: widget.onSpeedChanged,
                    ),
                  ),
                  SizedBox(
                    width: 35,
                    child: Text(
                      widget.speed.toStringAsFixed(1),
                      textAlign: TextAlign.right,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
}

/// 将当前游戏实体转换成传给 WebGL 场景的轻量数据。
Map<String, Object?> flight3DProjectile({
  required double x,
  required double y,
  required double vx,
  required double vy,
  required bool homing,
  int targetIndex = 0,
}) =>
    <String, Object?>{
      'x': x,
      'y': y,
      'vx': vx,
      'vy': vy,
      'homing': homing,
      'targetIndex': targetIndex,
    };
