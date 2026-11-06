import 'dart:math' as math;

const incidentTitle = 'BLUE ON BLUE';

enum IncidentState {
  idle,
  warning,
  entering,
  active,
  targetDestroyed,
  impacting,
  failed,
  exiting,
}

enum BlueOnBlueParticleKind { trail, flash, ring, debris, smoke }

/// BLUE ON BLUE 小游戏中的一枚拦截弹。
///
/// 坐标使用 0..1 的归一化空间，绘制层可以在任意屏幕尺寸上复用。
class BlueOnBlueProjectile {
  BlueOnBlueProjectile({
    required this.x,
    required this.y,
    required this.vx,
    required this.vy,
    required this.damage,
    required this.homing,
    this.targetIndex = 0,
  })  : previousX = x,
        previousY = y;

  double x;
  double y;
  double previousX;
  double previousY;
  double vx;
  double vy;
  double damage;
  bool homing;
  int targetIndex;
  double life = 5.0;

  void reset({
    required double x,
    required double y,
    required double vx,
    required double vy,
    required double damage,
    required bool homing,
    int targetIndex = 0,
  }) {
    this.x = x;
    this.y = y;
    previousX = x;
    previousY = y;
    this.vx = vx;
    this.vy = vy;
    this.damage = damage;
    this.homing = homing;
    this.targetIndex = targetIndex;
    life = 5;
  }
}

/// 一枚从战斗开始就同时追击的威胁导弹。
///
/// 它不是临时的 UI 占位物：游戏逻辑、WebGL 战斗几何和 HUD 都读取同一
/// 份实体状态。拦截弹命中后会短暂压低它的速度，避免“命中但手感没有
/// 反馈”；三枚导弹则各自拥有独立轨迹，不再按波次排队进场。
class BlueOnBlueThreat {
  BlueOnBlueThreat({
    required this.index,
    required this.x,
    required this.y,
    required this.vx,
    required this.vy,
    required this.health,
    this.active = false,
    this.resolved = false,
  })  : previousX = x,
        previousY = y;

  final int index;
  double x;
  double y;
  double previousX;
  double previousY;
  double vx;
  double vy;
  double health;
  bool active;
  bool resolved;
  double slowRemaining = 0;
  double slowFactor = 1;

  double get speedMultiplier => slowRemaining > 0 ? slowFactor : 1;

  void applySlow({double duration = 1.25, double factor = .42}) {
    slowRemaining = math.max(slowRemaining, duration);
    slowFactor = math.min(slowFactor, factor);
  }

  void tickSlow(double dt) {
    if (slowRemaining <= 0) return;
    slowRemaining = math.max(0, slowRemaining - dt);
    if (slowRemaining == 0) slowFactor = 1;
  }
}

/// 用于尾迹与爆炸的轻量粒子；不使用图片或物理引擎，适合平板后台场景。
class BlueOnBlueParticle {
  BlueOnBlueParticle({
    required this.x,
    required this.y,
    required this.vx,
    required this.vy,
    required this.life,
    required this.ttl,
    required this.size,
    required this.shade,
    this.trail = false,
    this.kind = BlueOnBlueParticleKind.debris,
    this.growth = 0,
  });

  double x;
  double y;
  double vx;
  double vy;
  double life;
  double ttl;
  double size;
  double shade;
  bool trail;
  BlueOnBlueParticleKind kind;
  double growth;

  void reset({
    required double x,
    required double y,
    required double vx,
    required double vy,
    required double life,
    required double size,
    required double shade,
    required BlueOnBlueParticleKind kind,
    bool trail = false,
    double growth = 0,
  }) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    ttl = life;
    this.size = size;
    this.shade = shade;
    this.kind = kind;
    this.trail = trail;
    this.growth = growth;
  }
}

