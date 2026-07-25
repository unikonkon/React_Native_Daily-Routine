// โทนสีของไฟล์ที่ส่งออก (.xlsx / .xls) — ที่เดียวที่กำหนดสีทุกบทบาทในไฟล์
// ทุก builder (timetableXlsx · xls · report) รับ ExportPalette เข้าไป ไม่มีสี hardcode เหลืออยู่
//
// 3 โทน: 'current' = ชุดเดิมของแอป (ครีม-ดินเผา) · 'warm' = อุ่นนวลตา · 'slate' = เทาฟ้าเย็นตา
// สีหมวด/ระดับความสำคัญ "คง hue เดิม" แล้วปรับความสว่าง/ความอิ่มตัวตามโทน — จำหมวดจากสีได้เหมือนเดิมทุกโทน

import { ACCENT, DANGER, GREEN } from '@/constants/theme';
import { mix } from '@/lib/xls';

export type ExportTone = 'current' | 'warm' | 'slate';

/** ผสมสอง hex เข้าหากันตามสัดส่วน 0–1 (0 = a ล้วน, 1 = b ล้วน) */
export function blend(a: string, b: string, r: number): string {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const f = (sh: number) => Math.round(((na >> sh) & 255) + (((nb >> sh) & 255) - ((na >> sh) & 255)) * r);
  return '#' + ((1 << 24) + (f(16) << 16) + (f(8) << 8) + f(0)).toString(16).slice(1).toUpperCase();
}

export interface ExportPalette {
  id: ExportTone;
  name: string;
  desc: string;
  /** สีตัวอย่างสำหรับพรีวิวในหน้าเลือกโทน */
  swatch: string[];

  // ---- พื้นหลัง/หัวตาราง ----
  title: string; // แถบหัวเรื่อง (หัวรายงาน · หัวตาราง .xls)
  titleInk: string;
  band: string; // แถบ WEEK
  bandInk: string;
  sep: string; // คอลัมน์คั่นสัปดาห์
  head: string; // หัวหัวข้อรายงาน · หัวตาราง .xls
  head2: string; // หัวคอลัมน์ตารางรายงาน
  headWeekend: string; // หัววันเสาร์–อาทิตย์ (.xls)
  headInk: string;
  /** พื้นแถวหัววันของ Time Table .xlsx — null = ไม่ถมสี (โทน "ปัจจุบัน" ให้เหมือนไฟล์ต้นฉบับ) */
  dayHead: string | null;
  dayHeadWeekend: string | null;
  dayHeadInk: string;

  // ---- พื้นในตาราง ----
  timeCol: string; // คอลัมน์เวลา (ชั่วโมงเต็ม)
  timeColAlt: string | null; // คอลัมน์เวลา (ครึ่งชั่วโมง) — null = ไม่ถมสี
  cellBg: string | null; // ช่องว่างในตาราง — null = ขาวตามโปรแกรม
  weekendCell: string | null; // ช่องว่างวันเสาร์–อาทิตย์
  border: string;

  // ---- ตัวอักษร/สถานะ ----
  ink: string;
  sub: string;
  faint: string;
  ok: string; // ✓ เสร็จ
  bad: string; // ✗ ข้าม

  // ---- ตัวแปลงสีตามข้อมูล (คง hue เดิม ปรับความสว่างตามโทน) ----
  catTint: (hex: string) => string; // พื้นเซลล์ตามหมวด
  catInk: (hex: string) => string; // ตัวอักษรบนพื้นหมวด
  priFill: (hex: string) => string; // ป้ายระดับ P1–P6
  priInk: string;
  userFill: (hex: string) => string; // สีที่จำมาจากไฟล์ต้นฉบับ
  userInk: string; // ตัวอักษรบนสีที่จำไว้
}

