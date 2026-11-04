// ชั้น SQLite — ที่เดียวที่แตะฐานข้อมูล (APP_STRUCTURE.md §7)
// อ่านครั้งเดียวตอนเปิดแอป → stores ถือข้อมูลใน memory; การเขียนเป็น optimistic (UI ไม่รอ)

import * as SQLite from 'expo-sqlite';

import { addDays } from '@/lib/dates';
import type { Activity, Contact, InlineContact, NoteMap, OccMap, OccStatus } from '@/lib/types';

let db: SQLite.SQLiteDatabase | null = null;

function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    const d = SQLite.openDatabaseSync('routine.db');
    // ตั้ง db หลัง migrate สำเร็จเท่านั้น — migrate พลาดแล้วกด "ลองใหม่" จะ migrate ซ้ำ ไม่ข้ามไปใช้ schema เก่า
    try {
      migrate(d);
    } catch (e) {
      d.closeSync();
      throw e;
    }
    db = d;
  }
  return db;
}

/** migration หนึ่งขั้น (แก้ schema + PRAGMA user_version) ใน transaction เดียว — แอปถูกปิดกลางทางก็ไม่ค้างครึ่งขั้น */
function step(d: SQLite.SQLiteDatabase, sql: string) {
  d.execSync('BEGIN');
  try {
    d.execSync(sql);
    d.execSync('COMMIT');
  } catch (e) {
    d.execSync('ROLLBACK');
    throw e;
  }
}

