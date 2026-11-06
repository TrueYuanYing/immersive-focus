import 'dart:math' as math;

import 'package:test/test.dart';

import 'package:iko_focus/features/focus_flight/flight_runtime.dart';
import 'package:iko_focus/features/focus_flight/focus_flight_model.dart';

void main() {
  final beijing = focusAirports.firstWhere((airport) => airport.id == 'PEK');
  final london = focusAirports.firstWhere((airport) => airport.id == 'LHR');

  test('中途结束只从固定的无厘头退出结果中选择，不会冒充已到达', () {
    final results = <FocusFlightExitKind>{};
    for (var seed = 0; seed < 12; seed++) {
      final result = chooseFocusFlightExitOutcome(random: math.Random(seed));
      results.add(result.kind);
      expect(result.kind, isNot(FocusFlightExitKind.arrived));
      expect(result.label, isNotEmpty);
      expect(result.iconName, isNotEmpty);
    }

    expect(results, contains(FocusFlightExitKind.parachuted));
    expect(results, contains(FocusFlightExitKind.cabinCrewEjected));
  });

  test('阶段按进度稳定压缩，完成时进入 ARRIVAL', () {
    expect(FocusFlightClock.phaseForProgress(0), FocusFlightPhase.boarding);
    expect(FocusFlightClock.phaseForProgress(0.01), FocusFlightPhase.taxi);
    expect(FocusFlightClock.phaseForProgress(0.04), FocusFlightPhase.takeoff);
    expect(FocusFlightClock.phaseForProgress(0.5), FocusFlightPhase.cruise);
    expect(FocusFlightClock.phaseForProgress(0.9), FocusFlightPhase.descent);
    expect(FocusFlightClock.phaseForProgress(1), FocusFlightPhase.arrived);
  });

  test('后台恢复使用真实时间，elapsed 不会被 ticker 暂停影响', () {
    final startedAt = DateTime(2026, 8, 31, 10);
    final clock = FocusFlightClock(
      startedAt: startedAt,
      duration: const Duration(minutes: 25),
    );

    expect(clock.elapsedAt(startedAt.add(const Duration(minutes: 7))),
        const Duration(minutes: 7));
    expect(clock.progressAt(startedAt.add(const Duration(minutes: 30))), 1);
  });

  test('great-circle 中点位于球面航线上，heading 可计算', () {
    final route = FocusGreatCircleRoute(beijing, london);
    final middle = route.pointAt(0.5);
    expect(middle.latitude, inInclusiveRange(40, 65));
    expect(middle.longitude, inInclusiveRange(20, 85));
    expect(route.headingAt(0), inInclusiveRange(250, 360));
    expect(route.pointAt(0).latitude, closeTo(beijing.latitude, 0.0001));
    expect(route.pointAt(1).longitude, closeTo(london.longitude, 0.0001));
  });
}
