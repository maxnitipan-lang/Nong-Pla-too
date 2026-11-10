// Ready-made answers built from the college data files, so they stay correct when the
// data changes and cost no AI tokens:
//   - each department: what you study, jobs after graduating, levels (ปวช./ปวส.), its teachers
//   - each teacher group (incl. สามัญ subjects): who teaches there
//   - each office (งาน…): who heads it, and where it is
//   - "ครู X คือใคร / สอนอะไร": looked up by name (teacherAnswer)
//
// Only facts that are in the data are used — nothing is made up.

import { withDepartmentInfo } from "../shared/departmentInfo.js";
import { SECTION_HEADS, STAFF_AS_OF, STAFF_TOTALS, TEACHERS } from "../shared/staffDirectory.js";
import { EXECUTIVES } from "../shared/collegeFacts.js";
import { CAMPUS_BUILDINGS } from "../shared/campus.js";

/**
 * Departments as people say them. `say`: names people type (first = main);
 * `info`: the name looked up in departmentInfo; `teachers`: groups in the staff list.
 */
const DEPARTMENTS = [
  { id: "auto", say: ["ช่างยนต์", "ยานยนต์"], info: "ช่างยนต์", teachers: ["ช่างยนต์"], building: "mech-auto" },
  { id: "machine", say: ["ช่างกลโรงงาน", "ช่างกล"], info: "ช่างกลโรงงาน", teachers: ["ช่างกลโรงงาน"], building: "machine-shop" },
  { id: "welding", say: ["ช่างเชื่อมโลหะ", "ช่างเชื่อม"], info: "เชื่อมโลหะ", teachers: ["ช่างเชื่อมและโลหะแผ่น"], building: "ict-building" },
  { id: "electrical", say: ["ช่างไฟฟ้า", "ไฟฟ้ากำลัง"], info: "ไฟฟ้ากำลัง", teachers: ["ช่างไฟฟ้ากำลัง"], building: "electrical-construction" },
  { id: "electronics", say: ["อิเล็กทรอนิกส์", "เทคโนโลยีสารสนเทศ"], info: "อิเล็กทรอนิกส์", teachers: ["อิเล็กทรอนิกส์"], building: "electronics-it" },
  { id: "computer-tech", say: ["เทคนิคคอมพิวเตอร์", "ช่างคอม"], info: "เทคนิคคอมพิวเตอร์", teachers: [], building: "electronics-it" },
  { id: "construction", say: ["ช่างก่อสร้าง", "ก่อสร้าง"], info: "ช่างก่อสร้าง", teachers: ["ช่างก่อสร้าง"], building: "construction-workshop" },
  { id: "drafting", say: ["เขียนแบบเครื่องกล", "เขียนแบบ"], info: "เขียนแบบเครื่องกล", teachers: ["เขียนแบบเครื่องมือกล"], building: "building-10" },
  { id: "mechatronics", say: ["เมคคาทรอนิกส์", "หุ่นยนต์"], info: "เมคคาทรอนิกส์", teachers: ["เมคคาทรอนิกส์และหุ่นยนต์"], building: "ict-building" },
  { id: "accounting", say: ["การบัญชี", "บัญชี"], info: "บัญชี", teachers: ["การบัญชี"], building: "commerce" },
  { id: "marketing", say: ["การตลาด", "ธุรกิจค้าปลีก"], info: "การตลาด", teachers: ["การตลาด", "ธุรกิจค้าปลีก"], building: "commerce" },
  { id: "office", say: ["การจัดการสำนักงาน", "จัดการสำนักงาน"], info: "จัดการสำนักงาน", teachers: ["การจัดการสำนักงาน"], building: "commerce" },
  { id: "digital-business", say: ["ธุรกิจดิจิทัล", "คอมพิวเตอร์ธุรกิจ"], info: "ธุรกิจดิจิทัล", teachers: ["เทคโนโลยีธุรกิจดิจิทัล", "คอมพิวเตอร์ธุรกิจ"], building: "building-10" },
  { id: "home-ec", say: ["คหกรรม", "คหกรรมศาสตร์"], info: "คหกรรม", teachers: ["คหกรรมทั่วไป"], building: "home-economics" },
  { id: "food", say: ["อาหารและโภชนาการ", "โภชนาการ"], info: "อาหารและโภชนาการ", teachers: ["อาหารและโภชนาการ"], building: "food-nutrition" },
];

