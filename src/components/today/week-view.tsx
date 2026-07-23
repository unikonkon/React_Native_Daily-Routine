// มุมมองสัปดาห์ (ไทม์ไลน์ 7 คอลัมน์) — ต่อยอดจากไทม์ไลน์ day-view
// หัวคอลัมน์เป็นแถบปัดได้ (paging) เลื่อนสัปดาห์ + แกนเวลา 06:00–30:00 + บล็อกสีตามหมวด (แยก lane กันซ้อน)
// เต็มจอ ไม่ต้องเลื่อน — เห็นภาพรวม "ช่วงไหนของวันไหนยุ่ง" ทันที
import React, { useEffect, useMemo, useRef } from 'react';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, Pressable, useWindowDimensions, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Txt, useTokens } from '@/components/ui';
import { ACCENT, CAT_BY_ID, CATS, DAY_END, DAY_START } from '@/constants/theme';
import { addDays, fmtMin, fromISO, mondayOf, nowMin, todayISO, WD_TH } from '@/lib/dates';
import { assignLanes } from '@/lib/engine';
import type { DayItem } from '@/lib/types';
import { useDayReader } from '@/stores/activities';

const GUTTER = 34; // แกนเวลาซ้าย
const HPAD = 8;
const SPAN = DAY_END - DAY_START; // 1440 นาที
const pct = (min: number) => ((min - DAY_START) / SPAN) * 100;

// แถบหัวสัปดาห์แบบปัดได้ (paging) — FlatList แนวนอน virtualized เลื่อนได้ ±~9 ปี
const WK_SPAN = 500;
const WK_COUNT = WK_SPAN * 2 + 1;

interface WeekViewProps {
  monday: string;
  onChangeMonday: (monday: string) => void;
  onPressItem: (item: DayItem) => void;
  onPressDay: (iso: string) => void;
  bottomPad?: number;
}

