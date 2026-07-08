# System Design V2 — Daily Routine Planner

> ออกแบบระบบจากโครงสร้าง 4 แท็บที่ยืนยันแล้วใน `APP_STRUCTURE.md`
> **แทนที่** `SYSTEM_DESIGN.md` เดิมทั้งไฟล์ — ใช้ไฟล์นี้ + `APP_STRUCTURE.md` เป็นสเปกคู่กัน:
> - `APP_STRUCTURE.md` = *อะไร* (หน้าจอ, UX flow, ข้อสรุปการออกแบบ)
> - `SYSTEM_DESIGN_V2.md` = *อย่างไร* (สถาปัตยกรรม, data model, อัลกอริทึม, edge cases)

---

## 1. ภาพรวมระบบ

**แอป:** Daily Routine Planner — "ตารางชีวิตจอย"
วางแผนชีวิตประจำวันแทนตาราง Excel เดิม (`Time Table จอย - Time Table.csv`)

| คุณสมบัติ | ค่า |
|---|---|
| ผู้ใช้ | คนเดียว (single user, ไม่มี login) |
| การทำงาน | **Offline-first** — ทุกฟีเจอร์ทำงานได้โดยไม่มีเน็ต ยกเว้นส่งออก Google Sheets |
| ข้อมูล | เก็บในเครื่องทั้งหมด (AsyncStorage → SQLite) ไม่มี backend/cloud |
| ภาษา | ไทยเป็นหลัก (มีคำอังกฤษปนตามพฤติกรรมผู้ใช้เดิม) |
| แพลตฟอร์ม | iOS + Android ผ่าน Expo SDK 57 / ทดสอบด้วย Expo Go |

**ความสามารถหลัก (จาก 4 แท็บ):**

1. แสดง/แก้ไข/ลบกิจกรรม — มุมมอง วัน/สัปดาห์/เดือน
2. เพิ่มกิจกรรมแบบ stepper 3 ขั้น (หมวด → ชื่อ → วันเวลา+แจ้งเตือน) ฟอร์มปรับตามหมวด
3. สรุปวันว่าง (Free Slot Engine) + สรุปเคสนัด (หมวดงานธุรกิจ/ทีม พร้อม priority P1–P6)
4. ตั้งค่า: สถิติ / จัดการหมวด / แจ้งเตือน / ธีม / Export-Import-Google Sheets (ทางเดียว)
5. เลื่อนนัดพร้อมแนะนำเวลาว่างอัตโนมัติ (Reschedule Flow)

---

## 2. สถาปัตยกรรม (Layered Architecture)

```
┌─────────────────────────────────────────────────────────┐
│  UI Layer — expo-router screens + components             │
│  (tabs)/index · add · summary · settings/* ·             │
│  activity/[id] · contact/[id] · reschedule/[id]          │
├─────────────────────────────────────────────────────────┤
│  State Layer — React Context + hooks (เฟสแรก)            │
│  useActivities() useInstances(range) useContacts()        │
│  useCategories() useSettings() useStats(range)            │
├─────────────────────────────────────────────────────────┤
│  Domain Layer — pure TypeScript, ไม่แตะ React/IO          │
│  ├─ RecurrenceEngine   สร้าง instance จาก rule            │
│  ├─ FreeSlotEngine     หา slot ว่าง + จัดอันดับ            │
│  ├─ StatsEngine        % สำเร็จ, streak, ชั่วโมง/หมวด      │
│  ├─ RescheduleService  เลื่อนนัด + log                    │
│  └─ ExportService      CSV / JSON / Sheets payload        │
├─────────────────────────────────────────────────────────┤
│  Infra Layer — ติดต่อเครื่อง/ภายนอก                        │
│  ├─ Storage (AsyncStorage repo → SQLite ภายหลัง)          │
│  ├─ NotificationScheduler (expo-notifications)            │
│  ├─ FileIO (expo-file-system + expo-sharing / picker)     │
│  └─ GoogleSheetsClient (expo-auth-session + Sheets API)   │
└─────────────────────────────────────────────────────────┘
```

