import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../../features/focus_flight/focus_flight_model.dart';

/// Dash or Crash 的轻量本地历史，最多保留最近 60 次，不上传云端。
class FocusFlightHistoryStore {
  FocusFlightHistoryStore._(this._prefs, this._records);

  static const _key = 'focus_flight_history_v1';
  final SharedPreferences _prefs;
  final List<FocusFlightRecord> _records;

  List<FocusFlightRecord> get records => List.unmodifiable(_records);

  static Future<FocusFlightHistoryStore> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    final records = <FocusFlightRecord>[];
    if (raw != null && raw.isNotEmpty) {
      try {
        final list = jsonDecode(raw) as List<dynamic>;
        records.addAll(list.map((item) =>
            FocusFlightRecord.fromJson(item as Map<String, dynamic>)));
      } catch (_) {
        // 坏数据不阻塞进入 Dash or Crash，下一次保存会覆盖它。
      }
    }
    records.sort((a, b) => b.startedAt.compareTo(a.startedAt));
    return FocusFlightHistoryStore._(prefs, records);
  }

  Future<void> save(FocusFlightRecord record) async {
    _records.removeWhere((item) => item.id == record.id);
    _records.insert(0, record);
    if (_records.length > 60) {
      _records.removeRange(60, _records.length);
    }
    await _prefs.setString(
        _key, jsonEncode(_records.map((item) => item.toJson()).toList()));
  }
}
