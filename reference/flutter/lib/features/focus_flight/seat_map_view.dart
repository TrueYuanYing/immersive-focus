import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'focus_flight_model.dart';

/// 可上下滚动的窄体客机座舱。
///
/// 机身、机翼、驾驶舱和尾翼都在同一张长画布里绘制，座椅永远落在机身
/// 内侧，用户可以像参考软件一样沿飞机纵向查看整架飞机的座位。
class FocusAircraftSeatMap extends StatefulWidget {
  const FocusAircraftSeatMap({
    required this.flightId,
    required this.selectedSeat,
    required this.onSelected,
    super.key,
  });

  final String flightId;
  final String selectedSeat;
  final ValueChanged<String> onSelected;

  @override
  State<FocusAircraftSeatMap> createState() => _FocusAircraftSeatMapState();
}

class _FocusAircraftSeatMapState extends State<FocusAircraftSeatMap> {
  // Keep the planform close to the supplied tall reference image. The outer
  // card may use the tablet width, but the aircraft itself stays narrow and
  // scrolls vertically as one complete object.
  static const _bottomReveal = 126.0;

  @override
  Widget build(BuildContext context) => MediaQuery.sizeOf(context)
              .shortestSide <
          600
      ? _PhoneAircraftSeats(
          flightId: widget.flightId,
          selectedSeat: widget.selectedSeat,
          onSelected: widget.onSelected)
      : LayoutBuilder(
          builder: (context, constraints) {
            final isDark = Theme.of(context).brightness == Brightness.dark;
            final availableWidth =
                constraints.maxWidth.isFinite ? constraints.maxWidth : 720.0;
            final availableHeight =
                constraints.maxHeight.isFinite ? constraints.maxHeight : 760.0;
            final portrait =
                MediaQuery.orientationOf(context) == Orientation.portrait;
            final mapWidth = math.min(
                700.0, math.max(300.0, availableWidth * (portrait ? .9 : .72)));
            // Keep the full 23-row aircraft scrollable on narrow phones too.
            // The old width-derived height became ~680 px at phone width while
            // rows 12–23 still used their tablet coordinates, leaving the aft
            // cabin/tail clipped and making the tail look broken.
            // The last seat row must end before the aft cone and tailplane.
            // A narrow portrait canvas previously shortened the aircraft while
            // fixed row coordinates still extended into the taper and tail.
            final deckHeight = math.max(mapWidth * 2.28, 1560.0);
            final surface =
                isDark ? const Color(0xFF0E0F12) : const Color(0xFFF0F1F2);
            final border =
                isDark ? const Color(0xFF303238) : const Color(0xFFD4D7DA);
            return Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 1180),
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: surface,
                    borderRadius: BorderRadius.circular(30),
                    border: Border.all(color: border),
                  ),
                  child: SizedBox(
                    height: availableHeight,
                    child: Column(
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(22, 18, 22, 14),
                          child: Row(
                            children: [
                              Icon(Icons.airplanemode_active_rounded,
                                  size: 18,
                                  color: isDark
                                      ? const Color(0xFFE8E9E7)
                                      : const Color(0xFF202328)),
                              const SizedBox(width: 9),
                              Text(
                                'CABIN MAP',
                                style: TextStyle(
                                  color: isDark
                                      ? const Color(0xFFE8E9E7)
                                      : const Color(0xFF202328),
                                  fontSize: 12,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 1.5,
                                ),
                              ),
                              const Spacer(),
                              Text(
                                'SELECT A SEAT',
                                style: TextStyle(
                                  color: isDark
                                      ? const Color(0xFF8F949B)
                                      : const Color(0xFF777D84),
                                  fontSize: 11,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Divider(height: 1, color: border),
                        Expanded(
                          child: Stack(
                            children: [
                              SingleChildScrollView(
                                physics: const BouncingScrollPhysics(),
                                child: Center(
                                  child: SizedBox(
                                    width: mapWidth,
                                    child: GestureDetector(
                                      behavior: HitTestBehavior.opaque,
                                      onTapUp: (details) {
                                        final size = Size(mapWidth, deckHeight);
                                        final seat = FocusSeatMapPainter.seatAt(
                                            details.localPosition, size);
                                        if (seat == null) return;
                                        final row = int.parse(
                                            seat.substring(0, seat.length - 1));
                                        final column =
                                            seat.substring(seat.length - 1);
                                        if (focusSeatState(
                                                widget.flightId, row, column,
                                                selectedSeat:
                                                    widget.selectedSeat) !=
                                            FocusSeatState.occupied) {
                                          widget.onSelected(seat);
                                        }
                                      },
                                      child: Column(
                                        children: [
                                          CustomPaint(
                                            painter: FocusSeatMapPainter(
                                              flightId: widget.flightId,
                                              selectedSeat: widget.selectedSeat,
                                              darkSurface: isDark,
                                            ),
                                            child: SizedBox(
                                                width: mapWidth,
                                                height: deckHeight),
                                          ),
                                          const SizedBox(height: _bottomReveal),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                              Positioned(
                                top: 16,
                                right: 14,
                                child: IgnorePointer(
                                  child: _SeatLegend(darkSurface: isDark),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        );
}

/// Phone targets remain readable and tappable; the tablet aircraft painter is unchanged.
class _PhoneAircraftSeats extends StatefulWidget {
  const _PhoneAircraftSeats(
      {required this.flightId,
      required this.selectedSeat,
      required this.onSelected});
  final String flightId;
  final String selectedSeat;
  final ValueChanged<String> onSelected;

  @override
  State<_PhoneAircraftSeats> createState() => _PhoneAircraftSeatsState();
}

class _PhoneAircraftSeatsState extends State<_PhoneAircraftSeats> {
  late final ScrollController _scroll;
  @override
  void initState() {
    super.initState();
    final row =
        int.tryParse(widget.selectedSeat.replaceAll(RegExp('[A-F]'), '')) ?? 1;
    _scroll =
        ScrollController(initialScrollOffset: math.max(0, row - 2) * 52.0);
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ink = theme.colorScheme.onSurface;
    final accent = theme.colorScheme.secondary;
    return DecoratedBox(
        decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: theme.dividerColor)),
        child: Column(children: [
          Padding(
              padding: const EdgeInsets.all(10),
              child: Wrap(spacing: 14, runSpacing: 6, children: [
                for (final entry in [
                  (Icons.event_seat_outlined, '可选', ink.withValues(alpha: .6)),
                  (Icons.check_circle_outline, '已选', accent),
                  (Icons.close_rounded, '已占', ink.withValues(alpha: .4)),
                ])
                  Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(entry.$1, size: 14, color: entry.$3),
                    const SizedBox(width: 4),
                    Text(entry.$2, style: theme.textTheme.labelSmall),
                  ])
              ])),
          Divider(height: 1, color: theme.dividerColor),
          Expanded(
              child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: LayoutBuilder(
                      builder: (context, constraints) => SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            child: SizedBox(
                                width: math.max(316, constraints.maxWidth),
                                height: constraints.maxHeight,
                                child: ListView(
                                    controller: _scroll,
                                    padding: const EdgeInsets.only(bottom: 8),
                                    children: [
                                      SizedBox(
                                          height: 28,
                                          child: Row(children: [
                                            for (final column in [
                                              'A',
                                              'B',
                                              'C',
                                              '',
                                              'D',
                                              'E',
                                              'F'
                                            ])
                                              if (column.isEmpty)
                                                const SizedBox(width: 28)
                                              else
                                                Expanded(
                                                    child: Center(
                                                        child: Text(column,
                                                            style: theme
                                                                .textTheme
                                                                .labelSmall))),
                                          ])),
                                      for (var row = 1;
                                          row <= focusSeatRows;
                                          row++)
                                        SizedBox(
                                            height: 52,
                                            child: Row(children: [
                                              for (final column in [
                                                'A',
                                                'B',
                                                'C',
                                                '',
                                                'D',
                                                'E',
                                                'F'
                                              ])
                                                if (column.isEmpty)
                                                  SizedBox(
                                                      width: 28,
                                                      child: Center(
                                                          child: Text('$row',
                                                              style: theme
                                                                  .textTheme
                                                                  .labelSmall)))
                                                else
                                                  Expanded(
                                                      child: Padding(
                                                          padding:
                                                              const EdgeInsets
                                                                  .all(2),
                                                          child: row <= 4 &&
                                                                  (column ==
                                                                          'C' ||
                                                                      column ==
                                                                          'F')
                                                              ? const SizedBox()
                                                              : _seat(
                                                                  context,
                                                                  row,
                                                                  column))),
                                            ])),
                                    ])),
                          )))),
        ]));
  }

  Widget _seat(BuildContext context, int row, String column) {
    final seat = '$row$column';
    final state = focusSeatState(widget.flightId, row, column,
        selectedSeat: widget.selectedSeat);
    final occupied = state == FocusSeatState.occupied;
    final selected = state == FocusSeatState.selected;
    final theme = Theme.of(context);
    return Semantics(
        button: true,
        selected: selected,
        enabled: !occupied,
        label: '座位 $seat，${occupied ? '已占' : selected ? '已选' : '可选'}',
        child: ExcludeSemantics(
            child: Material(
          color: selected
              ? theme.colorScheme.secondary
              : theme.colorScheme.onSurface
                  .withValues(alpha: occupied ? .04 : .10),
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
              side: BorderSide(
                  color: selected
                      ? theme.colorScheme.secondary
                      : theme.dividerColor)),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: occupied ? null : () => widget.onSelected(seat),
            child: Center(
                child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(seat,
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            decoration:
                                occupied ? TextDecoration.lineThrough : null,
                            color: selected
                                ? theme.colorScheme.onSecondary
                                : theme.colorScheme.onSurface
                                    .withValues(alpha: occupied ? .35 : .9))))),
          ),
        )));
  }
}

class _PhoneCabinControls extends StatelessWidget {
  const _PhoneCabinControls(
      {required this.seat,
      required this.task,
      required this.side,
      required this.onTaskChanged,
      required this.onContinue});
  final String seat;
  final FocusTask task;
  final bool side;
  final ValueChanged<FocusTask> onTaskChanged;
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final selector = DecoratedBox(
        decoration: BoxDecoration(
            border: Border.all(color: theme.dividerColor),
            borderRadius: BorderRadius.circular(10)),
        child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: DropdownButton<FocusTask>(
              value: task,
              isExpanded: true,
              underline: const SizedBox(),
              borderRadius: BorderRadius.circular(12),
              selectedItemBuilder: (_) => FocusTask.values
                  .map((item) => Align(
                      alignment: Alignment.centerLeft,
                      child: Text(item.description,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodyMedium)))
                  .toList(),
              items: FocusTask.values
                  .map((item) => DropdownMenuItem(
                      value: item,
                      child: Text(item.description,
                          style: theme.textTheme.bodyMedium)))
                  .toList(),
              onChanged: (value) {
                if (value != null) onTaskChanged(value);
              },
            )));
    final summary = Text('座位 $seat', style: theme.textTheme.titleMedium);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (side) ...[
        summary,
        const SizedBox(height: 8),
        Text('专注状态', style: theme.textTheme.labelSmall),
        const SizedBox(height: 6),
        selector
      ] else
        Row(children: [
          Expanded(child: summary),
          const SizedBox(width: 12),
          Expanded(flex: 2, child: selector)
        ]),
      const SizedBox(height: 10),
      FilledButton.icon(
          onPressed: onContinue,
          icon: const Icon(Icons.arrow_forward_rounded),
          label: const Text('查看登机牌'),
          style: FilledButton.styleFrom(minimumSize: const Size(0, 48))),
    ]);
  }
}

/// Result returned by the dedicated Cabin Map page after the user has chosen
/// both a seat and a focus context.
class FocusCabinSelection {
  const FocusCabinSelection({required this.seat, required this.task});

  final String seat;
  final FocusTask task;
}

/// Full-page seat selection flow. The seat map is intentionally a real page,
/// not a bottom sheet layered over the globe, so the tall aircraft can be
/// scrolled from nose to tail without competing gestures.
class FocusCabinMapPage extends StatefulWidget {
  const FocusCabinMapPage({
    required this.origin,
    required this.destination,
    required this.flightId,
    required this.initialSeat,
    required this.initialTask,
    super.key,
  });

  final FocusAirport origin;
  final FocusAirport destination;
  final String flightId;
  final String initialSeat;
  final FocusTask initialTask;

  @override
  State<FocusCabinMapPage> createState() => _FocusCabinMapPageState();
}

class _FocusCabinMapPageState extends State<FocusCabinMapPage> {
  late String _seat;
  late FocusTask _task;

  @override
  void initState() {
    super.initState();
    _seat = widget.initialSeat;
    _task = widget.initialTask;
  }

  void _finish() {
    FocusSeatState state;
    final row = int.tryParse(_seat.substring(0, _seat.length - 1));
    final column = _seat.substring(_seat.length - 1);
    if (row == null) return;
    state = focusSeatState(widget.flightId, row, column,
        selectedSeat: widget.initialSeat);
    if (state == FocusSeatState.occupied) return;
    Navigator.of(context).pop(
      FocusCabinSelection(seat: _seat, task: _task),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final foreground = theme.colorScheme.onSurface;
    final muted = foreground.withValues(alpha: .62);
    final phone = MediaQuery.sizeOf(context).shortestSide < 600;
    final landscape =
        MediaQuery.orientationOf(context) == Orientation.landscape;
    if (phone) {
      final map = FocusAircraftSeatMap(
          flightId: widget.flightId,
          selectedSeat: _seat,
          onSelected: (seat) => setState(() => _seat = seat));
      final controls = _PhoneCabinControls(
          seat: _seat,
          task: _task,
          side: landscape,
          onTaskChanged: (task) => setState(() => _task = task),
          onContinue: _finish);
      return Scaffold(
        appBar: AppBar(
          title: const Text('选择座位'),
          toolbarHeight: 48,
          leading: IconButton(
              tooltip: '返回目的地',
              onPressed: () => Navigator.of(context).maybePop(),
              icon: const Icon(Icons.arrow_back_rounded)),
          actions: [
            Padding(
                padding: const EdgeInsets.only(right: 16),
                child: Center(
                    child: Text(
                        '${widget.origin.id} → ${widget.destination.id}',
                        style: theme.textTheme.labelMedium)))
          ],
        ),
        body: SafeArea(
            top: false,
            child: landscape
                ? Padding(
                    padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
                    child: Row(children: [
                      Expanded(child: map),
                      const SizedBox(width: 12),
                      SizedBox(
                          width: 220,
                          child: SingleChildScrollView(child: controls)),
                    ]))
                : Column(children: [
                    Expanded(
                        child: Padding(
                            padding: const EdgeInsets.fromLTRB(12, 4, 12, 0),
                            child: map)),
                    Padding(padding: const EdgeInsets.all(12), child: controls),
                  ])),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('CABIN MAP'),
        centerTitle: true,
        leading: IconButton(
          tooltip: '返回目的地',
          onPressed: () => Navigator.of(context).maybePop(),
          icon: const Icon(Icons.arrow_back_rounded),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 18),
            child: Center(
              child: Text(
                '${widget.origin.id}  →  ${widget.destination.id}',
                style: TextStyle(
                  color: muted,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.1,
                ),
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 6, 24, 12),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('选择你的座位',
                            style: theme.textTheme.headlineSmall?.copyWith(
                              fontWeight: FontWeight.w800,
                            )),
                        const SizedBox(height: 3),
                        Text('沿飞机纵向滑动，选择一个未被占用的座位',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: muted,
                            )),
                      ],
                    ),
                  ),
                  _CabinRouteCode(
                    origin: widget.origin.id,
                    destination: widget.destination.id,
                  ),
                ],
              ),
            ),
            Expanded(
              child: FocusAircraftSeatMap(
                flightId: widget.flightId,
                selectedSeat: _seat,
                onSelected: (seat) => setState(() => _seat = seat),
              ),
            ),
            _CabinSelectionBar(
              seat: _seat,
              task: _task,
              onTaskChanged: (task) => setState(() => _task = task),
              onContinue: _finish,
            ),
          ],
        ),
      ),
    );
  }
}

