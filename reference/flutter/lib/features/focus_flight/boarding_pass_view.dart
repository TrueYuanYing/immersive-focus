import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'focus_flight_model.dart';

const _tearAreaHeight = 154.0;
const _tearStubTop = 48.0;

/// 重新绘制的值机票：信息层、条形码撕票层和掉落动画相互独立，
/// 便于在平板上保持稳定的横向撕票手势。
class FocusBoardingPass extends StatelessWidget {
  const FocusBoardingPass({
    required this.origin,
    required this.destination,
    required this.minutes,
    required this.seatId,
    required this.task,
    required this.departure,
    required this.tearProgress,
    required this.dropping,
    required this.onTearProgress,
    super.key,
  });

  final FocusAirport origin;
  final FocusAirport destination;
  final int minutes;
  final String seatId;
  final FocusTask task;
  final DateTime departure;
  final double tearProgress;
  final bool dropping;
  final ValueChanged<double> onTearProgress;

  @override
  Widget build(BuildContext context) {
    // A boarding pass is physical paper in either app theme, matching the
    // café receipt and ferry ticket instead of turning into a black panel.
    const foreground = Color(0xFF1B3339);
    const secondary = Color(0xFF5D7070);
    const ticketColor = Color(0xFFF3F0E6);
    final plan = FocusFlightPlan(
      origin: origin,
      destination: destination,
      minutes: minutes,
      seatClass: FocusSeatClass.economy,
    );
    final arrival = departure.add(Duration(minutes: minutes));
    final date = '${departure.day.toString().padLeft(2, '0')} '
        '${_monthLabel(departure.month)} ${departure.year}';

    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 650),
        child: ClipPath(
          clipper: const _TicketClipper(),
          child: CustomPaint(
            painter: const _TicketBackgroundPainter(paperColor: ticketColor),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(26, 24, 26, 20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: FittedBox(
                              fit: BoxFit.scaleDown,
                              alignment: Alignment.centerLeft,
                              child: Text(
                                'IKO  /  云间 KUMO',
                                style: TextStyle(
                                  color: secondary,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 1.8,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 16),
                          Text(
                            'FF ${departure.month.toString().padLeft(2, '0')}${departure.day.toString().padLeft(2, '0')}',
                            style: TextStyle(
                              color: foreground,
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 1.1,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 22),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          _AirportCodeBlock(
                            code: origin.id,
                            city: origin.city,
                            color: foreground,
                            secondary: secondary,
                          ),
                          Expanded(
                            child: Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: Column(
                                children: [
                                  const Icon(Icons.flight_rounded,
                                      color: Color(0xFFAD633F), size: 22),
                                  const SizedBox(height: 7),
                                  Text(
                                    '${plan.distanceKm.round()} KM',
                                    style: TextStyle(
                                      color: secondary,
                                      fontSize: 10,
                                      fontFeatures: const [
                                        FontFeature.tabularFigures()
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          _AirportCodeBlock(
                            code: destination.id,
                            city: destination.city,
                            color: foreground,
                            secondary: secondary,
                            alignEnd: true,
                          ),
                        ],
                      ),
                      const SizedBox(height: 22),
                      Wrap(
                        spacing: 22,
                        runSpacing: 17,
                        children: [
                          _TicketDatum('SEAT', seatId, foreground, secondary),
                          _TicketDatum(
                              'FOCUS', '$minutes MIN', foreground, secondary),
                          _TicketDatum(
                              'TASK', task.label, foreground, secondary),
                          _TicketDatum('DATE', date, foreground, secondary),
                          _TicketDatum('BOARDING', _timeLabel(departure),
                              foreground, secondary),
                          _TicketDatum('ARRIVAL', _timeLabel(arrival),
                              foreground, secondary),
                          _TicketDatum(
                              'MILES', '${plan.miles}', foreground, secondary),
                        ],
                      ),
                    ],
                  ),
                ),
                Padding(
                  // 让 tear-off 纸片覆盖票面下方的完整轮廓，左右不再
                  // 留出一层静态票纸背景，掉落时不会产生“只掉条码”的残影。
                  padding: const EdgeInsets.fromLTRB(0, 13, 0, 0),
                  child: FocusTearBarcode(
                    progress: tearProgress,
                    dropping: dropping,
                    color: foreground,
                    paperColor: ticketColor,
                    revealColor: Theme.of(context).scaffoldBackgroundColor,
                    onProgressChanged: onTearProgress,
                  ),
                ),
                // The ticket has exactly two visual regions: the fixed
                // information panel above and the single tear-off paper
                // below. Guidance is rendered outside this card by the
                // ticket stage so it cannot become a third blank paper
                // segment when the stub falls away.
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AirportCodeBlock extends StatelessWidget {
  const _AirportCodeBlock({
    required this.code,
    required this.city,
    required this.color,
    required this.secondary,
    this.alignEnd = false,
  });

  final String code;
  final String city;
  final Color color;
  final Color secondary;
  final bool alignEnd;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment:
            alignEnd ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          Text(
            code,
            style: TextStyle(
              color: color,
              fontSize: 44,
              height: 0.95,
              fontWeight: FontWeight.w800,
              letterSpacing: 2.2,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(height: 5),
          Text(city,
              style: TextStyle(color: secondary, fontSize: 12, height: 1.1)),
        ],
      );
}

class _TicketDatum extends StatelessWidget {
  const _TicketDatum(this.label, this.value, this.foreground, this.secondary);

  final String label;
  final String value;
  final Color foreground;
  final Color secondary;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: 122,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: TextStyle(
                    color: secondary, fontSize: 9, letterSpacing: 1.0)),
            const SizedBox(height: 4),
            Text(value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    color: foreground,
                    fontSize: 13,
                    fontWeight: FontWeight.w700)),
          ],
        ),
      );
}

class FocusTearBarcode extends StatefulWidget {
  const FocusTearBarcode({
    required this.progress,
    required this.dropping,
    required this.color,
    required this.paperColor,
    required this.revealColor,
    required this.onProgressChanged,
    super.key,
  });

  final double progress;
  final bool dropping;
  final Color color;
  final Color paperColor;
  final Color revealColor;
  final ValueChanged<double> onProgressChanged;

  @override
  State<FocusTearBarcode> createState() => _FocusTearBarcodeState();
}

class _FocusTearBarcodeState extends State<FocusTearBarcode>
    with SingleTickerProviderStateMixin {
  double? _dragStartX;
  double _dragStartProgress = 0;
  late final AnimationController _fallController;

  @override
  void initState() {
    super.initState();
    _fallController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 920),
    );
    if (widget.dropping) _fallController.forward();
  }

  @override
  void didUpdateWidget(covariant FocusTearBarcode oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.dropping && !oldWidget.dropping) {
      _fallController.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _fallController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, constraints) {
          final width =
              constraints.maxWidth.isFinite ? constraints.maxWidth : 1.0;
          return GestureDetector(
            behavior: HitTestBehavior.opaque,
            onPanStart: (details) {
              _dragStartX = details.globalPosition.dx;
              _dragStartProgress = widget.progress;
            },
            onPanUpdate: (details) {
              final start = _dragStartX;
              if (start == null) return;
              widget.onProgressChanged(
                _dragStartProgress +
                    (details.globalPosition.dx - start) / width,
              );
            },
            onPanEnd: (_) => _dragStartX = null,
            child: RepaintBoundary(
              child: SizedBox(
                width: double.infinity,
                height: _tearAreaHeight,
                child: CustomPaint(
                  painter: _TearBarcodePainter(
                    color: widget.color,
                    paperColor: widget.paperColor,
                    revealColor: widget.revealColor,
                    progress: widget.progress,
                    fallAnimation: _fallController,
                  ),
                  child: const SizedBox.expand(),
                ),
              ),
            ),
          );
        },
      );
}

