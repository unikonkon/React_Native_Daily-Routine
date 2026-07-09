// NotificationScheduler — งบ 50 รายการ ใต้ลิมิต iOS ~64 (APP_STRUCTURE.md §8)
// กลยุทธ์: ทุกครั้งที่ข้อมูลเปลี่ยน → cancel ทั้งหมดแล้วตั้งใหม่เฉพาะ 50 รายการที่ใกล้สุด (debounce 600ms)

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { CAT_BY_ID } from '@/constants/theme';
import { addDays, fmtMin, fromISO, todayISO } from '@/lib/dates';
import { dayItems } from '@/lib/engine';
import type { Activity, OccMap } from '@/lib/types';

const BUDGET = 50;
const LOOKAHEAD_DAYS = 30;

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

  if (morning) {
    await Notifications.scheduleNotificationAsync({
      content: { title: 'สรุปตอนเช้า ☀️', body: 'แตะเพื่อดูตารางกิจกรรมของวันนี้' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 6, minute: 0 },
    });
  }

  // occurrence ล่วงหน้า 30 วัน ที่ notify เปิดและยัง planned → เรียงใกล้สุดก่อน → ตั้ง 50 รายการแรก
  const now = Date.now();
  const today = todayISO();
  const queue: { at: Date; title: string; body: string }[] = [];
  for (let i = 0; i <= LOOKAHEAD_DAYS && queue.length < BUDGET * 2; i++) {
    const d = addDays(today, i);
    for (const it of dayItems(acts, occ, d)) {
      if (!it.notify || it.ostatus !== 'planned') continue;
      const at = fromISO(d);
      at.setMinutes(it.startMin - it.notifyBefore);
      if (+at <= now) continue;
      queue.push({
        at,
        title: `${CAT_BY_ID[it.cat].short} · ${it.title}`,
        body: `เริ่ม ${fmtMin(it.startMin)} (อีก ${it.notifyBefore} นาที)`,
      });
    }
  }
  queue.sort((a, b) => +a.at - +b.at);
  for (const q of queue.slice(0, BUDGET)) {
    await Notifications.scheduleNotificationAsync({
      content: { title: q.title, body: q.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: q.at },
    });
  }
}
