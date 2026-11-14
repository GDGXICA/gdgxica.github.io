// The hero's WebGL picture: an aerial survey of one of two sites in Ica, at
// night, seen low over the ground with the horizon and the sky in frame.
//
// - "colibri": the Nazca pampa, flat and gridded, with the hummingbird
//   geoglyph traced on it in ochre and light running along the line.
// - "huacachina": the oasis, its dunes drawn as topographic contour lines
//   round the lagoon, whose shore glows the same way.
//
// The hero picks one at random per visit and lets the visitor switch. Both
// are only fully legible from the air, so as the hero scrolls away the
// camera lifts from the grazing view towards the zenith.
//
// Loaded with a dynamic import from the hero only when WebGL is worth it
// (see Hero.astro), so `three` never reaches the critical path. Every
// resource created here is released by the controller's dispose().

import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  ConeGeometry,
  CatmullRomCurve3,
  Color,
  Float32BufferAttribute,
  FogExp2,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  DoubleSide,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  ShaderMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  UniformsLib,
  UniformsUtils,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { COLIBRI_POINTS } from "@/lib/colibri";

export type SceneVariant = "colibri" | "huacachina";

export interface SceneController {
  setVariant: (variant: SceneVariant) => void;
  dispose: () => void;
}

interface Options {
  /** Render one still frame and stop: prefers-reduced-motion. */
  still: boolean;
  /** Called once the first frame is on screen, to swap out the fallback. */
  onReady: () => void;
  /** The empty box in the layout the subject should sit in. */
  anchor?: HTMLElement | null;
  variant: SceneVariant;
}

const NIGHT = new Color("#070b16");
const OCHRE = new Color("#d4ad62");
const SHORE = new Color("#e9dcc0");
/** The current along a line: sand-white light, not a second palette. */
const PULSE = new Color("#fff1d2");

/** How each site is framed: its size on screen and the camera's pitch. */
/**
 * How each site is framed: how much of it must fit the layout's empty box,
 * the camera's pitch, and how far the camera may close in on a large screen.
 */
const FRAMING: Record<
  SceneVariant,
  { extent: number; elevation: number; maxZoom: number }
> = {
  // Low enough for the horizon and the relief, high enough to read the bird.
  colibri: { extent: 110, elevation: 22, maxZoom: 1 },
  // Framed on the lagoon and its palms, as if standing on the near dune;
  // the ring of dunes runs out past the edges, the far crests on the sky.
  huacachina: { extent: 128, elevation: 24, maxZoom: 2 },
};

const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

function buildStars(count: number): Points {
  const positions: number[] = [];
  // Deterministic, so the sky does not reshuffle between visits.
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < count; i++) {
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(1 - rand() * 0.92);
    const r = 420;
    positions.push(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi) + 4,
      r * Math.sin(phi) * Math.sin(theta)
    );
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return new Points(
    geometry,
    new PointsMaterial({
      color: "#ecebe2",
      size: 1.6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      fog: false,
    })
  );
}

/** A glowing closed line with light travelling along it. */
function glowingLine(
  points: Vector3[],
  base: Color,
  time: { value: number },
  radius: number,
  segments: number
): Group {
  const curve = new CatmullRomCurve3(points, true, "centripetal");
  const makeMaterial = (strength: number) =>
    new ShaderMaterial({
      uniforms: {
        uTime: time,
        uStrength: { value: strength },
        uBase: { value: base },
        uPulse: { value: PULSE },
      },
      vertexShader: /* glsl */ `
        varying float vAlong;
        void main() {
          vAlong = uv.x;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uStrength;
        uniform vec3 uBase;
        uniform vec3 uPulse;
        varying float vAlong;
        void main() {
          vec3 color = uBase * 0.62;
          for (int i = 0; i < 4; i++) {
            float head = fract(uTime * 0.03 + float(i) * 0.25);
            float behind = fract(head - vAlong);
            color += uPulse * exp(-behind * 60.0) * 1.5;
          }
          gl_FragColor = vec4(color * uStrength, 1.0);
          #include <colorspace_fragment>
        }
      `,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });

  const group = new Group();
  const halo = new Mesh(
    new TubeGeometry(curve, Math.round(segments / 2), radius * 2.3, 6, true),
    makeMaterial(0.12)
  );
  halo.renderOrder = -1;
  group.add(
    halo,
    new Mesh(
      new TubeGeometry(curve, segments, radius, 6, true),
      makeMaterial(1)
    )
  );
  return group;
}

/* ------------------------------------------------------------------ */
/* The Nazca pampa                                                     */
/* ------------------------------------------------------------------ */

/** Dunes all round, flattening into the pampa the figure is drawn on. */
function pampaHeight(x: number, z: number): number {
  const dunes =
    4.2 * Math.sin(x * 0.04 + z * 0.018) +
    2.6 * Math.sin(z * 0.06 - x * 0.028) +
    0.9 * Math.sin((x + z) * 0.11);
  return dunes * smooth(52, 97, Math.hypot(x, z)) - 0.4;
}

