# คู่มือรัน & Build — Daily Routine

คู่มือคำสั่งทั้งหมดสำหรับรันแอปตอนพัฒนา และ build ออกเป็นไฟล์แอปจริง (APK / AAB / IPA / เว็บ) ด้วย **Expo + EAS Build**

| หัวข้อ | ค่าในโปรเจกต์นี้ |
|---|---|
| Expo SDK | `54.0.35` |
| React Native | `0.81.5` |
| Routing | `expo-router` v6 (file-based, entry = `expo-router/entry`) |
| Node ที่ทดสอบแล้ว | `v24.9.0` / npm `11.6.0` |
| eas-cli ที่ติดตั้งอยู่ | `18.9.1` |
| บัญชี Expo ที่ล็อกอินอยู่ | `faradaybanana` |
| Native project | **ไม่มีโฟลเดอร์ `ios/` `android/`** — ใช้ CNG (สร้างอัตโนมัติตอน build) |

---

## 0. ทางลัด — Build ไฟล์ APK ของ Android

สถานะโปรเจกต์ตอนนี้ **ตั้งค่าครบแล้ว** (`eas.json` มีโปรไฟล์ `preview` แบบ APK, `app.json` มี `android.package`,
`eas init` ผูกกับ project `09e3dd8d-976f-492c-86c1-2c01e41e0cb3` เรียบร้อย) เหลือแค่สั่ง build:

```bash
eas build --platform android --profile preview
```

| ขั้นตอน | เกิดอะไรขึ้น |
|---|---|
| 1. Keystore | ครั้งแรกจะถาม *"Generate a new Android Keystore?"* → ตอบ **Yes** (EAS เก็บให้บนคลาวด์ ใช้ซ้ำทุก build) |
| 2. อัปโหลด | บีบอัดโค้ดส่งขึ้น EAS |
| 3. เข้าคิว + build | รอประมาณ 10–20 นาที ดูสถานะได้ที่ลิงก์ที่ CLI พิมพ์ออกมา |
| 4. ได้ไฟล์ | ดาวน์โหลด `.apk` จากลิงก์ หรือ `eas build:run -p android --latest` เพื่อลง emulator/เครื่องทันที |

ติดตั้งลงมือถือจริง: เปิดลิงก์ดาวน์โหลดบนเครื่อง Android แล้วกดติดตั้ง (ต้องเปิด "อนุญาตติดตั้งจากแหล่งที่ไม่รู้จัก")
หรือต่อสาย USB แล้ว `adb install path/to/app.apk`

> APK นี้เป็นบิลด์ **release แบบเต็ม** ทำงานได้เองโดยไม่ต้องต่อ Metro — ใช้แจกทดสอบได้เลย
> แต่ถ้าจะขึ้น Google Play ต้องใช้ `--profile production` ซึ่งได้เป็นไฟล์ `.aab` แทน

---

## 1. เตรียมเครื่อง (ทำครั้งเดียว)

```bash
# 1) ติดตั้ง dependencies
npm install

# 2) ติดตั้ง eas-cli (ถ้ายังไม่มี) — หรือใช้ npx eas ... ได้เลยโดยไม่ต้องติดตั้ง
npm install --global eas-cli

# 3) ล็อกอินบัญชี Expo
eas login
eas whoami        # ตรวจว่าล็อกอินแล้ว
```

สิ่งที่ต้องมีเพิ่มตามแพลตฟอร์ม (เฉพาะกรณี build ในเครื่อง / รัน emulator):

- **Android** — Android Studio + Android SDK + ตัวแปร `ANDROID_HOME`
- **iOS** — macOS + Xcode + CocoaPods (`sudo gem install cocoapods`)
- **Cloud build (EAS)** — ไม่ต้องมีอะไรเลย นอกจากบัญชี Expo

---

## 2. รันตอนพัฒนา (Development)

```bash
npm start          # เปิด Metro bundler + QR code  (= npx expo start)
npm run android    # เปิดบน Android emulator/เครื่องจริง
npm run ios        # เปิดบน iOS simulator
npm run web        # เปิดบนเบราว์เซอร์
npm run lint       # ตรวจ ESLint
```

คำสั่งเสริมที่ใช้บ่อย:

