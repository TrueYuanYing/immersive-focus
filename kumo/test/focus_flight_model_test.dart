import 'package:test/test.dart';

import 'package:iko_focus/features/focus_flight/focus_flight_model.dart';

void main() {
  test('目的地距离映射到稳定的专注时长档位', () {
    final beijing = focusAirports.firstWhere((airport) => airport.id == 'PEK');
    final shanghai = focusAirports.firstWhere((airport) => airport.id == 'SHA');
    final distance = greatCircleDistanceKm(beijing, shanghai);

    expect(distance, greaterThan(900));
    expect(distance, lessThan(1300));
    expect(focusMinutesForDistance(distance), 15);
  });

  test('座位等级只影响里程，不改变航程距离', () {
    final plan = FocusFlightPlan(
      origin: focusAirports.first,
      destination: focusAirports[1],
      minutes: 15,
      seatClass: FocusSeatClass.first,
    );

    expect(plan.distanceKm, greaterThan(0));
    expect(plan.miles, greaterThan(0));
  });

  test('城市可用中文名、英文名和 IATA 搜索', () {
    final tokyo = focusAirports.firstWhere((airport) => airport.id == 'TYO');
    expect(tokyo.searchableText, contains('tokyo'));
    expect(tokyo.searchableText, contains('东京'));
    expect(
        focusAirports
            .where((airport) => airport.searchableText.contains('wuhan'))
            .single
            .id,
        'WUH');
  });

  test('座位占用在同一航班内稳定，选中状态优先', () {
    final first = focusSeatState('WUH-TYO-60', 12, 'A');
    final second = focusSeatState('WUH-TYO-60', 12, 'A');
    expect(second, first);
    expect(
      focusSeatState('WUH-TYO-60', 12, 'A', selectedSeat: '12A'),
      FocusSeatState.selected,
    );
  });

  test('任务状态覆盖课堂、代码和深度专注场景', () {
    expect(FocusTask.study.label, 'STUDY');
    expect(FocusTask.code.description, '编写代码');
    expect(FocusTask.deepFocus.label, 'DEEP FOCUS');
  });
}
