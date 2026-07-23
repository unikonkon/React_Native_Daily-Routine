// ตัวช่วยวันที่/เวลา — ISO 'YYYY-MM-DD', สัปดาห์เริ่มจันทร์, ปีแสดงเป็น พ.ศ.

export const WD_TH = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
export const WD_TH_FULL = [
  "จันทร์",
  "อังคาร",
  "พุธ",
  "พฤหัสบดี",
  "ศุกร์",
  "เสาร์",
  "อาทิตย์",
];
export const MONTH_TH = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];
export const MONTH_TH_FULL = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

export function toISO(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export const todayISO = () => toISO(new Date());

/** นาทีปัจจุบันของวัน (สำหรับเส้น "ตอนนี้") */
export const nowMin = () => {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
};

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** weekday แบบจันทร์เริ่ม: 0=จ … 6=อา */
export function wdMon(iso: string): number {
  return (fromISO(iso).getDay() + 6) % 7;
}

export function mondayOf(iso: string): string {
  return addDays(iso, -wdMon(iso));
}

export const beYear = (y: number) => y + 543;

// ขอบเขตปีของ picker — แยก 2 ชุด:
//   SCHED = ฟอร์มเพิ่มกิจกรรม/เลื่อนนัด → จองอนาคตเท่านั้น (พ.ศ. 2569–2573)
//   VIEW  = แท็บวันนี้/สรุป (ดู/กรองข้อมูล) → ย้อนอดีตได้ถึง พ.ศ. 2563
export const SCHED_MIN_Y = 2026;
export const SCHED_MAX_Y = 2035;
export const VIEW_MIN_Y = 2025;
export const VIEW_MAX_Y = 2035;

/** "พุธ 8 ก.ค. 2569" */
export function thaiDate(iso: string): string {
  const d = fromISO(iso);
  return `${WD_TH_FULL[wdMon(iso)]} ${d.getDate()} ${MONTH_TH[d.getMonth()]} ${beYear(d.getFullYear())}`;
}

/** "6 ก.ค. – 12 ก.ค. 2569" — หัวแถบมุมมองสัปดาห์ */
export function thaiWeekRange(monISO: string): string {
  const a = fromISO(monISO);
  const b = fromISO(addDays(monISO, 6));
  return `${a.getDate()} ${MONTH_TH[a.getMonth()]} – ${b.getDate()} ${MONTH_TH[b.getMonth()]} ${beYear(b.getFullYear())}`;
}

/** นาที → "18:30" (เกิน 24:00 วนกลับ เช่น 1500 → "01:00") */
export function fmtMin(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${`${Math.floor(m / 60)}`.padStart(2, "0")}:${`${m % 60}`.padStart(2, "0")}`;
}

export function fmtRange(start: number, end: number): string {
  return `${fmtMin(start)}–${fmtMin(end)}${end > 1440 ? " +วันถัดไป" : ""}`;
}

/** ความยาวนาที → "1 ชม. 30 น." */
export function durText(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h} ชม. ${m} น.`;
  if (h) return `${h} ชม.`;
  return `${m} น.`;
}

/** ความยาวนาที → "4 ชม." / "1.5 ชม." (ปัดสั้นสำหรับ slot ว่าง) */
export function hoursText(mins: number): string {
  const h = mins / 60;
  return `${h % 1 === 0 ? h : h.toFixed(1)} ชม.`;
}
