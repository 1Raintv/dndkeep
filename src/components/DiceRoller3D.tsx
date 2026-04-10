/**
 * DiceRoller3D — v2.0.0
 * Uses cannon-es for proper rigid-body physics with ConvexPolyhedron collision shapes.
 * Dice naturally land on flat faces because the actual die geometry is used for collisions.
 * Floor and walls are CANNON.Plane bodies — dice roll across them like a real table.
 */
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export interface DiceRollEvent {
  result: number; dieType: number; modifier?: number; total?: number;
  label?: string; allDice?: { die: number; value: number }[];
  expression?: string; flatBonus?: number; advantage?: boolean; disadvantage?: boolean;
  onResult?: (allDice: {die:number,value:number}[], total:number) => void;
}
interface Props { event: DiceRollEvent; onDismiss: () => void; onResult?: (allDice: {die:number,value:number}[], total:number) => void; }

const PHI = (1+Math.sqrt(5))/2;
type V3 = [number,number,number];
const unit=(vs:V3[]):V3[]=>vs.map(v=>{const l=Math.sqrt(v[0]**2+v[1]**2+v[2]**2)||1;return[v[0]/l,v[1]/l,v[2]/l];});
const cross=(a:V3,b:V3):V3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a:V3,b:V3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm=(v:V3):V3=>{const l=Math.sqrt(dot(v,v))||1;return[v[0]/l,v[1]/l,v[2]/l];};
const sub=(a:V3,b:V3):V3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];

interface GeoDef{verts:V3[];faces:number[][];nums:number[]}

function makeD10(nums: number[]): GeoDef {
  // Pentagonal trapezohedron — the actual shape of a real d10.
  // 10 kite-shaped (quadrilateral) faces. Rests cleanly with one kite flat.
  // Much cleaner visually than a bipyramid — one face clearly shows the result.
  const R=1.0, H=0.35, A=1.22;
  const verts: V3[] = [];
  // 0-4: upper ring at y=+H, angles 0°,72°,144°,216°,288°
  for (let i=0;i<5;i++){const a=i*2*Math.PI/5; verts.push([R*Math.cos(a),H,R*Math.sin(a)]);}
  // 5-9: lower ring at y=-H, offset 36°
  for (let i=0;i<5;i++){const a=i*2*Math.PI/5+Math.PI/5; verts.push([R*Math.cos(a),-H,R*Math.sin(a)]);}
  // 10: top apex, 11: bottom apex
  verts.push([0,A,0]); verts.push([0,-A,0]);
  // 10 kite faces: 5 upper (top-apex + upper_i + lower_i + upper_{i+1})
  //               5 lower (bot-apex + lower_i + upper_{i+1} + lower_{i+1})
  const faces: number[][] = [];
  for (let i=0;i<5;i++){
    const u0=i, u1=(i+1)%5, l0=i+5, l1=(i+1)%5+5;
    faces.push([10,u0,l0,u1]); // upper kite
    faces.push([11,l1,u1,l0]); // lower kite
  }
  return { verts, faces, nums };
}