/// BLUE ON BLUE 的纯逻辑模型。
///
/// 输入只有两个开火动作和帧时间，便于单元测试，也便于将来替换为
/// 手柄、键盘或无障碍操作，而不把状态塞进 CustomPainter。
class BlueOnBlueGame {
  // The first wave remains visible while the player reads the HUD and fires
  // two burst salvos. Damage starts only after that playable opening.
  static const activeGracePeriod = 8.5;

  BlueOnBlueGame({
    math.Random? random,
    int? seed,
    int particleBudget = 180,
    bool startInWarning = false,
  })  : _random = random ?? math.Random(seed ?? 7),
        _particleBudget = particleBudget.clamp(40, 220).toInt(),
        state = startInWarning ? IncidentState.warning : IncidentState.active {
    _threats = <BlueOnBlueThreat>[
      BlueOnBlueThreat(
        index: 0,
        x: 1.10,
        y: .70,
        vx: -.34,
        vy: -.02,
        health: maxHealth,
        active: true,
      ),
      BlueOnBlueThreat(
        index: 1,
        x: 1.13,
        y: .34,
        vx: -.38,
        vy: .04,
        health: maxHealth,
        active: true,
      ),
      BlueOnBlueThreat(
        index: 2,
        x: 1.16,
        y: .80,
        vx: -.42,
        vy: -.05,
        health: maxHealth,
        active: true,
      ),
    ];
  }

  static const double maxHealth = 100;
  static const int maxShield = 2;
  static const int threatCount = 3;
  static const double fighterY = 0.22;
  static const successMessages = <String>[
    '有惊无险',
    '航线安全',
    '平稳脱险',
    '安然无恙',
    '威胁解除',
  ];

  final math.Random _random;
  final int _particleBudget;
  final List<BlueOnBlueProjectile> _projectiles = [];
  final List<BlueOnBlueProjectile> _projectilePool = [];
  final List<BlueOnBlueParticle> _particles = [];
  final List<BlueOnBlueParticle> _particlePool = [];
  late final List<BlueOnBlueThreat> _threats;
  late final String _successMessage =
      successMessages[_random.nextInt(successMessages.length)];
  double _trailClock = 0;
  double _stateElapsed = 0;

  IncidentState state;
  double fighterX = 0.76;
  double fighterYPosition = fighterY;
  int activeThreatIndex = 0;
  double elapsed = 0;
  double _activeElapsed = 0;
  double _shieldImmunity = 0;
  int shieldRemaining = maxShield;
  double scatterCooldown = 0;
  double trackingCooldown = 0;
  double fighterInputX = 0;
  double fighterInputY = 0;
  double fighterVelocityX = 0;
  double fighterVelocityY = 0;
  bool won = false;
  int impactToken = 0;
  double impactX = 0;
  double impactY = 0;
  int impactThreatIndex = 0;
  bool impactLarge = false;

  Iterable<BlueOnBlueProjectile> get projectiles => _projectiles;
  Iterable<BlueOnBlueParticle> get particles => _particles;
  List<BlueOnBlueThreat> get threats =>
      List<BlueOnBlueThreat>.unmodifiable(_threats);
  int get totalThreats => _threats.length;
  BlueOnBlueThreat get _activeThreat =>
      _threats[activeThreatIndex.clamp(0, _threats.length - 1)];

  // 维持旧调用点兼容，同时让一切追踪、碰撞和 HUD 自动指向当前波次。
  double get missileX => _activeThreat.x;
  set missileX(double value) => _activeThreat.x = value;
  double get missileY => _activeThreat.y;
  set missileY(double value) => _activeThreat.y = value;
  double get missileVx => _activeThreat.vx;
  set missileVx(double value) => _activeThreat.vx = value;
  double get missileVy => _activeThreat.vy;
  set missileVy(double value) => _activeThreat.vy = value;
  double get missileHealth => _activeThreat.health;
  set missileHealth(double value) => _activeThreat.health = value;

  bool get scatterReady =>
      scatterCooldown <= 0 && state == IncidentState.active;
  bool get trackingReady =>
      trackingCooldown <= 0 && state == IncidentState.active;

