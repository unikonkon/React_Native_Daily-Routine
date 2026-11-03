// แท็บ 1 — วันนี้ (ระบบ B1): มุมมอง วัน/สัปดาห์/เดือน/ปี + แถววันที่ (ไอคอนมุมมอง 4 อัน) + แถบลอยล่าง ‹ วันนี้ › · ปฏิทิน · ＋
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BOTTOM_BAR_SPACE, CalendarBar } from '@/components/b1/bottom-bar';
import { DateHeader, type CalView } from '@/components/b1/date-header';
import { useNow } from '@/components/b1/use-now';
import { Screen } from '@/components/screen';
import { SvgIcon } from '@/components/svg-icon';
import { TodayDayView } from '@/components/today/day-view';
import { TodayMonthView } from '@/components/today/month-view';
import { TodayWeekView } from '@/components/today/week-view';
import { TodayYearView } from '@/components/today/year-view';
import { Txt, useTokens } from '@/components/ui';
import { addDays, beYear, fromISO, mondayOf, MONTH_TH, MONTH_TH_FULL, todayISO, toISO, VIEW_MAX_Y, VIEW_MIN_Y } from '@/lib/dates';
import { dayProgress, type NowRef } from '@/lib/progress';
import type { DayItem } from '@/lib/types';
import { useDayReader } from '@/stores/activities';
import { useDraft } from '@/stores/draft';
import { useUI } from '@/stores/ui';

/** รวมความคืบหน้าของช่วงวัน (ถึงวันนี้) — ใช้บรรทัดสรุปของหัวสัปดาห์/เดือน/ปี */
function rangeProgress(getDay: (d: string) => DayItem[], from: string, to: string, now: NowRef) {
  let total = 0;
  let done = 0;
  let overdue = 0;
  const last = to < now.date ? to : now.date;
  for (let d = from; d <= last; d = addDays(d, 1)) {
    const p = dayProgress(getDay(d), now);
    total += d === now.date ? p.total - p.waiting : p.total; // วันนี้: นับเฉพาะที่ถึงเวลาแล้ว
    done += p.done;
    overdue += p.overdue;
  }
  return { total, done, overdue, rate: total ? done / total : 0 };
}

