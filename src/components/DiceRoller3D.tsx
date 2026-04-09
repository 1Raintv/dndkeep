/**
 * DiceRoller3D — Full 3D room with physics-based dice.
 * Dice have real X/Y/Z positions and velocities, bounce off all 6 walls,
 * scale with depth for genuine perspective, rendered with flat shading.
 */
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

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

// ── 3D math ─────────────────────────────────────────────────────────
type V3 = readonly [number, number, number];
const dot   = (a: V3, b: V3) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub   = (a: V3, b: V3): V3 => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const cross = (a: V3, b: V3): V3 => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const norm  = (a: V3): V3 => { const l = Math.sqrt(dot(a,a)); return l > 0 ? [a[0]/l, a[1]/l, a[2]/l] : [0,0,1]; };

function rotate(v: V3, rx: number, ry: number, rz: number): V3 {
  let [x, y, z] = v;
  let y2 = y*Math.cos(rx) - z*Math.sin(rx), z2 = y*Math.sin(rx) + z*Math.cos(rx); y=y2; z=z2;
  let x2 = x*Math.cos(ry) + z*Math.sin(ry); z2 = -x*Math.sin(ry) + z*Math.cos(ry); x=x2; z=z2;
  x2 = x*Math.cos(rz) - y*Math.sin(rz); y2 = x*Math.sin(rz) + y*Math.cos(rz);
  return [x2, y2, z];
}

// ── Geometry ─────────────────────────────────────────────────────────
const PHI = (1+Math.sqrt(5))/2;
type Face = { vi: number[]; n: number };
interface Geo { verts: V3[]; faces: Face[] }

function unitize(vs: V3[]): V3[] { return vs.map(v => { const l=Math.sqrt(dot(v,v)); return l>0?[v[0]/l,v[1]/l,v[2]/l]:[0,0,1]; }); }

const GEOS: Record<number, Geo> = {
  4: (() => { const v = unitize([[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]]); return { verts:v, faces:[{vi:[0,1,2],n:1},{vi:[0,2,3],n:2},{vi:[0,3,1],n:3},{vi:[1,3,2],n:4}]}; })(),
  6: (() => { const v: V3[] = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]; return { verts:v, faces:[{vi:[0,3,2,1],n:1},{vi:[4,5,6,7],n:6},{vi:[0,1,5,4],n:2},{vi:[3,7,6,2],n:5},{vi:[0,4,7,3],n:3},{vi:[1,2,6,5],n:4}]}; })(),
  8: (() => { const v: V3[] = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]; return { verts:v, faces:[{vi:[0,2,4],n:1},{vi:[2,1,4],n:2},{vi:[1,3,4],n:3},{vi:[3,0,4],n:4},{vi:[0,5,2],n:5},{vi:[2,5,1],n:6},{vi:[1,5,3],n:7},{vi:[3,5,0],n:8}]}; })(),
  10: (() => {
    const verts: V3[] = [];
    for(let i=0;i<5;i++){const a=(i/5)*Math.PI*2;verts.push([Math.cos(a),0.5,Math.sin(a)]);}
    for(let i=0;i<5;i++){const a=(i/5)*Math.PI*2+Math.PI/5;verts.push([Math.cos(a),-0.5,Math.sin(a)]);}
    verts.push([0,1.2,0],[0,-1.2,0]);
    const nv = unitize(verts.slice(0,10));
    nv.push([0,1,0],[0,-1,0]);
    const faces: Face[] = [];
    for(let i=0;i<5;i++){faces.push({vi:[10,(i+1)%5,i],n:i+1},{vi:[11,i+5,((i+1)%5)+5],n:i+6});}
    return {verts:nv,faces};
  })(),
  12: (() => {
    const inv=1/PHI;
    const raw: V3[]=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],[0,-inv,-PHI],[0,inv,-PHI],[0,-inv,PHI],[0,inv,PHI],[-inv,-PHI,0],[inv,-PHI,0],[inv,PHI,0],[-inv,PHI,0],[-PHI,0,-inv],[-PHI,0,inv],[PHI,0,-inv],[PHI,0,inv]];
    return {verts:unitize(raw),faces:[{vi:[0,8,13,12,16],n:1},{vi:[1,18,13,8,9],n:2},{vi:[2,9,8,0,3],n:3},{vi:[3,0,16,17,15],n:4},{vi:[4,17,16,12,10],n:5},{vi:[5,19,18,1,6],n:6},{vi:[6,1,2,14,19],n:7},{vi:[7,11,14,2,3],n:8},{vi:[7,15,17,4,11],n:9},{vi:[5,10,12,13,18],n:10},{vi:[4,10,5,6,7],n:11},{vi:[11,4,19,14,15],n:12}]};
  })(),
  20: (() => {
    const raw: V3[]=[[0,1,PHI],[0,-1,PHI],[0,1,-PHI],[0,-1,-PHI],[1,PHI,0],[-1,PHI,0],[1,-PHI,0],[-1,-PHI,0],[PHI,0,1],[PHI,0,-1],[-PHI,0,1],[-PHI,0,-1]];
    return {verts:unitize(raw),faces:[{vi:[0,1,8],n:1},{vi:[0,8,4],n:2},{vi:[0,4,5],n:3},{vi:[0,5,10],n:4},{vi:[0,10,1],n:5},{vi:[3,2,11],n:6},{vi:[3,11,7],n:7},{vi:[3,7,6],n:8},{vi:[3,6,9],n:9},{vi:[3,9,2],n:10},{vi:[1,6,8],n:11},{vi:[8,6,9],n:12},{vi:[8,9,4],n:13},{vi:[4,9,2],n:14},{vi:[4,2,5],n:15},{vi:[5,2,11],n:16},{vi:[5,11,10],n:17},{vi:[10,11,7],n:18},{vi:[10,7,1],n:19},{vi:[1,7,6],n:20}]};
  })(),
};
function getGeo(sides: number): Geo { return GEOS[sides] ?? GEOS[20]; }

