// Campus domain types + data shared between the frontend and backend.
//
// Real campus data (22 buildings/units + real GPS coordinates) ported from the
// "น้องปลาทู" web app (D:\น้องปลาทู), sourced from the college's Google My Maps
// export (KMZ, ก.ย. 2569). This is used as a fallback whenever the database is
// empty or unreachable, so the UI can be previewed immediately, and is also the
// seed content for `campus_buildings` / `campus_news`.

// The four Google My Maps layers of the campus PR map.
export const CAMPUS_CATEGORIES = [
  "สายอุตสาหกรรม",
  "พาณิชยกรรม/คหกรรม/สามัญ",
  "บริหาร-สนับสนุน",
  "ส่วนกลาง-กิจกรรม",
] as const;
export type BuildingCategory = (typeof CAMPUS_CATEGORIES)[number];

export type Floor = {
  level: number;
  label: string;
  rooms: string[];
};
/** Old-API name for {@link Floor}. */
export type FloorDetail = Floor;
/** Old-API name for {@link BuildingCategory}. */
export type CampusCategory = BuildingCategory;

export type GalleryImage = {
  id: string;
  url: string;
  caption: string;
  alt: string;
};

export type DepartmentProfile = {
  id: string;
  floor: number;
  name: string;
  code: string;
  description: string;
  skills: string[];
  careers: string[];
  activities?: string[];
  accent: string;
};

export type CampusBuilding = {
  id: string;
  name: string;
  shortName: string;
  category: BuildingCategory;
  description: string;
  floors: number;
  x: number;
  y: number;
  width: number;
  height: number;
  accent: string;
  floorsDetail: Floor[];
  /** Real-world coordinates as strings, e.g. "13.4207317663681" (old API contract). Missing = undefined. */
  latitude?: string;
  longitude?: string;
  /** Kiosk extras — not part of the old API, safe for old clients to ignore. */
  departments?: DepartmentProfile[];
  gallery?: GalleryImage[];
};

export type CampusNewsItem = {
  id: string;
  tag: string;
  title: string;
  excerpt: string;
  date: string;
  time: string;
  accent: string;
  /** Full-article URL, or "" for a card with no link. */
  link: string;
  /** Thumbnail image URL, or "" for a plain accent card. */
  image: string;
  /** "" = added by hand, "sstc.ac.th" = pulled from the college website. */
  source: string;
};
export type CampusNews = CampusNewsItem;

/** Editable site-wide settings, managed from the admin panel. */
export type CampusSettings = {
  collegeName: string;
  address: string;
  contactEmail: string;
  /** Google My Maps "embed on my site" URL, or "" (kept for API compatibility; the site no longer shows it). */
  mapEmbedUrl: string;
  mapCenter: { lat: number; lng: number };
  /** New: where the kiosk stands — its walking routes start here instead of GPS. null = not set. */
  kiosk: { name: string; lat: number; lng: number } | null;
};

export const CAMPUS_OVERVIEW = {
  name: "วิทยาลัยเทคนิคสมุทรสงคราม",
  shortName: "SMTC",
  address: "วิทยาลัยเทคนิคสมุทรสงคราม อำเภอเมืองสมุทรสงคราม จังหวัดสมุทรสงคราม",
  mapCenter: { lat: 13.41967, lng: 100.01036 },
  stats: [
    { value: "22", label: "อาคาร/หน่วยงาน" },
    { value: "4", label: "กลุ่มเลเยอร์" },
    { value: "08:00–16:30", label: "เวลาทำการ" },
  ],
};

export const DEFAULT_GALLERY: GalleryImage[] = [
  { id: "workshop", url: "/manus-storage/workshop-class_7b9c890d.jpg", caption: "บรรยากาศการเรียนรู้แบบลงมือทำ", alt: "ห้องเรียนเชิงปฏิบัติการ" },
  { id: "lab", url: "/manus-storage/modern-lab_369cb2fd.jpeg", caption: "ห้องปฏิบัติการพร้อมใช้งาน", alt: "ห้องปฏิบัติการสมัยใหม่" },
  { id: "training", url: "/manus-storage/training-space_8dd5d5f6.jpg", caption: "พื้นที่ฝึกทักษะสายอาชีพ", alt: "นักเรียนในห้องฝึกทักษะ" },
];

