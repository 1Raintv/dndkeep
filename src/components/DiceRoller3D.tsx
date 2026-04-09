/**
 * DiceRoller3D — v1.7.1
 * Clean 3D dice with:
 * - Smooth slerp correction instead of hard snap
 * - Per-die scale multipliers (d6/d4 sized correctly)
 * - d100 as two d10s (tens=one color, units=another)
 * - Per-die font size tuning
 * - Face-aligned plane numbers (no bleed)
 */
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';

export interface DiceRollEvent {
  result: number; dieType: number; modifier?: number; total?: number;
  label?: string; allDice?: { die: number; value: number }[];
  expression?: string; flatBonus?: number;
}
interface Props { event: DiceRollEvent; onDismiss: () => void; }

const PHI = (1+Math.sqrt(5))/2;
type V3 = [number,number,number];
const unit=(vs:V3[]):V3[]=>vs.map(v=>{const l=Math.sqrt(v[0]**2+v[1]**2+v[2]**2)||1;return[v[0]/l,v[1]/l,v[2]/l];});
const sub=(a:V3,b:V3):V3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a:V3,b:V3):V3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a:V3,b:V3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm=(v:V3):V3=>{const l=Math.sqrt(dot(v,v))||1;return[v[0]/l,v[1]/l,v[2]/l];};

interface GeoDef{verts:V3[];faces:number[][];nums:number[]}

const D10_VERTS = (():V3[]=>{
  const v:V3[]=[];
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5;v.push([Math.cos(a),0.5,Math.sin(a)]);}
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5+Math.PI/5;v.push([Math.cos(a),-0.5,Math.sin(a)]);}
  v.push([0,1.3,0],[0,-1.3,0]);return unit(v);
})();
const D10_FACES = (():number[][]=>{ const f:number[][]=[];for(let i=0;i<5;i++){f.push([10,(i+1)%5,i],[11,i+5,((i+1)%5)+5]);}return f; })();

const GD:Record<number,GeoDef> = {
  4:{
    verts:unit([[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]]),
    faces:[[0,1,2],[0,2,3],[0,3,1],[1,3,2]],nums:[1,2,3,4]
  },
  6:{
    verts:[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
    faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]],nums:[1,6,2,5,3,4]
  },
  8:{
    verts:[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],
    faces:[[0,2,4],[2,1,4],[1,3,4],[3,0,4],[0,5,2],[2,5,1],[1,5,3],[3,5,0]],nums:[1,2,3,4,5,6,7,8]
  },
  10:{ verts:D10_VERTS, faces:D10_FACES, nums:[1,6,2,7,3,8,4,9,5,10] },
  // d10 variant for d100 with 0-9 labels
  10090:{ verts:D10_VERTS, faces:D10_FACES, nums:[0,6,2,7,3,8,4,9,5,1] }, // tens: 0-9 (×10)
  10091:{ verts:D10_VERTS, faces:D10_FACES, nums:[0,6,2,7,3,8,4,9,5,1] }, // units: 0-9
  12:{
    verts:unit([[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],
      [0,-1/PHI,-PHI],[0,1/PHI,-PHI],[0,-1/PHI,PHI],[0,1/PHI,PHI],
      [-1/PHI,-PHI,0],[1/PHI,-PHI,0],[1/PHI,PHI,0],[-1/PHI,PHI,0],
      [-PHI,0,-1/PHI],[-PHI,0,1/PHI],[PHI,0,-1/PHI],[PHI,0,1/PHI]]),
    faces:[[0,8,13,12,16],[1,18,13,8,9],[2,9,8,0,3],[3,0,16,17,15],[4,17,16,12,10],
           [5,19,18,1,6],[6,1,2,14,19],[7,11,14,2,3],[7,15,17,4,11],[5,10,12,13,18],
           [4,10,5,6,7],[11,4,19,14,15]],
    nums:[1,2,3,4,5,6,7,8,9,10,11,12]
  },
  20:{
    verts:unit([[0,1,PHI],[0,-1,PHI],[0,1,-PHI],[0,-1,-PHI],[1,PHI,0],[-1,PHI,0],
      [1,-PHI,0],[-1,-PHI,0],[PHI,0,1],[PHI,0,-1],[-PHI,0,1],[-PHI,0,-1]]),
    faces:[[0,1,8],[0,8,4],[0,4,5],[0,5,10],[0,10,1],[3,2,11],[3,11,7],[3,7,6],[3,6,9],[3,9,2],
           [1,6,8],[8,6,9],[8,9,4],[4,9,2],[4,2,5],[5,2,11],[5,11,10],[10,11,7],[10,7,1],[1,7,6]],
    nums:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]
  },
};
const gd=(s:number)=>GD[s]??GD[20];

