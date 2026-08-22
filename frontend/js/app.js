// จุดเริ่มการทำงานของหน้าเว็บ: โหลดข้อมูลจาก API แล้วเชื่อมกับ sidebar + แมพ

let placesCache = [];
let startPointsCache = [];
let activePlaceId = null;

const el = {
  apiStatusText: document.getElementById('apiStatusText'),
  startSelect: document.getElementById('startSelect'),
  placeList: document.getElementById('placeList'),
  routeSummary: document.getElementById('routeSummary'),
  rsTitle: document.getElementById('rsTitle'),
  rsDetail: document.getElementById('rsDetail'),
  transportList: document.getElementById('transportList'),
  dataSourceNote: document.getElementById('dataSourceNote'),
  clearBtn: document.getElementById('clearBtn'),
};

async function checkApiHealth() {
  try {
    await API.health();
    el.apiStatusText.textContent = 'เชื่อมต่อสำเร็จ';
    el.apiStatusText.className = 'ok';
    return true;
  } catch (err) {
    el.apiStatusText.textContent = 'เชื่อมต่อไม่ได้';
    el.apiStatusText.className = 'err';
    el.placeList.innerHTML = `
      <div class="error-banner">
        เชื่อมต่อ backend ไม่ได้ (${API_BASE_URL})<br>
        ตรวจสอบว่ารัน backend ด้วย <code>npm start</code> ในโฟลเดอร์ backend แล้วหรือยัง
      </div>`;
    return false;
  }
}

function renderStartSelect() {
  el.startSelect.innerHTML = '';
  startPointsCache.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    el.startSelect.appendChild(opt);
  });
}

function renderPlaceList() {
  el.placeList.innerHTML = '';
  placesCache.forEach(p => {
    const card = document.createElement('div');
    card.className = 'place-card';
    card.dataset.id = p.id;
    card.tabIndex = 0;
    card.innerHTML = `
      <div class="place-icon">${p.icon}</div>
      <div>
        <div class="place-name">${p.name}</div>
        <div class="place-tag">${p.tag}</div>
      </div>
    `;
    card.addEventListener('click', () => selectPlace(p.id));
    card.addEventListener('keypress', e => { if (e.key === 'Enter') selectPlace(p.id); });
    el.placeList.appendChild(card);
  });
}

function currentStart() {
  return startPointsCache.find(s => s.id === el.startSelect.value);
}

async function selectPlace(placeId) {
  activePlaceId = placeId;
  const place = placesCache.find(p => p.id === placeId);
  const start = currentStart();
  if (!place || !start) return;

  document.querySelectorAll('.place-card').forEach(c => {
    c.classList.toggle('active', c.dataset.id === placeId);
  });
  MapView.setActivePlace(placesCache, placeId);

  // เรียก backend สองอย่างพร้อมกัน: ระยะทาง + ตัวเลือกรถโดยสาร
  try {
    const [routeData, transportData] = await Promise.all([
      API.getRoute(start.id, place.id),
      API.getTransport(start.id, place.id)
    ]);

    MapView.drawRoute(routeData.path);

    el.rsTitle.textContent = `${start.name} → ${place.name}`;
    el.rsDetail.textContent = `ระยะทางประมาณ ${routeData.distanceKm} กม. (${routeData.routeType === 'straight-line' ? 'เส้นตรง — รอต่อ Directions API' : 'ตามเส้นถนนจริง'})`;

    el.transportList.innerHTML = transportData.options.map(t => `
      <div class="transport-item">
        <div class="t-left"><span class="t-badge">${t.icon}</span><span class="t-name">${t.label}</span></div>
        <span class="t-price">${t.price}</span>
      </div>
    `).join('');

    el.dataSourceNote.textContent = transportData.isDefault
      ? '* ยังไม่มีข้อมูลรถโดยสารเฉพาะเส้นทางนี้ — แสดงค่าตัวอย่าง (default) แทน'
      : '* ข้อมูลรถโดยสารของเส้นทางนี้ถูกกรอกไว้แล้วใน backend/data/transport.json';

    el.routeSummary.classList.add('show');
  } catch (err) {
    console.error(err);
    el.dataSourceNote.textContent = '* เกิดข้อผิดพลาดในการโหลดข้อมูลเส้นทาง/รถโดยสาร';
  }
}

function clearSelection() {
  activePlaceId = null;
  MapView.clearRoute();
  el.routeSummary.classList.remove('show');
  document.querySelectorAll('.place-card').forEach(c => c.classList.remove('active'));
  MapView.setActivePlace(placesCache, null);
  MapView.resetView();
}

async function bootstrap() {
  MapView.init();

  const apiOk = await checkApiHealth();
  if (!apiOk) return;

  try {
    [placesCache, startPointsCache] = await Promise.all([
      API.getPlaces(),
      API.getStartPoints()
    ]);
  } catch (err) {
    el.placeList.innerHTML = `<div class="error-banner">โหลดข้อมูลไม่สำเร็จ: ${err.message}</div>`;
    return;
  }

  renderStartSelect();
  renderPlaceList();
  MapView.renderPlaces(placesCache, selectPlace);
  MapView.setStart(currentStart());

  el.startSelect.addEventListener('change', () => {
    MapView.setStart(currentStart());
    if (activePlaceId) selectPlace(activePlaceId);
  });

  el.clearBtn.addEventListener('click', clearSelection);
}

bootstrap();
