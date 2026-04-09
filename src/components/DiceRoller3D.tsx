/**
 * DiceRoller3D — Three.js WebGL rendering + custom physics (no cannon-es).
 * Overhead camera view. Face textures baked into materials.
 * Custom physics: gravity, bounce, wall collision, settle detection.
 */
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';

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
const PAL: Record<number, { body:number; face:number; num:number; edge:number }> = {
  4:  { body:0x3b0764, face:0x7c3aed, num:0xede9fe, edge:0xc084fc },
  6:  { body:0x7c1d0d, face:0xdc2626, num:0xfee2e2, edge:0xf87171 },
  8:  { body:0x14532d, face:0x15803d, num:0xdcfce7, edge:0x4ade80 },
  10: { body:0x082f49, face:0x0369a1, num:0xe0f2fe, edge:0x38bdf8 },
  12: { body:0x4a044e, face:0xa21caf, num:0xfdf4ff, edge:0xe879f9 },
  20: { body:0x3d2900, face:0xb45309, num:0xfef3c7, edge:0xf59e0b },
 100: { body:0x431407, face:0xc2410c, num:0xffedd5, edge:0xfb923c },
};
const pal = (s:number) => PAL[s] ?? PAL[20];

const PHI = (1+Math.sqrt(5))/2;
type V3 = [number,number,number];
const cross=(a:V3,b:V3):V3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a:V3,b:V3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm=(v:V3):V3=>{const l=Math.sqrt(dot(v,v))||1;return[v[0]/l,v[1]/l,v[2]/l];};
const sub=(a:V3,b:V3):V3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const unit=(vs:V3[]):V3[]=>vs.map(v=>{const l=Math.sqrt(v[0]**2+v[1]**2+v[2]**2)||1;return[v[0]/l,v[1]/l,v[2]/l];});

