/**
 * DiceRoller3D — Three.js overhead dice. Camera looks down ~65°.
 * Die is large and centered. Custom physics. Per-face bright textures.
 * No cannon-es (caused crashes). No CDN (caused failures).
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

// ── Palette ───────────────────────────────────────────────────────────
const PAL: Record<number,{body:number;hi:number;edge:number}> = {
  4:  {body:0x5b21b6, hi:0x8b5cf6, edge:0xddd6fe},
  6:  {body:0x991b1b, hi:0xef4444, edge:0xfecaca},
  8:  {body:0x166534, hi:0x22c55e, edge:0xbbf7d0},
  10: {body:0x075985, hi:0x38bdf8, edge:0xe0f2fe},
  12: {body:0x86198f, hi:0xe879f9, edge:0xfae8ff},
  20: {body:0x92400e, hi:0xfbbf24, edge:0xfef9c3},
 100: {body:0x9a3412, hi:0xfb923c, edge:0xffedd5},
};
const pal = (s:number) => PAL[s]??PAL[20];
const PHI = (1+Math.sqrt(5))/2;
type V3 = [number,number,number];
const unit=(vs:V3[]):V3[]=>vs.map(v=>{const l=Math.sqrt(v[0]**2+v[1]**2+v[2]**2)||1;return[v[0]/l,v[1]/l,v[2]/l];});
const sub=(a:V3,b:V3):V3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a:V3,b:V3):V3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a:V3,b:V3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm=(v:V3):V3=>{const l=Math.sqrt(dot(v,v))||1;return[v[0]/l,v[1]/l,v[2]/l];};

interface GeoDef{verts:V3[];faces:number[][];nums:number[]}
const GD:Record<number,GeoDef>={
  4:{verts:unit([[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]]),
     faces:[[0,1,2],[0,2,3],[0,3,1],[1,3,2]],nums:[1,2,3,4]},
  6:{verts:[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
     faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]],nums:[1,6,2,5,3,4]},
  8:{verts:[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],
     faces:[[0,2,4],[2,1,4],[1,3,4],[3,0,4],[0,5,2],[2,5,1],[1,5,3],[3,5,0]],nums:[1,2,3,4,5,6,7,8]},
  12:{verts:unit([[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],
      [0,-1/PHI,-PHI],[0,1/PHI,-PHI],[0,-1/PHI,PHI],[0,1/PHI,PHI],
      [-1/PHI,-PHI,0],[1/PHI,-PHI,0],[1/PHI,PHI,0],[-1/PHI,PHI,0],
      [-PHI,0,-1/PHI],[-PHI,0,1/PHI],[PHI,0,-1/PHI],[PHI,0,1/PHI]]),
     faces:[[0,8,13,12,16],[1,18,13,8,9],[2,9,8,0,3],[3,0,16,17,15],[4,17,16,12,10],
            [5,19,18,1,6],[6,1,2,14,19],[7,11,14,2,3],[7,15,17,4,11],[5,10,12,13,18],
            [4,10,5,6,7],[11,4,19,14,15]],nums:[1,2,3,4,5,6,7,8,9,10,11,12]},
  20:{verts:unit([[0,1,PHI],[0,-1,PHI],[0,1,-PHI],[0,-1,-PHI],[1,PHI,0],[-1,PHI,0],
      [1,-PHI,0],[-1,-PHI,0],[PHI,0,1],[PHI,0,-1],[-PHI,0,1],[-PHI,0,-1]]),
     faces:[[0,1,8],[0,8,4],[0,4,5],[0,5,10],[0,10,1],[3,2,11],[3,11,7],[3,7,6],[3,6,9],[3,9,2],
            [1,6,8],[8,6,9],[8,9,4],[4,9,2],[4,2,5],[5,2,11],[5,11,10],[10,11,7],[10,7,1],[1,7,6]],
     nums:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]},
};
const gd=(s:number)=>GD[s]??GD[20];

// Build THREE geometry with one material group per face
function buildGeo(def:GeoDef, s:number):THREE.BufferGeometry {
  const pos:number[]=[],nor:number[]=[],uv:number[]=[];
  const g=new THREE.BufferGeometry();
  let off=0;
  def.faces.forEach((face,fi)=>{
    const start=off; let tc=0;
    for(let i=1;i<face.length-1;i++){
      const a=def.verts[face[0]],b=def.verts[face[i]],c=def.verts[face[i+1]];
      const ax=a[0]*s,ay=a[1]*s,az=a[2]*s,bx=b[0]*s,by=b[1]*s,bz=b[2]*s,cx=c[0]*s,cy=c[1]*s,cz=c[2]*s;
      const ex=bx-ax,ey=by-ay,ez=bz-az,fx=cx-ax,fy=cy-ay,fz=cz-az;
      const nx=ey*fz-ez*fy,ny=ez*fx-ex*fz,nz=ex*fy-ey*fx;
      const nl=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
      pos.push(ax,ay,az,bx,by,bz,cx,cy,cz);
      nor.push(nx/nl,ny/nl,nz/nl,nx/nl,ny/nl,nz/nl,nx/nl,ny/nl,nz/nl);
      uv.push(0.5,1,0,0,1,0); tc++;
    }
    g.addGroup(start,tc*3,fi); off+=tc*3;
  });
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  return g;
}

// Face texture — bright gradient background, large white number
function makeTex(num:number, p:{body:number;hi:number;edge:number}):THREE.CanvasTexture {
  const cv=document.createElement('canvas'); cv.width=256; cv.height=256;
  const ctx=cv.getContext('2d')!;
  // Bright face background
  const hi_r=(p.hi>>16)&255, hi_g=(p.hi>>8)&255, hi_b=p.hi&255;
  const bd_r=(p.body>>16)&255, bd_g=(p.body>>8)&255, bd_b=p.body&255;
  const gr=ctx.createRadialGradient(128,100,8,128,128,140);
  gr.addColorStop(0,`rgb(${Math.min(255,hi_r+50)},${Math.min(255,hi_g+50)},${Math.min(255,hi_b+50)})`);
  gr.addColorStop(0.6,`rgb(${hi_r},${hi_g},${hi_b})`);
  gr.addColorStop(1,`rgb(${bd_r},${bd_g},${bd_b})`);
  ctx.fillStyle=gr; ctx.fillRect(0,0,256,256);
  // Border
  const e_r=(p.edge>>16)&255,e_g=(p.edge>>8)&255,e_b=p.edge&255;
  ctx.strokeStyle=`rgba(${e_r},${e_g},${e_b},0.9)`; ctx.lineWidth=10;
  ctx.strokeRect(8,8,240,240);
  // Number
  const fs=num>=100?78:num>=10?96:116;
  ctx.font=`900 ${fs}px system-ui`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle='#ffffff';
  ctx.shadowColor='rgba(0,0,0,0.5)'; ctx.shadowBlur=8;
  ctx.fillText(String(num),128,136);
  return new THREE.CanvasTexture(cv);
}

function buildMats(def:GeoDef, sides:number):THREE.MeshPhongMaterial[] {
  const p=pal(sides);
  return def.faces.map((_,fi)=>new THREE.MeshPhongMaterial({
    map:makeTex(def.nums[fi],p),
    color:0xffffff,           // white = no tinting, texture at full brightness
    emissive:new THREE.Color(p.hi).multiplyScalar(0.15),
    specular:new THREE.Color(p.edge),
    shininess:70,
  }));
}

// Snap mesh to show correct face toward camera (0,11,5 → origin)
function snapFaceUp(mesh:THREE.Mesh, def:GeoDef, targetNum:number) {
  const fi=def.nums.indexOf(targetNum); if(fi<0)return;
  const face=def.faces[fi];
  const a=def.verts[face[0]],b=def.verts[face[1]],c=def.verts[face[2]];
  const n1=norm(cross(sub(b,a),sub(c,a)));
  // Use centroid to determine if normal is outward
  const fc:V3=[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3,(a[2]+b[2]+c[2])/3];
  const faceN:V3=dot(n1,fc)>=0?n1:[-n1[0],-n1[1],-n1[2]];
  // Aim at camera direction (normalized)
  const camDir:V3=norm([0,11,5]);
  const cosA=Math.min(1,Math.max(-1,dot(faceN,camDir)));
  const angle=Math.acos(cosA); if(Math.abs(angle)<0.001)return;
  let axis:V3;
  if(Math.abs(angle-Math.PI)<0.001) axis=[1,0,0];
  else axis=norm(cross(faceN,camDir));
  const q=new THREE.Quaternion();
  q.setFromAxisAngle(new THREE.Vector3(axis[0],axis[1],axis[2]),angle);
  mesh.quaternion.copy(q); // SET — replace physics rotation
}

interface PhysDie {
  mesh:THREE.Mesh; def:GeoDef; sides:number; val:number;
  x:number; y:number; z:number;
  vx:number; vy:number; vz:number;
  rx:number; ry:number; rz:number;
  arx:number; ary:number; arz:number;
  done:boolean; delay:number;
}

export default function DiceRoller3D({event,onDismiss}:Props) {
  const mountRef=useRef<HTMLDivElement>(null);
  const dismissRef=useRef(onDismiss);
  dismissRef.current=onDismiss;

  useEffect(()=>{
    const el=mountRef.current; if(!el)return;
    const W=window.innerWidth, H=window.innerHeight;

    // ── Three.js setup ────────────────────────────────────────────────
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
    renderer.setSize(W,H);
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.domElement.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    el.appendChild(renderer.domElement);

    const scene=new THREE.Scene();

    // Overhead camera — close enough that die fills good portion of screen
    const camera=new THREE.PerspectiveCamera(60, W/H, 0.1, 200);
    camera.position.set(0, 7, 3);
    camera.lookAt(0, 0, 0);

    // Bright lights
    scene.add(new THREE.AmbientLight(0xffffff, 1.8));
    const sun=new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.set(3,12,5); sun.castShadow=true;
    sun.shadow.mapSize.set(1024,1024);
    sun.shadow.camera.left=-8; sun.shadow.camera.right=8;
    sun.shadow.camera.top=8; sun.shadow.camera.bottom=-8;
    sun.shadow.camera.far=40; sun.shadow.bias=-0.001;
    scene.add(sun);
    const fill=new THREE.DirectionalLight(0x8899ff,0.5);
    fill.position.set(-4,-2,2); scene.add(fill);

    // Invisible floor for shadows
    const shadowFloor=new THREE.Mesh(
      new THREE.PlaneGeometry(40,40),
      new THREE.ShadowMaterial({opacity:0.3})
    );
    shadowFloor.rotation.x=-Math.PI/2; shadowFloor.receiveShadow=true;
    scene.add(shadowFloor);

    // ── Physics constants ─────────────────────────────────────────────
    // World units: 1 unit ≈ 75px on screen at this camera distance
    const FLOOR=0, GRAV=22, BOUNCE=0.5, WALL_B=0.55, ANG_D=0.80, ROLL_F=0.96;
    // Visible table area at floor: roughly ±5 wide, ±3 deep
    const BX=3.0, BZ=2.2;

    const dList=event.allDice?.length?event.allDice:[{die:event.dieType,value:event.result}];
    const n=dList.length;
    const S=Math.max(1.0, 1.6-n*0.08); // die scale in world units

    const dice:PhysDie[]=dList.map((d,i)=>{
      const def=gd(d.die);
      const geo=buildGeo(def,S);
      const mats=buildMats(def,d.die);
      const mesh=new THREE.Mesh(geo,mats);
      mesh.castShadow=true; mesh.receiveShadow=true;
      scene.add(mesh);

      const spread=Math.min(BX*0.35, n*0.35);
      return{
        mesh,def,sides:d.die,val:d.value,
        // Start near center, drop straight down
        x:(Math.random()-.5)*spread,
        y: 3.5+Math.random()*1.5,
        z:(Math.random()-.5)*spread*0.5,
        // Gentle throw — stays visible
        vx:(Math.random()-.5)*2.5,
        vy:-(1+Math.random()*1.5),
        vz:(Math.random()-.5)*1.5,
        rx:Math.random()*Math.PI*2, ry:Math.random()*Math.PI*2, rz:Math.random()*Math.PI*2,
        arx:(Math.random()-.5)*16, ary:(Math.random()-.5)*16, arz:(Math.random()-.5)*12,
        done:false, delay:i*0.1,
      };
    });

    function update(dt:number){
      const r=S*0.85;
      dice.forEach(d=>{
        if(d.delay>0){d.delay-=dt;return;}
        if(d.done)return;
        d.vy-=GRAV*dt;
        d.x+=d.vx*dt; d.y+=d.vy*dt; d.z+=d.vz*dt;
        d.rx+=d.arx*dt; d.ry+=d.ary*dt; d.rz+=d.arz*dt;

        // Floor bounce
        if(d.y-r<FLOOR){
          d.y=FLOOR+r; d.vy=Math.abs(d.vy)*BOUNCE;
          d.vx*=0.88; d.vz*=0.88;
          d.arx*=ANG_D; d.ary*=ANG_D; d.arz*=ANG_D;
          if(d.vy<0.15)d.vy=0;
        }
        // Walls
        if(d.x<-BX){d.x=-BX;d.vx=Math.abs(d.vx)*WALL_B;d.arx*=0.8;}
        if(d.x> BX){d.x= BX;d.vx=-Math.abs(d.vx)*WALL_B;d.arx*=0.8;}
        if(d.z<-BZ){d.z=-BZ;d.vz=Math.abs(d.vz)*WALL_B;d.arz*=0.8;}
        if(d.z> BZ){d.z= BZ;d.vz=-Math.abs(d.vz)*WALL_B;d.arz*=0.8;}

        // Floor friction
        if(Math.abs(d.y-r-FLOOR)<0.05){
          d.vx*=ROLL_F; d.vz*=ROLL_F;
          d.arx*=ROLL_F; d.ary*=ROLL_F; d.arz*=ROLL_F;
        }

        d.mesh.position.set(d.x,d.y,d.z);
        d.mesh.rotation.set(d.rx,d.ry,d.rz);

        const spd=Math.sqrt(d.vx**2+d.vy**2+d.vz**2);
        const ang=Math.sqrt(d.arx**2+d.ary**2+d.arz**2);
        if(spd<0.12&&ang<0.4&&Math.abs(d.y-r-FLOOR)<0.08){
          d.done=true; d.y=FLOOR+r;
          d.vx=d.vy=d.vz=d.arx=d.ary=d.arz=0;
          d.mesh.position.set(d.x,d.y,d.z);
          snapFaceUp(d.mesh,d.def,d.val);
        }
      });
    }

    let last=performance.now(),allDone=false,doneT=0,dismissed=false,raf=0,resultShown=false;

    function showResult(){
      if(resultShown||!el)return; resultShown=true;
      const tot=event.total??(event.modifier!==undefined?event.result+event.modifier:event.result);
      const multi=dList.length>1;
      const hasMod=!multi&&event.modifier!==undefined&&event.modifier!==0;
      const lbl=event.label||(event.dieType?`d${event.dieType}`:'Roll');
      const div=document.createElement('div');
      div.style.cssText='position:absolute;top:7%;left:50%;transform:translateX(-50%) scale(0.5);'+
        'text-align:center;pointer-events:none;white-space:nowrap;'+
        'animation:rr 0.6s cubic-bezier(0.34,1.56,0.64,1) both;';
      div.innerHTML=
        `<div style="font:700 13px system-ui;color:rgba(255,255,255,0.5);letter-spacing:.2em;text-transform:uppercase;margin-bottom:4px">${lbl}</div>`+
        `<div style="font:900 ${multi?72:96}px system-ui;color:#fff;line-height:1;text-shadow:0 0 50px rgba(255,255,255,0.7)">${tot}</div>`+
        (hasMod?`<div style="font:500 17px system-ui;color:rgba(255,255,255,0.5);margin-top:4px">${event.result} ${(event.modifier??0)>=0?'+':''}${event.modifier}</div>`:'');
      el.appendChild(div);
    }

    function frame(ts:number){
      if(dismissed)return;
      raf=requestAnimationFrame(frame);
      const dt=Math.min((ts-last)/1000,0.05); last=ts;
      update(dt);
      if(!allDone&&dice.filter(d=>d.delay<=0).every(d=>d.done)){
        allDone=true; doneT=0; showResult();
      }
      if(allDone){ doneT+=dt; if(doneT>4.5){dismissed=true;dismissRef.current();cancelAnimationFrame(raf);return;} }
      renderer.render(scene,camera);
    }
    raf=requestAnimationFrame(frame);
    return()=>{dismissed=true;cancelAnimationFrame(raf);renderer.dispose();
      if(el.contains(renderer.domElement))el.removeChild(renderer.domElement);scene.clear();};
  },[]);

  return createPortal(
    <div ref={mountRef} onClick={onDismiss} style={{
      position:'fixed',inset:0,zIndex:9999,
      background:'rgba(2,5,14,0.90)',backdropFilter:'blur(12px)',
      cursor:'pointer',overflow:'hidden',
    }}>
      <div style={{position:'absolute',bottom:14,left:0,right:0,textAlign:'center',
        pointerEvents:'none',fontFamily:'var(--ff-body)',fontSize:11,color:'rgba(255,255,255,0.2)'}}>
        Click anywhere to dismiss
      </div>
      <style>{`@keyframes rr{from{opacity:0;transform:translateX(-50%) scale(0.5)}to{opacity:1;transform:translateX(-50%) scale(1)}}`}</style>
    </div>,
    document.body
  );
}
