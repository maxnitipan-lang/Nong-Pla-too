// Open areas drawn on the campus maps (2D and 3D) that are not buildings.
//
// The football field (สนามฟุตบอล, no. 14 on the college map handout) is not in OpenStreetMap, so its
// outline comes from the satellite photo: the edges follow the main road (north), the activity
// building (west), the campus road by the long workshop building (east) and the road to the south,
// each pulled in a few metres for the trees and paths around the pitch.

/** [lat, lng] corners: north-west, north-east, south-east, south-west. */
export const FOOTBALL_FIELD = [
  [13.4205924, 100.0093503],
  [13.4209352, 100.0099494],
  [13.4198437, 100.010286],
  [13.4196604, 100.0096131],
];

const M = 111320; // metres per degree of latitude

/**
 * Pitch markings inside a four-corner field, as polylines of [lat, lng]: the outline, the halfway
 * line, the centre circle and both penalty areas. Works for any (roughly rectangular) quadrilateral.
 */
export function pitchMarkings(ring = FOOTBALL_FIELD) {
  const lat0 = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const lng0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const toXY = ([lat, lng]) => [(lng - lng0) * M * k, (lat - lat0) * M];
  const toLL = ([x, y]) => [lat0 + y / M, lng0 + x / (M * k)];
  const [nw, ne, se, sw] = ring.map(toXY);
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const unit = v => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
  const add = (p, v, s) => [p[0] + v[0] * s, p[1] + v[1] * s];

  // Lines sit 4 m inside the grass edge.
  const inset = 4;
  const centre = [0, 0];
  const pull = p => add(p, unit([centre[0] - p[0], centre[1] - p[1]]), inset);
  const [a, b, c, d] = [nw, ne, se, sw].map(pull);
  const outline = [a, b, c, d, a];

  // The long sides are east and west, so the goals are at the north and south ends.
  const north = mid(a, b);
  const south = mid(d, c);
  const halfway = [mid(a, d), mid(b, c)];
  const along = unit([north[0] - south[0], north[1] - south[1]]); // towards the north goal
  const across = unit([b[0] - a[0], b[1] - a[1]]);

  const circle = [];
  for (let i = 0; i <= 32; i++) {
    const t = (i / 32) * Math.PI * 2;
    circle.push(add(add(centre, along, Math.cos(t) * 9.15), across, Math.sin(t) * 9.15));
  }
  const box = (end, inward) => {
    const half = 20.15, depth = 16.5;
    const p1 = add(end, across, -half), p2 = add(end, across, half);
    return [p1, add(p1, inward, depth), add(p2, inward, depth), p2];
  };
  const northBox = box(north, [-along[0], -along[1]]);
  const southBox = box(south, along);

  return [outline, halfway, circle, northBox, southBox].map(line => line.map(toLL));
}
