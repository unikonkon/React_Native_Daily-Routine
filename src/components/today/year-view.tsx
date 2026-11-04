// มุมมองปี (ระบบ B1) — หัว/ไอคอนมุมมอง/แถบล่าง (‹ ปี ›) อยู่ที่แท็บวันนี้ (index)
// การ์ดสรุปปี (% ทำเสร็จ · วันที่ทำครบ · ติดต่อกันนานสุด) + 12 เดือน: สีช่องวันตาม % ทำเสร็จ · เดือนปัจจุบันมีกรอบ
import React, { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { useNow } from '@/components/b1/use-now';
import { Txt, useTokens } from '@/components/ui';
import { MONTH_TH, addDays, fromISO, mondayOf, toISO } from '@/lib/dates';
import { dayProgress, type NowRef } from '@/lib/progress';
import type { DayItem } from '@/lib/types';
import { useDayReader } from '@/stores/activities';

interface YearViewProps {
  year: number;
  onPressMonth: (month: number) => void;
  bottomPad: number;
}

/** สีช่องวันตาม % ทำเสร็จ — ไม่มีรายการ/อนาคต = undefined (ใช้สีราง) */
const LEVELS = ['#F2C7B4', '#D9E8DD', '#A9CDB4', '#6FAE85', '#4C9A6A'];
function levelOf(rate: number): string {
  if (rate >= 1) return LEVELS[4];
  if (rate >= 0.75) return LEVELS[3];
  if (rate >= 0.5) return LEVELS[2];
  if (rate >= 0.25) return LEVELS[1];
  return LEVELS[0];
}

interface DayCell {
  rate: number | null; // null = ไม่มีรายการที่ถึงกำหนด
}

interface YearAcc {
  days: Record<string, DayCell>;
  months: { total: number; done: number }[];
  total: number;
  done: number;
  fullDays: number;
  run: number;
  best: number;
}

/** สะสมผลของวันหนึ่งลงตัวรวม (แก้ acc ตรง ๆ) */
function addDay(acc: YearAcc, d: string, due: number, doneN: number) {
  if (!due) {
    acc.days[d] = { rate: null };
    return;
  }
  const rate = doneN / due;
  acc.days[d] = { rate };
  const m = fromISO(d).getMonth();
  acc.months[m].total += due;
  acc.months[m].done += doneN;
  acc.total += due;
  acc.done += doneN;
  if (rate >= 1) {
    acc.fullDays++;
    acc.run++;
    acc.best = Math.max(acc.best, acc.run);
  } else acc.run = 0;
}

/** วันก่อนวันนี้ทั้งปี — ไม่ขึ้นกับเวลาตอนนี้ คิดครั้งเดียวต่อวัน (ส่วนหนักของมุมมองปี) */
function yearPast(getDay: (d: string) => DayItem[], year: number, today: string): YearAcc {
  const now: NowRef = { date: today, min: 0 }; // วันก่อนหน้าใช้แค่ total/done — ไม่ขึ้นกับเวลา
  const acc: YearAcc = { days: {}, months: Array.from({ length: 12 }, () => ({ total: 0, done: 0 })), total: 0, done: 0, fullDays: 0, run: 0, best: 0 };
  for (let d = `${year}-01-01`; d <= `${year}-12-31` && d < today; d = addDays(d, 1)) {
    const p = dayProgress(getDay(d), now);
    addDay(acc, d, p.total, p.done);
  }
  return acc;
}

/** เติมวันนี้ (นับเฉพาะรายการที่ถึงเวลาแล้ว — เปลี่ยนทุกนาที แต่คิดแค่วันเดียว) แล้วสรุปผล */
function yearData(past: YearAcc, getDay: (d: string) => DayItem[], year: number, now: NowRef) {
  const acc: YearAcc = { ...past, days: { ...past.days }, months: past.months.map((m) => ({ ...m })) };
  if (now.date.slice(0, 4) === String(year)) {
    const p = dayProgress(getDay(now.date), now);
    addDay(acc, now.date, p.total - p.waiting, p.done);
  }
  return { days: acc.days, months: acc.months, rate: acc.total ? acc.done / acc.total : 0, fullDays: acc.fullDays, best: acc.best, total: acc.total };
}

export function TodayYearView({ year, onPressMonth, bottomPad }: YearViewProps) {
  const t = useTokens();
  const getDay = useDayReader();
  const now = useNow();
  // ส่วนหนัก (ทุกวันก่อนวันนี้) คิดใหม่เมื่อข้อมูล/ปี/วันเปลี่ยนเท่านั้น — ไม่ใช่ทุกนาทีตาม now
  const today = now.date;
  const past = useMemo(() => yearPast(getDay, year, today), [getDay, year, today]);
  const data = useMemo(() => yearData(past, getDay, year, now), [past, getDay, year, now]);
  const nowD = fromISO(now.date);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: bottomPad, gap: 12 }}>
      <View style={{ flexDirection: 'row', backgroundColor: t.card, borderRadius: 16, paddingVertical: 14, shadowColor: '#221C13', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}>
        <Stat value={data.total ? `${Math.round(data.rate * 100)}%` : '—'} label="ทำเสร็จทั้งปี" color={t.greenInk} />
        <View style={{ width: 1, backgroundColor: t.line }} />
        <Stat value={`${data.fullDays}`} label="วันที่ทำครบ" />
        <View style={{ width: 1, backgroundColor: t.line }} />
        <Stat value={`${data.best} วัน`} label="ติดต่อกันนานสุด" />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Txt size={13} weight="bold" color={t.sub} style={{ flex: 1 }}>
          รายเดือน
        </Txt>
        <Txt size={11.5} color={t.sub}>
          น้อย{' '}
        </Txt>
        {LEVELS.map((c) => (
          <View key={c} style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: c, marginLeft: 2 }} />
        ))}
        <Txt size={11.5} color={t.sub}>
          {' '}ครบ
        </Txt>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
        {Array.from({ length: 12 }, (_, m) => {
          const cur = year === nowD.getFullYear() && m === nowD.getMonth();
          const mm = data.months[m];
          const future = toISO(new Date(year, m, 1)) > now.date;
          return (
            <View key={m} style={{ width: '33.33%', padding: 4 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${MONTH_TH[m]} ${mm.total ? `ทำเสร็จ ${Math.round((mm.done / mm.total) * 100)}%` : ''}`}
                onPress={() => onPressMonth(m)}
                style={({ pressed }) => ({
                  backgroundColor: t.card,
                  borderRadius: 14,
                  padding: 10,
                  gap: 6,
                  borderWidth: cur ? 2 : 0,
                  borderColor: t.ink,
                  opacity: pressed ? 0.7 : 1,
                })}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <Txt size={13} weight="bold" style={{ flex: 1 }}>
                    {MONTH_TH[m]}
                  </Txt>
                  <Txt size={11.5} num color={future || !mm.total ? t.faint : t.sub}>
                    {future || !mm.total ? '—' : `${Math.round((mm.done / mm.total) * 100)}%`}
                  </Txt>
                </View>
                <MiniGrid year={year} month={m} days={data.days} today={now.date} />
              </Pressable>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  const t = useTokens();
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Txt size={20} num weight="bold" color={color ?? t.ink}>
        {value}
      </Txt>
      <Txt size={11.5} color={t.sub}>
        {label}
      </Txt>
    </View>
  );
}

function MiniGrid({ year, month, days, today }: { year: number; month: number; days: Record<string, DayCell>; today: string }) {
  const t = useTokens();
  const first = toISO(new Date(year, month, 1));
  const ym = first.slice(0, 7);
  const start = mondayOf(first);
  return (
    <View style={{ gap: 2 }}>
      {Array.from({ length: 6 }, (_, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: 2 }}>
          {Array.from({ length: 7 }, (_, c) => {
            const d = addDays(start, r * 7 + c);
            const inMonth = d.slice(0, 7) === ym;
            const cell = days[d];
            const bg = !inMonth ? 'transparent' : cell?.rate != null ? levelOf(cell.rate) : t.track;
            return (
              <View
                key={d}
                style={{ flex: 1, aspectRatio: 1, borderRadius: 2, backgroundColor: bg, borderWidth: inMonth && d === today ? 1.5 : 0, borderColor: '#D2603A' }}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}
