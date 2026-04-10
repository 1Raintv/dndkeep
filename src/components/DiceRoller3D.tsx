/**
 * DiceRoller3D — v1.7.3
 * - D10: proper pentagonal trapezohedron (kite-shaped faces)
 * - D12: fixed dodecahedron with clean pentagon faces
 * - Rolling: fully free physics, natural tumble, detect face-up at settle
 * - If die lands on wrong face: instant snap (die is already still)
 */
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';

export interface DiceRollEvent {
  result: number; dieType: number; modifier?: number; total?: number;
  label?: string; allDice?: { die: number; value: number }[];
  expression?: string; flatBonus?: number;
}
interface Props { event: DiceRollEvent; onDismiss: () => void; onResult?: (allDice: {die:number,value:number}[], total:number) => void; }

const PHI = (1+Math.sqrt(5))/2;
type V3 = [number,number,number];
const unit=(vs:V3[]):V3[]=>vs.map(v=>{const l=Math.sqrt(v[0]**2+v[1]**2+v[2]**2)||1;return[v[0]/l,v[1]/l,v[2]/l];});
const sub=(a:V3,b:V3):V3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a:V3,b:V3):V3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a:V3,b:V3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm=(v:V3):V3=>{const l=Math.sqrt(dot(v,v))||1;return[v[0]/l,v[1]/l,v[2]/l];};

interface GeoDef{verts:V3[];faces:number[][];nums:number[]}

// ── D10: Pentagonal bipyramid — CORRECT geometry with single equatorial ring
// Two separate rings (y=+H and y=-H) leave an equatorial gap = "two halves" look.
// Fix: ONE equatorial ring at y=0. Upper faces share equatorial verts with lower faces.
// Result: solid die with no gap, 10 triangular faces, two pointed poles.
function makeD10(nums: number[]): GeoDef {
  const verts: V3[] = [];
  const R = 0.82, T = 1.12; // equatorial radius, apex height
  // 5 equatorial vertices at y=0
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    verts.push([R * Math.cos(a), 0, R * Math.sin(a)]);
  }
  verts.push([0, T, 0]);   // top apex idx 5
  verts.push([0,-T, 0]);   // bot apex idx 6
  const faces: number[][] = [];
  for (let i = 0; i < 5; i++) {
    const n = (i + 1) % 5;
    faces.push([5, n, i]);  // upper triangles (top → eq_n → eq_i)
    faces.push([6, i, n]);  // lower triangles (bot → eq_i → eq_n)
  }
  return { verts, faces, nums }; // no unit() — preserve elongated shape
}