// Per-die visual scale multiplier — normalizes apparent size
const SCALE_MULT:Record<number,number> = {4:0.85, 6:0.72, 8:1.0, 10:1.0, 12:1.0, 20:1.0, 100:1.0};
// Per-die font size factor (0-1, relative to face radius)
const FONT_FACTOR:Record<number,number> = {4:1.1, 6:1.0, 8:1.1, 10:1.1, 12:0.88, 20:0.80, 100:1.0};

// Themes: body faces + edge highlight
const THEME:Record<number,{face:number;edge:number}> = {
  4:  {face:0x6d28d9, edge:0xddd6fe},
  6:  {face:0xdc2626, edge:0xfecaca},
  8:  {face:0x16a34a, edge:0xbbf7d0},
  10: {face:0x0284c7, edge:0xe0f2fe},
  12: {face:0xc026d3, edge:0xfae8ff},
  20: {face:0xca8a04, edge:0xfef3c7},
  100:{face:0xc2410c, edge:0xffedd5},
  // d100 tens die (white/silver)
  1001:{face:0x374151, edge:0xf1f5f9},
  // d100 units die (red)
  1002:{face:0x991b1b, edge:0xfecaca},
};
const theme=(s:number)=>THEME[s]??THEME[20];

function buildSolidGeo(def:GeoDef, s:number):THREE.BufferGeometry {
  const pos:number[]=[],nor:number[]=[];
  const g=new THREE.BufferGeometry(); let off=0;
  def.faces.forEach((face,fi)=>{
    const start=off; let tc=0;
    for(let i=1;i<face.length-1;i++){
      const a=def.verts[face[0]],b=def.verts[face[i]],c=def.verts[face[i+1]];
      const [ax,ay,az]=[a[0]*s,a[1]*s,a[2]*s],[bx,by,bz]=[b[0]*s,b[1]*s,b[2]*s],[cx,cy,cz]=[c[0]*s,c[1]*s,c[2]*s];
      const [ex,ey,ez]=[bx-ax,by-ay,bz-az],[fx,fy,fz]=[cx-ax,cy-ay,cz-az];
      const [nx,ny,nz]=[ey*fz-ez*fy,ez*fx-ex*fz,ex*fy-ey*fx];
      const nl=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
      pos.push(ax,ay,az,bx,by,bz,cx,cy,cz);
      nor.push(nx/nl,ny/nl,nz/nl,nx/nl,ny/nl,nz/nl,nx/nl,ny/nl,nz/nl);
      tc++;
    }
    g.addGroup(start,tc*3,fi); off+=tc*3;
  });
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  return g;
}

function buildFaceMats(def:GeoDef, t:{face:number;edge:number}):THREE.MeshPhongMaterial[] {
  const fc=new THREE.Color(t.face);
  return def.faces.map(()=>new THREE.MeshPhongMaterial({
    color:fc, emissive:fc.clone().multiplyScalar(0.1),
    specular:new THREE.Color(t.edge), shininess:55,
    side:THREE.DoubleSide,
  }));
}

