// NotificationScheduler — งบ 50 รายการ ใต้ลิมิต iOS ~64 (APP_STRUCTURE.md §8)
// กลยุทธ์: ทุกครั้งที่ข้อมูลเปลี่ยน → cancel ทั้งหมดแล้วตั้งใหม่เฉพาะ 50 รายการที่ใกล้สุด (debounce 600ms)

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { CAT_BY_ID } from '@/constants/theme';
import { addDays, fmtMin, fromISO, todayISO } from '@/lib/dates';
import { dayItems } from '@/lib/engine';
import { morningDigest } from '@/lib/morning';
import type { Activity, NoteMap, OccMap } from '@/lib/types';

const BUDGET = 50;
const LOOKAHEAD_DAYS = 30;
/**
 * สรุปตอนเช้าตั้งล่วงหน้าเป็นรายวัน 7 วัน (ไม่ใช้ทริกเกอร์ DAILY ซ้ำ เพราะเนื้อหาต้องบอกนัดเคส "ของวันนั้น")
 * ทุก mutation จะ resync ใหม่อยู่แล้ว — ข้อความจึงตามข้อมูลล่าสุดเสมอ
 */
const MORNING_DAYS = 7;
/** เวลาสรุปตอนเช้าตั้งต้น (นาทีของวัน) — ผู้ใช้เลือกเองได้ที่หน้าตั้งค่า */
const MORNING_DEFAULT = 360;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const CHANNEL_ID = 'default';
/** ชุดปุ่มบนแจ้งเตือนของกิจกรรม (ชื่อห้ามมี : หรือ -) — ปุ่ม "ทำแล้ว" */
const CATEGORY_ID = 'activity';
const ACTION_DONE = 'done';

let ready = false;

async function setupChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'การแจ้งเตือนกิจกรรม',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  // ปุ่ม "ทำแล้ว" บนแจ้งเตือน — กดแล้วเปิดแอปขึ้นมาบันทึกให้ (ดู attachNotificationTaps) · เครื่อง/รุ่นที่ไม่รองรับก็แค่ไม่มีปุ่ม
  try {
    await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
      { identifier: ACTION_DONE, buttonTitle: 'ทำแล้ว', options: { opensAppToForeground: true } },
    ]);
  } catch {
    // ไม่มีปุ่มบนแจ้งเตือน — แตะตัวแจ้งเตือนยังเปิดรายการได้ตามปกติ
  }
}

/**
 * พร้อมตั้งแจ้งเตือนไหม — "ไม่ถามสิทธิ์เอง" แล้ว
 * เดิมถามสิทธิ์อัตโนมัติตอนเปิดแอปครั้งแรก (กล่องของระบบเด้งขึ้นมาเฉย ๆ ไม่มีคำอธิบาย)
 * ตอนนี้ถามเฉพาะตอนผู้ใช้เลือกเอง: หน้าต้อนรับ · เปิดสวิตช์แจ้งเตือนของกิจกรรม · สวิตช์ในหน้าตั้งค่า (requestNotifPermission)
 */
async function ensureReady(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (ready) return true;
  const perm = await Notifications.getPermissionsAsync();
  if (perm.status !== 'granted') return false;
  await setupChannel();
  ready = true;
  return true;
}

/** สิทธิ์แจ้งเตือน: granted = ได้แล้ว · ask = ยังไม่เคยถาม/ถามได้อีก · denied = ต้องไปเปิดในการตั้งค่าเครื่อง */
export async function notifPermissionState(): Promise<'granted' | 'ask' | 'denied'> {
  if (Platform.OS === 'web') return 'denied';
  const perm = await Notifications.getPermissionsAsync();
  return perm.status === 'granted' ? 'granted' : perm.canAskAgain ? 'ask' : 'denied';
}

/** สิทธิ์แจ้งเตือนของเครื่องตอนนี้ (ไม่ถาม) — หน้าตั้งค่าใช้บอกผู้ใช้เมื่อถูกปฏิเสธ */
export async function notifPermissionGranted(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  return (await Notifications.getPermissionsAsync()).status === 'granted';
}

/** ผู้ใช้เปิดสวิตช์แจ้งเตือนเอง — ขอสิทธิ์ (ถ้าระบบยังให้ถาม) คืน true เมื่อได้รับอนุญาต */
export async function requestNotifPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const perm = await Notifications.getPermissionsAsync();
  let status = perm.status;
  if (status !== 'granted' && perm.canAskAgain) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return false;
  await setupChannel();
  ready = true;
  return true;
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** เรียกหลังทุก mutation / ตอนเปิดแอป — debounce แล้วตั้งคิวใหม่ทั้งชุด */
/** morningNotes = โน้ตรายครั้ง เมื่อเปิด "แนบโน้ตในสรุปตอนเช้า" (null = ไม่แนบ) */
/** morningAt = เวลาสรุปตอนเช้า (นาทีของวัน) */
export function requestResync(acts: Activity[], occ: OccMap, master: boolean, morning: boolean, morningNotes: NoteMap | null = null, morningAt: number = MORNING_DEFAULT) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    resync(acts, occ, master, morning, morningNotes, morningAt).catch(() => {});
  }, 600);
}

