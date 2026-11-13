// "ประตู" ของชั้นที่ถูกซ่อนในแท็บวันนี้ — มุมมอง วัน/สัปดาห์/เดือน/ปี ที่เปิดแล้วถูกเก็บไว้ (ซ่อน) แทนการทิ้งแล้วสร้างใหม่
// เพื่อให้สลับกลับมาได้ทันที (ดู components/today/keep-alive.tsx) — ชั้นที่ซ่อนอยู่ต้อง "ไม่ทำงาน" ตามข้อมูลที่เปลี่ยน:
//   • useGated: ติดตามค่าจาก store ผ่านประตู — ประตูปิด = ไม่ปลุกคอมโพเนนต์ และคืนค่าชุดเดิม · ประตูเปิดอีกครั้ง = รับค่าปัจจุบันทีเดียว
//   • useNow / useDay / useDayReader ใช้ประตูนี้ให้แล้ว — นอกชั้น (หน้าอื่นทั้งหมด) ประตูเปิดตลอด ทำงานเหมือนเดิมทุกอย่าง
// ตัวประตูเป็น object ตัวเดิมตลอดอายุชั้น (ค่าใน context ไม่เปลี่ยน) — การสลับชั้นจึงไม่ทำให้คอมโพเนนต์ข้างในถูกวาดใหม่
// ถ้าข้อมูลไม่ได้เปลี่ยนระหว่างที่ซ่อนอยู่
// ('use no memo' ในฮุก: พึ่ง useCallback/useRef ตามที่เขียนไว้ตรง ๆ — ไม่ให้ React Compiler จัดการ memo แทน)
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';

export interface Gate {
  /** ชั้นนี้กำลังแสดงอยู่ */
  active: boolean;
  /** จำนวนครั้งที่ชั้นกลับมาแสดง — ใช้บอกว่า "การวาดรอบนี้คือการรับค่าหลังกลับมา" (ดู useResumed) */
  tick: number;
  /** เรียกเมื่อชั้นกลับมาแสดง */
  subs: Set<() => void>;
}

export const createGate = (active: boolean): Gate => ({ active, tick: 0, subs: new Set() });

/** ประตูของส่วนที่ไม่ได้อยู่ในชั้นใด — เปิดตลอด */
const ROOT = createGate(true);
export const GateCtx = createContext<Gate>(ROOT);
export const useGate = () => useContext(GateCtx);

/** เปิด/ปิดประตู — เปิด = แจ้งทุกตัวที่รออยู่ให้รับค่าปัจจุบัน */
export function setGate(gate: Gate, active: boolean) {
  if (gate.active === active) return;
  gate.active = active;
  if (!active) return;
  gate.tick++;
  for (const f of [...gate.subs]) f();
}

/**
 * ค่าจาก store ภายนอก (subscribe + get) ผ่านประตูของชั้น
 * get ต้องเป็นฟังก์ชันตัวเดิมเสมอ (ประกาศระดับไฟล์) และคืนค่าที่ไม่สร้างใหม่ทุกครั้ง
 */
export function useGated<T>(subscribe: (cb: () => void) => () => void, get: () => T): T {
  'use no memo';
  const gate = useContext(GateCtx);
  const kept = useRef<{ v: T } | null>(null);
  const sub = useCallback(
    (cb: () => void) => {
      const un = subscribe(() => {
        if (gate.active) cb();
      });
      gate.subs.add(cb);
      return () => {
        un();
        gate.subs.delete(cb);
      };
    },
    [subscribe, gate],
  );
  const snap = useCallback(() => {
    if (gate.active || !kept.current) kept.current = { v: get() };
    return kept.current.v;
  }, [gate, get]);
  return useSyncExternalStore(sub, snap, snap);
}

/**
 * true เฉพาะการวาดรอบแรกหลังชั้นกลับมาแสดง — ใช้กันแอนิเมชัน "เพิ่งเกิดขึ้น" (เช่น ติ๊กทำแล้ว) ไม่ให้เล่นกับการเปลี่ยนแปลง
 * ที่เกิดตอนชั้นถูกซ่อน (ไปติ๊กจากมุมมองอื่นแล้วกลับมา)
 */
export function useResumed(): boolean {
  'use no memo';
  const gate = useContext(GateCtx);
  const [tick, setTick] = useState(gate.tick);
  useEffect(() => {
    const f = () => setTick(gate.tick);
    gate.subs.add(f);
    return () => {
      gate.subs.delete(f);
    };
  }, [gate]);
  const [handled, setHandled] = useState(tick);
  if (handled !== tick) {
    setHandled(tick);
    return true;
  }
  return false;
}
