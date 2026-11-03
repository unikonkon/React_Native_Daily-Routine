// แถบ 7 วันด้านบนของมุมมองวัน (ระบบ B1) — แตะวันเพื่อเปลี่ยน · แถบเล็กใต้เลข = % ทำเสร็จของวันนั้น
// ปัดซ้าย/ขวาเลื่อนทีละสัปดาห์ (FlatList แนวนอน virtualized ±~9 ปี) — ปัดแล้ว focus ไปวันเดียวกันของสัปดาห์ใหม่
import React, { useEffect, useMemo, useRef } from 'react';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, Pressable, useWindowDimensions, View } from 'react-native';

import { Txt, useTokens } from '@/components/ui';
import { GREEN } from '@/constants/theme';
import { addDays, fromISO, mondayOf, MONTH_TH, todayISO, WD_TH } from '@/lib/dates';
import { useNow } from '@/components/b1/use-now';
import { dayProgress } from '@/lib/progress';
import { useDayReader } from '@/stores/activities';

const WEEK_SPAN = 500;
const WEEK_COUNT = WEEK_SPAN * 2 + 1;

export function WeekStrip({ focus, onChangeFocus }: { focus: string; onChangeFocus: (iso: string) => void }) {
  const t = useTokens();
  const today = todayISO();
  const getDay = useDayReader();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<string>>(null);
  const now = useNow();

  const anchorMonday = useMemo(() => mondayOf(todayISO()), []);
  const weeks = useMemo(() => Array.from({ length: WEEK_COUNT }, (_, i) => addDays(anchorMonday, (i - WEEK_SPAN) * 7)), [anchorMonday]);
  const focusMonday = mondayOf(focus);
  const curIndex = useMemo(() => weeks.indexOf(focusMonday), [weeks, focusMonday]);
  const focusWd = useMemo(() => {
    for (let i = 0; i < 7; i++) if (addDays(focusMonday, i) === focus) return i;
    return 0;
  }, [focus, focusMonday]);

  const shownIndex = useRef(curIndex);
  useEffect(() => {
    if (curIndex >= 0 && curIndex !== shownIndex.current) {
      shownIndex.current = curIndex;
      listRef.current?.scrollToIndex({ index: curIndex, animated: false });
    }
  }, [curIndex]);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    if (idx === shownIndex.current) return;
    shownIndex.current = idx;
    const m = weeks[idx];
    if (m) onChangeFocus(addDays(m, focusWd));
  };

  return (
    <View accessibilityRole="tablist" accessibilityLabel="วันในสัปดาห์" style={{ paddingTop: 6 }}>
      <FlatList
        ref={listRef}
        data={weeks}
        extraData={[focus, getDay, now]}
        keyExtractor={(m) => m}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={curIndex >= 0 ? curIndex : WEEK_SPAN}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onScrollToIndexFailed={({ index }) => listRef.current?.scrollToOffset({ offset: index * width, animated: false })}
        onMomentumScrollEnd={onMomentumEnd}
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={3}
        renderItem={({ item: wkMonday }) => (
          <View style={{ width, flexDirection: 'row', paddingHorizontal: 12 }}>
            {Array.from({ length: 7 }, (_, i) => {
              const d = addDays(wkMonday, i);
              const sel = d === focus;
              const isToday = d === today;
              const p = dayProgress(getDay(d), now);
              const started = d <= now.date; // วันอนาคตยังไม่มี % (แถบว่าง)
              const pct = started && p.total ? p.rate : 0;
              const date = fromISO(d);
              return (
                <Pressable
                  key={d}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: sel }}
                  accessibilityLabel={`${WD_TH[i]} ${date.getDate()} ${MONTH_TH[date.getMonth()]}${isToday ? ' (วันนี้)' : ''}${started && p.total ? ` · ทำแล้ว ${Math.round(p.rate * 100)}%` : ''}`}
                  onPress={() => onChangeFocus(d)}
                  style={{ flex: 1, height: 64, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                  <Txt size={11.5} weight={sel ? 'bold' : 'reg'} color={sel ? t.ink : t.sub}>
                    {WD_TH[i]}
                  </Txt>
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: sel ? t.ink : 'transparent',
                      borderWidth: isToday && !sel ? 1.5 : 0,
                      borderColor: '#D2603A',
                    }}>
                    <Txt size={15} num weight={sel || isToday ? 'bold' : 'reg'} color={sel ? t.bg : d < today ? t.muted : t.ink}>
                      {date.getDate()}
                    </Txt>
                  </View>
                  <View style={{ width: 18, height: 3, borderRadius: 2, backgroundColor: t.rail, overflow: 'hidden' }}>
                    <View style={{ width: `${Math.round(pct * 100)}%`, height: 3, backgroundColor: pct >= 0.8 ? GREEN : '#D2603A' }} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      />
    </View>
  );
}