**กติกาสำคัญ:**

- **Domain Layer เป็น pure function ทั้งหมด** — รับ data เข้า คืน data ออก ไม่อ่าน storage เอง ไม่เรียก API → เทสต์ง่าย, ย้ายไป SQLite ได้โดยไม่แก้ logic
- UI ไม่เรียก Storage ตรง — ผ่าน hooks ใน State Layer เท่านั้น
- การเปลี่ยนข้อมูลทุกครั้งวิ่งทางเดียว: `UI action → hook → domain function → storage write → state update → re-render`

### โครงสร้างโฟลเดอร์

```
src/
├── app/                      # expo-router (ตาม Navigation Map ใน APP_STRUCTURE.md §8)
├── components/               # TimelineDay, WeekGrid, MonthCalendar, ActivitySheet,
│                             # CategoryGrid, StepperForm, SlotList, PriorityBadge, ...
├── domain/
│   ├── types.ts              # ทุก type ใน §4
│   ├── recurrence.ts         # RecurrenceEngine
│   ├── freeSlot.ts           # FreeSlotEngine
│   ├── stats.ts              # StatsEngine
│   ├── reschedule.ts         # RescheduleService
│   └── export.ts             # ExportService (CSV/JSON/Sheets rows)
├── infra/
│   ├── storage.ts            # Repository ครอบ AsyncStorage
│   ├── notifications.ts      # NotificationScheduler
│   ├── fileIO.ts
│   └── googleSheets.ts
├── state/
│   ├── AppProvider.tsx       # Context รวม
│   └── hooks/                # useActivities, useInstances, ...
└── constants/
    ├── theme.ts
    └── seedData.ts           # หมวดเริ่มต้น 6 หมวด + priority P1–P6 + quick-pick chips
```

---

## 3. Tech Stack

| ส่วน | เครื่องมือ | หมายเหตุ |
|---|---|---|
| Framework | React Native + **Expo SDK 57** | docs: https://docs.expo.dev/versions/v57.0.0/ |
| ภาษา | TypeScript (strict) | |
| Navigation | expo-router | tabs + modal routes |
| State | React Context + hooks | เฟสแรกพอ — ถ้าซับซ้อนขึ้นค่อยพิจารณา zustand |
| Storage | `@react-native-async-storage/async-storage` → `expo-sqlite` | เกณฑ์ย้าย: ดู §5.3 |
| แจ้งเตือน | `expo-notifications` (local only) | ข้อจำกัด iOS ~64 รายการ — ดู §6.3 |
| ไฟล์/แชร์ | `expo-file-system` + `expo-sharing` + `expo-document-picker` | Export/Import |
| Google OAuth | `expo-auth-session` + Google Sheets API v4 | ส่งออกทางเดียว — ดู §6.5 |
| วันเวลา | คำนวณเองด้วย util ล้วน ๆ (ไม่พึ่ง lib หนัก) | เก็บเป็น string ท้องถิ่น — ดู §4.1 |

---

## 4. Data Model (TypeScript)

### 4.1 หลักการเรื่องวันเวลา

- **เก็บวันที่เป็น string `"YYYY-MM-DD"` และเวลาเป็น `"HH:mm"`** (เวลาท้องถิ่นเสมอ ไม่ใช้ UTC/ISO timestamp) — แอปนี้คือ "ตารางชีวิต" ผูกกับนาฬิกาท้องถิ่น ถ้าเก็บ UTC จะเพี้ยนตอนเปลี่ยน timezone
- **Logical Day: วันของแอปเริ่ม 04:00 → 03:59 ของวันถัดไป** — กิจกรรม `go to bed 01:00` นับเป็นคืนของวันเดิม
  - util กลาง: `toLogicalDate(date, time)` — ถ้า `time < "04:00"` ให้ถือเป็นของ `date` (วันที่ตาราง) แต่เวลาจริงคือวันถัดไป — ทุกส่วนของระบบ (แสดงผล, free slot, แจ้งเตือน, สถิติ) ต้องเรียก util นี้ ห้ามคำนวณเอง
  - เวลาที่ > 24:00 ในเชิง logic เก็บเป็น `"25:00"` = 01:00 วันถัดไป (ตาราง sort ง่าย) แล้วแปลงเป็นเวลาจริงเฉพาะตอนตั้งแจ้งเตือน
