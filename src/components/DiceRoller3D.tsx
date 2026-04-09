/**
 * DiceRoller3D — Three.js rendering + custom physics (no cannon-es).
 * Overhead camera. Dice bounce off floor + walls. No external physics dependency.
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

const PAL: Record<number, {body:number;face:number;num:number;edge:number}> = {
  4:  {body:0x4c1d95,face:0x7c3aed,num:0xe9d5ff,edge:0xc084fc},
  6:  {body:0x7c2d12,face:0xea580c,num:0xfed7aa,edge:0xfdba74},
  8:  {body:0x14532d,face:0x16a34a,num:0xbbf7d0,edge:0x86efac},
  10: {body:0x082f49,face:0x0284c7,num:0xe0f2fe,edge:0x7dd3fc},
  12: {body:0x581c87,face:0xc026d3,num:0xfae8ff,edge:0xf0abfc},
  20: {body:0x3d2900,face:0xca8a04,num:0xfef9c3,edge:0xfde68a},
 100: {body:0x7c2d12,face:0xc2410c,num:0xffedd5,edge:0xfed7aa},
};
const p = (s:number) => PAL[s]??PAL[20];

const PHI=(1+Math.sqrt(5))/2;
type V3=[number,number,number];
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

// Build geometry with material groups (one per face)
function buildGeo(def:GeoDef,s=1.0):THREE.BufferGeometry {
  const pos:number[]=[],nor:number[]=[],uv:number[]=[];
  const g=new THREE.BufferGeometry();
  let off=0;
  def.faces.forEach((face,fi)=>{
    const start=off;let tc=0;
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
    g.addGroup(start*3,tc*3,fi); off+=tc*3;
  });
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  return g;
}

function makeTex(n:number,numCol:number,bgCol:number,edgeCol:number):THREE.CanvasTexture{
  const cv=document.createElement('canvas');cv.width=256;cv.height=256;
  const ctx=cv.getContext('2d')!;
  const hex2rgb=(h:number)=>[(h>>16)&255,(h>>8)&255,h&255];
  const [br,bg,bb]=hex2rgb(bgCol),[er,eg,eb]=hex2rgb(edgeCol),[nr,ng,nb]=hex2rgb(numCol);
  ctx.fillStyle=`rgb(${br},${bg},${bb})`;ctx.fillRect(0,0,256,256);
  ctx.strokeStyle=`rgb(${er},${eg},${eb})`;ctx.lineWidth=10;ctx.strokeRect(8,8,240,240);
  ctx.font=`900 ${n>=100?72:n>=10?90:110}px system-ui`;
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle=`rgb(${nr},${ng},${nb})`;
  ctx.shadowColor='rgba(0,0,0,0.5)';ctx.shadowBlur=8;
  ctx.fillText(String(n),128,130);
  return new THREE.CanvasTexture(cv);
}

function buildMats(def:GeoDef,sides:number):THREE.MeshStandardMaterial[]{
  const pal=p(sides);
  return def.faces.map((_,fi)=>new THREE.MeshStandardMaterial({
    map:makeTex(def.nums[fi],pal.num,pal.face,pal.edge),
    color:pal.body,metalness:0.6,roughness:0.35,
  }));
}

// Orient die so face with targetNum points to +Y (up toward camera)
function orientToTop(mesh:THREE.Mesh,def:GeoDef,targetNum:number){
  const fi=def.nums.indexOf(targetNum); if(fi<0)return;
  const face=def.faces[fi];
  const a=def.verts[face[0]],b=def.verts[face[1]],c=def.verts[face[2]];
  const faceN=norm(cross(sub(b,a),sub(c,a)));
  const up:V3=[0,1,0];
  const cosA=Math.min(1,Math.max(-1,dot(faceN,up)));
  const angle=Math.acos(cosA);
  if(Math.abs(angle)<0.01)return;
  let axis:V3;
  if(Math.abs(angle-Math.PI)<0.01) axis=[1,0,0];
  else axis=norm(cross(faceN,up));
  mesh.quaternion.setFromAxisAngle(new THREE.Vector3(axis[0],axis[1],axis[2]),angle);
}

// Simple physics state per die
interface PhysDie{
  mesh:THREE.Mesh;def:GeoDef;sides:number;val:number;
  px:number;py:number;pz:number;  // position
  vx:number;vy:number;vz:number;  // velocity
  rx:number;ry:number;rz:number;  // rotation angles
  arx:number;ary:number;arz:number; // angular velocity
  done:boolean; delay:number;
}

export default function DiceRoller3D({event,onDismiss}:Props){
  const mountRef=useRef<HTMLDivElement>(null);
  const dismissRef=useRef(onDismiss);
  dismissRef.current=onDismiss;

  useEffect(()=>{
    const el=mountRef.current; if(!el)return;
    const W=window.innerWidth,H=window.innerHeight;

    // Three.js
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
    renderer.setSize(W,H);
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.1;
    renderer.domElement.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    el.appendChild(renderer.domElement);

    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(50,W/H,0.1,200);
    camera.position.set(0,22,8);
    camera.lookAt(0,0,0);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff,0.6));
    const sun=new THREE.DirectionalLight(0xfffaf0,2.4);
    sun.position.set(4,20,6); sun.castShadow=true;
    sun.shadow.mapSize.set(1024,1024);
    sun.shadow.camera.left=-22;sun.shadow.camera.right=22;
    sun.shadow.camera.top=22;sun.shadow.camera.bottom=-22;
    sun.shadow.camera.far=60; sun.shadow.bias=-0.001;
    scene.add(sun);
    const fill=new THREE.DirectionalLight(0x4466ff,0.35);
    fill.position.set(-5,-2,2); scene.add(fill);

    // Shadow-only floor
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(60,60),new THREE.ShadowMaterial({opacity:0.35}));
    floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; scene.add(floor);

    // Physics constants
    const GRAVITY=28, BOUNCE=0.52, WALL_BOUNCE=0.6, FRICTION=0.88;
    const FLOOR_Y=0, HALF_W=14*(W/H), HALF_Z=10;
    const diceList=event.allDice?.length?event.allDice:[{die:event.dieType,value:event.result}];
    const n=diceList.length;
    const S=Math.max(0.8,1.2-n*0.05);

    const dice:PhysDie[]=diceList.map((d,i)=>{
      const def=gd(d.die);
      const geo=buildGeo(def,S);
      const mats=buildMats(def,d.die);
      const mesh=new THREE.Mesh(geo,mats);
      mesh.castShadow=true; mesh.receiveShadow=true;
      scene.add(mesh);
      const spread=Math.min(HALF_W*0.5,n*1.6);
      return{
        mesh,def,sides:d.die,val:d.value,
        px:(Math.random()-.5)*spread, py:7+Math.random()*4, pz:(Math.random()-.5)*(HALF_Z*0.5),
        vx:(Math.random()-.5)*12, vy:-(2+Math.random()*3), vz:(Math.random()-.5)*8,
        rx:Math.random()*Math.PI*2,ry:Math.random()*Math.PI*2,rz:Math.random()*Math.PI*2,
        arx:(Math.random()-.5)*22,ary:(Math.random()-.5)*22,arz:(Math.random()-.5)*18,
        done:false, delay:i*0.12,
      };
    });

    let last=performance.now(),allDone=false,doneT=0,dismissed=false,raf=0,resultShown=false;

    function showResult(){
      if(resultShown)return; resultShown=true;
      const tot=event.total??(event.modifier!==undefined?event.result+event.modifier:event.result);
      const multi=diceList.length>1;
      const hasMod=!multi&&event.modifier!==undefined&&event.modifier!==0;
      const lbl=event.label||(event.dieType?`d${event.dieType}`:'Roll');
      const div=document.createElement('div');
      div.style.cssText=`position:absolute;top:6%;left:50%;transform:translateX(-50%) scale(0.5);
        text-align:center;pointer-events:none;animation:rr 0.6s cubic-bezier(0.34,1.56,0.64,1) both;white-space:nowrap;`;
      div.innerHTML=`
        <div style="font:700 13px system-ui;color:rgba(255,255,255,0.45);letter-spacing:.25em;text-transform:uppercase;margin-bottom:4px">${lbl}</div>
        <div style="font:900 ${multi?72:96}px system-ui;color:#fff;line-height:1;
          text-shadow:0 0 60px rgba(255,255,255,0.7),0 0 20px rgba(255,255,255,0.4)">${tot}</div>
        ${hasMod?`<div style="font:500 17px system-ui;color:rgba(255,255,255,0.45);margin-top:5px">${event.result} ${(event.modifier??0)>=0?'+':''}${event.modifier}</div>`:''}
      `;
      el.appendChild(div);
    }

    function update(dt:number){
      const R=S*0.85; // die collision radius
      dice.forEach(d=>{
        if(d.delay>0){d.delay-=dt;return;}
        if(d.done)return;
        // Gravity
        d.vy-=GRAVITY*dt;
        d.px+=d.vx*dt; d.py+=d.vy*dt; d.pz+=d.vz*dt;
        d.rx+=d.arx*dt; d.ry+=d.ary*dt; d.rz+=d.arz*dt;

        // Floor
        if(d.py-R<FLOOR_Y){
          d.py=FLOOR_Y+R;
          d.vy=Math.abs(d.vy)*BOUNCE;
          d.vx*=FRICTION; d.vz*=FRICTION;
          d.arx*=0.75; d.ary*=0.75; d.arz*=0.75;
          if(d.vy<0.5)d.vy=0;
        }
        // Walls X
        if(d.px-R<-HALF_W){d.px=-HALF_W+R;d.vx=Math.abs(d.vx)*WALL_BOUNCE;d.arx*=0.8;}
        if(d.px+R>HALF_W){d.px=HALF_W-R;d.vx=-Math.abs(d.vx)*WALL_BOUNCE;d.arx*=0.8;}
        // Walls Z
        if(d.pz-R<-HALF_Z){d.pz=-HALF_Z+R;d.vz=Math.abs(d.vz)*WALL_BOUNCE;d.arz*=0.8;}
        if(d.pz+R>HALF_Z){d.pz=HALF_Z-R;d.vz=-Math.abs(d.vz)*WALL_BOUNCE;d.arz*=0.8;}

        // Rolling friction on floor
        if(Math.abs(d.py-R-FLOOR_Y)<0.1){
          d.vx*=0.97; d.vz*=0.97;
          d.arx*=0.97; d.ary*=0.97; d.arz*=0.97;
        }

        // Sync mesh
        d.mesh.position.set(d.px,d.py,d.pz);
        d.mesh.rotation.set(d.rx,d.ry,d.rz);

        // Check settled
        const spd=Math.sqrt(d.vx**2+d.vy**2+d.vz**2);
        const ang=Math.sqrt(d.arx**2+d.ary**2+d.arz**2);
        if(spd<0.3&&ang<0.5&&Math.abs(d.py-R-FLOOR_Y)<0.15){
          d.done=true;
          d.vx=d.vy=d.vz=d.arx=d.ary=d.arz=0;
          d.py=FLOOR_Y+R;
          d.mesh.position.y=d.py;
          // Snap to correct face-up
          orientToTop(d.mesh,d.def,d.val);
        }
      });
    }

    function frame(ts:number){
      if(dismissed)return;
      raf=requestAnimationFrame(frame);
      const dt=Math.min((ts-last)/1000,0.05); last=ts;
      update(dt);

      if(!allDone&&dice.filter(d=>d.delay<=0).every(d=>d.done)){
        allDone=true; doneT=0; showResult();
      }
      if(allDone){
        doneT+=dt;
        if(doneT>4.5){dismissed=true;dismissRef.current();cancelAnimationFrame(raf);return;}
      }
      renderer.render(scene,camera);
    }
    raf=requestAnimationFrame(frame);

    return()=>{
      dismissed=true; cancelAnimationFrame(raf);
      renderer.dispose();
      if(el.contains(renderer.domElement))el.removeChild(renderer.domElement);
      scene.clear();
    };
  },[]);

  return createPortal(
    <div ref={mountRef} onClick={onDismiss} style={{
      position:'fixed',inset:0,zIndex:9999,
      background:'rgba(2,5,14,0.90)',backdropFilter:'blur(14px)',cursor:'pointer',overflow:'hidden',
    }}>
      <div style={{
        position:'absolute',bottom:14,left:0,right:0,textAlign:'center',
        pointerEvents:'none',fontFamily:'var(--ff-body)',fontSize:11,color:'rgba(255,255,255,0.18)',
      }}>Click anywhere to dismiss</div>
      <style>{`@keyframes rr{from{opacity:0;transform:translateX(-50%) scale(0.5)}to{opacity:1;transform:translateX(-50%) scale(1)}}`}</style>
    </div>,
    document.body
  );
}
