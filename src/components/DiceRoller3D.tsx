/**
 * DiceRoller3D — Overhead 3D dice with proper face textures + orientation correction.
 * Numbers are baked into face materials (not sprites), and the die is rotated on settle
 * so the correct result face points up toward the camera.
 */
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export interface DiceRollEvent {
  result: number;
  dieType: number;
  modifier?: number;
  total?: number;
  label?: string;
  allDice?: { die: number; value: number }[];
  expression?: string;
  flatBonus?: number;
}
interface Props { event: DiceRollEvent; onDismiss: () => void; }

// ── Palette ───────────────────────────────────────────────────────────
const PAL: Record<number, { body: number; face: number; num: number; edge: number }> = {
  4:  { body:0x4c1d95, face:0x6d28d9, num:0xe9d5ff, edge:0xc084fc },
  6:  { body:0x7c2d12, face:0xea580c, num:0xfed7aa, edge:0xfdba74 },
  8:  { body:0x14532d, face:0x16a34a, num:0xbbf7d0, edge:0x86efac },
  10: { body:0x082f49, face:0x0284c7, num:0xe0f2fe, edge:0x7dd3fc },
  12: { body:0x581c87, face:0xc026d3, num:0xfae8ff, edge:0xf0abfc },
  20: { body:0x3d2900, face:0xca8a04, num:0xfef9c3, edge:0xfde68a },
 100: { body:0x7c2d12, face:0xc2410c, num:0xffedd5, edge:0xfed7aa },
};
const pal = (s: number) => PAL[s] ?? PAL[20];

const PHI = (1+Math.sqrt(5))/2;
type V3 = [number,number,number];

function unit(vs: V3[]): V3[] {
  return vs.map(v=>{const l=Math.sqrt(v[0]**2+v[1]**2+v[2]**2)||1;return[v[0]/l,v[1]/l,v[2]/l];});
}
function cross(a:V3,b:V3):V3{return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function dot(a:V3,b:V3){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function normalize(v:V3):V3{const l=Math.sqrt(dot(v,v))||1;return[v[0]/l,v[1]/l,v[2]/l];}
function sub(a:V3,b:V3):V3{return[a[0]-b[0],a[1]-b[1],a[2]-b[2]];}

interface GeoDef { verts:V3[]; faces:number[][]; nums:number[] }
const GEODEFS: Record<number,GeoDef> = {
  4:{ verts:unit([[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]]),
      faces:[[0,1,2],[0,2,3],[0,3,1],[1,3,2]], nums:[1,2,3,4] },
  6:{ verts:[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
      faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]], nums:[1,6,2,5,3,4] },
  8:{ verts:[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],
      faces:[[0,2,4],[2,1,4],[1,3,4],[3,0,4],[0,5,2],[2,5,1],[1,5,3],[3,5,0]], nums:[1,2,3,4,5,6,7,8] },
  12:{ verts:unit([[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],
       [0,-1/PHI,-PHI],[0,1/PHI,-PHI],[0,-1/PHI,PHI],[0,1/PHI,PHI],
       [-1/PHI,-PHI,0],[1/PHI,-PHI,0],[1/PHI,PHI,0],[-1/PHI,PHI,0],
       [-PHI,0,-1/PHI],[-PHI,0,1/PHI],[PHI,0,-1/PHI],[PHI,0,1/PHI]]),
      faces:[[0,8,13,12,16],[1,18,13,8,9],[2,9,8,0,3],[3,0,16,17,15],[4,17,16,12,10],
             [5,19,18,1,6],[6,1,2,14,19],[7,11,14,2,3],[7,15,17,4,11],[5,10,12,13,18],
             [4,10,5,6,7],[11,4,19,14,15]], nums:[1,2,3,4,5,6,7,8,9,10,11,12] },
  20:{ verts:unit([[0,1,PHI],[0,-1,PHI],[0,1,-PHI],[0,-1,-PHI],[1,PHI,0],[-1,PHI,0],
       [1,-PHI,0],[-1,-PHI,0],[PHI,0,1],[PHI,0,-1],[-PHI,0,1],[-PHI,0,-1]]),
       faces:[[0,1,8],[0,8,4],[0,4,5],[0,5,10],[0,10,1],[3,2,11],[3,11,7],[3,7,6],[3,6,9],[3,9,2],
              [1,6,8],[8,6,9],[8,9,4],[4,9,2],[4,2,5],[5,2,11],[5,11,10],[10,11,7],[10,7,1],[1,7,6]],
       nums:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20] },
};
const gd = (s:number) => GEODEFS[s]??GEODEFS[20];

