import 'dart:convert';
import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'flight_runtime.dart';
import 'flight_navigation_chart.dart';
import 'flight_showcase_server.dart';
import 'focus_flight_model.dart';

/// Dash or Crash 的 3D 地球选择器。
///
/// 使用正投影球面而不是把世界图片拉成矩形：城市经纬度先转换为球面点，
/// 再根据 yaw/tilt 判断是否在可见半球，因此城市不会漂到海上或随意错位。
/// 交互只保留单指旋转、双指缩放和点选，没有放大缩小按钮。
class DashGlobeView extends StatefulWidget {
  const DashGlobeView({
    required this.origin,
    this.destination,
    this.progress = 0,
    this.interactive = false,
    this.followRoute = false,
    this.showCities = true,
    this.showCaption = true,
    this.height,
    this.onAirportTap,
    super.key,
  });

  final FocusAirport origin;
  final FocusAirport? destination;
  final double progress;
  final bool interactive;

  /// MAP uses this to follow the plane until the user manually drags.
  /// The destination page keeps it false so its global composition is stable.
  final bool followRoute;
  final bool showCities;
  final bool showCaption;
  final double? height;
  final ValueChanged<FocusAirport>? onAirportTap;

  @override
  State<DashGlobeView> createState() => _DashGlobeViewState();
}

