// แท็บ 1 — วันนี้: มุมมอง วัน/สัปดาห์/เดือน/ปี (ลุค mockup iOS Calendar, ธีมเดิม) + fabbar ลอยล่าง
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WeekNav } from '@/components/period-nav';
import { Screen, TABBAR_H } from '@/components/screen';
import { TodayDayView } from '@/components/today/day-view';
import { TodayFabBar } from '@/components/today/fab-bar';
import { TodayMonthView } from '@/components/today/month-view';
import { TodayYearView } from '@/components/today/year-view';
import { Segmented } from '@/components/ui';
import { WeekGrid } from '@/components/week-grid';
import { fromISO, mondayOf, todayISO } from '@/lib/dates';
import { useDraft } from '@/stores/draft';
import { useUI } from '@/stores/ui';

type View3 = 'day' | 'week' | 'month' | 'year';

export default function TodayScreen() {
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

  // หลังบันทึกจากฟอร์มเพิ่มกิจกรรม — เด้งไปมุมมองวันของวันที่เพิ่งบันทึก แล้วล้างค่าทิ้ง
  const focusDate = useUI((s) => s.focusDate);
  useEffect(() => {
    if (focusDate) {
      setFocus(focusDate);
      setView('day');
      useUI.getState().setFocusDate(null);
    }
  }, [focusDate]);

  const goDay = (iso: string) => {
    setFocus(iso);
    setView('day');
  };

  const shiftMonth = (d: number) => {
    const dt = new Date(ym.y, ym.m + d, 1);
    setYm({ y: dt.getFullYear(), m: dt.getMonth() });
  };

  // "วันนี้" — รีเซ็ตทุก state กลับมาที่วันนี้ (คงมุมมองเดิม)
  const now = fromISO(todayISO());
  const goToday = () => {
    setFocus(todayISO());
    setMonday(mondayOf(todayISO()));
    setYm({ y: now.getFullYear(), m: now.getMonth() });
  };
  const atToday =
    view === 'day'
      ? focus === todayISO()
      : view === 'week'
        ? monday === mondayOf(todayISO())
        : view === 'month'
          ? ym.y === now.getFullYear() && ym.m === now.getMonth()
          : ym.y === now.getFullYear();

  const bottomPad = TABBAR_H + insets.bottom + 84;

  return (
    <Screen title="วันนี้" scroll={false}>
      <View style={{ paddingHorizontal: 18, marginBottom: 10 }}>
        <Segmented
          options={[
            { key: 'day', label: 'วัน' },
            { key: 'week', label: 'สัปดาห์' },
            { key: 'month', label: 'เดือน' },
            { key: 'year', label: 'ปี' },
          ]}
          value={view}
          onChange={setView}
        />
      </View>

      {view === 'day' ? (
        <TodayDayView
          focus={focus}
          onChangeFocus={setFocus}
          onBack={() => {
            const d = fromISO(focus);
            setYm({ y: d.getFullYear(), m: d.getMonth() });
            setView('month');
          }}
          onPressItem={(it) => openSheet(it.id, it.date)}
          bottomPad={bottomPad}
        />
      ) : null}

      {view === 'week' ? (
        <>
          <WeekNav monday={monday} onChange={setMonday} />
          <WeekGrid monday={monday} onPressDay={goDay} />
        </>
      ) : null}

      {view === 'month' ? (
        <TodayMonthView
          year={ym.y}
          month={ym.m}
          selected={focus}
          onBack={() => setView('year')}
          onPrev={() => shiftMonth(-1)}
          onNext={() => shiftMonth(1)}
          onPressDay={goDay}
          bottomPad={bottomPad}
        />
      ) : null}

      {view === 'year' ? (
        <TodayYearView
          year={ym.y}
          onPrev={() => setYm({ ...ym, y: ym.y - 1 })}
          onNext={() => setYm({ ...ym, y: ym.y + 1 })}
          onPressMonth={(m) => {
            setYm({ y: ym.y, m });
            setView('month');
          }}
          bottomPad={bottomPad}
        />
      ) : null}

      {/* fabbar ลอยล่าง — เฉพาะแท็บวันนี้ */}
      <TodayFabBar
        atToday={atToday}
        bottom={TABBAR_H + insets.bottom + 16}
        onToday={goToday}
        onCalendar={() => setView('month')}
        onAdd={() => {
          useDraft.getState().reset();
          useDraft.getState().set({ dates: [focus] });
          router.push('/add');
        }}
      />
    </Screen>
  );
}
