// มุมมองปี (ลุค mockup) — พ.ศ. ตัวใหญ่สี accent + มินิปฏิทิน 12 เดือน 3 คอลัมน์ (จันทร์นำ)
// ไฮไลต์เดือน/วันปัจจุบัน แตะเดือน → เข้ามุมมองเดือน
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { StepBtn, ViewSwitcher, type View3 } from '@/components/today/parts';
import { Txt, useTokens } from '@/components/ui';
import { ACCENT } from '@/constants/theme';
import { MONTH_TH_FULL, VIEW_MAX_Y, VIEW_MIN_Y, WD_TH, addDays, beYear, fromISO, mondayOf, toISO, todayISO } from '@/lib/dates';

interface YearViewProps {
  year: number;
  onPrev: () => void;
  onNext: () => void;
  onPressMonth: (month: number) => void;
  bottomPad?: number;
  view: View3;
  onChangeView: (v: View3) => void;
}

export function TodayYearView({ year, onPrev, onNext, onPressMonth, bottomPad = 140, view, onChangeView }: YearViewProps) {
  const now = fromISO(todayISO());
  const curY = now.getFullYear();
  const curM = now.getMonth();

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 8 }}>
        <Txt size={24} weight="bold" color={ACCENT}>
          {beYear(year)}
        </Txt>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <StepBtn icon="chevL" onPress={onPrev} disabled={year <= VIEW_MIN_Y} />
          <StepBtn icon="chevR" onPress={onNext} disabled={year >= VIEW_MAX_Y} />
        </View>

        <View style={{ flex: 1 }} />
        <ViewSwitcher value={view} onChange={onChangeView} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 6, paddingBottom: bottomPad }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {Array.from({ length: 12 }, (_, m) => (
            <View key={m} style={{ width: '33.33%', paddingHorizontal: 6, marginBottom: 18 }}>
              <MiniMonth year={year} month={m} isCurrent={year === curY && m === curM} onPress={() => onPressMonth(m)} />
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function MiniMonth({ year, month, isCurrent, onPress }: { year: number; month: number; isCurrent: boolean; onPress: () => void }) {
  const t = useTokens();
  const today = todayISO();
  const first = toISO(new Date(year, month, 1));
  const ymKey = first.slice(0, 7);
  const start = mondayOf(first);
  const rows = Array.from({ length: 6 }, (_, r) => Array.from({ length: 7 }, (_, c) => addDays(start, r * 7 + c)));

  return (
    <Pressable onPress={onPress}>
      <Txt size={13} weight="bold" numberOfLines={1} color={isCurrent ? ACCENT : t.ink} style={{ marginBottom: 4 }}>
        {MONTH_TH_FULL[month]}
      </Txt>
      <View style={{ flexDirection: 'row', marginBottom: 1 }}>
        {WD_TH.map((w, i) => (
          <Txt key={w} size={7.5} color={i === 6 ? ACCENT : t.faint} style={{ flex: 1, textAlign: 'center' }}>
            {w.slice(0, 1)}
          </Txt>
        ))}
      </View>
      {rows.map((week, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {week.map((d) => {
            const inMonth = d.slice(0, 7) === ymKey;
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
                  <Txt size={9} num color={isToday ? '#FFFFFF' : t.ink} weight={isToday ? 'bold' : 'reg'}>
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
