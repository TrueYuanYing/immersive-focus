import 'dart:math' as math;

import 'focus_flight_model.dart';

/// Flight 的生命周期阶段。阶段由真实 elapsed/progress 推导，不由 UI timer 累加。
enum FocusFlightPhase {
  boarding,
  taxi,
  takeoff,
  climb,
  cruise,
  descent,
  landing,
  arrived,
}

extension FocusFlightPhaseCopy on FocusFlightPhase {
  String get label => switch (this) {
        FocusFlightPhase.boarding => 'BOARDING',
        FocusFlightPhase.taxi => 'TAXI',
        FocusFlightPhase.takeoff => 'TAKE OFF',
        FocusFlightPhase.climb => 'CLIMB',
        FocusFlightPhase.cruise => 'CRUISE',
        FocusFlightPhase.descent => 'DESCENT',
        FocusFlightPhase.landing => 'LANDING',
        FocusFlightPhase.arrived => 'ARRIVAL',
  };
}

/// 结束专注航班时的业务结果。`arrived` 只允许由完整飞行触发，不能被
/// 用户中途点击结束复用，否则落地页会把提前结束误报成已到达。
enum FocusFlightExitKind { arrived, parachuted, cabinCrewEjected }

class FocusFlightExitOutcome {
  const FocusFlightExitOutcome({
    required this.kind,
    required this.label,
    required this.detail,
    required this.iconName,
  });

  final FocusFlightExitKind kind;
  final String label;
  final String detail;
  /// UI 层根据这个稳定 key 映射 Material `IconData`，模型层不依赖 Flutter。
  final String iconName;
}

const focusFlightArrivalOutcome = FocusFlightExitOutcome(
  kind: FocusFlightExitKind.arrived,
  label: '已到达',
  detail: '航班已平稳抵达目的地',
  iconName: 'flight_land',
);

const focusFlightMidFlightOutcomes = <FocusFlightExitOutcome>[
  FocusFlightExitOutcome(
    kind: FocusFlightExitKind.parachuted,
    label: '中途跳伞',
    detail: '你把这段专注交给了风，安全落地后再继续吧',
    iconName: 'paragliding',
  ),
  FocusFlightExitOutcome(
    kind: FocusFlightExitKind.cabinCrewEjected,
    label: '被空姐踹下去了',
    detail: '乘务组认为你今天需要提前下机冷静一下',
    iconName: 'exit_to_app',
  ),
];

FocusFlightExitOutcome chooseFocusFlightExitOutcome({math.Random? random}) {
  final source = random ?? math.Random();
  return focusFlightMidFlightOutcomes[
      source.nextInt(focusFlightMidFlightOutcomes.length)];
}

/// 基于开始时刻和计划时长的单调进度快照。
///
/// `now` 可在测试中注入，所以后台恢复时只要重新取当前时间即可，不会
/// 因为 Flutter ticker 暂停而产生累计漂移。
class FocusFlightClock {
  const FocusFlightClock({required this.startedAt, required this.duration});

  final DateTime startedAt;
  final Duration duration;

  Duration elapsedAt(DateTime now) {
    final raw = now.difference(startedAt);
    if (raw.isNegative) return Duration.zero;
    if (raw > duration) return duration;
    return raw;
  }

  double progressAt(DateTime now) {
    if (duration.inMicroseconds <= 0) return 1;
    return (elapsedAt(now).inMicroseconds / duration.inMicroseconds)
        .clamp(0.0, 1.0);
  }

  FocusFlightPhase phaseAt(DateTime now) => phaseForProgress(progressAt(now));

  static FocusFlightPhase phaseForProgress(double value) {
    final progress = value.clamp(0.0, 1.0);
    if (progress >= 1) return FocusFlightPhase.arrived;
    if (progress < 0.005) return FocusFlightPhase.boarding;
    if (progress < 0.02) return FocusFlightPhase.taxi;
    if (progress < 0.05) return FocusFlightPhase.takeoff;
    if (progress < 0.12) return FocusFlightPhase.climb;
    if (progress < 0.82) return FocusFlightPhase.cruise;
    if (progress < 0.95) return FocusFlightPhase.descent;
    return FocusFlightPhase.landing;
  }
}

/// Great-circle 路线的归一化采样点。
class FocusRoutePoint {
  const FocusRoutePoint({required this.latitude, required this.longitude});

  final double latitude;
  final double longitude;
}

/// 在球面上对机场坐标做 slerp，避免长距离航班使用平面直线。
class FocusGreatCircleRoute {
  FocusGreatCircleRoute(this.origin, this.destination) {
    final start = _toVector(origin.latitude, origin.longitude);
    final end = _toVector(destination.latitude, destination.longitude);
    _start = start;
    _end = end;
    _angle = math.acos((_dot(start, end)).clamp(-1.0, 1.0));
  }

  final FocusAirport origin;
  final FocusAirport destination;
  late final _Vector _start;
  late final _Vector _end;
  late final double _angle;

  FocusRoutePoint pointAt(double progress) {
    final t = progress.clamp(0.0, 1.0);
    if (_angle < 0.000001) {
      return FocusRoutePoint(
        latitude: origin.latitude,
        longitude: origin.longitude,
      );
    }
    final sinAngle = math.sin(_angle);
    final a = math.sin((1 - t) * _angle) / sinAngle;
    final b = math.sin(t * _angle) / sinAngle;
    return _fromVector(_Vector(
      _start.x * a + _end.x * b,
      _start.y * a + _end.y * b,
      _start.z * a + _end.z * b,
    ));
  }

  /// 返回路线前进方向的 bearing（度，正北为 0，顺时针）。
  double headingAt(double progress) {
    final t = progress.clamp(0.0, 1.0);
    final here = pointAt(t);
    final next = pointAt((t + 0.001).clamp(0.0, 1.0));
    final lat1 = _radians(here.latitude);
    final lat2 = _radians(next.latitude);
    final dLon = _radians(next.longitude - here.longitude);
    final y = math.sin(dLon) * math.cos(lat2);
    final x = math.cos(lat1) * math.sin(lat2) -
        math.sin(lat1) * math.cos(lat2) * math.cos(dLon);
    return (math.atan2(y, x) * 180 / math.pi + 360) % 360;
  }
}

class _Vector {
  const _Vector(this.x, this.y, this.z);
  final double x;
  final double y;
  final double z;
}

_Vector _toVector(double latitude, double longitude) {
  final lat = _radians(latitude);
  final lon = _radians(longitude);
  final cosLat = math.cos(lat);
  return _Vector(cosLat * math.cos(lon), cosLat * math.sin(lon), math.sin(lat));
}

FocusRoutePoint _fromVector(_Vector vector) {
  final latitude = math.atan2(
        vector.z,
        math.sqrt(vector.x * vector.x + vector.y * vector.y),
      ) *
      180 /
      math.pi;
  final longitude = math.atan2(vector.y, vector.x) * 180 / math.pi;
  return FocusRoutePoint(latitude: latitude, longitude: longitude);
}

double _dot(_Vector a, _Vector b) => a.x * b.x + a.y * b.y + a.z * b.z;

double _radians(double degrees) => degrees * math.pi / 180;