class _TearBarcodePainter extends CustomPainter {
  const _TearBarcodePainter({
    required this.color,
    required this.paperColor,
    required this.revealColor,
    required this.progress,
    required this.fallAnimation,
  }) : super(repaint: fallAnimation);

  final Color color;
  final Color paperColor;
  final Color revealColor;
  final double progress;
  final Animation<double> fallAnimation;
  double get fallProgress => fallAnimation.value;

  @override
  void paint(Canvas canvas, Size size) {
    final left = 8.0;
    final right = size.width - 8;
    final stubTop = _tearStubTop;
    // 底边也属于票根：清除区域和可掉落纸片必须一直覆盖到票卡末端。
    final stubBottom = size.height;
    final barcodeTop = 62.0;
    final barcodeBottom = 124.0;
    final tearOffPaperRect = Rect.fromLTRB(0, stubTop, size.width, stubBottom);
    final dragProgress = progress.clamp(0.0, 1.0).toDouble();
    final fallEase = Curves.easeInCubic.transform(fallProgress);

    // 先清除虚线以下的原票面。否则父级票卡的静态背景会留在原位，
    // 视觉上就像只有条形码消失，而不是整段纸张被撕下并掉落。
    canvas.drawRect(tearOffPaperRect, Paint()..color = revealColor);

    final guide = Paint()
      ..color = color.withValues(alpha: 0.48)
      ..strokeWidth = 1;
    for (var x = left; x < right; x += 8) {
      canvas.drawLine(Offset(x, 43), Offset(math.min(x + 4, right), 43), guide);
    }
    _paintText(
        canvas,
        'TEAR ALONG THE LINE',
        Offset(left, 20),
        TextStyle(
          color: color.withValues(alpha: 0.47),
          fontSize: 9,
          letterSpacing: 1.6,
          fontWeight: FontWeight.w700,
        ));

    void drawBarcodeGrid() {
      final ink = Paint()..color = color;
      // Reference-style guard bars. They are part of the same paper layer as
      // the central code, so they rotate and fall together.
      var guardX = left + 2;
      const guardBars = <double>[3, 1.5, 1.5, 3, 1.5, 1.5];
      for (final width in guardBars) {
        canvas.drawRect(
          Rect.fromLTRB(guardX, barcodeTop, guardX + width, barcodeBottom),
          ink,
        );
        guardX += width + 3;
      }

      final codeLeft = left + 38;
      final codeRight = right - 38;
      const columns = 58;
      const rows = 7;
      final cellWidth = (codeRight - codeLeft) / columns;
      final cellHeight = (barcodeBottom - barcodeTop) / rows;
      for (var row = 0; row < rows; row++) {
        for (var column = 0; column < columns; column++) {
          // A deterministic block matrix keeps the printed-code silhouette
          // stable between repaints while retaining the irregular rhythm of
          // the reference ticket.
          final hash = (row * 41 + column * 23 + row * column * 7) % 19;
          final filled = hash < 8 ||
              (column % 11 == 0 && row.isEven) ||
              (row == 0 && column % 5 < 2) ||
              (row == rows - 1 && column % 7 < 3);
          if (!filled) continue;
          final rect = Rect.fromLTWH(
            codeLeft + column * cellWidth,
            barcodeTop + row * cellHeight,
            math.max(1.2, cellWidth * .84),
            math.max(2.0, cellHeight * .88),
          );
          canvas.drawRect(rect, ink);
        }
      }

      var endGuardX = codeRight + 7;
      const endBars = <double>[1.5, 1.5, 3, 1.5, 1.5, 3];
      for (final width in endBars) {
        canvas.drawRect(
          Rect.fromLTRB(
              endGuardX, barcodeTop, endGuardX + width, barcodeBottom),
          ink,
        );
        endGuardX += width + 3;
      }
    }

    void drawBarcode() => drawBarcodeGrid();

    final stub = Rect.fromLTRB(left, stubTop, right, stubBottom);
    final fill = Color.alphaBlend(
      color.withValues(alpha: 0.045),
      paperColor,
    );

    void drawPaperFace() {
      // 每次绘制都覆盖完整纸片，再由外层 clip 取出当前条带；这样条码和
      // 条码下方的空白纸张始终属于同一张票纸，不会被拆成第三段。
      canvas.drawRRect(
        RRect.fromRectAndRadius(stub, const Radius.circular(10)),
        Paint()..color = fill,
      );
      canvas.drawLine(
        Offset(left + 1, stubTop),
        Offset(right - 1, stubTop),
        Paint()
          ..color = color.withValues(alpha: 0.16)
          ..strokeWidth = 1,
      );
      drawBarcode();
    }

    void drawRagdollPaper() {
      const segmentCount = 18;
      final segmentWidth = (right - left) / segmentCount;
      final tearPoint = dragProgress;
      for (var index = 0; index < segmentCount; index++) {
        final segmentLeft = left + index * segmentWidth;
        final segmentRight = left + (index + 1) * segmentWidth;
        final centerProgress = (index + .5) / segmentCount;
        final detached = centerProgress < tearPoint
            ? ((tearPoint - centerProgress) / math.max(.001, tearPoint))
                .clamp(0.0, 1.0)
                .toDouble()
            : 0.0;
        final droop = math.pow(detached, .82).toDouble() * size.height * .25 +
            math.sin((centerProgress * 5 + tearPoint) * math.pi) *
                detached *
                3.5;
        final rotation = -.14 * detached +
            math.sin((centerProgress * 4 + tearPoint) * math.pi) *
                detached *
                .025;
        final pivot = Offset((segmentLeft + segmentRight) / 2, stubTop);
        canvas.save();
        canvas.translate(pivot.dx, pivot.dy + droop);
        canvas.rotate(rotation);
        canvas.translate(-pivot.dx, -pivot.dy);
        canvas.clipRect(Rect.fromLTRB(
          segmentLeft - 1,
          stubTop - 2,
          segmentRight + 1,
          stubBottom + 2,
        ));
        drawPaperFace();
        canvas.restore();
      }
    }

    void drawFreeFallPaper() {
      // 到达右端后才整张脱离。之后所有内容（含底部空白纸边）共享同一
      // 个刚体变换，并带有轻微角速度，形成自然的自由落体而非平移。
      final pivot = Offset(stub.center.dx, stubTop + 6);
      final freeFall = fallEase;
      final dx = size.width * .08 * freeFall;
      final rotation = .045 + freeFall * .22;
      // 横向更宽的平板票根旋转后，左上角会抬高；补足这段距离，让整张
      // 纸在动画结束前离开原位，而不是留下一个条码角落再突然切页。
      final dy = (size.height * 1.12 + stub.width * .5 * math.sin(rotation)) *
          freeFall;
      final opacity = (1 - freeFall * .32).clamp(0.0, 1.0);
      canvas.save();
      canvas.translate(pivot.dx + dx, pivot.dy + dy);
      canvas.rotate(rotation);
      canvas.translate(-pivot.dx, -pivot.dy);
      canvas.saveLayer(
          null, Paint()..color = Colors.white.withValues(alpha: opacity));
      drawPaperFace();
      canvas.restore();
      canvas.restore();
    }

    if (dragProgress >= .98 || fallProgress > 0) {
      drawFreeFallPaper();
    } else {
      drawRagdollPaper();
    }
  }

