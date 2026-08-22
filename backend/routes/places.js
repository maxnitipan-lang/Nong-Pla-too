const express = require('express');
const router = express.Router();
const places = require('../data/places.json');

// GET /api/places  -> รายการสถานที่ท่องเที่ยวทั้งหมด
router.get('/', (req, res) => {
  res.json(places);
});

// GET /api/places/:id  -> ข้อมูลสถานที่เดียว
router.get('/:id', (req, res) => {
  const place = places.find(p => p.id === req.params.id);
  if (!place) {
    return res.status(404).json({ error: `ไม่พบสถานที่ id "${req.params.id}"` });
  }
  res.json(place);
});

module.exports = router;
