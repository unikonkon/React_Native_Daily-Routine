// Design tokens — ตรงตาม prototype `Daily Routine Planner (1).html` (APP_STRUCTURE.md §10)
// ธีม: โหมด (สว่าง/มืด/ตามระบบ) × ชุดสี 8 แบบต่อโหมด — เลือกที่ ตั้งค่า › ธีมและการแสดงผล

/** โหมดที่ใช้จริง */
export type ThemeName = 'light' | 'dark';
/** ค่าที่ผู้ใช้เลือกในตั้งค่า — 'system' = ตามโหมดของเครื่อง */
export type ThemePref = ThemeName | 'system';

export type LightThemeId = 'cream' | 'rose' | 'lavender' | 'sage' | 'peach' | 'sky' | 'honey' | 'mist';
export type DarkThemeId = 'cocoa' | 'plum' | 'midnight' | 'forest' | 'graphite' | 'ocean' | 'gold' | 'onyx';
export type ThemeId = LightThemeId | DarkThemeId;

/** สีเน้นของธีมเดิม (ครีมอุ่น/โกโก้) — ใช้กับไฟล์ส่งออกซึ่งไม่ตามธีมแอป · ในแอปใช้ useTokens().accent */
export const ACCENT = '#D2603A';
/**
 * สี "ต้องสนใจ" — ค้างบันทึก · เวลาชนกัน · ยังไม่ถึงเป้า · ถามก่อนทิ้งโน้ตที่ยังไม่บันทึก
 * คงที่ทุกธีม (เป็นความหมายของข้อมูล เหมือน GREEN/DANGER) ไม่ใช่สีแบรนด์ของธีม
 */
export const ATTN = '#D2603A';

export interface Palette {
  bg: string;
  card: string;
  card2: string;
  ink: string;
  sub: string;
  faint: string;
  line: string;
  line2: string;
  chip: string;
  glass: string;
  sheet: string;
  overlay: string;
  // ---- ระบบ B1 (รางติ๊ก · ไอคอนมุมมอง · แถบล่าง) ----
  track: string;
  tabOn: string;
  muted: string;
  rail: string;
  railDash: string;
  // ---- สีเน้นของธีม ----
  accent: string;
  accentInk: string;
  primary: string;
  primaryDown: string;
  // ---- สีความหมาย (เหมือนกันทุกธีมในโหมดเดียวกัน) ----
  warn: string;
  /** พื้นปุ่ม/ช่องติ๊กสีอันตรายที่มีตัวหนังสือขาวทับ — ธีมมืดใช้สีเข้มกว่า warn (warn ธีมมืดสว่างเกินสำหรับตัวหนังสือขาว) */
  warnFill: string;
  greenInk: string;
  freeLine: string;
  skipFill: string;
  /** สีเงาของการ์ด/ปุ่มลอย — โหมดสว่าง = หมึกของธีมนั้น (เงาอมสีธีม ไม่ติดน้ำตาล) · โหมดมืด = ดำ */
  shadow: string;
}

// ค่าสีพื้น/ตัวอักษรของธีมใหม่ทำจากบันไดความสว่างเดียวกับธีมเดิม (OKLCH) แล้วเปลี่ยนเฉดสี — คอนทราสต์จึงเท่าธีมเดิมทุกธีม
const cream: Palette = {
  bg: '#F7F3EC',
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
  track: '#EDE6DA', // ราง segmented / ปุ่มรอง
  tabOn: '#EAE3D7', // pill แท็บที่เปิดอยู่
  muted: '#8A8175', // ข้อความรายการที่ทำแล้ว/ข้าม · เวลาสิ้นสุด
  rail: '#E2DACD', // เส้นราง
  railDash: '#CFC6B6', // รางช่วงเวลาว่าง (เส้นประ)
  accent: '#D2603A', // สีเน้นของธีม — วงวันนี้ · ตัวเลือกที่เลือก · ลิงก์ · จุด "ตอนนี้" (ตัวอักษรขาววางทับได้)
  accentInk: '#B44E2C', // ข้อความเน้นบนพื้นการ์ด (คอนทราสต์ ≥ 4.5)
  primary: '#B44E2C', // พื้นปุ่มหลัก (ตัวอักษรขาว)
  primaryDown: '#9A3F22', // ปุ่มหลักตอนกด
  warn: '#A33F1F', // ค้างบันทึก / ลบ
  warnFill: '#A33F1F',
  greenInk: '#2F6B45', // ข้อความสีเขียว (เวลาว่าง)
  freeLine: '#CFE0D3', // กรอบเส้นประช่วงว่าง
  skipFill: '#DDD5C8', // วงกลม "ข้าม"
  shadow: '#221C13',
};

