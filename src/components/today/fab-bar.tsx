// แถบโหมดลบของมุมมองสัปดาห์ (แทนที่แถบล่าง B1 ระหว่างเลือกรายการที่จะลบ)
import React from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Txt, useTokens } from '@/components/ui';
import { DANGER } from '@/constants/theme';

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
