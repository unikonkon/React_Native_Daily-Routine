// ข้อความ "สรุปตอนเช้า" (แจ้งเตือน 06:00) — วันนี้มีนัดเคสหมวด "งานธุรกิจ/ทีม" อะไรบ้าง โดยสรุป
// pure function: รับ acts+occ ของ store มาคำนวณตรง ๆ ไม่มี I/O — ตัวตั้งคิวแจ้งเตือนเรียกล่วงหน้าทีละวัน
// notes (เปิดที่ ตั้งค่า › จัดการโน้ต) → ใต้นัดแต่ละรายการแนบโน้ตครั้งก่อนบรรทัดแรก ให้รู้ว่าค้างอะไรจากครั้งที่แล้ว

import { CAT_BY_ID, PRI_BY_ID } from '@/constants/theme';
import { fmtMin, hoursText } from '@/lib/dates';
import { dayItems } from '@/lib/engine';
import { previousNote } from '@/lib/notes';
import type { Activity, NoteMap, OccMap } from '@/lib/types';

/** จำนวนนัดที่ลงรายละเอียดในข้อความ — ที่เหลือสรุปเป็น "และอีก N นัด" */
const MAX_LINES = 4;
/** ความยาวโน้ตครั้งก่อนที่แนบต่อนัด (ตัวอักษร) — แจ้งเตือนแสดงได้จำกัด */
const NOTE_CHARS = 48;

/** บรรทัดแรกของโน้ต ตัดให้สั้นพอสำหรับแจ้งเตือน */
function noteLine(note: string): string {
  const first = note.split('\n').find((l) => l.trim())?.trim() ?? '';
  return first.length > NOTE_CHARS ? `${first.slice(0, NOTE_CHARS - 1)}…` : first;
}

export interface MorningDigest {
  title: string;
  body: string;
  /** จำนวนนัดเคสของวันนั้น (0 = วันว่างจากเคส) */
  count: number;
}

/** สรุปนัดเคสของวัน date เป็นหัวข้อ+เนื้อความแจ้งเตือน */
export function morningDigest(acts: Activity[], occ: OccMap, date: string, notes?: NoteMap | null): MorningDigest {
  // นับเฉพาะที่ยังต้องทำ/ทำแล้ว — ที่ข้าม/ยกเลิก/เลื่อนออกไปแล้วไม่ใช่ตารางของวันนี้
  const items = dayItems(acts, occ, date).filter((i) => i.ostatus === 'planned' || i.ostatus === 'done');
  const cases = items.filter((i) => i.cat === 'case');
  const label = CAT_BY_ID.case.name; // "งานธุรกิจ/ทีม"

  if (!cases.length) {
    const others = items.length;
    return {
      title: 'สรุปตอนเช้า ☀️ · วันนี้ไม่มีนัดเคส',
      body: others
        ? `วันนี้ไม่มีนัดหมวด “${label}” · มีกิจกรรมอื่นอีก ${others} รายการ`
        : `วันนี้ไม่มีนัดหมวด “${label}” — ตารางว่างทั้งวัน`,
      count: 0,
    };
  }

  const mins = cases.reduce((s, i) => s + (i.endMin - i.startMin), 0);
  const lines = cases.slice(0, MAX_LINES).flatMap((i) => {
    const pri = i.priority ? ` [${PRI_BY_ID[i.priority].id} ${PRI_BY_ID[i.priority].label}]` : '';
    const ch = i.channel === 'online' ? ' · ออนไลน์' : i.channel === 'inperson' ? ' · พบตัว' : '';
    const prev = notes ? previousNote(i, notes, acts) : null;
    const line = `${fmtMin(i.startMin)} ${i.title}${pri}${ch}`;
    return prev ? [line, `   ↳ ครั้งก่อน: ${noteLine(prev.note)}`] : [line];
  });
  if (cases.length > MAX_LINES) lines.push(`…และอีก ${cases.length - MAX_LINES} นัด`);
  lines.push(`รวม ${cases.length} นัด · ${hoursText(mins)}`);

  return {
    title: `สรุปตอนเช้า ☀️ · นัดเคสวันนี้ ${cases.length} รายการ`,
    body: lines.join('\n'),
    count: cases.length,
  };
}
