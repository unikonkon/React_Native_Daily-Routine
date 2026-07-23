// แถบนำทางช่วงเวลา ‹ ป้าย › — ใช้ร่วมมุมมองสัปดาห์/เดือนของแท็บวันนี้และแท็บสรุป
// รวมการทำงานไว้ที่เดียว: ป้ายชื่อช่วง + เลื่อนไปหน้า/ย้อนหลัง + แตะป้ายเพื่อเปิด popup กระโดดข้ามช่วง
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Chip, Txt, useTokens } from '@/components/ui';
import { ACCENT } from '@/constants/theme';
import {
  MONTH_TH,
  SCHED_MAX_Y,
  SCHED_MIN_Y,
  VIEW_MAX_Y,
  VIEW_MIN_Y,
  addDays,
  beYear,
  fromISO,
  mondayOf,
  thaiWeekRange,
  toISO,
  todayISO,
} from '@/lib/dates';

interface YM {
  y: number;
  m: number; // 0-based
}

function PeriodNav({
  label,
  onPrev,
  onNext,
  onPressLabel,
  onToday,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onPressLabel: () => void;
  /** แสดงชิป "วันนี้" เมื่อส่งมา (ซ่อนเมื่อดูช่วงปัจจุบันอยู่แล้ว) */
  onToday?: () => void;
}) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, marginBottom: 8, gap: 4 }}>
      <Pressable onPress={onPrev} style={{ padding: 6 }}>
        <Icon name="chevL" size={20} color={t.sub} />
      </Pressable>
      <Pressable
        onPress={onPressLabel}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4 }}>
        <Txt size={14} weight="med">
          {label}
        </Txt>
        <Icon name="chevD" size={14} color={t.sub} />
      </Pressable>
      {onToday ? <Chip small label="วันนี้" active color={ACCENT} onPress={onToday} /> : null}
      <Pressable onPress={onNext} style={{ padding: 6 }}>
        <Icon name="chevR" size={20} color={t.sub} />
      </Pressable>
    </View>
  );
}

/** มุมมองสัปดาห์: ป้าย "6 ก.ค. – 12 ก.ค. 2569" + เลื่อนทีละ 7 วัน — แตะป้ายเปิด popup เลือก สัปดาห์/เดือน/ปี */
export function WeekNav({
  monday,
  onChange,
  minYear = VIEW_MIN_Y,
  maxYear = VIEW_MAX_Y,
}: {
  monday: string;
  onChange: (monday: string) => void;
  minYear?: number;
  maxYear?: number;
}) {
  const [open, setOpen] = useState(false);
  const thisWeek = mondayOf(todayISO());
  return (
    <>
      <PeriodNav
        label={thaiWeekRange(monday)}
        onPrev={() => onChange(addDays(monday, -7))}
        onNext={() => onChange(addDays(monday, 7))}
        onPressLabel={() => setOpen(true)}
        onToday={monday !== thisWeek ? () => onChange(thisWeek) : undefined}
      />
      <WeekPicker
        visible={open}
        monday={monday}
        minYear={minYear}
        maxYear={maxYear}
        onClose={() => setOpen(false)}
        onPick={(m) => {
          onChange(m);
          setOpen(false);
        }}
      />
    </>
  );
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
