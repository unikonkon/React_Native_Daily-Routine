// มุมมองสัปดาห์: 7 คอลัมน์ (จันทร์เริ่ม) 06:00–25:00 — ใช้ทั้งแท็บวันนี้ (normal) และสรุปวันว่าง (free)
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { CAT_BY_ID, GREEN } from '@/constants/theme';
import { Txt, useTokens } from '@/components/ui';
import { WD_TH, addDays, fmtMin, fromISO, todayISO } from '@/lib/dates';
import { freeSlots } from '@/lib/engine';
import { useActivities, getDay } from '@/stores/activities';

const W_START = 360;
const W_END = 1500;
const PX = 0.3;

interface WeekGridProps {
  monday: string;
  mode?: 'normal' | 'free';
  onPressDay: (iso: string) => void;
}

export function WeekGrid({ monday, mode = 'normal', onPressDay }: WeekGridProps) {
  const t = useTokens();
  useActivities((s) => s.version); // re-render เมื่อข้อมูลเปลี่ยน
  const today = todayISO();
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const height = (W_END - W_START) * PX;
  const rules = [360, 600, 840, 1080, 1320, 1500];

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 140 }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <View style={{ width: 34 }} />
        {days.map((d) => (
          <Pressable key={d} onPress={() => onPressDay(d)} style={{ flex: 1, alignItems: 'center', paddingVertical: 6 }}>
            <Txt size={11} color={t.faint}>
              {WD_TH[days.indexOf(d)]}
            </Txt>
            <Txt size={13} num weight={d === today ? 'bold' : 'med'} color={d === today ? t.ink : t.sub}>
              {fromISO(d).getDate()}
            </Txt>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 4, height }}>
        <View style={{ width: 34 }}>
          {rules.map((m) => (
            <Txt key={m} size={9} num color={t.faint} style={{ position: 'absolute', top: (m - W_START) * PX - 5 }}>
              {fmtMin(m)}
            </Txt>
          ))}
        </View>
        {days.map((d) => {
          const items = getDay(d);
          const slots = mode === 'free' ? freeSlots(items) : [];
          return (
            <Pressable key={d} onPress={() => onPressDay(d)} style={{ flex: 1 }}>
              <View style={{ flex: 1, backgroundColor: t.card, borderRadius: 8, borderWidth: 1, borderColor: t.line, overflow: 'hidden' }}>
                {items.map((it) => {
                  const color = CAT_BY_ID[it.cat].color;
                  const dim = mode === 'free' ? 0.35 : it.ostatus === 'rescheduled' ? 0.35 : it.ostatus === 'done' ? 1 : 0.6;
                  return (
                    <View
                      key={`${it.id}:${d}`}
                      style={{
                        position: 'absolute',
                        top: (Math.max(it.startMin, W_START) - W_START) * PX,
                        left: 2,
                        right: 2,
                        height: Math.max((Math.min(it.endMin, W_END) - Math.max(it.startMin, W_START)) * PX, 4),
                        borderRadius: 3,
                        backgroundColor: color,
                        opacity: dim,
                      }}
                    />
                  );
                })}
                {slots.map((s) => (
                  <View
                    key={s.start}
                    style={{
                      position: 'absolute',
                      top: (Math.max(s.start, W_START) - W_START) * PX,
                      left: 2,
                      right: 2,
                      height: Math.max((Math.min(s.end, W_END) - Math.max(s.start, W_START)) * PX, 4),
                      borderRadius: 3,
                      backgroundColor: GREEN,
                      opacity: 0.9,
                    }}
                  />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
