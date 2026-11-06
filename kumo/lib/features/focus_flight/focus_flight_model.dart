import 'dart:math' as math;

/// Dash or Crash 使用的机场/目的地点位。
class FocusAirport {
  const FocusAirport({
    required this.id,
    required this.city,
    required this.country,
    required this.latitude,
    required this.longitude,
    this.englishCity = '',
    this.airportName = '',
  });

  final String id;
  final String city;
  final String country;
  final double latitude;
  final double longitude;
  final String englishCity;
  final String airportName;

  String get label => '$city · $id';

  String get searchableText =>
      '$id $city $englishCity $country $airportName'.toLowerCase();
}

// 发布适配：完整机场数据库来源未核实，改用五个测试点。
const focusAirports = <FocusAirport>[
  FocusAirport(id:'PEK',city:'北京',englishCity:'Beijing',country:'示例',latitude:40.08,longitude:116.58),
  FocusAirport(id:'SHA',city:'上海',englishCity:'Shanghai',country:'示例',latitude:31.20,longitude:121.34),
  FocusAirport(id:'TYO',city:'东京',englishCity:'Tokyo',country:'示例',latitude:35.55,longitude:139.78),
  FocusAirport(id:'WUH',city:'武汉',englishCity:'Wuhan',country:'示例',latitude:30.78,longitude:114.21),
  FocusAirport(id:'LHR',city:'伦敦',englishCity:'London',country:'示例',latitude:51.47,longitude:-0.45),
];

FocusAirport? focusAirportAtCoordinate(double latitude, double longitude,
    {double maxDistanceDegrees = 0.0001}) {
  for (final airport in focusAirports) {
    if ((airport.latitude - latitude).abs() <= maxDistanceDegrees &&
        (airport.longitude - longitude).abs() <= maxDistanceDegrees) {
      return airport;
    }
  }
  return null;
}

/// Dash or Crash 的座位状态，不再用“经济舱/商务舱/头等舱”代替真实值机。
enum FocusSeatState { available, occupied, selected }

/// 适合平板纵向滚动的窄体客机座位布局。
const focusSeatRows = 24;
const focusSeatColumns = <String>['A', 'B', 'C', 'D', 'E', 'F'];

FocusSeatState focusSeatState(String flightId, int row, String column,
    {String? selectedSeat}) {
  final seatId = '$row$column';
  if (seatId == selectedSeat) return FocusSeatState.selected;
  // 纯本地、跨运行稳定的 occupied 分布；不使用 Dart 的随机 hash。
  var hash =
      flightId.codeUnits.fold<int>(17, (value, code) => value * 31 + code);
  hash += row * 13 + column.codeUnitAt(0) * 7;
  return hash.abs() % 11 == 0
      ? FocusSeatState.occupied
      : FocusSeatState.available;
}

enum FocusTask { study, work, read, code, write, research, create, deepFocus }

extension FocusTaskCopy on FocusTask {
  String get label => switch (this) {
        FocusTask.study => 'STUDY',
        FocusTask.work => 'WORK',
        FocusTask.read => 'READ',
        FocusTask.code => 'CODE',
        FocusTask.write => 'WRITE',
        FocusTask.research => 'RESEARCH',
        FocusTask.create => 'CREATE',
        FocusTask.deepFocus => 'DEEP FOCUS',
      };

  String get description => switch (this) {
        FocusTask.study => '课程学习',
        FocusTask.work => '处理任务',
        FocusTask.read => '阅读材料',
        FocusTask.code => '编写代码',
        FocusTask.write => '写作输出',
        FocusTask.research => '查阅资料',
        FocusTask.create => '创意制作',
        FocusTask.deepFocus => '深度专注',
      };
}

double greatCircleDistanceKm(FocusAirport a, FocusAirport b) {
  const earthRadiusKm = 6371.0;
  final lat1 = a.latitude * math.pi / 180;
  final lat2 = b.latitude * math.pi / 180;
  final dLat = (b.latitude - a.latitude) * math.pi / 180;
  final dLon = (b.longitude - a.longitude) * math.pi / 180;
  final h = math.pow(math.sin(dLat / 2), 2) +
      math.cos(lat1) * math.cos(lat2) * math.pow(math.sin(dLon / 2), 2);
  return earthRadiusKm * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h));
}