export function TodayWeekView({ monday, onChangeMonday, onPressItem, onPressDay, bottomPad = 120 }: WeekViewProps) {
  const t = useTokens();
  const getDay = useDayReader();
  const today = todayISO();
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  // เส้นชั่วโมงทุก 3 ชม.
  const hours: number[] = [];
  for (let m = DAY_START; m <= DAY_END; m += 180) hours.push(m);

  // เส้น "ตอนนี้" (เฉพาะคอลัมน์วันนี้ ถ้าอยู่ในสัปดาห์นี้)
  const now = nowMin();
  const nowTop = now >= DAY_START ? now : now + 1440;

  return (
    <View style={{ flex: 1 }}>
      {/* หัวคอลัมน์ (จันทร์นำ) — ปัดซ้าย/ขวาเพื่อเลื่อนสัปดาห์ย้อนหลัง/อนาคต */}
      <WeekHeaderStrip monday={monday} onChangeMonday={onChangeMonday} onPressDay={onPressDay} />

      {/* เวที (definite height ผ่าน flex) — วางเส้นชั่วโมง + คอลัมน์ทับกันด้วย % */}
      <View style={{ flex: 1, marginHorizontal: HPAD, paddingBottom: bottomPad }}>
        <View style={{ flex: 1, position: 'relative' }}>
          {/* เส้นชั่วโมง + ป้ายเวลา — height 14 + marginTop -7 ให้เส้นตกที่ตำแหน่งเวลาพอดี (ตรงกับบล็อก) */}
          {hours.map((m) => (
            <View key={m} style={{ position: 'absolute', top: `${pct(m)}%`, left: 0, right: 0, height: 14, marginTop: -7, flexDirection: 'row', alignItems: 'center' }}>
              <Txt size={9} num color={t.faint} style={{ width: GUTTER, textAlign: 'right', paddingRight: 5 }}>
                {fmtMin(m)}
              </Txt>
              <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
            </View>
          ))}

          {/* 7 คอลัมน์ (ทับบนเส้นชั่วโมง) */}
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: GUTTER, right: 0, flexDirection: 'row' }}>
            {days.map((d, ci) => {
              const items = getDay(d);
              const lanes = assignLanes(items);
              const isToday = d === today;
              return (
                <View
                  key={d}
                  style={{
                    flex: 1,
                    position: 'relative',
                    borderLeftWidth: ci === 0 ? 0 : 1,
                    borderLeftColor: t.line,
                    backgroundColor: isToday ? ACCENT + '0f' : 'transparent',
                  }}>
                  {items.map((it) => {
                    const cat = CAT_BY_ID[it.cat];
                    const { lane, n } = lanes[it.id] ?? { lane: 0, n: 1 };
                    const top = pct(it.startMin);
                    const h = Math.max(pct(it.endMin) - top, 1.6);
                    const done = it.ostatus === 'done';
                    const dim = it.ostatus === 'rescheduled' ? 0.5 : 1;
                    const showIcon = it.endMin - it.startMin >= 45 && n <= 2; // โชว์ไอคอนเฉพาะบล็อกที่สูง/กว้างพอ
                    return (
                      <Pressable
                        key={`${it.id}:${it.date}`}
                        onPress={() => onPressItem(it)}
                        style={{
                          position: 'absolute',
                          top: `${top}%`,
                          height: `${h}%`,
                          left: `${(100 / n) * lane + 3}%`,
                          width: `${100 / n - 5}%`,
                          minHeight: 5,
                          borderRadius: 3,
                          backgroundColor: cat.color,
                          opacity: (done ? 0.4 : 0.98) * dim,
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                        }}>
                        {showIcon ? <Icon name={cat.icon} size={11} color="#FFFFFF" /> : null}
                      </Pressable>
                    );
                  })}

                  {/* เส้นตอนนี้ (เฉพาะวันนี้) */}
                  {isToday ? (
                    <View style={{ position: 'absolute', top: `${pct(nowTop)}%`, left: 0, right: 0, height: 3, backgroundColor: ACCENT }}>
                      <View style={{ position: 'absolute', left: -3, top: -2, width: 7, height: 7, borderRadius: 3, backgroundColor: ACCENT }} />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>

        {/* คำอธิบายไอคอนหมวด (legend) — ถอดความหมายไอคอนในบล็อก */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4, paddingHorizontal: HPAD + 4, paddingVertical: 8, marginTop: 4 }}>
          {CATS.map((cat) => (
            <View key={cat.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name={cat.icon} size={12} color={cat.color} />
              <Txt size={11} color={t.sub}>
                {cat.short}
              </Txt>
            </View>
          ))}
        </View>
      </View>

    </View>
  );
}

// หัวคอลัมน์แบบปัดได้ (paging) — แต่ละหน้า = 7 วันของสัปดาห์นั้น (ตรงแนวกับคอลัมน์ไทม์ไลน์ด้านล่าง)
// ปัดจบ → เปลี่ยน monday (ไทม์ไลน์อัปเดตทันที) · แตะวัน → เข้ามุมมองวัน
function WeekHeaderStrip({ monday, onChangeMonday, onPressDay }: { monday: string; onChangeMonday: (m: string) => void; onPressDay: (iso: string) => void }) {
  const t = useTokens();
  const today = todayISO();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<string>>(null);

  // สัปดาห์อ้างอิงคงที่ (สัปดาห์ของวันนี้) — index ไม่ขยับตอน monday เปลี่ยน
  const anchorMonday = useMemo(() => mondayOf(todayISO()), []);
  const weeks = useMemo(() => Array.from({ length: WK_COUNT }, (_, i) => addDays(anchorMonday, (i - WK_SPAN) * 7)), [anchorMonday]);
  const curIndex = useMemo(() => weeks.indexOf(monday), [weeks, monday]);

  // index ที่กำลังโชว์ (กันลูประหว่าง scroll ↔ monday)
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
    if (m) onChangeMonday(m);
  };

  return (
    <View style={{ paddingBottom: 6, borderBottomWidth: 0.5, borderBottomColor: t.line }}>
      <FlatList
        ref={listRef}
        data={weeks}
        extraData={monday}
        keyExtractor={(m) => m}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={curIndex >= 0 ? curIndex : WK_SPAN}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onScrollToIndexFailed={({ index }) => {
          listRef.current?.scrollToOffset({ offset: index * width, animated: false });
        }}
        onMomentumScrollEnd={onMomentumEnd}
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={3}
        renderItem={({ item: wk }) => {
          const wdays = Array.from({ length: 7 }, (_, i) => addDays(wk, i));
          return (
            // paddingLeft = HPAD+GUTTER, paddingRight = HPAD → ตรงแนวกับคอลัมน์ไทม์ไลน์
            <View style={{ width, flexDirection: 'row', paddingLeft: HPAD + GUTTER, paddingRight: HPAD }}>
              {wdays.map((d, i) => {
                const isToday = d === today;
                return (
                  <Pressable key={d} onPress={() => onPressDay(d)} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                    <Txt size={10.5} weight="med" color={i === 6 ? ACCENT : t.faint}>
                      {WD_TH[i]}
                    </Txt>
                    <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: isToday ? ACCENT : 'transparent' }}>
                      <Txt size={13} num weight="bold" color={isToday ? '#FFFFFF' : t.ink}>
                        {fromISO(d).getDate()}
                      </Txt>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          );
        }}
      />
    </View>
  );
}
