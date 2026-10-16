/**
 * Estruturas low-poly procedurais (ART_DIRECTION 5, "Estruturas"): uma miniatura por
 * tipo, montada por composição. Cada peça tem um PAPEL de material; a cor da facção
 * entra só no papel `accent` (faixas e bandeiras). Nível = anéis na base (Structures.tsx),
 * não modelo diferente. O Centro da Vila é a peça "herói", mais detalhada.
 *
 * Escala: pegada ≈ raio 0.34 (Vila ≈ 0.46); y = 0 é o topo do tile.
 */
import type { BufferGeometry } from 'three';
import { ball, box, cone, cyl, dome, gable, merge, ring, wheel } from './primitives';

export const STRUCTURE_ROLES = ['body', 'roof', 'metal', 'dark', 'accent', 'glow'] as const;
export type StructureRole = (typeof STRUCTURE_ROLES)[number];
export type RoleParts = Partial<Record<StructureRole, BufferGeometry[]>>;
export type StructureGeometry = Partial<Record<StructureRole, BufferGeometry>>;

const TAU = Math.PI * 2;

function flag(x: number, z: number, h: number, ry = 0): RoleParts {
  return {
    metal: [cyl(0.008, 0.008, h, 5, { x, z })],
    accent: [
      box(0.11, 0.065, 0.006, { x: x + 0.055 * Math.cos(ry), y: h - 0.075, z: z - 0.055 * Math.sin(ry), ry }),
    ],
  };
}

function join(...sets: RoleParts[]): RoleParts {
  const out: RoleParts = {};
  for (const s of sets) {
    for (const role of STRUCTURE_ROLES) {
      const parts = s[role];
      if (parts) out[role] = [...(out[role] ?? []), ...parts];
    }
  }
  return out;
}

function village(): RoleParts {
  const habitats: RoleParts[] = [0.6, 2.2, 3.9].map((a) => {
    const x = Math.cos(a) * 0.28;
    const z = Math.sin(a) * 0.28;
    return {
      body: [cyl(0.065, 0.07, 0.08, 8, { x, z })],
      roof: [dome(0.065, 8, { x, y: 0.08, z })],
      glow: [
        box(0.03, 0.02, 0.005, {
          x: x + Math.cos(a) * 0.066,
          y: 0.035,
          z: z + Math.sin(a) * 0.066,
          ry: -a + Math.PI / 2,
        }),
      ],
    };
  });
  return join(
    {
      // Plataforma octogonal com a faixa da facção na borda.
      dark: [cyl(0.44, 0.46, 0.04, 8)],
      accent: [ring(0.445, 0.012, 8, { y: 0.03, ry: Math.PI / 8 }), cyl(0.19, 0.19, 0.025, 10, { y: 0.12 })],
      // Salão de comando + cúpula + janelas em anel.
      body: [cyl(0.17, 0.19, 0.2, 10, { y: 0.04 }), box(0.16, 0.1, 0.12, { x: -0.16, y: 0.04, z: 0.06 })],
      metal: [
        dome(0.17, 12, { y: 0.24 }),
        cyl(0.012, 0.016, 0.5, 6, { x: 0.18, y: 0.04, z: -0.2 }),
        cyl(0.004, 0.004, 0.18, 4, { x: 0.18, y: 0.32, z: -0.2, rz: 0.5 }),
        cyl(0.004, 0.004, 0.18, 4, { x: 0.18, y: 0.32, z: -0.2, rz: -0.5 }),
      ],
      glow: [
        ring(0.172, 0.012, 20, { y: 0.17 }),
        ball(0.022, 8, 6, { x: 0.18, y: 0.56, z: -0.2 }),
        box(0.12, 0.03, 0.005, { x: -0.16, y: 0.09, z: 0.121 }),
      ],
      roof: [box(0.17, 0.02, 0.13, { x: -0.16, y: 0.14, z: 0.06 }), cyl(0.04, 0.02, 0.04, 8, { y: 0.39 })],
    },
    {
      // Prato de antena.
      metal: [dome(0.07, 10, { x: 0.18, y: 0.42, z: -0.2, rx: -1.1 })],
      // Pista de pouso.
      dark: [cyl(0.11, 0.11, 0.012, 6, { x: 0.22, y: 0.04, z: 0.22 })],
    },
    { accent: [ring(0.09, 0.006, 6, { x: 0.22, y: 0.054, z: 0.22 })] },
    ...habitats,
    flag(-0.3, -0.22, 0.42),
  );
}

