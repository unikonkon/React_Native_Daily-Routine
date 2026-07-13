// แถบวันที่แนวนอน 30 วัน/หน้า (หน้าแรกเริ่มก่อนวันนี้ 3 วัน) + ปุ่ม ‹ › เลื่อนทีละ 30 วัน + ชิป "วันนี้" เด้งกลับ
// หน้าต่างคำนวณจาก focus เสมอ — เลือกวันจากมุมมองสัปดาห์/เดือน (อดีต/อนาคตแค่ไหนก็ได้) จะมีช่องวันนั้นแน่นอน
import React, { useEffect, useMemo, useRef } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { Chip, Txt, useTokens } from '@/components/ui';
import { ACCENT } from '@/constants/theme';
import { Icon } from '@/components/icon';
import { WD_TH, addDays, daysBetween, fromISO, todayISO, wdMon } from '@/lib/dates';

const PAGE = 30;

export function DateStrip({ focus, onChange }: { focus: string; onChange: (iso: string) => void }) {
  const t = useTokens();
  const today = todayISO();
  const base = addDays(today, -3); // วันแรกของหน้า 0 (ตามสเปกเดิม: เริ่มก่อนวันนี้ 3 วัน)
  const pageStart = useMemo(
    () => addDays(base, Math.floor(daysBetween(base, focus) / PAGE) * PAGE),
    [base, focus],
  );
  const days = useMemo(() => Array.from({ length: PAGE }, (_, i) => addDays(pageStart, i)), [pageStart]);
  const listRef = useRef<FlatList<string>>(null);

  // เลื่อน list ให้เห็นวัน focus ทุกครั้งที่วัน/หน้าเปลี่ยน (เช่น เลือกมาจากมุมมองเดือน หรือกด ‹ ›)
  const idx = days.indexOf(focus);
  useEffect(() => {
    if (idx >= 0) listRef.current?.scrollToIndex({ index: Math.max(idx - 2, 0), animated: false });
  }, [idx, pageStart]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 }}>
      {/* เลื่อนหน้า = เลือกวันแรกของช่วงใหม่ — pageStart คำนวณจาก focus จึงย้ายหน้าตามอัตโนมัติ */}
      <PageBtn icon="chevL" onPress={() => onChange(addDays(pageStart, -PAGE))} />
      <View style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          horizontal
          data={days}
          keyExtractor={(d) => d}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 4, gap: 6 }}
          getItemLayout={(_, i) => ({ length: 54, offset: 54 * i, index: i })}
          initialScrollIndex={Math.max(idx - 2, 0)}
          renderItem={({ item: d }) => {
            const active = d === focus;
            const isToday = d === today;
            return (
              <Pressable
                onPress={() => onChange(d)}
                style={{
                  width: 48,
                  paddingVertical: 8,
                  borderRadius: 14,
                  alignItems: 'center',
                  backgroundColor: active ? t.ink : t.card,
                  borderWidth: 1,
                  borderColor: active ? t.ink : t.line,
                }}>
                <Txt size={11} color={active ? t.bg : t.faint}>
                  {WD_TH[wdMon(d)]}
                </Txt>
                <Txt size={16} num weight="bold" color={active ? t.bg : t.ink}>
                  {fromISO(d).getDate()}
                </Txt>
                {isToday ? <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: ACCENT, marginTop: 2 }} /> : null}
              </Pressable>
            );
          }}
        />
        {focus !== today ? (
          <View style={{ position: 'absolute', right: 4, top: -2 }}>
            <Chip small label="วันนี้" active color={ACCENT} onPress={() => onChange(today)} />
          </View>
        ) : null}
      </View>
      <PageBtn icon="chevR" onPress={() => onChange(addDays(pageStart, PAGE))} />
    </View>
  );
}

function PageBtn({ icon, onPress }: { icon: 'chevL' | 'chevR'; onPress: () => void }) {
  const t = useTokens();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={{ width: 26, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={18} color={t.sub} />
    </Pressable>
  );
}