const rose: Palette = {
  bg: '#FCF0F2',
  card: '#FFFFFF',
  card2: '#FFF4F6',
  ink: '#27181B',
  sub: '#785E63',
  faint: '#B4949A',
  line: 'rgba(39,24,27,0.08)',
  line2: 'rgba(39,24,27,0.13)',
  chip: '#F7E6E9',
  glass: 'rgba(252,240,242,0.72)',
  sheet: '#FFFFFF',
  overlay: 'rgba(30,18,21,0.34)',
  track: '#F5E1E5',
  tabOn: '#F2DEE2',
  muted: '#917C80',
  rail: '#EAD5D9',
  railDash: '#D9BFC4',
  accent: '#D2557F',
  accentInk: '#AE3A66',
  primary: '#AE3A66',
  primaryDown: '#932D55',
  warn: '#A33F1F',
  warnFill: '#A33F1F',
  greenInk: '#2F6B45',
  freeLine: '#CFE0D3',
  skipFill: '#E5D0D4',
  shadow: '#27181B',
};

const lavender: Palette = {
  bg: '#F5F2FC',
  card: '#FFFFFF',
  card2: '#F9F6FF',
  ink: '#1F1A27',
  sub: '#696278',
  faint: '#A198B4',
  line: 'rgba(31,26,39,0.08)',
  line2: 'rgba(31,26,39,0.13)',
  chip: '#EDE8F8',
  glass: 'rgba(245,242,252,0.72)',
  sheet: '#FFFFFF',
  overlay: 'rgba(23,20,30,0.34)',
  track: '#E9E4F5',
  tabOn: '#E6E1F2',
  muted: '#857F91',
  rail: '#DDD8EB',
  railDash: '#CAC3DA',
  accent: '#8E6FD1',
  accentInk: '#6E50B5',
  primary: '#6E50B5',
  primaryDown: '#5B409C',
  warn: '#A33F1F',
  warnFill: '#A33F1F',
  greenInk: '#2F6B45',
  freeLine: '#CFE0D3',
  skipFill: '#D8D3E6',
  shadow: '#1F1A27',
};

const sage: Palette = {
  bg: '#EDF6F1',
  card: '#FFFFFF',
  card2: '#F1FAF5',
  ink: '#132119',
  sub: '#566C60',
  faint: '#89A595',
  line: 'rgba(19,33,25,0.08)',
  line2: 'rgba(19,33,25,0.13)',
  chip: '#E0EFE6',
  glass: 'rgba(237,246,241,0.72)',
  sheet: '#FFFFFF',
  overlay: 'rgba(14,25,19,0.34)',
  track: '#DBECE2',
  tabOn: '#D8E9DF',
  muted: '#76887D',
  rail: '#CEE0D6',
  railDash: '#B7CEC0',
  accent: '#2B9485',
  accentInk: '#1F7468',
  primary: '#1F7468',
  primaryDown: '#175F55',
  warn: '#A33F1F',
  warnFill: '#A33F1F',
  greenInk: '#2F6B45',
  freeLine: '#CFE0D3',
  skipFill: '#C9DBD1',
  shadow: '#132119',
};

const peach: Palette = {
  bg: '#FEF0EA',
  card: '#FFFFFF',
  card2: '#FFF5F1',
  ink: '#2A1810',
  sub: '#7D5E51',
  faint: '#BA9483',
  line: 'rgba(42,24,16,0.08)',
  line2: 'rgba(42,24,16,0.13)',
  chip: '#FBE6DC',
  glass: 'rgba(254,240,234,0.72)',
  sheet: '#FFFFFF',
  overlay: 'rgba(30,19,14,0.34)',
  track: '#F9E1D7',
  tabOn: '#F6DED4',
  muted: '#957C71',
  rail: '#EFD5C9',
  railDash: '#DFBFB2',
  accent: '#DD5A50',
  accentInk: '#BC4640',
  primary: '#BC4640',
  primaryDown: '#A03933',
  warn: '#A33F1F',
  warnFill: '#A33F1F',
  greenInk: '#2F6B45',
  freeLine: '#CFE0D3',
  skipFill: '#EAD0C4',
  shadow: '#2A1810',
};