class _CabinRouteCode extends StatelessWidget {
  const _CabinRouteCode({required this.origin, required this.destination});

  final String origin;
  final String destination;

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: BoxDecoration(
          border: Border.all(color: Theme.of(context).dividerColor),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
          child: Text('$origin  ·  $destination',
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                letterSpacing: 1.1,
              )),
        ),
      );
}

class _CabinSelectionBar extends StatelessWidget {
  const _CabinSelectionBar({
    required this.seat,
    required this.task,
    required this.onTaskChanged,
    required this.onContinue,
  });

  final String seat;
  final FocusTask task;
  final ValueChanged<FocusTask> onTaskChanged;
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      elevation: 18,
      color: theme.scaffoldBackgroundColor,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 12, 24, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text('座位 $seat',
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      )),
                  const SizedBox(width: 10),
                  Text('选择专注状态', style: theme.textTheme.bodySmall),
                ],
              ),
              const SizedBox(height: 8),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: FocusTask.values
                      .map(
                        (item) => Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ChoiceChip(
                            avatar: Icon(_cabinTaskIcon(item), size: 16),
                            label: Text(item.label),
                            selected: item == task,
                            onSelected: (_) => onTaskChanged(item),
                          ),
                        ),
                      )
                      .toList(growable: false),
                ),
              ),
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: onContinue,
                  icon: const Icon(Icons.arrow_forward_rounded),
                  label: const Text('确认座位与状态 · 查看登机牌'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

IconData _cabinTaskIcon(FocusTask task) => switch (task) {
      FocusTask.study => Icons.school_outlined,
      FocusTask.work => Icons.work_outline_rounded,
      FocusTask.read => Icons.menu_book_outlined,
      FocusTask.code => Icons.code_rounded,
      FocusTask.write => Icons.edit_note_rounded,
      FocusTask.research => Icons.travel_explore_rounded,
      FocusTask.create => Icons.auto_awesome_outlined,
      FocusTask.deepFocus => Icons.center_focus_strong_rounded,
    };

class _SeatLegend extends StatelessWidget {
  const _SeatLegend({required this.darkSurface});

  final bool darkSurface;

  @override
  Widget build(BuildContext context) {
    final foreground =
        darkSurface ? const Color(0xFFE8E9E7) : const Color(0xFF24272B);
    final muted =
        darkSurface ? const Color(0xFF8C9299) : const Color(0xFF747A80);
    final border =
        darkSurface ? const Color(0xFF383B41) : const Color(0xFFD1D5D8);
    return Container(
      width: 132,
      padding: const EdgeInsets.fromLTRB(12, 11, 12, 10),
      decoration: BoxDecoration(
        color: (darkSurface ? const Color(0xFF111216) : Colors.white)
            .withValues(alpha: .92),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: darkSurface ? .20 : .08),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'SEAT STATUS',
            style: TextStyle(
              color: muted,
              fontSize: 9,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.35,
            ),
          ),
          const SizedBox(height: 8),
          _SeatLegendRow(
            label: '可选',
            fill:
                darkSurface ? const Color(0xFF303237) : const Color(0xFFD8DBDE),
            border: border,
            foreground: foreground,
          ),
          const SizedBox(height: 6),
          _SeatLegendRow(
            label: '已选',
            fill: foreground,
            border: foreground,
            foreground: darkSurface ? const Color(0xFF151619) : Colors.white,
            labelColor: foreground,
            check: true,
          ),
          const SizedBox(height: 6),
          _SeatLegendRow(
            label: '已占',
            fill:
                darkSurface ? const Color(0xFF55575D) : const Color(0xFFB7BCC0),
            border: border,
            foreground: foreground,
            cross: true,
          ),
          const SizedBox(height: 6),
          _SeatLegendRow(
            label: '不可选',
            fill: Colors.transparent,
            border: border,
            foreground: muted,
            disabled: true,
          ),
        ],
      ),
    );
  }
}

