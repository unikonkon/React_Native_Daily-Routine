// Popup เลือกเดือน & ปี (พ.ศ. 2569–2573) — ใช้กับปฏิทินฟอร์มเพิ่มกิจกรรม
import React from 'react';
import { Modal, Pressable, View } from 'react-native';

import { ACCENT } from '@/constants/theme';
import { Icon } from '@/components/icon';
import { Txt, useTokens } from '@/components/ui';
import { MONTH_TH, SCHED_MAX_Y, SCHED_MIN_Y, beYear } from '@/lib/dates';

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
          <Txt size={16} weight="bold" style={{ textAlign: 'center' }}>เลือกเดือน & ปี</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
            <Pressable disabled={year <= minYear} onPress={() => onPick(year - 1, month)} style={{ opacity: year <= minYear ? 0.3 : 1 }}>
              <Icon name="chevL" size={22} color={t.sub} />
            </Pressable>
            <Txt size={18} num weight="bold">{beYear(year)}</Txt>
            <Pressable disabled={year >= maxYear} onPress={() => onPick(year + 1, month)} style={{ opacity: year >= maxYear ? 0.3 : 1 }}>
              <Icon name="chevR" size={22} color={t.sub} />
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {MONTH_TH.map((m, i) => (
              <Pressable
                key={m}
                onPress={() => {
                  onPick(year, i);
                  onClose();
                }}
                style={{
                  width: '33.33%',
                  paddingVertical: 12,
                  alignItems: 'center',
                  borderRadius: 12,
                  backgroundColor: i === month ? ACCENT : 'transparent',
                }}>
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