function park(): RoleParts {
  return join(
    {
      body: [box(0.3, 0.12, 0.2, { x: -0.04 })],
      roof: [gable(0.32, 0.08, 0.22, { x: -0.04, y: 0.12 })],
      metal: [
        cyl(0.065, 0.065, 0.28, 10, { x: 0.18, z: -0.06 }),
        cone(0.068, 0.06, 10, { x: 0.18, y: 0.28, z: -0.06 }),
      ],
      accent: [
        cyl(0.067, 0.067, 0.03, 10, { x: 0.18, y: 0.18, z: -0.06 }),
        box(0.302, 0.025, 0.202, { x: -0.04, y: 0.07 }),
      ],
      dark: [
        box(0.26, 0.02, 0.05, { x: 0.02, y: 0.16, z: 0.13, rz: -0.35 }),
        box(0.06, 0.1, 0.005, { x: -0.04, z: 0.101 }),
      ],
      glow: [box(0.05, 0.025, 0.005, { x: -0.13, y: 0.075, z: 0.101 })],
    },
    { body: [box(0.07, 0.05, 0.07, { x: 0.17, z: 0.14 }), box(0.06, 0.04, 0.06, { x: 0.24, z: 0.16 })] },
  );
}

function quarry(): RoleParts {
  return {
    body: [
      box(0.38, 0.06, 0.3),
      box(0.28, 0.06, 0.22, { x: -0.03, y: 0.06 }),
      box(0.18, 0.06, 0.14, { x: -0.05, y: 0.12 }),
    ],
    dark: [box(0.1, 0.03, 0.08, { x: 0.11, y: 0.06, z: 0.06 })],
    metal: [
      cyl(0.015, 0.02, 0.42, 6, { x: 0.16, z: -0.1 }),
      box(0.36, 0.02, 0.02, { x: 0.06, y: 0.4, z: -0.1 }),
      cyl(0.002, 0.002, 0.2, 3, { x: -0.1, y: 0.2, z: -0.1 }),
    ],
    accent: [
      box(0.06, 0.06, 0.06, { x: 0.16, y: 0.34, z: -0.1 }),
      box(0.04, 0.03, 0.04, { x: -0.1, y: 0.17, z: -0.1 }),
    ],
    glow: [box(0.04, 0.02, 0.005, { x: 0.16, y: 0.37, z: -0.069 })],
  };
}

function mine(): RoleParts {
  const leg = (x: number, rz: number) => box(0.025, 0.42, 0.025, { x, rz });
  return {
    metal: [
      leg(-0.07, -0.18),
      leg(0.07, 0.18),
      box(0.025, 0.4, 0.025, { x: 0, z: 0.08, rx: -0.25 }),
      box(0.12, 0.025, 0.06, { y: 0.39 }),
      wheel(0.07, 0.012, 14, { y: 0.44 }),
    ],
    dark: [cyl(0.09, 0.1, 0.03, 10), cyl(0.06, 0.06, 0.01, 10, { y: 0.03 })],
    body: [box(0.16, 0.1, 0.14, { x: 0.2, z: 0.08 })],
    roof: [gable(0.18, 0.06, 0.16, { x: 0.2, y: 0.1, z: 0.08 })],
    accent: [box(0.162, 0.02, 0.142, { x: 0.2, y: 0.06, z: 0.08 }), wheel(0.04, 0.008, 10, { y: 0.44 })],
    glow: [ball(0.018, 8, 6, { y: 0.47, z: 0.03 }), box(0.04, 0.025, 0.005, { x: 0.2, y: 0.03, z: 0.151 })],
  };
}

function workshop(): RoleParts {
  return {
    body: [box(0.34, 0.14, 0.24)],
    roof: [-0.11, 0, 0.11].map((x) => gable(0.24, 0.07, 0.11, { x, y: 0.14, ry: Math.PI / 2 })),
    dark: [cyl(0.025, 0.03, 0.34, 8, { x: 0.13, z: -0.08 }), box(0.08, 0.09, 0.005, { z: 0.121 })],
    accent: [
      box(0.342, 0.025, 0.242, { y: 0.1 }),
      cyl(0.031, 0.031, 0.03, 8, { x: 0.13, y: 0.28, z: -0.08 }),
    ],
    glow: [-0.11, 0.11].map((x) => box(0.05, 0.04, 0.005, { x, y: 0.04, z: 0.121 })),
    metal: [box(0.06, 0.05, 0.06, { x: -0.22, z: 0.12 })],
  };
}