export default function TodayScreen() {
  const router = useRouter();
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const openSheet = useUI((s) => s.openSheet);
  const freeMode = useUI((s) => s.freeMode);
  const getDay = useDayReader();
  const now = useNow();

  const [view, setView] = useState<CalView>('day');
  const [focus, setFocus] = useState(todayISO());
  const [monday, setMonday] = useState(mondayOf(todayISO()));
  const [ym, setYm] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  // กด "วันนี้" ขณะอยู่วันนี้แล้ว → มุมมองวันเลื่อนไปที่เส้น "ตอนนี้"
  const [scrollNow, setScrollNow] = useState(0);

  const changeMonday = (m: string) => setMonday(m);

  // หลังบันทึกจากฟอร์มเพิ่มกิจกรรม — เด้งไปมุมมองวันของวันที่เพิ่งบันทึก แล้วล้างค่าทิ้ง
  const focusDate = useUI((s) => s.focusDate);
  useEffect(() => {
    if (focusDate) {
      setFocus(focusDate);
      setView('day');
      useUI.getState().setFocusDate(null);
    }
  }, [focusDate]);

  const changeView = (v: CalView) => {
    // พามุมมองใหม่ไปช่วงเดียวกับวันที่กำลังดู
    const d = fromISO(focus);
    if (v === 'week') setMonday(mondayOf(focus));
    if (v === 'month' || v === 'year') setYm({ y: d.getFullYear(), m: d.getMonth() });
    setView(v);
  };

  const goDay = (iso: string) => {
    setFocus(iso);
    setView('day');
  };

  // แตะช่วงเวลาว่าง → เปิดฟอร์มเพิ่ม พร้อม prefill วันและช่วงเวลา
  const openSlot = (date: string, start: number, end: number) => {
    useDraft.getState().reset();
    useDraft.getState().set({ dates: [date], start, end });
    router.push('/add');
  };

  const openAdd = () => {
    // ร่างใหม่ของวันที่ดูอยู่ — เวลาตั้งต้น = ช่วงว่าง 1 ชม. แรกหลังตอนนี้ของวันนั้น
    useDraft.getState().reset(view === 'day' ? focus : todayISO());
    router.push('/add');
  };

  const today = fromISO(todayISO());
  const atToday =
    view === 'day'
      ? focus === todayISO()
      : view === 'week'
        ? monday === mondayOf(todayISO())
        : view === 'month'
          ? ym.y === today.getFullYear() && ym.m === today.getMonth()
          : ym.y === today.getFullYear();

  // "วันนี้" — ไปช่วงของวันนี้ในมุมมองเดิม · อยู่วันนี้แล้ว (มุมมองวัน) = เลื่อนไปที่ "ตอนนี้"
  const goToday = () => {
    if (view === 'day' && atToday) return setScrollNow((n) => n + 1);
    setFocus(todayISO());
    changeMonday(mondayOf(todayISO()));
    setYm({ y: today.getFullYear(), m: today.getMonth() });
  };

  const step = (dir: 1 | -1) => {
    if (view === 'day') setFocus(addDays(focus, dir));
    else if (view === 'week') changeMonday(addDays(monday, dir * 7));
    else if (view === 'month') {
      const dt = new Date(ym.y, ym.m + dir, 1);
      setYm({ y: dt.getFullYear(), m: dt.getMonth() });
    } else {
      const y = ym.y + dir;
      if (y >= VIEW_MIN_Y && y <= VIEW_MAX_Y) setYm({ ...ym, y });
    }
  };
  const unit = { day: 'วัน', week: 'สัปดาห์', month: 'เดือน', year: 'ปี' }[view];

  // บรรทัดสรุปของหัวสัปดาห์/เดือน/ปี (มุมมองวันทำเอง)
  const header = useMemo(() => {
    if (view === 'week') {
      const a = fromISO(monday);
      const b = fromISO(addDays(monday, 6));
      const p = rangeProgress(getDay, monday, addDays(monday, 6), now);
      const title = a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${MONTH_TH[a.getMonth()]}` : `${a.getDate()} ${MONTH_TH[a.getMonth()]} – ${b.getDate()} ${MONTH_TH[b.getMonth()]}`;
      return { title, summary: `${beYear(b.getFullYear())}${p.total ? ` · เสร็จ ${p.done}/${p.total}` : ''}${p.overdue ? ` · ค้าง ${p.overdue}` : ''}` };
    }
    if (view === 'month') {
      const from = toISO(new Date(ym.y, ym.m, 1));
      const p = rangeProgress(getDay, from, toISO(new Date(ym.y, ym.m + 1, 0)), now);
      return {
        title: `${MONTH_TH_FULL[ym.m]} ${beYear(ym.y)}`,
        summary: from > now.date ? 'ยังไม่ถึง' : p.total ? `ถึงวันนี้เสร็จ ${Math.round(p.rate * 100)}%${p.overdue ? ` · ค้าง ${p.overdue} รายการ` : ''}` : 'ยังไม่มีรายการ',
      };
    }
    if (view === 'year') {
      const p = rangeProgress(getDay, `${ym.y}-01-01`, `${ym.y}-12-31`, now);
      const n = fromISO(now.date);
      return { title: `${beYear(ym.y)}`, summary: p.total ? `ทำเสร็จ ${Math.round(p.rate * 100)}%${ym.y === n.getFullYear() ? ` · ข้อมูลถึง ${n.getDate()} ${MONTH_TH[n.getMonth()]}` : ''}` : 'ยังไม่มีรายการ' };
    }
    return null;
  }, [view, monday, ym, getDay, now]);

  const bottomPad = insets.bottom + BOTTOM_BAR_SPACE + 16;

  return (
    <Screen title="วันนี้" scroll={false} showFreeToggle={view !== 'year'}>
      {view === 'day' ? (
        <TodayDayView
          focus={focus}
          onChangeFocus={setFocus}
          onPressTitle={() => changeView('month')}
          onPressItem={(it) => openSheet(it.id, it.date)}
          bottomPad={bottomPad}
          view={view}
          onChangeView={changeView}
          onPressSlot={openSlot}
          onAdd={openAdd}
          scrollToNowSignal={scrollNow}
          freeMode={freeMode}
        />
      ) : (
        <DateHeader
          title={header?.title ?? ''}
          summary={header?.summary}
          onPressTitle={view === 'month' ? () => changeView('year') : view === 'year' ? undefined : () => changeView('month')}
          view={view}
          onChangeView={changeView}
        />
      )}

      {view === 'week' ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 6, paddingBottom: 2 }}>
            <View style={{ flex: 1 }} />
            {/* ลบหลายรายการ → หน้า "ลบรายการ" (เลือกทีละรายการ / ทั้งวัน / สัปดาห์ / เดือน) */}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/settings/delete')}
              style={({ pressed }) => ({ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: pressed ? t.rail : t.track, flexDirection: 'row', alignItems: 'center', gap: 6 })}>
              <SvgIcon name="trash" size={15} color={t.sub} />
              <Txt size={13} weight="med" color={t.sub}>
                ลบหลายรายการ
              </Txt>
            </Pressable>
          </View>
          <TodayWeekView
            monday={monday}
            onChangeMonday={changeMonday}
            onPressItem={(it) => openSheet(it.id, it.date)}
            onPressDay={goDay}
            bottomPad={bottomPad}
            freeMode={freeMode}
            onPressSlot={openSlot}
          />
        </>
      ) : null}

      {view === 'month' ? (
        <TodayMonthView
          year={ym.y}
          month={ym.m}
          selected={focus}
          onPressDay={goDay}
          onVisibleMonth={setYm}
          bottomPad={bottomPad}
          freeMode={freeMode}
          onPressSlot={openSlot}
          onPressItem={(it) => openSheet(it.id, it.date)}
        />
      ) : null}

      {view === 'year' ? (
        <TodayYearView
          year={ym.y}
          onPressMonth={(m) => {
            setYm({ y: ym.y, m });
            setView('month');
          }}
          bottomPad={bottomPad}
        />
      ) : null}

      <CalendarBar
        onPrev={() => step(-1)}
        onNext={() => step(1)}
        prevLabel={`${unit}ก่อน`}
        nextLabel={`${unit}ถัดไป`}
        onToday={goToday}
        atToday={atToday}
        onCalendar={() => changeView('month')}
        calendarActive={view === 'month'}
        onAdd={openAdd}
      />
    </Screen>
  );
}