function buildPampa(time: { value: number }, small: boolean): Site {
  const group = new Group();
  const size = 420;
  const half = size / 2;

  // Survey points. On phones the camera is zoomed far out, which would blow
  // the nearest points up into squares, so there they keep a fixed size.
  const steps = small ? 120 : 190;
  const points: number[] = [];
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const x = -half + (i / steps) * size;
      const z = -half + (j / steps) * size;
      points.push(x, pampaHeight(x, z), z);
    }
  }
  const pointsGeometry = new BufferGeometry();
  pointsGeometry.setAttribute(
    "position",
    new Float32BufferAttribute(points, 3)
  );
  group.add(
    new Points(
      pointsGeometry,
      new PointsMaterial({
        color: "#8a93a6",
        size: small ? 1.4 : 0.38,
        sizeAttenuation: !small,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    )
  );

  // A survey grid draped over the relief, so the eye reads depth.
  const spacing = 10;
  const sample = small ? 4 : 2.5;
  const lines: number[] = [];
  for (let a = -half; a <= half; a += spacing) {
    for (let b = -half; b < half; b += sample) {
      lines.push(a, pampaHeight(a, b) + 0.05, b);
      lines.push(a, pampaHeight(a, b + sample) + 0.05, b + sample);
      lines.push(b, pampaHeight(b, a) + 0.05, a);
      lines.push(b + sample, pampaHeight(b + sample, a) + 0.05, a);
    }
  }
  const gridGeometry = new BufferGeometry();
  gridGeometry.setAttribute("position", new Float32BufferAttribute(lines, 3));
  group.add(
    new LineSegments(
      gridGeometry,
      new LineBasicMaterial({
        color: "#3b4c6b",
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    )
  );

  // The geoglyph, in the reference's orientation: beak up and to the left,
  // which on the ground means far and to the left.
  group.add(
    glowingLine(
      COLIBRI_POINTS.map(([x, y]) => new Vector3(x, 0.2, -y)),
      OCHRE,
      time,
      0.3,
      3600
    )
  );
  return { group };
}

/* ------------------------------------------------------------------ */
/* The Huacachina oasis                                                */
/* ------------------------------------------------------------------ */

/**
 * A lagoon in a bowl of dunes: flat water and shore in the middle, a ring of
 * dunes highest to the west and south, rippled crests, and rolling sand
 * beyond. The bowl is a little longer north–south, like the real one.
 */
/**
 * One ring of dunes round a point: a crest line that wanders round the
 * ring, a long concave climb from the inside up to a sharp crest, and a
 * steeper slip face falling away outside. `floor` is where the climb starts.
 */
function duneRing(
  r: number,
  floor: number,
  crest: number,
  height: number
): number {
  if (r <= floor) return 0;
  if (r <= crest) {
    const t = (r - floor) / (crest - floor);
    return height * Math.pow(t, 1.7);
  }
  const fall = Math.max(0, 1 - (r - crest) / 32);
  return height * Math.pow(fall, 1.5);
}

/**
 * The oasis: a lagoon on a flat floor, ringed all the way round by dunes
 * with sharp, wandering crests, peaks and saddles, and a lower ring of dunes
 * beyond on the horizon.
 */
function oasisHeight(x: number, z: number): number {
  const r = Math.hypot(x, z * 0.82);
  const a = Math.atan2(z, x);
  const crest = 138 + 14 * Math.sin(3 * a + 0.7) + 7 * Math.sin(7 * a + 2.1);
  const peak = 30 + 9 * Math.sin(2 * a + 0.9) + 6 * Math.sin(5 * a + 1.7);
  const inner = duneRing(r, 62, crest, peak);
  const crest2 = 236 + 22 * Math.sin(4 * a + 1.1) + 9 * Math.sin(9 * a);
  const peak2 = 24 + 8 * Math.sin(3 * a + 2.4);
  const outer = duneRing(r, crest + 18, crest2, peak2);
  // small undulations on the slopes, none on the floor round the water
  const slopes = smooth(62, 100, r);
  const ripples =
    slopes *
    (2.2 * Math.sin(x * 0.07 + z * 0.03) +
      1.3 * Math.sin(z * 0.11 - x * 0.05) +
      0.6 * Math.sin((x - z) * 0.19));
  return Math.max(inner, outer) + ripples - 0.4;
}

/**
 * Contour lines of a height field, by marching squares: for each level, a
 * segment through every grid cell the level crosses.
 */
function contours(
  height: (x: number, z: number) => number,
  size: number,
  steps: number,
  levels: number[]
): number[] {
  const half = size / 2;
  const cell = size / steps;
  const h: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    h[i] = [];
    for (let j = 0; j <= steps; j++) {
      h[i][j] = height(-half + i * cell, -half + j * cell);
    }
  }
  const out: number[] = [];
  const lift = 0.06;
  for (const level of levels) {
    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < steps; j++) {
        // corners: a (i,j) b (i+1,j) c (i+1,j+1) d (i,j+1)
        const va = h[i][j] - level;
        const vb = h[i + 1][j] - level;
        const vc = h[i + 1][j + 1] - level;
        const vd = h[i][j + 1] - level;
        const x0 = -half + i * cell;
        const z0 = -half + j * cell;
        const crossings: [number, number][] = [];
        const edge = (
          v1: number,
          v2: number,
          p1: [number, number],
          p2: [number, number]
        ) => {
          if (v1 < 0 === v2 < 0) return;
          const t = v1 / (v1 - v2);
          crossings.push([
            p1[0] + (p2[0] - p1[0]) * t,
            p1[1] + (p2[1] - p1[1]) * t,
          ]);
        };
        edge(va, vb, [x0, z0], [x0 + cell, z0]);
        edge(vb, vc, [x0 + cell, z0], [x0 + cell, z0 + cell]);
        edge(vc, vd, [x0 + cell, z0 + cell], [x0, z0 + cell]);
        edge(vd, va, [x0, z0 + cell], [x0, z0]);
        // two crossings make a segment; four (a saddle) make two
        for (let k = 0; k + 1 < crossings.length; k += 2) {
          out.push(crossings[k][0], level + lift, crossings[k][1]);
          out.push(crossings[k + 1][0], level + lift, crossings[k + 1][1]);
        }
      }
    }
  }
  return out;
}

