const express = require('express');
const router = express.Router();
const places = require('../data/places.json');
const startpoints = require('../data/startpoints.json');

// คำนวณระยะทางแบบเส้นตรง (haversine) — ใช้ชั่วคราวก่อนต่อ Directions API จริง
function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// GET /api/route?from=station&to=ampawa
// คืนพิกัดจุดเริ่ม-ปลายทาง + ระยะทางประมาณ
// TODO: ตอนมี Directions API (เช่น Longdo/Google) ให้เปลี่ยน logic ตรงนี้
// ให้ไปเรียก API จริงแทนการคำนวณเส้นตรง จะได้เส้นทางตามถนนจริงและเวลาเดินทางจริง
router.get('/', (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: 'ต้องระบุ query param "from" และ "to"' });
  }

  const start = startpoints.find((s) => s.id === from);
  const place = places.find((p) => p.id === to);

  if (!start) return res.status(404).json({ error: `ไม่พบจุดเริ่มต้น id "${from}"` });
  if (!place) return res.status(404).json({ error: `ไม่พบสถานที่ id "${to}"` });

  const distanceKm = haversineKm(start, place);

  res.json({
    from: start,
    to: place,
    distanceKm: Number(distanceKm.toFixed(2)),
    routeType: 'straight-line', // เปลี่ยนเป็น 'road' เมื่อต่อ Directions API แล้ว
    path: [
      [start.lat, start.lng],
      [place.lat, place.lng]
    ]
  });
});

module.exports = router;