/** Teacher groups that are not a department of their own. */
const OTHER_TEACHER_GROUPS = [
  { id: "basic-tech", say: ["เทคนิคพื้นฐาน"], groups: ["เทคนิคพื้นฐาน"] },
  { id: "science", say: ["วิทยาศาสตร์", "วิทย์"], groups: ["สามัญ-สัมพันธ์ (วิทยาศาสตร์)"] },
  { id: "math", say: ["คณิตศาสตร์", "คณิต"], groups: ["สามัญ-สัมพันธ์ (คณิตศาสตร์)"] },
  { id: "english", say: ["ภาษาอังกฤษ", "อังกฤษ"], groups: ["สามัญ-สัมพันธ์ (ภาษาอังกฤษ)"] },
  { id: "thai", say: ["ภาษาไทย"], groups: ["สามัญ-สัมพันธ์ (ภาษาไทย)"] },
  { id: "social", say: ["สังคม", "สังคมศึกษา"], groups: ["สามัญ-สัมพันธ์ (สังคม)"] },
  { id: "pe", say: ["พลศึกษา", "พละ"], groups: ["สามัญ-สัมพันธ์ (พลศึกษา)"] },
];

const buildingById = new Map(CAMPUS_BUILDINGS.map(b => [b.id, b]));

/** "อยู่ที่ อาคาร 4 (พาณิชยกรรม) ชั้น 2" for a room/department name, or "" when unknown. */
function whereIs(name, buildingId) {
  const strip = s => s.replace(/^(สาขาวิชา|สาขา|แผนกวิชา|งาน|ฝ่าย)/, "");
  const key = strip(name);
  const candidates = buildingId ? [buildingById.get(buildingId)].filter(Boolean) : CAMPUS_BUILDINGS;
  for (const b of candidates) {
    for (const f of b.floorsDetail ?? []) {
      if (f.rooms.some(r => strip(r).includes(key) || key.includes(strip(r)))) {
        const floor = (b.floorsDetail.length > 1 || f.level > 1) && /ชั้น/.test(f.label) ? ` ${f.label}` : "";
        return { text: `${b.name}${floor}`, buildingId: b.id };
      }
    }
    if (buildingId) return { text: b.name, buildingId: b.id };
  }
  return null;
}

const teachersOf = groups => TEACHERS.filter(([g]) => groups.includes(g)).flatMap(([, list]) => list);

function teacherList(list) {
  return list.map(([name, position]) => (position === "ครู" ? name : `${name} (${position})`)).join(", ");
}

