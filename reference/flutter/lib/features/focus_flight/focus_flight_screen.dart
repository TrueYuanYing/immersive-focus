import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_fonts.dart';
import '../../core/widgets/app_widgets.dart';
import '../../services/focus_flight/focus_flight_history_store.dart';
import 'blue_on_blue_game_view.dart';
import 'boarding_pass_view.dart';
import 'dash_globe_view.dart';
import 'flight_3d_view.dart';
import 'focus_flight_model.dart';
import 'focus_flight_platform.dart';
import 'seat_map_view.dart';
import 'flight_runtime.dart';
import '../study/pointer_trail.dart';

/// IKO Dash or Crash：选目的地 → 选座 → 滑撕登机牌 → 起飞计时。
class FocusFlightScreen extends StatefulWidget {
  const FocusFlightScreen({
    super.key,
    this.onFullscreenChanged,
    this.onReturnToIko,
  });

  final ValueChanged<bool>? onFullscreenChanged;
  final VoidCallback? onReturnToIko;

  @override
  State<FocusFlightScreen> createState() => _FocusFlightScreenState();
}

enum _FlightStage { route, ticket, flying, landed }

class _FocusFlightScreenState extends State<FocusFlightScreen> {
  FocusAirport _origin = focusAirports.first;
  FocusAirport? _destination = focusAirports[1];
  FocusTask _task = FocusTask.study;
  String _selectedSeat = '12A';
  bool _boardingStarting = false;
  DateTime? _boardingDeparture;
  _FlightStage _stage = _FlightStage.route;
  double _tearProgress = 0;
  int _minutes = 25;
  Duration _elapsed = Duration.zero;
  DateTime? _startedAt;
  FocusFlightClock? _flightClock;
  FocusFlightExitOutcome _flightExitOutcome = focusFlightArrivalOutcome;
  FocusFlightPhase _flightPhase = FocusFlightPhase.boarding;
  Timer? _flightTimer;
  Timer? _batteryTimer;
  int? _battery;
  double _engineVolume = 0.28;
  double _whiteNoiseVolume = 0.14;
  double _rainVolume = 0.12;
  bool _audioEnabled = true;
  bool _engineEnabled = true;
  bool _whiteNoiseEnabled = true;
  bool _rainEnabled = false;
  bool _airplaneModeRequested = false;
  bool _airplaneModeOnTakeoff = true;
  bool _fullScreen = false;
  // MAP is the primary take-off view. WINDOW remains available as the optional
  // scenic view from the in-flight HUD.
  bool _flightWindowMode = false;
  bool _incidentActive = false;
  int _incidentCount = 0;
  bool _airplaneModeActive = false;
  DateTime? _airplaneModeStartedAt;
  int _airplaneModeSeconds = 0;
  bool _recordedFlight = false;
  FocusFlightHistoryStore? _historyStore;

  @override
  void initState() {
    super.initState();
    unawaited(_resolveOrigin());
    unawaited(_refreshBattery());
    unawaited(_loadFlightHistory());
  }

  @override
  void dispose() {
    if (_startedAt != null && !_recordedFlight) {
      _finishAirplaneModeClock();
      unawaited(_saveFlightRecord(actualDuration: _elapsed, completed: false));
    }
    _flightTimer?.cancel();
    _batteryTimer?.cancel();
    unawaited(FocusFlightPlatform.stopAudio());
    unawaited(FocusFlightPlatform.setAudioDucking(1));
    if (_fullScreen) {
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
      widget.onFullscreenChanged?.call(false);
    }
    super.dispose();
  }

  Future<void> _resolveOrigin() async {
    final location = await FocusFlightPlatform.locate();
    if (!mounted || location == null) return;
    final gps = FocusAirport(
      id: 'GPS',
      city: '当前位置',
      country: '',
      latitude: location.latitude,
      longitude: location.longitude,
    );
    final nearest = focusAirports.reduce((a, b) =>
        greatCircleDistanceKm(gps, a) < greatCircleDistanceKm(gps, b) ? a : b);
    setState(() {
      _origin = nearest;
      if (_destination == null || _destination!.id == nearest.id) {
        _destination =
            focusAirports.firstWhere((airport) => airport.id != nearest.id);
      }
      _minutes = focusMinutesForDistance(
        greatCircleDistanceKm(_origin, _destination!),
      );
    });
  }

  Future<void> _refreshBattery() async {
    final value = await FocusFlightPlatform.batteryLevel();
    if (mounted && value != null) setState(() => _battery = value);
  }

  Future<void> _loadFlightHistory() async {
    final store = await FocusFlightHistoryStore.load();
    if (!mounted) return;
    _historyStore = store;
  }

  Future<void> _refreshAirplaneMode() async {
    final enabled = await FocusFlightPlatform.airplaneModeEnabled();
    if (!mounted || enabled == null || _stage != _FlightStage.flying) return;
    final now = DateTime.now();
    if (enabled && !_airplaneModeActive) {
      _airplaneModeStartedAt ??= now;
    } else if (!enabled && _airplaneModeActive) {
      final started = _airplaneModeStartedAt;
      if (started != null) {
        _airplaneModeSeconds += now.difference(started).inSeconds;
      }
      _airplaneModeStartedAt = null;
    }
    if (_airplaneModeActive != enabled) {
      setState(() => _airplaneModeActive = enabled);
    }
  }

  double get _effectiveEngineVolume => _engineEnabled ? _engineVolume : 0.0;

  double get _effectiveWhiteNoiseVolume =>
      _whiteNoiseEnabled ? _whiteNoiseVolume : 0.0;

