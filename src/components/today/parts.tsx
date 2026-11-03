// ชิ้นส่วนร่วมของแท็บวันนี้ — ชื่อคนในนัดเคส / ช่องทางติดต่อ / ปุ่ม ‹ › (หัวและตัวสลับมุมมองย้ายไป components/b1)
import React, { useMemo } from 'react';
import { Pressable } from 'react-native';

import { Icon } from '@/components/icon';
import { useTokens } from '@/components/ui';
import type { Contact, DayItem } from '@/lib/types';
import { useContacts } from '@/stores/contacts';

/**
 * ชื่อคนในเคส (คนแรก + จำนวนที่เหลือ) — คืน '' เมื่อไม่มีรายชื่อผูกไว้
 * ผู้เรียกจึง fallback เองได้ตามบริบท: มุมมองสัปดาห์ใช้ชื่อกิจกรรมแทน ส่วนมุมมองวันใช้สถานที่แทน
 */
export function caseNames(it: DayItem, nameById: Record<number, string>) {
  const names = it.contactIds.map((id) => nameById[id]).filter((s) => !!s?.trim());
  if (!names.length) return '';
  return names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0];
}

/** hook คู่กับ caseNames — identity เปลี่ยนเมื่อสมุดรายชื่อเปลี่ยน (ทั้ง day/week view ใช้ตัวเดียวกัน) */
export function useCaseNames(): (it: DayItem) => string {
  const contacts = useContacts((s) => s.list);
  return useMemo(() => {
    const nameById = Object.fromEntries(contacts.map((c) => [c.id, c.name])) as Record<number, string>;
    return (it: DayItem) => caseNames(it, nameById);
  }, [contacts]);
}

/** รายชื่อเต็ม ๆ ของนัดเคส (ตามลำดับที่ผูกไว้) — สำหรับที่ที่มีเนื้อที่พอโชว์รายละเอียด เช่นบล็อกในมุมมองวัน */
export function useCaseContacts(): (it: DayItem) => Contact[] {
  const contacts = useContacts((s) => s.list);
  return useMemo(() => {
    const byId = new Map(contacts.map((c) => [c.id, c]));
    return (it: DayItem) => it.contactIds.map((id) => byId.get(id)).filter((c): c is Contact => !!c);
  }, [contacts]);
}

/** ช่องทางติดต่อที่คนนี้มี ย่อเป็นบรรทัดเดียว — มีป้ายกำกับหน้าค่าที่อ่านเองไม่ออก (โทร/LINE) */
export function contactLine(c: Contact): string {
  return [c.phone && `โทร ${c.phone}`, c.line && `LINE ${c.line}`, c.email, c.zoom && 'ห้อง Zoom', c.googlemeet && 'ห้อง Meet']
    .filter(Boolean)
    .join(' · ');
}

/** ปุ่มกลม ‹ › สำหรับเลื่อนช่วง (ปี/เดือน) */
export function StepBtn({ icon, onPress, disabled }: { icon: 'chevL' | 'chevR'; onPress: () => void; disabled?: boolean }) {
  const t = useTokens();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={{
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: t.chip,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.3 : 1,
      }}>
      <Icon name={icon} size={18} color={t.sub} />
    </Pressable>
  );
}
