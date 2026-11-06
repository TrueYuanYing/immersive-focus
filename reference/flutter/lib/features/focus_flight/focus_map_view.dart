import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'flight_runtime.dart';
import 'focus_flight_model.dart';

/// Dash or Crash 共用世界地图。
///
/// 视口和地图内容是两层：地图可以双指缩放、拖动，路线信息固定在地图外，
/// 因而不会被一起放大、裁切或随着平移跑掉。底图保持真实的 2:1 世界投影，
/// 城市节点和飞行中的路线也使用相同投影。
class FocusWorldMapView extends StatefulWidget {
  const FocusWorldMapView({
    required this.origin,
    this.destination,
    this.progress = 0,
    this.interactive = false,
    this.showCities = true,
    this.height,
    this.onAirportTap,
    super.key,
  });

  final FocusAirport origin;
  final FocusAirport? destination;
  final double progress;
  final bool interactive;
  final bool showCities;
  final double? height;
  final ValueChanged<FocusAirport>? onAirportTap;

  @override
  State<FocusWorldMapView> createState() => _FocusWorldMapViewState();
}

class _FocusWorldMapViewState extends State<FocusWorldMapView> {
  final TransformationController _transform = TransformationController();
  double _scale = 1;

  @override
  void dispose() {
    _transform.dispose();
    super.dispose();
  }

  void _handleTap(TapUpDetails details, Size viewport) {
    final scenePoint = widget.interactive
        ? _transform.toScene(details.localPosition)
        : details.localPosition;
    final mapRect = FocusWorldMapPainter.mapRectFor(viewport);
    final airport = FocusWorldMapPainter.nearestAirport(
      scenePoint,
      mapRect,
      maxDistance: math.max(18, 32 / _scale).toDouble(),
    );
    if (airport != null && airport.id != widget.origin.id) {
      widget.onAirportTap?.call(airport);
    }
  }

  @override
  Widget build(BuildContext context) {
    final mapSurface = LayoutBuilder(
      builder: (context, constraints) {
        final viewport = Size(
          constraints.maxWidth,
          constraints.maxHeight.isFinite ? constraints.maxHeight : 360,
        );
        final mapArtwork = _MapArtwork(
          origin: widget.origin,
          destination: widget.destination,
          progress: widget.progress,
          showCities: widget.showCities,
          zoom: _scale,
          onTap: widget.onAirportTap == null
              ? null
              : (details) => _handleTap(details, viewport),
        );
        final mapChild = widget.interactive
            ? InteractiveViewer(
                transformationController: _transform,
                minScale: 1,
                maxScale: 3.4,
                panEnabled: true,
                scaleEnabled: true,
                boundaryMargin: const EdgeInsets.all(28),
                clipBehavior: Clip.hardEdge,
                onInteractionUpdate: (_) {
                  final next = _transform.value
                      .getMaxScaleOnAxis()
                      .clamp(1.0, 3.4)
                      .toDouble();
                  if ((next - _scale).abs() > 0.015 && mounted) {
                    setState(() => _scale = next);
                  }
                },
                child: mapArtwork,
              )
            : mapArtwork;

        return ClipRRect(
          borderRadius: BorderRadius.circular(24),
          child: ColoredBox(
            color: const Color(0xFF111316),
            child: mapChild,
          ),
        );
      },
    );

    final sizedSurface = widget.height == null
        ? mapSurface
        : SizedBox(height: widget.height, child: mapSurface);
    if (!widget.interactive) return sizedSurface;

    // 路线摘要永远在 InteractiveViewer 外部，地图怎么缩放都不会影响它。
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        sizedSurface,
        const SizedBox(height: 10),
        _MapCaption(
          origin: widget.origin,
          destination: widget.destination,
          scale: _scale,
        ),
      ],
    );
  }
}

class _MapArtwork extends StatelessWidget {
  const _MapArtwork({
    required this.origin,
    required this.destination,
    required this.progress,
    required this.showCities,
    required this.zoom,
    this.onTap,
  });

