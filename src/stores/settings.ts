import { create } from 'zustand';

import { CAT_OPTIONS, CATS, NOTE_DEFAULTS, QUICK_PICKS, type CatId, type NoteCfg, type ThemePref } from '@/constants/theme';
import * as db from '@/lib/db';

/** ตัวเลือกย่อยเริ่มต้นของทุกหมวด (หมวดที่ไม่มีชุดตัวเลือก = ลิสต์ว่าง) */
const DEFAULT_CAT_OPTIONS = Object.fromEntries(CATS.map((c) => [c.id, CAT_OPTIONS[c.id]?.defaults ?? []])) as Record<CatId, string[]>;

/**
 * โน้ตสำเร็จรูป (ตั้งค่า › จัดการโน้ต) — ข้อความที่ใช้บ่อย แตะชิปในแผ่นรายละเอียดเพื่อแทรกลงโน้ตของครั้งนั้น
 * เป็นแค่ต้นแบบ: แทรกแล้วกลายเป็นข้อความของโน้ตครั้งนั้นเอง — แก้/ลบในคลังไม่กระทบโน้ตที่จดไปแล้ว
 */
export interface NoteSnippet {
  id: string;
  text: string;
  /** หมวดที่ให้ชิปขึ้น ([] = ทุกหมวด) */
  cats: CatId[];
  /** จำนวนครั้งที่แตะใช้ — เรียงชิปที่ใช้บ่อยไว้หน้า */
  uses: number;
  /** ปักหมุด = ขึ้นก่อนเสมอ (เรียงตามลำดับในคลัง เลื่อน ↑↓ ได้) */
  pinned: boolean;
  /** ซ่อน = ไม่ขึ้นเป็นชิป แต่ยังอยู่ในคลัง */
  hidden: boolean;
}

/** การแสดงโน้ต (ตั้งค่า › จัดการโน้ต) — จุดที่แสดง + จำนวนที่แสดง */
export interface NoteDisplay {
  /** โน้ตบนการ์ดรายการ (หน้าวัน · การ์ดวันในเดือน · ทบทวน) */
  rail: boolean;
  /** จำนวนบรรทัดโน้ตบนการ์ด 1–7 */
  railLines: number;
  /** โน้ตครั้งก่อนในแผ่นรายละเอียด 0–5 (0 = ไม่แสดง) */
  prevCount: number;
  /** ชิปโน้ตสำเร็จรูปในแผ่นรายละเอียด 0–12 (0 = ไม่แสดง · ที่เหลือกด "ทั้งหมด") */
  chips: number;
  /** ช่องโน้ตในฟอร์มเพิ่ม/แก้ไขรายการ (ขั้น ① หมวดและรายละเอียด) */
  form: boolean;
  /** ชิปโน้ตสำเร็จรูปในฟอร์มเพิ่ม/แก้ไข 0–12 */
  formChips: number;
  /** ตาราง/คอลัมน์โน้ตในรายงาน · Excel · CSV · Google Sheets */
  report: boolean;
  /** แนบโน้ตครั้งก่อนของนัดวันนี้ในแจ้งเตือนสรุปตอนเช้า */
  morning: boolean;
}

export const NOTE_DISPLAY_DEFAULTS: NoteDisplay = { rail: true, railLines: 2, prevCount: 1, chips: 4, form: true, formChips: 6, report: true, morning: false };
export const NOTE_LIMITS = { railLines: [1, 7], prevCount: [0, 5], chips: [0, 12], formChips: [0, 12] } as const;

