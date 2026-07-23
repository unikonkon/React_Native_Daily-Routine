// Design tokens — ตรงตาม prototype `Daily Routine Planner (1).html` (APP_STRUCTURE.md §10)

export type ThemeName = 'light' | 'dark';

export const ACCENT = '#D2603A';

const light = {
    bg: '#F4EFE6',
    card: '#FFFFFF',
    card2: '#FBF7F0',
    ink: '#221C13',
    sub: '#6E6555',
    faint: '#A79C88',
    line: 'rgba(34,28,19,0.08)',
    line2: 'rgba(34,28,19,0.13)',
    chip: '#F0EADF',
    glass: 'rgba(247,243,236,0.72)',
  sheet: '#FFFFFF',
  overlay: 'rgba(30,24,16,0.34)',
};

const dark = {
    bg: '#141009',
    card: '#211c14',
    card2: '#2b251b',
    ink: '#F3ECDF',
    sub: '#A79C89',
    faint: '#6d6353',
    line: 'rgba(255,255,255,0.09)',
    line2: 'rgba(255,255,255,0.14)',
    chip: '#2b251b',
    glass: 'rgba(24,20,14,0.72)',
  sheet: '#1c1810',
  overlay: 'rgba(0,0,0,0.6)',
};

export type Palette = { [K in keyof typeof light]: string };
export const PALETTES: Record<ThemeName, Palette> = { light, dark };

export const GREEN = '#4C9A6A'; // done / เวลาว่าง
export const DANGER = '#C0392B'; // ลบ / skipped

export const FONT = {
  ui: 'Anuphan_400Regular',
  uiMed: 'Anuphan_500Medium',
  uiBold: 'Anuphan_600SemiBold',
  num: 'SpaceGrotesk_500Medium',
  numBold: 'SpaceGrotesk_700Bold',
} as const;

export type CatId = 'routine' | 'work' | 'ex' | 'case' | 'learn' | 'me';

interface Category {
  id: CatId;
  name: string;
  short: string;
  color: string;
  icon: string; // ชื่อไอคอน (components/icon.tsx)
  isCase?: boolean;
}

export const CATS: Category[] = [
  { id: 'routine', name: 'กิจวัตรประจำวัน', short: 'กิจวัตร', color: '#E2A34A', icon: 'sun' },
  { id: 'work', name: 'งานประจำ/งานอื่นๆ', short: 'งาน', color: '#5A7EA8', icon: 'briefcase' },
  { id: 'ex', name: 'ออกกำลังกาย', short: 'ออกกำลังกาย', color: '#7DA35A', icon: 'dumbbell' },
  { id: 'case', name: 'งานธุรกิจ/ทีม', short: 'นัดเคส', color: '#B45268', icon: 'users', isCase: true },
  { id: 'learn', name: 'เรียนรู้/อ่านหนังสือ', short: 'เรียนรู้', color: '#836BA8', icon: 'book' },
  { id: 'me', name: 'ส่วนตัว/พักผ่อน', short: 'ส่วนตัว', color: '#3E9C93', icon: 'moon' },
];

export const CAT_BY_ID = Object.fromEntries(CATS.map((c) => [c.id, c])) as Record<CatId, Category>;

export type PriorityId = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6';

export const PRI: { id: PriorityId; label: string; color: string }[] = [
  { id: 'P1', label: 'คนใหม่ / มีปัญหา', color: '#C0392B' },
  { id: 'P2', label: 'ด่วน', color: '#D2603A' },
  { id: 'P3', label: 'ปกติ', color: '#E2A34A' },
  { id: 'P4', label: 'ทีมภายใน', color: '#7DA35A' },
  { id: 'P5', label: 'ติดตามผล', color: '#5A7EA8' },
  { id: 'P6', label: 'ทั่วไป', color: '#8A8175' },
];

export const PRI_BY_ID = Object.fromEntries(PRI.map((p) => [p.id, p])) as Record<
  PriorityId,
  (typeof PRI)[number]
>;

// quick-pick chips ต่อหมวด (จาก prototype)
export const QUICK_PICKS: Record<CatId, string[]> = {
  routine: ['ตื่นนอน', 'อาบน้ำ', 'พักเที่ยง', 'เข้านอน'],
  work: ['งานประจำ', 'ประชุมทีม', 'เคลียร์อีเมล'],
  ex: ['เวทเทรนนิ่ง', 'คาร์ดิโอ', 'คลาสโยคะ'],
  case: ['นัดเคส', 'ติดตามผล', 'ประชุมทีม'],
  learn: ['อ่านหนังสือ', 'ฟังพอดแคสต์', 'คลาสออนไลน์'],
  me: ['พักผ่อน/ดูซีรีส์', 'ตลาด & ธุระส่วนตัว'],
};

// หน้าต่างเวลาของวัน (นาที) — 06:00–30:00 (06:00 วันถัดไป) ครบ 24 ชม., ข้ามเที่ยงคืนได้
export const DAY_START = 360;
export const DAY_END = 1800;
export const FREE_START = 360; // slot ว่างนับจาก 06:00
export const MIN_FREE_GAP = 45;
export const SNAP = 15;
