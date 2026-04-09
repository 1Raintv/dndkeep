/**
 * DiceRoller3D — Three.js + Cannon-es physics dice roller.
 * Real WebGL 3D rendering with proper rigid-body physics simulation.
 * Dice collide with each other and with all 6 room walls.
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

// ── Die theme colors ─────────────────────────────────────────────────
const THEMES: Record<number, { body: number; edge: number; text: number }> = {
  4:   { body: 0x2a0545, edge: 0xc084fc, text: 0xe9d5ff },
  6:   { body: 0x2d1500, edge: 0xf97316, text: 0xfed7aa },
  8:   { body: 0x052e16, edge: 0x22c55e, text: 0xbbf7d0 },
  10:  { body: 0x0c1f3a, edge: 0x38bdf8, text: 0xe0f2fe },
  12:  { body: 0x3b0764, edge: 0xe879f9, text: 0xfae8ff },
  20:  { body: 0x2d2000, edge: 0xf0c040, text: 0xfef9c3 },
  100: { body: 0x3b1500, edge: 0xfb923c, text: 0xffedd5 },
};
const theme = (s: number) => THEMES[s] ?? THEMES[20];

const PHI = (1 + Math.sqrt(5)) / 2;

// ── Geometry helpers ─────────────────────────────────────────────────
function unitize(verts: [number,number,number][]): [number,number,number][] {
  return verts.map(v => {
    const l = Math.sqrt(v[0]**2+v[1]**2+v[2]**2);
    return [v[0]/l, v[1]/l, v[2]/l];
  });
}

interface DieGeoDef {
  vertices: [number,number,number][];
  faces: number[][];   // each face = array of vertex indices
  faceNums: number[];  // face label for index i
}

function d4Geo(): DieGeoDef {
  const v = unitize([[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]]);
  return { vertices: v, faces: [[0,1,2],[0,2,3],[0,3,1],[1,3,2]], faceNums: [1,2,3,4] };
}

function d6Geo(): DieGeoDef {
  const v: [number,number,number][] = [
    [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
    [-1,-1, 1],[1,-1, 1],[1,1, 1],[-1,1, 1],
  ];
  return { vertices: v,
    faces: [[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]],
    faceNums: [1,6,2,5,3,4] };
}

function d8Geo(): DieGeoDef {
  const v: [number,number,number][] = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  return { vertices: v,
    faces: [[0,2,4],[2,1,4],[1,3,4],[3,0,4],[0,5,2],[2,5,1],[1,5,3],[3,5,0]],
    faceNums: [1,2,3,4,5,6,7,8] };
}

function d12Geo(): DieGeoDef {
  const inv = 1/PHI;
  const v = unitize([
    [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],
    [0,-inv,-PHI],[0,inv,-PHI],[0,-inv,PHI],[0,inv,PHI],
    [-inv,-PHI,0],[inv,-PHI,0],[inv,PHI,0],[-inv,PHI,0],
    [-PHI,0,-inv],[-PHI,0,inv],[PHI,0,-inv],[PHI,0,inv],
  ]);
  return { vertices: v,
    faces: [[0,8,13,12,16],[1,18,13,8,9],[2,9,8,0,3],[3,0,16,17,15],[4,17,16,12,10],
            [5,19,18,1,6],[6,1,2,14,19],[7,11,14,2,3],[7,15,17,4,11],[5,10,12,13,18],
            [4,10,5,6,7],[11,4,19,14,15]],
    faceNums: [1,2,3,4,5,6,7,8,9,10,11,12] };
}

function d20Geo(): DieGeoDef {
  const v = unitize([
    [0,1,PHI],[0,-1,PHI],[0,1,-PHI],[0,-1,-PHI],
    [1,PHI,0],[-1,PHI,0],[1,-PHI,0],[-1,-PHI,0],
    [PHI,0,1],[PHI,0,-1],[-PHI,0,1],[-PHI,0,-1],
  ]);
  return { vertices: v,
    faces: [[0,1,8],[0,8,4],[0,4,5],[0,5,10],[0,10,1],[3,2,11],[3,11,7],[3,7,6],[3,6,9],[3,9,2],
            [1,6,8],[8,6,9],[8,9,4],[4,9,2],[4,2,5],[5,2,11],[5,11,10],[10,11,7],[10,7,1],[1,7,6]],
    faceNums: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20] };
}

function getGeoDef(sides: number): DieGeoDef {
  switch(sides) { case 4: return d4Geo(); case 6: return d6Geo(); case 8: return d8Geo();
    case 12: return d12Geo(); default: return d20Geo(); }
}

// Build a THREE.BufferGeometry from faces (triangulated)
function buildThreeGeo(def: DieGeoDef, scale = 0.95): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  for (const face of def.faces) {
    // Fan triangulation
    for (let i = 1; i < face.length - 1; i++) {
      const a = def.vertices[face[0]], b = def.vertices[face[i]], c = def.vertices[face[i+1]];
      const ax=a[0]*scale, ay=a[1]*scale, az=a[2]*scale;
      const bx=b[0]*scale, by=b[1]*scale, bz=b[2]*scale;
      const cx=c[0]*scale, cy=c[1]*scale, cz=c[2]*scale;
      // Normal via cross product
      const ex=bx-ax, ey=by-ay, ez=bz-az;
      const fx=cx-ax, fy=cy-ay, fz=cz-az;
      const nx=ey*fz-ez*fy, ny=ez*fx-ex*fz, nz=ex*fy-ey*fx;
      const nl=Math.sqrt(nx*nx+ny*ny+nz*nz);
      positions.push(ax,ay,az, bx,by,bz, cx,cy,cz);
      normals.push(nx/nl,ny/nl,nz/nl, nx/nl,ny/nl,nz/nl, nx/nl,ny/nl,nz/nl);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geo;
}

// Build CANNON ConvexPolyhedron for a die
function buildCannonShape(def: DieGeoDef, scale = 1.0): CANNON.ConvexPolyhedron {
  const verts = def.vertices.map(v => new CANNON.Vec3(v[0]*scale, v[1]*scale, v[2]*scale));
  const faces = def.faces.map(f => [...f]);
  return new CANNON.ConvexPolyhedron({ vertices: verts, faces });
}

// Build a number label texture
function makeNumTexture(num: number, col: number): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);
  ctx.font = `900 ${num >= 10 ? 56 : 72}px system-ui`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const r=(col>>16)&255, g=(col>>8)&255, b=col&255;
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillText(String(num), 64, 68);
  return new THREE.CanvasTexture(cv);
}

// ── Component ────────────────────────────────────────────────────────
export default function DiceRoller3D({ event, onDismiss }: Props) {
  const cvRef = useRef<HTMLDivElement>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const container = cvRef.current;
    if (!container) return;

    const W = window.innerWidth, H = window.innerHeight;

    // ── Three.js setup ───────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, W/H, 0.1, 200);
    camera.position.set(0, 14, 22);
    camera.lookAt(0, 0, 0);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff8e8, 1.8);
    sun.position.set(6, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 0.1;
    sun.shadow.camera.far = 60;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -20;
    sun.shadow.camera.right = sun.shadow.camera.top = 20;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x8888ff, 0.5);
    fill.position.set(-6, 4, -4);
    scene.add(fill);

    // Table surface (visual only)
    const tableGeo = new THREE.PlaneGeometry(60, 60);
    const tableMat = new THREE.MeshLambertMaterial({
      color: 0x0a1a0e,
      transparent: true, opacity: 0.92,
    });
    const table = new THREE.Mesh(tableGeo, tableMat);
    table.rotation.x = -Math.PI / 2;
    table.position.y = -3.5;
    table.receiveShadow = true;
    scene.add(table);

    // Subtle grid on table
    const grid = new THREE.GridHelper(40, 20, 0x1a3a1a, 0x1a3a1a);
    grid.position.y = -3.49;
    (grid.material as THREE.Material).opacity = 0.4;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    // ── Cannon-es physics world ──────────────────────────────────────
    const world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -28, 0),
    });
    world.broadphase = new CANNON.NaiveBroadphase();
    (world.solver as CANNON.GSSolver).iterations = 10;

    // Dice material
    const diceMat = new CANNON.Material('dice');
    const tableMate = new CANNON.Material('table');
    const contactMat = new CANNON.ContactMaterial(diceMat, tableMate, {
      friction: 0.4, restitution: 0.42,
    });
    const dieDieMat = new CANNON.ContactMaterial(diceMat, diceMat, {
      friction: 0.3, restitution: 0.35,
    });
    world.addContactMaterial(contactMat);
    world.addContactMaterial(dieDieMat);

    // Static floor plane
    const floorBody = new CANNON.Body({ mass: 0, material: tableMate });
    floorBody.addShape(new CANNON.Plane());
    floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0), -Math.PI/2);
    floorBody.position.set(0, -3.5, 0);
    world.addBody(floorBody);

    // Walls (invisible but physical) — box/cylinder scene bounds
    const WALL = 14, WALLH = 20;
    [[0,0,-WALL,0], [0,0,WALL,Math.PI], [WALL,0,0,-Math.PI/2], [-WALL,0,0,Math.PI/2]].forEach(([x,y,z,a]) => {
      const b = new CANNON.Body({ mass: 0 });
      b.addShape(new CANNON.Plane());
      b.position.set(x as number, y as number, z as number);
      b.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), a as number);
      world.addBody(b);
    });
    // Ceiling
    const ceilBody = new CANNON.Body({ mass: 0 });
    ceilBody.addShape(new CANNON.Plane());
    ceilBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0), Math.PI/2);
    ceilBody.position.set(0, WALLH, 0);
    world.addBody(ceilBody);

    // ── Create dice ──────────────────────────────────────────────────
    const diceInput = event.allDice?.length
      ? event.allDice
      : [{ die: event.dieType, value: event.result }];

    const diceScale = Math.max(0.7, 1.1 - diceInput.length * 0.06);

    interface DieObj {
      mesh: THREE.Group;
      body: CANNON.Body;
      sides: number;
      finalVal: number;
      settled: boolean;
    }

    const dieObjects: DieObj[] = diceInput.map((d, i) => {
      const def = getGeoDef(d.die);
      const pal = theme(d.die);
      const s = diceScale;

      // Three.js mesh group
      const group = new THREE.Group();

      // Main body
      const geo = buildThreeGeo(def, s);
      const mat = new THREE.MeshPhongMaterial({
        color: pal.body, specular: 0x444444, shininess: 60,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);

      // Edge wireframe
      const edgeMat = new THREE.LineBasicMaterial({ color: pal.edge, linewidth: 1 });
      const edges = new THREE.EdgesGeometry(buildThreeGeo(def, s * 1.01));
      group.add(new THREE.LineSegments(edges, edgeMat));

      // Face number sprites
      def.faces.forEach((face, fi) => {
        // Face center
        const centroid = face.reduce((acc, vi) => {
          const v = def.vertices[vi];
          return [acc[0]+v[0], acc[1]+v[1], acc[2]+v[2]];
        }, [0,0,0]).map(x => x / face.length * s * 1.05);

        const tex = makeNumTexture(def.faceNums[fi], pal.text);
        const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.position.set(centroid[0], centroid[1], centroid[2]);
        sprite.scale.set(0.55 * s, 0.28 * s, 1);
        group.add(sprite);
      });

      scene.add(group);

      // CANNON physics body
      const body = new CANNON.Body({
        mass: 1,
        material: diceMat,
        linearDamping: 0.12,
        angularDamping: 0.18,
      });
      body.addShape(buildCannonShape(def, s * 0.92));

      // Random starting position — thrown from above with spread
      const spread = Math.min(6, diceInput.length * 1.2);
      body.position.set(
        (Math.random() - 0.5) * spread,
        8 + Math.random() * 5,
        (Math.random() - 0.5) * spread * 0.5,
      );
      body.quaternion.setFromEuler(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
      );
      // Initial throw velocity — random direction with good energy
      body.velocity.set(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 10,
      );
      body.angularVelocity.set(
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20,
      );

      world.addBody(body);
      return { mesh: group, body, sides: d.die, finalVal: d.value, settled: false };
    });

    // ── Animation loop ───────────────────────────────────────────────
    const FIXED_STEP = 1/60;
    let allSettled = false;
    let settleTimer = 0;
    let dismissed = false;
    let raf = 0;
    let lastTs = performance.now();

    // Total label (HTML overlay, shown after settle)
    let totalShown = false;

    function showTotal() {
      if (totalShown) return;
      totalShown = true;
      const tot = event.total ?? (event.modifier !== undefined
        ? event.result + event.modifier : event.result);
      const multi = diceInput.length > 1;
      const hasMod = !multi && event.modifier !== undefined && event.modifier !== 0;
      if (!multi && !hasMod) return;

      const div = document.createElement('div');
      div.style.cssText = `
        position:absolute; bottom:8%; left:50%; transform:translateX(-50%);
        text-align:center; pointer-events:none; animation: totalPop 0.5s cubic-bezier(0.34,1.56,0.64,1) both;
      `;
      div.innerHTML = `
        ${hasMod ? `<div style="font:500 18px system-ui;color:rgba(255,255,255,0.5);margin-bottom:4px">${event.result} ${(event.modifier??0)>=0?'+':''}${event.modifier} =</div>` : ''}
        ${multi ? `<div style="font:700 13px system-ui;color:rgba(255,255,255,0.4);letter-spacing:0.15em;margin-bottom:4px">TOTAL</div>` : ''}
        <div style="font:900 72px system-ui;color:#fff;text-shadow:0 0 30px rgba(255,255,255,0.4);line-height:1">${tot}</div>
      `;
      container.appendChild(div);
    }

    function frame(ts: number) {
      if (dismissed) return;
      raf = requestAnimationFrame(frame);

      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;

      // Step physics
      world.step(FIXED_STEP, dt, 3);

      // Sync Three.js to Cannon
      dieObjects.forEach(obj => {
        obj.mesh.position.copy(obj.body.position as unknown as THREE.Vector3);
        obj.mesh.quaternion.copy(obj.body.quaternion as unknown as THREE.Quaternion);
      });

      // Check settle
      if (!allSettled) {
        const settled = dieObjects.every(obj => {
          const lv = obj.body.velocity.length();
          const av = obj.body.angularVelocity.length();
          return lv < 0.4 && av < 0.4;
        });
        if (settled) {
          settleTimer += dt;
          if (settleTimer > 0.4) {
            allSettled = true;
            showTotal();
          }
        } else {
          settleTimer = 0;
        }
      } else {
        settleTimer += dt;
        if (settleTimer > 4.2) {
          dismissed = true;
          dismissRef.current();
          cancelAnimationFrame(raf);
          return;
        }
      }

      renderer.render(scene, camera);
    }

    raf = requestAnimationFrame(frame);

    return () => {
      dismissed = true;
      cancelAnimationFrame(raf);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      scene.clear();
    };
  }, []);

  return createPortal(
    <div
      ref={cvRef}
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(2,6,10,0.92)',
        backdropFilter: 'blur(14px)',
        cursor: 'pointer',
      }}
    >
      {event.label && (
        <div style={{
          position: 'absolute', top: '6%', left: 0, right: 0,
          textAlign: 'center', pointerEvents: 'none',
          fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 17,
          letterSpacing: '0.22em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.45)',
          animation: 'diceLabel 0.4s ease both',
        }}>
          {event.label}
        </div>
      )}
      <div style={{
        position: 'absolute', bottom: 16, left: 0, right: 0,
        textAlign: 'center', pointerEvents: 'none',
        fontFamily: 'var(--ff-body)', fontSize: 11,
        color: 'rgba(255,255,255,0.18)',
      }}>
        Click anywhere to dismiss
      </div>
      <style>{`
        @keyframes diceLabel { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes totalPop { from{opacity:0;transform:translateX(-50%) scale(0.8)} to{opacity:1;transform:translateX(-50%) scale(1)} }
      `}</style>
    </div>,
    document.body
  );
}
