// มุมมองวัน (ระบบ B1) — แถววันที่ + ไอคอนมุมมอง · แถบ 7 วัน · การ์ดสรุปวัน + ทบทวนค้างบันทึก · รายการบนราง
// แทนตารางชั่วโมงเดิม: วงกลมบนราง = ปุ่มติ๊ก · ชื่อยาวขึ้นบรรทัดใหม่ได้
// ปุ่มนาฬิกาที่หัวจอ (โหมดเวลาว่าง) เปิด → แทรกช่วงว่างเป็นแถวเส้นประ (แตะ → เพิ่ม) · ปิด → เห็นแต่รายการ
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View, type ScrollViewInstance } from 'react-native';

import { DateHeader, type CalView } from '@/components/b1/date-header';
import { Rail } from '@/components/b1/rail';
import { useNow } from '@/components/b1/use-now';
import { useToggleStatus } from '@/components/b1/use-toggle';
import { WeekStrip } from '@/components/b1/week-strip';
import { SvgIcon } from '@/components/svg-icon';
import { Txt, useTokens } from '@/components/ui';
import { GREEN } from '@/constants/theme';
import { addDays, beYear, fromISO, MONTH_TH, WD_TH_FULL, wdMon } from '@/lib/dates';
import { computeStats, daytimeFreeSlots } from '@/lib/engine';
import { dayProgress, overdueBetween, type DayProgress } from '@/lib/progress';
import type { DayItem } from '@/lib/types';
import { useActivities, useDay, useDayReader } from '@/stores/activities';

interface DayViewProps {
  focus: string;
  onChangeFocus: (iso: string) => void;
  /** แตะหัวเรื่อง → มุมมองเดือนของวันนี้ */
  onPressTitle: () => void;
  onPressItem: (item: DayItem) => void;
  bottomPad: number;
  view: CalView;
  onChangeView: (v: CalView) => void;
  onPressSlot: (date: string, start: number, end: number) => void;
  onAdd: () => void;
  /** เพิ่มค่าทุกครั้งที่กด "วันนี้" ขณะอยู่วันนี้แล้ว → เลื่อนไปที่เส้น "ตอนนี้" */
  scrollToNowSignal: number;
  /** โหมดเวลาว่าง (ปุ่มนาฬิกาที่หัวจอ) — แทรกช่วงว่างในราง */
  freeMode: boolean;
}

export function TodayDayView({ focus, onChangeFocus, onPressTitle, onPressItem, bottomPad, view, onChangeView, onPressSlot, onAdd, scrollToNowSignal, freeMode }: DayViewProps) {
  const router = useRouter();
  const items = useDay(focus);
  const getDay = useDayReader();
  const acts = useActivities((s) => s.acts);
  const occ = useActivities((s) => s.occ);
  const notes = useActivities((s) => s.notes);
  const toggle = useToggleStatus();
  const now = useNow();
  const isNowDay = focus === now.date;

  const p = dayProgress(items, now);
  const free = useMemo(() => (freeMode ? daytimeFreeSlots(items) : []), [items, freeMode]);
  const streak = useMemo(() => computeStats(acts, occ, now.min >= 1440 ? now.min - 1440 : now.min).streak, [acts, occ, now]);
  // ค้างบันทึก 7 วันล่าสุด (รวมวันนี้) — แบนเนอร์ทบทวน
  const overdue7 = useMemo(() => overdueBetween(getDay, addDays(now.date, -6), now.date, now).length, [getDay, now]);

  const d = fromISO(focus);
  const title = `${WD_TH_FULL[wdMon(focus)]} ${d.getDate()} ${MONTH_TH[d.getMonth()]}`;
  const summary = isNowDay && streak > 1 ? `${beYear(d.getFullYear())} · ทำต่อเนื่อง ${streak} วัน` : `${beYear(d.getFullYear())}${p.total ? ` · เสร็จ ${p.done}/${p.total}` : ''}`;

  // เลื่อนไปที่ "ตอนนี้" — ตอนเปิดวันนี้ครั้งแรก และทุกครั้งที่กด "วันนี้" ซ้ำ
  const scRef = useRef<ScrollViewInstance>(null);
  const [nowY, setNowY] = useState<number | null>(null);
  const railTop = useRef(0);
  useEffect(() => {
    if (!isNowDay || nowY === null) return;
    const id = requestAnimationFrame(() => scRef.current?.scrollTo({ y: Math.max(railTop.current + nowY - 180, 0), animated: scrollToNowSignal > 0 }));
    return () => cancelAnimationFrame(id);
  }, [isNowDay, nowY, scrollToNowSignal]);
  useEffect(() => {
    if (!isNowDay) scRef.current?.scrollTo({ y: 0, animated: false });
  }, [focus, isNowDay]);

  const noteOf = (it: DayItem) => notes[it.date]?.[it.id];

  return (
    <View style={{ flex: 1 }}>
      <DateHeader title={title} summary={summary} onPressTitle={onPressTitle} view={view} onChangeView={onChangeView} />
      <WeekStrip focus={focus} onChangeFocus={onChangeFocus} />

      <ScrollView ref={scRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 8, paddingBottom: bottomPad }}>
        {p.total || overdue7 ? (
          <DaySummary p={p} isNowDay={isNowDay} overdue7={overdue7} onReview={() => router.push('/review')} />
        ) : null}

        {items.length ? (
          <View onLayout={(e) => (railTop.current = e.nativeEvent.layout.y)} style={{ paddingLeft: 12, paddingRight: 18, paddingTop: 10 }}>
            <Rail
              items={items}
              now={now}
              free={free}
              showNow={isNowDay}
              onPressItem={onPressItem}
              onToggle={toggle}
              onPressSlot={(s) => onPressSlot(focus, s.start, s.end)}
              noteOf={noteOf}
              onNowLayout={setNowY}
            />
          </View>
        ) : (
          <EmptyDay onAdd={onAdd} />
        )}
      </ScrollView>
    </View>
  );
}

