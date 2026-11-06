import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { gsap } from 'gsap';
import { AmbientManager, type AmbientEvent, type CrowdMode } from './ambient';
import { Soundscape } from './audio';
import { cyclePose, legPose, walkPhase, walkRise, skipPose } from './motion';
import { initialQuality, lowerQuality, renderProfile, type QualityMode, type QualityTier } from './quality';
import { CharacterRig } from './student';
import { Family } from './family';
import { Friends } from './friends';
import { STREET_EDGE } from './routes';
import { Atmosphere } from './atmosphere';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HomeInteraction } from './home-interaction';
import { createCeramicCupGeometry } from './ceramic-cup';
import { DeskActions } from './desk-actions';
import { frameHome } from './home-framing';

export type View = 'home' | 'counter' | 'seat';
export type TimeMode = 'real' | 'dawn' | 'morning' | 'afternoon' | 'sunset' | 'night';
export type Weather = 'sun' | 'rain';
const keyframes = [
  { hour: 0, sky: '#263c54', sun: '#8296c5', power: .12, ambient: .58 },
  { hour: 6, sky: '#a5bdc4', sun: '#eed8bd', power: 1.5, ambient: 1.35 },
  { hour: 10, sky: '#b8d8de', sun: '#fff0d1', power: 2.7, ambient: 1.6 },
  { hour: 15, sky: '#8bbad4', sun: '#ffe9c4', power: 3.0, ambient: 1.45 },
  { hour: 18, sky: '#b8a0a2', sun: '#ff9952', power: 2.1, ambient: 1.1 },
  { hour: 22, sky: '#263c54', sun: '#8296c5', power: .12, ambient: .58 },
  { hour: 24, sky: '#263c54', sun: '#8296c5', power: .12, ambient: .58 },
];
const timeHours = { dawn: 6, morning: 10, afternoon: 15, sunset: 18, night: 22 };
const seatPos = new THREE.Vector3(0, 3.6, -8.6);
const seatTarget = new THREE.Vector3(0, 2.15, 8);

export class World {
  private scene = new THREE.Scene();
  private homeBounds = new THREE.Box3();
  private maxRenderSize = 4096;
  private camera = new THREE.PerspectiveCamera(52, 1, .08, 130);
  private renderer: THREE.WebGLRenderer;
  private asset?: THREE.Group;
  private sun = new THREE.DirectionalLight('#ffdcaa', 3.2);
  private ambient = new THREE.HemisphereLight('#d3e7ff', '#ae9276', 1.9);
  private skyFill = new THREE.DirectionalLight('#d2e5ff', 1.1);
  private cafeLight = new THREE.PointLight('#ffbf73', 14, 12, 2);
  private target = new THREE.Vector3();
  private nodes = new Map<string, THREE.Object3D>();
  private bases = new Map<string, THREE.Vector3>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private foliage: THREE.Object3D[] = [];
  private fish: THREE.Object3D[] = [];
  private manager = new AmbientManager();
  setCrowd(mode:CrowdMode){this.manager.setCrowd(mode,this.elapsed);}
  private students = new Map<string, CharacterRig>();
  private cyclist?: CharacterRig;
  private family?: Family;
  private friends?:Friends;
  private homeInteraction?:HomeInteraction;
  private deskActions?:DeskActions;
  onHomeEnter?:()=>void;
  setHomeInteractive(enabled:boolean){this.homeInteraction?.setEnabled(enabled&&this.view==='home');}
  homeDiagnostics(){return this.homeInteraction?.diagnostics();}
  private atmosphere = new Atmosphere();
  private elapsed = 0;
  private lastFrame = 0;
  private frameId = 0;
  private disposed = false;
  private hostHidden = false;
  private lifecycle = new AbortController();
  private drawTimes: number[] = [];
  private frameIntervals: number[] = [];
  private weatherValue = 0;
  private hour = 15;
  private rain: THREE.LineSegments;
  private drops: THREE.InstancedMesh;
  private petals: THREE.InstancedMesh;
  private steam: THREE.Points;
  private rainData = new Float32Array(240 * 6);
  private dummy = new THREE.Object3D();
  private cupLevel = 100;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  qualityMode: QualityMode = 'auto';
  qualityTier: QualityTier = 'balanced';
  private profile = renderProfile('balanced', innerWidth, innerHeight, devicePixelRatio, 4);
  private qualityStableSince = 0;
  private qualitySampleMs = 0;
  private qualitySampleFrames = 0;
  private shadowTime = 0;
  private shadowDirty = true;
  private shadowUpdates = 0;
  private breathingTarget = new THREE.Vector3();
  private cupPosition = new THREE.Vector3();
  cameraBreathing = true;
  view: View = 'home';
  weather: Weather = 'sun';
  timeMode: TimeMode = 'afternoon';
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  onContextLost?: () => void;