interface GeoDef { verts:V3[]; faces:number[][]; nums:number[] }
const GEODEFS:Record<number,GeoDef> = {
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
const gd=(s:number)=>GEODEFS[s]??GEODEFS[20];

// Build Three.js geometry with per-face material groups
function buildGeo(def:GeoDef, s:number): THREE.BufferGeometry {
  const pos:number[]=[], nor:number[]=[], uv:number[]=[];
  let offset=0;
  const g=new THREE.BufferGeometry();
  def.faces.forEach((face,fi)=>{
    const start=offset; let tc=0;
    for(let i=1;i<face.length-1;i++){
      const a=def.verts[face[0]],b=def.verts[face[i]],c=def.verts[face[i+1]];
      const [ax,ay,az]=[a[0]*s,a[1]*s,a[2]*s];
      const [bx,by,bz]=[b[0]*s,b[1]*s,b[2]*s];
      const [cx,cy,cz]=[c[0]*s,c[1]*s,c[2]*s];
      const ex=bx-ax,ey=by-ay,ez=bz-az,fx=cx-ax,fy=cy-ay,fz=cz-az;
      const nx=ey*fz-ez*fy,ny=ez*fx-ex*fz,nz=ex*fy-ey*fx;
      const nl=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
      pos.push(ax,ay,az,bx,by,bz,cx,cy,cz);
      nor.push(nx/nl,ny/nl,nz/nl,nx/nl,ny/nl,nz/nl,nx/nl,ny/nl,nz/nl);
      uv.push(0.5,1,0,0,1,0);
      tc++;
    }
    g.addGroup(start*3,tc*3,fi);
    offset+=tc*3;
  });
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  return g;
}

function makeTex(num:number, nc:number, bc:number, ec:number): THREE.CanvasTexture {
  const cv=document.createElement('canvas'); cv.width=256; cv.height=256;
  const ctx=cv.getContext('2d')!;
  // Bright gradient background
  const r=(bc>>16)&255, g=(bc>>8)&255, b=bc&255;
  const gr=ctx.createRadialGradient(128,100,10,128,128,140);
  gr.addColorStop(0,`rgb(${Math.min(255,r+80)},${Math.min(255,g+80)},${Math.min(255,b+80)})`);
  gr.addColorStop(1,`rgb(${r},${g},${b})`);
  ctx.fillStyle=gr; ctx.fillRect(0,0,256,256);
  // Bright border
  ctx.strokeStyle=`#${ec.toString(16).padStart(6,'0')}`;
  ctx.lineWidth=12; ctx.strokeRect(8,8,240,240);
  // Large white number
  const fs=num>=100?80:num>=10?100:122;
  ctx.font=`900 ${fs}px system-ui`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle='#ffffff';
  ctx.shadowColor='rgba(0,0,0,0.7)'; ctx.shadowBlur=8;
  ctx.fillText(String(num),128,136);
  return new THREE.CanvasTexture(cv);
}

function buildMats(def:GeoDef, sides:number): THREE.MeshPhongMaterial[] {
  const p=pal(sides);
  return def.faces.map((_,fi)=>new THREE.MeshPhongMaterial({
    map: makeTex(def.nums[fi],p.num,p.face,p.edge),
    color: 0xffffff,   // white = texture shows at full brightness
    emissive: new THREE.Color(p.face).multiplyScalar(0.18),
    specular: new THREE.Color(p.edge),
    shininess: 80,
  }));
}

// Face normal for orientation snap
function faceNorm(def:GeoDef, fi:number):V3 {
  const f=def.faces[fi];
  const a=def.verts[f[0]],b=def.verts[f[1]],c=def.verts[f[2]];
  return norm(cross(sub(b,a),sub(c,a)));
}

// Snap mesh rotation so face with targetNum points to +Y (toward overhead camera)
function snapFaceUp(mesh:THREE.Mesh, def:GeoDef, targetNum:number) {
  const fi=def.nums.indexOf(targetNum); if(fi<0) return;
  const f=def.faces[fi];
  const a=def.verts[f[0]],b=def.verts[f[1]],c=def.verts[f[2]];
  const n1=norm(cross(sub(b,a),sub(c,a)));
  // Outward normal points away from shape centroid (origin for unit sphere)
  const fc:V3=[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3,(a[2]+b[2]+c[2])/3];
  const ln:V3 = dot(n1,fc)>=0 ? n1 : [-n1[0],-n1[1],-n1[2]];
  // Camera is at (0,22,8) so "up" toward camera = normalize(0,22,8)
  const up:V3=norm([0,22,8]);
  const cosA=Math.min(1,Math.max(-1,dot(ln,up)));
  const angle=Math.acos(cosA);
  if(Math.abs(angle)<0.001) return;
  const q=new THREE.Quaternion();
  if(Math.abs(angle-Math.PI)<0.001) {
    q.setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI);
  } else {
    const ax=norm(cross(ln,up));
    q.setFromAxisAngle(new THREE.Vector3(ax[0],ax[1],ax[2]),angle);
  }
  // SET (not multiply) — replace physics rotation with correct orientation
  mesh.quaternion.copy(q);
}

// ── Physics state per die ─────────────────────────────────────────────
interface PhysDie {
  mesh:THREE.Mesh;
  def:GeoDef;
  val:number;
  // World position
  x:number; y:number; z:number;
  // Velocity
  vx:number; vy:number; vz:number;
  // Euler angles (used for mesh rotation)
  rx:number; ry:number; rz:number;
  // Angular velocity
  arx:number; ary:number; arz:number;
  phase:'fly'|'done';
  delay:number;
}