/** การ์ดสรุปวัน: ทำแล้ว x จาก y + แถบสะสม + คำอธิบาย · แถวล่าง = ค้างบันทึก 7 วัน → ทบทวน */
function DaySummary({ p, isNowDay, overdue7, onReview }: { p: DayProgress; isNowDay: boolean; overdue7: number; onReview: () => void }) {
  const t = useTokens();
  const seg = (n: number) => (p.total ? `${(n / p.total) * 100}%` : '0%') as `${number}%`;
  return (
    <View style={{ marginHorizontal: 18, backgroundColor: t.card, borderRadius: 16, overflow: 'hidden', shadowColor: '#221C13', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}>
      {p.total ? (
        <View style={{ padding: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Txt size={14} weight="bold" style={{ flex: 1 }}>
              {isNowDay ? 'สรุปวันนี้' : 'สรุปวัน'}
            </Txt>
            <Txt size={13} weight="bold" color={t.greenInk}>
              ทำแล้ว {p.done} จาก {p.total}
            </Txt>
          </View>
          <View style={{ flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: t.track, gap: 2 }}>
            {p.done ? <View style={{ width: seg(p.done), backgroundColor: GREEN }} /> : null}
            {p.skipped ? <View style={{ width: seg(p.skipped), backgroundColor: t.skipFill }} /> : null}
            {p.overdue ? <View style={{ width: seg(p.overdue), backgroundColor: '#D2603A' }} /> : null}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 }}>
            <Legend color={GREEN} label={`เสร็จ ${p.done}`} />
            <Legend color={t.skipFill} label={`ข้าม ${p.skipped}`} />
            {p.overdue ? <Legend color="#D2603A" label={`ค้างบันทึก ${p.overdue}`} strong /> : null}
            <Legend ring label={`รอ ${p.waiting}`} />
          </View>
        </View>
      ) : null}
      {overdue7 ? (
        <Pressable
          accessibilityRole="button"
          onPress={onReview}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 14,
            minHeight: 48,
            borderTopWidth: p.total ? 1 : 0,
            borderTopColor: t.line,
            backgroundColor: pressed ? t.track : 'transparent',
          })}>
          <SvgIcon name="alert" size={18} color="#D2603A" />
          <Txt size={13} style={{ flex: 1 }}>
            ยังไม่ได้บันทึก <Txt size={13} weight="bold">{overdue7} รายการ</Txt> ใน 7 วันล่าสุด
          </Txt>
          <Txt size={13} weight="bold" color={t.accentInk}>
            ทบทวน ›
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

function Legend({ color, label, ring, strong }: { color?: string; label: string; ring?: boolean; strong?: boolean }) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ring ? 'transparent' : color, borderWidth: ring ? 1.5 : 0, borderColor: t.railDash }} />
      <Txt size={12} weight={strong ? 'bold' : 'reg'} color={strong ? t.warn : t.sub}>
        {label}
      </Txt>
    </View>
  );
}

function EmptyDay({ onAdd }: { onAdd: () => void }) {
  const t = useTokens();
  return (
    <View style={{ alignItems: 'center', paddingTop: 48, paddingHorizontal: 32, gap: 12 }}>
      <Txt size={15} weight="med" color={t.sub} style={{ textAlign: 'center' }}>
        ยังไม่มีกิจกรรมในวันนี้
      </Txt>
      <Pressable accessibilityRole="button" onPress={onAdd} style={{ height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: t.track, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <SvgIcon name="plus" size={16} color={t.ink} strokeWidth={2.2} />
        <Txt size={14} weight="bold">
          เพิ่มกิจกรรม
        </Txt>
      </Pressable>
    </View>
  );
}