const current: ExportPalette = {
  id: 'current',
  name: 'ปัจจุบัน',
  desc: 'ครีม–ดินเผา ตามธีมแอป · คอลัมน์คั่นสีดำเหมือนไฟล์ต้นฉบับ',
  swatch: [ACCENT, '#F9CB9C', '#6B6255', '#000000'],

  title: ACCENT,
  titleInk: '#FFFFFF',
  band: '#F9CB9C',
  bandInk: '#221C13',
  sep: '#000000',
  head: '#6B6255',
  head2: '#8A8175',
  headWeekend: '#8A6D55',
  headInk: '#FFFFFF',
  dayHead: null, // ต้นฉบับ "Time Table จอย.xlsx" หัววันเป็นพื้นขาว
  dayHeadWeekend: null,
  dayHeadInk: '#221C13',

  timeCol: '#EFEFEF',
  timeColAlt: null,
  cellBg: null,
  weekendCell: '#FAF6EE',
  border: '#E3DACB',

  ink: '#221C13',
  sub: '#6E6555',
  faint: '#A79C88',
  ok: GREEN,
  bad: DANGER,

  catTint: (c) => mix(c, 255, 0.78),
  catInk: (c) => mix(c, 0, 0.45),
  priFill: (c) => c,
  priInk: '#FFFFFF',
  userFill: (c) => c,
  userInk: '#221C13',
};

const warm: ExportPalette = {
  id: 'warm',
  name: 'อุ่นสบายตา',
  desc: 'ครีมนวล–น้ำตาลอ่อน คอนทราสต์ต่ำ ไม่มีดำสนิท — อ่านนาน ๆ ไม่ล้าตา',
  swatch: ['#C1714B', '#F3D9BA', '#8A7A64', '#B49A7C'],

  title: '#C1714B',
  titleInk: '#FFFFFF',
  band: '#F3D9BA',
  bandInk: '#4A4034',
  sep: '#B49A7C',
  head: '#8A7A64',
  head2: '#A2937C',
  headWeekend: '#B08E6A',
  headInk: '#FFFFFF',
  dayHead: '#8A7A64',
  dayHeadWeekend: '#B08E6A',
  dayHeadInk: '#FFFFFF',

  timeCol: '#F4EBDD',
  timeColAlt: '#FBF6EE',
  cellBg: '#FFFDF8',
  weekendCell: '#FAF2E6',
  border: '#E6DAC7',

  ink: '#4A4034',
  sub: '#7A6C58',
  faint: '#A2947F',
  ok: '#6E9E6B',
  bad: '#B5705E',

  // นวลลงเล็กน้อยแล้วอุ่นเข้าหาครีม — ยังแยกหมวดออกจากกันได้ชัด
  catTint: (c) => blend(mix(c, 255, 0.74), '#FFF3E2', 0.22),
  catInk: (c) => blend(mix(c, 0, 0.42), '#4A4034', 0.2),
  priFill: (c) => blend(c, '#C9A87E', 0.22),
  priInk: '#FFFFFF',
  userFill: (c) => blend(c, '#FFF6E8', 0.34),
  userInk: '#4A4034',
};

const slate: ExportPalette = {
  id: 'slate',
  name: 'เทาฟ้า',
  desc: 'เทาอมฟ้าเย็นตา ทั้งพื้น หัวตาราง และเส้น — ดูเป็นทางการ พิมพ์ออกมาก็ยังอ่านง่าย',
  swatch: ['#3D5A73', '#A9C0D4', '#44607A', '#34495E'],

  title: '#3D5A73',
  titleInk: '#FFFFFF',
  band: '#A9C0D4',
  bandInk: '#1B2B38',
  sep: '#34495E',
  head: '#44607A',
  head2: '#5C7B95',
  headWeekend: '#6E8AA3',
  headInk: '#FFFFFF',
  dayHead: '#44607A',
  dayHeadWeekend: '#6E8AA3',
  dayHeadInk: '#FFFFFF',

  timeCol: '#DDE6EE',
  timeColAlt: '#EEF3F7',
  cellBg: '#F7FAFC',
  weekendCell: '#E7EEF4',
  border: '#C3D2DE',

  ink: '#1B2B38',
  sub: '#4A6377',
  faint: '#8AA0B2',
  ok: '#2F8F83',
  bad: '#C05B58',

  // คง hue ของหมวดไว้ แต่ดึงเข้าหาเทาฟ้าพอให้เป็นชุดเดียวกัน (ไม่จางจนแยกหมวดไม่ออก)
  catTint: (c) => blend(mix(c, 255, 0.7), '#DDE8F1', 0.26),
  catInk: (c) => blend(mix(c, 0, 0.5), '#1B2B38', 0.3),
  priFill: (c) => blend(c, '#3D5A73', 0.24),
  priInk: '#FFFFFF',
  userFill: (c) => blend(c, '#DCE6EE', 0.45),
  userInk: '#1B2B38',
};

export const EXPORT_PALETTES: Record<ExportTone, ExportPalette> = { current, warm, slate };
export const EXPORT_TONES: ExportPalette[] = [current, warm, slate];
