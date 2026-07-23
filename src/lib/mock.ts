// สร้างข้อมูลตัวอย่าง (demo) ทั้งปี — ตารางชีวิต: งานประจำ + นัดคุยเคส + กิจกรรมต่าง ๆ + รายชื่อ
// คืน BackupData (โครงเดียวกับไฟล์สำรอง) → นำไปเข้า restoreAll(data, 'replace') ได้ทันที ไม่ต้องแตะ db เพิ่ม
// pure function: รับ today/now เป็นพารามิเตอร์ (ค่าปริยายอ่านจากนาฬิกา) — ทดสอบซ้ำได้

import { addDays, nowMin, todayISO, wdMon } from '@/lib/dates';
import type { BackupData } from '@/lib/db';

type Row = BackupData['activities'][number];

// bitmask วันในสัปดาห์ (bit0=จันทร์ … bit6=อาทิตย์) — ตรงกับ engine.occursOn
const DAILY = 0b1111111; // ทุกวัน
const MON_FRI = 0b0011111; // จันทร์–ศุกร์
const WEEKEND = 0b1100000; // เสาร์–อาทิตย์
const MWF = (1 << 0) | (1 << 2) | (1 << 4); // จันทร์/พุธ/ศุกร์
const TUTH = (1 << 1) | (1 << 3); // อังคาร/พฤหัส
const WED = 1 << 2;
const SUN = 1 << 6;

const hm = (h: number, m = 0) => h * 60 + m;

/** PRNG แบบ seed คงที่ (mulberry32) — ผลลัพธ์เดิมทุกครั้ง ไม่พึ่ง Math.random/Date */
function rng(seed: number) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CONTACT_NAMES = [
  'คุณสมชาย', 'คุณมาลี', 'พี่แนน', 'น้องบีม', 'คุณวิภา', 'พี่โอ๊ต', 'คุณธนา', 'น้องปลา',
  'คุณกิตติ', 'พี่จอย', 'คุณอรุณ', 'น้องเมย์', 'คุณประเสริฐ', 'พี่ก้อง', 'คุณศิริพร', 'น้องต้นกล้า',
];

// ลำดับความสำคัญของแต่ละรายชื่อ (P1 คนใหม่/มีปัญหา … P6 ทั่วไป) — ใช้เป็น priority ของนัดด้วย
const CONTACT_PRI = ['P1', 'P2', 'P1', 'P3', 'P4', 'P2', 'P3', 'P5', 'P4', 'P6', 'P3', 'P5', 'P4', 'P2', 'P6', 'P5'] as const;

const CASE_TITLE: Record<string, string[]> = {
  P1: ['ปรึกษาเคสด่วน', 'ดูแลคนใหม่', 'แก้ปัญหาเร่งด่วน'],
  P2: ['นัดคุยเคส', 'ปิดการสมัคร', 'นำเสนอแผน'],
  _: ['ติดตามผล', 'ดูแลสมาชิก', 'พูดคุยอัปเดต', 'วางแผนร่วมกัน'],
};
const ONLINE_TOOLS = ['Zoom', 'Google Meet', 'LINE Call'];
const INPERSON_PLACES = ['คาเฟ่สีลม', 'ออฟฟิศสาขา', 'ร้านกาแฟใกล้บ้าน', 'ห้างเซ็นทรัล', 'โคเวิร์กกิ้งสเปซ'];

/**
 * สร้างตารางจำลอง 1 ปี:
 *  - series ประจำ (กิจวัตร/งาน/ออกกำลัง/เรียนรู้/ทีม/ส่วนตัว) ทั้งปี
 *  - นัดคุยเคส (case) แบบครั้งเดียว 1–3 นัด/วันทำงาน ช่วงบ่าย ผูกกับรายชื่อ
 *  - อีเวนต์พิเศษรายเดือน (ประชุมใหญ่/อบรม/ธุระส่วนตัว)
 *  - สถานะรายวันของ "อดีต": ทำเสร็จเป็นส่วนใหญ่ + ข้ามบ้าง, 14 วันล่าสุดเสร็จครบ (ให้ streak สวย)
 */