- ทุกเวลา **snap 15 นาที** — validate ที่ชั้น form และ domain

### 4.2 Types

```typescript
// ---------- หมวดหมู่ ----------
interface Category {
  id: string;
  name: string;               // "กิจวัตรประจำวัน", "งานธุรกิจ/ทีม", ...
  color: string;              // hex
  icon: string;               // emoji
  isCaseCategory: boolean;    // true เฉพาะ "งานธุรกิจ/ทีม" → เปิดฟิลด์เคส + ปุ่มเลื่อนนัด
  defaults: {                 // ค่าเริ่มต้นขั้น 2.3 (แก้ได้ในจัดการหมวดหมู่)
    repeat: RepeatRule['kind'];
    horizon?: Horizon;
    startTime?: string;       // "18:00"
    endTime?: string;
  };
  quickPicks: string[];       // chips ตั้งต้น — ภายหลังเติมจากชื่อที่ใช้บ่อย
  sortOrder: number;
  deletable: boolean;         // หมวด seed ลบได้ แต่ต้องย้ายกิจกรรมก่อน
}

// ---------- การทำซ้ำ ----------
type RepeatRule =
  | { kind: 'none' }                          // ครั้งเดียว
  | { kind: 'daily' }                         // ทุกวัน
  | { kind: 'weekend' }                       // เฉพาะ ส-อา
  | { kind: 'weekday' }                       // จ-ศ (ไม่เอา ส-อา)
  | { kind: 'custom'; days: Weekday[] };      // เลือกวันเอง

type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;     // 0 = อาทิตย์
type Horizon = '1w' | '2w' | '1m' | '6m' | '1y';

// ---------- กิจกรรม (แม่แบบ/rule) ----------
interface Activity {
  id: string;
  title: string;
  detail?: string;
  categoryId: string;
  location?: string;          // หมวดงานประจำ/งานอื่น ๆ
  subType?: string;           // หมวด 3: cardio|weight|class · หมวด 5: book|audio|class
  startTime: string;          // "HH:mm" (logical, ได้ถึง "27:59")
  endTime: string;
  repeat: RepeatRule;
  startDate: string;          // "YYYY-MM-DD"
  horizon?: Horizon;          // มีเมื่อ repeat.kind !== 'none'
  endDate: string;            // คำนวณจาก startDate + horizon (denormalized ไว้ query)
  notifyEnabled: boolean;     // default true
  notifyBeforeMin: number;    // default 30, สเต็ป 15, กำหนดเองได้
  caseInfo?: CaseInfo;        // เฉพาะหมวดที่ isCaseCategory
  createdAt: string;
  updatedAt: string;
}

interface CaseInfo {
  contactIds: string[];       // นัดกลุ่มได้ ≥ 1 คน
  channel: 'online' | 'inperson';
}

// ---------- instance รายวัน ----------
type InstanceStatus = 'planned' | 'done' | 'skipped' | 'rescheduled' | 'cancelled';

interface ActivityInstance {
  id: string;                 // `${activityId}:${date}` — deterministic กัน generate ซ้ำ
  activityId: string;
  date: string;               // logical date "YYYY-MM-DD"
  startTime: string;          // copy จาก Activity ตอน generate
  endTime: string;
  status: InstanceStatus;
  detached: boolean;          // true = ถูกแก้เดี่ยว rule regenerate ห้ามทับ
  note?: string;
  doneAt?: string;
}

// ---------- สมุดรายชื่อ ----------
type PriorityLevel = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6';

interface Contact {
  id: string;
  name: string;
  priority: PriorityLevel;    // ติดที่ตัวคน — นัดใหม่ได้ priority อัตโนมัติ
  phone?: string;
  lineId?: string;
  note?: string;
  createdAt: string;
}

interface PriorityDef {       // แก้ชื่อ/สีได้ในตั้งค่า > จัดการหมวดหมู่
  level: PriorityLevel;
  label: string;              // "คนใหม่ / มีปัญหา — 1st Priority"
  color: string;
}

// ---------- log การเลื่อนนัด ----------
interface RescheduleLog {
  id: string;
  instanceId: string;         // instance เดิมที่ถูกเลื่อน
  newInstanceId: string;      // instance ใหม่ที่สร้าง
  contactIds: string[];       // denormalized ไว้ query "คนนี้เลื่อนกี่ครั้ง" เร็ว ๆ
  fromDate: string; fromTime: string;
  toDate: string;   toTime: string;
  reason?: string;
  createdAt: string;
}

// ---------- ตั้งค่า ----------
interface Settings {
  notificationsMaster: boolean;      // สวิตช์รวม
  defaultNotifyBeforeMin: number;    // 30
  morningSummary: { enabled: boolean; time: string };  // 06:00
  sound: boolean; vibrate: boolean;
  theme: 'light' | 'dark' | 'system';
  googleAccount?: { email: string; spreadsheetId?: string };
}
```

