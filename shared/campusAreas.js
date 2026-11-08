// Open areas drawn on the campus maps (2D and 3D) that are not buildings.
//
// The football field (สนามฟุตบอล, no. 14 on the college map handout) is not in OpenStreetMap, so its
// area comes from the satellite photo: the edges follow the main road (north), the activity
// building (west), the campus road by the long workshop building (east) and the road to the south,
// each pulled in a few metres for the trees and paths around the pitch.
//
// That area is not a perfect rectangle, but a pitch is — so the grass and its lines are the largest
// true rectangle that fits inside it (fieldRect), turned to the field's long direction.

/** [lat, lng] corners of the open area: north-west, north-east, south-east, south-west. */
export const FOOTBALL_FIELD_AREA = [
  [13.4205924, 100.0093503],
  [13.4209352, 100.0099494],
  [13.4198437, 100.010286],
  [13.4196604, 100.0096131],
];

const M = 111320; // metres per degree of latitude

function frame(area) {
  const lat0 = area.reduce((s, p) => s + p[0], 0) / area.length;
  const lng0 = area.reduce((s, p) => s + p[1], 0) / area.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  return {
    toXY: ([lat, lng]) => [(lng - lng0) * M * k, (lat - lat0) * M],
    toLL: ([x, y]) => [lat0 + y / M, lng0 + x / (M * k)],
  };
}

const unit = v => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const add = (p, v, s) => [p[0] + v[0] * s, p[1] + v[1] * s];

/** Is point p inside the convex polygon (any winding)? */
function inside(p, poly) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (Math.abs(cross) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

/**
 * The pitch rectangle in local metres: centre, unit axes (along = towards the north goal) and
 * half-sizes, as large as fits in the area with the shape of a pitch (about 105 × 68).
 */
function pitchRect(area) {
  const { toXY } = frame(area);
  const [nw, ne, se, sw] = area.map(toXY);
  // Long direction = average of the two long sides (west: sw→nw, east: se→ne).
  const along = unit([(nw[0] - sw[0]) + (ne[0] - se[0]), (nw[1] - sw[1]) + (ne[1] - se[1])]);
  const across = [along[1], -along[0]]; // 90° clockwise → points east
  const poly = [nw, ne, se, sw];
  const centre = [0, 0];
  const ratio = 68 / 105;
  let lo = 0, hi = 200;
  for (let i = 0; i < 40; i++) {
    const half = (lo + hi) / 2;
    const w = half * ratio;
    const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([sa, sb]) => add(add(centre, along, sa * half), across, sb * w));
    if (corners.every(c => inside(c, poly))) lo = half;
    else hi = half;
  }
  return { centre, along, across, halfLength: lo, halfWidth: lo * ratio };
}

/** The grass: the pitch rectangle as [lat, lng] corners. */
export function fieldRect(area = FOOTBALL_FIELD_AREA) {
  const { toLL } = frame(area);
  const r = pitchRect(area);
  return [[1, -1], [1, 1], [-1, 1], [-1, -1]].map(([sa, sb]) =>
    toLL(add(add(r.centre, r.along, sa * r.halfLength), r.across, sb * r.halfWidth))
  );
}

/** Kept for code that imports the old name: the grass rectangle. */
export const FOOTBALL_FIELD = fieldRect();

/**
 * Pitch markings as polylines of [lat, lng]: outline, halfway line, centre circle, both penalty
 * areas and goal areas — all square to the pitch.
 */
export function pitchMarkings(area = FOOTBALL_FIELD_AREA) {
  const { toLL } = frame(area);
  const r = pitchRect(area);
  const inset = 3; // lines sit inside the grass edge
  const L = r.halfLength - inset;
  const W = r.halfWidth - inset;
  const at = (a, b) => add(add(r.centre, r.along, a), r.across, b);
  const rect = (a1, a2, b1, b2) => [at(a1, b1), at(a1, b2), at(a2, b2), at(a2, b1), at(a1, b1)];

  const outline = rect(-L, L, -W, W);
  const halfway = [at(0, -W), at(0, W)];
  const circle = [];
  for (let i = 0; i <= 40; i++) {
    const t = (i / 40) * Math.PI * 2;
    circle.push(at(Math.cos(t) * 9.15, Math.sin(t) * 9.15));
  }
  // Scale the box sizes to the pitch width (a full pitch is 68 m wide).
  const s = Math.min(1, (2 * W) / 68);
  const box = (end, dir, depth, half) => [at(end, -half), at(end + dir * depth, -half), at(end + dir * depth, half), at(end, half)];
  const lines = [
    outline,
    halfway,
    circle,
    box(L, -1, 16.5 * s, 20.15 * s),
    box(-L, 1, 16.5 * s, 20.15 * s),
    box(L, -1, 5.5 * s, 9.15 * s),
    box(-L, 1, 5.5 * s, 9.15 * s),
  ];
  return lines.map(line => line.map(toLL));
}
