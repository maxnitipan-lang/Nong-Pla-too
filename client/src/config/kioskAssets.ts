/**
 * Frontend-only asset slots for Nong Platoo Ontour Kiosk.
 * Replace the paths below when the real images are ready.
 * Keep files small or upload them to project storage before production use.
 */
export const KIOSK_ASSETS = {
  character: {
    idle: "/images/kiosk/nong-platoo-idle.jpg",
    greeting: "/images/kiosk/nong-platu-greeting.png",
    listening: "/images/kiosk/nong-platu-listening.png",
    thinking: "/images/kiosk/nong-platu-thinking.png",
    speaking: "/images/kiosk/nong-platu-speaking.png",
  },
  campus: {
    welcomeBackground: "/images/kiosk/campus-welcome.webp",
    mapOverlay: "/images/kiosk/campus-map-overlay.png",
  },
} as const;

export const DEPARTMENT_LOGOS: Record<string, string> = {
  AUT: "/images/departments/AUT.png",
  DBT: "/images/departments/DBT.png",
  ELEC: "/images/departments/ELEC.png",
  MEC: "/images/departments/MEC.png",
  ACC: "/images/departments/ACC.png",
};

/**
 * โลโก้รายสาขา — key คือคำในชื่อสาขา (เช่น "เขียนแบบเครื่องกล") ใช้กับการ์ดสาขา และหมุดของอาคารที่สาขานั้นอยู่
 * วางไฟล์ไว้ที่ client/public/images/departments/
 */
export const DEPARTMENT_LOGOS_BY_NAME: Record<string, string> = {
  "อิเล็กทรอนิกส์": "/images/buildings/electronics-it.png",
  "เขียนแบบเครื่องกล": "/images/departments/mechanical-drafting.png",
  "ช่างยนต์": "/images/departments/automotive.png",
  "ช่างก่อสร้าง": "/images/departments/construction.png",
  "ไฟฟ้ากำลัง": "/images/departments/electrical-power.png",
};

/** Logo for a department: matched by name first, then by its code. */
export function departmentLogo(department: { name: string; code: string }): string | undefined {
  const byName = Object.entries(DEPARTMENT_LOGOS_BY_NAME).find(([keyword]) => department.name.includes(keyword));
  return byName?.[1] ?? DEPARTMENT_LOGOS[department.code];
}

/**
 * รูปบนหมุดอาคารในแผนที่ (แทนตัวเลข "01") — key คือ id ของอาคารใน shared/campus.ts
 * วางไฟล์ไว้ที่ client/public/images/buildings/ แล้วเพิ่มบรรทัดที่นี่ อาคารที่ไม่มีรูปจะแสดงแบบเดิม
 */
export const BUILDING_MARKER_IMAGES: Record<string, string> = {
  // "mech-auto": "/images/buildings/mech-auto.png",
  "electronics-it": "/images/buildings/electronics-it.png",
  // "auditorium": "/images/buildings/auditorium.jpg",
};

export const IMAGE_SLOT_GUIDE = {
  character: "client/public/images/kiosk/",
  departments: "client/public/images/departments/",
  buildings: "client/public/images/buildings/",
  note: "ใส่ไฟล์จริงตามชื่อด้านบน หรือเปลี่ยน path ในไฟล์นี้ได้โดยไม่ต้องแก้หน้า UI",
};
