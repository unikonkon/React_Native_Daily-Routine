// Popup เลือกเดือน & ปี (พ.ศ. 2569–2573) — ใช้กับปฏิทินฟอร์มเพิ่มกิจกรรม
import React from 'react';
import { Modal, Pressable, View } from 'react-native';

import { NavCircle, Txt, pressFade, useTokens } from '@/components/ui';
import { MONTH_TH, MONTH_TH_FULL, SCHED_MAX_Y, SCHED_MIN_Y, beYear } from '@/lib/dates';

interface Props {
  visible: boolean;
  year: number;
  month: number; // 0-based
  onClose: () => void;
  onPick: (year: number, month: number) => void;
  /** ขอบเขตปี — ค่าปกติ = ชุดจอง (อนาคต); แท็บดูข้อมูลส่งชุด VIEW เข้ามาเพื่อย้อนอดีต */
  minYear?: number;
  maxYear?: number;
}

export function MonthYearPicker({ visible, year, month, onClose, onPick, minYear = SCHED_MIN_Y, maxYear = SCHED_MAX_Y }: Props) {
  const t = useTokens();
  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: t.overlay, alignItems: 'center', justifyContent: 'center' }} onPress={onClose}>
        <Pressable style={{ backgroundColor: t.sheet, borderRadius: 22, padding: 18, width: 300, gap: 12 }} onPress={() => {}}>
          <Txt size={16} weight="bold" style={{ textAlign: 'center' }}>เลือกเดือนและปี</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <NavCircle dir="prev" label="ปีก่อนหน้า" disabled={year <= minYear} onPress={() => onPick(year - 1, month)} />
            <Txt size={18} num weight="bold" style={{ minWidth: 64, textAlign: 'center' }}>{beYear(year)}</Txt>
            <NavCircle dir="next" label="ปีถัดไป" disabled={year >= maxYear} onPress={() => onPick(year + 1, month)} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {MONTH_TH.map((m, i) => (
              <Pressable
                key={m}
                accessibilityRole="button"
                accessibilityState={{ selected: i === month }}
                accessibilityLabel={`${MONTH_TH_FULL[i]} ${beYear(year)}`}
                onPress={() => {
                  onPick(year, i);
                  onClose();
                }}
                style={pressFade({
                  width: '33.33%',
                  paddingVertical: 12,
                  alignItems: 'center',
                  borderRadius: 12,
                  backgroundColor: i === month ? t.accent : 'transparent',
                })}>
                <Txt size={13} weight={i === month ? 'bold' : 'reg'} color={i === month ? '#FFFFFF' : t.ink}>
                  {m}
                </Txt>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
