// แตะวงกลมสถานะบนราง → สลับ ทำแล้ว ↔ ยังไม่ทำ พร้อม toast "เลิกทำ" (คืนสถานะเดิมได้ภายใน 5 วิ)
// หมวดที่ตั้ง "ถามโน้ตเมื่อติ๊กว่าทำแล้ว" (ตั้งค่า › หมวดหมู่) → toast มีปุ่ม "จดโน้ต" เปิดแผ่นรายละเอียดที่ช่องโน้ต
import type { RailState } from '@/lib/progress';
import type { DayItem, OccStatus } from '@/lib/types';
import { getDay, useActivities } from '@/stores/activities';
import { useSettings } from '@/stores/settings';
import { useUI } from '@/stores/ui';

const short = (s: string) => (s.length > 22 ? `${s.slice(0, 21)}…` : s);

/** คำชมสั้น ๆ ตอนติ๊กว่าทำแล้ว — สุ่มสลับให้ไม่ซ้ำเดิมทุกครั้ง (โทนสุภาพ ไม่หวือหวา) */
const PRAISE = ['เยี่ยมเลย', 'เก่งมาก', 'ทำได้ดี', 'ดีมากเลย', 'อีกก้าวแล้ว'];
const praise = () => PRAISE[Math.floor(Math.random() * PRAISE.length)];

/** รายการของวันนั้นไม่เหลือ "ยังไม่ทำ" แล้ว (ทำแล้ว/ข้ามครบ) — อ่านหลัง setStatus (store อัปเดตทันที) */
const dayComplete = (date: string) => {
  const list = getDay(date).filter((x) => x.ostatus !== 'rescheduled');
  return list.length > 1 && list.every((x) => x.ostatus === 'done' || x.ostatus === 'skipped');
};

export function useToggleStatus(): (it: DayItem, state: RailState) => void {
  const setStatus = useActivities((s) => s.setStatus);
  const showToast = useUI((s) => s.showToast);
  const noteCfg = useSettings((s) => s.noteCfg);
  return (it, state) => {
    if (state === 'rescheduled') return;
    const prev: OccStatus | null = it.ostatus === 'planned' ? null : it.ostatus;
    const undo = { label: 'เลิกทำ', run: () => setStatus(it, prev) };
    if (state === 'done' || state === 'skipped') {
      setStatus(it, null);
      showToast(`“${short(it.title)}” กลับเป็นยังไม่ทำ`, undo);
    } else {
      setStatus(it, 'done');
      // ติ๊กรายการสุดท้ายของวัน → บอกว่าครบแล้ว · นอกนั้นคำชมสั้น ๆ + ชื่อรายการ
      const msg = dayComplete(it.date) ? 'ครบทุกรายการของวันแล้ว เก่งมาก ✓' : `${praise()} ✓ “${short(it.title)}”`;
      if (noteCfg[it.cat].askOnDone) {
        const askNote = { label: 'จดโน้ต', run: () => useUI.getState().openSheet(it.id, it.date, { focusNote: true }) };
        showToast(msg, undo, askNote);
      } else showToast(msg, undo);
    }
  };
}
