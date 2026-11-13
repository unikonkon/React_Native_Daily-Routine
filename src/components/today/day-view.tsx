// มุมมองวัน (ระบบ B1) — แถววันที่ + ไอคอนมุมมอง · แถบ 7 วัน · การ์ดสรุปวัน + ทบทวนค้างบันทึก · รายการบนราง
// แทนตารางชั่วโมงเดิม: วงกลมบนราง = ปุ่มติ๊ก · ชื่อยาวขึ้นบรรทัดใหม่ได้
// ปัดซ้าย/ขวาที่รายการ → วันถัดไป/วันก่อน (components/today/swipe-days)
// ปุ่มนาฬิกาที่หัวจอ (โหมดเวลาว่าง) เปิด → แทรกช่วงว่างเป็นแถวเส้นประ (แตะ → เพิ่ม) · ปิด → เห็นแต่รายการ
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View, type ScrollViewInstance } from 'react-native';

import { DateHeader, type CalView } from '@/components/b1/date-header';
import { Rail } from '@/components/b1/rail';
import { StatusDot } from '@/components/b1/status-circle';
import { useNow } from '@/components/b1/use-now';
import { useToggleStatus } from '@/components/b1/use-toggle';
import { WeekStrip } from '@/components/b1/week-strip';
import { EmptyState } from '@/components/empty-state';
import { FadeInView, useBurst } from '@/components/motion';
import { SvgIcon } from '@/components/svg-icon';
import { SwipeDays } from '@/components/today/swipe-days';
import { Txt, useTokens } from '@/components/ui';
import { addDays, beYear, fromISO, MONTH_TH, WD_TH_FULL, wdMon } from '@/lib/dates';
import { daytimeFreeSlots, streakBefore, streakWithToday } from '@/lib/engine';
import { dayProgress, overdueBetween } from '@/lib/progress';
import type { DayItem, FreeSlot } from '@/lib/types';
import { useActs, useDay, useDayReader, useNotes, useOcc } from '@/stores/activities';
import { ATTN, GREEN } from '@/constants/theme';

/** คำทักทายตามช่วงเวลา (นาทีของวัน — เกิน 1440 = หลังเที่ยงคืนของหน้าต่างวันเดิม) */
function greeting(min: number): string {
  const h = Math.floor((min % 1440) / 60);
  return h < 5 ? 'ดึกแล้ว พักผ่อนนะ' : h < 11 ? 'อรุณสวัสดิ์' : h < 13 ? 'สวัสดีตอนเที่ยง' : h < 17 ? 'สวัสดีตอนบ่าย' : h < 21 ? 'สวัสดีตอนเย็น' : 'ราตรีสวัสดิ์';
}

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
  // อ่านผ่านประตูของชั้น (useActs/useOcc/useNotes) — ตอนมุมมองวันถูกซ่อน (ดูสัปดาห์/เดือนอยู่) ไม่ต้องคิด streak/รายการใหม่ตามทุกการเปลี่ยนแปลง
  const acts = useActs();
  const occ = useOcc();
  const notes = useNotes();
  const toggle = useToggleStatus();
  const now = useNow();
  const isNowDay = focus === now.date;

  const p = dayProgress(items, now);
  const free = useMemo(() => (freeMode ? daytimeFreeSlots(items) : []), [items, freeMode]);
  // streak: ส่วนย้อนหลัง (หนัก) คิดใหม่เมื่อข้อมูล/วันเปลี่ยนเท่านั้น · ส่วนวันนี้ (เบา) คิดทุกนาที
  // ก่อน 06:00 now.date ยังเป็นเมื่อวาน (min เกิน 1440) — streak ใช้วันที่ตามปฏิทินเหมือน computeStats เดิม
  const calToday = now.min >= 1440 ? addDays(now.date, 1) : now.date;
  const streakPast = useMemo(() => streakBefore(acts, occ, calToday), [acts, occ, calToday]);
  const streak = streakWithToday(streakPast, getDay(calToday), now.min >= 1440 ? now.min - 1440 : now.min);
  // ค้างบันทึก 7 วันล่าสุด (รวมวันนี้) — แบนเนอร์ทบทวน
  const overdue7 = useMemo(() => overdueBetween(getDay, addDays(now.date, -6), now.date, now).length, [getDay, now]);

  const d = fromISO(focus);
  const title = `${WD_TH_FULL[wdMon(focus)]} ${d.getDate()} ${MONTH_TH[d.getMonth()]}`;
  // วันนี้: ทักทายตามช่วงเวลาแทนปี (อยู่บรรทัดสรุปเดิม — หัวจอไม่สูงขึ้น ปัดไปวันอื่นแล้วไม่กระตุก) · วันอื่น: ปี + ความคืบหน้า
  const summary = isNowDay
    ? [greeting(now.min), p.total ? `เสร็จ ${p.done}/${p.total}` : 'ยังไม่มีรายการ', streak > 1 ? `ต่อเนื่อง ${streak} วัน` : ''].filter(Boolean).join(' · ')
    : `${beYear(d.getFullYear())}${p.total ? ` · เสร็จ ${p.done}/${p.total}` : ''}`;
  // ครบทั้งวัน = ไม่เหลือรายการที่ยังไม่ทำ (ทำแล้ว/ข้ามครบ) และทำแล้วอย่างน้อย 1 — การ์ดฉลองเบา ๆ บนสุดของรายการ (เฉพาะวันนี้)
  const complete = isNowDay && p.done > 0 && p.done + p.skipped === p.total;
  // เพิ่งครบระหว่างเปิดจออยู่ → การ์ดลอยเข้า + เลื่อนขึ้นไปให้เห็น (เปิดมาครบอยู่แล้ว = โชว์นิ่ง ๆ)
  const justDone = useBurst(complete);

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

  useEffect(() => {
    if (justDone) scRef.current?.scrollTo({ y: 0, animated: true });
  }, [justDone]);

  const noteOf = (it: DayItem) => notes[it.date]?.[it.id];
  // ตั้งชื่อไว้ (ไม่เขียนฝังใน JSX) — Rail ห่อ memo ต้องได้ฟังก์ชันตัวเดิมถึงจะข้ามการคิดซ้ำได้
  const pressSlot = (s: FreeSlot) => onPressSlot(focus, s.start, s.end);

  return (
    <View style={{ flex: 1 }}>
      <DateHeader title={title} summary={summary} onPressTitle={onPressTitle} view={view} onChangeView={onChangeView} />
      <WeekStrip focus={focus} onChangeFocus={onChangeFocus} />

      {/* ปัดซ้าย/ขวาที่รายการ = วันถัดไป/วันก่อน (หัวจอ + แถบ 7 วันอยู่กับที่) */}
      <SwipeDays focus={focus} onChangeFocus={onChangeFocus}>
        <ScrollView ref={scRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 8, paddingBottom: bottomPad }}>
          {overdue7 ? <ReviewBanner overdue7={overdue7} onReview={() => router.push('/review')} /> : null}
          {complete ? <DayDone key={justDone} animate={justDone > 0} streak={streak} below={!!overdue7} /> : null}

          {items.length ? (
            <View onLayout={(e) => (railTop.current = e.nativeEvent.layout.y)} style={{ paddingLeft: 12, paddingRight: 18, paddingTop: 10 }}>
              <Rail
                key={focus}
                items={items}
                now={now}
                free={free}
                showNow={isNowDay}
                onPressItem={onPressItem}
                onToggle={toggle}
                onPressSlot={pressSlot}
                noteOf={noteOf}
                onNowLayout={setNowY}
              />
            </View>
          ) : (
            <EmptyDay onAdd={onAdd} today={isNowDay} />
          )}
        </ScrollView>
      </SwipeDays>
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
        borderRadius: 20,
        backgroundColor: pressed ? t.track : t.card,
        shadowColor: t.shadow,
        shadowOpacity: 0.06,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
      })}>
      <SvgIcon name="alert" size={18} color={ATTN} />
      <Txt size={13} style={{ flex: 1 }}>
        ยังไม่ได้บันทึก <Txt size={13} weight="bold">{overdue7} รายการ</Txt> ใน 7 วันล่าสุด
      </Txt>
      <Txt size={13} weight="bold" color={t.accentInk}>
        ทบทวน ›
      </Txt>
    </Pressable>
  );
}