function outpost(): RoleParts {
  return join(
    {
      dark: [cyl(0.12, 0.13, 0.03, 6)],
      body: [cyl(0.05, 0.075, 0.42, 6, { y: 0.03 })],
      metal: [
        cyl(0.12, 0.12, 0.025, 6, { y: 0.45 }),
        ring(0.115, 0.006, 6, { y: 0.51 }),
        cone(0.09, 0.08, 6, { y: 0.58 }),
      ],
      accent: [cyl(0.056, 0.058, 0.04, 6, { y: 0.32 }), cyl(0.07, 0.072, 0.03, 6, { y: 0.12 })],
      glow: [ball(0.025, 8, 6, { y: 0.5 })],
    },
    {
      metal: [0, 2, 4].map((i) =>
        cyl(0.004, 0.004, 0.06, 3, {
          x: Math.cos((i * TAU) / 6) * 0.11,
          y: 0.47,
          z: Math.sin((i * TAU) / 6) * 0.11,
        }),
      ),
    },
    flag(0, 0, 0.78),
  );
}

function wall(): RoleParts {
  const segs = 5;
  const body: BufferGeometry[] = [];
  const dark: BufferGeometry[] = [];
  for (let i = 0; i < segs; i++) {
    const a = -0.9 + (i / (segs - 1)) * 1.8;
    const x = Math.sin(a) * 0.3;
    const z = Math.cos(a) * 0.3 - 0.12;
    body.push(box(0.13, 0.14, 0.06, { x, z, ry: a }));
    for (const off of [-0.04, 0.04]) {
      body.push(
        box(0.035, 0.035, 0.065, { x: x + Math.cos(a) * off, y: 0.14, z: z - Math.sin(a) * off, ry: a }),
      );
    }
    dark.push(box(0.135, 0.015, 0.065, { x, z, ry: a }));
  }
  return join(
    {
      body,
      dark,
      metal: [
        cyl(0.05, 0.055, 0.22, 8, { x: -0.25, z: 0.07 }),
        cyl(0.05, 0.055, 0.22, 8, { x: 0.25, z: 0.07 }),
      ],
    },
    { accent: [box(0.06, 0.09, 0.008, { y: 0.03, z: 0.185 })] },
    {
      roof: [
        cone(0.06, 0.06, 8, { x: -0.25, y: 0.22, z: 0.07 }),
        cone(0.06, 0.06, 8, { x: 0.25, y: 0.22, z: 0.07 }),
      ],
    },
  );
}

function barracks(): RoleParts {
  return join(
    {
      body: [box(0.4, 0.12, 0.18)],
      roof: [gable(0.42, 0.08, 0.2, { y: 0.12 })],
      dark: [box(0.07, 0.08, 0.005, { z: 0.091 }), box(0.46, 0.015, 0.24)],
      accent: [box(0.402, 0.025, 0.182, { y: 0.08 })],
      glow: [-0.13, 0.13].map((x) => box(0.05, 0.03, 0.005, { x, y: 0.05, z: 0.091 })),
      metal: [box(0.06, 0.04, 0.06, { x: 0.15, z: 0.17 }), box(0.06, 0.04, 0.06, { x: 0.22, z: 0.18 })],
    },
    flag(-0.18, 0.16, 0.36),
  );
}

function university(): RoleParts {
  const cols = [-0.12, -0.04, 0.04, 0.12].map((x) => cyl(0.016, 0.016, 0.13, 8, { x, y: 0.03, z: 0.1 }));
  return {
    dark: [box(0.36, 0.03, 0.28)],
    body: [box(0.32, 0.16, 0.16, { y: 0.03, z: -0.03 }), ...cols, box(0.32, 0.03, 0.06, { y: 0.16, z: 0.1 })],
    roof: [gable(0.34, 0.06, 0.08, { y: 0.19, z: 0.1, ry: 0 })],
    metal: [dome(0.1, 12, { y: 0.19, z: -0.03 }), cyl(0.1, 0.1, 0.02, 12, { y: 0.19, z: -0.03 })],
    accent: [box(0.322, 0.025, 0.162, { y: 0.14, z: -0.03 }), box(0.02, 0.09, 0.005, { y: 0.24, z: 0.061 })],
    glow: [box(0.05, 0.05, 0.005, { y: 0.06, z: 0.051 }), ball(0.012, 6, 4, { y: 0.3, z: -0.03 })],
  };
}

