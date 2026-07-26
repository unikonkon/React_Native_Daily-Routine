// มุมมองเดือน (ลุค mockup) — ชื่อเดือนตัวใหญ่ + หัววัน (จันทร์นำ) + ตาราง 7×6
// เลขวันในวงกลม (วันนี้=วงกลม accent, วันเลือก=วงแหวน) + จุดสีหมวดกิจกรรมใต้เลข
// แตะวัน → เลือก + แสดงรายการสรุปด้านล่าง · แตะซ้ำ → เข้ามุมมองวันของวันนั้น
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { DrillBar, ViewSwitcher, type View3 } from '@/components/today/parts';
import { PriBadge, Txt, useTokens } from '@/components/ui';
import { ACCENT, CATS, CAT_BY_ID, GREEN, type CatId } from '@/constants/theme';
import { MONTH_TH_FULL, WD_TH, addDays, beYear, fmtRange, fromISO, hoursText, mondayOf, thaiDate, toISO, todayISO } from '@/lib/dates';
import { daytimeFreeSlots, freeMinutes } from '@/lib/engine';
import type { DayItem } from '@/lib/types';
import { useDayReader } from '@/stores/activities';

interface MonthViewProps {
  year: number;
  month: number; // 0-based
  selected: string; // วันที่เลือกอยู่ (ไฮไลต์วงแหวน)
  onBack: () => void;
  onPrev: () => void;
  onNext: () => void;
  onPressDay: (iso: string) => void;
  bottomPad?: number;
  view: View3;
  onChangeView: (v: View3) => void;
  /** โหมด "วันที่ว่าง" — การ์ดสรุปแสดงช่วงเวลาว่าง แตะเพื่อเพิ่มกิจกรรม */
  freeMode?: boolean;
  onPressSlot?: (date: string, start: number, end: number) => void;
  /** แตะรายการในการ์ดสรุป → เปิดแผ่นรายละเอียด/แก้ไขกิจกรรมนั้น */
  onPressItem?: (item: DayItem) => void;
}

