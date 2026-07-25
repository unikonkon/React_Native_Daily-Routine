import { create } from 'zustand';

import * as db from '@/lib/db';
import type { Contact } from '@/lib/types';

// ---------- ประกอบลิงก์ประชุมออนไลน์จากค่าที่ผู้ใช้กรอก (รองรับ 2 กรณี: ลิงก์เต็ม / Meeting ID) ----------

const hasScheme = (s: string) => /^[a-z][a-z0-9+.-]*:\/\//i.test(s);

/**
 * Zoom → deep link เปิดแอป (zoommtg://)
 *  • ลิงก์เต็ม zoom.us/j/{id}(?pwd=...) → ดึง meeting id (+ รหัสผ่าน) มาประกอบ zoommtg://
 *  • Meeting ID ล้วน (มีเว้นวรรค/ขีดได้ เช่น "123 4567 8901") → เอาเฉพาะตัวเลขมาประกอบ
 *  • ลิงก์ที่มี scheme อื่นอยู่แล้ว → คืนตามเดิม
 */
export function zoomDeepLink(raw: string): string {
  const s = raw.trim();
  const m = s.match(/zoom\.us\/(?:j|s|w|my)\/([^/?#]+)/i);
  if (m) {
    const confno = m[1].replace(/\D/g, '');
    const pwd = s.match(/[?&]pwd=([^&\s]+)/i)?.[1];
    if (confno) return `zoommtg://zoom.us/join?confno=${confno}${pwd ? `&pwd=${pwd}` : ''}`;
  }
  if (hasScheme(s)) return s;
  const id = s.replace(/\D/g, '');
  return id ? `zoommtg://zoom.us/join?confno=${id}` : s;
}

/**
 * Google Meet → ลิงก์เปิดแอป (https://meet.google.com/{code}) — ไม่มี custom scheme ที่เชื่อถือได้ ใช้ universal link
 *  • ลิงก์เต็ม meet.google.com/{code} → ดึงรหัสห้องมาประกอบใหม่ (ตัด query ทิ้ง)
 *  • รหัสห้องล้วน (เช่น "abc-defg-hij") → ประกอบเป็นลิงก์เต็ม
 *  • ลิงก์ที่มี scheme อื่นอยู่แล้ว → คืนตามเดิม
 */
export function meetLink(raw: string): string {
  const s = raw.trim();
  const m = s.match(/meet\.google\.com\/([a-z0-9-]+)/i);
  if (m) return `https://meet.google.com/${m[1]}`;
  if (hasScheme(s)) return s;
  const code = s.replace(/\s+/g, '');
  return code ? `https://meet.google.com/${code}` : s;
}

interface ContactsState {
  list: Contact[];
  boot: () => Promise<void>;
  upsert: (c: Omit<Contact, 'id'> & { id?: number }) => Promise<void>;
  remove: (id: number) => void;
}

export const useContacts = create<ContactsState>((set, get) => ({
  list: [],

  boot: async () => set({ list: await db.loadContacts() }),

  upsert: async (c) => {
    const id = await db.upsertContact(c);
    const list = get().list;
    const next: Contact = {
      ...c,
      phone: c.phone ?? null,
      line: c.line ?? null,
      email: c.email ?? null,
      zoom: c.zoom ?? null,
      googlemeet: c.googlemeet ?? null,
      note: c.note ?? null,
      id,
    };
    set({
      list: (c.id ? list.map((x) => (x.id === c.id ? next : x)) : [...list, next]).sort((a, b) =>
        a.name.localeCompare(b.name, 'th'),
      ),
    });
  },

  remove: (id) => {
    set({ list: get().list.filter((x) => x.id !== id) });
    db.deleteContact(id);
  },
}));