/** Drawn larger than life so the lagoon reads at the hero's scale. */
const LAGOON_SCALE = 3.2;

/** The lagoon's shore: long and a little bent, wider at the north. */
const LAGOON: readonly [number, number][] = [
  [-1, -19],
  [3.5, -17.5],
  [6.5, -13],
  [7.2, -7],
  [6, -1.5],
  [7.5, 4],
  [8.5, 10],
  [6.5, 15.5],
  [2, 18.5],
  [-2.5, 17],
  [-5, 12.5],
  [-4.5, 7],
  [-6.5, 2],
  [-7.5, -4.5],
  [-6.5, -11],
  [-4.5, -16],
];

/** A site's geometry, plus whatever moves in it frame by frame. */
interface Site {
  group: Group;
  update?: (seconds: number) => void;
}

/** A soft round dot, so point lights are not drawn as squares. */
function dotTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const glow = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  glow.addColorStop(0, "rgba(255,255,255,1)");
  glow.addColorStop(0.25, "rgba(255,255,255,0.85)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

/** Collects line segments into one geometry, for one draw call. */
function lineSet() {
  const out: number[] = [];
  return {
    add(a: Vector3, b: Vector3) {
      out.push(a.x, a.y, a.z, b.x, b.y, b.z);
    },
    /** A polyline through f(0)…f(1) in `steps` pieces. */
    curve(f: (t: number) => Vector3, steps: number) {
      let prev = f(0);
      for (let i = 1; i <= steps; i++) {
        const next = f(i / steps);
        this.add(prev, next);
        prev = next;
      }
    },
    build(color: string, opacity: number): LineSegments {
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new Float32BufferAttribute(out, 3));
      return new LineSegments(
        geometry,
        new LineBasicMaterial({
          color,
          transparent: true,
          opacity,
          depthWrite: false,
        })
      );
    },
  };
}

/**
 * Date palms round the water, in the survey's line art: a leaning trunk
 * with thickness and the rings its old leaf bases leave, and a crown of
 * pinnate fronds, each a curved midrib with leaflets hanging off both
 * sides, the young ones pointing up. Larger than life, like the lagoon, so
 * they read from the air. Trunks and crowns are one geometry each.
 */
function buildPalms(count: number): Group {
  const rand = seeded(23);
  const trunks = lineSet();
  const crowns = lineSet();
  const rx = 8 * LAGOON_SCALE;
  const rz = 17.5 * LAGOON_SCALE;
  const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rand() * 0.22;
    const k = 1.14 + rand() * 0.36;
    const x = Math.cos(angle) * rx * k;
    const z = Math.sin(angle) * rz * k;
    const base = v(x, Math.max(0, oasisHeight(x, z)), z);
    const height = 8 + rand() * 4.5;
    const leanAngle = rand() * Math.PI * 2;
    const lean = 1 + rand() * 1.6;
    const lx = Math.cos(leanAngle);
    const lz = Math.sin(leanAngle);
    const axis = (t: number) =>
      v(
        base.x + lx * lean * t * t,
        base.y + height * t,
        base.z + lz * lean * t * t
      );

    // The trunk as two edges, tapering a little, and its rings.
    const radius = (t: number) => 0.32 - 0.1 * t;
    const sideX = -lz;
    const sideZ = lx;
    for (const side of [-1, 1]) {
      trunks.curve((t) => {
        const c = axis(t);
        return v(
          c.x + sideX * radius(t) * side,
          c.y,
          c.z + sideZ * radius(t) * side
        );
      }, 6);
    }
    for (let r = 1; r < 9; r++) {
      const t = r / 9;
      const c = axis(t);
      const w = radius(t);
      trunks.add(
        v(c.x - sideX * w, c.y - 0.06, c.z - sideZ * w),
        v(c.x + sideX * w, c.y + 0.06, c.z + sideZ * w)
      );
    }

    // The crown.
    const top = axis(1);
    const fronds = 9 + Math.floor(rand() * 3);
    for (let f = 0; f < fronds; f++) {
      const dir = (f / fronds) * Math.PI * 2 + rand() * 0.35;
      const dx = Math.cos(dir);
      const dz = Math.sin(dir);
      const young = rand() < 0.22;
      // Date palm fronds arch out like a fountain before they fall.
      const reach = height * (young ? 0.3 : 0.44 + rand() * 0.1);
      const lift = young ? 1.1 : 0.75;
      const droop = young ? 0.55 : 0.95 + rand() * 0.25;
      const midrib = (s: number) =>
        v(
          top.x + dx * reach * s,
          top.y + reach * (lift * s - droop * s * s),
          top.z + dz * reach * s
        );
      crowns.curve(midrib, 6);
      // Leaflets: pairs along the midrib, hanging down and out, shorter
      // towards the tip.
      // Leaflets: pairs along the midrib, held out to the sides with a
      // slight fall, shorter towards the tip.
      const leaflets = young ? 5 : 9;
      for (let l = 1; l <= leaflets; l++) {
        const s = 0.14 + (l / (leaflets + 1)) * 0.84;
        const at = midrib(s);
        const length = reach * 0.22 * (1 - s * 0.55);
        for (const side of [-1, 1]) {
          const ox = -dz * side;
          const oz = dx * side;
          crowns.add(
            at,
            v(
              at.x + (ox * 0.92 + dx * 0.3) * length,
              at.y - length * 0.32,
              at.z + (oz * 0.92 + dz * 0.3) * length
            )
          );
        }
      }
    }
  }

  const group = new Group();
  group.add(trunks.build("#8a6a3e", 0.9), crowns.build("#93a86c", 0.92));
  return group;
}

