// หน้าสถิติ — "ใบรายงาน" (Layout B): ฟิลเตอร์แท็บขีดเส้นใต้ + การ์ดรายงานใหญ่ (% เด่น + สปาร์กไลน์ + แถวตัวชี้วัด)
// เลือกช่วง: สัปดาห์/เดือน (เลื่อนช่วงได้) · ทั้งหมด — ดึงจาก store (series+occ) ผ่าน engine.rangeStats (pure)
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Polygon, Polyline } from 'react-native-svg';

import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { Card, Txt, useTokens } from '@/components/ui';
import { ACCENT, CATS, GREEN, PRI, PRI_BY_ID, type PriorityId } from '@/constants/theme';
import { MONTH_TH, MONTH_TH_FULL, WD_TH, addDays, beYear, fmtRange, fromISO, hoursText, mondayOf, nowMin, thaiWeekRange, toISO, todayISO } from '@/lib/dates';
import { computeStats, rangeStats } from '@/lib/engine';
import type { DayItem } from '@/lib/types';
import { useActivities } from '@/stores/activities';
import { useContacts } from '@/stores/contacts';
import { useUI } from '@/stores/ui';

type Mode = 'week' | 'month' | 'all';

const PER_LABEL: Record<Mode, string> = { week: 'รายวัน', month: 'รายสัปดาห์', all: 'รายเดือน' };