// ── Component ─────────────────────────────────────────────────────────
export default function DiceRoller3D({ event, onDismiss }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(()=>{
    const el=mountRef.current; if(!el) return;
    const W=window.innerWidth, H=window.innerHeight;

    // ── Three.js setup ─────────────────────────────────────────────────
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
    } catch(e) {
      console.error('WebGL init failed:', e);
      // Dismiss immediately if WebGL unavailable
      setTimeout(()=>dismissRef.current(), 100);
      return;
    }

    renderer.setSize(W,H);
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.shadowMap.enabled=true;
    renderer.domElement.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    el.appendChild(renderer.domElement);

    const scene=new THREE.Scene();

    // Overhead camera — the screen IS the table
    const camera=new THREE.PerspectiveCamera(50,W/H,0.1,200);
    camera.position.set(0,22,8);
    camera.lookAt(0,0,0);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff,1.6));
    const sun=new THREE.DirectionalLight(0xffffff,3.0);
    sun.position.set(4,18,5); sun.castShadow=true;
    sun.shadow.mapSize.set(1024,1024);
    sun.shadow.camera.left=-20; sun.shadow.camera.right=20;
    sun.shadow.camera.top=20; sun.shadow.camera.bottom=-20;
    sun.shadow.camera.far=60; sun.shadow.bias=-0.001;
    scene.add(sun);
    const fill=new THREE.DirectionalLight(0x6699ff,0.35);
    fill.position.set(-5,-3,3);
    scene.add(fill);

    // Invisible shadow-catcher floor
    const floor=new THREE.Mesh(
      new THREE.PlaneGeometry(60,60),
      new THREE.ShadowMaterial({opacity:0.35})
    );
    floor.rotation.x=-Math.PI/2; floor.receiveShadow=true;
    scene.add(floor);

    // ── Create dice ─────────────────────────────────────────────────────
    const diceList=event.allDice?.length
      ? event.allDice : [{die:event.dieType,value:event.result}];
    const n=diceList.length;
    const S=Math.max(0.85,1.3-n*0.05);

    // Room bounds for physics
    const WX=9, WZ=7;
    const FLOOR=0, GRAVITY=1800;
    const BOUNCE=0.62, WALL_B=0.68, ANG_B=0.78, ROLL_F=0.955;

    const dice:PhysDie[] = diceList.map((d,i)=>{
      const def=gd(d.die);
      const mesh=new THREE.Mesh(buildGeo(def,S), buildMats(def,d.die));
      mesh.castShadow=true; mesh.receiveShadow=true;
      scene.add(mesh);
      const spread=Math.min(WX*0.4, n*1.2);
      return {
        mesh, def, val:d.value,
        x:(Math.random()-.5)*spread,
        y:8+Math.random()*4,
        z:(Math.random()-.5)*(WZ*0.45),
        vx:(Math.random()-.5)*7, vy:-(4+Math.random()*2), vz:(Math.random()-.5)*5,
        rx:Math.random()*Math.PI*2, ry:Math.random()*Math.PI*2, rz:Math.random()*Math.PI*2,
        arx:(Math.random()-.5)*20, ary:(Math.random()-.5)*20, arz:(Math.random()-.5)*14,
        phase:'fly' as const,
        delay: i*0.10,
      };
    });

    // ── Custom physics update ───────────────────────────────────────────
    function physicsStep(dt:number) {
      for(const d of dice) {
        if(d.delay>0){ d.delay-=dt; continue; }
        if(d.phase==='done') continue;

        d.vy+=GRAVITY*dt;
        d.x+=d.vx*dt; d.y+=d.vy*dt; d.z+=d.vz*dt;
        d.rx+=d.arx*dt; d.ry+=d.ary*dt; d.rz+=d.arz*dt;

        const r=S*0.52;

        // Floor bounce
        if(d.y-r<FLOOR) {
          d.y=FLOOR+r;
          d.vy=-Math.abs(d.vy)*BOUNCE;
          d.vx*=0.88; d.vz*=0.88;
          d.arx*=ANG_B; d.ary*=ANG_B; d.arz*=ANG_B;
          if(Math.abs(d.vy)<30) d.vy=0;
        }
        // Walls
        if(d.x-r<-WX){d.x=-WX+r; d.vx=Math.abs(d.vx)*WALL_B; d.arx*=ANG_B;}
        if(d.x+r> WX){d.x= WX-r; d.vx=-Math.abs(d.vx)*WALL_B; d.arx*=ANG_B;}
        if(d.z-r<-WZ){d.z=-WZ+r; d.vz=Math.abs(d.vz)*WALL_B; d.arz*=ANG_B;}
        if(d.z+r> WZ){d.z= WZ-r; d.vz=-Math.abs(d.vz)*WALL_B; d.arz*=ANG_B;}

        // Rolling friction
        if(Math.abs(d.y-r-FLOOR)<2){
          d.vx*=ROLL_F; d.vz*=ROLL_F;
          d.arx*=ROLL_F; d.ary*=ROLL_F; d.arz*=ROLL_F;
        }

        // Sync mesh
        d.mesh.position.set(d.x, d.y, d.z);
        d.mesh.rotation.set(d.rx, d.ry, d.rz);

        // Settle check
        const spd=Math.sqrt(d.vx**2+d.vy**2+d.vz**2);
        const ang=Math.sqrt(d.arx**2+d.ary**2+d.arz**2);
        if(spd<12 && ang<0.8 && Math.abs(d.y-r-FLOOR)<3) {
          d.phase='done';
          d.vx=d.vy=d.vz=d.arx=d.ary=d.arz=0;
          d.y=FLOOR+r;
          d.mesh.position.y=d.y;
          // Snap correct face upward
          snapFaceUp(d.mesh, d.def, d.val);
        }
      }
    }

    // ── Animation loop ─────────────────────────────────────────────────
    let last=performance.now(), allDone=false, doneT=0, dismissed=false, raf=0;
    let resultShown=false;

    function showResult() {
      if(resultShown) return; resultShown=true;
      const tot=event.total??(event.modifier!==undefined?event.result+event.modifier:event.result);
      const multi=diceList.length>1;
      const hasMod=!multi&&event.modifier!==undefined&&event.modifier!==0;
      const div=document.createElement('div');
      div.style.cssText=`position:absolute;top:6%;left:50%;transform:translateX(-50%);
        text-align:center;pointer-events:none;white-space:nowrap;
        animation:rReveal 0.55s cubic-bezier(0.34,1.56,0.64,1) both;`;
      const lbl=event.label||`d${event.dieType}`;
      div.innerHTML=`
        <div style="font:700 13px system-ui;color:rgba(255,255,255,0.45);
          letter-spacing:.2em;text-transform:uppercase;margin-bottom:4px">${lbl}</div>
        <div style="font:900 88px system-ui;color:#fff;line-height:1;
          text-shadow:0 0 40px rgba(255,255,255,0.55)">${tot}</div>
        ${hasMod?`<div style="font:500 17px system-ui;color:rgba(255,255,255,0.45);margin-top:5px">
          ${event.result}${(event.modifier??0)>=0?'+':''}${event.modifier}</div>`:''}
      `;
      el.appendChild(div);
    }

    function frame(ts:number) {
      if(dismissed) return;
      raf=requestAnimationFrame(frame);
      const dt=Math.min((ts-last)/1000,0.05); last=ts;

      physicsStep(dt);

      if(!allDone) {
        const ready=dice.filter(d=>d.delay<=0);
        if(ready.length>0 && ready.every(d=>d.phase==='done')) {
          allDone=true; doneT=0;
          showResult();
        }
      } else {
        doneT+=dt;
        if(doneT>4.2){dismissed=true; dismissRef.current(); cancelAnimationFrame(raf); return;}
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
      backdropFilter:'blur(12px)',
      cursor:'pointer',overflow:'hidden',
    }}>
      <div style={{
        position:'absolute',bottom:14,left:0,right:0,textAlign:'center',
        pointerEvents:'none',fontFamily:'var(--ff-body)',fontSize:11,
        color:'rgba(255,255,255,0.18)',
      }}>Click anywhere to dismiss</div>
      <style>{`
        @keyframes rReveal{
          from{opacity:0;transform:translateX(-50%) scale(0.5)}
          to{opacity:1;transform:translateX(-50%) scale(1)}
        }
      `}</style>
    </div>,
    document.body
  );
}
