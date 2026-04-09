/**
 * DiceRoller3D — Clean 3D dice.
 * Solid colored faces + edge outlines for die shape.
 * Depth-tested number sprites per face (backfaces auto-hidden by die geometry).
 * All die types: d4, d6, d8, d10, d12, d20, d100.
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

const GD:Record<number,GeoDef>={
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
  10:{
    verts:(()=>{
      const v:V3[]=[];
      for(let i=0;i<5;i++){const a=i*Math.PI*2/5;v.push([Math.cos(a),0.5,Math.sin(a)]);}
      for(let i=0;i<5;i++){const a=i*Math.PI*2/5+Math.PI/5;v.push([Math.cos(a),-0.5,Math.sin(a)]);}
      v.push([0,1.3,0],[0,-1.3,0]);
      return unit(v);
    })(),
    faces:(()=>{
      const f:number[][]=[];
      for(let i=0;i<5;i++){
        f.push([10,(i+1)%5,i]);         // upper faces
        f.push([11,i+5,((i+1)%5)+5]);   // lower faces
      }
      return f;
    })(),
    nums:[1,6,2,7,3,8,4,9,5,10]
  },
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
GD[100]=GD[10]; // d100 uses d10 shape
const gd=(s:number)=>GD[s]??GD[20];

// Die color themes
const THEME:Record<number,{face:number;edge:number}> = {
  4:  {face:0x6d28d9, edge:0xddd6fe},
  6:  {face:0xdc2626, edge:0xfecaca},
  8:  {face:0x16a34a, edge:0xbbf7d0},
  10: {face:0x0284c7, edge:0xe0f2fe},
  12: {face:0xc026d3, edge:0xfae8ff},
  20: {face:0xca8a04, edge:0xfef3c7},
  100:{face:0xc2410c, edge:0xffedd5},
};
const theme=(s:number)=>THEME[s]??THEME[20];

// Build solid geometry for die (one group per face, for per-face color)
function buildSolidGeo(def:GeoDef, s:number):THREE.BufferGeometry {
  const pos:number[]=[],nor:number[]=[];
  const g=new THREE.BufferGeometry();
  let off=0;
  def.faces.forEach((face,fi)=>{
    const start=off; let tc=0;
    for(let i=1;i<face.length-1;i++){
      const a=def.verts[face[0]],b=def.verts[face[i]],c=def.verts[face[i+1]];
      const ax=a[0]*s,ay=a[1]*s,az=a[2]*s;
      const bx=b[0]*s,by=b[1]*s,bz=b[2]*s;
      const cx=c[0]*s,cy=c[1]*s,cz=c[2]*s;
      const ex=bx-ax,ey=by-ay,ez=bz-az,fx=cx-ax,fy=cy-ay,fz=cz-az;
      const nx=ey*fz-ez*fy,ny=ez*fx-ex*fz,nz=ex*fy-ey*fx;
      const nl=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
      pos.push(ax,ay,az,bx,by,bz,cx,cy,cz);
      nor.push(nx/nl,ny/nl,nz/nl,nx/nl,ny/nl,nz/nl,nx/nl,ny/nl,nz/nl);
      tc++;
    }
    g.addGroup(start, tc*3, fi);
    off+=tc*3;
  });
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  return g;
}

// Per-face solid color materials
function buildFaceMats(def:GeoDef, sides:number):THREE.MeshPhongMaterial[] {
  const t=theme(sides);
  const faceCol=new THREE.Color(t.face);
  return def.faces.map(()=>new THREE.MeshPhongMaterial({
    color: faceCol,
    emissive: faceCol.clone().multiplyScalar(0.12),
    specular: new THREE.Color(t.edge),
    shininess: 60,
    side: THREE.DoubleSide,  // prevents missing faces
  }));
}

// Number texture for sprite
const texCache = new Map<string,THREE.CanvasTexture>();
function numTex(n:number, edgeCol:number):THREE.CanvasTexture {
  const key=`${n}-${edgeCol}`;
  if(texCache.has(key)) return texCache.get(key)!;
  const cv=document.createElement('canvas'); cv.width=128; cv.height=128;
  const ctx=cv.getContext('2d')!;
  const r=(edgeCol>>16)&255,g=(edgeCol>>8)&255,b=edgeCol&255;
  ctx.clearRect(0,0,128,128);
  ctx.font=`900 ${n>=100?52:n>=10?64:76}px system-ui`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  // White outline for contrast
  ctx.strokeStyle='rgba(0,0,0,0.8)'; ctx.lineWidth=6;
  ctx.strokeText(String(n),64,68);
  ctx.fillStyle=`rgb(${r},${g},${b})`;
  ctx.fillText(String(n),64,68);
  const t=new THREE.CanvasTexture(cv);
  texCache.set(key,t);
  return t;
}

// Face centroid + outward normal for placing sprite
function faceInfo(def:GeoDef, fi:number, s:number):{pos:V3; normal:V3} {
  const face=def.faces[fi];
  const vs=face.map(vi=>def.verts[vi]);
  const cx=vs.reduce((a,v)=>a+v[0],0)/vs.length*s;
  const cy=vs.reduce((a,v)=>a+v[1],0)/vs.length*s;
  const cz=vs.reduce((a,v)=>a+v[2],0)/vs.length*s;
  const a=def.verts[face[0]],b=def.verts[face[1]],c=def.verts[face[2]];
  const n1=norm(cross(sub(b,a),sub(c,a)));
  const fc:V3=[cx/s,cy/s,cz/s];
  const outward:V3=dot(n1,fc)>=0?n1:[-n1[0],-n1[1],-n1[2]];
  return {pos:[cx,cy,cz], normal:outward};
}

// Snap die mesh so face with targetNum points toward camera direction
function snapFaceUp(mesh:THREE.Group, def:GeoDef, targetNum:number, s:number) {
  const fi=def.nums.indexOf(targetNum); if(fi<0)return;
  const {normal:faceN}=faceInfo(def,fi,s);
  // Orient toward straight up (camera is overhead)
  const up:V3=[0,1,0];
  const cosA=Math.min(1,Math.max(-1,dot(faceN,up)));
  const angle=Math.acos(cosA); if(Math.abs(angle)<0.001)return;
  let axis:V3;
  if(Math.abs(angle-Math.PI)<0.001) axis=[1,0,0];
  else axis=norm(cross(faceN,up));
  const q=new THREE.Quaternion();
  q.setFromAxisAngle(new THREE.Vector3(axis[0],axis[1],axis[2]),angle);
  mesh.quaternion.copy(q);
}

interface PhysDie {
  group:THREE.Group; def:GeoDef; sides:number; val:number;
  x:number;y:number;z:number;vx:number;vy:number;vz:number;
  rx:number;ry:number;rz:number;arx:number;ary:number;arz:number;
  done:boolean; delay:number; scale:number;
}

export default function DiceRoller3D({event,onDismiss}:Props) {
  const mountRef=useRef<HTMLDivElement>(null);
  const dismissRef=useRef(onDismiss);
  dismissRef.current=onDismiss;

  useEffect(()=>{
    const el=mountRef.current; if(!el)return;
    const W=window.innerWidth, H=window.innerHeight;

    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
    renderer.setSize(W,H);
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.domElement.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    el.appendChild(renderer.domElement);

    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(60,W/H,0.1,200);
    camera.position.set(0,7,3);
    camera.lookAt(0,0,0);

    scene.add(new THREE.AmbientLight(0xffffff,1.4));
    const sun=new THREE.DirectionalLight(0xffffff,2.2);
    sun.position.set(3,10,4); sun.castShadow=true;
    sun.shadow.camera.left=-8; sun.shadow.camera.right=8;
    sun.shadow.camera.top=8; sun.shadow.camera.bottom=-8;
    sun.shadow.camera.far=30; sun.shadow.bias=-0.001;
    scene.add(sun);
    scene.add(Object.assign(new THREE.DirectionalLight(0x8899ff,0.4),{position:new THREE.Vector3(-3,-2,2)}));

    const shadowFloor=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.ShadowMaterial({opacity:0.25}));
    shadowFloor.rotation.x=-Math.PI/2; shadowFloor.receiveShadow=true;
    scene.add(shadowFloor);

    const FLOOR=0,GRAV=22,BOUNCE=0.48,WALL_B=0.5,BX=2.8,BZ=2.0;
    const dList=event.allDice?.length?event.allDice:[{die:event.dieType,value:event.result}];
    const n=dList.length;
    const S=Math.max(0.9,1.5-n*0.07);

    const dice:PhysDie[]=dList.map((d,i)=>{
      const def=gd(d.die);
      const t=theme(d.die);

      // Main die mesh
      const geo=buildSolidGeo(def,S);
      const mats=buildFaceMats(def,d.die);
      const mesh=new THREE.Mesh(geo,mats);
      mesh.castShadow=true; mesh.receiveShadow=true;

      // Edge outlines — makes die look sharp and defined
      const edgesGeo=new THREE.EdgesGeometry(buildSolidGeo(def,S*1.003));
      const edges=new THREE.LineSegments(edgesGeo,new THREE.LineBasicMaterial({color:t.edge,linewidth:1}));

      const group=new THREE.Group();
      group.add(mesh);
      group.add(edges);

      // Number sprites — one per face, depth-tested
      def.faces.forEach((_,fi)=>{
        const {pos,normal}=faceInfo(def,fi,S);
        const offset=0.08*S; // push sprite slightly outside face surface
        const sp=new THREE.Sprite(new THREE.SpriteMaterial({
          map:numTex(def.nums[fi],t.edge),
          transparent:true,
          depthTest:true,     // hidden when face points away from camera
          depthWrite:false,
        }));
        sp.position.set(
          pos[0]+normal[0]*offset,
          pos[1]+normal[1]*offset,
          pos[2]+normal[2]*offset
        );
        const sz=S*0.55;
        sp.scale.set(sz,sz,1);
        group.add(sp);
      });

      scene.add(group);

      const spread=Math.min(BX*0.4,n*0.35);
      return{
        group,def,sides:d.die,val:d.value,scale:S,
        x:(Math.random()-.5)*spread,y:3.5+Math.random()*1.5,z:(Math.random()-.5)*spread*0.5,
        vx:(Math.random()-.5)*2,vy:-(1+Math.random()*1.5),vz:(Math.random()-.5)*1.5,
        rx:Math.random()*Math.PI*2,ry:Math.random()*Math.PI*2,rz:Math.random()*Math.PI*2,
        arx:(Math.random()-.5)*16,ary:(Math.random()-.5)*16,arz:(Math.random()-.5)*12,
        done:false,delay:i*0.1,
      };
    });

    function update(dt:number){
      const r=S*0.82;
      dice.forEach(d=>{
        if(d.delay>0){d.delay-=dt;return;}
        if(d.done)return;
        d.vy-=GRAV*dt;
        d.x+=d.vx*dt;d.y+=d.vy*dt;d.z+=d.vz*dt;
        d.rx+=d.arx*dt;d.ry+=d.ary*dt;d.rz+=d.arz*dt;
        if(d.y-r<FLOOR){
          d.y=FLOOR+r;d.vy=Math.abs(d.vy)*BOUNCE;
          d.vx*=0.86;d.vz*=0.86;
          d.arx*=0.72;d.ary*=0.72;d.arz*=0.72;
          if(d.vy<0.15)d.vy=0;
        }
        if(d.x<-BX){d.x=-BX;d.vx=Math.abs(d.vx)*WALL_B;}
        if(d.x> BX){d.x= BX;d.vx=-Math.abs(d.vx)*WALL_B;}
        if(d.z<-BZ){d.z=-BZ;d.vz=Math.abs(d.vz)*WALL_B;}
        if(d.z> BZ){d.z= BZ;d.vz=-Math.abs(d.vz)*WALL_B;}
        if(Math.abs(d.y-r-FLOOR)<0.05){d.vx*=0.96;d.vz*=0.96;d.arx*=0.95;d.ary*=0.95;d.arz*=0.95;}
        d.group.position.set(d.x,d.y,d.z);
        d.group.rotation.set(d.rx,d.ry,d.rz);
        const spd=Math.sqrt(d.vx**2+d.vy**2+d.vz**2);
        const ang=Math.sqrt(d.arx**2+d.ary**2+d.arz**2);
        if(spd<0.1&&ang<0.35&&Math.abs(d.y-r-FLOOR)<0.06){
          d.done=true;d.y=FLOOR+r;d.vx=d.vy=d.vz=d.arx=d.ary=d.arz=0;
          d.group.position.set(d.x,d.y,d.z);
          snapFaceUp(d.group,d.def,d.val,d.scale);
        }
      });
    }

    let last=performance.now(),allDone=false,doneT=0,dismissed=false,raf=0,resultShown=false;
    function showResult(){
      if(resultShown||!el)return;resultShown=true;
      const tot=event.total??(event.modifier!==undefined?event.result+event.modifier:event.result);
      const multi=dList.length>1;
      const hasMod=!multi&&event.modifier!==undefined&&event.modifier!==0;
      const lbl=event.label||(event.dieType?`d${event.dieType}`:'Roll');
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
      if(!allDone&&dice.filter(d=>d.delay<=0).every(d=>d.done)){allDone=true;doneT=0;showResult();}
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
