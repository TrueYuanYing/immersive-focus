import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'flight_runtime.dart';
import 'focus_flight_model.dart';

/// A stable in-flight chart. The globe picker owns 3D interaction; this view
/// follows route geography and repaints only when the flight advances.
class FlightNavigationChart extends StatelessWidget {
  const FlightNavigationChart({
    required this.origin,
    required this.destination,
    required this.progress,
    super.key,
  });

  final FocusAirport origin;
  final FocusAirport destination;
  final double progress;

  @override
  Widget build(BuildContext context) {
    final light = Theme.of(context).brightness == Brightness.light;
    return LayoutBuilder(
      builder: (context, constraints) {
        final route = FocusGreatCircleRoute(origin, destination);
        final baseWidth =
            math.min(constraints.maxWidth, constraints.maxHeight * 2);
        final crossesDateLine =
            (origin.longitude - destination.longitude).abs() > 180;
        var minLat = 90.0, maxLat = -90.0, minLon = 180.0, maxLon = -180.0;
        for (var i = 0; i <= 40; i++) {
          final point = route.pointAt(i / 40);
          minLat = math.min(minLat, point.latitude);
          maxLat = math.max(maxLat, point.latitude);
          minLon = math.min(minLon, point.longitude);
          maxLon = math.max(maxLon, point.longitude);
        }
        final zoom = crossesDateLine
            ? 1.0
            : math
                .min(
                    constraints.maxWidth *
                        .62 /
                        math.max(12, maxLon - minLon) *
                        360 /
                        baseWidth,
                    constraints.maxHeight *
                        .48 /
                        math.max(12, maxLat - minLat) *
                        360 /
                        baseWidth)
                .clamp(1.0, 4.0)
                .toDouble();
        final width = baseWidth * zoom;
        final centerLon = crossesDateLine ? 0.0 : (minLon + maxLon) / 2;
        final centerLat = crossesDateLine ? 0.0 : (minLat + maxLat) / 2;
        final rect = Rect.fromLTWH(
          constraints.maxWidth / 2 - (centerLon + 180) / 360 * width,
          constraints.maxHeight / 2 - (90 - centerLat) / 180 * width / 2,
          width,
          width / 2,
        );
        final distance = greatCircleDistanceKm(origin, destination);
        final position = progress.clamp(0.0, 1.0);
        return ClipRect(
            child: ColoredBox(
          color: light ? const Color(0xFFE4EAE4) : const Color(0xFF15272A),
          child: Stack(
            fit: StackFit.expand,
            children: [
              Positioned.fromRect(
                rect: rect,
                child: ColorFiltered(
                  colorFilter: ColorFilter.matrix(<double>[
                    light ? -.22 : .51,
                    0,
                    0,
                    0,
                    light ? 220 : 10,
                    0,
                    light ? -.18 : .48,
                    0,
                    0,
                    light ? 230 : 26,
                    0,
                    0,
                    light ? -.20 : .42,
                    0,
                    light ? 220 : 31,
                    0,
                    0,
                    0,
                    1,
                    0,
                  ]),
                  child: Image.asset(
                    'assets/focus_flight/world_map_monochrome.png',
                    fit: BoxFit.fill,
                    filterQuality: FilterQuality.medium,
                  ),
                ),
              ),
              CustomPaint(
                painter: _FlightChartPainter(
                  origin: origin,
                  destination: destination,
                  progress: progress,
                  mapRect: rect,
                  light: light,
                ),
              ),
              Positioned(
                left: 16,
                right: 16,
                bottom: 22,
                child: Center(
                    child: Container(
                  constraints: const BoxConstraints(maxWidth: 420),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    color: light
                        ? const Color(0xF2F6F5EF)
                        : const Color(0xEF17282B),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: Theme.of(context).dividerColor),
                  ),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Text('${origin.id}  →  ${destination.id} · 航线飞行',
                        style: Theme.of(context).textTheme.labelLarge),
                    const SizedBox(height: 8),
                    LinearProgressIndicator(
                        value: position,
                        color: const Color(0xFFC48750),
                        minHeight: 3),
                    const SizedBox(height: 8),
                    Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('已飞 ${(distance * position).round()} km'),
                          Text('${(position * 100).round()}%'),
                          Text('剩余 ${(distance * (1 - position)).round()} km'),
                        ]),
                  ]),
                )),
              ),
            ],
          ),
        ));
      },
    );
  }
}

class _FlightChartPainter extends CustomPainter {
  const _FlightChartPainter({
    required this.origin,
    required this.destination,
    required this.progress,
    required this.mapRect,
    required this.light,
  });

  final FocusAirport origin;
  final FocusAirport destination;
  final double progress;
  final Rect mapRect;
  final bool light;

  Offset _project(double latitude, double longitude) => Offset(
        mapRect.left + (longitude + 180) / 360 * mapRect.width,
        mapRect.top + (90 - latitude) / 180 * mapRect.height,
      );

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.clipRect(mapRect);
    final grid = Paint()
      ..color = light ? const Color(0x44909C96) : const Color(0x446D8B8C)
      ..strokeWidth = 1;
    for (var longitude = -150; longitude <= 150; longitude += 30) {
      final x = _project(0, longitude.toDouble()).dx;
      canvas.drawLine(Offset(x, mapRect.top), Offset(x, mapRect.bottom), grid);
    }
    for (var latitude = -60; latitude <= 60; latitude += 30) {
      final y = _project(latitude.toDouble(), 0).dy;
      canvas.drawLine(Offset(mapRect.left, y), Offset(mapRect.right, y), grid);
    }

