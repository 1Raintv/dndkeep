/**
 * DiceRoller3D — Overhead-angle 3D dice rolling.
 * Camera looks down at ~55° angle. The screen IS the table.
 * Three.js WebGL + Cannon-es rigid-body physics.
 * Dice bounce across the full screen, settle showing face-up result.
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

// ── Palettes ──────────────────────────────────────────────────────────
const PAL: Record<number, { color: number; emissive: number; edge: number }> = {
  4:  { color: 0x6d28d9, emissive: 0x3b0764, edge: 0xc084fc },
  6:  { color: 0xea580c, emissive: 0x431407, edge: 0xfdba74 },
  8:  { color: 0x16a34a, emissive: 0x052e16, edge: 0x86efac },
  10: { color: 0x0284c7, emissive: 0x082f49, edge: 0xbae6fd },
  12: { color: 0xc026d3, emissive: 0x4a044e, edge: 0xf0abfc },
  20: { color: 0xca8a04, emissive: 0x3d2700, edge: 0xfde68a },
  100:{ color: 0xc2410c, emissive: 0x431407, edge: 0xfed7aa },
};
const p = (s: number) => PAL[s] ?? PAL[20];

const PHI = (1+Math.sqrt(5))/2;
function unit(vs:[number,number,number][]): [number,number,number][] {
  return vs.map(v=>{const l=Math.sqrt(v[0]**2+v[1]**2+v[2]**2); return[v[0]/l,v[1]/l,v[2]/l];});
}

// ── Geometry definitions ─────────────────────────────────────────────
interface GeoDef { verts:[number,number,number][]; faces:number[][]; nums:number[] }

const GEODEFS: Record<number, GeoDef> = {
  4: { verts:unit([[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]]),
       faces:[[0,1,2],[0,2,3],[0,3,1],[1,3,2]], nums:[1,2,3,4] },
  6: { verts:[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
       faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]], nums:[1,6,2,5,3,4] },
  8: { verts:[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],
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
function geo(s:number): GeoDef { return GEODEFS[s] ?? GEODEFS[20]; }

// Build THREE geometry (triangulated fan)
function buildGeo(def: GeoDef, s=1.0): THREE.BufferGeometry {
  const pos:number[]=[], nor:number[]=[], uvs:number[]=[];
  for(const face of def.faces) {
    for(let i=1;i<face.length-1;i++) {
      const a=def.verts[face[0]],b=def.verts[face[i]],c=def.verts[face[i+1]];
      const ax=a[0]*s,ay=a[1]*s,az=a[2]*s,bx=b[0]*s,by=b[1]*s,bz=b[2]*s,cx=c[0]*s,cy=c[1]*s,cz=c[2]*s;
      const ex=bx-ax,ey=by-ay,ez=bz-az,fx=cx-ax,fy=cy-ay,fz=cz-az;
      const nx=ey*fz-ez*fy,ny=ez*fx-ex*fz,nz=ex*fy-ey*fx;
      const nl=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
      pos.push(ax,ay,az,bx,by,bz,cx,cy,cz);
      nor.push(nx/nl,ny/nl,nz/nl,nx/nl,ny/nl,nz/nl,nx/nl,ny/nl,nz/nl);
      uvs.push(0.5,0.5, 0,0, 1,0);
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  return g;
}

function makeNumTex(n:number, col:number, bg:number): THREE.CanvasTexture {
  const cv=document.createElement('canvas'); cv.width=128; cv.height=128;
  const ctx=cv.getContext('2d')!;
  const br=(bg>>16)&255,bg2=(bg>>8)&255,bb=bg&255;
  const cr=(col>>16)&255,cg=(col>>8)&255,cb=col&255;
  ctx.fillStyle=`rgba(${br},${bg2},${bb},0.85)`;
  ctx.beginPath(); ctx.arc(64,64,56,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=`rgb(${cr},${cg},${cb})`; ctx.lineWidth=3;
  ctx.beginPath(); ctx.arc(64,64,56,0,Math.PI*2); ctx.stroke();
  ctx.font=`900 ${n>=10?52:64}px system-ui`; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=`rgb(${cr},${cg},${cb})`; ctx.fillText(String(n),64,68);
  return new THREE.CanvasTexture(cv);
}

function buildCannonShape(def: GeoDef, s=1.0): CANNON.ConvexPolyhedron {
  return new CANNON.ConvexPolyhedron({
    vertices: def.verts.map(v=>new CANNON.Vec3(v[0]*s,v[1]*s,v[2]*s)),
    faces: def.faces.map(f=>[...f]),
  });
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
    renderer.domElement.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // ── OVERHEAD camera — this is the key change ───────────────────────
    // Position camera high up, angled at ~55° looking down at the table
    const aspect = W/H;
    const camera = new THREE.PerspectiveCamera(52, aspect, 0.1, 200);
    camera.position.set(0, 18, 10);   // high (y=18) and slightly back (z=10)
    camera.lookAt(0, 0, 0);           // looking at the center of the table

    // Scale the table coordinate space to fill the screen nicely
    // At this camera angle, the "table" (~y=0 plane) should span the full screen
    const tableHalfW = 14 * aspect;   // table is wider for wide screens
    const tableHalfH = 10;

    // ── Lighting ──────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xfff8f0, 2.2);
    sun.position.set(3, 20, 5);
    sun.castShadow=true;
    sun.shadow.mapSize.set(1024,1024);
    sun.shadow.camera.left=-25; sun.shadow.camera.right=25;
    sun.shadow.camera.top=25; sun.shadow.camera.bottom=-25;
    sun.shadow.camera.near=0.1; sun.shadow.camera.far=60;
    sun.shadow.bias=-0.001;
    scene.add(sun);
    // Rim light from below for metallic look
    const rim = new THREE.DirectionalLight(0x8888ff, 0.4);
    rim.position.set(-4, -5, 2);
    scene.add(rim);

    // ── Invisible table plane for shadows only ─────────────────────────
    const tableGeo = new THREE.PlaneGeometry(60, 60);
    const tableMat = new THREE.ShadowMaterial({opacity: 0.35});
    const tableMesh = new THREE.Mesh(tableGeo, tableMat);
    tableMesh.rotation.x = -Math.PI/2;
    tableMesh.position.y = 0;
    tableMesh.receiveShadow = true;
    scene.add(tableMesh);

    // ── Cannon-es ─────────────────────────────────────────────────────
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0,-25,0) });
    (world.solver as CANNON.GSSolver).iterations = 12;

    const diceMat = new CANNON.Material('die');
    const floorMat = new CANNON.Material('floor');
    world.addContactMaterial(new CANNON.ContactMaterial(diceMat, floorMat, {
      friction: 0.35, restitution: 0.38,
    }));
    world.addContactMaterial(new CANNON.ContactMaterial(diceMat, diceMat, {
      friction: 0.25, restitution: 0.30,
    }));

    // Floor
    const floor = new CANNON.Body({mass:0, material:floorMat});
    floor.addShape(new CANNON.Plane());
    floor.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0),-Math.PI/2);
    world.addBody(floor);

    // Invisible walls to keep dice on-screen
    const WX = tableHalfW + 1, WZ = tableHalfH + 1;
    [
      { pos:[0,0,-WZ], axis:[0,1,0], angle:0 },
      { pos:[0,0, WZ], axis:[0,1,0], angle:Math.PI },
      { pos:[-WX,0,0], axis:[0,1,0], angle:Math.PI/2 },
      { pos:[ WX,0,0], axis:[0,1,0], angle:-Math.PI/2 },
    ].forEach(({pos,axis,angle})=>{
      const b=new CANNON.Body({mass:0, material:floorMat});
      b.addShape(new CANNON.Plane());
      b.position.set(pos[0],pos[1],pos[2]);
      b.quaternion.setFromAxisAngle(new CANNON.Vec3(axis[0],axis[1],axis[2]),angle);
      world.addBody(b);
    });

    // ── Create dice ────────────────────────────────────────────────────
    const diceList = event.allDice?.length
      ? event.allDice : [{die:event.dieType, value:event.result}];
    const n = diceList.length;
    const SCALE = Math.max(0.85, 1.3 - n*0.07);

    interface DObj { mesh:THREE.Group; body:CANNON.Body; sides:number; val:number }
    const dObjs: DObj[] = diceList.map((d,i)=>{
      const def = geo(d.die);
      const pal = p(d.die);
      const s = SCALE;

      const grp = new THREE.Group();

      // Main mesh
      const mat = new THREE.MeshStandardMaterial({
        color: pal.color,
        emissive: pal.emissive,
        emissiveIntensity: 0.3,
        metalness: 0.7,
        roughness: 0.3,
      });
      const mesh = new THREE.Mesh(buildGeo(def, s), mat);
      mesh.castShadow=true; mesh.receiveShadow=true;
      grp.add(mesh);

      // Edges
      const edgeMat = new THREE.LineBasicMaterial({color:pal.edge, transparent:true, opacity:0.9});
      grp.add(new THREE.LineSegments(new THREE.EdgesGeometry(buildGeo(def, s*1.005)), edgeMat));

      // Number faces — sprites over each face centroid
      def.faces.forEach((face,fi)=>{
        const cx = face.reduce((a,vi)=>a+def.verts[vi][0],0)/face.length * s * 1.06;
        const cy = face.reduce((a,vi)=>a+def.verts[vi][1],0)/face.length * s * 1.06;
        const cz = face.reduce((a,vi)=>a+def.verts[vi][2],0)/face.length * s * 1.06;
        const tex = makeNumTex(def.nums[fi], pal.edge, pal.emissive);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({map:tex, transparent:true, depthTest:false}));
        sp.position.set(cx,cy,cz);
        sp.scale.set(0.65*s, 0.65*s, 1);
        grp.add(sp);
      });

      scene.add(grp);

      // Physics body — drop from above with random throw
      const body = new CANNON.Body({
        mass:1, material:diceMat,
        linearDamping:0.08, angularDamping:0.15,
        shape: buildCannonShape(def, s*0.9),
      });

      // Start positions: spread across the table, high up
      const spread = Math.min(WX*0.6, n*1.5);
      body.position.set(
        (Math.random()-0.5)*spread,
        6 + Math.random()*4,
        (Math.random()-0.5)*(WZ*0.5),
      );
      body.quaternion.setFromEuler(
        Math.random()*Math.PI*2, Math.random()*Math.PI*2, Math.random()*Math.PI*2,
      );
      body.velocity.set(
        (Math.random()-0.5)*12, -(2+Math.random()*2), (Math.random()-0.5)*8,
      );
      body.angularVelocity.set(
        (Math.random()-0.5)*22, (Math.random()-0.5)*22, (Math.random()-0.5)*22,
      );
      world.addBody(body);

      return {mesh:grp, body, sides:d.die, val:d.value};
    });

    // ── Animation ──────────────────────────────────────────────────────
    let last=performance.now(), allDone=false, doneT=0, dismissed=false, raf=0;
    let totalShown=false;

    function showTotal() {
      if(totalShown) return; totalShown=true;
      const tot = event.total ?? (event.modifier!==undefined ? event.result+event.modifier : event.result);
      const multi = diceList.length > 1;
      const hasMod = !multi && event.modifier!==undefined && event.modifier!==0;
      if(!multi && !hasMod) return;
      const div=document.createElement('div');
      div.style.cssText=`position:absolute;bottom:10%;left:50%;transform:translateX(-50%);
        text-align:center;pointer-events:none;animation:tpop 0.5s cubic-bezier(0.34,1.56,0.64,1) both;`;
      div.innerHTML=`
        ${hasMod?`<div style="font:600 18px system-ui;color:rgba(255,255,255,0.5);margin-bottom:6px">${event.result} ${(event.modifier??0)>=0?'+':''}${event.modifier} =</div>`:''}
        ${multi?`<div style="font:700 12px system-ui;color:rgba(255,255,255,0.4);letter-spacing:.15em;margin-bottom:6px">TOTAL</div>`:''}
        <div style="font:900 80px system-ui;color:#fff;line-height:1;text-shadow:0 0 40px rgba(255,255,255,0.5)">${tot}</div>
      `;
      el.appendChild(div);
    }

    function frame(ts:number) {
      if(dismissed) return;
      raf=requestAnimationFrame(frame);
      const dt=Math.min((ts-last)/1000, 0.05); last=ts;
      world.step(1/60, dt, 3);
      dObjs.forEach(o=>{
        o.mesh.position.copy(o.body.position as unknown as THREE.Vector3);
        o.mesh.quaternion.copy(o.body.quaternion as unknown as THREE.Quaternion);
      });
      if(!allDone) {
        const done = dObjs.every(o=>o.body.velocity.length()<0.5 && o.body.angularVelocity.length()<0.5);
        if(done) { allDone=true; doneT=0; }
      } else {
        doneT+=dt;
        if(doneT>0.3) showTotal();
        if(doneT>4.5) { dismissed=true; dismissRef.current(); cancelAnimationFrame(raf); return; }
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
    <div
      ref={mountRef}
      onClick={onDismiss}
      style={{
        position:'fixed', inset:0, zIndex:9999,
        background:'rgba(2,5,12,0.88)',
        backdropFilter:'blur(12px)',
        cursor:'pointer',
        overflow:'hidden',
      }}
    >
      {event.label && (
        <div style={{
          position:'absolute', top:'5%', left:0, right:0, textAlign:'center',
          pointerEvents:'none', fontFamily:'var(--ff-body)', fontWeight:700,
          fontSize:16, letterSpacing:'0.25em', textTransform:'uppercase',
          color:'rgba(255,255,255,0.4)',
        }}>{event.label}</div>
      )}
      <div style={{
        position:'absolute', bottom:14, left:0, right:0, textAlign:'center',
        pointerEvents:'none', fontFamily:'var(--ff-body)', fontSize:11,
        color:'rgba(255,255,255,0.18)',
      }}>Click anywhere to dismiss</div>
      <style>{`
        @keyframes tpop{from{opacity:0;transform:translateX(-50%) scale(0.7)}to{opacity:1;transform:translateX(-50%) scale(1)}}
      `}</style>
    </div>,
    document.body
  );
}