const cocoa: Palette = {
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
  track: '#2b251b',
  tabOn: '#352d21',
  muted: '#8F8573',
  rail: '#3a3226',
  railDash: '#4A4236',
  accent: '#D2603A',
  accentInk: '#EE8A63',
  primary: '#B44E2C',
  primaryDown: '#9A3F22',
  warn: '#F08A64',
  warnFill: '#B4482A',
  greenInk: '#6FBF8C',
  freeLine: '#2F4A38',
  skipFill: '#4A4236',
  shadow: '#000000',
};

const plum: Palette = {
  bg: '#180C13',
  card: '#261820',
  card2: '#312029',
  ink: '#FDE5F1',
  sub: '#B492A4',
  faint: '#775B6A',
  line: 'rgba(255,255,255,0.09)',
  line2: 'rgba(255,255,255,0.14)',
  chip: '#312029',
  glass: 'rgba(33,20,27,0.72)',
  sheet: '#21141B',
  overlay: 'rgba(0,0,0,0.6)',
  track: '#312029',
  tabOn: '#3C2733',
  muted: '#9B7B8D',
  rail: '#412C38',
  railDash: '#523C48',
  accent: '#D9558C',
  accentInk: '#F590B6',
  primary: '#B43A70',
  primaryDown: '#992E5E',
  warn: '#F08A64',
  warnFill: '#B4482A',
  greenInk: '#6FBF8C',
  freeLine: '#2F4A38',
  skipFill: '#523C48',
  shadow: '#000000',
};

const midnight: Palette = {
  bg: '#0F0F1B',
  card: '#1B1B2A',
  card2: '#242436',
  ink: '#EAEBFE',
  sub: '#9A9ABC',
  faint: '#61617F',
  line: 'rgba(255,255,255,0.09)',
  line2: 'rgba(255,255,255,0.14)',
  chip: '#242436',
  glass: 'rgba(23,23,37,0.72)',
  sheet: '#171725',
  overlay: 'rgba(0,0,0,0.6)',
  track: '#242436',
  tabOn: '#2C2B42',
  muted: '#8383A3',
  rail: '#313147',
  railDash: '#414157',
  accent: '#8F79E0',
  accentInk: '#BBABF6',
  primary: '#6B55C2',
  primaryDown: '#5844A6',
  warn: '#F08A64',
  warnFill: '#B4482A',
  greenInk: '#6FBF8C',
  freeLine: '#2F4A38',
  skipFill: '#414157',
  shadow: '#000000',
};

const forest: Palette = {
  bg: '#07140E',
  card: '#12201A',
  card2: '#192A23',
  ink: '#DDF3E8',
  sub: '#86A697',
  faint: '#506C5F',
  line: 'rgba(255,255,255,0.09)',
  line2: 'rgba(255,255,255,0.14)',
  chip: '#192A23',
  glass: 'rgba(14,28,22,0.72)',
  sheet: '#0E1C16',
  overlay: 'rgba(0,0,0,0.6)',
  track: '#192A23',
  tabOn: '#1E342A',
  muted: '#708E80',
  rail: '#23392F',
  railDash: '#33493F',
  accent: '#289485',
  accentInk: '#76D3C3',
  primary: '#1E7C70',
  primaryDown: '#17665C',
  warn: '#F08A64',
  warnFill: '#B4482A',
  greenInk: '#6FBF8C',
  freeLine: '#2F4A38',
  skipFill: '#33493F',
  shadow: '#000000',
};

const graphite: Palette = {
  bg: '#121011',
  card: '#1F1C1D',
  card2: '#282526',
  ink: '#F0EBED',
  sub: '#A29B9E',
  faint: '#686365',
  line: 'rgba(255,255,255,0.09)',
  line2: 'rgba(255,255,255,0.14)',
  chip: '#282526',
  glass: 'rgba(26,24,25,0.72)',
  sheet: '#1A1819',
  overlay: 'rgba(0,0,0,0.6)',
  track: '#282526',
  tabOn: '#312D2F',
  muted: '#8B8487',
  rail: '#363234',
  railDash: '#464244',
  accent: '#C66D78',
  accentInk: '#EFAAAC',
  primary: '#AC5560',
  primaryDown: '#914550',
  warn: '#F08A64',
  warnFill: '#B4482A',
  greenInk: '#6FBF8C',
  freeLine: '#2F4A38',
  skipFill: '#464244',
  shadow: '#000000',
};

