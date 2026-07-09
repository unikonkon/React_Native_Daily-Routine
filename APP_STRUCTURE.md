# App Structure — ตารางชีวิตจอย (Daily Routine Planner)

> **แหล่งอ้างอิง UI/พฤติกรรมเพียงแหล่งเดียว: `Daily Routine Planner (1).html`** (prototype v2 "Offline-first")
> เอกสารนี้แทนที่ APP_STRUCTURE ฉบับเดิมที่อ้างอิง CSV — หากขัดแย้งกับ `SYSTEM_DESIGN_V2.md` ให้ยึดไฟล์นี้
> API ทั้งหมดตรวจกับเอกสาร **Expo SDK 57** (https://docs.expo.dev/versions/v57.0.0/) แล้ว

---

## 0. Tech Stack

| ด้าน | แพ็กเกจ | หมายเหตุ |
|---|---|---|
| ฐานข้อมูล (local) | `expo-sqlite` | WAL mode + migration ด้วย `PRAGMA user_version` |
| State management | `zustand` | in-memory cache ชั้นบน SQLite — UI ไม่ query ตรง |
| แจ้งเตือน | `expo-notifications` | local notification ล้วน, งบ 50 รายการใต้ลิมิต iOS (~64) |
| ไฟล์ / แชร์ | `expo-file-system` + `expo-sharing` + `expo-document-picker` | Export / Import — ดู §6.5 |
| Google OAuth | `expo-auth-session` + Google Sheets API v4 | **ส่งออกทางเดียว** — ดู §6.5 |
| Navigation | `expo-router` | 4 แท็บ + modal |
| ฟอนต์ | `expo-font` + Anuphan (UI) / Space Grotesk (ตัวเลข·เวลา) | ตาม prototype |

```bash
npx expo install expo-sqlite expo-notifications expo-file-system expo-sharing \
  expo-document-picker expo-auth-session expo-crypto expo-font
npm i zustand
```

> ⚠️ SDK 57: `expo-file-system` ใช้ **API ใหม่** (`File`, `Directory`, `Paths`) — API เก่าต้อง import จาก `expo-file-system/legacy`
> ⚠️ notification handler ใช้ `shouldShowBanner`/`shouldShowList` (ไม่ใช่ `shouldShowAlert` ที่ deprecated แล้ว)

### หลักการเรื่องความเร็ว (บังคับใช้ทุกหน้าจอ) ⚡

แอปเน้น **ดึงข้อมูลไวที่สุด และตัดการดึงที่ไม่จำเป็นทิ้ง**:

1. **โหลดครั้งเดียวตอนเปิดแอป** — ตาราง `activities` (series) มีขนาดเล็ก (หลักสิบแถว) → `SELECT` ทั้งตาราง 1 ครั้ง เข้า zustand แล้ว **ขยายเป็นรายวันด้วย pure function ใน memory** (memoized) — การเปลี่ยนวัน/สัปดาห์/เดือนใน UI **ไม่ query ฐานข้อมูลเลย**
2. **Occurrences ดึงเป็นช่วงวันที่** — สถานะรายวัน (done/skipped/…) เก็บแบบ *exception-based* (มีแถวเฉพาะวันที่เบี่ยงจากค่าปกติ) → query ครั้งเดียวต่อช่วงที่มองเห็น (`WHERE date BETWEEN ?, ?`) แล้ว cache เป็น `Map<date, …>`
3. **เขียนแบบ optimistic** — mutation อัปเดต zustand ทันที (UI ไม่รอ) แล้วเขียน SQLite ตาม ไม่มีการ re-read กลับ
4. **สถิติใช้ SQL aggregate** (`SUM`, `GROUP BY`) — ไม่โหลดแถวดิบมานับใน JS
5. **Free Slot / conflict / month heat คำนวณจากข้อมูลที่โหลดแล้ว** — ไม่มี query เพิ่ม
6. `PRAGMA journal_mode = WAL` + prepared statement (`prepareAsync`) กับ query ร้อน + index ตาม §7

---

## 1. ภาพรวม — Tab Bar 4 แท็บ + FAB

```
┌─────────────────────────────────────┐
│  หัวข้อหน้า (30px) + วันที่ย่อย   ☾/☀  │ ← header + ปุ่มสลับธีม
│                                     │
│           เนื้อหาแต่ละแท็บ             │
│                                 ⊕  │ ← FAB (เฉพาะแท็บวันนี้) → เปิดแท็บเพิ่ม
├─────────────────────────────────────┤
│  📅 วันนี้   ➕ เพิ่ม   📊 สรุป   ⚙️ ตั้งค่า │ ← tab bar กระจกฝ้า (blur)
└─────────────────────────────────────┘
```

| แท็บ | key | หน้าที่ | หัวข้อ / ข้อความรอง |
|---|---|---|---|
| 1 | `today` | ตารางกิจกรรม วัน/สัปดาห์/เดือน + แก้ไข/ลบ/ทำแล้ว | "วันนี้" / วันที่ไทยเต็มของวันโฟกัส |
| 2 | `add` | วิซาร์ดเพิ่มกิจกรรม **2 ขั้น** | "เพิ่มกิจกรรม" / "ขั้นที่ N จาก 2" |
| 3 | `summary` | สลับ 2 โหมด: **วันว่าง** / **สรุปเคส** | "สรุป" / "ช่วงเวลาว่าง" หรือ "เคสนัดหมาย" |
| 4 | `settings` | สถิติ · จัดการ · แจ้งเตือน · ธีม · ข้อมูล | "ตั้งค่า" / "สถิติ & ค่าระบบ" |

- ปีทุกจุดแสดงเป็น **พ.ศ.** (+543), สัปดาห์เริ่ม**วันจันทร์**
- Toast แจ้งผลเป็น pill เหนือ tab bar หายเองใน ~1.9 วินาที

---

## 2. หมวดกิจกรรม (6 หมวด — คงที่) + Priority

| id | ชื่อ | ชื่อย่อ | สี | ไอคอน | ฟิลด์พิเศษ |
|---|---|---|---|---|---|
| `routine` | กิจวัตรประจำวัน | กิจวัตร | `#E2A34A` | sun | — |
| `work` | งานประจำ/งานอื่นๆ | งาน | `#5A7EA8` | briefcase | สถานที่ (ออฟฟิศ / บ้าน WFH / ลูกค้า) |
| `ex` | ออกกำลังกาย | ออกกำลังกาย | `#7DA35A` | dumbbell | ประเภท: เวท / คาร์ดิโอ / คลาส |
| `case` | งานธุรกิจ/ทีม | นัดเคส | `#B45268` | users | **isCase** → รายชื่อคน + priority + ช่องทาง + เลื่อนนัดได้ |
| `learn` | เรียนรู้/อ่านหนังสือ | เรียนรู้ | `#836BA8` | book | สื่อ: หนังสือ / เสียง |
| `me` | ส่วนตัว/พักผ่อน | ส่วนตัว | `#3E9C93` | moon | — |

**Priority ของเคส (P1–P6)** — เป็นคุณสมบัติของนัดหมวด `case` เท่านั้น:

| ระดับ | ป้าย | สี |
|---|---|---|
| P1 | คนใหม่ / มีปัญหา | `#C0392B` |
| P2 | ด่วน | `#D2603A` |
| P3 | ปกติ | `#E2A34A` |
| P4 | ทีมภายใน | `#7DA35A` |
| P5 | ติดตามผล | `#5A7EA8` |
| P6 | ทั่วไป | `#8A8175` |

---

## 3. แท็บ 1 — 📅 วันนี้

### 3.1 มุมมอง 3 ระดับ (segmented control: วัน | สัปดาห์ | เดือน)

| โหมด | รูปแบบ | นำทาง |
|---|---|---|
| **วัน** | แถบวันที่เลื่อนแนวนอน (45 วัน เริ่มก่อนวันนี้ 3 วัน, จุด accent ที่วันนี้, ชิป "วันนี้" เด้งกลับเมื่อโฟกัสวันอื่น) + **timeline แนวตั้ง** | swipe ซ้าย/ขวา = ±1 วัน |
| **สัปดาห์** | ตาราง 7 คอลัมน์ (จันทร์เริ่ม) 06:00–25:00 บล็อกสีตามหมวด — ทึบเมื่อ done, จาง 60% เมื่อ planned, 35% เมื่อ rescheduled — หัวแถบ "6 ก.ค. – 12 ก.ค. 2569" + ‹ › | swipe = ±7 วัน, แตะวัน → โหมดวัน |
| **เดือน** | ปฏิทิน — พื้นช่องไล่**เฉดเขียวตามชั่วโมงว่าง**ของวันนั้น + จุดสีหมวดสูงสุด 3 จุด + วงแหวน accent ที่วันนี้ + legend "เวลาว่าง/วัน → มาก" | swipe/ลูกศร = ±1 เดือน, แตะวัน → โหมดวัน |

### 3.2 Timeline โหมดวัน (สเปกจาก prototype)

- หน้าต่างเวลา **05:30–26:00** (330–1560 นาที; เวลาจบเกิน 24:00 ได้ เช่น 25:00 = 01:00 วันถัดไป แสดง "+วันถัดไป")
- สเกล **0.82 px/นาที**, เส้นบอกชั่วโมงทุก 2 ชม. เริ่ม 06:00, ร่องป้ายเวลา 44px
- **เส้นเวลาปัจจุบัน** (จุด+เส้น accent 2px) — แสดงเฉพาะเมื่อวันโฟกัส = วันนี้จริง
- บล็อกกิจกรรม: พื้นสีหมวดโปร่ง + ขอบซ้ายทึบ 3px, radius 11, สูงขั้นต่ำ 22px; แสดงชื่อ + ✓ เขียวเมื่อ done + ช่วงเวลา + สถานที่ (เมื่อบล็อกสูงพอ) + ป้าย priority (เคส); จาง 50% เมื่อ rescheduled
- **กิจกรรมเวลาทับกัน**: จัดกลุ่มช่วงคาบเกี่ยว แล้วแบ่งความกว้างเป็นเลนเท่า ๆ กัน
- แตะบล็อก → Bottom Sheet (3.3)

### 3.3 Bottom Sheet รายละเอียดกิจกรรม

แสดง: ชิปหมวด, ป้าย priority (เคส), สถานะ (ทำแล้ว/เลื่อนแล้ว), ชื่อ, ช่วงเวลา + ความยาว ("X ชม. Y น."), สถานที่, รายชื่อคน + ช่องทาง (ออนไลน์/พบตัว)

| ปุ่ม | เงื่อนไข | ผล |
|---|---|---|
| `✓ ทำแล้ว` ⇄ `ยังไม่ทำ` | ทุกกิจกรรม | สลับสถานะ done/planned **ของวันนั้น** — toast "เยี่ยม! ทำสำเร็จ ✓" |
| `⏭ เลื่อนนัด` | เฉพาะหมวด `case` | เปิด Reschedule Modal (3.4) |
| `✎ แก้ไข` | ทุกกิจกรรม | เปิดฟอร์มแท็บ 2 แบบ pre-fill (โหมด edit) |
| `🗑 ลบ` | ทุกกิจกรรม | กิจกรรมทำซ้ำ → เลือก **เฉพาะครั้งนี้** / **ทั้งชุด** (soft-delete, เก็บประวัติ — ยกเลิกเฉพาะครั้งที่ยัง planned); ครั้งเดียว → ยืนยันปุ่มแดงเดียว |

### 3.4 Smart Reschedule — เลื่อนนัด (เฉพาะหมวด `case`) ⭐

```
[นัดเดิม] → เหตุผล (optional, เช่น "ลูกค้าติดประชุม")
         → เลือกช่วงค้นหา: ○ 3 วัน ○ สัปดาห์นี้ ○ สัปดาห์หน้า
         → Free Slot Engine (§5.1) สแกน slot ว่าง ≥ ความยาวนัดเดิม
         → ให้คะแนนแต่ละ slot:
             +3  เวลาเริ่มห่างจากเวลานัดเดิม ≤ 60 นาที
             +max(0, 4 − จำนวนวันที่ห่างออกไป)   ← วันใกล้ได้ก่อน
             +2  ถ้าเคส P1 และ slot เริ่มก่อน 10:00 (ดันเช้า)
         → แสดง 6 อันดับแรก (อันดับ 1 ติดป้าย "แนะนำ")
         → ยืนยัน: นัดเดิม → สถานะ rescheduled (คงไว้ แสดงจาง)
                  + สร้างนัดใหม่ detached ชื่อ "… (เลื่อนมา)"
                  + ย้ายแจ้งเตือนอัตโนมัติ + บันทึก reschedule_logs
                  + toast "เลื่อนนัดแล้ว · ย้ายแจ้งเตือนอัตโนมัติ"
```

จำนวนครั้งที่เลื่อนต่อนัด (จาก `reschedule_logs`) แสดงใน list สรุปเคส (§5.2): "เลื่อนมาแล้ว N ครั้ง"

---

## 4. แท็บ 2 — ➕ เพิ่มกิจกรรม (วิซาร์ด 2 ขั้น, จุดบอกขั้น ● ○)

### 4.1 ขั้นที่ 1 — เลือกหมวด + รายละเอียด

- **grid การ์ดหมวด 2×3** — เลือกแล้วฟอร์มรายละเอียดปรากฏใต้ grid:
  - ชื่อกิจกรรม (placeholder "พิมพ์ชื่อ…") + **quick-pick chips ตามหมวด**
  - หมวด `case` การ์ดเสริม: **รายชื่อคน** (chips เลือกจากสมุดรายชื่อ + ปุ่ม "+ เพิ่ม") · **priority P1–P6** · **ช่องทาง** ออนไลน์ (video) / พบตัว (mappin)
  - หมวด `work` การ์ดเสริม: **สถานที่** ออฟฟิศ / บ้าน (WFH) / ลูกค้า
- ปุ่ม "ถัดไป" ตรวจก่อน: ไม่เลือกหมวด → toast "เลือกหมวดก่อน", ไม่มีชื่อ → toast "ใส่ชื่อกิจกรรม"

### 4.2 ขั้นที่ 2 — วันเวลา + แจ้งเตือน (`scheduleForm`)

1. **เวลา**: stepper เริ่ม/จบ **snap ทีละ 15 นาที** — ตรวจ "เวลาสิ้นสุดต้องมากกว่าเริ่ม" (ค่าเริ่มต้น draft: 18:30–19:30)
2. **รูปแบบทำซ้ำ (chips)**: `ครั้งเดียว · ทุกวัน · จ–ศ · ส–อา · เลือกเอง`
3. **Horizon (chips — แสดงเมื่อเลือกแบบทำซ้ำ)**: `1 สัปดาห์(7) · 2 สัปดาห์(14) · 1 เดือน(30) · 6 เดือน(182) · 1 ปี(365 วัน)`
4. **ปฏิทินเลือกวันที่ inline** (multi-select, วันที่ผ่านมาแล้วกดไม่ได้, แตะแก้เองจะสลับ rule เป็น "เลือกเอง") + modal เลือกเดือน/ปี (พ.ศ., ปี 2569–2573) + บรรทัดสรุป recurrence
5. **แถบเตือนเวลาชน**: "เวลาที่เลือกชนกับกิจกรรมเดิมใน N วัน — บันทึกต่อได้" (เตือนอย่างเดียว **ไม่บล็อก** — สูตรชน: `a1<b2 && b1<a2`)
6. **การ์ดพรีวิวรายวัน** (เมื่อเลือก 1–3 วัน): จำนวนกิจกรรมเดิม + แถบ occupancy จำลองพร้อม slot ใหม่สี accent + ชิป slot ว่างสูงสุด 4 ชิ้น + รายการที่ชน — เลือก >3 วันจะซ่อนพร้อมข้อความแจ้ง
7. **การ์ดแจ้งเตือน**: toggle (ค่าเริ่มต้น **เปิด**) + เตือนล่วงหน้า chips **15 / 30 / 60 นาที** (ค่าเริ่มต้น 30)
8. ปุ่ม `ย้อนกลับ` / `บันทึกกิจกรรม`

**บันทึก** → สร้าง activity (series) + ตั้งแจ้งเตือนตามงบ (§8) → toast "เพิ่มแล้ว N วัน ✓" → เด้งไปแท็บวันนี้ (โหมดวัน) + ล้าง draft

> ฟอร์มชุดนี้ใช้ซ้ำเป็น **โหมด edit** (pre-fill) จากปุ่มแก้ไขใน Bottom Sheet และรับ params pre-fill จากปุ่ม "จองช่วงนี้" ของแท็บสรุป (วัน+เวลา, ปรับ snap 15 นาที, ความยาวเริ่มต้นสูงสุด 60 นาที)

---

## 5. แท็บ 3 — 📊 สรุป (toggle 2 โหมด: `วันว่าง` / `สรุปเคส`)

### 5.1 โหมด "วันว่าง" — Free Slot Engine

**นิยาม slot ว่าง**: หน้าต่างวัน **06:00–26:00** — เดินตามกิจกรรม (planned+done) เรียงเวลาเริ่ม ช่องว่างระหว่างกัน **≥ 45 นาที** (หรือ ≥ ความยาวที่ร้องขอ) = ว่าง — engine ตัวเดียวกันนี้ใช้กับ พรีวิวแท็บ 2 และ Reschedule (3.4)

มี segmented วัน/สัปดาห์/เดือน ของตัวเอง:

| โหมด | การแสดง |
|---|---|
| **วัน** | การ์ดสรุป "เวลาว่าง วันนี้" (ตัวเลขชั่วโมงว่างสีเขียวใหญ่ + "N ช่วงว่าง · แตะเพื่อจอง") + timeline (สเกล 0.72 px/นาที) — กิจกรรมถูกเบลอ/จาง ไม่รับ touch, **slot ว่างเป็นปุ่มเขียวทึบ** "HH:MM–HH:MM ว่าง X ชม." + "จองช่วงนี้" → ส่งวัน+เวลาไป pre-fill แท็บ 2 ขั้นที่ 2 |
| **สัปดาห์** | ตาราง 7 คอลัมน์เดิม แต่ slot ว่างวาดเป็นแถบเขียวเรืองทับกิจกรรมที่เบลอ — แตะคอลัมน์ → โหมดวัน |
| **เดือน** | ปฏิทิน heat เขียวตามชั่วโมงว่าง + ตัวเลขชั่วโมงในช่อง ("18ช") — แตะ → โหมดวัน |

### 5.2 โหมด "สรุปเคส" — เฉพาะหมวด `case`

- **การ์ดสถิติ 3 ใบ**: ทั้งหมด / เสร็จ / เลื่อน
- list นัดทั้งหมดเรียงตาม วัน+เวลา — แต่ละแถว: ป้าย priority, ชื่อ, ชิปสถานะ ("เลื่อนแล้ว" / ✓ เขียว), วันที่, เวลา, ช่องทาง (ออนไลน์/พบตัว), รายชื่อคน, "เลื่อนมาแล้ว N ครั้ง"
- แตะแถว → Bottom Sheet เดียวกับแท็บ 1 (ทำแล้ว/เลื่อนนัด/แก้ไข/ลบ ได้จากที่นี่)

---

## 6. แท็บ 4 — ⚙️ ตั้งค่า

**การ์ดสถิติหัวหน้า (6.1)** แล้วตามด้วยเมนู 4 กลุ่ม:

### 6.1 สถิติ (การ์ดบนสุด)

- **วงแหวน % สำเร็จ** = done / scheduled ของรายการที่ถึงกำหนดแล้ว (ตัด cancelled/rescheduled และรายการวันนี้ที่ยังไม่ถึงเวลา) — animate stroke 0.5s
- **Streak** "N วันติดต่อ" — คำนวณจริง: จำนวนวันติดต่อกันย้อนหลังที่ทำสำเร็จครบทุกรายการที่ถึงกำหนด *(prototype ฮาร์ดโค้ด "5" — แอปจริงคำนวณ)*
- **เสร็จสัปดาห์นี้** (จำนวน done)
- **กราฟแท่งแนวนอน ชั่วโมงต่อหมวด** — รวม `(end−start)/60` ของรายการ done, สีตามหมวด
- ทั้งหมดดึงด้วย **SQL aggregate query เดียว** ต่อการเปิดหน้า

### 6.2 การจัดการ

| แถว | เนื้อหา |
|---|---|
| จัดการหมวดหมู่ — "6 หมวด · P1–P6" | รายการ 6 หมวด (คงที่ ไม่เพิ่ม/ลบ) — แก้ได้: ชื่อ, สี + แก้ป้าย/สี priority P1–P6 |
| สมุดรายชื่อ — "N รายชื่อ" | Contact CRUD: ชื่อ, priority ประจำตัว, เบอร์/LINE (optional) — ใช้เลือกในฟอร์มนัดเคส |

### 6.3 การแจ้งเตือน

| ตั้งค่า | ค่าเริ่มต้น | ผล |
|---|---|---|
| เปิดการแจ้งเตือน — "งบ 50 รายการ · ใต้ลิมิต iOS" | เปิด | master toggle — ปิดแล้ว cancel ทั้งหมด |
| สรุปตอนเช้า — "ทุกวัน 06:00" | เปิด | daily trigger 06:00: "วันนี้มี x กิจกรรม นัด y รายการ" |

### 6.4 ธีม

- segmented **สว่าง / มืด** (สลับ palette ทั้งชุด §10) — ปุ่มดวงจันทร์/อาทิตย์ที่ header ทุกแท็บสลับได้เช่นกัน

### 6.5 ข้อมูล (Export / Import / Google Sheets)

| ฟังก์ชัน | แพ็กเกจ | รายละเอียด |
|---|---|---|
| **ส่งออก CSV** (ฟอร์แมต Excel เดิม — สัปดาห์×เวลา) | `expo-file-system` (new API) + `expo-sharing` | `new File(Paths.cache, 'routine.csv')` → `file.write(csv)` → `Sharing.shareAsync(file.uri, {mimeType:'text/csv'})` |
| **สำรอง / กู้คืน (JSON)** | เหมือนบน + `expo-document-picker` | Export: JSON dump ทุกตาราง · Import: `getDocumentAsync({type:['application/json','text/csv']})` → `new File(asset.uri).text()` → เลือก **merge / แทนที่** → เขียนใน `withExclusiveTransactionAsync` เดียว |
| **ส่งขึ้น Google Sheets** — "ทางเดียว · ยังไม่เชื่อมต่อ" | `expo-auth-session` + `expo-crypto` + Google Sheets API v4 | **ส่งออกทางเดียว** (แอป → Sheets เท่านั้น ไม่ดึงกลับ): ปุ่ม `เชื่อมต่อ` → OAuth PKCE (`useAuthRequest` + `exchangeCodeAsync`, scope `https://www.googleapis.com/auth/spreadsheets`) → `spreadsheets.create` ครั้งแรก / `values.batchUpdate` ครั้งถัดไป ฟอร์แมตเดียวกับ CSV |

> **เงื่อนไข Google OAuth**: redirect URI ต้องใช้ custom scheme ที่ build ลงแอป → **ต้องใช้ development build (ใช้ใน Expo Go ไม่ได้** — proxy auth.expo.io เลิกใช้แล้ว) — ทำเป็นเฟสหลัง Export/Import ไฟล์
> ทางเลือกที่เอกสาร Expo v57 แนะนำสำหรับ Google โดยเฉพาะคือ `@react-native-google-signin/google-signin` — ตัดสินใจตอนขึ้นเฟส Sheets

---

## 7. Data Model — SQLite (`expo-sqlite`)

**หลักการ**: prototype เก็บกิจกรรมเป็น *weekly template* (1 รายการต่อวันในสัปดาห์, สถานะติดที่ตัวรายการ) — แอปจริงคงโมเดล series แบบเดียวกันแต่ **สถานะต้องเป็นรายวัน** (ไม่งั้นติ๊ก "ทำแล้ว" วันนี้จะติดไปทุกสัปดาห์) → ใช้ตาราง `occurrences` แบบ **exception-based**: มีแถวเฉพาะ (activity, date) ที่สถานะเบี่ยงจาก `planned`

```sql
PRAGMA journal_mode = WAL;              -- ครั้งแรกใน onInit ของ SQLiteProvider

CREATE TABLE activities (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  cat           TEXT NOT NULL,          -- routine|work|ex|case|learn|me
  sub           TEXT,                   -- weight|cardio|class|book|audio
  loc           TEXT,                   -- สถานที่ (work)
  channel       TEXT,                   -- online|inperson (case)
  priority      TEXT,                   -- P1..P6 (case)
  start_min     INTEGER NOT NULL,       -- นาทีจากเที่ยงคืน (1110 = 18:30)
  end_min       INTEGER NOT NULL,       -- เกิน 1440 ได้ = ข้ามเที่ยงคืน (+วันถัดไป)
  repeat        TEXT NOT NULL DEFAULT 'none',  -- none|daily|weekday|weekend|custom
  days_mask     INTEGER NOT NULL DEFAULT 0,    -- bit0=จันทร์ … bit6=อาทิตย์
  start_date    TEXT NOT NULL,          -- ISO 'YYYY-MM-DD'
  end_date      TEXT,                   -- วันจบ horizon (NULL = ครั้งเดียว)
  notify        INTEGER NOT NULL DEFAULT 1,
  notify_before INTEGER NOT NULL DEFAULT 30,   -- นาที
  detached_from INTEGER REFERENCES activities(id),  -- นัดที่ "เลื่อนมา"
  status        TEXT NOT NULL DEFAULT 'active',     -- active|cancelled (soft delete)
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE occurrences (              -- เฉพาะวันที่เบี่ยงจาก planned
  activity_id INTEGER NOT NULL REFERENCES activities(id),
  date        TEXT NOT NULL,
  status      TEXT NOT NULL,            -- done|skipped|cancelled|rescheduled
  PRIMARY KEY (activity_id, date)
) WITHOUT ROWID;
CREATE INDEX idx_occ_date ON occurrences(date);

CREATE TABLE contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'P6',
  phone TEXT, line TEXT, note TEXT
);
CREATE TABLE activity_contacts (
  activity_id INTEGER NOT NULL REFERENCES activities(id),
  contact_id  INTEGER NOT NULL REFERENCES contacts(id),
  PRIMARY KEY (activity_id, contact_id)
) WITHOUT ROWID;

CREATE TABLE reschedule_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL,         -- นัดใหม่ (detached)
  from_date TEXT NOT NULL, from_start INTEGER NOT NULL,
  to_date   TEXT NOT NULL, to_start   INTEGER NOT NULL,
  reason TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE notif_map (                -- ผูก notification id ไว้ cancel/ย้าย
  notification_id TEXT PRIMARY KEY,
  activity_id INTEGER NOT NULL, date TEXT NOT NULL
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- keys: theme, notif_master, morning_summary, google_token(เข้ารหัส), schema ผ่าน PRAGMA user_version
```

**Query หลักของทุกหน้าจอ** (ใช้น้อยครั้งที่สุด — ดู §0):

```sql
-- (Q1) ตอนเปิดแอป ครั้งเดียว: series ทั้งหมด
SELECT * FROM activities WHERE status = 'active';

-- (Q2) ต่อช่วงวันที่ที่มองเห็น: exception ทั้งหมดในช่วง
SELECT * FROM occurrences WHERE date BETWEEN ? AND ?;

-- (Q3) สถิติ (ช่วงที่เลือก) — aggregate เดียว
SELECT a.cat, COUNT(*) n, SUM(a.end_min - a.start_min)/60.0 hrs
FROM occurrences o JOIN activities a ON a.id = o.activity_id
WHERE o.status = 'done' AND o.date BETWEEN ? AND ?
GROUP BY a.cat;
```

การจับคู่ "วัน d มีกิจกรรมอะไร" ทำใน **memory**: `start_date ≤ d ≤ end_date` และ (`repeat='none'` → `start_date=d` | อื่น ๆ → bit ของ weekday(d) ใน `days_mask`) แล้ว overlay สถานะจาก occurrences cache — ผลลัพธ์ memoize ต่อวัน

- เวลาทุกจุด **snap 15 นาที**, หน้าต่างวัน 05:30–26:00
- แก้ไข "เฉพาะครั้งนี้" ของ series → occurrence `cancelled` + สร้าง activity ครั้งเดียวใหม่ (detached)

---

## 8. Zustand Stores + แจ้งเตือน

```
src/stores/
├── useActivityStore   # series ทั้งหมด (Q1) + occurrences cache (Map<date,…>) (Q2)
│                      #   selectors: dayItems(date) / weekItems / monthHeat — memoized
│                      #   actions: add/edit/markDone/deleteOne/deleteSeries/reschedule
│                      #   → เขียน SQLite แบบ optimistic, ไม่ re-read
├── useDraftStore      # ฟอร์มแท็บ 2 (draft + step) — ไม่แตะ SQLite จนกด บันทึก
├── useContactStore    # สมุดรายชื่อ (โหลดครั้งเดียว)
├── useSettingsStore   # theme/notif/morning + Google token (โหลดครั้งเดียวตอน boot)
└── useUIStore         # tab, view, focusDate, weekStart, sumMode, sheet, toast
```

- ทุก component subscribe ผ่าน **selector รายฟิลด์** (`useUIStore(s => s.focusDate)`) — กัน re-render ทั้งต้นไม้
- Free Slot Engine, conflict, month-heat = pure functions ใน `src/engine/` กินข้อมูลจาก store — **ไม่มี I/O**

### NotificationScheduler (งบ 50 รายการ ใต้ลิมิต iOS ~64)

1. เปิดแอป/กลับ foreground: คำนวณ occurrence ล่วงหน้าที่ `notify=1` และ master toggle เปิด → เรียงเวลาใกล้สุดก่อน → ตั้งแค่ **50 รายการแรก** (`scheduleNotificationAsync` trigger `DATE` = start − notify_before) เก็บ id ลง `notif_map`
2. mutation ใด ๆ (เพิ่ม/ลบ/ทำแล้ว/เลื่อนนัด) → cancel เฉพาะ id ที่เกี่ยว + เติมคิวใหม่
3. **สรุปตอนเช้า**: trigger `DAILY {hour:6, minute:0}` 1 รายการถาวร (อยู่นอกงบ 50)
4. Handler: `setNotificationHandler` คืน `{shouldShowBanner:true, shouldShowList:true, shouldPlaySound:true}` + Android ต้อง `setNotificationChannelAsync` ก่อน

---

## 9. Navigation Map (`expo-router`)

```
src/app/
├── _layout.tsx                  # SQLiteProvider (onInit: WAL+migrate) + fonts + theme
├── (tabs)/
│   ├── _layout.tsx              # tab bar 4 แท็บ (กระจกฝ้า) — ซ่อน/แสดง FAB
│   ├── index.tsx                # แท็บ 1: วันนี้ (วัน/สัปดาห์/เดือน + timeline)
│   ├── add.tsx                  # แท็บ 2: วิซาร์ด 2 ขั้น (โหมด add/edit ผ่าน params)
│   ├── summary.tsx              # แท็บ 3: วันว่าง / สรุปเคส
│   └── settings.tsx             # แท็บ 4: สถิติ + เมนู
├── settings/
│   ├── categories.tsx           # 6.2 หมวด + priority labels
│   ├── contacts.tsx             # 6.2 สมุดรายชื่อ (CRUD)
│   └── data.tsx                 # 6.5 Export / Import / Google Sheets
└── (components ไม่ใช่ route)
    ├── ActivitySheet            # bottom sheet 3.3 (ใช้ร่วมแท็บ 1 และ 3)
    ├── RescheduleModal          # 3.4
    └── MonthYearPicker          # popup เลือกเดือน/ปี (พ.ศ. 2569–2573)
```

- "จองช่วงนี้" (แท็บ 3) → `router.push('/add', {date, start, end})`
- "แก้ไข" (Bottom Sheet) → `router.push('/add', {editId})`

---

## 10. Design Tokens (จาก prototype ทั้งหมด)

**ฟอนต์**: UI = **Anuphan** (น้ำหนัก 300–700) · ตัวเลข/เวลา = **Space Grotesk**

**Accent** (เลือกได้): `#D2603A` (ค่าเริ่มต้น terracotta) · `#3E9C93` · `#5A7EA8` · `#B45268`

| token | Light | Dark |
|---|---|---|
| bg | `#F4EFE6` | `#141009` |
| card / card2 | `#FFFFFF` / `#FBF7F0` | `#211c14` / `#2b251b` |
| ink (ตัวอักษรหลัก) | `#221C13` | `#F3ECDF` |
| sub / faint | `#6E6555` / `#A79C88` | `#A79C89` / `#6d6353` |
| line / line2 | `rgba(34,28,19,.08/.13)` | `rgba(255,255,255,.09/.14)` |
| chip | `#F0EADF` | `#2b251b` |
| glass (tab bar) | `rgba(247,243,236,.72)` | `rgba(24,20,14,.72)` |
| sheet / overlay | `#FFFFFF` / `rgba(30,24,16,.34)` | `#1c1810` / `rgba(0,0,0,.6)` |

**สีสถานะ**: done/ว่าง `#4C9A6A` · danger/skip `#C0392B` · reschedule `#D2603A` — สีหมวด/priority ดู §2

**แพตเทิร์น**: การ์ด radius 16–22 ขอบ hairline 1px · chip pill radius 99 (active = พื้น ink) · bottom sheet radius บน 28 + grab handle · FAB 56×56 radius 20 เงา accent · tab bar สูง 88 `blur(20px) saturate(180%)` · toggle 50×30

**แอนิเมชัน** (ทำด้วย reanimated): sheet slide-up 0.28s `cubic-bezier(.2,.8,.2,1)` · cross-fade เปลี่ยนแท็บ/มุมมอง 0.2s · toast rise+fade 0.25s · popup scale 0.94→1 · progress ring 0.5s

---

## 11. สิ่งที่แอปจริงต้องทำต่างจาก prototype (ตัดสินใจแล้ว)

| # | ใน prototype | ในแอปจริง |
|---|---|---|
| 1 | สถานะติดที่ตัวรายการ (weekly template — ติ๊ก done ติดทุกสัปดาห์) | สถานะ **รายวัน** ผ่าน `occurrences` (exception-based) |
| 2 | ปุ่ม "แก้ไข" เป็น stub (toast อย่างเดียว) | เปิดฟอร์มแท็บ 2 โหมด edit จริง |
| 3 | `draft.notify/before` ไม่ถูกเก็บลงรายการ | เก็บลง `activities.notify/notify_before` และตั้งแจ้งเตือนจริง |
| 4 | Streak ฮาร์ดโค้ด "5 วันติดต่อ" | คำนวณจริง (§6.1) |
| 5 | จัดการหมวด/สมุดรายชื่อ/Export/Import/Sheets เป็น stub | ทำจริงตาม §6.2 / §6.5 |
| 6 | ไม่มี persistence (รีเฟรชแล้วหาย) | SQLite ทั้งหมด — offline-first |
| 7 | เดโมมี contacts ฮาร์ดโค้ด (คุณเอ/คุณบี/คุณซี/ปุ้ย) | สมุดรายชื่อจริง (ตาราง `contacts`) |

ส่วนที่ **ยึดตาม prototype เป๊ะ**: โครง 4 แท็บ + FAB, วิซาร์ด 2 ขั้น, หน้าต่างเวลา 05:30–26:00 + ข้ามเที่ยงคืน, snap 15 นาที, slot ว่าง ≥45 นาที, สูตรคะแนน reschedule, conflict แบบเตือนไม่บล็อก, soft-delete เก็บประวัติ, งบแจ้งเตือน 50, สรุปเช้า 06:00, ปี พ.ศ., จันทร์เริ่มสัปดาห์, สี/ฟอนต์/แอนิเมชันทั้งหมด (§10)
