const express = require('express');
const router = express.Router();
const startpoints = require('../data/startpoints.json');

// GET /api/startpoints -> รายการจุดเริ่มต้นทั้งหมด (สถานีขนส่ง, สถานีรถไฟ ฯลฯ)
router.get('/', (req, res) => {
  res.json(startpoints);
});

module.exports = router;