  final FocusAirport origin;
  final FocusAirport? destination;
  final double progress;
  final bool showCities;
  final double zoom;
  final GestureTapUpCallback? onTap;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, constraints) {
          final viewport = Size(
            constraints.maxWidth,
            constraints.maxHeight.isFinite ? constraints.maxHeight : 360,
          );
          final mapRect = FocusWorldMapPainter.mapRectFor(viewport);
          return Stack(
            fit: StackFit.expand,
            children: [
              Positioned.fromRect(
                rect: mapRect,
                child: ColorFiltered(
                  colorFilter: const ColorFilter.matrix(<double>[
                    0.299,
                    0.587,
                    0.114,
                    0,
                    0,
                    0.299,
                    0.587,
                    0.114,
                    0,
                    0,
                    0.299,
                    0.587,
                    0.114,
                    0,
                    0,
                    0,
                    0,
                    0,
                    1,
                    0,
                  ]),
                  child: Image.asset(
                    'assets/focus_flight/world_map_monochrome.png',
                    fit: BoxFit.fill,
                    filterQuality: FilterQuality.high,
                    errorBuilder: (_, __, ___) => const ColoredBox(
                      color: Color(0xFF1B1E22),
                    ),
                  ),
                ),
              ),
              Positioned.fromRect(
                rect: mapRect,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: const Color(0x33111214),
                  ),
                ),
              ),
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTapUp: onTap,
                child: CustomPaint(
                  painter: FocusWorldMapPainter(
                    origin: origin,
                    destination: destination,
                    progress: progress,
                    showCities: showCities,
                    showLabels: showCities && zoom >= 1.2,
                    repaintKey: zoom,
                    mapRect: mapRect,
                  ),
                  child: const SizedBox.expand(),
                ),
              ),
            ],
          );
        },
      );
}

class _MapCaption extends StatelessWidget {
  const _MapCaption({
    required this.origin,
    required this.destination,
    required this.scale,
  });

