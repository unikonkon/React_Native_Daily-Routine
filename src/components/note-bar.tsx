// แถบปุ่มโน้ตติดขอบบนคีย์บอร์ด + ปุ่มเล็กของโน้ต — ใช้ร่วมแผ่นรายละเอียด (activity-sheet) และฟอร์มเพิ่ม/แก้ไข (add)
// ช่องโน้ตเป็นช่องหลายบรรทัด (Enter = ขึ้นบรรทัดใหม่) และปุ่มใต้ช่องถูกคีย์บอร์ดบัง — ปุ่ม ยกเลิก/บันทึก/เสร็จ จึงอยู่แถบนี้ขณะพิมพ์
import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, View } from 'react-native';

import { SvgIcon } from '@/components/svg-icon';
import { Txt, useTokens } from '@/components/ui';
import { DANGER } from '@/constants/theme';

/** ความสูงคีย์บอร์ดปัจจุบัน (0 = ปิด) — รองรับทั้ง iOS (will) และ Android (did) */
export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvt, (e) => setHeight(e.endCoordinates?.height ?? 0));
    const h = Keyboard.addListener(hideEvt, () => setHeight(0));
    return () => {
      s.remove();
      h.remove();
    };
  }, []);
  return height;
}

/** ปุ่มเล็กของแถวโน้ต — ghost (ยกเลิก) · primary (บันทึก) · danger (ยืนยันลบ) · big = ในแถบเหนือคีย์บอร์ด */
export function NoteBtn({ label, icon, tone, big, a11y, onPress }: { label: string; icon?: string; tone?: 'primary' | 'danger'; big?: boolean; a11y?: string; onPress: () => void }) {
  const t = useTokens();
  const bg = tone === 'danger' ? [DANGER, '#A33A2E'] : tone === 'primary' ? [t.primary, t.primaryDown] : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y ?? `${label}โน้ต`}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        height: big ? 38 : 32,
        paddingHorizontal: (bg ? 14 : 12) + (big ? 4 : 0),
        borderRadius: big ? 19 : 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: bg ? (pressed ? bg[1] : bg[0]) : pressed ? t.rail : t.track,
      })}>
      {icon ? <SvgIcon name={icon} size={big ? 14 : 13} color={bg ? '#FFFFFF' : t.sub} strokeWidth={2.6} /> : null}
      <Txt size={big ? 13.5 : 12.5} weight="bold" color={bg ? '#FFFFFF' : t.sub}>
        {label}
      </Txt>
    </Pressable>
  );
}

/**
 * แถบเหนือคีย์บอร์ด: ข้อความสถานะทางซ้าย + ปุ่ม (children) ทางขวา
 * bleed = ระยะ padding แนวนอนของกล่องแม่ที่ต้องทะลุออกไปให้แถบเต็มความกว้าง (แผ่นรายละเอียด = 20)
 */
export function NoteKeyboardBar({ text, color, strong, bleed = 0, children }: { text: string; color?: string; strong?: boolean; bleed?: number; children: React.ReactNode }) {
  const t = useTokens();
  return (
    <View style={{ marginHorizontal: -bleed, paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.line, backgroundColor: t.card2, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Txt size={12} weight={strong ? 'bold' : 'reg'} color={color ?? t.faint} style={{ flex: 1 }} numberOfLines={2}>
        {text}
      </Txt>
      {children}
    </View>
  );
}