class _DashGlobeViewState extends State<DashGlobeView>
    with WidgetsBindingObserver {
  // 默认把东亚放在正面，首次打开时中国城市更容易识别；仍可单指转到全世界。
  // 与参考图一致：欧洲/非洲居中，亚洲位于右侧，美洲位于左侧。
  double _yaw = .45;
  double _tilt = 0.08;
  double _zoom = 1;
  double _startYaw = 0;
  double _startTilt = 0;
  double _startZoom = 1;
  Offset _startFocal = Offset.zero;
  bool _dragged = false;
  late final FocusGlobeAssetServer _server;
  WebViewController? _controller;
  bool _ready = false;
  String? _lastPayload;
  String? _pendingPayload;
  bool _sending = false;
  int _pageGeneration = 0;

  bool get _supportsWebView =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _server = FocusGlobeAssetServer();
    if (!_supportsWebView) return;
    unawaited(_initWebView());
  }

  Future<void> _initWebView() async {
    try {
      final uri = await _server.start();
      if (!mounted) {
        await _server.dispose();
        return;
      }
      final controller = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..setBackgroundColor(const Color(0xFF050607))
        ..addJavaScriptChannel(
          'DashGlobeSelection',
          onMessageReceived: (message) {
            FocusAirport? airport;
            for (final candidate in focusAirports) {
              if (candidate.id == message.message) {
                airport = candidate;
                break;
              }
            }
            if (airport != null && airport.id != widget.origin.id) {
              widget.onAirportTap?.call(airport);
            }
          },
        )
        ..setNavigationDelegate(
          NavigationDelegate(
            onPageStarted: (_) {
              _ready = false;
              _lastPayload = null;
              _pendingPayload = null;
              _pageGeneration++;
            },
            onPageFinished: (_) {
              if (!mounted) return;
              _lastPayload = null;
              _pageGeneration++;
              setState(() => _ready = true);
              unawaited(_pushState());
            },
            onWebResourceError: (error) {
              debugPrint('Focus globe WebView resource error: '
                  '${error.errorCode} ${error.description} ${error.url}');
            },
          ),
        );
      if (!mounted) return;
      setState(() => _controller = controller);
      await controller.loadRequest(uri);
      if (_ready) await _pushState();
    } catch (error, stack) {
      debugPrint('Dash globe WebView initialization failed: $error');
      debugPrintStack(stackTrace: stack);
      await _server.dispose();
      if (mounted) setState(() => _controller = null);
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final controller = _controller;
    if (controller != null && _ready) {
      unawaited(controller
          .runJavaScript(
              'window.setGlobeVisible?.(${state == AppLifecycleState.resumed});')
          .catchError((_) {}));
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    final controller = _controller;
    if (controller != null) {
      unawaited(controller
          .runJavaScript('window.disposeGlobe?.();')
          .catchError((_) {}));
    }
    unawaited(_server.dispose());
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant DashGlobeView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_ready) unawaited(_pushState());
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_ready) unawaited(_pushState());
  }

  Future<void> _pushState() async {
    final controller = _controller;
    if (!_ready || controller == null) return;
    Map<String, Object?> airportJson(FocusAirport airport) => {
          'id': airport.id,
          'city': airport.city,
          'latitude': airport.latitude,
          'longitude': airport.longitude,
        };
    // The destination picker needs every city. During a flight, however, the
    // globe is a route HUD: only the two route endpoints should remain as
    // labels so they never compete with the aircraft and progress line.
    final visibleAirports = widget.showCities
        ? focusAirports
        : <FocusAirport>[
            widget.origin,
            if (widget.destination != null) widget.destination!,
          ];
    final payload = jsonEncode({
      'origin': airportJson(widget.origin),
      'destination':
          widget.destination == null ? null : airportJson(widget.destination!),
      'cities': visibleAirports.map(airportJson).toList(growable: false),
      'progress': widget.progress,
      'interactive': widget.interactive,
      'followRoute': widget.followRoute,
      'theme':
          Theme.of(context).brightness == Brightness.light ? 'light' : 'dark',
    });
    _pendingPayload = payload;
    if (_sending) return;
    _sending = true;
    try {
      while (mounted && _ready && _pendingPayload != null) {
        final next = _pendingPayload!;
        _pendingPayload = null;
        if (next == _lastPayload) continue;
        final generation = _pageGeneration;
        try {
          await controller.runJavaScript('window.setGlobeState($next);');
          if (generation == _pageGeneration) _lastPayload = next;
        } catch (error) {
          // Cache only successful sends; the next update can retry this state.
          debugPrint('Dash globe state sync failed: $error');
        }
      }
    } finally {
      _sending = false;
    }
  }

  void _onScaleStart(ScaleStartDetails details) {
    _startYaw = _yaw;
    _startTilt = _tilt;
    _startZoom = _zoom;
    _startFocal = details.focalPoint;
    _dragged = false;
  }

  void _onScaleUpdate(ScaleUpdateDetails details, Size viewport) {
    final delta = details.focalPoint - _startFocal;
    if (delta.distance > 4 || (details.scale - 1).abs() > 0.02) {
      _dragged = true;
    }
    final radius = math.max(1, math.min(viewport.width, viewport.height) * .42);
    setState(() {
      _yaw = _startYaw + delta.dx / radius;
      _tilt = (_startTilt - delta.dy / radius).clamp(-.72, .72).toDouble();
      _zoom = (_startZoom * details.scale).clamp(.84, 2.3).toDouble();
    });
  }

  void _onTapUp(TapUpDetails details, Size viewport) {
    if (!widget.interactive || _dragged || widget.onAirportTap == null) return;
    final globe = FocusWorldGlobePainter.globeRectFor(viewport, _zoom);
    final airport = FocusWorldGlobePainter.nearestAirport(
      details.localPosition,
      globe,
      yaw: _yaw,
      tilt: _tilt,
      maxDistance: math.max(20, 28 / _zoom),
    );
    if (airport != null && airport.id != widget.origin.id) {
      widget.onAirportTap!(airport);
    }
  }

  @override
  Widget build(BuildContext context) {
    final fallback = LayoutBuilder(
      builder: (context, constraints) {
        final viewport = Size(
          constraints.maxWidth,
          constraints.maxHeight.isFinite ? constraints.maxHeight : 380,
        );
        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onScaleStart: widget.interactive ? _onScaleStart : null,
          onScaleUpdate: widget.interactive
              ? (details) => _onScaleUpdate(details, viewport)
              : null,
          onTapUp: (details) => _onTapUp(details, viewport),
          child: RepaintBoundary(
            child: CustomPaint(
              painter: FocusWorldGlobePainter(
                origin: widget.origin,
                destination: widget.destination,
                progress: widget.progress,
                showCities: widget.showCities,
                darkSurface: Theme.of(context).brightness == Brightness.dark,
                yaw: _yaw,
                tilt: _tilt,
                zoom: _zoom,
                repaintKey: Object.hash(_yaw, _tilt, _zoom, widget.progress),
              ),
              child: const SizedBox.expand(),
            ),
          ),
        );
      },
    );
    final fallbackSized = widget.height == null
        ? fallback
        : SizedBox(height: widget.height, child: fallback);
    final webSized = widget.height == null
        ? _buildWebView()
        : SizedBox(height: widget.height, child: _buildWebView());
    final sized =
        _supportsWebView && _controller != null ? webSized : fallbackSized;
    if (!widget.interactive) return sized;
    if (!widget.showCaption) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: ColoredBox(
          color: const Color(0xFF0B0D10),
          child: sized,
        ),
      );
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(24),
          child: ColoredBox(
            color: const Color(0xFF0B0D10),
            child: sized,
          ),
        ),
        const SizedBox(height: 10),
        _GlobeCaption(
          origin: widget.origin,
          destination: widget.destination,
          zoom: _zoom,
        ),
      ],
    );
  }

  Widget _buildWebView() {
    final controller = _controller;
    if (controller == null) return const SizedBox.expand();
    return ClipRRect(
      borderRadius: BorderRadius.circular(24),
      child: ColoredBox(
        color: const Color(0xFF050607),
        child: RepaintBoundary(child: WebViewWidget(controller: controller)),
      ),
    );
  }
}