interface SettingsState {
  /** โหมดแสดงผลที่เลือก — ใช้ useThemeName() (components/ui) เพื่อได้ธีมที่ใช้จริง */
  theme: ThemePref;
  notifMaster: boolean;
  morning: boolean;
  /** quick-pick chips ต่อหมวด — เริ่มจาก QUICK_PICKS แก้ไขได้ใน settings/categories */
  quickPicks: Record<CatId, string[]>;
  /** ตัวเลือกย่อยต่อหมวด (สถานที่/ประเภท/สื่อ) — เริ่มจาก CAT_OPTIONS แก้ไขได้ใน settings/categories */
  catOptions: Record<CatId, string[]>;
  /** โน้ตรายครั้งต่อหมวด (ข้อความตัวอย่าง / แม่แบบ / ถามโน้ตเมื่อติ๊กว่าทำแล้ว) — แก้ไขได้ใน settings/categories */
  noteCfg: Record<CatId, NoteCfg>;
  noteSnippets: NoteSnippet[];
  noteDisplay: NoteDisplay;
  /** URL ของ Google Apps Script Web App ที่ใช้งานอยู่ ('' = ยังไม่เชื่อมต่อ) */
  sheetsUrl: string;
  /** รายการ URL ที่เคยบันทึก ใหม่ → เก่า (สูงสุด 5, ไม่ซ้ำ) — คงอยู่แม้ยกเลิกการเชื่อมต่อ ไว้สลับ/เชื่อมต่อใหม่ */
  sheetsUrls: string[];
  boot: () => Promise<void>;
  setTheme: (t: ThemePref) => void;
  setNotifMaster: (v: boolean) => void;
  setMorning: (v: boolean) => void;
  setQuickPicks: (cat: CatId, list: string[]) => void;
  setCatOptions: (cat: CatId, list: string[]) => void;
  setNoteCfg: (cat: CatId, patch: Partial<NoteCfg>) => void;
  addSnippet: (text: string, cats: CatId[]) => void;
  updateSnippet: (id: string, patch: Partial<Pick<NoteSnippet, 'text' | 'cats' | 'pinned' | 'hidden'>>) => void;
  /** เลื่อนลำดับโน้ตที่ปักหมุด (สลับกับตัวปักหมุดถัดไปทางขึ้น/ลง) */
  moveSnippet: (id: string, dir: -1 | 1) => void;
  removeSnippet: (id: string) => void;
  /** นับการใช้ชิป (ไว้เรียงที่ใช้บ่อยก่อน) */
  countSnippet: (id: string) => void;
  setNoteDisplay: (patch: Partial<NoteDisplay>) => void;
  setSheetsUrl: (url: string) => void;
  removeSheetsUrl: (url: string) => void;
}

/** อ่านรายการ URL ที่บันทึกไว้ — รองรับข้อมูลรุ่นเก่า (sheets_url_last ตัวเดียว) */
function parseSheetsUrls(s: Record<string, string>): string[] {
  try {
    const arr = s.sheets_urls ? (JSON.parse(s.sheets_urls) as unknown) : null;
    if (Array.isArray(arr)) return arr.filter((x): x is string => typeof x === 'string' && !!x).slice(0, 5);
  } catch {
    // ตกไปใช้ค่ารุ่นเก่าด้านล่าง
  }
  const legacy = s.sheets_url_last || s.sheets_url;
  return legacy ? [legacy] : [];
}

/** อ่านลิสต์ต่อหมวดที่บันทึกเป็น JSON — หมวดไหนไม่มี/ผิดรูปใช้ค่าเริ่มต้นของหมวดนั้น */
function parseCatLists(raw: string | undefined, fallback: Record<CatId, string[]>): Record<CatId, string[]> {
  try {
    const saved = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    if (!saved || typeof saved !== 'object') return fallback;
    return Object.fromEntries(
      (Object.keys(fallback) as CatId[]).map((k) => {
        const v = saved[k];
        return [k, Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : fallback[k]];
      }),
    ) as Record<CatId, string[]>;
  } catch {
    return fallback;
  }
}

/** ค่าโน้ตต่อหมวดที่บันทึกเป็น JSON — ช่องไหนไม่มี/ผิดชนิดใช้ค่าเริ่มต้นของหมวดนั้น */
function parseNoteCfg(raw: string | undefined): Record<CatId, NoteCfg> {
  let saved: Record<string, Partial<NoteCfg>> = {};
  try {
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    if (v && typeof v === 'object') saved = v as Record<string, Partial<NoteCfg>>;
  } catch {
    // ใช้ค่าเริ่มต้นทั้งหมด
  }
  return Object.fromEntries(
    CATS.map((c) => {
      const d = NOTE_DEFAULTS[c.id];
      const x = saved[c.id] ?? {};
      return [
        c.id,
        {
          hint: typeof x.hint === 'string' ? x.hint : d.hint,
          template: typeof x.template === 'string' ? x.template : d.template,
          askOnDone: typeof x.askOnDone === 'boolean' ? x.askOnDone : d.askOnDone,
        },
      ];
    }),
  ) as Record<CatId, NoteCfg>;
}

