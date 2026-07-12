// Smart Reschedule Modal (APP_STRUCTURE.md §3.4) — เฉพาะนัดหมวด case
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ACCENT, FONT, GREEN } from '@/constants/theme';
import { Btn, Chip, ChipRow, Txt, useTokens } from '@/components/ui';
import { fmtMin, thaiDate } from '@/lib/dates';
import { rescheduleCandidates, type RescRange } from '@/lib/engine';
import { useActivities } from '@/stores/activities';
import { useUI } from '@/stores/ui';

const RANGES: { key: RescRange; label: string }[] = [
  { key: '3d', label: 'ภายใน 3 วัน' },
  { key: 'w', label: 'สัปดาห์นี้' },
  { key: 'nw', label: 'สัปดาห์หน้า' },
];

export function RescheduleModal() {
  const item = useUI((s) => s.resc);
  return item ? <Body /> : null;
}

function Body() {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const item = useUI((s) => s.resc)!;
  const closeResc = useUI((s) => s.closeResc);
  const showToast = useUI((s) => s.showToast);
  const { acts, occ, reschedule } = useActivities();

  const [reason, setReason] = useState('');
  const [range, setRange] = useState<RescRange>('3d');
  const [pick, setPick] = useState(0);

  const cands = useMemo(() => rescheduleCandidates(acts, occ, item, range), [acts, occ, item, range]);

  return (
    <Modal transparent animationType="slide" onRequestClose={closeResc}>
      <Pressable style={{ flex: 1, backgroundColor: t.overlay }} onPress={closeResc} />
      <View style={{ backgroundColor: t.sheet, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: insets.bottom + 20, gap: 12, maxHeight: '85%' }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: t.line2, alignSelf: 'center' }} />
        <Txt size={20} weight="bold">เลื่อนนัด · {item.title}</Txt>
        <Txt size={13} num color={t.sub}>
          นัดเดิม: {thaiDate(item.date)} {fmtMin(item.startMin)}–{fmtMin(item.endMin)}
        </Txt>

        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder="เหตุผล (ไม่บังคับ) เช่น ลูกค้าติดประชุม"
          placeholderTextColor={t.faint}
          style={{ backgroundColor: t.card2, borderRadius: 12, borderWidth: 1, borderColor: t.line, padding: 12, color: t.ink, fontFamily: FONT.ui, fontSize: 14 }}
        />

        <ChipRow>
          {RANGES.map((r) => (
            <Chip key={r.key} label={r.label} active={range === r.key} onPress={() => { setRange(r.key); setPick(0); }} />
          ))}
        </ChipRow>

        <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 8 }}>
            {cands.length === 0 ? (
              <Txt size={13} color={t.faint}>ไม่มีช่วงว่างพอในช่วงนี้ — ลองขยายช่วงค้นหา</Txt>
            ) : (
              cands.map((c, i) => {
                const active = i === pick;
                return (
                  <Pressable
                    key={`${c.date}:${c.start}`}
                    onPress={() => setPick(i)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      padding: 12,
                      borderRadius: 14,
                      borderWidth: 1.5,
                      borderColor: active ? ACCENT : t.line,
                      backgroundColor: active ? ACCENT + '14' : t.card,
                    }}>
                    <View style={{ flex: 1 }}>
                      <Txt size={14} weight="med">{thaiDate(c.date)}</Txt>
                      <Txt size={13} num color={t.sub}>
                        {fmtMin(c.start)}–{fmtMin(c.end)}
                      </Txt>
                    </View>
                    {i === 0 ? (
                      <View style={{ backgroundColor: GREEN, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Txt size={11} color="#FFFFFF" weight="bold">แนะนำ</Txt>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </View>
        </ScrollView>

        <Btn
          label="ยืนยันเลื่อนนัด"
          disabled={!cands.length}
          onPress={() => {
            reschedule(item, cands[pick], reason.trim());
            closeResc();
            showToast('เลื่อนนัดแล้ว · ย้ายแจ้งเตือนอัตโนมัติ');
          }}
        />
      </View>
    </Modal>
  );
}
