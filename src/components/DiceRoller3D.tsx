/**
 * DiceRoller3D — Pure Canvas 2D with 3D perspective projection.
 * No Three.js. No cannon-es. Zero extra dependencies.
 * Overhead camera view. Custom physics. Flat-shaded faces with baked numbers.
 */
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface DiceRollEvent {
  result: number; dieType: number; modifier?: number; total?: number;
  label?: string; allDice?: { die: number; value: number }[]; expression?: string; flatBonus?: number;
}
interface Props { event: DiceRollEvent; onDismiss: () => void; }

// ── 3D math ──────────────────────────────────────────────────────────
type V3 = [number,number,number];
const sub  = (a:V3,b:V3):V3 => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross= (a:V3,b:V3):V3 => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot  = (a:V3,b:V3)    => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm = (v:V3):V3      => { const l=Math.sqrt(dot(v,v))||1; return [v[0]/l,v[1]/l,v[2]/l]; };
const unit = (vs:V3[]):V3[] => vs.map(v=>norm(v));

// Rotate v by Euler angles rx,ry,rz
function rot(v:V3,rx:number,ry:number,rz:number):V3 {
  let [x,y,z]=v;
  let y2=y*Math.cos(rx)-z*Math.sin(rx), z2=y*Math.sin(rx)+z*Math.cos(rx); y=y2;z=z2;
  let x2=x*Math.cos(ry)+z*Math.sin(ry); z2=-x*Math.sin(ry)+z*Math.cos(ry); x=x2;z=z2;
  x2=x*Math.cos(rz)-y*Math.sin(rz); y2=x*Math.sin(rz)+y*Math.cos(rz);
  return [x2,y2,z];
}

// Perspective project world → screen. Camera overhead at (0,H,D).
const FOV = 520;
function proj(v:V3, cx:number, cy:number, scale:number):[number,number] {
  const d = FOV/(v[2]+FOV);
  return [v[0]*d*scale+cx, v[1]*d*scale+cy];
}

// ── Die geometry ─────────────────────────────────────────────────────
const PHI=(1+Math.sqrt(5))/2;
interface GeoDef { verts:V3[]; faces:number[][]; nums:number[] }

const GEOS:Record<number,GeoDef> = {
  4:  { verts:unit([[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]]),
        faces:[[0,1,2],[0,2,3],[0,3,1],[1,3,2]], nums:[1,2,3,4] },
  6:  { verts:[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
        faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]], nums:[1,6,2,5,3,4] },
  8:  { verts:[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],
        faces:[[0,2,4],[2,1,4],[1,3,4],[3,0,4],[0,5,2],[2,5,1],[1,5,3],[3,5,0]], nums:[1,2,3,4,5,6,7,8] },
  10: { verts:(()=>{
          const v:V3[]=[];
          for(let i=0;i<5;i++){const a=i*Math.PI*2/5;v.push([Math.cos(a),0.5,Math.sin(a)]);}
          for(let i=0;i<5;i++){const a=i*Math.PI*2/5+Math.PI/5;v.push([Math.cos(a),-0.5,Math.sin(a)]);}
          v.push([0,1.2,0],[0,-1.2,0]); return unit(v);
        })(),
        faces:(()=>{const f:number[][]=[];for(let i=0;i<5;i++){f.push([10,(i+1)%5,i],[11,i+5,((i+1)%5)+5]);}return f;})(),
        nums:[1,6,2,7,3,8,4,9,5,10] },
  12: { verts:unit([[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],
          [0,-1/PHI,-PHI],[0,1/PHI,-PHI],[0,-1/PHI,PHI],[0,1/PHI,PHI],
          [-1/PHI,-PHI,0],[1/PHI,-PHI,0],[1/PHI,PHI,0],[-1/PHI,PHI,0],
          [-PHI,0,-1/PHI],[-PHI,0,1/PHI],[PHI,0,-1/PHI],[PHI,0,1/PHI]]),
        faces:[[0,8,13,12,16],[1,18,13,8,9],[2,9,8,0,3],[3,0,16,17,15],[4,17,16,12,10],
               [5,19,18,1,6],[6,1,2,14,19],[7,11,14,2,3],[7,15,17,4,11],[5,10,12,13,18],
               [4,10,5,6,7],[11,4,19,14,15]], nums:[1,2,3,4,5,6,7,8,9,10,11,12] },
  20: { verts:unit([[0,1,PHI],[0,-1,PHI],[0,1,-PHI],[0,-1,-PHI],[1,PHI,0],[-1,PHI,0],
          [1,-PHI,0],[-1,-PHI,0],[PHI,0,1],[PHI,0,-1],[-PHI,0,1],[-PHI,0,-1]]),
        faces:[[0,1,8],[0,8,4],[0,4,5],[0,5,10],[0,10,1],[3,2,11],[3,11,7],[3,7,6],[3,6,9],[3,9,2],
               [1,6,8],[8,6,9],[8,9,4],[4,9,2],[4,2,5],[5,2,11],[5,11,10],[10,11,7],[10,7,1],[1,7,6]],
        nums:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20] },
};
const geo = (s:number) => GEOS[s]??GEOS[20];