  double get _effectiveRainVolume => _rainEnabled ? _rainVolume : 0.0;

  Future<void> _syncAudioVolumes() async {
    if (!_audioEnabled) return;
    await FocusFlightPlatform.setAudioVolumes(
      engineVolume: _effectiveEngineVolume,
      whiteNoiseVolume: _effectiveWhiteNoiseVolume,
      rainVolume: _effectiveRainVolume,
    );
  }

  void _selectGlobeDestination(FocusAirport airport) {
    if (airport.id == _origin.id) return;
    unawaited(_openCabinMapPage(airport));
  }

  Future<void> _openCabinMapPage(FocusAirport airport) async {
    HapticFeedback.selectionClick();
    setState(() {
      _destination = airport;
      _minutes =
          focusMinutesForDistance(greatCircleDistanceKm(_origin, airport));
    });
    final selection = await Navigator.of(context).push<FocusCabinSelection>(
      MaterialPageRoute<FocusCabinSelection>(
        builder: (_) => PointerTrail(
            child: FocusCabinMapPage(
          origin: _origin,
          destination: airport,
          flightId: '${_origin.id}-${airport.id}-$_minutes',
          initialSeat: _selectedSeat,
          initialTask: _task,
        )),
      ),
    );
    if (!mounted || selection == null) return;
    setState(() {
      _selectedSeat = selection.seat;
      _task = selection.task;
      _stage = _FlightStage.ticket;
      _boardingStarting = false;
      _boardingDeparture = DateTime.now();
      _tearProgress = 0;
    });
  }

  Future<void> _startFlight() async {
    final destination = _destination;
    if (destination == null) return;
    HapticFeedback.mediumImpact();
    setState(() {
      _stage = _FlightStage.flying;
      _elapsed = Duration.zero;
      _startedAt = DateTime.now();
      _flightClock = FocusFlightClock(
        startedAt: _startedAt!,
        duration: Duration(minutes: _minutes),
      );
      _flightPhase = FocusFlightPhase.boarding;
      _flightExitOutcome = focusFlightArrivalOutcome;
      _incidentActive = false;
      _incidentCount = 0;
      _airplaneModeSeconds = 0;
      _airplaneModeStartedAt = null;
      _airplaneModeActive = false;
      _recordedFlight = false;
    });
    await FocusFlightPlatform.requestNotificationPermission();
    await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    if (_airplaneModeOnTakeoff) {
      // Android 不允许普通应用静默修改系统飞行模式；撕票后立即打开系统设置，
      // 用户只需确认一次，之后由轮询记录真实的飞行模式时长。
      unawaited(_requestAirplaneMode());
    }
    if (_audioEnabled) {
      await FocusFlightPlatform.startAudio(
        engineVolume: _effectiveEngineVolume,
        whiteNoiseVolume: _effectiveWhiteNoiseVolume,
        rainVolume: _effectiveRainVolume,
      );
    }
    _batteryTimer = Timer.periodic(const Duration(seconds: 20), (_) {
      unawaited(_refreshBattery());
      unawaited(_refreshAirplaneMode());
    });
    _flightTimer = Timer.periodic(const Duration(milliseconds: 500), (_) {
      unawaited(_refreshAirplaneMode());
      final started = _startedAt;
      if (!mounted || started == null) return;
      final clock = _flightClock ??
          FocusFlightClock(
            startedAt: started,
            duration: Duration(minutes: _minutes),
          );
      final now = DateTime.now();
      final elapsed = clock.elapsedAt(now);
      if (clock.progressAt(now) >= 1) {
        _land(completed: true);
      } else {
        setState(() {
          _elapsed = elapsed;
          _flightPhase = clock.phaseAt(now);
        });
      }
    });
  }

