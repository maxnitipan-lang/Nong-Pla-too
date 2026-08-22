const express = require('express');
const cors = require('cors');
const path = require('path');

const placesRouter = require('./routes/places');
const startpointsRouter = require('./routes/startpoints');
const transportRouter = require('./routes/transport');
const routeRouter = require('./routes/route');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// log ทุก request แบบง่ายๆ ช่วย debug ตอนพัฒนา
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'samutsongkhram-travel-api' });
});

app.use('/api/places', placesRouter);
app.use('/api/startpoints', startpointsRouter);
app.use('/api/transport', transportRouter);
app.use('/api/route', routeRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'ไม่พบ endpoint นี้', path: req.originalUrl });
});

// error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'เกิดข้อผิดพลาดฝั่งเซิร์ฟเวอร์' });
});

app.listen(PORT, () => {
  console.log(`🚤 Backend API พร้อมทำงานที่ http://localhost:${PORT}`);
  console.log(`   ลองเรียก http://localhost:${PORT}/api/health เพื่อเช็คว่าเซิร์ฟเวอร์ทำงาน`);
});
