import { create } from 'zustand';

import type { DayItem } from '@/lib/types';

/** ปุ่มในตัว toast (เช่น "เลิกทำ") — กดแล้ว toast ปิดเอง */
export interface ToastAction {
  label: string;
  run: () => void;
}

interface UIState {
  toast: string | null;
  toastAction: ToastAction | null;
  /** กิจกรรมที่เปิดอยู่ใน bottom sheet (อ้างด้วย id+date แล้วค่อย derive ใหม่ทุก render) */
  sheet: { id: number; date: string } | null;
  /** แผ่นที่ "พักไว้" ตอนกระโดดไปหน้าอื่น (เช่น เปิดสมุดรายชื่อจากนัดเคส) — กดกลับแล้วเปิดคืน */
  parkedSheet: { id: number; date: string } | null;
  /** นัดที่กำลังเลื่อน (Reschedule Modal) */
  resc: DayItem | null;
  /** วันที่ให้แท็บวันนี้เปิดโชว์ (ตั้งหลังบันทึกกิจกรรม แล้วแท็บวันนี้ consume ทิ้ง) */
  focusDate: string | null;
  /** โหมด "วันที่ว่าง" — แท็บวันนี้ดึงช่วงเวลาว่างออกมาให้แตะเพื่อเพิ่มกิจกรรม */
  freeMode: boolean;
  toggleFreeMode: () => void;
  /** action = ปุ่มในตัว toast (เช่น เลิกทำ) — มีปุ่มแล้วค้างนานขึ้นให้กดทัน */
  showToast: (msg: string, action?: ToastAction) => void;
  hideToast: () => void;
  openSheet: (id: number, date: string) => void;
  closeSheet: () => void;
  /** ปิดแผ่นชั่วคราวแล้วจำไว้ — ใช้ก่อนพาไปหน้าอื่น */
  parkSheet: () => void;
  /** เปิดแผ่นที่พักไว้คืน (ไม่มี = ไม่ทำอะไร) */
  restoreSheet: () => void;
  openResc: (item: DayItem) => void;
  closeResc: () => void;
  setFocusDate: (iso: string | null) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useUI = create<UIState>((set) => ({
  toast: null,
  toastAction: null,
  sheet: null,
  parkedSheet: null,
  resc: null,
  focusDate: null,
  freeMode: false,

  toggleFreeMode: () => set((s) => ({ freeMode: !s.freeMode })),
  showToast: (msg, action) => {
    set({ toast: msg, toastAction: action ?? null });
    if (toastTimer) clearTimeout(toastTimer);
    // หายเอง ~1.9s ตาม prototype · มีปุ่ม (เลิกทำ) ค้าง 5s ให้กดทัน
    toastTimer = setTimeout(() => set({ toast: null, toastAction: null }), action ? 5000 : 1900);
  },
  hideToast: () => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: null, toastAction: null });
  },
  openSheet: (id, date) => set({ sheet: { id, date }, parkedSheet: null }),
  closeSheet: () => set({ sheet: null, parkedSheet: null }),
  parkSheet: () => set((s) => ({ parkedSheet: s.sheet, sheet: null })),
  restoreSheet: () => set((s) => (s.parkedSheet ? { sheet: s.parkedSheet, parkedSheet: null } : {})),
  openResc: (item) => set({ resc: item, sheet: null, parkedSheet: null }),
  closeResc: () => set({ resc: null }),
  setFocusDate: (iso) => set({ focusDate: iso }),
}));