```bash
npx expo start --clear          # ล้าง cache ของ Metro (แก้บั๊กแปลก ๆ หลังแก้ config)
npx expo start --tunnel         # ใช้เมื่อมือถือกับคอมอยู่คนละวง Wi-Fi
npx expo install --check        # ตรวจว่า dependency ตรงกับ SDK 54 หรือไม่
npx expo-doctor                 # ตรวจสุขภาพโปรเจกต์ก่อน build
npx tsc --noEmit                # ตรวจ TypeScript
```

> ⚠️ **แอปนี้ใช้ Expo Go ไม่ได้เต็มที่**
> `expo-notifications` (แจ้งเตือน), `expo-sqlite`, `expo-glass-effect` และ `@expo/ui`
> ต้องใช้ **development build** เท่านั้น — ดูข้อ 4.1

---

## 3. ตั้งค่าที่ "ต้องทำก่อน build ครั้งแรก"

### 3.1 Package name / Bundle ID ใน `app.json`

- ✅ **Android** — ตั้งไว้แล้ว: `android.package = "com.faradaybanana.dailyroutine"`
  > ⚠️ เปลี่ยนได้อิสระ**ก่อน**ขึ้น Google Play เท่านั้น หลังจากนั้นเปลี่ยนไม่ได้แล้ว (ถือเป็นคนละแอป)
- ⬜ **iOS** — ยังไม่ได้ตั้ง ถ้าจะ build iOS ต้องเพิ่มใน `expo` ของ `app.json`:

```jsonc
"ios": {
  "bundleIdentifier": "com.faradaybanana.dailyroutine",
  "supportsTablet": true
}
```

### 3.2 ผูกโปรเจกต์กับ EAS

✅ ทำแล้ว — `app.json` มี `extra.eas.projectId` และ `owner: "faradaybanana"`
หน้าโปรเจกต์: https://expo.dev/accounts/faradaybanana/projects/daily-routine

ถ้าย้ายบัญชี/สร้างใหม่ ให้รัน:

```bash
eas init          # สร้าง project บน expo.dev + เติม extra.eas.projectId ลง app.json
```

### 3.3 `eas.json`

ไฟล์ [eas.json](eas.json) ถูกสร้างไว้ให้แล้ว มี 3 โปรไฟล์:

| โปรไฟล์ | ใช้ทำอะไร | ผลลัพธ์ Android | ผลลัพธ์ iOS |
|---|---|---|---|
| `development` | dev build ต่อ Metro ได้ แก้โค้ดแล้วเห็นผลทันที | `.apk` | build สำหรับ Simulator |
| `preview` | ไฟล์ทดสอบให้คนอื่นลงเครื่องจริง | `.apk` | `.ipa` (internal / ad-hoc) |
| `production` | ขึ้น Play Store / App Store | `.aab` | `.ipa` (store) |

---

## 4. Build ด้วย EAS (Cloud) — วิธีหลักที่แนะนำ

### 4.1 Development build (ใช้แทน Expo Go)

```bash
npx expo install expo-dev-client        # ทำครั้งเดียว ยังไม่มีในโปรเจกต์

eas build --profile development --platform android
eas build --profile development --platform ios
```

เสร็จแล้วติดตั้งลงเครื่อง แล้วรัน `npm start` — แอปจะต่อ Metro ให้อัตโนมัติ

### 4.2 Preview build (แจกทดสอบ)

```bash
eas build --profile preview --platform android    # ได้ .apk ลงเครื่องได้ทันที
eas build --profile preview --platform ios        # iOS ต้องลงทะเบียน UDID ก่อน (eas device:create)
eas build --profile preview --platform all
```

### 4.3 Production build (ขึ้นสโตร์)

```bash
eas build --profile production --platform android   # .aab สำหรับ Google Play
eas build --profile production --platform ios       # .ipa สำหรับ App Store
eas build --profile production --platform all --message "release 1.0.0"
```

### 4.4 ดูสถานะ / ดาวน์โหลด / ติดตั้ง

```bash
eas build:list                          # รายการ build ทั้งหมด
eas build:view                          # ดูรายละเอียด build ล่าสุด
eas build:run -p android --latest       # ติดตั้ง build ล่าสุดลง emulator/เครื่อง
eas build:run -p ios --latest           # ติดตั้งลง iOS Simulator
adb install path/to/app.apk             # ติดตั้ง APK ด้วยมือ
```

---

## 5. Build ในเครื่องตัวเอง (Local build)

ใช้เมื่อไม่อยากรอคิว cloud หรือต้องการดีบักปัญหา build — ต้องติดตั้ง Android SDK / Xcode เอง

