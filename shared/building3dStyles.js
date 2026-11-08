// How each campus building looks in the 3D map (client/src/lib/campus3d.ts).
//
// Colours, roof shapes and sizes were taken from photos of the real buildings
// (พ.ย. 2569). Keyed by building id (shared/campus.js / database). A building
// not listed here gets DEFAULT_3D_STYLE.
//
//   wall      outside wall colour
//   roof      roof colour
//   trim      eaves / roof edge / base band colour
//   roofType  "flat" (concrete slab with a small eave), "gable" (ridge roof, จั่ว),
//             "barrel" (arched metal roof, หลังคาโค้ง)
//   floors    storeys to draw — only set when the photo disagrees with the
//             building data; fix the data in /admin/buildings as well
//   height    total wall height in metres, for halls whose storeys are tall
//   size      [length, width] m of the box drawn when OpenStreetMap has no
//             footprint for this building (it's turned to the campus grid)
//   turn      extra turn of that box in degrees (90 = long side the other way)
//   open      true = an open area (no building): only the pin and label, e.g. the football field
//
// Roof colours were checked against a satellite view of the campus (พ.ย. 2569):
// from above most "white" buildings have grey, blue or dark metal roofs.

export const DEFAULT_3D_STYLE = { wall: "#eeeeea", roof: "#c9ced3", trim: "#b9c0c6", roofType: "flat" };

export const BUILDING_3D_STYLES = {
  // สนามฟุตบอล — grass and pitch lines are drawn with the ground (shared/campusAreas.js), no box.
  "football-field": { open: true },

  // ตึก ๑๒ ICT / เทคนิคการผลิต — white, curved balconies, big teal-blue metal roof.
  // OSM has no footprint for it, so it's drawn as a box this size.
  // From above: the big blue roof east of the hall, long side running east–west.
  "ict-building": { wall: "#f3f3f0", roof: "#3f6fa8", trim: "#c7ccd1", roofType: "gable", size: [48, 28], turn: 90 },

  // สาขาวิชาอาหารและโภชนาการ — salmon-beige, dark-brown posts and window frames, flat roof with a deep eave.
  "food-nutrition": { wall: "#ddb092", roof: "#6f6b6c", trim: "#5c3b2e", roofType: "flat", floors: 3 },

  // ตึก ๕ คหกรรมศาสตร์ — plain white open-corridor block.
  "home-economics": { wall: "#f1f1ee", roof: "#66686c", trim: "#8796a3", roofType: "flat", floors: 4 },

  // ตึก ๔ คณะวิชาบริหารธุรกิจ (การบัญชี / การตลาด) — light grey, dark slate band, orange stripes at the base.
  commerce: { wall: "#dde0e4", roof: "#6b6e73", trim: "#3f5163", roofType: "flat", floors: 4 },

  // อาคาร ๘๕ ปี — cream with grey sun-louvres.
  "building-85": { wall: "#efe7d8", roof: "#c9d2d6", trim: "#8e98a2", roofType: "flat" },

  // ตึก ๑ — off-white, brown window frames.
  "building-1": { wall: "#ece7db", roof: "#c4c6c2", trim: "#6a4636", roofType: "flat" },

  // หอประชุม ๑ (โรงอาหาร) — cream walls, salmon gable front.
  // Photo: cream walls, salmon gable front. From above the metal roof is rust-brown.
  auditorium: { wall: "#efdca8", roof: "#9c6f5f", trim: "#e2ad8f", roofType: "gable", height: 9, windows: false },

  // อาคารกิจกรรม — white hall, pale mint base, silver arched roof.
  "activity-building": {
    wall: "#f4f6f4",
    roof: "#bfc1c2",
    trim: "#cde9e3",
    roofType: "barrel",
    height: 11,
    windows: false,
  },

  // Roof colour from the satellite view only (no photo of the walls yet).
  "general-subjects": { wall: "#eeeeea", roof: "#5f7fbf", trim: "#b9c0c6", roofType: "gable" },
  "student-development": { wall: "#eeeeea", roof: "#6f9c9c", trim: "#b9c0c6", roofType: "flat" },
};

export function building3dStyle(id) {
  return (id && BUILDING_3D_STYLES[id]) || DEFAULT_3D_STYLE;
}
