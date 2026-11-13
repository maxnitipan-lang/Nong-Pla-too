// English version of the app (TH / EN button in the header).
// The pages are built in Thai; in English this file swaps the Thai text on screen:
//   1. whole strings (menus, buttons, messages) from UI,
//   2. names and common words inside longer text (building, room, department names) from TERMS,
//   3. numbers in phrases ("พบ 5 สถานที่", "เดิน ~3 นาที") from PATTERNS.
// Text people wrote (chat messages, news from the college website) is left as it is.

import { DEPARTMENT_EN } from "./i18nDepartments.js";

const KEY = "lang";

export function getLang() {
  try {
    return localStorage.getItem(KEY) === "en" ? "en" : "th";
  } catch {
    return "th";
  }
}

export function setLang(lang) {
  try {
    localStorage.setItem(KEY, lang === "en" ? "en" : "th");
  } catch {}
}

export const isEnglish = () => getLang() === "en";

/** Speech / recognition language for the current version. */
export const speechLang = () => (isEnglish() ? "en-US" : "th-TH");

// ------------------------------------------------------------------ whole strings
const UI = {
  "หน้าหลัก": "Home",
  "แผนที่": "Map",
  "ข่าวสาร": "News",
  "สาขาวิชา": "Programs",
  "ทั้งหมด": "All",
  "กลับหน้าหลัก": "Back to home",
  "น้องปลาทู": "Nong Platoo",
  "เมนูหลัก": "Main menu",
  "ออนไลน์": "Online",
  "ออฟไลน์": "Offline",
  "ใช้ธีมสว่าง": "Use light theme",
  "ใช้ธีมมืด": "Use dark theme",
  "เปิดแผนที่": "Open map",
  "เปิดผู้ช่วยน้องปลาทู": "Open Nong Platoo assistant",
  "ถามน้องปลาทู": "Ask Nong Platoo",
  "แตะเพื่อเริ่มถาม": "Tap to ask",
  "เมนูสำหรับมือถือ": "Mobile menu",
  "ค้นหาสถานที่": "Find a place",
  "ดูอาคาร ห้องเรียน และเส้นทาง": "Buildings, rooms and routes",
  "ประกาศและกิจกรรมล่าสุด": "Latest announcements and events",
  "ดูแผนกและหลักสูตรทั้งหมด": "All departments and courses",
  "ถามด้วยเสียง": "Ask by voice",
  "พูดคุยกับน้องปลาทู": "Talk with Nong Platoo",
  "ผู้ช่วยนำทางอัจฉริยะวิทยาลัยเทคนิคสมุทรสงคราม": "Smart campus guide of Samutsongkhram Technical College",
  "น้องปลาทูยกมือไหว้ทักทาย": "Nong Platoo greeting you",
  "ถามน้องปลาทูด้วยเสียง": "Ask Nong Platoo by voice",
  "สวัสดีครับ ผมน้องปลาทู": "Hello, I'm Nong Platoo",
  "เลือกเมนูที่ต้องการ หรือกดไมค์เพื่อพูดกับผมได้เลยครับ": "Pick a menu, or tap the mic and talk to me.",
  "สถานที่ในวิทยาลัย": "Places on campus",
  "ยินดีต้อนรับสู่ Nong Platoo Ontour": "Welcome to Nong Platoo Ontour",
  "เลือกสิ่งที่ต้องการได้เลยครับ": "What would you like to do?",
  "เปิดแผนที่วิทยาลัยและดูทุกอาคาร": "Open the campus map and see every building",
  "ติดตั้งแอปน้องปลาทู": "Install the Nong Platoo app",
  "เปิดได้จากหน้าจอโฮม เต็มจอ ใช้ได้แม้สัญญาณไม่ดี": "Open it from your home screen, full screen, even with a weak signal",
  "แตะ แชร์ แล้วเลือก": "Tap Share, then choose",
  "เพิ่มไปยังหน้าจอโฮม": "Add to Home Screen",
  "ติดตั้ง": "Install",
  "ไม่ต้องติดตั้ง": "Not now",
  "แผนที่วิทยาลัย": "Campus map",
  "วันนี้คุณอยากไปที่ไหน?": "Where would you like to go today?",
  "ค้นหาอาคาร ห้องเรียน หรือจุดบริการ แล้วกดนำทางได้ทันที": "Search for a building, room or service, then start directions",
  "ตำแหน่งของฉัน": "My location",
  "สถานที่ทั้งหมด": "All places",
  "เลือกสถานที่เพื่อดูบนแผนที่": "Pick a place to see it on the map",
  "ปิดรายชื่อสถานที่": "Close place list",
  "ค้นหาอาคาร ห้อง หรือสาขา...": "Search buildings, rooms or programs...",
  "ล้างคำค้นหา": "Clear search",
  "รูปแบบแผนที่": "Map style",
  "ค้นหาสถานที่...": "Search places...",
  "ดูทั้งหมด": "See all",
  "แตะหมุดบนแผนที่": "Tap a pin on the map",
  "เพื่อดูข้อมูลและเส้นทาง": "to see details and directions",
  "ดูรายชื่อสถานที่": "Place list",
  "ไม่พบสถานที่": "No places found",
  "ลองค้นหาด้วยชื่ออาคารหรือห้องอื่น หรือถามน้องปลาทู": "Try another building or room name, or ask Nong Platoo",
  "สถานที่": "places",
  "ขยายรายละเอียดเส้นทาง": "Expand route details",
  "ย่อเพื่อดูแผนที่": "Collapse to see the map",
  "ขยาย ▲": "More ▲",
  "ย่อ ▼": "Less ▼",
  "(จากนอกวิทยาลัย)": "(from outside campus)",
  "กำลังคำนวณระยะทาง…": "Working out the distance…",
  "เปิดตำแหน่งเพื่อดูระยะทาง": "Turn on location to see the distance",
  "ดูเส้นทางจากตู้นี้": "Route from this kiosk",
  "ดูเส้นทาง": "Show route",
  "เริ่มนำทาง": "Start directions",
  "ปิดรายละเอียด": "Close details",
  "นำทาง (Google Maps)": "Directions (Google Maps)",
  "เปิดใน Google Maps": "Open in Google Maps",
  "แชร์สถานที่": "Share place",
  "QR เปิดอาคารนี้บนมือถือ": "QR: open this building on your phone",
  "ดูอาคารนี้บนมือถือ": "See this building on your phone",
  "สแกนด้วยกล้องมือถือ แล้วกดนำทาง มือถือจะพาเดินด้วย GPS": "Scan with your phone camera, then tap directions. Your phone guides you with GPS",
  "คุณอยู่ที่นี่": "You are here",
  "กำลังโหลดแผนที่ 3D…": "Loading 3D map…",
  "เครื่องนี้แสดงแผนที่ 3D ไม่ได้ — ใช้แผนที่ 2D แทน": "This device can't show the 3D map, so the 2D map is used",
  "โหลดแผนที่ 3D ไม่ได้ — ใช้แผนที่ 2D แทน": "The 3D map didn't load, so the 2D map is used",
  "เรียงจากใกล้คุณที่สุด": "Nearest first",
  "พบตำแหน่งของคุณแล้ว": "Found your location",
  "กำลังค้นหาตำแหน่ง...": "Finding your location...",
  "กำลังหาตำแหน่ง…": "Finding your location…",
  "รับสมัคร": "Admissions",
  "รางวัล": "Awards",
  "ประกาศ": "Notice",
  "กิจกรรม": "Events",
  "ข่าวจากเว็บวิทยาลัย": "From the college website",
  "ใหม่": "New",
  "ประกาศจากวิทยาลัย": "College announcement",
  "📢 ประกาศจากวิทยาลัย": "📢 College announcement",
  "ยังไม่มีข่าวในตอนนี้ — ลองเปิดหน้านี้ใหม่อีกครั้งภายหลังครับ": "No news yet. Please check again later.",
  "ปิดข่าว": "Close news",
  "ปิด": "Close",
  "QR อ่านข่าวบนมือถือ": "QR: read on your phone",
  "อ่านข่าวนี้บนมือถือ": "Read this on your phone",
  "สแกนด้วยกล้องมือถือเพื่อเปิดข่าวเต็มบนเว็บวิทยาลัย": "Scan with your phone camera to open the full story on the college website",
  "อัปเดตจากวิทยาลัย": "College updates",
  "ข่าวสารและกิจกรรม": "News and events",
  "QR ข่าวทั้งหมด": "QR: all news",
  "ดูข่าวทั้งหมดบนมือถือ": "All news on your phone",
  "สแกนเพื่อเปิดหน้าข่าวของเว็บวิทยาลัย": "Scan to open the college news page",
  "สาขาที่น่าจะเหมาะกับคุณ": "Programs that may suit you",
  "ยังไม่มีสาขาที่ตรงกับคำตอบ ลองดูสาขาทั้งหมด หรือถามน้องปลาทูได้เลยครับ": "No program matches yet. See all programs, or ask Nong Platoo.",
  "ทำใหม่": "Start over",
  "ดูสาขาทั้งหมด": "See all programs",
  "ช่วยเลือกสาขา": "Help me choose",
  "จบ ม.3": "After grade 9",
  "จบ ม.6 / ปวช.": "After grade 12 / Voc. Cert.",
  "เปิดสอนระดับไหน": "Levels offered",
  "ระดับ ปวช. (จบ ม.3)": "Vocational Certificate (after grade 9)",
  "ระดับ ปวส. (จบ ม.6 / ปวช.)": "Higher Vocational Diploma (after grade 12)",
  "สาขา": "Program",
  "หลักสูตรที่เปิดสอนทั้งหมด": "All courses offered",
  "กลุ่มสาขา": "Program group",
  "ปิดข้อมูลสาขา": "Close program details",
  "จบแล้วทำงานอะไรได้": "Careers after graduating",
  "ทักษะที่ได้": "Skills you gain",
  "เรียนรู้จากการลงมือทำ": "Learn by doing",
  "ค้นพบสาขาที่เหมาะกับคุณ": "Find the right program for you",
  "สำรวจหลักสูตรสายอาชีพที่ตอบโจทย์อนาคต พร้อมห้องปฏิบัติการและอุปกรณ์จริง": "Explore vocational courses for the future, with real workshops and equipment",
  "ยังไม่รู้จะเรียนสาขาไหน?": "Not sure which program to choose?",
  "ตอบ 2 ข้อ ให้น้องปลาทูช่วยแนะนำสาขาที่เหมาะกับคุณ": "Answer 2 questions and Nong Platoo will suggest programs for you",
  "แตะหน้าจอเพื่อเริ่มใช้งาน": "Touch the screen to start",
  "👆 แตะหน้าจอเพื่อเริ่มใช้งาน": "👆 Touch the screen to start",
  "QR เปิดแอปน้องปลาทูบนมือถือ": "QR: open Nong Platoo on your phone",
  "ใช้บนมือถือก็ได้": "Use it on your phone too",
  "สแกนเพื่อเปิดแอปน้องปลาทู นำทางด้วย GPS ได้ทั้งวิทยาลัย": "Scan to open Nong Platoo, with GPS directions across campus",
  "ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง — เปิดสิทธิ์ตำแหน่งในการตั้งค่าเบราว์เซอร์": "Location is blocked. Allow location in your browser settings",
  "คัดลอกลิงก์แล้ว": "Link copied",
  "ประตูวิทยาลัย": "College gate",
  "ขอเส้นทางไปสาขาช่างยนต์": "Directions to Auto Mechanics",
  "สาขาการบัญชีอยู่อาคารไหน": "Which building is Accounting in?",
  "วิทยาลัยมีสาขาอะไรบ้าง": "What programs does the college offer?",
  "แตะไมค์แล้วพูดได้เลย": "Tap the mic and speak",
  "กำลังฟัง… พูดได้เลยครับ": "Listening… go ahead",
  "กำลังฟังคำถาม…": "Listening…",
  "น้องปลาทูกำลังคิด…": "Nong Platoo is thinking…",
  "กำลังพูด — แตะปุ่มเพื่อหยุด": "Speaking. Tap to stop",
  "🎯 เริ่มเกมเลือกสาขา": "🎯 Program quiz",
  "🏫 ดูสาขาวิชาทั้งหมด": "🏫 All programs",
  "📰 ดูข่าวสาร": "📰 News",
  "🗺️ เปิดแผนที่": "🗺️ Open map",
  "หยุดแล้วครับ — ถามใหม่ได้เลย": "Stopped. Ask again any time",
  "ไม่ทราบสาเหตุ": "unknown reason",
  "ไม่ได้ยินเสียง — ลองพูดอีกครั้งครับ": "I didn't hear anything. Please try again",
  "ไม่ได้ยินเสียงพูด — แตะไมค์เพื่อลองใหม่": "No speech heard. Tap the mic to try again",
  "ระบบฟังเสียงของเบราว์เซอร์ใช้ไม่ได้ — พิมพ์คำถามแทนได้ครับ": "Voice input doesn't work in this browser. Please type instead",
  "ปิดผู้ช่วย": "Close assistant",
  "ผู้ช่วยน้องปลาทู": "Nong Platoo assistant",
  "ตั้งค่าเสียง": "Voice settings",
  "เปิดแผนที่วิทยาลัย": "Open campus map",
  "พิมพ์คำถามที่นี่ เช่น ห้องน้ำอยู่ไหน": "Type a question, e.g. Where is the toilet?",
  "พิมพ์คำถาม": "Type a question",
  "ส่งข้อความ": "Send",
  "พร้อมช่วยเหลือ · คุยด้วยเสียงได้": "Ready to help · voice chat",
  "ปิดเสียงตอบ": "Mute replies",
  "เปิดเสียงตอบ": "Speak replies",
  "อ่านคำตอบออกเสียง": "Read answers aloud",
  "ปิดได้ถ้าอยู่ในที่ที่ต้องเงียบ": "Turn off in quiet places",
  "สนทนาต่อเนื่อง (ไม่ต้องกดไมค์ซ้ำ)": "Hands-free conversation",
  "ตอบจบแล้วฟังต่อทันที — เงียบ 2 รอบจะหยุดเอง": "Listens again after each answer; stops after 2 silences",
  "เสียงพูด": "Voice",
  "อัตโนมัติ (แนะนำ)": "Automatic (recommended)",
  "— พูดได้ทันที": "· speaks instantly",
  "เสียง AI ธรรมชาติ": "Natural AI voice",
  "เสียงของเครื่อง": "Device voice",
  "เสียง AI (ธรรมชาติ)": "AI voice (natural)",
  "จากเซิร์ฟเวอร์ · ต้องต่ออินเทอร์เน็ต": "From the server · needs internet",
  "ยังไม่พร้อมใช้": "Not available yet",
  "ไม่พบเสียงภาษาไทยในเครื่อง": "No English voice found on this device",
  "ทดลองฟังเสียง": "Test voice",
  "ฟังอีกครั้ง": "Play again",
  "วันนี้": "Today",
  "เปิดใน Chrome/Safari": "Open in Chrome/Safari",
  "ซ่อนวิธีเปิดไมค์": "Hide mic help",
  "วิธีเปิดไมโครโฟน": "How to turn on the mic",
  "ระหว่างนี้พิมพ์ หรือแตะคำถามด้านล่างแทนได้เลยครับ": "Meanwhile, type or tap a question below",
  "พูดจบแล้ว": "Done speaking",
  "หยุดพูด": "Stop speaking",
  "หยุด": "Stop",
  "แตะเพื่อพูด": "Tap to speak",
  "โหมดสนทนาต่อเนื่องเปิดอยู่": "Hands-free mode is on",
  "หยุดทั้งหมด": "Stop all",
  "พูดจบแล้วรอสักครู่ หรือแตะปุ่มอีกครั้ง": "Wait a moment after speaking, or tap again",
  "กำลังหาเส้นทาง…": "Finding a route…",
  "ถึงแล้ว · ปิดเส้นทาง": "Arrived · close route",
  "· ปิดเส้นทาง": "· close route",
  "ทางเข้าวิทยาลัย": "College entrance",
  "แล้วเริ่มนำทางในวิทยาลัย": "then follow the campus route",
  "เส้นทางเดินในวิทยาลัย": "Campus walking route",
  "(คุณอยู่ที่นี่)": "(you are here)",
  "ถึงแล้ว 🎉": "You have arrived 🎉",
  "ปิดเส้นทาง": "Close route",
  "ลองอีกครั้ง": "Try again",
  "ดูเส้นทางจากประตูวิทยาลัย": "Route from the college gate",
  "QR สำหรับนำทางต่อบนมือถือ": "QR: continue on your phone",
  "สแกนเพื่อเดินตามเส้นทางนี้บนมือถือ": "Scan to follow this route on your phone",
  "มือถือจะนำทางทีละโค้งด้วย GPS พร้อมเสียงบอกทาง — ใช้กล้องมือถือสแกนได้เลย ไม่ต้องลงแอป": "Your phone gives turn-by-turn GPS directions with voice. Just scan with the camera, no app needed",
  "หยุดนำทาง": "Stop directions",
  "ปิดเสียงบอกทาง": "Mute directions",
  "เปิดเสียงบอกทาง": "Speak directions",
  "อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง (GPS)": "This device doesn't support location (GPS)",
  "หาตำแหน่งไม่สำเร็จ — ลองออกไปที่โล่งแล้วลองใหม่": "Couldn't find your location. Move to an open area and try again",
  "ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง — เปิดสิทธิ์ตำแหน่ง (GPS) ในเบราว์เซอร์แล้วลองใหม่": "Location is blocked. Allow location (GPS) in your browser and try again",
  "อาคารนี้ยังไม่มีพิกัด — ใช้ปุ่มเปิดใน Google Maps แทน": "This building has no map position yet. Use Open in Google Maps",
  "ยังไม่มีทางเดินไปอาคารนี้ในระบบ — แจ้งผู้ดูแลให้วาดทางเดินเพิ่ม": "No walking path to this building yet. Please tell the admin",
  "กำลังหาตำแหน่งของคุณ…": "Finding your location…",
  "หาตำแหน่งไม่สำเร็จ": "Couldn't find your location",
  "กำลังคำนวณเส้นทาง…": "Working out the route…",
  "ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง — เปิดสิทธิ์ตำแหน่ง (GPS) แล้วลองใหม่": "Location is blocked. Allow location (GPS) and try again",
  "ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน — กดอนุญาตไมโครโฟนที่แถบที่อยู่ของเบราว์เซอร์ แล้วรีเฟรชหน้า (F5)": "Microphone is blocked. Allow it in the browser address bar, then refresh (F5)",
  "ไม่พบไมโครโฟนในอุปกรณ์นี้": "No microphone found on this device",
  "พูดถามบ่อยเกินไป — รอสักครู่แล้วลองใหม่": "Too many voice questions. Please wait a moment",
  "ฟังเสียงไม่สำเร็จ — ลองพูดใหม่ หรือพิมพ์คำถามแทน": "Couldn't hear you. Try again or type your question",
  "ทิศเหนือ / มุมมองเริ่มต้น": "North / default view",
  "มุมมองเริ่มต้น": "Default view",
  "ซูมเข้า": "Zoom in",
  "ซูมออก": "Zoom out",
  "มองจากด้านบน": "Top view",
  "กลับมุมมองเริ่มต้น": "Reset view",
  "วิทยาลัยเทคนิคสมุทรสงคราม": "Samutsongkhram Technical College",
  "กำลังโหลด…": "Loading…",
  "ชอบทำอะไรมากที่สุด?": "What do you enjoy most?",
  "อยากทำงานแบบไหน?": "How do you like to work?",
  "ซ่อม ประกอบเครื่องยนต์ / เครื่องจักร": "Fixing engines and machines",
  "ไฟฟ้า และอิเล็กทรอนิกส์": "Electricity and electronics",
  "คอมพิวเตอร์ และเขียนโปรแกรม": "Computers and coding",
  "ก่อสร้าง และเขียนแบบ": "Building and drafting",
  "ตัวเลข การเงิน ค้าขาย": "Numbers, money and selling",
  "งานเอกสาร และงานบริการ": "Office work and service",
  "ทำอาหาร ขนม งานฝีมือ": "Cooking, baking and crafts",
  "ออกแบบ และทำสื่อ": "Design and media",
  "ลงมือทำ ได้จับเครื่องมือจริง": "Hands-on with real tools",
  "ทำงานกับคอมพิวเตอร์": "Working on a computer",
  "พบปะ พูดคุยกับผู้คน": "Meeting and talking with people",
  "ช่างอุตสาหกรรม": "Industrial trades",
  "พาณิชยกรรม / ธุรกิจ": "Business and commerce",
  "คหกรรม / อาหาร": "Home economics and food",
  "สายอุตสาหกรรม": "Industrial",
  "พาณิชยกรรม/คหกรรม/สามัญ": "Business / Home Ec / General",
  "บริหาร-สนับสนุน": "Admin and services",
  "ส่วนกลาง-กิจกรรม": "Shared and activities",
};

