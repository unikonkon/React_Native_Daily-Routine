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
import { addDays, beYear, fromISO, MONTH_TH, WD_TH_FULL, wdMon } from '@/lib/dates';
import { computeStats, daytimeFreeSlots } from '@/lib/engine';
import { dayProgress, overdueBetween } from '@/lib/progress';
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
        {overdue7 ? <ReviewBanner overdue7={overdue7} onReview={() => router.push('/review')} /> : null}

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

/** แถบเตือนค้างบันทึก 7 วันล่าสุด → หน้าทบทวน (ไม่มีการ์ดสรุปวันแล้ว — หัวหน้าบอก "เสร็จ x/y" อยู่แล้ว) */
function ReviewBanner({ overdue7, onReview }: { overdue7: number; onReview: () => void }) {
  const t = useTokens();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onReview}
      style={({ pressed }) => ({
        marginHorizontal: 18,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 14,
        minHeight: 48,
        borderRadius: 16,
        backgroundColor: pressed ? t.track : t.card,
        shadowColor: '#221C13',
        shadowOpacity: 0.06,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
      })}>
      <SvgIcon name="alert" size={18} color="#D2603A" />
      <Txt size={13} style={{ flex: 1 }}>
        ยังไม่ได้บันทึก <Txt size={13} weight="bold">{overdue7} รายการ</Txt> ใน 7 วันล่าสุด
      </Txt>
      <Txt size={13} weight="bold" color={t.accentInk}>
        ทบทวน ›
      </Txt>
    </Pressable>
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