  void _land({bool completed = false}) {
    if (_stage != _FlightStage.flying) return;
    final started = _startedAt;
    final actualDuration =
        started == null ? _elapsed : DateTime.now().difference(started);
    final maximumDuration = Duration(minutes: _minutes);
    final boundedDuration = actualDuration.isNegative
        ? Duration.zero
        : actualDuration > maximumDuration
            ? maximumDuration
            : actualDuration;
    final didArrive = completed || actualDuration >= maximumDuration;
    final outcome =
        didArrive ? focusFlightArrivalOutcome : chooseFocusFlightExitOutcome();
    _finishAirplaneModeClock();
    _flightTimer?.cancel();
    _batteryTimer?.cancel();
    unawaited(FocusFlightPlatform.setAudioDucking(1));
    unawaited(FocusFlightPlatform.stopAudio());
    unawaited(SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge));
    if (mounted) {
      setState(() {
        _stage = _FlightStage.landed;
        _elapsed = boundedDuration;
        _flightPhase = FocusFlightPhase.arrived;
        _flightExitOutcome = outcome;
        _fullScreen = false;
      });
      widget.onFullscreenChanged?.call(false);
    }
    unawaited(_saveFlightRecord(
      actualDuration: actualDuration,
      completed: didArrive,
    ));
  }

  void _finishAirplaneModeClock() {
    final started = _airplaneModeStartedAt;
    if (_airplaneModeActive && started != null) {
      _airplaneModeSeconds += DateTime.now().difference(started).inSeconds;
      _airplaneModeStartedAt = null;
    }
  }

  Future<void> _saveFlightRecord(
      {Duration? actualDuration, bool? completed}) async {
    if (_recordedFlight || _startedAt == null) return;
    final destination = _destination;
    if (destination == null) return;
    final store = _historyStore ?? await FocusFlightHistoryStore.load();
    _historyStore = store;
    _recordedFlight = true;
    final record = FocusFlightRecord(
      id: 'flight_${_startedAt!.microsecondsSinceEpoch}',
      origin: _origin.city,
      destination: destination.city,
      startedAt: _startedAt!,
      durationSeconds: (actualDuration ?? _elapsed)
          .inSeconds
          .clamp(0, _minutes * 60)
          .toInt(),
      incidentCount: _incidentCount,
      airplaneModeSeconds: _airplaneModeSeconds,
      task: _task,
      arrivalTime: DateTime.now(),
      plannedDurationSeconds: _minutes * 60,
      distanceKm: greatCircleDistanceKm(_origin, destination).round(),
      focusCategory: _task.label,
      completed: completed ??
          actualDuration == null || (actualDuration.inSeconds >= _minutes * 60),
      ambientSound: _ambientSoundLabel,
      interceptCount: _incidentCount,
    );
    await _historyStore!.save(record);
  }

  String get _ambientSoundLabel {
    final layers = <String>[];
    if (_engineEnabled && _engineVolume > 0) layers.add('AIRCRAFT ENGINE');
    if (_whiteNoiseEnabled && _whiteNoiseVolume > 0) layers.add('WHITE NOISE');
    if (_rainEnabled && _rainVolume > 0) layers.add('RAIN');
    return layers.isEmpty ? 'SILENT' : layers.join(' + ');
  }

  Future<void> _toggleFullScreen() async {
    final next = !_fullScreen;
    setState(() => _fullScreen = next);
    widget.onFullscreenChanged?.call(next);
    await SystemChrome.setEnabledSystemUIMode(
      next ? SystemUiMode.immersiveSticky : SystemUiMode.edgeToEdge,
    );
  }

  void _returnToRoute() {
    _flightTimer?.cancel();
    _batteryTimer?.cancel();
    unawaited(FocusFlightPlatform.setAudioDucking(1));
    unawaited(FocusFlightPlatform.stopAudio());
    unawaited(SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge));
    widget.onFullscreenChanged?.call(false);
    if (!mounted) return;
    setState(() {
      _stage = _FlightStage.route;
      _tearProgress = 0;
      _boardingStarting = false;
      _incidentActive = false;
      _flightExitOutcome = focusFlightArrivalOutcome;
      _fullScreen = false;
    });
  }

  void _returnToIko() {
    _returnToRoute();
    widget.onReturnToIko?.call();
  }

  void _startIncident() {
    if (_stage != _FlightStage.flying || _incidentActive) return;
    HapticFeedback.heavyImpact();
    unawaited(FocusFlightPlatform.setAudioDucking(0.68));
    setState(() {
      _incidentActive = true;
      _incidentCount += 1;
    });
  }

  Future<void> _requestAirplaneMode() async {
    setState(() => _airplaneModeRequested = true);
    await FocusFlightPlatform.openAirplaneSettings();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
          content: Text('已打开系统飞行模式设置，请手动确认；Android 不允许普通应用静默切换系统开关。')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final page = switch (_stage) {
      _FlightStage.route => _buildRouteStage(context),
      _FlightStage.ticket => _buildTicketStage(context),
      _FlightStage.flying => _buildFlyingStage(context),
      _FlightStage.landed => _buildLandedStage(context),
    };
    return PopScope(
      canPop: !_incidentActive,
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 460),
        switchInCurve: Curves.easeOutCubic,
        switchOutCurve: Curves.easeInCubic,
        transitionBuilder: (child, animation) => SlideTransition(
          position: Tween<Offset>(
            begin: const Offset(0.12, 0),
            end: Offset.zero,
          ).animate(animation),
          child: FadeTransition(opacity: animation, child: child),
        ),
        child: KeyedSubtree(
          key: ValueKey('$_stage-$_incidentActive'),
          child: page,
        ),
      ),
    );
  }

  Widget _buildRouteStage(BuildContext context) {
    // Selecting a route is intentionally a first-level experience: opening
    // Dash or Crash lands directly on the globe, then the selected city
    // transitions into the seat/check-in flow.
    return DashGlobeDestinationPage(
      origin: _origin,
      destination: _destination,
      onSelected: _selectGlobeDestination,
      onBack: widget.onReturnToIko,
    );
  }

  Widget _buildTicketStage(BuildContext context) {
    final destination = _destination!;
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('登机牌'),
        leading: IconButton(
          onPressed: () => setState(() => _stage = _FlightStage.route),
          icon: const Icon(Icons.arrow_back_rounded),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg, AppSpacing.sm, AppSpacing.lg, AppSpacing.xl),
        children: [
          Text('READY TO FLY',
              style: theme.textTheme.labelLarge?.copyWith(
                letterSpacing: 2.2,
                fontWeight: FontWeight.w800,
              )),
          const SizedBox(height: AppSpacing.xs),
          Text('${_origin.city}  →  ${destination.city}',
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
              )),
          const SizedBox(height: AppSpacing.xs),
          Text('座位 $_selectedSeat  ·  ${_task.description}',
              style: theme.textTheme.bodyMedium),
          const SizedBox(height: AppSpacing.lg),
          // The boarding pass is the only forward action after seat + focus
          // selection. There is no extra check-in confirmation screen.
          FocusBoardingPass(
            origin: _origin,
            destination: destination,
            minutes: _minutes,
            seatId: _selectedSeat,
            task: _task,
            departure: _boardingDeparture ?? DateTime.now(),
            tearProgress: _tearProgress,
            dropping: _boardingStarting,
            onTearProgress: _updateTearProgress,
          ),
          const SizedBox(height: AppSpacing.md),
          Card(
            margin: EdgeInsets.zero,
            child: SwitchListTile.adaptive(
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 18, vertical: 4),
              value: _airplaneModeOnTakeoff,
              onChanged: (value) =>
                  setState(() => _airplaneModeOnTakeoff = value),
              secondary: const Icon(Icons.airplanemode_active_rounded),
              title: Text(_airplaneModeOnTakeoff ? '飞行模式 · 开启' : '飞行模式 · 关闭'),
              subtitle: const Text('划开登机牌后开始专注；Android 需手动确认系统开关'),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            _boardingStarting
                ? '登机牌已撕开，正在起飞…'
                : '沿虚线从左向右滑动，整段条形码纸片会自然脱落；完成后立即起飞',
            textAlign: TextAlign.center,
            style: theme.textTheme.labelLarge,
          ),
        ],
      ),
    );
  }

  void _updateTearProgress(double value) {
    if (_stage != _FlightStage.ticket || _boardingStarting) {
      return;
    }
    final next = value.clamp(0.0, 1.0).toDouble();
    // 保留最后一小段“撕到边缘”的视觉空间，同时兼容平板/高 DPI
    // 设备上手势坐标与绘制宽度的换算误差；到达边缘后仍由纸片整体自由落体。
    const tearCompletionThreshold = 0.92;
    if (next >= tearCompletionThreshold) {
      setState(() {
        _tearProgress = 1;
        _boardingStarting = true;
      });
      // 让条码完成自然掉落，再连续进入飞行 HUD，而不是瞬间切页。
      Future<void>.delayed(const Duration(milliseconds: 1050), () {
        if (mounted && _stage == _FlightStage.ticket) unawaited(_startFlight());
      });
      return;
    }
    if ((next - _tearProgress).abs() > 0.001) {
      setState(() => _tearProgress = next);
    }
  }

  Widget _buildFlyingStage(BuildContext context) {
    final destination = _destination!;
    final theme = Theme.of(context);
    final totalSeconds = _minutes * 60;
    final now = DateTime.now();
    final clock = _flightClock;
    final progress = clock?.progressAt(now) ??
        (totalSeconds == 0
            ? 0.0
            : (_elapsed.inSeconds / totalSeconds).clamp(0.0, 1.0));
    final elapsed = clock?.elapsedAt(now) ?? _elapsed;
    final phase = clock?.phaseAt(now) ?? _flightPhase;
    final remaining = Duration(minutes: _minutes) - elapsed;
    final Widget background;
    if (_incidentActive) {
      background = const ColoredBox(color: Color(0xFF070809));
    } else if (_flightWindowMode) {
      background = Flight3DView(
        key: const ValueKey('window-3d'),
        progress: progress,
        seed: _startedAt?.millisecondsSinceEpoch ?? 42,
        controlsTopInset: _fullScreen ? 84 : 88,
      );
    } else {
      background = FocusFlightMapView(
        key: const ValueKey('map'),
        origin: _origin,
        destination: destination,
        progress: progress,
      );
    }
    return Scaffold(
      backgroundColor: theme.colorScheme.surface,
      body: SafeArea(
        child: Stack(
          fit: StackFit.expand,
          children: [
            Positioned.fill(child: background),
            if (!_incidentActive)
              _fullScreen
                  ? _buildFullscreenFlightHud(
                      context,
                      destination: destination,
                      progress: progress,
                      phase: phase,
                      remaining: remaining,
                      theme: theme,
                    )
                  : _flightWindowMode
                      ? _buildWindowFlightHud(
                          context,
                          destination: destination,
                          progress: progress,
                          phase: phase,
                          remaining: remaining,
                          theme: theme,
                        )
                      : _buildMapFlightHud(
                          context,
                          destination: destination,
                          progress: progress,
                          phase: phase,
                          remaining: remaining,
                          theme: theme,
                        ),
            if (_incidentActive)
              Positioned.fill(
                child: BlueOnBlueGameView(
                  flightLabel: '${_origin.id} → ${destination.id}',
                  flightPhase: phase.label,
                  remaining: _fmtRemaining(remaining),
                  flightProgress: progress,
                  flightSeed: _startedAt?.millisecondsSinceEpoch ?? 42,
                  onCompleted: (intercepted) {
                    if (!mounted) return;
                    unawaited(FocusFlightPlatform.setAudioDucking(1));
                    setState(() => _incidentActive = false);
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                      content: Text(intercepted
                          ? '拦截成功，航线已恢复，专注继续。'
                          : 'BLUE ON BLUE 已结束，航线恢复，专注继续。'),
                    ));
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildAudioPanel({VoidCallback? onUpdated}) {
    void update(VoidCallback change) {
      setState(change);
      onUpdated?.call();
    }

    return _AudioPanel(
      enabled: _audioEnabled,
      engineVolume: _engineVolume,
      whiteNoiseVolume: _whiteNoiseVolume,
      rainVolume: _rainVolume,
      engineEnabled: _engineEnabled,
      whiteNoiseEnabled: _whiteNoiseEnabled,
      rainEnabled: _rainEnabled,
      onEnabledChanged: (enabled) {
        update(() => _audioEnabled = enabled);
        unawaited(enabled
            ? FocusFlightPlatform.startAudio(
                engineVolume: _effectiveEngineVolume,
                whiteNoiseVolume: _effectiveWhiteNoiseVolume,
                rainVolume: _effectiveRainVolume,
              )
            : FocusFlightPlatform.stopAudio());
      },
      onEngineEnabledChanged: (enabled) {
        update(() => _engineEnabled = enabled);
        unawaited(_syncAudioVolumes());
      },
      onWhiteNoiseEnabledChanged: (enabled) {
        update(() => _whiteNoiseEnabled = enabled);
        unawaited(_syncAudioVolumes());
      },
      onRainEnabledChanged: (enabled) {
        update(() => _rainEnabled = enabled);
        unawaited(_syncAudioVolumes());
      },
      onEngineVolumeChanged: (volume) {
        update(() => _engineVolume = volume);
        unawaited(_syncAudioVolumes());
      },
      onWhiteNoiseVolumeChanged: (volume) {
        update(() => _whiteNoiseVolume = volume);
        unawaited(_syncAudioVolumes());
      },
      onRainVolumeChanged: (volume) {
        update(() => _rainVolume = volume);
        unawaited(_syncAudioVolumes());
      },
    );
  }

  void _showAudioControls() {
    HapticFeedback.selectionClick();
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      barrierColor: const Color(0xB8000000),
      isScrollControlled: true,
      builder: (sheetContext) => SafeArea(
        top: false,
        child: Align(
          alignment: Alignment.bottomCenter,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(10, 0, 10, 8),
            child: FractionallySizedBox(
              widthFactor: .88,
              child: ConstrainedBox(
                constraints: const BoxConstraints(
                  maxWidth: 480,
                  maxHeight: 220,
                ),
                child: StatefulBuilder(
                  builder: (context, setSheetState) => _buildAudioPanel(
                    onUpdated: () => setSheetState(() {}),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// MAP 与 WINDOW 使用同一套外围仪表带，避免地图主视觉被旧版大面板覆盖。
  Widget _buildMapFlightHud(
    BuildContext context, {
    required FocusAirport destination,
    required double progress,
    required FocusFlightPhase phase,
    required Duration remaining,
    required ThemeData theme,
  }) {
    final safeBottom = MediaQuery.paddingOf(context).bottom;
    final panelWidth = math.max(
      196.0,
      math.min(284.0, MediaQuery.sizeOf(context).width * .56),
    );
    return Positioned.fill(
      child: Stack(
        fit: StackFit.expand,
        children: [
          Positioned(
            top: 12,
            left: 16,
            right: 16,
            child: Row(
              children: [
                Expanded(
                  child: _FlightRouteBanner(
                    routeText: '${_origin.city}  →  ${destination.city}',
                    detail: 'MAP · LIVE ROUTE',
                    battery: _battery,
                    time: _clock(),
                    theme: theme,
                  ),
                ),
                const SizedBox(width: 8),
                _FlightHudIconButton(
                  tooltip: '切换到 WINDOW',
                  icon: Icons.window_rounded,
                  onPressed: () => setState(() => _flightWindowMode = true),
                ),
                const SizedBox(width: 8),
                _FlightHudIconButton(
                  tooltip: '全屏',
                  icon: Icons.fullscreen_rounded,
                  onPressed: _toggleFullScreen,
                ),
              ],
            ),
          ),
          Positioned(
            left: 16,
            bottom: safeBottom + 16,
            child: SizedBox(
              width: panelWidth,
              child: _buildFlightProgressPanel(
                progress: progress,
                phase: phase,
                remaining: remaining,
                theme: theme,
              ),
            ),
          ),
          Positioned(
            right: 16,
            bottom: safeBottom + 16,
            child: _FlightActionRail(
              audioEnabled: _audioEnabled,
              airplaneModeRequested: _airplaneModeRequested,
              airplaneModeActive: _airplaneModeActive,
              onAudio: _showAudioControls,
              onIncident: _startIncident,
              onAirplaneMode: _requestAirplaneMode,
              onStop: _land,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildWindowFlightHud(
    BuildContext context, {
    required FocusAirport destination,
    required double progress,
    required FocusFlightPhase phase,
    required Duration remaining,
    required ThemeData theme,
  }) {
    final safeBottom = MediaQuery.paddingOf(context).bottom;
    final panelWidth = math.max(
      196.0,
      math.min(284.0, MediaQuery.sizeOf(context).width * .56),
    );
    return Positioned.fill(
      child: Stack(
        fit: StackFit.expand,
        children: [
          Positioned(
            top: 12,
            left: 16,
            right: 16,
            child: Row(
              children: [
                Expanded(
                  child: _FlightRouteBanner(
                    routeText: '${_origin.city}  →  ${destination.city}',
                    detail: 'WINDOW · 3D CRUISE',
                    battery: _battery,
                    time: _clock(),
                    theme: theme,
                  ),
                ),
                const SizedBox(width: 8),
                _FlightHudIconButton(
                  tooltip: '切换到 MAP',
                  icon: Icons.public_rounded,
                  onPressed: () => setState(() => _flightWindowMode = false),
                ),
                const SizedBox(width: 8),
                _FlightHudIconButton(
                  tooltip: '全屏',
                  icon: Icons.fullscreen_rounded,
                  onPressed: _toggleFullScreen,
                ),
              ],
            ),
          ),
          Positioned(
            left: 16,
            bottom: safeBottom + 16,
            child: SizedBox(
              width: panelWidth,
              child: _buildFlightProgressPanel(
                progress: progress,
                phase: phase,
                remaining: remaining,
                theme: theme,
              ),
            ),
          ),
          Positioned(
            right: 16,
            bottom: safeBottom + 16,
            child: _FlightActionRail(
              audioEnabled: _audioEnabled,
              airplaneModeRequested: _airplaneModeRequested,
              airplaneModeActive: _airplaneModeActive,
              onAudio: _showAudioControls,
              onIncident: _startIncident,
              onAirplaneMode: _requestAirplaneMode,
              onStop: _land,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFlightProgressPanel({
    required double progress,
    required FocusFlightPhase phase,
    required Duration remaining,
    required ThemeData theme,
  }) {
    final light = theme.brightness == Brightness.light;
    final foreground =
        light ? const Color(0xFF1A2930) : const Color(0xFFF5F2E9);
    final secondary = light ? const Color(0xFF546369) : const Color(0xFFBDC8C7);
    final accent = light ? const Color(0xFFAD5736) : const Color(0xFFF3A66B);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: light ? const Color(0xEEF7F4EA) : const Color(0xE51A2528),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
            color: light ? const Color(0xFFD3D8D3) : const Color(0xFF65777B)),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 11, 14, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  '剩余飞行时间',
                  style: theme.textTheme.labelMedium
                      ?.copyWith(color: secondary, letterSpacing: .4),
                ),
                const Spacer(),
                Text(
                  '${(progress * 100).round()}%',
                  style: theme.textTheme.labelMedium
                      ?.copyWith(color: accent, fontWeight: FontWeight.w800),
                ),
              ],
            ),
            const SizedBox(height: 2),
            Text(
              _fmtRemaining(remaining),
              style: tabularFigures(theme.textTheme.headlineSmall!.copyWith(
                color: foreground,
                fontWeight: FontWeight.w800,
                letterSpacing: 1.1,
              )),
            ),
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                minHeight: 5,
                value: progress,
                backgroundColor:
                    light ? const Color(0xFFD9DEDA) : const Color(0xFF425156),
                valueColor: AlwaysStoppedAnimation(accent),
              ),
            ),
            const SizedBox(height: 7),
            Text(
              '${phase.label} · ${_task.label}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.bodySmall?.copyWith(
                color: secondary,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFullscreenFlightHud(
    BuildContext context, {
    required FocusAirport destination,
    required double progress,
    required FocusFlightPhase phase,
    required Duration remaining,
    required ThemeData theme,
  }) {
    final safeBottom = MediaQuery.paddingOf(context).bottom;
    final routeText = '${_origin.city}  →  ${destination.city}';
    final panelWidth = math.max(
      196.0,
      math.min(284.0, MediaQuery.sizeOf(context).width * .56),
    );
    return Positioned.fill(
      child: Stack(
        fit: StackFit.expand,
        children: [
          Positioned(
            top: 12,
            left: 16,
            right: 16,
            child: _FlightRouteBanner(
              routeText: routeText,
              detail:
                  _flightWindowMode ? 'WINDOW · IMMERSIVE' : 'MAP · IMMERSIVE',
              battery: _battery,
              time: _clock(),
              theme: theme,
              trailing: IconButton(
                tooltip: '退出全屏',
                onPressed: _toggleFullScreen,
                icon: const Icon(Icons.fullscreen_exit_rounded,
                    color: Colors.white70),
              ),
            ),
          ),
          Positioned(
            left: 16,
            bottom: safeBottom + 16,
            child: SizedBox(
              width: panelWidth,
              child: _buildFlightProgressPanel(
                progress: progress,
                phase: phase,
                remaining: remaining,
                theme: theme,
              ),
            ),
          ),
          Positioned(
            right: 16,
            bottom: safeBottom + 16,
            child: _FlightActionRail(
              audioEnabled: _audioEnabled,
              airplaneModeRequested: _airplaneModeRequested,
              airplaneModeActive: _airplaneModeActive,
              onAudio: _showAudioControls,
              onIncident: _startIncident,
              onAirplaneMode: _requestAirplaneMode,
              onStop: _land,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLandedStage(BuildContext context) {
    final theme = Theme.of(context);
    final outcome = _flightExitOutcome;
    final arrived = outcome.kind == FocusFlightExitKind.arrived;
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(_flightExitIcon(outcome.kind),
                  size: 64, color: AppColors.accent(theme.brightness)),
              const SizedBox(height: AppSpacing.md),
              Text(arrived ? '已抵达 ${_destination!.city}' : outcome.label,
                  style: theme.textTheme.headlineMedium),
              const SizedBox(height: AppSpacing.xs),
              Text(
                  arrived
                      ? '本次专注 $_minutes 分钟 · ${_task.label}'
                      : outcome.detail,
                  style: theme.textTheme.bodyMedium),
              const SizedBox(height: AppSpacing.xl),
              PillButton(
                label: '返回 IKO',
                icon: Icons.home_rounded,
                expanded: true,
                onPressed: _returnToIko,
              ),
            ],
          ),
        ),
      ),
    );
  }

  IconData _flightExitIcon(FocusFlightExitKind kind) => switch (kind) {
        FocusFlightExitKind.arrived => Icons.flight_land_rounded,
        FocusFlightExitKind.parachuted => Icons.paragliding_rounded,
        FocusFlightExitKind.cabinCrewEjected => Icons.exit_to_app_rounded,
      };

  String _clock() {
    final now = DateTime.now();
    return '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';
  }
}

class _FlightRouteBanner extends StatelessWidget {
  const _FlightRouteBanner({
    required this.routeText,
    required this.detail,
    required this.battery,
    required this.time,
    required this.theme,
    this.trailing,
  });

  final String routeText;
  final String detail;
  final int? battery;
  final String time;
  final ThemeData theme;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final light = theme.brightness == Brightness.light;
    final ink = light ? const Color(0xFF1A2930) : const Color(0xFFF5F2E9);
    final muted = light ? const Color(0xFF627078) : const Color(0xFFBDCBC9);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: light ? const Color(0xEEF7F4EA) : const Color(0xE51A2528),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
            color: light ? const Color(0xFFD3D8D3) : const Color(0xFF65777B)),
      ),
      child: Padding(
        padding: EdgeInsets.fromLTRB(12, 8, trailing == null ? 12 : 4, 8),
        child: Row(
          children: [
            const FlightBrandMark(size: 34),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    routeText,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleSmall?.copyWith(
                      color: ink,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '$detail  ·  BAT ${battery == null ? '—' : '$battery%'}  ·  $time',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: muted,
                      letterSpacing: .45,
                    ),
                  ),
                ],
              ),
            ),
            if (trailing != null) trailing!,
          ],
        ),
      ),
    );
  }
}

class _FlightHudIconButton extends StatelessWidget {
  const _FlightHudIconButton({
    required this.tooltip,
    required this.icon,
    required this.onPressed,
  });

  final String tooltip;
  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final light = Theme.of(context).brightness == Brightness.light;
    final ink = light ? const Color(0xFF23323A) : const Color(0xFFEAF0EB);
    return SizedBox(
      width: 46,
      height: 46,
      child: Material(
        color: light ? const Color(0xEEF7F4EA) : const Color(0xE51A2528),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(
              color: light ? const Color(0xFFD3D8D3) : const Color(0xFF65777B)),
        ),
        clipBehavior: Clip.antiAlias,
        child: IconButton(
          tooltip: tooltip,
          onPressed: onPressed,
          icon: Icon(icon, color: ink, size: 21),
        ),
      ),
    );
  }
}

class _FlightActionRail extends StatelessWidget {
  const _FlightActionRail({
    required this.audioEnabled,
    required this.airplaneModeRequested,
    required this.airplaneModeActive,
    required this.onAudio,
    required this.onIncident,
    required this.onAirplaneMode,
    required this.onStop,
  });

  final bool audioEnabled;
  final bool airplaneModeRequested;
  final bool airplaneModeActive;
  final VoidCallback onAudio;
  final VoidCallback onIncident;
  final VoidCallback onAirplaneMode;
  final VoidCallback onStop;

  @override
  Widget build(BuildContext context) {
    final light = Theme.of(context).brightness == Brightness.light;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: light ? const Color(0xEEF7F4EA) : const Color(0xE51A2528),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
            color: light ? const Color(0xFFD3D8D3) : const Color(0xFF65777B)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _railButton(
              tooltip: '声音调节',
              icon: audioEnabled
                  ? Icons.headphones_rounded
                  : Icons.volume_off_rounded,
              active: audioEnabled,
              onPressed: onAudio,
            ),
            _railDivider(),
            _railButton(
              tooltip: '突发事件',
              icon: Icons.warning_amber_rounded,
              onPressed: onIncident,
            ),
            _railDivider(),
            _railButton(
              tooltip: airplaneModeActive ? '关闭系统飞行模式' : '打开系统飞行模式',
              icon: airplaneModeRequested
                  ? Icons.airplanemode_active_rounded
                  : Icons.airplanemode_inactive_rounded,
              active: airplaneModeActive || airplaneModeRequested,
              onPressed: onAirplaneMode,
            ),
            _railDivider(),
            _railButton(
              tooltip: '结束专注',
              icon: Icons.stop_rounded,
              onPressed: onStop,
            ),
          ],
        ),
      ),
    );
  }

  Widget _railButton({
    required String tooltip,
    required IconData icon,
    required VoidCallback onPressed,
    bool active = false,
  }) =>
      SizedBox(
        width: 46,
        height: 46,
        child: IconButton(
          tooltip: tooltip,
          onPressed: onPressed,
          icon: Builder(
              builder: (context) => Icon(icon,
                  color: active
                      ? const Color(0xFFEBA36D)
                      : (Theme.of(context).brightness == Brightness.light
                          ? const Color(0xFF23323A)
                          : const Color(0xFFEAF0EB)))),
        ),
      );

  Widget _railDivider() => const SizedBox(
        width: 30,
        child: Divider(height: 1, color: Color(0x335D6268)),
      );
}

class _AudioPanel extends StatelessWidget {
  const _AudioPanel({
    required this.enabled,
    required this.engineVolume,
    required this.whiteNoiseVolume,
    required this.rainVolume,
    required this.engineEnabled,
    required this.whiteNoiseEnabled,
    required this.rainEnabled,
    required this.onEnabledChanged,
    required this.onEngineEnabledChanged,
    required this.onWhiteNoiseEnabledChanged,
    required this.onRainEnabledChanged,
    required this.onEngineVolumeChanged,
    required this.onWhiteNoiseVolumeChanged,
    required this.onRainVolumeChanged,
  });
  final bool enabled;
  final double engineVolume;
  final double whiteNoiseVolume;
  final double rainVolume;
  final bool engineEnabled;
  final bool whiteNoiseEnabled;
  final bool rainEnabled;
  final ValueChanged<bool> onEnabledChanged;
  final ValueChanged<bool> onEngineEnabledChanged;
  final ValueChanged<bool> onWhiteNoiseEnabledChanged;
  final ValueChanged<bool> onRainEnabledChanged;
  final ValueChanged<double> onEngineVolumeChanged;
  final ValueChanged<double> onWhiteNoiseVolumeChanged;
  final ValueChanged<double> onRainVolumeChanged;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 4, 10, 2),
      decoration: BoxDecoration(
        color: const Color(0xFF1B1D21),
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: const Color(0xFF3B3F45)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            height: 32,
            child: Row(
              children: [
                const Icon(Icons.headphones_rounded,
                    color: Colors.white70, size: 17),
                const SizedBox(width: 6),
                Text('声音调节',
                    style: text.titleSmall?.copyWith(
                      color: Colors.white,
                      fontSize: 13,
                    )),
                const Spacer(),
                SizedBox(
                  width: 40,
                  height: 26,
                  child: FittedBox(
                    fit: BoxFit.contain,
                    child: Switch.adaptive(
                        value: enabled, onChanged: onEnabledChanged),
                  ),
                ),
              ],
            ),
          ),
          _AudioLayerRow(
            icon: Icons.flight_rounded,
            label: '飞机引擎',
            value: engineVolume,
            available: enabled,
            enabled: enabled && engineEnabled,
            layerEnabled: engineEnabled,
            onChanged: onEngineVolumeChanged,
            onLayerChanged: enabled ? onEngineEnabledChanged : null,
          ),
          _AudioLayerRow(
            icon: Icons.graphic_eq_rounded,
            label: '白噪音',
            value: whiteNoiseVolume,
            available: enabled,
            enabled: enabled && whiteNoiseEnabled,
            layerEnabled: whiteNoiseEnabled,
            onChanged: onWhiteNoiseVolumeChanged,
            onLayerChanged: enabled ? onWhiteNoiseEnabledChanged : null,
          ),
          _AudioLayerRow(
            icon: Icons.water_drop_outlined,
            label: '雨声',
            value: rainVolume,
            available: enabled,
            enabled: enabled && rainEnabled,
            layerEnabled: rainEnabled,
            onChanged: onRainVolumeChanged,
            onLayerChanged: enabled ? onRainEnabledChanged : null,
          ),
        ],
      ),
    );
  }
}

class _AudioLayerRow extends StatelessWidget {
  const _AudioLayerRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.available,
    required this.enabled,
    required this.layerEnabled,
    required this.onChanged,
    required this.onLayerChanged,
  });

  final IconData icon;
  final String label;
  final double value;
  final bool available;
  final bool enabled;
  final bool layerEnabled;
  final ValueChanged<double> onChanged;
  final ValueChanged<bool>? onLayerChanged;

  @override
  Widget build(BuildContext context) {
    final switchTheme = Theme.of(context).switchTheme.copyWith(
          thumbColor: WidgetStateProperty.resolveWith(
            (states) => !available
                ? Colors.white24
                : states.contains(WidgetState.selected)
                    ? Colors.white
                    : Colors.white30,
          ),
          trackColor: WidgetStateProperty.resolveWith(
            (states) => !available
                ? Colors.white10
                : states.contains(WidgetState.selected)
                    ? const Color(0xFF7869A2)
                    : Colors.white12,
          ),
        );
    return SizedBox(
      height: 32,
      child: Row(
        children: [
          Expanded(
            child: _AudioSlider(
              icon: icon,
              label: label,
              value: value,
              available: available,
              enabled: enabled,
              onChanged: onChanged,
            ),
          ),
          Theme(
            data: Theme.of(context).copyWith(switchTheme: switchTheme),
            child: SizedBox(
              width: 38,
              height: 24,
              child: FittedBox(
                fit: BoxFit.contain,
                child: Switch.adaptive(
                  value: layerEnabled,
                  onChanged: onLayerChanged,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AudioSlider extends StatelessWidget {
  const _AudioSlider({
    required this.icon,
    required this.label,
    required this.value,
    required this.available,
    required this.enabled,
    required this.onChanged,
  });

  final IconData icon;
  final String label;
  final double value;
  final bool available;
  final bool enabled;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Icon(
            icon,
            color: !available
                ? Colors.white24
                : enabled
                    ? Colors.white60
                    : Colors.white30,
            size: 15,
          ),
          const SizedBox(width: 5),
          SizedBox(
            width: 58,
            child: Text(
              label,
              style: TextStyle(
                color: !available
                    ? Colors.white24
                    : enabled
                        ? Colors.white70
                        : Colors.white38,
                fontSize: 10,
              ),
            ),
          ),
          Icon(
            Icons.volume_down_rounded,
            color: !available ? Colors.white12 : Colors.white38,
            size: 14,
          ),
          Expanded(
            child: SliderTheme(
              data: SliderTheme.of(context).copyWith(
                trackHeight: 1.5,
                thumbShape: const RoundSliderThumbShape(
                  enabledThumbRadius: 5,
                  disabledThumbRadius: 4,
                ),
                overlayShape: const RoundSliderOverlayShape(overlayRadius: 9),
              ),
              child: Slider(
                value: value,
                onChanged: enabled ? onChanged : null,
              ),
            ),
          ),
          Icon(
            Icons.volume_up_rounded,
            color: !available ? Colors.white12 : Colors.white38,
            size: 14,
          ),
        ],
      );
}

String _fmtRemaining(Duration duration) {
  final safe = duration.isNegative ? Duration.zero : duration;
  final h = safe.inHours;
  final m = safe.inMinutes.remainder(60).toString().padLeft(2, '0');
  final s = safe.inSeconds.remainder(60).toString().padLeft(2, '0');
  return h > 0 ? '$h:$m:$s' : '$m:$s';
}