// ── Palette ──────────────────────────────────────────────────────────
interface Pal { bg:string; hi:string; edge:string; num:string }
const PALS:Record<number,Pal> = {
  4:  {bg:'#5b21b6',hi:'#8b5cf6',edge:'#ddd6fe',num:'#ffffff'},
  6:  {bg:'#b91c1c',hi:'#ef4444',edge:'#fecaca',num:'#ffffff'},
  8:  {bg:'#15803d',hi:'#22c55e',edge:'#bbf7d0',num:'#ffffff'},
  10: {bg:'#0369a1',hi:'#38bdf8',edge:'#e0f2fe',num:'#ffffff'},
  12: {bg:'#a21caf',hi:'#e879f9',edge:'#fae8ff',num:'#ffffff'},
  20: {bg:'#b45309',hi:'#fbbf24',edge:'#fef9c3',num:'#ffffff'},
 100: {bg:'#c2410c',hi:'#fb923c',edge:'#ffedd5',num:'#ffffff'},
};
const pal = (s:number) => PALS[s]??PALS[20];
const LIGHT:V3 = norm([0.5,-1,0.6]);

// ── Pre-render face texture to offscreen canvas ───────────────────────
const texCache = new Map<string,HTMLCanvasElement>();
function faceTex(num:number, p:Pal, sz:number):HTMLCanvasElement {
  const key=`${num}-${p.bg}-${sz}`;
  if(texCache.has(key)) return texCache.get(key)!;
  const cv=document.createElement('canvas'); cv.width=sz; cv.height=sz;
  const ctx=cv.getContext('2d')!;
  // Background gradient
  const gr=ctx.createRadialGradient(sz/2,sz/2.5,sz*0.05,sz/2,sz/2,sz*0.55);
  gr.addColorStop(0,p.hi); gr.addColorStop(1,p.bg);
  ctx.fillStyle=gr; ctx.fillRect(0,0,sz,sz);
  // Border
  ctx.strokeStyle=p.edge; ctx.lineWidth=sz*0.05;
  ctx.strokeRect(sz*0.06,sz*0.06,sz*0.88,sz*0.88);
  // Number
  const fs=num>=100?sz*0.38:num>=10?sz*0.44:sz*0.52;
  ctx.font=`900 ${fs}px system-ui`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=p.num;
  ctx.shadowColor='rgba(0,0,0,0.6)'; ctx.shadowBlur=sz*0.04;
  ctx.fillText(String(num),sz/2,sz*0.54);
  texCache.set(key,cv);
  return cv;
}

// ── Die instance ─────────────────────────────────────────────────────
interface Die {
  g:GeoDef; sides:number; val:number;
  x:number; y:number; z:number;
  vx:number; vy:number; vz:number;
  rx:number; ry:number; rz:number;
  arx:number; ary:number; arz:number;
  done:boolean; delay:number; scale:number;
}

