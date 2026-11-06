import {MeshStandardMaterial} from 'three';
/** Subtle surface variation remains in world units across separately authored meshes. */
export function detailMaterial(m:MeshStandardMaterial){
  const name=m.name;
  if(/Brass/.test(name)){m.roughness=.29;m.metalness=.78;}
  else if(/Pine/.test(name)){m.roughness=.43;m.metalness=0;}
  else if(/Wood/.test(name)){m.roughness=.72;m.metalness=0;}
  else if(name==='Tea'){m.roughness=.19;m.metalness=0;}
  else if(name==='Cream'){m.roughness=.48;m.metalness=0;}
  if(/Glow|Black|SeaGlass/.test(name))return;
  const kind=/Wood/.test(name)?1:/Skin/.test(name)?2:/Sleeve|Cuff/.test(name)?3:/Whale/.test(name)?4:5;
  m.customProgramCacheKey=()=>`haijian-surface-2-${kind}`;
  m.onBeforeCompile=s=>{
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 detailP;').replace('#include <begin_vertex>','#include <begin_vertex>\ndetailP=position;');
    s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 detailP;
    float dh(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
    float dn(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(dh(i),dh(i+vec3(1,0,0)),f.x),mix(dh(i+vec3(0,1,0)),dh(i+vec3(1,1,0)),f.x),f.y),mix(mix(dh(i+vec3(0,0,1)),dh(i+vec3(1,0,1)),f.x),mix(dh(i+vec3(0,1,1)),dh(i+vec3(1,1,1)),f.x),f.y),f.z);}`);
    const pattern=kind===1?'float phase=detailP.x*80.+dn(detailP*vec3(5.,1.,1.))*5.;float grain=sin(phase)*(1.-smoothstep(.7,2.7,fwidth(phase)));diffuseColor.rgb*=.96+grain*.025+dn(detailP*2.)*.055;':kind===2?'diffuseColor.rgb*=.98+dn(detailP*85.)*.03;':kind===3?'vec2 phase=detailP.xz*450.;vec2 filterWidth=fwidth(phase);float weave=sin(phase.x)*sin(phase.y)*(1.-smoothstep(.7,2.7,max(filterWidth.x,filterWidth.y)));diffuseColor.rgb*=.985+weave*.015;':kind===4?'float whaleMottle=dn(detailP*vec3(12.,10.,6.));diffuseColor.rgb*=.91+whaleMottle*.17;diffuseColor.rgb+=vec3(.018)*smoothstep(.66,.88,whaleMottle);':'diffuseColor.rgb*=.96+dn(detailP*2.5)*.07;';
    s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\n${pattern}`);
  };
}
