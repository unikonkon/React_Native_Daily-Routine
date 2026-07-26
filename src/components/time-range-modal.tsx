// Popup เลือกเวลาเริ่ม/สิ้นสุดแบบอิสระ (สแนป 15 นาที) — ใช้กับชิป "เลือกเอง" ในการ์ดเวลา ฟอร์มเพิ่มกิจกรรม
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { Btn, Chip, ChipRow, Txt, useTokens } from '@/components/ui';
import { ACCENT, DANGER, DAY_END, DAY_START, GREEN } from '@/constants/theme';
import { durText, fmtMin } from '@/lib/dates';

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
  // ค่าตอนเปิด popup — ไว้เทียบว่าปรับไปแล้วเพิ่ม/ลดกี่นาที
  const [base, setBase] = useState({ s: start, e: end });

  // ซิงก์ค่าเริ่มต้นทุกครั้งที่เปิด popup
  useEffect(() => {
    if (visible) {
      setS(start);
      setE(end);
      setBase({ s: start, e: end });
    }
  }, [visible, start, end]);

  if (!visible) return null;
  const invalid = e <= s;
  const dur = e - s;
  const baseDur = Math.max(base.e - base.s, 0);
  const delta = dur - baseDur;

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: t.overlay, alignItems: 'center', justifyContent: 'center' }} onPress={onClose}>
        <Pressable style={{ backgroundColor: t.sheet, borderRadius: 22, padding: 18, width: 300, gap: 14 }} onPress={() => {}}>
          <Txt size={16} weight="bold" style={{ textAlign: 'center' }}>เลือกเวลาเอง</Txt>
          <TimeField label="เริ่ม" value={s} onChange={setS} />
          <TimeField label="สิ้นสุด" value={e} onChange={setE} />

          {/* สรุประยะเวลา — ตอนนี้กี่ชั่วโมง และปรับไปจากตอนเปิดเท่าไรแล้ว */}
          <View style={{ backgroundColor: t.chip, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Txt size={12.5} color={t.sub} style={{ flex: 1 }}>ระยะเวลาตอนนี้</Txt>
              <Txt size={16} num weight="bold" color={invalid ? DANGER : t.ink}>
                {invalid ? '—' : durText(dur)}
              </Txt>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Txt size={11.5} color={t.faint} style={{ flex: 1 }}>
                เดิม {durText(baseDur)} ({fmtMin(base.s)}–{fmtMin(base.e)})
              </Txt>
              <Txt size={12.5} num weight="bold" color={delta === 0 ? t.faint : delta > 0 ? GREEN : ACCENT}>
                {delta === 0 ? 'เท่าเดิม' : `${delta > 0 ? '+' : '−'}${durText(Math.abs(delta))}`}
              </Txt>
            </View>
          </View>

          {invalid ? <Txt size={12} color={DANGER} style={{ textAlign: 'center' }}>เวลาสิ้นสุดต้องมากกว่าเริ่ม</Txt> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn style={{ flex: 1 }} kind="ghost" label="ยกเลิก" onPress={onClose} />
            <Btn style={{ flex: 1 }} label="ตกลง" disabled={invalid} onPress={() => onConfirm(s, e)} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