// ── Component ────────────────────────────────────────────────────────
export default function DiceRoller3D({event,onDismiss}:Props) {
  const cvRef  = useRef<HTMLCanvasElement>(null);
  const elRef  = useRef<HTMLDivElement>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(()=>{
    const cv=cvRef.current; if(!cv) return;
    const ctx=cv.getContext('2d')!;
    const W=window.innerWidth, H=window.innerHeight;
    cv.width=W*devicePixelRatio; cv.height=H*devicePixelRatio;
    cv.style.width=W+'px'; cv.style.height=H+'px';
    ctx.scale(devicePixelRatio,devicePixelRatio);

    const CX=W/2, CY=H/2;
    const SCALE=Math.min(W,H)*0.062; // die size relative to screen

    // Physics
    const GRAV=1600, FLOOR_Y=H*0.55, BOUNCE=0.52, WALL_B=0.6;
    const BX=W*0.42, BZ=H*0.35; // half-bounds

    const dList=event.allDice?.length?event.allDice:[{die:event.dieType,value:event.result}];
    const n=dList.length;
    const S=Math.max(0.8,1.1-n*0.04);

    const dice:Die[]=dList.map((d,i)=>{
      const spread=Math.min(BX*0.4,n*30);
      return {
        g:geo(d.die), sides:d.die, val:d.value,
        x:(Math.random()-.5)*spread, y:-H*0.1-Math.random()*H*0.08,
        z:(Math.random()-.5)*(BZ*0.3),
        vx:(Math.random()-.5)*220, vy:100+Math.random()*80, vz:(Math.random()-.5)*120,
        rx:Math.random()*Math.PI*2, ry:Math.random()*Math.PI*2, rz:Math.random()*Math.PI*2,
        arx:(Math.random()-.5)*14, ary:(Math.random()-.5)*14, arz:(Math.random()-.5)*10,
        done:false, delay:i*0.1, scale:S,
      };
    });

    // Orientation snap: rotate die so face with val faces camera direction
    function snapToVal(die:Die) {
      const camDir:V3 = norm([0,1,0.35]); // overhead + slight tilt
      const fi=die.g.nums.indexOf(die.val); if(fi<0) return;
      const face=die.g.faces[fi];
      const a=die.g.verts[face[0]],b=die.g.verts[face[1]],c=die.g.verts[face[2]];
      const n1=norm(cross(sub(b,a),sub(c,a)));
      // Ensure outward normal (points away from centroid)
      const fc:V3=[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3,(a[2]+b[2]+c[2])/3];
      const faceN:V3=dot(n1,fc)>=0?n1:[-n1[0],-n1[1],-n1[2]];
      const cosA=Math.min(1,Math.max(-1,dot(faceN,camDir)));
      const angle=Math.acos(cosA); if(Math.abs(angle)<0.001) return;
      let axis:V3;
      if(Math.abs(angle-Math.PI)<0.001) axis=[1,0,0];
      else axis=norm(cross(faceN,camDir));
      // Apply as a full rotation (replace physics rotation)
      die.rx=Math.asin(axis[1]*Math.sin(angle/2))*2;
      die.ry=Math.atan2(axis[0]*Math.sin(angle),Math.cos(angle));
      die.rz=0;
      // More accurate: use quaternion → Euler but this approximation is sufficient
      die.arx=die.ary=die.arz=0;
    }

    function drawDie(die:Die) {
      const {g,sides,rx,ry,rz,x,y,z,scale}=die;
      const p=pal(sides);
      const r=scale;
      // Project center to screen
      const cx=CX+x*(FOV/(z+FOV));
      const cy=CY+y*(FOV/(z+FOV))+(FLOOR_Y-CY)*0.1;
      const d=FOV/(z+FOV);

      // Transform vertices
      const tv=g.verts.map(v=>rot([v[0]*r,v[1]*r,v[2]*r],rx,ry,rz));
      const sv=tv.map(v=>proj(v,cx,cy,d));

      // Face info
      const faces=g.faces.map((face,fi)=>{
        const v0=tv[face[0]],v1=tv[face[1]],v2=tv[face[2]];
        const fn=norm(cross(sub(v1,v0),sub(v2,v0)));
        const visible=fn[2]>0.01;
        const depth=face.reduce((s,vi)=>s+tv[vi][2],0)/face.length;
        return {face,fi,fn,visible,depth};
      });
      faces.sort((a,b)=>a.depth-b.depth);

      const texSz=Math.max(48,Math.round(r*d*140));

      faces.forEach(({face,fi,fn,visible})=>{
        if(!visible) return;
        const pts=face.map(vi=>sv[vi]);
        // Lighting
        const diff=Math.max(0,-dot(fn,LIGHT));
        const bright=0.3+0.7*diff;
        const faceCol=hexBright(p.hi, bright);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pts[0][0],pts[0][1]);
        for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]);
        ctx.closePath();
        ctx.fillStyle=faceCol; ctx.fill();
        ctx.strokeStyle=p.edge; ctx.lineWidth=1.2; ctx.stroke();
        if(die.done){ctx.strokeStyle=p.edge+'88';ctx.lineWidth=3;ctx.stroke();}

        // Draw face texture if visible enough
        if(diff>0.15 || (die.done && fn[2]>0.3)) {
          const cx2=pts.reduce((s,q)=>s+q[0],0)/pts.length;
          const cy2=pts.reduce((s,q)=>s+q[1],0)/pts.length;
          const tex=faceTex(g.nums[fi],p,texSz);
          const faceR=Math.sqrt((pts[0][0]-cx2)**2+(pts[0][1]-cy2)**2);
          const ts=faceR*1.5;
          ctx.drawImage(tex,cx2-ts/2,cy2-ts/2,ts,ts);
        }
        ctx.restore();
      });

      // Shadow under die
      if(!die.done && die.y<FLOOR_Y-r*2) {
        const shadowY=proj([0,r*1.5,0],cx,CY+(FLOOR_Y-CY)*0.1,d);
        const dist=(FLOOR_Y-die.y)/(H*0.4);
        ctx.save();
        ctx.globalAlpha=Math.max(0,0.3*(1-dist));
        ctx.beginPath();
        ctx.ellipse(shadowY[0],FLOOR_Y+2,r*d*0.7,r*d*0.18,0,0,Math.PI*2);
        ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fill();
        ctx.restore();
      }
    }

    function hexBright(hex:string, b:number):string {
      const n=parseInt(hex.slice(1),16);
      const r=Math.min(255,Math.round(((n>>16)&255)*b));
      const g=Math.min(255,Math.round(((n>>8)&255)*b));
      const bl=Math.min(255,Math.round((n&255)*b));
      return `rgb(${r},${g},${bl})`;
    }

    function update(dt:number) {
      const r=SCALE*0.85;
      dice.forEach(die=>{
        if(die.delay>0){die.delay-=dt;return;}
        if(die.done) return;
        die.vy+=GRAV*dt;
        die.x+=die.vx*dt; die.y+=die.vy*dt; die.z+=die.vz*dt;
        die.rx+=die.arx*dt; die.ry+=die.ary*dt; die.rz+=die.arz*dt;

        // Floor
        if(die.y+r>FLOOR_Y){
          die.y=FLOOR_Y-r; die.vy=-Math.abs(die.vy)*BOUNCE;
          die.vx*=0.85; die.vz*=0.85;
          die.arx*=0.7; die.ary*=0.7; die.arz*=0.7;
          if(Math.abs(die.vy)<20) die.vy=0;
        }
        // Walls
        if(die.x<-BX){die.x=-BX;die.vx=Math.abs(die.vx)*WALL_B;}
        if(die.x> BX){die.x= BX;die.vx=-Math.abs(die.vx)*WALL_B;}
        if(die.z<-BZ){die.z=-BZ;die.vz=Math.abs(die.vz)*WALL_B;}
        if(die.z> BZ){die.z= BZ;die.vz=-Math.abs(die.vz)*WALL_B;}

        // Floor friction
        if(Math.abs(die.y+r-FLOOR_Y)<2){
          die.vx*=0.96; die.vz*=0.96;
          die.arx*=0.94; die.ary*=0.94; die.arz*=0.94;
        }

        const spd=Math.sqrt(die.vx**2+die.vy**2+die.vz**2);
        const ang=Math.sqrt(die.arx**2+die.ary**2+die.arz**2);
        if(spd<15&&ang<0.8&&Math.abs(die.y+r-FLOOR_Y)<3){
          die.done=true; die.vx=die.vy=die.vz=die.arx=die.ary=die.arz=0;
          die.y=FLOOR_Y-r;
          snapToVal(die);
        }
      });
    }

    let last=performance.now(),allDone=false,doneT=0,dismissed=false,raf=0,resultShown=false;

    function showResult(){
      if(resultShown||!elRef.current)return; resultShown=true;
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
      elRef.current.appendChild(div);
    }

    function frame(ts:number){
      if(dismissed)return;
      raf=requestAnimationFrame(frame);
      const dt=Math.min((ts-last)/1000,0.05); last=ts;
      update(dt);
      ctx.clearRect(0,0,W,H);

      // Subtle floor line
      ctx.save();
      ctx.strokeStyle='rgba(255,255,255,0.06)';
      ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(0,FLOOR_Y); ctx.lineTo(W,FLOOR_Y); ctx.stroke();
      ctx.restore();

      // Sort dice back-to-front by z
      [...dice].filter(d=>d.delay<=0).sort((a,b)=>a.z-b.z).forEach(drawDie);

      const ready=dice.filter(d=>d.delay<=0);
      if(!allDone&&ready.length&&ready.every(d=>d.done)){
        allDone=true; doneT=0; showResult();
      }
      if(allDone){
        doneT+=dt;
        if(doneT>4.5){dismissed=true;onDismissRef.current();cancelAnimationFrame(raf);}
      }
    }
    raf=requestAnimationFrame(frame);
    return ()=>{dismissed=true;cancelAnimationFrame(raf);};
  },[]);

  return createPortal(
    <div ref={elRef} onClick={onDismiss} style={{
      position:'fixed',inset:0,zIndex:9999,
      background:'rgba(2,5,14,0.88)',backdropFilter:'blur(12px)',
      cursor:'pointer',overflow:'hidden',
    }}>
      <canvas ref={cvRef} style={{position:'absolute',inset:0,pointerEvents:'none'}}/>
      <div style={{position:'absolute',bottom:14,left:0,right:0,textAlign:'center',
        pointerEvents:'none',fontFamily:'var(--ff-body)',fontSize:11,color:'rgba(255,255,255,0.2)'}}>
        Click anywhere to dismiss
      </div>
      <style>{`@keyframes rr{from{opacity:0;transform:translateX(-50%) scale(0.5)}to{opacity:1;transform:translateX(-50%) scale(1)}}`}</style>
    </div>,
    document.body
  );
}