function migrate(d: SQLite.SQLiteDatabase) {
  d.execSync('PRAGMA journal_mode = WAL');
  const { user_version: v } = d.getFirstSync<{ user_version: number }>('PRAGMA user_version')!;
  if (v < 1) {
    step(d, `
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
  if (v < 2) {
    // เพิ่มช่องข้อมูลผู้ติดต่อ (ไม่บังคับ): อีเมล + หมายเหตุ
    step(d, `
      ALTER TABLE contacts ADD COLUMN email TEXT;
      ALTER TABLE contacts ADD COLUMN note TEXT;
      PRAGMA user_version = 2;
    `);
  }
  if (v < 3) {
    // เพิ่มช่องลิงก์ประชุมออนไลน์ (ไม่บังคับ): Zoom + Google Meet
    step(d, `
      ALTER TABLE contacts ADD COLUMN zoom TEXT;
      ALTER TABLE contacts ADD COLUMN googlemeet TEXT;
      PRAGMA user_version = 3;
    `);
  }
  if (v < 4) {
    // สีพื้นเซลล์ที่จำมาจากไฟล์ Time Table (.xlsx) — ส่งออกแล้วได้สีเดิมของผู้ใช้กลับไป
    step(d, `
      ALTER TABLE activities ADD COLUMN color TEXT;
      PRAGMA user_version = 4;
    `);
  }
  if (v < 5) {
    // ชุด "เลือกเอง" เก็บวันที่ที่เลือกจริงเป็น JSON array — เดิมเก็บแค่ days_mask ทำให้งอกวันที่ไม่ได้เลือก
    step(d, `
      ALTER TABLE activities ADD COLUMN dates TEXT;
      PRAGMA user_version = 5;
    `);
  }
  if (v < 6) {
    // โน้ตรายครั้ง (แผ่นรายละเอียด) แยกตารางจาก occurrences — ครั้งที่ยังไม่ทำ (ไม่มีแถว exception) ก็มีโน้ตได้
    // + องค์กร/บริษัทของรายชื่อ
    step(d, `
      CREATE TABLE IF NOT EXISTS occ_notes (
        activity_id INTEGER NOT NULL REFERENCES activities(id),
        date        TEXT NOT NULL,
        note        TEXT NOT NULL,
        PRIMARY KEY (activity_id, date)
      ) WITHOUT ROWID;
      ALTER TABLE contacts ADD COLUMN org TEXT;
      PRAGMA user_version = 6;
    `);
  }
  if (v < 7) {
    // นัดเคสโหมด "ช่องทางติดต่อ" — ข้อมูลติดต่อของนัดนั้นเก็บเป็น JSON ในแถวกิจกรรม (ไม่เพิ่มลงสมุดรายชื่อ)
    step(d, `
      ALTER TABLE activities ADD COLUMN inline_contact TEXT;
      PRAGMA user_version = 7;
    `);
  }
}

/** activities.dates (JSON array) ↔ string[] — ค่าเสีย/ว่างถือเป็น null (กลับไปใช้ days_mask) */
function decodeDates(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) && v.length ? (v as string[]) : null;
  } catch {
    return null;
  }
}
const encodeDates = (dates: string[] | null) => (dates && dates.length ? JSON.stringify(dates) : null);

/** activities.inline_contact (JSON) ↔ InlineContact — ค่าเสีย/ไม่ใช่ object ถือเป็น null (โหมดคนที่นัด) */
function decodeInline(raw: string | null | undefined): InlineContact | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object') return null;
    const str = (k: keyof InlineContact) => (typeof v[k] === 'string' && v[k] ? (v[k] as string) : null);
    return {
      name: str('name') ?? '',
      org: str('org'),
      phone: str('phone'),
      line: str('line'),
      email: str('email'),
      zoom: str('zoom'),
      googlemeet: str('googlemeet'),
      note: str('note'),
    };
  } catch {
    return null;
  }
}
const encodeInline = (c: InlineContact | null) => (c ? JSON.stringify(c) : null);

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
  color: string | null;
  dates?: string | null; // คอลัมน์ v5 — สำรองข้อมูลรุ่นเก่าไม่มีฟิลด์นี้
  inline_contact?: string | null; // คอลัมน์ v7 — สำรองข้อมูลรุ่นเก่าไม่มีฟิลด์นี้
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
    dates: decodeDates(r.dates),
    startDate: r.start_date,
    endDate: r.end_date,
    notify: !!r.notify,
    notifyBefore: r.notify_before,
    detachedFrom: r.detached_from,
    status: r.status as Activity['status'],
    contactIds: byAct[r.id] ?? [],
    inlineContact: decodeInline(r.inline_contact),
    color: r.color ?? null,
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

export async function loadNotes(): Promise<NoteMap> {
  const rows = await getDb().getAllAsync<{ activity_id: number; date: string; note: string }>('SELECT * FROM occ_notes');
  const notes: NoteMap = {};
  for (const r of rows) (notes[r.date] ??= {})[r.activity_id] = r.note;
  return notes;
}

export async function loadContacts(): Promise<Contact[]> {
  return (await getDb().getAllAsync<Contact>('SELECT * FROM contacts ORDER BY name')) as Contact[];
}

/**
 * จำนวนครั้งที่เลื่อนต่อนัด "(เลื่อนมา)" — นับต่อเป็นทอดตาม detached_from (เลื่อนนัดที่เลื่อนมาแล้ว = ครั้งที่ 2, 3, …)
 * ให้ตรงกับที่ store นับใน memory ตอนเลื่อน (rescCounts[นัดเดิม] + 1)
 */
export async function loadRescCounts(): Promise<Record<number, number>> {
  const rows = await getDb().getAllAsync<{ activity_id: number; n: number; parent: number | null }>(
    `SELECT l.activity_id, COUNT(*) n, a.detached_from parent
     FROM reschedule_logs l LEFT JOIN activities a ON a.id = l.activity_id
     GROUP BY l.activity_id`,
  );
  const own = new Map(rows.map((r) => [r.activity_id, r]));
  const memo = new Map<number, number>();
  const total = (id: number, depth: number): number => {
    const r = own.get(id);
    if (!r || depth > 100) return 0; // นัดต้นทางที่ไม่ได้มาจากการเลื่อน = 0 · กันวนไม่รู้จบเผื่อข้อมูลเสีย
    const hit = memo.get(id);
    if (hit !== undefined) return hit;
    const v = r.n + (r.parent != null ? total(r.parent, depth + 1) : 0);
    memo.set(id, v);
    return v;
  };
  return Object.fromEntries(rows.map((r) => [r.activity_id, total(r.activity_id, 0)]));
}

export async function loadSettings(): Promise<Record<string, string>> {
  const rows = await getDb().getAllAsync<{ key: string; value: string }>('SELECT * FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

// ---------- เขียน (เรียกจาก stores แบบ optimistic) ----------

const INSERT_ACTIVITY_SQL = `INSERT INTO activities (title, cat, sub, loc, channel, priority, start_min, end_min,
       repeat, days_mask, dates, start_date, end_date, notify, notify_before, detached_from, status, color, inline_contact)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

const activityParams = (a: Omit<Activity, 'id'>): SQLite.SQLiteBindValue[] => [
  a.title, a.cat, a.sub, a.loc, a.channel, a.priority, a.startMin, a.endMin,
  a.repeat, a.daysMask, encodeDates(a.dates), a.startDate, a.endDate, a.notify ? 1 : 0, a.notifyBefore,
  a.detachedFrom, a.status, a.color, encodeInline(a.inlineContact),
];

/** INSERT แถวกิจกรรม 1 แถว (ไม่รวมรายชื่อ) — ใช้ได้ทั้ง db หลักและ txn ใน transaction */
async function insertActivityRow(conn: SQLite.SQLiteDatabase, a: Omit<Activity, 'id'>): Promise<number> {
  const res = await conn.runAsync(INSERT_ACTIVITY_SQL, ...activityParams(a));
  return res.lastInsertRowId;
}

/**
 * เขียนหลายแถวด้วยคำสั่งเดียวกัน: prepare ครั้งเดียว แล้ว execute ทีละแถว
 * runAsync ต่อแถว = prepare + execute + finalize (ไป-กลับ native 3 รอบ) — ข้อมูลหลายหมื่นแถวช้ามากบนมือถือ
 */
async function withStatement<T>(
  conn: SQLite.SQLiteDatabase,
  sql: string,
  fn: (run: (...params: SQLite.SQLiteBindValue[]) => Promise<{ lastInsertRowId: number }>) => Promise<T>,
): Promise<T> {
  const st = await conn.prepareAsync(sql);
  try {
    return await fn((...params) => st.executeAsync(...params));
  } finally {
    await st.finalizeAsync();
  }
}

export async function insertActivity(a: Omit<Activity, 'id'>): Promise<number> {
  const d = getDb();
  const id = await insertActivityRow(d, a);
  await setActivityContacts(d, id, a.contactIds);
  return id;
}

export async function updateActivity(a: Activity): Promise<void> {
  const d = getDb();
  await d.runAsync(
    `UPDATE activities SET title=?, cat=?, sub=?, loc=?, channel=?, priority=?, start_min=?, end_min=?,
       repeat=?, days_mask=?, dates=?, start_date=?, end_date=?, notify=?, notify_before=?, status=?, color=?, inline_contact=? WHERE id=?`,
    a.title, a.cat, a.sub, a.loc, a.channel, a.priority, a.startMin, a.endMin,
    a.repeat, a.daysMask, encodeDates(a.dates), a.startDate, a.endDate, a.notify ? 1 : 0, a.notifyBefore, a.status,
    a.color, encodeInline(a.inlineContact), a.id,
  );
  await setActivityContacts(d, a.id, a.contactIds);
}

async function setActivityContacts(conn: SQLite.SQLiteDatabase, id: number, contactIds: number[]) {
  await conn.runAsync('DELETE FROM activity_contacts WHERE activity_id=?', id);
  for (const c of contactIds) {
    // ผูกเฉพาะรายชื่อที่ยังอยู่ในสมุด — กันลิงก์ค้างไปยังรายชื่อที่ถูกลบไปแล้ว
    await conn.runAsync('INSERT OR IGNORE INTO activity_contacts (activity_id, contact_id) SELECT ?, id FROM contacts WHERE id=?', id, c);
  }
}

/**
 * แก้ไข "ตั้งแต่วัน from เป็นต้นไป" ของชุดทำซ้ำ — ทำใน transaction เดียว:
 *  ชุดเดิมจบก่อน from (end_date/dates ตาม head) · สร้างชุดใหม่ (tail) · ย้ายสถานะรายวันตั้งแต่ from ไปชุดใหม่
 * tail = null → แค่ตัดท้ายชุดเดิม (การแก้ไขทำให้ไม่เหลือวันตั้งแต่ from) — คืน id ชุดใหม่ หรือ null
 */
export async function splitSeries(
  id: number,
  from: string,
  head: { endDate: string; dates: string[] | null },
  tail: Omit<Activity, 'id'> | null,
): Promise<number | null> {
  let newId: number | null = null;
  await getDb().withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('UPDATE activities SET end_date=?, dates=? WHERE id=?', head.endDate, encodeDates(head.dates), id);
    if (tail) {
      newId = await insertActivityRow(txn, tail);
      await setActivityContacts(txn, newId, tail.contactIds);
      await txn.runAsync('UPDATE occurrences SET activity_id=? WHERE activity_id=? AND date >= ?', newId, id, from);
      await txn.runAsync('UPDATE occ_notes SET activity_id=? WHERE activity_id=? AND date >= ?', newId, id, from);
    } else {
      await txn.runAsync('DELETE FROM occurrences WHERE activity_id=? AND date >= ?', id, from);
      await txn.runAsync('DELETE FROM occ_notes WHERE activity_id=? AND date >= ?', id, from);
    }
  });
  return newId;
}

/**
 * แก้ไข "เฉพาะครั้งนี้" ของชุดทำซ้ำ — ยกเลิกวันนั้นในชุดเดิม แล้วสร้างกิจกรรมครั้งเดียวแทน (ใน transaction เดียว)
 * carry = สถานะรายวันเดิม (ทำแล้ว/ข้าม) ที่ยกไปให้กิจกรรมใหม่ ไม่ให้ประวัติหาย
 */
export async function detachOccurrence(
  id: number,
  date: string,
  one: Omit<Activity, 'id'>,
  carry: OccStatus | null,
): Promise<number> {
  let newId = 0;
  await getDb().withExclusiveTransactionAsync(async (txn) => {
    newId = await insertActivityRow(txn, one);
    await setActivityContacts(txn, newId, one.contactIds);
    await txn.runAsync(
      "INSERT INTO occurrences (activity_id, date, status) VALUES (?,?,'cancelled') ON CONFLICT DO UPDATE SET status=excluded.status",
      id, date,
    );
    if (carry) await txn.runAsync('INSERT INTO occurrences (activity_id, date, status) VALUES (?,?,?)', newId, date, carry);
    // โน้ตของวันนั้นตามไปอยู่กับกิจกรรมครั้งเดียวที่แยกออกมา
    await txn.runAsync('UPDATE occ_notes SET activity_id=? WHERE activity_id=? AND date=?', newId, id, date);
  });
  return newId;
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

/** โน้ตของครั้งหนึ่ง: null/ว่าง = ลบโน้ต */
export async function setOccNote(activityId: number, date: string, note: string | null): Promise<void> {
  const d = getDb();
  if (!note || !note.trim()) {
    await d.runAsync('DELETE FROM occ_notes WHERE activity_id=? AND date=?', activityId, date);
  } else {
    await d.runAsync(
      'INSERT INTO occ_notes (activity_id, date, note) VALUES (?,?,?) ON CONFLICT DO UPDATE SET note=excluded.note',
      activityId, date, note.trim(),
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
    await d.runAsync(
      'UPDATE contacts SET name=?, priority=?, phone=?, line=?, email=?, zoom=?, googlemeet=?, note=?, org=? WHERE id=?',
      c.name, c.priority, c.phone, c.line, c.email ?? null, c.zoom ?? null, c.googlemeet ?? null, c.note ?? null, c.org ?? null, c.id,
    );
    return c.id;
  }
  const res = await d.runAsync(
    'INSERT INTO contacts (name, priority, phone, line, email, zoom, googlemeet, note, org) VALUES (?,?,?,?,?,?,?,?,?)',
    c.name, c.priority, c.phone, c.line, c.email ?? null, c.zoom ?? null, c.googlemeet ?? null, c.note ?? null, c.org ?? null,
  );
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
    await withStatement(txn, INSERT_ACTIVITY_SQL, async (run) => {
      for (const a of list) await run(...activityParams(a));
    });
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
    await txn.runAsync('DELETE FROM occ_notes WHERE date BETWEEN ? AND ?', from, to);
    await txn.runAsync(
      'DELETE FROM reschedule_logs WHERE (from_date BETWEEN ? AND ?) OR (to_date BETWEEN ? AND ?)',
      from, to, from, to,
    );

    // ลบทั้งแถว: ครั้งเดียวในช่วง + series ที่อยู่ในกรอบทั้งช่วงชีวิต
    // ลบเป็นชุดด้วยเงื่อนไขเดียว (ไม่วนลบทีละ id — นำเข้า "แทนที่ช่วงนี้" หลายเดือนมีหลายพันแถว)
    const gone = `SELECT id FROM activities
       WHERE (repeat='none' AND start_date BETWEEN ? AND ?)
          OR (repeat!='none' AND start_date >= ? AND end_date IS NOT NULL AND end_date <= ?)`;
    for (const table of ['activity_contacts', 'occurrences', 'occ_notes', 'reschedule_logs']) {
      await txn.runAsync(`DELETE FROM ${table} WHERE activity_id IN (${gone})`, from, to, from, to);
    }
    await txn.runAsync(`DELETE FROM activities WHERE id IN (${gone})`, from, to, from, to);

    const before = addDays(from, -1);
    const after = addDays(to, 1);
    const spanning = await txn.getAllAsync<ActivityRow>(
      "SELECT * FROM activities WHERE repeat!='none' AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)",
      to, from,
    );
    for (const a of spanning) {
      const headBefore = a.start_date < from;
      const tailAfter = a.end_date === null || a.end_date > to;
      // ชุด "เลือกเอง" ที่มีรายการวันที่ — ตัดรายการให้ตรงกับท่อนที่เหลือด้วย ไม่งั้นวันในกรอบที่ลบจะยังโผล่
      const list = decodeDates(a.dates);
      const headDates = list ? encodeDates(list.filter((x) => x < from)) : null;
      const tailDates = list ? encodeDates(list.filter((x) => x > to)) : null;
      if (headBefore && tailAfter) {
        // คร่อมทั้งกรอบ — ท่อนแรกจบก่อนกรอบ, ท่อนหลังเริ่มหลังกรอบ (สำเนาแถว + ย้าย exception ฝั่งหลังตาม)
        await txn.runAsync('UPDATE activities SET end_date=?, dates=? WHERE id=?', before, headDates, a.id);
        const res = await txn.runAsync(
          `INSERT INTO activities (title, cat, sub, loc, channel, priority, start_min, end_min,
             repeat, days_mask, dates, start_date, end_date, notify, notify_before, detached_from, status, color, inline_contact)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          a.title, a.cat, a.sub, a.loc, a.channel, a.priority, a.start_min, a.end_min,
          a.repeat, a.days_mask, tailDates, after, a.end_date, a.notify, a.notify_before, a.detached_from, a.status,
          a.color, a.inline_contact ?? null,
        );
        const newId = res.lastInsertRowId;
        await txn.runAsync('UPDATE occurrences SET activity_id=? WHERE activity_id=? AND date > ?', newId, a.id, to);
        await txn.runAsync('UPDATE occ_notes SET activity_id=? WHERE activity_id=? AND date > ?', newId, a.id, to);
        const links = await txn.getAllAsync<{ contact_id: number }>(
          'SELECT contact_id FROM activity_contacts WHERE activity_id=?', a.id,
        );
        for (const l of links) {
          await txn.runAsync('INSERT OR IGNORE INTO activity_contacts (activity_id, contact_id) VALUES (?,?)', newId, l.contact_id);
        }
      } else if (headBefore) {
        await txn.runAsync('UPDATE activities SET end_date=?, dates=? WHERE id=?', before, headDates, a.id);
      } else if (tailAfter) {
        await txn.runAsync('UPDATE activities SET start_date=?, dates=? WHERE id=?', after, tailDates, a.id);
      }
    }
  });
}

// ---------- Export / Import (§6.5) ----------

interface RescheduleLogRow {
  activity_id: number;
  from_date: string;
  from_start: number;
  to_date: string;
  to_start: number;
  reason: string | null;
  created_at?: string;
}

export interface BackupData {
  version: 1;
  activities: ActivityRow[];
  occurrences: { activity_id: number; date: string; status: string }[];
  contacts: Contact[];
  activity_contacts: { activity_id: number; contact_id: number }[];
  reschedule_logs: RescheduleLogRow[];
  /** v6 — สำรองรุ่นเก่าไม่มีฟิลด์นี้ */
  occ_notes?: { activity_id: number; date: string; note: string }[];
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
    occ_notes: await d.getAllAsync('SELECT * FROM occ_notes'),
  } as BackupData;
}

/** กู้คืน JSON — mode 'replace' ล้างก่อน / 'merge' เพิ่มต่อ (id ใหม่) — ทำใน transaction เดียว */
export async function restoreAll(data: BackupData, mode: 'replace' | 'merge'): Promise<void> {
  const d = getDb();
  await d.withExclusiveTransactionAsync(async (txn) => {
    if (mode === 'replace') {
      await txn.execAsync(
        'DELETE FROM activity_contacts; DELETE FROM occurrences; DELETE FROM occ_notes; DELETE FROM reschedule_logs; DELETE FROM activities; DELETE FROM contacts;',
      );
    }
    const contactIdMap: Record<number, number> = {};
    // รวมข้อมูล: รายชื่อที่มีอยู่แล้ว (ชื่อ + เบอร์ตรงกัน) ใช้ของเดิม — กู้ไฟล์เดิมซ้ำแล้วรายชื่อไม่งอกซ้ำ
    const contactKey = (name: string, phone: string | null) => `${name.trim()}|${phone?.trim() ?? ''}`;
    const existing = new Map<string, number>();
    if (mode === 'merge') {
      const rows = await txn.getAllAsync<{ id: number; name: string; phone: string | null }>('SELECT id, name, phone FROM contacts');
      for (const r of rows) existing.set(contactKey(r.name, r.phone), r.id);
    }
    await withStatement(
      txn,
      'INSERT INTO contacts (name, priority, phone, line, email, zoom, googlemeet, note, org) VALUES (?,?,?,?,?,?,?,?,?)',
      async (run) => {
        for (const c of data.contacts) {
          const same = existing.get(contactKey(c.name, c.phone));
          if (same !== undefined) {
            contactIdMap[c.id] = same;
            continue;
          }
          const res = await run(c.name, c.priority, c.phone, c.line, c.email ?? null, c.zoom ?? null, c.googlemeet ?? null, c.note ?? null, c.org ?? null);
          contactIdMap[c.id] = res.lastInsertRowId;
        }
      },
    );
    const actIdMap: Record<number, number> = {};
    await withStatement(
      txn,
      `INSERT INTO activities (title, cat, sub, loc, channel, priority, start_min, end_min,
         repeat, days_mask, dates, start_date, end_date, notify, notify_before, detached_from, status, color, inline_contact)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,?,?)`,
      async (run) => {
        for (const a of data.activities) {
          const res = await run(
            a.title, a.cat, a.sub, a.loc, a.channel, a.priority, a.start_min, a.end_min,
            a.repeat, a.days_mask, a.dates ?? null, a.start_date, a.end_date, a.notify, a.notify_before, a.status,
            a.color ?? null, a.inline_contact ?? null,
          );
          actIdMap[a.id] = res.lastInsertRowId;
        }
      },
    );
    // ลิงก์ "เลื่อนมา/แยกจาก" นัดเดิม — แปลงเป็น id ใหม่หลังใส่ครบทุกแถวแล้ว (แถวต้นทางอาจอยู่หลังในไฟล์)
    await withStatement(txn, 'UPDATE activities SET detached_from=? WHERE id=?', async (run) => {
      for (const a of data.activities) {
        const from = a.detached_from != null ? actIdMap[a.detached_from] : undefined;
        if (from) await run(from, actIdMap[a.id]);
      }
    });
    // ประวัติการเลื่อนนัด (ตัวนับ "เลื่อนมาแล้ว N ครั้ง")
    await withStatement(
      txn,
      'INSERT INTO reschedule_logs (activity_id, from_date, from_start, to_date, to_start, reason, created_at) VALUES (?,?,?,?,?,?,?)',
      async (run) => {
        for (const l of data.reschedule_logs ?? []) {
          const id = actIdMap[l.activity_id];
          if (!id) continue;
          await run(id, l.from_date, l.from_start, l.to_date, l.to_start, l.reason ?? null, l.created_at ?? new Date().toISOString().slice(0, 19).replace('T', ' '));
        }
      },
    );
    await withStatement(txn, 'INSERT OR REPLACE INTO occurrences (activity_id, date, status) VALUES (?,?,?)', async (run) => {
      for (const o of data.occurrences) {
        const id = actIdMap[o.activity_id];
        if (id) await run(id, o.date, o.status);
      }
    });
    await withStatement(txn, 'INSERT OR REPLACE INTO occ_notes (activity_id, date, note) VALUES (?,?,?)', async (run) => {
      for (const n of data.occ_notes ?? []) {
        const id = actIdMap[n.activity_id];
        if (id && n.note) await run(id, n.date, n.note);
      }
    });
    await withStatement(txn, 'INSERT OR IGNORE INTO activity_contacts (activity_id, contact_id) VALUES (?,?)', async (run) => {
      for (const l of data.activity_contacts) {
        const a = actIdMap[l.activity_id];
        const c = contactIdMap[l.contact_id];
        if (a && c) await run(a, c);
      }
    });
  });
}
