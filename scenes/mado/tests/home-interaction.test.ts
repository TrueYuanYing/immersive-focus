import { afterEach, expect, it, vi } from 'vitest';
import { BoxGeometry, Mesh, MeshStandardMaterial, PerspectiveCamera } from 'three';
import { HomeInteraction } from '../src/home-interaction';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function miniature() {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }));
  const canvas = Object.assign(new EventTarget(), {
    classList: { add() {}, remove() {}, toggle() {} },
    hasPointerCapture: () => false,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 600 }),
  });
  const model = new Mesh(new BoxGeometry(3, 3, 3), new MeshStandardMaterial());
  const camera = new PerspectiveCamera(50, 400 / 600, .1, 100);
  camera.position.z = 5;
  const enter = vi.fn();
  const interaction = new HomeInteraction(canvas as unknown as HTMLCanvasElement, model, camera, enter);
  let now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  interaction.setEnabled(true);
  const pointer = (type: string, x: number, id = 1) => {
    now += 16;
    canvas.dispatchEvent(Object.assign(new Event(type), { pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: 300 }));
  };
  return { interaction, model, enter, pointer, canvas };
}

it.each([30, 60])('拖动后以 %i fps 保留向前惯性，随后回到原位且不会翻转', fps => {
  const { interaction, model, enter, pointer } = miniature();
  pointer('pointerdown', 200); pointer('pointermove', 240); pointer('pointermove', 280);
  const released = model.rotation.y;
  pointer('pointerup', 280);
  interaction.update(1 / fps, false);
  expect(Math.abs(model.rotation.y)).toBeGreaterThan(Math.abs(released));
  for (let frame = 0; frame < fps * 3; frame++) {
    interaction.update(1 / fps, false);
    expect(Math.abs(model.rotation.y)).toBeLessThanOrEqual(.85);
  }
  expect(model.rotation.y).toBe(0);
  expect(enter).not.toHaveBeenCalled();
  interaction.dispose();
});

it('划出后又划回起点仍不打开点单，后续轻点可正常进入', () => {
  const { interaction, enter, pointer } = miniature();
  pointer('pointerdown', 200); pointer('pointermove', 270); pointer('pointermove', 200); pointer('pointerup', 200);
  expect(enter).not.toHaveBeenCalled();
  interaction.cancel();
  pointer('pointerdown', 200); pointer('pointerup', 202);
  expect(enter).toHaveBeenCalledOnce();
  interaction.dispose();
});

it('向右拖采用负向转角，向左拖采用正向转角', () => {
  const { interaction, model, pointer } = miniature();
  pointer('pointerdown', 200); pointer('pointermove', 250);
  expect(model.rotation.y).toBeLessThan(-.1);
  pointer('pointercancel', 250);
  pointer('pointerdown', 200); pointer('pointermove', 150);
  expect(model.rotation.y).toBeGreaterThan(.1);
  interaction.dispose();
});

it('忽略第二根手指；取消、弹层禁用和销毁均停止旧交互', () => {
  const { interaction, model, enter, pointer } = miniature();
  pointer('pointerdown', 200); pointer('pointermove', 250);
  const held = model.rotation.y;
  pointer('pointermove', 350, 2); pointer('pointerup', 200, 2);
  pointer('lostpointercapture', 200, 2);
  expect(model.rotation.y).toBe(held);
  pointer('pointercancel', 250);
  expect(model.rotation.y).toBe(0);
  pointer('pointerdown', 200); pointer('pointermove', 250); interaction.setEnabled(false);
  expect(model.rotation.y).toBe(0);
  pointer('pointerup', 200); pointer('pointerdown', 200); pointer('pointerup', 200);
  expect(enter).not.toHaveBeenCalled();
  interaction.dispose(); interaction.setEnabled(true);
  pointer('pointerdown', 200); pointer('pointermove', 250); pointer('pointerup', 250);
  expect(model.rotation.y).toBe(0);
});

it('减少动态时仍可手动拖动，松手立即复位，不自动摆动', () => {
  const { interaction, model, pointer } = miniature();
  interaction.update(.1, true);
  pointer('pointerdown', 200); pointer('pointermove', 250);
  expect(Math.abs(model.rotation.y)).toBeGreaterThan(.1);
  pointer('pointerup', 250);
  expect(model.rotation.y).toBe(0);
  interaction.update(2, true);
  expect(model.rotation.y).toBe(0);
  interaction.dispose();
});
