/**
 * DiceRoller3D — 3D dice rolling animation via Three.js loaded from CDN.
 * No npm dependency required — Three.js is injected as a script tag on first use.
 */
import { useEffect, useRef, useState } from 'react';

interface DiceRollEvent {
  result: number;
  dieType: number;
  total?: number;
  label?: string;
  allDice?: { die: number; value: number }[];
  flatBonus?: number;
}

interface Props {
  event: DiceRollEvent;
  onDismiss: () => void;
}

const DIE_COLOR: Record<number, number> = {
  4:  0xa855f7,
  6:  0xf59e0b,
  8:  0x22c55e,
  10: 0x60a5fa,
  12: 0xec4899,
  20: 0xf0c040,
  100:0xfb923c,
};

function getColor(sides: number): number {
  return DIE_COLOR[sides] ?? 0xeef2f7;
}

// Load THREE from CDN once, cached in window
let threePromise: Promise<typeof import('three')> | null = null;
function loadThree(): Promise<typeof import('three')> {
  if ((window as any).THREE) return Promise.resolve((window as any).THREE);
  if (threePromise) return threePromise;
  threePromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    s.onload = () => resolve((window as any).THREE);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return threePromise;
}

export default function DiceRoller3D({ event, onDismiss }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    let raf = 0;

    loadThree().then((THREE: any) => {
      if (disposed || !mountRef.current) return;
      setReady(true);
      const container = mountRef.current;
      const W = window.innerWidth;
      const H = window.innerHeight;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(W, H);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      // Position canvas absolutely so it fills the container correctly
      renderer.domElement.style.cssText = 'position:absolute;top:0;left:0;display:block;';
      renderer.shadowMap.enabled = true;
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 200);
      camera.position.set(0, 0, 22);

      scene.add(new THREE.AmbientLight(0xffffff, 0.5));
      const dir = new THREE.DirectionalLight(0xffffff, 1.2);
      dir.position.set(5, 10, 8);
      dir.castShadow = true;
      scene.add(dir);
      const pt = new THREE.PointLight(0xffeedd, 0.8, 50);
      pt.position.set(-4, 4, 12);
      scene.add(pt);

      const diceList = event.allDice
        ? event.allDice.map(d => ({ sides: d.die, value: d.value }))
        : [{ sides: event.dieType, value: event.result }];

      const n = diceList.length;
      const spacing = Math.min(4, 14 / Math.max(n, 1));
      const startX = -spacing * (n - 1) / 2;

      function makeGeo(sides: number) {
        switch (sides) {
          case 4:  return new THREE.TetrahedronGeometry(0.9);
          case 6:  return new THREE.BoxGeometry(1.4, 1.4, 1.4);
          case 8:  return new THREE.OctahedronGeometry(1.0);
          case 10: return new THREE.ConeGeometry(0.8, 1.6, 10);
          case 12: return new THREE.DodecahedronGeometry(0.9);
          case 20: return new THREE.IcosahedronGeometry(1.0);
          default: return new THREE.SphereGeometry(0.85, 12, 12);
        }
      }

      interface DieState {
        mesh: any;
        vx: number; vy: number;
        rx: number; ry: number; rz: number;
        phase: 'fly' | 'tumble' | 'done';
        landX: number; landY: number;
        timer: number;
        sides: number;
        value: number;
        landed: boolean;
      }

      const states: DieState[] = diceList.map((d, i) => {
        const col = getColor(d.sides);
        const mat = new THREE.MeshPhongMaterial({
          color: col, emissive: col, emissiveIntensity: 0.15,
          specular: 0xffffff, shininess: 80,
          transparent: true, opacity: 0.92,
        });
        const mesh = new THREE.Mesh(makeGeo(d.sides), mat);
        mesh.castShadow = true;
        mesh.position.set(-W / 55 - 8, (Math.random() - 0.5) * 6, 0);
        mesh.visible = false;
        scene.add(mesh);
        return {
          mesh,
          vx: 14 + Math.random() * 4,
          vy: (Math.random() - 0.5) * 2,
          rx: (Math.random() - 0.5) * 12,
          ry: (Math.random() - 0.5) * 12,
          rz: (Math.random() - 0.5) * 8,
          phase: 'fly' as const,
          landX: startX + i * spacing,
          landY: n > 4 ? (i % 2 === 0 ? 1.5 : -1.5) : 0,
          timer: -i * 0.12,
          sides: d.sides,
          value: d.value,
          landed: false,
        };
      });

      // Sprite labels
      function makeLabel(text: string, color: number) {
        const cv = document.createElement('canvas');
        cv.width = 256; cv.height = 128;
        const ctx = cv.getContext('2d')!;
        ctx.font = 'bold 72px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillText(text, 128, 68);
        const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true });
        const sp = new THREE.Sprite(mat);
        sp.scale.set(2.2, 1.1, 1);
        sp.visible = false;
        scene.add(sp);
        return sp;
      }

      const labels = states.map(s => makeLabel(String(s.value), getColor(s.sides)));
      const totalLabel = (event.total !== undefined && n > 1)
        ? makeLabel(`= ${event.total}`, 0xffffff) : null;

      const DT = 1 / 60;
      let allLanded = false;
      let totalTimer = 0;
      let dismissTimer = 0;

      function animate() {
        if (disposed) return;
        raf = requestAnimationFrame(animate);

        states.forEach((s, i) => {
          s.timer += DT;
          if (s.timer < 0) return;
          s.mesh.visible = true;

          if (s.phase === 'fly') {
            s.mesh.position.x += s.vx * DT;
            s.mesh.position.y += s.vy * DT;
            s.vy -= 6 * DT;
            s.vx *= 0.97;
            s.mesh.rotation.x += s.rx * DT;
            s.mesh.rotation.y += s.ry * DT;
            s.mesh.rotation.z += s.rz * DT;
            if (s.mesh.position.x > s.landX - 2) s.phase = 'tumble';
          } else if (s.phase === 'tumble') {
            s.mesh.position.x += (s.landX - s.mesh.position.x) * 0.12;
            s.mesh.position.y += (s.landY - s.mesh.position.y) * 0.12;
            s.rx *= 0.88; s.ry *= 0.88; s.rz *= 0.88;
            s.mesh.rotation.x += s.rx * DT;
            s.mesh.rotation.y += s.ry * DT;
            s.mesh.rotation.z += s.rz * DT;
            if (Math.abs(s.landX - s.mesh.position.x) < 0.05 && Math.abs(s.rx) < 0.3) {
              s.phase = 'done';
              s.mesh.position.set(s.landX, s.landY, 0);
              if (!s.landed) {
                s.landed = true;
                labels[i].position.set(s.landX, s.landY + 2.2, 0);
                labels[i].visible = true;
              }
            }
          } else {
            const sc = 1 + 0.12 * Math.exp(-s.timer * 5) * Math.sin(s.timer * 20);
            s.mesh.scale.setScalar(sc);
          }
        });

        if (!allLanded && states.every(s => s.landed)) allLanded = true;

        if (allLanded) {
          totalTimer += DT;
          if (totalLabel && totalTimer > 0.3) {
            totalLabel.visible = true;
            totalLabel.position.set(0, -4.5, 0);
          }
          dismissTimer += DT;
          if (dismissTimer > 3.5 && !disposed) {
            disposed = true;
            onDismiss();
          }
        }

        renderer.render(scene, camera);
      }

      raf = requestAnimationFrame(animate);

      function handleClick() {
        if (!disposed) { disposed = true; onDismiss(); }
      }
      container.addEventListener('click', handleClick);

      // Store cleanup
      (container as any)._cleanup = () => {
        disposed = true;
        cancelAnimationFrame(raf);
        container.removeEventListener('click', handleClick);
        renderer.dispose();
        if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
        scene.clear();
      };
    }).catch(() => {
      // Three.js failed to load — dismiss gracefully
      if (!disposed) onDismiss();
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      const c = mountRef.current;
      if (c && (c as any)._cleanup) (c as any)._cleanup();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        cursor: 'pointer',
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
      }}
    >
      {event.label && (
        <div style={{
          position: 'absolute', top: '10%', left: 0, right: 0,
          textAlign: 'center', pointerEvents: 'none',
          fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 20,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.7)',
        }}>
          {event.label}
        </div>
      )}
      {!ready && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.5)', fontSize: 14,
          fontFamily: 'var(--ff-body)',
        }}>
          Loading…
        </div>
      )}
      <div style={{
        position: 'absolute', bottom: 20, left: 0, right: 0,
        textAlign: 'center', pointerEvents: 'none',
        fontFamily: 'var(--ff-body)', fontSize: 12,
        color: 'rgba(255,255,255,0.35)',
      }}>
        Click anywhere to dismiss
      </div>
    </div>
  );
}
