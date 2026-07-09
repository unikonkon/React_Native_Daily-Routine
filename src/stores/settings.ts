import { create } from 'zustand';

import type { ThemeName } from '@/constants/theme';
import * as db from '@/lib/db';

interface SettingsState {
  theme: ThemeName;
  notifMaster: boolean;
  morning: boolean;
  boot: () => Promise<void>;
  setTheme: (t: ThemeName) => void;
  toggleTheme: () => void;
  setNotifMaster: (v: boolean) => void;
  setMorning: (v: boolean) => void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  theme: 'light',
  notifMaster: true,
  morning: true,

  boot: async () => {
    const s = await db.loadSettings();
    set({
      theme: (s.theme as ThemeName) ?? 'light',
      notifMaster: s.notif_master !== '0',
      morning: s.morning_summary !== '0',
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
}));
