import { create } from 'zustand';

import { QUICK_PICKS, type CatId, type ThemeName } from '@/constants/theme';
import * as db from '@/lib/db';

interface SettingsState {
  theme: ThemeName;
  notifMaster: boolean;
  morning: boolean;
  /** quick-pick chips ต่อหมวด — เริ่มจาก QUICK_PICKS แก้ไขได้ใน settings/categories */
  quickPicks: Record<CatId, string[]>;
  /** URL ของ Google Apps Script Web App สำหรับส่งขึ้น Sheets ('' = ยังไม่เชื่อมต่อ) */
  sheetsUrl: string;
  boot: () => Promise<void>;
  setTheme: (t: ThemeName) => void;
  toggleTheme: () => void;
  setNotifMaster: (v: boolean) => void;
  setMorning: (v: boolean) => void;
  setQuickPicks: (cat: CatId, list: string[]) => void;
  setSheetsUrl: (url: string) => void;
}

/** อ่านค่า quick_picks ที่บันทึกไว้ — หมวดไหนไม่มี/ผิดรูปใช้ค่าเริ่มต้น */
function parseQuickPicks(raw: string | undefined): Record<CatId, string[]> {
  try {
    const saved = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    if (!saved || typeof saved !== 'object') return QUICK_PICKS;
    return Object.fromEntries(
      (Object.keys(QUICK_PICKS) as CatId[]).map((k) => {
        const v = saved[k];
        return [k, Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : QUICK_PICKS[k]];
      }),
    ) as Record<CatId, string[]>;
  } catch {
    return QUICK_PICKS;
  }
}

export const useSettings = create<SettingsState>((set, get) => ({
  theme: 'light',
  notifMaster: true,
  morning: true,
  quickPicks: QUICK_PICKS,
  sheetsUrl: '',

  boot: async () => {
    const s = await db.loadSettings();
    set({
      theme: (s.theme as ThemeName) ?? 'light',
      notifMaster: s.notif_master !== '0',
      morning: s.morning_summary !== '0',
      quickPicks: parseQuickPicks(s.quick_picks),
      sheetsUrl: s.sheets_url ?? '',
    });
  },

  setTheme: (theme) => {
    set({ theme });
    db.saveSetting('theme', theme);
  },
  toggleTheme: () => get().setTheme(get().theme === 'light' ? 'dark' : 'light'),
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
  setSheetsUrl: (sheetsUrl) => {
    set({ sheetsUrl });
    db.saveSetting('sheets_url', sheetsUrl);
  },
}));
