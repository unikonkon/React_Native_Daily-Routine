// ชั้น SQLite — ที่เดียวที่แตะฐานข้อมูล (APP_STRUCTURE.md §7)
// อ่านครั้งเดียวตอนเปิดแอป → stores ถือข้อมูลใน memory; การเขียนเป็น optimistic (UI ไม่รอ)

import * as SQLite from 'expo-sqlite';

import { addDays } from '@/lib/dates';
import type { Activity, Contact, OccMap, OccStatus } from '@/lib/types';

let db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync('routine.db');
    migrate(db);
  }
  return db;
}

function migrate(d: SQLite.SQLiteDatabase) {
  d.execSync('PRAGMA journal_mode = WAL');
  const { user_version: v } = d.getFirstSync<{ user_version: number }>('PRAGMA user_version')!;
  if (v < 1) {
    d.execSync(`
      CREATE TABLE IF NOT EXISTS activities (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        title         TEXT NOT NULL,
        cat           TEXT NOT NULL,
        sub           TEXT,
        loc           TEXT,
        channel       TEXT,
        priority      TEXT,
        start_min     INTEGER NOT NULL,
        end_min       INTEGER NOT NULL,
        repeat        TEXT NOT NULL DEFAULT 'none',
        days_mask     INTEGER NOT NULL DEFAULT 0,
        start_date    TEXT NOT NULL,
        end_date      TEXT,
        notify        INTEGER NOT NULL DEFAULT 1,
        notify_before INTEGER NOT NULL DEFAULT 30,
        detached_from INTEGER REFERENCES activities(id),
        status        TEXT NOT NULL DEFAULT 'active',
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS occurrences (
        activity_id INTEGER NOT NULL REFERENCES activities(id),
        date        TEXT NOT NULL,
        status      TEXT NOT NULL,
        PRIMARY KEY (activity_id, date)
      ) WITHOUT ROWID;
      CREATE INDEX IF NOT EXISTS idx_occ_date ON occurrences(date);
      CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'P6',
        phone TEXT, line TEXT
      );
      CREATE TABLE IF NOT EXISTS activity_contacts (
        activity_id INTEGER NOT NULL REFERENCES activities(id),
        contact_id  INTEGER NOT NULL REFERENCES contacts(id),
        PRIMARY KEY (activity_id, contact_id)
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS reschedule_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        activity_id INTEGER NOT NULL,
        from_date TEXT NOT NULL, from_start INTEGER NOT NULL,
        to_date   TEXT NOT NULL, to_start   INTEGER NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      PRAGMA user_version = 1;
    `);
  }
}

// ---------- โหลดตอนเปิดแอป (ครั้งเดียว) ----------

interface ActivityRow {
  id: number;
  title: string;
  cat: string;
  sub: string | null;
  loc: string | null;
  channel: string | null;
  priority: string | null;
  start_min: number;
  end_min: number;
  repeat: string;
  days_mask: number;
  start_date: string;
  end_date: string | null;
  notify: number;
  notify_before: number;
  detached_from: number | null;
  status: string;
}

export async function loadActivities(): Promise<Activity[]> {
  const d = getDb();
  const rows = await d.getAllAsync<ActivityRow>("SELECT * FROM activities WHERE status = 'active'");
  const links = await d.getAllAsync<{ activity_id: number; contact_id: number }>(
    'SELECT activity_id, contact_id FROM activity_contacts',
  );
  const byAct: Record<number, number[]> = {};
  for (const l of links) (byAct[l.activity_id] ??= []).push(l.contact_id);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    cat: r.cat as Activity['cat'],
    sub: r.sub,
    loc: r.loc,
    channel: r.channel as Activity['channel'],
    priority: r.priority as Activity['priority'],
    startMin: r.start_min,
    endMin: r.end_min,
    repeat: r.repeat as Activity['repeat'],
    daysMask: r.days_mask,
    startDate: r.start_date,
    endDate: r.end_date,
    notify: !!r.notify,
    notifyBefore: r.notify_before,
    detachedFrom: r.detached_from,
    status: r.status as Activity['status'],
    contactIds: byAct[r.id] ?? [],
  }));
}

