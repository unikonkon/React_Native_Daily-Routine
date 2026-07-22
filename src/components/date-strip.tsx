// แถบสัปดาห์แบบ iOS — 7 วัน (จันทร์เริ่ม) ของสัปดาห์ที่มีวัน focus
// วันเลือก = วงกลมทึบ (วันนี้ = accent, วันอื่น = ink) · วันนี้ที่ไม่ได้เลือก = เลข accent
// ‹ › เลื่อนทีละสัปดาห์ (คงวันในสัปดาห์เดิม) + ป้ายวันตรงกลาง + ชิป "วันนี้"
import React from 'react';
import { Pressable, View } from 'react-native';

import { Chip, Txt, useTokens } from '@/components/ui';
import { ACCENT } from '@/constants/theme';
import { Icon } from '@/components/icon';
import { WD_TH, addDays, fromISO, mondayOf, thaiDate, todayISO, wdMon } from '@/lib/dates';

export function DateStrip({ focus, onChange }: { focus: string; onChange: (iso: string) => void }) {
  const t = useTokens();
  const today = todayISO();
  const monday = mondayOf(focus);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
        <PageBtn icon="chevL" onPress={() => onChange(addDays(focus, -7))} />
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {days.map((d) => {
            const isFocus = d === focus;
            const isToday = d === today;
            const circleColor = isToday ? ACCENT : t.ink;
            const numColor = isFocus ? '#FFFFFF' : isToday ? ACCENT : t.ink;
            return (
              <Pressable key={d} onPress={() => onChange(d)} style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 }}>
                <Txt size={11} color={isToday ? ACCENT : t.faint}>{WD_TH[wdMon(d)]}</Txt>
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isFocus ? circleColor : 'transparent',
                  }}>
                  <Txt size={16} num weight="bold" color={numColor}>
                    {fromISO(d).getDate()}
                  </Txt>
                </View>
              </Pressable>
            );
          })}
        </View>
        <PageBtn icon="chevR" onPress={() => onChange(addDays(focus, 7))} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 }}>
        <Txt size={14} weight="med">{thaiDate(focus)}</Txt>
        {focus !== today ? <Chip small label="วันนี้" active color={ACCENT} onPress={() => onChange(today)} /> : null}
      </View>
    </View>
  );
}

function PageBtn({ icon, onPress }: { icon: 'chevL' | 'chevR'; onPress: () => void }) {
  const t = useTokens();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={{ width: 30, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={20} color={t.sub} />
    </Pressable>
  );
}