// Build geometry with one group per face (so each face can have its own material)
function buildGeoGroups(def:GeoDef, s=1.0): THREE.BufferGeometry {
  const pos:number[]=[], nor:number[]=[], uv:number[]=[];
  let vtxOffset = 0;
  const geo = new THREE.BufferGeometry();
  const groups: {start:number,count:number,matIdx:number}[] = [];

  def.faces.forEach((face,fi)=>{
    const startVtx = vtxOffset;
    let triCount = 0;
    for(let i=1;i<face.length-1;i++){
      const a=def.verts[face[0]], b=def.verts[face[i]], c=def.verts[face[i+1]];
      const ax=a[0]*s,ay=a[1]*s,az=a[2]*s;
      const bx=b[0]*s,by=b[1]*s,bz=b[2]*s;
      const cx=c[0]*s,cy=c[1]*s,cz=c[2]*s;
      const ex=bx-ax,ey=by-ay,ez=bz-az,fx=cx-ax,fy=cy-ay,fz=cz-az;
      const nx=ey*fz-ez*fy,ny=ez*fx-ex*fz,nz=ex*fy-ey*fx;
      const nl=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
      pos.push(ax,ay,az,bx,by,bz,cx,cy,cz);
      nor.push(nx/nl,ny/nl,nz/nl,nx/nl,ny/nl,nz/nl,nx/nl,ny/nl,nz/nl);
      // UV mapping: center the triangle
      uv.push(0.5,1, 0,0, 1,0);
      triCount++;
    }
    groups.push({start:startVtx*3, count:triCount*3, matIdx:fi});
    vtxOffset += triCount*3;
  });

  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  groups.forEach(g=>geo.addGroup(g.start, g.count, g.matIdx));
  return geo;
}

// Create a face texture with the number centered
function makeFaceTex(num:number, numCol:number, bgCol:number, edgeCol:number): THREE.CanvasTexture {
  const cv=document.createElement('canvas'); cv.width=256; cv.height=256;
  const ctx=cv.getContext('2d')!;
  // Background — solid face color
  const br=(bgCol>>16)&255, bg2=(bgCol>>8)&255, bb=bgCol&255;
  ctx.fillStyle=`rgb(${br},${bg2},${bb})`;
  ctx.fillRect(0,0,256,256);
  // Edge border
  const er=(edgeCol>>16)&255, eg=(edgeCol>>8)&255, eb=edgeCol&255;
  ctx.strokeStyle=`rgb(${er},${eg},${eb})`;
  ctx.lineWidth=8;
  ctx.strokeRect(8,8,240,240);
  // Number
  const nr=(numCol>>16)&255, ng=(numCol>>8)&255, nb=numCol&255;
  const fs = num>=100?80:num>=10?100:120;
  ctx.font=`900 ${fs}px system-ui,sans-serif`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=`rgb(${nr},${ng},${nb})`;
  // Subtle shadow for readability
  ctx.shadowColor='rgba(0,0,0,0.6)'; ctx.shadowBlur=8;
  ctx.fillText(String(num),128,128);
  return new THREE.CanvasTexture(cv);
}

// Build per-face material array
function buildMaterials(def:GeoDef, sides:number, metalness=0.65, roughness=0.32): THREE.MeshStandardMaterial[] {
  const p = pal(sides);
  return def.faces.map((_,fi)=>{
    const tex = makeFaceTex(def.nums[fi], p.num, p.face, p.edge);
    return new THREE.MeshStandardMaterial({
      map: tex,
      color: p.body,
      metalness, roughness,
      envMapIntensity: 0.8,
    });
  });
}

function buildCannon(def:GeoDef, s=1.0): CANNON.ConvexPolyhedron {
  return new CANNON.ConvexPolyhedron({
    vertices: def.verts.map(v=>new CANNON.Vec3(v[0]*s,v[1]*s,v[2]*s)),
    faces: def.faces.map(f=>[...f]),
  });
}

// Compute the local face normal for face `fi` of the geometry def
function faceNormal(def:GeoDef, fi:number): V3 {
  const face = def.faces[fi];
  const a=def.verts[face[0]], b=def.verts[face[1]], c=def.verts[face[2]];
  return normalize(cross(sub(b,a),sub(c,a)));
}