  void _paintText(Canvas canvas, String text, Offset offset, TextStyle style) {
    final painter = TextPainter(
      text: TextSpan(text: text, style: style),
      textDirection: TextDirection.ltr,
    )..layout();
    painter.paint(canvas, offset);
  }

  @override
  bool shouldRepaint(covariant _TearBarcodePainter oldDelegate) =>
      oldDelegate.color != color ||
      oldDelegate.paperColor != paperColor ||
      oldDelegate.revealColor != revealColor ||
      oldDelegate.progress != progress ||
      oldDelegate.fallAnimation != fallAnimation;
}

class _TicketClipper extends CustomClipper<Path> {
  const _TicketClipper();

  @override
  Path getClip(Size size) {
    final path = Path()
      ..addRRect(RRect.fromRectAndRadius(
          Offset.zero & size, const Radius.circular(24)));
    const notch = 15.0;
    final y = size.height * 0.72;
    path.addOval(Rect.fromCircle(center: Offset(0, y), radius: notch));
    path.addOval(Rect.fromCircle(center: Offset(size.width, y), radius: notch));
    return Path.combine(
        PathOperation.difference,
        path,
        Path()
          ..addOval(Rect.fromCircle(center: Offset(0, y), radius: notch))
          ..addOval(
              Rect.fromCircle(center: Offset(size.width, y), radius: notch)));
  }