    final route = FocusGreatCircleRoute(origin, destination);
    final position = progress.clamp(0.0, 1.0).toDouble();
    final ink = light ? const Color(0xFF24383B) : const Color(0xFFEDEAE0);
    final accent = light ? const Color(0xFF9A5836) : const Color(0xFFE8AD75);
    _drawRoute(canvas, route, 1,
        light ? const Color(0xFFCBD7CC) : const Color(0xFF1B3537), 7);
    _drawRoute(canvas, route, 1,
        light ? const Color(0xFF415F5D) : const Color(0xFFB5C6BE), 2.5,
        dashed: true);
    if (position > 0) {
      _drawRoute(canvas, route, position, accent, 3.5);
    }
    final nearby = (_project(origin.latitude, origin.longitude) -
                _project(destination.latitude, destination.longitude))
            .distance <
        190;
    _drawAirport(canvas, origin, ink, 'ORIGIN',
        preferLeft: nearby, labelBelow: nearby);
    _drawAirport(canvas, destination, accent, 'ARRIVAL');

    final point = route.pointAt(position);
    final arriving = position >= .999;
    final next =
        route.pointAt((position + (arriving ? -.001 : .001)).clamp(0.0, 1.0));
    final center = _project(point.latitude, point.longitude);
    final ahead = _project(next.latitude, next.longitude);
    var dx = ahead.dx - center.dx;
    var dy = ahead.dy - center.dy;
    if (dx.abs() > mapRect.width / 2) dx -= dx.sign * mapRect.width;
    if (arriving) {
      dx = -dx;
      dy = -dy;
    }
    final angle = math.atan2(dy, dx);
    canvas.save();
    canvas.translate(center.dx, center.dy);
    canvas.rotate(angle);
    canvas.drawCircle(
        Offset.zero,
        21,
        Paint()
          ..color = light ? const Color(0xFFEDECE2) : const Color(0xCC1B3031));
    canvas.drawCircle(
        Offset.zero,
        20,
        Paint()
          ..color = accent
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1);
    final aircraft = Path()
      ..moveTo(16, 0)
      ..quadraticBezierTo(13, -2, 7, -2)
      ..lineTo(0, -13)
      ..lineTo(-3, -13)
      ..lineTo(-2, -2)
      ..lineTo(-10, -2)
      ..lineTo(-14, -6)
      ..lineTo(-16, -6)
      ..lineTo(-13, 0)
      ..lineTo(-16, 6)
      ..lineTo(-14, 6)
      ..lineTo(-10, 2)
      ..lineTo(-2, 2)
      ..lineTo(-3, 13)
      ..lineTo(0, 13)
      ..lineTo(7, 2)
      ..quadraticBezierTo(13, 2, 16, 0)
      ..close();
    canvas.drawPath(aircraft, Paint()..color = ink);
    canvas.restore();
    canvas.restore();
  }

  void _drawRoute(Canvas canvas, FocusGreatCircleRoute route, double end,
      Color color, double width,
      {bool dashed = false}) {
    final path = Path();
    Offset? previous;
    for (var step = 0; step <= 120; step++) {
      final t = end * step / 120;
      final point = route.pointAt(t);
      final current = _project(point.latitude, point.longitude);
      if (previous == null ||
          (current.dx - previous.dx).abs() > mapRect.width / 2) {
        path.moveTo(current.dx, current.dy);
      } else {
        path.lineTo(current.dx, current.dy);
      }
      previous = current;
    }
    final paintPath = dashed ? Path() : path;
    if (dashed) {
      for (final metric in path.computeMetrics()) {
        for (var offset = 0.0; offset < metric.length; offset += 16) {
          paintPath.addPath(
              metric.extractPath(offset, math.min(offset + 8, metric.length)),
              Offset.zero);
        }
      }
    }
    canvas.drawPath(
        paintPath,
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeCap = StrokeCap.round
          ..strokeWidth = width);
  }

  void _drawAirport(
      Canvas canvas, FocusAirport airport, Color color, String caption,
      {bool preferLeft = false, bool labelBelow = false}) {
    final point = _project(airport.latitude, airport.longitude);
    canvas.drawCircle(
        point,
        8,
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2);
    canvas.drawCircle(point, 2.5, Paint()..color = color);
    final label = TextPainter(
      text: TextSpan(
        text: '${airport.id}  ${airport.city}\n$caption',
        style: TextStyle(
          color: color,
          fontSize: 12,
          fontWeight: FontWeight.w700,
          height: 1.35,
          shadows: light
              ? null
              : const [Shadow(color: Color(0xFF102125), blurRadius: 6)],
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: 170);
    final right = !preferLeft && point.dx + 18 + label.width <= mapRect.right;
    final x = right ? point.dx + 18 : point.dx - label.width - 18;
    final y = labelBelow ? point.dy + 13 : point.dy - label.height - 13;
    label.paint(canvas, Offset(x, y));
  }

  @override
  bool shouldRepaint(covariant _FlightChartPainter oldDelegate) =>
      oldDelegate.progress != progress ||
      oldDelegate.origin != origin ||
      oldDelegate.destination != destination ||
      oldDelegate.mapRect != mapRect ||
      oldDelegate.light != light;
}