export default function StatsScreen() {
  const t = useTokens();
  const acts = useActivities((s) => s.acts);
  const occ = useActivities((s) => s.occ);

  const [mode, setMode] = useState<Mode>('week');
  const [offset, setOffset] = useState(0); // 0 = ปัจจุบัน, +1 = ย้อนหลัง 1 ช่วง (เฉพาะสัปดาห์/เดือน)
  const [openCases, setOpenCases] = useState(false); // เปิดรายการเคสทั้งหมด
  const [priFilter, setPriFilter] = useState<PriorityId | null>(null); // กรองรายการเคสตามระดับที่แตะ
  const today = todayISO();

  // ชื่อผู้ติดต่อ (id → ชื่อ) สำหรับแสดงในรายละเอียดเคส
  const contactName = useContacts((s) => s.list);
  const nameById = useMemo(() => Object.fromEntries(contactName.map((c) => [c.id, c.name])) as Record<number, string>, [contactName]);

  // เปลี่ยนช่วง/มุมมอง → ล้างตัวกรองเคส
  const resetCaseFilter = () => setPriFilter(null);

  // วันแรกสุดที่มีข้อมูล (ใช้เป็นจุดเริ่มของ "ทั้งหมด")
  const earliest = useMemo(() => {
    let min: string | null = null;
    const widen = (d: string) => {
      if (!min || d < min) min = d;
    };
    for (const a of acts) widen(a.startDate);
    Object.keys(occ).forEach(widen);
    return min ?? today;
  }, [acts, occ, today]);

  // ช่วงที่เลือก + ป้ายหัวข้อ + เลื่อนไปอนาคตได้ไหม
  const range = useMemo(() => {
    if (mode === 'week') {
      const mon = addDays(mondayOf(today), -7 * offset);
      return { from: mon, to: addDays(mon, 6), label: thaiWeekRange(mon), canNext: offset > 0 };
    }
    if (mode === 'month') {
      const b = fromISO(today);
      const m = new Date(b.getFullYear(), b.getMonth() - offset, 1);
      return {
        from: toISO(m),
        to: toISO(new Date(m.getFullYear(), m.getMonth() + 1, 0)),
        label: `${MONTH_TH_FULL[m.getMonth()]} ${beYear(m.getFullYear())}`,
        canNext: offset > 0,
      };
    }
    return { from: earliest, to: today, label: 'ทั้งหมดที่บันทึก', canNext: false };
  }, [mode, offset, today, earliest]);

  const stats = useMemo(() => rangeStats(acts, occ, range.from, range.to, nowMin()), [acts, occ, range.from, range.to]);
  const streak = useMemo(() => computeStats(acts, occ, nowMin()).streak, [acts, occ]);

  // แท่ง/สปาร์กไลน์รายช่วงย่อย — สัปดาห์=7 วัน, เดือน=สัปดาห์ในเดือน, ทั้งหมด=รายเดือน (≤12 ล่าสุด)
  const series = useMemo(() => {
    const now = nowMin();
    const buckets: { label: string; from: string; to: string }[] = [];
    if (mode === 'week') {
      for (let i = 0; i < 7; i++) {
        const d = addDays(range.from, i);
        buckets.push({ label: WD_TH[i], from: d, to: d });
      }
    } else if (mode === 'month') {
      let start = range.from;
      let n = 1;
      while (start <= range.to) {
        const end = addDays(start, 6);
        buckets.push({ label: `${n}`, from: start, to: end < range.to ? end : range.to });
        start = addDays(end, 1);
        n++;
      }
    } else {
      const from = fromISO(range.from);
      const stopKey = from.getFullYear() * 12 + from.getMonth();
      let cur = fromISO(range.to);
      cur = new Date(cur.getFullYear(), cur.getMonth(), 1);
      const list: { label: string; from: string; to: string }[] = [];
      while (cur.getFullYear() * 12 + cur.getMonth() >= stopKey && list.length < 12) {
        list.unshift({
          label: MONTH_TH[cur.getMonth()].replace(/\./g, ''),
          from: toISO(cur),
          to: toISO(new Date(cur.getFullYear(), cur.getMonth() + 1, 0)),
        });
        cur = new Date(cur.getFullYear(), cur.getMonth() - 1, 1);
      }
      buckets.push(...list);
    }
    return buckets.map((b) => {
      const s = rangeStats(acts, occ, b.from, b.to, now);
      return { label: b.label, done: s.done };
    });
  }, [acts, occ, mode, range.from, range.to]);

  const catHours = CATS.filter((c) => stats.hoursByCat[c.id]);
  const maxCatH = Math.max(...Object.values(stats.hoursByCat), 1);
  const priShown = PRI.filter((p) => stats.caseByPriority[p.id]);
  const casesFiltered = priFilter ? stats.caseItems.filter((i) => i.priority === priFilter) : stats.caseItems;
  const avgDone = stats.countedDays ? stats.done / stats.countedDays : 0;
  const noData = stats.countedDays === 0;

  return (
    <Screen title="สถิติ" subtitle="รายงานสรุปจากที่บันทึกไว้" back>
      {/* ฟิลเตอร์ + เลื่อนช่วง */}
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line2, paddingHorizontal: 2 }}>
          {(['week', 'month', 'all'] as Mode[]).map((k) => {
            const on = mode === k;
            return (
              <Pressable
                key={k}
                onPress={() => {
                  setMode(k);
                  setOffset(0);
                  resetCaseFilter();
                }}
                style={{ paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: on ? ACCENT : 'transparent', marginBottom: -StyleSheet.hairlineWidth }}>
                <Txt size={14.5} weight={on ? 'bold' : 'med'} color={on ? t.ink : t.sub}>
                  {k === 'week' ? 'สัปดาห์' : k === 'month' ? 'เดือน' : 'ทั้งหมด'}
                </Txt>
              </Pressable>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {mode !== 'all' ? <NavBtn icon="chevL" onPress={() => { setOffset(offset + 1); resetCaseFilter(); }} /> : null}
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Txt size={14} weight="bold">{range.label}</Txt>
            {mode !== 'all' && offset !== 0 ? (
              <Pressable onPress={() => { setOffset(0); resetCaseFilter(); }} hitSlop={6}>
                <Txt size={10} color={ACCENT}>ย้อนหลัง · กลับปัจจุบัน</Txt>
              </Pressable>
            ) : null}
          </View>
          {mode !== 'all' ? <NavBtn icon="chevR" disabled={!range.canNext} onPress={() => { setOffset(offset - 1); resetCaseFilter(); }} /> : null}
        </View>
      </View>

      {noData ? (
        <Card>
          <Txt size={13} color={t.faint} style={{ textAlign: 'center', paddingVertical: 16 }}>
            ยังไม่ถึงช่วงเวลานี้ — เลื่อนกลับด้วยลูกศรด้านบน
          </Txt>
        </Card>
      ) : (
        <>
          {/* การ์ดรายงานหลัก — % เด่น + ค่าย่อย + แถวตัวชี้วัด + สปาร์กไลน์ */}
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View>
                <Txt size={44} num weight="bold" color={stats.rate >= 0.7 ? GREEN : t.ink} style={{ lineHeight: 46 }}>
                  {Math.round(stats.rate * 100)}%
                </Txt>
                <Txt size={12} color={t.sub}>อัตราความสำเร็จ</Txt>
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <HeroStat k="เสร็จแล้ว" v={`${stats.done} / ${stats.scheduled}`} first />
                <HeroStat k="สตรีค" v={`${streak} วัน`} />
                <HeroStat k="ว่างเฉลี่ย" v={hoursText(stats.freeAvgMin)} />
              </View>
            </View>

            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.line2 }} />

            <ReportRow k={`ทำเสร็จ${PER_LABEL[mode]}`} sub={`เฉลี่ย ${avgDone.toFixed(1)} /วัน`}>
              <Spark data={series} color={ACCENT} />
            </ReportRow>
            <ReportRow k="ชั่วโมงลงมือรวม" sub="เฉพาะที่ทำเสร็จ" divider>
              <Txt size={22} num weight="bold">
                {hoursText(stats.doneHours * 60)}
              </Txt>
            </ReportRow>
            <ReportRow k="เลื่อนนัด" sub="จำนวนครั้งที่เลื่อนในช่วงนี้" divider>
              <Txt size={22} num weight="bold" color={stats.rescheduled ? ACCENT : t.ink}>
                {stats.rescheduled}
                <Txt size={11} color={t.faint} weight="med">
                  {' '}ครั้ง
                </Txt>
              </Txt>
            </ReportRow>
          </Card>

          {/* ชั่วโมงตามหมวด */}
          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Txt size={12} weight="bold" color={t.sub}>ชั่วโมงตามหมวด</Txt>
              <Txt size={12} num color={t.faint}>{hoursText(stats.doneHours * 60)}</Txt>
            </View>
            {catHours.length ? (
              catHours.map((c) => {
                const h = stats.hoursByCat[c.id];
                return (
                  <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Txt size={11} color={t.sub} style={{ width: 76 }} numberOfLines={1}>{c.short}</Txt>
                    <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: t.chip }}>
                      <View style={{ width: `${(h / maxCatH) * 100}%`, height: 8, borderRadius: 4, backgroundColor: c.color }} />
                    </View>
                    <Txt size={11} num color={t.faint} style={{ width: 40, textAlign: 'right' }}>{h.toFixed(1)}ช</Txt>
                  </View>
                );
              })
            ) : (
              <Txt size={12} color={t.faint}>ยังไม่มีรายการที่ทำเสร็จในช่วงนี้</Txt>
            )}
          </Card>

          {/* นัดเคสตามความสำคัญ — อธิบายว่าแต่ละระดับคือเคสอะไร + แตะเพื่อดูรายละเอียดเคสทั้งหมด */}
          {stats.caseItems.length ? (
            <Card style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Txt size={12} weight="bold" color={t.sub}>นัดเคสตามความสำคัญ</Txt>
                <Txt size={12} num color={t.faint}>{stats.caseItems.length} เคส</Txt>
              </View>

              {/* แถวอธิบายระดับ: ป้าย + ความหมาย + จำนวน (แตะเพื่อกรองรายการด้านล่าง) */}
              <View style={{ gap: 2 }}>
                {priShown.map((p) => {
                  const on = priFilter === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => {
                        setPriFilter(on ? null : p.id);
                        setOpenCases(true);
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        paddingVertical: 7,
                        paddingHorizontal: 8,
                        borderRadius: 10,
                        backgroundColor: on ? p.color + '1F' : 'transparent',
                      }}>
                      <View style={{ backgroundColor: p.color, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, minWidth: 28, alignItems: 'center' }}>
                        <Txt size={11} weight="bold" color="#FFFFFF">{p.id}</Txt>
                      </View>
                      <Txt size={13} weight="med" style={{ flex: 1 }} numberOfLines={1}>{p.label}</Txt>
                      <Txt size={13} num weight="bold" color={t.sub}>{stats.caseByPriority[p.id]}</Txt>
                    </Pressable>
                  );
                })}
              </View>

              {/* ปุ่มเปิด/ปิดรายการเคสทั้งหมด */}
              <Pressable
                onPress={() => {
                  const next = !openCases;
                  setOpenCases(next);
                  if (!next) resetCaseFilter();
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line, paddingTop: 10 }}>
                <Txt size={12.5} weight="med" color={ACCENT} style={{ flex: 1 }}>
                  {openCases
                    ? priFilter
                      ? `กรองเฉพาะ ${priFilter} · แตะเพื่อซ่อน`
                      : 'ซ่อนรายละเอียดเคส'
                    : `ดูรายละเอียดเคสทั้งหมด (${stats.caseItems.length})`}
                </Txt>
                <Icon name={openCases ? 'chevD' : 'chevR'} size={16} color={ACCENT} />
              </Pressable>

              {/* รายการเคส — แตะเปิด bottom sheet รายละเอียดเต็ม */}
              {openCases ? (
                casesFiltered.length ? (
                  <View>
                    {casesFiltered.map((it, i) => (
                      <CaseRow key={`${it.id}:${it.date}`} it={it} first={i === 0} nameById={nameById} />
                    ))}
                  </View>
                ) : (
                  <Txt size={12} color={t.faint} style={{ paddingVertical: 6 }}>ไม่มีเคสระดับนี้ในช่วงที่เลือก</Txt>
                )
              ) : null}
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}

/** แถวค่าย่อยในหัวการ์ดรายงาน */
function HeroStat({ k, v, first }: { k: string; v: string; first?: boolean }) {
  const t = useTokens();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        paddingTop: first ? 0 : 6,
        marginTop: first ? 0 : 6,
        borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
        borderTopColor: t.line,
      }}>
      <Txt size={12.5} color={t.sub}>{k}</Txt>
      <Txt size={13} num weight="bold">{v}</Txt>
    </View>
  );
}