/** ข้อมูลที่แนบไปกับแจ้งเตือน — แตะแล้วแอปรู้ว่าต้องเปิดวัน/รายการไหน */
export interface NotifTarget {
  date: string;
  /** id ของกิจกรรม (สรุปตอนเช้าไม่มี) */
  id?: number;
  /** กดปุ่ม "ทำแล้ว" บนแจ้งเตือน */
  done: boolean;
}

function targetOf(r: Notifications.NotificationResponse): NotifTarget | null {
  const d = r.notification.request.content.data as { date?: unknown; id?: unknown } | undefined;
  if (!d || typeof d.date !== 'string') return null;
  return { date: d.date, id: typeof d.id === 'number' ? d.id : undefined, done: r.actionIdentifier === ACTION_DONE };
}

/**
 * ฟังการแตะแจ้งเตือน (รวมแจ้งเตือนที่ใช้เปิดแอปจากสถานะปิดสนิท) — คืนฟังก์ชันเลิกฟัง
 * เดิมแตะแจ้งเตือนแล้วแอปแค่เปิดขึ้นมาที่หน้าล่าสุด ไม่พาไปที่รายการนั้น
 */
export function attachNotificationTaps(onTap: (t: NotifTarget) => void): () => void {
  if (Platform.OS === 'web') return () => {};
  try {
    // แจ้งเตือนที่เปิดแอปขึ้นมา (ก่อนตัวฟังด้านล่างจะถูกติดตั้ง)
    const last = Notifications.getLastNotificationResponse();
    if (last) {
      const t = targetOf(last);
      Notifications.clearLastNotificationResponse(); // ไม่ให้เปิดซ้ำตอนเปิดแอปครั้งถัดไป
      if (t) onTap(t);
    }
  } catch {
    // อ่านแจ้งเตือนล่าสุดไม่ได้ — ข้าม (ตัวฟังด้านล่างยังทำงาน)
  }
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const t = targetOf(r);
    if (t) onTap(t);
  });
  return () => sub.remove();
}

async function resync(acts: Activity[], occ: OccMap, master: boolean, morning: boolean, morningNotes: NoteMap | null, morningAt: number) {
  if (Platform.OS === 'web') return;
  if (!master) {
    // ปิดแจ้งเตือน — ยกเลิกของเดิมทั้งหมด โดยไม่ต้องขอสิทธิ์
    await Notifications.cancelAllScheduledNotificationsAsync();
    return;
  }
  if (!(await ensureReady())) return;
  await Notifications.cancelAllScheduledNotificationsAsync();

  const now = Date.now();
  const today = todayISO();

  // สรุปตอนเช้า — เวลาที่ผู้ใช้เลือก (ตั้งต้น 06:00) ของแต่ละวัน บอกว่าวันนั้นมีนัดเคส (งานธุรกิจ/ทีม) อะไรบ้าง
  let morningUsed = 0;
  if (morning) {
    for (let i = 0; i < MORNING_DAYS; i++) {
      const d = addDays(today, i);
      const at = fromISO(d);
      at.setHours(0, morningAt, 0, 0);
      if (+at <= now) continue; // เช้าวันนี้ผ่านไปแล้ว → เริ่มที่พรุ่งนี้
      const digest = morningDigest(acts, occ, d, morningNotes);
      await Notifications.scheduleNotificationAsync({
        content: { title: digest.title, body: digest.body, data: { date: d } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL_ID },
      });
      morningUsed++;
    }
  }

  // occurrence ล่วงหน้า 30 วัน ที่ notify เปิดและยัง planned → เรียงใกล้สุดก่อน → ตั้งเท่างบที่เหลือ
  const budget = Math.max(0, BUDGET - morningUsed);
  const queue: { at: Date; title: string; body: string; id: number; date: string }[] = [];
  for (let i = 0; i <= LOOKAHEAD_DAYS && queue.length < budget * 2; i++) {
    const d = addDays(today, i);
    for (const it of dayItems(acts, occ, d)) {
      if (!it.notify || it.ostatus !== 'planned') continue;
      const at = fromISO(d);
      at.setMinutes(it.startMin - it.notifyBefore);
      if (+at <= now) continue;
      queue.push({
        at,
        title: `${CAT_BY_ID[it.cat].short} · ${it.title}`,
        body: it.notifyBefore > 0 ? `เริ่ม ${fmtMin(it.startMin)} (อีก ${it.notifyBefore} นาที)` : `ถึงเวลาเริ่มแล้ว · ${fmtMin(it.startMin)}`,
        id: it.id,
        date: d,
      });
    }
  }
  queue.sort((a, b) => +a.at - +b.at);
  for (const q of queue.slice(0, budget)) {
    await Notifications.scheduleNotificationAsync({
      content: { title: q.title, body: q.body, data: { id: q.id, date: q.date }, categoryIdentifier: CATEGORY_ID },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: q.at, channelId: CHANNEL_ID },
    });
  }
}
