// โน้ตรายครั้ง — ตัวช่วยแบบ pure: แม่แบบโน้ตตามหมวด + หาโน้ตครั้งก่อนของกิจกรรมเดียวกัน
import type { CatId } from '@/constants/theme';
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
 * โน้ตก่อนวัน date ของ "กิจกรรมเดียวกัน" ใหม่ → เก่า ไม่เกิน limit อัน (วันละอัน)
 * กิจกรรมเดียวกัน = id เดียวกัน (ชุดทำซ้ำ) หรือชื่อ+หมวดเดียวกัน (ลงแยกทีละครั้ง) · ย้อนดูไม่เกิน maxDays วันที่มีโน้ต
 */
export function previousNotes(item: Pick<DayItem, 'id' | 'date' | 'cat' | 'title'>, notes: NoteMap, acts: Activity[], limit = 1, maxDays = 400): { date: string; note: string }[] {
  if (limit <= 0) return [];
  const title = item.title.trim();
  const same = new Set<number>([item.id]);
  for (const a of acts) if (a.cat === item.cat && a.title.trim() === title) same.add(a.id);
  const dates = Object.keys(notes)
    .filter((d) => d < item.date)
    .sort()
    .reverse()
    .slice(0, maxDays);
  const out: { date: string; note: string }[] = [];
  for (const d of dates) {
    const day = notes[d];
    for (const id of same) {
      const n = day[id];
      if (n) {
        out.push({ date: d, note: n });
        break;
      }
    }
    if (out.length >= limit) break;
  }
  return out;
}

/** โน้ตล่าสุดก่อนวัน date ของกิจกรรมเดียวกัน (ดู previousNotes) */
export function previousNote(item: Pick<DayItem, 'id' | 'date' | 'cat' | 'title'>, notes: NoteMap, acts: Activity[], maxDays = 400): { date: string; note: string } | null {
  return previousNotes(item, notes, acts, 1, maxDays)[0] ?? null;
}

type SnippetLike = { cats: CatId[]; uses: number; pinned: boolean; hidden: boolean };

/**
 * ลำดับชิปโน้ตสำเร็จรูป (ตัดตัวที่ซ่อน) — ปักหมุดก่อนตามลำดับในคลัง → ที่เหลือใช้บ่อยก่อน → ใหม่กว่าก่อน (ต้นคลัง)
 * cat = กรองเฉพาะของหมวดนั้น (รวมแบบ "ทุกหมวด") · ไม่ส่ง = ทุกตัว (ใช้กับตัวอย่างในหน้าจัดการโน้ต)
 */
export function snippetsFor<T extends SnippetLike>(cat: CatId | null, list: T[]): T[] {
  return list
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => !x.hidden && (!cat || !x.cats.length || x.cats.includes(cat)))
    .sort((a, b) => Number(b.x.pinned) - Number(a.x.pinned) || (a.x.pinned ? a.i - b.i : b.x.uses - a.x.uses || a.i - b.i))
    .map(({ x }) => x);
}

/** แทรกข้อความลงโน้ต — ช่องว่าง (หรือมีแค่แม่แบบ) = แทนที่ · มีข้อความแล้ว = ต่อบรรทัดใหม่ */
export function appendNote(current: string, template: string, add: string): string {
  const cur = stripTemplate(current, template);
  return cur ? `${cur}\n${add}` : add;
}