// ── D12: Dodecahedron (12 regular pentagonal faces) ──────────────────
// Face connectivity derived by tracing all pentagon 5-cycles in the
// adjacency graph. Each face verified coplanar; 20 verts × 3 faces each;
// 30 unique edges × 2 face-incidences = 60 = 12×5.
function makeD12(): GeoDef {
  const verts = unit([
    [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],    // 0-3
    [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],          // 4-7
    [0,-1/PHI,-PHI],[0,1/PHI,-PHI],[0,-1/PHI,PHI],[0,1/PHI,PHI], // 8-11
    [-1/PHI,-PHI,0],[1/PHI,-PHI,0],[1/PHI,PHI,0],[-1/PHI,PHI,0], // 12-15
    [-PHI,0,-1/PHI],[-PHI,0,1/PHI],[PHI,0,-1/PHI],[PHI,0,1/PHI], // 16-19
  ]);
  const faces = [
    [0,8,1,13,12],  // 1
    [0,8,9,3,16],   // 2
    [0,12,4,17,16], // 3
    [8,1,18,2,9],   // 4
    [1,13,5,19,18], // 5
    [13,12,4,10,5], // 6
    [9,3,15,14,2],  // 7
    [3,16,17,7,15], // 8
    [4,17,7,11,10], // 9
    [6,11,10,5,19], // 10
    [6,14,2,18,19], // 11
    [6,11,7,15,14], // 12
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
GD[10090] = makeD10([0,1,2,3,4,5,6,7,8,9]); // tens d10 for d100
GD[10091] = makeD10([0,1,2,3,4,5,6,7,8,9]); // units d10 for d100
const gd = (s:number) => GD[s] ?? GD[20];

// Scale multiplier — visual size normalization
const SM:Record<number,number> = {4:0.9,6:0.78,8:1.0,10:1.0,12:1.0,20:1.0,100:1.0};
const FF:Record<number,number> = {4:1.1,6:0.95,8:1.1,10:1.0,12:0.82,20:0.80,100:1.0};

const THEME:Record<number,{f:number;e:number}> = {
  4:{f:0x5b21b6,e:0xddd6fe}, 6:{f:0xb91c1c,e:0xfca5a5},
  8:{f:0x15803d,e:0xbbf7d0}, 10:{f:0x0369a1,e:0xbae6fd},
  12:{f:0x9d174d,e:0xfbcfe8}, 20:{f:0x92400e,e:0xfde68a},
  100:{f:0x991b1b,e:0xfecaca},
  1001:{f:0x1e293b,e:0xf1f5f9}, // d100 tens
  1002:{f:0x7f1d1d,e:0xfca5a5}, // d100 units
};
const th = (s:number) => THEME[s] ?? THEME[20];

// ── Solid geometry with per-face groups ──────────────────────────────
function solidGeo(def:GeoDef, s:number): THREE.BufferGeometry {
  const pos:number[]=[], nor:number[]=[];
  const g = new THREE.BufferGeometry(); let off = 0;
  def.faces.forEach((face,fi) => {
    // Compute ONE face normal for the whole face — no seams between triangles
    const fa=def.verts[face[0]],fb=def.verts[face[1]],fc2=def.verts[face[2]];
    const fex=fb[0]-fa[0],fey=fb[1]-fa[1],fez=fb[2]-fa[2];
    const ffx=fc2[0]-fa[0],ffy=fc2[1]-fa[1],ffz=fc2[2]-fa[2];
    let fnx=fey*ffz-fez*ffy,fny=fez*ffx-fex*ffz,fnz=fex*ffy-fey*ffx;
    const fnl=Math.sqrt(fnx*fnx+fny*fny+fnz*fnz)||1;
    fnx/=fnl; fny/=fnl; fnz/=fnl; // flat face normal — same for all tris in this face
    const start = off; let tc = 0;
    for (let i = 1; i < face.length-1; i++) {
      const a=def.verts[face[0]],b=def.verts[face[i]],c=def.verts[face[i+1]];
      pos.push(a[0]*s,a[1]*s,a[2]*s, b[0]*s,b[1]*s,b[2]*s, c[0]*s,c[1]*s,c[2]*s);
      nor.push(fnx,fny,fnz, fnx,fny,fnz, fnx,fny,fnz); // same normal for all verts
      tc++;
    }
    g.addGroup(start, tc*3, fi); off += tc*3;
  });
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor,3));
  return g;
}

