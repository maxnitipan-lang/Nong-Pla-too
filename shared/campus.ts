// Campus domain types + demo data shared between the frontend and backend.
//
// The demo data below is used as a fallback whenever the database is empty or
// unreachable, so the UI can be previewed immediately. Replace it (and populate
// the `campus_buildings` / `campus_news` tables) with real content before
// launch. `x` / `y` are percentage positions on the illustrated campus map;
// swap to real lat/lng when wiring `google.maps.marker.AdvancedMarkerElement`.

// The four Google My Maps layers of the campus PR map.
export type CampusCategory =
  | "สายอุตสาหกรรม"
  | "พาณิชยกรรม/คหกรรม/สามัญ"
  | "บริหาร-สนับสนุน"
  | "ส่วนกลาง-กิจกรรม";

export type FloorDetail = {
  level: number;
  label: string;
  rooms: string[];
};

export type CampusBuilding = {
  id: string;
  name: string;
  shortName: string;
  category: CampusCategory;
  description: string;
  floors: number;
  /** Horizontal position on the illustrated map, 0–100 (%). */
  x: number;
  /** Vertical position on the illustrated map, 0–100 (%). */
  y: number;
  /** Illustrated footprint size, 0–100 (%). */
  width: number;
  height: number;
  /** Marker / accent colour (hex). */
  accent: string;
  /** Real-world coordinates (optional — used when wiring a real map). */
  latitude?: string;
  longitude?: string;
  floorsDetail: FloorDetail[];
};

