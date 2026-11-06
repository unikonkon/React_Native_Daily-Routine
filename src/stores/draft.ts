// ฟอร์มเพิ่ม/แก้ไขกิจกรรม (วิซาร์ด 2 ขั้น — APP_STRUCTURE.md §4)
// ใช้เป็น draft ล้วน ๆ ไม่แตะ SQLite จนกดบันทึก (หน้า add.tsx เป็นคนเรียก activities.add/update)

import { create } from 'zustand';

import { LEGACY_SUB, type CatId, type PriorityId } from '@/constants/theme';
import { daysBetween, todayISO } from '@/lib/dates';
import { computeDates, seriesDates, suggestStart } from '@/lib/engine';
import { nowRef } from '@/lib/progress';
import { HORIZON_DAYS, type Activity, type Channel, type EditScope, type Horizon, type InlineContact, type RepeatRule } from '@/lib/types';
import { getDay } from '@/stores/activities';

/** ความยาวตั้งต้นของกิจกรรมใหม่ */
const DEFAULT_DUR = 60;

/** เวลาตั้งต้นของร่างใหม่ในวันนั้น — ช่วงว่าง 1 ชม. แรกหลังตอนนี้ · ไม่มี = เวลาปัจจุบัน */
function defaultTime(date: string): { start: number; end: number } {
  const start = suggestStart(getDay(date), date, nowRef(), DEFAULT_DUR);
  return { start, end: start + DEFAULT_DUR };
}

/** นัดเคส: 'people' = เลือกคนจากสมุดรายชื่อ (+ ระดับความสำคัญ) · 'inline' = กรอกช่องทางติดต่อของนัดนี้เอง (ไม่มีระดับ) */
export type ContactMode = 'people' | 'inline';

export const EMPTY_INLINE: InlineContact = { name: '', org: null, phone: null, line: null, email: null, zoom: null, googlemeet: null, note: null };

/** ช่องทางที่กรอกไว้ ตัดช่องว่างหัวท้าย — ไม่ได้กรอกอะไรเลย = null (นัดนี้ไม่มีข้อมูลติดต่อ) */
export function cleanInline(c: InlineContact): InlineContact | null {
  const v = (x: string | null) => x?.trim() || null;
  const out: InlineContact = { name: c.name.trim(), org: v(c.org), phone: v(c.phone), line: v(c.line), email: v(c.email), zoom: v(c.zoom), googlemeet: v(c.googlemeet), note: v(c.note) };
  return Object.values(out).some(Boolean) ? out : null;
}

/** วันสิ้นสุดเดิมของชุดที่กำลังแก้ไข — คงไว้จนกว่าผู้ใช้จะเลือก "ระยะเวลาที่ลง" ใหม่เอง (null ข้างใน = ไม่มีวันสิ้นสุด) */
export interface KeepEnd {
  endDate: string | null;
}

interface DraftState {
  editId: number | null; // โหมดแก้ไข
  /** วันของ occurrence ที่เปิดแก้ไข (จากแผ่นรายละเอียด) — ใช้กับขอบเขต "เฉพาะครั้งนี้/ตั้งแต่ครั้งนี้" */
  editDate: string | null;
  /** ขอบเขตการแก้ไขชุดทำซ้ำ */
  scope: EditScope;
  keepEnd: KeepEnd | null;
  cat: CatId | null;
  title: string;
  loc: string;
  sub: string;
  channel: Channel;
  priority: PriorityId;
  contactIds: number[];
  /** สลับโหมดแล้วข้อมูลของอีกโหมดยังอยู่ในร่าง — ตอนบันทึกใช้เฉพาะโหมดที่เลือก */
  contactMode: ContactMode;
  inline: InlineContact;
  start: number;
  end: number;
  repeat: RepeatRule;
  horizon: Horizon;
  dates: string[];
  notify: boolean;
  before: number;
  /** วัน/เวลาถูกเลือกมาแล้ว (แตะช่วงว่างในหน้าวันนี้) — เปิดแท็บเพิ่มแล้วไม่ตั้งเวลาตั้งต้นทับ */
  pinned: boolean;
  /** นับครั้งที่ "โหลด draft ชุดใหม่" (reset / loadActivity / loadSlot) — ฟอร์มใช้ซิงก์ state ภายในของตัวเอง */
  loadRev: number;