/** The buggy as line art, forward along +z, wheels on y = 0. */
function buggyFrame(): BufferGeometry {
  const lines = lineSet();
  const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
  const loop = (points: Vector3[]) =>
    points.forEach((p, i) => lines.add(p, points[(i + 1) % points.length]));

  // Wheels: big rounded tyres with a hub.
  const wheel = (x: number, z: number, r: number) => {
    const y = r;
    lines.curve(
      (t) =>
        v(
          x,
          y + Math.cos(t * Math.PI * 2) * r,
          z + Math.sin(t * Math.PI * 2) * r
        ),
      14
    );
    lines.curve(
      (t) =>
        v(
          x,
          y + Math.cos(t * Math.PI * 2) * r * 0.45,
          z + Math.sin(t * Math.PI * 2) * r * 0.45
        ),
      8
    );
  };
  wheel(-1.25, 1.35, 0.5);
  wheel(1.25, 1.35, 0.5);
  wheel(-1.3, -1.35, 0.62);
  wheel(1.3, -1.35, 0.62);

  // Floor pan with a pointed nose.
  const floor = 0.62;
  loop([
    v(-0.9, floor, -1.9),
    v(0.9, floor, -1.9),
    v(0.9, floor, 1.3),
    v(0.45, floor + 0.15, 2.15),
    v(-0.45, floor + 0.15, 2.15),
    v(-0.9, floor, 1.3),
  ]);
  // Axles.
  lines.add(v(-1.25, 0.5, 1.35), v(1.25, 0.5, 1.35));
  lines.add(v(-1.3, 0.62, -1.35), v(1.3, 0.62, -1.35));

  // Roll cage: a rear hoop, a front hoop, roof rails and side braces.
  const rearL = v(-0.85, floor, -0.65);
  const rearR = v(0.85, floor, -0.65);
  const rearTopL = v(-0.7, 2.05, -0.45);
  const rearTopR = v(0.7, 2.05, -0.45);
  const frontL = v(-0.85, floor, 0.8);
  const frontR = v(0.85, floor, 0.8);
  const frontTopL = v(-0.62, 1.75, 0.35);
  const frontTopR = v(0.62, 1.75, 0.35);
  lines.add(rearL, rearTopL);
  lines.add(rearTopL, rearTopR);
  lines.add(rearTopR, rearR);
  lines.add(frontL, frontTopL);
  lines.add(frontTopL, frontTopR);
  lines.add(frontTopR, frontR);
  lines.add(rearTopL, frontTopL);
  lines.add(rearTopR, frontTopR);
  lines.add(rearTopL, frontTopR);
  lines.add(v(-0.88, 1.15, -0.6), v(-0.88, 1.1, 0.75));
  lines.add(v(0.88, 1.15, -0.6), v(0.88, 1.1, 0.75));

  // Two seats.
  for (const sx of [-0.4, 0.4]) {
    lines.add(v(sx - 0.25, floor + 0.3, 0.1), v(sx + 0.25, floor + 0.3, 0.1));
    lines.add(v(sx - 0.25, floor + 0.3, 0.1), v(sx - 0.25, floor + 1.0, -0.3));
    lines.add(v(sx + 0.25, floor + 0.3, 0.1), v(sx + 0.25, floor + 1.0, -0.3));
    lines.add(v(sx - 0.25, floor + 1.0, -0.3), v(sx + 0.25, floor + 1.0, -0.3));
  }

  // Engine block behind the cage, and a spare tyre on it.
  loop([
    v(-0.6, floor, -1.15),
    v(0.6, floor, -1.15),
    v(0.6, floor + 0.65, -1.15),
    v(-0.6, floor + 0.65, -1.15),
  ]);
  loop([
    v(-0.6, floor + 0.65, -1.15),
    v(0.6, floor + 0.65, -1.15),
    v(0.6, floor + 0.65, -1.85),
    v(-0.6, floor + 0.65, -1.85),
  ]);
  lines.curve(
    (t) =>
      v(
        Math.cos(t * Math.PI * 2) * 0.42,
        floor + 0.7,
        -1.5 + Math.sin(t * Math.PI * 2) * 0.32
      ),
    10
  );

  // Light bar across the front hoop.
  lines.add(v(-0.62, 1.82, 0.38), v(0.62, 1.82, 0.38));

  return lines.build("#e9dcc0", 0.9).geometry;
}

