// แท็บ 1 — วันนี้: มุมมอง วัน/สัปดาห์/เดือน + FAB (APP_STRUCTURE.md §3)
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateStrip } from '@/components/date-strip';
import { Icon } from '@/components/icon';
import { MonthGrid } from '@/components/month-grid';
import { Screen, TABBAR_H } from '@/components/screen';
import { Timeline } from '@/components/timeline';
import { Segmented, Txt, useTokens } from '@/components/ui';
import { WeekGrid } from '@/components/week-grid';
import { ACCENT } from '@/constants/theme';
import { MONTH_TH_FULL, addDays, beYear, mondayOf, thaiDateFull, thaiWeekRange, todayISO } from '@/lib/dates';
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
          <NavBar
            label={thaiWeekRange(monday)}
            onPrev={() => setMonday(addDays(monday, -7))}
            onNext={() => setMonday(addDays(monday, 7))}
          />
          <WeekGrid monday={monday} onPressDay={goDay} />
        </>
      ) : null}

      {view === 'month' ? (
        <>
          <NavBar
            label={`${MONTH_TH_FULL[ym.m]} ${beYear(ym.y)}`}
            onPrev={() => setYm(shiftMonth(ym, -1))}
            onNext={() => setYm(shiftMonth(ym, 1))}
          />
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

function shiftMonth(ym: { y: number; m: number }, d: number) {
  const dt = new Date(ym.y, ym.m + d, 1);
  return { y: dt.getFullYear(), m: dt.getMonth() };
}

function NavBar({ label, onPrev, onNext }: { label: string; onPrev: () => void; onNext: () => void }) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, marginBottom: 8 }}>
      <Pressable onPress={onPrev} style={{ padding: 6 }}>
        <Icon name="chevL" size={20} color={t.sub} />
      </Pressable>
      <Txt size={14} weight="med" style={{ flex: 1, textAlign: 'center' }}>
        {label}
      </Txt>
      <Pressable onPress={onNext} style={{ padding: 6 }}>
        <Icon name="chevR" size={20} color={t.sub} />
      </Pressable>
    </View>
  );
}