const sky: Palette = {
  bg: '#ECF5FC',
  card: '#FFFFFF',
  card2: '#F1F9FF',
  ink: '#131E28',
  sub: '#566979',
  faint: '#89A1B5',
  line: 'rgba(19,30,40,0.08)',
  line2: 'rgba(19,30,40,0.13)',
  chip: '#E0EDF8',
  glass: 'rgba(236,245,252,0.72)',
  sheet: '#FFFFFF',
  overlay: 'rgba(14,23,31,0.34)',
  track: '#DBE9F6',
  tabOn: '#D8E6F3',
  muted: '#758592',
  rail: '#CEDDEB',
  railDash: '#B7CADB',
  accent: '#4A86D4',
  accentInk: '#2F68B5',
  primary: '#2F68B5',
  primaryDown: '#25569A',
  warn: '#A33F1F',
  warnFill: '#A33F1F',
  greenInk: '#2F6B45',
  freeLine: '#CFE0D3',
  skipFill: '#C9D8E6',
  shadow: '#131E28',
};

const honey: Palette = {
  bg: '#F8F3E5',
  card: '#FFFFFF',
  card2: '#FCF7E9',
  ink: '#231C07',
  sub: '#716644',
  faint: '#AA9D73',
  line: 'rgba(35,28,7,0.08)',
  line2: 'rgba(35,28,7,0.13)',
  chip: '#F2EBD4',
  glass: 'rgba(248,243,229,0.72)',
  sheet: '#FFFFFF',
  overlay: 'rgba(25,22,11,0.34)',
  track: '#EFE7CE',
  tabOn: '#ECE4CB',
  muted: '#8B8268',
  rail: '#E4DBC0',
  railDash: '#D2C7A6',
  accent: '#AD7818',
  accentInk: '#8A5E0F',
  primary: '#8A5E0F',
  primaryDown: '#724D0A',
  warn: '#A33F1F',
  warnFill: '#A33F1F',
  greenInk: '#2F6B45',
  freeLine: '#CFE0D3',
  skipFill: '#DFD6BB',
  shadow: '#231C07',
};

const mist: Palette = {
  bg: '#F2F4F6',
  card: '#FFFFFF',
  card2: '#F6F8FA',
  ink: '#1B1D20',
  sub: '#63666C',
  faint: '#999EA4',
  line: 'rgba(27,29,32,0.08)',
  line2: 'rgba(27,29,32,0.13)',
  chip: '#E8EBEF',
  glass: 'rgba(242,244,246,0.72)',
  sheet: '#FFFFFF',
  overlay: 'rgba(17,22,31,0.34)',
  track: '#E4E7EB',
  tabOn: '#E1E4E8',
  muted: '#808387',
  rail: '#D8DBE0',
  railDash: '#C4C7CD',
  accent: '#66758F',
  accentInk: '#48566E',
  primary: '#48566E',
  primaryDown: '#39455A',
  warn: '#A33F1F',
  warnFill: '#A33F1F',
  greenInk: '#2F6B45',
  freeLine: '#CFE0D3',
  skipFill: '#D3D6DB',
  shadow: '#1B1D20',
};

const ocean: Palette = {
  bg: '#07111C',
  card: '#121E2A',
  card2: '#182737',
  ink: '#E0EFFE',
  sub: '#85A1BE',
  faint: '#4F6780',
  line: 'rgba(255,255,255,0.09)',
  line2: 'rgba(255,255,255,0.14)',
  chip: '#182737',
  glass: 'rgba(14,26,37,0.72)',
  sheet: '#0E1A25',
  overlay: 'rgba(0,0,0,0.6)',
  track: '#182737',
  tabOn: '#1D3043',
  muted: '#6F89A5',
  rail: '#223548',
  railDash: '#334558',
  accent: '#3F86D9',
  accentInk: '#8EC0F7',
  primary: '#2A68B8',
  primaryDown: '#21559A',
  warn: '#F08A64',
  warnFill: '#B4482A',
  greenInk: '#6FBF8C',
  freeLine: '#2F4A38',
  skipFill: '#334558',
  shadow: '#000000',
};