export async function loadOccurrences(): Promise<OccMap> {
  const rows = await getDb().getAllAsync<{ activity_id: number; date: string; status: OccStatus }>(
    'SELECT * FROM occurrences',
  );
  const occ: OccMap = {};
  for (const r of rows) (occ[r.date] ??= {})[r.activity_id] = r.status;
  return occ;
}

export async function loadContacts(): Promise<Contact[]> {
  return (await getDb().getAllAsync<Contact>('SELECT * FROM contacts ORDER BY name')) as Contact[];
}

export async function loadRescCounts(): Promise<Record<number, number>> {
  const rows = await getDb().getAllAsync<{ activity_id: number; n: number }>(
    'SELECT activity_id, COUNT(*) n FROM reschedule_logs GROUP BY activity_id',
  );
  return Object.fromEntries(rows.map((r) => [r.activity_id, r.n]));
}

export async function loadSettings(): Promise<Record<string, string>> {
  const rows = await getDb().getAllAsync<{ key: string; value: string }>('SELECT * FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

// ---------- เขียน (เรียกจาก stores แบบ optimistic) ----------

export async function insertActivity(a: Omit<Activity, 'id'>): Promise<number> {
  const d = getDb();
  const res = await d.runAsync(
    `INSERT INTO activities (title, cat, sub, loc, channel, priority, start_min, end_min,
       repeat, days_mask, start_date, end_date, notify, notify_before, detached_from, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    a.title, a.cat, a.sub, a.loc, a.channel, a.priority, a.startMin, a.endMin,
    a.repeat, a.daysMask, a.startDate, a.endDate, a.notify ? 1 : 0, a.notifyBefore,
    a.detachedFrom, a.status,
  );
  const id = res.lastInsertRowId;
  await setActivityContacts(id, a.contactIds);
  return id;
}

export async function updateActivity(a: Activity): Promise<void> {
  await getDb().runAsync(
    `UPDATE activities SET title=?, cat=?, sub=?, loc=?, channel=?, priority=?, start_min=?, end_min=?,
       repeat=?, days_mask=?, start_date=?, end_date=?, notify=?, notify_before=?, status=? WHERE id=?`,
    a.title, a.cat, a.sub, a.loc, a.channel, a.priority, a.startMin, a.endMin,
    a.repeat, a.daysMask, a.startDate, a.endDate, a.notify ? 1 : 0, a.notifyBefore, a.status, a.id,
  );
  await setActivityContacts(a.id, a.contactIds);
}

async function setActivityContacts(id: number, contactIds: number[]) {
  const d = getDb();
  await d.runAsync('DELETE FROM activity_contacts WHERE activity_id=?', id);
  for (const c of contactIds) {
    await d.runAsync('INSERT OR IGNORE INTO activity_contacts (activity_id, contact_id) VALUES (?,?)', id, c);
  }
}

export async function setEndDate(id: number, endDate: string | null): Promise<void> {
  await getDb().runAsync('UPDATE activities SET end_date=? WHERE id=?', endDate, id);
}

export async function cancelActivity(id: number): Promise<void> {
  await getDb().runAsync("UPDATE activities SET status='cancelled' WHERE id=?", id);
}

/** สถานะรายวัน: null = กลับเป็น planned (ลบแถว exception) */
export async function setOccurrence(activityId: number, date: string, status: OccStatus | null): Promise<void> {
  const d = getDb();
  if (status === null || status === 'planned') {
    await d.runAsync('DELETE FROM occurrences WHERE activity_id=? AND date=?', activityId, date);
  } else {
    await d.runAsync(
      'INSERT INTO occurrences (activity_id, date, status) VALUES (?,?,?) ON CONFLICT DO UPDATE SET status=excluded.status',
      activityId, date, status,
    );
  }
}

export async function insertRescheduleLog(
  activityId: number,
  fromDate: string,
  fromStart: number,
  toDate: string,
  toStart: number,
  reason: string | null,
): Promise<void> {
  await getDb().runAsync(
    'INSERT INTO reschedule_logs (activity_id, from_date, from_start, to_date, to_start, reason) VALUES (?,?,?,?,?,?)',
    activityId, fromDate, fromStart, toDate, toStart, reason,
  );
}

export async function upsertContact(c: Omit<Contact, 'id'> & { id?: number }): Promise<number> {
  const d = getDb();
  if (c.id) {
    await d.runAsync('UPDATE contacts SET name=?, priority=?, phone=?, line=? WHERE id=?', c.name, c.priority, c.phone, c.line, c.id);
    return c.id;
  }
  const res = await d.runAsync('INSERT INTO contacts (name, priority, phone, line) VALUES (?,?,?,?)', c.name, c.priority, c.phone, c.line);
  return res.lastInsertRowId;
}

export async function deleteContact(id: number): Promise<void> {
  const d = getDb();
  await d.runAsync('DELETE FROM activity_contacts WHERE contact_id=?', id);
  await d.runAsync('DELETE FROM contacts WHERE id=?', id);
}

export async function saveSetting(key: string, value: string): Promise<void> {
  await getDb().runAsync(
    'INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT DO UPDATE SET value=excluded.value',
    key, value,
  );
}

/** เพิ่มกิจกรรมหลายรายการใน transaction เดียว (นำเข้า Time Table CSV) — ไม่ผูก contact */
export async function insertActivities(list: Omit<Activity, 'id'>[]): Promise<void> {
  const d = getDb();
  await d.withExclusiveTransactionAsync(async (txn) => {
    for (const a of list) {
      await txn.runAsync(
        `INSERT INTO activities (title, cat, sub, loc, channel, priority, start_min, end_min,
           repeat, days_mask, start_date, end_date, notify, notify_before, detached_from, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        a.title, a.cat, a.sub, a.loc, a.channel, a.priority, a.startMin, a.endMin,
        a.repeat, a.daysMask, a.startDate, a.endDate, a.notify ? 1 : 0, a.notifyBefore,
        a.detachedFrom, a.status,
      );
    }
  });
}

