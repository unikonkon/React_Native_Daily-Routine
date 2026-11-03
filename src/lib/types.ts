import type { CatId, PriorityId } from '@/constants/theme';

export type RepeatRule = 'none' | 'daily' | 'weekday' | 'weekend' | 'custom';
export type Horizon = '1w' | '2w' | '1m' | '6m' | '1y';
export type OccStatus = 'planned' | 'done' | 'skipped' | 'cancelled' | 'rescheduled';
export type Channel = 'online' | 'inperson';

export const HORIZON_DAYS: Record<Horizon, number> = { '1w': 7, '2w': 14, '1m': 30, '6m': 182, '1y': 365 };

export interface Activity {
  id: number;
  title: string;
  cat: CatId;
  sub: string | null;
  loc: string | null;
  channel: Channel | null;
  priority: PriorityId | null;
  startMin: number; // นาทีจากเที่ยงคืน
  endMin: number; // เกิน 1440 = ข้ามเที่ยงคืน
  repeat: RepeatRule;
  daysMask: number; // bit0=จันทร์ … bit6=อาทิตย์
  /**
   * repeat='custom': วันที่ที่ผู้ใช้เลือกจริง (ISO เรียงแล้ว) — ไม่ใช่ทุกวันที่ตรง daysMask ในช่วง
   * null = กฎอื่น หรือข้อมูลรุ่นเก่าที่ยังใช้ daysMask ในช่วง startDate–endDate
   */
  dates: string[] | null;
  startDate: string; // ISO YYYY-MM-DD
  endDate: string | null;
  notify: boolean;
  notifyBefore: number; // นาที
  detachedFrom: number | null;
  status: 'active' | 'cancelled';
  contactIds: number[];
  /** สีพื้นเซลล์ '#RRGGBB' ที่จำมาจากไฟล์ Time Table (.xlsx) — null = ใช้สีตามหมวดตอนส่งออก */
  color: string | null;
}

/** กิจกรรมของวันหนึ่ง ๆ = Activity + สถานะรายวัน */
export interface DayItem extends Activity {
  date: string;
  ostatus: OccStatus;
}

export interface Contact {
  id: number;
  name: string;
  priority: PriorityId;
  phone: string | null;
  line: string | null;
  email: string | null;
  zoom: string | null; // ลิงก์ห้อง Zoom ประจำตัว (ไม่บังคับ)
  googlemeet: string | null; // ลิงก์ห้อง Google Meet ประจำตัว (ไม่บังคับ)
  note: string | null; // ข้อมูลอื่น ๆ / หมายเหตุ (ไม่บังคับ)
}

export interface FreeSlot {
  start: number;
  end: number;
}

/** ขอบเขตการแก้ไขกิจกรรมชุดทำซ้ำ — เฉพาะครั้งนี้ / ตั้งแต่ครั้งนี้เป็นต้นไป / ทั้งชุด (รวมย้อนหลัง) */
export type EditScope = 'one' | 'future' | 'all';

/** occ[date][activityId] = สถานะที่เบี่ยงจาก planned (exception-based) */
export type OccMap = Record<string, Record<number, OccStatus>>;
