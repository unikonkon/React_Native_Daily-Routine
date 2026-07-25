<div align="center">
  <img src="assets/images/icon.png" width="128" alt="Daily Routine" />
  <h1>Daily Routine</h1>
  <p><b>แอปวางแผนกิจวัตรประจำวัน</b> — จัดตารางกิจกรรม นัดเคส และงานประจำไว้ที่เดียว<br/>ดูได้ทั้งราย วัน / สัปดาห์ / เดือน / ปี พร้อมสรุปสถิติเวลาและแจ้งเตือนสรุปตอนเช้า</p>
</div>

---

## Daily Routine คืออะไร

Daily Routine คือแอปมือถือ (iOS / Android / Web) สำหรับวางแผน **กิจวัตรประจำวัน** ตลอด 24 ชั่วโมง
โดยยึดหน้าต่างเวลา **06:00 → 06:00 ของวันถัดไป** จึงบันทึกกิจกรรมที่ข้ามเที่ยงคืนได้ตามจริง

จุดเด่นคือรวม 3 อย่างไว้ในแอปเดียว — **ตารางเวลา** (จะทำอะไรเมื่อไร), **สมุดรายชื่อ + นัดเคส** (จะเจอใคร),
และ **สถิติ** (เวลาหมดไปกับอะไรบ้าง) — แทนที่จะต้องสลับไปมาระหว่างปฏิทิน โน้ต และสเปรดชีต

### ความสามารถหลัก

| | |
|---|---|
| 🗓️ **4 มุมมอง** | วัน · สัปดาห์ · เดือน · ปี สลับได้จากแท็บ “วันนี้” พร้อมโหมดดูเฉพาะ **ช่วงเวลาว่าง** (ช่องว่าง ≥ 45 นาที) |
| ➕ **เพิ่มกิจกรรมเร็ว** | quick-pick ต่อหมวด, สแนปเวลาทีละ 15 นาที, ทำซ้ำแบบ ทุกวัน / วันธรรมดา / วันหยุด / กำหนดเอง |
| 🎨 **6 หมวดหมู่** | กิจวัตรประจำวัน · งานประจำ · ออกกำลังกาย · งานธุรกิจ/ทีม (นัดเคส) · เรียนรู้ · ส่วนตัว — กำหนดสีเองได้ |
| 👥 **สมุดรายชื่อ & นัดเคส** | เก็บอีเมล / Zoom / Google Meet / หมายเหตุ, จัดลำดับความสำคัญ P1–P6, สร้างลิงก์ประชุมออนไลน์ได้ในคลิกเดียว |
| 📊 **สถิติ** | สรุปชั่วโมงตามหมวดในช่วงที่เลือก และจัดกลุ่มนัดเคสตามรายชื่อผู้ติดต่อ |
| 🔔 **แจ้งเตือน** | เตือนรายกิจกรรม + สรุปตอนเช้าว่าวันนี้มีนัดอะไรบ้าง |
| 🔄 **นำเข้า / ส่งออก** | Time Table (`.xlsx` / `.csv`), CSV, JSON และส่งขึ้น Google Sheets (ทางเดียว) |
| 🌗 **ธีมสว่าง/มืด** | ตามระบบอัตโนมัติ |

---

## เริ่มพัฒนา

```bash
npm install
npx expo start
```

จากนั้นเปิดได้ทาง [development build](https://docs.expo.dev/develop/development-builds/introduction/),
[Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/),
[iOS simulator](https://docs.expo.dev/workflow/ios-simulator/) หรือ [Expo Go](https://expo.dev/go)

```bash
npm run android   # เปิดบน Android
npm run ios       # เปิดบน iOS
npm run web       # เปิดบนเว็บ
npm run lint      # ตรวจ ESLint
```

## โครงสร้างโปรเจกต์

```
src/
  app/            หน้าจอทั้งหมด (expo-router, file-based routing)
    (tabs)/       แท็บหลัก — วันนี้ · เพิ่ม · ตั้งค่า
    settings/     หน้าย่อย — สถิติ · หมวดหมู่ · รายชื่อ · จัดการข้อมูล · Export/Import
  components/     UI ที่ใช้ซ้ำ + มุมมอง วัน/สัปดาห์/เดือน/ปี (components/today/)
  constants/      design tokens, หมวดหมู่, ลำดับความสำคัญ (theme.ts)
  lib/            ตรรกะหลัก — engine, db (SQLite), dates, notifications, xlsx, sheets
  stores/         สถานะรวมด้วย zustand
assets/images/    ไอคอนแอป · adaptive icon · splash · favicon
```

เอกสารเชิงลึกเพิ่มเติม: [`APP_STRUCTURE.md`](APP_STRUCTURE.md) และ [`SYSTEM_DESIGN_V2.md`](SYSTEM_DESIGN_V2.md)

## เทคโนโลยีที่ใช้

Expo SDK 54 · React Native 0.81 · React 19 · expo-router 6 · expo-sqlite · zustand · TypeScript

## ไอคอนแอป

ไอคอนต้นฉบับ 1024×1024 (พื้นหลังโปร่งใส) เก็บไว้ที่ [`assets/appIcon.png`](assets/appIcon.png)
— ตัวเลือกอื่นที่ไม่ได้เลือกใช้คือ `appIcon2.png` และ `appIcon3.png`

ไฟล์ใน `assets/images/` สร้างต่อจากไฟล์นี้ทั้งหมด พื้นหลังเป็นการไล่สีครีม `#FFFDF8 → #E9DECC` ให้เข้ากับธีมสว่างของแอป (`#F4EFE6`)

| ไฟล์ | ใช้ที่ | ขนาด |
|---|---|---|
| `icon.png` | ไอคอนหลัก (iOS + ค่าเริ่มต้นทุกแพลตฟอร์ม) | 1024×1024 ทึบ |
| `android-icon-foreground.png` | adaptive icon ชั้นหน้า (อยู่ในเซฟโซน 66%) | 1024×1024 โปร่งใส |
| `android-icon-background.png` | adaptive icon ชั้นหลัง | 1024×1024 ทึบ |
| `android-icon-monochrome.png` | themed icon ของ Android 13+ | 1024×1024 โปร่งใส |
| `splash-icon.png` | สแปลชสกรีน (สว่าง `#F4EFE6` / มืด `#141009`) | 1024×1024 โปร่งใส |
| `favicon.png` | เว็บ | 196×196 |