  @override
  bool shouldReclip(covariant _TicketClipper oldClipper) => false;
}

class _TicketBackgroundPainter extends CustomPainter {
  const _TicketBackgroundPainter({required this.paperColor});

  final Color paperColor;

  @override
  void paint(Canvas canvas, Size size) {
    // 静态纸面只到撕线，票根下面不能再有会留下圆角残影的第二层纸。
    canvas.drawRect(
      Rect.fromLTWH(
          0, 0, size.width, size.height - _tearAreaHeight + _tearStubTop),
      Paint()..color = paperColor,
    );
    canvas.drawRect(
      Rect.fromLTWH(0, 0, 5, size.height * .72),
      Paint()..color = const Color(0xFFAD633F),
    );
    canvas.drawLine(
      Offset(26, size.height * .69),
      Offset(size.width - 26, size.height * .69),
      Paint()
        ..color = const Color(0x2B35545A)
        ..strokeWidth = 1,
    );
  }

  @override
  bool shouldRepaint(covariant _TicketBackgroundPainter oldDelegate) =>
      oldDelegate.paperColor != paperColor;
}

String _monthLabel(int month) {
  const months = <String>[
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
  ];
  return months[(month - 1).clamp(0, 11)];
}

String _timeLabel(DateTime time) =>
    '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';