/** Editable site-wide settings, managed from the admin panel. */
export type CampusSettings = {
  collegeName: string;
  address: string;
  contactEmail: string;
  /** Google My Maps "embed on my site" URL, or "" to use the illustrated map. */
  mapEmbedUrl: string;
  mapCenter: { lat: number; lng: number };
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

export type CampusOverview = {
  address: string;
  mapCenter: { lat: number; lng: number };
  stats: { label: string; value: string }[];
};

export const CAMPUS_BUILDINGS: CampusBuilding[] = [
  {
    id: "mech-auto",
    name: "สาขาวิชาช่างยนต์",
    shortName: "ช่างยนต์",
    category: "สายอุตสาหกรรม",
    description:
      "สาขาวิชาช่างยนต์ · 18 ห้อง",
    floors: 2,
    x: 50,
    y: 10,
    width: 18,
    height: 16,
    accent: "#e8863f",
    latitude: "13.4207317663681",
    longitude: "100.010368922857",
    floorsDetail: [
      { level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["สาขาวิชาช่างยนต์"] },
    ],
  },
  {
    id: "electronics-it",
    name: "สาขาวิชาอิเล็กทรอนิกส์และเทคโนโลยีสารสนเทศ",
    shortName: "อิเล็กทรอนิกส์ / IT",
    category: "สายอุตสาหกรรม",
    description:
      "สาขาวิชาอิเล็กทรอนิกส์ / เทคโนโลยีสารสนเทศ, สาขาวิชาเทคนิคคอมพิวเตอร์ · 33 ห้อง",
    floors: 3,
    x: 55,
    y: 22,
    width: 18,
    height: 16,
    accent: "#e8863f",
    latitude: "13.4204089013263",
    longitude: "100.010475464028",
    floorsDetail: [
      { level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["สาขาวิชาอิเล็กทรอนิกส์ / เทคโนโลยีสารสนเทศ","สาขาวิชาเทคนิคคอมพิวเตอร์"] },
    ],
  },
  {
    id: "electrical-construction",
    name: "สาขาวิชาไฟฟ้ากำลังและก่อสร้าง",
    shortName: "ไฟฟ้ากำลัง / ก่อสร้าง",
    category: "สายอุตสาหกรรม",
    description:
      "สาขาวิชาไฟฟ้ากำลัง / ก่อสร้าง · 48 ห้อง",
    floors: 4,
    x: 59,
    y: 36,
    width: 18,
    height: 16,
    accent: "#e8863f",
    latitude: "13.4200514503851",
    longitude: "100.010592746633",
    floorsDetail: [
      { level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["สาขาวิชาไฟฟ้ากำลัง / ก่อสร้าง"] },
    ],
  },
  {
    id: "ict-building",
    name: "ตึก ICT",
    shortName: "ตึก ICT",
    category: "สายอุตสาหกรรม",
    description:
      "สาขาวิชาช่างเชื่อมโลหะ, สาขาวิชาเมคคาทรอนิกส์และหุ่นยนต์, สาขาวิชาการจัดการสำนักงาน · 30 ห้อง",
    floors: 4,
    x: 87,
    y: 61,
    width: 18,
    height: 16,
    accent: "#e8863f",
    latitude: "13.4193720017185",
    longitude: "100.011311702798",
    floorsDetail: [
      { level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["สาขาวิชาช่างเชื่อมโลหะ","สาขาวิชาเมคคาทรอนิกส์และหุ่นยนต์","สาขาวิชาการจัดการสำนักงาน"] },
    ],
  },
  {
    id: "general-subjects",
    name: "สาขาวิชาสามัญสัมพันธ์",
    shortName: "สามัญสัมพันธ์",
    category: "พาณิชยกรรม/คหกรรม/สามัญ",
    description:
      "หมวดวิชาสามัญ ไทย คณิต วิทย์ อังกฤษ ภาษาจีน · 46 ห้อง",
    floors: 4,
    x: 50,
    y: 76,
    width: 18,
    height: 16,
    accent: "#2f7fb5",
    latitude: "13.4189665484955",
    longitude: "100.010348443725",
    floorsDetail: [
      { level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["หมวดวิชาสามัญ ไทย คณิต วิทย์ อังกฤษ ภาษาจีน"] },
    ],
  },
  {
    id: "commerce",
    name: "สาขาวิชาพาณิชยกรรม",
    shortName: "พาณิชยกรรม",
    category: "พาณิชยกรรม/คหกรรม/สามัญ",
    description:
      "สาขาการตลาดและธุรกิจค้าปลีก, สาขาการบัญชี · 24 ห้อง",
    floors: 3,
    x: 50,
    y: 85,
    width: 18,
    height: 16,
    accent: "#2f7fb5",
    latitude: "13.4187456064652",
    longitude: "100.010345639489",
    floorsDetail: [
      { level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["สาขาการตลาดและธุรกิจค้าปลีก","สาขาการบัญชี"] },
    ],
  },
  {
    id: "home-economics",
    name: "สาขาวิชาคหกรรมศาสตร์",
    shortName: "คหกรรมศาสตร์",
    category: "พาณิชยกรรม/คหกรรม/สามัญ",
    description:
      "สาขาวิชาคหกรรมศาสตร์ · 11 ห้อง",
    floors: 2,
    x: 75,
    y: 82,
    width: 18,
    height: 16,
    accent: "#2f7fb5",
    latitude: "13.4188110707917",
    longitude: "100.01098780958",
    floorsDetail: [
      { level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["สาขาวิชาคหกรรมศาสตร์"] },
    ],
  },
  {
    id: "food-nutrition",
    name: "สาขาวิชาอาหารและโภชนาการ",
    shortName: "อาหารและโภชนาการ",
    category: "พาณิชยกรรม/คหกรรม/สามัญ",
    description:
      "สาขาวิชาอาหารและโภชนาการ · 1 หลัง",
    floors: 1,
    x: 90,
    y: 70,
    width: 18,
    height: 16,
    accent: "#2f7fb5",
    latitude: "13.4191424870995",
    longitude: "100.011380674762",
    floorsDetail: [
      { level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["สาขาวิชาอาหารและโภชนาการ"] },
    ],
  },
  {
    id: "student-development",
    name: "อาคารพัฒนาศักยภาพนักเรียน",
    shortName: "พัฒนาศักยภาพนักเรียน",
    category: "บริหาร-สนับสนุน",
    description:
      "ฝ่ายบริหาร / ธุรการวิทยาลัย · 12 ห้อง",
    floors: 2,
    x: 58,
    y: 90,
    width: 18,
    height: 16,
    accent: "#6b7a86",
    latitude: "13.4186010393477",
    longitude: "100.01055876144",
    floorsDetail: [
      { level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["ฝ่ายบริหาร / ธุรการวิทยาลัย"] },
    ],
  },
  {
    id: "building-85",
    name: "อาคาร 85 ปี",
    shortName: "อาคาร 85 ปี",
    category: "บริหาร-สนับสนุน",
    description:
      "ฝ่ายบริหารทรัพยากร, ฝ่ายยุทธศาสตร์และแผนงาน, ฝ่ายกิจการนักเรียนนักศึกษา, ฝ่ายวิชาการ · 4 ชั้น",
    floors: 4,
    x: 41,
    y: 68,
    width: 18,
    height: 16,
    accent: "#6b7a86",
    latitude: "13.4191765796198",
    longitude: "100.010118496356",
    floorsDetail: [
      { level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["ฝ่ายบริหารทรัพยากร","ฝ่ายยุทธศาสตร์และแผนงาน","ฝ่ายกิจการนักเรียนนักศึกษา","ฝ่ายวิชาการ"] },
    ],
  },
  {
    id: "ivec-central-5",
    name: "อาคารสถาบันการอาชีวศึกษาภาคกลาง 5",
    shortName: "สอฐ.ภาคกลาง 5",
    category: "บริหาร-สนับสนุน",
    description:
      "สถาบันการอาชีวศึกษาภาคกลาง 5 · 33 ห้อง",
    floors: 3,
    x: 62,
    y: 49,
    width: 18,
    height: 16,
    accent: "#6b7a86",
    latitude: "13.4196921080512",
    longitude: "100.010664863585",
    floorsDetail: [
      { level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["สถาบันการอาชีวศึกษาภาคกลาง 5"] },
    ],
  },
  {
    id: "auditorium",
    name: "หอประชุม (โรงอาหาร)",
    shortName: "หอประชุม / โรงอาหาร",
    category: "ส่วนกลาง-กิจกรรม",
    description:
      "พื้นที่ส่วนกลาง จัดกิจกรรมและรับประทานอาหาร · 2 ห้อง",
    floors: 1,
    x: 71,
    y: 64,
    width: 18,
    height: 16,
    accent: "#3f9d6d",
    latitude: "13.419306679309",
    longitude: "100.01088199252",
    floorsDetail: [
      { level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["พื้นที่ส่วนกลาง จัดกิจกรรมและรับประทานอาหาร"] },
    ],
  },
  {
    id: "activity-building",
    name: "อาคารกิจกรรม",
    shortName: "อาคารกิจกรรม",
    category: "ส่วนกลาง-กิจกรรม",
    description:
      "พื้นที่จัดกิจกรรมนักเรียนนักศึกษาและชมรม · 8 ห้อง",
    floors: 2,
    x: 10,
    y: 32,
    width: 18,
    height: 16,
    accent: "#3f9d6d",
    latitude: "13.4201489200418",
    longitude: "100.009332305166",
    floorsDetail: [
      { level: 1, label: "แผนกวิชา / หน่วยงาน", rooms: ["พื้นที่จัดกิจกรรมนักเรียนนักศึกษาและชมรม"] },
    ],
  },
];

export const CAMPUS_NEWS: CampusNewsItem[] = [
  {
    id: "open-house-2026",
    tag: "กิจกรรมเด่น",
    title: "เปิดบ้านช่างพันธุ์ใหม่ 2026",
    excerpt:
      "ชวนคุณครู นักเรียน และผู้ปกครองมาสัมผัสห้องปฏิบัติการจริง พร้อมเวิร์กช็อปจากทุกสาขา",
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
    excerpt:
      "เตรียมเอกสารให้พร้อม แล้วมาสมัครด้วยตัวเองที่อาคารอำนวยการ หรือดูรายละเอียดออนไลน์",
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
    excerpt:
      "ขอแสดงความยินดีกับนักเรียนตัวแทนวิทยาลัยฯ ที่สร้างผลงานโดดเด่นในการแข่งขันทักษะวิชาชีพ",
    date: "05 ก.ย. 2569",
    time: "อ่าน 128 ครั้ง",
    accent: "#bc7a3e",
    link: "",
    image: "",
    source: "",
  },
];

// อาคาร 13 หลัง + พิกัด นำเข้าจาก Google My Maps ของวิทยาลัย (KMZ, ก.ย. 2569)
export const CAMPUS_OVERVIEW: CampusOverview = {
  address: "วิทยาลัยเทคนิคสมุทรสงคราม อำเภอเมืองสมุทรสงคราม จังหวัดสมุทรสงคราม",
  mapCenter: { lat: 13.41967, lng: 100.01036 },
  stats: [
    { label: "อาคาร/หน่วยงาน", value: `${CAMPUS_BUILDINGS.length} จุด` },
    { label: "กลุ่มเลเยอร์", value: "4 กลุ่ม" },
    { label: "ข่าวสารล่าสุด", value: `${CAMPUS_NEWS.length} เรื่อง` },
  ],
};

/** Fallback settings used until the `site_settings` table has real values. */
export const CAMPUS_SETTINGS_DEFAULTS: CampusSettings = {
  collegeName: "วิทยาลัยเทคนิคสมุทรสงคราม",
  address: CAMPUS_OVERVIEW.address,
  contactEmail: "info@smtc.ac.th",
  mapEmbedUrl: "",
  mapCenter: CAMPUS_OVERVIEW.mapCenter,
};

/** Keys stored as rows in the `site_settings` table. */
export const CAMPUS_SETTINGS_KEYS = [
  "collegeName",
  "address",
  "contactEmail",
  "mapEmbedUrl",
  "mapCenterLat",
  "mapCenterLng",
] as const;
export type CampusSettingKey = (typeof CAMPUS_SETTINGS_KEYS)[number];
