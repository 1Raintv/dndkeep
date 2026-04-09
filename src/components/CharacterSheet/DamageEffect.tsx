import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

// ── Damage type → sound profile mapping ────────────────────────────
type SoundProfile = {
  type: 'slash' | 'pierce' | 'blunt' | 'fire' | 'cold' | 'lightning' | 'acid' | 'poison' | 'necrotic' | 'radiant' | 'force' | 'psychic' | 'thunder' | 'generic';
  flashColor: string;
};

function getDamageProfile(notes: string): SoundProfile {
  const n = (notes ?? '').toLowerCase();
  if (n.includes('fire') || n.includes('burn') || n.includes('flame'))         return { type: 'fire',      flashColor: 'rgba(251,146,60,0.35)' };
  if (n.includes('cold') || n.includes('ice') || n.includes('frost'))          return { type: 'cold',      flashColor: 'rgba(147,197,253,0.35)' };
  if (n.includes('lightning') || n.includes('thunder') || n.includes('shock')) return { type: 'lightning', flashColor: 'rgba(250,204,21,0.35)' };
  if (n.includes('acid'))                                                        return { type: 'acid',      flashColor: 'rgba(163,230,53,0.35)' };
  if (n.includes('poison'))                                                      return { type: 'poison',    flashColor: 'rgba(134,239,172,0.35)' };
  if (n.includes('necrotic') || n.includes('death'))                            return { type: 'necrotic',  flashColor: 'rgba(167,139,250,0.4)' };
  if (n.includes('radiant') || n.includes('holy'))                              return { type: 'radiant',   flashColor: 'rgba(253,224,71,0.4)' };
  if (n.includes('force') || n.includes('magic'))                               return { type: 'force',     flashColor: 'rgba(196,181,253,0.35)' };
  if (n.includes('psychic') || n.includes('mind'))                              return { type: 'psychic',   flashColor: 'rgba(249,168,212,0.4)' };
  if (n.includes('slash') || n.includes('sword') || n.includes('axe') || n.includes('blade') || n.includes('scimitar') || n.includes('dagger')) return { type: 'slash', flashColor: 'rgba(239,68,68,0.4)' };
  if (n.includes('pierc') || n.includes('arrow') || n.includes('bolt') || n.includes('spear') || n.includes('rapier')) return { type: 'pierce', flashColor: 'rgba(239,68,68,0.35)' };
  if (n.includes('bludgeon') || n.includes('hammer') || n.includes('maul') || n.includes('club')) return { type: 'blunt', flashColor: 'rgba(239,68,68,0.35)' };
  return { type: 'generic', flashColor: 'rgba(239,68,68,0.4)' };
}

// ── Web Audio procedural sounds ────────────────────────────────────
function createAudioCtx(): AudioContext | null {
  try { return new (window.AudioContext || (window as any).webkitAudioContext)(); }
  catch { return null; }
}

