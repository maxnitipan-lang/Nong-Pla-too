// English names of campus places, for visitors who ask Nong Platoo in English
// (route steps, the route panel and spoken directions). Thai name → English name.

const NAMES = {
  // walk-network landmarks
  "ประตูวิทยาลัย": "the college gate",
  "ช่างยนต์": "Auto Mechanics",
  "อิเล็กทรอนิกส์ / IT": "Electronics / IT",
  "ไฟฟ้ากำลัง / ก่อสร้าง": "Electrical Power / Construction",
  "ตึก ICT": "the ICT Building",
  "สามัญสัมพันธ์": "General Education",
  "พาณิชยกรรม": "Business",
  "คหกรรมศาสตร์": "Home Economics",
  "อาหารและโภชนาการ": "Food and Nutrition",
  "พัฒนาศักยภาพนักเรียน": "the Student Development Building",
  "อาคาร 85 ปี": "Building 85",
  "สอฐ.ภาคกลาง 5": "Central Vocational Institute 5",
  "หอประชุม / โรงอาหาร": "the Auditorium / Canteen",
  "อาคารกิจกรรม": "the Activity Building",
  "อาคาร 1": "Building 1",
  "โรงจอดรถ 1": "Parking 1",
  "ตึก 10": "Building 10",
  "ช่างก่อสร้าง": "Construction",
  "ช่างกลโรงงาน": "Machine Shop",
  "บุคคล / ทะเบียน": "Personnel / Registration",
  "ฝ่ายพัสดุ": "Supplies",
  "ฝ่ายปกครอง": "Student Affairs",
  "ห้อง ผอ.": "the Director's Office",
  // building names (full and short)
  "สาขาวิชาช่างยนต์": "Auto Mechanics",
  "สาขาวิชาอิเล็กทรอนิกส์และเทคโนโลยีสารสนเทศ": "Electronics and IT",
  "อาคาร 8 · ช่างไฟฟ้ากำลัง (ฝั่งซ้าย)": "Building 8 · Electrical Power (left side)",
  "ช่างไฟฟ้า": "Electrical Power",
  "อาคาร 8 · ช่างก่อสร้าง (ฝั่งขวา)": "Building 8 · Construction (right side)",
  "อาคาร 11 (ตึก ICT)": "Building 11 (ICT Building)",
  "อาคาร 3 (สามัญสัมพันธ์)": "Building 3 (General Education)",
  "อาคาร 3 / ห้องสมุด": "Building 3 / Library",
  "อาคาร 4 (พาณิชยกรรม)": "Building 4 (Business)",
  "อาคาร 4 / พาณิชยกรรม": "Building 4 / Business",
  "สาขาวิชาคหกรรมศาสตร์": "Home Economics",
  "สาขาวิชาอาหารและโภชนาการ": "Food and Nutrition",
  "อาคารพัฒนาศักยภาพนักเรียน นักศึกษา (จั่วคู่)": "Student Development Building (Twin Gable)",
  "จั่วคู่ / พัฒนาศักยภาพ": "Twin Gable / Student Development",
  "อาคารสถาบันการอาชีวศึกษาภาคกลาง 5": "Central Vocational Institute 5",
  "หอประชุม 1": "Auditorium 1",
  "โรงอาหาร": "the Canteen",
  "สนามฟุตบอล": "the Football Field",
  "Fix it Center (ศูนย์ซ่อมสร้างเพื่อชุมชน)": "Fix it Center",
  "Fix it Center": "Fix it Center",
  "ธนาคารโรงเรียน": "the School Bank",
  "ร้านเพลินแฟ": "Plernfae Cafe",
  "อาคาร 1 (อาคารไม้)": "Building 1 (wooden building)",
  "อาคาร 10": "Building 10",
  "อาคาร 9 (ช่างกลโรงงาน)": "Building 9 (Machine Shop)",
  "งานทะเบียน / งานบุคคล": "Registration / Personnel",
  "ทะเบียน / บุคคล": "Registration / Personnel",
  "งานพัสดุ / งานอาคารสถานที่": "Supplies / Buildings and Grounds",
  "พัสดุ / อาคารสถานที่": "Supplies / Buildings and Grounds",
  "งานปกครอง / ประชาสัมพันธ์": "Student Affairs / Public Relations",
  "ปกครอง / ประชาสัมพันธ์": "Student Affairs / Public Relations",
  "สำนักงานผู้อำนวยการ": "the Director's Office",
  "ทางเข้าวิทยาลัย": "the college entrance",
};

/**
 * English name of a campus place. "อาคาร N…" becomes "Building N"; a Thai name with no English
 * name gives null (callers then leave the name out rather than mix Thai into English).
 */
export function placeEn(name) {
  if (!name) return null;
  const key = String(name).trim();
  if (NAMES[key]) return NAMES[key];
  const building = key.match(/^(?:อาคาร|ตึก)\s*(\d+)/);
  if (building) return `Building ${building[1]}`;
  return /[฀-๿]/.test(key) ? null : key;
}

export const COMPASS_EN = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

export const MANEUVER_EN = {
  depart: "Start walking",
  straight: "Go straight",
  "slight-left": "Bear left",
  left: "Turn left",
  "sharp-left": "Turn sharp left",
  "slight-right": "Bear right",
  right: "Turn right",
  "sharp-right": "Turn sharp right",
  uturn: "Turn around",
  arrive: "You have arrived",
};
