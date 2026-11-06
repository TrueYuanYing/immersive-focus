// Metres and seconds, matching the Blender thigh, calf and local -Z forward axis.
const UPPER_LEG = .36;
const LOWER_LEG = .37;
const STRIDE = .40;
const SWING_FRACTION = .42;
const clamp = (n: number) => Math.max(-1, Math.min(1, n));

// The shoe sole follows the pedal; solve the two leg segments from that contact.
export function cyclePose(phase: number, side: number) {
  const angle = phase + (side === 1 ? Math.PI : 0);
  const pedalX = .04 + .165 * Math.cos(angle), pedalY = .52 - .165 * Math.sin(angle);
  const dx = pedalX - .04 + .19, down = 1.10 - (pedalY + .10);
  const distance = Math.hypot(dx, down);
  const hip = Math.atan2(dx, down) + Math.acos(clamp((.40 ** 2 + distance ** 2 - .42 ** 2) / (.80 * distance)));
  const knee = -(Math.PI - Math.acos(clamp((.40 ** 2 + .42 ** 2 - distance ** 2) / (2 * .40 * .42))));
  return { hip, knee, ankle: -hip - knee, pedalX, pedalY };
}

export function walkPhase(seconds: number, metresPerSecond: number, offset = 0, strideScale = 1) {
  return seconds * metresPerSecond / (STRIDE*strideScale) * (1 - SWING_FRACTION) * Math.PI * 2 + offset;
}

// Lower the pelvis when the feet are apart; rise gently as the support passes underneath.
export function walkRise(phase:number,scale=1) { return (-.022-.014*Math.cos(phase*2))*scale; }

/** Integrate a gently changing pace; use the same distance for position and gait. */
export function studentTravel(age:number,index:number,speed:number) {
  const frequency=.61+index*.13,phase=index*2.1;
  return age*speed+.105*(Math.sin(age*frequency+phase)-Math.sin(phase));
}

export function skipPose(age:number) {
  for(const [i,start] of [.2,1.35].entries()){
    const t=age-start;
    if(t>=-.2&&t<0)return {height:-.04*Math.sin(Math.PI*(t+.2)/.2)**2,tuck:0,energy:Math.sin(Math.PI*(t+.2)/.2)**2};
    if(t>=0&&t<.55){const arc=4*(t/.55)*(1-t/.55);return {height:arc*(i?.15:.13),tuck:arc,energy:arc};}
    if(t>=.55&&t<.85)return {height:-.04*Math.sin(Math.PI*(t-.55)/.3)**2,tuck:0,energy:Math.sin(Math.PI*(t-.55)/.3)**2};
  }
  return {height:0,tuck:0,energy:0};
}

export function legPose(phase: number, bodyRise: number, upper = UPPER_LEG, lower = LOWER_LEG, restingDown = .672, strideScale = 1) {
  const cycle = ((phase / (2 * Math.PI)) % 1 + 1) % 1;
  const swing = cycle < SWING_FRACTION;
  const u = swing ? cycle / SWING_FRACTION : (cycle - SWING_FRACTION) / (1 - SWING_FRACTION);
  const footZ = (swing ? STRIDE / 2 - STRIDE * u * u * (3 - 2 * u) : -STRIDE / 2 + STRIDE * u)*strideScale;
  const down = restingDown + bodyRise - (swing ? Math.sin(Math.PI * u) * .035*strideScale : 0);
  const distance = Math.min(upper + lower - .001, Math.hypot(footZ, down));
  const hip = Math.atan2(-footZ, down) + Math.acos(clamp((upper ** 2 + distance ** 2 - lower ** 2) / (2 * upper * distance)));
  const knee = -(Math.PI - Math.acos(clamp((upper ** 2 + lower ** 2 - distance ** 2) / (2 * upper * lower))));
  const ankle = -hip - knee + (swing ? Math.sin(u * Math.PI) * .035*Math.min(1,strideScale) : 0);
  return { hip, knee, ankle, footZ };
}
