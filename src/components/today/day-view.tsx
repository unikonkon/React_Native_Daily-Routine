// มุมมองวัน (ลุค mockup) — แถบสัปดาห์ + ป้ายวัน + ไทม์ไลน์ 06:00–30:00 ครบ 24 ชม.
// แถวชั่วโมง + บล็อกกิจกรรมขอบซ้ายสี + เส้น "ตอนนี้" มีป้ายเวลา + auto-scroll ไปเวลาปัจจุบัน
import React, { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Icon } from '@/components/icon';
import { DrillBack, ViewSwitcher, type View3 } from '@/components/today/parts';
import { PriBadge, Txt, useTokens } from '@/components/ui';
import { ACCENT, CAT_BY_ID, DAY_END, DAY_START, GREEN } from '@/constants/theme';
import { MONTH_TH_FULL, WD_TH, addDays, beYear, fmtMin, fmtRange, fromISO, mondayOf, nowMin, thaiDate, todayISO } from '@/lib/dates';
import { assignLanes } from '@/lib/engine';
import { useDay } from '@/stores/activities';
import type { DayItem } from '@/lib/types';

const PX = 1; // 1px/นาที = 60px/ชม. (สเปเชียลใกล้ mockup)
const GUTTER = 52;

interface DayViewProps {
  focus: string;
  onChangeFocus: (iso: string) => void;
  onBack: () => void;
  onPressItem: (item: DayItem) => void;
  bottomPad?: number;
  view: View3;
  onChangeView: (v: View3) => void;
}

export function TodayDayView({ focus, onChangeFocus, onBack, onPressItem, bottomPad = 140, view, onChangeView }: DayViewProps) {
  const t = useTokens();
  const today = todayISO();
  const items = useDay(focus);
  const monday = mondayOf(focus);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const fd = fromISO(focus);
  const backLabel = `${MONTH_TH_FULL[fd.getMonth()]} ${beYear(fd.getFullYear())}`; // ระดับเดือนที่ถอยขึ้นไป

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, minHeight: 34, gap: 8 }}>
        <DrillBack label={backLabel} onPress={onBack} />
        <View style={{ flex: 1 }} />
        <ViewSwitcher value={view} onChange={onChangeView} />
      </View>

      {/* แถบสัปดาห์ (จันทร์นำ) */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 10, paddingTop: 4, paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: t.line }}>
        {days.map((d, i) => {
          const isFocus = d === focus;
          const isToday = d === today;
          const fill = isFocus ? (isToday ? ACCENT : t.ink) : 'transparent';
          const numColor = isFocus ? (isToday ? '#FFFFFF' : t.bg) : isToday ? ACCENT : t.ink;
          return (
            <Pressable key={d} onPress={() => onChangeFocus(d)} style={{ flex: 1, alignItems: 'center', gap: 5, paddingVertical: 2 }}>
              <Txt size={11} weight="med" color={i === 6 ? ACCENT : t.faint}>
                {WD_TH[i]}
              </Txt>
              <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: fill }}>
                <Txt size={16} num weight={isFocus || isToday ? 'bold' : 'reg'} color={numColor}>
                  {fromISO(d).getDate()}
                </Txt>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Txt size={14} weight="med" color={t.sub} style={{ textAlign: 'center', paddingVertical: 9 }}>
        {thaiDate(focus)}
      </Txt>

      <DayTimeline date={focus} items={items} onPressItem={onPressItem} bottomPad={bottomPad} />
    </View>
  );
}

function DayTimeline({ date, items, onPressItem, bottomPad }: { date: string; items: DayItem[]; onPressItem: (i: DayItem) => void; bottomPad: number }) {
  const t = useTokens();
  const scRef = useRef<ScrollView>(null);
  const height = (DAY_END - DAY_START) * PX;
  const lanes = useMemo(() => assignLanes(items), [items]);

  // เส้น "ตอนนี้": ช่วง 00:00–06:00 ถือเป็นท้ายหน้าต่างของเมื่อวาน (แสดงที่ now+1440)
  const now = nowMin();
  const nowDate = now >= DAY_START ? todayISO() : addDays(todayISO(), -1);
  const nowTop = now >= DAY_START ? now : now + 1440;
  const isNowDay = date === nowDate;

  const hourRules: number[] = [];
  for (let m = DAY_START; m <= DAY_END; m += 60) hourRules.push(m);

  // auto-scroll ไปใกล้เวลาปัจจุบัน (หรือ 08:00 เมื่อดูวันอื่น)
  useEffect(() => {
    const target = isNowDay ? nowTop : 8 * 60;
    const y = Math.max((target - DAY_START) * PX - 160, 0);
    const id = requestAnimationFrame(() => scRef.current?.scrollTo({ y, animated: false }));
    return () => cancelAnimationFrame(id);
  }, [date, isNowDay, nowTop]);

  return (
    <ScrollView ref={scRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 10, paddingBottom: bottomPad }}>
      <View style={{ height, marginHorizontal: 18 }}>
        {hourRules.map((m) => (
          <View key={m} style={{ position: 'absolute', top: (m - DAY_START) * PX - 8, height: 16, left: 0, right: 0, flexDirection: 'row', alignItems: 'center' }}>
            <Txt size={11} num color={t.faint} style={{ width: GUTTER, textAlign: 'right', paddingRight: 10, lineHeight: 16 }}>
              {fmtMin(m)}
            </Txt>
            <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
          </View>
        ))}

        {items.map((it) => {
          const cat = CAT_BY_ID[it.cat];
          const { lane, n } = lanes[it.id] ?? { lane: 0, n: 1 };
          const top = (it.startMin - DAY_START) * PX;
          const h = Math.max((it.endMin - it.startMin) * PX - 4, 26);
          const done = it.ostatus === 'done';
          const dim = it.ostatus === 'rescheduled' ? 0.5 : 1;
          return (
            <Pressable
              key={`${it.id}:${it.date}`}
              onPress={() => onPressItem(it)}
              style={{ position: 'absolute', top, left: GUTTER + 6, right: 0, height: h, opacity: dim }}>
              <View
                style={{
                  position: 'absolute',
                  left: `${(100 / n) * lane}%`,
                  width: `${100 / n}%`,
                  height: h,
                  backgroundColor: cat.color + (done ? '26' : '1a'),
                  borderLeftWidth: 3,
                  borderLeftColor: cat.color,
                  borderRadius: 9,
                  paddingHorizontal: 9,
                  paddingVertical: 4,
                  overflow: 'hidden',
                }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  {it.cat === 'case' ? <PriBadge id={it.priority} /> : null}
                  <Txt size={13} weight="med" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {it.title}
                  </Txt>
                  {done ? <Icon name="check" size={13} color={GREEN} /> : null}
                </View>
                {h > 36 ? (
                  <Txt size={11} num color={t.sub}>
                    {fmtRange(it.startMin, it.endMin)}
                    {it.loc ? ` · ${it.loc}` : ''}
                  </Txt>
                ) : null}
              </View>
            </Pressable>
          );
        })}

        {isNowDay ? (
          <View style={{ position: 'absolute', top: (nowTop - DAY_START) * PX - 9, left: 0, right: 0, height: 18, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: GUTTER, alignItems: 'flex-end', paddingRight: 6 }}>
              <View style={{ backgroundColor: ACCENT, borderRadius: 9, paddingHorizontal: 6, paddingVertical: 1 }}>
                <Txt size={10} num weight="bold" color="#FFFFFF">
                  {fmtMin(now)}
                </Txt>
              </View>
            </View>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: ACCENT }} />
            <View style={{ flex: 1, height: 2, backgroundColor: ACCENT }} />
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}
