// แตะวงกลมสถานะบนราง → สลับ ทำแล้ว ↔ ยังไม่ทำ พร้อม toast "เลิกทำ" (คืนสถานะเดิมได้ภายใน 5 วิ)
// หมวดที่ตั้ง "ถามโน้ตเมื่อติ๊กว่าทำแล้ว" (ตั้งค่า › หมวดหมู่) → toast มีปุ่ม "จดโน้ต" เปิดแผ่นรายละเอียดที่ช่องโน้ต
import type { RailState } from '@/lib/progress';
import type { DayItem, OccStatus } from '@/lib/types';
import { useActivities } from '@/stores/activities';
import { useSettings } from '@/stores/settings';
import { useUI } from '@/stores/ui';

const short = (s: string) => (s.length > 22 ? `${s.slice(0, 21)}…` : s);

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
      if (noteCfg[it.cat].askOnDone) {
        const askNote = { label: 'จดโน้ต', run: () => useUI.getState().openSheet(it.id, it.date, { focusNote: true }) };
        showToast(`ทำแล้ว ✓ “${short(it.title)}”`, undo, askNote);
      } else showToast(`บันทึก “${short(it.title)}” ว่าทำแล้ว`, undo);
    }
  };
}
