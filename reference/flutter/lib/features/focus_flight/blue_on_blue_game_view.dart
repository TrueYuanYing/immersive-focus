import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'blue_on_blue_game.dart';
import 'flight_3d_view.dart';
import 'focus_flight_platform.dart';

/// 叠加在真实 3D 飞行画面上的短暂事件，不跳转页面，也不会暂停专注计时。
class BlueOnBlueGameView extends StatefulWidget {
  const BlueOnBlueGameView({
    required this.onCompleted,
    this.flightLabel = 'FLIGHT IN PROGRESS',
    this.flightPhase = 'CRUISE',
    this.remaining = '—',
    this.flightProgress = 0,
    this.flightSeed = 42,
    super.key,
  });

  final ValueChanged<bool> onCompleted;
  final String flightLabel;
  final String flightPhase;
  final String remaining;
  final double flightProgress;
  final int flightSeed;

  @override
  State<BlueOnBlueGameView> createState() => _BlueOnBlueGameViewState();
}

class _BlueOnBlueGameViewState extends State<BlueOnBlueGameView>
    with SingleTickerProviderStateMixin {
  late final BlueOnBlueGame _game;
  late final AnimationController _ticker;
  late final FocusNode _keyboardFocus;
  DateTime _lastFrame = DateTime.now();
  int _frame = 0;
  int _lastImpactToken = 0;
  bool _completionSent = false;
  bool _sceneReady = false;

  @override
  void initState() {
    super.initState();
    _game = BlueOnBlueGame(startInWarning: true, seed: widget.flightSeed);
    _keyboardFocus = FocusNode(debugLabel: 'blue-on-blue-keyboard');
    unawaited(FocusFlightPlatform.playSfx('whoosh', volume: 0.10));
    _ticker = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 1),
    )
      ..addListener(_tick)
      ..repeat();
  }

  @override
  void dispose() {
    _keyboardFocus.dispose();
    _ticker.dispose();
    super.dispose();
  }

  void _tick() {
    final now = DateTime.now();
    final dt = now.difference(_lastFrame).inMicroseconds / 1000000;
    _lastFrame = now;
    // WebView takes longer to initialize than the incident warning. Keep the
    // gameplay clock still until its first scene state reaches WebGL.
    if (!_sceneReady) return;
    final previousState = _game.state;
    _game.update(dt);
    if (_game.impactToken > _lastImpactToken) {
      _lastImpactToken = _game.impactToken;
      if (_game.state != IncidentState.failed) {
        unawaited(FocusFlightPlatform.playSfx(
          _game.won ? 'explosion' : 'impact',
          volume: _game.won ? 0.15 : 0.08,
        ));
      }
    }
    if (_game.state == IncidentState.failed &&
        previousState != IncidentState.failed) {
      unawaited(FocusFlightPlatform.playSfx('explosion', volume: 0.10));
    }
    if (_game.state == IncidentState.exiting && !_completionSent) {
      _completionSent = true;
      // 让 WebGL 相机完成 exiting → 主航线的平滑回位，再卸载事件层。
      if (mounted) setState(() {});
      _ticker.stop();
      Future<void>.delayed(const Duration(milliseconds: 1300), () {
        if (mounted) widget.onCompleted(_game.won);
      });
    }
    // WebGL 场景自行以 60 FPS 渲染；Flutter 只把战斗实体以约 30 FPS
    // 推送过去，避免整棵 Widget Tree 每帧重建，又保留高速追逐的连续感。
    if (mounted && _frame++ % 2 == 0) setState(() {});
  }

  void _fireScatter() {
    if (_game.fireScatter()) {
      unawaited(FocusFlightPlatform.playSfx('burst', volume: 0.06));
      setState(() {});
    }
  }

  void _fireTracking() {
    if (_game.fireTracking()) {
      unawaited(FocusFlightPlatform.playSfx('track', volume: 0.08));
      setState(() {});
    }
  }

  void _cycleTarget() {
    _game.cycleTarget();
    setState(() {});
  }

  void _move(double dx, double dy) {
    if (_game.state != IncidentState.active) return;
    _game.setFighterInput(dx, dy);
    setState(() {});
  }

  void _exitFailure() {
    if (_completionSent || _game.state != IncidentState.failed) return;
    _game.dismissFailure();
    // 失败由用户确认后结束事件，但仍留出相机回到主航线的一小段时间。
    setState(() {});
  }

  List<Map<String, Object?>> get _projectileState => _game.projectiles
      .map(
        (projectile) => flight3DProjectile(
          x: projectile.x,
          y: projectile.y,
          vx: projectile.vx,
          vy: projectile.vy,
          homing: projectile.homing,
          targetIndex: projectile.targetIndex,
        ),
      )
      .toList(growable: false);

  List<Map<String, Object?>> get _threatState => _game.threats
      .map(
        (threat) => <String, Object?>{
          'index': threat.index,
          'x': threat.x,
          'y': threat.y,
          'vx': threat.vx,
          'vy': threat.vy,
          'health': threat.health,
          'active': threat.active,
          'resolved': threat.resolved,
          'slowRemaining': threat.slowRemaining,
          'speedMultiplier': threat.speedMultiplier,
        },
      )
      .toList(growable: false);

  @override
  Widget build(BuildContext context) {
    return KeyboardListener(
      focusNode: _keyboardFocus,
      autofocus: true,
      onKeyEvent: (event) {
        if (event is! KeyDownEvent) return;
        if (event.logicalKey == LogicalKeyboardKey.keyJ) {
          _fireScatter();
        } else if (event.logicalKey == LogicalKeyboardKey.keyK) {
          _fireTracking();
        } else if (event.logicalKey == LogicalKeyboardKey.keyT) {
          _cycleTarget();
        } else if (event.logicalKey == LogicalKeyboardKey.arrowLeft) {
          _move(-0.055, 0);
        } else if (event.logicalKey == LogicalKeyboardKey.arrowRight) {
          _move(0.055, 0);
        } else if (event.logicalKey == LogicalKeyboardKey.arrowUp) {
          _move(0, -0.045);
        } else if (event.logicalKey == LogicalKeyboardKey.arrowDown) {
          _move(0, 0.045);
        }
      },
      child: Stack(
        fit: StackFit.expand,
        children: [
          Flight3DView(
            key: const ValueKey('blue-on-blue-bwp-scene'),
            progress: widget.flightProgress,
            seed: widget.flightSeed,
            incidentState: _game.state.name,
            fighterX: _game.fighterX,
            fighterY: _game.fighterYPosition,
            fighterVelocityX: _game.fighterVelocityX,
            fighterVelocityY: _game.fighterVelocityY,
            missileX: _game.missileX,
            missileY: _game.missileY,
            missileHealth: _game.missileHealth,
            threats: _threatState,
            activeThreatIndex: _game.activeThreatIndex,
            projectiles: _projectileState,
            showControls: false,
            onReady: () {
              if (mounted) setState(() => _sceneReady = true);
            },
          ),
          if (_game.state == IncidentState.warning) _buildIncidentTitle(),
          _buildTopStatus(context),
          if (_game.state == IncidentState.targetDestroyed)
            _buildSuccess(context),
          if (_game.state == IncidentState.failed) _buildFailure(context),
          if (_game.state == IncidentState.active) _buildControls(context),
        ],
      ),
    );
  }

  Widget _buildIncidentTitle() {
    return IgnorePointer(
      child: Center(
        child: TweenAnimationBuilder<double>(
          tween: Tween(begin: 0, end: 1),
          duration: const Duration(milliseconds: 520),
          builder: (context, value, child) => Opacity(
            opacity: value,
            child: Transform.translate(
              offset: Offset((1 - value) * 5, 0),
              child: child,
            ),
          ),
          child: const Text(
            incidentTitle,
            style: TextStyle(
              color: Color(0xFFFF7667),
              fontSize: 30,
              fontWeight: FontWeight.w800,
              letterSpacing: 2.4,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTopStatus(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 620;
    final hp = (_game.missileHealth / BlueOnBlueGame.maxHealth)
        .clamp(0.0, 1.0)
        .toDouble();
    return Positioned(
      top: 16,
      left: 18,
      right: 18,
      child: GestureDetector(
        onTap: _game.state == IncidentState.active ? _cycleTarget : null,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: const Color(0xE91B2529),
            borderRadius: BorderRadius.circular(13),
            border: Border.all(color: const Color(0xFFB55C50)),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(
              children: [
                const Icon(Icons.warning_amber_rounded,
                    color: Color(0xFFFF7667), size: 19),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _game.state == IncidentState.failed
                        ? incidentTitle
                        : compact
                            ? 'BLUE ON BLUE'
                            : 'BLUE ON BLUE  ·  INCIDENT',
                    style: const TextStyle(
                      color: Color(0xFFFFE8DE),
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.4,
                    ),
                  ),
                ),
                Text(
                  _game.state == IncidentState.failed
                      ? 'IMPACT'
                      : compact
                          ? '防护 ${_game.shieldRemaining}/${BlueOnBlueGame.maxShield} · T${_game.activeThreatIndex + 1}/${_game.totalThreats}'
                          : '防护 ${_game.shieldRemaining}/${BlueOnBlueGame.maxShield}  ·  切换目标 T${_game.activeThreatIndex + 1}/${_game.totalThreats} · '
                              '${_game.missileHealth.ceil()} HP',
                  style: const TextStyle(
                    color: Color(0xFFFFC3AE),
                    fontSize: 11,
                    fontFeatures: [FontFeature.tabularFigures()],
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  width: compact ? 54 : 110,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(2),
                    child: LinearProgressIndicator(
                      minHeight: 3,
                      value: hp,
                      backgroundColor: const Color(0xFF4F3838),
                      valueColor:
                          const AlwaysStoppedAnimation(Color(0xFFFF7667)),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildControls(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final compact = width < 520;
    final padSize = compact ? 132.0 : 172.0;
    final padRadius = compact ? 43.0 : 54.0;
    final weaponWidth = compact ? 78.0 : 94.0;
    final weaponHeight = compact ? 60.0 : 68.0;
    return Positioned(
      left: compact ? 10 : 20,
      right: compact ? 10 : 20,
      bottom: compact ? 12 : 22,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          _MovePad(
            enabled: true,
            onMove: _move,
            size: padSize,
            radius: padRadius,
          ),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              _WeaponButton(
                label: 'BURST',
                subtitle: _cooldownText(_game.scatterCooldown, '×11'),
                icon: Icons.scatter_plot_rounded,
                enabled: _game.scatterReady,
                onPressed: _fireScatter,
                width: weaponWidth,
                height: weaponHeight,
              ),
              SizedBox(width: compact ? 5 : 8),
              _WeaponButton(
                label: 'TRACK',
                subtitle: _cooldownText(_game.trackingCooldown, '×2'),
                icon: Icons.gps_fixed_rounded,
                enabled: _game.trackingReady,
                onPressed: _fireTracking,
                filled: true,
                width: weaponWidth,
                height: weaponHeight,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildFailure(BuildContext context) {
    return Positioned.fill(
      child: ColoredBox(
        color: const Color(0xE8090A0C),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                incidentTitle,
                style: TextStyle(
                  color: Color(0xFFF2F2F0),
                  fontSize: 32,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 5,
                ),
              ),
              const SizedBox(height: 14),
              const Text(
                'IMPACT  /  FIGHTER HIT',
                style: TextStyle(
                  color: Color(0xFFB1B6B9),
                  fontSize: 11,
                  letterSpacing: 1.8,
                ),
              ),
              const SizedBox(height: 28),
              OutlinedButton.icon(
                onPressed: _exitFailure,
                icon: const Icon(Icons.arrow_back_rounded, size: 18),
                label: const Text('返回航班'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: const Color(0xFFE8EAE8),
                  side: const BorderSide(color: Color(0xFF6A7073)),
                  minimumSize: const Size(160, 48),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSuccess(BuildContext context) {
    return IgnorePointer(
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'THREAT INTERCEPTED',
              style: TextStyle(
                color: Color(0xFFF1F1F0),
                fontSize: 13,
                fontWeight: FontWeight.w700,
                letterSpacing: 2.1,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              _game.successMessage,
              style: const TextStyle(
                color: Color(0xFFD9DCDB),
                fontSize: 14,
                fontWeight: FontWeight.w600,
                letterSpacing: 2.4,
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _cooldownText(double seconds, String readySuffix) =>
      seconds <= 0 ? readySuffix : '${seconds.ceil()}s';
}

class _MovePad extends StatefulWidget {
  const _MovePad({
    required this.enabled,
    required this.onMove,
    this.size = 172,
    this.radius = 54,
  });

  final bool enabled;
  final void Function(double dx, double dy) onMove;
  final double size;
  final double radius;

  @override
  State<_MovePad> createState() => _MovePadState();
}

class _MovePadState extends State<_MovePad> {
  Offset _knob = Offset.zero;
  static const double _deadZone = 0.14;

  void _update(Offset localPosition) {
    final center = Offset(widget.size / 2, widget.size / 2);
    final delta = localPosition - center;
    final distance = delta.distance;
    final clamped =
        distance > widget.radius ? delta / distance * widget.radius : delta;
    setState(() => _knob = clamped);
    final normalized = clamped / widget.radius;
    final magnitude = normalized.distance;
    if (magnitude <= _deadZone) {
      widget.onMove(0, 0);
      return;
    }
    final remapped = (magnitude - _deadZone) / (1 - _deadZone);
    final output = normalized / magnitude * remapped;
    widget.onMove(output.dx, output.dy);
  }

  void _reset() {
    setState(() => _knob = Offset.zero);
    widget.onMove(0, 0);
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '移动战斗机',
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onPanStart:
            widget.enabled ? (details) => _update(details.localPosition) : null,
        onPanUpdate:
            widget.enabled ? (details) => _update(details.localPosition) : null,
        onPanEnd: widget.enabled ? (_) => _reset() : null,
        onPanCancel: widget.enabled ? _reset : null,
        child: Container(
          width: widget.size,
          height: widget.size,
          decoration: BoxDecoration(
            color: const Color(0xD51B292C),
            shape: BoxShape.circle,
            border: Border.all(color: const Color(0xFF78A6A7)),
            boxShadow: const [
              BoxShadow(
                color: Color(0x55000000),
                blurRadius: 18,
                spreadRadius: 2,
              ),
            ],
          ),
          child: Stack(
            alignment: Alignment.center,
            children: [
              Container(
                width: widget.size * .65,
                height: widget.size * .65,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: const Color(0xFF4D5255),
                    width: 1,
                  ),
                ),
              ),
              const Icon(Icons.open_with_rounded,
                  color: Color(0xFF777D80), size: 24),
              Transform.translate(
                offset: _knob,
                child: Container(
                  width: widget.size * .30,
                  height: widget.size * .30,
                  decoration: BoxDecoration(
                    color: const Color(0xFFB8DBD6).withValues(alpha: .96),
                    shape: BoxShape.circle,
                    boxShadow: const [
                      BoxShadow(color: Color(0x66000000), blurRadius: 8),
                    ],
                  ),
                  child: Icon(Icons.flight_rounded,
                      color: const Color(0xFF153039), size: widget.size * .105),
                ),
              ),
              const Positioned(
                bottom: 12,
                child: Text(
                  'MOVE  ·  HOLD',
                  style: TextStyle(
                      color: Color(0xFFB4B8BA),
                      fontSize: 8,
                      letterSpacing: 1.2),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _WeaponButton extends StatelessWidget {
  const _WeaponButton({
    required this.label,
    required this.subtitle,
    required this.icon,
    required this.enabled,
    required this.onPressed,
    this.filled = false,
    this.width = 94,
    this.height = 68,
  });

  final String label;
  final String subtitle;
  final IconData icon;
  final bool enabled;
  final VoidCallback onPressed;
  final bool filled;
  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      child: GestureDetector(
        onTap: enabled ? onPressed : null,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          width: width,
          height: height,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
          decoration: BoxDecoration(
            color: filled
                ? const Color(0xFFEBA36D)
                    .withValues(alpha: enabled ? 0.98 : 0.25)
                : const Color(0xDB1B292C),
            borderRadius: BorderRadius.circular(13),
            border: Border.all(
              color:
                  enabled ? const Color(0xFFEBA36D) : const Color(0xFF526166),
            ),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                size: 19,
                color:
                    filled ? const Color(0xFF172127) : const Color(0xFFF2D2BA),
              ),
              const SizedBox(height: 2),
              Text(
                '$label  $subtitle',
                maxLines: 1,
                style: TextStyle(
                  color: filled
                      ? const Color(0xFF172127)
                      : const Color(0xFFF2D2BA),
                  fontSize: 9,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.8,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
