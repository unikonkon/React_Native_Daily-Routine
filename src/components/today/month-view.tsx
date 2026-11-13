// มุมมองเดือน (ระบบ B1) — หัว/ไอคอนมุมมอง/แถบล่างอยู่ที่แท็บวันนี้ (index)
// ปฏิทินเลื่อนต่อเนื่องแนวตั้ง: เดือนก่อน/ถัดไปเรียงต่อกัน · แถวชื่อวัน + ชิปกรองหมวดปักไว้ด้านบน
//   เลื่อนแล้วหัวจอเปลี่ยนชื่อเดือนตาม (onVisibleMonth) · ปุ่ม ‹ › / "วันนี้" ที่แถบล่าง = เลื่อนไปเดือนนั้น
//   ถือไว้ทีละช่วง ±SPAN เดือน — เลื่อนใกล้ขอบช่วง → ขยับช่วงตาม (ชดเชยตำแหน่งให้ภาพไม่กระโดด)
//   ข้อมูลรายวัน (จุดหมวด/แถบ %) คำนวณเฉพาะเดือนใกล้จอ (±LIVE) · ช่องวันวาดเฉพาะเดือนใกล้จอ (±CELLS)
//   เดือนที่ไกลกว่านั้นเป็นแค่ชื่อเดือน + ที่ว่างสูงเท่าจริง (ความสูงช่องคงที่) — เปิดมุมมองเดือนจึงไม่ต้องสร้างช่องวัน 13 เดือน
// แตะวันครั้งแรก = เลือก → การ์ดรายการกางใต้สัปดาห์นั้น · แตะซ้ำ / "เปิดมุมมองวัน" = เข้ามุมมองวัน
import React, { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from 'react-native';

import { Rail } from '@/components/b1/rail';
import { FadeInView } from '@/components/motion';
import { useNow } from '@/components/b1/use-now';
import { useToggleStatus } from '@/components/b1/use-toggle';
import { SvgIcon } from '@/components/svg-icon';
import { Txt, pressFade, useTokens } from '@/components/ui';
import { ATTN, CATS, CAT_BY_ID, GREEN, type CatId } from '@/constants/theme';
import { MONTH_TH_FULL, VIEW_MAX_Y, VIEW_MIN_Y, WD_TH, addDays, beYear, fromISO, hoursText, mondayOf, thaiDate, toISO } from '@/lib/dates';
import { daytimeFreeSlots, freeMinutes } from '@/lib/engine';
import { dayProgress, type NowRef } from '@/lib/progress';
import type { DayItem, FreeSlot } from '@/lib/types';
import { useDayReader, useNotes } from '@/stores/activities';

/** จำนวนเดือนก่อน/หลังเดือนกลางที่วางไว้ในรายการ */
const SPAN = 6;
/** เดือนที่ห่างจากเดือนบนจอไม่เกินเท่านี้ ถึงคำนวณข้อมูลรายวัน */
const LIVE = 1;
/** เดือนที่ห่างจากเดือนบนจอไม่เกินเท่านี้ ถึงวาดช่องวัน (จอเห็นราว 2 เดือน — ±2 เผื่อเลื่อนเร็ว) */
const CELLS = 2;
/** ความสูงของแถวสัปดาห์ (= ความสูงช่องวัน) — ใช้คำนวณที่ว่างของเดือนที่ยังไม่วาดช่อง */
const ROW_H = 62;
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
  // ไม่ให้ React Compiler จัดการ memo ของคอมโพเนนต์นี้: มันถอด useCallback ด้านล่างออกแล้วไม่จำฟังก์ชันให้ (โค้ดส่วนนี้แตะ ref เยอะ)
  // ทำให้ทุกเดือน/ทุกช่องวันได้ callback ตัวใหม่ทุกครั้งและถูกวาดใหม่หมด — ที่นี่จึง memo เองตามที่เขียนไว้
  'use no memo';
  const t = useTokens();
  const getDay = useDayReader();
  const notes = useNotes();
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
  // callback ที่ส่งให้ทุกเดือน/ทุกช่องวันต้องเป็นตัวเดิมข้ามการวาด (MonthBlock/MonthCell ห่อ memo) — ไม่งั้นแตะวันเดียวหรือ
  // สลับมุมมองทีหนึ่ง ช่องวันทุกช่องของทุกเดือนถูกคิดใหม่หมด · วันที่เลือกอยู่อ่านจาก ref ตอนแตะ (ไม่ผูกฟังก์ชันกับ state)
  const pickedRef = useRef(picked);
  useEffect(() => {
    pickedRef.current = picked;
  }, [picked]);
  const onCellPress = useCallback((d: string) => (pickedRef.current === d ? onPressDay(d) : setPicked(d)), [onPressDay]);
  const closeCard = useCallback(() => setPicked(null), []);
  const noteOf = useCallback((it: DayItem) => notes[it.date]?.[it.id], [notes]);

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
              cells={Math.abs(k - visK) <= CELLS || k === pickedK}
              current={k === visK}
              picked={k === pickedK ? picked : null}
              catFilter={catFilter}
              freeMode={freeMode}
              today={now.date}
              // เวลา/ข้อมูลรายวันส่งให้เฉพาะเดือนที่คำนวณจริง — เดือนอื่นจึงไม่ถูกคิดใหม่ทุกนาทีหรือทุกครั้งที่ติ๊กรายการ
              now={Math.abs(k - visK) <= LIVE || k === pickedK ? now : null}
              getDay={Math.abs(k - visK) <= LIVE || k === pickedK ? getDay : null}
              noteOf={k === pickedK ? noteOf : null}
              onCellPress={onCellPress}
              onOpenDay={onPressDay}
              onClose={closeCard}
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
  /** วาดช่องวัน — false = เดือนไกลจอ วาดแค่ชื่อเดือน + ที่ว่างสูงเท่าจริง */
  cells: boolean;
  /** เดือนบนจอ — ชื่อเดือนเป็นสีเข้ม */
  current: boolean;
  /** วันที่เลือกไว้ (เฉพาะเมื่ออยู่ในเดือนนี้) */
  picked: string | null;
  catFilter: CatId | null;
  freeMode: boolean;
  today: string;
  /** เวลาปัจจุบัน / ตัวอ่านข้อมูลรายวัน — มีเฉพาะเดือนที่ live (null = เดือนไกลจอ) */
  now: NowRef | null;
  getDay: ((d: string) => DayItem[]) | null;
  /** โน้ตของรายการ — ใช้กับการ์ดวันที่เลือก (null = เดือนนี้ไม่มีการ์ด) */
  noteOf: ((it: DayItem) => string | undefined) | null;
  onCellPress: (d: string) => void;
  onOpenDay: (d: string) => void;
  onClose: () => void;
  onPressItem: (it: DayItem) => void;
  onPressSlot?: (date: string, start: number, end: number) => void;
  onToggle: ReturnType<typeof useToggleStatus>;
}

