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

export const IMAGE_SLOT_GUIDE = {
  character: "client/public/images/kiosk/",
  departments: "client/public/images/departments/",
  note: "ใส่ไฟล์จริงตามชื่อด้านบน หรือเปลี่ยน path ในไฟล์นี้ได้โดยไม่ต้องแก้หน้า UI",
};
