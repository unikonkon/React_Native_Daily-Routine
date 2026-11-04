// มุมมองเดือน (ระบบ B1) — หัว/ไอคอนมุมมอง/แถบล่างอยู่ที่แท็บวันนี้ (index)
// ปฏิทินเลื่อนต่อเนื่องแนวตั้ง: เดือนก่อน/ถัดไปเรียงต่อกัน · แถวชื่อวัน + ชิปกรองหมวดปักไว้ด้านบน
//   เลื่อนแล้วหัวจอเปลี่ยนชื่อเดือนตาม (onVisibleMonth) · ปุ่ม ‹ › / "วันนี้" ที่แถบล่าง = เลื่อนไปเดือนนั้น
//   ถือไว้ทีละช่วง ±SPAN เดือน — เลื่อนใกล้ขอบช่วง → ขยับช่วงตาม (ชดเชยตำแหน่งให้ภาพไม่กระโดด)
//   ข้อมูลรายวัน (จุดหมวด/แถบ %) คำนวณเฉพาะเดือนใกล้จอ — เดือนไกล ๆ โชว์แค่เลขวัน (cache รายวันจุได้ 500 วัน)
// แตะวันครั้งแรก = เลือก → การ์ดรายการกางใต้สัปดาห์นั้น · แตะซ้ำ / "เปิดมุมมองวัน" = เข้ามุมมองวัน
import React, { useLayoutEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from 'react-native';

import { Rail } from '@/components/b1/rail';
import { useNow } from '@/components/b1/use-now';
import { useToggleStatus } from '@/components/b1/use-toggle';
import { SvgIcon } from '@/components/svg-icon';
import { Txt, useTokens } from '@/components/ui';
import { CATS, CAT_BY_ID, GREEN, type CatId } from '@/constants/theme';
import { MONTH_TH_FULL, VIEW_MAX_Y, VIEW_MIN_Y, WD_TH, addDays, beYear, fromISO, hoursText, mondayOf, thaiDate, toISO } from '@/lib/dates';
import { daytimeFreeSlots, freeMinutes } from '@/lib/engine';
import { dayProgress, type NowRef } from '@/lib/progress';
import type { DayItem, FreeSlot } from '@/lib/types';
import { useActivities, useDayReader } from '@/stores/activities';

/** จำนวนเดือนก่อน/หลังเดือนกลางที่วางไว้ในรายการ */
const SPAN = 6;
/** เดือนที่ห่างจากเดือนบนจอไม่เกินเท่านี้ ถึงคำนวณข้อมูลรายวัน */
const LIVE = 1;
const MIN_K = VIEW_MIN_Y * 12;
const MAX_K = VIEW_MAX_Y * 12 + 11;
/** เส้นอ้างอิงจากขอบบนของรายการ — เดือนที่คร่อมเส้นนี้ = เดือนบนจอ */
const PROBE_Y = 48;

const toK = (y: number, m: number) => y * 12 + m;
const fromK = (k: number) => ({ y: Math.floor(k / 12), m: k % 12 });
const clampK = (k: number) => Math.min(Math.max(k, MIN_K), MAX_K);

interface MonthViewProps {
  year: number;
  month: number; // 0-based
  selected: string;
  onPressDay: (iso: string) => void;
  /** เดือนที่อยู่บนจอเปลี่ยนจากการเลื่อน — ให้หัวจอเปลี่ยนชื่อเดือนตาม */
  onVisibleMonth: (ym: { y: number; m: number }) => void;
  bottomPad: number;
  /** โหมด "วันที่ว่าง" — ช่องวันโชว์ชั่วโมงว่าง · การ์ดแทรกช่วงว่างให้แตะเพิ่ม */
  freeMode?: boolean;
  onPressSlot?: (date: string, start: number, end: number) => void;
  onPressItem: (item: DayItem) => void;
}

export function TodayMonthView({ year, month, selected, onPressDay, onVisibleMonth, bottomPad, freeMode = false, onPressSlot, onPressItem }: MonthViewProps) {
  const t = useTokens();
  const getDay = useDayReader();
  const notes = useActivities((s) => s.notes);
  const toggle = useToggleStatus();
  const now = useNow();

  const propK = toK(year, month);
  const [center, setCenter] = useState(propK);
  /** เดือนบนจอ (ล่าสุดที่รายงานขึ้นไป หรือที่ถูกสั่งให้ไป) */
  const [visK, setVisK] = useState(propK);
  /**
   * คำสั่งเลื่อนไปเดือน k — n เพิ่มทุกครั้งให้ effect ทำงานแม้เดือนเดิม
   * wait = คำสั่งนี้ขยับช่วงเดือนด้วย (ตำแหน่งที่วัดไว้ใช้ไม่ได้แล้ว) → รอ onLayout ของเดือนเป้าหมายก่อนค่อยเลื่อน
   */
  const [jump, setJump] = useState({ k: propK, offset: 0, animated: false, n: 0, wait: false });

  // เดือนจากภายนอกเปลี่ยน (‹ › / วันนี้ / เลือกเดือนในมุมมองปี) และไม่ใช่เดือนที่เราเพิ่งรายงาน → เลื่อนไปหา
  const [lastProp, setLastProp] = useState(propK);
  if (propK !== lastProp) {
    setLastProp(propK);
    if (propK !== visK) {
      setVisK(propK);
      // ขยับช่วงแล้วขอบบนเปลี่ยน = เดือนด้านบนเพิ่ม/หาย → ตำแหน่งเดิมของทุกเดือนผิดหมด ต้องรอวัดใหม่
      const recenter = Math.abs(propK - center) > SPAN - 1;
      const wait = recenter && clampK(propK - SPAN) !== clampK(center - SPAN);
      if (recenter) setCenter(propK);
      setJump((j) => ({ k: propK, offset: 0, animated: Math.abs(propK - visK) <= 3, n: j.n + 1, wait }));
    }
  }

  const from = clampK(center - SPAN);
  const to = clampK(center + SPAN);
  const months = Array.from({ length: to - from + 1 }, (_, i) => from + i);

  const scRef = useRef<ScrollViewInstance>(null);
  const tops = useRef(new Map<number, number>());
  const scrollY = useRef(0);
  /** รอวัดตำแหน่งเดือนเป้าหมายก่อนเลื่อน */
  const pending = useRef<{ k: number; offset: number; animated: boolean } | null>(null);
  const go = (k: number, offset: number, animated: boolean) => {
    const y = tops.current.get(k);
    if (y == null) return false;
    scRef.current?.scrollTo({ y: Math.max(y + offset, 0), animated });
    return true;
  };
  // layout effect: ตั้ง pending ให้ทันก่อน onLayout ของช่วงใหม่จะเข้ามา
  useLayoutEffect(() => {
    if (jump.wait || !go(jump.k, jump.offset, jump.animated)) pending.current = jump;
  }, [jump]);

  const onMonthLayout = (k: number, y: number) => {
    tops.current.set(k, y);
    const p = pending.current;
    if (p && p.k === k) {
      pending.current = null;
      go(k, p.offset, p.animated);
    }
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    scrollY.current = y;
    if (pending.current) return; // กำลังรอเลื่อนไปเดือนเป้าหมาย — ยังไม่สรุปเดือนบนจอ
    let k = months[0];
    for (const mk of months) {
      const top = tops.current.get(mk);
      if (top != null && top <= y + PROBE_Y) k = mk;
    }
    if (k !== visK) {
      setVisK(k);
      onVisibleMonth(fromK(k));
    }
    // ใกล้ขอบช่วง → ขยับช่วงให้เดือนบนจออยู่กลาง แล้วชดเชยตำแหน่ง (เดือนด้านบนเพิ่ม/หายทำให้เนื้อหาเลื่อน)
    if ((k - from < 2 && from > MIN_K) || (to - k < 2 && to < MAX_K)) {
      const nextFrom = clampK(k - SPAN);
      const nextTo = clampK(k + SPAN);
      // ชดเชยตำแหน่งเฉพาะเมื่อขอบบนเปลี่ยน — ขอบบนติดปีแรก (VIEW_MIN_Y) ตำแหน่งเดือนไม่ขยับ onLayout จะไม่มา
      // ถ้าตั้ง pending ไว้ จะค้างตลอด (หัวเดือนไม่อัปเดต · เลื่อนต่อไม่ได้)
      if (nextFrom !== from) {
        const top = tops.current.get(k) ?? 0;
        pending.current = { k, offset: y - top, animated: false };
      }
      for (const mk of [...tops.current.keys()]) if (mk < nextFrom || mk > nextTo) tops.current.delete(mk);
      setCenter(k);
    }
  };

  const [picked, setPicked] = useState<string | null>(selected);
  const onCellPress = (d: string) => (picked === d ? onPressDay(d) : setPicked(d));

  const [catFilter, setCatFilter] = useState<CatId | null>(null);
  const pickedK = picked ? toK(fromISO(picked).getFullYear(), fromISO(picked).getMonth()) : null;

  return (
    <View style={{ flex: 1, paddingTop: 3, paddingBottom: 2 }}>
      {/* ชิปกรองหมวด — "ทั้งหมด" นำ · แตะหมวด = ดูเฉพาะหมวดนั้นทั้งปฏิทินและการ์ด */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 18, paddingTop: 4, paddingBottom: 6 }}>
        <FilterChip label="ทั้งหมด" on={!catFilter} onPress={() => setCatFilter(null)} />
        {CATS.map((c) => (
          <FilterChip key={c.id} label={c.short} color={c.color} on={catFilter === c.id} onPress={() => setCatFilter(catFilter === c.id ? null : c.id)} />
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', paddingHorizontal: 8, paddingTop: 4, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line }}>
        {WD_TH.map((w) => (
          <Txt key={w} size={11.5} color={t.sub} style={{ flex: 1, textAlign: 'center' }}>
            {w}
          </Txt>
        ))}
      </View>

      <ScrollView ref={scRef} onScroll={onScroll} scrollEventThrottle={32} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>
        {months.map((k) => (
          <View key={k} onLayout={(e) => onMonthLayout(k, e.nativeEvent.layout.y)}>
            <MonthBlock
              k={k}
              live={Math.abs(k - visK) <= LIVE || k === pickedK}
              current={k === visK}
              picked={k === pickedK ? picked : null}
              catFilter={catFilter}
              freeMode={freeMode}
              now={now}
              getDay={getDay}
              noteOf={(it) => notes[it.date]?.[it.id]}
              onCellPress={onCellPress}
              onOpenDay={onPressDay}
              onClose={() => setPicked(null)}
              onPressItem={onPressItem}
              onPressSlot={onPressSlot}
              onToggle={toggle}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

interface MonthBlockProps {
  k: number;
  /** คำนวณข้อมูลรายวัน (เดือนใกล้จอ) — false = โชว์แค่เลขวัน */
  live: boolean;
  /** เดือนบนจอ — ชื่อเดือนเป็นสีเข้ม */
  current: boolean;
  /** วันที่เลือกไว้ (เฉพาะเมื่ออยู่ในเดือนนี้) */
  picked: string | null;
  catFilter: CatId | null;
  freeMode: boolean;
  now: NowRef;
  getDay: (d: string) => DayItem[];
  noteOf: (it: DayItem) => string | undefined;
  onCellPress: (d: string) => void;
  onOpenDay: (d: string) => void;
  onClose: () => void;
  onPressItem: (it: DayItem) => void;
  onPressSlot?: (date: string, start: number, end: number) => void;
  onToggle: ReturnType<typeof useToggleStatus>;
}

/** เดือนหนึ่งในปฏิทินต่อเนื่อง — ชื่อเดือน + สัปดาห์ (ช่องของเดือนอื่นเว้นว่าง) · การ์ดวันที่เลือกกางใต้สัปดาห์นั้น */
function MonthBlock({ k, live, current, picked, catFilter, freeMode, now, getDay, noteOf, onCellPress, onOpenDay, onClose, onPressItem, onPressSlot, onToggle }: MonthBlockProps) {
  const t = useTokens();
  const { y, m } = fromK(k);
  const first = toISO(new Date(y, m, 1));
  const last = toISO(new Date(y, m + 1, 0));
  const ymKey = first.slice(0, 7);
  const weeks: string[][] = [];
  for (let w = mondayOf(first); w <= last; w = addDays(w, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)));
  const filt = (list: DayItem[]) => (catFilter ? list.filter((i) => i.cat === catFilter) : list);
  const isNowMonth = now.date.slice(0, 7) === ymKey;

  return (
    <View style={{ paddingTop: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingHorizontal: 18, paddingBottom: 6 }}>
        <Txt size={16} weight="bold" color={isNowMonth ? t.accentInk : current ? t.ink : t.sub}>
          {MONTH_TH_FULL[m]}
        </Txt>
        <Txt size={13} num color={t.muted}>
          {beYear(y)}
        </Txt>
      </View>
      {weeks.map((week) => (
        <React.Fragment key={week[0]}>
          <View style={{ flexDirection: 'row', paddingHorizontal: 8 }}>
            {week.map((d) => {
              if (d.slice(0, 7) !== ymKey) return <View key={d} style={{ flex: 1 }} />;
              const isToday = d === now.date;
              const isSel = d === picked;
              const items = live ? filt(getDay(d)) : [];
              const p = dayProgress(items, now);
              const cats = [...new Set(items.map((i) => i.cat))].slice(0, 3);
              const cellFree = live && freeMode ? freeMinutes(daytimeFreeSlots(getDay(d))) : 0;
              const started = d <= now.date && p.total > 0;
              return (
                <Pressable
                  key={d}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSel }}
                  accessibilityLabel={`${thaiDate(d)}${live ? ` · ${items.length} รายการ` : ''}${started ? ` · ทำแล้ว ${Math.round(p.rate * 100)}%` : ''}`}
                  onPress={() => onCellPress(d)}
                  style={{ flex: 1, height: 62, paddingTop: 4, alignItems: 'center', gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line, opacity: catFilter && live && !items.length ? 0.4 : 1 }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isSel ? t.ink : 'transparent',
                      borderWidth: isToday && !isSel ? 1.5 : 0,
                      borderColor: '#D2603A',
                    }}>
                    <Txt size={15} num weight={isSel || isToday ? 'bold' : 'reg'} color={isSel ? t.bg : t.ink}>
                      {fromISO(d).getDate()}
                    </Txt>
                  </View>
                  {freeMode ? (
                    cellFree > 0 ? (
                      <Txt size={10.5} num weight="med" color={GREEN}>
                        {hoursText(cellFree)}
                      </Txt>
                    ) : null
                  ) : (
                    <>
                      <View style={{ flexDirection: 'row', gap: 3, height: 6 }}>
                        {cats.map((cid) => (
                          <View key={cid} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: CAT_BY_ID[cid].color }} />
                        ))}
                      </View>
                      <View style={{ width: 18, height: 3, borderRadius: 2, backgroundColor: started ? t.rail : 'transparent', overflow: 'hidden' }}>
                        {started ? <View style={{ width: `${Math.round(p.rate * 100)}%`, height: 3, backgroundColor: p.rate >= 0.8 ? GREEN : '#D2603A' }} /> : null}
                      </View>
                    </>
                  )}
                </Pressable>
              );
            })}
          </View>
          {picked && week.includes(picked) ? (
            <DayCard
              date={picked}
              items={filt(getDay(picked))}
              free={freeMode ? daytimeFreeSlots(getDay(picked)) : []}
              catFilter={catFilter}
              now={now}
              noteOf={noteOf}
              onOpenDay={() => onOpenDay(picked)}
              onClose={onClose}
              onPressItem={onPressItem}
              onPressSlot={onPressSlot}
              onToggle={onToggle}
            />
          ) : null}
        </React.Fragment>
      ))}
    </View>
  );
}

/** การ์ดรายการของวันที่เลือก — กางใต้สัปดาห์ของวันนั้น · ✕ = พับ · "เปิดมุมมองวัน" = เข้ามุมมองวัน */
function DayCard({
  date,
  items,
  free,
  catFilter,
  now,
  noteOf,
  onOpenDay,
  onClose,
  onPressItem,
  onPressSlot,
  onToggle,
}: {
  date: string;
  items: DayItem[];
  free: FreeSlot[];
  catFilter: CatId | null;
  now: NowRef;
  noteOf: (it: DayItem) => string | undefined;
  onOpenDay: () => void;
  onClose: () => void;
  onPressItem: (it: DayItem) => void;
  onPressSlot?: (date: string, start: number, end: number) => void;
  onToggle: ReturnType<typeof useToggleStatus>;
}) {
  const t = useTokens();
  const dp = dayProgress(items, now);
  return (
    <View style={{ marginHorizontal: 12, marginTop: 4, marginBottom: 10, backgroundColor: t.card, borderRadius: 16, paddingTop: 12, paddingBottom: 4, shadowColor: '#221C13', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 10, marginBottom: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt size={15} weight="bold" numberOfLines={1}>
            {thaiDate(date)}
            {date === now.date ? ' · วันนี้' : ''}
          </Txt>
          <Txt size={12.5} color={t.sub}>
            {items.length ? `${items.length} รายการ · ทำแล้ว ${dp.done}` : catFilter ? `ไม่มีรายการหมวด${CAT_BY_ID[catFilter].short}` : 'ไม่มีรายการ'}
            {dp.overdue ? <Txt size={12.5} weight="bold" color={t.warn}>{` · ค้างบันทึก ${dp.overdue}`}</Txt> : null}
          </Txt>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onOpenDay}
          style={({ pressed }) => ({ height: 36, paddingLeft: 12, paddingRight: 8, borderRadius: 18, backgroundColor: pressed ? t.rail : t.track, flexDirection: 'row', alignItems: 'center', gap: 2 })}>
          <Txt size={12.5} weight="med">
            เปิดมุมมองวัน
          </Txt>
          <SvgIcon name="chevR" size={14} color={t.sub} strokeWidth={2.2} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="พับรายการ" onPress={onClose} hitSlop={6} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.track, alignItems: 'center', justifyContent: 'center' }}>
          <SvgIcon name="x" size={14} color={t.sub} strokeWidth={2.4} />
        </Pressable>
      </View>
      {items.length || free.length ? (
        <View style={{ paddingLeft: 6, paddingRight: 14 }}>
          <Rail
            items={items}
            now={now}
            free={free}
            showNow={date === now.date}
            onPressItem={onPressItem}
            onToggle={onToggle}
            onPressSlot={onPressSlot ? (s) => onPressSlot(date, s.start, s.end) : undefined}
            noteOf={noteOf}
            nextCardBg={t.bg}
          />
        </View>
      ) : (
        <View style={{ height: 10 }} />
      )}
    </View>
  );
}

function FilterChip({ label, color, on, onPress }: { label: string; color?: string; on: boolean; onPress: () => void }) {
  const t = useTokens();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{ height: 34, paddingHorizontal: 13, borderRadius: 17, backgroundColor: on ? t.ink : t.track, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {color ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /> : null}
      <Txt size={13} weight={on ? 'bold' : 'med'} color={on ? t.bg : t.sub}>
        {label}
      </Txt>
    </Pressable>
  );
}