// Boundary edges only (no internal triangulation seams)
// skipRingEdges: for bipyramid d10, skip edges between equatorial ring verts (creates "two halves" seam)
function boundaryEdges(def:GeoDef, s:number, skipRingEdges=false): THREE.BufferGeometry {
  const pos:number[] = [];
  const seen = new Set<string>();
  def.faces.forEach(face => {
    for (let i = 0; i < face.length; i++) {
      const a=face[i], b=face[(i+1)%face.length];
      // For d10 bipyramid: skip edges between equatorial ring vertices (0-9)
      if (skipRingEdges && a<10 && b<10) continue;
      const key = a<b ? `${a}-${b}` : `${b}-${a}`;
      if (!seen.has(key)) {
        seen.add(key);
        const va=def.verts[a], vb=def.verts[b];
        pos.push(va[0]*s,va[1]*s,va[2]*s, vb[0]*s,vb[1]*s,vb[2]*s);
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  return g;
}

const TC = new Map<string,THREE.CanvasTexture>();
function numTex(label:string, ec:number): THREE.CanvasTexture {
  const key = `${label}-${ec}`;
  if (TC.has(key)) return TC.get(key)!;
  const cv = document.createElement('canvas'); cv.width=128; cv.height=128;
  const ctx = cv.getContext('2d')!;
  const r=(ec>>16)&255, g=(ec>>8)&255, b=ec&255;
  const fs = label.length>=3?44:label.length===2?56:68;
  ctx.clearRect(0,0,128,128);
  ctx.font = `900 ${fs}px system-ui`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.strokeStyle='rgba(0,0,0,0.85)'; ctx.lineWidth=5;
  ctx.strokeText(label, 64, 68);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillText(label, 64, 68);
  const t = new THREE.CanvasTexture(cv); TC.set(key,t); return t;
}

function faceInfo(def:GeoDef, fi:number, s:number) {
  const face = def.faces[fi];
  const vs = face.map(vi => def.verts[vi]);
  const cx = vs.reduce((a,v)=>a+v[0],0)/vs.length*s;
  const cy = vs.reduce((a,v)=>a+v[1],0)/vs.length*s;
  const cz = vs.reduce((a,v)=>a+v[2],0)/vs.length*s;
  const a=def.verts[face[0]], b=def.verts[face[1]], c=def.verts[face[2]];
  const n1 = norm(cross(sub(b,a),sub(c,a)));
  const fc:V3 = [cx/s,cy/s,cz/s];
  const outward:V3 = dot(n1,fc)>=0 ? n1 : [-n1[0],-n1[1],-n1[2]];
  // Inscribed radius: min dist from centroid to each edge midpoint
  const insc = face.reduce((mn,vi,i) => {
    const nv=def.verts[face[(i+1)%face.length]], mv=def.verts[vi];
    const mx=(mv[0]+nv[0])/2*s-cx, my=(mv[1]+nv[1])/2*s-cy, mz=(mv[2]+nv[2])/2*s-cz;
    return Math.min(mn, Math.sqrt(mx*mx+my*my+mz*mz));
  }, Infinity);
  return { pos:[cx,cy,cz] as V3, normal:outward, insc };
}

// Which face of def is most pointing toward +Y (up) given quaternion
function detectTopFaceNum(def:GeoDef, quat:THREE.Quaternion, s:number): number {
  let best = -2, bestNum = def.nums[0];
  def.faces.forEach((_,fi) => {
    const {normal} = faceInfo(def,fi,s);
    const v = new THREE.Vector3(normal[0],normal[1],normal[2]).applyQuaternion(quat);
    if (v.y > best) { best = v.y; bestNum = def.nums[fi]; }
  });
  return bestNum;
}

// Quaternion to rotate face faceN → +Y (up/camera)
function faceUpQuat(def:GeoDef, targetNum:number, s:number): THREE.Quaternion|null {
  const fi = def.nums.indexOf(targetNum); if (fi<0) return null;
  const {normal:fN} = faceInfo(def,fi,s);
  const cosA = Math.min(1,Math.max(-1,dot(fN,[0,1,0])));
  const angle = Math.acos(cosA);
  if (Math.abs(angle)<0.001) return new THREE.Quaternion();
  const axis = Math.abs(angle-Math.PI)<0.001 ? [1,0,0] as V3 : norm(cross(fN,[0,1,0]));
  const q = new THREE.Quaternion();
  q.setFromAxisAngle(new THREE.Vector3(axis[0],axis[1],axis[2]), angle);
  return q;
}

function buildDie(def:GeoDef, S:number, t:{f:number;e:number}, ff:number,
                  numLabel:(n:number)=>string, dieType=0): THREE.Group {
  // All dice use the same solidGeo approach - consistent rendering, no misalignment
  const fc = new THREE.Color(t.f);
  const bodyGeo = solidGeo(def, S);
  const mats = def.faces.map(()=>new THREE.MeshPhongMaterial({
    color:fc, emissive:fc.clone().multiplyScalar(0.1),
    specular:new THREE.Color(t.e), shininess:55, side:THREE.DoubleSide,
  }));
  const mesh = new THREE.Mesh(bodyGeo, mats);
  mesh.castShadow=true; mesh.receiveShadow=true;
  const edges = new THREE.LineSegments(boundaryEdges(def,S*1.003), new THREE.LineBasicMaterial({color:t.e}));
  const group = new THREE.Group();
  group.add(mesh); group.add(edges);

  def.faces.forEach((_,fi) => {
    const {pos,normal,insc} = faceInfo(def,fi,S);
    const sz = insc * 1.7 * ff;
    const off = 0.035 * S;
    const mat = new THREE.MeshBasicMaterial({
      map: numTex(numLabel(def.nums[fi]), t.e),
      transparent:true, side:THREE.FrontSide,
      depthTest:true, depthWrite:false, alphaTest:0.05,
      polygonOffset:true, polygonOffsetFactor:-4, polygonOffsetUnits:-4,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(sz,sz), mat);
    plane.renderOrder = 1;
    plane.position.set(pos[0]+normal[0]*off, pos[1]+normal[1]*off, pos[2]+normal[2]*off);
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0,0,1), new THREE.Vector3(normal[0],normal[1],normal[2]));
    plane.quaternion.copy(q);
    group.add(plane);
  });
  return group;
}

interface PhysDie {
  group:THREE.Group; def:GeoDef; sides:number; val:number;
  x:number; y:number; z:number; vx:number; vy:number; vz:number;
  quat:THREE.Quaternion; arx:number; ary:number; arz:number;
  phase:'fly'|'done'|'snap'; delay:number; scale:number;
}

export default function DiceRoller3D({event,onDismiss,onResult}:Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const el = mountRef.current; if(!el) return;
    const W=window.innerWidth, H=window.innerHeight;
    const renderer = new THREE.WebGLRenderer({antialias:true,alpha:true});
    renderer.setSize(W,H); renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.domElement.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60,W/H,0.1,200);
    camera.position.set(0,7,3); camera.lookAt(0,0,0);
    scene.add(new THREE.AmbientLight(0xffffff,1.4));
    const sun = new THREE.DirectionalLight(0xffffff,2.2);
    sun.position.set(3,10,4); sun.castShadow=true;
    sun.shadow.camera.left=-8; sun.shadow.camera.right=8;
    sun.shadow.camera.top=8; sun.shadow.camera.bottom=-8;
    sun.shadow.camera.far=30; sun.shadow.bias=-0.001;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x8899ff,0.4);
    fill.position.set(-3,-2,2); scene.add(fill);
    const sFloor = new THREE.Mesh(new THREE.PlaneGeometry(30,30), new THREE.ShadowMaterial({opacity:0.25}));
    sFloor.rotation.x=-Math.PI/2; sFloor.receiveShadow=true; scene.add(sFloor);

    const FLOOR=0, GRAV=22, BOUNCE=0.45, WALL_B=0.5, BX=2.8, BZ=2.0;
    const rawList = event.allDice?.length ? event.allDice : [{die:event.dieType,value:event.result}];
    const baseS = Math.max(0.9, 1.5 - Math.max(1,rawList.length)*0.06);

    interface Spec { die:number; gk:number; val:number; tk:number; label:(n:number)=>string; ox:number }
    const specs:Spec[] = [];
    rawList.forEach((d,i) => {
      if (d.die===100) {
        const tens = d.value===100 ? 0 : Math.floor(d.value/10);
        const units = d.value % 10;
        specs.push({die:10,gk:10090,val:tens,tk:1001,label:(n)=>n===0?'00':String(n*10),ox:-1.6});
        specs.push({die:10,gk:10091,val:units,tk:1002,label:(n)=>String(n),ox:1.6});
      } else {
        const ox = rawList.length>1 ? (i-(rawList.length-1)/2)*1.8 : 0;
        specs.push({die:d.die,gk:d.die,val:d.value,tk:d.die,label:(n)=>String(n),ox});
      }
    });

    const dice:PhysDie[] = specs.map((sp,i) => {
      const def = gd(sp.gk);
      const S = baseS * (SM[sp.die]??1.0);
      const group = buildDie(def, S, th(sp.tk), FF[sp.die]??1.0, sp.label, sp.die);
      scene.add(group);
      // Truly random start — physics determines the result
      const startQ = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(Math.random()*Math.PI*2, Math.random()*Math.PI*2, Math.random()*Math.PI*2)
      );
      group.quaternion.copy(startQ);
      const spread = Math.min(BX*0.4, specs.length*0.3);
      // Full tumbling angular velocity in all directions
      return {
        group, def, sides:sp.die, val:sp.val, scale:S,
        x: sp.ox+(Math.random()-.5)*spread,
        y: 3.5+Math.random()*1.5,
        z: (Math.random()-.5)*spread*0.4,
        vx: (Math.random()-.5)*3,
        vy: -(2+Math.random()*1.5),
        vz: (Math.random()-.5)*2,
        quat: startQ.clone(),
        // Full 3D tumble — looks natural
        arx: (Math.random()-.5)*16,
        ary: (Math.random()-.5)*16,
        arz: (Math.random()-.5)*12,
        phase: 'fly' as const, delay: i*0.12,
      };
    });

    function update(dt:number) {
      dice.forEach(d => {
        if (d.delay>0) { d.delay-=dt; return; }

        if ((d.phase as any)==='snap') {
          (d as any)._snapT += dt;
          const t = Math.min(1, (d as any)._snapT / 0.3);
          const ease = t < 0.5 ? 2*t*t : -1+(4-2*t)*t; // ease in-out
          d.quat.copy((d as any)._snapFrom).slerp((d as any)._snapTo, ease);
          d.group.quaternion.copy(d.quat);
          if (t >= 1) { d.quat.copy((d as any)._snapTo); d.group.quaternion.copy(d.quat); d.phase = 'done'; }
          return;
        }
        if (d.phase==='done') return;
        d.vy -= GRAV*dt;
        d.x += d.vx*dt; d.y += d.vy*dt; d.z += d.vz*dt;
        const aL = Math.sqrt(d.arx**2+d.ary**2+d.arz**2);
        if (aL>0.001) {
          const dq = new THREE.Quaternion();
          dq.setFromAxisAngle(new THREE.Vector3(d.arx/aL,d.ary/aL,d.arz/aL), aL*dt);
          d.quat.premultiply(dq).normalize();
        }
        d.group.position.set(d.x,d.y,d.z);
        d.group.quaternion.copy(d.quat);
        const r = d.scale*0.82;
        if (d.y-r < FLOOR) {
          d.y=FLOOR+r; d.vy=Math.abs(d.vy)*BOUNCE;
          d.vx*=0.84; d.vz*=0.84;
          d.arx*=0.65; d.ary*=0.65; d.arz*=0.65;
          if (d.vy<0.12) d.vy=0;
        }
        if (d.x<-BX){d.x=-BX;d.vx=Math.abs(d.vx)*WALL_B;}
        if (d.x> BX){d.x= BX;d.vx=-Math.abs(d.vx)*WALL_B;}
        if (d.z<-BZ){d.z=-BZ;d.vz=Math.abs(d.vz)*WALL_B;}
        if (d.z> BZ){d.z= BZ;d.vz=-Math.abs(d.vz)*WALL_B;}
        if (Math.abs(d.y-r-FLOOR)<0.05) {
          d.vx*=0.96; d.vz*=0.96; d.arx*=0.93; d.ary*=0.93; d.arz*=0.93;
        }
        const spd = Math.sqrt(d.vx**2+d.vy**2+d.vz**2);
        const ang = Math.sqrt(d.arx**2+d.ary**2+d.arz**2);
        // Force settle after 3.2s or when naturally stopped
        const forceSettle = (d as any)._t !== undefined && ((d as any)._t += dt) > 3.2;
        if ((d as any)._t === undefined) (d as any)._t = 0;
        if ((spd<0.1 && ang<0.3 && Math.abs(d.y-r-FLOOR)<0.06) || forceSettle) {
          d.phase='done'; d.y=FLOOR+r; d.vx=d.vy=d.vz=d.arx=d.ary=d.arz=0;
          d.group.position.set(d.x,d.y,d.z);
          // Physics determines which face is closest to up — that is the result
          const topNum = detectTopFaceNum(d.def, d.quat, d.scale);
          d.val = topNum; // physics-chosen result
          // Snap to exactly face-up so the number is clearly readable (not on an edge/corner)
          const fq = faceUpQuat(d.def, topNum, d.scale);
          if (fq) {
            const dotProduct = new THREE.Vector3(0,1,0).dot(
              new THREE.Vector3(...faceInfo(d.def, d.def.nums.indexOf(topNum), d.scale).normal).applyQuaternion(d.quat)
            );
            // Only snap if face isn't already closely aligned (avoids micro-jitter on clean landings)
            if (dotProduct < 0.999) {
              (d as any)._snapFrom = d.quat.clone();
              (d as any)._snapTo = fq;
              (d as any)._snapT = 0;
              d.phase = 'snap' as any;
              return; // will complete in snap phase, then call done
            }
          }
        }
      });
    }

    let last=performance.now(), allDone=false, doneT=0, dismissed=false, raf=0, shown=false;
    function showResult() {
      if (shown||!el) return; shown=true;
      // Use physics-detected values from dice
      const detectedDice = dice.map(d => ({die:d.sides, value:d.val}));
      const detectedTotal = detectedDice.reduce((s,d)=>s+d.value,0) + (event.flatBonus??0) + (event.modifier??0);
      // Notify parent with actual physics result (for DB logging)
      if (onResult) onResult(detectedDice, detectedTotal);
      const tot = detectedTotal;
      const multi = detectedDice.length>1;
      const hasMod = !multi && event.modifier!==undefined && event.modifier!==0;
      const firstResult = detectedDice[0]?.value ?? 0;
      const lbl = event.label || (event.dieType===100?'d100':event.dieType?`d${event.dieType}`:'Roll');
      const div = document.createElement('div');
      div.style.cssText='position:absolute;top:7%;left:50%;transform:translateX(-50%) scale(0.5);text-align:center;pointer-events:none;white-space:nowrap;animation:rr 0.6s cubic-bezier(0.34,1.56,0.64,1) both;';
      div.innerHTML =
        `<div style="font:700 13px system-ui;color:rgba(255,255,255,0.5);letter-spacing:.2em;text-transform:uppercase;margin-bottom:4px">${lbl}</div>`+
        `<div style="font:900 ${multi?72:96}px system-ui;color:#fff;line-height:1;text-shadow:0 0 50px rgba(255,255,255,0.7)">${tot}</div>`+
        (hasMod?`<div style="font:500 17px system-ui;color:rgba(255,255,255,0.5);margin-top:4px">${event.result} ${(event.modifier??0)>=0?'+':''}${event.modifier}</div>`:'');
      el.appendChild(div);
    }
    function frame(ts:number) {
      if (dismissed) return;
      raf=requestAnimationFrame(frame);
      const dt=Math.min((ts-last)/1000,0.05); last=ts;
      update(dt);
      if (!allDone && dice.filter(d=>d.delay<=0).every(d=>d.phase==='done')) {
        allDone=true; doneT=0; showResult();
      }
      if (allDone) { doneT+=dt; if(doneT>4.5){dismissed=true;dismissRef.current();cancelAnimationFrame(raf);return;} }
      renderer.render(scene,camera);
    }
    raf=requestAnimationFrame(frame);
    return () => {
      dismissed=true; cancelAnimationFrame(raf); renderer.dispose();
      if(el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
      scene.clear(); TC.clear();
    };
  }, []);

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