### 4.3 กติกาความสัมพันธ์

- ลบ `Activity` → ลบ instance ทั้งหมดของมัน + ยกเลิกแจ้งเตือนที่ตั้งไว้
- ลบ `Contact` ที่มีนัดอยู่ → เตือนก่อน; นัดเก่ายังเก็บ contactId ไว้ (แสดงเป็น "รายชื่อที่ถูกลบ")
- ลบ `Category` → บังคับย้ายกิจกรรมไปหมวดอื่นก่อน (UI ใน 6.2 ของ APP_STRUCTURE)
- แก้ `Activity` ทั้งชุด → regenerate instance ที่ `status === 'planned' && !detached` เท่านั้น — instance ที่ done/skipped/เลื่อนแล้ว/แก้เดี่ยว ไม่โดนแตะ

---

## 5. Storage Design

### 5.1 เฟสแรก — AsyncStorage (JSON per collection)

| Key | ค่า |
|---|---|
| `drp:categories` | `Category[]` |
| `drp:activities` | `Activity[]` |
| `drp:instances:<YYYY-MM>` | `ActivityInstance[]` **แบ่งไฟล์รายเดือน** — โหลดเฉพาะเดือนที่ดู ไม่ต้องอ่านทั้งปี |
| `drp:contacts` | `Contact[]` |
| `drp:priorityDefs` | `PriorityDef[]` |
| `drp:rescheduleLogs` | `RescheduleLog[]` |
| `drp:settings` | `Settings` |
| `drp:meta` | `{ schemaVersion, lastWindowGeneratedTo, lastBackupAt }` |

- ทุก write ผ่าน `storage.ts` (repository) — ที่เดียวที่รู้จัก key เหล่านี้
- `schemaVersion` + migration function ตั้งแต่วันแรก (กันปวดหัวตอนเพิ่มฟิลด์)
- Auto-backup: เขียน snapshot JSON ลง `FileSystem.documentDirectory` สัปดาห์ละครั้ง (กัน AsyncStorage พังแล้วข้อมูลหายทั้งหมด)

### 5.2 การอ่านหลัก ๆ ต่อหน้าจอ

| หน้าจอ | อ่าน |
|---|---|
| แท็บ 1 โหมดวัน | `instances:<เดือน>` filter ตาม date + join `activities`, `categories` |
| แท็บ 1 โหมดสัปดาห์/เดือน | `instances:<เดือน>` (อาจ 2 key ถ้าคร่อมเดือน) |
| แท็บ 3 วันว่าง | เท่ากับข้างบน → ส่งเข้า FreeSlotEngine |
| แท็บ 3 สรุปเคส | instances ของหมวด case + `contacts` + `rescheduleLogs` |
| สถิติ | instances ช่วงที่เลือก (โหลดทีละเดือน วนรวม) |

