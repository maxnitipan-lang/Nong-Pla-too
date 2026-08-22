// จัดการทุกอย่างที่เกี่ยวกับแมพ (Leaflet) แยกออกมาจาก logic ดึงข้อมูล/แสดงผล sidebar
// ฟังก์ชันตรงนี้ไม่ต้องรู้เรื่อง API เลย รับแค่ data เข้ามาแล้ววาด

const MapView = (() => {
  let map;
  let placeMarkers = {};
  let startMarker = null;
  let routeLine = null;

  function init() {
    map = L.map('map', { zoomControl: true }).setView([13.412, 99.985], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);
    return map;
  }

  function riverIcon(emoji, active) {
    return L.divIcon({
      className: '',
      html: `<div style="
        width:34px;height:34px;border-radius:50% 50% 50% 0;
        background:${active ? '#d97b3f' : '#17454f'};
        transform:rotate(-45deg);
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 2px 6px rgba(0,0,0,0.35);
        border:2px solid #f4ede0;
      "><span style="transform:rotate(45deg);font-size:15px;">${emoji}</span></div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 32],
      popupAnchor: [0, -30]
    });
  }

  function renderPlaces(places, onClick) {
    places.forEach(p => {
      const m = L.marker([p.lat, p.lng], { icon: riverIcon(p.icon, false) }).addTo(map);
      m.bindPopup(`<b>${p.name}</b><br>${p.tag}`);
      m.on('click', () => onClick(p.id));
      placeMarkers[p.id] = m;
    });
  }

  function setActivePlace(places, activeId) {
    places.forEach(p => {
      placeMarkers[p.id]?.setIcon(riverIcon(p.icon, p.id === activeId));
    });
  }

  function setStart(point) {
    if (startMarker) map.removeLayer(startMarker);
    startMarker = L.marker([point.lat, point.lng], {
      icon: L.divIcon({
        className: '',
        html: `<div style="width:16px;height:16px;border-radius:50%;background:#3c7a72;border:3px solid #f4ede0;box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>`,
        iconSize: [16, 16], iconAnchor: [8, 8]
      })
    }).addTo(map);
    startMarker.bindPopup(`<b>จุดเริ่มต้น</b><br>${point.name}`);
  }

  function drawRoute(path) {
    if (routeLine) map.removeLayer(routeLine);
    routeLine = L.polyline(path, {
      color: '#d97b3f', weight: 4, opacity: 0.85, dashArray: '2 10', lineCap: 'round'
    }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { padding: [60, 60] });
  }

  function clearRoute() {
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
  }

  function resetView() {
    map.setView([13.412, 99.985], 13);
  }

  return { init, renderPlaces, setActivePlace, setStart, drawRoute, clearRoute, resetView };
})();
