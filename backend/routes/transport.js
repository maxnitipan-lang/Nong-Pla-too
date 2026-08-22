const express = require('express');
const router = express.Router();
const transportData = require('../data/transport.json');

// GET /api/transport?from=station&to=ampawa
// คืนตัวเลือกรถโดยสารสำหรับเส้นทางนั้น ถ้าไม่มีข้อมูลเฉพาะเส้นทาง จะคืนค่า default แทน
router.get('/', (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: 'ต้องระบุ query param "from" และ "to"' });
  }

  const key = `${from}->${to}`;
  const options = transportData.routes[key] || transportData.default;
  const isDefault = !transportData.routes[key];

  res.json({
    from,
    to,
    isDefault,        // true = ยังไม่มีข้อมูลจริงของเส้นทางนี้ ใช้ค่าตัวอย่างแทน
    options
  });
});

module.exports = router;