const NO_ITEMS: DayItem[] = [];
const NO_FREE: FreeSlot[] = [];
const NO_NOTE = () => undefined;

/** เดือนหนึ่งในปฏิทินต่อเนื่อง — ชื่อเดือน + สัปดาห์ (ช่องของเดือนอื่นเว้นว่าง) · การ์ดวันที่เลือกกางใต้สัปดาห์นั้น */
const MonthBlock = memo(function MonthBlock({ k, live, cells, current, picked, catFilter, freeMode, today, now, getDay, noteOf, onCellPress, onOpenDay, onClose, onPressItem, onPressSlot, onToggle }: MonthBlockProps) {
  const t = useTokens();
  const { y, m } = fromK(k);
  const first = toISO(new Date(y, m, 1));
  const last = toISO(new Date(y, m + 1, 0));
  const ymKey = first.slice(0, 7);
  const weeks: string[][] = [];
  // w ถูกเปลี่ยนค่าในลูป — ส่งสำเนา (mon) เข้า lambda แทน ไม่งั้น React Compiler ข้ามทั้งคอมโพเนนต์
  for (let w = mondayOf(first); w <= last; w = addDays(w, 7)) {
    const mon = w;
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(mon, i)));
  }
  const dayOf = (d: string): DayItem[] => {
    if (!live || !getDay) return NO_ITEMS;
    const list = getDay(d);
    return catFilter ? list.filter((i) => i.cat === catFilter) : list;
  };
  const isNowMonth = today.slice(0, 7) === ymKey;

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
      {!cells ? <View style={{ height: weeks.length * ROW_H }} /> : null}
      {(cells ? weeks : []).map((week) => (
        <React.Fragment key={week[0]}>
          <View style={{ flexDirection: 'row', paddingHorizontal: 8 }}>
            {week.map((d) => {
              if (d.slice(0, 7) !== ymKey) return <View key={d} style={{ flex: 1 }} />;
              const items = dayOf(d);
              const p = now ? dayProgress(items, now) : null;
              const started = !!p && d <= today && p.total > 0;
              return (
                <MonthCell
                  key={d}
                  d={d}
                  day={Number(d.slice(8))}
                  isToday={d === today}
                  isSel={d === picked}
                  live={live}
                  count={items.length}
                  // จุดสีหมวด ≤3 — ส่งเป็นข้อความ (id คั่นด้วย ,) ให้เทียบค่าได้ตรง ๆ ช่องที่ข้อมูลเหมือนเดิมไม่ถูกวาดใหม่
                  cats={[...new Set(items.map((i) => i.cat))].slice(0, 3).join(',')}
                  pct={started && p ? Math.round(p.rate * 100) : -1}
                  freeMin={live && freeMode && getDay ? freeMinutes(daytimeFreeSlots(getDay(d))) : 0}
                  freeMode={freeMode}
                  dim={!!catFilter && live && !items.length}
                  onPress={onCellPress}
                />
              );
            })}
          </View>
          {picked && now && getDay && week.includes(picked) ? (
            <DayCard
              key={picked}
              date={picked}
              items={dayOf(picked)}
              free={freeMode ? daytimeFreeSlots(getDay(picked)) : NO_FREE}
              catFilter={catFilter}
              now={now}
              noteOf={noteOf ?? NO_NOTE}
              onOpenDay={onOpenDay}
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
});

interface MonthCellProps {
  d: string;
  day: number;
  isToday: boolean;
  isSel: boolean;
  live: boolean;
  count: number;
  cats: string;
  /** % ทำเสร็จของวัน (0–100) · -1 = ยังไม่มีแถบ (วันอนาคต/ไม่มีรายการ) */
  pct: number;
  freeMin: number;
  freeMode: boolean;
  dim: boolean;
  onPress: (d: string) => void;
}

/** ช่องวันในปฏิทินเดือน — รับเฉพาะค่าพื้นฐาน (เทียบเท่ากันได้ตรง ๆ) ห่อ memo: ติ๊กรายการวันเดียว ช่องอื่นไม่ถูกวาดใหม่ */
const MonthCell = memo(function MonthCell({ d, day, isToday, isSel, live, count, cats, pct, freeMin, freeMode, dim, onPress }: MonthCellProps) {
  const t = useTokens();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isSel }}
      accessibilityLabel={`${thaiDate(d)}${live ? ` · ${count} รายการ` : ''}${pct >= 0 ? ` · ทำแล้ว ${pct}%` : ''}`}
      onPress={() => onPress(d)}
      style={pressFade({ flex: 1, height: ROW_H, paddingTop: 4, alignItems: 'center', gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line, opacity: dim ? 0.4 : 1 })}>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isSel ? t.ink : 'transparent',
          borderWidth: isToday && !isSel ? 1.5 : 0,
          borderColor: t.accent,
        }}>
        <Txt size={15} num weight={isSel || isToday ? 'bold' : 'reg'} color={isSel ? t.bg : t.ink}>
          {day}
        </Txt>
      </View>
      {freeMode ? (
        freeMin > 0 ? (
          <Txt size={10.5} num weight="med" color={GREEN}>
            {hoursText(freeMin)}
          </Txt>
        ) : null
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 3, height: 6 }}>
            {(cats ? (cats.split(',') as CatId[]) : []).map((cid) => (
              <View key={cid} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: CAT_BY_ID[cid].color }} />
            ))}
          </View>
          <View style={{ width: 18, height: 3, borderRadius: 2, backgroundColor: pct >= 0 ? t.rail : 'transparent', overflow: 'hidden' }}>
            {pct >= 0 ? <View style={{ width: `${pct}%`, height: 3, backgroundColor: pct >= 80 ? GREEN : ATTN }} /> : null}
          </View>
        </>
      )}
    </Pressable>
  );
});