### 5.3 เกณฑ์ย้ายไป SQLite (`expo-sqlite`)

ย้ายเมื่อข้อใดข้อหนึ่งจริง: (ก) สถิติช่วง "ปีนี้" เริ่มช้ากว่า ~1 วินาที (ข) instances เกิน ~10,000 แถว (ค) ต้อง query ข้าม collection ซับซ้อนขึ้น — ตอนย้ายเปลี่ยนเฉพาะ `infra/storage.ts` เพราะ Domain Layer ไม่รู้จัก storage

---

## 6. Core Engines (อัลกอริทึม)

### 6.1 RecurrenceEngine — สร้าง instance แบบ rolling window

**ปัญหา:** "ทุกวัน × 1 ปี" = 365 instance — สร้างหมดทีเดียวข้อมูลบวม + iOS จำกัดแจ้งเตือน

**ทางแก้:** เก็บ rule ที่ `Activity` แล้ว generate instance ล่วงหน้าแค่ **60 วัน** (`WINDOW_DAYS = 60`)

```
generateWindow(activities, existingInstances, today):
  target = min(today + 60d, activity.endDate)  ต่อกิจกรรม
  for แต่ละ activity ที่ repeat ≠ none:
    for แต่ละวันใน [lastWindowGeneratedTo+1 .. target] ที่ตรง RepeatRule:
      id = `${activity.id}:${date}`
      ถ้า id ยังไม่มีใน existingInstances → สร้าง status='planned'
      (id deterministic → generate ซ้ำกี่รอบก็ไม่เบิ้ล)
  update meta.lastWindowGeneratedTo = today + 60d
```

**จุดเรียก:** เปิดแอป (app foreground) + หลังสร้าง/แก้กิจกรรม + เมื่อผู้ใช้เลื่อนดูวันเกิน window (generate เฉพาะกิจกรรมที่เกี่ยวข้องแบบ on-demand ให้มุมมองเดือน/สัปดาห์อนาคตไม่ว่างเปล่า)

**แก้/ลบ "เฉพาะครั้งนี้" vs "ทั้งชุด":**

- เฉพาะครั้งนี้ → set `detached = true` แล้วแก้ instance นั้น (หรือ status = cancelled ถ้าลบ)
- ทั้งชุด → แก้ `Activity` + regenerate เฉพาะ instance `planned && !detached`

### 6.2 FreeSlotEngine — หาเวลาว่าง

ใช้ 2 ที่: แท็บ 3 โหมดวันว่าง และ Reschedule Flow

```
freeSlots(date, instances, opts?):
  timeline = ช่อง 15 นาที ตั้งแต่ 06:00 → 02:30 (logical)
  หักช่องที่มี instance (status = planned|done) ทับอยู่
  รวมช่องว่างต่อเนื่อง → [{start, end, durationMin}]
  ถ้า opts.minDuration → กรองช่วงที่สั้นกว่าออก

rankSlots(slots, original: {time, duration, priority}):        // สำหรับเลื่อนนัด
  คะแนน = เวลาตรงกับนัดเดิม (+3) · วันใกล้วันนี้ (+2/-ตามระยะ)
         · เคส P1 → boost slot ที่เร็วที่สุด (+2)
  คืน top 10 + ปุ่มดูเพิ่ม
```

- ความเร็ว: วันละ ~84 ช่อง × ช่วงค้นหา ≤ 14 วัน — คำนวณสด ไม่ต้อง cache
- โหมดเดือน (heatmap ว่าง): นับ `ชั่วโมงว่าง/วัน` = `20.5h - ชั่วโมงที่มีกิจกรรม` แสดงเฉดเขียว

### 6.3 NotificationScheduler — จัดคิวแจ้งเตือนใต้ลิมิต iOS

**ข้อจำกัด:** iOS เก็บ pending local notification ได้ ~64 รายการ / กิจกรรมทำซ้ำของแอปนี้เกินแน่นอน

