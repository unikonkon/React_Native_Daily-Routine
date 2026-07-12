// Popup เลือกเวลาเริ่ม/สิ้นสุดแบบอิสระ (สแนป 15 นาที) — ใช้กับชิป "เลือกเอง" ในการ์ดเวลา ฟอร์มเพิ่มกิจกรรม
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { Btn, Chip, ChipRow, Txt, useTokens } from '@/components/ui';
import { DAY_END, DAY_START } from '@/constants/theme';
import { fmtMin } from '@/lib/dates';

const MINUTES = [0, 15, 30, 45];

interface Props {
  visible: boolean;
  start: number;
  end: number;
  onClose: () => void;
  onConfirm: (start: number, end: number) => void;
}

/** ปรับเวลา 1 ค่า: ชั่วโมงด้วยปุ่ม ‹ › + นาทีด้วยชิป 00/15/30/45 */
function TimeField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const t = useTokens();
  const stepHour = (dir: 1 | -1) => {
    const v = value + dir * 60;
    if (v >= DAY_START && v <= DAY_END) onChange(v);
  };
  const setMinute = (m: number) => {
    const v = Math.floor(value / 60) * 60 + m;
    if (v >= DAY_START && v <= DAY_END) onChange(v);
  };
  return (
    <View style={{ gap: 8 }}>
      <Txt size={13} weight="med" color={t.sub}>{label}</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          onPress={() => stepHour(-1)}
          style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }}>
          <Txt size={20} color={t.sub}>−</Txt>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Txt size={26} num weight="bold">
            {fmtMin(value)}
            {value > 1440 ? ' +1' : ''}
          </Txt>
        </View>
        <Pressable
          onPress={() => stepHour(1)}
          style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }}>
          <Txt size={20} color={t.sub}>+</Txt>
        </Pressable>
      </View>
      <ChipRow style={{ justifyContent: 'center' }}>
        {MINUTES.map((m) => (
          <Chip key={m} small label={`:${`${m}`.padStart(2, '0')}`} active={value % 60 === m} onPress={() => setMinute(m)} />
        ))}
      </ChipRow>
    </View>
  );
}

export function TimeRangeModal({ visible, start, end, onClose, onConfirm }: Props) {
  const t = useTokens();
  const [s, setS] = useState(start);
  const [e, setE] = useState(end);

  // ซิงก์ค่าเริ่มต้นทุกครั้งที่เปิด popup
  useEffect(() => {
    if (visible) {
      setS(start);
      setE(end);
    }
  }, [visible, start, end]);

  if (!visible) return null;
  const invalid = e <= s;

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: t.overlay, alignItems: 'center', justifyContent: 'center' }} onPress={onClose}>
        <Pressable style={{ backgroundColor: t.sheet, borderRadius: 22, padding: 18, width: 300, gap: 14 }} onPress={() => {}}>
          <Txt size={16} weight="bold" style={{ textAlign: 'center' }}>เลือกเวลาเอง</Txt>
          <TimeField label="เริ่ม" value={s} onChange={setS} />
          <TimeField label="สิ้นสุด" value={e} onChange={setE} />
          {invalid ? <Txt size={12} color="#C0392B" style={{ textAlign: 'center' }}>เวลาสิ้นสุดต้องมากกว่าเริ่ม</Txt> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn style={{ flex: 1 }} kind="ghost" label="ยกเลิก" onPress={onClose} />
            <Btn style={{ flex: 1 }} label="ตกลง" disabled={invalid} onPress={() => onConfirm(s, e)} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
