// Facts about the college, taken from its own website (www.sstc.ac.th):
//   data_1547 ข้อมูลอาคารสถานที่ (address, phone, email, area, buildings — as of 20 May 2567)
//   data_1540 ข้อมูลทั่วไปของวิทยาลัย (history, vision, identity)
//   data_1545 ข้อมูลหลักสูตรการเรียนการสอน (programme types and levels)
// น้องปลาทู uses these to answer questions. Update here if the college's details change.

export const COLLEGE_FACTS = {
  name: "วิทยาลัยเทคนิคสมุทรสงคราม",
  nameEn: "Samutsongkhram Technical College",
  shortName: "SSTC",
  address: "89 หมู่ 12 ถนนเอกชัย ตำบลลาดใหญ่ อำเภอเมือง จังหวัดสมุทรสงคราม 75000",
  phone: "034-711440",
  fax: "034-711470",
  email: "samutsongkhram.sstc@gmail.com",
  website: "www.sstc.ac.th",
  founded: "18 เมษายน พ.ศ. 2484",
  history:
    "ก่อตั้งเมื่อ 18 เมษายน พ.ศ. 2484 เดิมชื่อโรงเรียนช่างไม้สมุทรสงคราม เปิดสอนประถมอาชีพช่างไม้ 2 ปี ในบริเวณวัดเพชรสมุทรวรวิหาร " +
    "ย้ายมาที่ตำบลลาดใหญ่ในปี พ.ศ. 2503 เปลี่ยนชื่อเป็นโรงเรียนการช่างสมุทรสงครามในปี พ.ศ. 2507 และต่อมาเป็นวิทยาลัยเทคนิคสมุทรสงคราม " +
    "ได้รับรางวัลพระราชทานประจำปีการศึกษา 2537",
  vision: "ผลิตและพัฒนากำลังคนสมรรถนะสูงตามมาตรฐานวิชาชีพ สอดคล้องกับคุณวุฒิแห่งชาติ",
  identity: "ทักษะดี มีคุณธรรม น้อมนำหลักปรัชญาของเศรษฐกิจพอเพียง",
  programmeTypes: ["ช่างอุตสาหกรรม", "พาณิชยกรรม", "คหกรรม"],
  levels: "ประกาศนียบัตรวิชาชีพ (ปวช.) และประกาศนียบัตรวิชาชีพชั้นสูง (ปวส.) ทั้งระบบปกติและระบบทวิภาคี (เรียนควบคู่กับฝึกงานในสถานประกอบการ)",
  area: "53 ไร่ 4 งาน 149 ตารางวา (2 แปลง: วิทยาลัย 43 ไร่ และบ้านพักครู 10 ไร่)",
  buildingCount: "อาคารเรียนและอาคารปฏิบัติการรวม 15 หลัง 353 ห้อง",
  officeHours: "08:00–16:30 น.",
  director: "นายอรุณ เกลื่อนพันธ์",
};

/** The facts as lines for the chat assistant's instructions. */
export function collegeFactLines(f = COLLEGE_FACTS) {
  return [
    `ชื่อภาษาอังกฤษ: ${f.nameEn} (${f.shortName})`,
    `ที่อยู่: ${f.address}`,
    `โทรศัพท์: ${f.phone} | โทรสาร: ${f.fax} | อีเมล: ${f.email} | เว็บไซต์: ${f.website}`,
    `เวลาทำการ: ${f.officeHours} | ผู้อำนวยการ: ${f.director}`,
    `ประวัติ: ${f.history}`,
    `วิสัยทัศน์: ${f.vision}`,
    `อัตลักษณ์: ${f.identity}`,
    `เปิดสอน ${f.programmeTypes.length} ประเภทวิชา (${f.programmeTypes.join(", ")}) ระดับ ${f.levels}`,
    `พื้นที่: ${f.area} | ${f.buildingCount}`,
  ];
}