```bash
eas build --profile preview --platform android --local
eas build --profile production --platform ios --local
```

ข้อจำกัด: build ได้ทีละแพลตฟอร์ม (`--platform all` ไม่ได้), ไม่มี cache, ใช้ secret env จาก EAS ไม่ได้

กำหนดที่เก็บไฟล์ผลลัพธ์:

```bash
EAS_LOCAL_BUILD_ARTIFACTS_DIR=./builds eas build -p android --profile preview --local
```

### 5.1 Build ด้วย Android Studio / Xcode ตรง ๆ (ไม่ผ่าน EAS)

```bash
npx expo prebuild --clean          # สร้างโฟลเดอร์ ios/ และ android/ จาก app.json
npx expo run:android --variant release
npx expo run:ios --configuration Release
```

หรือ Gradle ตรง ๆ:

```bash
cd android && ./gradlew assembleRelease     # ได้ APK ที่ android/app/build/outputs/apk/release/
cd android && ./gradlew bundleRelease       # ได้ AAB
```

> ⚠️ `/ios` และ `/android` อยู่ใน `.gitignore` (CNG) — ถ้ารัน `prebuild` แล้วแก้ไฟล์ native ด้วยมือ
> การรัน `prebuild --clean` ครั้งถัดไปจะลบทิ้ง ให้ย้ายไปใช้ config plugin แทน

---

## 6. Build เว็บ (Static site)

`app.json` ตั้ง `web.output: "static"` ไว้แล้ว

```bash
npx expo export --platform web      # ผลลัพธ์อยู่ในโฟลเดอร์ dist/
npx serve dist                      # ลองรันดูในเครื่อง
```

deploy ขึ้น Expo hosting:

```bash
npx eas-cli@latest deploy           # preview URL
npx eas-cli@latest deploy --prod    # production URL
```

---

## 7. ส่งขึ้นสโตร์

```bash
eas submit --platform android --latest    # ส่งขึ้น Google Play (ต้องมี service account key)
eas submit --platform ios --latest        # ส่งขึ้น App Store Connect
```

อัปเดตแบบ OTA (แก้ JS/asset อย่างเดียว ไม่ต้อง build ใหม่):

```bash
npx expo install expo-updates
eas update --branch production --message "แก้บั๊กหน้าสถิติ"
```

---

## 8. สรุปคำสั่งที่ใช้บ่อยที่สุด

```bash
npm install                                              # ติดตั้ง deps
npm start                                                # รัน dev
eas build --profile preview --platform android           # ได้ APK ทดสอบ
eas build --profile production --platform all            # ไฟล์ขึ้นสโตร์
npx expo export --platform web                           # เว็บ static
```

---

## 9. แก้ปัญหาที่เจอบ่อย

| อาการ | วิธีแก้ |
|---|---|
| แอปพังหลังแก้ `app.json` / เพิ่ม plugin | `npx expo start --clear` แล้ว build ใหม่ (config plugin ต้อง build ใหม่เสมอ) |
| แจ้งเตือนไม่ทำงานบน Expo Go | ปกติ — SDK 53+ ตัด remote notification ออกจาก Expo Go ให้ใช้ development build |
| `Unable to resolve module ...` | `rm -rf node_modules && npm install && npx expo start --clear` |
| เวอร์ชัน package ไม่ตรง SDK | `npx expo install --check` แล้วตอบ `y` เพื่อให้แก้ให้อัตโนมัติ |
| build ล้ม ไม่รู้สาเหตุ | `npx expo-doctor` ก่อน แล้วดู log เต็มที่ `eas build:view` |
| iOS build ต้องใช้ credential | `eas credentials` — ให้ EAS จัดการ signing ให้อัตโนมัติได้ |
| build ค้างคิวนาน | ใช้ `--local` หรือดูสถานะที่ https://expo.dev/accounts/faradaybanana |

---

## 10. เอกสารอ้างอิง

- Expo SDK 54: https://docs.expo.dev/versions/v54.0.0/
- EAS Build setup: https://docs.expo.dev/build/setup/
- eas.json reference: https://docs.expo.dev/build/eas-json/
- Build APK แทน AAB: https://docs.expo.dev/build-reference/apk/
- Local builds: https://docs.expo.dev/build-reference/local-builds/
- Development builds: https://docs.expo.dev/develop/development-builds/introduction/