const gold: Palette = {
  bg: '#131107',
  card: '#201D12',
  card2: '#292619',
  ink: '#F1EDDC',
  sub: '#A49E85',
  faint: '#6A654F',
  line: 'rgba(255,255,255,0.09)',
  line2: 'rgba(255,255,255,0.14)',
  chip: '#292619',
  glass: 'rgba(27,25,14,0.72)',
  sheet: '#1B190E',
  overlay: 'rgba(0,0,0,0.6)',
  track: '#292619',
  tabOn: '#332E1E',
  muted: '#8D866F',
  rail: '#383323',
  railDash: '#484333',
  accent: '#A87A1B',
  accentInk: '#E6BE6A',
  primary: '#8A6212',
  primaryDown: '#724F0C',
  warn: '#F08A64',
  warnFill: '#B4482A',
  greenInk: '#6FBF8C',
  freeLine: '#2F4A38',
  skipFill: '#484333',
  shadow: '#000000',
};

const onyx: Palette = {
  bg: '#030405',
  card: '#0C0D0F',
  card2: '#141618',
  ink: '#EBEDF1',
  sub: '#9A9EA3',
  faint: '#626569',
  line: 'rgba(255,255,255,0.09)',
  line2: 'rgba(255,255,255,0.14)',
  chip: '#141618',
  glass: 'rgba(8,9,11,0.72)',
  sheet: '#08090B',
  overlay: 'rgba(0,0,0,0.6)',
  track: '#141618',
  tabOn: '#1B1E21',
  muted: '#83868C',
  rail: '#202226',
  railDash: '#2F3135',
  accent: '#76839A',
  accentInk: '#C3CCDA',
  primary: '#58657C',
  primaryDown: '#485367',
  warn: '#F08A64',
  warnFill: '#B4482A',
  greenInk: '#6FBF8C',
  freeLine: '#2F4A38',
  skipFill: '#2F3135',
  shadow: '#000000',
};

export const THEME_PALETTES: Record<ThemeId, Palette> = { cream, rose, lavender, sage, peach, sky, honey, mist, cocoa, plum, midnight, forest, graphite, ocean, gold, onyx };

export interface ThemeMeta<K extends ThemeId = ThemeId> {
  id: K;
  name: string;
  /** คำบรรยายสั้นใต้ชื่อในหน้าเลือกธีม */
  mood: string;
}

export const LIGHT_THEMES: ThemeMeta<LightThemeId>[] = [
  { id: 'cream', name: 'ครีมอุ่น', mood: 'กระดาษครีมกับส้มอิฐ · แบบเดิม' },
  { id: 'rose', name: 'โรสบลัช', mood: 'ชมพูกุหลาบ นุ่มและหวาน' },
  { id: 'lavender', name: 'ลาเวนเดอร์', mood: 'ม่วงอ่อน สงบ ผ่อนคลาย' },
  { id: 'sage', name: 'เซจมินต์', mood: 'เขียวเซจ สดชื่น สบายตา' },
  { id: 'peach', name: 'พีชโครัล', mood: 'พีชอุ่น สดใส มีพลัง' },
  { id: 'sky', name: 'สกายบลู', mood: 'ฟ้าใส โปร่ง สบายใจ' },
  { id: 'honey', name: 'ฮันนี่บัตเตอร์', mood: 'เหลืองนวลกับทองน้ำผึ้ง อบอุ่น' },
  { id: 'mist', name: 'หมอกเทา', mood: 'เทาขาวเรียบ ๆ มินิมอล ไม่มีสีจัด' },
];

export const DARK_THEMES: ThemeMeta<DarkThemeId>[] = [
  { id: 'cocoa', name: 'โกโก้', mood: 'น้ำตาลเข้มกับส้มอิฐ · แบบเดิม' },
  { id: 'plum', name: 'พลัมไวน์', mood: 'พลัมเข้มกับชมพูบานเย็น' },
  { id: 'midnight', name: 'มิดไนท์ลาเวนเดอร์', mood: 'กรมท่าอมม่วง นิ่งและลึก' },
  { id: 'forest', name: 'ป่าเซจ', mood: 'เขียวเข้มกับมินต์ พักสายตา' },
  { id: 'graphite', name: 'กราไฟต์โรส', mood: 'เทาเข้มกับโรสโกลด์ เรียบหรู' },
  { id: 'ocean', name: 'ดีปโอเชียน', mood: 'น้ำเงินทะเลลึกกับฟ้าสด' },
  { id: 'gold', name: 'แบล็กโกลด์', mood: 'ดำอุ่นกับทอง ดูหรู' },
  { id: 'onyx', name: 'ออนิกซ์', mood: 'ดำเกือบสนิทกับเทาเงิน คมชัด' },
];