  set: (p: Partial<DraftState>) => void;
  setRepeat: (r: RepeatRule) => void;
  setHorizon: (h: Horizon) => void;
  toggleDate: (iso: string) => void;
  /** ล้างเฉพาะขั้น "วันที่และการทำซ้ำ" — กลับไปวันนี้วันเดียว (ข้อมูลอื่นในฟอร์มคงไว้) */
  resetDates: () => void;
  /** ร่างใหม่ (ล้างทุกอย่าง) — date = วันที่จะลง (ไม่ส่ง = วันนี้) · ตั้งเวลาเป็นช่วงว่าง 1 ชม. แรกหลังตอนนี้ */
  reset: (date?: string) => void;
  /** ร่างยังว่าง (ยังไม่เลือกหมวด/ใส่ชื่อ) — ตั้งเวลาตั้งต้นใหม่ให้ตรงกับตอนนี้ (เปิดแท็บเพิ่มหลังทิ้งไว้นาน) */
  refreshDefaultTime: () => void;
  /** date = วันของ occurrence ที่เปิดแก้ไข (ไม่ส่ง = แก้ทั้งชุด) */
  loadActivity: (a: Activity, date?: string) => void;
  loadSlot: (date: string, start: number, end: number) => void;
}

const initial = {
  editId: null,
  editDate: null as string | null,
  scope: 'all' as EditScope,
  keepEnd: null as KeepEnd | null,
  cat: null,
  title: '',
  loc: '',
  sub: '',
  channel: 'online' as Channel,
  priority: 'P1' as PriorityId,
  contactIds: [] as number[],
  contactMode: 'people' as ContactMode,
  inline: EMPTY_INLINE,
  start: 1110, // 18:30
  end: 1170, // 19:30
  repeat: 'none' as RepeatRule,
  horizon: '1m' as Horizon,
  notify: false, // ค่าเริ่มต้น: ปิดแจ้งเตือน — เปิดเองเมื่อกิจกรรมนั้นต้องการจริง ๆ
  before: 30,
  pinned: false,
};