  constructor(canvas: HTMLCanvasElement, private sound: Soundscape, preferredQuality: QualityMode = 'auto') {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: preferredQuality === 'ultra' ? 'high-performance' : 'default' });
    this.maxRenderSize=Math.min(this.renderer.capabilities.maxTextureSize,this.renderer.getContext().getParameter(this.renderer.getContext().MAX_RENDERBUFFER_SIZE));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const pmrem = new THREE.PMREMGenerator(this.renderer),room = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(room, .04).texture;this.scene.environmentIntensity=.34;
    room.dispose();pmrem.dispose();this.scene.add(this.atmosphere.root);
    this.sun.position.set(-10, 14, 11); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);this.sun.shadow.radius=3;this.sun.shadow.blurSamples=6;
    Object.assign(this.sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: .5, far: 60 });
    this.sun.shadow.normalBias = .035; this.sun.shadow.bias = -.0003;
    this.skyFill.position.set(6,9,-12);
    this.scene.add(this.sun, this.sun.target, this.ambient, this.skyFill, this.skyFill.target, this.cafeLight);
    this.scene.background = new THREE.Color('#ddd5c4'); this.scene.fog = new THREE.Fog('#b8ced5', 25, 80);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), new THREE.MeshStandardMaterial({ color: '#d7cbb6', roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(-80, -.64, 0); floor.receiveShadow = true; floor.name = 'HomeBackdrop'; this.scene.add(floor);
    const rainGeo = new THREE.BufferGeometry();
    for (let i = 0; i < this.rainData.length; i += 6) {
      const x = Math.random() * 32 - 16, y = Math.random() * 14, z = Math.random() * 22 + 2;
      this.rainData.set([x, y, z, x - .045, y - .30, z], i);
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainData, 3));
    this.rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: '#d8e5e5', transparent: true, opacity: 0, depthWrite: false }));
    this.scene.add(this.rain);
    this.drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 5, 4), new THREE.MeshBasicMaterial({ color: '#deebeb', transparent: true, opacity: 0, depthWrite: false }), 56);
    for (let i = 0; i < 56; i++) {
      this.dummy.position.set((Math.random() - .5) * 11, Math.random() * 4 + 1.8, -.98);
      this.dummy.scale.set(.012 + Math.random() * .018, .025 + Math.random() * .03, .007); this.dummy.updateMatrix(); this.drops.setMatrixAt(i, this.dummy.matrix);
    }
    this.scene.add(this.drops);
    this.petals = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.032, 0), new THREE.MeshStandardMaterial({ color: '#ffd0c6', roughness: .9 }), 28);
    this.scene.add(this.petals);
    const steamGeo = new THREE.BufferGeometry(); steamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18 * 3), 3));
    this.steam = new THREE.Points(steamGeo, new THREE.PointsMaterial({ color: '#f3e8d2', transparent: true, opacity: .19, size: .034, depthWrite: false }));
    this.scene.add(this.steam);
    // Multisample the scene itself instead of blurring the final, upscaled image.
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene,this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(800,600),.09,.5,1.5);
    this.composer.addPass(this.bloom);this.composer.addPass(new OutputPass());
    this.renderer.info.autoReset=false;
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); cancelAnimationFrame(this.frameId); this.onContextLost?.(); }, {signal:this.lifecycle.signal});
    window.addEventListener('resize', () => this.resize(), {signal:this.lifecycle.signal});
    document.addEventListener('visibilitychange', () => this.visibility(document.hidden), {signal:this.lifecycle.signal});
    this.setQuality('auto');
  }

  async load(onProgress: (progress: number) => void) {
    const decoder=new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`).setWorkerLimit(2);
    const loader = new GLTFLoader().setDRACOLoader(decoder);
    const [gltf, avatar, citizens, family] = await Promise.all([
      loader.loadAsync(`${import.meta.env.BASE_URL}models/mado.glb`, e => onProgress((e.total ? e.loaded / e.total : .5)*.7)),
      loader.loadAsync(`${import.meta.env.BASE_URL}models/students.glb`),
      loader.loadAsync(`${import.meta.env.BASE_URL}models/citizens.glb`),
      loader.loadAsync(`${import.meta.env.BASE_URL}models/family.glb`),
    ]).finally(()=>decoder.dispose());
    if(this.disposed){for(const asset of [gltf,avatar,citizens,family])this.releaseObject(asset.scene);return;}
    this.asset = gltf.scene; this.scene.add(this.asset);
    this.asset.traverse(o => {
      this.nodes.set(o.name, o); this.bases.set(o.name, o.position.clone());
      if (/_Crown(?:\.\d+)?$/.test(o.name)) this.foliage.push(o);
      if (o.name.startsWith('FishSection')) this.fish.push(o);
      if (o instanceof THREE.Mesh) {
        if (/^(Coffee|CounterCoffee)__Ceramic$/.test(o.name)) {
          const original = o.geometry;
          o.geometry = createCeramicCupGeometry();
          // Replacement vertices use the cup root, not Blender's chosen join pivot.
          o.position.set(0, 0, 0); o.quaternion.identity(); o.scale.setScalar(1);
          original.dispose();
        }
        o.castShadow = true; o.receiveShadow = true;
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of materials) {
          if (m instanceof THREE.MeshStandardMaterial) {
            this.materials.set(m.name, m);
            if(/^Wood/.test(m.name)) {
              m.roughness=.70;
              m.onBeforeCompile=shader=>{
                shader.vertexShader='varying vec3 vTimber;\n'+shader.vertexShader;
                shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvTimber = position;');
                shader.fragmentShader='varying vec3 vTimber;\n'+shader.fragmentShader;
                shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat timberPhase = vTimber.x * 62.0 + sin(vTimber.z * 2.8 + sin(vTimber.x * 1.7)) * 3.0;\nfloat grain = sin(timberPhase) * (1.0 - smoothstep(0.7, 2.7, fwidth(timberPhase)));\ndiffuseColor.rgb *= 0.978 + 0.018 * grain + 0.012 * sin(vTimber.x * 7.0 + vTimber.z * 0.6);');
              };
              m.customProgramCacheKey=()=> 'mado-timber-2';
            }
            if (m.name === 'Ceramic') m.roughness = .27;
            if (m.name === 'Coffee') { m.roughness = .38; m.envMapIntensity = .20; }
            if (m.name === 'Metal' || m.name === 'Brass') { m.roughness = .34; m.metalness = .65; }
            if (m.name === 'Glow') m.emissiveIntensity = 1.2;
            if (o.name.includes('Fish_tail')) m.side = THREE.DoubleSide;
          }
        }
      }
    });
    // Legacy sleeves were direct bicycle children; remove them before rigid batching.
    const originalBike=this.get('Bicycle')!;
    for(const child of [...originalBike.children]) if(child instanceof THREE.Mesh&&child.material instanceof THREE.Material&&['BikeBlue','AnimeSkin'].includes(child.material.name))child.removeFromParent();
    this.mergeStatic();
    this.mergeRigidParts();
    this.deskActions = new DeskActions(this.get('World')!);
    const umbrella=this.get('Student0_Umbrella')!;
    for(let i=0;i<3;i++){
      const name='Student'+i,root=this.get(name)!;
      for(const child of [...root.children]) if(!child.name.endsWith('_Bag')) child.removeFromParent();
      const student=new CharacterRig(avatar.scene,i);root.add(student.object);student.attachUmbrella(umbrella);this.students.set(name,student);
    }
    for(const [i,name] of ['Worker','Walker'].entries()){
      const root=this.get(name)!;
      for(const child of [...root.children])child.removeFromParent();
      const person=new CharacterRig(citizens.scene,i,name==='Worker'?'worker':'walker');root.add(person.object);person.attachUmbrella(umbrella);this.students.set(name,person);
    }
    const bicycle=this.get('Bicycle')!;
    // Remove only the old rider; wheels, cranks and the tested pedal joints remain.
    bicycle.traverse(o=>{if(o.name.startsWith('Cyclist_')&&!o.name.startsWith('Cyclist_Pedal'))o.visible=false;});
    this.cyclist=new CharacterRig(citizens.scene,2,'cyclist');this.cyclist.setupCycle();bicycle.add(this.cyclist.object);
    this.family=new Family(family.scene,umbrella);this.get('World')!.add(this.family.object);
    this.friends=new Friends([0,1,2].map(i=>this.get('Student'+i)!),[0,1,2].map(i=>this.students.get('Student'+i)!));
    this.homeBounds.setFromObject(this.get('Exterior')!);
    this.homeInteraction=new HomeInteraction(this.renderer.domElement,this.get('Exterior')!,this.camera,()=>this.onHomeEnter?.());
    this.setCoffee(0); this.setTime(this.timeMode, false);
    // Compile hidden viewpoints under the loading screen, before interactive transitions.
    for (const view of ['counter', 'seat', 'home'] as const) {
      if (this.disposed) return;
      this.setView(view, false);
      this.camera.lookAt(this.target);
      await this.renderer.compileAsync(this.scene, this.camera);
      if (this.disposed) return;
      this.renderer.shadowMap.needsUpdate = true;
      this.renderer.render(this.scene, this.camera);
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
    if (this.disposed) return;
    this.frameId = requestAnimationFrame(this.frame); onProgress(1);
  }
  private get(name: string) { return this.nodes.get(name); }
  private mergeRigidParts() {
    // Keep every animated joint. Only the rigid pieces attached to that joint are batched.
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .88 });
    material.name='PaintedMiniature';
    this.asset!.updateMatrixWorld(true);
    const parents = [...this.nodes.values()].filter(o => !(o instanceof THREE.Mesh) && !o.name.endsWith('_Umbrella') &&
      (/^(Student\d|Worker|Walker|Cyclist|Bicycle)(_|$)/.test(o.name) || /_Crown(?:\.\d+)?$/.test(o.name) || ['Train','Car','Cat'].includes(o.name)));
    for(const parent of parents){
      const children=parent.children.filter((o):o is THREE.Mesh => o instanceof THREE.Mesh &&
        o.material instanceof THREE.MeshStandardMaterial && !['Glow','WindowGlow'].includes(o.material.name));
      if(children.length<2)continue;
      const inverse=parent.matrixWorld.clone().invert();
      const geometries=children.map(o=>{
        const m=o.material as THREE.MeshStandardMaterial;
        const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld));
        const old=g.getAttribute('color'),count=g.getAttribute('position').count,colors=new Float32Array(count*3);
        for(let i=0;i<count;i++){
          colors[i*3]=m.color.r*(old?old.getX(i):1);
          colors[i*3+1]=m.color.g*(old?old.getY(i):1);
          colors[i*3+2]=m.color.b*(old?old.getZ(i):1);
        }
        for(const name of Object.keys(g.attributes))if(!['position','normal'].includes(name))g.deleteAttribute(name);
        g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
      });
      const geometry=mergeGeometries(geometries,false);
      if(!geometry)throw new Error('Unable to batch articulated geometry');
      const crown=/_Crown(?:\.\d+)?$/.test(parent.name);
      const batchMaterial=crown?material.clone():material;
      if(crown)batchMaterial.side=THREE.DoubleSide;
      const mesh=new THREE.Mesh(geometry,batchMaterial);mesh.name=parent.name+'_Painted';mesh.castShadow=true;mesh.receiveShadow=true;
      parent.add(mesh);children.forEach(o=>{o.removeFromParent();o.geometry.dispose();});geometries.forEach(g=>g.dispose());
    }
  }
  private mergeStatic() {
    const root = this.get('World')!;
    // Keep the authoring modules; collapse only static runtime geometry by material.
    const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const names = ['Street','ConvenienceStore','Buildings','Railway','StreetProps','CafeInterior','Window','Desk','DeskProps','Notebook','Clouds','Plant','Coaster','Lamp','ArtDetails'];
    const originalScale = root.scale.x; root.scale.x = 1;
    this.asset!.updateMatrixWorld(true);
    for (const name of names) {
      const part = this.get(name); if (!part) continue;
      part.traverse(o => {
        if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
        const geometry = o.geometry.clone().applyMatrix4(o.matrixWorld);
        for (const attribute of Object.keys(geometry.attributes)) if (!['position','normal','color'].includes(attribute)) geometry.deleteAttribute(attribute);
        const color=geometry.getAttribute('color');
        const colors=new Float32Array(geometry.getAttribute('position').count*3).fill(1);
        if(color){for(let i=0;i<color.count;i++){colors[i*3]=color.getX(i);colors[i*3+1]=color.getY(i);colors[i*3+2]=color.getZ(i);}}
        geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
        if(o.material instanceof THREE.MeshStandardMaterial)o.material.vertexColors=true;
        if (!buckets.has(o.material)) buckets.set(o.material, []);
        buckets.get(o.material)!.push(geometry);
      });
      part.removeFromParent();
    }
    const optimized = new THREE.Group(); optimized.name = 'StaticWorld';root.add(optimized);
    for (const [mat, parts] of buckets) {
      const geometry = mergeGeometries(parts, false); if (!geometry) throw new Error('Unable to merge static geometry');
      const mesh = new THREE.Mesh(geometry, mat); mesh.receiveShadow = true;
      mesh.castShadow = ['Wood','WoodHoney','WoodDark','WoodLight','Metal','Cream','Ceramic','Paper','Trunk'].includes(mat.name);
      optimized.add(mesh);parts.forEach(g=>g.dispose());
    }
    root.scale.x = originalScale;
  }
  setView(view: View, animate = true) {
    this.sound.setScene(view);
    this.view = view;
    if (view !== 'seat') this.deskActions?.update(this.elapsed, this.manager.active.find(event => event.name === 'hand'), false, this.cupLevel);
    this.setHomeInteractive(false);
    this.shadowDirty=true;
    const root = this.get('World');
    root?.children.forEach(o => {
      const special = o.name === 'Exterior' || o.name === 'Counter' || o.name === 'CounterCoffee';
      o.visible = view === 'home' ? o.name === 'Exterior' : view === 'counter' ? o.name === 'Counter' || o.name === 'CounterCoffee' : !special;
    });
    this.scene.getObjectByName('HomeBackdrop')!.visible = view === 'home';
    const portrait = innerWidth / innerHeight < .85;
    const pos = view === 'home' ? new THREE.Vector3(-89, 9, -18) : view === 'counter' ? new THREE.Vector3(-45, 3.65, -7.5) : seatPos.clone();
    const target = view === 'home' ? new THREE.Vector3(portrait ? -80 : -76.8, 1.35, 0) : view === 'counter' ? new THREE.Vector3(-45, 2.70, .3) : seatTarget;
    gsap.killTweensOf(this.camera.position); gsap.killTweensOf(this.target);
    if (animate && !this.reducedMotion && view === 'seat') {
      this.camera.position.copy(pos).add(new THREE.Vector3(0, .22, -.5)); this.target.copy(target);
      gsap.to(this.camera.position, { x: pos.x, y: pos.y, z: pos.z, duration: 2.2, ease: 'power2.out' });
    } else { this.camera.position.copy(pos); this.target.copy(target); }
    const shift = view === 'home' ? -80 : view === 'counter' ? -45 : 0;
    this.sun.position.set(shift - 10, 14, view === 'seat' ? 11 : -4); this.sun.target.position.set(shift, 0, 0);
    this.skyFill.position.set(shift+6,9,-12);this.skyFill.target.position.set(shift,0,8);
    this.cafeLight.position.set(view === 'counter' ? -45 : view === 'home' ? -80 : 2.3, view === 'seat' ? 4.8 : 4, view === 'seat' ? -1.9 : -1);
    this.resize();
  }
  setTime(mode: TimeMode, animate = true) {
    this.timeMode = mode;
    const date = new Date(); const target = mode === 'real' ? date.getHours() + date.getMinutes() / 60 : timeHours[mode];
    gsap.killTweensOf(this, 'hour');
    if (animate && !this.reducedMotion) gsap.to(this, { hour: target, duration: 5, ease: 'sine.inOut' }); else this.hour = target;
  }
  setWeather(weather: Weather) {
    this.weather = weather; gsap.killTweensOf(this, 'weatherValue');
    gsap.to(this, { weatherValue: weather === 'rain' ? 1 : 0, duration: this.reducedMotion ? 0 : 4, ease: 'sine.inOut' });
    this.sound.setRain(weather === 'rain' ? 1 : 0);
  }
  setQuality(mode: QualityMode) {
    this.qualityMode = mode;
    this.resetQualitySample();
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    this.qualityTier = mode === 'auto' ? initialQuality(memory, navigator.hardwareConcurrency || 4, matchMedia('(pointer: coarse)').matches) : mode;
    this.resize();
  }
  private resetQualitySample() {
    this.qualityStableSince = performance.now(); this.qualitySampleMs = 0; this.qualitySampleFrames = 0;
  }
  private adaptQuality(now: number, interval: number) {
    if (this.qualityMode !== 'auto' || this.qualityTier === 'low' || this.reducedMotion || now - this.qualityStableSince < 750) return;
    // Bound isolated stalls without discarding evidence of repeated very slow frames.
    this.qualitySampleMs += Math.min(interval, 500); this.qualitySampleFrames++;
    if (this.qualitySampleMs < 1800) return;
    const fps = 1000 * this.qualitySampleFrames / this.qualitySampleMs;
    this.qualitySampleMs = 0; this.qualitySampleFrames = 0;
    if (fps < 42) { this.qualityTier = lowerQuality(this.qualityTier); this.resize(); }
  }
  setCoffee(progress: number) {
    this.cupLevel = progress >= 1 ? 0 : progress >= .75 ? 25 : progress >= .5 ? 50 : progress >= .25 ? 75 : 100;
    for (const name of ['Coffee', 'CounterCoffee']) {
      for (const value of [100, 75, 50, 25, 0]) { const o = this.get(`${name}_Coffee_Level_${value}`); if (o) o.visible = value === (name === 'CounterCoffee' ? 100 : this.cupLevel); }
    }
  }
  brewing(ready: boolean) { const cup = this.get('CounterCoffee'); if (cup) { cup.visible = ready; if (ready && !this.reducedMotion) { cup.position.y = 2.55; gsap.to(cup.position, { y: 2.26, duration: 1.3, ease: 'sine.out' }); } } }
  layoutHome() {
    if(this.view!=='home'||this.homeBounds.isEmpty())return;
    const w=innerWidth,h=innerHeight,card=document.querySelector('.home-copy')?.getBoundingClientRect();
    const header=document.querySelector('.topbar')?.getBoundingClientRect().bottom??80;
    const top=header+8;
    const portrait=w/h<.8;
    const area=portrait
      ? {left:w*.04,top,width:w*.92,height:Math.max(90,(card?.top??h*.65)-top-14)}
      : {left:(card?.right??w*.38)+22,top,width:Math.max(90,w-(card?.right??w*.38)-w*.04-22),height:Math.max(90,h-top-45)};
    this.target.copy(frameHome(this.camera,this.homeBounds,w,h,area));
  }
  private resize() {
    const width = innerWidth, height = innerHeight; const portrait = width / height < .85;
    this.profile = renderProfile(this.qualityTier, width, height, devicePixelRatio, this.renderer.capabilities.maxSamples, matchMedia('(pointer: coarse)').matches,this.maxRenderSize);
    this.renderer.setPixelRatio(this.profile.ratio);
    this.renderer.setSize(width, height, false); this.camera.aspect = width / height;
    const horizontalLimit=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(40))/(width/height)));
    this.camera.fov = this.view === 'seat' ? (portrait ? 63 : Math.min(51,horizontalLimit)) : this.view === 'home' ? (portrait ? 60 : 42) : portrait ? 56 : 43;
    if(this.view==='seat')this.target.y=THREE.MathUtils.lerp(seatTarget.y,0,THREE.MathUtils.smoothstep(width/height,1.65,2.4));
    this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.layoutHome();
    for (const target of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (target.samples !== this.profile.samples) { target.dispose(); target.samples = this.profile.samples; }
    }
    if (this.profile.bloom) {
      this.composer.setPixelRatio(this.profile.ratio); this.composer.setSize(width, height);
    } else {
      this.composer.setPixelRatio(1); this.composer.setSize(1, 1);
    }
    if (this.sun.shadow.mapSize.x !== this.profile.shadow) {
      this.sun.shadow.mapSize.setScalar(this.profile.shadow); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
    }
    this.bloom.enabled = this.profile.bloom; this.shadowDirty = true;
  }
  private lighting() {
    if (this.timeMode === 'real' && !gsap.isTweening(this)) { const d = new Date(); this.hour = d.getHours() + d.getMinutes() / 60; }
    let i = keyframes.findIndex(k => k.hour > this.hour); if (i < 1) i = keyframes.length - 1;
    const a = keyframes[i - 1], b = keyframes[i], t = THREE.MathUtils.clamp((this.hour - a.hour) / (b.hour - a.hour), 0, 1);
    const daylight=THREE.MathUtils.clamp(THREE.MathUtils.lerp(a.power,b.power,t)/2.7,0,1);
    const wetSky=new THREE.Color('#75868c').multiplyScalar(.12+.88*daylight);
    const sky = new THREE.Color(a.sky).lerp(new THREE.Color(b.sky), t).lerp(wetSky, this.weatherValue * .65);
    (this.scene.background as THREE.Color).copy(this.view === 'home' ? new THREE.Color('#d9d1bf') : sky);
    (this.scene.fog as THREE.Fog).color.copy(this.view === 'home' ? new THREE.Color('#d9d1bf') : sky); (this.scene.fog as THREE.Fog).near = this.view === 'home' ? this.camera.position.distanceTo(this.target)+20 : 18;
    (this.scene.fog as THREE.Fog).far = this.view === 'home' ? this.camera.position.distanceTo(this.target)+80 : 80;
    this.sun.color.set(a.sun).lerp(new THREE.Color(b.sun), t);
    this.sun.intensity = THREE.MathUtils.lerp(a.power, b.power, t) * (1 - this.weatherValue * .8);
    this.ambient.intensity = THREE.MathUtils.lerp(a.ambient, b.ambient, t) * (1 - this.weatherValue * .25);
    this.skyFill.intensity=this.ambient.intensity*.62;
    const night = 1 - Math.min(1, this.sun.intensity / 2.1);
    this.cafeLight.intensity = 12 + night * 17;
    const glow = this.materials.get('WindowGlow'); if (glow) glow.emissiveIntensity = .18 + night * 1.8;
    const windowLight=this.materials.get('GlassLight');if(windowLight){windowLight.emissive.set('#e8b77b');windowLight.emissiveIntensity=night*.25;}
    const road = this.materials.get('Asphalt'); if (road) { road.roughness = 1 - this.weatherValue * .73; road.metalness = this.weatherValue * .28; }
    const red = this.materials.get('SignalRed'), green = this.materials.get('SignalGreen'), amber = this.materials.get('SignalAmber');
    const signal = this.elapsed % 56;
    if (red) red.emissiveIntensity = signal < 27 ? 1.3 : 0;
    if (green) green.emissiveIntensity = signal >= 27 && signal < 51 ? 1.3 : 0;
    if (amber) amber.emissiveIntensity = signal >= 51 ? 1.3 : 0;
  }
  private actor(name: string, x: number, y: number, z: number, direction = 1, gait = 0, variant = 0, lookBack = 0, skipAge=-1) {
    const o = this.get(name); if (!o) return;
    const hop=skipPose(skipAge);
    o.visible = true;o.position.set(x,y+walkRise(gait)+hop.height,z+Math.sin(gait)*.004);o.rotation.y=direction>0?-Math.PI/2:Math.PI/2;
    o.rotation.z=Math.sin(gait)*.006;
    const student=this.students.get(name);
    if(student){student.animate(gait,this.elapsed,lookBack,this.weatherValue,skipAge);const bag=this.get(name+'_Bag');if(bag)bag.rotation.x=Math.sin(gait+.5)*.04+hop.energy*.12;return;}
    const head=this.get(name+'_Head');if(head){head.rotation.y=Math.sin(this.elapsed*.38+variant)*.12;head.rotation.x=.025*Math.sin(gait+.5);}
    const bag=this.get(name+'_Bag');if(bag){bag.rotation.x=Math.sin(gait-.7)*.065;bag.rotation.z=Math.sin(gait-.5)*.034;}
    for (const side of [-1, 1]) {
      const leg = this.get(`${name}_Leg_${side}`), arm = this.get(`${name}_Arm_${side}`);
      const phase=gait+(side===1?Math.PI:0),pose=legPose(phase,Math.cos(gait*2)*.012);
      if(leg)leg.rotation.x=pose.hip;
      const knee=this.get(`${name}_Knee_${side}`);if(knee)knee.rotation.x=pose.knee;
      const ankle=this.get(`${name}_Ankle_${side}`);if(ankle)ankle.rotation.x=pose.ankle;
      if(arm){arm.rotation.x=-Math.sin(phase+.28)*.23;arm.rotation.z=side*.04;}
      const elbow=this.get(`${name}_Elbow_${side}`);if(elbow)elbow.rotation.x=.13+Math.max(0,Math.sin(phase))*.16;
      if(arm&&name==='Worker'&&side===1&&variant%2===0){const glance=.5+.5*Math.sin(this.elapsed*.35);arm.rotation.x=-.36*glance;if(elbow)elbow.rotation.x=-1.1*glance;}
      if(arm&&name.startsWith('Student')&&side===1&&variant%3===1){arm.rotation.z=-.18+Math.sin(this.elapsed*.55+variant)*.08;if(elbow)elbow.rotation.x=-.45;}
    }
  }
  private event(e: AmbientEvent) {
    const age = this.elapsed - e.start, p = age / e.duration; const x = -STREET_EDGE + STREET_EDGE*2*p;
    switch (e.name) {
      case 'train': { const o = this.get('Train'); if (o && age > 2) { o.visible = true; o.position.x = -37 + 74 * ((age - 2) / (e.duration - 2)); } break; }
      case 'car': { const o = this.get('Car'); if (o) { o.visible = true; o.position.set(-x, .1, 4.4); o.rotation.y = Math.PI; } break; }
      case 'bike': {
        const o = this.get('Bicycle'); if (!o) break;
        o.visible = true; o.position.set(x, .07, 2.95);
        const distance = p*STREET_EDGE*2, phase = distance / 2.3 * Math.PI * 2;
        this.cyclist?.cycle(phase,this.elapsed,this.weatherValue);
        for (const name of ['Bicycle_Wheel_Front', 'Bicycle_Wheel_Rear']) { const wheel = this.get(name); if (wheel) wheel.rotation.z = -distance / .43; }
        const crank = this.get('Bicycle_Crank'); if (crank) crank.rotation.z = -phase;
        for (const side of [-1, 1]) {
          const pose = cyclePose(phase, side);
          for (const joint of ['Hip', 'Knee', 'Ankle'] as const) {
            const node = this.get(`Cyclist_${joint}_${side}`); if (node) node.rotation.z = pose[joint.toLowerCase() as 'hip' | 'knee' | 'ankle'];
          }
          const pedal = this.get('Cyclist_Pedal_' + side); if (pedal) pedal.rotation.z = phase;
        }
        const body = this.get('Cyclist_UpperBody'), base = this.bases.get('Cyclist_UpperBody');
        if (body && base) body.position.y = base.y + .004 * Math.cos(phase * 2);
        break;
      }
      case 'students': {
        const skip=this.manager.active.find(a=>a.name==='skip');
        this.friends?.update(age,e.duration,this.elapsed,this.weatherValue,e.variant,e.borrowStart===undefined?-1:this.elapsed-e.borrowStart,skip?skip.variant%3:-1,skip&&!this.reducedMotion?this.elapsed-skip.start:-1);
        break;
      }
      case 'worker': this.actor('Worker', -x, .07, 1.65, -1, walkPhase(age,STREET_EDGE*2/e.duration), e.variant); break;
      case 'family': this.family?.update(age,this.elapsed,this.weatherValue,e.variant,e.crossingStart===undefined?undefined:this.elapsed-e.crossingStart); break;
      case 'walker': this.actor('Walker', x, .06, 8.25, 1, walkPhase(age,STREET_EDGE*2/e.duration), e.variant); break;
      case 'cat': { const o = this.get('Cat'); if (o) { o.visible = true; o.position.set(x, .04, 1.7); o.rotation.y = .04 * Math.sin(age * 3); } break; }
    }
  }
  private particles(dt: number) {
    const visible = this.view === 'seat'; this.rain.visible = visible && this.weatherValue > .01; this.drops.visible = this.rain.visible;
    (this.rain.material as THREE.LineBasicMaterial).opacity = this.weatherValue * .33;
    (this.drops.material as THREE.MeshBasicMaterial).opacity = this.weatherValue * .37;
    if (this.rain.visible) {
      for (let i = 0; i < this.rainData.length; i += 6) { this.rainData[i + 1] -= dt * 4; this.rainData[i + 4] -= dt * 4; if (this.rainData[i + 4] < .1) { this.rainData[i + 1] = 14; this.rainData[i + 4] = 13.7; } }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    this.petals.visible = visible && this.weatherValue < .7;
    for (let i = 0; i < 28; i++) {
      const phase = this.elapsed * .08 + i * .37;
      this.dummy.position.set(Math.sin(phase * .4 + i) * 10, 9 - (phase % 9), 2 + (i * 1.73) % 15);
      this.dummy.rotation.set(phase, phase * 1.7, phase * .3); this.dummy.scale.set(1, .30, 1); this.dummy.updateMatrix(); this.petals.setMatrixAt(i, this.dummy.matrix);
    }
    this.petals.instanceMatrix.needsUpdate = true;
    this.steam.visible = visible && this.cupLevel > 25;
    const buffer = this.steam.geometry.attributes.position;
    this.get('Coffee')?.getWorldPosition(this.cupPosition);
    for (let i = 0; i < 18; i++) { const p = ((this.elapsed * .14 + i / 18) % 1); buffer.setXYZ(i, this.cupPosition.x + Math.sin(p * 9 + i) * .026, this.cupPosition.y + .53 + p * .54, this.cupPosition.z + Math.cos(p * 8 + i) * .024); }
    buffer.needsUpdate = true;
  }
  private frame = (now: number) => {
    if(this.disposed || this.hostHidden || document.hidden)return;
    this.frameId = requestAnimationFrame(this.frame);
    const frameLimit = this.reducedMotion ? 8 : this.profile.fps;
    if (now - this.lastFrame < 1000 / frameLimit - 1) return;
    if(this.lastFrame){this.adaptQuality(now, now-this.lastFrame);this.frameIntervals.push(now-this.lastFrame);if(this.frameIntervals.length>180)this.frameIntervals.shift();}
    const dt = Math.min(.08, Math.max(0, (now - (this.lastFrame || now)) / 1000)); this.lastFrame = now;
    if (!this.reducedMotion && this.view === 'seat') this.elapsed += dt;
    this.lighting();
    if(this.homeInteraction?.update(dt,this.reducedMotion))this.shadowDirty=true;
    const wind = .012 + Math.sin(this.elapsed * .035) * .008;
    this.foliage.forEach((o, i) => { o.rotation.z = Math.sin(this.elapsed * .6 + i) * wind; });
    this.fish.forEach((o, i) => { o.rotation.y = Math.sin(this.elapsed * 1.25 - i * .8) * .16; o.rotation.x = Math.sin(this.elapsed * .8 - i * .5) * .10; });
    for (const name of ['Student0', 'Student1', 'Student2', 'Worker', 'Walker', 'Train', 'Car', 'Bicycle', 'Cat']) { const o = this.get(name); if (o) o.visible = false; }
    if(this.family)this.family.object.visible=false;
    if (this.view === 'seat') {
      if (this.reducedMotion) {
        for(const event of this.manager.active)this.event(event);
      } else {
        this.manager.tick(this.elapsed,this.weatherValue>.4);
        for (const e of this.manager.active){
          const audibleAt=e.name==='car'||e.name==='bike'?e.duration*.24:0;
          if(!e.sounded&&this.elapsed-e.start>=audibleAt){this.sound.event(e.name,e.variant,e.duration);e.sounded=true;}
          this.event(e);
        }
      }
    }
    this.deskActions?.update(this.elapsed, this.manager.active.find(event => event.name === 'hand'), this.view === 'seat' && !this.reducedMotion, this.cupLevel);
    this.particles(this.reducedMotion ? 0 : dt);
    this.atmosphere.update(this.elapsed,this.weatherValue,this.hour,this.qualityTier,this.view==='seat',this.get('Car'),this.get('Bicycle'));
    this.breathingTarget.copy(this.target);
    let breathX=0,breathY=0;
    if(this.view==='seat'&&this.cameraBreathing&&!this.reducedMotion){
      breathX=Math.sin(this.elapsed*.27)*.015+Math.sin(this.elapsed*.11)*.007;
      breathY=Math.sin(this.elapsed*1.08)*.014;
      this.camera.position.x+=breathX;this.camera.position.y+=breathY;
      this.breathingTarget.x+=Math.sin(this.elapsed*.22+.5)*.045;
      this.breathingTarget.y+=Math.sin(this.elapsed*1.08+.2)*.022;
    }
    this.camera.lookAt(this.breathingTarget);
    const start = performance.now();this.renderer.info.reset();
    this.renderer.shadowMap.needsUpdate=this.shadowDirty||(this.view==='seat'&&now-this.shadowTime>1000/this.profile.shadowFps);
    if(this.renderer.shadowMap.needsUpdate){this.shadowTime=now;this.shadowDirty=false;this.shadowUpdates++;}
    if(this.profile.bloom)this.composer.render();else this.renderer.render(this.scene,this.camera);
    this.camera.position.x-=breathX;this.camera.position.y-=breathY;
    this.drawTimes.push(performance.now() - start); if (this.drawTimes.length > 180) this.drawTimes.shift();
  };
  visibility(hidden:boolean){
    this.hostHidden=hidden;cancelAnimationFrame(this.frameId);
    if(hidden){
      this.homeInteraction?.cancel();
      this.deskActions?.update(this.elapsed, this.manager.active.find(event => event.name === 'hand'), false, this.cupLevel);
    }
    if(!hidden&&!this.disposed){this.resetQualitySample();this.lastFrame=performance.now();this.frameId=requestAnimationFrame(this.frame);}
  }
  private releaseObject(root:THREE.Object3D){
    const resources=new Set<{dispose():void}>();
    root.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.Points||object instanceof THREE.Line){
      resources.add(object.geometry);
      for(const material of Array.isArray(object.material)?object.material:[object.material]){
        resources.add(material);for(const value of Object.values(material))if(value instanceof THREE.Texture)resources.add(value);
      }
    }});resources.forEach(resource=>resource.dispose());
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.lifecycle.abort();cancelAnimationFrame(this.frameId);
    this.homeInteraction?.dispose();this.onHomeEnter=undefined;this.onContextLost=undefined;
    gsap.killTweensOf(this.camera.position);gsap.killTweensOf(this.target);
    this.releaseObject(this.scene);this.scene.environment?.dispose();this.sun.shadow.map?.dispose();
    this.composer.passes.forEach(pass=>pass.dispose());this.composer.dispose();this.renderer.dispose();this.renderer.forceContextLoss();this.scene.clear();
  }
  diagnostics() {
    const pedalErrors = [-1, 1].map(side => {
      const pedal = this.get('Cyclist_Pedal_' + side);
      if (!this.cyclist || !pedal) return null;
      return this.cyclist.footContact(side===-1?'L':'R').distanceTo(pedal.getWorldPosition(new THREE.Vector3()));
    });
    return { view: this.view, webgl: 2, calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures, cpuSubmitMs: this.drawTimes.reduce((a, b) => a + b, 0) / Math.max(1, this.drawTimes.length), renderFps:1000/(this.frameIntervals.reduce((a,b)=>a+b,0)/Math.max(1,this.frameIntervals.length)), dpr: this.renderer.getPixelRatio(), targetFps: this.reducedMotion?8:this.profile.fps, qualityMode:this.qualityMode, qualityTier:this.qualityTier, samples:this.profile.samples, renderPath:this.profile.bloom?'composer':'direct', shadowUpdates:this.shadowUpdates, renderSize:this.profile.bloom?[this.composer.renderTarget1.width,this.composer.renderTarget1.height]:[this.renderer.domElement.width,this.renderer.domElement.height], canvasSize:[this.renderer.domElement.width,this.renderer.domElement.height], cycling:{visible:this.get('Bicycle')?.visible, knees:this.cyclist?.kneeAngles(),pedalErrors}, cameraBreathing:this.cameraBreathing, reducedMotion:this.reducedMotion, cameraRotation:[this.camera.rotation.x,this.camera.rotation.y,this.camera.rotation.z], activeEvents: this.manager.active.map(e => e.name), glbLoaded: !!this.asset, coffeeLevel: this.cupLevel, hour: this.hour, rain: this.weatherValue };
  }
}
