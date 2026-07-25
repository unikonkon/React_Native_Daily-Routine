// ตารางตัวอย่าง = ข้อมูลจริงจากไฟล์ "Time Table จอย.xlsx" (บล็อก MONTH 4/2025 · เม.ย. 2568) — 31 วัน · 186 ช่วงกิจกรรม
// อ่านครั้งเดียวด้วยตัวอ่านของแอปเอง (parseTimeTableXlsx) แล้วฝังเป็นข้อมูลนิ่ง — กดปุ่มตัวอย่างแล้วใช้ได้ทันที ไม่ต้องเลือกไฟล์/ต่อเน็ต
// ถ้าไฟล์ต้นฉบับเปลี่ยน: นำเข้าไฟล์ผ่านหน้า "ข้อมูล → นำเข้า Time Table" แล้วส่งออกกลับมาแทนที่ TT_DAYS ทั้งก้อน
// s/e = นาทีจากเที่ยงคืน (เกิน 1440 = ข้ามเที่ยงคืน) · color = สีพื้นเซลล์เดิมจากไฟล์ (ส่งออก .xlsx แล้วได้สีเดิม)
import type { CatId, PriorityId } from '@/constants/theme';

export interface TTItem {
  s: number;
  e: number;
  title: string;
  cat: CatId;
  color: string;
}

/** ป้ายเดือนของไฟล์ต้นฉบับ — ใช้ในข้อความยืนยัน/แจ้งผล */
export const TT_SOURCE_LABEL = 'Time Table จอย · เม.ย. 2568';