function playDamageSound(type: SoundProfile['type']) {
  const ctx = createAudioCtx();
  if (!ctx) return;

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.18, ctx.currentTime);
  masterGain.connect(ctx.destination);

  switch (type) {
    case 'slash':
    case 'pierce': {
      // Sharp metallic swoosh — white noise burst with pitch sweep
      const bufLen = ctx.sampleRate * 0.15;
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(type === 'pierce' ? 4000 : 2000, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(8000, ctx.currentTime + 0.1);
      src.connect(filter);
      filter.connect(masterGain);
      src.start();
      // Add a metal clang
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.08);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.08, ctx.currentTime);
      g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.connect(g2);
      g2.connect(masterGain);
      osc.start(); osc.stop(ctx.currentTime + 0.1);
      break;
    }
    case 'blunt': {
      // Deep thud — low boom with body
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.9, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(g); g.connect(masterGain);
      osc.start(); osc.stop(ctx.currentTime + 0.25);
      // Noise layer
      const bufLen = ctx.sampleRate * 0.12;
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
      const ns = ctx.createBufferSource();
      ns.buffer = buf;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 400;
      const ng = ctx.createGain();
      ng.gain.value = 0.5;
      ns.connect(lp); lp.connect(ng); ng.connect(masterGain);
      ns.start();
      break;
    }
    case 'fire': {
      // Crackle + whoosh
      for (let pass = 0; pass < 3; pass++) {
        const bufLen = ctx.sampleRate * (0.3 + pass * 0.05);
        const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 0.5);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 800 + pass * 400;
        filter.Q.value = 0.5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, ctx.currentTime + pass * 0.04);
        g.gain.linearRampToValueAtTime(0.4, ctx.currentTime + pass * 0.04 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4 + pass * 0.05);
        src.connect(filter); filter.connect(g); g.connect(masterGain);
        src.start(ctx.currentTime + pass * 0.04);
      }
      break;
    }
    case 'cold': {
      // Icy crystalline chime sweep
      [600, 800, 1100, 1400].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, ctx.currentTime + i * 0.03);
        g.gain.linearRampToValueAtTime(0.12, ctx.currentTime + i * 0.03 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.03 + 0.3);
        osc.connect(g); g.connect(masterGain);
        osc.start(ctx.currentTime + i * 0.03);
        osc.stop(ctx.currentTime + i * 0.03 + 0.35);
      });
      break;
    }
    case 'lightning':
    case 'thunder': {
      // Sharp crack + low rumble
      const bufLen = ctx.sampleRate * 0.05;
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 3000;
      const g = ctx.createGain();
      g.gain.value = 2;
      src.connect(hp); hp.connect(g); g.connect(masterGain);
      src.start();
      // Rumble
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(60, ctx.currentTime + 0.05);
      osc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.4);
      const rg = ctx.createGain();
      rg.gain.setValueAtTime(0.4, ctx.currentTime + 0.05);
      rg.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.connect(rg); rg.connect(masterGain);
      osc.start(ctx.currentTime + 0.05); osc.stop(ctx.currentTime + 0.5);
      break;
    }
    case 'acid': {
      // Bubbling sizzle
      for (let i = 0; i < 8; i++) {
        const t = ctx.currentTime + i * 0.025;
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 200 + Math.random() * 300;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.06, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.connect(g); g.connect(masterGain);
        osc.start(t); osc.stop(t + 0.1);
      }
      break;
    }
    case 'poison': {
      // Low warbling hiss
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(180, ctx.currentTime + 0.4);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 8;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 40;
      lfo.connect(lfoG); lfoG.connect(osc.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.15, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.connect(g); g.connect(masterGain);
      lfo.start(); osc.start(); lfo.stop(ctx.currentTime + 0.5); osc.stop(ctx.currentTime + 0.5);
      break;
    }
    case 'necrotic': {
      // Dark droning descend
      [80, 160, 240].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.5, ctx.currentTime + 0.5);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.06 - i * 0.015, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.connect(g); g.connect(masterGain);
        osc.start(); osc.stop(ctx.currentTime + 0.5);
      });
      break;
    }
    case 'radiant': {
      // Bright ringing ascend
      [880, 1320, 1760].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.02);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.1, ctx.currentTime + i * 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.02 + 0.4);
        osc.connect(g); g.connect(masterGain);
        osc.start(ctx.currentTime + i * 0.02);
        osc.stop(ctx.currentTime + i * 0.02 + 0.45);
      });
      break;
    }
    case 'force':
    case 'psychic': {
      // Deep resonant pulse
      const osc = ctx.createOscillator();
      osc.type = type === 'psychic' ? 'sine' : 'square';
      osc.frequency.setValueAtTime(type === 'psychic' ? 440 : 200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(type === 'psychic' ? 110 : 60, ctx.currentTime + 0.3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.15, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(g); g.connect(masterGain);
      osc.start(); osc.stop(ctx.currentTime + 0.4);
      break;
    }
    default: {
      // Generic hit — mid thump
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.15);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.connect(g); g.connect(masterGain);
      osc.start(); osc.stop(ctx.currentTime + 0.2);
    }
  }

  // Auto-close context
  setTimeout(() => { try { ctx.close(); } catch {} }, 2000);
}

// ── Component ───────────────────────────────────────────────────────
interface DamageEffectProps {
  currentHP: number;
  maxHP: number;
  lastDamageNotes?: string; // from action log, e.g. "fire damage" "slashing"
}

export default function DamageEffect({ currentHP, maxHP, lastDamageNotes }: DamageEffectProps) {
  const prevHP = useRef(currentHP);
  const [flash, setFlash] = React.useState<{ color: string; intensity: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerEffect = useCallback((delta: number, notes: string) => {
    const profile = getDamageProfile(notes);
    const pct = maxHP > 0 ? delta / maxHP : 0;
    const intensity = Math.min(1, 0.4 + pct * 2); // bigger hit = stronger flash

    setFlash({ color: profile.flashColor, intensity });
    playDamageSound(profile.type);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setFlash(null), 800);
  }, [maxHP]);

  useEffect(() => {
    const prev = prevHP.current;
    if (currentHP < prev) {
      // HP went down — damage taken
      const delta = prev - currentHP;
      triggerEffect(delta, lastDamageNotes ?? '');
    }
    prevHP.current = currentHP;
  }, [currentHP, triggerEffect, lastDamageNotes]);

  if (!flash) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        pointerEvents: 'none',
        // Radial vignette from edges inward
        background: `radial-gradient(ellipse at center, transparent 40%, ${flash.color.replace(')', `, ${flash.intensity})`).replace('rgba(', 'rgba(').replace(/0\.\d+\)$/, `${flash.intensity})`)} 100%)`,
        animation: 'damageFlash 0.8s ease-out forwards',
      }}
    />,
    document.body
  );
}

// Need React for useState
import React from 'react';