// ------------------------------------------------------------------ names and words inside text
// Longest first is applied automatically, so "อาคาร 85 ปี" wins over "อาคาร".
const TERMS = {
  // departments / programs
  "สาขาวิชาอิเล็กทรอนิกส์และเทคโนโลยีสารสนเทศ": "Electronics and Information Technology",
  "สาขาวิชาอิเล็กทรอนิกส์ / เทคโนโลยีสารสนเทศ": "Electronics / Information Technology",
  "สาขาวิชาเมคคาทรอนิกส์และหุ่นยนต์": "Mechatronics and Robotics",
  "เมคคาทรอนิกส์และหุ่นยนต์": "Mechatronics and Robotics",
  "เมคคาทรอนิกส์": "Mechatronics",
  "สาขาวิชาการจัดการสำนักงานดิจิทัล": "Digital Office Management",
  "การจัดการสำนักงานธุรกิจดิจิทัล": "Digital Business Office Management",
  "สาขาวิชาการจัดการสำนักงาน": "Office Management",
  "สาขาวิชาเทคโนโลยีธุรกิจดิจิทัล": "Digital Business Technology",
  "เทคโนโลยีธุรกิจดิจิทัล": "Digital Business Technology",
  "สาขาวิชาเทคโนโลยีสารสนเทศ": "Information Technology",
  "เทคโนโลยีสารสนเทศ": "Information Technology",
  "สาขาวิชาเทคโนโลยีคอมพิวเตอร์": "Computer Technology",
  "สาขาวิชาเทคนิคคอมพิวเตอร์": "Computer Technician",
  "ช่างเทคนิคคอมพิวเตอร์": "Computer Technician",
  "สาขาวิชาคอมพิวเตอร์ธุรกิจ": "Business Computer",
  "สาขาวิชาอิเล็กทรอนิกส์": "Electronics",
  "เทคโนโลยีอิเล็กทรอนิกส์": "Electronics Technology",
  "อิเล็กทรอนิกส์": "Electronics",
  "สาขาวิชาช่างไฟฟ้ากำลัง": "Electrical Power",
  "สาขาวิชาไฟฟ้ากำลัง": "Electrical Power",
  "ช่างไฟฟ้ากำลัง": "Electrical Power",
  "ช่างไฟฟ้า": "Electrical",
  "สาขาวิชาช่างยนต์": "Auto Mechanics",
  "ช่างยนต์และยานยนต์ไฟฟ้า": "Auto Mechanics and EV",
  "ช่างยนต์": "Auto Mechanics",
  "เทคนิคเครื่องกล": "Mechanical Technology",
  "สาขาวิชาช่างกลโรงงาน": "Machine Shop",
  "ห้องเรียนช่างกลโรงงาน": "Machine Shop classrooms",
  "ช่างกลโรงงาน": "Machine Shop",
  "เทคนิคการผลิต": "Production Technology",
  "สาขาวิชาช่างเชื่อมโลหะ": "Metal Welding",
  "ช่างเชื่อมโลหะ": "Metal Welding",
  "สาขาวิชาช่างก่อสร้าง": "Construction",
  "ช่างก่อสร้าง": "Construction",
  "สาขาวิชาเขียนแบบเครื่องกล": "Mechanical Drafting",
  "ช่างเขียนแบบเครื่องกล": "Mechanical Drafting",
  "เขียนแบบเครื่องกล": "Mechanical Drafting",
  "แผนกวิชาเครื่องมือกล (ช่างกล)": "Machine Tools Dept.",
  "แผนกวิชาเทคนิคพื้นฐาน": "Basic Technical Dept.",
  "เทคโนโลยีการสื่อสารโทรคมนาคม": "Telecommunications Technology",
  "สาขาวิชาการบัญชี": "Accounting",
  "สาขาการบัญชี": "Accounting",
  "การบัญชี": "Accounting",
  "สาขาวิชาการตลาด": "Marketing",
  "สาขาการตลาดและธุรกิจค้าปลีก": "Marketing and Retail Business",
  "การตลาด": "Marketing",
  "สาขาวิชาธุรกิจค้าปลีก": "Retail Business",
  "ธุรกิจค้าปลีก": "Retail Business",
  "การเลขานุการ": "Secretarial Studies",
  "สาขาวิชาคหกรรมศาสตร์": "Home Economics",
  "คหกรรมศาสตร์": "Home Economics",
  "สาขาวิชาอาหารและโภชนาการ": "Food and Nutrition",
  "อาหารและโภชนาการ": "Food and Nutrition",
  "สาขาวิชาสามัญสัมพันธ์": "General Education",
  "หมวดวิชาสามัญ ไทย คณิต วิทย์ อังกฤษ ภาษาจีน": "General subjects: Thai, Maths, Science, English, Chinese",
  "สามัญสัมพันธ์": "General Education",
  "พาณิชยกรรม": "Business",
  "คหกรรม": "Home Economics",
  "อุตสาหกรรม": "Industry",
  // buildings and places
  "อาคารพัฒนาศักยภาพนักเรียน นักศึกษา (จั่วคู่)": "Student Development Building (Twin Gable)",
  "จั่วคู่ / พัฒนาศักยภาพ": "Twin Gable / Student Development",
  "อาคารจั่วคู่": "Twin Gable Building",
  "อาคารสถาบันการอาชีวศึกษาภาคกลาง 5": "Central Vocational Institute 5 Building",
  "สำนักงานสถาบันการอาชีวศึกษาภาคกลาง 5": "Central Vocational Institute 5 Office",
  "สถาบันการอาชีวศึกษาภาคกลาง 5": "Central Vocational Institute 5",
  "สอฐ.ภาคกลาง 5": "Central Voc. Institute 5",
  "สำนักงานอาชีวศึกษาจังหวัดสมุทรสงคราม": "Samut Songkhram Provincial Vocational Office",
  "อาคาร 1 (อาคารไม้)": "Building 1 (wooden)",
  "อาคารไม้ (ยกเลิกการใช้งาน)": "Wooden building (closed)",
  "อาคาร 85 ปี": "Building 85",
  "อาคาร 11 (ตึก ICT)": "Building 11 (ICT)",
  "ตึก ICT": "ICT Building",
  "อาคารกิจกรรม": "Activity Building",
  "หอประชุม 1": "Auditorium 1",
  "หอประชุม": "Auditorium",
  "โรงอาหาร": "Canteen",
  "สนามฟุตบอล": "Football field",
  "Fix it Center (ศูนย์ซ่อมสร้างเพื่อชุมชน)": "Fix it Center (community repair center)",
  "ศูนย์ซ่อมสร้างเพื่อชุมชน": "Community repair center",
  "ธนาคารโรงเรียน": "School Bank",
  "ร้านเพลินแฟ": "Plernfae Cafe",
  "ร้านกาแฟ": "Cafe",
  "โรงจอดรถ (หลังป้อมยาม / งานปกครอง)": "Parking (behind the guard post)",
  "โรงจอดรถ": "Parking",
  "สำนักงานผู้อำนวยการ": "Director's Office",
  "ห้องผู้อำนวยการ": "Director's room",
  "ห้องรองผู้อำนวยการ": "Deputy directors' rooms",
  "ห้อง ผอ.": "Director's room",
  "สำนักงานวิทยาลัย": "College office",
  "ฝั่งซ้าย": "left side",
  "ฝั่งขวา": "right side",
  "พื้นที่จัดกิจกรรมนักเรียนนักศึกษาและชมรม": "Space for student activities and clubs",
  // offices and rooms
  "งานทะเบียน / งานบุคคล": "Registration / Personnel",
  "ทะเบียน / บุคคล": "Registration / Personnel",
  "งานทะเบียน": "Registration",
  "งานบริหารและพัฒนาทรัพยากรบุคคล": "Human Resources",
  "งานบุคคล": "Personnel",
  "งานพัสดุ / งานอาคารสถานที่": "Supplies / Buildings and Grounds",
  "พัสดุ / อาคารสถานที่": "Supplies / Buildings and Grounds",
  "งานพัสดุ": "Supplies",
  "งานอาคารสถานที่": "Buildings and Grounds",
  "งานปกครอง / ประชาสัมพันธ์": "Student Affairs / Public Relations",
  "ปกครอง / ประชาสัมพันธ์": "Student Affairs / PR",
  "งานปกครองและความปลอดภัยนักเรียน นักศึกษา": "Student Discipline and Safety",
  "ฝ่ายปกครอง": "Student discipline",
  "งานประชาสัมพันธ์": "Public Relations",
  "งานบริหารทั่วไป": "General Administration",
  "งานศูนย์ดิจิทัลและสื่อสารองค์กร (งานสื่อ)": "Digital and Communications Center",
  "ศูนย์เทคโนโลยีสารสนเทศ (ICT)": "ICT Center",
  "ศูนย์ CVM": "CVM Center",
  "ห้องประชุม": "Meeting room",
  "ห้องสมุด": "Library",
  "งานวิทยบริการและเทคโนโลยีการศึกษา": "Library and Learning Technology",
  "ห้องพยาบาล": "Nurse's room",
  "งานสวัสดิการนักเรียน นักศึกษา": "Student Welfare",
  "ห้องโสตทัศนศึกษา": "Audio-visual room",
  "ห้องสุขา": "Toilets",
  "ห้องน้ำ": "Toilets",
  "งานการเงิน": "Finance",
  "งานการบัญชี": "Accounting Office",
  "งานวัดผลและประเมินผล": "Assessment and Evaluation",
  "งานพัฒนาหลักสูตรและการจัดการเรียนรู้": "Curriculum and Learning",
  "งานกิจกรรมนักเรียน นักศึกษา": "Student Activities",
  "งานพัฒนายุทธศาสตร์แผนงานและงบประมาณ": "Strategy, Planning and Budget",
  "งานมาตรฐานและการประกันคุณภาพการศึกษา": "Quality Assurance",
  "งานส่งเสริมการวิจัย นวัตกรรมและสิ่งประดิษฐ์": "Research and Innovation",
  "งานส่งเสริมธุรกิจและการเป็นผู้ประกอบการ": "Business and Entrepreneurship",
  "งานติดตามและประเมินผลการอาชีวศึกษา": "Vocational Monitoring and Evaluation",
  "งานครูที่ปรึกษาและการแนะแนว": "Advisors and Guidance",
  "งานโครงการพิเศษและการบริการชุมชน": "Special Projects and Community Service",
  "งานอาชีวศึกษาระบบทวิภาคี": "Dual Vocational Education",
  "งานพัฒนาหลักสูตรสายเทคโนโลยีหรือสายปฏิบัติการ": "Technology Curriculum Development",
  "ฝ่ายบริหารทรัพยากร": "Resource Management Division",
  "ฝ่ายยุทธศาสตร์และแผนงาน": "Strategy and Planning Division",
  "ฝ่ายกิจการนักเรียนนักศึกษา": "Student Affairs Division",
  "ฝ่ายวิชาการ": "Academic Division",
  "แผนกวิชา / หน่วยงาน": "Departments / offices",
  // map categories
  "สายอุตสาหกรรม": "Industrial",
  "พาณิชยกรรม/คหกรรม/สามัญ": "Business / Home Ec / General",
  "บริหาร-สนับสนุน": "Admin and services",
  "ส่วนกลาง-กิจกรรม": "Shared and activities",
  // levels and general words
  "ปวช.": "Voc. Cert.",
  "ปวส.": "Higher Voc. Dipl.",
  "ปริญญาตรี": "Bachelor's degree",
  "ห้องเรียน": "classrooms",
  "สาขาวิชา": "",
  "แผนกวิชา": "",
  "ฝั่งทิศ": "",
  "อาคาร": "Building",
  "ชั้น": "Floor",
  "และ": "and",
  "ห้อง": "Room",
  "ครับ": "",
};