function makeD12(): GeoDef {
  const verts = unit([
    [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
    [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],
    [0,-1/PHI,-PHI],[0,1/PHI,-PHI],[0,-1/PHI,PHI],[0,1/PHI,PHI],
    [-1/PHI,-PHI,0],[1/PHI,-PHI,0],[1/PHI,PHI,0],[-1/PHI,PHI,0],
    [-PHI,0,-1/PHI],[-PHI,0,1/PHI],[PHI,0,-1/PHI],[PHI,0,1/PHI],
  ]);
  const faces = [
    [0,8,1,13,12],[0,8,9,3,16],[0,12,4,17,16],
    [8,1,18,2,9],[1,13,5,19,18],[13,12,4,10,5],
    [9,3,15,14,2],[3,16,17,7,15],[4,17,7,11,10],
    [6,11,10,5,19],[6,14,2,18,19],[6,11,7,15,14],
  ];
  return { verts, faces, nums:[1,2,3,4,5,6,7,8,9,10,11,12] };
}

const GD: Record<number,GeoDef> = {
  4:  { verts:unit([[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]]),
        faces:[[0,1,2],[0,2,3],[0,3,1],[1,3,2]], nums:[1,2,3,4] },
  6:  { verts:[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
        faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]], nums:[1,6,2,5,3,4] },
  8:  { verts:[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],
        faces:[[0,2,4],[2,1,4],[1,3,4],[3,0,4],[0,5,2],[2,5,1],[1,5,3],[3,5,0]], nums:[1,2,3,4,5,6,7,8] },
  10: makeD10([1,6,2,7,3,8,4,9,5,10]),
  12: makeD12(),
  20: { verts:unit([[0,1,PHI],[0,-1,PHI],[0,1,-PHI],[0,-1,-PHI],[1,PHI,0],[-1,PHI,0],
        [1,-PHI,0],[-1,-PHI,0],[PHI,0,1],[PHI,0,-1],[-PHI,0,1],[-PHI,0,-1]]),
        faces:[[0,1,8],[0,8,4],[0,4,5],[0,5,10],[0,10,1],[3,2,11],[3,11,7],[3,7,6],[3,6,9],[3,9,2],
               [1,6,8],[8,6,9],[8,9,4],[4,9,2],[4,2,5],[5,2,11],[5,11,10],[10,11,7],[10,7,1],[1,7,6]],
        nums:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20] },
};
GD[10090] = makeD10([0,1,2,3,4,5,6,7,8,9]);
GD[10091] = makeD10([0,1,2,3,4,5,6,7,8,9]);
const gd = (s:number) => GD[s] ?? GD[20];

const SM:Record<number,number> = {4:0.80,6:0.62,8:0.80,10:0.82,12:0.84,20:0.86,100:0.80};
const FF:Record<number,number> = {4:1.1,6:0.95,8:1.1,10:1.0,12:0.82,20:1.15,100:1.0};
const THEME:Record<number,{f:number;e:number}> = {
  4:{f:0x5b21b6,e:0xddd6fe},6:{f:0xb91c1c,e:0xfca5a5},8:{f:0x15803d,e:0xbbf7d0},
  10:{f:0x0369a1,e:0xbae6fd},12:{f:0x9d174d,e:0xfbcfe8},20:{f:0x92400e,e:0xfde68a},
  100:{f:0x991b1b,e:0xfecaca},1001:{f:0x1e293b,e:0xf1f5f9},1002:{f:0x7f1d1d,e:0xfca5a5},
};
const th = (s:number) => THEME[s] ?? THEME[20];

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
  const insc=face.reduce((mn,vi,i)=>{
    const nv=def.verts[face[(i+1)%face.length]],mv=def.verts[vi];
    const mx=(mv[0]+nv[0])/2*s-cx,my=(mv[1]+nv[1])/2*s-cy,mz=(mv[2]+nv[2])/2*s-cz;
    return Math.min(mn,Math.sqrt(mx*mx+my*my+mz*mz));
  },Infinity);
  return{pos:[cx,cy,cz]as V3,normal:outward,insc};
}

// Camera sits at (0, 7.5, 3.5) — detect the face most visible FROM the camera
const CAM_DIR=new THREE.Vector3(0,7.5,3.5).normalize(); // die→camera direction
function detectTopFaceNum(def:GeoDef,quat:THREE.Quaternion,s:number):number{
  let best=-2,bestNum=def.nums[0];
  def.faces.forEach((_,fi)=>{
    const{normal}=faceInfo(def,fi,s);
    const v=new THREE.Vector3(normal[0],normal[1],normal[2]).applyQuaternion(quat);
    const score=v.dot(CAM_DIR); // face most pointing toward camera = result face
    if(score>best){best=score;bestNum=def.nums[fi];}
  });
  return bestNum;
}

// D4 vertex numbers (point-build convention: top vertex = result)
const D4_VERT_NUMS = [1,2,3,4];

function detectD4TopVertex(def:GeoDef,quat:THREE.Quaternion):number{
  let best=-2,bestNum=1;
  def.verts.forEach((v,vi)=>{
    const w=new THREE.Vector3(v[0],v[1],v[2]).applyQuaternion(quat);
    if(w.y>best){best=w.y;bestNum=D4_VERT_NUMS[vi];}
  });
  return bestNum;
}

