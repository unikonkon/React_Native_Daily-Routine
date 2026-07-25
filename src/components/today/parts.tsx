// ชิ้นส่วน UI ร่วมของแท็บวันนี้ (ลุค mockup iOS Calendar) — ใช้ธีมเดิมของแอป
import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInLeft } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { Txt, useTokens } from '@/components/ui';
import { ACCENT } from '@/constants/theme';
import type { Contact, DayItem } from '@/lib/types';
import { useContacts } from '@/stores/contacts';

export type View3 = 'day' | 'week' | 'month' | 'year';

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

const VIEW_TABS: { key: View3; label: string; icon: string }[] = [
  { key: 'day', label: 'วัน', icon: 'sun' },
  { key: 'week', label: 'สัปดาห์', icon: 'bars2' },
  { key: 'month', label: 'เดือน', icon: 'calendar' },
  { key: 'year', label: 'ปี', icon: 'grid' },
];

// ตัวสลับอยู่ "ในแต่ละมุมมอง" — สลับมุมมองแล้ว view ถูก unmount ทั้งจอ
// → LinearTransition (layout spring) เล่นไม่ได้ (pill เกิดใหม่ในตำแหน่งสุดท้ายเลย)
// จึงใช้ entering ที่เล่นตอน mount จริง ให้ pill/label สปริงเข้ามานุ่ม ๆ แทน (ไม่ใส่ exiting กัน view เก่าค้างตอน unmount)
const LABEL_ENTER = FadeInLeft.springify().damping(15).stiffness(150).mass(0.45);

/**
 * ตัวสลับมุมมอง วัน/สัปดาห์/เดือน/ปี แบบ Active-pill (Tint)
 * ไม่เลือก = ไอคอนล้วน · active = pill พื้นส้มจาง ~15% + ไอคอน/ตัวอักษรส้ม
 * active เข้าจอด้วยสปริง: pill เฟด-สเกลเข้า + label สไลด์ออกจากไอคอน
 */
export function ViewSwitcher({ value, onChange }: { value: View3; onChange: (v: View3) => void }) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {VIEW_TABS.map((tab) => {
        const active = tab.key === value;
        const fg = active ? ACCENT : t.sub;
        return (
          <Pressable
            key={tab.key}
            hitSlop={4}
            onPress={() => {
              if (!active) onChange(tab.key);
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              height: 34,
              width: active ? undefined : 34,
              paddingHorizontal: active ? 12 : 0,
              borderRadius: 99,
              backgroundColor: active ? ACCENT + '26' : 'transparent', // 0x26 ≈ 15%
            }}>
            <Icon name={tab.icon} size={19} color={fg} />
            {active ? (
              <Animated.View key={tab.key} entering={LABEL_ENTER} style={{ overflow: 'hidden' }}>
                <Txt size={13} weight="bold" color={ACCENT}>
                  {tab.label}
                </Txt>
              </Animated.View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
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

/** ปุ่มย้อนขึ้นระดับ (‹ ป้าย) — แทน back ของ mockup ที่โชว์ชื่อระดับบน */
export function DrillBack({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTokens();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        backgroundColor: t.chip,
        borderRadius: 20,
        paddingLeft: 6,
        paddingRight: 12,
        paddingVertical: 6,
        alignSelf: 'flex-start',
      }}>
      <Icon name="chevL" size={16} color={t.sub} />
      <Txt size={13} weight="med" color={t.sub}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** แถวหัวช่วง: back (ซ้าย) + ‹ › (ขวา) */
export function DrillBar({
  backLabel,
  onBack,
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
}: {
  backLabel?: string;
  onBack?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, minHeight: 34, gap: 8 }}>
      {onBack ? <DrillBack label={backLabel ?? ''} onPress={onBack} /> : null}
      <View style={{ flex: 1 }} />
      {onPrev ? <StepBtn icon="chevL" onPress={onPrev} disabled={prevDisabled} /> : null}
      {onNext ? <StepBtn icon="chevR" onPress={onNext} disabled={nextDisabled} /> : null}
    </View>
  );
}
