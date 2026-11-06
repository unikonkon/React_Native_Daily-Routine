// โน้ตรายครั้ง — ตัวช่วยแบบ pure: แม่แบบโน้ตตามหมวด + หาโน้ตครั้งก่อนของกิจกรรมเดียวกัน
import type { Activity, DayItem, NoteMap } from '@/lib/types';

/**
 * ตัดบรรทัดของแม่แบบที่ยังไม่ได้กรอกทิ้ง (บรรทัดที่ยังตรงกับบรรทัดในแม่แบบ เช่น "ผล:" เปล่า ๆ)
 * ไม่ได้กรอกเลยสักบรรทัด → คืน '' (ถือว่าไม่มีโน้ต)
 */
export function stripTemplate(text: string, template: string): string {
  if (!template.trim()) return text.trim();
  const blank = new Set(template.split('\n').map((l) => l.trim()).filter(Boolean));
  return text
    .split('\n')
    .filter((l) => !blank.has(l.trim()))
    .join('\n')
    .trim();
}

/**
 * โน้ตล่าสุดก่อนวัน date ของ "กิจกรรมเดียวกัน" — id เดียวกัน (ชุดทำซ้ำ) หรือชื่อ+หมวดเดียวกัน (ลงแยกทีละครั้ง)
 * ย้อนดูไม่เกิน maxDays วันที่มีโน้ต
 */
export function previousNote(item: Pick<DayItem, 'id' | 'date' | 'cat' | 'title'>, notes: NoteMap, acts: Activity[], maxDays = 400): { date: string; note: string } | null {
  const title = item.title.trim();
  const same = new Set<number>([item.id]);
  for (const a of acts) if (a.cat === item.cat && a.title.trim() === title) same.add(a.id);
  const dates = Object.keys(notes)
    .filter((d) => d < item.date)
    .sort()
    .reverse()
    .slice(0, maxDays);
  for (const d of dates) {
    const day = notes[d];
    for (const id of same) {
      const n = day[id];
      if (n) return { date: d, note: n };
    }
  }
  return null;
}