/** แถวตัวชี้วัดแบบ "ใบรายงาน" — ชื่อ+คำอธิบายซ้าย, ค่า/กราฟขวา */
function ReportRow({ k, sub, divider, children }: { k: string; sub: string; divider?: boolean; children: React.ReactNode }) {
  const t = useTokens();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingTop: divider ? 12 : 0,
        borderTopWidth: divider ? StyleSheet.hairlineWidth : 0,
        borderTopColor: t.line,
      }}>
      <View style={{ flex: 1 }}>
        <Txt size={13} weight="med">{k}</Txt>
        <Txt size={11} color={t.faint}>{sub}</Txt>
      </View>
      {children}
    </View>
  );
}

/** เส้นสปาร์กไลน์ + พื้นจาง + จุดปลาย */
function Spark({ data, color }: { data: { done: number }[]; color: string }) {
  const W = 112;
  const H = 34;
  const pad = 5;
  const vals = data.map((d) => d.done);
  if (!vals.length) return null;
  const mx = Math.max(...vals, 1);
  const mn = Math.min(...vals, 0);
  const n = vals.length;
  const X = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const Y = (v: number) => H - pad - ((v - mn) / (mx - mn || 1)) * (H - pad * 2);
  const line = vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const area = `0,${H} ${line} ${W},${H}`;
  return (
    <Svg width={W} height={H}>
      <Polygon points={area} fill={color} opacity={0.13} />
      <Polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={X(n - 1)} cy={Y(vals[n - 1])} r={2.8} fill={color} />
    </Svg>
  );
}

