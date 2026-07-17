// จัดการข้อมูล — ดูความจุที่ใช้ + ลบข้อมูลเป็นช่วง รายปี/รายเดือน/รายสัปดาห์/รายวัน
// รายการรายวัน derive จาก series (engine.dayItems) ส่วน "ความจุ" คิดจากขนาดแถวจริงใน SQLite (dumpAll)
// ผูกกับวันที่ของแถว: activities → start_date, occurrences → date, reschedule_logs → from_date
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { Btn, Card, Segmented, Txt, useTokens } from '@/components/ui';
import { ACCENT, CAT_BY_ID, DANGER, GREEN, type CatId } from '@/constants/theme';
import { MONTH_TH, MONTH_TH_FULL, WD_TH, addDays, beYear, fromISO, mondayOf, thaiDate, thaiWeekRange, toISO, todayISO } from '@/lib/dates';
import { dumpAll, purgeRange, type BackupData } from '@/lib/db';
import { dayItems } from '@/lib/engine';
import { useActivities } from '@/stores/activities';
import { useUI } from '@/stores/ui';

type Mode = 'year' | 'month' | 'week' | 'day';

interface DayStat {
  date: string;
  items: number;
  done: number;
  bytes: number;
  cats: CatId[];
}

interface Bucket {
  key: string;
  label: string;
  from: string;
  to: string;
  items: number;
  done: number;
  bytes: number;
  days: DayStat[];
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function rangeOf(mode: Mode, key: string): { label: string; from: string; to: string } {
  if (mode === 'day') return { label: thaiDate(key), from: key, to: key };
  if (mode === 'week') return { label: thaiWeekRange(key), from: key, to: addDays(key, 6) };
  if (mode === 'month') {
    const [y, m] = key.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return { label: `${MONTH_TH_FULL[m - 1]} ${beYear(y)}`, from: `${key}-01`, to: `${key}-${`${last}`.padStart(2, '0')}` };
  }
  return { label: `พ.ศ. ${beYear(Number(key))}`, from: `${key}-01-01`, to: `${key}-12-31` };
}

export default function ManageDataScreen() {
  const t = useTokens();
  const showToast = useUI((s) => s.showToast);
  const acts = useActivities((s) => s.acts);
  const occ = useActivities((s) => s.occ);
  const version = useActivities((s) => s.version);

  const [mode, setMode] = useState<Mode>('month');
  /** หน้าของ filter ช่วงเวลา (0 = ปัจจุบัน, +1 = ย้อนหลัง, -1 = อนาคต ทีละหน้าต่าง) — ใช้เฉพาะรายสัปดาห์/รายวัน */
  const [offset, setOffset] = useState(0);
  const [dump, setDump] = useState<BackupData | null>(null);
  const [confirm, setConfirm] = useState<Bucket | null>(null);

  // โหลดแถวดิบจาก SQLite (รวม cancelled ที่ store ไม่ถือ) — รีโหลดทุกครั้งที่ข้อมูลเปลี่ยน
  useEffect(() => {
    dumpAll().then(setDump).catch(() => {});
  }, [version]);

  // หน้าต่าง filter: รายสัปดาห์และรายวันดูครั้งละ 1 เดือน เลื่อนทีละ 1 เดือน (อดีต/อนาคตได้ไม่จำกัด)
  const window = useMemo(() => {
    if (mode !== 'week' && mode !== 'day') return null;
    const base = fromISO(todayISO());
    const m = new Date(base.getFullYear(), base.getMonth() - offset, 1);
    return {
      from: toISO(m),
      to: toISO(new Date(m.getFullYear(), m.getMonth() + 1, 0)),
      label: `${MONTH_TH_FULL[m.getMonth()]} ${beYear(m.getFullYear())}`,
    };
  }, [mode, offset]);

  // สถิติรายวัน: รายการ derive จาก series + ขนาดแถวจริงผูกกับวันที่ของแถว
  const dayStats = useMemo(() => {
    const bytes: Record<string, number> = {};
    const put = (d: string | null | undefined, row: unknown) => {
      if (!d) return;
      bytes[d] = (bytes[d] ?? 0) + JSON.stringify(row).length;
    };
    if (dump) {
      for (const a of dump.activities) put(a.start_date, a);
      for (const o of dump.occurrences) put(o.date, o);
      for (const l of dump.reschedule_logs as { from_date?: string }[]) put(l.from_date, l);
    }

    let min = todayISO();
    let max = todayISO();
    const widen = (d: string) => {
      if (d < min) min = d;
      if (d > max) max = d;
    };
    for (const a of acts) {
      widen(a.startDate);
      if (a.endDate) widen(a.endDate);
    }
    Object.keys(occ).forEach(widen);
    Object.keys(bytes).forEach(widen);
    // เลื่อนดูอนาคต: ขยายช่วงสแกนให้คลุมหน้าต่างที่เลือก — series ไม่มีวันจบจะถูก derive ให้เห็นล่วงหน้า
    if (window) {
      widen(window.from);
      widen(window.to);
    }

    const out: DayStat[] = [];
    for (let d = min; d <= max; d = addDays(d, 1)) {
      const its = dayItems(acts, occ, d);
      const b = bytes[d] ?? 0;
      if (!its.length && !b) continue;
      out.push({
        date: d,
        items: its.length,
        done: its.filter((i) => i.ostatus === 'done').length,
        bytes: b,
        cats: its.map((i) => i.cat),
      });
    }
    return out;
  }, [acts, occ, dump, window]);

  const buckets = useMemo(() => {
    const map = new Map<string, Bucket>();
    for (const ds of dayStats) {
      const key =
        mode === 'day' ? ds.date
        : mode === 'week' ? mondayOf(ds.date)
        : mode === 'month' ? ds.date.slice(0, 7)
        : ds.date.slice(0, 4);
      let b = map.get(key);
      if (!b) {
        b = { key, ...rangeOf(mode, key), items: 0, done: 0, bytes: 0, days: [] };
        map.set(key, b);
      }
      b.items += ds.items;
      b.done += ds.done;
      b.bytes += ds.bytes;
      b.days.push(ds);
    }
    return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1)); // ใหม่ → เก่า
  }, [dayStats, mode]);

  // ช่วงที่แสดงจริงตาม filter (สัปดาห์คาบเกี่ยวขอบหน้าต่างนับรวมด้วย)
  const shown = useMemo(
    () => (window ? buckets.filter((b) => b.from <= window.to && b.to >= window.from) : buckets),
    [buckets, window],
  );

  const hasOlder = window != null && dayStats.length > 0 && dayStats[0].date < window.from;

  const totals = useMemo(
    () => shown.reduce((s, b) => ({ items: s.items + b.items, done: s.done + b.done, bytes: s.bytes + b.bytes }), { items: 0, done: 0, bytes: 0 }),
    [shown],
  );

  const doDelete = async () => {
    if (!confirm) return;
    try {
      await purgeRange(confirm.from, confirm.to);
      await useActivities.getState().boot(); // รีโหลด store + resync แจ้งเตือน (version ขยับ → dump รีโหลดเอง)
      setConfirm(null);
      showToast(`ลบข้อมูล ${confirm.label} แล้ว ✓`);
    } catch {
      showToast('ลบข้อมูลไม่สำเร็จ');
    }
  };

  return (
    <Screen title="จัดการข้อมูล" subtitle="ความจุที่ใช้ & ลบข้อมูลรายช่วง" back>
      {/* สรุปรวมตามรายที่เลือก */}
      <Card style={{ gap: 10 }}>
        <Segmented
          options={[
            { key: 'year', label: 'รายปี' },
            { key: 'month', label: 'รายเดือน' },
            { key: 'week', label: 'รายสัปดาห์' },
            { key: 'day', label: 'รายวัน' },
          ]}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setOffset(0);
            setConfirm(null);
          }}
        />
        {window ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <NavBtn icon="chevL" disabled={!hasOlder} onPress={() => { setOffset(offset + 1); setConfirm(null); }} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Txt size={13} weight="bold">{window.label}</Txt>
              {offset !== 0 ? (
                <Pressable onPress={() => { setOffset(0); setConfirm(null); }} hitSlop={6}>
                  <Txt size={10} color={ACCENT}>{offset < 0 ? 'อนาคต · กลับปัจจุบัน' : 'ย้อนหลัง · กลับปัจจุบัน'}</Txt>
                </Pressable>
              ) : null}
            </View>
            <NavBtn icon="chevR" onPress={() => { setOffset(offset - 1); setConfirm(null); }} />
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Txt size={12} color={t.sub}>
            รวม {shown.length} ช่วง · {totals.items} รายการ · เสร็จ {totals.done}
          </Txt>
          <Txt size={13} num weight="bold">{fmtBytes(totals.bytes)}</Txt>
        </View>
      </Card>

      {/* ยืนยันลบ */}
      {confirm ? (
        <Card tone="card2" style={{ gap: 10 }}>
          <Txt size={14} weight="bold">ลบข้อมูล {confirm.label}?</Txt>
          <Txt size={12} color={t.sub}>
            {confirm.items} รายการ ({fmtBytes(confirm.bytes)}) จะถูกลบถาวร — รายการทำซ้ำที่คาบเกี่ยวช่วงนี้จะถูกตัดให้เหลือเฉพาะนอกช่วง
          </Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn style={{ flex: 1 }} kind="ghost" label="ยกเลิก" onPress={() => setConfirm(null)} />
            <Btn style={{ flex: 1 }} kind="danger" label="ลบถาวร" onPress={doDelete} />
          </View>
        </Card>
      ) : null}

      {shown.length === 0 ? (
        <Card>
          <Txt size={13} color={t.faint} style={{ textAlign: 'center', paddingVertical: 12 }}>
            {buckets.length === 0 ? 'ยังไม่มีข้อมูลในระบบ' : 'ไม่มีข้อมูลในช่วงนี้ — เลื่อนดูช่วงอื่นด้วยลูกศรด้านบน'}
          </Txt>
        </Card>
      ) : mode === 'year' ? (
        shown.map((b) => <YearCard key={b.key} b={b} onDelete={() => setConfirm(b)} />)
      ) : (
        <Card>
          {shown.map((b, i) =>
            mode === 'month' ? (
              <MonthRow key={b.key} b={b} last={i === shown.length - 1} onDelete={() => setConfirm(b)} />
            ) : mode === 'week' ? (
              <WeekRow key={b.key} b={b} last={i === shown.length - 1} onDelete={() => setConfirm(b)} />
            ) : (
              <DayRow key={b.key} b={b} last={i === shown.length - 1} onDelete={() => setConfirm(b)} />
            ),
          )}
        </Card>
      )}

      <Txt size={11} color={t.faint} style={{ textAlign: 'center' }}>
        ความจุคิดจากขนาดแถวข้อมูลจริงโดยประมาณ · การลบมีผลถาวร กู้คืนได้จากไฟล์สำรอง JSON เท่านั้น
      </Txt>
    </Screen>
  );
}

