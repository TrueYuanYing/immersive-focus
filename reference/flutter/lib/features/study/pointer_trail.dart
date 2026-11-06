import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

/// A bounded, repaint-only particle overlay; no gesture recognizers.
class PointerTrail extends StatefulWidget {
  const PointerTrail({required this.child, super.key});
  final Widget child;
  @override
  State<PointerTrail> createState() => _PointerTrailState();
}

class _PointerTrailState extends State<PointerTrail>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  final particles = <_Mote>[];
  final repaint = ValueNotifier<int>(0);
  final random = Random();
  late final Ticker ticker;
  final watch = Stopwatch()..start();
  int last = 0;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    ticker = createTicker((_) {
      particles.removeWhere((p) => watch.elapsedMilliseconds - p.born > 540);
      repaint.value++;
      if (particles.isEmpty) ticker.stop();
    });
  }

  void emit(Offset point) {
    if (MediaQuery.disableAnimationsOf(context) ||
        watch.elapsedMilliseconds - last < 24) {
      return;
    }
    last = watch.elapsedMilliseconds;
    for (var i = 0; i < 2; i++) {
      if (particles.length >= 36) particles.removeAt(0);
      final a = random.nextDouble() * pi * 2;
      particles.add(_Mote(point, Offset(cos(a) * 24, sin(a) * 24 - 8), last));
    }
    if (!ticker.isActive) ticker.start();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) {
      particles.clear();
      ticker.stop();
      repaint.value++;
    }
  }

  @override
  Widget build(BuildContext context) => Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: (e) => emit(e.localPosition),
      onPointerMove: (e) => emit(e.localPosition),
      onPointerHover: (e) => emit(e.localPosition),
      child: Stack(fit: StackFit.expand, children: [
        widget.child,
        IgnorePointer(
            child: RepaintBoundary(
                child: CustomPaint(
                    painter: _TrailPainter(particles, watch, repaint))))
      ]));
  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    ticker.dispose();
    repaint.dispose();
    super.dispose();
  }
}

class _Mote {
  _Mote(this.position, this.velocity, this.born);
  final Offset position, velocity;
  final int born;
}

class _TrailPainter extends CustomPainter {
  _TrailPainter(this.particles, this.watch, Listenable repaint)
      : super(repaint: repaint);
  final List<_Mote> particles;
  final Stopwatch watch;
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint();
    for (final p in particles) {
      final age = watch.elapsedMilliseconds - p.born;
      final fade = (1 - age / 540).clamp(0.0, 1.0);
      paint.color = const Color(0xFFD4BC83).withValues(alpha: fade * .85);
      final point = p.position + p.velocity * (age / 1000);
      final radius = 1 + fade * 3.2;
      canvas.drawCircle(point, radius, paint);
      paint.color = const Color(0xFFFFF8E2).withValues(alpha: fade);
      canvas.drawRect(
          Rect.fromCenter(center: point, width: 1.4, height: radius * 2 + 2),
          paint);
      canvas.drawRect(
          Rect.fromCenter(center: point, width: radius * 2 + 2, height: 1.4),
          paint);
    }
  }

  @override
  bool shouldRepaint(covariant _TrailPainter old) => false;
}
