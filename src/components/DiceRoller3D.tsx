/**
 * DiceRoller3D — Three.js powered 3D dice roll animation
 * Renders dice flying in from the left, tumbling with physics,
 * then landing flat to reveal the result.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface DiceRollEvent {
  result: number;
  dieType: number;
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

// Die face colors per type
const DIE_COLOR: Record<number, number> = {
  4:  0xa855f7, // purple
  6:  0xf59e0b, // amber
  8:  0x22c55e, // green
  10: 0x60a5fa, // blue
  12: 0xec4899, // pink
  20: 0xf0c040, // gold
  100:0xfb923c, // orange
};

function getColor(sides: number) {
  return DIE_COLOR[sides] ?? 0xeef2f7;
}

// Build die geometry
function makeDieGeometry(sides: number): THREE.BufferGeometry {
  switch (sides) {
    case 4:  return new THREE.TetrahedronGeometry(0.9);
    case 6:  return new THREE.BoxGeometry(1.4, 1.4, 1.4);
    case 8:  return new THREE.OctahedronGeometry(1.0);
    case 10: return new THREE.ConeGeometry(0.8, 1.6, 10);
    case 12: return new THREE.DodecahedronGeometry(0.9);
    case 20: return new THREE.IcosahedronGeometry(1.0);
    case 100:return new THREE.SphereGeometry(0.85, 12, 12);
    default: return new THREE.IcosahedronGeometry(1.0);
  }
}

interface DieState {
  mesh: THREE.Mesh;
  vx: number; vy: number; vz: number;   // velocity
  rx: number; ry: number; rz: number;   // angular velocity
  phase: 'fly' | 'tumble' | 'land' | 'done';
  landX: number; landY: number;
  timer: number;
  sides: number;
  value: number;
  landed: boolean;
}

export default function DiceRoller3D({ event, onDismiss }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;

    const W = window.innerWidth;
    const H = window.innerHeight;

    // Scene setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 200);
    camera.position.set(0, 0, 22);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(5, 10, 8);
    dirLight.castShadow = true;
    scene.add(dirLight);
    const pointLight = new THREE.PointLight(0xffeedd, 0.8, 50);
    pointLight.position.set(-4, 4, 12);
    scene.add(pointLight);

    // Build dice list from event
    const diceList: { sides: number; value: number }[] = event.allDice
      ? event.allDice.map(d => ({ sides: d.die, value: d.value }))
      : [{ sides: event.dieType, value: event.result }];

    // Spread landing positions
    const totalDice = diceList.length;
    const spacing = Math.min(4, 14 / Math.max(totalDice, 1));
    const startX = -spacing * (totalDice - 1) / 2;

    const states: DieState[] = diceList.map((d, i) => {
      const col = getColor(d.sides);
      const geo = makeDieGeometry(d.sides);
      const mat = new THREE.MeshPhongMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 0.15,
        specular: 0xffffff,
        shininess: 80,
        transparent: true,
        opacity: 0.92,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;

      // Start off-screen left, staggered
      const delay = i * 0.12;
      mesh.position.set(-W / 60 - 10, (Math.random() - 0.5) * 6, 0);
      mesh.visible = false;
      scene.add(mesh);

      // Land position
      const landX = startX + i * spacing;
      const landY = totalDice > 4 ? (i % 2 === 0 ? 1.5 : -1.5) : 0;

      return {
        mesh,
        vx: 14 + Math.random() * 4,
        vy: (Math.random() - 0.5) * 2,
        vz: 0,
        rx: (Math.random() - 0.5) * 12,
        ry: (Math.random() - 0.5) * 12,
        rz: (Math.random() - 0.5) * 8,
        phase: 'fly' as const,
        landX,
        landY,
        timer: -delay,
        sides: d.sides,
        value: d.value,
        landed: false,
      };
    });

    // Canvas label for each landed die
    const labels: THREE.Sprite[] = [];

    function makeLabel(text: string, color: number): THREE.Sprite {
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, 256, 128);
      ctx.font = 'bold 72px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Hex to rgb
      const r = (color >> 16) & 255;
      const g = (color >> 8) & 255;
      const b = color & 255;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillText(text, 128, 68);
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(2.2, 1.1, 1);
      sprite.visible = false;
      scene.add(sprite);
      return sprite;
    }

    // Pre-build labels
    states.forEach(s => {
      const lbl = makeLabel(String(s.value), getColor(s.sides));
      labels.push(lbl);
    });

    // Total label (shown after all land)
    const totalLabel = event.total !== undefined && totalDice > 1
      ? makeLabel(`= ${event.total}${event.flatBonus ? ` (+${event.flatBonus})` : ''}`, 0xffffff)
      : null;

    let allLanded = false;
    let totalTimer = 0;
    let dismissTimer = 0;
    let dismissed = false;
    const DT = 1 / 60;

    function animate() {
      if (dismissed) return;
      raf = requestAnimationFrame(animate);

      states.forEach((s, i) => {
        s.timer += DT;
        if (s.timer < 0) return;

        s.mesh.visible = true;

        if (s.phase === 'fly') {
          // Move right, slight arc
          s.mesh.position.x += s.vx * DT;
          s.mesh.position.y += s.vy * DT;
          s.vy -= 6 * DT; // gravity
          s.vx *= 0.97;
          s.mesh.rotation.x += s.rx * DT;
          s.mesh.rotation.y += s.ry * DT;
          s.mesh.rotation.z += s.rz * DT;

          // Transition to tumble when near center
          if (s.mesh.position.x > s.landX - 2) {
            s.phase = 'tumble';
          }
        } else if (s.phase === 'tumble') {
          // Decelerate toward landing position
          const tx = s.landX - s.mesh.position.x;
          const ty = s.landY - s.mesh.position.y;
          s.mesh.position.x += tx * 0.12;
          s.mesh.position.y += ty * 0.12;
          s.rx *= 0.88;
          s.ry *= 0.88;
          s.rz *= 0.88;
          s.mesh.rotation.x += s.rx * DT;
          s.mesh.rotation.y += s.ry * DT;
          s.mesh.rotation.z += s.rz * DT;

          if (Math.abs(tx) < 0.05 && Math.abs(ty) < 0.05 && Math.abs(s.rx) < 0.3) {
            s.phase = 'land';
            s.mesh.position.x = s.landX;
            s.mesh.position.y = s.landY;
          }
        } else if (s.phase === 'land') {
          // Bounce scale
          const scale = 1 + 0.15 * Math.exp(-s.timer * 4) * Math.sin(s.timer * 25);
          s.mesh.scale.setScalar(scale);
          // Settle rotation
          s.mesh.rotation.x *= 0.85;
          s.mesh.rotation.y *= 0.85;
          s.mesh.rotation.z *= 0.85;

          if (!s.landed && s.timer > 0.15) {
            s.landed = true;
            labels[i].position.set(s.landX, s.landY + 2.2, 0);
            labels[i].visible = true;
          }
          s.phase = 'done';
        }
      });

      // Check if all landed
      if (!allLanded && states.every(s => s.landed)) {
        allLanded = true;
      }

      if (allLanded) {
        totalTimer += DT;
        if (totalLabel && totalTimer > 0.3) {
          totalLabel.visible = true;
          totalLabel.position.set(0, -4.5, 0);
        }

        dismissTimer += DT;
        // Auto-dismiss after 3.5s or if already started
        if (dismissTimer > 3.5 && !dismissed) {
          dismissed = true;
          onDismiss();
        }
      }

      renderer.render(scene, camera);
    }

    let raf = requestAnimationFrame(animate);

    // Click to dismiss
    function handleClick() {
      if (!dismissed) {
        dismissed = true;
        onDismiss();
      }
    }
    container.addEventListener('click', handleClick);

    return () => {
      dismissed = true;
      cancelAnimationFrame(raf);
      container.removeEventListener('click', handleClick);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      scene.clear();
    };
  }, []);

  return (
    <div
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        cursor: 'pointer',
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingBottom: 40,
      }}
    >
      {/* Label overlay — name of what was rolled */}
      {event.label && (
        <div style={{
          position: 'absolute', top: '12%',
          fontFamily: 'var(--ff-body)', fontWeight: 700,
          fontSize: 18, letterSpacing: '0.15em',
          textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)',
          pointerEvents: 'none',
        }}>
          {event.label}
        </div>
      )}
      <div style={{
        fontFamily: 'var(--ff-body)', fontSize: 12,
        color: 'rgba(255,255,255,0.35)', pointerEvents: 'none',
        position: 'absolute', bottom: 20,
      }}>
        Click anywhere to dismiss
      </div>
    </div>
  );
}