**ทางแก้ — "budget 50":** ตั้งแจ้งเตือนล่วงหน้าแค่ช่วงใกล้ แล้วเติมใหม่ทุกครั้งที่เปิดแอป

```
syncNotifications(instances, settings, now):
  ถ้า !settings.notificationsMaster → cancelAll, จบ
  cancelAll()                                  // เคลียร์แล้วตั้งใหม่ ง่ายกว่า diff
  candidates = instances ที่ status='planned'
               && activity.notifyEnabled
               && fireTime(instance) > now      // fireTime = จริง (แปลง logical → real date)
  เรียงตาม fireTime → เอา 49 รายการแรก → scheduleNotificationAsync ทีละอัน
  + 1 รายการ morning summary (ถ้าเปิด) = ไม่เกิน 50
```

- `fireTime = start(real) - notifyBeforeMin`
- เนื้อหา: `"อีก 30 นาที: นัดเคส คุณเอ (18:00)"` — เคสแนบชื่อ contact + ป้าย priority
- จุดเรียก sync: เปิดแอป, CRUD กิจกรรม, เลื่อนนัด, เปลี่ยน settings แจ้งเตือน
- Android: ขอ permission + สร้าง notification channel ตอน onboarding

### 6.4 StatsEngine

```
stats(range):
  instances = โหลดช่วง range (เฉพาะวันที่ ≤ วันนี้)
  successRate = done / (done + planned(เลยเวลา) + skipped)     // ไม่นับ cancelled/rescheduled
  streak      = จำนวนวันติดกันย้อนจากวันนี้ที่ successRate วันนั้น ≥ 80%
  hoursPerCategory = Σ duration ของ instance done จัดกลุ่มตามหมวด
  trendPerDay = จำนวน instance ต่อวัน (กราฟเส้น)
  caseStats   = นัดหมวด case: total/done/rescheduled แยกตาม priority
```

- ช่วงเวลา: สัปดาห์นี้ / เดือนนี้ / ปีนี้ / กำหนดเอง (date range picker)
- instance วันอนาคตไม่ถูกนับใน % สำเร็จ (ยังไม่ถึงเวลาทำ)

### 6.5 ExportService

| รูปแบบ | รายละเอียด |
|---|---|
| **CSV** | ฟอร์แมตเดียวกับ Excel เดิม: แถว = ช่วงเวลา 30 นาที, คอลัมน์ = วันในเดือน จัดกลุ่ม WEEK 1–4, cell = ชื่อกิจกรรม — เลือกเดือนที่จะ export → `expo-sharing` share sheet |
| **JSON** | dump ทุก collection + schemaVersion = backup เต็มรูปแบบ |
| **Import** | รับ JSON (restore เต็ม) — เลือก `merge` (id ชนกันให้ของไฟล์ชนะ) หรือ `replace` (ล้างก่อนใส่) / รับ CSV ฟอร์แมตเดิม → parse เป็นกิจกรรมครั้งเดียวรายวัน (best-effort, รายงานแถวที่อ่านไม่ได้) |
| **Google Sheets** | **ทางเดียว (push only):** OAuth ด้วย `expo-auth-session` scope `spreadsheets` → ครั้งแรก `spreadsheets.create` เก็บ `spreadsheetId` ใน settings → ครั้งถัดไป `values.update` ทับ sheet ของเดือนนั้น (1 เดือน = 1 sheet tab, ฟอร์แมตเดียวกับ CSV) — ไม่อ่านค่ากลับเข้าแอป |

> ข้อจำกัด Expo Go: Google OAuth ต้องใช้ redirect ผ่าน `auth.expo.io` proxy หรือทดสอบใน development build — วางไว้เฟสท้าย (§9)

---

## 7. Key Flows (ลำดับการทำงานสำคัญ)

### 7.1 เปิดแอป (cold start / foreground)

