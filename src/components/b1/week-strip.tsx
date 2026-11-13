// แถบ 7 วันด้านบนของมุมมองวัน (ระบบ B1) — แตะวันเพื่อเปลี่ยน · แถบเล็กใต้เลข = % ทำเสร็จของวันนั้น
// ปัดซ้าย/ขวาเลื่อนทีละสัปดาห์ (FlatList แนวนอน virtualized ±~9 ปี) — ปัดแล้ว focus ไปวันเดียวกันของสัปดาห์ใหม่
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, Pressable, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useNow } from '@/components/b1/use-now';
import { ProgressFill, useEased } from '@/components/motion';
import { Txt, pressFade, useTokens } from '@/components/ui';
import { ATTN, GREEN } from '@/constants/theme';
import { addDays, fromISO, mondayOf, MONTH_TH, todayISO, WD_TH } from '@/lib/dates';
import { dayProgress } from '@/lib/progress';
import { useDayReader } from '@/stores/activities';

const WEEK_SPAN = 500;
const WEEK_COUNT = WEEK_SPAN * 2 + 1;

export function WeekStrip({ focus, onChangeFocus }: { focus: string; onChangeFocus: (iso: string) => void }) {
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
    <View accessibilityRole="tablist" accessibilityLabel="วันในสัปดาห์" style={{ paddingTop: 2, paddingBottom: 2 }}>
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
        renderItem={({ item: wkMonday }) => <WeekPage monday={wkMonday} focus={focus} today={today} width={width} onChangeFocus={onChangeFocus} />}
      />
    </View>
  );
}

const PAGE_PAD = 12;
const DAY_SIZE = 34;

/**
 * 1 หน้าของแถบ = 7 วันของสัปดาห์นั้น · วงกลมวันที่เลือกเป็นแผ่นเดียวที่ "เลื่อน" ไปหาวันที่แตะ (ไม่ใช่ดับแล้วติดใหม่)
 * สัปดาห์ที่ไม่มีวันที่เลือกอยู่ไม่มีแผ่นนี้ · ปัดเปลี่ยนสัปดาห์ = แผ่นของหน้าใหม่โผล่ที่วันเดียวกันเลย (ไม่เลื่อน)
 */
function WeekPage({ monday, focus, today, width, onChangeFocus }: { monday: string; focus: string; today: string; width: number; onChangeFocus: (iso: string) => void }) {
  const t = useTokens();
  const getDay = useDayReader();
  const now = useNow();
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const selIdx = days.indexOf(focus);
  const cellW = (width - PAGE_PAD * 2) / 7;
  // ตำแหน่งแนวตั้งของวงกลมในช่อง — วัดจากช่องแรก (ขึ้นกับความสูงตัวอักษรชื่อวัน)
  const [circleY, setCircleY] = useState<number | null>(null);
  return (
    <View style={{ width, flexDirection: 'row', paddingHorizontal: PAGE_PAD }}>
      {selIdx >= 0 && circleY !== null ? <SelPill idx={selIdx} cellW={cellW} top={circleY} color={t.ink} /> : null}
      {days.map((d, i) => {
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
            style={pressFade({ flex: 1, height: 64, alignItems: 'center', justifyContent: 'center', gap: 3 })}>
            <Txt size={11.5} weight={sel ? 'bold' : 'reg'} color={sel ? t.ink : t.sub}>
              {WD_TH[i]}
            </Txt>
            <View
              onLayout={i === 0 ? (e) => setCircleY(e.nativeEvent.layout.y) : undefined}
              style={{
                width: DAY_SIZE,
                height: DAY_SIZE,
                borderRadius: DAY_SIZE / 2,
                alignItems: 'center',
                justifyContent: 'center',
                // ยังไม่ได้วัดตำแหน่ง (เฟรมแรก) → วาดวงที่ช่องตรง ๆ ไปก่อน
                backgroundColor: sel && circleY === null ? t.ink : 'transparent',
                borderWidth: isToday && !sel ? 1.5 : 0,
                borderColor: t.accent,
              }}>
              <Txt size={15} num weight={sel || isToday ? 'bold' : 'reg'} color={sel ? t.bg : d < today ? t.muted : t.ink}>
                {date.getDate()}
              </Txt>
            </View>
            <View style={{ width: 18, height: 3, borderRadius: 2, backgroundColor: t.rail, overflow: 'hidden' }}>
              <ProgressFill pct={pct} color={pct >= 0.8 ? GREEN : ATTN} height={3} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** แผ่นวงกลมของวันที่เลือก — สร้างเมื่อสัปดาห์นี้มีวันที่เลือก (เริ่มที่วันนั้นเลย) แล้วเลื่อนตามเมื่อแตะวันอื่นในสัปดาห์เดียวกัน */
function SelPill({ idx, cellW, top, color }: { idx: number; cellW: number; top: number; color: string }) {
  const pos = useEased(idx, 180);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: pos.value * cellW }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: PAGE_PAD + (cellW - DAY_SIZE) / 2, top, width: DAY_SIZE, height: DAY_SIZE, borderRadius: DAY_SIZE / 2, backgroundColor: color }, pill]}
    />
  );
}
