// SVG icons from the Figma design (same set as the React Icons.tsx).
// icon("map") → an <svg> string sized by CSS.

const PATHS = {
  home: '<path d="m3 11 9-8 9 8" /> <path d="M5 10v10h14V10M9 20v-6h6v6" />',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z" /> <path d="M9 3v15M15 6v15" />',
  news: '<path d="M5 4h14v16H5z" /> <path d="M8 8h8M8 12h8M8 16h5" />',
  school: '<path d="m3 10 9-6 9 6" /> <path d="M5 10v9h14v-9M9 19v-5h6v5" /> <path d="M8 9h8" />',
  search: '<circle cx="11" cy="11" r="7" /> <path d="m20 20-4-4" />',
  moon: '<path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />',
  sun: '<circle cx="12" cy="12" r="4" /> <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />',
  mic: '<rect x="8" y="3" width="8" height="12" rx="4" /> <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />',
  close: '<path d="m6 6 12 12M18 6 6 18" />',
  arrow: '<path d="M5 12h14M14 7l5 5-5 5" />',
  back: '<path d="M19 12H5M10 7l-5 5 5 5" />',
  route: '<circle cx="6" cy="19" r="2" /> <circle cx="18" cy="5" r="2" /> <path d="M6 17c0-6 12-4 12-10" />',
  layers: '<path d="m12 3 9 5-9 5-9-5Z" /> <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />',
  clock: '<circle cx="12" cy="12" r="9" /> <path d="M12 7v5l3 2" />',
  pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /> <circle cx="12" cy="10" r="2" />',
  volume: '<path d="M5 10v4h4l5 4V6l-5 4Z" /> <path d="M17 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" />',
  send: '<path d="m3 3 18 9-18 9 4-9Z" /> <path d="M7 12h14" />',
  menu: '<path d="M4 7h16M4 12h16M4 17h16" />',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" /> <circle cx="12" cy="20" r=".5" fill="currentColor" />',
  gear: '<circle cx="12" cy="12" r="3" /> <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />',
  bolt: '<path d="m13 2-8 12h7l-1 8 8-12h-7Z" />',
  code: '<path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14" />',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2" /> <path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2" />',
  building: '<path d="M4 21V5l8-3v19M12 8h8v13M8 7v2M8 12v2M8 17v2M16 12h1M16 16h1" />',
  palette: '<path d="M12 3a9 9 0 0 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h6a3 3 0 0 0 3-3c0-4-4-7-9-7Z" /> <circle cx="7.5" cy="10" r=".7" fill="currentColor" /> <circle cx="10" cy="7" r=".7" fill="currentColor" /> <circle cx="14" cy="7" r=".7" fill="currentColor" />',

  // Turn-by-turn and player icons (Lucide, ISC licence — same as the React app used).
  depart: '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4"/><path d="M4 13h4"/>',
  straight: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  "slight-left": '<path d="M7 17V7h10"/><path d="M17 17 7 7"/>',
  "slight-right": '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  left: '<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
  "sharp-left": '<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
  right: '<polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/>',
  "sharp-right": '<polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/>',
  uturn: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  arrive: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
  navigate: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
  stop: '<rect width="14" height="14" x="5" y="5" rx="2"/>',
  "volume-on": '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  "volume-off": '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>',
  spinner: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
};

export function icon(name, extraClass = "") {
  return `<svg class="${extraClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? ""}</svg>`;
}