/** Generic demo departments — only used as a placeholder for a freshly-created building that has no real department data yet. */
export const DEFAULT_DEPARTMENTS: DepartmentProfile[] = [
  {
    id: "digital-business",
    floor: 3,
    name: "เทคโนโลยีธุรกิจดิจิทัล",
    code: "DBT",
    description: "เรียนรู้การใช้เทคโนโลยีเพื่อสร้างธุรกิจยุคใหม่ ตั้งแต่การจัดการข้อมูล สื่อดิจิทัล ไปจนถึงการวางแผนธุรกิจออนไลน์",
    skills: ["การวิเคราะห์ข้อมูล", "การออกแบบสื่อดิจิทัล", "การจัดการธุรกิจออนไลน์"],
    careers: ["Digital Marketer", "Content Creator", "เจ้าหน้าที่ธุรกิจดิจิทัล"],
    activities: ["เวิร์กช็อปออกแบบสื่อ", "ฝึกทำธุรกิจจำลอง", "กิจกรรมสร้างแบรนด์ออนไลน์"],
    accent: "#3c8f8d",
  },
  {
    id: "automotive",
    floor: 1,
    name: "ช่างยนต์และยานยนต์ไฟฟ้า",
    code: "AUT",
    description: "ผสมผสานพื้นฐานเครื่องยนต์ ระบบไฟฟ้ารถยนต์ และเทคโนโลยียานยนต์ไฟฟ้า ผ่านการฝึกกับอุปกรณ์จริง",
    skills: ["วิเคราะห์ระบบเครื่องยนต์", "บำรุงรักษารถ EV", "อ่านวงจรไฟฟ้ายานยนต์"],
    careers: ["ช่างเทคนิคยานยนต์", "ช่างซ่อมรถ EV", "ที่ปรึกษาศูนย์บริการ"],
    activities: ["ตรวจเช็กรถยนต์ไฟฟ้า", "แข่งขันทักษะงานเครื่องยนต์", "เปิดโรงฝึกให้เยี่ยมชม"],
    accent: "#eb8b67",
  },
];

/** One lightweight DepartmentProfile stub per unit/department actually housed in a building — derived from its floor-1 room list so the kiosk UI (pin logos, department panels) shows real content instead of the generic demo departments above. */
function buildDepartments(building: { id: string; floorsDetail: Floor[]; accent: string }): DepartmentProfile[] {
  const rooms = building.floorsDetail[0]?.rooms ?? [];
  return rooms.map((room, index) => ({
    id: `${building.id}-dept-${index + 1}`,
    floor: 1,
    name: room,
    code: String(index + 1).padStart(2, "0"),
    description: "",
    skills: [],
    careers: [],
    accent: building.accent,
  }));
}

type RawBuilding = Omit<CampusBuilding, "departments" | "gallery" | "latitude" | "longitude"> & { latitude: number; longitude: number };

