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
  {
    id: 'obsidian',
    name: 'Obsidian',
    free: false,
    faces: {
      4:{f:0x0c0612,e:0xa78bfa}, 6:{f:0x080808,e:0xf87171},
      8:{f:0x030e08,e:0x4ade80}, 10:{f:0x030a14,e:0x60a5fa},
      12:{f:0x100224,e:0xe879f9}, 20:{f:0x0a0a0a,e:0xf1f5f9},
      100:{f:0x080808,e:0xf87171},1001:{f:0x0a0a0a,e:0x94a3b8},1002:{f:0x120000,e:0xfca5a5},
    },
    metalness:0.0, roughness:0.9, emissiveMult:0.0,
    clearcoat:0.0,
    numColor:'#e0e0e0', numOutline:'rgba(0,0,0,0.98)',
  },
  {
    id: 'gold',
    name: 'Dragon Gold',
    free: false,
    faces: {
      4:{f:0xe07b00,e:0xfef3c7}, 6:{f:0xc26a00,e:0xfde68a},
      8:{f:0xe07b00,e:0xfef08a}, 10:{f:0xa85c00,e:0xfef9c3},
      12:{f:0xe07b00,e:0xffedd5}, 20:{f:0xf59e0b,e:0xfed7aa},
      100:{f:0xc26a00,e:0xfde68a},1001:{f:0x6b6460,e:0xfef3c7},1002:{f:0xcc2000,e:0xffedd5},
    },
    metalness:0.98, roughness:0.04, emissiveMult:0.0,
    clearcoat:1.0, clearcoatRoughness:0.02,
    numColor:'#1a0800', numOutline:'rgba(60,20,0,0.6)',
  },
  {
    id: 'ice',
    name: 'Glacial Ice',
    free: false,
    faces: {
      4:{f:0x7dd3fc,e:0xe0f2fe}, 6:{f:0x38bdf8,e:0xf0f9ff},
      8:{f:0x0ea5e9,e:0xbae6fd}, 10:{f:0x0284c7,e:0xe0f2fe},
      12:{f:0x0369a1,e:0xcffafe}, 20:{f:0xbae6fd,e:0x0ea5e9},
      100:{f:0x38bdf8,e:0xf0f9ff},1001:{f:0x0c4a6e,e:0xe0f2fe},1002:{f:0x0284c7,e:0xbae6fd},
    },
    metalness:0.0, roughness:0.02, emissiveMult:0.0,
    clearcoat:1.0, clearcoatRoughness:0.0,
    transmission:0.65, ior:1.45,
    numColor:'#ffffff', numOutline:'rgba(0,60,120,0.85)',
  },
  {
    id: 'blood',
    name: 'Blood Moon',
    free: false,
    faces: {
      4:{f:0x6b0000,e:0xfca5a5}, 6:{f:0x3d0000,e:0xfecaca},
      8:{f:0x850000,e:0xfee2e2}, 10:{f:0x6b0000,e:0xfca5a5},
      12:{f:0x350000,e:0xef4444}, 20:{f:0xcc1a1a,e:0xffe4e4},
      100:{f:0x3d0000,e:0xfecaca},1001:{f:0x1a1412,e:0xfca5a5},1002:{f:0x6b0000,e:0xef4444},
    },
    metalness:0.45, roughness:0.28, emissiveMult:0.2,
    clearcoat:0.7, clearcoatRoughness:0.25,
    numColor:'#ffffff', numOutline:'rgba(0,0,0,0.95)',
  },
];