/// 将真实距离映射成适合专注的航程档位，避免为了地图真实性制造复杂配置。
int focusMinutesForDistance(double distanceKm) {
  if (distanceKm < 1200) return 15;
  if (distanceKm < 2800) return 25;
  if (distanceKm < 5200) return 45;
  if (distanceKm < 8500) return 60;
  if (distanceKm < 12000) return 90;
  return 120;
}

enum FocusSeatClass {
  economy('经济舱', 1.0),
  business('商务舱', 1.5),
  first('头等舱', 2.0);

  const FocusSeatClass(this.label, this.multiplier);
  final String label;
  final double multiplier;
}

class FocusFlightPlan {
  const FocusFlightPlan({
    required this.origin,
    required this.destination,
    required this.minutes,
    required this.seatClass,
  });

  final FocusAirport origin;
  final FocusAirport destination;
  final int minutes;
  final FocusSeatClass seatClass;

  double get distanceKm => greatCircleDistanceKm(origin, destination);

  int get miles => (distanceKm / 10 * seatClass.multiplier).round();
}

/// 一次已完成/提前结束的 Dash or Crash 专注记录。
class FocusFlightRecord {
  FocusFlightRecord({
    required this.id,
    required this.origin,
    required this.destination,
    required this.startedAt,
    required this.durationSeconds,
    required this.incidentCount,
    required this.airplaneModeSeconds,
    this.task = FocusTask.study,
    this.arrivalTime,
    this.plannedDurationSeconds = 0,
    this.distanceKm = 0,
    this.focusCategory = 'STUDY',
    this.completed = false,
    this.ambientSound = 'CABIN',
    this.interceptCount = 0,
  });

  final String id;
  final String origin;
  final String destination;
  final DateTime startedAt;
  final int durationSeconds;
  final int incidentCount;
  final int airplaneModeSeconds;
  final FocusTask task;
  final DateTime? arrivalTime;
  final int plannedDurationSeconds;
  final int distanceKm;
  final String focusCategory;
  final bool completed;
  final String ambientSound;
  final int interceptCount;

  Duration get duration => Duration(seconds: durationSeconds);

  int get miles => (distanceKm / 10).round();

  Map<String, dynamic> toJson() => {
        'id': id,
        'origin': origin,
        'destination': destination,
        'startedAt': startedAt.toIso8601String(),
        'durationSeconds': durationSeconds,
        'incidentCount': incidentCount,
        'airplaneModeSeconds': airplaneModeSeconds,
        'task': task.name,
        'arrivalTime': arrivalTime?.toIso8601String(),
        'plannedDurationSeconds': plannedDurationSeconds,
        'distanceKm': distanceKm,
        'focusCategory': focusCategory,
        'completed': completed,
        'ambientSound': ambientSound,
        'interceptCount': interceptCount,
      };

  factory FocusFlightRecord.fromJson(Map<String, dynamic> json) =>
      FocusFlightRecord(
        id: json['id'] as String? ??
            'flight_${DateTime.now().microsecondsSinceEpoch}',
        origin: json['origin'] as String? ?? '—',
        destination: json['destination'] as String? ?? '—',
        startedAt: DateTime.tryParse(json['startedAt'] as String? ?? '') ??
            DateTime.now(),
        durationSeconds: (json['durationSeconds'] as num?)?.toInt() ?? 0,
        incidentCount: (json['incidentCount'] as num?)?.toInt() ?? 0,
        airplaneModeSeconds:
            (json['airplaneModeSeconds'] as num?)?.toInt() ?? 0,
        task: _focusTaskFromJson(json['task']),
        arrivalTime: DateTime.tryParse(json['arrivalTime'] as String? ?? ''),
        plannedDurationSeconds:
            (json['plannedDurationSeconds'] as num?)?.toInt() ?? 0,
        distanceKm: (json['distanceKm'] as num?)?.toInt() ?? 0,
        focusCategory: json['focusCategory'] as String? ?? 'STUDY',
        completed: json['completed'] as bool? ?? false,
        ambientSound: json['ambientSound'] as String? ?? 'CABIN',
        interceptCount: (json['interceptCount'] as num?)?.toInt() ?? 0,
      );
}

FocusTask _focusTaskFromJson(Object? value) {
  if (value is String) {
    for (final task in FocusTask.values) {
      if (task.name == value) return task;
    }
  }
  return FocusTask.study;
}