// อาคาร/หน่วยงาน 22 จุด + พิกัดจริง นำเข้าจาก Google My Maps ของวิทยาลัย (KMZ + สเปรดชีต, ก.ย. 2569)
const RAW_CAMPUS_BUILDINGS: RawBuilding[] = [
  {
    id: "mech-auto",
    name: "สาขาวิชาช่างยนต์",
    shortName: "ช่างยนต์",
    category: "สายอุตสาหกรรม",
    description: "สาขาวิชาช่างยนต์ · 18 ห้อง",
    floors: 2,
    x: 51,
    y: 19,
    width: 18,
    height: 16,
    accent: "#e8863f",
    latitude: 13.4207317663681,
    longitude: 100.010368922857,
    floorsDetail: [{ level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["สาขาวิชาช่างยนต์"] }],
  },
  {
    id: "electronics-it",
    name: "สาขาวิชาอิเล็กทรอนิกส์และเทคโนโลยีสารสนเทศ",
    shortName: "อิเล็กทรอนิกส์ / IT",
    category: "สายอุตสาหกรรม",
    description: "สาขาวิชาอิเล็กทรอนิกส์ / เทคโนโลยีสารสนเทศ, สาขาวิชาเทคนิคคอมพิวเตอร์ · 33 ห้อง",
    floors: 3,
    x: 55,
    y: 30,
    width: 18,
    height: 16,
    accent: "#e8863f",
    latitude: 13.4204089013263,
    longitude: 100.010475464028,
    floorsDetail: [{ level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["สาขาวิชาอิเล็กทรอนิกส์ / เทคโนโลยีสารสนเทศ", "สาขาวิชาเทคนิคคอมพิวเตอร์"] }],
  },
  {
    id: "electrical-construction",
    name: "สาขาวิชาไฟฟ้ากำลังและก่อสร้าง",
    shortName: "ไฟฟ้ากำลัง / ก่อสร้าง",
    category: "สายอุตสาหกรรม",
    description: "สาขาวิชาไฟฟ้ากำลัง / ก่อสร้าง · 48 ห้อง",
    floors: 4,
    x: 60,
    y: 42,
    width: 18,
    height: 16,
    accent: "#e8863f",
    latitude: 13.4200514503851,
    longitude: 100.010592746633,
    floorsDetail: [{ level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["สาขาวิชาไฟฟ้ากำลัง / ก่อสร้าง"] }],
  },
  {
    id: "ict-building",
    name: "ตึก ICT",
    shortName: "ตึก ICT",
    category: "สายอุตสาหกรรม",
    description: "สาขาวิชาช่างเชื่อมโลหะ, สาขาวิชาเมคคาทรอนิกส์และหุ่นยนต์, สาขาวิชาการจัดการสำนักงาน · 30 ห้อง",
    floors: 4,
    x: 89,
    y: 66,
    width: 18,
    height: 16,
    accent: "#e8863f",
    latitude: 13.4193720017185,
    longitude: 100.011311702798,
    floorsDetail: [{ level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["สาขาวิชาช่างเชื่อมโลหะ", "สาขาวิชาเมคคาทรอนิกส์และหุ่นยนต์", "สาขาวิชาการจัดการสำนักงาน"] }],
  },
  {
    id: "general-subjects",
    name: "สาขาวิชาสามัญสัมพันธ์",
    shortName: "สามัญสัมพันธ์",
    category: "พาณิชยกรรม/คหกรรม/สามัญ",
    description: "หมวดวิชาสามัญ ไทย คณิต วิทย์ อังกฤษ ภาษาจีน · 46 ห้อง",
    floors: 4,
    x: 50,
    y: 79,
    width: 18,
    height: 16,
    accent: "#2f7fb5",
    latitude: 13.4189665484955,
    longitude: 100.010348443725,
    floorsDetail: [{ level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["หมวดวิชาสามัญ ไทย คณิต วิทย์ อังกฤษ ภาษาจีน"] }],
  },
  {
    id: "commerce",
    name: "สาขาวิชาพาณิชยกรรม",
    shortName: "พาณิชยกรรม",
    category: "พาณิชยกรรม/คหกรรม/สามัญ",
    description: "สาขาการตลาดและธุรกิจค้าปลีก, สาขาการบัญชี · 24 ห้อง",
    floors: 3,
    x: 50,
    y: 87,
    width: 18,
    height: 16,
    accent: "#2f7fb5",
    latitude: 13.4187456064652,
    longitude: 100.010345639489,
    floorsDetail: [{ level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["สาขาการตลาดและธุรกิจค้าปลีก", "สาขาการบัญชี"] }],
  },
  {
    id: "home-economics",
    name: "สาขาวิชาคหกรรมศาสตร์",
    shortName: "คหกรรมศาสตร์",
    category: "พาณิชยกรรม/คหกรรม/สามัญ",
    description: "สาขาวิชาคหกรรมศาสตร์ · 11 ห้อง",
    floors: 2,
    x: 76,
    y: 85,
    width: 18,
    height: 16,
    accent: "#2f7fb5",
    latitude: 13.4188110707917,
    longitude: 100.01098780958,
    floorsDetail: [{ level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["สาขาวิชาคหกรรมศาสตร์"] }],
  },
  {
    id: "food-nutrition",
    name: "สาขาวิชาอาหารและโภชนาการ",
    shortName: "อาหารและโภชนาการ",
    category: "พาณิชยกรรม/คหกรรม/สามัญ",
    description: "สาขาวิชาอาหารและโภชนาการ · 1 หลัง",
    floors: 1,
    x: 92,
    y: 73,
    width: 18,
    height: 16,
    accent: "#2f7fb5",
    latitude: 13.4191424870995,
    longitude: 100.011380674762,
    floorsDetail: [{ level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["สาขาวิชาอาหารและโภชนาการ"] }],
  },
  {
    id: "student-development",
    name: "อาคารพัฒนาศักยภาพนักเรียน",
    shortName: "พัฒนาศักยภาพนักเรียน",
    category: "บริหาร-สนับสนุน",
    description: "ฝ่ายบริหาร / ธุรการวิทยาลัย · 12 ห้อง",
    floors: 2,
    x: 58,
    y: 92,
    width: 18,
    height: 16,
    accent: "#6b7a86",
    latitude: 13.4186010393477,
    longitude: 100.01055876144,
    floorsDetail: [{ level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["ฝ่ายบริหาร / ธุรการวิทยาลัย"] }],
  },
  {
    id: "building-85",
    name: "อาคาร 85 ปี",
    shortName: "อาคาร 85 ปี",
    category: "บริหาร-สนับสนุน",
    description: "ฝ่ายบริหารทรัพยากร, ฝ่ายยุทธศาสตร์และแผนงาน, ฝ่ายกิจการนักเรียนนักศึกษา, ฝ่ายวิชาการ · 4 ชั้น",
    floors: 4,
    x: 40,
    y: 72,
    width: 18,
    height: 16,
    accent: "#6b7a86",
    latitude: 13.4191765796198,
    longitude: 100.010118496356,
    floorsDetail: [{ level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["ฝ่ายบริหารทรัพยากร", "ฝ่ายยุทธศาสตร์และแผนงาน", "ฝ่ายกิจการนักเรียนนักศึกษา", "ฝ่ายวิชาการ"] }],
  },
  {
    id: "ivec-central-5",
    name: "อาคารสถาบันการอาชีวศึกษาภาคกลาง 5",
    shortName: "สอฐ.ภาคกลาง 5",
    category: "บริหาร-สนับสนุน",
    description: "สถาบันการอาชีวศึกษาภาคกลาง 5 · 33 ห้อง",
    floors: 3,
    x: 63,
    y: 55,
    width: 18,
    height: 16,
    accent: "#6b7a86",
    latitude: 13.4196921080512,
    longitude: 100.010664863585,
    floorsDetail: [{ level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["สถาบันการอาชีวศึกษาภาคกลาง 5"] }],
  },
  {
    id: "auditorium",
    name: "หอประชุม (โรงอาหาร)",
    shortName: "หอประชุม / โรงอาหาร",
    category: "ส่วนกลาง-กิจกรรม",
    description: "พื้นที่ส่วนกลาง จัดกิจกรรมและรับประทานอาหาร · 2 ห้อง",
    floors: 1,
    x: 72,
    y: 68,
    width: 18,
    height: 16,
    accent: "#3f9d6d",
    latitude: 13.419306679309,
    longitude: 100.01088199252,
    floorsDetail: [{ level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["พื้นที่ส่วนกลาง จัดกิจกรรมและรับประทานอาหาร"] }],
  },
  {
    id: "activity-building",
    name: "อาคารกิจกรรม",
    shortName: "อาคารกิจกรรม",
    category: "ส่วนกลาง-กิจกรรม",
    description: "พื้นที่จัดกิจกรรมนักเรียนนักศึกษาและชมรม · 8 ห้อง",
    floors: 2,
    x: 8,
    y: 39,
    width: 18,
    height: 16,
    accent: "#3f9d6d",
    latitude: 13.4201489200418,
    longitude: 100.009332305166,
    floorsDetail: [{ level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["พื้นที่จัดกิจกรรมนักเรียนนักศึกษาและชมรม"] }],
  },
  {
    id: "building-1",
    name: "อาคาร 1",
    shortName: "อาคาร 1",
    category: "สายอุตสาหกรรม",
    description: "อาคารเรียนสายอุตสาหกรรม · 20 ห้อง",
    floors: 2,
    x: 35,
    y: 60,
    width: 18,
    height: 16,
    accent: "#e8863f",
    latitude: 13.4195377575516,
    longitude: 100.009980743218,
    floorsDetail: [{ level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["อาคารเรียนสายอุตสาหกรรม"] }],
  },
  {
    id: "parking-1",
    name: "โรงจอดรถ 1",
    shortName: "โรงจอดรถ 1",
    category: "ส่วนกลาง-กิจกรรม",
    description: "โรงจอดรถ · อยู่หลังป้อมยามและงานปกครอง",
    floors: 1,
    x: 48,
    y: 8,
    width: 18,
    height: 16,
    accent: "#3f9d6d",
    latitude: 13.421054806515,
    longitude: 100.010319344651,
    floorsDetail: [{ level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["โรงจอดรถ (หลังป้อมยาม / งานปกครอง)"] }],
  },
  {
    id: "building-10",
    name: "ตึก 10",
    shortName: "ตึก 10",
    category: "สายอุตสาหกรรม",
    description: "สาขาวิชาเทคโนโลยีธุรกิจดิจิทัล, สาขาวิชาเขียนแบบเครื่องกล",
    floors: 3,
    x: 79,
    y: 53,
    width: 18,
    height: 16,
    accent: "#e8863f",
    latitude: 13.419732967845,
    longitude: 100.011070041427,
    floorsDetail: [{ level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["สาขาวิชาเทคโนโลยีธุรกิจดิจิทัล", "สาขาวิชาเขียนแบบเครื่องกล"] }],
  },
  {
    id: "construction-workshop",
    name: "ตึกช่างก่อสร้าง",
    shortName: "ช่างก่อสร้าง",
    category: "สายอุตสาหกรรม",
    description: "สาขาวิชาช่างก่อสร้าง",
    floors: 2,
    x: 69,
    y: 41,
    width: 18,
    height: 16,
    accent: "#e8863f",
    latitude: 13.4200930863698,
    longitude: 100.010810547904,
    floorsDetail: [{ level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["สาขาวิชาช่างก่อสร้าง"] }],
  },
  {
    id: "machine-shop",
    name: "ตึกช่างกลโรงงาน",
    shortName: "ช่างกลโรงงาน",
    category: "สายอุตสาหกรรม",
    description: "สาขาวิชาช่างกลโรงงาน",
    floors: 2,
    x: 76,
    y: 38,
    width: 18,
    height: 16,
    accent: "#e8863f",
    latitude: 13.4201707908708,
    longitude: 100.010994527388,
    floorsDetail: [{ level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["สาขาวิชาช่างกลโรงงาน"] }],
  },
  {
    id: "personnel-registration",
    name: "งานบุคคล / งานทะเบียน",
    shortName: "บุคคล / ทะเบียน",
    category: "บริหาร-สนับสนุน",
    description: "งานบุคคล และงานทะเบียน",
    floors: 1,
    x: 53,
    y: 59,
    width: 18,
    height: 16,
    accent: "#6b7a86",
    latitude: 13.4195566966376,
    longitude: 100.01042470173,
    floorsDetail: [{ level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["งานบุคคล", "งานทะเบียน"] }],
  },
  {
    id: "supplies-dept",
    name: "ฝ่ายพัสดุ",
    shortName: "ฝ่ายพัสดุ",
    category: "บริหาร-สนับสนุน",
    description: "ฝ่ายพัสดุ",
    floors: 1,
    x: 76,
    y: 86,
    width: 18,
    height: 16,
    accent: "#6b7a86",
    latitude: 13.418765485825,
    longitude: 100.011001664803,
    floorsDetail: [{ level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["ฝ่ายพัสดุ"] }],
  },
  {
    id: "discipline-dept",
    name: "ฝ่ายปกครอง",
    shortName: "ฝ่ายปกครอง",
    category: "บริหาร-สนับสนุน",
    description: "ฝ่ายปกครอง / งานปกครอง",
    floors: 1,
    x: 44,
    y: 12,
    width: 18,
    height: 16,
    accent: "#6b7a86",
    latitude: 13.420930911335,
    longitude: 100.010204731528,
    floorsDetail: [{ level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["ฝ่ายปกครอง"] }],
  },
  {
    id: "director-office",
    name: "ห้องผู้อำนวยการ",
    shortName: "ห้อง ผอ.",
    category: "บริหาร-สนับสนุน",
    description: "ห้องผู้บริหาร / ผู้อำนวยการวิทยาลัย",
    floors: 1,
    x: 23,
    y: 62,
    width: 18,
    height: 16,
    accent: "#6b7a86",
    latitude: 13.4194815302292,
    longitude: 100.009699233436,
    floorsDetail: [{ level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["ห้องผู้บริหาร", "ห้องผู้อำนวยการ"] }],
  },
];