export function TodayMonthView({ year, month, selected, onBack, onPrev, onNext, onPressDay, bottomPad = 140, view, onChangeView, freeMode = false, onPressSlot, onPressItem }: MonthViewProps) {
  const t = useTokens();
  const getDay = useDayReader();
  const today = todayISO();
  const first = toISO(new Date(year, month, 1));
  const ymKey = first.slice(0, 7);
  const start = mondayOf(first);
  const rows = Array.from({ length: 6 }, (_, r) => Array.from({ length: 7 }, (_, c) => addDays(start, r * 7 + c)));

  // วันที่ถูกเลือกเพื่อดูรายการ (แตะครั้งแรก) — แตะซ้ำวันเดิมจึงเข้ามุมมองวัน
  const [picked, setPicked] = useState<string | null>(selected);
  const onCellPress = (d: string) => {
    if (picked === d) onPressDay(d);
    else setPicked(d);
  };

  // ตัวกรองหมวด — แตะจุดสีหมวด (legend) เพื่อดูเฉพาะหมวดนั้นทั้งในปฏิทินและรายการสรุป · แตะซ้ำ = ล้าง
  const [catFilter, setCatFilter] = useState<CatId | null>(null);
  const fcat = catFilter ? CAT_BY_ID[catFilter] : null;
  const monthCount = catFilter
    ? rows.flat().reduce((n, d) => (d.slice(0, 7) === ymKey ? n + getDay(d).filter((i) => i.cat === catFilter).length : n), 0)
    : 0;

  const pickedInMonth = picked != null && picked.slice(0, 7) === ymKey;
  const allDayItems = pickedInMonth ? [...getDay(picked!)].sort((a, b) => a.startMin - b.startMin) : [];
  const dayItems = catFilter ? allDayItems.filter((it) => it.cat === catFilter) : allDayItems;
  const freeList = pickedInMonth && freeMode ? daytimeFreeSlots(getDay(picked!)) : [];
  const freeMin = freeMinutes(freeList); // เวลาว่างรวมของวันที่เลือก (06:00–24:00)

  // โหมดวันที่ว่าง — รวมกิจกรรม + ช่วงว่าง แล้วเรียงตามเวลาเริ่ม (ช่วงว่างเด่น, กิจกรรมเป็นบริบท)
  const merged = freeMode
    ? [
        ...dayItems.map((it) => ({ kind: 'item' as const, start: it.startMin, it })),
        ...freeList.map((s) => ({ kind: 'slot' as const, start: s.start, s })),
      ].sort((a, b) => a.start - b.start)
    : [];

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 8, gap: 8 }}>
        <Txt size={24} weight="bold" style={{ flex: 1 }}>
          {MONTH_TH_FULL[month]}
        </Txt>
        <ViewSwitcher value={view} onChange={onChangeView} />
      </View>

      <DrillBar backLabel={`พ.ศ. ${beYear(year)}`} onBack={onBack} onPrev={onPrev} onNext={onNext} />

      {/* หัววัน (จันทร์นำ, อาทิตย์เป็นสี accent) */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 8, paddingBottom: 6, borderBottomWidth: 0.5, borderBottomColor: t.line }}>
        {WD_TH.map((w, i) => (
          <Txt key={w} size={11} weight="med" color={i === 6 ? ACCENT : t.faint} style={{ flex: 1, textAlign: 'center' }}>
            {w}
          </Txt>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>
        {rows.map((week, r) => (
          <View key={r} style={{ flexDirection: 'row' }}>
            {week.map((d, c) => {
              const inMonth = d.slice(0, 7) === ymKey;
              const isToday = d === today;
              const isSel = d === picked && inMonth;
              const cats = inMonth ? [...new Set(getDay(d).map((i) => i.cat))].slice(0, 4) : [];
              // โหมดวันที่ว่าง — แสดงจำนวนชั่วโมงที่ว่างแทนจุดสีหมวด
              const cellFreeMin = inMonth && freeMode ? freeMinutes(daytimeFreeSlots(getDay(d))) : 0;
              // กรองหมวดอยู่ — นับเฉพาะหมวดนั้น, วันที่ไม่มีให้จางลง
              const hitCount = catFilter && inMonth ? getDay(d).filter((i) => i.cat === catFilter).length : 0;
              const dimCell = !!catFilter && inMonth && !freeMode && hitCount === 0;
              return (
                <Pressable
                  key={d}
                  disabled={!inMonth}
                  onPress={() => onCellPress(d)}
                  style={{
                    flex: 1,
                    minHeight: 66,
                    paddingTop: 6,
                    alignItems: 'center',
                    gap: 5,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: t.line,
                    borderRightWidth: c === 6 ? 0 : StyleSheet.hairlineWidth,
                    borderRightColor: t.line,
                    backgroundColor: isSel && !isToday ? t.chip : 'transparent',
                    opacity: dimCell ? 0.35 : 1,
                  }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 14,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isToday ? ACCENT : 'transparent',
                      borderWidth: isSel && !isToday ? 1.5 : 0,
                      borderColor: ACCENT,
                    }}>
                    <Txt size={15} num weight={isToday || isSel ? 'bold' : 'reg'} color={isToday ? '#FFFFFF' : inMonth ? t.ink : t.faint}>
                      {fromISO(d).getDate()}
                    </Txt>
                  </View>
                  {freeMode ? (
                    <View style={{ minHeight: 6, justifyContent: 'center' }}>
                      {inMonth && cellFreeMin > 0 ? (
                        <Txt size={11} num weight="med" color={GREEN}>
                          {hoursText(cellFreeMin)}
                        </Txt>
                      ) : null}
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: 3, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', maxWidth: 36, minHeight: 6 }}>
                      {fcat ? (
                        // กรองหมวดอยู่ — จุดเดียวของหมวดนั้น + จำนวนรายการ (ถ้ามีมากกว่า 1)
                        hitCount > 0 ? (
                          <>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fcat.color }} />
                            {hitCount > 1 ? (
                              <Txt size={9} num weight="bold" color={fcat.color}>
                                {hitCount}
                              </Txt>
                            ) : null}
                          </>
                        ) : null
                      ) : (
                        cats.map((cid) => <View key={cid} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: CAT_BY_ID[cid].color }} />)
                      )}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}

        {/* คำอธิบายจุดสีหมวด (legend) — แตะเพื่อกรองเฉพาะหมวดนั้น (ปฏิทิน + รายการสรุป) · แตะซ้ำ = ล้าง */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 6, rowGap: 6, paddingHorizontal: 18, paddingTop: 12 }}>
          {CATS.map((cat) => {
            const on = catFilter === cat.id;
            return (
              <Pressable
                key={cat.id}
                onPress={() => setCatFilter(on ? null : cat.id)}
                hitSlop={4}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: 4,
                  paddingHorizontal: 9,
                  borderRadius: 9,
                  borderWidth: 1,
                  borderColor: on ? cat.color : t.line,
                  backgroundColor: on ? cat.color + '1f' : 'transparent',
                }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cat.color }} />
                <Txt size={11} weight={on ? 'med' : 'reg'} color={on ? cat.color : t.sub}>
                  {cat.short}
                </Txt>
              </Pressable>
            );
          })}
        </View>

        {/* แถบสถานะตัวกรอง — บอกว่ากำลังดูหมวดไหน + จำนวนรายการทั้งเดือน + ปุ่มล้าง */}
        {fcat ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 18, marginTop: 8, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 10, backgroundColor: fcat.color + '14', borderWidth: 1, borderColor: fcat.color + '55' }}>
            <Icon name={fcat.icon} size={14} color={fcat.color} />
            <Txt size={12} weight="med" color={fcat.color} style={{ flex: 1 }}>
              {fcat.name} · {monthCount} รายการในเดือนนี้
            </Txt>
            <Pressable onPress={() => setCatFilter(null)} hitSlop={8}>
              <Txt size={12} weight="bold" color={ACCENT}>
                ล้างตัวกรอง
              </Txt>
            </Pressable>
          </View>
        ) : null}

        {/* รายการสรุปของวันที่เลือก */}
        {pickedInMonth ? (
          <View style={{ marginHorizontal: 18, marginTop: 12, backgroundColor: t.card, borderRadius: 14, borderWidth: 1, borderColor: t.line, padding: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: (freeMode ? freeList.length : dayItems.length) ? 8 : 0 }}>
              <View style={{ flex: 1 }}>
                <Txt size={15} weight="bold">
                  {thaiDate(picked!)}
                </Txt>
                {freeMode ? (
                  <Txt size={12} weight="med" color={GREEN}>
                    ว่างรวม {hoursText(freeMin)} · แตะเพื่อเพิ่ม
                  </Txt>
                ) : fcat ? (
                  <Txt size={12} weight="med" color={fcat.color}>
                    เฉพาะ{fcat.short} · {dayItems.length} รายการ
                  </Txt>
                ) : onPressItem && dayItems.length ? (
                  <Txt size={12} color={t.faint}>
                    แตะรายการเพื่อดู/แก้ไข
                  </Txt>
                ) : null}
              </View>
              <Pressable onPress={() => onPressDay(picked!)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Txt size={12} weight="med" color={ACCENT}>
                  เปิดมุมมองวัน
                </Txt>
                <Icon name="chevR" size={15} color={ACCENT} />
              </Pressable>
            </View>

            {freeMode ? (
              merged.length === 0 ? (
                <Txt size={13} color={t.faint} style={{ paddingVertical: 4 }}>
                  ไม่มีรายการในวันนี้
                </Txt>
              ) : (
                <View style={{ gap: 6 }}>
                  {merged.map((row) =>
                    row.kind === 'slot' ? (
                      // ช่วงว่าง — เด่น: กล่องพื้นเขียว + ปุ่มเพิ่ม (แตะ → ฟอร์มเพิ่มพร้อมช่วงเวลา)
                      <Pressable
                        key={`slot:${row.start}`}
                        onPress={() => onPressSlot?.(picked!, row.s.start, row.s.end)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, backgroundColor: GREEN + '14', borderWidth: 1, borderColor: GREEN + '55' }}>
                        <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name="plus" size={15} color="#FFFFFF" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Txt size={14} weight="bold" color={GREEN}>
                            ว่าง {hoursText(row.s.end - row.s.start)}
                          </Txt>
                          <Txt size={11} num color={t.sub}>
                            {fmtRange(row.s.start, row.s.end)}
                          </Txt>
                        </View>
                        <Txt size={12} weight="bold" color={GREEN}>
                          เพิ่ม
                        </Txt>
                      </Pressable>
                    ) : (
                      // กิจกรรมเดิม — บริบท (จางลงเล็กน้อยให้ช่วงว่างเด่นกว่า) · แตะเพื่อเปิดแผ่นรายละเอียด/แก้ไข
                      <Pressable
                        key={`${row.it.id}:${row.it.date}`}
                        onPress={onPressItem ? () => onPressItem(row.it) : undefined}
                        disabled={!onPressItem}
                        style={({ pressed }) => ({
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 10,
                          paddingVertical: 4,
                          paddingHorizontal: 2,
                          borderRadius: 8,
                          backgroundColor: pressed ? t.chip : 'transparent',
                          opacity: row.it.ostatus === 'rescheduled' ? 0.5 : 0.85,
                        })}>
                        <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: CAT_BY_ID[row.it.cat].color }} />
                        {row.it.cat === 'case' ? <PriBadge id={row.it.priority} /> : null}
                        {/* ทำแล้ว = ตัวอักษรจางลงอย่างเดียว (ไม่ขีดฆ่า) — มีไอคอน ✓ ท้ายแถวบอกสถานะอยู่แล้ว */}
                        <Txt size={14} weight="med" numberOfLines={1} color={row.it.ostatus === 'done' ? t.faint : t.ink} style={{ flex: 1 }}>
                          {row.it.title}
                        </Txt>
                        {row.it.ostatus === 'done' ? <Icon name="check" size={14} color={GREEN} /> : null}
                        <Txt size={12} num color={t.sub}>
                          {fmtRange(row.it.startMin, row.it.endMin)}
                        </Txt>
                      </Pressable>
                    ),
                  )}
                </View>
              )
            ) : dayItems.length === 0 ? (
              <Txt size={13} color={t.faint} style={{ paddingVertical: 4 }}>
                {fcat ? `ไม่มีรายการหมวด${fcat.short}ในวันนี้` : 'ไม่มีรายการในวันนี้'}
              </Txt>
            ) : (
              dayItems.map((it, i) => {
                const cat = CAT_BY_ID[it.cat];
                const done = it.ostatus === 'done';
                return (
                  // แตะแถว → เปิดแผ่นรายละเอียด (แก้ไข/ทำแล้ว/เลื่อน/ลบ) ของกิจกรรมนั้น
                  <Pressable
                    key={`${it.id}:${it.date}`}
                    onPress={onPressItem ? () => onPressItem(it) : undefined}
                    disabled={!onPressItem}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingVertical: 9,
                      paddingHorizontal: pressed ? 6 : 0,
                      marginHorizontal: pressed ? -6 : 0,
                      borderRadius: pressed ? 8 : 0,
                      backgroundColor: pressed ? t.chip : 'transparent',
                      borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                      borderTopColor: t.line,
                      opacity: it.ostatus === 'rescheduled' ? 0.5 : 1,
                    })}>
                    <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: cat.color }} />
                    {it.cat === 'case' ? <PriBadge id={it.priority} /> : null}
                    {/* ทำแล้ว = ตัวอักษรจางลงอย่างเดียว (ไม่ขีดฆ่า) — มีไอคอน ✓ ท้ายแถวบอกสถานะอยู่แล้ว */}
                    <Txt size={14} weight="med" numberOfLines={1} color={done ? t.faint : t.ink} style={{ flex: 1 }}>
                      {it.title}
                    </Txt>
                    {done ? <Icon name="check" size={14} color={GREEN} /> : null}
                    <Txt size={12} num color={t.sub}>
                      {fmtRange(it.startMin, it.endMin)}
                    </Txt>
                    {onPressItem ? <Icon name="chevR" size={14} color={t.faint} /> : null}
                  </Pressable>
                );
              })
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