export const DEFAULT_LIGHT_THEME: LightThemeId = 'cream';
export const DEFAULT_DARK_THEME: DarkThemeId = 'cocoa';

export const isLightThemeId = (v: unknown): v is LightThemeId => LIGHT_THEMES.some((x) => x.id === v);
export const isDarkThemeId = (v: unknown): v is DarkThemeId => DARK_THEMES.some((x) => x.id === v);

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

/**
 * โน้ตรายครั้งต่อหมวด — แก้ได้ที่ ตั้งค่า › หมวดหมู่และตัวเลือก
 *  hint = ข้อความตัวอย่างจาง ๆ ในช่องโน้ต · template = โครงที่เติมให้เมื่อแตะช่องโน้ตที่ยังว่าง ('' = ไม่มีแม่แบบ)
 *  askOnDone = ติ๊กว่าทำแล้วบนราง → toast มีปุ่ม "จดโน้ต"
 */
export interface NoteCfg {
  hint: string;
  template: string;
  askOnDone: boolean;
}

export const NOTE_DEFAULTS: Record<CatId, NoteCfg> = {
  routine: { hint: 'เช่น ตื่นสาย / นอนได้ 6 ชม.', template: '', askOnDone: false },
  work: { hint: 'เช่น งานที่เสร็จ / เรื่องที่ค้าง', template: 'เสร็จ: \nค้าง: ', askOnDone: false },
  ex: { hint: 'เช่น สควอท 40 กก. 3×10', template: 'ท่า: \nน้ำหนัก/ระยะ: \nเซ็ต×ครั้ง: ', askOnDone: true },
  case: { hint: 'เช่น สรุปที่คุยกัน / ขั้นต่อไป', template: 'คุยเรื่อง: \nผล: \nนัดต่อ: ', askOnDone: true },
  learn: { hint: 'เช่น อ่านถึงหน้า 120 / ไอเดียที่ได้', template: 'อ่าน/ดู: \nได้อะไร: ', askOnDone: false },
  me: { hint: 'เช่น ทำอะไร / รู้สึกอย่างไร', template: '', askOnDone: false },
};

/**
 * ตัวเลือกย่อยประจำหมวดในฟอร์มเพิ่มกิจกรรม (สถานที่ / ประเภท / สื่อ) — แก้ไข/เพิ่ม/ลบได้ที่ ตั้งค่า › จัดการหมวดหมู่
 * field = ฟิลด์ของ Activity ที่ค่าถูกเก็บลงไป (เก็บเป็น "ข้อความที่เห็น" ตรง ๆ ไม่ใช่รหัส เพื่อให้ผู้ใช้ตั้งชื่อเองได้
 */
export interface CatOptionSet {
  field: 'loc' | 'sub';
  title: string;
  defaults: string[];
}
export const CAT_OPTIONS: Partial<Record<CatId, CatOptionSet>> = {
  work: { field: 'loc', title: 'สถานที่', defaults: ['ออฟฟิศ', 'บ้าน (WFH)', 'ลูกค้า'] },
  ex: { field: 'sub', title: 'ประเภท', defaults: ['เวท', 'คาร์ดิโอ', 'คลาส'] },
  learn: { field: 'sub', title: 'สื่อ', defaults: ['หนังสือ', 'เสียง/พอดแคสต์'] },
};

/** ค่ารุ่นเก่าของ activity.sub ที่เคยเก็บเป็นรหัส — แปลงเป็นข้อความตอนเปิดฟอร์มแก้ไข ชิปจะได้ติดสถานะถูก */
export const LEGACY_SUB: Record<string, string> = {
  weight: 'เวท',
  cardio: 'คาร์ดิโอ',
  class: 'คลาส',
  book: 'หนังสือ',
  audio: 'เสียง/พอดแคสต์',
};

// หน้าต่างเวลาของวัน (นาที) — 06:00–30:00 (06:00 วันถัดไป) ครบ 24 ชม., ข้ามเที่ยงคืนได้
export const DAY_START = 360;
export const DAY_END = 1800;
export const FREE_START = 360; // slot ว่างนับจาก 06:00
export const MIN_FREE_GAP = 45;
export const SNAP = 15;
