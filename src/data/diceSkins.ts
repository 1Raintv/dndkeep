// Dice skin data — extracted from DiceRoller3D.tsx so consumers like QuickRoll
// can import this without pulling in three.js + cannon-es (~600 KB) just to
// render a skin selector.
export interface DiceSkin {
  id: string;
  name: string;
  free: boolean;
  faces: Record<number, { f: number; e: number }>;
  metalness: number;
  roughness: number;
  emissiveMult: number;
  clearcoat?: number;       // 0-1 lacquer gloss layer
  clearcoatRoughness?: number;
  transmission?: number;    // 0-1 for gem/glass see-through
  ior?: number;             // index of refraction (glass=1.5, diamond=2.4)
  numColor?: string;        // number fill color (default: white)
  numOutline?: string;      // number outline color (default: black)
}

export const DICE_SKINS: DiceSkin[] = [
  {
    id: 'classic',
    name: 'Classic',
    free: true,
    faces: {
      4:{f:0x7c3aed,e:0xede9fe}, 6:{f:0xdc2626,e:0xfee2e2},
      8:{f:0x16a34a,e:0xdcfce7}, 10:{f:0x1d4ed8,e:0xdbeafe},
      12:{f:0xbe185d,e:0xfce7f3}, 20:{f:0xb45309,e:0xfef3c7},
      100:{f:0xdc2626,e:0xfee2e2},
      1001:{f:0x334155,e:0xf8fafc},1002:{f:0x991b1b,e:0xfee2e2},
    },
    metalness:0.0, roughness:0.12, emissiveMult:0.0,
    clearcoat:1.0, clearcoatRoughness:0.04,
    numColor:'#ffffff', numOutline:'rgba(0,0,0,0.95)',
  },
  // v2.682.0 — The paid set is Crimson / Emerald / Sapphire, replacing the
  // previous Obsidian / Dragon Gold / Glacial Ice / Blood Moon.
  //
  // WHY THE SWAP WAS FREE. The old four were only ever purchasable through the
  // `buy-dice-skin` edge function, which the Store page never used, and
  // `dice_skin_unlocks` was empty in production — nobody had ever bought one.
  // Retiring them therefore took nothing away from anyone. The app previously
  // shipped two different paid-dice catalogues (this file's four, and the Store
  // page's three); this is the consolidation onto one.
  //
  // Cut as gemstones — transmission plus a hard clearcoat, using the real index
  // of refraction for each stone — because they are named after gems and the
  // `ice` skin proved the transmission path reads well. Each set shifts shade
  // per die size so a handful of mixed dice stays legible rather than becoming
  // one red blob.
  //
  // DELIBERATELY NOT FINISHED. Owner's call: the paid dice need to be properly
  // shiny and eye-catching, and that work is deferred until after the launch
  // build-out — see "Deferred polish — paid dice cosmetics" in docs/ROADMAP.md.
  // These are a solid, consistent baseline, not the final look. The lever when
  // it is picked up is the material treatment here plus an environment map;
  // right now there is nothing in the scene for them to reflect, which is most
  // of why they still read flatter than they should.
  {
    id: 'crimson',
    name: 'Crimson',
    free: false,
    faces: {
      4:{f:0x9f0712,e:0xfecaca}, 6:{f:0x7f0410,e:0xfda4af},
      8:{f:0xb91c1c,e:0xfee2e2}, 10:{f:0x86091a,e:0xfecdd3},
      12:{f:0x6d0312,e:0xfda4af}, 20:{f:0xdc2626,e:0xffe4e6},
      100:{f:0x7f0410,e:0xfda4af},1001:{f:0x4c0519,e:0xfecdd3},1002:{f:0xa30d1a,e:0xffe4e6},
    },
    metalness:0.0, roughness:0.05, emissiveMult:0.06,
    clearcoat:1.0, clearcoatRoughness:0.02,
    transmission:0.5, ior:1.77,          // ruby
    numColor:'#ffffff', numOutline:'rgba(60,0,10,0.92)',
  },
  {
    id: 'emerald',
    name: 'Emerald',
    free: false,
    faces: {
      4:{f:0x047857,e:0xd1fae5}, 6:{f:0x065f46,e:0xa7f3d0},
      8:{f:0x059669,e:0xecfdf5}, 10:{f:0x036b4a,e:0xbbf7d0},
      12:{f:0x044e3b,e:0xa7f3d0}, 20:{f:0x10b981,e:0xd1fae5},
      100:{f:0x065f46,e:0xa7f3d0},1001:{f:0x022c22,e:0xbbf7d0},1002:{f:0x047857,e:0xecfdf5},
    },
    metalness:0.0, roughness:0.05, emissiveMult:0.06,
    clearcoat:1.0, clearcoatRoughness:0.02,
    transmission:0.5, ior:1.58,          // emerald (beryl)
    numColor:'#ffffff', numOutline:'rgba(0,45,30,0.92)',
  },
  {
    id: 'sapphire',
    name: 'Sapphire',
    free: false,
    faces: {
      4:{f:0x1d4ed8,e:0xdbeafe}, 6:{f:0x1e3a8a,e:0xbfdbfe},
      8:{f:0x2563eb,e:0xeff6ff}, 10:{f:0x1b3f9e,e:0xc7d7fe},
      12:{f:0x172e6b,e:0xbfdbfe}, 20:{f:0x3b82f6,e:0xdbeafe},
      100:{f:0x1e3a8a,e:0xbfdbfe},1001:{f:0x0f1f4d,e:0xc7d7fe},1002:{f:0x1d4ed8,e:0xeff6ff},
    },
    metalness:0.0, roughness:0.05, emissiveMult:0.06,
    clearcoat:1.0, clearcoatRoughness:0.02,
    transmission:0.5, ior:1.77,          // sapphire (corundum)
    numColor:'#ffffff', numOutline:'rgba(0,15,60,0.92)',
  },
];
