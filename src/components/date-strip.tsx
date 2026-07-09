// แถบวันที่แนวนอน 45 วัน (เริ่มก่อนวันนี้ 3 วัน) + ชิป "วันนี้" เด้งกลับ — APP_STRUCTURE.md §3.1
import React, { useMemo, useRef } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { ACCENT } from '@/constants/theme';
import { Chip, Txt, useTokens } from '@/components/ui';
import { WD_TH, addDays, fromISO, todayISO, wdMon } from '@/lib/dates';

export function DateStrip({ focus, onChange }: { focus: string; onChange: (iso: string) => void }) {
  const t = useTokens();
  const today = todayISO();
  const days = useMemo(() => Array.from({ length: 45 }, (_, i) => addDays(today, i - 3)), [today]);
  const listRef = useRef<FlatList<string>>(null);

  return (
    <View>
      <FlatList
        ref={listRef}
        horizontal
        data={days}
        keyExtractor={(d) => d}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 18, gap: 6 }}
        getItemLayout={(_, i) => ({ length: 54, offset: 54 * i, index: i })}
        initialScrollIndex={Math.max(days.indexOf(focus) - 2, 0)}
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
        <View style={{ position: 'absolute', right: 18, top: -2 }}>
          <Chip small label="วันนี้" active color={ACCENT} onPress={() => onChange(today)} />
        </View>
      ) : null}
    </View>
  );
}
