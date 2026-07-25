// แท็บ 1 — วันนี้: มุมมอง วัน/สัปดาห์/เดือน/ปี (ลุค mockup iOS Calendar, ธีมเดิม) + fabbar ลอยล่าง
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { WeekNav } from '@/components/period-nav';
import { Screen, TABBAR_H } from '@/components/screen';
import { TodayDayView } from '@/components/today/day-view';
import { TodayDeleteBar, TodayFabBar } from '@/components/today/fab-bar';
import { TodayMonthView } from '@/components/today/month-view';
import { ViewSwitcher, type View3 } from '@/components/today/parts';
import { itemKey, TodayWeekView } from '@/components/today/week-view';
import { TodayYearView } from '@/components/today/year-view';
import { Txt, useTokens } from '@/components/ui';
import { DANGER } from '@/constants/theme';
import { fromISO, mondayOf, todayISO } from '@/lib/dates';
import type { DayItem } from '@/lib/types';
import { useActivities } from '@/stores/activities';
import { useDraft } from '@/stores/draft';
import { useUI } from '@/stores/ui';

export default function TodayScreen() {
  const router = useRouter();
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const openSheet = useUI((s) => s.openSheet);
  const showToast = useUI((s) => s.showToast);
  const freeMode = useUI((s) => s.freeMode);
  const deleteOne = useActivities((s) => s.deleteOne);

  const [view, setView] = useState<View3>('day');
  const [focus, setFocus] = useState(todayISO());
  const [monday, setMonday] = useState(mondayOf(todayISO()));
  const [ym, setYm] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  // โหมดลบ (เฉพาะมุมมองสัปดาห์) — เลือกได้หลายรายการแล้วลบทีเดียว · เก็บ DayItem ไว้ทั้งตัวเพราะ deleteOne ต้องใช้ occurrence จริง
  const [delMode, setDelMode] = useState(false);
  const [picked, setPicked] = useState<DayItem[]>([]);
  const [confirming, setConfirming] = useState(false);
  const pickedKeys = new Set(picked.map(itemKey));

  const exitDelMode = () => {
    setDelMode(false);
    setPicked([]);
    setConfirming(false);
  };

  // เปลี่ยนสัปดาห์ (ทั้งปุ่ม ‹ › และปัดหัวคอลัมน์) → ล้างรายการที่เลือก กันลบของสัปดาห์ที่มองไม่เห็นแล้ว
  const changeMonday = (m: string) => {
    setPicked([]);
    setConfirming(false);
    setMonday(m);
  };

  const togglePick = (it: DayItem) => {
    setConfirming(false); // เปลี่ยนรายการที่เลือก → เริ่มยืนยันใหม่
    setPicked((cur) => (cur.some((x) => itemKey(x) === itemKey(it)) ? cur.filter((x) => itemKey(x) !== itemKey(it)) : [...cur, it]));
  };

  // กดลบครั้งแรก = ขอยืนยัน · ครั้งที่สอง = ลบจริง (ทีละ occurrence — ชุดทำซ้ำถูกยกเลิกเฉพาะวันที่เลือก)
  const onPressDelete = () => {
    if (!picked.length) return;
    if (!confirming) return setConfirming(true);
    const n = picked.length;
    for (const it of picked) deleteOne(it);
    exitDelMode();
    showToast(`ลบแล้ว ${n} รายการ`);
  };

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

  // แตะช่วงเวลาว่าง (โหมดวันที่ว่าง) → เปิดฟอร์มเพิ่ม พร้อม prefill วันและช่วงเวลา
  const openSlot = (date: string, start: number, end: number) => {
    useDraft.getState().reset();
    useDraft.getState().set({ dates: [date], start, end });
    router.push('/add');
  };

  const shiftMonth = (d: number) => {
    const dt = new Date(ym.y, ym.m + d, 1);
    setYm({ y: dt.getFullYear(), m: dt.getMonth() });
  };

  // "วันนี้" — รีเซ็ตทุก state กลับมาที่วันนี้ + สลับมามุมมองวันเสมอ
  const now = fromISO(todayISO());
  const goToday = () => {
    setFocus(todayISO());
    setMonday(mondayOf(todayISO()));
    setYm({ y: now.getFullYear(), m: now.getMonth() });
    setView('day');
  };
  const atToday =
    view === 'day'
      ? focus === todayISO()
      : view === 'week'
        ? monday === mondayOf(todayISO())
        : view === 'month'
          ? ym.y === now.getFullYear() && ym.m === now.getMonth()
          : ym.y === now.getFullYear();

  const bottomPad = TABBAR_H + insets.bottom + 70;

  return (
    <Screen title="วันนี้" scroll={false}>
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
          view={view}
          onChangeView={setView}
          freeMode={freeMode}
          onPressSlot={openSlot}
        />
      ) : null}

      {view === 'week' ? (
        <>
          {/* week ไม่มีแถวหัวที่ว่างพอจะรวมกับป้ายช่วง (ป้ายวันที่ยาว) — ปุ่มโหมดลบชิดซ้าย + ตัวสลับมุมมองชิดขวา */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 2 }}>
            <Pressable
              onPress={() => (delMode ? exitDelMode() : setDelMode(true))}
              hitSlop={6}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                height: 34,
                paddingHorizontal: 12,
                borderRadius: 99,
                borderWidth: 1,
                borderColor: delMode ? DANGER : t.line,
                backgroundColor: delMode ? DANGER + '26' : 'transparent',
              }}>
              <Icon name="trash" size={16} color={delMode ? DANGER : t.sub} />
              <Txt size={13} weight={delMode ? 'bold' : 'med'} color={delMode ? DANGER : t.sub}>
                ลบ
              </Txt>
            </Pressable>
            <View style={{ flex: 1 }} />
            <ViewSwitcher
              value={view}
              onChange={(v) => {
                exitDelMode(); // ออกจากมุมมองสัปดาห์ = จบโหมดลบ (ทิ้งรายการที่เลือกไว้)
                setView(v);
              }}
            />
          </View>
          <WeekNav monday={monday} onChange={changeMonday} />
          <TodayWeekView
            monday={monday}
            onChangeMonday={changeMonday}
            onPressItem={(it) => openSheet(it.id, it.date)}
            onPressDay={goDay}
            bottomPad={bottomPad}
            freeMode={freeMode}
            onPressSlot={openSlot}
            delMode={delMode}
            selectedKeys={pickedKeys}
            onToggleSelect={togglePick}
          />
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
          view={view}
          onChangeView={setView}
          freeMode={freeMode}
          onPressSlot={openSlot}
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
          view={view}
          onChangeView={setView}
        />
      ) : null}

      {/* fabbar ลอยล่าง — เฉพาะแท็บวันนี้ · ระหว่างโหมดลบสลับเป็นแถบเลือก/ยืนยันลบ */}
      {delMode ? (
        <TodayDeleteBar
          count={picked.length}
          bottom={TABBAR_H + insets.bottom + 16}
          confirming={confirming}
          onCancel={() => (confirming ? setConfirming(false) : exitDelMode())}
          onPressDelete={onPressDelete}
        />
      ) : (
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
      )}
    </Screen>
  );
}