function archive(): RoleParts {
  return {
    dark: [cyl(0.25, 0.27, 0.05, 8)],
    body: [cyl(0.2, 0.22, 0.1, 8, { y: 0.05 }), cyl(0.14, 0.16, 0.1, 8, { y: 0.15 })],
    roof: [cyl(0.09, 0.11, 0.07, 8, { y: 0.25 })],
    accent: [cyl(0.205, 0.205, 0.02, 8, { y: 0.11 }), cyl(0.145, 0.145, 0.02, 8, { y: 0.21 })],
    glow: [cyl(0.02, 0.03, 0.22, 6, { y: 0.32 }), ring(0.16, 0.006, 16, { y: 0.07 })],
    metal: [cone(0.04, 0.08, 6, { y: 0.54 })],
  };
}

function market(): RoleParts {
  const stalls = [
    { x: -0.15, z: 0.02, a: 0 },
    { x: 0.13, z: -0.08, a: 0.5 },
    { x: 0.08, z: 0.17, a: -0.4 },
  ];
  return {
    body: stalls.map((s) => box(0.14, 0.07, 0.1, { x: s.x, z: s.z, ry: s.a })),
    metal: stalls.flatMap((s) => [
      cyl(0.005, 0.005, 0.15, 4, { x: s.x - 0.06, z: s.z }),
      cyl(0.005, 0.005, 0.15, 4, { x: s.x + 0.06, z: s.z }),
    ]),
    accent: [
      cone(0.12, 0.07, 4, { x: -0.15, y: 0.15, z: 0.02, ry: Math.PI / 4 }),
      cone(0.11, 0.07, 4, { x: 0.08, y: 0.15, z: 0.17, ry: Math.PI / 4 - 0.4 }),
    ],
    roof: [cone(0.11, 0.07, 4, { x: 0.13, y: 0.15, z: -0.08, ry: Math.PI / 4 + 0.5 })],
    dark: [
      box(0.05, 0.05, 0.05, { x: -0.02, z: -0.2 }),
      box(0.04, 0.04, 0.04, { x: 0.03, z: -0.24 }),
      box(0.04, 0.04, 0.04, { x: 0.25, z: 0.06 }),
    ],
    glow: [ball(0.015, 6, 4, { x: -0.15, y: 0.12, z: 0.02 })],
  };
}

/** Peça genérica para um tipo sem modelo (nunca quebra — CLAUDE.md regra 7). */
function fallback(): RoleParts {
  return {
    body: [box(0.22, 0.16, 0.22)],
    roof: [gable(0.24, 0.07, 0.24, { y: 0.16 })],
    accent: [box(0.222, 0.02, 0.222, { y: 0.1 })],
  };
}

const BUILDERS: Record<string, () => RoleParts> = {
  village,
  park,
  quarry,
  mine,
  workshop,
  outpost,
  wall,
  barracks,
  university,
  archive,
  market,
};

/** Raio da pegada (para anéis de nível e espaçamento). */
export function structureFootprint(type: string): number {
  return type === 'village' ? 0.47 : 0.34;
}

/** Raio do anel de nível k (0, 1, 2) na base da estrutura (ART_DIRECTION 5). */
export const levelRingRadius = (type: string, k: number) => structureFootprint(type) + 0.05 + k * 0.035;

const ringCache = new Map<string, BufferGeometry>();
export function levelRingGeometry(radius: number): BufferGeometry {
  const k = radius.toFixed(3);
  let g = ringCache.get(k);
  if (!g) {
    g = ring(radius, 0.009, 40, { y: 0.01 });
    ringCache.set(k, g);
  }
  return g;
}

const cache = new Map<string, StructureGeometry>();

export function structureGeometry(type: string): StructureGeometry {
  const hit = cache.get(type);
  if (hit) return hit;
  const parts = (BUILDERS[type] ?? fallback)();
  const out: StructureGeometry = {};
  for (const role of STRUCTURE_ROLES) {
    const list = parts[role];
    if (list && list.length > 0) out[role] = merge(list);
  }
  cache.set(type, out);
  return out;
}