/**
 * Dune buggies at night, seen from the air: line-art buggies with their
 * headlights on and beams thrown ahead onto the sand, red tail lights, and a
 * trail of sand fading behind. Each loops round the bowl on its own path
 * and speed, climbing and dropping with the dunes and pitching with them.
 * Larger than life, like the palms, so they read at the hero's scale.
 */
function buildBuggies(count: number, small: boolean): Site {
  const rand = seeded(41);
  const TRAIL = 54;
  // Real proportions against the palms: a buggy is about a third of a
  // palm's height.
  const SCALE = 0.8;
  const paths = Array.from({ length: count }, () => ({
    radius: 98 + rand() * 34,
    wave: 6 + rand() * 9,
    phase: rand() * Math.PI * 2,
    start: rand(),
    dir: rand() < 0.5 ? -1 : 1,
    speed: 0.009 + rand() * 0.007,
  }));
  const at = (path: (typeof paths)[number], u: number, into: Vector3) => {
    const theta = u * Math.PI * 2;
    const r =
      path.radius +
      path.wave * Math.sin(3 * theta + path.phase) +
      0.4 * path.wave * Math.sin(5 * theta + 2 * path.phase);
    const x = r * Math.cos(theta) * 0.85;
    const z = r * Math.sin(theta);
    return into.set(x, oasisHeight(x, z) + 0.05, z);
  };

  // Shared parts.
  const frameGeometry = buggyFrame();
  const frameMaterial = new LineBasicMaterial({
    color: "#e9dcc0",
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  const dot = dotTexture();
  const headGeometry = new BufferGeometry();
  headGeometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      [-0.42, 1.0, 2.2, 0.42, 1.0, 2.2, 0, 1.85, 0.42],
      3
    )
  );
  const headMaterial = new PointsMaterial({
    color: "#fff0cc",
    map: dot,
    size: small ? 5 : 6,
    sizeAttenuation: false,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const tailGeometry = new BufferGeometry();
  tailGeometry.setAttribute(
    "position",
    new Float32BufferAttribute([-0.55, 0.95, -1.95, 0.55, 0.95, -1.95], 3)
  );
  const tailMaterial = new PointsMaterial({
    color: "#ff4a3a",
    map: dot,
    size: small ? 3 : 4,
    sizeAttenuation: false,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  // Headlight beam: an open cone from the lamps, fading to nothing ahead.
  const BEAM = 11;
  const beamGeometry = new ConeGeometry(2.6, BEAM, 18, 1, true);
  beamGeometry.translate(0, -BEAM / 2, 0);
  beamGeometry.rotateX(-Math.PI / 2);
  beamGeometry.rotateX(0.16);
  beamGeometry.translate(0, 1.0, 2.2);
  const beamMaterial = new ShaderMaterial({
    uniforms: { uLength: { value: BEAM } },
    vertexShader: /* glsl */ `
      uniform float uLength;
      varying float vAlong;
      void main() {
        vAlong = clamp((position.z - 2.2) / uLength, 0.0, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlong;
      void main() {
        float a = pow(1.0 - vAlong, 1.6) * 0.16;
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.58) * a, 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: DoubleSide,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });

  const group = new Group();
  const buggies = paths.map(() => {
    const buggy = new Group();
    buggy.add(
      new LineSegments(frameGeometry, frameMaterial),
      new Mesh(beamGeometry, beamMaterial),
      new Points(headGeometry, headMaterial),
      new Points(tailGeometry, tailMaterial)
    );
    buggy.scale.setScalar(SCALE);
    group.add(buggy);
    return buggy;
  });

  // Trails: segments whose colour fades to black, which additive blending
  // turns into transparency.
  const segments = count * (TRAIL - 1);
  const trailPositions = new Float32Array(segments * 2 * 3);
  const trailColors = new Float32Array(segments * 2 * 3);
  const sand = new Color("#e9c98a");
  for (let b = 0; b < count; b++) {
    for (let k = 0; k < TRAIL - 1; k++) {
      for (let end = 0; end < 2; end++) {
        const fade = 1.2 * Math.pow(1 - (k + end) / TRAIL, 1.3);
        const o = ((b * (TRAIL - 1) + k) * 2 + end) * 3;
        trailColors[o] = sand.r * fade;
        trailColors[o + 1] = sand.g * fade;
        trailColors[o + 2] = sand.b * fade;
      }
    }
  }
  const trailGeometry = new BufferGeometry();
  trailGeometry.setAttribute(
    "position",
    new Float32BufferAttribute(trailPositions, 3)
  );
  trailGeometry.setAttribute(
    "color",
    new Float32BufferAttribute(trailColors, 3)
  );
  group.add(
    new LineSegments(
      trailGeometry,
      new LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      })
    )
  );

  const point = new Vector3();
  const ahead = new Vector3();
  const update = (seconds: number) => {
    const trailAttr = trailGeometry.getAttribute("position");
    paths.forEach((path, b) => {
      const u = path.start + path.dir * path.speed * seconds;
      at(path, u, point);
      at(path, u + path.dir * 0.004, ahead);
      // Faces where it is going and pitches with the slope.
      buggies[b].position.copy(point);
      buggies[b].lookAt(ahead);
      for (let k = 0; k < TRAIL - 1; k++) {
        for (let end = 0; end < 2; end++) {
          // Starts behind the buggy, low over the sand.
          at(path, u - path.dir * (0.004 + (k + end) * 0.0018), point);
          trailAttr.setXYZ(
            (b * (TRAIL - 1) + k) * 2 + end,
            point.x,
            point.y + 0.3,
            point.z
          );
        }
      }
    });
    trailAttr.needsUpdate = true;
  };
  update(0);
  return { group, update };
}

const GLSL_NOISE = /* glsl */ `
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
`;

/** The lagoon's half-widths, for shaders that need to know where it is. */
const LAKE_RADII = () => new Vector2(8 * LAGOON_SCALE, 18 * LAGOON_SCALE);

/**
 * The dunes as a surface of sand under the moon: lit faces against shaded
 * lee slopes, two sets of wind ripples that cross where the wind turns,
 * patches of redder and paler sand, the wet dark sand round the water, and
 * the odd grain catching the moonlight. Dark, so the contour lines on top
 * still lead.
 */
function buildSand(size: number, steps: number, time: { value: number }): Mesh {
  const geometry = new PlaneGeometry(size, size, steps, steps);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    position.setY(i, oasisHeight(position.getX(i), position.getZ(i)));
  }
  geometry.computeVertexNormals();

  const material = new ShaderMaterial({
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      { uLake: { value: LAKE_RADII() } },
    ]),
    fog: true,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vNormal;
      varying vec2 vGround;
      void main() {
        vNormal = normal;
        vGround = position.xz;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform vec2 uLake;
      varying vec3 vNormal;
      varying vec2 vGround;
      ${GLSL_NOISE}
      void main() {
        vec3 moon = normalize(vec3(-0.45, 0.55, -0.5));
        vec3 n = normalize(vNormal);
        // lit faces against the lee: a firmer turn than plain diffuse
        float shade = smoothstep(0.02, 0.62, max(dot(n, moon), 0.0));
        float flatness = smoothstep(0.55, 0.95, n.y);

        // two ripple sets, blended by a slow field where the wind turns
        float bend = noise(vGround * 0.04) * 8.0 + noise(vGround * 0.13) * 2.0;
        float r1 = sin(dot(vGround, normalize(vec2(0.8, 0.35))) * 2.6 + bend);
        float r2 = sin(dot(vGround, normalize(vec2(0.2, 1.0))) * 4.1 + bend * 1.3);
        float ripple = mix(r1, r2, smoothstep(0.35, 0.75, noise(vGround * 0.02 + 3.1)));
        float crest = smoothstep(0.62, 1.0, ripple);

        // linear light: moonlit sand, redder and paler in patches
        float patchy = noise(vGround * 0.015 + 7.0);
        vec3 sand = mix(vec3(0.05, 0.037, 0.019), vec3(0.062, 0.04, 0.02), patchy);
        vec3 color = sand * (0.2 + 1.1 * shade);
        color *= 1.0 + (0.16 * ripple + 0.3 * crest) * flatness;

        // wet sand: a dark band round the water
        float d = length(vGround / uLake);
        float wet = 1.0 - smoothstep(0.98, 1.4, d);
        color = mix(color, vec3(0.011, 0.013, 0.014), wet * 0.7);

        // grain, and now and then a grain that catches the moon
        color += (hash(floor(vGround * 10.0)) - 0.5) * 0.005;
        // a round speck in a few cells, not the whole cell, so it reads as
        // a grain of sand and not as a square
        vec2 cell = floor(vGround * 0.9);
        float seed = hash(cell + 17.0);
        vec2 local = fract(vGround * 0.9) - 0.5 - (vec2(hash(cell + 3.0), hash(cell + 5.0)) - 0.5) * 0.6;
        float speck = smoothstep(0.1, 0.0, length(local));
        float twinkle = 0.5 + 0.5 * sin(uTime * 2.2 + seed * 60.0);
        color += vec3(0.32, 0.29, 0.22) * step(0.985, seed) * speck * twinkle * shade * 0.6;

        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  material.uniforms.uTime = time;
  return new Mesh(geometry, material);
}

/**
 * The lagoon's water: dark, two sets of ripples crossing, the night sky
 * reflected more strongly towards the far shore, a faint band of foam
 * along the edge, and the moon's reflection shimmering on the surface.
 */
function waterMaterial(time: { value: number }): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uTime: time, uLake: { value: LAKE_RADII() } },
    side: DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vPos;
      varying vec3 vWorld;
      void main() {
        vPos = position.xy;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec2 uLake;
      varying vec2 vPos;
      varying vec3 vWorld;
      ${GLSL_NOISE}
      void main() {
        float n = noise(vPos * 0.12 + vec2(uTime * 0.05, -uTime * 0.03));
        // linear light: dark water at night, greener in the shallows
        vec3 color = mix(vec3(0.003, 0.011, 0.02), vec3(0.006, 0.028, 0.036), n);

        // the sky in the water, stronger at a glancing angle
        vec3 toEye = normalize(cameraPosition - vWorld);
        float fresnel = pow(1.0 - max(toEye.y, 0.0), 3.0);
        color = mix(color, vec3(0.016, 0.026, 0.048), fresnel * 0.5);

        // crests: one set, warped and broken into short glints, as light
        // catches the tops of small waves
        float warp = noise(vPos * 0.22 + uTime * 0.08) * 6.0;
        float crest = sin((vPos.y * 0.8 + vPos.x * 0.3) * 1.6 + warp - uTime * 1.2);
        float broken = smoothstep(0.4, 0.75, noise(vPos * 0.45 - uTime * 0.12));
        color += vec3(0.03, 0.065, 0.075) * smoothstep(0.86, 1.0, crest) * broken;

        // foam along the shore
        float d = length(vPos / uLake);
        float foam = smoothstep(0.8, 0.98, d) * (0.45 + 0.55 * noise(vPos * 0.7 + uTime * 0.25));
        color += vec3(0.06, 0.07, 0.07) * foam;

        // the moon's reflection: a soft streak that shimmers
        vec2 g = vPos - vec2(uLake.x * 0.3, uLake.y * 0.25);
        float streak = exp(-(g.x * g.x * 0.06 + g.y * g.y * 0.005));
        float shimmer = 0.5 + 0.5 * sin(vPos.y * 2.6 - uTime * 2.4 + n * 6.0);
        color += vec3(0.85, 0.8, 0.66) * streak * shimmer * 0.55;

        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

/**
 * The night sky over the dunes, a little lighter towards the horizon so the
 * crests stand out against it as silhouettes.
 */
function buildSkyGlow(): Mesh {
  return new Mesh(
    new SphereGeometry(900, 32, 16),
    new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          // linear light: the page's night at the zenith, a cool haze low down
          vec3 zenith = vec3(0.0021, 0.0034, 0.008);
          vec3 horizon = vec3(0.011, 0.016, 0.032);
          float h = smoothstep(-0.05, 0.35, vDir.y);
          gl_FragColor = vec4(mix(horizon, zenith, h), 1.0);
          #include <colorspace_fragment>
        }
      `,
    })
  );
}

function buildOasis(time: { value: number }, small: boolean): Site {
  const group = new Group();
  const size = 600;
  const steps = small ? 200 : 320;

  const minor: number[] = [];
  const index: number[] = [];
  for (let level = 3; level <= 60; level += 3) {
    (level % 15 === 0 ? index : minor).push(level);
  }
  const addContours = (levels: number[], color: string, opacity: number) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute(contours(oasisHeight, size, steps, levels), 3)
    );
    group.add(
      new LineSegments(
        geometry,
        new LineBasicMaterial({
          color,
          transparent: true,
          opacity,
          depthWrite: false,
        })
      )
    );
  };
  const sky = buildSkyGlow();
  sky.renderOrder = -10;
  group.add(sky);

  // The sand first, so the contours ride on it and hide behind the dunes.
  group.add(buildSand(size, small ? 180 : 300, time));
  addContours(minor, "#6b5a36", 0.36);
  addContours(index, "#c9a35a", 0.85);

  // Water inside the shore. Drawn from both sides: laid flat, the shape's
  // front face points down, and the old flat fill was culled away.
  const shape = new Shape(
    LAGOON.map(([x, z]) => new Vector2(x * LAGOON_SCALE, z * LAGOON_SCALE))
  );
  const water = new Mesh(new ShapeGeometry(shape, 32), waterMaterial(time));
  water.rotation.x = Math.PI / 2;
  water.position.y = 0.04;
  group.add(water);

  // The village beyond the palms: houses as a sparse ring of points.
  const rand = seeded(11);
  const ring: number[] = [];
  for (let i = 0; i < 90; i++) {
    const angle = rand() * Math.PI * 2;
    const r = (21 + rand() * 8) * LAGOON_SCALE;
    const x = Math.cos(angle) * r * 0.8;
    const z = Math.sin(angle) * r;
    ring.push(x, Math.max(0, oasisHeight(x, z)) + 0.3, z);
  }
  const ringGeometry = new BufferGeometry();
  ringGeometry.setAttribute("position", new Float32BufferAttribute(ring, 3));
  group.add(
    new Points(
      ringGeometry,
      new PointsMaterial({
        color: "#c9b27a",
        map: dotTexture(),
        size: small ? 3 : 1.6,
        sizeAttenuation: !small,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    )
  );

  group.add(buildPalms(small ? 34 : 54));

  // The shore, glowing.
  group.add(
    glowingLine(
      LAGOON.map(
        ([x, z]) => new Vector3(x * LAGOON_SCALE, 0.2, z * LAGOON_SCALE)
      ),
      SHORE,
      time,
      0.24,
      900
    )
  );

  const buggies = buildBuggies(small ? 5 : 7, small);
  group.add(buggies.group);
  return { group, update: buggies.update };
}

/* ------------------------------------------------------------------ */
/* The scene                                                           */
/* ------------------------------------------------------------------ */

export function mountDesertScene(
  canvas: HTMLCanvasElement,
  { still, onReady, anchor, variant: initial }: Options
): SceneController {
  const host = canvas.parentElement ?? canvas;
  const small = window.matchMedia("(max-width: 767px)").matches;

  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, small ? 1.25 : 1.75)
  );
  renderer.setClearColor(NIGHT, 1);

  const scene = new Scene();
  // The background goes through colour management; the renderer's clear
  // colour does not when the frame is drawn into the bloom's buffer, and
  // the night came out as a washed grey-blue.
  scene.background = NIGHT;
  scene.fog = new FogExp2(NIGHT, small ? 0.0055 : 0.0042);
  scene.add(buildStars(small ? 700 : 1500));

  const time = { value: 0 };
  const sites: Partial<Record<SceneVariant, Site>> = {};
  let variant = initial;
  const show = (next: SceneVariant) => {
    variant = next;
    // Built on first use, then kept: switching back is instant.
    sites[next] ??=
      next === "colibri" ? buildPampa(time, small) : buildOasis(time, small);
    const site = sites[next]!;
    if (!site.group.parent) scene.add(site.group);
    (Object.keys(sites) as SceneVariant[]).forEach((key) => {
      sites[key]!.group.visible = key === next;
    });
  };
  show(variant);

  const camera = new PerspectiveCamera(38, 1, 0.5, 1200);
  const BASE_DISTANCE = 165;

  // Bloom makes the lines read as light. Skipped on phones, where the halo
  // tube alone carries the glow and the GPU budget is smaller.
  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  if (!small) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    // A high threshold: only the bright lines bloom, the night stays night.
    bloom = new UnrealBloomPass(new Vector2(256, 256), 0.55, 0.35, 0.62);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  // Where the subject's centre sits on screen, as fractions of the hero.
  const place = { x: 0.5, y: 0.5 };
  const resize = () => {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    composer?.setSize(width, height);
    bloom?.resolution.set(width / 2, height / 2);
    camera.aspect = width / height;
    // Centre the subject on the layout's empty box, wherever the breakpoint
    // put it, so it never lies under the copy or the panel.
    if (anchor) {
      const box = anchor.getBoundingClientRect();
      const frame = host.getBoundingClientRect();
      place.x = (box.left + box.width / 2 - frame.left) / width;
      place.y = (box.top + box.height / 2 - frame.top) / height;
      // Size the subject to its box. The canvas spans the whole hero, which
      // on a phone is far taller than the box, so without this it would be
      // drawn at the hero's scale and overflow its band.
      const fov = (camera.fov * Math.PI) / 180;
      const subjectPx =
        (FRAMING[variant].extent * height) /
        (2 * BASE_DISTANCE * Math.tan(fov / 2));
      const target = Math.min(box.width, box.height * 1.4) * 0.9;
      camera.zoom = Math.min(FRAMING[variant].maxZoom, target / subjectPx);
    }
    camera.setViewOffset(
      width,
      height,
      (0.5 - place.x) * width,
      (0.5 - place.y) * height,
      width,
      height
    );
    camera.updateProjectionMatrix();
  };
  resize();

  // Camera rig: a grazing landing view with the horizon in frame, lifting
  // towards the zenith as the hero scrolls away. A slow drift and the
  // pointer turn it a few degrees round the subject.
  const pointer = { x: 0, y: 0 };
  const eased = { x: 0, y: 0 };
  let rise = 0;
  const start = performance.now();

  const aim = (now: number) => {
    const intro = still ? 1 : Math.min(1, (now - start) / 2600);
    const settle = 1 - Math.pow(1 - intro, 3);
    const lift = rise * (2 - rise);
    const resting = FRAMING[variant].elevation;
    const elevationDeg = resting + 19 * (1 - settle) + 60 * lift;
    const elevation = (Math.min(elevationDeg, 86) * Math.PI) / 180;
    const drift = still ? 0 : Math.sin((now - start) * 0.00005) * 0.12;
    const azimuth = 0.18 + drift + eased.x * 0.1;
    const distance = BASE_DISTANCE - 25 * lift + 20 * (1 - settle);
    camera.position.set(
      distance * Math.cos(elevation) * Math.sin(azimuth),
      distance * Math.sin(elevation) + eased.y * 2,
      distance * Math.cos(elevation) * Math.cos(azimuth)
    );
    camera.lookAt(0, 0, 0);
  };

  const onPointer = (event: PointerEvent) => {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
  };
  const onScroll = () => {
    const rect = host.getBoundingClientRect();
    rise = Math.min(1, Math.max(0, -rect.top / Math.max(rect.height, 1)));
  };

  let frame = 0;
  let visible = true;
  let readySent = false;

  const render = (now: number) => {
    eased.x += (pointer.x - eased.x) * 0.04;
    eased.y += (pointer.y - eased.y) * 0.04;
    time.value = still ? 9 : (now - start) / 1000;
    sites[variant]?.update?.(time.value);
    aim(now);
    if (composer) composer.render();
    else renderer.render(scene, camera);
    if (!readySent) {
      readySent = true;
      onReady();
    }
  };

  const loop = (now: number) => {
    render(now);
    if (visible && !document.hidden) frame = requestAnimationFrame(loop);
    else frame = 0;
  };

  const wake = () => {
    if (!still && !frame && visible && !document.hidden) {
      frame = requestAnimationFrame(loop);
    }
  };

  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    wake();
  });
  io.observe(host);

  const ro = new ResizeObserver(() => {
    resize();
    if (still || !frame) render(performance.now());
  });
  ro.observe(host);

  document.addEventListener("visibilitychange", wake);
  if (!still) {
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    frame = requestAnimationFrame(loop);
  } else {
    render(performance.now());
  }

  return {
    setVariant(next) {
      if (next === variant) return;
      show(next);
      resize();
      if (still || !frame) render(performance.now());
    },
    dispose() {
      cancelAnimationFrame(frame);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", onScroll);
      scene.traverse((object) => {
        const item = object as Partial<Mesh>;
        item.geometry?.dispose();
        const mat = item.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
      composer?.dispose();
      renderer.dispose();
    },
  };
}