/** การ์ดรายการของวันที่เลือก — กางใต้สัปดาห์ของวันนั้น · ✕ = พับ · "เปิดมุมมองวัน" = เข้ามุมมองวัน */
const DayCard = memo(function DayCard({
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
  onOpenDay: (d: string) => void;
  onClose: () => void;
  onPressItem: (it: DayItem) => void;
  onPressSlot?: (date: string, start: number, end: number) => void;
  onToggle: ReturnType<typeof useToggleStatus>;
}) {
  const t = useTokens();
  const dp = dayProgress(items, now);
  // ตั้งชื่อไว้ (ไม่เขียนฝังใน JSX) — Rail ห่อ memo ต้องได้ฟังก์ชันตัวเดิมถึงจะข้ามการคิดซ้ำได้
  const pressSlot = useCallback((s: FreeSlot) => onPressSlot?.(date, s.start, s.end), [onPressSlot, date]);
  return (
    // เลือกวัน → การ์ดจางเข้า + ลอยลงมาจากแถวสัปดาห์ (key ตามวัน — เลือกวันอื่นในสัปดาห์เดียวกันก็เล่นใหม่)
    <FadeInView rise={-8} duration={220}>
    <View style={{ marginHorizontal: 12, marginTop: 4, marginBottom: 10, backgroundColor: t.card, borderRadius: 20, paddingTop: 12, paddingBottom: 4, shadowColor: t.shadow, shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
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
          onPress={() => onOpenDay(date)}
          style={({ pressed }) => ({ height: 36, paddingLeft: 12, paddingRight: 8, borderRadius: 18, backgroundColor: pressed ? t.rail : t.track, flexDirection: 'row', alignItems: 'center', gap: 2 })}>
          <Txt size={12.5} weight="med">
            เปิดมุมมองวัน
          </Txt>
          <SvgIcon name="chevR" size={14} color={t.sub} strokeWidth={2.2} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="พับรายการ" onPress={onClose} hitSlop={6} style={pressFade({ width: 36, height: 36, borderRadius: 18, backgroundColor: t.track, alignItems: 'center', justifyContent: 'center' })}>
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
            onPressSlot={onPressSlot ? pressSlot : undefined}
            noteOf={noteOf}
            nextCardBg={t.bg}
          />
        </View>
      ) : (
        <View style={{ height: 10 }} />
      )}
    </View>
    </FadeInView>
  );
});

function FilterChip({ label, color, on, onPress }: { label: string; color?: string; on: boolean; onPress: () => void }) {
  const t = useTokens();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={pressFade({ height: 34, paddingHorizontal: 13, borderRadius: 17, backgroundColor: on ? t.ink : t.track, flexDirection: 'row', alignItems: 'center', gap: 6 })}>
      {color ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /> : null}
      <Txt size={13} weight={on ? 'bold' : 'med'} color={on ? t.bg : t.sub}>
        {label}
      </Txt>
    </Pressable>
  );
}