// Compute quaternion to rotate face faceN → +Y (straight up, unambiguous result)
function faceUpQuat(def:GeoDef,targetNum:number,s:number):THREE.Quaternion|null{
  const fi=def.nums.indexOf(targetNum);if(fi<0)return null;
  const{normal:fN}=faceInfo(def,fi,s);
  const cosA=Math.min(1,Math.max(-1,dot(fN,[0,1,0])));
  const angle=Math.acos(cosA);
  if(Math.abs(angle)<0.001)return new THREE.Quaternion();
  const axis=Math.abs(angle-Math.PI)<0.001?[1,0,0]as V3:norm(cross(fN,[0,1,0]));
  const q=new THREE.Quaternion();
  q.setFromAxisAngle(new THREE.Vector3(axis[0],axis[1],axis[2]),angle);
  return q;
}

const TC=new Map<string,THREE.CanvasTexture>();
function numTex(label:string,ec:number):THREE.CanvasTexture{
  const key=`${label}-${ec}`;
  if(TC.has(key))return TC.get(key)!;
  const cv=document.createElement('canvas');cv.width=192;cv.height=192;
  const ctx=cv.getContext('2d')!;
  const r=(ec>>16)&255,g=(ec>>8)&255,b=ec&255;
  const fs=label.length>=3?66:label.length===2?84:102;
  ctx.font=`900 ${fs}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.strokeStyle='rgba(0,0,0,0.9)';ctx.lineWidth=7;ctx.strokeText(label,96,102);
  ctx.fillStyle=`rgb(${r},${g},${b})`;ctx.fillText(label,96,102);
  // Draw underline beneath 6 to distinguish from 9 when die is inverted
  if(label==='6'){
    const m=ctx.measureText('6');const uw=m.width*0.8;
    const uy=102+fs*0.42;
    ctx.strokeStyle='rgba(0,0,0,0.7)';ctx.lineWidth=6;
    ctx.beginPath();ctx.moveTo(96-uw/2,uy);ctx.lineTo(96+uw/2,uy);ctx.stroke();
    ctx.strokeStyle=`rgb(${r},${g},${b})`;ctx.lineWidth=4;
    ctx.beginPath();ctx.moveTo(96-uw/2,uy);ctx.lineTo(96+uw/2,uy);ctx.stroke();
  }
  const t=new THREE.CanvasTexture(cv);TC.set(key,t);return t;
}

function solidGeo(def:GeoDef,s:number):THREE.BufferGeometry{
  const pos:number[]=[],nor:number[]=[];
  const g=new THREE.BufferGeometry();let off=0;
  def.faces.forEach((face,fi)=>{
    const fa=def.verts[face[0]],fb=def.verts[face[1]],fc2=def.verts[face[2]];
    const fex=fb[0]-fa[0],fey=fb[1]-fa[1],fez=fb[2]-fa[2];
    const ffx=fc2[0]-fa[0],ffy=fc2[1]-fa[1],ffz=fc2[2]-fa[2];
    let fnx=fey*ffz-fez*ffy,fny=fez*ffx-fex*ffz,fnz=fex*ffy-fey*ffx;
    const fnl=Math.sqrt(fnx*fnx+fny*fny+fnz*fnz)||1;
    fnx/=fnl;fny/=fnl;fnz/=fnl;
    const start=off;let tc=0;
    for(let i=1;i<face.length-1;i++){
      const a=def.verts[face[0]],b=def.verts[face[i]],c=def.verts[face[i+1]];
      pos.push(a[0]*s,a[1]*s,a[2]*s,b[0]*s,b[1]*s,b[2]*s,c[0]*s,c[1]*s,c[2]*s);
      nor.push(fnx,fny,fnz,fnx,fny,fnz,fnx,fny,fnz);tc++;
    }
    g.addGroup(start,tc*3,fi);off+=tc*3;
  });
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  return g;
}

function boundaryEdges(def:GeoDef,s:number):THREE.BufferGeometry{
  const pos:number[]=[];
  const seen=new Set<string>();
  def.faces.forEach(face=>{
    for(let i=0;i<face.length;i++){
      const a=face[i],b=face[(i+1)%face.length];
      const key=a<b?`${a}-${b}`:`${b}-${a}`;
      if(!seen.has(key)){seen.add(key);
        const va=def.verts[a],vb=def.verts[b];
        pos.push(va[0]*s,va[1]*s,va[2]*s,vb[0]*s,vb[1]*s,vb[2]*s);
      }
    }
  });
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  return g;
}

function buildDie(def:GeoDef,S:number,t:{f:number;e:number},ff:number,numLabel:(n:number)=>string):THREE.Group{
  const fc=new THREE.Color(t.f);
  const geo=solidGeo(def,S);
  const mats=def.faces.map(()=>new THREE.MeshPhongMaterial({color:fc,emissive:fc.clone().multiplyScalar(0.1),specular:new THREE.Color(t.e),shininess:55,side:THREE.DoubleSide}));
  const mesh=new THREE.Mesh(geo,mats);mesh.castShadow=true;mesh.receiveShadow=true;
  const edges=new THREE.LineSegments(boundaryEdges(def,S*1.003),new THREE.LineBasicMaterial({color:t.e}));
  const group=new THREE.Group();group.add(mesh);group.add(edges);
  // D4 point-build: number at each vertex — top vertex = result (standard physical d4 convention)
  const isD4=(def.verts.length===4&&def.faces.length===4);
  if(isD4){
    def.verts.forEach((v,vi)=>{
      const vn=norm(v);
      const off=S*0.12, sz=S*0.55;
      const mat=new THREE.MeshBasicMaterial({map:numTex(String(D4_VERT_NUMS[vi]),t.e),transparent:true,side:THREE.FrontSide,depthTest:false,depthWrite:false,alphaTest:0.05,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
      const plane=new THREE.Mesh(new THREE.PlaneGeometry(sz,sz),mat);
      plane.renderOrder=2;
      plane.position.set(v[0]*S+vn[0]*off, v[1]*S+vn[1]*off, v[2]*S+vn[2]*off);
      const q=new THREE.Quaternion();q.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(vn[0],vn[1],vn[2]));
      plane.quaternion.copy(q);group.add(plane);
    });
  } else {
    const numOff=0.035*S;
    def.faces.forEach((_,fi)=>{
      const{pos,normal,insc}=faceInfo(def,fi,S);
      const sz=insc*1.7*ff,off=numOff;
      const mat=new THREE.MeshBasicMaterial({map:numTex(numLabel(def.nums[fi]),t.e),transparent:true,side:THREE.FrontSide,depthTest:true,depthWrite:false,alphaTest:0.05,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
      const plane=new THREE.Mesh(new THREE.PlaneGeometry(sz,sz),mat);
      plane.renderOrder=1;
      plane.position.set(pos[0]+normal[0]*off,pos[1]+normal[1]*off,pos[2]+normal[2]*off);
      const q=new THREE.Quaternion();q.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(normal[0],normal[1],normal[2]));
      plane.quaternion.copy(q);group.add(plane);
    });
  }
  return group;
}

/** Build cannon-es ConvexPolyhedron — faces must be CCW from outside */
function buildCannonShape(def:GeoDef,S:number):CANNON.ConvexPolyhedron{
  const vertices=def.verts.map(v=>new CANNON.Vec3(v[0]*S,v[1]*S,v[2]*S));
  const faces:number[][]=[];
  def.faces.forEach(face=>{
    // Fan-triangulate and ensure CCW winding from outside (cannon-es requirement)
    for(let i=1;i<face.length-1;i++){
      const a=def.verts[face[0]],b=def.verts[face[i]],c=def.verts[face[i+1]];
      const bx=b[0]-a[0],by=b[1]-a[1],bz=b[2]-a[2];
      const cx=c[0]-a[0],cy=c[1]-a[1],cz=c[2]-a[2];
      const nx=by*cz-bz*cy,ny=bz*cx-bx*cz,nz=bx*cy-by*cx;
      const mx=(a[0]+b[0]+c[0])/3,my=(a[1]+b[1]+c[1])/3,mz=(a[2]+b[2]+c[2])/3;
      // If normal points toward centroid (inward), reverse winding
      if(nx*mx+ny*my+nz*mz>0) faces.push([face[0],face[i],face[i+1]]);
      else faces.push([face[0],face[i+1],face[i]]);
    }
  });
  return new CANNON.ConvexPolyhedron({vertices,faces});
}

export default function DiceRoller3D({event,onDismiss,onResult}:Props){
  const mountRef=useRef<HTMLDivElement>(null);
  const dismissRef=useRef(onDismiss);
  dismissRef.current=onDismiss;

  useEffect(()=>{
    const el=mountRef.current;if(!el)return;
    const W=window.innerWidth,H=window.innerHeight;

    // ── Three.js scene ───────────────────────────────────────────────
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
    renderer.setSize(W,H);renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.domElement.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    el.appendChild(renderer.domElement);
    const scene=new THREE.Scene();
    // Camera slightly overhead — dice are clearly readable from above
    const FOV=62, aspect=W/H;
    const camera=new THREE.PerspectiveCamera(FOV,aspect,0.1,300);
    camera.position.set(0,14,2.5);camera.lookAt(0,0,0);
    camera.updateProjectionMatrix();camera.updateMatrixWorld();
    // Exact floor bounds via frustum ray casting — walls always at real screen edges
    const toFloor=(nx:number,ny:number)=>{
      const v=new THREE.Vector3(nx,ny,0.5).unproject(camera);
      const dir=v.clone().sub(camera.position).normalize();
      if(Math.abs(dir.y)<0.001)return{x:0,z:0};
      const t=-camera.position.y/dir.y;
      return{x:camera.position.x+dir.x*t, z:camera.position.z+dir.z*t};
    };
    const [fl,fr,tl2,tr2]=[toFloor(-1,-1),toFloor(1,-1),toFloor(-1,1),toFloor(1,1)];
    const BX=Math.max(Math.abs(fl.x),Math.abs(fr.x),Math.abs(tl2.x),Math.abs(tr2.x))*0.87;
    const BZb=Math.max(Math.abs(fl.z),Math.abs(fr.z),Math.abs(tl2.z),Math.abs(tr2.z))*0.87; // symmetric approx
    const BZf=Math.max(fl.z,fr.z,tl2.z,tr2.z)*0.87;
    const BZ=Math.max(BZb,BZf);
    scene.add(new THREE.AmbientLight(0xffffff,1.8));
    const sun=new THREE.DirectionalLight(0xffffff,2.8);
    sun.position.set(BX*0.4,18,BZ*0.4);sun.castShadow=true;
    sun.shadow.camera.left=-BX*1.2;sun.shadow.camera.right=BX*1.2;
    sun.shadow.camera.top=BZ*1.2;sun.shadow.camera.bottom=-BZ*1.2;
    scene.add(sun);
    scene.add(new THREE.DirectionalLight(0x8899ff,0.4)).position.set(-BX*0.3,-2,BZ*0.3);
    const sFloor=new THREE.Mesh(new THREE.PlaneGeometry(BX*4,BZ*4),new THREE.ShadowMaterial({opacity:0.3}));
    sFloor.rotation.x=-Math.PI/2;sFloor.receiveShadow=true;scene.add(sFloor);

    // ── Cannon-es world ──────────────────────────────────────────────
    const world=new CANNON.World({ gravity: new CANNON.Vec3(0,-60,0) }); // stronger gravity = faster settle
    (world.broadphase as CANNON.NaiveBroadphase);
    world.allowSleep=true;

    // Contact material: high friction, low restitution = dice grip and stop
    const diceMat=new CANNON.Material('dice');
    const floorMat=new CANNON.Material('floor');
    const contact=new CANNON.ContactMaterial(diceMat,floorMat,{
      friction: 0.01,          // LOW — lets faces slide to stable position naturally
      restitution: 0.5,        // moderate bounce — dice tumble naturally
      contactEquationStiffness: 1e7,
    });
    world.addContactMaterial(contact);

    // Floor plane — mass:0 makes it static in cannon-es (don't use CANNON.Body.STATIC constant)
    const floorBody=new CANNON.Body({mass:0,material:floorMat});
    floorBody.addShape(new CANNON.Plane());
    floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0),-Math.PI/2); // rotate so normal faces +Y
    world.addBody(floorBody);

    // Walls — 4 planes, each rotated so normal faces inward
    const addWall=(px:number,py:number,pz:number,ax:number,ay:number,az:number,angle:number)=>{
      const w=new CANNON.Body({mass:0,material:floorMat});
      w.addShape(new CANNON.Plane());
      w.position.set(px,py,pz);
      w.quaternion.setFromAxisAngle(new CANNON.Vec3(ax,ay,az),angle);
      world.addBody(w);
    };
    addWall(-BX, 0,  0,   0,1,0,  Math.PI/2);  // left wall
    addWall( BX, 0,  0,   0,1,0, -Math.PI/2);  // right wall
    addWall(  0, 0,-BZb,  0,1,0,  0);           // back wall
    addWall(  0, 0, BZf,  0,1,0,  Math.PI);     // front wall

    // ── Dice ─────────────────────────────────────────────────────────
    const rawList=event.allDice?.length?event.allDice:[{die:event.dieType,value:event.result}];
    // Scale dice to ~7% of window height so they're readable across the full window
    const diceScreenPct=BZ*0.11;
    const baseS=Math.max(0.8,Math.min(1.6,diceScreenPct)-Math.max(0,rawList.length-1)*0.05);

    interface Spec{die:number;gk:number;val:number;tk:number;label:(n:number)=>string;ox:number}
    const specs:Spec[]=[];
    rawList.forEach((d,i)=>{
      if(d.die===100){
        const tens=d.value===100?0:Math.floor(d.value/10),units=d.value%10;
        specs.push({die:10,gk:10090,val:tens,tk:1001,label:(n)=>n===0?'00':String(n*10),ox:-1.6});
        specs.push({die:10,gk:10091,val:units,tk:1002,label:(n)=>String(n),ox:1.6});
      } else {
        const ox=rawList.length>1?(i-(rawList.length-1)/2)*1.8:0;
        specs.push({die:d.die,gk:d.die,val:d.value,tk:d.die,label:(n)=>String(n),ox});
      }
    });

    interface PhysDie{group:THREE.Group;body:CANNON.Body;def:GeoDef;sides:number;val:number;scale:number;settled:boolean}
    const dice:PhysDie[]=specs.map((sp,i)=>{
      const def=gd(sp.gk);
      const S=baseS*(SM[sp.die]??1.0);
      const group=buildDie(def,S,th(sp.tk),FF[sp.die]??1.0,sp.label);
      scene.add(group);

      // Cannon body with ConvexPolyhedron
      const shape=buildCannonShape(def,S);
      // D10 (bipyramid) spins on its apex with no rotational friction — needs more angular damping
      const isD10=sp.die===10||sp.die===100;
      const body=new CANNON.Body({
        mass:1,
        material:diceMat,
        linearDamping:0.05,
        angularDamping:isD10?0.4:0.1,  // d10 gets extra spin damping
        allowSleep:true,
        sleepSpeedLimit:1.6,
        sleepTimeLimit:0.1,
      });
      body.addShape(shape);

      // Spawn from random edge of visible window, throw toward opposite side
      const side = Math.random()>0.5 ? 1 : -1;
      const startX = side*(BX*0.65+Math.random()*BX*0.2) + sp.ox*0.5;
      const startY = BZ*1.1+i*0.4+Math.random()*0.6;
      const startZ = (Math.random()-0.5)*BZ*0.7;
      body.position.set(startX, startY, startZ);

      // Random starting orientation
      const eq=new CANNON.Quaternion();
      eq.setFromEuler(Math.random()*Math.PI*2,Math.random()*Math.PI*2,Math.random()*Math.PI*2);
      body.quaternion.copy(eq);

      // Velocity: throw across full window, bounce off opposite wall
      const speed=BX*0.35+Math.random()*BX*0.15;
      body.velocity.set(
        -side*speed,
        -(BZ*0.4+Math.random()*BZ*0.2),
        (Math.random()-0.5)*BZ*0.3
      );
      body.angularVelocity.set((Math.random()-0.5)*22,(Math.random()-0.5)*22,(Math.random()-0.5)*16);

      // Stagger: launch each die from a slightly different height

      world.addBody(body);
      return{group,body,def,sides:sp.die,val:sp.val,scale:S,settled:false};
    });

    let last=performance.now(),allDone=false,doneT=0,dismissed=false,raf=0,shown=false,totalT=0;
    const FIXED_STEP=1/60,MAX_SUB=3;

    function showResult(){
      if(shown||!el)return;shown=true;
      const detectedDice=dice.map(d=>({die:d.sides,value:d.val}));
      const detectedTotal=detectedDice.reduce((s,d)=>s+d.value,0)+(event.flatBonus??0)+(event.modifier??0);
      if(onResult)onResult(detectedDice,detectedTotal);
      const tot=detectedTotal;
      const multi=detectedDice.length>1;
      const hasMod=!multi&&event.modifier!==undefined&&event.modifier!==0;
      const firstResult=detectedDice[0]?.value??0;
      const lbl=event.label||(event.dieType===100?'d100':event.dieType?`d${event.dieType}`:'Roll');
      const div=document.createElement('div');
      div.style.cssText='position:absolute;top:6%;left:50%;transform:translateX(-50%) scale(0.5);text-align:center;pointer-events:none;white-space:nowrap;animation:rr 0.5s cubic-bezier(0.34,1.56,0.64,1) both;';
      div.innerHTML=
        `<div style="font:700 11px system-ui;color:rgba(255,255,255,0.45);letter-spacing:.22em;text-transform:uppercase;margin-bottom:6px">${lbl}</div>`+
        `<div style="font:900 ${multi?68:92}px system-ui;color:#fff;line-height:1;text-shadow:0 2px 40px rgba(255,255,255,0.5),0 0 80px rgba(255,255,255,0.2)">${tot}</div>`+
        (hasMod?`<div style="font:500 16px system-ui;color:rgba(255,255,255,0.45);margin-top:6px">${firstResult} ${(event.modifier??0)>=0?'+':''}${event.modifier} = ${tot}</div>`:'');
      el.appendChild(div);
    }

    function frame(ts:number){
      if(dismissed)return;
      raf=requestAnimationFrame(frame);
      const real=Math.min((ts-last)/1000,0.05);last=ts;

      // Step cannon-es physics
      world.step(FIXED_STEP,real,MAX_SUB);

      // Sync Three.js groups to cannon bodies
      dice.forEach(d=>{
        if(d.settled)return;
        // Copy body transform to Three.js group
        d.group.position.set(d.body.position.x,d.body.position.y,d.body.position.z);
        d.group.quaternion.set(d.body.quaternion.x,d.body.quaternion.y,d.body.quaternion.z,d.body.quaternion.w);

        // No intervention — pure cannon-es. ConvexPolyhedron is physically
        // unstable on edges so dice naturally roll to flat faces.
        const sleeping=d.body.sleepState===2;
        const vel=d.body.velocity.length();
        const angVel=d.body.angularVelocity.length();
        const onFloor=d.body.position.y<d.scale*1.2+0.5;
        if((sleeping||(vel<0.08&&angVel<0.08))&&onFloor){
          d.body.velocity.set(0,0,0);
          d.body.angularVelocity.set(0,0,0);
          const tq=new THREE.Quaternion(d.body.quaternion.x,d.body.quaternion.y,d.body.quaternion.z,d.body.quaternion.w);
          d.val=detectTopFaceNum(d.def,tq,d.scale);
          d.settled=true;
        }
      });

      totalT+=real;
      // Hard 5s timeout — force-settle any stuck dice, guarantee a result
      if(!allDone&&totalT>5.0){
        dice.forEach(d=>{
          if(d.settled)return;
          d.body.velocity.set(0,0,0); d.body.angularVelocity.set(0,0,0);
          const tq=new THREE.Quaternion(d.body.quaternion.x,d.body.quaternion.y,d.body.quaternion.z,d.body.quaternion.w);
          d.val=detectTopFaceNum(d.def,tq,d.scale);
          d.settled=true;
        });
      }
      if(!allDone&&dice.every(d=>d.settled)){
        allDone=true;doneT=0;showResult();
      }
      if(allDone){
        doneT+=real;
        if(doneT>4.0){dismissed=true;dismissRef.current();cancelAnimationFrame(raf);return;}
      }
      renderer.render(scene,camera);
    }
    raf=requestAnimationFrame(frame);

    return()=>{
      dismissed=true;cancelAnimationFrame(raf);
      dice.forEach(d=>world.removeBody(d.body));
      renderer.dispose();
      if(el.contains(renderer.domElement))el.removeChild(renderer.domElement);
      scene.clear();TC.clear();
    };
  },[]);

  return createPortal(
    <div ref={mountRef} onClick={onDismiss} style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(2,5,14,0.88)',backdropFilter:'blur(12px)',cursor:'pointer',overflow:'hidden'}}>
      <div style={{position:'absolute',bottom:14,left:0,right:0,textAlign:'center',pointerEvents:'none',fontFamily:'var(--ff-body)',fontSize:11,color:'rgba(255,255,255,0.2)'}}>Click anywhere to dismiss</div>
      <style>{`@keyframes rr{from{opacity:0;transform:translateX(-50%) scale(0.5)}to{opacity:1;transform:translateX(-50%) scale(1)}}`}</style>
    </div>,
    document.body
  );
}
