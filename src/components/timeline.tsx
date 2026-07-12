// Timeline แนวตั้งของหนึ่งวัน — ใช้ทั้งแท็บวันนี้ (mode normal) และแท็บสรุปโหมดวันว่าง (mode free)
// สเปกตาม APP_STRUCTURE.md §3.2 / §5.1: หน้าต่าง 06:00–30:00 (ครบ 24 ชม.), เลนสำหรับเวลาทับกัน, เส้นตอนนี้
import React, { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { ACCENT, CAT_BY_ID, DAY_END, DAY_START, GREEN } from '@/constants/theme';
import { Icon } from '@/components/icon';
import { PriBadge, Txt, useTokens } from '@/components/ui';
import { addDays, fmtMin, fmtRange, hoursText, nowMin, todayISO } from '@/lib/dates';
import { assignLanes, freeSlots } from '@/lib/engine';
import type { DayItem, FreeSlot } from '@/lib/types';

const GUTTER = 44;

interface TimelineProps {
  date: string;
  items: DayItem[];
  mode?: 'normal' | 'free';
  onPressItem?: (item: DayItem) => void;
  onPressSlot?: (slot: FreeSlot) => void;
  bottomPad?: number;
}

export function Timeline({ date, items, mode = 'normal', onPressItem, onPressSlot, bottomPad = 120 }: TimelineProps) {
  const t = useTokens();
  const px = mode === 'free' ? 0.72 : 0.82;
  const height = (DAY_END - DAY_START) * px;
  const lanes = useMemo(() => assignLanes(items), [items]);
  const slots = useMemo(() => (mode === 'free' ? freeSlots(items) : []), [mode, items]);
  // เส้น "ตอนนี้": ช่วง 00:00–06:00 ถือเป็นท้ายหน้าต่างของเมื่อวาน (แสดงที่ now+1440)
  const now = nowMin();
  const nowDate = now >= DAY_START ? todayISO() : addDays(todayISO(), -1);
  const nowTop = now >= DAY_START ? now : now + 1440;

  const hourRules = [];
  for (let m = DAY_START; m <= DAY_END; m += 120) hourRules.push(m);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>
      <View style={{ height, marginHorizontal: 18 }}>
        {hourRules.map((m) => (
          <View key={m} style={{ position: 'absolute', top: (m - DAY_START) * px, left: 0, right: 0, flexDirection: 'row', alignItems: 'center' }}>
            <Txt size={11} num color={t.faint} style={{ width: GUTTER }}>
              {fmtMin(m)}
            </Txt>
            <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
          </View>
        ))}

        {items.map((it) => {
          const cat = CAT_BY_ID[it.cat];
          const { lane, n } = lanes[it.id] ?? { lane: 0, n: 1 };
          const top = (it.startMin - DAY_START) * px;
          const h = Math.max((it.endMin - it.startMin) * px - 3, 22);
          const done = it.ostatus === 'done';
          const dim = mode === 'free' ? 0.45 : it.ostatus === 'rescheduled' ? 0.5 : 1;
          const laneW = `${100 / n}%` as const;
          return (
            <Pressable
              key={`${it.id}:${it.date}`}
              disabled={mode === 'free'}
              onPress={() => onPressItem?.(it)}
              style={{
                position: 'absolute',
                top,
                left: GUTTER + 8,
                right: 0,
                height: h,
                opacity: dim,
              }}>
              <View
                style={{
                  position: 'absolute',
                  left: `${(100 / n) * lane}%`,
                  width: laneW,
                  height: h,
                  backgroundColor: cat.color + (done ? '22' : '1a'),
                  borderLeftWidth: 3,
                  borderLeftColor: cat.color,
                  borderRadius: 11,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  overflow: 'hidden',
                }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  {it.cat === 'case' ? <PriBadge id={it.priority} /> : null}
                  <Txt size={13} weight="med" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {it.title}
                  </Txt>
                  {done ? <Icon name="check" size={13} color={GREEN} /> : null}
                </View>
                {h > 34 ? (
                  <Txt size={11} num color={t.sub}>
                    {fmtRange(it.startMin, it.endMin)}
                    {it.loc ? ` · ${it.loc}` : ''}
                  </Txt>
                ) : null}
              </View>
            </Pressable>
          );
        })}

        {mode === 'free'
          ? slots.map((s) => (
              <Pressable
                key={s.start}
                onPress={() => onPressSlot?.(s)}
                style={{
                  position: 'absolute',
                  top: (s.start - DAY_START) * px,
                  left: GUTTER + 8,
                  right: 0,
                  height: Math.max((s.end - s.start) * px - 3, 30),
                  backgroundColor: GREEN,
                  borderRadius: 11,
                  paddingHorizontal: 10,
                  justifyContent: 'center',
                }}>
                <Txt size={13} weight="bold" color="#FFFFFF" num>
                  {fmtMin(s.start)}–{fmtMin(s.end)} ว่าง {hoursText(s.end - s.start)}
                </Txt>
                <Txt size={11} color="rgba(255,255,255,0.85)">จองช่วงนี้ ›</Txt>
              </Pressable>
            ))
          : null}

        {mode === 'normal' && date === nowDate ? (
          <View style={{ position: 'absolute', top: (nowTop - DAY_START) * px, left: GUTTER, right: 0, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ACCENT }} />
            <View style={{ flex: 1, height: 2, backgroundColor: ACCENT }} />
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}
