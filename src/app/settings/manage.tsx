// จัดการข้อมูล — ดูความจุที่ใช้ + ลบข้อมูลเป็นช่วง รายปี/รายเดือน/รายสัปดาห์/รายวัน
// รายการรายวัน derive จาก series (engine.dayItems) ส่วน "ความจุ" คิดจากขนาดแถวจริงใน SQLite (dumpAll)
// ผูกกับวันที่ของแถว: activities → start_date, occurrences → date, reschedule_logs → from_date
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type ScrollViewInstance } from 'react-native';

import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { FadeInView, ProgressFill } from '@/components/motion';
import { Btn, Card, NavCircle, Segmented, Txt, pressFade, useTokens } from '@/components/ui';
import { ATTN, CAT_BY_ID, GREEN, type CatId } from '@/constants/theme';
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
  /** กำลังลบถาวร — ล็อกปุ่มไม่ให้กดซ้ำ + บอกสถานะ (ข้อมูลเยอะใช้เวลาหลายวินาที) */
  const [busy, setBusy] = useState(false);
  const scRef = useRef<ScrollViewInstance>(null);
  /** เลือกช่วงที่จะลบ → เลื่อนขึ้นไปที่กล่องยืนยัน (ปุ่มถังขยะอาจอยู่ล่างลิสต์ยาว มองไม่เห็นคำเตือน) */
  const askDelete = (b: Bucket) => {
    setConfirm(b);
    scRef.current?.scrollTo({ y: 0, animated: true });
  };

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
    if (!confirm || busy) return;
    setBusy(true);
    try {
      await purgeRange(confirm.from, confirm.to);
      await useActivities.getState().boot(); // รีโหลด store + resync แจ้งเตือน (version ขยับ → dump รีโหลดเอง)
      setConfirm(null);
      showToast(`ลบข้อมูล ${confirm.label} แล้ว`);
    } catch {
      showToast('ลบข้อมูลไม่สำเร็จ — ข้อมูลเดิมยังอยู่ ลองอีกครั้ง');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      scrollRef={scRef}
      title="ล้างข้อมูลเก่า"
      subtitle="ดูความจุที่ใช้ แล้วเลือกช่วงที่จะลบ"
      variant="sub"
      // เลือกช่วงแล้ว → ปุ่มลบถาวรอยู่แถบล่าง (การ์ดยืนยันด้านบนบอกผลก่อนกด)
      action={confirm ? { label: busy ? 'กำลังลบ…' : `ลบ ${confirm.label}`, icon: 'trash', tone: 'danger', onPress: doDelete, disabled: busy } : undefined}>
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
            <NavCircle dir="prev" label="เดือนก่อนหน้า" disabled={!hasOlder} onPress={() => { setOffset(offset + 1); setConfirm(null); }} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Txt size={13} weight="bold">{window.label}</Txt>
              {offset !== 0 ? (
                <Pressable accessibilityRole="button" style={pressFade({ minHeight: 28, justifyContent: 'center', paddingHorizontal: 8 })} onPress={() => { setOffset(0); setConfirm(null); }} hitSlop={8}>
                  <Txt size={12} weight="med" color={t.accentInk}>{offset < 0 ? 'อนาคต · กลับเดือนนี้' : 'ย้อนหลัง · กลับเดือนนี้'}</Txt>
                </Pressable>
              ) : null}
            </View>
            <NavCircle dir="next" label="เดือนถัดไป" onPress={() => { setOffset(offset - 1); setConfirm(null); }} />
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Txt size={12} color={t.sub}>
            รวม {shown.length} ช่วง · {totals.items} รายการ · เสร็จ {totals.done}
          </Txt>
          {dump ? (
            <Txt size={13} num weight="bold">{fmtBytes(totals.bytes)}</Txt>
          ) : (
            // ขนาดมาจากการอ่านฐานข้อมูลทั้งก้อน — ระหว่างรอไม่โชว์ "0 B" ให้เข้าใจผิด
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ActivityIndicator size="small" color={t.sub} />
              <Txt size={12} color={t.sub}>กำลังคำนวณขนาด…</Txt>
            </View>
          )}
        </View>
        {mode === 'week' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Legend color={GREEN} label="ทำครบ" />
            <Legend color={ATTN} label="ยังมีที่ไม่ได้บันทึก" />
            <Legend color={t.chip} label="ไม่มีรายการ" />
          </View>
        ) : mode === 'month' ? (
          <Legend color={GREEN} label="แถบเขียว = สัดส่วนที่ทำเสร็จ" />
        ) : null}
      </Card>

      {/* ยืนยันลบ */}
      {confirm ? (
        <FadeInView key={confirm.key} rise={-6}>
          <Card style={{ gap: 10, borderWidth: 1.5, borderColor: t.warn }}>
            <Txt size={15} weight="bold">ลบข้อมูล {confirm.label} ถาวร?</Txt>
            <Txt size={12.5} color={t.sub} style={{ lineHeight: 18 }}>
              {confirm.items} รายการ{dump ? ` (${fmtBytes(confirm.bytes)})` : ''} จะถูกลบและกดเลิกทำไม่ได้ · กิจกรรมทำซ้ำที่คาบเกี่ยวช่วงนี้จะเหลือเฉพาะส่วนที่อยู่นอกช่วง · กู้คืนได้จากไฟล์สำรองเท่านั้น
            </Txt>
            {busy ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator size="small" color={t.sub} />
                <Txt size={12.5} color={t.sub}>กำลังลบ… อย่าเพิ่งปิดแอป</Txt>
              </View>
            ) : (
              <Btn kind="ghost" label="ไม่ลบ" onPress={() => setConfirm(null)} />
            )}
          </Card>
        </FadeInView>
      ) : null}

      {shown.length === 0 ? (
        <Card>
          <Txt size={13} color={t.faint} style={{ textAlign: 'center', paddingVertical: 12 }}>
            {buckets.length === 0 ? 'ยังไม่มีกิจกรรมที่บันทึกไว้' : 'ไม่มีข้อมูลในช่วงนี้ — เลื่อนดูช่วงอื่นด้วยลูกศรด้านบน'}
          </Txt>
        </Card>
      ) : mode === 'year' ? (
        shown.map((b) => <YearCard key={b.key} b={b} onDelete={() => askDelete(b)} />)
      ) : (
        <Card>
          {shown.map((b, i) =>
            mode === 'month' ? (
              <MonthRow key={b.key} b={b} last={i === shown.length - 1} onDelete={() => askDelete(b)} />
            ) : mode === 'week' ? (
              <WeekRow key={b.key} b={b} last={i === shown.length - 1} onDelete={() => askDelete(b)} />
            ) : (
              <DayRow key={b.key} b={b} last={i === shown.length - 1} onDelete={() => askDelete(b)} />
            ),
          )}
        </Card>
      )}

      <Txt size={12} color={t.sub} style={{ textAlign: 'center', lineHeight: 18 }}>
        การลบในหน้านี้มีผลถาวร — กู้คืนได้จากไฟล์สำรองเท่านั้น{'\n'}ขนาดคิดจากข้อมูลจริงโดยประมาณ
      </Txt>
    </Screen>
  );
}