// ---------- จัดการข้อมูลรายช่วง (settings/manage) ----------

/**
 * ลบข้อมูลช่วงวัน from–to ถาวร (รวมแถว cancelled ที่มองไม่เห็นด้วย):
 *  - occurrences / reschedule_logs ที่วันที่อยู่ในช่วง
 *  - กิจกรรมครั้งเดียวที่ start_date อยู่ในช่วง และ series ที่ทั้งช่วงชีวิตอยู่ในกรอบ → ลบทั้งแถว
 *  - series คาบเกี่ยวกรอบ: ตัดท้าย / เลื่อนหัว / คร่อมทั้งกรอบ → แยกเป็นสองท่อน (ท่อนหลังได้ id ใหม่)
 */
export async function purgeRange(from: string, to: string): Promise<void> {
  const d = getDb();
  await d.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('DELETE FROM occurrences WHERE date BETWEEN ? AND ?', from, to);
    await txn.runAsync(
      'DELETE FROM reschedule_logs WHERE (from_date BETWEEN ? AND ?) OR (to_date BETWEEN ? AND ?)',
      from, to, from, to,
    );

    // ลบทั้งแถว: ครั้งเดียวในช่วง + series ที่อยู่ในกรอบทั้งช่วงชีวิต
    const gone = await txn.getAllAsync<{ id: number }>(
      `SELECT id FROM activities
       WHERE (repeat='none' AND start_date BETWEEN ? AND ?)
          OR (repeat!='none' AND start_date >= ? AND end_date IS NOT NULL AND end_date <= ?)`,
      from, to, from, to,
    );
    for (const { id } of gone) {
      await txn.runAsync('DELETE FROM activity_contacts WHERE activity_id=?', id);
      await txn.runAsync('DELETE FROM occurrences WHERE activity_id=?', id);
      await txn.runAsync('DELETE FROM reschedule_logs WHERE activity_id=?', id);
      await txn.runAsync('DELETE FROM activities WHERE id=?', id);
    }

    const before = addDays(from, -1);
    const after = addDays(to, 1);
    const spanning = await txn.getAllAsync<ActivityRow>(
      "SELECT * FROM activities WHERE repeat!='none' AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)",
      to, from,
    );
    for (const a of spanning) {
      const headBefore = a.start_date < from;
      const tailAfter = a.end_date === null || a.end_date > to;
      if (headBefore && tailAfter) {
        // คร่อมทั้งกรอบ — ท่อนแรกจบก่อนกรอบ, ท่อนหลังเริ่มหลังกรอบ (สำเนาแถว + ย้าย exception ฝั่งหลังตาม)
        await txn.runAsync('UPDATE activities SET end_date=? WHERE id=?', before, a.id);
        const res = await txn.runAsync(
          `INSERT INTO activities (title, cat, sub, loc, channel, priority, start_min, end_min,
             repeat, days_mask, start_date, end_date, notify, notify_before, detached_from, status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          a.title, a.cat, a.sub, a.loc, a.channel, a.priority, a.start_min, a.end_min,
          a.repeat, a.days_mask, after, a.end_date, a.notify, a.notify_before, a.detached_from, a.status,
        );
        const newId = res.lastInsertRowId;
        await txn.runAsync('UPDATE occurrences SET activity_id=? WHERE activity_id=? AND date > ?', newId, a.id, to);
        const links = await txn.getAllAsync<{ contact_id: number }>(
          'SELECT contact_id FROM activity_contacts WHERE activity_id=?', a.id,
        );
        for (const l of links) {
          await txn.runAsync('INSERT OR IGNORE INTO activity_contacts (activity_id, contact_id) VALUES (?,?)', newId, l.contact_id);
        }
      } else if (headBefore) {
        await txn.runAsync('UPDATE activities SET end_date=? WHERE id=?', before, a.id);
      } else if (tailAfter) {
        await txn.runAsync('UPDATE activities SET start_date=? WHERE id=?', after, a.id);
      }
    }
  });
}

// ---------- Export / Import (§6.5) ----------

export interface BackupData {
  version: 1;
  activities: ActivityRow[];
  occurrences: { activity_id: number; date: string; status: string }[];
  contacts: Contact[];
  activity_contacts: { activity_id: number; contact_id: number }[];
  reschedule_logs: unknown[];
}

export async function dumpAll(): Promise<BackupData> {
  const d = getDb();
  return {
    version: 1,
    activities: await d.getAllAsync('SELECT * FROM activities'),
    occurrences: await d.getAllAsync('SELECT * FROM occurrences'),
    contacts: await d.getAllAsync('SELECT * FROM contacts'),
    activity_contacts: await d.getAllAsync('SELECT * FROM activity_contacts'),
    reschedule_logs: await d.getAllAsync('SELECT * FROM reschedule_logs'),
  } as BackupData;
}

/** กู้คืน JSON — mode 'replace' ล้างก่อน / 'merge' เพิ่มต่อ (id ใหม่) — ทำใน transaction เดียว */
export async function restoreAll(data: BackupData, mode: 'replace' | 'merge'): Promise<void> {
  const d = getDb();
  await d.withExclusiveTransactionAsync(async (txn) => {
    if (mode === 'replace') {
      await txn.execAsync(
        'DELETE FROM activity_contacts; DELETE FROM occurrences; DELETE FROM reschedule_logs; DELETE FROM activities; DELETE FROM contacts;',
      );
    }
    const contactIdMap: Record<number, number> = {};
    for (const c of data.contacts) {
      const res = await txn.runAsync(
        'INSERT INTO contacts (name, priority, phone, line) VALUES (?,?,?,?)',
        c.name, c.priority, c.phone, c.line,
      );
      contactIdMap[c.id] = res.lastInsertRowId;
    }
    const actIdMap: Record<number, number> = {};
    for (const a of data.activities) {
      const res = await txn.runAsync(
        `INSERT INTO activities (title, cat, sub, loc, channel, priority, start_min, end_min,
           repeat, days_mask, start_date, end_date, notify, notify_before, detached_from, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?)`,
        a.title, a.cat, a.sub, a.loc, a.channel, a.priority, a.start_min, a.end_min,
        a.repeat, a.days_mask, a.start_date, a.end_date, a.notify, a.notify_before, a.status,
      );
      actIdMap[a.id] = res.lastInsertRowId;
    }
    for (const o of data.occurrences) {
      const id = actIdMap[o.activity_id];
      if (id) await txn.runAsync('INSERT OR REPLACE INTO occurrences (activity_id, date, status) VALUES (?,?,?)', id, o.date, o.status);
    }
    for (const l of data.activity_contacts) {
      const a = actIdMap[l.activity_id];
      const c = contactIdMap[l.contact_id];
      if (a && c) await txn.runAsync('INSERT OR IGNORE INTO activity_contacts (activity_id, contact_id) VALUES (?,?)', a, c);
    }
  });
}
