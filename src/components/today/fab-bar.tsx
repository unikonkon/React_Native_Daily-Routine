// แถบลอยล่างของแท็บวันนี้ (ลุค mockup) — ปุ่ม "วันนี้" ซ้าย + กลุ่มปุ่ม [ปฏิทิน][เพิ่ม] ขวา
// + แถบโหมดลบ (แทนที่แถบปกติระหว่างเลือกรายการที่จะลบ)
import React from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Txt, useTokens } from '@/components/ui';
import { ACCENT, DANGER } from '@/constants/theme';

interface FabBarProps {
  atToday: boolean; // อยู่ที่ช่วงวันนี้แล้วหรือยัง (คุมสีปุ่ม "วันนี้")
  bottom: number;
  onToday: () => void;
  onCalendar: () => void;
  onAdd: () => void;
}

/** ACCENT เวอร์ชันเข้มขึ้น ~15% — พื้นปุ่มตอนนิ้วกดค้าง (ปุ่มพื้นส้มจะดูไม่มีอะไรเกิดขึ้นถ้าเปลี่ยนแค่ขนาด) */
const ACCENT_PRESSED = '#B44E2C';
/** ย่อเล็กน้อยตอนกด — บอกว่าปุ่ม "ยุบลง" รับแรงกด โดยไม่ดันปุ่มข้าง ๆ เพราะ transform ไม่กิน layout */
const PRESS_SCALE = 0.93;

export function TodayFabBar({ atToday, bottom, onToday, onCalendar, onAdd }: FabBarProps) {
  const t = useTokens();
  const shadow = {
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  } as const;

  return (
    <View style={{ position: 'absolute', left: 18, right: 18, bottom, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      {/* "วันนี้" — ปุ่มข้อความล้วน ไม่แทรกไอคอนตอนกดเพราะจะดันปุ่มกว้างขึ้นกลางคัน ใช้พื้น/ขอบ/สเกลบอกแทน */}
      <Pressable
        onPress={onToday}
        style={({ pressed }) => [
          {
            backgroundColor: pressed ? t.chip : t.card,
            borderWidth: 1,
            borderColor: pressed ? ACCENT : t.line,
            borderRadius: 24,
            paddingHorizontal: 20,
            paddingVertical: 11,
            transform: [{ scale: pressed ? PRESS_SCALE : 1 }],
          },
          shadow,
        ]}>
        {({ pressed }) => (
          <Txt size={15} weight="bold" color={pressed || !atToday ? ACCENT : t.ink}>
            วันนี้
          </Txt>
        )}
      </Pressable>

      <View style={[{ flexDirection: 'row', gap: 4, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 24, padding: 6 }, shadow]}>
        {/* ปฏิทิน — ตอนกดสลับ svg เป็น grid (ตารางเดือน) บอกล่วงหน้าว่ากำลังจะไปมุมมองเดือน */}
        <Pressable
          onPress={onCalendar}
          style={({ pressed }) => ({
            width: 50,
            height: 36,
            borderRadius: 18,
            backgroundColor: pressed ? ACCENT + '1f' : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale: pressed ? PRESS_SCALE : 1 }],
          })}>
          {({ pressed }) => <Icon name={pressed ? 'grid' : 'calendar'} size={20} color={pressed ? ACCENT : t.sub} />}
        </Pressable>

        {/* เพิ่ม — ตอนกดสลับ svg เป็น edit (ดินสอ) บอกว่ากำลังจะเปิดฟอร์มเพิ่มกิจกรรม ไม่ใช่เพิ่มทันที */}
        <Pressable
          onPress={onAdd}
          style={({ pressed }) => ({
            width: 50,
            height: 36,
            borderRadius: 18,
            backgroundColor: pressed ? ACCENT_PRESSED : ACCENT,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale: pressed ? PRESS_SCALE : 1 }],
          })}>
          {({ pressed }) => <Icon name={pressed ? 'edit' : 'plus'} size={20} color="#FFFFFF" />}
        </Pressable>
      </View>
    </View>
  );
}

interface DeleteBarProps {
  count: number; // จำนวนรายการที่เลือกไว้
  bottom: number;
  /** true = กด "ลบ" ไปรอบหนึ่งแล้ว กำลังรอยืนยัน */
  confirming: boolean;
  onCancel: () => void;
  onPressDelete: () => void;
}

/**
 * แถบลอยล่างของโหมดลบ — "เลือกไว้ n รายการ" + [ยกเลิก] [ลบ]
 * ยืนยัน 2 จังหวะแบบเดียวกับแผ่นรายละเอียด (ไม่ใช้ Alert ของระบบ): กดลบ → ปุ่มเปลี่ยนเป็น "ยืนยันลบ"
 */
export function TodayDeleteBar({ count, bottom, confirming, onCancel, onPressDelete }: DeleteBarProps) {
  const t = useTokens();
  const shadow = {
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  } as const;
  const none = count === 0;

  return (
    <View
      style={[
        {
          position: 'absolute',
          left: 18,
          right: 18,
          bottom,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: t.card,
          borderWidth: 1,
          borderColor: confirming ? DANGER : t.line,
          borderRadius: 24,
          paddingLeft: 16,
          paddingRight: 6,
          paddingVertical: 6,
        },
        shadow,
      ]}>
      <Txt size={13} weight="med" color={confirming ? DANGER : t.sub} style={{ flex: 1 }}>
        {confirming ? `ลบ ${count} รายการนี้?` : none ? 'แตะบล็อกเพื่อเลือก' : `เลือกไว้ ${count} รายการ`}
      </Txt>

      <Pressable onPress={onCancel} hitSlop={6} style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }}>
        <Txt size={13} weight="med" color={t.sub}>
          {confirming ? 'ไม่ลบ' : 'ยกเลิก'}
        </Txt>
      </Pressable>

      <Pressable
        onPress={onPressDelete}
        disabled={none}
        hitSlop={6}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          height: 36,
          paddingHorizontal: 14,
          borderRadius: 18,
          backgroundColor: DANGER,
          opacity: none ? 0.35 : 1,
        }}>
        <Icon name="trash" size={16} color="#FFFFFF" />
        <Txt size={13} weight="bold" color="#FFFFFF">
          {confirming ? 'ยืนยันลบ' : 'ลบ'}
        </Txt>
      </Pressable>
    </View>
  );
}
