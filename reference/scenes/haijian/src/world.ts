import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {gsap} from 'gsap';
import {makeOcean,makeSky,makeSeabed} from './seascape';
import {HandRig} from './hands';
import {detailMaterial} from './materials';
import {AmbientEventManager,seeded,type EventType} from './ambient';
import type {Settings} from './settings';
import type {FishingController} from './fishing';
import type {Soundscape} from './audio';

type View='harbor'|'cabin'|'deck';
const smooth=(t:number)=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
const vector=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z);
const sharedUp=new THREE.Vector3(0,1,0);

export class SeaWorld {
  readonly scene=new THREE.Scene(); readonly camera=new THREE.PerspectiveCamera(55,1,.03,1300);
  readonly renderer:THREE.WebGLRenderer;readonly ambient:AmbientEventManager;
  private ocean=makeOcean();private sky=makeSky();private sun=new THREE.DirectionalLight(0xfff2dc,2.6);
  private fill=new THREE.HemisphereLight(0xd5e8f4,0x65716e,1.35);private lamp=new THREE.PointLight(0xffd394,1.3,6,2);
  private environment:THREE.WebGLRenderTarget;
  private source=new THREE.Group();private harbor=new THREE.Group();private cabin=new THREE.Group();private deck=new THREE.Group();
  private left=new THREE.Group();private right=new THREE.Group();private pen=new THREE.Group();private rod=new THREE.Group();private bobber=new THREE.Group();
  private line:THREE.Line; private tip=vector(0,0,0);private bob=vector(0,0,0);private linePoint=vector(0,0,0);
  private rodBlank:THREE.Mesh|null=null;private rodBase:Float32Array|null=null;private leader:THREE.Line|null=null;
  private fishModels:THREE.Group[]=[];private islands:THREE.Group[]=[];private islandOrigins:number[]=[];
  private actors=new Map<EventType,THREE.Group>();private clouds=new THREE.Group();
  private spray:THREE.Points<THREE.BufferGeometry,THREE.PointsMaterial>;private rings:THREE.Mesh[]=[];private raindrops:THREE.Points<THREE.BufferGeometry,THREE.PointsMaterial>;private glassDrops:THREE.Points<THREE.BufferGeometry,THREE.PointsMaterial>;
  private rainPositions:Float32Array;private dropPositions:Float32Array;
  private resources=new Set<THREE.BufferGeometry|THREE.Material|THREE.Texture>();
  private raf=0;private last=0;private rendered=0;private time=0;private travel=0;private speed=0;private rain=0;private night=0;private warm=0;
  private target=vector(0,1.5,-10);private transitioning=false;private transition:gsap.core.Tween|null=null;
  private currentView:View='harbor';private disposed=false;private hidden=false;private hover=0;private progress=0;private moving=false;
  private settings:Settings;private fishing:FishingController|null=null;private fps=60;private frames=0;private frameStart=0;private quality='';private slow=0;private shadowTime=0;
  private cup:THREE.Object3D|null=null;private page:THREE.Object3D|null=null;private handSoundPhase=-1;
  private docking:gsap.core.Tween|null=null;
  private leftRig:HandRig|null=null;private rightRig:HandRig|null=null;
  private reelAngle=0;private reelSpeed=0;private rodBend=0;
  private caughtFrom=vector(.14,.075,-1.9);private previousFishPhase='';
  private releaseFrom=vector(.14,1.7,-1.9);private releasedLift=1;private caughtLift=0;
  private swimmers:THREE.Group[]=[];
  onFrame:((dt:number)=>void)|null=null;onHarborClick:(()=>void)|null=null;onContextLost:(()=>void)|null=null;
  constructor(private canvas:HTMLCanvasElement,settings:Settings,private audio:Soundscape,seed=911) {
    this.settings=settings;this.ambient=new AmbientEventManager(seed);
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.96;
    // Bake once; rough materials and polished brass share the same soft reflection.
    const pmrem=new THREE.PMREMGenerator(this.renderer),room=new RoomEnvironment();
    this.environment=pmrem.fromScene(room,.06);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.32;
    room.dispose();pmrem.dispose();
    this.renderer.shadowMap.autoUpdate=false;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.sun.position.set(-18,35,13);this.sun.castShadow=true;this.sun.shadow.mapSize.set(1024,1024);
    Object.assign(this.sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:1,far:100});this.sun.shadow.bias=-.00015;this.sun.shadow.normalBias=.025;
    this.lamp.position.set(2.4,2.45,.05);
    this.scene.add(this.ocean,this.sky,this.sun,this.fill,this.lamp,this.clouds);
    this.scene.fog=new THREE.FogExp2(0xa0c5c5,.0045);
    const lineGeometry=new THREE.BufferGeometry().setFromPoints(Array.from({length:25},()=>new THREE.Vector3()));
    this.line=new THREE.Line(lineGeometry,new THREE.LineBasicMaterial({color:0xc9d8ce,transparent:true,opacity:.82}));this.line.frustumCulled=false;this.line.visible=false;this.scene.add(this.line);
    const random=seeded(seed);
    this.rainPositions=new Float32Array(480*3);for(let i=0;i<480;i++)this.rainPositions.set([(random()-.5)*35,random()*18,random()*-40],i*3);
    this.raindrops=this.makePoints(this.rainPositions,.045,0xd5e9e6);this.scene.add(this.raindrops);
    this.dropPositions=new Float32Array(70*3);for(let i=0;i<70;i++)this.dropPositions.set([(random()-.5)*4.7,.88+random()*2.1,-.92],i*3);
    this.glassDrops=this.makePoints(this.dropPositions,.023,0xe4eee2);this.scene.add(this.glassDrops);
    this.spray=this.makePoints(new Float32Array(72*3),.25,0xffffff);this.spray.material.toneMapped=false;this.spray.visible=false;this.spray.renderOrder=3;this.scene.add(this.spray);
    for(let i=0;i<3;i++){const r=new THREE.Mesh(new THREE.RingGeometry(.91,1,64),new THREE.MeshBasicMaterial({color:0xc9e3d7,transparent:true,opacity:.25,side:THREE.DoubleSide,depthWrite:false}));r.rotation.x=-Math.PI/2;r.visible=false;this.rings.push(r);this.scene.add(r);}
    this.scene.add(makeSeabed());
    window.addEventListener('resize',this.resize);canvas.addEventListener('pointermove',this.pointerMove);canvas.addEventListener('pointerleave',this.pointerLeave);canvas.addEventListener('click',this.pointerClick);canvas.addEventListener('webglcontextlost',this.contextLost);
    this.configure(settings);this.resize();this.setCamera('harbor');
  }
  private makePoints(positions:Float32Array,size:number,color:number) {
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    const mat=new THREE.PointsMaterial({color,size,transparent:true,opacity:.4,depthWrite:false});
    mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','float circle=length(gl_PointCoord-vec2(.5));if(circle>.5) discard;diffuseColor.a*=1.-smoothstep(.1,.5,circle);\n#include <opaque_fragment>');};
    const mesh=new THREE.Points(geometry,mat);mesh.frustumCulled=false;return mesh;
  }
  async load() {
    const gltf=await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/haijian.glb`);
    if(this.disposed){gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});return;}
    this.source=gltf.scene;
    const materials=new Set<THREE.Material>();
    this.source.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;
      // Animated meshes share materials with batched meshes; every source needs a white fallback.
      const sourceColor=o.geometry.getAttribute('color'),colors=new Float32Array(o.geometry.attributes.position.count*3).fill(1);
      if(sourceColor)for(let i=0;i<sourceColor.count;i++)colors.set([sourceColor.getX(i),sourceColor.getY(i),sourceColor.getZ(i)],i*3);
      o.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
      this.resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
    for(const m of materials){this.resources.add(m);if(m instanceof THREE.MeshStandardMaterial){m.side=THREE.DoubleSide;m.roughness=Math.max(.32,m.roughness);detailMaterial(m);}}
    this.harbor=this.model('Harbor');this.cabin=this.model('Cabin');this.deck=this.model('FishingDeck');
    this.batch(this.harbor,['ShipExterior']);this.batch(this.harbor.getObjectByName('ShipExterior') as THREE.Group,[]);
    this.batch(this.cabin,['TeaCup','TurningPage']);this.batch(this.deck,[]);
    this.scene.add(this.harbor,this.cabin,this.deck);
    this.cup=this.cabin.getObjectByName('TeaCup')??null;this.page=this.cabin.getObjectByName('TurningPage')??null;
    this.left=this.model('Hand_L');this.right=this.model('Hand_R');this.pen=this.model('Pen');this.rod=this.model('FishingRod');this.bobber=this.model('Bobber');
    this.batch(this.left,['Joint','Thumb','ThumbTip','Grip','Pinch']);this.batch(this.right,['Joint','Thumb','ThumbTip','Grip','Pinch']);
    this.leftRig=new HandRig(this.left,'L');this.rightRig=new HandRig(this.right,'R');this.scene.add(this.leftRig.sleeve,this.rightRig.sleeve);this.batch(this.pen,[]);
    this.rod.getObjectByName('RodBlank')?.removeFromParent();
    this.batch(this.rod,['ReelHandle','RodTip','RodGrip','CrankGrip']);this.batch(this.bobber,[]);
    const curve=new THREE.CatmullRomCurve3([vector(0,.055,-.2),vector(0,.28,-.8),vector(0,.51,-1.4),vector(0,.72,-2.05)]);
    this.rodBlank=new THREE.Mesh(new THREE.TubeGeometry(curve,24,.011,6,false),new THREE.MeshStandardMaterial({color:0x244d4c,roughness:.5}));
    this.rodBase=new Float32Array(this.rodBlank.geometry.attributes.position.array);this.rod.add(this.rodBlank);
    this.leader=new THREE.Line(new THREE.BufferGeometry().setFromPoints([vector(0,0,0),vector(0,0,0)]),new THREE.LineBasicMaterial({color:0xc9d8ce,transparent:true,opacity:.6}));this.leader.visible=false;this.leader.frustumCulled=false;this.scene.add(this.leader);
    this.scene.add(this.left,this.right,this.pen,this.rod,this.bobber);
    for(let i=0;i<8;i++){const f=this.model(`Fish_${i}`);this.batch(f,['FishTail','FishMouth']);f.visible=false;this.fishModels.push(f);this.scene.add(f);}
    for(let i=0;i<3;i++){const fish=this.model(`Fish_${i===2?2:0}`);this.batch(fish,['FishTail']);fish.scale.setScalar(.46-i*.035);this.swimmers.push(fish);this.scene.add(fish);}
    const placements=[[-20,-67,1], [75,-141,1.8], [-105,-220,2.0], [190,-330,2.8]];
    placements.forEach(([x,z,s],i)=>{const island=this.model(`Island_${i%3}`);this.batch(island,[]);island.position.set(x,0,z);island.rotation.y=[-.13,.28,-.36,.18][i];island.scale.set(s*(i===1?.92:1),s,s*(i===2?1.12:1));this.islands.push(island);this.islandOrigins.push(x);this.scene.add(island)});
    for(const type of ['bird','aircraft','fish','spout','breach'] as EventType[]) {
      const root=new THREE.Group();const name=type==='bird'?'Seabird':type==='aircraft'?'Aircraft':type==='fish'?'Fish_0':'Whale';
      const count=type==='bird'?3:type==='fish'?3:1;
      for(let i=0;i<count;i++){const m=this.model(name);this.batch(m,['Wing_L','Wing_R','WhaleTail','Flipper','FishTail','Blowhole']);m.position.set(i*.8,0,i*.9);root.add(m);}
      root.visible=false;this.actors.set(type,root);this.scene.add(root);
    }
    this.setVisible('harbor');this.collectResources();this.last=performance.now();this.frameStart=this.last;this.raf=requestAnimationFrame(this.loop);
  }
  private model(name:string) {
    const source=this.source.getObjectByName(name);if(!source)throw new Error(`场景资产缺失：${name}`);
    return source.clone(true) as THREE.Group;
  }
  /** Flatten static meshes per material. Named contact/animation pivots survive. */
  private batch(root:THREE.Object3D|undefined,keep:string[]) {
    if(!root)return;
    root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert();const buckets=new Map<THREE.Material,THREE.BufferGeometry[]>();const remove:THREE.Object3D[]=[];
    const visit=(o:THREE.Object3D)=>{
      if(o!==root&&keep.some(n=>o.name===n||o.name.startsWith(n+'_')))return;
      if(o instanceof THREE.Mesh&&!Array.isArray(o.material)) {
        const geometry=o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld));
        for(const attr of Object.keys(geometry.attributes))if(!['position','normal','color'].includes(attr))geometry.deleteAttribute(attr);
        const color=geometry.getAttribute('color'),colors=new Float32Array(geometry.attributes.position.count*3).fill(1);
        if(color)for(let i=0;i<color.count;i++)colors.set([color.getX(i),color.getY(i),color.getZ(i)],i*3);
        geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
        if(o.material instanceof THREE.MeshStandardMaterial)o.material.vertexColors=true;
        if(!geometry.getAttribute('normal'))geometry.computeVertexNormals();
        if(!buckets.has(o.material))buckets.set(o.material,[]);buckets.get(o.material)!.push(geometry);remove.push(o);
      }
      o.children.slice().forEach(visit);
    };visit(root);
    remove.forEach(o=>o.removeFromParent());
    for(const [mat,geometries] of buckets){const geometry=mergeGeometries(geometries);if(geometry){const mesh=new THREE.Mesh(geometry,mat);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);this.resources.add(geometry);}geometries.forEach(g=>g.dispose());}
  }
  configure(settings:Settings) {
    const previousMode=this.settings.quality,previousQuality=this.quality;
    this.settings={...settings};
    if(settings.quality==='auto'){if(!this.quality||previousMode!=='auto'){
      const memory=(navigator as Navigator&{deviceMemory?:number}).deviceMemory??8;
      this.quality=window.innerWidth<900||memory<=4||navigator.hardwareConcurrency<=4?'low':'medium';
    }}else this.quality=settings.quality;
    if(previousQuality!==this.quality)this.resize();
  }
  setProgress(progress:number,moving:boolean){this.progress=progress;this.moving=moving;}
  setFishing(controller:FishingController|null){this.fishing=controller;}
  private setVisible(view:View) {
    this.docking?.kill();this.harbor.position.set(0,0,0);const ship=this.harbor.getObjectByName('ShipExterior');if(ship)ship.visible=true;
    this.harbor.visible=view==='harbor';this.cabin.visible=view==='cabin';this.deck.visible=view==='deck';
    this.left.visible=this.right.visible=view!=='harbor';if(this.leftRig)this.leftRig.sleeve.visible=view!=='harbor';if(this.rightRig)this.rightRig.sleeve.visible=view!=='harbor';this.pen.visible=view==='cabin';this.rod.visible=view==='deck';
    this.bobber.visible=false;this.line.visible=false;if(this.leader)this.leader.visible=false;this.fishModels.forEach(f=>f.visible=false);
  }
  private pose(view:View) {
    if(view==='harbor')return {position:vector(17,12.5,22),target:vector(-2,1.5,-.5),fov:37};
    if(view==='deck')return {position:vector(.2,2.05,1.85),target:vector(.2,.15,-9),fov:57};
    return {position:vector(0,1.78,2.35),target:vector(0,.15,-10),fov:55};
  }
  private setCamera(view:View){const p=this.pose(view);this.camera.position.copy(p.position);this.target.copy(p.target);this.camera.fov=p.fov;this.camera.lookAt(this.target);this.camera.updateProjectionMatrix();}
  async changeView(view:View,instant=false) {
    this.transition?.kill();this.currentView=view;this.setVisible(view);
    if(instant||this.settings.reducedMotion){this.setCamera(view);return;}
    this.transitioning=true;const p=this.pose(view);this.camera.position.copy(p.position).add(vector(view==='harbor'?0:.4,view==='harbor'?0:.13,.8));this.target.copy(p.target);this.camera.fov=p.fov;
    await new Promise<void>(resolve=>{this.transition=gsap.to(this.camera.position,{x:p.position.x,y:p.position.y,z:p.position.z,duration:1.75,ease:'power2.inOut',onUpdate:()=>{this.camera.lookAt(this.target);this.camera.updateProjectionMatrix();},onComplete:resolve,onInterrupt:resolve});});
    this.transitioning=false;
  }
  private resize=()=>{
    const w=this.canvas.clientWidth||innerWidth,h=this.canvas.clientHeight||innerHeight;
    const high=this.quality==='high',low=this.quality==='low';const dpr=Math.min(devicePixelRatio,low?1:high?2:1.5,Math.sqrt((low?1.4e6:high?5e6:2.6e6)/(w*h)));
    this.ocean.material.uniforms.uReflection.value=low?0:1;
    this.renderer.setPixelRatio(dpr);this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
    const changed=this.renderer.shadowMap.enabled===low;
    this.renderer.shadowMap.enabled=!low;this.sun.castShadow=!low;
    if(changed)this.scene.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])m.needsUpdate=true;});
    const shadowSize=high?2048:1024;
    if(this.sun.shadow.mapSize.x!==shadowSize){this.sun.shadow.map?.dispose();this.sun.shadow.map=null;this.sun.shadow.mapSize.set(shadowSize,shadowSize);this.shadowTime=0;this.renderer.shadowMap.needsUpdate=true;}
    this.raindrops.geometry.setDrawRange(0,this.settings.reducedMotion?40:low?130:high?480:270);
  };
  private pointerMove=(e:PointerEvent)=>{
    if(this.currentView!=='harbor'||this.transitioning||e.pointerType!=='mouse'||this.settings.reducedMotion)return;
    this.hover=this.hitHarbor(e)?1:0;this.canvas.style.cursor=this.hover?'pointer':'default';
  };
  private pointerLeave=()=>{this.hover=0;this.canvas.style.cursor='default'};
  private pointerClick=(e:MouseEvent)=>{if(this.currentView==='harbor'&&this.hitHarbor(e))this.onHarborClick?.();};
  private hitHarbor(e:MouseEvent) {const r=this.canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.camera);return ray.intersectObject(this.harbor,true).length>0;}
  private contextLost=(e:Event)=>{e.preventDefault();this.visibility(true);this.onContextLost?.();};
  visibility(hidden:boolean){this.hidden=hidden;cancelAnimationFrame(this.raf);if(!hidden&&!this.disposed){this.last=performance.now();this.frameStart=this.last;this.frames=0;this.raf=requestAnimationFrame(this.loop);}}
  private loop=(now:number)=>{
    if(this.disposed||this.hidden)return;
    this.raf=requestAnimationFrame(this.loop);
    const fpsTarget=this.quality==='low'?30:60;if(now-this.rendered<1000/fpsTarget-.8)return;
    const dt=Math.max(0,Math.min(.1,(now-this.last)/1000));this.last=now;this.rendered=now;this.time+=dt;
    this.onFrame?.(dt);this.update(dt);this.renderer.shadowMap.needsUpdate=now-this.shadowTime>1000/(this.quality==='high'?30:15);if(this.renderer.shadowMap.needsUpdate)this.shadowTime=now;this.renderer.render(this.scene,this.camera);this.frames++;
    if(now-this.frameStart>2500){this.fps=this.frames*1000/(now-this.frameStart);this.frames=0;this.frameStart=now;
      if(this.settings.quality==='auto'&&this.fps<42&&this.quality!=='low'){this.slow++;if(this.slow>=3){this.quality=this.quality==='high'?'medium':'low';this.slow=0;this.resize();}}else this.slow=0;
    }
  };
  private update(dt:number) {
    const t=this.time,s=this.settings;this.rain=THREE.MathUtils.damp(this.rain,s.weather==='rain'?1:0,.6,dt);
    const hour=s.time==='local'?new Date().getHours()+new Date().getMinutes()/60:({dawn:6.5,day:13,dusk:18.5,night:23}[s.time]);
    const nightTarget=hour<5.5?1:hour<8?1-smooth((hour-5.5)/2.5):hour>18?smooth((hour-18)/3):0;
    const warmTarget=Math.max(0,1-Math.abs(hour-6.8)/1.7,1-Math.abs(hour-18.3)/2);
    this.night=THREE.MathUtils.damp(this.night,nightTarget,.6,dt);this.warm=THREE.MathUtils.damp(this.warm,warmTarget,.6,dt);
    const om=this.ocean.material.uniforms,sky=this.sky.material.uniforms;
    this.speed=THREE.MathUtils.damp(this.speed,this.moving&&this.currentView==='cabin'?.43:this.currentView==='deck'?.018:0,.75,dt);this.travel+=this.speed*dt;
    om.uTime.value=t;sky.uTime.value=t;om.uTravel.value=this.travel;om.uNight.value=sky.uNight.value=this.night;om.uRain.value=sky.uRain.value=this.rain;om.uWarm.value=sky.uWarm.value=this.warm;
    this.sun.intensity=2.7*(1-this.night*.94)*(1-this.rain*.53);this.fill.intensity=1.12*(1-this.night*.8);this.lamp.intensity=.6+this.night*3.5+this.rain*1.3;
    (this.scene.fog as THREE.FogExp2).color.setRGB(.50*(1-this.night*.77),.68*(1-this.night*.72),.71*(1-this.night*.64));
    this.islands.forEach((island,i)=>{let x=this.islandOrigins[i]-this.travel*(i===0?1:.55);const boundary=280+i*180;while(x< -boundary)x+=boundary*2;island.position.x=x;});
    this.clouds.position.x=-this.travel*.12;
    const ship=this.harbor.getObjectByName('ShipExterior');if(ship){ship.position.y=.02+Math.sin(t*.64)*.028;ship.rotation.z=Math.sin(t*.43)*.008;}
    this.harbor.rotation.y=THREE.MathUtils.damp(this.harbor.rotation.y,this.hover*.035,2,dt);
    if(!this.transitioning&&s.cameraMotion&&!s.reducedMotion&&this.currentView!=='harbor'){
      const base=this.pose(this.currentView);this.camera.position.copy(base.position);this.camera.position.y+=Math.sin(t*.45)*.004;this.camera.lookAt(this.target);
    }
    this.ambient.tick(dt,{activity:s.activity,fishing:this.currentView==='deck',reduced:s.reducedMotion,night:this.night>.65,progress:this.progress,rain:this.rain>.6,lowQuality:this.quality==='low'});
    this.updateEvents();this.updateRain(dt);
    this.swimmers.forEach((fish,i)=>{
      const phase=(t*.012+i*.29)%1;fish.visible=this.currentView!=='harbor'&&(!s.reducedMotion)&&this.night<.85&&(s.activity!=='quiet'||i===0);
      fish.position.set(-10+20*phase,-.68-i*.24+Math.sin(t*.55+i)*.055,-7-i*3.2);
      fish.rotation.set(.015*Math.sin(t*.7+i),-Math.PI/2,0);const tail=fish.getObjectByName(`FishTail_${i===2?2:0}`);if(tail)tail.rotation.y=Math.sin(t*5+i)*.25;
    });
    if(this.currentView==='cabin')this.updateHands(t);
    if(this.currentView==='deck'&&this.fishing)this.updateFishing(this.fishing,dt);
  }
  private updateRain(dt:number){
    this.raindrops.visible=this.rain>.01;this.glassDrops.visible=this.rain>.01&&this.currentView==='cabin';
    this.raindrops.material.opacity=this.rain*.45;this.glassDrops.material.opacity=this.rain*.28;
    if(this.rain<.01)return;
    for(let i=0;i<this.rainPositions.length;i+=3){this.rainPositions[i+1]-=dt*6;this.rainPositions[i]-=dt*.3;if(this.rainPositions[i+1]<0)this.rainPositions[i+1]=18;}
    this.raindrops.geometry.attributes.position.needsUpdate=true;
    for(let i=0;i<this.dropPositions.length;i+=3){this.dropPositions[i+1]-=dt*(.018+(i%7)*.013);if(this.dropPositions[i+1]<.87)this.dropPositions[i+1]=2.94;}
    this.glassDrops.geometry.attributes.position.needsUpdate=true;
  }
  private updateEvents(){
    for(const root of this.actors.values())root.visible=false;this.spray.visible=false;this.rings.forEach(r=>r.visible=false);
    for(const e of this.ambient.events){const root=this.actors.get(e.type)!;root.visible=true;const p=e.age/e.duration,t=e.age;
      if(e.type==='bird'){
        root.position.set(-95+190*p,6+Math.sin(p*Math.PI)*3,-32-e.lane*22);root.rotation.y=-Math.PI/2+Math.sin(t*.2)*.15;
        root.children.forEach((bird,i)=>{bird.position.y=Math.sin(t*.8+i)*.16;bird.scale.setScalar(.52);for(const [name,sign]of [['Wing_L',-1],['Wing_R',1]] as const){const wing=bird.getObjectByName(name);if(wing)wing.rotation.z=sign*(Math.sin(t*7+i)*.42*(Math.sin(t*.6)>.3?1:.06));}});
        if(e.age<.1)this.audio.play('bird');
      }else if(e.type==='aircraft'){root.position.set( -290+580*p,40+Math.sin(p*Math.PI)*8,-260);root.rotation.y=-Math.PI/2;root.scale.setScalar(1.4);}
      else if(e.type==='fish'){
        root.position.set(-20+40*p,-.7-Math.sin(p*Math.PI)*.25,-5-e.lane*2);root.rotation.y=-Math.PI/2;
        root.children.forEach((f,i)=>{f.scale.setScalar(.42+i*.05);f.position.y=-i*.16+Math.sin(t*.5+i)*.05;f.rotation.x=Math.sin(t*.35+i)*.025;const tail=f.getObjectByName('FishTail_0');if(tail)tail.rotation.y=Math.sin(t*8+i)*.4;});
      }else {
        // Central open-water lane, in front of the nearest island's shoreline bounds.
        const z=-32-e.lane*4,x=(e.variation-.5)*8;
        root.scale.setScalar(2.15);root.rotation.set(0,1.03,0);root.position.set(x,-7,z);
        if(e.type==='spout'){
          root.position.y=-4.2+smooth(t/3)*3.15-smooth((t-10)/4)*4.5;
          if(t>4&&t<9){root.updateWorldMatrix(true,true);const hole=root.getObjectByName('Blowhole')!.getWorldPosition(vector(0,0,0));this.particles(hole.x,hole.y+.04,hole.z,t-4,0);}
          if(t>10)this.ripple(x,z,t-10,6);
        }else {
          if(t<4)root.position.y=-7+smooth(t/4)*2;
          else if(t<10){const q=(t-4)/6;root.position.y=-5+Math.sin(Math.PI*q)*8.4;root.rotation.x=.95-q*1.35;root.rotation.z=Math.sin(q*Math.PI)*.36;root.position.x+=q*3;}
          else {root.position.y=-7-(t-10)*1.2;this.particles(x+3,.2,z,t-10,1);this.ripple(x+3,z,t-10,8);}
        }
        const tail=root.getObjectByName('WhaleTail');if(tail)tail.rotation.x=Math.sin(t*1.1)*.16;
        for(const [name,sign] of [['Flipper_L',-1],['Flipper_R',1]] as const){const fin=root.getObjectByName(name);if(fin)fin.rotation.z=sign*Math.sin(t*.65)*.12;}
      }
    }
  }
  private particles(x:number,y:number,z:number,age:number,splash:number){
    this.spray.visible=true;const positions=this.spray.geometry.attributes.position.array as Float32Array;
    for(let i=0;i<72;i++){const a=i*2.399,r=.2+(i%9)*.17,life=splash?Math.min(age/3,1):((age+i*.079)%1.8)/1.8;
      positions[i*3]=x+Math.cos(a)*r*life*(splash?2:1)+(splash?0:life*.7);positions[i*3+1]=y+(splash?Math.max(0,Math.sin(life*Math.PI)*r*2.3):life*(3.1+(i%6)*.2));positions[i*3+2]=z+Math.sin(a)*r*life*(splash?2:1);
    }
    this.spray.material.size=splash?.25:1.1;
    this.spray.material.opacity=(splash?Math.max(0,.6-age*.14):.95*Math.sin(Math.min(1,age/4.8)*Math.PI))*(1-this.night*.65);
    this.spray.geometry.attributes.position.needsUpdate=true;
  }
  private ripple(x:number,z:number,age:number,size:number){this.rings.forEach((r,i)=>{const t=age-i*.55;r.visible=t>0&&t<7;r.position.set(x,.115+i*.003,z);r.scale.setScalar((.5+t*.45)*size);(r.material as THREE.MeshBasicMaterial).opacity=Math.max(0,.32-t*.046);});}
  private updateHands(t:number){
    if(!this.leftRig||!this.rightRig)return;
    const reduced=this.settings.reducedMotion,c=reduced?0:t%84;
    const quat=(x:number,y:number,z:number)=>new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z));
    const lRest=vector(-.43,.872,.60),lq=quat(.02,-.28,.04);
    const rq=quat(-.12,.25,-.12),axis=vector(.65,.73,.20).normalize();
    const writing=!reduced&&c<32&&c%8<5.9;
    const tip=vector(.35+(writing?Math.sin(t*2.1)*.026:0),.834,.36+(writing?Math.sin(t*1.4)*.012:0));
    const penQ=new THREE.Quaternion().setFromUnitVectors(vector(1,0,0),axis);
    const setPen=(point:THREE.Vector3,q:THREE.Quaternion)=>{this.pen.quaternion.copy(q);this.pen.position.copy(point).sub(vector(-.195,-.001,0).applyQuaternion(q));};
    this.pen.visible=true;setPen(tip,penQ);
    this.rightRig.at(tip.clone().addScaledVector(axis,.069),rq,'write');
    this.leftRig.at(lRest,lq,'rest');
    if(this.cup){this.cup.position.set(-.9,.818,-.26);this.cup.rotation.set(0,Math.PI,0);}
    if(this.page){this.page.rotation.z=0;this.page.visible=true;}
    if(c>34&&c<51&&this.cup){
      const a=c-34,reach=smooth(a/3),lift=smooth((a-3.5)/3.2),down=smooth((a-10)/3),ret=smooth((a-13)/3);
      // The cup travels from the saucer to the viewer's mouth, pauses for a sip,
      // then returns along the same arc. Keep the handle and hand in one rig.
      const raised=lift*(1-down);this.cup.position.addScaledVector(vector(.68,.68,1.34),raised);
      this.cup.position.y+=Math.sin(raised*Math.PI)*.075;
      this.cup.rotation.x=raised*.28;
      this.cup.updateWorldMatrix(true,true);
      const grip=this.cup.getObjectByName('CupGrip')!.getWorldPosition(vector(0,0,0));
      const amount=reach*(1-ret),contact=lRest.clone().lerp(grip,amount);
      // During approach / withdrawal, carry the open hand above the notebook and coaster.
      contact.y+=Math.sin(amount*Math.PI)*.16;
      // Local palm is -Y and left thumb is +X: rotate the thumb upward,
      // with the palm facing the cup's left handle, and the wrist toward the elbow.
      const q=lq.clone().slerp(quat(raised*.28,0,Math.PI/2),amount);
      this.leftRig.at(contact,q,'grip',smooth((a-2.4)/.9)*(1-smooth((a-12.1)/.6)));
      const phase=a>11.5?2:a>3.5?1:0;if(phase!==this.handSoundPhase){this.handSoundPhase=phase;if(phase===2)this.audio.play('cup');}
    }else if(c>56&&c<79){
      const parked=vector(.63,.782,.46),parkQ=quat(0,-.22,0);
      const put=smooth((c-56)/2.5),take=smooth((c-75)/3),penMove=put*(1-take);
      const currentTip=tip.clone().lerp(parked,penMove);currentTip.y+=Math.sin(penMove*Math.PI)*.16;
      const pq=penQ.clone().slerp(parkQ,penMove);setPen(currentTip,pq);
      const grip=currentTip.clone().add(vector(.069,0,0).applyQuaternion(pq));
      const off=smooth((c-59)/1.2)*(1-smooth((c-73)/1.4));
      this.rightRig.at(grip.lerp(vector(.64,.87,.68),off),rq,'write',1-off,penMove);
      if(this.page){
        const turn=smooth((c-64)/3.6);this.page.rotation.z=turn*Math.PI;
        // The completed leaf joins the left stack before the next writing cycle.
        this.page.visible=c<70.5;
        this.page.updateWorldMatrix(true,true);
        const edge=this.page.localToWorld(vector(.414,.008,.08));
        const approach=smooth((c-61)/2.6),release=smooth((c-68.2)/2.5),a=approach*(1-release);
        const contact=lRest.clone().lerp(edge,a);contact.y+=Math.sin(a*Math.PI)*.21+.020*a;
        const pageQ=quat(0,-.35,0),q=lq.clone().slerp(pageQ,a);
        this.leftRig.at(contact,q,'pinch',smooth((c-63)/.8)*(1-release));
        if(c>=64&&this.handSoundPhase!==3){this.audio.play('page');this.handSoundPhase=3;}
      }
    }else this.handSoundPhase=-1;
    this.leftRig.arm();this.rightRig.arm();
  }
  private updateFishing(f:FishingController,dt:number){
    const t=f.phaseTime;this.rod.position.set(.12,1.04,-.05);let angle=.03;
    if(f.phase==='Charging')angle=.14+f.power*.47;
    if(f.phase==='Casting'){const p=Math.min(1,t/1.35);angle=(1-smooth(p/.48))*.61-Math.sin(p*Math.PI)*.16;}
    if(f.phase==='Biting')angle=.015+Math.sin(t*5)*.007;
    if(f.phase==='Waiting')angle+=f.lurePulse*.055;
    if(f.phase==='Reeling')angle=.10+f.tension*.18+(f.lift&&!f.fighting?.16:0)+Math.sin(f.time*4)*.006;
    if(f.phase==='Caught')angle=.36;
    const aiming=['Ready','Charging','Casting','Waiting','Biting'].includes(f.phase)?(f.phase==='Ready'||f.phase==='Charging'?f.aim:f.castAim):0;
    const yaw=-.08-aiming*.34-(f.phase==='Reeling'?f.rodSteer*.23:0);
    this.rod.rotation.set(THREE.MathUtils.damp(this.rod.rotation.x,angle,12,dt),THREE.MathUtils.damp(this.rod.rotation.y,yaw,9,dt),-.04-(f.phase==='Reeling'?f.rodSteer*.055:0));
    this.rodBend=THREE.MathUtils.damp(this.rodBend,f.phase==='Reeling'?f.tension:f.phase==='Biting'?.14:.025,9,dt);const bend=this.rodBend;
    if(this.rodBlank&&this.rodBase){const p=this.rodBlank.geometry.attributes.position;
      for(let i=0;i<p.count;i++){const z=this.rodBase[i*3+2],q=Math.max(0,(-z-.2)/1.85);p.setY(i,this.rodBase[i*3+1]-bend*q*q*.32);}p.needsUpdate=true;this.rodBlank.geometry.computeVertexNormals();
      this.rod.getObjectByName('RodTip')!.position.y=.72-bend*.32;
    }
    this.rod.updateWorldMatrix(true,true);
    const grip=this.rod.getObjectByName('RodGrip')!;
    const rq=this.rod.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(vector(0,0,1),-Math.PI/2));
    this.rightRig?.at(grip.getWorldPosition(vector(0,0,0)),rq,'grip');
    this.reelSpeed=THREE.MathUtils.damp(this.reelSpeed,f.reeling?6:0,10,dt);this.reelAngle=(this.reelAngle+this.reelSpeed*dt)%(Math.PI*2);
    const crank=this.rod.getObjectByName('ReelHandle');if(crank)crank.rotation.x=this.reelAngle;
    this.rod.updateWorldMatrix(true,true);
    const crankGrip=this.rod.getObjectByName('CrankGrip')!;
    const lq=this.rod.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(vector(0,0,1),Math.PI/2));
    this.leftRig?.at(crankGrip.getWorldPosition(vector(0,0,0)),lq,'grip');
    this.leftRig?.arm(true);this.rightRig?.arm(true);
    this.rod.getObjectByName('RodTip')!.getWorldPosition(this.tip);
    const dist=f.castDistance,castX=f.castAim*dist*.36;
    if(f.phase==='Caught'&&this.previousFishPhase!=='Caught'){this.caughtFrom.copy(this.bob);this.caughtLift=0;}
    if(f.phase==='Releasing'&&this.previousFishPhase!=='Releasing'){this.releaseFrom.copy(this.bob);this.releasedLift=this.caughtLift;}
    this.previousFishPhase=f.phase;this.bob.set(.14+castX,.075,-dist);
    if(f.phase==='Casting'){const p=smooth(t/1.35);this.bob.lerpVectors(this.tip,vector(.14+castX,.075,-dist),p);this.bob.y+=Math.sin(p*Math.PI)*(1.3+f.power*.8);}
    else if(f.phase==='Waiting'){this.bob.y+=Math.sin(f.time*2.4)*.025+f.lurePulse*.065;if(t>f.waitTime*.48&&t<f.waitTime*.66)this.bob.y-=Math.sin(t*9)**2*.065;}
    else if(f.phase==='Biting')this.bob.y=-.17+Math.sin(t*9)*.02;
    else if(f.phase==='Reeling'){this.bob.z=-f.lineDistance;this.bob.x=.14+castX*(1-f.progress)-Math.cos(f.phaseTime*.73+(f.current?.species??0))*(.18+.8*f.struggle())*(1-f.progress*.65);}
    else if(f.phase==='Caught'){this.caughtLift=smooth(t/.9);this.bob.lerpVectors(this.caughtFrom,vector(.14,1.7+Math.sin(f.time)*.018,-1.9),this.caughtLift);}
    else if(f.phase==='Releasing'){const p=smooth(t/1.4);this.bob.lerpVectors(this.releaseFrom,vector(.14,-.18,-3.2),p);this.bob.y+=Math.sin(p*Math.PI)*.3;}
    const visible=!['Ready','Charging','Entering','Returning'].includes(f.phase);
    this.line.visible=visible;this.bobber.visible=visible&&!['Caught','Releasing'].includes(f.phase);this.bobber.position.copy(this.bob);this.bobber.rotation.z=Math.sin(f.time*2)*.08;
    const attr=this.line.geometry.attributes.position;
    for(let i=0;i<25;i++){const p=i/24,q=this.linePoint.lerpVectors(this.tip,this.bob,p);q.y-=Math.sin(p*Math.PI)*(f.phase==='Reeling'?.015:.11);attr.setXYZ(i,q.x,q.y,q.z);}attr.needsUpdate=true;
    if(this.leader)this.leader.visible=false;
    this.fishModels.forEach((fish,i)=>{
      fish.visible=!!f.current&&i===f.current.species&&['Waiting','Biting','Reeling','Caught','Releasing'].includes(f.phase);
      if(!fish.visible)return;const above=f.phase==='Caught'||f.phase==='Releasing';
      const lift=f.phase==='Caught'?this.caughtLift:above?THREE.MathUtils.lerp(this.releasedLift,1,smooth(t/.35)):0;
      fish.scale.setScalar(.36);fish.position.copy(this.bob);fish.position.y-=above?.15:.38;fish.rotation.set(lift*Math.PI/2,above?.3:Math.sin(f.time)*.35,lift*Math.sin(f.time*5)*.08);
      if(f.phase==='Waiting'){fish.position.x+=Math.sin(f.phaseTime*.4)*.3;fish.position.z-=Math.max(0,1-f.phaseTime/f.waitTime)*1.5;}
      const tail=fish.getObjectByName(`FishTail_${i}`);if(tail)tail.rotation.y=Math.sin(f.time*9)*.36;
      if(this.leader){fish.updateWorldMatrix(true,true);const mouth=fish.getObjectByName(`FishMouth_${i}`)?.getWorldPosition(vector(0,0,0));if(mouth){this.leader.visible=true;const l=this.leader.geometry.attributes.position;l.setXYZ(0,this.bob.x,this.bob.y,this.bob.z);l.setXYZ(1,mouth.x,mouth.y,mouth.z);l.needsUpdate=true;}}
    });
    if(f.phase==='Biting'||f.phase==='Reeling')this.ripple(this.bob.x,this.bob.z,(f.time%2.6),.2);
  }
  diagnostics(){return {fps:Math.round(this.fps*10)/10,quality:this.quality,drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures,view:this.currentView,time:this.time,travel:this.travel,events:this.ambient.events.map(e=>({type:e.type,age:e.age})),size:this.renderer.getDrawingBufferSize(new THREE.Vector2()).toArray()};}
  contacts(){
    this.scene.updateMatrixWorld(true);const right=this.right.getObjectByName('Grip_R')?.getWorldPosition(vector(0,0,0)),left=this.left.getObjectByName('Grip_L')?.getWorldPosition(vector(0,0,0));
    const target=this.rod.getObjectByName('RodGrip')?.getWorldPosition(vector(0,0,0)),crank=this.rod.getObjectByName('CrankGrip')?.getWorldPosition(vector(0,0,0));
    return {rightError:right&&target?right.distanceTo(target):null,leftError:left&&crank?left.distanceTo(crank):null,rodTip:this.tip.toArray(),lineTip:[this.line.geometry.attributes.position.getX(0),this.line.geometry.attributes.position.getY(0),this.line.geometry.attributes.position.getZ(0)]};
  }
  forceEvent(type:EventType){return this.ambient.force(type);}
  arrive(){
    this.harbor.visible=true;this.harbor.position.set(21,0,-13);const ship=this.harbor.getObjectByName('ShipExterior');if(ship)ship.visible=false;
    this.docking=gsap.to(this.harbor.position,{x:6,duration:this.settings.reducedMotion?0:8,ease:'sine.out'});
  }
  private collectResources(){this.scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line||o instanceof THREE.Points){this.resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])this.resources.add(m);}});}
  dispose(){if(this.disposed)return;this.disposed=true;cancelAnimationFrame(this.raf);this.transition?.kill();this.docking?.kill();window.removeEventListener('resize',this.resize);this.canvas.removeEventListener('pointermove',this.pointerMove);this.canvas.removeEventListener('pointerleave',this.pointerLeave);this.canvas.removeEventListener('click',this.pointerClick);this.canvas.removeEventListener('webglcontextlost',this.contextLost);this.ambient.clear();this.collectResources();this.resources.forEach(r=>r.dispose());this.resources.clear();this.environment.dispose();this.scene.environment=null;this.ocean.dispose();this.sun.shadow.map?.dispose();this.renderer.dispose();this.renderer.forceContextLoss();this.onFrame=null;this.scene.clear();}
}
