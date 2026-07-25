// NotificationScheduler — งบ 50 รายการ ใต้ลิมิต iOS ~64 (APP_STRUCTURE.md §8)
// กลยุทธ์: ทุกครั้งที่ข้อมูลเปลี่ยน → cancel ทั้งหมดแล้วตั้งใหม่เฉพาะ 50 รายการที่ใกล้สุด (debounce 600ms)

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { CAT_BY_ID } from '@/constants/theme';
import { addDays, fmtMin, fromISO, todayISO } from '@/lib/dates';
import { dayItems } from '@/lib/engine';
import { morningDigest } from '@/lib/morning';
import type { Activity, OccMap } from '@/lib/types';

const BUDGET = 50;
const LOOKAHEAD_DAYS = 30;
/**
 * สรุปตอนเช้าตั้งล่วงหน้าเป็นรายวัน 7 วัน (ไม่ใช้ทริกเกอร์ DAILY ซ้ำ เพราะเนื้อหาต้องบอกนัดเคส "ของวันนั้น")
 * ทุก mutation จะ resync ใหม่อยู่แล้ว — ข้อความจึงตามข้อมูลล่าสุดเสมอ
 */
const MORNING_DAYS = 7;
const MORNING_HOUR = 6;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let ready = false;

async function ensureReady(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (ready) return true;
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'การแจ้งเตือนกิจกรรม',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  ready = true;
  return true;
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** เรียกหลังทุก mutation / ตอนเปิดแอป — debounce แล้วตั้งคิวใหม่ทั้งชุด */
export function requestResync(acts: Activity[], occ: OccMap, master: boolean, morning: boolean) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    resync(acts, occ, master, morning).catch(() => {});
  }, 600);
}

async function resync(acts: Activity[], occ: OccMap, master: boolean, morning: boolean) {
  if (!(await ensureReady())) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!master) return;

  const now = Date.now();
  const today = todayISO();

  // สรุปตอนเช้า — 06:00 ของแต่ละวัน บอกว่าวันนั้นมีนัดเคส (งานธุรกิจ/ทีม) อะไรบ้าง
  let morningUsed = 0;
  if (morning) {
    for (let i = 0; i < MORNING_DAYS; i++) {
      const d = addDays(today, i);
      const at = fromISO(d);
      at.setHours(MORNING_HOUR, 0, 0, 0);
      if (+at <= now) continue; // เช้าวันนี้ผ่านไปแล้ว → เริ่มที่พรุ่งนี้
      const digest = morningDigest(acts, occ, d);
      await Notifications.scheduleNotificationAsync({
        content: { title: digest.title, body: digest.body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
      });
      morningUsed++;
    }
  }

  // occurrence ล่วงหน้า 30 วัน ที่ notify เปิดและยัง planned → เรียงใกล้สุดก่อน → ตั้งเท่างบที่เหลือ
  const budget = Math.max(0, BUDGET - morningUsed);
  const queue: { at: Date; title: string; body: string }[] = [];
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
      });
    }
  }
  queue.sort((a, b) => +a.at - +b.at);
  for (const q of queue.slice(0, budget)) {
    await Notifications.scheduleNotificationAsync({
      content: { title: q.title, body: q.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: q.at },
    });
  }
}