  /// 切换武器锁定目标；已击落的威胁不会重新进入选择列表。
  int cycleTarget() {
    if (state != IncidentState.active) return activeThreatIndex;
    for (var step = 1; step <= _threats.length; step++) {
      final index = (activeThreatIndex + step) % _threats.length;
      if (_threats[index].active && !_threats[index].resolved) {
        activeThreatIndex = index;
        return index;
      }
    }
    return activeThreatIndex;
  }

  double get stateElapsed => _stateElapsed;
  String get successMessage => _successMessage;

  void beginIncident() {
    state = IncidentState.warning;
    _stateElapsed = 0;
  }

  /// 失败画面由用户确认后退出；失败不会自动重生导弹或继续战斗。
  void dismissFailure() {
    if (state != IncidentState.failed) return;
    state = IncidentState.exiting;
    _stateElapsed = 0;
  }

  void moveFighter(double direction) {
    moveFighterBy(direction.clamp(-1.0, 1.0).toDouble() * 0.055, 0);
  }

  /// 连续遥感轴输入。位置由 update() 内的加速度/阻尼推进，避免触控帧率
  /// 直接决定战机速度，也避免每次拖动只跳一个离散坐标。
  void setFighterInput(double x, double y) {
    if (won || state != IncidentState.active) return;
    fighterInputX = x.clamp(-1.0, 1.0).toDouble();
    fighterInputY = y.clamp(-1.0, 1.0).toDouble();
  }

  void clearFighterInput() {
    fighterInputX = 0;
    fighterInputY = 0;
  }

  /// 键盘和无障碍操作使用的离散微调，不改变连续遥感状态。
  void moveFighterBy(double dx, double dy) {
    if (won || state != IncidentState.active) return;
    clearFighterInput();
    fighterVelocityX = 0;
    fighterVelocityY = 0;
    fighterX = (fighterX + dx).clamp(0.57, 0.94).toDouble();
    fighterYPosition = (fighterYPosition + dy).clamp(0.10, 0.72).toDouble();
  }

  /// 向机尾均匀发射 11 枚霰弹，不受追踪弹的目标锁定影响。
  bool fireScatter() {
    if (!scatterReady || won) return false;
    scatterCooldown = 1.3;
    const count = 11;
    for (var i = 0; i < count; i++) {
      final spread = (i - (count - 1) / 2) / ((count - 1) / 2);
      final angle = spread * 0.68;
      const speed = 0.82;
      _emitProjectile(
        x: fighterX + 0.025,
        y: fighterYPosition,
        vx: math.cos(angle) * speed,
        vy: math.sin(angle) * speed,
        damage: 5,
        homing: false,
        targetIndex: -1,
      );
    }
    return true;
  }

  /// 一次发射正好 2 枚追踪拦截弹，冷却更长但命中伤害高。
  bool fireTracking() {
    if (!trackingReady || won) return false;
    trackingCooldown = 2.4;
    final targetIndex = activeThreatIndex;
    final angle = math.atan2(missileY - fighterYPosition, missileX - fighterX);
    for (var i = 0; i < 2; i++) {
      final offset = i == 0 ? -0.014 : 0.014;
      _emitProjectile(
        x: fighterX - 0.025,
        y: fighterYPosition + offset,
        vx: math.cos(angle + (i == 0 ? -0.14 : 0.14)) * 0.66,
        vy: math.sin(angle + (i == 0 ? -0.14 : 0.14)) * 0.66,
        damage: 44,
        homing: true,
        targetIndex: targetIndex,
      );
    }
    return true;
  }