class _SeatLegendRow extends StatelessWidget {
  const _SeatLegendRow({
    required this.label,
    required this.fill,
    required this.border,
    required this.foreground,
    this.labelColor,
    this.check = false,
    this.cross = false,
    this.disabled = false,
  });

  final String label;
  final Color fill;
  final Color border;
  final Color foreground;
  final Color? labelColor;
  final bool check;
  final bool cross;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        SizedBox(
          width: 25,
          height: 18,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: fill,
              borderRadius: BorderRadius.circular(5),
              border: Border.all(color: border.withValues(alpha: .72)),
            ),
            child: CustomPaint(
              painter: _SeatLegendMarkPainter(
                color: foreground,
                check: check,
                cross: cross,
                disabled: disabled,
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          label,
          style: TextStyle(
            color: disabled
                ? (labelColor ?? foreground).withValues(alpha: .72)
                : (labelColor ?? foreground),
            fontSize: 10,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _SeatLegendMarkPainter extends CustomPainter {
  const _SeatLegendMarkPainter({
    required this.color,
    required this.check,
    required this.cross,
    required this.disabled,
  });

  final Color color;
  final bool check;
  final bool cross;
  final bool disabled;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color.withValues(alpha: disabled ? .30 : .82)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2
      ..strokeCap = StrokeCap.round;
    if (check) {
      canvas.drawLine(const Offset(7, 9), const Offset(11, 12), paint);
      canvas.drawLine(const Offset(11, 12), const Offset(18, 5), paint);
    } else if (cross) {
      canvas.drawLine(const Offset(7, 5), const Offset(18, 13), paint);
      canvas.drawLine(const Offset(18, 5), const Offset(7, 13), paint);
    } else if (disabled) {
      canvas.drawLine(const Offset(5, 9), const Offset(20, 9), paint);
    }
  }

  @override
  bool shouldRepaint(covariant _SeatLegendMarkPainter oldDelegate) =>
      oldDelegate.color != color ||
      oldDelegate.check != check ||
      oldDelegate.cross != cross ||
      oldDelegate.disabled != disabled;
}

class FocusSeatMapPainter extends CustomPainter {
  const FocusSeatMapPainter({
    required this.flightId,
    required this.selectedSeat,
    required this.darkSurface,
  });

  final String flightId;
  final String selectedSeat;
  final bool darkSurface;

  static const _columns = <String>['A', 'B', 'C', 'D', 'E', 'F'];
  // The reference is a tall 2:1 planform. Rows are deliberately spaced out
  // so the cabin reads like a real aircraft instead of a compressed grid.
  static const _rowTop = 236.0;
  static const _rowHeight = 43.0;
  static const _seatHeight = 30.0;

  static double _bodyLeftFraction(double y, double height, double width) {
    final cabinHalf = width < 480 ? .225 : .19;
    if (y <= 210) {
      return _lerp(.5, cabinHalf, (y / 210).clamp(0.0, 1.0));
    }
    if (y <= height * .82) {
      return cabinHalf;
    }
    // The rear cone narrows continuously; the tailplane stays outside the
    // fuselage and is never used as extra cabin width.
    return _lerp(cabinHalf, .115,
        ((y - height * .82) / math.max(1, height * .18)).clamp(0.0, 1.0));
  }

  static double _lerp(double a, double b, double t) => a + (b - a) * t;

  static _SeatLayout _layout(Size size, int row) {
    final y = _rowTop + (row - 1) * _rowHeight;
    // The silhouette uses a half-width measured from the aircraft centre.
    // Convert it to a left-edge coordinate before laying out the seats.
    final bodyLeft =
        size.width * (.5 - _bodyLeftFraction(y, size.height, size.width));
    final bodyRight = size.width - bodyLeft;
    // Keep a visible breathing margin between every seat shell and the
    // aircraft skin. This is also the same inset used by the paint clip.
    const edgePadding = 24.0;
    final innerLeft = bodyLeft + edgePadding;
    final innerRight = bodyRight - edgePadding;
    final availableWidth = math.max(0.0, innerRight - innerLeft);
    final compactFront = row <= 4;
    final gap = math.min(9.0, size.width * 0.014);
    final aisle = math.max(28.0, size.width * 0.045);
    final seatCount = compactFront ? 4 : 6;
    final gapCount = compactFront ? 2 : 4;
    final maxSeatWidth = compactFront ? 38.0 : 31.0;
    final seatWidth = ((availableWidth - aisle - gap * gapCount) / seatCount)
        .clamp(13.0, math.min(maxSeatWidth, size.width * 0.06))
        .toDouble();
    final seatsPerSide = compactFront ? 2 : 3;
    final groupWidth = seatWidth * seatsPerSide + gap * (seatsPerSide - 1);
    final totalWidth = groupWidth * 2 + aisle;
    final left = math.max(innerLeft, (size.width - totalWidth) / 2);
    return _SeatLayout(
      seatWidth: seatWidth,
      gap: gap,
      left: left,
      right: left + groupWidth + aisle,
    );
  }

  static Rect _seatRect(Size size, int row, int index) {
    final layout = _layout(size, row);
    if (row <= 4 && (index == 2 || index == 5)) return Rect.zero;
    final sideIndex = row <= 4
        ? (index < 2 ? index : index - 3)
        : (index < 3 ? index : index - 3);
    final x = index < (row <= 4 ? 2 : 3)
        ? layout.left + sideIndex * (layout.seatWidth + layout.gap)
        : layout.right + sideIndex * (layout.seatWidth + layout.gap);
    final y = _rowTop + (row - 1) * _rowHeight;
    return Rect.fromLTWH(x, y, layout.seatWidth, _seatHeight);
  }

  static String? seatAt(Offset point, Size size) {
    for (var row = 1; row <= focusSeatRows; row++) {
      for (var index = 0; index < _columns.length; index++) {
        if (_seatRect(size, row, index).contains(point)) {
          return '$row${_columns[index]}';
        }
      }
    }
    return null;
  }

  @override
  void paint(Canvas canvas, Size size) {
    final surface =
        darkSurface ? const Color(0xFF0E0F12) : const Color(0xFFF0F1F2);
    final outline =
        darkSurface ? const Color(0xFF555861) : const Color(0xFFB7BCC1);
    final primary =
        darkSurface ? const Color(0xFFECEDEB) : const Color(0xFF1F2226);
    final muted =
        darkSurface ? const Color(0xFFA2A6AD) : const Color(0xFF72787F);
    canvas.drawRect(Offset.zero & size, Paint()..color = surface);

    // 先画外部组件，再盖上中央 fuselage。主翼、发动机与尾翼的根部会
    // 自然藏在机身下，视觉上是一架完整飞机，而不是漂浮的几块图形。
    _drawWingPanel(canvas, size, darkSurface, outline);
    _drawEngineNacelles(canvas, size, darkSurface, outline);
    _drawTailAssembly(canvas, size, darkSurface, outline);

    final plane = _aircraftSilhouette(size);
    canvas.drawPath(
      plane,
      Paint()
        ..color =
            darkSurface ? const Color(0xFF202126) : const Color(0xFFE1E4E6),
    );
    canvas.drawPath(
      plane,
      Paint()
        ..color = outline.withValues(alpha: 0.72)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.4,
    );

    _drawCockpit(canvas, size, darkSurface);
    _drawFuselageRails(canvas, size, darkSurface, outline);
    _drawCabinFixtures(canvas, size, darkSurface, outline);

    // A hard clip is the final guardrail: even if a future seat preset is
    // wider than expected, no seat or label can paint through the fuselage.
    canvas.save();
    canvas.clipPath(plane);
    _drawColumnLabels(canvas, size, muted);

    for (var row = 1; row <= focusSeatRows; row++) {
      final y = _rowTop + (row - 1) * _rowHeight;
      _paintText(
        canvas,
        row.toString().padLeft(2, '0'),
        Offset(size.width / 2 - 11, y + 4),
        TextStyle(
          color: muted,
          fontSize: 10,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      );
      for (var index = 0; index < _columns.length; index++) {
        final seat = '$row${_columns[index]}';
        final seatBounds = _seatRect(size, row, index);
        if (seatBounds.isEmpty) continue;
        final state = focusSeatState(
          flightId,
          row,
          _columns[index],
          selectedSeat: selectedSeat,
        );
        final selected = state == FocusSeatState.selected;
        final occupied = state == FocusSeatState.occupied;
        final fill = selected
            ? primary
            : occupied
                ? (darkSurface
                    ? const Color(0xFF55575D)
                    : const Color(0xFFB7BCC0))
                : (darkSurface
                    ? const Color(0xFF303237)
                    : const Color(0xFFD8DBDE));
        final rect = RRect.fromRectAndRadius(
          seatBounds,
          const Radius.circular(8),
        );
        canvas.drawRRect(rect, Paint()..color = fill);
        canvas.drawRRect(
          rect,
          Paint()
            ..color = selected ? primary : outline.withValues(alpha: 0.36)
            ..style = PaintingStyle.stroke
            ..strokeWidth = selected ? 1.6 : 0.7,
        );
        if (selected) {
          _paintText(
            canvas,
            seat,
            Offset(rect.left + rect.width * 0.22, rect.top + 4),
            TextStyle(
              color: darkSurface ? const Color(0xFF151619) : Colors.white,
              fontSize: 9,
              fontWeight: FontWeight.w800,
            ),
          );
        }
      }
    }
    canvas.restore();
    // The dorsal fin belongs above the fuselage, not behind its opaque fill.
    _drawVerticalTail(canvas, size, darkSurface, outline);

    _paintText(
      canvas,
      'FRONT',
      Offset(size.width / 2 - 18, 38),
      TextStyle(color: muted, fontSize: 10, letterSpacing: 1.8),
    );
    _paintText(
      canvas,
      'EXIT',
      Offset(size.width * .24 - 12, _rowTop + 9.5 * _rowHeight),
      TextStyle(
          color: muted.withValues(alpha: 0.72),
          fontSize: 9,
          letterSpacing: 1.4),
    );
    _paintText(
      canvas,
      'TAIL',
      Offset(size.width / 2 - 13, size.height - 26),
      TextStyle(color: muted, fontSize: 10, letterSpacing: 1.8),
    );
  }

  /// Top-down airliner silhouette. Keep the fuselage as its own clean
  /// centerline body; the main wing and horizontal tail are drawn as separate
  /// exterior assemblies below. This prevents the seat rows from becoming
  /// part of a fish-shaped outer polygon.
  Path _aircraftSilhouette(Size size) {
    final center = size.width / 2;
    // Match the seat geometry while keeping the fuselage narrow like the
    // reference: a long center body, broad wings, and a clean rear cone.
    final fuselage = size.width * (size.width < 480 ? .225 : .19);
    final cabinEnd = size.height * .82;
    final outerPlanform = Path()
      ..moveTo(center, 14)
      ..cubicTo(center - size.width * .075, 22, center - fuselage * .88, 74,
          center - fuselage, 188)
      ..cubicTo(center - fuselage * 1.02, size.height * .28, center - fuselage,
          size.height * .58, center - fuselage * .98, cabinEnd)
      ..cubicTo(
          center - fuselage * .97,
          size.height * .875,
          center - fuselage * .5,
          size.height - 118,
          center - fuselage * .22,
          size.height - 92)
      ..quadraticBezierTo(center - fuselage * .14, size.height - 75,
          center - fuselage * .14, size.height - 62)
      ..cubicTo(center - fuselage * .14, size.height - 47,
          center - fuselage * .07, size.height - 40, center, size.height - 40)
      ..cubicTo(
          center + fuselage * .07,
          size.height - 40,
          center + fuselage * .14,
          size.height - 47,
          center + fuselage * .14,
          size.height - 62)
      ..quadraticBezierTo(center + fuselage * .14, size.height - 75,
          center + fuselage * .22, size.height - 92)
      ..cubicTo(
          center + fuselage * .5,
          size.height - 118,
          center + fuselage * .97,
          size.height * .875,
          center + fuselage * .98,
          cabinEnd)
      ..cubicTo(center + fuselage, size.height * .58, center + fuselage * 1.02,
          size.height * .28, center + fuselage, 188)
      ..cubicTo(center + fuselage * .88, 74, center + size.width * .075, 22,
          center, 14)
      ..close();
    return outerPlanform;
  }

  void _drawCockpit(Canvas canvas, Size size, bool dark) {
    final center = size.width / 2;
    final windshield = Paint()
      ..color = dark ? const Color(0xFF090A0D) : const Color(0xFF7D858B);
    final windshieldEdge = Paint()
      ..color = dark ? const Color(0xFF555A63) : const Color(0xFFB8BEC2)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.9;
    final glass = Path()
      // A pointed windshield band follows the nose instead of using a flat
      // trapezoid, matching the reference airliner top view.
      ..moveTo(size.width * .365, 98)
      ..quadraticBezierTo(center, 49, size.width * .635, 98)
      ..lineTo(size.width * .615, 133)
      ..quadraticBezierTo(center, 119, size.width * .385, 133)
      ..close();
    canvas
      ..drawPath(glass, windshield)
      ..drawPath(glass, windshieldEdge);
    final mullion = Paint()
      ..color = dark ? const Color(0xFF3B3F46) : const Color(0xFFB0B6BA)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.8;
    canvas.drawLine(
      Offset(center, 63),
      Offset(center, 128),
      mullion,
    );
    canvas.drawLine(
      Offset(size.width * .445, 76),
      Offset(size.width * .435, 129),
      mullion,
    );
    canvas.drawLine(
      Offset(size.width * .555, 76),
      Offset(size.width * .565, 129),
      mullion,
    );
    canvas.drawLine(
      Offset(center - size.width * .10, 139),
      Offset(center + size.width * .10, 139),
      Paint()
        ..color = dark ? const Color(0xFF555A63) : const Color(0xFFB8BEC2)
        ..strokeWidth = 0.8,
    );
  }

  void _drawWingPanel(Canvas canvas, Size size, bool dark, Color outline) {
    final wing = Paint()
      ..color = dark ? const Color(0xFF27292E) : const Color(0xFFD5D9DC);
    // Wide swept wing — reference planform: a long swept main wing with
    // rounded clipped tips. It is deliberately separate from the narrow
    // fuselage so the aircraft never becomes a fat fish-shaped silhouette.
    final attachY = size.height * .375;
    final tipY = size.height * .545;
    final rearY = size.height * .61;
    final left = Path()
      ..moveTo(size.width * .39, attachY)
      ..cubicTo(size.width * .30, attachY + size.height * .035,
          size.width * .12, tipY - size.height * .07, size.width * -.035, tipY)
      ..quadraticBezierTo(size.width * -.075, tipY + size.height * .025,
          size.width * -.025, tipY + size.height * .07)
      ..lineTo(size.width * .13, rearY)
      ..cubicTo(
          size.width * .25,
          rearY - size.height * .035,
          size.width * .34,
          tipY + size.height * .01,
          size.width * .405,
          attachY + size.height * .11)
      ..quadraticBezierTo(size.width * .42, attachY + size.height * .045,
          size.width * .39, attachY)
      ..close();
    final right = Path()
      ..moveTo(size.width * .61, attachY)
      ..cubicTo(size.width * .70, attachY + size.height * .035,
          size.width * .88, tipY - size.height * .07, size.width * 1.035, tipY)
      ..quadraticBezierTo(size.width * 1.075, tipY + size.height * .025,
          size.width * 1.025, tipY + size.height * .07)
      ..lineTo(size.width * .87, rearY)
      ..cubicTo(
          size.width * .75,
          rearY - size.height * .035,
          size.width * .66,
          tipY + size.height * .01,
          size.width * .595,
          attachY + size.height * .11)
      ..quadraticBezierTo(size.width * .58, attachY + size.height * .045,
          size.width * .61, attachY)
      ..close();
    final wingOutline = Paint()
      ..color = outline.withValues(alpha: 0.72)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.4;
    canvas
      ..drawPath(left, wing)
      ..drawPath(right, wing)
      ..drawPath(left, wingOutline)
      ..drawPath(right, wingOutline);

    final panelLine = Paint()
      ..color = outline.withValues(alpha: 0.42)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.8;
    canvas
      ..drawLine(Offset(size.width * .385, attachY + size.height * .025),
          Offset(size.width * -.018, tipY + size.height * .04), panelLine)
      ..drawLine(Offset(size.width * .615, attachY + size.height * .025),
          Offset(size.width * 1.018, tipY + size.height * .04), panelLine)
      ..drawLine(Offset(size.width * .285, tipY - size.height * .03),
          Offset(size.width * .080, rearY - size.height * .02), panelLine)
      ..drawLine(Offset(size.width * .715, tipY - size.height * .03),
          Offset(size.width * .920, rearY - size.height * .02), panelLine);

    // A narrow dark flap break makes the wing feel like a real airliner
    // surface instead of one flat triangular polygon.
    final flapLine = Paint()
      ..color = outline.withValues(alpha: 0.26)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0;
    canvas
      ..drawLine(Offset(size.width * .355, attachY + size.height * .10),
          Offset(size.width * .12, rearY - size.height * .015), flapLine)
      ..drawLine(Offset(size.width * .645, attachY + size.height * .10),
          Offset(size.width * .88, rearY - size.height * .015), flapLine);
  }

  void _drawEngineNacelles(Canvas canvas, Size size, bool dark, Color outline) {
    final centerY = size.height * .455;
    final engineLength = size.height * .105;
    final engineHalfWidth = size.width * .035;
    final engineFill = Paint()
      ..color = dark ? const Color(0xFF181A1E) : const Color(0xFFC2C7CB);
    final engineEdge = Paint()
      ..color = outline.withValues(alpha: 0.68)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.1;

    void drawEngine(double centerX) {
      // Rounded nacelles sit outside the fuselage and follow the wing sweep.
      final nacelle = Path()
        ..moveTo(centerX, centerY - engineLength)
        ..cubicTo(
            centerX + engineHalfWidth * .78,
            centerY - engineLength * .96,
            centerX + engineHalfWidth * 1.15,
            centerY - engineLength * .68,
            centerX + engineHalfWidth * 1.1,
            centerY - engineLength * .2)
        ..lineTo(centerX + engineHalfWidth * .82, centerY + engineLength * .72)
        ..quadraticBezierTo(centerX, centerY + engineLength * .92,
            centerX - engineHalfWidth * .82, centerY + engineLength * .72)
        ..lineTo(centerX - engineHalfWidth * 1.1, centerY - engineLength * .2)
        ..cubicTo(
            centerX - engineHalfWidth * 1.15,
            centerY - engineLength * .68,
            centerX - engineHalfWidth * .78,
            centerY - engineLength * .96,
            centerX,
            centerY - engineLength)
        ..close();
      canvas
        ..drawPath(nacelle, engineFill)
        ..drawPath(nacelle, engineEdge);

      final intake = Path()
        ..moveTo(centerX, centerY - engineLength * .82)
        ..cubicTo(
            centerX + engineHalfWidth * .68,
            centerY - engineLength * .78,
            centerX + engineHalfWidth * .78,
            centerY - engineLength * .56,
            centerX + engineHalfWidth * .6,
            centerY - engineLength * .38)
        ..quadraticBezierTo(centerX, centerY - engineLength * .24,
            centerX - engineHalfWidth * .6, centerY - engineLength * .38)
        ..cubicTo(
            centerX - engineHalfWidth * .78,
            centerY - engineLength * .56,
            centerX - engineHalfWidth * .68,
            centerY - engineLength * .78,
            centerX,
            centerY - engineLength * .82)
        ..close();
      canvas.drawPath(
        intake,
        Paint()
          ..color = dark ? const Color(0xFF08090B) : const Color(0xFF8D949A),
      );
      canvas.drawLine(
        Offset(centerX, centerY - engineLength * .22),
        Offset(centerX, centerY + engineLength * .7),
        Paint()..color = outline.withValues(alpha: 0.34),
      );
    }

    drawEngine(size.width * .145);
    drawEngine(size.width * .855);
  }

  void _drawFuselageRails(Canvas canvas, Size size, bool dark, Color outline) {
    final center = size.width / 2;
    final cabinEnd = size.height * .82;
    final rail = Paint()
      ..color = outline.withValues(alpha: dark ? 0.28 : 0.58)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.8;
    final left = Path()
      ..moveTo(center - size.width * .15, 190)
      ..cubicTo(
          center - size.width * .18,
          size.height * .30,
          center - size.width * .18,
          size.height * .67,
          center - size.width * .125,
          cabinEnd);
    final right = Path()
      ..moveTo(center + size.width * .15, 190)
      ..cubicTo(
          center + size.width * .18,
          size.height * .30,
          center + size.width * .18,
          size.height * .67,
          center + size.width * .125,
          cabinEnd);
    canvas
      ..drawPath(left, rail)
      ..drawPath(right, rail);
  }

  void _drawCabinFixtures(Canvas canvas, Size size, bool dark, Color outline) {
    final center = size.width / 2;
    final fill = dark ? const Color(0xFF15171B) : const Color(0xFFD9DDE0);
    final edge = outline.withValues(alpha: .5);

    void drawFixture(double x, double y, double width, IconData icon) {
      final rect = RRect.fromRectAndRadius(
        Rect.fromCenter(
          center: Offset(x, y),
          width: width,
          height: 54,
        ),
        const Radius.circular(6),
      );
      canvas
        ..drawRRect(rect, Paint()..color = fill)
        ..drawRRect(
          rect,
          Paint()
            ..color = edge
            ..style = PaintingStyle.stroke
            ..strokeWidth = .8,
        );
      // A small, low-contrast service marker keeps the top-down cabin rhythm
      // close to the reference without turning the plan into a dashboard.
      final glyph = TextPainter(
        text: TextSpan(
          text: String.fromCharCode(icon.codePoint),
          style: TextStyle(
            fontFamily: icon.fontFamily,
            package: icon.fontPackage,
            color: dark ? const Color(0xFFA2A6AD) : const Color(0xFF72787F),
            fontSize: 18,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      glyph.paint(canvas, Offset(x - glyph.width / 2, y - glyph.height / 2));
    }

    drawFixture(
        center - size.width * .095, 190, size.width * .12, Icons.wc_outlined);
    drawFixture(center + size.width * .095, 190, size.width * .12,
        Icons.local_cafe_outlined);
    drawFixture(
        center,
        _rowTop + (focusSeatRows - 1) * _rowHeight + _seatHeight + 42,
        size.width * .16,
        Icons.local_cafe_outlined);
  }

  void _drawTailAssembly(Canvas canvas, Size size, bool dark, Color outline) {
    final center = size.width / 2;
    final fill = Paint()
      ..color = dark ? const Color(0xFF27292E) : const Color(0xFFD5D9DC);
    final edge = Paint()
      ..color = outline.withValues(alpha: .72)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.4;
    // A swept, tapered stabilizer has a broad root and a short straight tip.
    // Both roots extend under the fuselage so no detached seam is visible.
    for (final side in [-1, 1]) {
      double x(double fraction) => center + side * size.width * fraction;
      final tailPlane = Path()
        ..moveTo(x(.07), size.height - 235)
        ..lineTo(x(.31), size.height - 132)
        ..quadraticBezierTo(
            x(.318), size.height - 128, x(.315), size.height - 119)
        ..lineTo(x(.309), size.height - 99)
        ..quadraticBezierTo(
            x(.304), size.height - 94, x(.292), size.height - 98)
        ..lineTo(x(.07), size.height - 160)
        ..close();
      canvas
        ..drawPath(tailPlane, fill)
        ..drawPath(tailPlane, edge)
        ..drawLine(
            Offset(x(.10), size.height - 167),
            Offset(x(.295), size.height - 108),
            Paint()
              ..color = outline.withValues(alpha: .45)
              ..strokeWidth = .8);
    }
  }

  void _drawVerticalTail(Canvas canvas, Size size, bool dark, Color outline) {
    final center = size.width / 2;
    // In plan view the vertical fin reads as a slim dorsal keel. Its height
    // must not become a second pair of wide, horizontal tail wings.
    final fin = Path()
      ..moveTo(center, size.height - 254)
      ..quadraticBezierTo(center - size.width * .018, size.height - 228,
          center - size.width * .025, size.height - 196)
      ..lineTo(center - size.width * .012, size.height - 90)
      ..quadraticBezierTo(center - size.width * .008, size.height - 72, center,
          size.height - 70)
      ..quadraticBezierTo(center + size.width * .008, size.height - 72,
          center + size.width * .012, size.height - 90)
      ..lineTo(center + size.width * .025, size.height - 196)
      ..quadraticBezierTo(center + size.width * .018, size.height - 228, center,
          size.height - 254)
      ..close();
    canvas
      ..drawPath(
          fin,
          Paint()
            ..color = dark ? const Color(0xFF555B64) : const Color(0xFFA7AFB6))
      ..drawPath(
          fin,
          Paint()
            ..color = outline.withValues(alpha: .8)
            ..style = PaintingStyle.stroke
            ..strokeWidth = 1)
      ..drawLine(
          Offset(center, size.height - 196),
          Offset(center, size.height - 80),
          Paint()
            ..color = dark ? const Color(0xFF929AA4) : const Color(0xFF78838C)
            ..strokeWidth = .9);
  }

  void _drawColumnLabels(Canvas canvas, Size size, Color color) {
    for (var index = 0; index < _columns.length; index++) {
      final rect = _seatRect(size, 1, index);
      if (rect.isEmpty) continue;
      _paintText(
        canvas,
        _columns[index],
        Offset(rect.left + rect.width / 2 - 4, 205),
        TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 1.3,
        ),
      );
    }
    // 在极窄屏幕上也保留中央过道的呼吸感，避免座位挤成一条带。
    canvas.drawLine(
      Offset(size.width / 2, 150),
      Offset(size.width / 2, _rowTop - 14),
      Paint()..color = color.withValues(alpha: 0.22),
    );
  }

  void _paintText(Canvas canvas, String text, Offset offset, TextStyle style) {
    final painter = TextPainter(
      text: TextSpan(text: text, style: style),
      textDirection: TextDirection.ltr,
    )..layout();
    painter.paint(canvas, offset);
  }

  @override
  bool shouldRepaint(covariant FocusSeatMapPainter oldDelegate) =>
      oldDelegate.flightId != flightId ||
      oldDelegate.selectedSeat != selectedSeat ||
      oldDelegate.darkSurface != darkSurface;
}

class _SeatLayout {
  const _SeatLayout({
    required this.seatWidth,
    required this.gap,
    required this.left,
    required this.right,
  });

  final double seatWidth;
  final double gap;
  final double left;
  final double right;
}