const CAT_IDS = new Set<string>(CATS.map((c) => c.id));

/** คลังโน้ตสำเร็จรูปที่บันทึกเป็น JSON — ตัดรายการผิดรูป/ข้อความว่างทิ้ง */
function parseSnippets(raw: string | undefined): NoteSnippet[] {
  try {
    const arr = raw ? (JSON.parse(raw) as unknown) : null;
    if (!Array.isArray(arr)) return [];
    return arr.flatMap((x, i): NoteSnippet[] => {
      if (!x || typeof x !== 'object') return [];
      const o = x as Record<string, unknown>;
      const text = typeof o.text === 'string' ? o.text.trim() : '';
      if (!text) return [];
      return [
        {
          id: typeof o.id === 'string' && o.id ? o.id : `s${i}`,
          text,
          cats: Array.isArray(o.cats) ? o.cats.filter((c): c is CatId => typeof c === 'string' && CAT_IDS.has(c)) : [],
          uses: typeof o.uses === 'number' && o.uses > 0 ? Math.floor(o.uses) : 0,
          pinned: o.pinned === true,
          hidden: o.hidden === true,
        },
      ];
    });
  } catch {
    return [];
  }
}

const clampInt = (v: unknown, [lo, hi]: readonly [number, number], d: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d;

/** การแสดงโน้ตที่บันทึกเป็น JSON — ช่องไหนไม่มี/ผิดชนิดใช้ค่าเริ่มต้น · ตัวเลขถูกบีบให้อยู่ในช่วง */
function parseNoteDisplay(raw: string | undefined): NoteDisplay {
  let v: Record<string, unknown> = {};
  try {
    const o = raw ? (JSON.parse(raw) as unknown) : null;
    if (o && typeof o === 'object') v = o as Record<string, unknown>;
  } catch {
    // ใช้ค่าเริ่มต้นทั้งหมด
  }
  const d = NOTE_DISPLAY_DEFAULTS;
  const bool = (k: 'rail' | 'form' | 'report' | 'morning') => (typeof v[k] === 'boolean' ? (v[k] as boolean) : d[k]);
  return {
    rail: bool('rail'),
    railLines: clampInt(v.railLines, NOTE_LIMITS.railLines, d.railLines),
    prevCount: clampInt(v.prevCount, NOTE_LIMITS.prevCount, d.prevCount),
    chips: clampInt(v.chips, NOTE_LIMITS.chips, d.chips),
    form: bool('form'),
    formChips: clampInt(v.formChips, NOTE_LIMITS.formChips, d.formChips),
    report: bool('report'),
    morning: bool('morning'),
  };
}

export const useSettings = create<SettingsState>((set, get) => {
  const saveSnippets = (noteSnippets: NoteSnippet[]) => {
    set({ noteSnippets });
    db.saveSetting('note_snippets', JSON.stringify(noteSnippets));
  };
  return {
  theme: 'system',
  notifMaster: true,
  morning: true,
  quickPicks: QUICK_PICKS,
  catOptions: DEFAULT_CAT_OPTIONS,
  noteCfg: NOTE_DEFAULTS,
  noteSnippets: [],
  noteDisplay: NOTE_DISPLAY_DEFAULTS,
  sheetsUrl: '',
  sheetsUrls: [],

  boot: async () => {
    const s = await db.loadSettings();
    set({
      // ยังไม่เคยเลือก = ตามระบบ · ค่าเดิมที่บันทึกไว้ (light/dark) คงไว้ตามที่ผู้ใช้เคยเลือก
      theme: s.theme === 'light' || s.theme === 'dark' || s.theme === 'system' ? s.theme : 'system',
      notifMaster: s.notif_master !== '0',
      morning: s.morning_summary !== '0',
      quickPicks: parseCatLists(s.quick_picks, QUICK_PICKS),
      catOptions: parseCatLists(s.cat_options, DEFAULT_CAT_OPTIONS),
      noteCfg: parseNoteCfg(s.note_cfg),
      noteSnippets: parseSnippets(s.note_snippets),
      noteDisplay: parseNoteDisplay(s.note_display),
      sheetsUrl: s.sheets_url ?? '',
      sheetsUrls: parseSheetsUrls(s),
    });
  },

  setTheme: (theme) => {
    set({ theme });
    db.saveSetting('theme', theme);
  },
  setNotifMaster: (v) => {
    set({ notifMaster: v });
    db.saveSetting('notif_master', v ? '1' : '0');
  },
  setMorning: (v) => {
    set({ morning: v });
    db.saveSetting('morning_summary', v ? '1' : '0');
  },
  setQuickPicks: (cat, list) => {
    const quickPicks = { ...get().quickPicks, [cat]: list };
    set({ quickPicks });
    db.saveSetting('quick_picks', JSON.stringify(quickPicks));
  },
  setCatOptions: (cat, list) => {
    const catOptions = { ...get().catOptions, [cat]: list };
    set({ catOptions });
    db.saveSetting('cat_options', JSON.stringify(catOptions));
  },
  setNoteCfg: (cat, patch) => {
    const noteCfg = { ...get().noteCfg, [cat]: { ...get().noteCfg[cat], ...patch } };
    set({ noteCfg });
    db.saveSetting('note_cfg', JSON.stringify(noteCfg));
  },
  addSnippet: (text, cats) => {
    const t = text.trim();
    if (!t) return;
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    saveSnippets([{ id, text: t, cats, uses: 0, pinned: false, hidden: false }, ...get().noteSnippets]);
  },
  updateSnippet: (id, patch) => {
    const text = patch.text?.trim();
    if (patch.text !== undefined && !text) return;
    const list = get().noteSnippets;
    const cur = list.find((x) => x.id === id);
    if (!cur) return;
    const next = { ...cur, ...patch, ...(text ? { text } : {}) };
    const rest = list.filter((x) => x.id !== id);
    if (patch.pinned && !cur.pinned) {
      // ปักหมุดใหม่ → ต่อท้ายกลุ่มที่ปักหมุดอยู่แล้ว (ไม่แซงลำดับที่จัดไว้)
      const at = rest.reduce((last, x, i) => (x.pinned ? i + 1 : last), 0);
      saveSnippets([...rest.slice(0, at), next, ...rest.slice(at)]);
    } else saveSnippets(list.map((x) => (x.id === id ? next : x)));
  },
  moveSnippet: (id, dir) => {
    const list = [...get().noteSnippets];
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return;
    // หาตัวปักหมุดถัดไปตามทิศ แล้วสลับตำแหน่ง (ตัวที่ไม่ปักหมุดไม่มีผลกับลำดับชิป)
    let j = i + dir;
    while (j >= 0 && j < list.length && !list[j].pinned) j += dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    saveSnippets(list);
  },
  removeSnippet: (id) => saveSnippets(get().noteSnippets.filter((x) => x.id !== id)),
  countSnippet: (id) => saveSnippets(get().noteSnippets.map((x) => (x.id === id ? { ...x, uses: x.uses + 1 } : x))),
  setNoteDisplay: (patch) => {
    const noteDisplay = parseNoteDisplay(JSON.stringify({ ...get().noteDisplay, ...patch }));
    set({ noteDisplay });
    db.saveSetting('note_display', JSON.stringify(noteDisplay));
  },
  setSheetsUrl: (sheetsUrl) => {
    set({ sheetsUrl });
    db.saveSetting('sheets_url', sheetsUrl);
    // เก็บเข้ารายการ (ใหม่สุดอยู่บน ไม่ซ้ำ สูงสุด 5) — ยกเลิกเชื่อมต่อ (ตั้ง '') ไม่แตะรายการ
    if (sheetsUrl) {
      const sheetsUrls = [sheetsUrl, ...get().sheetsUrls.filter((u) => u !== sheetsUrl)].slice(0, 5);
      set({ sheetsUrls });
      db.saveSetting('sheets_urls', JSON.stringify(sheetsUrls));
    }
  },
  removeSheetsUrl: (url) => {
    const sheetsUrls = get().sheetsUrls.filter((u) => u !== url);
    set({ sheetsUrls });
    db.saveSetting('sheets_urls', JSON.stringify(sheetsUrls));
  },
  };
});