// Number texture
const texCache=new Map<string,THREE.CanvasTexture>();
function numTex(label:string, edgeCol:number):THREE.CanvasTexture {
  const key=`${label}-${edgeCol}`;
  if(texCache.has(key))return texCache.get(key)!;
  const cv=document.createElement('canvas');cv.width=128;cv.height=128;
  const ctx=cv.getContext('2d')!;
  const r=(edgeCol>>16)&255,g=(edgeCol>>8)&255,b=edgeCol&255;
  const fs=label.length>=3?42:label.length===2?54:64;
  ctx.clearRect(0,0,128,128);
  ctx.font=`900 ${fs}px system-ui`;
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.strokeStyle='rgba(0,0,0,0.9)';ctx.lineWidth=5;ctx.strokeText(label,64,68);
  ctx.fillStyle=`rgb(${r},${g},${b})`;ctx.fillText(label,64,68);
  const t=new THREE.CanvasTexture(cv);texCache.set(key,t);return t;
}

// Face centroid, outward normal, and inscribed radius
function faceInfo(def:GeoDef, fi:number, s:number) {
  const face=def.faces[fi];
  const vs=face.map(vi=>def.verts[vi]);
  const cx=vs.reduce((a,v)=>a+v[0],0)/vs.length*s;
  const cy=vs.reduce((a,v)=>a+v[1],0)/vs.length*s;
  const cz=vs.reduce((a,v)=>a+v[2],0)/vs.length*s;
  const a=def.verts[face[0]],b=def.verts[face[1]],c=def.verts[face[2]];
  const n1=norm(cross(sub(b,a),sub(c,a)));
  const fc:V3=[cx/s,cy/s,cz/s];
  const outward:V3=dot(n1,fc)>=0?n1:[-n1[0],-n1[1],-n1[2]];
  // Inscribed radius: min distance from centroid to each edge midpoint
  const inscribed=face.reduce((mn,vi,i)=>{
    const nv=def.verts[face[(i+1)%face.length]];
    const mv=def.verts[vi];
    const mx=(mv[0]+nv[0])/2*s-cx, my=(mv[1]+nv[1])/2*s-cy, mz=(mv[2]+nv[2])/2*s-cz;
    return Math.min(mn,Math.sqrt(mx*mx+my*my+mz*mz));
  },Infinity);
  return {pos:[cx,cy,cz] as V3, normal:outward, inscribed};
}

// Get target quaternion so face with targetNum faces up (+Y)
function getTargetQuat(def:GeoDef, targetNum:number, s:number):THREE.Quaternion|null {
  const fi=def.nums.indexOf(targetNum); if(fi<0)return null;
  const {normal:faceN}=faceInfo(def,fi,s);
  const up:V3=[0,1,0];
  const cosA=Math.min(1,Math.max(-1,dot(faceN,up)));
  const angle=Math.acos(cosA); if(Math.abs(angle)<0.001)return new THREE.Quaternion();
  let axis:V3;
  if(Math.abs(angle-Math.PI)<0.001)axis=[1,0,0];
  else axis=norm(cross(faceN,up));
  const q=new THREE.Quaternion();
  q.setFromAxisAngle(new THREE.Vector3(axis[0],axis[1],axis[2]),angle);
  return q;
}

interface PhysDie {
  group:THREE.Group; def:GeoDef; sides:number; val:number;
  x:number;y:number;z:number;vx:number;vy:number;vz:number;
  quat:THREE.Quaternion;        // current rotation (quaternion-based)
  arx:number;ary:number;arz:number; // angular velocity
  phase:'fly'|'tween'|'done';
  tweenT:number;                // 0→1 slerp progress
  tweenFrom:THREE.Quaternion;
  tweenTo:THREE.Quaternion;
  delay:number; scale:number;
  numLabel:(n:number)=>string;  // how to label face numbers
}