  /// 推进游戏一帧，dt 会被限制在 50ms 内，避免切后台回来时瞬移。
  void update(double deltaSeconds) {
    final dt = deltaSeconds.clamp(0.0, 0.05).toDouble();
    elapsed += dt;
    _stateElapsed += dt;
    scatterCooldown = math.max(0, scatterCooldown - dt);
    trackingCooldown = math.max(0, trackingCooldown - dt);
    _shieldImmunity = math.max(0, _shieldImmunity - dt);
    _advanceState();

    if (state == IncidentState.active) {
      _activeElapsed += dt;
      _updateFighterMotion(dt);
      _updateMissileEvasion(dt);
      // 每一枚威胁导弹都从右后方的航线外高速入场；给用户稳定的反应
      // 窗口，避免它刚进屏就直接贴脸结束，同时保留战斗的高速感。碰撞
      // 使用导弹本帧的扫掠线段，避免高速运动穿过战机却被判定为“没撞”。
      final impactThreat =
          _activeElapsed >= activeGracePeriod && _shieldImmunity <= 0
              ? _findThreatCollision()
              : null;
      if (impactThreat != null) {
        if (shieldRemaining > 1) {
          shieldRemaining--;
          _shieldImmunity = 2.8;
          _registerImpact(impactThreat.x, impactThreat.y, impactThreat.index,
              large: false);
          _spawnExplosion(impactThreat.x, impactThreat.y, large: false);
          // 击中后把该威胁推回空域边缘。短暂免伤避免三枚导弹同帧连锁
          // 扣除防护，同时让玩家看清反馈并重新锁定目标。
          impactThreat
            ..x = .94
            ..y = fighterYPosition < .48 ? .86 : .12
            ..previousX = .94
            ..previousY = fighterYPosition < .48 ? .86 : .12
            ..vx = -.18
            ..vy = 0;
        } else {
          // 最后一击先播撞击，再进入失败 UI。
          shieldRemaining = 0;
          state = IncidentState.impacting;
          _stateElapsed = 0;
          _registerImpact(impactThreat.x, impactThreat.y, impactThreat.index,
              large: true);
          _spawnExplosion(impactThreat.x, impactThreat.y, large: true);
          _projectilePool.addAll(_projectiles);
          _projectiles.clear();
        }
      }
    }

    if (state == IncidentState.active) {
      _trailClock += dt;
      if (_trailClock >= 0.038) {
        _trailClock = 0;
        for (final threat in _threats) {
          if (!threat.active || threat.resolved) continue;
          _emitParticle(
            x: threat.x + 0.035,
            y: threat.y,
            vx: 0.045,
            vy: 0,
            life: 0.42,
            size: threat.slowRemaining > 0 ? 0.009 : 0.012,
            shade: threat.slowRemaining > 0 ? 0.38 : 0.48,
            trail: true,
            kind: BlueOnBlueParticleKind.trail,
          );
        }
      }

      for (var i = _projectiles.length - 1; i >= 0; i--) {
        final projectile = _projectiles[i];
        projectile.life -= dt;
        projectile.previousX = projectile.x;
        projectile.previousY = projectile.y;
        if (projectile.homing) _steerTowardsTarget(projectile, dt);
        projectile.x += projectile.vx * dt;
        projectile.y += projectile.vy * dt;
        _emitParticle(
          x: projectile.x,
          y: projectile.y,
          vx: -projectile.vx * 0.08,
          vy: -projectile.vy * 0.08,
          life: 0.22,
          size: projectile.homing ? 0.008 : 0.005,
          shade: projectile.homing ? 0.92 : 0.66,
          trail: true,
          kind: BlueOnBlueParticleKind.trail,
        );
        final target = projectile.homing
            ? _threatForProjectile(projectile)
            : _threats.where((threat) => threat.active && !threat.resolved)
                .where((threat) =>
                    _segmentDistanceSquared(
                      projectile.previousX,
                      projectile.previousY,
                      projectile.x,
                      projectile.y,
                      threat.x,
                      threat.y,
                    ) <
                    math.pow(0.048, 2))
                .firstOrNull;
        if (projectile.homing &&
            (target == null || !target.active || target.resolved)) {
          _removeProjectileAt(i);
          continue;
        }
        final hit = target != null && _segmentDistanceSquared(
              projectile.previousX,
              projectile.previousY,
              projectile.x,
              projectile.y,
              target.x,
              target.y,
            ) <
            math.pow(projectile.homing ? 0.060 : 0.048, 2);
        if (target != null && hit) {
          target.health = math.max(0, target.health - projectile.damage);
          target.applySlow(
            duration: projectile.homing ? 1.35 : .80,
            factor: projectile.homing ? .38 : .55,
          );
          _registerImpact(
            target.x,
            target.y,
            target.index,
            large: projectile.homing,
          );
          _spawnExplosion(target.x, target.y, large: projectile.homing);
          _removeProjectileAt(i);
          if (target.health <= 0) {
            _resolveThreat(target.index);
          }
          if (state != IncidentState.active) {
            break;
          }
        } else if (projectile.life <= 0 ||
            projectile.x < -0.1 ||
            projectile.x > 1.1 ||
            projectile.y < -0.1 ||
            projectile.y > 1.1) {
          _removeProjectileAt(i);
        }
      }
    }

    for (var i = _particles.length - 1; i >= 0; i--) {
      final particle = _particles[i];
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.size += particle.growth * dt;
      particle.vx *= math.pow(0.08, dt).toDouble();
      particle.vy *= math.pow(0.08, dt).toDouble();
      if (particle.life <= 0) _removeParticleAt(i);
    }
    while (_particles.length > _particleBudget) {
      _removeParticleAt(0);
    }
  }

