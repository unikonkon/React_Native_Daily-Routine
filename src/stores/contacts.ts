import { Linking } from 'react-native';
import { create } from 'zustand';

import * as db from '@/lib/db';
import type { Contact } from '@/lib/types';

// ---------- ประกอบลิงก์ประชุมออนไลน์จากค่าที่ผู้ใช้กรอก (รองรับ 2 กรณี: ลิงก์เต็ม / Meeting ID) ----------

const hasScheme = (s: string) => /^[a-z][a-z0-9+.-]*:\/\//i.test(s);

/**
 * แกะเลขห้อง + รหัสผ่านจากสิ่งที่ผู้ใช้กรอก
 *  • ลิงก์เต็ม zoom.us/j|s|w/{id} (มี ?pwd= ได้)
 *  • ลิงก์ deep link เดิมที่มี ?confno={id}
 *  • Meeting ID ล้วน (เว้นวรรค/ขีดได้ เช่น "123 4567 8901")
 * คืน null เมื่อแกะเลขห้องไม่ได้ (เช่นลิงก์ห้องส่วนตัว zoom.us/my/ชื่อ) — ให้ไปเปิดลิงก์เว็บแทน
 */
function parseZoom(raw: string): { confno: string; pwd?: string } | null {
  const s = raw.trim();
  const pwd = s.match(/[?&]pwd=([^&\s]+)/i)?.[1];
  const inUrl = s.match(/zoom\.us\/(?:j|s|w)\/(\d[\d\s-]*)/i) ?? s.match(/[?&]confno=(\d[\d\s-]*)/i);
  if (inUrl) return { confno: inUrl[1].replace(/\D/g, ''), pwd };
  if (hasScheme(s) || /[a-z]/i.test(s)) return null; // เป็นลิงก์/ข้อความ ไม่ใช่ Meeting ID ล้วน
  const confno = s.replace(/\D/g, '');
  return confno ? { confno, pwd } : null;
}

/**
 * Zoom → deep link เปิดแอปบนมือถือ — scheme ของแอป iOS/Android คือ `zoomus://`
 * (เดิมใช้ `zoommtg://` ซึ่งเป็นของโปรแกรมบนเดสก์ท็อป มือถือจึงเปิดไม่ขึ้น)
 * คืน null เมื่อประกอบไม่ได้ → ให้ผู้เรียกใช้ zoomWebLink แทน
 */
export function zoomAppLink(raw: string): string | null {
  const p = parseZoom(raw);
  if (!p) return null;
  return `zoomus://zoom.us/join?confno=${p.confno}${p.pwd ? `&pwd=${encodeURIComponent(p.pwd)}` : ''}`;
}

/** Zoom → ลิงก์เว็บสำรอง (ไม่มีแอปก็เปิดได้ · ถ้ามีแอป ระบบจะเด้งเข้าแอปให้เอง) */
export function zoomWebLink(raw: string): string {
  const s = raw.trim();
  const p = parseZoom(s);
  if (p) return `https://zoom.us/j/${p.confno}${p.pwd ? `?pwd=${encodeURIComponent(p.pwd)}` : ''}`;
  if (/^https?:\/\//i.test(s)) return s; // ลิงก์ห้องส่วนตัว/ลิงก์เชิญ — ใช้ตามที่กรอกมา
  return 'https://zoom.us/join';
}

/**
 * เปิดลิงก์ — ลองตัวหลักก่อน (deep link ของแอป) ไม่มีแอปติดตั้ง openURL จะโยน error แล้วค่อยเปิดตัวสำรอง
 * ไม่ใช้ canOpenURL เพราะบน iOS ต้องประกาศ scheme ใน LSApplicationQueriesSchemes ก่อน ไม่งั้นได้ false เสมอ
 */
export async function openLink(url: string, fallback?: string): Promise<'primary' | 'fallback' | 'fail'> {
  try {
    await Linking.openURL(url);
    return 'primary';
  } catch {
    if (!fallback || fallback === url) return 'fail';
  }
  try {
    await Linking.openURL(fallback);
    return 'fallback';
  } catch {
    return 'fail';
  }
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