/// 飞行中的 MAP 与交互式目的地地球分开，稳定呈现全局航图。
class FocusFlightMapView extends StatelessWidget {
  const FocusFlightMapView({
    required this.origin,
    required this.destination,
    required this.progress,
    super.key,
  });

  final FocusAirport origin;
  final FocusAirport destination;
  final double progress;

  @override
  Widget build(BuildContext context) => SizedBox.expand(
        child: FlightNavigationChart(
          origin: origin,
          destination: destination,
          progress: progress,
        ),
      );
}

/// 独立的目的地地球页。
///
/// 路线表单只保留摘要；需要精确挑选城市时进入这里，地球获得完整的
/// 可用空间，手势也不会和外层的 ListView 争夺触摸事件。
class DashGlobeDestinationPage extends StatefulWidget {
  const DashGlobeDestinationPage({
    required this.origin,
    this.destination,
    this.onSelected,
    this.onBack,
    super.key,
  });

  final FocusAirport origin;
  final FocusAirport? destination;
  final ValueChanged<FocusAirport>? onSelected;
  final VoidCallback? onBack;

  @override
  State<DashGlobeDestinationPage> createState() =>
      _DashGlobeDestinationPageState();
}

class _DashGlobeDestinationPageState extends State<DashGlobeDestinationPage> {
  FocusAirport? _pendingDestination;

  @override
  void initState() {
    super.initState();
    _pendingDestination = widget.destination;
  }

  void _select(FocusAirport airport) {
    if (airport.id == widget.origin.id) return;
    HapticFeedback.selectionClick();
    setState(() => _pendingDestination = airport);
  }

  Future<void> _searchDestinations() async {
    final selected = await showModalBottomSheet<FocusAirport>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: const Color(0xFF191C1F),
      builder: (context) => _AirportSearchSheet(origin: widget.origin),
    );
    if (selected != null && mounted) _select(selected);
  }

  void _confirm() {
    final airport = _pendingDestination;
    if (airport == null) return;
    HapticFeedback.mediumImpact();
    if (widget.onSelected != null) {
      widget.onSelected!(airport);
      return;
    }
    Navigator.of(context).pop<FocusAirport>(airport);
  }

  @override
  Widget build(BuildContext context) {
    final light = Theme.of(context).brightness == Brightness.light;
    return Scaffold(
      backgroundColor:
          light ? const Color(0xFFF0F0E8) : const Color(0xFF0D1920),
      body: SafeArea(
        child: Stack(
          fit: StackFit.expand,
          children: [
            DashGlobeView(
              origin: widget.origin,
              destination: _pendingDestination,
              interactive: true,
              showCaption: false,
              onAirportTap: _select,
            ),
            Positioned(
              top: 14,
              left: 78,
              right: 78,
              child: IgnorePointer(
                child: Center(
                    child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: const Color(0xF018292B),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFF7B8C83)),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(12, 9, 20, 9),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const FlightBrandMark(size: 26),
                        const SizedBox(width: 8),
                        Expanded(
                            child: FittedBox(
                                fit: BoxFit.scaleDown,
                                alignment: Alignment.centerLeft,
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text(
                                      '云间 KUMO',
                                      style: TextStyle(
                                        color: Color(0xFFF3F0E7),
                                        fontSize: 18,
                                        fontWeight: FontWeight.w700,
                                        letterSpacing: 1.2,
                                      ),
                                    ),
                                    const SizedBox(height: 3),
                                    const Text(
                                      'FLIGHT ATLAS   /   选择航点',
                                      style: TextStyle(
                                        color: Color(0xFFBCC9C2),
                                        fontSize: 10,
                                        fontWeight: FontWeight.w600,
                                        letterSpacing: 1.1,
                                      ),
                                    ),
                                  ],
                                ))),
                      ],
                    ),
                  ),
                )),
              ),
            ),
            Positioned(
              top: 12,
              left: 16,
              child: _GlobePageButton(
                icon: Icons.arrow_back_rounded,
                tooltip: '返回场景选择',
                onPressed:
                    widget.onBack ?? () => Navigator.of(context).maybePop(),
              ),
            ),
            Positioned(
                top: 12,
                right: 16,
                child: _GlobePageButton(
                  icon: Icons.search_rounded,
                  tooltip: '搜索城市或机场',
                  onPressed: _searchDestinations,
                )),
            Positioned(
              left: 20,
              right: 20,
              bottom: 14,
              child: _DestinationConfirmPanel(
                origin: widget.origin,
                destination: _pendingDestination,
                onConfirm: _pendingDestination == null ? null : _confirm,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DestinationConfirmPanel extends StatelessWidget {
  const _DestinationConfirmPanel({
    required this.origin,
    required this.destination,
    required this.onConfirm,
  });

  final FocusAirport origin;
  final FocusAirport? destination;
  final VoidCallback? onConfirm;

  @override
  Widget build(BuildContext context) {
    final selected = destination;
    final compact = MediaQuery.sizeOf(context).width < 420;
    const ink = Color(0xFFF3F0E7);
    const accent = Color(0xFFD9A16D);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xF218292B),
        borderRadius: BorderRadius.circular(9),
        border: Border.all(color: const Color(0xFF7B8C83)),
        boxShadow: const [
          BoxShadow(
              color: Color(0x55000000), blurRadius: 24, offset: Offset(0, 8)),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 13, 13, 13),
        child: Row(
          children: [
            if (!compact) ...[
              const FlightBrandMark(size: 38),
              const SizedBox(width: 17),
            ],
            Expanded(
              child: Row(
                children: [
                  Expanded(
                      child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Text('FROM / 出发',
                              style: TextStyle(
                                  color: accent,
                                  fontSize: 10,
                                  letterSpacing: 1.1))),
                      FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Text(origin.id,
                              style: const TextStyle(
                                  color: ink,
                                  fontSize: 19,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 1.2))),
                    ],
                  )),
                  Padding(
                    padding: EdgeInsets.symmetric(horizontal: compact ? 8 : 18),
                    child: const Icon(Icons.east_rounded,
                        color: Color(0xFF9EADA5), size: 21),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const FittedBox(
                            fit: BoxFit.scaleDown,
                            child: Text('TO / 抵达',
                                style: TextStyle(
                                    color: accent,
                                    fontSize: 10,
                                    letterSpacing: 1.1))),
                        FittedBox(
                            fit: BoxFit.scaleDown,
                            child: Text(selected?.id ?? '— — —',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    color: ink,
                                    fontSize: 19,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: 1.2))),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            FilledButton(
              onPressed: onConfirm,
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFFE7B27C),
                foregroundColor: const Color(0xFF18292B),
                minimumSize: const Size(76, 42),
                padding: const EdgeInsets.symmetric(horizontal: 13),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(5),
                ),
              ),
              child: const Text('选座登机'),
            ),
          ],
        ),
      ),
    );
  }
}

