// popup เลือกสัปดาห์ (ปี → เดือน → สัปดาห์) — ใช้ใน Reschedule Modal
// (แถบ ‹ ช่วง › เดิมของแท็บวันนี้ถูกแทนด้วยแถบล่าง B1 แล้ว)
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Txt, useTokens } from '@/components/ui';
import { ACCENT } from '@/constants/theme';
import {
  MONTH_TH,
  SCHED_MAX_Y,
  SCHED_MIN_Y,
  addDays,
  beYear,
  fromISO,
  mondayOf,
  thaiWeekRange,
  toISO,
} from '@/lib/dates';

interface YM {
  y: number;
  m: number; // 0-based
}

// ---------- popup เลือกสัปดาห์: ปี → เดือน → รายการสัปดาห์ของเดือนนั้น (ใช้ซ้ำใน Reschedule Modal ด้วย) ----------

export function WeekPicker({
  visible,
  monday,
  onClose,
  onPick,
  minYear = SCHED_MIN_Y,
  maxYear = SCHED_MAX_Y,
}: {
  visible: boolean;
  monday: string;
  onClose: () => void;
  onPick: (monday: string) => void;
  minYear?: number;
  maxYear?: number;
}) {
  const t = useTokens();
  const [ym, setYm] = useState<YM>(() => {
    const d = fromISO(monday);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  // ซิงก์เดือน/ปีกับสัปดาห์ปัจจุบันทุกครั้งที่เปิด popup
  useEffect(() => {
    if (visible) {
      const d = fromISO(monday);
      setYm({ y: d.getFullYear(), m: d.getMonth() });
    }
  }, [visible, monday]);

  if (!visible) return null;

  // สัปดาห์ทั้งหมด (วันจันทร์) ที่คาบเกี่ยวเดือนที่เลือก
  const first = toISO(new Date(ym.y, ym.m, 1));
  const last = toISO(new Date(ym.y, ym.m + 1, 0));
  const weeks: string[] = [];
  for (let w = mondayOf(first); w <= last; w = addDays(w, 7)) weeks.push(w);

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: t.overlay, alignItems: 'center', justifyContent: 'center' }} onPress={onClose}>
        <Pressable style={{ backgroundColor: t.sheet, borderRadius: 22, padding: 18, width: 300, gap: 12, maxHeight: '85%' }} onPress={() => {}}>
          <Txt size={16} weight="bold" style={{ textAlign: 'center' }}>เลือกสัปดาห์</Txt>

          {/* ปี */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
            <Pressable disabled={ym.y <= minYear} onPress={() => setYm({ ...ym, y: ym.y - 1 })} style={{ opacity: ym.y <= minYear ? 0.3 : 1 }}>
              <Icon name="chevL" size={22} color={t.sub} />
            </Pressable>
            <Txt size={18} num weight="bold">{beYear(ym.y)}</Txt>
            <Pressable disabled={ym.y >= maxYear} onPress={() => setYm({ ...ym, y: ym.y + 1 })} style={{ opacity: ym.y >= maxYear ? 0.3 : 1 }}>
              <Icon name="chevR" size={22} color={t.sub} />
            </Pressable>
          </View>

          {/* เดือน */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {MONTH_TH.map((m, i) => (
              <Pressable
                key={m}
                onPress={() => setYm({ ...ym, m: i })}
                style={{
                  width: '25%',
                  paddingVertical: 9,
                  alignItems: 'center',
                  borderRadius: 12,
                  backgroundColor: i === ym.m ? ACCENT : 'transparent',
                }}>
                <Txt size={13} weight={i === ym.m ? 'bold' : 'reg'} color={i === ym.m ? '#FFFFFF' : t.ink}>
                  {m}
                </Txt>
              </Pressable>
            ))}
          </View>

          {/* สัปดาห์ในเดือนนั้น */}
          <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: 6 }}>
              {weeks.map((w) => {
                const active = w === monday;
                return (
                  <Pressable
                    key={w}
                    onPress={() => onPick(w)}
                    style={{
                      paddingVertical: 10,
                      borderRadius: 12,
                      alignItems: 'center',
                      backgroundColor: active ? ACCENT : t.card2,
                      borderWidth: 1,
                      borderColor: active ? ACCENT : t.line,
                    }}>
                    <Txt size={13} num weight={active ? 'bold' : 'med'} color={active ? '#FFFFFF' : t.ink}>
                      {thaiWeekRange(w)}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