/** แท่งแนวตั้งของ series (ค่าบนแท่ง + ป้ายล่าง) */
function PeriodBars({ series }: { series: { label: string; done: number }[] }) {
  const t = useTokens();
  const mx = Math.max(...series.map((s) => s.done), 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 78 }}>
      {series.map((s, i) => (
        <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
          <Txt size={9} num color={t.faint}>{s.done || ''}</Txt>
          <View style={{ width: '100%', minHeight: 3, height: Math.max(3, (s.done / mx) * 46), borderRadius: 4, backgroundColor: ACCENT }} />
          <Txt size={9} color={t.faint} numberOfLines={1}>{s.label}</Txt>
        </View>
      ))}
    </View>
  );
}

/** แถวรายละเอียดเคส 1 รายการ — วันที่ · ป้ายระดับ · ชื่อ · เวลา/ช่องทาง/ผู้ติดต่อ (แตะเปิด sheet เต็ม) */
function CaseRow({ it, first, nameById }: { it: DayItem; first: boolean; nameById: Record<number, string> }) {
  const t = useTokens();
  const d = fromISO(it.date);
  const p = it.priority ? PRI_BY_ID[it.priority] : null;
  const names = it.contactIds.map((id) => nameById[id]).filter(Boolean).join(', ');
  const done = it.ostatus === 'done';
  return (
    <Pressable
      onPress={() => useUI.getState().openSheet(it.id, it.date)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
        borderTopColor: t.line,
      }}>
      <View style={{ width: 34, alignItems: 'center' }}>
        <Txt size={14} num weight="bold" color={done ? t.faint : t.ink}>{d.getDate()}</Txt>
        <Txt size={9} color={t.faint}>{MONTH_TH[d.getMonth()]}</Txt>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {p ? (
            <View style={{ backgroundColor: p.color, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}>
              <Txt size={9} weight="bold" color="#FFFFFF">{p.id}</Txt>
            </View>
          ) : null}
          <Txt size={13} weight="med" numberOfLines={1} color={done ? t.faint : t.ink} style={{ flex: 1, textDecorationLine: done ? 'line-through' : 'none' }}>
            {it.title}
          </Txt>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Txt size={11} num color={t.sub}>{fmtRange(it.startMin, it.endMin)}</Txt>
          {it.channel ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Icon name={it.channel === 'online' ? 'video' : 'mappin'} size={11} color={t.faint} />
              <Txt size={11} color={t.faint}>{it.channel === 'online' ? 'ออนไลน์' : 'พบตัว'}</Txt>
            </View>
          ) : null}
          {names ? (
            <Txt size={11} color={t.faint} numberOfLines={1} style={{ flex: 1 }}>· {names}</Txt>
          ) : null}
        </View>
      </View>
      {done ? <Icon name="check" size={14} color={GREEN} /> : <Icon name="chevR" size={15} color={t.faint} />}
    </Pressable>
  );
}

/** ปุ่มเลื่อนช่วง (◀ ย้อนหลัง / ▶ ไปข้างหน้า) */
function NavBtn({ icon, disabled, onPress }: { icon: string; disabled?: boolean; onPress: () => void }) {
  const t = useTokens();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 }}>
      <Icon name={icon} size={16} color={t.sub} />
    </Pressable>
  );
}
