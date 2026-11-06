import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

/// Persists the same recovery format used by the mounted scene and its archive.
Future<void> saveSceneSnapshot(
    SharedPreferences prefs, String scene, Map<String, dynamic> message) async {
  final allowed = scene == 'mado'
      ? {'mado.session.v1', 'mado.preferences.v1'}
      : {'haijian.v1', 'haijian.v1.recovery'};
  final storage = (message['storage'] as Map<String, dynamic>)
      .map((key, value) => MapEntry(key, value));
  storage
      .removeWhere((key, value) => !allowed.contains(key) || value is! String);
  final values = <String, String>{
    'iko.scene.$scene': jsonEncode(recoverableSceneStorage(
        scene,
        storage,
        (message['capturedAt'] as num?)?.toInt() ??
            DateTime.now().millisecondsSinceEpoch)),
    'iko.records.$scene': jsonEncode(message['records'] ?? []),
  };
  try {
    for (final entry in values.entries) {
      if (prefs.getString(entry.key) == entry.value) continue;
      if (!await prefs.setString(entry.key, entry.value)) {
        throw StateError('设备存储不可写');
      }
    }
  } catch (_) {
    // Legacy SharedPreferences updates its cache before the platform write.
    // Reload so a failed write is not mistaken for a persisted snapshot.
    await prefs.reload();
    rethrow;
  }
}

/// Recovery uses the last observed focus time, never wall time while the app was killed.
Map<String, dynamic> recoverableSceneStorage(
    String scene, Map<String, dynamic> storage, int capturedAt) {
  final result = Map<String, dynamic>.from(storage);
  final key = scene == 'mado' ? 'mado.session.v1' : 'haijian.v1';
  final raw = result[key];
  if (raw is! String) return result;
  final data = jsonDecode(raw) as Map<String, dynamic>;
  final active = data['active'];
  if (active is Map<String, dynamic>) {
    final since = active['runningSince'];
    if (since is num) {
      final field = scene == 'mado' ? 'accumulatedMs' : 'focusMs';
      final elapsed = (active[field] as num).toInt() +
          (capturedAt - since.toInt()).clamp(0, 10800000);
      active[field] = elapsed.clamp(0, (active['durationMs'] as num).toInt());
      active['runningSince'] = null;
      if (scene == 'haijian') active['status'] = 'paused';
    }
    if (scene == 'haijian' && active['status'] == 'fishing') {
      final rest = active['rest'];
      if (rest is Map && rest['startedAt'] is num) {
        active['restMs'] = (active['restMs'] as num).toInt() +
            (capturedAt - (rest['startedAt'] as num).toInt())
                .clamp(0, 10800000);
      }
      active['rest'] = null;
      active['status'] = 'paused';
      active['runningSince'] = null;
    }
  }
  result[key] = jsonEncode(data);
  return result;
}
