import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';

class FocusDeviceLocation {
  const FocusDeviceLocation(this.latitude, this.longitude);

  final double latitude;
  final double longitude;
}

/// Dash or Crash 的少量平台能力：定位、电量、沉浸式音频和系统设置入口。
class FocusFlightPlatform {
  FocusFlightPlatform._();

  // Android 当前将系统能力统一注册在 system_alert 通道；保持两端一致，
  // 否则 release 包中所有 Dash or Crash 平台调用都会静默走 MissingPluginException。
  static const _channel = MethodChannel('com.classmate.classmate/system_alert');

  static Future<FocusDeviceLocation?> locate() async {
    final permission = await Permission.locationWhenInUse.request();
    if (!permission.isGranted) return null;
    try {
      final result =
          await _channel.invokeMapMethod<String, dynamic>('getLocation');
      final latitude = (result?['latitude'] as num?)?.toDouble();
      final longitude = (result?['longitude'] as num?)?.toDouble();
      if (latitude == null || longitude == null) return null;
      return FocusDeviceLocation(latitude, longitude);
    } on MissingPluginException {
      return null;
    } on PlatformException {
      return null;
    }
  }

  static Future<int?> batteryLevel() async {
    try {
      final value = await _channel.invokeMethod<num>('getBatteryLevel');
      return value?.round();
    } on MissingPluginException {
      return null;
    } on PlatformException {
      return null;
    }
  }

  static Future<bool?> airplaneModeEnabled() async {
    try {
      return await _channel.invokeMethod<bool>('isAirplaneModeOn');
    } on MissingPluginException {
      return null;
    } on PlatformException {
      return null;
    }
  }

  static Future<void> requestNotificationPermission() async {
    try {
      await _channel.invokeMethod<void>('requestNotificationPermission');
    } on MissingPluginException {
      // 非 Android 平台忽略。
    } on PlatformException {
      // 权限失败不阻断专注计时。
    }
  }

  static Future<void> openAirplaneSettings() async {
    try {
      await _channel.invokeMethod<void>('openAirplaneSettings');
    } on MissingPluginException {
      // Windows / Flutter test 不提供系统飞行模式设置。
    } on PlatformException {
      // 系统拒绝跳转时仍保留应用内专注模式。
    }
  }

  static Future<void> startAudio({
    required double engineVolume,
    required double whiteNoiseVolume,
    required double rainVolume,
  }) async {
    try {
      await _channel.invokeMethod<void>('startFocusAudio', {
        'engineVolume': engineVolume,
        'whiteNoiseVolume': whiteNoiseVolume,
        'rainVolume': rainVolume,
      });
    } on MissingPluginException {
      // 非 Android 平台暂时静默；计时功能不受影响。
    } on PlatformException {
      // 音频失败不阻断自习计时。
    }
  }

  static Future<void> setAudioVolumes({
    required double engineVolume,
    required double whiteNoiseVolume,
    required double rainVolume,
  }) async {
    try {
      await _channel.invokeMethod<void>('setFocusAudioVolumes', {
        'engineVolume': engineVolume,
        'whiteNoiseVolume': whiteNoiseVolume,
        'rainVolume': rainVolume,
      });
    } on MissingPluginException {
      // 非 Android 平台忽略。
    } on PlatformException {
      // 音量调整失败不阻断计时。
    }
  }

  static Future<void> playSfx(String name, {double volume = 0.22}) async {
    try {
      await _channel.invokeMethod<void>('playFocusSfx', {
        'name': name,
        'volume': volume.clamp(0.0, 1.0),
      });
    } on MissingPluginException {
      // 非 Android 平台忽略。
    } on PlatformException {
      // 事件音效失败不阻断游戏和专注计时。
    }
  }

  static Future<void> setAudioDucking(double factor) async {
    try {
      await _channel.invokeMethod<void>('setFocusAudioDucking', {
        'factor': factor.clamp(0.25, 1.0),
      });
    } on MissingPluginException {
      // 非 Android 平台忽略。
    } on PlatformException {
      // ducking 失败不阻断计时。
    }
  }

  static Future<void> stopAudio() async {
    try {
      await _channel.invokeMethod<void>('stopFocusAudio');
    } on MissingPluginException {
      // 非 Android 平台忽略。
    } on PlatformException {
      // 收尾阶段尽力停止即可。
    }
  }
}