```
1. โหลด settings + categories + contacts
2. migrate schema ถ้า schemaVersion เก่า
3. RecurrenceEngine.generateWindow()          → เติม instance ถึง today+60d
4. NotificationScheduler.syncNotifications()  → ตั้งคิวแจ้งเตือน ≤ 50
5. โหลด instances เดือนปัจจุบัน → render แท็บ 1 โหมดวัน (วันนี้)
6. auto-backup ถ้าเกิน 7 วันจากครั้งล่าสุด (background, ไม่ block UI)
```

### 7.2 เพิ่มกิจกรรม (แท็บ 2)

```
เลือกหมวด → ฟอร์ม 2.2 (ฟิลด์ตามหมวด) → ฟอร์ม 2.3 (default จาก category.defaults)
→ [บันทึก]:
   1. validate: ชื่อไม่ว่าง, เวลา snap 15 นาที, end > start, repeat+horizon ครบ
   2. เตือนถ้าเวลาชนกิจกรรมเดิม (แสดง "ทับกับ work 09:00–18:00" — บันทึกต่อได้ ไม่ห้าม)
   3. สร้าง Activity → generateWindow เฉพาะตัวนี้ → syncNotifications
   4. navigate ไปแท็บ 1 วันแรกของกิจกรรม + toast "เพิ่มแล้ว"
```

### 7.3 เลื่อนนัด (Reschedule Flow — เฉพาะหมวด case)

```
Bottom Sheet [⏭ เลื่อนนัด] →
1. modal: เหตุผล (optional) + ช่วงค้นหา (3 วัน/สัปดาห์นี้/สัปดาห์หน้า/กำหนดเอง)
2. FreeSlotEngine.freeSlots(ทุกวันในช่วง, minDuration = duration นัดเดิม)
   → rankSlots(ตาม priority ของเคส) → แสดง list
   → ว่างไม่พอ: เสนอขยายช่วง
3. เลือก slot → ยืนยัน:
   - instance เดิม: status = 'rescheduled'
   - สร้าง instance ใหม่ (detached = true, ผูก activityId เดิม) ใน slot ที่เลือก
   - เขียน RescheduleLog (from/to/reason/contactIds)
   - syncNotifications (ย้ายแจ้งเตือนอัตโนมัติ)
```

### 7.4 ติ๊กทำแล้ว / ลบ

```
[✓ ทำแล้ว]  → status='done', doneAt=now → อัปเดต progress วัน + สถิติ
[🗑 ลบ] กิจกรรมทำซ้ำ → ถาม:
   เฉพาะครั้งนี้ → instance.status='cancelled' (detached=true)
   ทั้งชุด      → ลบ Activity + instances ทุก status='planned' + cancel แจ้งเตือน
                  (instance ที่ done แล้วเก็บไว้ — ประวัติ/สถิติไม่หาย)
```

---

## 8. Edge Cases & กติกาที่ตัดสินแล้ว