/**
 * การ์ด "วันนี้ครบแล้ว" — ฉลองแบบเรียบ ๆ: วงเขียววาดเครื่องหมายถูก + คำชม 1 บรรทัด (ไม่มีเอฟเฟกต์หวือหวา)
 * animate = เพิ่งครบตอนเปิดจออยู่ → ลอยเข้า + วาดเครื่องหมายถูก
 */
function DayDone({ animate, streak, below }: { animate: boolean; streak: number; below: boolean }) {
  const t = useTokens();
  const body = (
    <View
      accessible
      accessibilityLabel={`วันนี้ครบทุกรายการแล้ว${streak > 1 ? ` ทำต่อเนื่อง ${streak} วัน` : ''}`}
      style={{ marginHorizontal: 18, marginTop: below ? 10 : 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 20, backgroundColor: GREEN + '1F' }}>
      <StatusDot state="done" size={30} drawCheck={animate} />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Txt size={14.5} weight="bold" color={t.greenInk}>
          วันนี้ครบทุกรายการแล้ว
        </Txt>
        <Txt size={12.5} color={t.sub}>
          {streak > 1 ? `ทำต่อเนื่องมา ${streak} วันแล้ว · พักผ่อนให้เต็มที่นะ` : 'เก่งมาก · พักผ่อนให้เต็มที่นะ'}
        </Txt>
      </View>
    </View>
  );
  return animate ? (
    <FadeInView rise={10} duration={320}>
      {body}
    </FadeInView>
  ) : (
    body
  );
}

function EmptyDay({ onAdd, today }: { onAdd: () => void; today: boolean }) {
  const t = useTokens();
  return (
    <EmptyState icon="sun" title={today ? 'วันนี้ยังว่างอยู่' : 'ยังไม่มีกิจกรรมในวันนี้'} sub={today ? 'เริ่มจากสิ่งเล็ก ๆ สักอย่าง หรือจะปล่อยให้เป็นวันพักก็ได้นะ' : 'แตะ "เพิ่มกิจกรรม" เพื่อวางแผนของวันนี้'}>
      <Pressable accessibilityRole="button" onPress={onAdd} style={({ pressed }) => ({ height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: pressed ? t.rail : t.track, flexDirection: 'row', alignItems: 'center', gap: 6 })}>
        <SvgIcon name="plus" size={16} color={t.ink} strokeWidth={2.2} />
        <Txt size={14} weight="bold">
          เพิ่มกิจกรรม
        </Txt>
      </Pressable>
    </EmptyState>
  );
}
