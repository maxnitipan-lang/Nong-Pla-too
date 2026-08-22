// รวมฟังก์ชันเรียก backend API ไว้ที่เดียว หน้าอื่นเรียกผ่านตัวแปร API เท่านั้น
// ไม่ต้องไปเขียน fetch() กระจายอยู่หลายที่

const API = {
  async health() {
    const res = await fetch(`${API_BASE_URL}/health`);
    if (!res.ok) throw new Error("เชื่อมต่อ backend ไม่ได้");
    return res.json();
  },

  async getPlaces() {
    const res = await fetch(`${API_BASE_URL}/places`);
    if (!res.ok) throw new Error("โหลดข้อมูลสถานที่ไม่สำเร็จ");
    return res.json();
  },

  async getStartPoints() {
    const res = await fetch(`${API_BASE_URL}/startpoints`);
    if (!res.ok) throw new Error("โหลดข้อมูลจุดเริ่มต้นไม่สำเร็จ");
    return res.json();
  },

  async getRoute(from, to) {
    const res = await fetch(`${API_BASE_URL}/route?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    if (!res.ok) throw new Error("คำนวณเส้นทางไม่สำเร็จ");
    return res.json();
  },

  async getTransport(from, to) {
    const res = await fetch(`${API_BASE_URL}/transport?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    if (!res.ok) throw new Error("โหลดข้อมูลรถโดยสารไม่สำเร็จ");
    return res.json();
  }
};