// Snap body quaternion so face with `targetNum` points toward +Y (camera above)
function orientToTop(body:CANNON.Body, mesh:THREE.Group, def:GeoDef, targetNum:number) {
  const fi = def.nums.indexOf(targetNum);
  if(fi<0) return;
  const localNormal = faceNormal(def, fi);
  // We want localNormal (in body space) to point to world +Y after transform
  // q rotates localNormal to [0,1,0]
  const up: V3 = [0,1,0];
  const axis = normalize(cross(localNormal, up));
  const cosA = Math.min(1, Math.max(-1, dot(localNormal, up)));
  const angle = Math.acos(cosA);
  if(Math.abs(angle) < 0.001) return; // already correct
  const q = new CANNON.Quaternion();
  if(Math.abs(angle - Math.PI) < 0.001) {
    // 180° — pick any perpendicular axis
    q.setFromAxisAngle(new CANNON.Vec3(1,0,0), Math.PI);
  } else {
    q.setFromAxisAngle(new CANNON.Vec3(axis[0],axis[1],axis[2]), angle);
  }
  // Compose with current body quaternion
  body.quaternion = q.mult(body.quaternion);
  body.velocity.set(0,0,0);
  body.angularVelocity.set(0,0,0);
  // Sync mesh
  mesh.quaternion.copy(body.quaternion as unknown as THREE.Quaternion);
}

