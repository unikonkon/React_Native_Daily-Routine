// แท็บ 1 — วันนี้ (ระบบ B1): มุมมอง วัน/สัปดาห์/เดือน/ปี + แถววันที่ (ไอคอนมุมมอง 4 อัน) + แถบลอยล่าง ‹ วันนี้ › · ปฏิทิน · ＋
import { useRouter } from 'expo-router';
import { memo, startTransition, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BOTTOM_BAR_SPACE, CalendarBar } from '@/components/b1/bottom-bar';
import { DateHeader, type CalView } from '@/components/b1/date-header';
import { useNow } from '@/components/b1/use-now';
import { Screen } from '@/components/screen';
import { TodayDayView } from '@/components/today/day-view';
import { Layer } from '@/components/today/keep-alive';
import { TodayMonthView } from '@/components/today/month-view';
import { TodayWeekView } from '@/components/today/week-view';
import { TodayYearView } from '@/components/today/year-view';
import { addDays, beYear, fmtRange, fromISO, mondayOf, MONTH_TH, MONTH_TH_FULL, todayISO, toISO, VIEW_MAX_Y, VIEW_MIN_Y } from '@/lib/dates';
import { dayProgress, type NowRef } from '@/lib/progress';
import type { DayItem } from '@/lib/types';
import { useDayReader } from '@/stores/activities';
import { isNewDraft, useDraft } from '@/stores/draft';
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

/**
 * มุมมองที่สร้างไว้ล่วงหน้าเบื้องหลังหลังจอแรกขึ้นแล้ว (ms) — แตะครั้งแรกก็สลับได้ทันทีเหมือนครั้งถัด ๆ ไป
 * สร้างแบบงานเบื้องหลัง (transition) ทีละมุมมอง ไม่แย่งการแตะ/เลื่อนของจอที่ดูอยู่ · มุมมองปีไม่สร้างล่วงหน้า (คิดข้อมูลทั้งปี และใช้น้อย)
 */
const PREMOUNT: { view: CalView; after: number }[] = [
  { view: 'week', after: 1500 },
  { view: 'month', after: 3000 },
];

type YM = { y: number; m: number };

// มุมมองแต่ละตัวห่อด้วย memo — ชั้นที่สลับเข้า/ออกโดยค่าที่ส่งให้ไม่เปลี่ยน (เช่น แค่สลับมุมมองไปมา) ไม่ต้องคิดทั้งจอใหม่
// (คู่กับ callback ที่ตั้งชื่อไว้ใน TodayScreen ด้านล่าง — ฟังก์ชันที่เขียนฝังใน JSX ถูกสร้างใหม่ทุกครั้ง memo จะไม่ช่วย)
const DayView = memo(TodayDayView);
const WeekView = memo(TodayWeekView);
const MonthView = memo(TodayMonthView);
const YearView = memo(TodayYearView);