  void _advanceState() {
    if (state == IncidentState.warning && _stateElapsed >= 0.95) {
      state = IncidentState.entering;
      _stateElapsed = 0;
    } else if (state == IncidentState.entering && _stateElapsed >= 0.50) {
      state = IncidentState.active;
      _stateElapsed = 0;
      _activeElapsed = 0;
    } else if (state == IncidentState.targetDestroyed &&
        _stateElapsed >= 0.90) {
      state = IncidentState.exiting;
      _stateElapsed = 0;
    } else if (state == IncidentState.impacting && _stateElapsed >= .68) {
      state = IncidentState.failed;
      _stateElapsed = 0;
    }
  }

  void _updateFighterMotion(double dt) {
    // 使用 delta-time + 死区 + 指数响应：斜向不会比单轴快，松手后保留
    // 短暂惯性再阻尼收住，边界则提前软刹车。这个手感接近飞行游戏的
    // analog stick，而不是把触控位置直接当成瞬移坐标。
    const maxSpeed = 0.76;
    const response = 9.5;
    const deadZone = 0.06;
    final magnitude = math.sqrt(
      fighterInputX * fighterInputX + fighterInputY * fighterInputY,
    );
    final inputScale = magnitude <= deadZone
        ? 0.0
        : ((magnitude - deadZone) / (1 - deadZone)).clamp(0.0, 1.0) /
            math.max(magnitude, 0.0001);
    var targetX = fighterInputX * inputScale * maxSpeed;
    var targetY = fighterInputY * inputScale * maxSpeed;

    final edgeX = fighterX > 0.86
        ? ((0.94 - fighterX) / 0.08).clamp(0.10, 1.0)
        : fighterX < 0.65
            ? ((fighterX - 0.57) / 0.08).clamp(0.10, 1.0)
            : 1.0;
    final edgeY = fighterYPosition > 0.64
        ? ((0.72 - fighterYPosition) / 0.08).clamp(0.10, 1.0)
        : fighterYPosition < 0.18
            ? ((fighterYPosition - 0.10) / 0.08).clamp(0.10, 1.0)
            : 1.0;
    if (targetX > 0) targetX *= edgeX;
    if (targetX < 0) targetX *= edgeX;
    if (targetY > 0) targetY *= edgeY;
    if (targetY < 0) targetY *= edgeY;

    final responseBlend = 1 - math.exp(-response * dt);
    fighterVelocityX += (targetX - fighterVelocityX) * responseBlend;
    fighterVelocityY += (targetY - fighterVelocityY) * responseBlend;
    fighterX += fighterVelocityX * dt;
    fighterYPosition += fighterVelocityY * dt;

    if (fighterX <= 0.57 || fighterX >= 0.94) fighterVelocityX = 0;
    if (fighterYPosition <= 0.10 || fighterYPosition >= 0.72) {
      fighterVelocityY = 0;
    }
    fighterX = fighterX.clamp(0.57, 0.94).toDouble();
    fighterYPosition = fighterYPosition.clamp(0.10, 0.72).toDouble();
  }

