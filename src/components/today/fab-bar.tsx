// แถบลอยล่างของแท็บวันนี้ (ลุค mockup) — ปุ่ม "วันนี้" ซ้าย + กลุ่มปุ่ม [ปฏิทิน][เพิ่ม] ขวา
import React from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Txt, useTokens } from '@/components/ui';
import { ACCENT } from '@/constants/theme';

interface FabBarProps {
  atToday: boolean; // อยู่ที่ช่วงวันนี้แล้วหรือยัง (คุมสีปุ่ม "วันนี้")
  bottom: number;
  onToday: () => void;
  onCalendar: () => void;
  onAdd: () => void;
}

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
      <Pressable
        onPress={onToday}
        style={[{ backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 11 }, shadow]}>
        <Txt size={15} weight="bold" color={atToday ? t.ink : ACCENT}>
          วันนี้
        </Txt>
      </Pressable>

      <View style={[{ flexDirection: 'row', gap: 4, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 24, padding: 6 }, shadow]}>
        <Pressable onPress={onCalendar} style={{ width: 50, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="calendar" size={20} color={t.sub} />
        </Pressable>
        <Pressable onPress={onAdd} style={{ width: 50, height: 36, borderRadius: 18, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="plus" size={20} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}
