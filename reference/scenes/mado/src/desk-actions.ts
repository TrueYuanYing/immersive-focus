import * as THREE from 'three';
import type { AmbientEvent } from './ambient';

const phase = (p: number, start: number, end: number) => THREE.MathUtils.smoothstep(p, start, end);

/** One owner for the desk pose; contact points are authored in mado.blend. */
export class DeskActions {
  private left: THREE.Object3D;
  private right: THREE.Object3D;
  private cup: THREE.Object3D;
  private page: THREE.Object3D;
  private grip: THREE.Object3D;
  private cupGrip: THREE.Object3D;
  private pageGrip: THREE.Object3D;
  private pen: THREE.Object3D;
  private paper: THREE.Object3D;
  private rests: { object: THREE.Object3D; position: THREE.Vector3; rotation: THREE.Quaternion }[];
  private gripMeshes: THREE.Mesh[] = [];
  private sheet: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private target = new THREE.Vector3();
  private contact = new THREE.Vector3();
  private localTarget = new THREE.Vector3();
  private suppressed?: AmbientEvent;

  constructor(root: THREE.Object3D) {
    const find = (name: string) => {
      const object = root.getObjectByName(name);
      if (!object) throw new Error(`Missing cafe contact: ${name}`);
      return object;
    };
    this.left = find('Hand_Left'); this.right = find('Hand_Right');
    this.cup = find('Coffee'); this.page = find('PageTurn');
    this.grip = find('DeskHandGrip'); this.cupGrip = find('DeskCupGrip');
    this.pageGrip = find('DeskPageGrip'); this.pen = find('DeskPenTip');
    this.paper = find('DeskWritingSurface');
    this.rests = [this.left, this.right, this.cup, this.page].map(object => ({ object, position: object.position.clone(), rotation: object.quaternion.clone() }));
    this.left.traverse(object => {
      if (object instanceof THREE.Mesh && object.morphTargetDictionary?.CupGrip !== undefined)
        this.gripMeshes.push(object);
    });
    // Geometry belongs to this runtime sheet; imported materials remain shared.
    let paperMaterial: THREE.MeshStandardMaterial | undefined;
    this.page.traverse(object => {
      if (object instanceof THREE.Mesh) {
        paperMaterial ??= (Array.isArray(object.material) ? object.material[0] : object.material) as THREE.MeshStandardMaterial;
        object.geometry.dispose();
      }
    });
    this.page.clear();
    const material = paperMaterial?.clone() ?? new THREE.MeshStandardMaterial({ color: '#f4ebd6' });
    material.side = THREE.DoubleSide; material.vertexColors = false;
    const geometry = new THREE.PlaneGeometry(.98, 1.60, 20, 6);
    geometry.rotateX(-Math.PI / 2); geometry.translate(.49, 0, 0);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(.49, .04, 0), 1);
    this.sheet = new THREE.Mesh(geometry, material); this.sheet.name = 'DeskTurningSheet';
    this.sheet.castShadow = true; this.sheet.receiveShadow = true;
    this.page.add(this.sheet); this.page.visible = false;
  }

  private reset() {
    for (const rest of this.rests) {
      rest.object.position.copy(rest.position); rest.object.quaternion.copy(rest.rotation);
    }
    for (const mesh of this.gripMeshes) mesh.morphTargetInfluences![mesh.morphTargetDictionary!.CupGrip] = 0;
    this.page.visible = false;
  }

  private align(hand: THREE.Object3D, marker: THREE.Object3D, target: THREE.Vector3, amount = 1) {
    marker.getWorldPosition(this.contact);
    this.localTarget.copy(target);
    hand.parent!.worldToLocal(this.localTarget); hand.parent!.worldToLocal(this.contact);
    hand.position.addScaledVector(this.localTarget.sub(this.contact), amount);
  }

  private writing(now: number) {
    // Express strokes on the authored paper, including the mirrored scene root.
    this.target.set(Math.sin(now * 2.2) * .026, 0, Math.sin(now * 1.1) * .018);
    this.paper.localToWorld(this.target); this.align(this.right, this.pen, this.target);
  }

  update(now: number, event: AmbientEvent | undefined, animate: boolean, coffeeLevel: number) {
    this.reset();
    if (!animate) { this.suppressed = event; return; }
    this.writing(now);
    if (!event || event === this.suppressed) return;
    const p = THREE.MathUtils.clamp((now - event.start) / event.duration, 0, 1);
    const envelope = Math.sin(Math.PI * p) ** 2;
    if (event.variant === 1 && coffeeLevel > 0) this.drink(p);
    else if (event.variant === 2) this.turnPage(p);
    else if (event.variant === 3) this.left.rotateX(.025 * Math.sin(now * 2.3) * envelope);
    else if (event.variant === 4) {
      this.right.position.y += .32 * envelope; this.left.position.y += .28 * envelope;
      this.right.rotateZ(-.12 * envelope); this.left.rotateZ(.12 * envelope);
    }
  }

  private drink(p: number) {
    const reach = phase(p, 0, .21) * (1 - phase(p, .84, 1));
    const lift = phase(p, .25, .45) * (1 - phase(p, .62, .82));
    this.cup.position.add(this.target.set(-.20 * lift, 1.25 * lift, -4.6 * lift));
    this.cup.rotateX(.16 * lift);
    this.left.rotateX(-.85 * reach); this.left.rotateZ(-.35 * reach);
    for (const mesh of this.gripMeshes) mesh.morphTargetInfluences![mesh.morphTargetDictionary!.CupGrip] = reach;
    this.cupGrip.getWorldPosition(this.target);
    this.align(this.left, this.grip, this.target, reach);
    // The reaching hand clears the book before descending to the handle.
    this.left.position.y += Math.sin(Math.PI * reach) * .16;
  }

  private turnPage(p: number) {
    const reach = phase(p, 0, .18) * (1 - phase(p, .82, 1));
    const turn = phase(p, .22, .76), angle = Math.PI * turn;
    const lift = Math.sin(angle);
    this.page.visible = p > 0 && p < .82;
    this.page.rotateZ(angle);
    const positions = this.sheet.geometry.attributes.position;
    const normals = this.sheet.geometry.attributes.normal;
    for (let i = 0; i < positions.count; i++) {
      const u = positions.getX(i) / .98;
      positions.setY(i, Math.sin(u * Math.PI) * lift * .08);
      const slope = Math.cos(u * Math.PI) * lift * .08 * Math.PI / .98;
      const length = Math.hypot(slope, 1); normals.setXYZ(i, -slope / length, 1 / length, 0);
    }
    positions.needsUpdate = true; normals.needsUpdate = true;
    this.left.rotateZ(.24 * lift);
    this.target.set(.85, Math.sin(.85 / .98 * Math.PI) * lift * .08, -.55);
    this.page.localToWorld(this.target); this.align(this.left, this.pageGrip, this.target, reach);
    this.left.position.y += Math.sin(Math.PI * reach) * .12;
    this.right.position.y += .16 * reach; this.right.position.x += .36 * reach;
  }
}
