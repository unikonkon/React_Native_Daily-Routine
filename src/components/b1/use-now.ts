// "ตอนนี้" แบบ reactive — อัปเดตทุกนาที (เส้นตอนนี้ / ค้างบันทึก / ถัดไป เปลี่ยนตามเวลาจริงโดยไม่ต้องแตะจอ)
// เป็น state จริง ไม่เรียก nowRef() ตรง ๆ ตอน render — React Compiler จะ cache ค่าเก่าไว้ถ้าไม่มี dependency
// มุมมองที่ถูกซ่อนไว้ (ชั้นของแท็บวันนี้ — lib/active) ไม่ขยับตามนาที: ประตูปิด = ข้าม · ประตูเปิดอีกครั้ง = รับเวลาปัจจุบันทันที
import { useEffect, useState } from 'react';

import { useGate } from '@/lib/active';
import { nowRef, type NowRef } from '@/lib/progress';

export function useNow(): NowRef {
  const [now, setNow] = useState(nowRef);
  const gate = useGate();
  useEffect(() => {
    const tick = () => {
      if (!gate.active) return;
      const n = nowRef();
      setNow((p) => (p.date === n.date && p.min === n.min ? p : n));
    };
    // ปัดให้ตรงต้นนาที แล้วค่อยทุก 60 วิ
    let iv: ReturnType<typeof setInterval> | null = null;
    const first = setTimeout(() => {
      tick();
      iv = setInterval(tick, 60_000);
    }, 60_000 - (Date.now() % 60_000));
    gate.subs.add(tick);
    return () => {
      clearTimeout(first);
      if (iv) clearInterval(iv);
      gate.subs.delete(tick);
    };
  }, [gate]);
  return now;
}
