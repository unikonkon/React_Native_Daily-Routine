// มุมมองเดือน (ระบบ B1) — หัว/ไอคอนมุมมอง/แถบล่างอยู่ที่แท็บวันนี้ (index)
// ตาราง 7×6: เลขวัน + จุดสีหมวด + แถบ % ทำเสร็จ · ชิปกรองหมวด (เริ่มด้วย "ทั้งหมด")
// การ์ดวันที่เลือกใช้รางเดียวกับมุมมองวัน · แตะวันครั้งแรก = เลือก · แตะซ้ำ / "เปิดมุมมองวัน" = เข้ามุมมองวัน
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Rail } from '@/components/b1/rail';
import { useNow } from '@/components/b1/use-now';
import { useToggleStatus } from '@/components/b1/use-toggle';
import { SvgIcon } from '@/components/svg-icon';
import { Txt, useTokens } from '@/components/ui';
import { CATS, CAT_BY_ID, GREEN, type CatId } from '@/constants/theme';
import { WD_TH, addDays, fromISO, hoursText, mondayOf, thaiDate, toISO } from '@/lib/dates';
import { daytimeFreeSlots, freeMinutes } from '@/lib/engine';
import { dayProgress } from '@/lib/progress';
import type { DayItem } from '@/lib/types';
import { useActivities, useDayReader } from '@/stores/activities';

interface MonthViewProps {
  year: number;
  month: number; // 0-based
  selected: string;
  onPressDay: (iso: string) => void;
  bottomPad: number;
  /** โหมด "วันที่ว่าง" — ช่องวันโชว์ชั่วโมงว่าง · การ์ดแทรกช่วงว่างให้แตะเพิ่ม */
  freeMode?: boolean;
  onPressSlot?: (date: string, start: number, end: number) => void;
  onPressItem: (item: DayItem) => void;
}

