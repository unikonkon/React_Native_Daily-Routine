// แท็บ 3 — สรุป: โหมด "วันว่าง" (Free Slot) / "สรุปเคส" (APP_STRUCTURE.md §5)
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { GREEN } from '@/constants/theme';
import { DateStrip } from '@/components/date-strip';
import { Icon } from '@/components/icon';
import { MonthGrid } from '@/components/month-grid';
import { MonthNav, WeekNav } from '@/components/period-nav';
import { Screen } from '@/components/screen';
import { Timeline } from '@/components/timeline';
import { WeekGrid } from '@/components/week-grid';
import { Card, PriBadge, Segmented, Txt, useTokens } from '@/components/ui';
import { addDays, fmtMin, mondayOf, thaiDate, todayISO } from '@/lib/dates';
import { freeMinutes, freeSlots } from '@/lib/engine';
import { useActivities, useDay, useDayReader } from '@/stores/activities';
import { useContacts } from '@/stores/contacts';
import { useDraft } from '@/stores/draft';
import { useUI } from '@/stores/ui';

type View3 = 'day' | 'week' | 'month';

export default function SummaryScreen() {
  const [mode, setMode] = useState<'free' | 'cases'>('free');
  return (
    <Screen title="สรุป" subtitle={mode === 'free' ? 'ช่วงเวลาว่าง' : 'เคสนัดหมาย'} scroll={false}>
      <View style={{ paddingHorizontal: 18, marginBottom: 10 }}>
        <Segmented
          options={[
            { key: 'free', label: '🟢 วันว่าง' },
            { key: 'cases', label: '👥 สรุปเคส' },
          ]}
          value={mode}
          onChange={setMode}
        />
      </View>
      {mode === 'free' ? <FreeMode /> : <CasesMode />}
    </Screen>
  );
}

// ---------- โหมดวันว่าง ----------

function FreeMode() {
  const t = useTokens();
  const router = useRouter();
  const [view, setView] = useState<View3>('day');
  const [focus, setFocus] = useState(todayISO());
  const [monday, setMonday] = useState(mondayOf(todayISO()));
  const [ym, setYm] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const items = useDay(focus);
  const slots = useMemo(() => freeSlots(items), [items]);
  const freeH = freeMinutes(slots) / 60;

  const book = (start: number, end: number) => {
    const dr = useDraft.getState();
    dr.reset();
    dr.loadSlot(focus, start, start + Math.min(60, end - start));
    router.push('/add');
  };

  const goDay = (iso: string) => {
    setFocus(iso);
    setView('day');
  };

  return (
    <>
      <View style={{ paddingHorizontal: 18, marginBottom: 8 }}>
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
          <View style={{ marginHorizontal: 18, marginTop: 8 }}>
            <Card tone="card2" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Txt size={34} num weight="bold" color={GREEN}>
                {freeH % 1 === 0 ? freeH : freeH.toFixed(1)}
              </Txt>
              <View>
                <Txt size={14} weight="med">เวลาว่าง ({thaiDate(focus)})</Txt>
                <Txt size={12} color={t.faint}>{slots.length} ช่วงว่าง · แตะเพื่อจอง</Txt>
              </View>
            </Card>
          </View>
          <View style={{ flex: 1, marginTop: 8 }}>
            <Timeline date={focus} items={items} mode="free" onPressSlot={(s) => book(s.start, s.end)} />
          </View>
        </>
      ) : null}

      {view === 'week' ? (
        <>
          <WeekNav monday={monday} onChange={setMonday} />
          <WeekGrid monday={monday} mode="free" onPressDay={goDay} />
        </>
      ) : null}

      {view === 'month' ? (
        <>
          <MonthNav ym={ym} onChange={setYm} />
          <View style={{ paddingHorizontal: 18 }}>
            <MonthGrid year={ym.y} month={ym.m} mode="heat-hours" onPressDay={goDay} />
          </View>
        </>
      ) : null}
    </>
  );
}

// ---------- โหมดสรุปเคส ----------

function CasesMode() {
  const t = useTokens();
  const getDay = useDayReader(); // อ่านผ่าน hook — อัปเดตเมื่อข้อมูลเปลี่ยน (ปลอดภัยกับ React Compiler)
  const rescCounts = useActivities((s) => s.rescCounts);
  const contacts = useContacts((s) => s.list);
  const openSheet = useUI((s) => s.openSheet);

  // นัดเคสช่วง 7 วันก่อน → 30 วันหน้า (ขยายจาก series ใน memory — ไม่ query DB)
  const rows = useMemo(() => {
    const today = todayISO();
    const out: ReturnType<typeof getDay> = [];
    for (let i = -7; i <= 30; i++) {
      for (const it of getDay(addDays(today, i))) if (it.cat === 'case') out.push(it);
    }
    return out;
  }, [getDay]);

  const done = rows.filter((r) => r.ostatus === 'done').length;
  const resc = rows.filter((r) => r.ostatus === 'rescheduled').length;

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 140, gap: 10 }} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <StatCard label="ทั้งหมด" value={rows.length} color={t.ink} />
        <StatCard label="เสร็จ" value={done} color={GREEN} />
        <StatCard label="เลื่อน" value={resc} color="#D2603A" />
      </View>

      {rows.length === 0 ? (
        <Txt size={13} color={t.faint} style={{ textAlign: 'center', marginTop: 20 }}>
          ยังไม่มีนัดเคสในช่วงนี้
        </Txt>
      ) : (
        rows.map((r) => {
          const names = r.contactIds.map((cid) => contacts.find((c) => c.id === cid)?.name).filter(Boolean).join(', ');
          const nResc = rescCounts[r.id] ?? 0;
          return (
            <Pressable key={`${r.id}:${r.date}`} onPress={() => openSheet(r.id, r.date)}>
              <Card style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <PriBadge id={r.priority} />
                  <Txt size={14} weight="med" style={{ flex: 1 }} numberOfLines={1}>{r.title}</Txt>
                  {r.ostatus === 'done' ? <Icon name="check" size={15} color={GREEN} /> : null}
                  {r.ostatus === 'rescheduled' ? <Txt size={11} color="#D2603A">เลื่อนแล้ว</Txt> : null}
                </View>
                <Txt size={12} num color={t.sub}>
                  {thaiDate(r.date)} · {fmtMin(r.startMin)}–{fmtMin(r.endMin)} · {r.channel === 'online' ? 'ออนไลน์' : 'พบตัว'}
                  {names ? ` · ${names}` : ''}
                </Txt>
                {nResc > 0 ? <Txt size={11} color={t.faint}>เลื่อนมาแล้ว {nResc} ครั้ง</Txt> : null}
              </Card>
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const t = useTokens();
  return (
    <Card style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Txt size={24} num weight="bold" color={color}>{value}</Txt>
      <Txt size={11} color={t.faint}>{label}</Txt>
    </Card>
  );
}