// ── Palette ──────────────────────────────────────────────────────────
const PAL: Record<number, [string, string, string]> = {
  4:  ['#2a0545','#c084fc','#e9d5ff'],  6:  ['#2d1500','#f97316','#fed7aa'],
  8:  ['#052e16','#22c55e','#bbf7d0'],  10: ['#0c2a4a','#38bdf8','#e0f2fe'],
  12: ['#3b0764','#e879f9','#fae8ff'],  20: ['#2d2000','#f0c040','#fef9c3'],
  100:['#3b1500','#fb923c','#ffedd5'],
};
const LIGHT: V3 = norm([0.5,-1,0.7]);

// ── Die instance ─────────────────────────────────────────────────────
interface Die {
  geo: Geo; sides: number; finalVal: number;
  wx: number; wy: number; wz: number;    // 3D world pos
  vx: number; vy: number; vz: number;    // 3D velocity
  rx: number; ry: number; rz: number;    // rotation angles
  arx: number; ary: number; arz: number; // angular velocity
  phase: 'fly'|'done';
  delay: number;
}

// ── Component ────────────────────────────────────────────────────────
export default function DiceRoller3D({ event, onDismiss }: Props) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const cv = cvRef.current; if(!cv) return;
    const ctx = cv.getContext('2d')!;
    const W = window.innerWidth, H = window.innerHeight;
    cv.width = W * devicePixelRatio; cv.height = H * devicePixelRatio;
    cv.style.width = W+'px'; cv.style.height = H+'px';
    ctx.scale(devicePixelRatio, devicePixelRatio);

    // ── Room & camera constants ───────────────────────────────────────
    const FOV  = 520;         // perspective strength
    const RX   = 520;         // room half-width
    const RY   = 380;         // room half-height
    const Z_N  = 120;         // front wall Z
    const Z_F  = 1400;        // back wall Z
    const FLOOR_Y = 320;      // floor Y (gravity target)
    const CEIL_Y  = -320;     // ceiling Y
    const BASE_R  = 68;       // die world-space radius
    const GRAVITY = 1800;
    const BOUNCE_FLOOR = 0.65, BOUNCE_WALL = 0.72, BOUNCE_ANG = 0.78, ROLL_FX = 0.955;

    // project world pos to screen
    const proj = (wx: number, wy: number, wz: number) => {
      const d = FOV / Math.max(wz, 1);
      return [wx * d + W/2, wy * d + H/2, d] as [number, number, number];
    };

    const dList = event.allDice?.length ? event.allDice : [{die:event.dieType,value:event.result}];
    const n = dList.length;

    // ── Create dice: thrown from near camera into room ────────────────
    const dice: Die[] = dList.map((d, i) => {
      const sign = Math.random() > 0.5 ? 1 : -1;
      return {
        geo: getGeo(d.die), sides: d.die, finalVal: d.value,
        wx: (Math.random()-0.5) * 200,
        wy: (Math.random()-0.5) * 150,
        wz: Z_N + 40,
        vx: sign * (180 + Math.random()*280),
        vy: -300 - Math.random()*250,
        vz: 400 + Math.random()*350,
        rx: Math.random()*Math.PI*2, ry: Math.random()*Math.PI*2, rz: Math.random()*Math.PI*2,
        arx: (Math.random()-0.5)*18, ary: (Math.random()-0.5)*18, arz: (Math.random()-0.5)*12,
        phase: 'fly' as const,
        delay: i * 0.11,
      };
    });

    // ── Draw room (floor grid + faint walls) ─────────────────────────
    function drawRoom() {
      ctx.save();

      // Floor grid — perspective grid lines
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      const floorY3D = FLOOR_Y;
      const gridStep = 180;
      // Horizontal lines (z varying, x constant)
      for (let z = Z_N; z <= Z_F; z += gridStep) {
        const [lx,,] = proj(-RX, floorY3D, z), [rx,,] = proj(RX, floorY3D, z);
        const [ly] = [proj(-RX,floorY3D,z)[1]];
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(rx, ly); ctx.stroke();
      }
      // Vertical lines (x varying, z constant)
      for (let x = -RX; x <= RX; x += gridStep) {
        const [sx1, sy1] = proj(x, floorY3D, Z_N);
        const [sx2, sy2] = proj(x, floorY3D, Z_F);
        ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2); ctx.stroke();
      }

      // Faint ceiling
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      for (let z = Z_N; z <= Z_F; z += gridStep) {
        const [lx,,] = proj(-RX, CEIL_Y, z), [rx,,] = proj(RX, CEIL_Y, z);
        const ly = proj(-RX, CEIL_Y, z)[1];
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(rx, ly); ctx.stroke();
      }

      // Side walls — left and right vanishing lines
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      const steps = 4;
      for (let s = 0; s <= steps; s++) {
        const y3 = CEIL_Y + (FLOOR_Y - CEIL_Y) * (s / steps);
        const [lx1,ly1] = proj(-RX, y3, Z_N), [lx2,ly2] = proj(-RX, y3, Z_F);
        ctx.beginPath(); ctx.moveTo(lx1,ly1); ctx.lineTo(lx2,ly2); ctx.stroke();
        const [rx1,ry1] = proj(RX, y3, Z_N), [rx2,ry2] = proj(RX, y3, Z_F);
        ctx.beginPath(); ctx.moveTo(rx1,ry1); ctx.lineTo(rx2,ry2); ctx.stroke();
      }

      ctx.restore();
    }

    // ── Draw a single die ────────────────────────────────────────────
    function drawDie(die: Die) {
      const {geo, sides, wx, wy, wz, rx, ry, rz, phase} = die;
      const pal = PAL[sides] ?? PAL[20];

      // Project all vertices into screen space
      const tVerts = geo.verts.map(v => rotate(v, rx, ry, rz));
      // Each vertex is an offset from die center in world space
      const pVerts = tVerts.map(rv => {
        const vwx = wx + rv[0] * BASE_R;
        const vwy = wy + rv[1] * BASE_R;
        const vwz = wz + rv[2] * BASE_R;
        return proj(vwx, vwy, vwz);
      });

      // Face info
      type FI = {vi:number[];depth:number;normal:V3;visible:boolean;faceN:number};
      const faceInfos: FI[] = geo.faces.map(f => {
        const a = tVerts[f.vi[0]], b = tVerts[f.vi[1]], c = tVerts[f.vi[2]];
        const normal = norm(cross(sub(b,a), sub(c,a)));
        const visible = normal[2] > 0.0;
        const depth = f.vi.reduce((s,vi) => s + (wz + tVerts[vi][2] * BASE_R), 0) / f.vi.length;
        return {vi:f.vi, depth, normal, visible, faceN:f.n};
      });

      faceInfos.sort((a,b) => a.depth - b.depth);

      for (const fi of faceInfos) {
        if (!fi.visible) continue;

        // Phong shading
        const diffuse = Math.max(0, -dot(fi.normal, LIGHT));
        const brightness = 0.18 + 0.82 * diffuse;

        // Parse base + light colors for lerp
        const bh = parseInt(pal[0].slice(1), 16);
        const lh = parseInt(pal[2].slice(1), 16);
        const br = (bh>>16)&255, bg = (bh>>8)&255, bb = bh&255;
        const lr = (lh>>16)&255, lg = (lh>>8)&255, lb = lh&255;
        const r = Math.min(255, Math.round(br + (lr-br) * brightness * 0.85));
        const g = Math.min(255, Math.round(bg + (lg-bg) * brightness * 0.85));
        const b2= Math.min(255, Math.round(bb + (lb-bb) * brightness * 0.85));

        const pts = fi.vi.map(vi => pVerts[vi]);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
        ctx.fillStyle = `rgb(${r},${g},${b2})`;
        if (phase !== 'done') { ctx.shadowColor='rgba(0,0,0,0.45)'; ctx.shadowBlur=10; }
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = phase === 'done' ? pal[1] : pal[1]+'88';
        ctx.lineWidth = phase === 'done' ? 1.8 : 1;
        ctx.stroke();
        if (phase === 'done') {
          ctx.strokeStyle = pal[1]+'35'; ctx.lineWidth = 5; ctx.stroke();
        }

        // Face number — only on clearly visible faces
        if (diffuse > 0.25 || (phase==='done' && fi.normal[2] > 0.45)) {
          const cx2 = pts.reduce((s,p)=>s+p[0],0)/pts.length;
          const cy2 = pts.reduce((s,p)=>s+p[1],0)/pts.length;
          const faceR = Math.sqrt((pts[0][0]-cx2)**2+(pts[0][1]-cy2)**2);
          const fs = faceR * (fi.faceN >= 10 ? 0.55 : 0.7);
          if (fs >= 6) {
            ctx.font = `900 ${fs}px system-ui`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = phase === 'done' ? pal[1] : pal[2]+'cc';
            if (phase === 'done') { ctx.shadowColor = pal[1]+'70'; ctx.shadowBlur = 8; }
            ctx.fillText(String(fi.faceN), cx2, cy2+fs*0.05);
            ctx.shadowColor = 'transparent';
          }
        }
        ctx.restore();
      }
    }

    // ── Draw die shadow on floor ──────────────────────────────────────
    function drawShadow(die: Die) {
      if (die.phase === 'done') return;
      const dist = FLOOR_Y - die.wy;
      const alpha = Math.min(0.4, 0.4 * (1 - dist/700));
      if (alpha <= 0) return;
      const [sx, sy] = proj(die.wx, FLOOR_Y, die.wz);
      const scale = FOV / Math.max(die.wz, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.ellipse(sx, sy, BASE_R * scale * 0.7, BASE_R * scale * 0.18, 0, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fill();
      ctx.restore();
    }

    // ── Physics update ────────────────────────────────────────────────
    function update(dt: number) {
      for (const die of dice) {
        if (die.delay > 0) { die.delay -= dt; continue; }
        if (die.phase !== 'fly') continue;

        die.vy += GRAVITY * dt;
        die.wx += die.vx * dt; die.wy += die.vy * dt; die.wz += die.vz * dt;
        die.rx += die.arx * dt; die.ry += die.ary * dt; die.rz += die.arz * dt;

        const r = BASE_R * 0.55;

        // Floor bounce
        if (die.wy + r > FLOOR_Y) {
          die.wy = FLOOR_Y - r;
          die.vy = -Math.abs(die.vy) * BOUNCE_FLOOR;
          die.vx *= 0.88; die.vz *= 0.88;
          die.arx *= BOUNCE_ANG; die.ary *= BOUNCE_ANG; die.arz *= BOUNCE_ANG;
          if (Math.abs(die.vy) < 40) die.vy = 0;
        }
        // Ceiling
        if (die.wy - r < CEIL_Y) {
          die.wy = CEIL_Y + r;
          die.vy = Math.abs(die.vy) * BOUNCE_WALL;
          die.arx *= BOUNCE_ANG; die.ary *= BOUNCE_ANG;
        }
        // Left / Right walls
        if (die.wx - r < -RX) { die.wx=-RX+r; die.vx = Math.abs(die.vx)*BOUNCE_WALL; die.arx*=BOUNCE_ANG; die.arz*=BOUNCE_ANG; }
        if (die.wx + r >  RX) { die.wx= RX-r; die.vx = -Math.abs(die.vx)*BOUNCE_WALL; die.arx*=BOUNCE_ANG; die.arz*=BOUNCE_ANG; }
        // Front wall (near camera)
        if (die.wz - r < Z_N) { die.wz=Z_N+r; die.vz=Math.abs(die.vz)*BOUNCE_WALL; die.ary*=BOUNCE_ANG; }
        // Back wall
        if (die.wz + r > Z_F) { die.wz=Z_F-r; die.vz=-Math.abs(die.vz)*BOUNCE_WALL; die.ary*=BOUNCE_ANG; }

        // Rolling friction on floor
        if (Math.abs(die.wy + r - FLOOR_Y) < 5) {
          die.vx *= ROLL_FX; die.vz *= ROLL_FX;
          die.arx *= ROLL_FX; die.ary *= ROLL_FX; die.arz *= ROLL_FX;
        }

        // Settle check
        const spd = Math.sqrt(die.vx**2+die.vy**2+die.vz**2);
        const ang = Math.sqrt(die.arx**2+die.ary**2+die.arz**2);
        if (spd < 18 && ang < 1.0 && Math.abs(die.wy + r - FLOOR_Y) < 8) {
          die.phase = 'done';
          die.vx=die.vy=die.vz=die.arx=die.ary=die.arz=0;
          die.wy = FLOOR_Y - r;
        }
      }
    }

    // ── Total display ─────────────────────────────────────────────────
    function drawTotal(alpha: number) {
      if (alpha <= 0) return;
      const tot = event.total ?? (event.modifier !== undefined ? event.result+event.modifier : event.result);
      const multi = dList.length > 1;
      const hasMod = !multi && event.modifier !== undefined && event.modifier !== 0;
      if (!multi && !hasMod) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      const ty = H * 0.88;
      if (hasMod) {
        ctx.font = '500 17px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.textBaseline = 'middle';
        ctx.fillText(`${event.result} ${(event.modifier??0)>=0?'+':''}${event.modifier} =`, W/2, ty);
        ctx.font = '900 58px system-ui'; ctx.fillStyle='#fff';
        ctx.shadowColor='rgba(255,255,255,0.3)'; ctx.shadowBlur=20;
        ctx.fillText(String(tot), W/2, ty+48);
      } else if (multi) {
        ctx.font = '700 13px system-ui'; ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.textBaseline='middle';
        ctx.fillText('TOTAL', W/2, ty);
        ctx.font = '900 68px system-ui'; ctx.fillStyle='#fff';
        ctx.shadowColor='rgba(255,255,255,0.3)'; ctx.shadowBlur=24;
        ctx.fillText(String(tot), W/2, ty+52);
      }
      ctx.restore();
    }

    // ── Render loop ───────────────────────────────────────────────────
    let last = performance.now(), allDone = false, doneT = 0, dismissed = false, raf = 0;

    function frame(ts: number) {
      if (dismissed) return;
      const dt = Math.min((ts-last)/1000, 0.05); last = ts;
      update(dt);

      ctx.clearRect(0, 0, W, H);
      drawRoom();

      // Sort dice by Z depth (paint far ones first)
      const ready = dice.filter(d => d.delay <= 0);
      [...ready].sort((a,b) => b.wz - a.wz).forEach(d => {
        drawShadow(d);
        drawDie(d);
      });

      if (ready.length > 0 && ready.every(d => d.phase === 'done')) {
        if (!allDone) allDone = true;
        doneT += dt;
        drawTotal(Math.min(1, (doneT-0.25)/0.5));
        if (doneT > 3.8) { dismissed = true; dismissRef.current(); return; }
      }
      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => { dismissed = true; cancelAnimationFrame(raf); };
  }, []);

  return createPortal(
    <div onClick={onDismiss} style={{
      position:'fixed',inset:0,zIndex:9999,
      background:'rgba(2,4,10,0.93)',backdropFilter:'blur(12px)',cursor:'pointer',
    }}>
      {event.label && (
        <div style={{
          position:'absolute',top:'6%',left:0,right:0,textAlign:'center',pointerEvents:'none',
          fontFamily:'var(--ff-body)',fontWeight:700,fontSize:17,
          letterSpacing:'0.22em',textTransform:'uppercase',color:'rgba(255,255,255,0.45)',
          animation:'diceLabel 0.4s ease both',
        }}>{event.label}</div>
      )}
      <canvas ref={cvRef} style={{position:'absolute',inset:0,pointerEvents:'none'}} />
      <div style={{
        position:'absolute',bottom:16,left:0,right:0,textAlign:'center',
        pointerEvents:'none',fontFamily:'var(--ff-body)',fontSize:11,color:'rgba(255,255,255,0.18)',
      }}>Click anywhere to dismiss</div>
      <style>{`@keyframes diceLabel{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>,
    document.body
  );
}
