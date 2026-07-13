// แท็บ 1 — วันนี้: มุมมอง วัน/สัปดาห์/เดือน + FAB (APP_STRUCTURE.md §3)
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateStrip } from '@/components/date-strip';
import { Icon } from '@/components/icon';
import { MonthGrid } from '@/components/month-grid';
import { MonthNav, WeekNav } from '@/components/period-nav';
import { Screen, TABBAR_H } from '@/components/screen';
import { Timeline } from '@/components/timeline';
import { Segmented, Txt, useTokens } from '@/components/ui';
import { WeekGrid } from '@/components/week-grid';
import { ACCENT } from '@/constants/theme';
import { mondayOf, thaiDateFull, todayISO } from '@/lib/dates';
import { useDay } from '@/stores/activities';
import { useDraft } from '@/stores/draft';
import { useUI } from '@/stores/ui';

type View3 = 'day' | 'week' | 'month';

export default function TodayScreen() {
  const t = useTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const openSheet = useUI((s) => s.openSheet);

  const [view, setView] = useState<View3>('day');
  const [focus, setFocus] = useState(todayISO());
  const [monday, setMonday] = useState(mondayOf(todayISO()));
  const [ym, setYm] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const items = useDay(focus);

  const goDay = (iso: string) => {
    setFocus(iso);
    setView('day');
  };

  return (
    <Screen title="วันนี้" subtitle={thaiDateFull(focus)} scroll={false}>
      <View style={{ paddingHorizontal: 18, marginBottom: 10 }}>
        <Segmented
          options={[
            { key: 'day', label: 'วัน' },
            { key: 'week', label: 'สัปดาห์' },
            { key: 'month', label: 'เดือน' },
          ]}
          value={view}
          onChange={setView}
        />
      </View>

      {view === 'day' ? (
        <>
          <DateStrip focus={focus} onChange={setFocus} />
          <View style={{ flex: 1, marginTop: 8 }}>
            {items.length === 0 ? (
              <Txt size={13} color={t.faint} style={{ textAlign: 'center', marginTop: 30 }}>
                ยังไม่มีกิจกรรมวันนี้ — แตะ ⊕ เพื่อเพิ่ม
              </Txt>
            ) : null}
            <Timeline date={focus} items={items} onPressItem={(it) => openSheet(it.id, it.date)} />
          </View>
        </>
      ) : null}

      {view === 'week' ? (
        <>
          <WeekNav monday={monday} onChange={setMonday} />
          <WeekGrid monday={monday} onPressDay={goDay} />
        </>
      ) : null}

      {view === 'month' ? (
        <>
          <MonthNav ym={ym} onChange={setYm} />
          <View style={{ paddingHorizontal: 18 }}>
            <MonthGrid year={ym.y} month={ym.m} mode="heat-dots" onPressDay={goDay} />
          </View>
        </>
      ) : null}

      {/* FAB — เฉพาะแท็บวันนี้ */}
      <Pressable
        onPress={() => {
          useDraft.getState().reset();
          useDraft.getState().set({ dates: [focus] });
          router.push('/add');
        }}
        style={{
          position: 'absolute',
          right: 18,
          bottom: TABBAR_H + insets.bottom + 16,
          width: 56,
          height: 56,
          borderRadius: 20,
          backgroundColor: ACCENT,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: ACCENT,
          shadowOpacity: 0.45,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 5 },
          elevation: 8,
        }}>
        <Icon name="plus" size={26} color="#FFFFFF" />
      </Pressable>
    </Screen>
  );
}