class _GlobePageButton extends StatelessWidget {
  const _GlobePageButton({
    required this.icon,
    required this.tooltip,
    required this.onPressed,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final light = Theme.of(context).brightness == Brightness.light;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: light ? const Color(0xEEF7F4EA) : const Color(0xE517262B),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
            color: light ? const Color(0xFFD3D8D3) : const Color(0xFF62777B)),
      ),
      child: IconButton(
        tooltip: tooltip,
        onPressed: onPressed,
        icon: Icon(icon,
            color: light ? const Color(0xFF17282E) : const Color(0xFFF5F2E9)),
      ),
    );
  }
}

/// A compact flight emblem shared by the globe picker and its route strip.
class FlightBrandMark extends StatelessWidget {
  const FlightBrandMark({super.key, this.size = 38});

  final double size;

  @override
  Widget build(BuildContext context) => SizedBox.square(
        dimension: size,
        child: CustomPaint(painter: _FlightBrandMarkPainter()),
      );
}

class _FlightBrandMarkPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / 40;
    canvas.save();
    canvas.scale(scale);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
          const Rect.fromLTWH(0, 0, 40, 40), const Radius.circular(5)),
      Paint()..color = const Color(0xFFE7B27C),
    );
    final line = Paint()
      ..color = const Color(0xFF1C3232)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.35
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(const Rect.fromLTWH(8, 8, 24, 24), -.8, 4.8, false, line);
    final aircraft = Path()
      ..moveTo(29, 9)
      ..lineTo(23.8, 22)
      ..lineTo(29, 28)
      ..lineTo(27, 29)
      ..lineTo(20.2, 24.2)
      ..lineTo(14, 27)
      ..lineTo(13, 25)
      ..lineTo(18.8, 20)
      ..lineTo(24, 8)
      ..close();
    canvas.drawPath(aircraft, Paint()..color = const Color(0xFF1C3232));
    canvas.drawCircle(
        const Offset(9, 29), 2, Paint()..color = const Color(0xFF1C3232));
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _GlobeCaption extends StatelessWidget {
  const _GlobeCaption({
    required this.origin,
    required this.destination,
    required this.zoom,
  });

  final FocusAirport origin;
  final FocusAirport? destination;
  final double zoom;

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: BoxDecoration(
          color: const Color(0xE616181C),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0x447F858D)),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 11),
          child: Row(
            children: [
              const Icon(Icons.public_rounded,
                  color: Color(0xFFE7E7E7), size: 17),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  destination == null
                      ? '单指旋转 · 双指缩放 · 点击城市选择目的地'
                      : '${origin.id}  →  ${destination!.id}   ·   ${destination!.city}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Color(0xFFE2E3E4),
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              Text(
                '${zoom.toStringAsFixed(1)}× · 36 城市',
                style: const TextStyle(
                  color: Color(0xFF9EA3AA),
                  fontSize: 10,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
        ),
      );
}

class _GlobePoint {
  const _GlobePoint(this.offset, this.depth);
  final Offset offset;
  final double depth;
}

class _GeoPoint {
  const _GeoPoint(this.latitude, this.longitude);
  final double latitude;
  final double longitude;
}

/// 足够表达洲际轮廓的低多边形陆块；城市仍以独立真实经纬度渲染。
const _landMasses = <List<_GeoPoint>>[
  [
    _GeoPoint(72, -168),
    _GeoPoint(70, -140),
    _GeoPoint(58, -128),
    _GeoPoint(50, -112),
    _GeoPoint(48, -88),
    _GeoPoint(34, -80),
    _GeoPoint(20, -97),
    _GeoPoint(14, -112),
    _GeoPoint(25, -125),
    _GeoPoint(42, -150),
  ],
  [
    _GeoPoint(12, -81),
    _GeoPoint(8, -68),
    _GeoPoint(2, -52),
    _GeoPoint(-12, -48),
    _GeoPoint(-28, -54),
    _GeoPoint(-55, -70),
    _GeoPoint(-52, -76),
    _GeoPoint(-28, -78),
    _GeoPoint(-8, -80),
  ],
  [
    _GeoPoint(37, -18),
    _GeoPoint(44, 2),
    _GeoPoint(54, 28),
    _GeoPoint(62, 56),
    _GeoPoint(72, 92),
    _GeoPoint(74, 130),
    _GeoPoint(62, 164),
    _GeoPoint(42, 170),
    _GeoPoint(28, 140),
    _GeoPoint(18, 110),
    _GeoPoint(24, 76),
    _GeoPoint(28, 46),
    _GeoPoint(34, 20),
  ],
  [
    _GeoPoint(36, -17),
    _GeoPoint(32, 6),
    _GeoPoint(28, 30),
    _GeoPoint(10, 44),
    _GeoPoint(-12, 40),
    _GeoPoint(-34, 28),
    _GeoPoint(-35, 12),
    _GeoPoint(-20, -4),
    _GeoPoint(2, -15),
    _GeoPoint(20, -18),
  ],
  [
    _GeoPoint(-10, 113),
    _GeoPoint(-11, 153),
    _GeoPoint(-28, 154),
    _GeoPoint(-44, 130),
    _GeoPoint(-38, 114),
  ],
  [
    _GeoPoint(83, -74),
    _GeoPoint(82, -24),
    _GeoPoint(60, -18),
    _GeoPoint(58, -50),
  ],
  [
    _GeoPoint(-67, -180),
    _GeoPoint(-67, 180),
    _GeoPoint(-90, 180),
    _GeoPoint(-90, -180),
  ],
];

class FocusWorldGlobePainter extends CustomPainter {
  const FocusWorldGlobePainter({
    required this.origin,
    required this.destination,
    required this.progress,
    required this.showCities,
    this.darkSurface = true,
    required this.yaw,
    required this.tilt,
    required this.zoom,
    this.repaintKey = 0,
  });

  final FocusAirport origin;
  final FocusAirport? destination;
  final double progress;
  final bool showCities;
  final bool darkSurface;
  final double yaw;
  final double tilt;
  final double zoom;
  final int repaintKey;

  static Rect globeRectFor(Size viewport, [double zoom = 1]) {
    final radius = math.min(viewport.width, viewport.height) * .43 * zoom;
    return Rect.fromCircle(
      center: Offset(viewport.width / 2, viewport.height / 2),
      radius: radius,
    );
  }

  static Offset projectCoordinates(double latitude, double longitude, Rect rect,
      {double yaw = 0, double tilt = 0}) {
    return _project(latitude, longitude, rect, yaw: yaw, tilt: tilt)?.offset ??
        rect.center;
  }

  static FocusAirport? nearestAirport(
    Offset point,
    Rect globeRect, {
    double yaw = 0,
    double tilt = 0,
    double maxDistance = 28,
  }) {
    FocusAirport? nearest;
    var distance = double.infinity;
    for (final airport in focusAirports) {
      final candidate = _project(
        airport.latitude,
        airport.longitude,
        globeRect,
        yaw: yaw,
        tilt: tilt,
      );
      if (candidate == null) continue;
      final current = (candidate.offset - point).distance;
      if (current < distance) {
        distance = current;
        nearest = airport;
      }
    }
    return distance <= maxDistance ? nearest : null;
  }

  static _GlobePoint? _project(
    double latitude,
    double longitude,
    Rect rect, {
    required double yaw,
    required double tilt,
  }) {
    final lat = latitude * math.pi / 180;
    final relativeLon = longitude * math.pi / 180 - yaw;
    final cosLat = math.cos(lat);
    final x = cosLat * math.sin(relativeLon);
    final z = cosLat * math.cos(relativeLon);
    final y = math.sin(lat);
    final projectedY = y * math.cos(tilt) + z * math.sin(tilt);
    final depth = -y * math.sin(tilt) + z * math.cos(tilt);
    if (depth < -.08) return null;
    final radius = rect.width / 2;
    return _GlobePoint(
      Offset(rect.center.dx + x * radius, rect.center.dy - projectedY * radius),
      depth,
    );
  }

  @override
  void paint(Canvas canvas, Size size) {
    final rect = globeRectFor(size, zoom);
    _drawBackdrop(canvas, size, rect);
    _drawGlobe(canvas, rect);

    canvas.save();
    canvas.clipPath(Path()..addOval(rect));
    _drawGraticule(canvas, rect);
    _drawLand(canvas, rect);
    if (destination != null) _drawRoute(canvas, rect);
    if (showCities) _drawCities(canvas, rect);
    canvas.restore();

    if (destination != null) {
      _drawEndpoint(canvas, rect, origin, const Color(0xFFF7F7F4), false);
      _drawEndpoint(canvas, rect, destination!, const Color(0xFFE0E4E4), true);
    }
  }

  void _drawBackdrop(Canvas canvas, Size size, Rect globe) {
    canvas.drawRect(
      Offset.zero & size,
      Paint()..color = const Color(0xFF101310),
    );
    final starPaint = Paint()..color = const Color(0x66E7EAEB);
    for (var i = 0; i < 26; i++) {
      final x = (i * 83.17 + size.width * .17) % size.width;
      final y = (i * 47.31 + size.height * .23) % size.height;
      canvas.drawCircle(Offset(x, y), i.isEven ? 1.0 : .6, starPaint);
    }
    // Fallback renderer keeps the same compositing order as the WebGL page:
    // meteor streaks are painted before the opaque globe, so the globe hides
    // their middle instead of letting them float across the continents.
    final meteorSeed = size.width * .37 + size.height * .19;
    final meteorX = size.width * (.18 + (math.sin(meteorSeed) * .5 + .5) * .56);
    final meteorY =
        size.height * (.08 + (math.sin(meteorSeed * 1.7) * .5 + .5) * .34);
    final meteorLength = math.min(size.width, size.height) * .18;
    final meteorEnd = Offset(
      meteorX + meteorLength * .72,
      meteorY + meteorLength * .68,
    );
    final meteorTail = Offset(
      meteorEnd.dx - meteorLength * .72,
      meteorEnd.dy - meteorLength * .68,
    );
    for (final stroke in <(double, Color)>[
      (4.8, const Color(0x1AE9ECEB)),
      (2.0, const Color(0x55E9ECEB)),
      (.75, const Color(0xDDEFF1EE)),
    ]) {
      canvas.drawLine(
        meteorTail,
        meteorEnd,
        Paint()
          ..color = stroke.$2
          ..strokeWidth = stroke.$1
          ..strokeCap = StrokeCap.round,
      );
    }
    canvas.drawCircle(
      meteorEnd,
      1.7,
      Paint()
        ..color = const Color(0xFFF6F7F3)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5),
    );
    canvas.drawCircle(
      globe.center + const Offset(8, 14),
      globe.width / 2,
      Paint()..color = const Color(0xAA000000),
    );
  }

  void _drawGlobe(Canvas canvas, Rect rect) {
    final lightCenter = Alignment(-.44, -.56);
    final radius = rect.width / 2;
    canvas.drawCircle(
      rect.center,
      radius,
      Paint()
        ..shader = RadialGradient(
          center: lightCenter,
          radius: 1.22,
          colors: const [
            Color(0xFFC7CCCE),
            Color(0xFF6E757A),
            Color(0xFF30363B),
            Color(0xFF111519),
          ],
          stops: const [0, .30, .72, 1],
        ).createShader(rect),
    );
    canvas.drawCircle(
      rect.center,
      radius,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5
        ..color = const Color(0x99EEF0EF),
    );
    canvas.drawCircle(
      rect.center - Offset(radius * .2, radius * .22),
      radius * .88,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = radius * .03
        ..color = const Color(0x18FFFFFF),
    );
  }

  void _drawGraticule(Canvas canvas, Rect rect) {
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = .65
      ..color = const Color(0x3DFFFFFF);
    for (var latitude = -80; latitude <= 80; latitude += 20) {
      final points = <_GeoPoint>[];
      for (var longitude = -180; longitude <= 180; longitude += 6) {
        points.add(_GeoPoint(latitude.toDouble(), longitude.toDouble()));
      }
      _drawProjectedLine(canvas, points, rect, paint);
    }
    for (var longitude = -180; longitude < 180; longitude += 20) {
      final points = <_GeoPoint>[];
      for (var latitude = -90; latitude <= 90; latitude += 6) {
        points.add(_GeoPoint(latitude.toDouble(), longitude.toDouble()));
      }
      _drawProjectedLine(canvas, points, rect, paint);
    }
  }

  void _drawLand(Canvas canvas, Rect rect) {
    const fills = <Color>[
      Color(0xA6AEB4B6),
      Color(0x997D8589),
      Color(0xA69CA3A5),
      Color(0xA66B7478),
      Color(0xB5B8BDBD),
      Color(0xA68B9396),
      Color(0xA6D4D7D4),
    ];
    for (var index = 0; index < _landMasses.length; index++) {
      final land = _landMasses[index];
      final projected = land
          .map((point) => _project(point.latitude, point.longitude, rect,
              yaw: yaw, tilt: tilt))
          .toList();
      if (projected.any((point) => point == null)) {
        _drawProjectedLine(
            canvas,
            land,
            rect,
            Paint()
              ..style = PaintingStyle.stroke
              ..strokeWidth = 1.1
              ..color = fills[index].withValues(alpha: .6));
        continue;
      }
      final path = Path()
        ..moveTo(projected.first!.offset.dx, projected.first!.offset.dy);
      for (final point in projected.skip(1)) {
        path.lineTo(point!.offset.dx, point.offset.dy);
      }
      path.close();
      canvas.drawPath(path, Paint()..color = fills[index]);
      canvas.drawPath(
        path,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.0
          ..color = const Color(0x70F2F3F1),
      );
      _drawFacets(canvas, path, rect, index);
    }
  }

  void _drawFacets(Canvas canvas, Path land, Rect rect, int seed) {
    final center = rect.center +
        Offset(
          math.sin(seed * 2.4) * rect.width * .18,
          math.cos(seed * 1.7) * rect.height * .16,
        );
    final facet = Path()
      ..moveTo(center.dx, center.dy)
      ..lineTo(center.dx + rect.width * .16, center.dy - rect.height * .05)
      ..lineTo(center.dx + rect.width * .04, center.dy + rect.height * .19)
      ..close();
    canvas.save();
    canvas.clipPath(land);
    canvas.drawPath(facet, Paint()..color = const Color(0x1DFFFFFF));
    canvas.restore();
  }

  void _drawRoute(Canvas canvas, Rect rect) {
    final route = FocusGreatCircleRoute(origin, destination!);
    final routePaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.15
      ..strokeCap = StrokeCap.butt
      ..color = const Color(0xFFEDEFEF).withValues(alpha: .62);
    final progressPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.8
      ..strokeCap = StrokeCap.round
      ..color = const Color(0xFFF7F7F5).withValues(alpha: .9);
    final completed = progress.clamp(0.0, 1.0).toDouble();
    for (var i = 0; i < 120; i++) {
      final start = route.pointAt(i / 120);
      final end = route.pointAt((i + 1) / 120);
      final from =
          _project(start.latitude, start.longitude, rect, yaw: yaw, tilt: tilt);
      final to =
          _project(end.latitude, end.longitude, rect, yaw: yaw, tilt: tilt);
      if (from == null || to == null) continue;
      final hasFlown = (i + 1) / 120 <= completed;
      // Remaining route uses short dashes; the completed portion is one
      // continuous, brighter stroke without the old chain of dots.
      if (hasFlown || i.isEven) {
        canvas.drawLine(
            from.offset, to.offset, hasFlown ? progressPaint : routePaint);
      }
    }
  }

  void _drawCities(Canvas canvas, Rect rect) {
    final selected = <String>{origin.id};
    if (destination != null) selected.add(destination!.id);
    for (final airport in focusAirports) {
      final point = _project(airport.latitude, airport.longitude, rect,
          yaw: yaw, tilt: tilt);
      if (point == null) continue;
      final isSelected = selected.contains(airport.id);
      final ringColor =
          darkSurface ? const Color(0xFF9078C6) : const Color(0xFF2F6BCE);
      final color = isSelected
          ? (darkSurface ? const Color(0xFFC0A9F3) : const Color(0xFF164DAB))
          : ringColor;
      if (isSelected) {
        canvas.drawCircle(point.offset, 4.1, Paint()..color = color);
      } else {
        canvas.drawCircle(
          point.offset,
          3.2,
          Paint()
            ..color = color.withValues(alpha: .92)
            ..style = PaintingStyle.stroke
            ..strokeWidth = 1.1,
        );
      }
      _drawCityLabel(canvas, airport, point.offset, isSelected);
    }
  }

  void _drawCityLabel(
      Canvas canvas, FocusAirport airport, Offset point, bool selected) {
    final painter = TextPainter(
      text: TextSpan(
        text: selected ? '${airport.id}  ${airport.city}' : airport.id,
        style: TextStyle(
          color: selected ? const Color(0xFFF4F4F2) : const Color(0xFFD5D9D9),
          fontSize: selected ? 10.5 : 8,
          fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          letterSpacing: selected ? .35 : .6,
          shadows: const [Shadow(color: Color(0xF0000000), blurRadius: 4)],
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: selected ? 130 : 36);
    painter.paint(canvas, point + Offset(6, selected ? -18 : -11));
  }

  void _drawEndpoint(Canvas canvas, Rect rect, FocusAirport airport,
      Color color, bool alignEnd) {
    final point = _project(airport.latitude, airport.longitude, rect,
        yaw: yaw, tilt: tilt);
    if (point == null) return;
    canvas.drawCircle(
        point.offset, 11, Paint()..color = color.withValues(alpha: .18));
    canvas.drawCircle(point.offset, 4.3, Paint()..color = color);
    final painter = TextPainter(
      text: TextSpan(
        text: '${airport.id}  ${airport.city}',
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: .5,
          shadows: const [Shadow(color: Color(0xDD111214), blurRadius: 4)],
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: 160);
    final dx =
        alignEnd ? point.offset.dx - painter.width - 10 : point.offset.dx + 10;
    painter.paint(canvas, Offset(dx, point.offset.dy - painter.height - 7));
  }

  void _drawProjectedLine(
      Canvas canvas, List<_GeoPoint> points, Rect rect, Paint paint) {
    Path? path;
    for (final point in points) {
      final projected =
          _project(point.latitude, point.longitude, rect, yaw: yaw, tilt: tilt);
      if (projected == null) {
        if (path != null) canvas.drawPath(path, paint);
        path = null;
        continue;
      }
      if (path == null) {
        path = Path()..moveTo(projected.offset.dx, projected.offset.dy);
      } else {
        path.lineTo(projected.offset.dx, projected.offset.dy);
      }
    }
    if (path != null) canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant FocusWorldGlobePainter oldDelegate) =>
      oldDelegate.origin.id != origin.id ||
      oldDelegate.destination?.id != destination?.id ||
      oldDelegate.progress != progress ||
      oldDelegate.showCities != showCities ||
      oldDelegate.darkSurface != darkSurface ||
      oldDelegate.repaintKey != repaintKey;
}

class _AirportSearchSheet extends StatefulWidget {
  const _AirportSearchSheet({required this.origin});
  final FocusAirport origin;
  @override
  State<_AirportSearchSheet> createState() => _AirportSearchSheetState();
}

class _AirportSearchSheetState extends State<_AirportSearchSheet> {
  String _query = '';
  @override
  Widget build(BuildContext context) {
    final airports = focusAirports
        .where((a) =>
            a.id != widget.origin.id &&
            ('${a.city} ${a.id}')
                .toLowerCase()
                .contains(_query.trim().toLowerCase()))
        .toList()
      ..sort((a, b) => greatCircleDistanceKm(widget.origin, a)
          .compareTo(greatCircleDistanceKm(widget.origin, b)));
    return SafeArea(
        child: Padding(
      padding: EdgeInsets.fromLTRB(
          20, 0, 20, MediaQuery.viewInsetsOf(context).bottom),
      child: SizedBox(
          height: MediaQuery.sizeOf(context).height * .65,
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('下一站，去哪里？',
                style: TextStyle(fontSize: 23, color: Color(0xFFF0ECE3))),
            const SizedBox(height: 16),
            TextField(
                autofocus: true,
                onChanged: (value) => setState(() => _query = value),
                style: const TextStyle(color: Color(0xFFF0ECE3)),
                decoration: const InputDecoration(
                    prefixIcon: Icon(Icons.search),
                    hintText: '城市名称 / 机场代码',
                    border: OutlineInputBorder())),
            const SizedBox(height: 12),
            if (airports.isEmpty)
              const Padding(
                  padding: EdgeInsets.all(24), child: Text('没有找到这座城市，试试机场代码。')),
            Expanded(
                child: ListView.separated(
                    itemCount: airports.length,
                    separatorBuilder: (_, index) =>
                        const Divider(height: 1, color: Color(0xFF333638)),
                    itemBuilder: (context, index) {
                      final airport = airports[index];
                      final distance =
                          greatCircleDistanceKm(widget.origin, airport);
                      return ListTile(
                          contentPadding:
                              const EdgeInsets.symmetric(vertical: 8),
                          title: Text(airport.city,
                              style: const TextStyle(color: Color(0xFFF0ECE3))),
                          subtitle: Text(
                              '${airport.id} · ${distance.round()} km',
                              style: const TextStyle(color: Color(0xFF9CA5A8))),
                          trailing: Text(
                              '${focusMinutesForDistance(distance)} 分钟',
                              style: const TextStyle(color: Color(0xFFD1C4A9))),
                          onTap: () => Navigator.of(context).pop(airport));
                    })),
          ])),
    ));
  }
}