// Build die group (geometry + edges + number planes)
function buildDieGroup(def:GeoDef, S:number, t:{face:number;edge:number}, fontFactor:number,
                       numLabel:(n:number)=>string): THREE.Group {
  const geo=buildSolidGeo(def,S);
  const mats=buildFaceMats(def,t);
  const mesh=new THREE.Mesh(geo,mats);
  mesh.castShadow=true; mesh.receiveShadow=true;
  const edgesGeo=new THREE.EdgesGeometry(buildSolidGeo(def,S*1.003));
  const edges=new THREE.LineSegments(edgesGeo,new THREE.LineBasicMaterial({color:t.edge}));
  const group=new THREE.Group();
  group.add(mesh); group.add(edges);

  def.faces.forEach((_,fi)=>{
    const {pos,normal,inscribed}=faceInfo(def,fi,S);
    const sz=inscribed*1.7*fontFactor; // fit within face
    const offset=0.03*S;
    const planeGeo=new THREE.PlaneGeometry(sz,sz);
    const planeMat=new THREE.MeshBasicMaterial({
      map:numTex(numLabel(def.nums[fi]),t.edge),
      transparent:true,side:THREE.FrontSide,
      depthTest:true,depthWrite:false,alphaTest:0.05,
    });
    const plane=new THREE.Mesh(planeGeo,planeMat);
    plane.position.set(pos[0]+normal[0]*offset,pos[1]+normal[1]*offset,pos[2]+normal[2]*offset);
    const q=new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(normal[0],normal[1],normal[2]));
    plane.quaternion.copy(q);
    group.add(plane);
  });
  return group;
}

