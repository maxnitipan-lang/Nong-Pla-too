// General information about each field of study, shown on the departments page when the admin
// hasn't written its own description yet. It describes the subject (what students learn, where
// graduates work) — not facts about this college. Matched by the department's name.

/** Groups for the filter chips on the departments page. */
export const DEPARTMENT_GROUPS = [
  { id: "industry", label: "ช่างอุตสาหกรรม", accent: "#e8863f" },
  { id: "business", label: "พาณิชยกรรม / ธุรกิจ", accent: "#2f7fc1" },
  { id: "home", label: "คหกรรม / อาหาร", accent: "#c0892b" },
];

/** "Help me choose" quiz: what the visitor likes, and how they like to work. */
export const DEPARTMENT_QUIZ = [
  {
    question: "ชอบทำอะไรมากที่สุด?",
    key: "tag",
    options: [
      { id: "machine", icon: "🔧", label: "ซ่อม ประกอบเครื่องยนต์ / เครื่องจักร" },
      { id: "electric", icon: "⚡", label: "ไฟฟ้า และอิเล็กทรอนิกส์" },
      { id: "computer", icon: "💻", label: "คอมพิวเตอร์ และเขียนโปรแกรม" },
      { id: "build", icon: "🏗️", label: "ก่อสร้าง และเขียนแบบ" },
      { id: "business", icon: "📊", label: "ตัวเลข การเงิน ค้าขาย" },
      { id: "office", icon: "🗂️", label: "งานเอกสาร และงานบริการ" },
      { id: "cook", icon: "🍳", label: "ทำอาหาร ขนม งานฝีมือ" },
      { id: "creative", icon: "🎨", label: "ออกแบบ และทำสื่อ" },
    ],
  },
  {
    question: "อยากทำงานแบบไหน?",
    key: "style",
    options: [
      { id: "hands", icon: "🛠️", label: "ลงมือทำ ได้จับเครื่องมือจริง" },
      { id: "screen", icon: "🖥️", label: "ทำงานกับคอมพิวเตอร์" },
      { id: "people", icon: "🤝", label: "พบปะ พูดคุยกับผู้คน" },
    ],
  },
];