export function buildMockYear(year: number, today = todayISO(), now = nowMin()): BackupData {
  const rand = rng(year * 1000 + 7);
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];

  const jan1 = `${year}-01-01`;
  const dec31 = `${year}-12-31`;
  const recentFrom = addDays(today, -13); // 14 วันล่าสุด (รวมวันนี้) = เสร็จครบ

  const activities: Row[] = [];
  const occurrences: BackupData['occurrences'] = [];
  const contacts: BackupData['contacts'] = [];
  const activity_contacts: BackupData['activity_contacts'] = [];

  let aid = 0;
  const base: Omit<Row, 'id' | 'title' | 'cat' | 'start_min' | 'end_min' | 'repeat' | 'days_mask' | 'start_date'> = {
    sub: null, loc: null, channel: null, priority: null, end_date: null,
    notify: 0, notify_before: 30, detached_from: null, status: 'active',
  };
  const add = (r: Partial<Row> & Pick<Row, 'title' | 'cat' | 'start_min' | 'end_min' | 'repeat' | 'days_mask' | 'start_date'>): number => {
    const id = ++aid;
    activities.push({ ...base, ...r, id });
    return id;
  };

  // ---------- รายชื่อ ----------
  CONTACT_NAMES.forEach((name, i) => {
    contacts.push({
      id: i + 1,
      name,
      priority: CONTACT_PRI[i],
      phone: `08${Math.floor(rand() * 90000000 + 10000000)}`,
      line: rand() < 0.7 ? `@${name.replace(/\s/g, '')}` : null,
    });
  });

  // ---------- series ประจำทั้งปี ----------
  interface Series { id: number; mask: number }
  const series: Series[] = [];
  const addSeries = (title: string, cat: Row['cat'], s: number, e: number, mask: number, extra: Partial<Row> = {}) => {
    series.push({ id: add({ title, cat, start_min: s, end_min: e, repeat: mask === DAILY ? 'daily' : mask === MON_FRI ? 'weekday' : mask === WEEKEND ? 'weekend' : 'custom', days_mask: mask, start_date: jan1, end_date: dec31, ...extra }), mask });
  };

  addSeries('ตื่นนอน & ยืดเส้น', 'routine', hm(6), hm(6, 45), DAILY);
  addSeries('อาหารเช้า', 'routine', hm(7), hm(7, 30), DAILY);
  addSeries('พักกลางวัน', 'routine', hm(12), hm(13), DAILY);
  addSeries('เตรียมตัวนอน', 'routine', hm(23), hm(23, 45), DAILY);
  addSeries('วางแผนวัน & เช็คข้อความ', 'work', hm(8, 30), hm(9), MON_FRI);
  addSeries('งานประจำ / เอกสาร', 'work', hm(9), hm(12), MON_FRI);
  addSeries('ออกกำลังกาย', 'ex', hm(18), hm(19), MWF);
  addSeries('อ่านหนังสือ / คอร์สออนไลน์', 'learn', hm(20), hm(21), TUTH);
  addSeries('ประชุมทีม / ชุมชน', 'case', hm(19, 30), hm(20, 30), WED, { channel: 'online', loc: 'Zoom', priority: 'P4' });
  addSeries('วีคลี่รีวิวเป้าหมาย', 'case', hm(20), hm(21), SUN, { channel: 'online', loc: 'Google Meet', priority: 'P4' });
  addSeries('ธุระส่วนตัว & พักผ่อน', 'me', hm(10), hm(12), WEEKEND);

  // ---------- นัดคุยเคสรายวัน (ครั้งเดียว) + อีเวนต์พิเศษ + สถานะอดีต ----------
  const CASE_SLOTS = [hm(13), hm(14), hm(15), hm(16), hm(17)];
  const oneOffByDate = new Map<string, number[]>(); // วันที่ → id นัดครั้งเดียว (ไว้ลงสถานะอดีต)

  for (let d = jan1; d <= dec31; d = addDays(d, 1)) {
    const wd = wdMon(d);

    // นัดเคสช่วงบ่าย 1–3 นัด เฉพาะวันทำงาน
    if (wd < 5) {
      const n = pick([1, 1, 2, 2, 3]);
      const starts = [...CASE_SLOTS].sort(() => rand() - 0.5).slice(0, n).sort((a, b) => a - b);
      for (const s of starts) {
        const ci = Math.floor(rand() * contacts.length);
        const c = contacts[ci];
        const dur = pick([45, 60]);
        const online = rand() < 0.55;
        const titles = CASE_TITLE[c.priority] ?? CASE_TITLE._;
        const id = add({
          title: `${pick(titles)}: ${c.name}`,
          cat: 'case',
          start_min: s,
          end_min: s + dur,
          repeat: 'none',
          days_mask: 0,
          start_date: d,
          channel: online ? 'online' : 'inperson',
          loc: online ? pick(ONLINE_TOOLS) : pick(INPERSON_PLACES),
          priority: c.priority,
        });
        activity_contacts.push({ activity_id: id, contact_id: c.id });
        (oneOffByDate.get(d) ?? oneOffByDate.set(d, []).get(d)!).push(id);
      }
    }

    // อีเวนต์พิเศษ: เสาร์ที่ 2 ของเดือน = เวิร์กช็อป/ประชุมใหญ่, อาทิตย์สิ้นเดือน = ธุระครอบครัว
    const dom = Number(d.slice(8, 10));
    if (wd === 5 && dom >= 8 && dom <= 14) {
      const id = add({ title: 'เวิร์กช็อป / ประชุมใหญ่ประจำเดือน', cat: 'case', start_min: hm(9), end_min: hm(12), repeat: 'none', days_mask: 0, start_date: d, channel: 'inperson', loc: 'โรงแรม/ศูนย์ประชุม', priority: 'P4' });
      (oneOffByDate.get(d) ?? oneOffByDate.set(d, []).get(d)!).push(id);
    }
    if (wd === 6 && dom >= 22) {
      const id = add({ title: 'ทานข้าว & เวลาครอบครัว', cat: 'me', start_min: hm(17), end_min: hm(20), repeat: 'none', days_mask: 0, start_date: d, loc: 'ร้านอาหาร' });
      (oneOffByDate.get(d) ?? oneOffByDate.set(d, []).get(d)!).push(id);
    }
  }

  // ---------- สถานะรายวันของอดีต (done ส่วนใหญ่ / skipped บ้าง) ----------
  const markStatus = (activityId: number, date: string, sMin: number) => {
    if (date > today) return; // อนาคต = planned (ไม่มีแถว)
    if (date === today && sMin > now) return; // วันนี้เฉพาะที่ผ่านเวลามาแล้ว
    const forced = date >= recentFrom; // 14 วันล่าสุด = เสร็จครบ (streak)
    const r = rand();
    const status = forced || r < 0.86 ? 'done' : r < 0.97 ? 'skipped' : null;
    if (status) occurrences.push({ activity_id: activityId, date, status });
  };

  for (let d = jan1; d <= today; d = addDays(d, 1)) {
    const wd = wdMon(d);
    for (const s of series) if ((s.mask >> wd) & 1) markStatus(s.id, d, activities[s.id - 1].start_min);
    for (const id of oneOffByDate.get(d) ?? []) markStatus(id, d, activities[id - 1].start_min);
  }

  return { version: 1, activities, occurrences, contacts, activity_contacts, reschedule_logs: [] };
}