  final FocusAirport origin;
  final FocusAirport? destination;
  final double scale;

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
                      ? '双指缩放 · 拖动查看 · 点击城市选择目的地'
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
              if (scale > 1.01)
                Text(
                  '${scale.toStringAsFixed(1)}× · ${focusAirports.length} 城市',
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

class FocusWorldMapPainter extends CustomPainter {
  const FocusWorldMapPainter({
    required this.origin,
    required this.destination,
    required this.progress,
    required this.showCities,
    required this.mapRect,
    this.showLabels = false,
    this.repaintKey = 0,
  });

  final FocusAirport origin;
  final FocusAirport? destination;
  final double progress;
  final bool showCities;
  final Rect mapRect;
  final bool showLabels;
  final double repaintKey;

  static Rect mapRectFor(Size viewport) {
    final width = math.min(viewport.width, viewport.height * 2);
    final height = width / 2;
    return Rect.fromLTWH(
      (viewport.width - width) / 2,
      (viewport.height - height) / 2,
      width,
      height,
    );
  }

  static Offset projectCoordinates(
      double latitude, double longitude, Rect rect) {
    return Offset(
      rect.left + (longitude + 180) / 360 * rect.width,
      rect.top + (90 - latitude) / 180 * rect.height,
    );
  }

  static FocusAirport? nearestAirport(
    Offset point,
    Rect mapRect, {
    double maxDistance = 32,
  }) {
    if (!mapRect.inflate(maxDistance).contains(point)) return null;
    FocusAirport? nearest;
    var distance = double.infinity;
    for (final airport in focusAirports) {
      final candidate =
          projectCoordinates(airport.latitude, airport.longitude, mapRect);
      final current = (candidate - point).distance;
      if (current < distance) {
        distance = current;
        nearest = airport;
      }
    }
    return distance <= maxDistance ? nearest : null;
  }

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.clipRect(mapRect);
    _drawGraticule(canvas);

    final selectedIds = <String>{origin.id};
    if (destination != null) selectedIds.add(destination!.id);
    if (destination != null) {
      final route = FocusGreatCircleRoute(origin, destination!);
      final path = Path();
      for (var i = 0; i <= 96; i++) {
        final point = route.pointAt(i / 96);
        final offset =
            projectCoordinates(point.latitude, point.longitude, mapRect);
        if (i == 0) {
          path.moveTo(offset.dx, offset.dy);
        } else {
          path.lineTo(offset.dx, offset.dy);
        }
      }
      canvas.drawPath(
        path,
        Paint()
          ..color = const Color(0xFFF2F3F3).withValues(alpha: 0.82)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.8,
      );
      final clampedProgress = progress.clamp(0.0, 1.0).toDouble();
      final progressPoint = route.pointAt(clampedProgress);
      _drawAircraft(
        canvas,
        projectCoordinates(
            progressPoint.latitude, progressPoint.longitude, mapRect),
        route.headingAt(clampedProgress),
        math.min(mapRect.width, mapRect.height) * 0.036,
      );
    }

    if (showCities) {
      for (var index = 0; index < focusAirports.length; index++) {
        final airport = focusAirports[index];
        final point =
            projectCoordinates(airport.latitude, airport.longitude, mapRect);
        final selected = selectedIds.contains(airport.id);
        if (selected) {
          canvas.drawCircle(
            point,
            4.1,
            Paint()..color = const Color(0xFFF5F5F3),
          );
        } else {
          canvas.drawCircle(
            point,
            3.2,
            Paint()
              ..color = const Color(0xFFE1E3E4).withValues(alpha: 0.82)
              ..style = PaintingStyle.stroke
              ..strokeWidth = 1.1,
          );
        }
        if (showLabels && (selected || index % 3 == 0)) {
          _drawLabel(canvas, airport, point, selected);
        }
      }
    }

    _drawEndpoint(canvas, origin, const Color(0xFFF5F5F3), alignEnd: false);
    if (destination != null) {
      _drawEndpoint(canvas, destination!, const Color(0xFFCDD1D4),
          alignEnd: true);
    }
    canvas.restore();
  }

  void _drawGraticule(Canvas canvas) {
    final paint = Paint()
      ..color = const Color(0xFFE8EAEC).withValues(alpha: 0.10)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.7;
    for (var latitude = -60; latitude <= 60; latitude += 30) {
      final y = mapRect.top + (90 - latitude) / 180 * mapRect.height;
      canvas.drawLine(Offset(mapRect.left, y), Offset(mapRect.right, y), paint);
    }
    for (var longitude = -150; longitude <= 150; longitude += 30) {
      final x = mapRect.left + (longitude + 180) / 360 * mapRect.width;
      canvas.drawLine(Offset(x, mapRect.top), Offset(x, mapRect.bottom), paint);
    }
  }

  void _drawEndpoint(Canvas canvas, FocusAirport airport, Color color,
      {required bool alignEnd}) {
    final point =
        projectCoordinates(airport.latitude, airport.longitude, mapRect);
    canvas.drawCircle(
        point, 11, Paint()..color = color.withValues(alpha: 0.18));
    canvas.drawCircle(point, 4.3, Paint()..color = color);
    final painter = TextPainter(
      text: TextSpan(
        text: '${airport.id}  ${airport.city}',
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.5,
          shadows: const [Shadow(color: Color(0xDD111214), blurRadius: 4)],
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: 160);
    final dx = alignEnd ? point.dx - painter.width - 10 : point.dx + 10;
    painter.paint(canvas, Offset(dx, point.dy - painter.height - 7));
  }

  void _drawLabel(
      Canvas canvas, FocusAirport airport, Offset point, bool selected) {
    final painter = TextPainter(
      text: TextSpan(
        text: airport.id,
        style: TextStyle(
          color: selected ? const Color(0xFFF4F4F3) : const Color(0xFFD1D4D8),
          fontSize: selected ? 10 : 8,
          fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          letterSpacing: 0.6,
          shadows: const [Shadow(color: Color(0xEE111214), blurRadius: 3)],
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    painter.paint(canvas, point + const Offset(6, -12));
  }

  void _drawAircraft(
      Canvas canvas, Offset center, double heading, double unit) {
    final shadow = Paint()..color = const Color(0x66101418);
    canvas.drawOval(
      Rect.fromCenter(
          center: center + const Offset(2, 4),
          width: unit * 2.5,
          height: unit * 1.2),
      shadow,
    );
    canvas.save();
    canvas.translate(center.dx, center.dy);
    canvas.rotate(heading);
    final body = Paint()..color = const Color(0xFFF4F4F1);
    final plane = Path()
      ..moveTo(unit * 1.7, 0)
      ..lineTo(unit * 0.45, -unit * 0.23)
      ..lineTo(unit * 0.04, -unit * 0.9)
      ..lineTo(-unit * 0.18, -unit * 0.9)
      ..lineTo(-unit * 0.24, -unit * 0.22)
      ..lineTo(-unit * 1.15, -unit * 0.42)
      ..lineTo(-unit * 1.36, -unit * 0.22)
      ..lineTo(-unit * 0.55, 0)
      ..lineTo(-unit * 1.36, unit * 0.22)
      ..lineTo(-unit * 1.15, unit * 0.42)
      ..lineTo(-unit * 0.24, unit * 0.22)
      ..lineTo(-unit * 0.18, unit * 0.9)
      ..lineTo(unit * 0.04, unit * 0.9)
      ..lineTo(unit * 0.45, unit * 0.23)
      ..close();
    canvas.drawPath(plane, body);
    canvas.drawLine(
      Offset(-unit * 0.45, 0),
      Offset(unit * 0.9, 0),
      Paint()
        ..color = const Color(0xFF8C9298)
        ..strokeWidth = unit * 0.08,
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant FocusWorldMapPainter oldDelegate) =>
      oldDelegate.origin.id != origin.id ||
      oldDelegate.destination?.id != destination?.id ||
      oldDelegate.progress != progress ||
      oldDelegate.showCities != showCities ||
      oldDelegate.showLabels != showLabels ||
      oldDelegate.mapRect != mapRect ||
      oldDelegate.repaintKey != repaintKey;
}
