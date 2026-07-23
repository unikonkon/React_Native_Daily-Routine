import { create } from 'zustand';

import type { DayItem } from '@/lib/types';

interface UIState {
  toast: string | null;
  /** กิจกรรมที่เปิดอยู่ใน bottom sheet (อ้างด้วย id+date แล้วค่อย derive ใหม่ทุก render) */
  sheet: { id: number; date: string } | null;
  /** นัดที่กำลังเลื่อน (Reschedule Modal) */
  resc: DayItem | null;
  /** วันที่ให้แท็บวันนี้เปิดโชว์ (ตั้งหลังบันทึกกิจกรรม แล้วแท็บวันนี้ consume ทิ้ง) */
  focusDate: string | null;
  /** โหมด "วันที่ว่าง" — แท็บวันนี้ดึงช่วงเวลาว่างออกมาให้แตะเพื่อเพิ่มกิจกรรม */
  freeMode: boolean;
  toggleFreeMode: () => void;
  showToast: (msg: string) => void;
  openSheet: (id: number, date: string) => void;
  closeSheet: () => void;
  openResc: (item: DayItem) => void;
  closeResc: () => void;
  setFocusDate: (iso: string | null) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useUI = create<UIState>((set) => ({
  toast: null,
  sheet: null,
  resc: null,
  focusDate: null,
  freeMode: false,

  toggleFreeMode: () => set((s) => ({ freeMode: !s.freeMode })),
  showToast: (msg) => {
    set({ toast: msg });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 1900); // หายเอง ~1.9s ตาม prototype
  },
  openSheet: (id, date) => set({ sheet: { id, date } }),
  closeSheet: () => set({ sheet: null }),
  openResc: (item) => set({ resc: item, sheet: null }),
  closeResc: () => set({ resc: null }),
  setFocusDate: (iso) => set({ focusDate: iso }),
}));