/** หัวของมุมมองสัปดาห์/เดือน/ปี — ชื่อช่วง + บรรทัดสรุปความคืบหน้า (มุมมองวันมีหัวของตัวเอง) · อยู่ในชั้นของมุมมองนั้น จึงค้างค่าไว้ตอนถูกซ่อน */
const PeriodHeader = memo(function PeriodHeader({ kind, monday, y, m, picked, onChangeView }: { kind: 'week' | 'month' | 'year'; monday: string; y: number; m: number; picked: CalView; onChangeView: (v: CalView) => void }) {
  const getDay = useDayReader();
  const now = useNow();
  const header = useMemo(() => {
    const ym = { y, m };
    if (kind === 'week') {
      const a = fromISO(monday);
      const b = fromISO(addDays(monday, 6));
      const p = rangeProgress(getDay, monday, addDays(monday, 6), now);
      const title = a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${MONTH_TH[a.getMonth()]}` : `${a.getDate()} ${MONTH_TH[a.getMonth()]} – ${b.getDate()} ${MONTH_TH[b.getMonth()]}`;
      return { title, summary: `${beYear(b.getFullYear())}${p.total ? ` · เสร็จ ${p.done}/${p.total}` : ''}${p.overdue ? ` · ยังไม่บันทึก ${p.overdue}` : ''}` };
    }
    if (kind === 'month') {
      const from = toISO(new Date(ym.y, ym.m, 1));
      const p = rangeProgress(getDay, from, toISO(new Date(ym.y, ym.m + 1, 0)), now);
      return {
        title: `${MONTH_TH_FULL[ym.m]} ${beYear(ym.y)}`,
        summary: from > now.date ? 'ยังไม่ถึง' : p.total ? `เสร็จ ${Math.round(p.rate * 100)}%${p.overdue ? ` · ยังไม่บันทึก ${p.overdue}` : ''}` : 'ยังไม่มีรายการ',
      };
    }
    const p = rangeProgress(getDay, `${ym.y}-01-01`, `${ym.y}-12-31`, now);
    const n = fromISO(now.date);
    return { title: `${beYear(ym.y)}`, summary: p.total ? `ทำเสร็จ ${Math.round(p.rate * 100)}%${ym.y === n.getFullYear() ? ` · ข้อมูลถึง ${n.getDate()} ${MONTH_TH[n.getMonth()]}` : ''}` : 'ยังไม่มีรายการ' };
  }, [kind, monday, y, m, getDay, now]);
  return (
    <DateHeader
      title={header.title}
      summary={header.summary}
      onPressTitle={kind === 'month' ? () => onChangeView('year') : kind === 'year' ? undefined : () => onChangeView('month')}
      view={picked}
      onChangeView={onChangeView}
    />
  );
});

export default function TodayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const openSheet = useUI((s) => s.openSheet);
  const freeMode = useUI((s) => s.freeMode);
  const now = useNow();

  // มุมมองทั้ง 4 เป็น "ชั้น" ที่เปิดแล้วเก็บไว้ (components/today/keep-alive) — สลับกลับไปมุมมองที่เคยเปิด = แค่เปิดชั้นให้เห็น ไม่สร้างใหม่
  //   picked  = มุมมองที่ผู้ใช้เพิ่งแตะ (ตัวเลือกมุมมองที่หัวจอติดสถานะทันที)
  //   mounted = มุมมองที่สร้างไว้แล้ว · มุมมองที่ยังไม่เคยเปิดถูกสร้างเป็นงานเบื้องหลัง (transition) แอปไม่ค้างตอนแตะ
  //   view    = มุมมองที่แสดงอยู่จริง — เท่ากับ picked เมื่อชั้นนั้นพร้อม · ระหว่างรอ = มุมมองเดิม (จางลงเล็กน้อย)
  const [picked, setPicked] = useState<CalView>('day');
  const [mounted, setMounted] = useState<CalView[]>(['day']);
  const [shown, setShown] = useState<CalView>('day');
  const ready = mounted.includes(picked);
  if (ready && shown !== picked) setShown(picked);
  const view = ready ? picked : shown;
  // ไม่อ่าน mounted ตรง ๆ ในฟังก์ชันนี้ (เช็กใน updater แทน) — ฟังก์ชันจึงเป็นตัวเดิมตลอด callback ที่ต่อจากมัน (goDay ฯลฯ)
  // ไม่เปลี่ยนตาม ชั้นที่ซ่อนอยู่จึงไม่ต้องถูกวาดใหม่ตอนกลับมาแสดงเพียงเพราะได้ฟังก์ชันตัวใหม่
  const setView = (v: CalView) => {
    setPicked(v);
    startTransition(() => setMounted((m) => (m.includes(v) ? m : [...m, v])));
  };
  useEffect(() => {
    // ถึงเวลาแล้วรอให้เครื่องว่างก่อน (requestIdleCallback) — ไม่แทรกงานสร้างจอระหว่างที่ผู้ใช้กำลังแตะ/เลื่อนอยู่
    const idle = (run: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(run, { timeout: 2500 }) : run());
    const ids = PREMOUNT.map((p) => setTimeout(() => idle(() => startTransition(() => setMounted((m) => (m.includes(p.view) ? m : [...m, p.view])))), p.after));
    return () => ids.forEach(clearTimeout);
  }, []);

  const [focus, setFocus] = useState(todayISO());
  const [monday, setMonday] = useState(mondayOf(todayISO()));
  const [ym, setYm] = useState<YM>(() => {
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
      setPicked('day');
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
  // แตะช่วงว่าง (โหมดเวลาว่าง — วัน/สัปดาห์/เดือน) → ฟอร์มเพิ่มลงวันและช่วงเวลานั้น (ล็อกไว้ ไม่ให้เวลาตั้งต้นทับ)
  const openSlot = (date: string, start: number, end: number) => {
    const dr = useDraft.getState();
    if (isNewDraft(dr)) {
      // มีร่างที่กรอกค้างไว้ → ไม่ทับ: ใส่ช่วงเวลานี้ให้ร่างเดิม (ร่างครั้งเดียวย้ายวันตามด้วย · ร่างทำซ้ำคงวันที่เลือกไว้)
      dr.set({ start, end, pinned: true, ...(dr.repeat === 'none' ? { dates: [date] } : {}) });
      useUI.getState().showToast(`ใส่เวลา ${fmtRange(start, end)} ให้ร่างที่ทำค้างไว้`, { label: 'เริ่มใหม่', run: () => useDraft.getState().loadSlot(date, start, end) });
    } else dr.loadSlot(date, start, end);
    router.push('/add');
  };

  // callback ที่ส่งให้มุมมอง — ตั้งชื่อไว้ตรงนี้ (ไม่เขียนฝังใน JSX) ให้ตัวเดิมถูกใช้ซ้ำข้ามการวาด มุมมองที่ห่อ memo จึงข้ามได้
  const openItem = (it: DayItem) => openSheet(it.id, it.date);
  const titleToMonth = () => changeView('month');
  const openDeleteMany = () => router.push('/settings/delete');
  const pickMonth = (m: number) => {
    setYm({ y: ym.y, m });
    setView('month');
  };

  const openAdd = () => {
    const dr = useDraft.getState();
    const day = view === 'day' ? focus : todayISO();
    if (isNewDraft(dr) || dr.editId) {
      // มีร่าง/การแก้ไขค้างอยู่ → พาไปทำต่อ ไม่ล้างทิ้งเงียบ ๆ (เดิมกด ＋ แล้วที่กรอกไว้หายหมด) · อยากเริ่มใหม่กดในแถบแจ้ง
      useUI.getState().showToast(dr.editId ? 'ยังแก้ไขกิจกรรมค้างอยู่ — ทำต่อได้เลย' : 'มีร่างที่ทำค้างไว้ — ทำต่อได้เลย', { label: 'เริ่มใหม่', run: () => useDraft.getState().reset(day) });
    } else {
      // ร่างใหม่ของวันที่ดูอยู่ — เวลาตั้งต้น = ช่วงว่าง 1 ชม. แรกหลังตอนนี้ของวันนั้น
      dr.reset(day);
    }
    router.push('/add');
  };

  // วันนี้จาก useNow (state ที่อัปเดตทุกนาที) — เรียก todayISO() ตรง ๆ ตอน render แล้ว React Compiler จะ cache ค่าไว้
  // เปิดแอปทิ้งข้ามเที่ยงคืน ปุ่ม "วันนี้" จะพาไปวันเก่า
  const today = fromISO(now.date);
  const atToday =
    view === 'day'
      ? focus === now.date
      : view === 'week'
        ? monday === mondayOf(now.date)
        : view === 'month'
          ? ym.y === today.getFullYear() && ym.m === today.getMonth()
          : ym.y === today.getFullYear();

  // "วันนี้" — ไปช่วงของวันนี้ในมุมมองเดิม · อยู่วันนี้แล้ว (มุมมองวัน) = เลื่อนไปที่ "ตอนนี้"
  const goToday = () => {
    if (view === 'day' && atToday) return setScrollNow((n) => n + 1);
    const td = todayISO(); // อ่านตอนกด — ตรงเวลาจริงเสมอ
    const d = fromISO(td);
    setFocus(td);
    changeMonday(mondayOf(td));
    setYm({ y: d.getFullYear(), m: d.getMonth() });
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

  const bottomPad = insets.bottom + BOTTOM_BAR_SPACE + 16;

  return (
    <Screen title="วันนี้" scroll={false} showFreeToggle={view !== 'year'}>
      {/* ชั้นของแต่ละมุมมองซ้อนกันเต็มพื้นที่ · กำลังสร้างมุมมองที่ยังไม่เคยเปิดอยู่เบื้องหลัง → จอเดิมจางลงเล็กน้อย บอกว่ารับคำสั่งแล้ว */}
      <View style={{ flex: 1, opacity: ready ? 1 : 0.55 }}>
        <Layer active={view === 'day'}>
          <DayView
            focus={focus}
            onChangeFocus={setFocus}
            onPressTitle={titleToMonth}
            onPressItem={openItem}
            bottomPad={bottomPad}
            view={picked}
            onChangeView={changeView}
            onPressSlot={openSlot}
            onAdd={openAdd}
            scrollToNowSignal={scrollNow}
            freeMode={freeMode}
          />
        </Layer>

        {mounted.includes('week') ? (
          <Layer active={view === 'week'}>
            <PeriodHeader kind="week" monday={monday} y={ym.y} m={ym.m} picked={picked} onChangeView={changeView} />
            <WeekView monday={monday} onChangeMonday={changeMonday} onPressItem={openItem} onPressDay={goDay} bottomPad={bottomPad} freeMode={freeMode} onPressSlot={openSlot} onDeleteMany={openDeleteMany} />
          </Layer>
        ) : null}

        {mounted.includes('month') ? (
          <Layer active={view === 'month'}>
            <PeriodHeader kind="month" monday={monday} y={ym.y} m={ym.m} picked={picked} onChangeView={changeView} />
            <MonthView
              year={ym.y}
              month={ym.m}
              selected={focus}
              onPressDay={goDay}
              onVisibleMonth={setYm}
              bottomPad={bottomPad}
              freeMode={freeMode}
              onPressSlot={openSlot}
              onPressItem={openItem}
            />
          </Layer>
        ) : null}

        {mounted.includes('year') ? (
          <Layer active={view === 'year'}>
            <PeriodHeader kind="year" monday={monday} y={ym.y} m={ym.m} picked={picked} onChangeView={changeView} />
            <YearView year={ym.y} onPressMonth={pickMonth} bottomPad={bottomPad} />
          </Layer>
        ) : null}
      </View>

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
