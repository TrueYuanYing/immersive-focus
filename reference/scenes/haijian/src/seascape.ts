import * as THREE from 'three';
import {Reflector} from 'three/addons/objects/Reflector.js';
const noiseGLSL=`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=noise(p)*a;p=mat2(.8,-.6,.6,.8)*p*2.03;a*=.5;}return v;}`;

/** Transparent surface over submerged geometry, with a clipped planar scene reflection. */
export function makeOcean(){
  const ocean=new Reflector(new THREE.PlaneGeometry(1600,1600,160,160),{
    textureWidth:512,textureHeight:512,multisample:0,clipBias:.001,
    shader:{name:'IslandWater',uniforms:{color:{value:new THREE.Color()},tDiffuse:{value:null},textureMatrix:{value:new THREE.Matrix4()},uTime:{value:0},uTravel:{value:0},uRain:{value:0},uNight:{value:0},uWarm:{value:0},uReflection:{value:1}},
      vertexShader:`uniform mat4 textureMatrix;uniform float uTime;varying vec4 vReflect;varying vec3 vWorld;
      void main(){vec3 p=position;vReflect=textureMatrix*vec4(p,1.);p.z+=sin(p.x*.16+p.y*.10+uTime*.5)*.045+sin(p.x*.36-p.y*.27+uTime*.6)*.018;vWorld=(modelMatrix*vec4(p,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
      fragmentShader:`uniform sampler2D tDiffuse;uniform float uTime,uTravel,uNight,uRain,uWarm,uReflection;varying vec4 vReflect;varying vec3 vWorld;
      ${noiseGLSL}
      float waves(vec2 p){float t=uTime*.20;return fbm(p*.28+vec2(t,-t*.32))*.36+noise(p*1.4+vec2(-t,t*.8))*.035;}
      void main(){vec2 p=vWorld.xz+vec2(uTravel,0.);float e=.22,w=waves(p);
      vec3 normal=normalize(vec3((w-waves(p+vec2(e,0.)))*1.1,.37,(w-waves(p+vec2(0.,e)))*1.1));
      vec3 view=normalize(cameraPosition-vWorld);float fresnel=.025+.975*pow(1.-max(dot(view,normal),0.),4.);
      float dist=distance(cameraPosition,vWorld);vec2 uv=vReflect.xy/vReflect.w+normal.xz*.025/(1.+dist*.013);
      vec3 sky=mix(vec3(.24,.49,.57),vec3(.40,.60,.62),fresnel);sky=mix(sky,vec3(.25,.35,.40),uRain*.6);sky*=1.-uNight*.86;
      vec3 reflection=mix(sky,texture2D(tDiffuse,uv).rgb,uReflection);
      vec3 teal=mix(vec3(.018,.17,.19),vec3(.045,.28,.29),fbm(p*.09));teal=mix(teal,vec3(.055,.17,.20),uRain*.7);teal*=1.-uNight*.83;
      vec3 col=mix(teal,reflection,.15+fresnel*.72);
      vec3 light=normalize(vec3(-.48,.5,-.7));float glint=pow(max(dot(reflect(-light,normal),view),0.),220.);
      col+=vec3(1.,.82,.46)*glint*(1.-uRain)*(1.-uNight)*.9;
      float wake=exp(-pow((abs(vWorld.x)-2.9)*1.6,2.))*exp(-abs(vWorld.z+1.)*.18);
      col+=vec3(.18,.27,.22)*wake*smoothstep(.53,.7,fbm(p*2.))* (1.-uNight*.8);
      col=mix(col,col*vec3(1.17,.91,.73),uWarm*.6);
      float alpha=clamp(.27+fresnel*.65+(1.-exp(-dist*.016))*.20,.28,.985);
      gl_FragColor=vec4(col,alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`
    }
  }) as Reflector & {material:THREE.ShaderMaterial};
  ocean.rotation.x=-Math.PI/2;ocean.material.transparent=true;ocean.material.depthWrite=false;ocean.frustumCulled=false;ocean.renderOrder=2;
  const reflect=ocean.onBeforeRender;
  ocean.onBeforeRender=function(...args){if(ocean.material.uniforms.uReflection.value)reflect.apply(ocean,args);};
  return ocean;
}
export function makeSky(){
  const material=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{uNight:{value:0},uWarm:{value:0},uRain:{value:0},uTime:{value:0}},
    vertexShader:`varying vec3 vPosition;void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec3 vPosition;uniform float uNight,uWarm,uRain,uTime;${noiseGLSL}
    void main(){vec3 d=normalize(vPosition);float h=smoothstep(-.05,.6,d.y);
    vec3 col=mix(vec3(.33,.62,.69),vec3(.075,.34,.56),h);
    col=mix(col,mix(vec3(.92,.68,.43),vec3(.25,.40,.54),h),uWarm);
    col=mix(col,mix(vec3(.51,.64,.66),vec3(.25,.36,.44),h),uRain*.84);
    vec2 p=d.xz/max(.10,d.y+.13)*1.6+vec2(uTime*.0018,0.);
    float n=fbm(p),cloud=smoothstep(.49-uRain*.10,.67-uRain*.11,n)*smoothstep(.01,.15,d.y);
    vec3 cc=mix(vec3(.78,.84,.78),vec3(.98,.94,.78),smoothstep(.46,.73,n));cc=mix(cc,vec3(.42,.51,.54),uRain*.7);
    col=mix(col,cc,cloud*.88);col=mix(col,col*vec3(.09,.14,.23),uNight);
    float sun=pow(max(dot(d,normalize(vec3(-.48,.28,-.84))),0.),700.);col+=vec3(.7,.52,.25)*sun*(1.-uRain)*(1.-uNight);
    float stars=step(.9985,hash(floor(d.xz/max(.15,d.y)*750.)))*smoothstep(.15,.7,d.y);col+=stars*uNight*.32;
    gl_FragColor=vec4(col,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>}`});
  return new THREE.Mesh(new THREE.SphereGeometry(800,24,16),material);
}
export function makeSeabed(){
  const g=new THREE.PlaneGeometry(900,900);g.rotateX(-Math.PI/2);
  const m=new THREE.MeshStandardMaterial({color:0x518f7d,roughness:1});
  m.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 sandP;').replace('#include <begin_vertex>','#include <begin_vertex>\nsandP=position;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 sandP;${noiseGLSL}`).replace('#include <color_fragment>','#include <color_fragment>\nfloat n=fbm(sandP.xz*.6);float caustic=pow(1.-abs(sin(sandP.x*.9+noise(sandP.xz*.3)*9.)),12.);diffuseColor.rgb*=.65+n*.45+caustic*.12;');
  };
  const bed=new THREE.Mesh(g,m);bed.position.y=-4.4;return bed;
}