// ── Component ─────────────────────────────────────────────────────────
export default function DiceRoller3D({ event, onDismiss }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(()=>{
    const el = mountRef.current; if(!el) return;
    const W=window.innerWidth, H=window.innerHeight;

    // ── Three.js ──────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
    renderer.setSize(W,H);
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.2;
    renderer.domElement.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // Overhead camera
    const camera = new THREE.PerspectiveCamera(50, W/H, 0.1, 200);
    camera.position.set(0, 22, 8);
    camera.lookAt(0, 0, 0);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xfffaf0, 2.5);
    sun.position.set(4, 20, 6);
    sun.castShadow=true;
    sun.shadow.mapSize.set(1024,1024);
    sun.shadow.camera.left=-22; sun.shadow.camera.right=22;
    sun.shadow.camera.top=22; sun.shadow.camera.bottom=-22;
    sun.shadow.camera.far=60;
    sun.shadow.bias=-0.001;
    scene.add(sun);
    scene.add(Object.assign(new THREE.DirectionalLight(0x4466ff,0.4),{position:new THREE.Vector3(-5,-2,2)}));

    // Shadow catcher (invisible floor that receives shadows)
    const shadowFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(60,60),
      new THREE.ShadowMaterial({opacity:0.4})
    );
    shadowFloor.rotation.x=-Math.PI/2;
    shadowFloor.receiveShadow=true;
    scene.add(shadowFloor);

    // ── Cannon-es ─────────────────────────────────────────────────────
    const world = new CANNON.World({gravity:new CANNON.Vec3(0,-28,0)});
    (world.solver as CANNON.GSSolver).iterations=14;

    const matD = new CANNON.Material('die');
    const matF = new CANNON.Material('floor');
    world.addContactMaterial(new CANNON.ContactMaterial(matD,matF,{friction:0.3,restitution:0.42}));
    world.addContactMaterial(new CANNON.ContactMaterial(matD,matD,{friction:0.2,restitution:0.35}));

    const floorBody = new CANNON.Body({mass:0,material:matF});
    floorBody.addShape(new CANNON.Plane());
    floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0),-Math.PI/2);
    world.addBody(floorBody);

    const tableHalfW = 15*(W/H), tableHalfZ = 11;
    [[0,0,-tableHalfZ,0],[0,0,tableHalfZ,Math.PI],
     [-tableHalfW,0,0,Math.PI/2],[tableHalfW,0,0,-Math.PI/2]].forEach(([x,y,z,a])=>{
      const b=new CANNON.Body({mass:0,material:matF});
      b.addShape(new CANNON.Plane());
      b.position.set(x,y,z);
      b.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0),a);
      world.addBody(b);
    });

    // ── Create dice ────────────────────────────────────────────────────
    const diceList = event.allDice?.length
      ? event.allDice : [{die:event.dieType,value:event.result}];
    const n = diceList.length;
    const S = Math.max(0.8, 1.25 - n*0.06);

    interface DObj { mesh:THREE.Mesh; body:CANNON.Body; def:GeoDef; sides:number; val:number; oriented:boolean }
    const dObjs: DObj[] = diceList.map((d)=>{
      const def = gd(d.die);
      const geo = buildGeoGroups(def, S);
      const mats = buildMaterials(def, d.die);
      const mesh = new THREE.Mesh(geo, mats);
      mesh.castShadow=true; mesh.receiveShadow=true;
      scene.add(mesh);

      const body = new CANNON.Body({
        mass:1, material:matD,
        linearDamping:0.1, angularDamping:0.18,
        shape:buildCannon(def, S*0.88),
      });
      const spread = Math.min(tableHalfW*0.55, n*1.8);
      body.position.set((Math.random()-.5)*spread, 7+Math.random()*4, (Math.random()-.5)*(tableHalfZ*0.5));
      body.quaternion.setFromEuler(Math.random()*Math.PI*2,Math.random()*Math.PI*2,Math.random()*Math.PI*2);
      body.velocity.set((Math.random()-.5)*14, -(2+Math.random()*3), (Math.random()-.5)*8);
      body.angularVelocity.set((Math.random()-.5)*24,(Math.random()-.5)*24,(Math.random()-.5)*20);
      world.addBody(body);

      return {mesh, body, def, sides:d.die, val:d.value, oriented:false};
    });

    // ── Animation ──────────────────────────────────────────────────────
    let last=performance.now(), allDone=false, doneTimer=0, dismissed=false, raf=0;
    let resultShown = false;

    function showResult() {
      if(resultShown) return; resultShown=true;
      const tot = event.total ?? (event.modifier!==undefined ? event.result+event.modifier : event.result);
      const multi = diceList.length > 1;
      const hasMod = !multi && event.modifier!==undefined && event.modifier!==0;
      const single = !multi && !hasMod;

      // Result label
      const top = document.createElement('div');
      top.style.cssText=`
        position:absolute; top:7%; left:50%; transform:translateX(-50%) scale(0.6);
        text-align:center; pointer-events:none; white-space:nowrap;
        animation:resultReveal 0.6s cubic-bezier(0.34,1.56,0.64,1) both;
      `;
      // Show the roll label + big result
      const label = event.label || (d => d===20?'d20':d===4?'d4':d===6?'d6':d===8?'d8':d===10?'d10':d===12?'d12':'Roll')(event.dieType);
      top.innerHTML=`
        <div style="font:700 14px system-ui;color:rgba(255,255,255,0.5);letter-spacing:.2em;text-transform:uppercase;margin-bottom:6px">${label}</div>
        <div style="font:900 ${single?96:80}px system-ui;color:#fff;line-height:1;
          text-shadow:0 0 50px rgba(255,255,255,0.6),0 0 20px rgba(255,255,255,0.4);">${tot}</div>
        ${hasMod?`<div style="font:500 18px system-ui;color:rgba(255,255,255,0.5);margin-top:6px">${event.result} ${(event.modifier??0)>=0?'+':''}${event.modifier}</div>`:''}
      `;
      el.appendChild(top);
    }

    function frame(ts:number) {
      if(dismissed) return;
      raf=requestAnimationFrame(frame);
      const dt=Math.min((ts-last)/1000,0.05); last=ts;
      world.step(1/60,dt,3);

      dObjs.forEach(o=>{
        o.mesh.position.copy(o.body.position as unknown as THREE.Vector3);
        o.mesh.quaternion.copy(o.body.quaternion as unknown as THREE.Quaternion);
      });

      if(!allDone) {
        const settled = dObjs.every(o=>
          o.body.velocity.length()<0.4 && o.body.angularVelocity.length()<0.4
        );
        if(settled) {
          allDone=true;
          // Orient each die to show correct face up, then display result
          dObjs.forEach(o=>{
            if(!o.oriented) {
              o.oriented=true;
              orientToTop(o.body, o.mesh as unknown as THREE.Group, o.def, o.val);
              // Sync mesh after orientation
              o.mesh.quaternion.copy(o.body.quaternion as unknown as THREE.Quaternion);
            }
          });
          showResult();
          doneTimer=0;
        }
      } else {
        doneTimer+=dt;
        if(doneTimer>4.5) {dismissed=true; dismissRef.current(); cancelAnimationFrame(raf); return;}
      }
      renderer.render(scene,camera);
    }
    raf=requestAnimationFrame(frame);

    return ()=>{
      dismissed=true; cancelAnimationFrame(raf);
      renderer.dispose();
      if(el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
      scene.clear();
    };
  },[]);

  return createPortal(
    <div ref={mountRef} onClick={onDismiss} style={{
      position:'fixed',inset:0,zIndex:9999,
      background:'rgba(2,5,14,0.90)',
      backdropFilter:'blur(14px)',
      cursor:'pointer', overflow:'hidden',
    }}>
      <div style={{
        position:'absolute',bottom:14,left:0,right:0,
        textAlign:'center',pointerEvents:'none',
        fontFamily:'var(--ff-body)',fontSize:11,color:'rgba(255,255,255,0.18)',
      }}>Click anywhere to dismiss</div>
      <style>{`
        @keyframes resultReveal {
          from{opacity:0;transform:translateX(-50%) scale(0.5)}
          to{opacity:1;transform:translateX(-50%) scale(1)}
        }
      `}</style>
    </div>,
    document.body
  );
}
