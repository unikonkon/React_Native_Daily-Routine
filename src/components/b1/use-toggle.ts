// แตะวงกลมสถานะบนราง → สลับ ทำแล้ว ↔ ยังไม่ทำ พร้อม toast "เลิกทำ" (คืนสถานะเดิมได้ภายใน 5 วิ)
import type { RailState } from '@/lib/progress';
import type { DayItem, OccStatus } from '@/lib/types';
import { useActivities } from '@/stores/activities';
import { useUI } from '@/stores/ui';

const short = (s: string) => (s.length > 22 ? `${s.slice(0, 21)}…` : s);

export function useToggleStatus(): (it: DayItem, state: RailState) => void {
  const setStatus = useActivities((s) => s.setStatus);
  const showToast = useUI((s) => s.showToast);
  return (it, state) => {
    if (state === 'rescheduled') return;
    const prev: OccStatus | null = it.ostatus === 'planned' ? null : it.ostatus;
    const undo = { label: 'เลิกทำ', run: () => setStatus(it, prev) };
    if (state === 'done' || state === 'skipped') {
      setStatus(it, null);
      showToast(`“${short(it.title)}” กลับเป็นยังไม่ทำ`, undo);
    } else {
      setStatus(it, 'done');
      showToast(`บันทึก “${short(it.title)}” ว่าทำแล้ว`, undo);
    }
  };
}
