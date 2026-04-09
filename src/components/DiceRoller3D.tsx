/**
 * DiceRoller3D — Full 3D dice renderer using Canvas 2D.
 * Custom perspective projection, backface culling, flat shading.
 * Physics simulation: gravity, bounce, rolling friction.
 * No external dependencies, no CDN.
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

interface Props {
  event: DiceRollEvent;
  onDismiss: () => void;
}

// ── 3D Math ──────────────────────────────────────────────────────────
type Vec3 = readonly [number, number, number];

const v3add  = (a: Vec3, b: Vec3): Vec3 => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const v3sub  = (a: Vec3, b: Vec3): Vec3 => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const v3dot  = (a: Vec3, b: Vec3) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const v3cross= (a: Vec3, b: Vec3): Vec3 => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const v3norm = (a: Vec3): Vec3 => { const l=Math.sqrt(v3dot(a,a)); return l>0?[a[0]/l,a[1]/l,a[2]/l]:[0,0,1]; };
const v3scale= (a: Vec3, s: number): Vec3 => [a[0]*s, a[1]*s, a[2]*s];

// Rotate a vector by Euler angles (rx, ry, rz) in ZYX order
function rotateVec(v: Vec3, rx: number, ry: number, rz: number): Vec3 {
  let [x, y, z] = v;
  // Rotate X
  let y2 = y*Math.cos(rx) - z*Math.sin(rx);
  let z2 = y*Math.sin(rx) + z*Math.cos(rx);
  y = y2; z = z2;
  // Rotate Y
  let x2 = x*Math.cos(ry) + z*Math.sin(ry);
  z2    = -x*Math.sin(ry) + z*Math.cos(ry);
  x = x2; z = z2;
  // Rotate Z
  x2 = x*Math.cos(rz) - y*Math.sin(rz);
  y2 = x*Math.sin(rz) + y*Math.cos(rz);
  return [x2, y2, z];
}

// Perspective project 3D → 2D
function project(v: Vec3, fov: number, cx: number, cy: number, scale: number): [number, number] {
  const d = fov / (v[2] + fov);
  return [v[0] * d * scale + cx, v[1] * d * scale + cy];
}

// ── Polyhedron Geometry ───────────────────────────────────────────────
interface FaceDef { verts: number[]; num: number }
interface Polyhedron { verts: Vec3[]; faces: FaceDef[] }

const PHI = (1 + Math.sqrt(5)) / 2;

// Normalise all vertices to unit sphere
function norm(verts: Vec3[]): Vec3[] {
  return verts.map(v => {
    const l = Math.sqrt(v[0]**2+v[1]**2+v[2]**2);
    return [v[0]/l, v[1]/l, v[2]/l];
  });
}

function makeD4(): Polyhedron {
  const v: Vec3[] = norm([
    [ 1, 1, 1], [ 1,-1,-1], [-1, 1,-1], [-1,-1, 1]
  ]);
  return { verts: v, faces: [
    { verts: [0,1,2], num: 1 }, { verts: [0,2,3], num: 2 },
    { verts: [0,3,1], num: 3 }, { verts: [1,3,2], num: 4 },
  ]};
}

function makeD6(): Polyhedron {
  const v: Vec3[] = [
    [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
    [-1,-1, 1],[1,-1, 1],[1,1, 1],[-1,1, 1],
  ];
  // Standard d6 opposite faces sum to 7: 1↔6, 2↔5, 3↔4
  return { verts: v, faces: [
    { verts: [0,3,2,1], num: 1 }, { verts: [4,5,6,7], num: 6 },
    { verts: [0,1,5,4], num: 2 }, { verts: [3,7,6,2], num: 5 },
    { verts: [0,4,7,3], num: 3 }, { verts: [1,2,6,5], num: 4 },
  ]};
}

function makeD8(): Polyhedron {
  const v: Vec3[] = [
    [1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]
  ];
  return { verts: v, faces: [
    {verts:[0,2,4],num:1},{verts:[2,1,4],num:2},{verts:[1,3,4],num:3},{verts:[3,0,4],num:4},
    {verts:[0,5,2],num:5},{verts:[2,5,1],num:6},{verts:[1,5,3],num:7},{verts:[3,5,0],num:8},
  ]};
}

function makeD10(): Polyhedron {
  const verts: Vec3[] = [];
  // Upper ring of 5 at y=0.5
  for (let i = 0; i < 5; i++) {
    const a = (i/5)*Math.PI*2;
    verts.push([Math.cos(a), 0.5, Math.sin(a)]);
  }
  // Lower ring of 5 at y=-0.5, offset by 36°
  for (let i = 0; i < 5; i++) {
    const a = (i/5)*Math.PI*2 + Math.PI/5;
    verts.push([Math.cos(a), -0.5, Math.sin(a)]);
  }
  verts.push([0, 1.2, 0]);   // top apex  idx 10
  verts.push([0, -1.2, 0]);  // bottom apex idx 11
  const f: FaceDef[] = [];
  for (let i = 0; i < 5; i++) {
    const a = i, b = (i+1)%5, c = i+5, d = ((i+4)%5)+5;
    f.push({ verts: [10, b, a], num: i+1 });
    f.push({ verts: [11, c, ((i+1)%5)+5], num: i+6 });
  }
  return { verts: norm(verts.slice(0,10)).concat([[0,1,0],[0,-1,0]]), faces: f };
}

function makeD12(): Polyhedron {
  const inv = 1/PHI;
  const raw: Vec3[] = [
    // (±1, ±1, ±1)
    [-1,-1,-1],[ 1,-1,-1],[ 1, 1,-1],[-1, 1,-1],
    [-1,-1, 1],[ 1,-1, 1],[ 1, 1, 1],[-1, 1, 1],
    // (0, ±1/φ, ±φ)
    [ 0,-inv,-PHI],[ 0, inv,-PHI],[ 0,-inv, PHI],[ 0, inv, PHI],
    // (±1/φ, ±φ, 0)
    [-inv,-PHI, 0],[ inv,-PHI, 0],[ inv, PHI, 0],[-inv, PHI, 0],
    // (±φ, 0, ±1/φ)
    [-PHI, 0,-inv],[-PHI, 0, inv],[ PHI, 0,-inv],[ PHI, 0, inv],
  ];
  const v = norm(raw);
  // 12 pentagonal faces
  const faces: FaceDef[] = [
    {verts:[0,8,13,12,16],num:1},{verts:[1,18,13,8,9],num:2},
    {verts:[2,9,8,0,3],  num:3},{verts:[3,0,16,17,15],num:4},
    {verts:[4,17,16,12,10],num:5},{verts:[5,19,18,1,6],num:6},
    {verts:[6,1,2,14,19],num:7},{verts:[7,11,14,2,3],  num:8},
    {verts:[7,15,17,4,11],num:9},{verts:[5,10,12,13,18],num:10},
    {verts:[4,10,5,6,7], num:11},{verts:[11,4,19,14,15],num:12},
  ];
  return { verts: v, faces };
}

function makeD20(): Polyhedron {
  const raw: Vec3[] = [
    [ 0, 1, PHI],[ 0,-1, PHI],[ 0, 1,-PHI],[ 0,-1,-PHI],
    [ 1, PHI, 0],[-1, PHI, 0],[ 1,-PHI, 0],[-1,-PHI, 0],
    [ PHI, 0, 1],[ PHI, 0,-1],[-PHI, 0, 1],[-PHI, 0,-1],
  ];
  const v = norm(raw);
  const faces: FaceDef[] = [
    {verts:[0,1,8], num:1}, {verts:[0,8,4],  num:2},
    {verts:[0,4,5], num:3}, {verts:[0,5,10], num:4},
    {verts:[0,10,1],num:5}, {verts:[3,2,11], num:6},
    {verts:[3,11,7],num:7}, {verts:[3,7,6],  num:8},
    {verts:[3,6,9], num:9}, {verts:[3,9,2],  num:10},
    {verts:[1,6,8], num:11},{verts:[8,6,9],  num:12},
    {verts:[8,9,4], num:13},{verts:[4,9,2],  num:14},
    {verts:[4,2,5], num:15},{verts:[5,2,11], num:16},
    {verts:[5,11,10],num:17},{verts:[10,11,7],num:18},
    {verts:[10,7,1], num:19},{verts:[1,7,6], num:20},
  ];
  return { verts: v, faces };
}

function getGeometry(sides: number): Polyhedron {
  switch (sides) {
    case 4:  return makeD4();
    case 6:  return makeD6();
    case 8:  return makeD8();
    case 10: return makeD10();
    case 12: return makeD12();
    case 20: return makeD20();
    default: return makeD20();
  }
}

// ── Colors ────────────────────────────────────────────────────────────
const DIE_PALETTE: Record<number, { base: string; edge: string; light: string }> = {
  4:   { base: '#3b0764', edge: '#a855f7', light: '#c084fc' },
  6:   { base: '#431407', edge: '#f97316', light: '#fdba74' },
  8:   { base: '#052e16', edge: '#22c55e', light: '#86efac' },
  10:  { base: '#082f49', edge: '#38bdf8', light: '#bae6fd' },
  12:  { base: '#4a044e', edge: '#e879f9', light: '#f0abfc' },
  20:  { base: '#422006', edge: '#f0c040', light: '#fde68a' },
  100: { base: '#431407', edge: '#fb923c', light: '#fed7aa' },
};

// Light direction (normalized)
const LIGHT: Vec3 = v3norm([0.6, -1, 0.8]);

// ── Die instance ──────────────────────────────────────────────────────
interface DieInstance {
  geo: Polyhedron;
  sides: number;
  finalValue: number;
  // Screen position & physics
  x: number; y: number;       // screen center
  vx: number; vy: number;     // velocity px/s
  // 3D rotation & angular velocity
  rx: number; ry: number; rz: number;   // current rotation angles
  arx: number; ary: number; arz: number; // angular velocity rad/s
  // State
  phase: 'air' | 'rolling' | 'done';
  startDelay: number;
  bounces: number;
}

// ── Main Component ────────────────────────────────────────────────────
export default function DiceRoller3D({ event, onDismiss }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W * window.devicePixelRatio;
    canvas.height = H * window.devicePixelRatio;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const TABLE_Y = H * 0.6;
    const GRAVITY  = 1600;
    const BOUNCE_Y = 0.72;
    const BOUNCE_X = 0.80;
    const ROLL_FX  = 0.960;
    const ANG_FX   = 0.88;
    const FOV      = 5;       // perspective field of view

    const diceInput = event.allDice?.length
      ? event.allDice
      : [{ die: event.dieType, value: event.result }];

    const diceSize = Math.min(52, Math.max(36, 52 - diceInput.length * 3));

    const instances: DieInstance[] = diceInput.map((d, i) => ({
      geo: getGeometry(d.die),
      sides: d.die,
      finalValue: d.value,
      x: -diceSize - 10,
      y: TABLE_Y - 80 - Math.random() * 100,
      vx: 500 + Math.random() * 200,
      vy: -100 - Math.random() * 160,
      rx: Math.random() * Math.PI * 2,
      ry: Math.random() * Math.PI * 2,
      rz: Math.random() * Math.PI * 2,
      arx: (Math.random()-0.5) * 14,
      ary: (Math.random()-0.5) * 14,
      arz: (Math.random()-0.5) * 8,
      phase: 'air' as const,
      startDelay: i * 0.13,
      bounces: 0,
    }));

    // Find which face of a die currently faces most toward +Z (camera)
    // and rotate die to show finalValue on that face when done
    function getFaceNormal(inst: DieInstance, face: FaceDef): Vec3 {
      const { verts } = inst.geo;
      const v0 = rotateVec(verts[face.verts[0]], inst.rx, inst.ry, inst.rz);
      const v1 = rotateVec(verts[face.verts[1]], inst.rx, inst.ry, inst.rz);
      const v2 = rotateVec(verts[face.verts[2]], inst.rx, inst.ry, inst.rz);
      return v3norm(v3cross(v3sub(v1, v0), v3sub(v2, v0)));
    }

    function drawDieInstance(inst: DieInstance) {
      const { geo, sides, x, y, rx, ry, rz } = inst;
      const pal = DIE_PALETTE[sides] ?? DIE_PALETTE[20];
      const scale = diceSize;
      const cx = x, cy = y;

      // Transform all vertices
      const tVerts = geo.verts.map(v => rotateVec(v, rx, ry, rz));
      // Project to 2D
      const pVerts = tVerts.map(v => project(v, FOV, cx, cy, scale));

      // Compute face info
      type FaceInfo = { face: FaceDef; depth: number; normal: Vec3; visible: boolean };
      const faceInfos: FaceInfo[] = geo.faces.map(face => {
        const v0 = tVerts[face.verts[0]];
        const v1 = tVerts[face.verts[1]];
        const v2 = tVerts[face.verts[2]];
        const normal = v3norm(v3cross(v3sub(v1, v0), v3sub(v2, v0)));
        const visible = normal[2] > 0; // facing camera?
        const depth = face.verts.reduce((s, vi) => s + tVerts[vi][2], 0) / face.verts.length;
        return { face, depth, normal, visible };
      });

      // Painter's algorithm — draw back to front
      faceInfos.sort((a, b) => a.depth - b.depth);

      for (const { face, normal, visible } of faceInfos) {
        if (!visible) continue;

        // Flat shading: diffuse + ambient
        const diffuse = Math.max(0, -v3dot(normal, LIGHT));
        const ambient = 0.22;
        const brightness = ambient + (1 - ambient) * diffuse;

        // Parse base color and lighten by brightness
        const hex = pal.base;
        const r = Math.round(parseInt(hex.slice(1,3),16) * brightness + parseInt(pal.light.slice(1,3),16) * (1-brightness) * 0.3);
        const g = Math.round(parseInt(hex.slice(3,5),16) * brightness + parseInt(pal.light.slice(3,5),16) * (1-brightness) * 0.3);
        const b = Math.round(parseInt(hex.slice(5,7),16) * brightness + parseInt(pal.light.slice(5,7),16) * (1-brightness) * 0.3);
        const fillColor = `rgb(${Math.min(255,r)},${Math.min(255,g)},${Math.min(255,b)})`;

        const pts = face.verts.map(vi => pVerts[vi]);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();

        // Shadow when airborne
        if (inst.phase !== 'done') {
          ctx.shadowColor = 'rgba(0,0,0,0.4)';
          ctx.shadowBlur = 8;
          ctx.shadowOffsetY = 3;
        }

        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.shadowColor = 'transparent';

        // Edge
        ctx.strokeStyle = inst.phase === 'done' ? pal.edge : pal.edge + '99';
        ctx.lineWidth = inst.phase === 'done' ? 1.5 : 1;
        ctx.stroke();

        // Glow on settled die
        if (inst.phase === 'done') {
          ctx.strokeStyle = pal.edge + '40';
          ctx.lineWidth = 4;
          ctx.stroke();
        }

        // Number on face — only on the face most facing camera
        // Find center of face
        const cx2 = pts.reduce((s, p) => s + p[0], 0) / pts.length;
        const cy2 = pts.reduce((s, p) => s + p[1], 0) / pts.length;

        // Show number if face brightness > threshold (clearly facing camera)
        if (diffuse > 0.3 || (inst.phase === 'done' && normal[2] > 0.5)) {
          const faceSize = Math.sqrt((pts[0][0]-cx2)**2 + (pts[0][1]-cy2)**2);
          const textScale = faceSize * (face.num >= 10 ? 0.55 : 0.68);
          ctx.font = `900 ${textScale}px system-ui`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = inst.phase === 'done' ? pal.edge : pal.light + 'dd';
          if (inst.phase === 'done') {
            ctx.shadowColor = pal.edge + '80';
            ctx.shadowBlur = 8;
          }
          ctx.fillText(String(face.num), cx2, cy2);
          ctx.shadowColor = 'transparent';
        }

        ctx.restore();
      }
    }

    function drawTable() {
      ctx.save();
      // Subtle felt-like table surface
      const grad = ctx.createLinearGradient(0, TABLE_Y - 2, 0, TABLE_Y + 30);
      grad.addColorStop(0, 'rgba(255,255,255,0.08)');
      grad.addColorStop(0.1, 'rgba(255,255,255,0.04)');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(0, TABLE_Y - 2, W, 32);

      // Horizon line
      const lg = ctx.createLinearGradient(0, 0, W, 0);
      lg.addColorStop(0, 'transparent');
      lg.addColorStop(0.2, 'rgba(255,255,255,0.15)');
      lg.addColorStop(0.8, 'rgba(255,255,255,0.15)');
      lg.addColorStop(1, 'transparent');
      ctx.strokeStyle = lg;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, TABLE_Y);
      ctx.lineTo(W, TABLE_Y);
      ctx.stroke();
      ctx.restore();
    }

    function drawTotal(alpha: number) {
      if (alpha <= 0) return;
      const finalTotal = event.total ?? (event.modifier !== undefined
        ? event.result + event.modifier : event.result);
      const isMulti = diceInput.length > 1;
      const hasMod = !isMulti && event.modifier !== undefined && event.modifier !== 0;
      if (!isMulti && !hasMod) return;

      ctx.save();
      ctx.globalAlpha = alpha;
      const ty = TABLE_Y + 64;

      if (hasMod) {
        ctx.font = '500 18px system-ui';
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${event.result} ${(event.modifier??0)>=0?'+':''}${event.modifier} =`, W/2, ty);
        ctx.font = '900 60px system-ui';
        ctx.fillStyle = '#fff';
        ctx.shadowColor = 'rgba(255,255,255,0.35)';
        ctx.shadowBlur = 24;
        ctx.fillText(String(finalTotal), W/2, ty + 52);
      } else if (isMulti) {
        ctx.font = '700 14px system-ui';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.textAlign = 'center';
        ctx.fillText('TOTAL', W/2, ty);
        ctx.font = '900 72px system-ui';
        ctx.fillStyle = '#fff';
        ctx.shadowColor = 'rgba(255,255,255,0.3)';
        ctx.shadowBlur = 28;
        ctx.textBaseline = 'top';
        ctx.fillText(String(finalTotal), W/2, ty + 14);
      }
      ctx.restore();
    }

    // ── Physics update ───────────────────────────────────────────────
    function update(dt: number) {
      for (const inst of instances) {
        if (inst.startDelay > 0) { inst.startDelay -= dt; continue; }

        if (inst.phase === 'air' || inst.phase === 'rolling') {
          inst.vy += GRAVITY * dt;
          inst.x  += inst.vx * dt;
          inst.y  += inst.vy * dt;
          inst.rx += inst.arx * dt;
          inst.ry += inst.ary * dt;
          inst.rz += inst.arz * dt;

          // Bounce off table
          if (inst.y + diceSize * 0.5 > TABLE_Y && inst.vy > 0) {
            inst.y = TABLE_Y - diceSize * 0.5;
            inst.vy *= -BOUNCE_Y;
            inst.vx *= BOUNCE_X;
            inst.arx *= ANG_FX;
            inst.ary *= ANG_FX;
            inst.arz *= ANG_FX;
            inst.phase = 'rolling';
            inst.bounces++;
            if (Math.abs(inst.vy) < 50) inst.vy = 0;
          }

          // Rolling friction
          if (inst.phase === 'rolling') {
            inst.vx  *= ROLL_FX;
            inst.arx *= ROLL_FX;
            inst.ary *= ROLL_FX;
            inst.arz *= ROLL_FX;
          }

          // Wall bounce
          if (inst.x < diceSize) { inst.x = diceSize; inst.vx = Math.abs(inst.vx) * 0.5; }
          if (inst.x > W - diceSize) { inst.x = W - diceSize; inst.vx = -Math.abs(inst.vx) * 0.5; }

          // Check settled
          const speed = Math.sqrt(inst.vx**2 + inst.vy**2);
          const angSpeed = Math.sqrt(inst.arx**2 + inst.ary**2 + inst.arz**2);
          if (inst.phase === 'rolling' && speed < 15 && angSpeed < 1.0) {
            inst.phase = 'done';
            inst.vx = inst.vy = 0;
            inst.arx = inst.ary = inst.arz = 0;
            inst.y = TABLE_Y - diceSize * 0.5;
          }
        }
      }
    }

    // ── Animation loop ───────────────────────────────────────────────
    let last = performance.now();
    let allDone = false;
    let doneTimer = 0;
    let dismissed = false;
    let raf = 0;

    function frame(ts: number) {
      if (dismissed) return;
      const dt = Math.min((ts - last) / 1000, 0.05);
      last = ts;

      update(dt);

      ctx.clearRect(0, 0, W, H);
      drawTable();

      // Draw die shadows on table
      for (const inst of instances) {
        if (inst.startDelay > 0) continue;
        const shadowAlpha = inst.phase === 'air'
          ? Math.min(0.35, 0.35 * (1 - (TABLE_Y - inst.y) / 300))
          : 0.25;
        if (shadowAlpha > 0 && inst.phase !== 'done') {
          ctx.save();
          ctx.globalAlpha = shadowAlpha;
          ctx.beginPath();
          ctx.ellipse(inst.x, TABLE_Y + 4, diceSize * 0.6, diceSize * 0.15, 0, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fill();
          ctx.restore();
        }
        drawDieInstance(inst);
      }

      const ready = instances.filter(i => i.startDelay <= 0);
      if (ready.length > 0 && ready.every(i => i.phase === 'done')) {
        if (!allDone) allDone = true;
        doneTimer += dt;
        drawTotal(Math.min(1, (doneTimer - 0.2) / 0.5));
        if (doneTimer > 3.8) { dismissed = true; dismissRef.current(); return; }
      }

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => { dismissed = true; cancelAnimationFrame(raf); };
  }, []);

  return createPortal(
    <div
      onClick={onDismiss}
      style={{ position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(4,6,12,0.90)', backdropFilter: 'blur(10px)',
        cursor: 'pointer' }}
    >
      {event.label && (
        <div style={{
          position: 'absolute', top: '7%', left: 0, right: 0,
          textAlign: 'center', pointerEvents: 'none',
          fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 17,
          letterSpacing: '0.22em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.5)',
          animation: 'diceLabel 0.4s ease both',
        }}>
          {event.label}
        </div>
      )}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      <div style={{
        position: 'absolute', bottom: 18, left: 0, right: 0,
        textAlign: 'center', pointerEvents: 'none',
        fontFamily: 'var(--ff-body)', fontSize: 11,
        color: 'rgba(255,255,255,0.2)',
      }}>
        Click anywhere to dismiss
      </div>
      <style>{`
        @keyframes diceLabel {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>,
    document.body
  );
}