/** ปุ่มเลื่อนหน้าต่าง filter (◀ ย้อนหลัง / ▶ เดินหน้าไปอนาคตได้ไม่จำกัด) */
function NavBtn({ icon, disabled, onPress }: { icon: string; disabled?: boolean; onPress: () => void }) {
  const t = useTokens();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={{
        width: 32,
        height: 32,
        borderRadius: 9,
        backgroundColor: t.chip,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.35 : 1,
      }}>
      <Icon name={icon} size={16} color={t.sub} />
    </Pressable>
  );
}

function TrashBtn({ onPress }: { onPress: () => void }) {
  const t = useTokens();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="trash" size={15} color={DANGER} />
    </Pressable>
  );
}

/** รายปี — การ์ดใหญ่ + กราฟแท่งรายเดือน 12 แท่ง */
function YearCard({ b, onDelete }: { b: Bucket; onDelete: () => void }) {
  const t = useTokens();
  const perMonth = Array.from({ length: 12 }, () => 0);
  for (const d of b.days) perMonth[Number(d.date.slice(5, 7)) - 1] += d.items;
  const max = Math.max(...perMonth, 1);
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Txt size={16} weight="bold" style={{ flex: 1 }}>{b.label}</Txt>
        <Txt size={13} num weight="bold">{fmtBytes(b.bytes)}</Txt>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 52 }}>
        {perMonth.map((n, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
            <View
              style={{
                width: '100%',
                height: Math.max(3, (n / max) * 38),
                borderRadius: 3,
                backgroundColor: n ? ACCENT : t.chip,
              }}
            />
            <Txt size={8} color={t.faint}>{MONTH_TH[i].replace(/\./g, '')}</Txt>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Txt size={12} color={t.sub} style={{ flex: 1 }}>
          {b.items} รายการ · เสร็จ {b.done} · มีข้อมูล {b.days.length} วัน
        </Txt>
        <TrashBtn onPress={onDelete} />
      </View>
    </Card>
  );
}

/** รายเดือน — แถว + แถบสัดส่วนที่ทำเสร็จ */
function MonthRow({ b, last, onDelete }: { b: Bucket; last: boolean; onDelete: () => void }) {
  const t = useTokens();
  const rate = b.items ? b.done / b.items : 0;
  return (
    <View
      style={{
        paddingVertical: 12,
        gap: 8,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: t.line2,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Txt size={14} weight="med">{b.label}</Txt>
          <Txt size={12} color={t.faint}>{b.items} รายการ · เสร็จ {b.done}</Txt>
        </View>
        <Txt size={12} num color={t.sub}>{fmtBytes(b.bytes)}</Txt>
        <TrashBtn onPress={onDelete} />
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: t.chip }}>
        <View style={{ width: `${rate * 100}%`, height: 6, borderRadius: 3, backgroundColor: GREEN }} />
      </View>
    </View>
  );
}

/** รายสัปดาห์ — แถว + จุด 7 วัน (เขียว = เสร็จครบ, ส้ม = มีค้าง, จาง = ไม่มีข้อมูล) */
function WeekRow({ b, last, onDelete }: { b: Bucket; last: boolean; onDelete: () => void }) {
  const t = useTokens();
  const days = Array.from({ length: 7 }, (_, i) => b.days.find((d) => d.date === addDays(b.from, i)));
  return (
    <View
      style={{
        paddingVertical: 12,
        gap: 8,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: t.line2,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Txt size={14} weight="med">{b.label}</Txt>
          <Txt size={12} color={t.faint}>{b.items} รายการ · เสร็จ {b.done}</Txt>
        </View>
        <Txt size={12} num color={t.sub}>{fmtBytes(b.bytes)}</Txt>
        <TrashBtn onPress={onDelete} />
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {days.map((d, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: !d?.items ? t.chip : d.done === d.items ? GREEN : ACCENT,
              }}
            />
            <Txt size={9} color={t.faint}>{WD_TH[i]}</Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

/** รายวัน — แถว + จุดสีตามหมวดของรายการในวันนั้น */
function DayRow({ b, last, onDelete }: { b: Bucket; last: boolean; onDelete: () => void }) {
  const t = useTokens();
  const cats = b.days[0]?.cats ?? [];
  const shown = cats.slice(0, 10);
  return (
    <View
      style={{
        paddingVertical: 12,
        gap: 6,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: t.line2,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Txt size={14} weight="med">{b.label}</Txt>
          <Txt size={12} color={t.faint}>{b.items} รายการ · เสร็จ {b.done}</Txt>
        </View>
        <Txt size={12} num color={t.sub}>{fmtBytes(b.bytes)}</Txt>
        <TrashBtn onPress={onDelete} />
      </View>
      {shown.length ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {shown.map((c, i) => (
            <View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: CAT_BY_ID[c].color }} />
          ))}
          {cats.length > shown.length ? (
            <Txt size={10} color={t.faint}>+{cats.length - shown.length}</Txt>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