// ------------------------------------------------------------------ phrases with numbers
const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DIRS = {
  ตะวันออกเฉียงเหนือ: "north-east",
  ตะวันออกเฉียงใต้: "south-east",
  ตะวันตกเฉียงเหนือ: "north-west",
  ตะวันตกเฉียงใต้: "south-west",
  ตะวันออก: "east",
  ตะวันตก: "west",
  เหนือ: "north",
  ใต้: "south",
};
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const PATTERNS = [
  [/(\d+) ชั้น/g, "$1 floors"],
  [/(\d+) สาขา/g, "$1 programs"],
  [/(\d{1,2}) (มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม) (\d{4})/, (_, d, m, y) =>
    `${d} ${["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"].indexOf(m) >= 0 ? ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"].indexOf(m)] : m} ${Number(y) - 543}`],
  [/ห่าง ~?/g, "about "],
  [/ทางทิศ\s*/g, "to the "],
  [/^พบ (\d+) สถานที่$/, "Found $1 places"],
  [/(\d+) แห่งในวิทยาลัย/, "$1 places on campus"],
  [/^ข้อ (\d+)/, "Question $1"],
  [/^ข่าวเด่น (\d+)$/, "Top story $1"],
  [/ข่าวล่าสุดเมื่อ/, "Latest news:"],
  [/ดูข่าวทั้งหมดบนเว็บวิทยาลัย/, "All news on the college website"],
  [/ดูข้อมูล\s*/, "About "],
  [/ดูที่ตั้ง\s*/, "Location of "],
  [/กลุ่มอาชีพ:/, "Career group:"],
  [/จากรายงานหลักสูตรที่เปิดสอนของวิทยาลัย \(ข้อมูล ณ/, "From the college course report (as of"],
  [/ผู้ช่วยนำทางและประชาสัมพันธ์/, "Campus guide and information,"],
  [/เริ่มจาก:/, "From:"],
  [/คุณอยู่นอกวิทยาลัย · ห่าง ~/, "You are outside campus · about "],
  [/คุณอยู่นอกวิทยาลัย — เดินมาที่/, "You are outside campus. Walk to "],
  [/, เส้นประบนแผนที่\) แล้วเส้นทางในวิทยาลัยจะเริ่มนำทางให้อัตโนมัติ/, ", dashed line on the map), then the campus route starts automatically"],
  [/มาที่ประตู ~/, "To the gate ~"],
  [/\+ ในวิทยาลัย ~/, "+ on campus ~"],
  [/เดินมาที่/, "Walk to "],
  [/แล้วเดินต่อ/, "then continue"],
  [/🚶 เดิน/, "🚶 Walk"],
  [/เดิน ~/, "Walk ~"],
  [/คลาดเคลื่อน ~/, "accuracy ~"],
  [/ความเร็วเสียง/, "Speech speed"],
  [/เบราว์เซอร์ในแอป/, "In-app browsers"],
  [/มักใช้ไมโครโฟนไม่ได้/, " often block the microphone"],
  [/ขออภัยครับ ระบบยังตอบไม่ได้ตอนนี้/, "Sorry, I can't answer right now."],
  [/^ใช้ /, "Use "],
  [/ก่อน \(~/, " first (~"],
  [/^ไป /, "To "],
  [/ทางทิศ\s*/, "to the "],
  [new RegExp(`(\\d{1,2}) (${MONTHS.map(esc).join("|")}) (\\d{4})`), (_, d, m, y) => `${d} ${MONTHS_EN[MONTHS.indexOf(m)]} ${Number(y) > 2400 ? Number(y) - 543 : y}`],
  [new RegExp(`(\\d{1,2}) (${MONTHS.map(esc).join("|")})`), (_, d, m) => `${d} ${MONTHS_EN[MONTHS.indexOf(m)]}`],
  [/(\d[\d.,]*)\s*เมตร/g, "$1 m"],
  [/(\d[\d.,]*)\s*กม\./g, "$1 km"],
  [/(\d+)\s*นาที/g, "$1 min"],
  [/นาที/g, "min"],
  [/ถึงแล้ว/g, "Arrived"],
  [/ปิดเส้นทาง/g, "close route"],
  [new RegExp(Object.keys(DIRS).join("|"), "g"), m => DIRS[m]],
];

Object.assign(TERMS, {
  "พาณิชยกรรม/บริหารธุรกิจ": "Business Administration",
  "อุตสาหกรรมดิจิทัลและเทคโนโลยีสารสนเทศ": "Digital and IT Industry",
  "อุตสาหกรรมอาหาร": "Food Industry",
  "เทคนิคคอมพิวเตอร์": "Computer Technician",
  "ไฟฟ้ากำลัง": "Electrical Power",
  "การบริหารงานคหกรรม": "Home Economics Management",
  "ไฟฟ้า": "Electrical",
  "การจัดการสำนักงาน": "Office Management",
  "การจัดการธุรกิจค้าปลีก": "Retail Business Management",
  "ซอฟต์แวร์และการประยุกต์": "Software and applications",
  "ธุรกิจดิจิทัล": "Digital Business",
  "(จบ ม.3)": "(after grade 9)",
  "(จบ ม.6 / ปวช.)": "(after grade 12 / Voc. Cert.)",
  "ระดับ": "",
});
// Short department phrases (career groups, skills) also work inside longer text.
for (const [th, en] of Object.entries(DEPARTMENT_EN)) if (th.length <= 45 && !(th in TERMS)) TERMS[th] = en;
const TERM_LIST = Object.entries(TERMS).sort((a, b) => b[0].length - a[0].length);
const TERM_RE = new RegExp(TERM_LIST.map(([th]) => esc(th)).join("|"), "g");
const THAI = /[฀-๿]/;

const whole = t => UI[t] ?? DEPARTMENT_EN[t] ?? (TERMS[t] || null);

/** English for one piece of Thai text (or the text unchanged when there is nothing to swap). */
export function translate(text) {
  if (!text || !THAI.test(text)) return text;
  const trimmed = text.trim();
  const exact = whole(trimmed);
  if (exact) return text.replace(trimmed, exact);
  // "🏆 รางวัล": an emoji in front of a known string.
  const icon = trimmed.match(/^(\S+\s+)(.+)$/u);
  if (icon && !THAI.test(icon[1])) {
    const rest = whole(icon[2]);
    if (rest) return text.replace(trimmed, icon[1] + rest);
  }
  // A department summary cut short ("เรียนเรื่อง… รถยนต์" without "ฝึก…"): its first English sentence.
  if (trimmed.length > 30) {
    const key = Object.keys(DEPARTMENT_EN).find(k => k.startsWith(trimmed));
    if (key) return text.replace(trimmed, DEPARTMENT_EN[key].split(/(?<=\.) /)[0].replace(/,? with .*$/, "."));
  }
  let out = trimmed;
  for (const [re, to] of PATTERNS) out = out.replace(re, to);
  out = out.replace(TERM_RE, th => ` ${TERMS[th]} `);
  out = out
    .replace(/\s+/g, " ")
    .replace(/\s+([,.):])/g, "$1")
    .replace(/([(])\s+/g, "$1")
    .trim();
  // Long text that would come out half Thai, half English: keep the Thai, it reads better.
  if (THAI.test(out) && trimmed.length > 30) return text;
  const lead = text.match(/^\s*/)[0];
  const tail = text.match(/\s*$/)[0];
  return lead + out + tail;
}

// ------------------------------------------------------------------ swapping text on the page
/** Text that people wrote: kept as it is. */
const SKIP = ".message.user, .chat-content .message.bot, .news-card-body, .featured-copy, .notice-row strong, .news-detail, .news-modal, [data-i18n-skip], script, style, textarea, input";
const ATTRS = ["placeholder", "aria-label", "title", "alt"];

function swapNode(node) {
  if (node.nodeType === 3) {
    const parent = node.parentElement;
    if (!parent || parent.closest(SKIP)) return;
    const next = translate(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
    return;
  }
  if (node.nodeType !== 1) return;
  const el = node;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v && THAI.test(v) && !(a !== "placeholder" && el.closest(".message.user"))) {
      const next = translate(v);
      if (next !== v) el.setAttribute(a, next);
    }
  }
  if (el.closest(SKIP) && !el.matches("input, textarea")) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === 1) {
      for (const a of ATTRS) {
        const v = n.getAttribute(a);
        if (v && THAI.test(v)) {
          const next = translate(v);
          if (next !== v) n.setAttribute(a, next);
        }
      }
    } else swapNode(n);
  }
}

/** In English, keep every Thai string on the page swapped as the app re-draws. */
export function startTranslating(root = document.body) {
  document.documentElement.lang = getLang();
  if (!isEnglish()) return;
  document.title = "Samutsongkhram Technical College | Nong Platoo Ontour";
  swapNode(root);
  new MutationObserver(records => {
    for (const r of records) {
      if (r.type === "characterData") swapNode(r.target);
      else if (r.type === "attributes") swapNode(r.target);
      else r.addedNodes.forEach(swapNode);
    }
  }).observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
