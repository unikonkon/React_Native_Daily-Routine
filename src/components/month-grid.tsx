// ปฏิทินเดือน (จันทร์เริ่ม) — คอมโพเนนต์เดียว 3 โหมด:
//   heat-dots  = แท็บวันนี้ (ลุค iOS: เส้นแบ่งแถว + จุดสีหมวด ≤3 ใต้เลข, วันนี้วงกลมทึบ)
//   heat-hours = แท็บสรุปวันว่าง (พื้นเขียวตามชั่วโมงว่าง + ตัวเลข "18ช")
//   select     = ปฏิทินฟอร์มเพิ่มกิจกรรม (multi-select, วันที่ผ่านมากดไม่ได้)
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ACCENT, CAT_BY_ID, GREEN } from '@/constants/theme';
import { Txt, useTokens } from '@/components/ui';
import { WD_TH, addDays, mondayOf, toISO, todayISO } from '@/lib/dates';
import { freeMinutes, freeSlots } from '@/lib/engine';
import { useDayReader } from '@/stores/activities';

interface MonthGridProps {
  year: number;
  month: number; // 0-based
  mode: 'heat-dots' | 'heat-hours' | 'select';
  selected?: string[];
  onPressDay: (iso: string) => void;
}

export function MonthGrid({ year, month, mode, selected, onPressDay }: MonthGridProps) {
  const t = useTokens();
  const getDay = useDayReader(); // อ่านผ่าน hook — อัปเดตเมื่อข้อมูลเปลี่ยน (ปลอดภัยกับ React Compiler)
  const today = todayISO();
  const first = toISO(new Date(year, month, 1));
  const start = mondayOf(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const selSet = new Set(selected ?? []);
  const ios = mode === 'heat-dots'; // ลุคปฏิทิน iOS: เส้นแบ่งแถว, เซลล์สูง, ไม่มีพื้น heat

  return (
    <View>
      <View style={{ flexDirection: 'row', marginBottom: 6 }}>
        {WD_TH.map((w) => (
          <Txt key={w} size={11} color={t.faint} style={{ flex: 1, textAlign: 'center' }}>
            {w}
          </Txt>
        ))}
      </View>
      {Array.from({ length: 6 }, (_, r) => (
        <View
          key={r}
          style={{
            flexDirection: 'row',
            ...(ios
              ? {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: t.line,
                  ...(r === 5 ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line } : {}),
                }
              : {}),
          }}>
          {cells.slice(r * 7, r * 7 + 7).map((d) => {
            const inMonth = d.slice(0, 7) === first.slice(0, 7);
            const isToday = d === today;
            const isSel = selSet.has(d);
            const past = d < today;
            const items = inMonth && mode !== 'select' ? getDay(d) : [];

            let bg = 'transparent';
            let hoursLabel = '';
            if (inMonth && mode === 'heat-hours') {
              const freeH = freeMinutes(freeSlots(items)) / 60;
              const g = Math.min(freeH / 20.5, 1);
              bg = `rgba(76,154,106,${(0.08 + g * 0.44).toFixed(3)})`;
              hoursLabel = `${Math.round(freeH)}ช`;
            }
            if (mode === 'select' && isSel) bg = ACCENT;

            const disabled = !inMonth || (mode === 'select' && past);
            return (
              <Pressable
                key={d}
                disabled={disabled}
                onPress={() => onPressDay(d)}
                style={{
                  flex: 1,
                  aspectRatio: ios ? 0.78 : 0.9,
                  margin: ios ? 0 : 2,
                  borderRadius: ios ? 0 : 10,
                  paddingTop: ios ? 6 : 0,
                  alignItems: 'center',
                  justifyContent: ios ? 'flex-start' : 'center',
                  backgroundColor: inMonth ? bg : 'transparent',
                  opacity: !inMonth ? 0 : mode === 'select' && past ? 0.3 : 1,
                }}>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isToday ? ACCENT : 'transparent',
                  }}>
                  <Txt
                    size={13}
                    num
                    weight={isToday || isSel ? 'bold' : 'reg'}
                    color={isToday || (isSel && mode === 'select') ? '#FFFFFF' : t.ink}>
                    {parseInt(d.slice(8), 10)}
                  </Txt>
                </View>
                {mode === 'heat-dots' ? (
                  <View style={{ flexDirection: 'row', gap: 2, marginTop: 3, height: 5 }}>
                    {[...new Set(items.map((i) => i.cat))].slice(0, 3).map((c) => (
                      <View key={c} style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: CAT_BY_ID[c].color }} />
                    ))}
                  </View>
                ) : null}
                {mode === 'heat-hours' ? (
                  <Txt size={9} num color={t.sub} style={{ marginTop: 2 }}>
                    {hoursLabel}
                  </Txt>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
      {mode === 'heat-hours' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, justifyContent: 'center' }}>
          <Txt size={11} color={t.faint}>เวลาว่าง/วัน</Txt>
          {[0.12, 0.3, 0.52].map((a) => (
            <View key={a} style={{ width: 14, height: 8, borderRadius: 3, backgroundColor: `rgba(76,154,106,${a})` }} />
          ))}
          <Txt size={11} color={GREEN}>มาก</Txt>
        </View>
      ) : null}
    </View>
  );
}
