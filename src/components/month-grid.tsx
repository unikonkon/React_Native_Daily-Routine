// ปฏิทินเดือน (จันทร์เริ่ม) — คอมโพเนนต์เดียว 3 โหมด:
//   heat-dots  = แท็บวันนี้ (พื้นเขียวตามชั่วโมงว่าง + จุดสีหมวด ≤3)
//   heat-hours = แท็บสรุปวันว่าง (พื้นเขียว + ตัวเลข "18ช")
//   select     = ปฏิทินฟอร์มเพิ่มกิจกรรม (multi-select, วันที่ผ่านมากดไม่ได้)
import React from 'react';
import { Pressable, View } from 'react-native';

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
        <View key={r} style={{ flexDirection: 'row' }}>
          {cells.slice(r * 7, r * 7 + 7).map((d) => {
            const inMonth = d.slice(0, 7) === first.slice(0, 7);
            const isToday = d === today;
            const isSel = selSet.has(d);
            const past = d < today;
            const items = inMonth && mode !== 'select' ? getDay(d) : [];

            let bg = 'transparent';
            let hoursLabel = '';
            if (inMonth && mode !== 'select') {
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
                  aspectRatio: 0.9,
                  margin: 2,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: inMonth ? bg : 'transparent',
                  borderWidth: isToday ? 1.5 : 0,
                  borderColor: ACCENT,
                  opacity: !inMonth ? 0 : mode === 'select' && past ? 0.3 : 1,
                }}>
                <Txt size={13} num weight={isToday || isSel ? 'bold' : 'reg'} color={isSel && mode === 'select' ? '#FFFFFF' : t.ink}>
                  {parseInt(d.slice(8), 10)}
                </Txt>
                {mode === 'heat-dots' ? (
                  <View style={{ flexDirection: 'row', gap: 2, marginTop: 2, height: 4 }}>
                    {[...new Set(items.map((i) => i.cat))].slice(0, 3).map((c) => (
                      <View key={c} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: CAT_BY_ID[c].color }} />
                    ))}
                  </View>
                ) : null}
                {mode === 'heat-hours' ? (
                  <Txt size={9} num color={t.sub}>
                    {hoursLabel}
                  </Txt>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
      {mode !== 'select' ? (
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
