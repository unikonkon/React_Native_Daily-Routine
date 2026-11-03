// ชื่อผู้ติดต่อของนัดเคส (ไม่มี dependency) — ใช้ร่วมกันในสถิติและรายงานส่งออก
import type { DayItem } from '@/lib/types';

/** ชื่อผู้ติดต่อของนัดโหมด "ช่องทางติดต่อ" (กรอกไว้ในนัด ไม่อยู่ในสมุดรายชื่อ) — null = นัดโหมดคนที่นัด */
export function inlineName(it: Pick<DayItem, 'inlineContact'>): string | null {
  return it.inlineContact ? it.inlineContact.name.trim() || 'ช่องทางติดต่อ' : null;
}

/** ชื่อผู้ติดต่อทั้งหมดของนัด — รายชื่อจากสมุด + ช่องทางที่กรอกไว้ในนัด */
export function caseWho(it: Pick<DayItem, 'contactIds' | 'inlineContact'>, nameById: Record<number, string>): string[] {
  const inl = inlineName(it);
  return [...it.contactIds.map((id) => nameById[id]).filter(Boolean), ...(inl ? [inl] : [])];
}