export default function DiceRoller3D({event,onDismiss}:Props) {
  const mountRef=useRef<HTMLDivElement>(null);
  const dismissRef=useRef(onDismiss);
  dismissRef.current=onDismiss;

  useEffect(()=>{
    const el=mountRef.current; if(!el)return;
    const W=window.innerWidth,H=window.innerHeight;

    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
    renderer.setSize(W,H); renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.domElement.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    el.appendChild(renderer.domElement);

    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(60,W/H,0.1,200);
    camera.position.set(0,7,3); camera.lookAt(0,0,0);

    scene.add(new THREE.AmbientLight(0xffffff,1.4));
    const sun=new THREE.DirectionalLight(0xffffff,2.2);
    sun.position.set(3,10,4); sun.castShadow=true;
    sun.shadow.camera.left=-8;sun.shadow.camera.right=8;
    sun.shadow.camera.top=8;sun.shadow.camera.bottom=-8;
    sun.shadow.camera.far=30;sun.shadow.bias=-0.001;
    scene.add(sun);
    const fill=new THREE.DirectionalLight(0x8899ff,0.4);
    fill.position.set(-3,-2,2); scene.add(fill);

    const shadowFloor=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.ShadowMaterial({opacity:0.25}));
    shadowFloor.rotation.x=-Math.PI/2;shadowFloor.receiveShadow=true;scene.add(shadowFloor);

    const FLOOR=0,GRAV=22,BOUNCE=0.48,WALL_B=0.5,BX=2.8,BZ=2.0;
    const baseS=Math.max(0.9,1.5-Math.max(1,event.allDice?.length??1)*0.06);

    // Build dice list — handle d100 specially
    interface DiceSpec { die:number; geoKey:number; val:number;
      themeKey:number; numLabel:(n:number)=>string; offsetX:number; }
    const specs:DiceSpec[]=[];

    const rawList=event.allDice?.length?event.allDice:[{die:event.dieType,value:event.result}];
    rawList.forEach((d,i)=>{
      if(d.die===100){
        const tens=d.value===100?0:Math.floor(d.value/10);
        const units=d.value%10;
        // Tens die — shows 0,10,20,...,90 — uses nums 0-9 internally, label ×10
        specs.push({die:10,geoKey:10090,val:tens,themeKey:1001,
          numLabel:(n:number)=>n===0?'00':String(n*10), offsetX:-0.6});
        // Units die — shows 0-9
        specs.push({die:10,geoKey:10091,val:units,themeKey:1002,
          numLabel:(n:number)=>String(n), offsetX:0.6});
      } else {
        specs.push({die:d.die,geoKey:d.die,val:d.value,themeKey:d.die,
          numLabel:(n:number)=>String(n), offsetX:(rawList.length>1?(i-(rawList.length-1)/2)*1.6:0)});
      }
    });

    const dice:PhysDie[]=specs.map((spec,i)=>{
      const def=gd(spec.geoKey);
      const S=baseS*(SCALE_MULT[spec.die]??1.0);
      const t=theme(spec.themeKey);
      const ff=FONT_FACTOR[spec.die]??1.0;
      const group=buildDieGroup(def,S,t,ff,spec.numLabel);
      scene.add(group);
      // Start orientation: target face DOWN so physics naturally lands it right
      const targetQ=getTargetQuat(def,spec.val,S);
      const startQ=new THREE.Quaternion();
      if(targetQ){
        // Face DOWN = rotate 180° around X from face-up orientation
        const flipX=new THREE.Quaternion(); flipX.setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI);
        startQ.copy(targetQ).multiply(flipX);
        // Add random Y rotation for variety
        const yRot=new THREE.Quaternion(); yRot.setFromAxisAngle(new THREE.Vector3(0,1,0),Math.random()*Math.PI*2);
        startQ.premultiply(yRot);
      } else {
        startQ.setFromEuler(new THREE.Euler(Math.random()*Math.PI*2,Math.random()*Math.PI*2,Math.random()*Math.PI*2));
      }
      group.quaternion.copy(startQ);
      const spread=Math.min(BX*0.4,specs.length*0.3);
      return {
        group,def,sides:spec.die,val:spec.val,scale:S,
        x:spec.offsetX+(Math.random()-.5)*spread,y:3.5+Math.random()*1.5,
        z:(Math.random()-.5)*spread*0.5,
        vx:(Math.random()-.5)*2,vy:-(1+Math.random()*1.5),vz:(Math.random()-.5)*1.5,
        quat:startQ.clone(),
        arx:(Math.random()-.5)*14,ary:(Math.random()-.5)*14,arz:(Math.random()-.5)*10,
        phase:'fly' as const,tweenT:0,
        tweenFrom:new THREE.Quaternion(),tweenTo:new THREE.Quaternion(),
        delay:i*0.12,numLabel:spec.numLabel,
      };
    });

    function update(dt:number){
      const TWEEN_DUR=0.45;
      dice.forEach(d=>{
        if(d.delay>0){d.delay-=dt;return;}

        if(d.phase==='tween'){
          d.tweenT+=dt/TWEEN_DUR;
          if(d.tweenT>=1){d.tweenT=1;d.phase='done';}
          const q=new THREE.Quaternion();
          q.slerpQuaternions(d.tweenFrom,d.tweenTo,smoothstep(d.tweenT));
          d.group.quaternion.copy(q);
          return;
        }
        if(d.phase==='done')return;

        // Quaternion-based angular integration
        d.vy-=GRAV*dt;
        d.x+=d.vx*dt;d.y+=d.vy*dt;d.z+=d.vz*dt;
        const angLen=Math.sqrt(d.arx**2+d.ary**2+d.arz**2);
        if(angLen>0.001){
          const a=angLen*dt;
          const dq=new THREE.Quaternion();
          dq.setFromAxisAngle(new THREE.Vector3(d.arx/angLen,d.ary/angLen,d.arz/angLen),a);
          d.quat.premultiply(dq).normalize();
        }
        d.group.position.set(d.x,d.y,d.z);
        d.group.quaternion.copy(d.quat);

        const r=d.scale*0.82;
        if(d.y-r<FLOOR){
          d.y=FLOOR+r;d.vy=Math.abs(d.vy)*BOUNCE;
          d.vx*=0.86;d.vz*=0.86;
          d.arx*=0.70;d.ary*=0.70;d.arz*=0.70;
          if(d.vy<0.15)d.vy=0;
        }
        if(d.x<-BX){d.x=-BX;d.vx=Math.abs(d.vx)*WALL_B;}
        if(d.x> BX){d.x= BX;d.vx=-Math.abs(d.vx)*WALL_B;}
        if(d.z<-BZ){d.z=-BZ;d.vz=Math.abs(d.vz)*WALL_B;}
        if(d.z> BZ){d.z= BZ;d.vz=-Math.abs(d.vz)*WALL_B;}
        if(Math.abs(d.y-r-FLOOR)<0.05){d.vx*=0.96;d.vz*=0.96;d.arx*=0.95;d.ary*=0.95;d.arz*=0.95;}

        const spd=Math.sqrt(d.vx**2+d.vy**2+d.vz**2);
        const ang=Math.sqrt(d.arx**2+d.ary**2+d.arz**2);
        if(spd<0.12&&ang<0.35&&Math.abs(d.y-r-FLOOR)<0.06){
          d.y=FLOOR+r;d.vx=d.vy=d.vz=d.arx=d.ary=d.arz=0;
          d.group.position.set(d.x,d.y,d.z);
          const tq=getTargetQuat(d.def,d.val,d.scale);
          if(tq){
            d.tweenFrom.copy(d.quat);
            d.tweenTo.copy(tq);
            d.tweenT=0; d.phase='tween';
          } else {
            d.phase='done';
          }
        }
      });
    }

    function smoothstep(t:number){return t*t*(3-2*t);}

    let last=performance.now(),allDone=false,doneT=0,dismissed=false,raf=0,resultShown=false;
    function showResult(){
      if(resultShown||!el)return;resultShown=true;
      const tot=event.total??(event.modifier!==undefined?event.result+event.modifier:event.result);
      const multi=rawList.length>1;
      const hasMod=!multi&&event.modifier!==undefined&&event.modifier!==0;
      const lbl=event.label||(event.dieType===100?'d100':event.dieType?`d${event.dieType}`:'Roll');
      const div=document.createElement('div');
      div.style.cssText='position:absolute;top:7%;left:50%;transform:translateX(-50%) scale(0.5);text-align:center;pointer-events:none;white-space:nowrap;animation:rr 0.6s cubic-bezier(0.34,1.56,0.64,1) both;';
      div.innerHTML=
        `<div style="font:700 13px system-ui;color:rgba(255,255,255,0.5);letter-spacing:.2em;text-transform:uppercase;margin-bottom:4px">${lbl}</div>`+
        `<div style="font:900 ${multi?72:96}px system-ui;color:#fff;line-height:1;text-shadow:0 0 50px rgba(255,255,255,0.7)">${tot}</div>`+
        (hasMod?`<div style="font:500 17px system-ui;color:rgba(255,255,255,0.5);margin-top:4px">${event.result} ${(event.modifier??0)>=0?'+':''}${event.modifier}</div>`:'');
      el.appendChild(div);
    }
    function frame(ts:number){
      if(dismissed)return;
      raf=requestAnimationFrame(frame);
      const dt=Math.min((ts-last)/1000,0.05);last=ts;
      update(dt);
      if(!allDone&&dice.filter(d=>d.delay<=0).every(d=>d.phase==='done')){
        allDone=true;doneT=0;showResult();
      }
      if(allDone){doneT+=dt;if(doneT>4.5){dismissed=true;dismissRef.current();cancelAnimationFrame(raf);return;}}
      renderer.render(scene,camera);
    }
    raf=requestAnimationFrame(frame);
    return()=>{dismissed=true;cancelAnimationFrame(raf);renderer.dispose();
      if(el.contains(renderer.domElement))el.removeChild(renderer.domElement);
      scene.clear();texCache.clear();};
  },[]);

  return createPortal(
    <div ref={mountRef} onClick={onDismiss} style={{
      position:'fixed',inset:0,zIndex:9999,
      background:'rgba(2,5,14,0.88)',backdropFilter:'blur(12px)',
      cursor:'pointer',overflow:'hidden',
    }}>
      <div style={{position:'absolute',bottom:14,left:0,right:0,textAlign:'center',
        pointerEvents:'none',fontFamily:'var(--ff-body)',fontSize:11,color:'rgba(255,255,255,0.2)'}}>
        Click anywhere to dismiss</div>
      <style>{`@keyframes rr{from{opacity:0;transform:translateX(-50%) scale(0.5)}to{opacity:1;transform:translateX(-50%) scale(1)}}`}</style>
    </div>,
    document.body
  );
}