/** 1 วันของตารางต้นฉบับ เรียงตามวันที่ — wd: 0=จันทร์ … 6=อาทิตย์ */
export const TT_DAYS: { wd: number; items: TTItem[] }[] = [
  // 1 เม.ย. (อังคาร)
  { wd: 1, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 540, e: 1080, title: 'work', cat: 'work', color: '#F7F794' },
    { s: 1080, e: 1140, title: 'นัดเคส / เพิ่มเพื่อน', cat: 'case', color: '#EAD1DC' },
    { s: 1140, e: 1380, title: 'center bkk', cat: 'work', color: '#EA9999' },
    { s: 1380, e: 1410, title: 'อาบน้ำ-บำรุงผิว', cat: 'routine', color: '#C9DAF8' },
    { s: 1410, e: 1500, title: 'QC Center', cat: 'work', color: '#3C78D8' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 2 เม.ย. (พุธ)
  { wd: 2, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 540, e: 1080, title: 'work', cat: 'work', color: '#F7F794' },
    { s: 1080, e: 1200, title: 'Weight', cat: 'ex', color: '#FFFF00' },
    { s: 1200, e: 1290, title: 'เคส BM พี่คิง', cat: 'case', color: '#93C47D' },
    { s: 1290, e: 1350, title: 'นัดเคส / เพิ่มเพื่อน', cat: 'case', color: '#EAD1DC' },
    { s: 1350, e: 1440, title: 'ฟังลิ้งก์', cat: 'learn', color: '#FFD966' },
    { s: 1440, e: 1500, title: 'อ่านหนังสือ', cat: 'learn', color: '#D9D2E9' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 3 เม.ย. (พฤหัส)
  { wd: 3, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 540, e: 1080, title: 'work', cat: 'work', color: '#F7F794' },
    { s: 1080, e: 1200, title: 'Arobic dance', cat: 'ex', color: '#FFFF00' },
    { s: 1200, e: 1290, title: 'เคส BM เกต', cat: 'case', color: '#93C47D' },
    { s: 1290, e: 1350, title: 'นัดเคส / เพิ่มเพื่อน', cat: 'case', color: '#EAD1DC' },
    { s: 1440, e: 1500, title: 'อ่านหนังสือ', cat: 'learn', color: '#D9D2E9' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 4 เม.ย. (ศุกร์)
  { wd: 4, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 540, e: 660, title: 'ตอบแชท 3 ชม.', cat: 'work', color: '#FF00FF' },
    { s: 660, e: 1320, title: 'BEYOND Escort Staff', cat: 'case', color: '#A2C4C9' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 5 เม.ย. (เสาร์)
  { wd: 5, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 600, e: 1110, title: 'BEYOND', cat: 'case', color: '#A2C4C9' },
    { s: 1290, e: 1380, title: 'BM Someone', cat: 'case', color: '#93C47D' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 6 เม.ย. (อาทิตย์)
  { wd: 6, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 780, e: 930, title: 'ตอบเเชท MLAB', cat: 'work', color: '#FF00FF' },
    { s: 1080, e: 1320, title: 'Bridge Online', cat: 'case', color: '#00FFFF' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 7 เม.ย. (จันทร์)
  { wd: 0, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 540, e: 1080, title: 'work', cat: 'work', color: '#F7F794' },
    { s: 1080, e: 1200, title: 'Arobic dance / weight', cat: 'ex', color: '#FFFF00' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 8 เม.ย. (อังคาร)
  { wd: 1, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 540, e: 1080, title: 'work', cat: 'work', color: '#F7F794' },
    { s: 1080, e: 1140, title: 'นัดเคส / เพิ่มเพื่อน', cat: 'case', color: '#EAD1DC' },
    { s: 1140, e: 1380, title: 'center bkk', cat: 'work', color: '#EA9999' },
    { s: 1380, e: 1410, title: 'อาบน้ำ-บำรุงผิว', cat: 'routine', color: '#C9DAF8' },
    { s: 1410, e: 1500, title: 'QC Center', cat: 'work', color: '#3C78D8' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 9 เม.ย. (พุธ)
  { wd: 2, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 540, e: 1080, title: 'work', cat: 'work', color: '#F7F794' },
    { s: 1080, e: 1200, title: 'Arobic dance / weight', cat: 'ex', color: '#FFFF00' },
    { s: 1230, e: 1290, title: 'นัดเคส / เพิ่มเพื่อน', cat: 'case', color: '#EAD1DC' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 10 เม.ย. (พฤหัส)
  { wd: 3, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 540, e: 1080, title: 'work', cat: 'work', color: '#F7F794' },
    { s: 1080, e: 1200, title: 'Arobic dance / weight', cat: 'ex', color: '#FFFF00' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 11 เม.ย. (ศุกร์)
  { wd: 4, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 1260, e: 1440, title: 'ตอบแชท MLAB', cat: 'work', color: '#FF00FF' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 12 เม.ย. (เสาร์)
  { wd: 5, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 1260, e: 1440, title: 'ตอบแชท MLAB', cat: 'work', color: '#FF00FF' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
    { s: 1590, e: 1620, title: '็็How to & รายได้ 5 ข้อ พี่คิง', cat: 'learn', color: '#93C47D' },
  ] },
  // 13 เม.ย. (อาทิตย์)
  { wd: 6, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 1260, e: 1440, title: 'ตอบแชท MLAB', cat: 'work', color: '#FF00FF' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 14 เม.ย. (จันทร์)
  { wd: 0, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 1260, e: 1440, title: 'ตอบแชท MLAB', cat: 'work', color: '#FF00FF' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 15 เม.ย. (อังคาร)
  { wd: 1, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 1080, e: 1140, title: 'นัดเคส / เพิ่มเพื่อน', cat: 'case', color: '#EAD1DC' },
    { s: 1140, e: 1380, title: 'center bkk', cat: 'work', color: '#EA9999' },
    { s: 1380, e: 1410, title: 'อาบน้ำ-บำรุงผิว', cat: 'routine', color: '#C9DAF8' },
    { s: 1410, e: 1500, title: 'QC Center', cat: 'work', color: '#3C78D8' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 16 เม.ย. (พุธ)
  { wd: 2, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 540, e: 1080, title: 'WORK', cat: 'work', color: '#F7F794' },
    { s: 1080, e: 1200, title: 'Arobic dance / weight', cat: 'ex', color: '#FFFF00' },
    { s: 1350, e: 1410, title: 'ฟังลิ้งก์', cat: 'learn', color: '#FFD966' },
    { s: 1410, e: 1500, title: 'อ่านหนังสือ', cat: 'learn', color: '#D9D2E9' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 17 เม.ย. (พฤหัส)
  { wd: 3, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 540, e: 1080, title: 'work', cat: 'work', color: '#F7F794' },
    { s: 1080, e: 1200, title: 'Arobic dance / weight', cat: 'ex', color: '#FFFF00' },
    { s: 1350, e: 1440, title: 'ฟังลิ้งก์', cat: 'learn', color: '#FFD966' },
    { s: 1440, e: 1500, title: 'อ่านหนังสือ', cat: 'learn', color: '#D9D2E9' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 18 เม.ย. (ศุกร์)
  { wd: 4, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 960, e: 1050, title: 'ฟังลิ้งก์', cat: 'learn', color: '#FFD966' },
    { s: 1050, e: 1170, title: 'ลงเคสBM// Book club online', cat: 'case', color: '#00FF00' },
    { s: 1260, e: 1440, title: 'ตอบแชท MLAB', cat: 'work', color: '#FF00FF' },
    { s: 1440, e: 1500, title: 'อ่านหนังสือ', cat: 'learn', color: '#D9D2E9' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 19 เม.ย. (เสาร์)
  { wd: 5, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 1080, e: 1200, title: 'community', cat: 'case', color: '#6AA84F' },
    { s: 1260, e: 1440, title: 'ตอบแชท MLAB', cat: 'work', color: '#FF00FF' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 20 เม.ย. (อาทิตย์)
  { wd: 6, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 540, e: 1080, title: 'WORK', cat: 'work', color: '#F7F794' },
    { s: 1140, e: 1380, title: 'Bridge Online', cat: 'case', color: '#00FFFF' },
    { s: 1380, e: 1410, title: 'QC Center', cat: 'work', color: '#3C78D8' },
    { s: 1410, e: 1500, title: 'อ่านหนังสือ', cat: 'learn', color: '#D9D2E9' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 21 เม.ย. (จันทร์)
  { wd: 0, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 540, e: 1080, title: 'WORK', cat: 'work', color: '#F7F794' },
    { s: 1080, e: 1170, title: 'fitness', cat: 'ex', color: '#FFFF00' },
    { s: 1170, e: 1260, title: 'ติดตาม 6วีคสาวต่าย', cat: 'case', color: '#00FF00' },
    { s: 1350, e: 1410, title: 'ฟังลิ้งก์', cat: 'learn', color: '#FFD966' },
    { s: 1410, e: 1500, title: 'อ่านหนังสือ', cat: 'learn', color: '#D9D2E9' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 22 เม.ย. (อังคาร)
  { wd: 1, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 540, e: 1080, title: 'WORK', cat: 'work', color: '#F7F794' },
    { s: 1140, e: 1380, title: 'center bkk Lighther', cat: 'work', color: '#EA9999' },
    { s: 1380, e: 1410, title: 'อาบน้ำ-บำรุงผิว', cat: 'routine', color: '#C9DAF8' },
    { s: 1410, e: 1500, title: 'QC Center', cat: 'work', color: '#3C78D8' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 23 เม.ย. (พุธ)
  { wd: 2, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 540, e: 1080, title: 'WORK', cat: 'work', color: '#F7F794' },
    { s: 1080, e: 1290, title: 'Admin Page MLAB', cat: 'work', color: '#D5A6BD' },
    { s: 1350, e: 1410, title: 'ฟังลิ้งก์', cat: 'learn', color: '#FFD966' },
    { s: 1410, e: 1500, title: 'อ่านหนังสือ', cat: 'learn', color: '#D9D2E9' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 24 เม.ย. (พฤหัส)
  { wd: 3, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 540, e: 1080, title: 'work', cat: 'work', color: '#F7F794' },
    { s: 1350, e: 1440, title: 'ฟังลิ้งก์', cat: 'learn', color: '#FFD966' },
    { s: 1440, e: 1500, title: 'อ่านหนังสือ', cat: 'learn', color: '#D9D2E9' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 25 เม.ย. (ศุกร์)
  { wd: 4, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 900, e: 990, title: 'fitness', cat: 'ex', color: '#FFFF00' },
    { s: 990, e: 1110, title: 'ลงเคสBM// Book club online', cat: 'case', color: '#00FF00' },
    { s: 1110, e: 1200, title: 'ฟังลิ้งก์', cat: 'learn', color: '#FFD966' },
    { s: 1200, e: 1230, title: 'อ่านหนังสือ', cat: 'learn', color: '#D9D2E9' },
    { s: 1260, e: 1440, title: 'ตอบแชท MLAB', cat: 'work', color: '#FF00FF' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 26 เม.ย. (เสาร์)
  { wd: 5, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 1080, e: 1200, title: 'community', cat: 'case', color: '#6AA84F' },
    { s: 1260, e: 1440, title: 'ตอบแชท MLAB', cat: 'work', color: '#FF00FF' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 27 เม.ย. (อาทิตย์)
  { wd: 6, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 540, e: 1080, title: 'WORK', cat: 'work', color: '#F7F794' },
    { s: 1080, e: 1260, title: 'ไป Survey มศว.', cat: 'work', color: '#FF9900' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 28 เม.ย. (จันทร์)
  { wd: 0, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 540, e: 1080, title: 'WORK', cat: 'work', color: '#F7F794' },
    { s: 1080, e: 1170, title: 'fitness', cat: 'ex', color: '#FFFF00' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 29 เม.ย. (อังคาร)
  { wd: 1, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 540, e: 1080, title: 'WORK', cat: 'work', color: '#F7F794' },
    { s: 1140, e: 1380, title: 'center bkk', cat: 'work', color: '#EA9999' },
    { s: 1380, e: 1410, title: 'อาบน้ำ-บำรุงผิว', cat: 'routine', color: '#C9DAF8' },
    { s: 1410, e: 1500, title: 'QC Center', cat: 'work', color: '#3C78D8' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 30 เม.ย. (พุธ)
  { wd: 2, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 540, e: 1080, title: 'WORK', cat: 'work', color: '#F7F794' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
  // 1 พ.ค. (พฤหัส)
  { wd: 3, items: [
    { s: 360, e: 420, title: 'WAKE UP+GET DRESS+ GO TO WORK', cat: 'routine', color: '#EAD1DC' },
    { s: 510, e: 540, title: 'eat BF / Shake Bodykey', cat: 'routine', color: '#FFF2CC' },
    { s: 1500, e: 1590, title: 'go to bed', cat: 'routine', color: '#B7B7B7' },
  ] },
];

/** รายชื่อที่ปรากฏในชื่อเคสของตาราง — นัดเคสที่ชื่อมีคำใน match จะถูกผูกกับคนนี้ */
export const TT_CONTACTS: { name: string; priority: PriorityId; match: string; phone: string | null; line: string | null }[] = [
  { name: 'พี่คิง', priority: 'P2', match: 'พี่คิง', phone: '0812345678', line: '@king' },
  { name: 'เกต', priority: 'P3', match: 'เกต', phone: '0823456789', line: '@gate' },
  { name: 'สาวต่าย', priority: 'P3', match: 'สาวต่าย', phone: '0834567890', line: null },
  { name: 'Someone', priority: 'P5', match: 'BM Someone', phone: null, line: null },
];

/** ระดับความสำคัญของนัดเคสตามชื่อเรื่อง (คำแรกที่ตรงชนะ) — ที่ไม่ตรงเลยใช้ P4 */
export const TT_CASE_PRI: { match: string; priority: PriorityId }[] = [
  { match: 'เคส BM', priority: 'P2' },
  { match: 'BM Someone', priority: 'P2' },
  { match: 'ติดตาม', priority: 'P3' },
  { match: 'BEYOND', priority: 'P3' },
  { match: 'นัดเคส', priority: 'P4' },
  { match: 'ลงเคสBM', priority: 'P4' },
  { match: 'Bridge', priority: 'P5' },
  { match: 'community', priority: 'P5' },
];