/** Departments that best fit the quiz answers, best first (at most `limit`). */
export function suggestDepartments(departments, answers, limit = 3) {
  return departments
    .map((entry) => {
      const d = entry.department ?? entry;
      const score = (d.tags?.includes(answers.tag) ? 2 : 0) + (d.style === answers.style ? 1 : 0);
      return { entry, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.entry);
}

const INFO = [
  {
    match: /ช่างยนต์/,
    icon: "🚗",
    group: "industry",
    tags: ["machine"],
    style: "hands",
    description: "เรียนเรื่องเครื่องยนต์ ระบบส่งกำลัง ระบบไฟฟ้ารถยนต์ และการตรวจซ่อมบำรุงรถยนต์ ฝึกปฏิบัติกับเครื่องยนต์และเครื่องมือจริง",
    skills: ["ตรวจซ่อมเครื่องยนต์", "ระบบไฟฟ้ารถยนต์", "บำรุงรักษารถยนต์"],
    careers: ["ช่างซ่อมรถยนต์", "ช่างเทคนิคศูนย์บริการ", "เปิดอู่ซ่อมรถของตัวเอง"],
  },
  {
    match: /อิเล็กทรอนิกส์|เทคโนโลยีสารสนเทศ/,
    icon: "🔌",
    group: "industry",
    tags: ["electric","computer"],
    style: "hands",
    description: "เรียนวงจรอิเล็กทรอนิกส์ ไมโครคอนโทรลเลอร์ ระบบเครือข่าย และการเขียนโปรแกรมพื้นฐาน ฝึกประกอบและซ่อมอุปกรณ์อิเล็กทรอนิกส์",
    skills: ["ประกอบและซ่อมวงจร", "เขียนโปรแกรมควบคุม", "ติดตั้งระบบเครือข่าย"],
    careers: ["ช่างอิเล็กทรอนิกส์", "เจ้าหน้าที่ไอที", "ช่างเทคนิคในโรงงาน"],
  },
  {
    match: /คอมพิวเตอร์/,
    icon: "💻",
    group: "industry",
    tags: ["computer"],
    style: "screen",
    description: "เรียนฮาร์ดแวร์คอมพิวเตอร์ ระบบปฏิบัติการ เครือข่าย และการเขียนโปรแกรม ฝึกประกอบ ติดตั้ง และดูแลระบบคอมพิวเตอร์",
    skills: ["ประกอบและซ่อมคอมพิวเตอร์", "ดูแลระบบเครือข่าย", "เขียนโปรแกรม"],
    careers: ["ช่างเทคนิคคอมพิวเตอร์", "ผู้ดูแลระบบเครือข่าย", "นักพัฒนาโปรแกรม"],
  },
  {
    match: /ไฟฟ้ากำลัง/,
    icon: "⚡",
    group: "industry",
    tags: ["electric"],
    style: "hands",
    description: "เรียนการเดินสายไฟฟ้าในอาคาร มอเตอร์ เครื่องกลไฟฟ้า และระบบควบคุมไฟฟ้า เน้นความปลอดภัยในการทำงานกับไฟฟ้า",
    skills: ["ติดตั้งไฟฟ้าในอาคาร", "ซ่อมมอเตอร์และเครื่องใช้ไฟฟ้า", "ระบบควบคุมไฟฟ้า"],
    careers: ["ช่างไฟฟ้า", "ช่างซ่อมบำรุงในโรงงาน", "ผู้รับเหมางานไฟฟ้า"],
  },
  {
    match: /เชื่อมโลหะ/,
    icon: "🔥",
    group: "industry",
    tags: ["machine","build"],
    style: "hands",
    description: "เรียนงานเชื่อมไฟฟ้า เชื่อมแก๊ส และงานโลหะแผ่น ฝึกอ่านแบบและขึ้นรูปชิ้นงานโลหะ",
    skills: ["เชื่อมไฟฟ้าและแก๊ส", "อ่านแบบงานโลหะ", "ขึ้นรูปโลหะแผ่น"],
    careers: ["ช่างเชื่อม", "ช่างโครงสร้างเหล็ก", "ช่างในอู่ต่อเรือหรือโรงงาน"],
  },
  {
    match: /เมคคาทรอนิกส์|หุ่นยนต์/,
    icon: "🤖",
    group: "industry",
    tags: ["machine","electric","computer"],
    style: "hands",
    description: "รวมงานกล ไฟฟ้า อิเล็กทรอนิกส์ และคอมพิวเตอร์เข้าด้วยกัน เรียนระบบอัตโนมัติ PLC เซนเซอร์ และหุ่นยนต์อุตสาหกรรม",
    skills: ["เขียนโปรแกรม PLC", "ติดตั้งเซนเซอร์และระบบอัตโนมัติ", "ควบคุมหุ่นยนต์"],
    careers: ["ช่างเทคนิคระบบอัตโนมัติ", "ช่างซ่อมบำรุงเครื่องจักร", "ผู้ควบคุมหุ่นยนต์ในโรงงาน"],
  },
  {
    match: /จัดการสำนักงาน/,
    icon: "🗂️",
    group: "business",
    tags: ["office"],
    style: "people",
    description: "เรียนงานธุรการ งานเอกสาร การใช้โปรแกรมสำนักงาน และการติดต่อประสานงาน",
    skills: ["จัดการเอกสาร", "ใช้โปรแกรมสำนักงาน", "ประสานงานและบริการ"],
    careers: ["เจ้าหน้าที่ธุรการ", "เลขานุการ", "พนักงานต้อนรับ"],
  },
  {
    match: /การตลาด|ค้าปลีก/,
    icon: "🛒",
    group: "business",
    tags: ["business"],
    style: "people",
    description: "เรียนการขาย การตลาด การจัดการร้านค้า และการตลาดออนไลน์",
    skills: ["การขายและบริการลูกค้า", "การตลาดออนไลน์", "จัดการสินค้าและร้านค้า"],
    careers: ["พนักงานขาย", "ผู้จัดการร้าน", "เจ้าของธุรกิจออนไลน์"],
  },
  {
    match: /บัญชี/,
    icon: "🧮",
    group: "business",
    tags: ["business","office"],
    style: "screen",
    description: "เรียนการบันทึกบัญชี ภาษี การเงิน และโปรแกรมบัญชีคอมพิวเตอร์",
    skills: ["บันทึกและปิดบัญชี", "ภาษีอากร", "โปรแกรมบัญชี"],
    careers: ["พนักงานบัญชี", "เจ้าหน้าที่การเงิน", "ผู้ช่วยผู้สอบบัญชี"],
  },
  {
    match: /คหกรรม/,
    icon: "🧵",
    group: "home",
    tags: ["cook","creative"],
    style: "hands",
    description: "เรียนงานอาหาร ขนม ผ้า การจัดดอกไม้ และงานประดิษฐ์ ฝึกทำชิ้นงานจริงเพื่อนำไปประกอบอาชีพได้",
    skills: ["ทำอาหารและขนม", "งานตัดเย็บ", "งานประดิษฐ์และจัดดอกไม้"],
    careers: ["ผู้ประกอบการร้านอาหาร", "ช่างตัดเย็บ", "นักจัดดอกไม้"],
  },
  {
    match: /อาหารและโภชนาการ/,
    icon: "🍳",
    group: "home",
    tags: ["cook"],
    style: "hands",
    description: "เรียนการประกอบอาหารไทยและนานาชาติ เบเกอรี่ โภชนาการ และสุขาภิบาลอาหาร",
    skills: ["ประกอบอาหาร", "เบเกอรี่", "โภชนาการและความสะอาดของอาหาร"],
    careers: ["พ่อครัว / แม่ครัว", "เจ้าของร้านอาหาร", "พนักงานโรงแรมฝ่ายอาหาร"],
  },
  {
    match: /ธุรกิจดิจิทัล/,
    icon: "📱",
    group: "business",
    tags: ["computer","creative","business"],
    style: "screen",
    description: "เรียนการใช้คอมพิวเตอร์ในธุรกิจ การออกแบบสื่อดิจิทัล การจัดการข้อมูล และธุรกิจออนไลน์",
    skills: ["ออกแบบกราฟิกและสื่อ", "จัดการข้อมูล", "ทำธุรกิจออนไลน์"],
    careers: ["นักออกแบบกราฟิก", "เจ้าหน้าที่คอมพิวเตอร์", "นักการตลาดดิจิทัล"],
  },
  {
    match: /เขียนแบบเครื่องกล/,
    icon: "📐",
    group: "industry",
    tags: ["build","creative"],
    style: "screen",
    description: "เรียนการอ่านและเขียนแบบชิ้นส่วนเครื่องจักร ทั้งเขียนด้วยมือและโปรแกรม CAD",
    skills: ["เขียนแบบด้วย CAD", "อ่านแบบงานเครื่องกล", "ออกแบบชิ้นส่วน"],
    careers: ["ช่างเขียนแบบ", "ผู้ช่วยวิศวกร", "นักออกแบบชิ้นส่วน"],
  },
  {
    match: /ช่างก่อสร้าง|ก่อสร้าง/,
    icon: "🏗️",
    group: "industry",
    tags: ["build"],
    style: "hands",
    description: "เรียนงานก่อสร้างอาคาร งานคอนกรีต งานไม้ การสำรวจ และการอ่านแบบก่อสร้าง",
    skills: ["อ่านแบบก่อสร้าง", "งานปูนและคอนกรีต", "ประมาณราคา"],
    careers: ["ช่างก่อสร้าง", "ผู้ควบคุมงาน", "ผู้รับเหมา"],
  },
  {
    match: /ช่างกลโรงงาน/,
    icon: "⚙️",
    group: "industry",
    tags: ["machine"],
    style: "hands",
    description: "เรียนการใช้เครื่องมือกล เช่น เครื่องกลึง เครื่องกัด และเครื่อง CNC เพื่อผลิตชิ้นส่วนโลหะ",
    skills: ["งานกลึงและกัด", "ใช้เครื่อง CNC", "วัดและตรวจสอบชิ้นงาน"],
    careers: ["ช่างกลโรงงาน", "ช่างควบคุมเครื่อง CNC", "ช่างในโรงงานผลิตชิ้นส่วน"],
  },
];

/** Fills in a department's empty description / skills / careers from the general information above. */
export function withDepartmentInfo(department) {
  const name = String(department?.name ?? "");
  const info = INFO.find((i) => i.match.test(name));
  if (!info) return department;
  return {
    ...department,
    description: department.description || info.description,
    skills: department.skills?.length ? department.skills : info.skills,
    careers: department.careers?.length ? department.careers : info.careers,
    icon: department.icon || info.icon,
    group: department.group || info.group,
    tags: info.tags,
    style: info.style,
  };
}
