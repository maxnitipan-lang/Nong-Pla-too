// Who may do what in /admin. Shared so the server guards and the UI agree.
//
//   admin  — everything, including adding/removing people and changing roles
//   editor — edit buildings, walkways, news and site settings
//   viewer — open the admin pages read-only
//   user   — a signed-in visitor with no admin access (OAuth accounts default here)

export const USER_ROLES = ["user", "viewer", "editor", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Roles that can be given to a username/password staff account. */
export const STAFF_ROLES = ["admin", "editor", "viewer"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "ผู้ดูแล",
  editor: "ผู้แก้ไข",
  viewer: "ดูอย่างเดียว",
  user: "ไม่มีสิทธิ์",
};

export const ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  admin: "แก้ไขข้อมูลได้ทั้งหมด + เพิ่ม/ลบ/เปลี่ยนสิทธิ์ผู้ใช้",
  editor: "แก้ไขอาคาร ทางเดิน ข่าว และตั้งค่าเว็บ (จัดการผู้ใช้ไม่ได้)",
  viewer: "เปิดดูหน้าผู้ดูแลได้ แต่แก้ไขอะไรไม่ได้",
};

export const isStaff = (role: string | null | undefined): boolean =>
  role === "admin" || role === "editor" || role === "viewer";
export const canEdit = (role: string | null | undefined): boolean => role === "admin" || role === "editor";
export const canManageUsers = (role: string | null | undefined): boolean => role === "admin";

export const READ_ONLY_ERR_MSG = "บัญชีนี้ดูได้อย่างเดียว — ไม่มีสิทธิ์แก้ไขข้อมูล";
