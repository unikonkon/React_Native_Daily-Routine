// สร้างข้อมูลตัวอย่าง (demo) 1 เดือน จากตารางจริง "Time Table จอย.xlsx" (ดู mock-timetable.ts)
// คืน BackupData (โครงเดียวกับไฟล์สำรอง) → นำไปเข้า restoreAll(data, 'replace') ได้ทันที ไม่ต้องแตะ db เพิ่ม
// pure function: รับ today/now เป็นพารามิเตอร์ (ค่าปริยายอ่านจากนาฬิกา) — ทดสอบซ้ำได้

import { addDays, fromISO, nowMin, toISO, todayISO, wdMon } from '@/lib/dates';
import type { BackupData } from '@/lib/db';
import { TT_CASE_PRI, TT_CONTACTS, TT_DAYS, type TTItem } from '@/lib/mock-timetable';

type Row = BackupData['activities'][number];

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

/**
 * แบบของวันหนึ่งในเดือนปัจจุบัน — จับคู่ตามวันในสัปดาห์ (จันทร์ของไฟล์ → จันทร์ของเดือนนี้)
 * สัปดาห์ที่ n ของเดือนใช้แบบของวันเดียวกันในสัปดาห์ที่ n ของไฟล์ (วนซ้ำเมื่อไฟล์มีไม่ครบ)
 * — จังหวะชีวิตจึงยังตรงวัน (ทำงานวันธรรมดา · BEYOND เสาร์-อาทิตย์) แม้เดือนนี้จะยาว/สั้นไม่เท่าต้นฉบับ
 */
function patternFor(wd: number, week: number): TTItem[] {
  const same = TT_DAYS.filter((d) => d.wd === wd);
  return same.length ? same[week % same.length].items : [];
}

/** ระดับความสำคัญของนัดเคสจากชื่อเรื่อง (ไม่ตรงคำไหนเลย = P4) */
const casePri = (title: string) => TT_CASE_PRI.find((p) => title.includes(p.match))?.priority ?? 'P4';

/**
 * ตารางตัวอย่างของ "เดือนปัจจุบัน" (วันที่ 1 ถึงสิ้นเดือน):
 *  - กิจกรรมทุกช่องจากไฟล์ Time Table — ครั้งเดียว (ไม่ repeat) พร้อมสีพื้นเดิมของไฟล์
 *  - นัดเคส: ใส่ระดับความสำคัญ + ช่องทาง (ชื่อมี online = ออนไลน์) + ผูกรายชื่อที่ปรากฏในชื่อเคส
 *  - สถานะของวันที่ผ่านมาแล้ว: ทำเสร็จเป็นส่วนใหญ่ + ข้ามบ้าง, 7 วันล่าสุดเสร็จครบ (ให้ streak สวย)
 */
export function buildMockMonth(today = todayISO(), now = nowMin()): BackupData {
  const t0 = fromISO(today);
  const y = t0.getFullYear();
  const m = t0.getMonth();
  const from = toISO(new Date(y, m, 1));
  const to = toISO(new Date(y, m + 1, 0));
  const recentFrom = addDays(today, -6); // 7 วันล่าสุด (รวมวันนี้) = เสร็จครบ
  const rand = rng(y * 100 + m + 7);

  const activities: Row[] = [];
  const occurrences: BackupData['occurrences'] = [];
  const activity_contacts: BackupData['activity_contacts'] = [];
  const contacts: BackupData['contacts'] = TT_CONTACTS.map((c, i) => ({
    id: i + 1,
    name: c.name,
    priority: c.priority,
    phone: c.phone,
    line: c.line,
    email: null,
    zoom: null,
    googlemeet: null,
    note: null,
  }));

  let aid = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dom = Number(d.slice(8, 10));
    for (const it of patternFor(wdMon(d), Math.floor((dom - 1) / 7))) {
      const isCase = it.cat === 'case';
      const id = ++aid;
      activities.push({
        id,
        title: it.title,
        cat: it.cat,
        sub: null,
        loc: null,
        channel: isCase ? (/online/i.test(it.title) ? 'online' : 'inperson') : null,
        priority: isCase ? casePri(it.title) : null,
        start_min: it.s,
        end_min: it.e,
        repeat: 'none',
        days_mask: 0,
        start_date: d,
        end_date: null,
        notify: 0, // ข้อมูลชุดใหญ่ — ไม่ตั้งเตือนอัตโนมัติกันแย่งงบ 50 รายการ
        notify_before: 30,
        detached_from: null,
        status: 'active',
        color: it.color || null,
      });

      if (isCase) {
        TT_CONTACTS.forEach((c, i) => {
          if (it.title.includes(c.match)) activity_contacts.push({ activity_id: id, contact_id: i + 1 });
        });
      }

      // สถานะรายวันของอดีต (อนาคต = planned ไม่มีแถว · วันนี้เฉพาะที่ผ่านเวลามาแล้ว)
      if (d > today || (d === today && it.s > now)) continue;
      const r = rand();
      const status = d >= recentFrom || r < 0.86 ? 'done' : r < 0.97 ? 'skipped' : null;
      if (status) occurrences.push({ activity_id: id, date: d, status });
    }
  }

  return { version: 1, activities, occurrences, contacts, activity_contacts, reschedule_logs: [] };
}
