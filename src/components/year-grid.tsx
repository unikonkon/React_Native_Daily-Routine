// มุมมองรายปี — 12 เดือนย่อ 3 คอลัมน์ (จันทร์เริ่ม) แตะเดือน → เข้ามุมมองเดือน
// ใช้เพื่อไล่ดูภาพรวมทั้งปีและกระโดดข้ามเดือนได้เร็ว (heat/จุดสีอยู่ในมุมมองเดือน)
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Txt, useTokens } from '@/components/ui';
import { ACCENT } from '@/constants/theme';
import { MONTH_TH_FULL, addDays, fromISO, mondayOf, toISO, todayISO } from '@/lib/dates';

interface YearGridProps {
  year: number;
  onPressMonth: (month: number) => void;
  bottomPad?: number;
}

export function YearGrid({ year, onPressMonth, bottomPad = 120 }: YearGridProps) {
  const today = todayISO();
  const now = fromISO(today);
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: bottomPad }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {Array.from({ length: 12 }, (_, m) => (
          <View key={m} style={{ width: '33.33%', paddingHorizontal: 6, marginBottom: 18 }}>
            <MiniMonth
              year={year}
              month={m}
              today={today}
              isCurrent={m === now.getMonth() && year === now.getFullYear()}
              onPress={() => onPressMonth(m)}
            />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function MiniMonth({
  year,
  month,
  today,
  isCurrent,
  onPress,
}: {
  year: number;
  month: number;
  today: string;
  isCurrent: boolean;
  onPress: () => void;
}) {
  const t = useTokens();
  const first = toISO(new Date(year, month, 1));
  const start = mondayOf(first);
  const ym = first.slice(0, 7);
  const rows = Array.from({ length: 6 }, (_, r) => Array.from({ length: 7 }, (_, c) => addDays(start, r * 7 + c)));

  return (
    <Pressable onPress={onPress}>
      <Txt size={13} weight="bold" numberOfLines={1} color={isCurrent ? ACCENT : t.ink} style={{ marginBottom: 4 }}>
        {MONTH_TH_FULL[month]}
      </Txt>
      {rows.map((week, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {week.map((d) => {
            const inMonth = d.slice(0, 7) === ym;
            const isToday = d === today;
            return (
              <View
                key={d}
                style={{
                  flex: 1,
                  aspectRatio: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 99,
                  backgroundColor: isToday ? ACCENT : 'transparent',
                }}>
                {inMonth ? (
                  <Txt size={9.5} num color={isToday ? '#FFFFFF' : t.ink} weight={isToday ? 'bold' : 'reg'}>
                    {fromISO(d).getDate()}
                  </Txt>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </Pressable>
  );
}