  void _updateMissileEvasion(double dt) {
    // 连续 steering + 软边界，不再用“到边瞬移”的往复路径。三枚威胁
    // 独立计算追踪目标和机动，因此会同时压迫战机，而不是一枚一枚排队。
    final entering = _activeElapsed < .72;
    for (final current in _threats) {
      if (!current.active || current.resolved) continue;
      current.previousX = current.x;
      current.previousY = current.y;
      current.tickSlow(dt);

      var nearestDistance = double.infinity;
      BlueOnBlueProjectile? interceptor;
      for (final projectile in _projectiles) {
        if (projectile.targetIndex != current.index) continue;
        final dx = projectile.x - current.x;
        final dy = projectile.y - current.y;
        final distance = math.sqrt(dx * dx + dy * dy);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          interceptor = projectile;
        }
      }

      final targetDx = fighterX - current.x;
      final targetDy = fighterYPosition - current.y;
      final targetDistance = math
          .sqrt(targetDx * targetDx + targetDy * targetDy)
          .clamp(0.001, 2.0);
      final speed = .43 * current.speedMultiplier;
      // 导弹持续朝战机逼近，同时叠加轻微的自然机动。减速期间连
      // 追击速度和横向机动一起降低，用户可以明确感到命中反馈。
      var desiredVx = targetDx / targetDistance * speed +
          math.sin(elapsed * 1.7 + current.index) *
              .048 *
              current.speedMultiplier;
      var desiredVy = targetDy / targetDistance * speed +
          math.sin(elapsed * 2.3 + current.index * .9) *
              .058 *
              current.speedMultiplier +
          math.cos(elapsed * 4.9 + current.index) *
              .032 *
              current.speedMultiplier;

      if (interceptor != null && nearestDistance < 0.42) {
        final dx = interceptor.x - current.x;
        final dy = interceptor.y - current.y;
        final interceptorSpeed = math
            .sqrt(
              interceptor.vx * interceptor.vx + interceptor.vy * interceptor.vy,
            )
            .clamp(0.001, 2.0);
        final closing =
            ((interceptor.vx * dx + interceptor.vy * dy) / interceptorSpeed)
                .clamp(-1.0, 1.0);
        final urgency = ((0.42 - nearestDistance) / 0.42).clamp(0.0, 1.0) *
            (0.7 + closing.abs() * 0.3);
        // 沿拦截弹速度的法线切出，方向由叉积决定，转向仍受最大
        // 加速度限制；减速状态下机动幅度同样收敛。
        final side = interceptor.vx * dy - interceptor.vy * dx;
        final sign = side >= 0 ? 1.0 : -1.0;
        desiredVx += -sign * .30 * urgency * current.speedMultiplier;
        desiredVy += sign * .42 * urgency * current.speedMultiplier;
      }

      if (current.x < .57) desiredVx += .18 * current.speedMultiplier;
      if (current.x > .88) desiredVx -= .18 * current.speedMultiplier;
      if (current.y < .22) desiredVy += .24 * current.speedMultiplier;
      if (current.y > .86) desiredVy -= .24 * current.speedMultiplier;

      final maxAcceleration = 1.90 * dt;
      current.vx += (desiredVx - current.vx)
          .clamp(-maxAcceleration, maxAcceleration)
          .toDouble();
      current.vy += (desiredVy - current.vy)
          .clamp(-maxAcceleration, maxAcceleration)
          .toDouble();
      current.vx = current.vx.clamp(-.78, .48).toDouble();
      current.vy = current.vy.clamp(-.68, .68).toDouble();
      current.x += current.vx * dt;
      current.y += current.vy * dt;
      // 入场阶段允许导弹从屏幕外完整地滑入，之后再收进可操控空域。
      current.x = current.x.clamp(.52, entering ? 1.16 : .94).toDouble();
      current.y = current.y.clamp(entering ? .08 : .10, .90).toDouble();
    }
  }

  BlueOnBlueThreat? _findThreatCollision() {
    final collisionRadiusSquared = math.pow(.055, 2).toDouble();
    for (final threat in _threats) {
      if (!threat.active || threat.resolved) continue;
      if (_segmentDistanceSquared(
            threat.previousX,
            threat.previousY,
            threat.x,
            threat.y,
            fighterX,
            fighterYPosition,
          ) <=
          collisionRadiusSquared) {
        return threat;
      }
    }
    return null;
  }

  BlueOnBlueThreat? _threatForProjectile(BlueOnBlueProjectile projectile) {
    for (final threat in _threats) {
      if (threat.index == projectile.targetIndex) return threat;
    }
    return null;
  }

  void _resolveThreat(int index) {
    final threat = _threats.firstWhere((candidate) => candidate.index == index);
    threat.health = 0;
    threat.active = false;
    threat.resolved = true;
    for (var i = _projectiles.length - 1; i >= 0; i--) {
      if (_projectiles[i].targetIndex == index) _removeProjectileAt(i);
    }
    _spawnExplosion(threat.x, threat.y, large: true);

    _focusNextThreat();
    if (_threats.every((candidate) => candidate.resolved)) {
      won = true;
      state = IncidentState.targetDestroyed;
      _stateElapsed = 0;
      return;
    }

    // 同时追击不重置其余导弹的入场计时，只缩短武器锁定的衔接间隔。
    scatterCooldown = math.min(scatterCooldown, .55);
    trackingCooldown = math.min(trackingCooldown, .82);
  }

  void _focusNextThreat() {
    for (var i = 0; i < _threats.length; i++) {
      final threat = _threats[i];
      if (threat.active && !threat.resolved) {
        activeThreatIndex = i;
        return;
      }
    }
  }

  void _registerImpact(
    double x,
    double y,
    int threatIndex, {
    required bool large,
  }) {
    impactToken += 1;
    impactX = x;
    impactY = y;
    impactThreatIndex = threatIndex;
    impactLarge = large;
  }

  void _steerTowardsTarget(BlueOnBlueProjectile projectile, double dt) {
    final target = _threatForProjectile(projectile);
    if (target == null || target.resolved) return;
    final dx = target.x - projectile.x;
    final dy = target.y - projectile.y;
    final distance = math.sqrt(dx * dx + dy * dy).clamp(0.0001, 2.0);
    const speed = 0.64;
    final desiredX = dx / distance * speed;
    final desiredY = dy / distance * speed;
    final maxTurn = 2.7 * dt;
    projectile.vx += (desiredX - projectile.vx).clamp(-maxTurn, maxTurn);
    projectile.vy += (desiredY - projectile.vy).clamp(-maxTurn, maxTurn);
    final actualSpeed = math
        .sqrt(
          projectile.vx * projectile.vx + projectile.vy * projectile.vy,
        )
        .clamp(0.001, speed);
    projectile.vx = projectile.vx / actualSpeed * speed;
    projectile.vy = projectile.vy / actualSpeed * speed;
  }

  void _spawnExplosion(double x, double y, {required bool large}) {
    _emitParticle(
      x: x,
      y: y,
      vx: 0,
      vy: 0,
      life: large ? 0.10 : 0.07,
      size: large ? 0.058 : 0.038,
      shade: 1,
      kind: BlueOnBlueParticleKind.flash,
      growth: large ? 0.10 : 0.06,
    );
    _emitParticle(
      x: x,
      y: y,
      vx: 0,
      vy: 0,
      life: large ? 0.75 : 0.42,
      size: 0.012,
      shade: 0.78,
      kind: BlueOnBlueParticleKind.ring,
      growth: large ? 0.23 : 0.16,
    );

    final debrisCount = large ? 56 : 18;
    final smokeCount = large ? 34 : 10;
    for (var i = 0; i < debrisCount; i++) {
      final angle = _random.nextDouble() * math.pi * 2;
      final speed =
          (large ? 0.22 : 0.13) * (0.45 + _random.nextDouble() * 0.75);
      final ttl = (large ? 0.95 : 0.50) * (0.7 + _random.nextDouble() * 0.5);
      _emitParticle(
        x: x,
        y: y,
        vx: math.cos(angle) * speed,
        vy: math.sin(angle) * speed,
        life: ttl,
        size: (large ? 0.014 : 0.009) * (0.65 + _random.nextDouble() * 0.7),
        shade: 0.62 + _random.nextDouble() * 0.35,
        kind: BlueOnBlueParticleKind.debris,
      );
    }
    for (var i = 0; i < smokeCount; i++) {
      final angle = _random.nextDouble() * math.pi * 2;
      final speed = 0.035 + _random.nextDouble() * 0.07;
      final ttl = (large ? 1.20 : 0.70) * (0.75 + _random.nextDouble() * 0.35);
      _emitParticle(
        x: x,
        y: y,
        vx: math.cos(angle) * speed,
        vy: math.sin(angle) * speed,
        life: ttl,
        size: 0.018 + _random.nextDouble() * 0.016,
        shade: 0.25 + _random.nextDouble() * 0.25,
        kind: BlueOnBlueParticleKind.smoke,
        growth: 0.025,
      );
    }
  }

  void _emitProjectile({
    required double x,
    required double y,
    required double vx,
    required double vy,
    required double damage,
    required bool homing,
    required int targetIndex,
  }) {
    final projectile = _projectilePool.isEmpty
        ? BlueOnBlueProjectile(
            x: x,
            y: y,
            vx: vx,
            vy: vy,
            damage: damage,
            homing: homing,
            targetIndex: targetIndex,
          )
        : _projectilePool.removeLast();
    projectile.reset(
      x: x,
      y: y,
      vx: vx,
      vy: vy,
      damage: damage,
      homing: homing,
      targetIndex: targetIndex,
    );
    _projectiles.add(projectile);
  }

  void _emitParticle({
    required double x,
    required double y,
    required double vx,
    required double vy,
    required double life,
    required double size,
    required double shade,
    required BlueOnBlueParticleKind kind,
    bool trail = false,
    double growth = 0,
  }) {
    final particle = _particlePool.isEmpty
        ? BlueOnBlueParticle(
            x: x,
            y: y,
            vx: vx,
            vy: vy,
            life: life,
            ttl: life,
            size: size,
            shade: shade,
            trail: trail,
            kind: kind,
            growth: growth,
          )
        : _particlePool.removeLast();
    particle.reset(
      x: x,
      y: y,
      vx: vx,
      vy: vy,
      life: life,
      size: size,
      shade: shade,
      kind: kind,
      trail: trail,
      growth: growth,
    );
    _particles.add(particle);
  }

  void _removeProjectileAt(int index) {
    _projectilePool.add(_projectiles.removeAt(index));
  }

  void _removeParticleAt(int index) {
    _particlePool.add(_particles.removeAt(index));
  }
}

double _segmentDistanceSquared(
  double ax,
  double ay,
  double bx,
  double by,
  double px,
  double py,
) {
  final abx = bx - ax;
  final aby = by - ay;
  final lengthSquared = abx * abx + aby * aby;
  if (lengthSquared <= 0.0000001) {
    final dx = px - ax;
    final dy = py - ay;
    return dx * dx + dy * dy;
  }
  final projection = ((px - ax) * abx + (py - ay) * aby) / lengthSquared;
  final t = projection.clamp(0.0, 1.0).toDouble();
  final closestX = ax + abx * t;
  final closestY = ay + aby * t;
  final dx = px - closestX;
  final dy = py - closestY;
  return dx * dx + dy * dy;
}