export const CAMPUS_BUILDINGS: CampusBuilding[] = RAW_CAMPUS_BUILDINGS.map((building) => ({
  ...building,
  latitude: String(building.latitude),
  longitude: String(building.longitude),
  departments: buildDepartments(building),
  gallery: [],
}));

export const CAMPUS_NEWS: CampusNews[] = [
  {
    id: "open-house-2026",
    tag: "กิจกรรมเด่น",
    title: "เปิดบ้านช่างพันธุ์ใหม่ 2026",
    excerpt: "ชวนคุณครู นักเรียน และผู้ปกครองมาสัมผัสห้องปฏิบัติการจริง พร้อมเวิร์กช็อปจากทุกสาขา",
    date: "18 ก.ย. 2569",
    time: "09:00–15:30 น.",
    accent: "#eb8b67",
    link: "",
    image: "",
    source: "",
  },
  {
    id: "enrollment-2026",
    tag: "รับสมัคร",
    title: "กำหนดการรับสมัครนักเรียนใหม่ รอบโควตา",
    excerpt: "เตรียมเอกสารให้พร้อม แล้วมาสมัครด้วยตัวเองที่อาคารอำนวยการ หรือดูรายละเอียดออนไลน์",
    date: "วันนี้ – 30 ก.ย. 2569",
    time: "ประกาศล่าสุด",
    accent: "#3c8f8d",
    link: "",
    image: "",
    source: "",
  },
  {
    id: "skills-competition",
    tag: "ข่าววิทยาลัย",
    title: "ทีมช่างยนต์คว้ารางวัลทักษะระดับจังหวัด",
    excerpt: "ขอแสดงความยินดีกับนักเรียนตัวแทนวิทยาลัยฯ ที่สร้างผลงานโดดเด่นในการแข่งขันทักษะวิชาชีพ",
    date: "05 ก.ย. 2569",
    time: "อ่าน 128 ครั้ง",
    accent: "#bc7a3e",
    link: "",
    image: "",
    source: "",
  },
];

/** Fallback settings used until the `site_settings` table has real values. */
export const CAMPUS_SETTINGS_DEFAULTS: CampusSettings = {
  collegeName: CAMPUS_OVERVIEW.name,
  address: CAMPUS_OVERVIEW.address,
  contactEmail: "info@smtc.ac.th",
  mapEmbedUrl: "",
  mapCenter: CAMPUS_OVERVIEW.mapCenter,
  kiosk: null,
};

/** Keys stored as rows in the `site_settings` table. */
export const CAMPUS_SETTINGS_KEYS = [
  "collegeName",
  "address",
  "contactEmail",
  "mapEmbedUrl",
  "mapCenterLat",
  "mapCenterLng",
  "kioskName",
  "kioskLat",
  "kioskLng",
] as const;
export type CampusSettingKey = (typeof CAMPUS_SETTINGS_KEYS)[number];