export function TodayMonthView({ year, month, selected, onPressDay, bottomPad, freeMode = false, onPressSlot, onPressItem }: MonthViewProps) {
  const t = useTokens();
  const getDay = useDayReader();
  const notes = useActivities((s) => s.notes);
  const toggle = useToggleStatus();
  const now = useNow();
  const first = toISO(new Date(year, month, 1));
  const ymKey = first.slice(0, 7);
  const start = mondayOf(first);
  const rows = Array.from({ length: 6 }, (_, r) => Array.from({ length: 7 }, (_, c) => addDays(start, r * 7 + c)));

  const [picked, setPicked] = useState<string | null>(selected);
  const onCellPress = (d: string) => (picked === d ? onPressDay(d) : setPicked(d));

  const [catFilter, setCatFilter] = useState<CatId | null>(null);
  const filt = (list: DayItem[]) => (catFilter ? list.filter((i) => i.cat === catFilter) : list);

  const pickedInMonth = picked != null && picked.slice(0, 7) === ymKey;
  const dayItems = pickedInMonth ? filt(getDay(picked!)) : [];
  const dp = dayProgress(dayItems, now);
  const freeList = pickedInMonth && freeMode ? daytimeFreeSlots(getDay(picked!)) : [];

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', paddingHorizontal: 8, paddingTop: 8, paddingBottom: 6 }}>
        {WD_TH.map((w) => (
          <Txt key={w} size={11.5} color={t.sub} style={{ flex: 1, textAlign: 'center' }}>
            {w}
          </Txt>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>
        <View style={{ paddingHorizontal: 8 }}>
          {rows.map((week, r) => (
            <View key={r} style={{ flexDirection: 'row' }}>
              {week.map((d) => {
                const inMonth = d.slice(0, 7) === ymKey;
                const isToday = d === now.date;
                const isSel = d === picked && inMonth;
                const items = inMonth ? filt(getDay(d)) : [];
                const p = dayProgress(items, now);
                const cats = [...new Set(items.map((i) => i.cat))].slice(0, 3);
                const cellFree = inMonth && freeMode ? freeMinutes(daytimeFreeSlots(getDay(d))) : 0;
                const started = d <= now.date && p.total > 0;
                return (
                  <Pressable
                    key={d}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSel }}
                    accessibilityLabel={`${thaiDate(d)} · ${items.length} รายการ${started ? ` · ทำแล้ว ${Math.round(p.rate * 100)}%` : ''}`}
                    disabled={!inMonth}
                    onPress={() => onCellPress(d)}
                    style={{ flex: 1, minHeight: 62, paddingTop: 4, alignItems: 'center', gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line, opacity: catFilter && inMonth && !items.length ? 0.4 : 1 }}>
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
                      <Txt size={15} num weight={isSel || isToday ? 'bold' : 'reg'} color={isSel ? t.bg : inMonth ? t.ink : t.faint}>
                        {fromISO(d).getDate()}
                      </Txt>
                    </View>
                    {freeMode ? (
                      inMonth && cellFree > 0 ? (
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
                        {inMonth ? (
                          <View style={{ width: 18, height: 3, borderRadius: 2, backgroundColor: started ? t.rail : 'transparent', overflow: 'hidden' }}>
                            {started ? <View style={{ width: `${Math.round(p.rate * 100)}%`, height: 3, backgroundColor: p.rate >= 0.8 ? GREEN : '#D2603A' }} /> : null}
                          </View>
                        ) : null}
                      </>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        {/* ชิปกรองหมวด — "ทั้งหมด" นำ · แตะหมวด = ดูเฉพาะหมวดนั้นทั้งปฏิทินและการ์ด */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 18, paddingTop: 12 }}>
          <FilterChip label="ทั้งหมด" on={!catFilter} onPress={() => setCatFilter(null)} />
          {CATS.map((c) => (
            <FilterChip key={c.id} label={c.short} color={c.color} on={catFilter === c.id} onPress={() => setCatFilter(catFilter === c.id ? null : c.id)} />
          ))}
        </ScrollView>

        {pickedInMonth ? (
          <View style={{ marginHorizontal: 18, marginTop: 14, backgroundColor: t.card, borderRadius: 16, paddingTop: 14, paddingBottom: 4, shadowColor: '#221C13', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, marginBottom: 10 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt size={15} weight="bold" numberOfLines={1}>
                  {thaiDate(picked!)}
                  {picked === now.date ? ' · วันนี้' : ''}
                </Txt>
                <Txt size={12.5} color={t.sub}>
                  {dayItems.length ? `${dayItems.length} รายการ · ทำแล้ว ${dp.done}` : catFilter ? `ไม่มีรายการหมวด${CAT_BY_ID[catFilter].short}` : 'ไม่มีรายการ'}
                  {dp.overdue ? <Txt size={12.5} weight="bold" color={t.warn}>{` · ค้างบันทึก ${dp.overdue}`}</Txt> : null}
                </Txt>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => onPressDay(picked!)}
                style={({ pressed }) => ({ height: 40, paddingLeft: 14, paddingRight: 10, borderRadius: 20, backgroundColor: pressed ? t.rail : t.track, flexDirection: 'row', alignItems: 'center', gap: 2 })}>
                <Txt size={13} weight="med">
                  เปิดมุมมองวัน
                </Txt>
                <SvgIcon name="chevR" size={15} color={t.sub} strokeWidth={2.2} />
              </Pressable>
            </View>
            {dayItems.length || freeList.length ? (
              <View style={{ paddingLeft: 6, paddingRight: 14 }}>
                <Rail
                  items={dayItems}
                  now={now}
                  free={freeList}
                  showNow={picked === now.date}
                  onPressItem={onPressItem}
                  onToggle={toggle}
                  onPressSlot={onPressSlot ? (s) => onPressSlot(picked!, s.start, s.end) : undefined}
                  noteOf={(it) => notes[it.date]?.[it.id]}
                  nextCardBg={t.bg}
                />
              </View>
            ) : (
              <View style={{ height: 10 }} />
            )}
          </View>
        ) : (
          <Txt size={13} color={t.faint} style={{ textAlign: 'center', paddingTop: 16, paddingHorizontal: 18 }}>
            แตะวันเพื่อดูรายการ · แตะซ้ำเพื่อเปิดมุมมองวัน
          </Txt>
        )}
      </ScrollView>
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
      style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: on ? t.ink : t.track, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {color ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /> : null}
      <Txt size={13} weight={on ? 'bold' : 'med'} color={on ? t.bg : t.sub}>
        {label}
      </Txt>
    </Pressable>
  );
}