export const useDraft = create<DraftState>((set, get) => ({
  ...initial,
  dates: [todayISO()],
  ...defaultTime(todayISO()), // ตอนเปิดแอปข้อมูลยังไม่โหลด — แท็บเพิ่มคำนวณใหม่ทุกครั้งที่เปิด (refreshDefaultTime)
  loadRev: 0, // อยู่นอก initial — การ set({ ...initial }) จึงไม่รีเซ็ตตัวนับกลับเป็น 0

  set: (p) => set(p),

  setRepeat: (repeat) => {
    const anchor = get().dates[0] ?? todayISO();
    // 'custom' = ผู้ใช้เลือกวันเองบนปฏิทิน → คงวันที่เลือกไว้ ไม่คำนวณใหม่
    // แก้ไขชุดเดิม: เปลี่ยนกฎแล้วยังจบวันเดิม (keepEnd) จนกว่าจะเลือกระยะเวลาใหม่เอง
    const keep = get().keepEnd;
    const dates = repeat === 'custom' ? get().dates : computeDates(repeat, get().horizon, anchor, keep ? keep.endDate : undefined);
    set({ repeat, dates: dates.length ? dates : [anchor] });
  },

  setHorizon: (horizon) => {
    const anchor = get().dates[0] ?? todayISO();
    const dates = computeDates(get().repeat, horizon, anchor);
    set({ horizon, keepEnd: null, dates: dates.length ? dates : [anchor] }); // เลือกระยะเวลาเอง → เลิกใช้วันสิ้นสุดเดิม
  },

  toggleDate: (iso) => {
    const has = get().dates.includes(iso);
    const dates = has ? get().dates.filter((d) => d !== iso) : [...get().dates, iso].sort();
    // แตะแก้ปฏิทินเอง → กลายเป็น "เลือกเอง" (ตาม prototype)
    set({ dates: dates.length ? dates : [todayISO()], repeat: dates.length > 1 ? 'custom' : get().repeat === 'none' ? 'none' : 'custom' });
  },

  resetDates: () => set({ dates: [todayISO()], repeat: initial.repeat, horizon: initial.horizon, keepEnd: null }),

  reset: (date) => {
    const d = date ?? todayISO();
    set((s) => ({ ...initial, dates: [d], ...defaultTime(d), loadRev: s.loadRev + 1 }));
  },

  refreshDefaultTime: () => {
    const s = get();
    if (s.editId || s.pinned || s.cat || s.title.trim()) return; // แก้ไข / มาจากช่วงว่าง / เริ่มกรอกแล้ว — ไม่ทับเวลาที่ตั้งไว้
    const t = defaultTime(s.dates[0] ?? todayISO());
    if (t.start !== s.start || t.end !== s.end) set(t);
  },

  loadActivity: (a, date) => {
    // โหมดแก้ไข: เริ่มจากวันแรกของ series และ "คงช่วงเดิม" ไว้ — เดิมโหลดด้วย horizon 1 เดือนตายตัว
    // ทำให้แค่แก้ชื่อ ชุด 1 ปีก็ถูกตัดเหลือ 30 วัน และชุด "เลือกเอง" เหลือวันเดียว
    const computed = a.repeat !== 'none' && a.repeat !== 'custom';
    // ช่วงเดิมตรงกับชิประยะเวลาพอดี → ติดชิปนั้น · ไม่ตรง (นำเข้า/ไม่มีวันจบ) → คงวันสิ้นสุดเดิมไว้ตรง ๆ
    const span = a.endDate ? daysBetween(a.startDate, a.endDate) + 1 : -1;
    const horizon = (Object.keys(HORIZON_DAYS) as Horizon[]).find((h) => HORIZON_DAYS[h] === span);
    const keepEnd = computed && !horizon ? { endDate: a.endDate } : null;
    const repeating = a.repeat !== 'none';
    set((s) => ({
      ...initial,
      loadRev: s.loadRev + 1,
      editId: a.id,
      editDate: date ?? null,
      // เปิดจากวันกลางชุด → ค่าเริ่มต้น "ตั้งแต่ครั้งนี้" (ไม่แตะประวัติ) · เปิดจากวันแรก/ไม่ใช่ชุด → ทั้งชุด
      scope: repeating && date && date > a.startDate ? 'future' : 'all',
      keepEnd,
      horizon: horizon ?? initial.horizon,
      cat: a.cat,
      title: a.title,
      loc: a.loc ?? '',
      // ข้อมูลรุ่นเก่าเก็บ sub เป็นรหัส (weight/book/…) — แปลงเป็นข้อความ ชิปตัวเลือกจะได้ติดสถานะถูก
      sub: LEGACY_SUB[a.sub ?? ''] ?? a.sub ?? '',
      channel: a.channel ?? 'online',
      priority: a.priority ?? 'P1',
      contactIds: a.contactIds,
      contactMode: a.inlineContact ? 'inline' : 'people',
      inline: a.inlineContact ?? EMPTY_INLINE,
      start: a.startMin,
      end: a.endMin,
      repeat: a.repeat,
      dates: computed ? computeDates(a.repeat, horizon ?? initial.horizon, a.startDate, keepEnd ? keepEnd.endDate : undefined) : seriesDates(a),
      notify: a.notify,
      before: a.notifyBefore,
    }));
  },

  loadSlot: (date, start, end) => {
    set((s) => ({ ...initial, dates: [date], start, end, pinned: true, loadRev: s.loadRev + 1 }));
  },
}));