| # | กรณี | กติกา |
|---|---|---|
| 1 | กิจกรรมข้ามเที่ยงคืน (23:30–01:00) | เก็บเป็น logical time ("23:30"–"25:00") อยู่ในวันตารางเดิม — แจ้งเตือน/แสดงผลแปลงเป็นเวลาจริงตอนใช้ |
| 2 | กิจกรรมทับเวลากัน | **อนุญาต** (Excel เดิมก็มี) — timeline แสดงบล็อกแบ่งครึ่งความกว้าง, ตอนเพิ่มมีคำเตือน, FreeSlotEngine ถือว่าช่วงนั้นไม่ว่าง |
| 3 | แก้กิจกรรมทั้งชุดที่มีบาง instance done แล้ว | instance done/skipped/detached ไม่ถูก regenerate — เฉพาะ planned เท่านั้น |
| 4 | horizon หมดอายุ (เช่น 1 เดือนครบ) | กิจกรรมหยุด generate เอง — แท็บ 1 โชว์ป้ายเล็ก "สิ้นสุดแล้ว" ใน Bottom Sheet + ปุ่ม "ต่ออายุ" (เลือก horizon ใหม่นับจากวันนี้) |
| 5 | ผู้ใช้ไม่เปิดแอปนานจน window ขาด | notification เงียบไปหลัง ~50 รายการหมด — เปิดแอปครั้งถัดไป generateWindow + sync ใหม่ทันที (ยอมรับข้อจำกัด local-only) |
| 6 | เลื่อนนัดข้าม horizon / ไปเดือนอื่น | ได้ — instance ใหม่เป็น detached ไม่ผูก rule |
| 7 | ลบ Contact ที่มีนัดค้าง | เตือน "มีนัดค้าง n รายการ" — ลบแล้วนัดแสดง "รายชื่อที่ถูกลบ" ประวัติไม่หาย |
| 8 | Import ไฟล์ schemaVersion ใหม่กว่าแอป | ปฏิเสธพร้อมข้อความ "อัปเดตแอปก่อน" |
| 9 | เปลี่ยน timezone เครื่อง | เวลาเป็น local string ทั้งหมด → ตารางไม่ขยับ (ตามเจตนา "ตารางชีวิต") |
| 10 | แจ้งเตือนถูกปิดที่ระดับ OS | ตรวจ permission ตอนเปิดแอป — แสดง banner เตือนใน 6.3 พร้อมปุ่มไปหน้า Settings ของเครื่อง |

---

## 9. แผนพัฒนา (อัปเดตจาก PROJECT_PLAN.md ให้ตรงดีไซน์นี้)

| เฟส | ขอบเขต | ผลลัพธ์ที่ทดสอบได้ |
|---|---|---|
| **1. Foundation** | types + storage repo + seed 6 หมวด/P1–P6 + RecurrenceEngine + hooks | unit test rule → instance ผ่าน, ข้อมูล persist ข้ามการปิดแอป |
| **2. แท็บ 1 + 2** | Timeline วัน / Week grid / Month calendar + stepper เพิ่มกิจกรรม + Bottom Sheet (ทำแล้ว/แก้/ลบ) | ใช้วางแผนจริงได้ครบ loop เพิ่ม→เห็น→ติ๊ก→ลบ |
| **3. แจ้งเตือน** | NotificationScheduler + ตั้งค่าแจ้งเตือน (6.3) + morning summary | เตือนจริงบนเครื่อง, ไม่เกิน budget |
| **4. แท็บ 3 + เลื่อนนัด** | FreeSlotEngine + โหมดวันว่าง + สมุดรายชื่อ + สรุปเคส + Reschedule Flow | เลื่อนนัดแล้วแจ้งเตือนย้ายตาม, ประวัติเคสถูกต้อง |
| **5. แท็บ 4** | StatsEngine + จัดการหมวดหมู่ + ธีม + Export/Import CSV/JSON | export CSV เปิดใน Excel/Sheets แล้วหน้าตาเหมือนไฟล์เดิม |
| **6. Google Sheets + Polish** | OAuth + push to Sheets + dark mode เก็บตก + ทดสอบ iOS/Android จริง | ส่งตารางเดือนขึ้น Sheets ได้จากปุ่มเดียว |

หลักการเรียงเฟส: ทุกเฟสจบแล้ว**แอปยังใช้งานได้จริง** — ฟีเจอร์เสี่ยงเชิงเทคนิค (แจ้งเตือน budget, OAuth) แยกเฟสของตัวเองเพื่อไม่ block งาน UI

---

## 10. การทดสอบ

- **Unit (สำคัญสุด — Domain Layer เป็น pure function):** RecurrenceEngine (ทุก RepeatRule × ขอบ horizon × detached), FreeSlotEngine (ทับซ้อน, ข้ามเที่ยงคืน, ranking), StatsEngine (streak ขอบวัน), logical-day util (03:59 vs 04:00)
- **Integration:** storage roundtrip + migration, notification budget ไม่เกิน 50, import merge/replace
- **Manual บน Expo Go:** แจ้งเตือนจริง iOS/Android, ข้ามเที่ยงคืนจริง (เปลี่ยนเวลาเครื่อง), permission ถูกปิด