/** คำอธิบายสัญลักษณ์สีของรายการด้านล่าง */
function Legend({ color, label }: { color: string; label: string }) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />
      <Txt size={11.5} color={t.sub}>{label}</Txt>
    </View>
  );
}

function TrashBtn({ onPress, label }: { onPress: () => void; label?: string }) {
  const t = useTokens();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ? `ลบข้อมูล ${label}` : 'ลบข้อมูลช่วงนี้'}
      onPress={onPress}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: pressed ? t.rail : t.track, alignItems: 'center', justifyContent: 'center' })}>
      <Icon name="trash" size={15} color={t.warn} />
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
                backgroundColor: n ? t.accent : t.chip,
              }}
            />
            <Txt size={11} color={t.sub}>{MONTH_TH[i].replace(/\./g, '').slice(0, 2)}</Txt>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Txt size={12} color={t.sub} style={{ flex: 1 }}>
          {b.items} รายการ · เสร็จ {b.done} · มีข้อมูล {b.days.length} วัน
        </Txt>
        <TrashBtn onPress={onDelete} label={b.label} />
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
          <Txt size={12} color={t.sub}>{b.items} รายการ · เสร็จ {b.done}</Txt>
        </View>
        <Txt size={12} num color={t.sub}>{fmtBytes(b.bytes)}</Txt>
        <TrashBtn onPress={onDelete} label={b.label} />
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: t.chip, overflow: 'hidden' }}>
        <ProgressFill pct={rate} color={GREEN} height={6} />
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
          <Txt size={12} color={t.sub}>{b.items} รายการ · เสร็จ {b.done}</Txt>
        </View>
        <Txt size={12} num color={t.sub}>{fmtBytes(b.bytes)}</Txt>
        <TrashBtn onPress={onDelete} label={b.label} />
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {days.map((d, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: !d?.items ? t.chip : d.done === d.items ? GREEN : ATTN,
              }}
            />
            <Txt size={11} color={t.sub}>{WD_TH[i]}</Txt>
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
          <Txt size={12} color={t.sub}>{b.items} รายการ · เสร็จ {b.done}</Txt>
        </View>
        <Txt size={12} num color={t.sub}>{fmtBytes(b.bytes)}</Txt>
        <TrashBtn onPress={onDelete} label={b.label} />
      </View>
      {shown.length ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {shown.map((c, i) => (
            <View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: CAT_BY_ID[c].color }} />
          ))}
          {cats.length > shown.length ? (
            <Txt size={11} color={t.sub}>+{cats.length - shown.length}</Txt>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