const levelText = programmes => {
  const parts = [];
  if (programmes?.["ปวช."]?.length) parts.push(`ปวช. 3 ปี (รับผู้จบ ม.3) หลักสูตร ${programmes["ปวช."].join(" / ")}`);
  if (programmes?.["ปวส."]?.length) parts.push(`ปวส. 2 ปี (รับผู้จบ ม.6 หรือ ปวช.) หลักสูตร ${programmes["ปวส."].join(" / ")}`);
  if (parts.length && !programmes?.["ปวส."]?.length) parts.push("(สาขานี้ไม่มี ปวส. เปิดสอนเฉพาะ ปวช.)");
  if (parts.length && !programmes?.["ปวช."]?.length) parts.push("(สาขานี้ไม่มี ปวช. เปิดสอนเฉพาะ ปวส.)");
  return parts.join(" และ ").replace(/ และ \(/g, " (");
};

function departmentEntries() {
  const entries = [];
  for (const d of DEPARTMENTS) {
    const info = withDepartmentInfo({ name: d.info });
    if (!info?.description) continue;
    const [main, alt] = d.say;
    const title = `สาขา${main}`;
    const where = whereIs(main, d.building);
    const levels = levelText(info.programmes);

    entries.push({
      id: `dept-${d.id}-study`,
      category: "สาขาวิชา",
      questions: [
        `${main}เรียนอะไร`, `สาขา${main}เรียนอะไรบ้าง`, `${main}เรียนเกี่ยวกับอะไร`, `${main}คืออะไร`, `แนะนำสาขา${main}`,
        `เรียน${main}ต้องเรียนอะไร`, ...(alt ? [`${alt}เรียนอะไร`, `สาขา${alt}เรียนอะไรบ้าง`] : []),
      ],
      answer:
        `${title} ${info.description} ` +
        (info.skills?.length ? `ทักษะที่ได้ เช่น ${info.skills.join(" ")} ` : "") +
        (levels ? `เปิดสอน ${levels} ` : "") +
        (where ? `เรียนที่${where.text} ` : "") +
        "ครับ",
      action: "open-departments",
    });

    if (info.careers?.length)
      entries.push({
        id: `dept-${d.id}-careers`,
        category: "สาขาวิชา",
        questions: [
          `จบ${main}ทำงานอะไร`, `${main}จบไปทำอะไร`, `${main}ทำงานอะไรได้บ้าง`, `เรียน${main}จบแล้วทำอะไร`, `${main}มีงานทำไหม`,
          `อาชีพสาขา${main}`, ...(alt ? [`จบ${alt}ทำงานอะไร`, `${alt}ทำงานอะไรได้บ้าง`] : []),
        ],
        answer:
          `จบ${title}ทำงานได้หลายแบบครับ เช่น ${info.careers.join(" ")}` +
          (info.careerGroup ? ` (อยู่ในกลุ่มอาชีพ${info.careerGroup})` : "") +
          (info.programmes?.["ปวส."]?.length ? ` และเรียนต่อ ปวส. หรือปริญญาตรีได้ครับ` : "ครับ"),
        action: "open-departments",
      });

    if (levels)
      entries.push({
        id: `dept-${d.id}-levels`,
        category: "สาขาวิชา",
        questions: [
          `${main}มีปวสไหม`, `${main}มีปวชไหม`, `${main}เรียนกี่ปี`, `${main}มีระดับไหนบ้าง`, `${main}ต่อปวสได้ไหม`,
          `จบม6เรียน${main}ได้ไหม`, `ปวส${main}ชื่อสาขาอะไร`, `ปวส${main}เรียนสาขาอะไร`,
        ],
        answer: `${title} เปิดสอน ${levels} ครับ`,
      });

    const teachers = teachersOf(d.teachers);
    if (teachers.length)
      entries.push({
        id: `dept-${d.id}-teachers`,
        category: "บุคลากร",
        questions: [`ครู${main}มีใครบ้าง`, `ครูสาขา${main}`, `อาจารย์${main}มีใครบ้าง`, `ครูแผนก${main}`, `${main}มีครูกี่คน`, ...(alt ? [`ครู${alt}มีใครบ้าง`] : [])],
        answer: `ครู${title}มี ${teachers.length} ท่านครับ ได้แก่ ${teacherList(teachers)} (ข้อมูล ณ ${STAFF_AS_OF})`,
        ...(where && { routeTo: where.buildingId }),
      });
  }

  for (const g of OTHER_TEACHER_GROUPS) {
    const teachers = teachersOf(g.groups);
    if (!teachers.length) continue;
    const [main, alt] = g.say;
    entries.push({
      id: `teachers-${g.id}`,
      category: "บุคลากร",
      questions: [`ครู${main}มีใครบ้าง`, `ครูสอน${main}`, `อาจารย์${main}มีใครบ้าง`, `ใครสอน${main}`, ...(alt ? [`ครู${alt}มีใครบ้าง`, `ใครสอน${alt}`] : [])],
      answer: `ครู${main}มี ${teachers.length} ท่านครับ ได้แก่ ${teacherList(teachers)} (ข้อมูล ณ ${STAFF_AS_OF})`,
    });
  }
  return entries;
}

function officeEntries() {
  const entries = [];
  SECTION_HEADS.forEach(([office, head], i) => {
    const plain = office.replace(/^งาน/, "").replace(/\s*\(.*\)$/, "");
    const where = whereIs(office) ?? whereIs(plain);
    entries.push({
      id: `office-head-${i + 1}`,
      category: "บุคลากร",
      questions: [`หัวหน้า${office}คือใคร`, `ใครเป็นหัวหน้า${office}`, `${office}ใครดูแล`, `ใครดูแล${plain}`],
      answer: `หัวหน้า${office}คือ ${head} ครับ` + (where ? ` ${office}อยู่ที่${where.text} ผมเปิดเส้นทางให้แล้วครับ` : ""),
      ...(where && { routeTo: where.buildingId }),
    });
  });
  return entries;
}


/** "อยากเรียน X" → how to apply (งานทะเบียน), per department. */
function applyEntries() {
  return DEPARTMENTS.map(d => {
    const [main, alt] = d.say;
    return {
      id: `dept-${d.id}-apply`,
      category: "สาขาวิชา",
      questions: [`อยากเรียน${main}`, `อยากเรียน${main}ต้องทำยังไง`, `สมัครเรียน${main}`, `สมัครเรียน${main}ยังไง`,...(alt ? [`อยากเรียน${alt}`] : [])],
      answer:
        `อยากเรียนสาขา${main} สมัครได้ที่งานทะเบียนครับ ดูกำหนดการรับสมัครล่าสุดได้ที่ www.sstc.ac.th หรือโทร {phone} ` +
        "ผมเปิดเส้นทางไปงานทะเบียนให้แล้วครับ",
      routeTo: "personnel-registration",
    };
  });
}

/** "อาคาร 4 มีอะไรบ้าง" / "ตึก 10 มีอะไร" → the rooms per floor. */
function buildingEntries() {
  const entries = [];
  // Only "อาคาร N" that names this building ("อาคาร 4 · …"), not "ระหว่างอาคาร 7 และอาคาร 8".
  const numberOf = b => /^อาคาร\s*(\d+)(\s*·|\s*\(|$)/.exec(b.name)?.[1] ?? /^อาคาร\s*(\d+)[^·]*·/.exec(b.description)?.[1];
  const sharing = new Map(); // building number → the map points on that building (อาคาร 8 = ไฟฟ้ากำลัง + ก่อสร้าง)
  for (const b of CAMPUS_BUILDINGS) {
    const n = numberOf(b);
    if (n) sharing.set(n, [...(sharing.get(n) ?? []), b]);
  }
  for (const [n, list] of sharing) {
    if (list.length < 2) continue;
    entries.push({
      id: `building-number-${n}-inside`,
      category: "อาคาร",
      questions: [`อาคาร ${n}มีอะไรบ้าง`, `ในอาคาร ${n}มีอะไร`, `ตึก ${n}มีอะไรบ้าง`, `ในตึก ${n}มีอะไร`, `อาคาร ${n}มีห้องอะไรบ้าง`, `อาคาร ${n}อยู่ไหน`, `ไปอาคาร ${n}ยังไง`, `ตึก ${n}อยู่ไหน`],
      answer: `อาคาร ${n} มี ${list.map(b => b.description.replace(/^อาคาร\s*\d+\s*/, "").replace(/\s*\(.*\)$/, "")).join(" และ ")} ครับ ผมเปิดเส้นทางไปฝั่ง${list[0].shortName}ให้แล้วครับ`,
      routeTo: list[0].id,
    });
  }
  for (const b of CAMPUS_BUILDINGS) {
    const floors = (b.floorsDetail ?? []).filter(f => f.rooms.length);
    if (!floors.length) continue;
    const names = new Set([b.name, ...b.shortName.split("/").map(s => s.trim())]);
    const number = numberOf(b);
    if (number && sharing.get(number).length === 1) names.add(`อาคาร ${number}`).add(`ตึก ${number}`);
    const questions = [];
    for (const n of names) if (n.length >= 4) questions.push(`${n}มีอะไรบ้าง`, `ใน${n}มีอะไร`, `${n}มีห้องอะไรบ้าง`);
    // Several floors: list them. One floor: the description says more (e.g. อาคาร 8 = ไฟฟ้า + ก่อสร้าง).
    const detail =
      floors.length > 1
        ? `มี ${floors.map(f => `${f.label}: ${f.rooms.join(", ")}`).join(" · ")}`
        : `— ${b.description.replace(/^(อาคาร\s*\d+|หมายเลข\s*\d+|จุด\s*[A-Z])\s*·\s*/, "")}`;
    entries.push({
      id: `building-${b.id}-inside`,
      category: "อาคาร",
      questions,
      answer: `${b.name} ${detail} ครับ ผมเปิดเส้นทางให้แล้วครับ`,
      routeTo: b.id,
    });
  }
  return entries;
}

/** "ใครดูแลฝ่ายวิชาการ" → the assistant director of that division; plus staff numbers. */
function executiveEntries() {
  const entries = [];
  EXECUTIVES.forEach(([name, position], i) => {
    const division = /ฝ่าย(.+)$/.exec(position)?.[1];
    if (!division) return;
    entries.push({
      id: `division-${i + 1}`,
      category: "บุคลากร",
      questions: [`ใครดูแลฝ่าย${division}`, `หัวหน้าฝ่าย${division}คือใคร`, `ฝ่าย${division}ใครดูแล`, `ผู้ช่วยผอฝ่าย${division}`],
      answer: `ฝ่าย${division}ดูแลโดย ${name} ${position} ครับ`,
    });
  });
  entries.push({
    id: "staff-count",
    category: "บุคลากร",
    questions: ["มีครูกี่คน", "ครูทั้งหมดกี่คน", "วิทยาลัยมีครูกี่คน", "จำนวนครู", "บุคลากรมีกี่คน"],
    answer: `วิทยาลัยมีครู ${STAFF_TOTALS.teachers} ท่าน และผู้บริหาร ${STAFF_TOTALS.executives} ท่านครับ (ข้อมูล ณ ${STAFF_AS_OF}) ถามรายชื่อครูแต่ละสาขาได้ เช่น "ครูช่างยนต์มีใครบ้าง" ครับ`,
  });
  return entries;
}

// ---------------------------------------------------------------- comparisons and interests

/** A department to compare or recommend: its name as people say it and one line on what it studies. */
function unit(id) {
  if (id === "it") return { name: "เทคโนโลยีสารสนเทศ (IT)", say: ["เทคโนโลยีสารสนเทศ", "ไอที"], what: "เรียนเขียนโปรแกรม ระบบเครือข่าย ฐานข้อมูล และเว็บไซต์" };
  if (id === "electronics") return { name: "อิเล็กทรอนิกส์", say: ["อิเล็กทรอนิกส์"], what: "เรียนวงจร ไมโครคอนโทรลเลอร์ ประกอบและซ่อมอุปกรณ์อิเล็กทรอนิกส์" };
  const d = DEPARTMENTS.find(x => x.id === id);
  const info = withDepartmentInfo({ name: d.info });
  return { name: d.say[0], say: d.say, what: info.description };
}

const PAIRS = [
  ["auto", "machine"], ["electrical", "electronics"], ["computer-tech", "it"], ["accounting", "marketing"],
  ["office", "digital-business"], ["home-ec", "food"], ["mechatronics", "electrical"], ["welding", "machine"],
  ["drafting", "construction"], ["electronics", "mechatronics"], ["computer-tech", "digital-business"], ["accounting", "office"],
  ["electronics", "it"], ["electrical", "construction"],
];

function comparisonEntries() {
  return PAIRS.map(([a, b]) => {
    const A = unit(a), B = unit(b);
    const [x, y] = [A.say[0], B.say[0]];
    return {
      id: `compare-${a}-${b}`,
      category: "สาขาวิชา",
      questions: [
        `${x}กับ${y}ต่างกันยังไง`, `${y}กับ${x}ต่างกันยังไง`, `${x}กับ${y}ต่างกันไหม`,
        `${x}กับ${y}อันไหนดีกว่า`, `${x}กับ${y}อันไหนยากกว่า`, `${x}กับ${y}เรียนต่างกันยังไง`,
      ],
      answer:
        `สองสาขานี้เรียนคนละแนวครับ\n- ${A.name}: ${A.what}\n- ${B.name}: ${B.what}\n` +
        "ไม่มีสาขาไหนดีกว่ากัน เลือกจากสิ่งที่ชอบได้เลย หรือลองเกมเลือกสาขา 2 ข้อครับ",
      action: "dept-quiz",
    };
  });
}

/** "ชอบซ่อมรถควรเรียนอะไร", "อยากเป็นเชฟเรียนสาขาไหน" → the departments that fit. */
const INTERESTS = [
  { id: "cars", like: ["ซ่อมรถ", "รถยนต์", "เครื่องยนต์"], be: ["ช่างซ่อมรถ"], depts: ["auto"] },
  { id: "cooking", like: ["ทำอาหาร", "ทำขนม", "เบเกอรี่"], be: ["เชฟ", "พ่อครัว", "แม่ครัว"], depts: ["food", "home-ec"] },
  { id: "coding", like: ["เขียนโปรแกรม", "ทำเว็บ", "เล่นเกมคอม"], be: ["โปรแกรมเมอร์", "นักพัฒนาเว็บ"], depts: ["it", "computer-tech", "digital-business"] },
  { id: "numbers", like: ["คำนวณ", "ตัวเลข", "คิดเลข"], be: ["พนักงานบัญชี", "นักบัญชี"], depts: ["accounting"] },
  { id: "selling", like: ["ขายของ", "ค้าขาย", "ขายของออนไลน์"], be: ["นักการตลาด", "แม่ค้าออนไลน์"], depts: ["marketing", "digital-business"] },
  { id: "robots", like: ["หุ่นยนต์", "ระบบอัตโนมัติ"], be: ["วิศวกรหุ่นยนต์"], depts: ["mechatronics"] },
  { id: "electric", like: ["งานไฟฟ้า", "เดินสายไฟ", "ซ่อมไฟ"], be: ["ช่างไฟ", "ช่างไฟฟ้า"], depts: ["electrical"] },
  { id: "welding", like: ["เชื่อมเหล็ก", "งานเหล็ก"], be: ["ช่างเชื่อม"], depts: ["welding"] },
  { id: "building", like: ["ออกแบบบ้าน", "สร้างบ้าน", "งานก่อสร้าง"], be: ["ผู้รับเหมา", "โฟร์แมน"], depts: ["construction"] },
  { id: "drawing", like: ["วาดแบบ", "เขียนแบบ"], be: ["ช่างเขียนแบบ"], depts: ["drafting", "construction"] },
  { id: "office", like: ["งานเอกสาร", "ทำงานออฟฟิศ"], be: ["เลขานุการ", "เจ้าหน้าที่ธุรการ"], depts: ["office"] },
  { id: "machines", like: ["ซ่อมเครื่องจักร", "งานกลึง", "งานโรงงาน"], be: ["ช่างกล", "ช่างซ่อมบำรุง"], depts: ["machine", "mechatronics"] },
  { id: "crafts", like: ["งานประดิษฐ์", "จัดดอกไม้", "ตัดเย็บ"], be: ["ช่างตัดเย็บ"], depts: ["home-ec"] },
  { id: "gadgets", like: ["อิเล็กทรอนิกส์", "ซ่อมมือถือ", "วงจร"], be: ["ช่างอิเล็กทรอนิกส์", "ช่างซ่อมมือถือ"], depts: ["electronics"] },
];

function interestEntries() {
  return INTERESTS.map(i => {
    const units = i.depts.map(unit);
    const questions = [
      ...i.like.flatMap(w => [`ชอบ${w}ควรเรียนสาขาไหน`, `ชอบ${w}เรียนอะไรดี`, `ชอบ${w}ควรเรียนอะไร`]),
      ...i.be.flatMap(w => [`อยากเป็น${w}ต้องเรียนอะไร`, `อยากเป็น${w}เรียนสาขาไหน`]),
    ];
    const answer = units.length === 1
      ? `แนะนำสาขา${units[0].name}ครับ ${units[0].what}`
      : `แนะนำ ${units.length} สาขาครับ\n${units.map(u => `- ${u.name}: ${u.what}`).join("\n")}`;
    return { id: `interest-${i.id}`, category: "สาขาวิชา", questions, answer, action: "open-departments" };
  });
}

export const GENERATED_ENTRIES = [...departmentEntries(), ...applyEntries(), ...officeEntries(), ...executiveEntries(), ...buildingEntries(), ...comparisonEntries(), ...interestEntries()];

// ---------------------------------------------------------------- "ครู X คือใคร"

const TITLES = /^(ว่าที่ร้อยตรีหญิง|ว่าที่ร้อยตรี|ว่าที่ ร\.ต\.|นางสาว|นาย|นาง|ดร\.|ผศ\.)\s*/;

/** Everyone with a name in the data: executives, office heads, teachers. */
const PEOPLE = (() => {
  const people = new Map();
  const add = (fullName, role) => {
    const first = fullName.replace(TITLES, "").split(/\s+/)[0];
    if (!first || first.length < 3) return;
    const person = people.get(fullName) ?? { fullName, first, roles: [] };
    if (!person.roles.includes(role)) person.roles.push(role);
    people.set(fullName, person);
  };
  for (const [name, position] of EXECUTIVES) add(name, position);
  for (const [group, list] of TEACHERS) for (const [name, position] of list) add(name, `${position} สาขา${group}`);
  for (const [office, name] of SECTION_HEADS) add(name, `หัวหน้า${office}`);
  return Array.from(people.values());
})();

/** Asking about a person: "ครูอำนาจสอนอะไร", "อาจารย์ปิติคือใคร", "รองฯ สรยุทธ". */
const PERSON_INTENT = /ครู|อาจารย์|อ\.|คือใคร|เป็นใคร|สอนอะไร|สอนสาขา|อยู่สาขา|อยู่แผนก|รองผอ|รองฯ|หัวหน้า/;

export function teacherAnswer(question) {
  const text = question.replace(/\s+/g, "");
  if (!PERSON_INTENT.test(text)) return null;
  const found = PEOPLE.filter(p => text.includes(p.first) || text.includes(p.fullName.replace(/\s+/g, "")));
  if (!found.length || found.length > 3) return null;
  const lines = found.map(p => `${p.fullName} เป็น${p.roles.join(" และ")}`);
  return {
    reply: `${lines.join(" · ")} ครับ (ข้อมูลบุคลากร ณ ${STAFF_AS_OF})`,
    routeToBuildingId: null,
    faqId: `person:${found.map(p => p.first).join(",")}`,
  };
}
