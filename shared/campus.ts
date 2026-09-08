// Campus domain types + demo data shared between the frontend and backend.
//
// The demo data below is used as a fallback whenever the database is empty or
// unreachable, so the UI can be previewed immediately. Replace it (and populate
// the `campus_buildings` / `campus_news` tables) with real content before
// launch. `x` / `y` are percentage positions on the illustrated campus map;
// swap to real lat/lng when wiring `google.maps.marker.AdvancedMarkerElement`.

export type CampusCategory = "วิชาการ" | "ปฏิบัติการ" | "บริการ" | "กิจกรรม";

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
};

export type CampusOverview = {
  address: string;
  mapCenter: { lat: number; lng: number };
  stats: { label: string; value: string }[];
};

export const CAMPUS_BUILDINGS: CampusBuilding[] = [
  {
    id: "main",
    name: "อาคารอำนวยการ",
    shortName: "อาคารอำนวยการ",
    category: "บริการ",
    description:
      "ศูนย์กลางการติดต่อราชการ งานทะเบียน และบริการข้อมูลสำหรับนักเรียน นักศึกษาและผู้มาติดต่อ",
    floors: 3,
    x: 47,
    y: 34,
    width: 19,
    height: 17,
    accent: "#123b52",
    floorsDetail: [
      { level: 1, label: "ชั้น 1", rooms: ["ประชาสัมพันธ์", "งานสารบรรณ", "ห้องผู้อำนวยการ"] },
      { level: 2, label: "ชั้น 2", rooms: ["งานทะเบียน", "งานการเงิน", "ห้องประชุมเล็ก"] },
      { level: 3, label: "ชั้น 3", rooms: ["งานบุคลากร", "ห้องประชุมใหญ่", "งานแผนงาน"] },
    ],
  },
  {
    id: "mechanical",
    name: "อาคารช่างยนต์",
    shortName: "ช่างยนต์",
    category: "ปฏิบัติการ",
    description:
      "พื้นที่เรียนรู้และฝึกปฏิบัติด้านเครื่องยนต์ ระบบยานยนต์ และเทคโนโลยีรถไฟฟ้า",
    floors: 2,
    x: 16,
    y: 30,
    width: 19,
    height: 20,
    accent: "#eb8b67",
    floorsDetail: [
      { level: 1, label: "ชั้น 1", rooms: ["โรงฝึกเครื่องยนต์", "ห้องปฏิบัติการ EV", "คลังเครื่องมือ"] },
      { level: 2, label: "ชั้น 2", rooms: ["ห้องเรียนทฤษฎี", "ห้องพักครูช่างยนต์", "ห้องสื่อการเรียนรู้"] },
    ],
  },
  {
    id: "business",
    name: "อาคารพาณิชยกรรม",
    shortName: "พาณิชยกรรม",
    category: "วิชาการ",
    description:
      "แหล่งเรียนรู้ด้านธุรกิจดิจิทัล การบัญชี การตลาด และการจัดการสำนักงานสมัยใหม่",
    floors: 4,
    x: 72,
    y: 21,
    width: 17,
    height: 19,
    accent: "#3c8f8d",
    floorsDetail: [
      { level: 1, label: "ชั้น 1", rooms: ["ห้องปฏิบัติการสำนักงาน", "ศูนย์ฝึกธุรกิจจำลอง"] },
      { level: 2, label: "ชั้น 2", rooms: ["ห้องเรียนบัญชี", "ห้องปฏิบัติการการตลาด"] },
      { level: 3, label: "ชั้น 3", rooms: ["ห้องคอมพิวเตอร์ธุรกิจ", "สตูดิโอสื่อดิจิทัล"] },
      { level: 4, label: "ชั้น 4", rooms: ["ห้องประชุมสาขา", "ห้องพักครูพาณิชยกรรม"] },
    ],
  },
  {
    id: "industrial",
    name: "อาคารช่างอุตสาหกรรม",
    shortName: "ช่างอุตสาหกรรม",
    category: "ปฏิบัติการ",
    description:
      "เวิร์กช็อปและห้องปฏิบัติการสำหรับงานเชื่อม กลโรงงาน ไฟฟ้ากำลัง และระบบอัตโนมัติ",
    floors: 3,
    x: 67,
    y: 58,
    width: 23,
    height: 18,
    accent: "#bc7a3e",
    floorsDetail: [
      { level: 1, label: "ชั้น 1", rooms: ["โรงงานเชื่อมโลหะ", "โรงงานผลิตชิ้นส่วน", "ห้องเครื่องมือช่าง"] },
      { level: 2, label: "ชั้น 2", rooms: ["ห้อง PLC และระบบอัตโนมัติ", "ห้องไฟฟ้ากำลัง"] },
      { level: 3, label: "ชั้น 3", rooms: ["ห้องเขียนแบบ", "ห้องพักครูช่างอุตสาหกรรม"] },
    ],
  },
  {
    id: "library",
    name: "อาคารวิทยบริการและห้องสมุด",
    shortName: "ห้องสมุด",
    category: "บริการ",
    description:
      "พื้นที่อ่านหนังสือ ห้องสืบค้นดิจิทัล และมุมทำงานร่วมกันสำหรับการเรียนรู้ตลอดชีวิต",
    floors: 2,
    x: 28,
    y: 67,
    width: 22,
    height: 16,
    accent: "#5b7da9",
    floorsDetail: [
      { level: 1, label: "ชั้น 1", rooms: ["โถงบริการยืมคืน", "มุมอ่านหนังสือ", "ห้องสืบค้นออนไลน์"] },
      { level: 2, label: "ชั้น 2", rooms: ["ห้องทำงานกลุ่ม", "ห้องเรียนรู้ด้วยตนเอง", "ห้องประชุมย่อย"] },
    ],
  },
  {
    id: "student",
    name: "อาคารกิจการนักเรียน",
    shortName: "กิจการนักเรียน",
    category: "กิจกรรม",
    description:
      "ศูนย์กลางกิจกรรม ชมรม ทุนการศึกษา งานแนะแนว และพื้นที่สนับสนุนชีวิตนักศึกษา",
    floors: 2,
    x: 8,
    y: 63,
    width: 16,
    height: 17,
    accent: "#7e6aa8",
    floorsDetail: [
      { level: 1, label: "ชั้น 1", rooms: ["งานแนะแนว", "ห้องพยาบาล", "ห้องสภานักเรียน"] },
      { level: 2, label: "ชั้น 2", rooms: ["ห้องชมรม", "งานทุนการศึกษา", "ห้องกิจกรรมอเนกประสงค์"] },
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
  },
];

// ข้อมูลสาธิต — ปรับให้ตรงกับวิทยาลัยจริงก่อนเผยแพร่
export const CAMPUS_OVERVIEW: CampusOverview = {
  address: "วิทยาลัยเทคนิคสมุทรสงคราม อำเภอเมืองสมุทรสงคราม จังหวัดสมุทรสงคราม",
  mapCenter: { lat: 13.4166, lng: 100.0023 },
  stats: [
    { label: "อาคารเรียนหลัก", value: `${CAMPUS_BUILDINGS.length} อาคาร` },
    { label: "ประเภทการใช้งาน", value: "4 กลุ่ม" },
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
