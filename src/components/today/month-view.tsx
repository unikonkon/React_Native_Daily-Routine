// มุมมองเดือน (ลุค mockup) — ชื่อเดือนตัวใหญ่ + หัววัน (จันทร์นำ) + ตาราง 7×6 เซลล์สูง
// เลขวันในวงกลม (วันนี้=วงกลม accent, วันเลือก=วงแหวน) + จุดสีหมวดกิจกรรมใต้เลข
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { DrillBar, ViewSwitcher, type View3 } from '@/components/today/parts';
import { Txt, useTokens } from '@/components/ui';
import { ACCENT, CAT_BY_ID } from '@/constants/theme';
import { MONTH_TH_FULL, WD_TH, addDays, beYear, fromISO, mondayOf, toISO, todayISO } from '@/lib/dates';
import { useDayReader } from '@/stores/activities';

interface MonthViewProps {
  year: number;
  month: number; // 0-based
  selected: string; // วันที่เลือกอยู่ (ไฮไลต์วงแหวน)
  onBack: () => void;
  onPrev: () => void;
  onNext: () => void;
  onPressDay: (iso: string) => void;
  bottomPad?: number;
  view: View3;
  onChangeView: (v: View3) => void;
}

export function TodayMonthView({ year, month, selected, onBack, onPrev, onNext, onPressDay, bottomPad = 140, view, onChangeView }: MonthViewProps) {
  const t = useTokens();
  const getDay = useDayReader();
  const today = todayISO();
  const first = toISO(new Date(year, month, 1));
  const ymKey = first.slice(0, 7);
  const start = mondayOf(first);
  const rows = Array.from({ length: 6 }, (_, r) => Array.from({ length: 7 }, (_, c) => addDays(start, r * 7 + c)));

  return (
    <View style={{ flex: 1 }}>

      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 8, gap: 8 }}>
        <Txt size={24} weight="bold" style={{ flex: 1 }}>
          {MONTH_TH_FULL[month]}
        </Txt>
        <ViewSwitcher value={view} onChange={onChangeView} />
      </View>

      <DrillBar backLabel={`พ.ศ. ${beYear(year)}`} onBack={onBack} onPrev={onPrev} onNext={onNext} />

      {/* หัววัน (จันทร์นำ, อาทิตย์เป็นสี accent) */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 8, paddingBottom: 6, borderBottomWidth: 0.5, borderBottomColor: t.line }}>
        {WD_TH.map((w, i) => (
          <Txt key={w} size={11} weight="med" color={i === 6 ? ACCENT : t.faint} style={{ flex: 1, textAlign: 'center' }}>
            {w}
          </Txt>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>
        {rows.map((week, r) => (
          <View key={r} style={{ flexDirection: 'row' }}>
            {week.map((d, c) => {
              const inMonth = d.slice(0, 7) === ymKey;
              const isToday = d === today;
              const isSel = d === selected && inMonth;
              const cats = inMonth ? [...new Set(getDay(d).map((i) => i.cat))].slice(0, 4) : [];
              return (
                <Pressable
                  key={d}
                  disabled={!inMonth}
                  onPress={() => onPressDay(d)}
                  style={{
                    flex: 1,
                    minHeight: 82,
                    paddingTop: 7,
                    alignItems: 'center',
                    gap: 5,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: t.line,
                    borderRightWidth: c === 6 ? 0 : StyleSheet.hairlineWidth,
                    borderRightColor: t.line,
                  }}>
                  <View
                    style={{
                      width: 27,
                      height: 27,
                      borderRadius: 14,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isToday ? ACCENT : 'transparent',
                      borderWidth: isSel && !isToday ? 1.5 : 0,
                      borderColor: t.ink,
                    }}>
                    <Txt size={15} num weight={isToday || isSel ? 'bold' : 'reg'} color={isToday ? '#FFFFFF' : inMonth ? t.ink : t.faint}>
                      {fromISO(d).getDate()}
                    </Txt>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 3, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 36, minHeight: 6 }}>
                    {cats.map((cid) => (
                      <View key={cid} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: CAT_BY_ID[cid].color }} />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
