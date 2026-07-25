// หน้าสถิติ — "ใบรายงาน" (Layout B): ฟิลเตอร์แท็บขีดเส้นใต้ + การ์ดรายงานใหญ่ (% เด่น + สปาร์กไลน์ + แถวตัวชี้วัด)
// เลือกช่วง: สัปดาห์/เดือน (เลื่อนช่วงได้) · ทั้งหมด — ดึงจาก store (series+occ) ผ่าน engine.rangeStats (pure)
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Circle, Polygon, Polyline } from 'react-native-svg';

import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { SvgIcon } from '@/components/svg-icon';
import { Card, PriBadge, Segmented, Txt, useTokens } from '@/components/ui';
import { ACCENT, CATS, FONT, GREEN, PRI, PRI_BY_ID, type PriorityId } from '@/constants/theme';
import { MONTH_TH, MONTH_TH_FULL, WD_TH, addDays, beYear, fmtRange, fromISO, hoursText, mondayOf, nowMin, thaiWeekRange, toISO, todayISO } from '@/lib/dates';
import { rangeStats } from '@/lib/engine';
import type { Contact, DayItem } from '@/lib/types';
import { useActivities } from '@/stores/activities';
import { meetLink, openLink, useContacts, zoomAppLink, zoomWebLink } from '@/stores/contacts';
import { useUI } from '@/stores/ui';

type Mode = 'week' | 'month' | 'all';
/** 3 แท็บในการ์ดนัดเคส: ตามระดับความสำคัญ · ตามเคส (ชื่อไม่ซ้ำ) · รายชื่อคน */
type CaseTab = 'pri' | 'case' | 'people';

const PER_LABEL: Record<Mode, string> = { week: 'รายวัน', month: 'รายสัปดาห์', all: 'รายเดือน' };

/** ลำดับความสำคัญ (P1 = 0 สำคัญสุด) — ใช้จัดเรียง & เลือกระดับตัวแทนของคนที่มีหลายรายชื่อ */
const PRI_RANK = Object.fromEntries(PRI.map((p, i) => [p.id, i])) as Record<PriorityId, number>;

/** ชื่อ normalize สำหรับรวมคนซ้ำ — ตัดช่องว่างหัวท้าย/ซ้ำ + ไม่สนตัวพิมพ์ */
const nameKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** ลำดับของระดับที่อาจว่าง (ไม่ระบุระดับ = ท้ายสุด) */
const priRank = (p: PriorityId | null) => (p ? PRI_RANK[p] : PRI.length);

/** คน 1 คนในแท็บ "รายชื่อคน" — รวมทุก contact ที่ชื่อเหมือนกันเป็นคนเดียว */
interface Person {
  key: string; // ชื่อ normalize แล้ว
  name: string; // ชื่อที่แสดง
  pri: PriorityId; // ระดับประจำตัวที่สำคัญสุดในกลุ่ม
  contacts: Contact[]; // รายชื่อที่ชื่อเหมือนกัน (เรียงระดับสำคัญก่อน)
  items: DayItem[]; // นัดเคสของคนนี้ในช่วงที่เลือก (เรียงตามวัน)
  done: number;
  hours: number; // ชั่วโมงของนัดที่ทำเสร็จ
}

/** เคส 1 เรื่องในแท็บ "ตามเคส" — รวมทุกนัดที่ชื่อเคสเหมือนกันเป็นรายการเดียว */
interface CaseGroup {
  key: string; // ชื่อเคส normalize แล้ว
  title: string; // ชื่อที่แสดง
  pri: PriorityId | null; // ระดับที่สำคัญสุดในกลุ่ม (null = ไม่ระบุ)
  items: DayItem[]; // นัดทั้งหมดของเคสนี้ในช่วงที่เลือก (เรียงตามวัน)
  done: number;
  hours: number; // ชั่วโมงของนัดที่ทำเสร็จ
  contactIds: number[]; // ผู้ติดต่อที่เกี่ยวข้อง (ไม่ซ้ำ)
  online: number; // จำนวนนัดออนไลน์
  inperson: number; // จำนวนนัดพบตัว
}

export default function StatsScreen() {
  const t = useTokens();
  const acts = useActivities((s) => s.acts);
  const occ = useActivities((s) => s.occ);

  const [mode, setMode] = useState<Mode>('week');
  const [offset, setOffset] = useState(0); // 0 = ปัจจุบัน, +1 = ย้อนหลัง 1 ช่วง (เฉพาะสัปดาห์/เดือน)
  const [openCases, setOpenCases] = useState(false); // เปิดรายการเคสทั้งหมด
  const [priFilter, setPriFilter] = useState<PriorityId | null>(null); // กรองรายการเคสตามระดับที่แตะ
  const [caseTab, setCaseTab] = useState<CaseTab>('pri'); // แท็บในการ์ดนัดเคส
  const [personKey, setPersonKey] = useState<string | null>(null); // คนที่เปิดดูรายละเอียด (null = แสดงรายชื่อ)
  const [peopleQuery, setPeopleQuery] = useState(''); // ค้นหาชื่อคนในแท็บรายชื่อ
  const [groupKey, setGroupKey] = useState<string | null>(null); // เคสที่เปิดดูรายละเอียด (null = แสดงรายการเคส)
  const [caseQuery, setCaseQuery] = useState(''); // ค้นหาชื่อเคสในแท็บตามเคส
  const today = todayISO();
  const showToast = useUI((s) => s.showToast);

  // ชื่อผู้ติดต่อ (id → ชื่อ) สำหรับแสดงในรายละเอียดเคส
  const contactList = useContacts((s) => s.list);
  const nameById = useMemo(() => Object.fromEntries(contactList.map((c) => [c.id, c.name])) as Record<number, string>, [contactList]);

  // เปลี่ยนช่วง/มุมมอง → ล้างตัวกรองเคส + กลับไปหน้ารายชื่อ + ล้างคำค้น (ข้อมูลคนละช่วงกันแล้ว)
  const resetCaseView = () => {
    setPriFilter(null);
    setPersonKey(null);
    setPeopleQuery('');
    setGroupKey(null);
    setCaseQuery('');
  };

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

  /**
   * แท็บ "รายชื่อคน" — จับนัดเคสในช่วงที่เลือกมาจัดกลุ่มตามคน
   *  • ชื่อซ้ำ (contact หลาย record ชื่อเดียวกัน) → รวมเป็นคนเดียว, ข้อมูลติดต่อรวมกัน
   *  • นัดเดียวที่ผูกหลายคน → นับให้ทุกคน แต่คนคนเดียวไม่นับซ้ำในนัดเดียว
   *  • นัดที่ไม่ได้ผูกรายชื่อ (หรือรายชื่อถูกลบ) → นับไว้เป็น unnamed แสดงเป็นหมายเหตุ
   */
  const people = useMemo(() => {
    const byId = new Map(contactList.map((c) => [c.id, c]));
    const map = new Map<string, Person>();
    let unnamed = 0;
    for (const it of stats.caseItems) {
      const found = it.contactIds.map((id) => byId.get(id)).filter((c): c is Contact => !!c && !!c.name.trim());
      if (!found.length) {
        unnamed++;
        continue;
      }
      const counted = new Set<string>(); // กันนับนัดเดียวซ้ำให้คนเดียวกัน
      for (const c of found) {
        const key = nameKey(c.name);
        const p = map.get(key) ?? { key, name: c.name.trim(), pri: c.priority, contacts: [], items: [], done: 0, hours: 0 };
        if (!p.contacts.some((x) => x.id === c.id)) p.contacts.push(c);
        if (PRI_RANK[c.priority] < PRI_RANK[p.pri]) p.pri = c.priority;
        if (!counted.has(key)) {
          counted.add(key);
          p.items.push(it);
          if (it.ostatus === 'done') {
            p.done++;
            p.hours += (it.endMin - it.startMin) / 60;
          }
        }
        map.set(key, p);
      }
    }
    for (const p of map.values()) {
      p.contacts.sort((a, b) => PRI_RANK[a.priority] - PRI_RANK[b.priority]);
      p.items.sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
    }
    // เรียง: นัดมากสุด → ระดับสำคัญ → ชื่อไทย
    const list = [...map.values()].sort(
      (a, b) => b.items.length - a.items.length || PRI_RANK[a.pri] - PRI_RANK[b.pri] || a.name.localeCompare(b.name, 'th'),
    );
    return { list, unnamed };
  }, [stats.caseItems, contactList]);

  /**
   * แท็บ "ตามเคส" — รวมนัดที่ชื่อเคสซ้ำกันให้เหลือรายการเดียว
   *  • ชื่อเดียวกัน (ไม่สนช่องว่าง/ตัวพิมพ์) → นับเป็นเคสเดียว แม้จะคนละกิจกรรม/คนละวัน
   *  • เก็บระดับสำคัญสุด · ผู้ติดต่อที่เกี่ยวข้องทั้งหมด · ช่องทางที่ใช้
   */
  const caseGroups = useMemo(() => {
    const map = new Map<string, CaseGroup>();
    for (const it of stats.caseItems) {
      const key = nameKey(it.title);
      const g =
        map.get(key) ??
        { key, title: it.title.trim(), pri: null, items: [], done: 0, hours: 0, contactIds: [], online: 0, inperson: 0 };
      if (priRank(it.priority) < priRank(g.pri)) g.pri = it.priority;
      g.items.push(it);
      if (it.ostatus === 'done') {
        g.done++;
        g.hours += (it.endMin - it.startMin) / 60;
      }
      if (it.channel === 'online') g.online++;
      else if (it.channel === 'inperson') g.inperson++;
      for (const id of it.contactIds) if (!g.contactIds.includes(id)) g.contactIds.push(id);
      map.set(key, g);
    }
    for (const g of map.values()) g.items.sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
    // เรียง: นัดมากสุด → ระดับสำคัญ → ชื่อไทย
    return [...map.values()].sort(
      (a, b) => b.items.length - a.items.length || priRank(a.pri) - priRank(b.pri) || a.title.localeCompare(b.title, 'th'),
    );
  }, [stats.caseItems]);

  const q = peopleQuery.trim().toLowerCase();
  const peopleShown = q ? people.list.filter((p) => p.key.includes(q)) : people.list;
  const person = personKey ? people.list.find((p) => p.key === personKey) ?? null : null; // หาไม่เจอ (เปลี่ยนช่วง) → กลับไปแสดงรายชื่อ

  const cq = caseQuery.trim().toLowerCase();
  const groupsShown = cq ? caseGroups.filter((g) => g.key.includes(cq)) : caseGroups;
  const group = groupKey ? caseGroups.find((g) => g.key === groupKey) ?? null : null; // หาไม่เจอ (เปลี่ยนช่วง) → กลับไปแสดงรายการ

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
                  resetCaseView();
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
          {mode !== 'all' ? <NavBtn icon="chevL" onPress={() => { setOffset(offset + 1); resetCaseView(); }} /> : null}
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Txt size={14} weight="bold">{range.label}</Txt>
            {mode !== 'all' && offset !== 0 ? (
              <Pressable onPress={() => { setOffset(0); resetCaseView(); }} hitSlop={6}>
                <Txt size={10} color={ACCENT}>ย้อนหลัง · กลับปัจจุบัน</Txt>
              </Pressable>
            ) : null}
          </View>
          {mode !== 'all' ? <NavBtn icon="chevR" disabled={!range.canNext} onPress={() => { setOffset(offset - 1); resetCaseView(); }} /> : null}
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
                <HeroStat k="วันที่นำมาคิด" v={`${stats.countedDays} วัน`} />
                <HeroStat k="เวลาว่างรวม" v={hoursText(stats.freeTotalMin)} />
              </View>
            </View>

            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.line2 }} />

            <ReportRow k={`ทำเสร็จ${PER_LABEL[mode]}`} sub={`เฉลี่ย ${avgDone.toFixed(1)} /วัน · จาก ${stats.countedDays} วัน`}>
              <Spark data={series} color={ACCENT} />
            </ReportRow>
            <ReportRow k="ชั่วโมงลงมือรวม" sub="เฉพาะที่ทำเสร็จ" divider>
              <Txt size={22} num weight="bold">
                {hoursText(stats.doneHours * 60)}
              </Txt>
            </ReportRow>
            <ReportRow k="เวลาว่างรวม" sub={`ไม่นับ 00:00–06:00 · เฉลี่ย ${hoursText(stats.freeAvgMin)} /วัน`} divider>
              <Txt size={22} num weight="bold" color={GREEN}>
                {hoursText(stats.freeTotalMin)}
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
              <Txt size={12} num color={t.faint}>{hoursText(stats.doneHours * 60)} · {stats.countedDays} วัน</Txt>
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

            {/* เวลาว่างรวมของช่วง — หน้าต่าง 06:00–24:00 (เวลานอน 00:00–06:00 ไม่ถูกนับเป็นเวลาว่าง) */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: t.line,
                paddingTop: 10,
              }}>
              <View style={{ flex: 1 }}>
                <Txt size={12.5} weight="med">เวลาว่างรวม</Txt>
                <Txt size={11} color={t.faint}>
                  06:00–24:00 (ไม่นับ 00:00–06:00) · {stats.countedDays} วันที่นำมาคิด
                </Txt>
              </View>
              <Txt size={16} num weight="bold" color={GREEN}>{hoursText(stats.freeTotalMin)}</Txt>
            </View>
          </Card>

          {/* นัดเคส — 2 แท็บ: ตามความสำคัญ (ระดับ P1–P6) · รายชื่อคน (ชื่อไม่ซ้ำ · ค้นหาได้ · แตะดูรายละเอียด) */}
          {stats.caseItems.length ? (
            <Card style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Txt size={12} weight="bold" color={t.sub}>นัดเคส</Txt>
                <Txt size={12} num color={t.faint}>
                  {stats.caseItems.length} นัด · {caseGroups.length} เคส · {people.list.length} คน
                </Txt>
              </View>

              <Segmented
                options={[
                  { key: 'pri', label: 'ความสำคัญ' },
                  { key: 'case', label: `ตามเคส (${caseGroups.length})` },
                  { key: 'people', label: `รายชื่อ (${people.list.length})` },
                ]}
                value={caseTab}
                onChange={(k) => {
                  setCaseTab(k);
                  setPersonKey(null);
                  setGroupKey(null);
                }}
              />

              {caseTab === 'pri' ? (
                <>
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
                      if (!next) resetCaseView();
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
                </>
              ) : caseTab === 'case' ? (
                group ? (
                  /* รายละเอียดเคสเดียว — สรุปรวมทุกนัดที่ชื่อเดียวกัน + รายการนัด */
                  <CaseGroupDetail g={group} nameById={nameById} onBack={() => setGroupKey(null)} />
                ) : (
                  <>
                    <SearchBox value={caseQuery} onChange={setCaseQuery} placeholder="ค้นหาชื่อเคส…" />
                    {groupsShown.length ? (
                      <View>
                        {groupsShown.map((g, i) => (
                          <CaseGroupRow key={g.key} g={g} first={i === 0} nameById={nameById} onPress={() => setGroupKey(g.key)} />
                        ))}
                      </View>
                    ) : (
                      <Txt size={12} color={t.faint} style={{ paddingVertical: 6 }}>ไม่พบเคสที่ตรงกับคำค้น — ลองล้างคำค้น</Txt>
                    )}
                  </>
                )
              ) : person ? (
                /* รายละเอียดคนคนเดียว — ข้อมูลติดต่อ + สรุปนัด + รายการนัดของคนนี้ */
                <PersonDetail p={person} nameById={nameById} onBack={() => setPersonKey(null)} showToast={showToast} />
              ) : (
                <>
                  <SearchBox value={peopleQuery} onChange={setPeopleQuery} placeholder="ค้นหาชื่อคน…" />
                  {peopleShown.length ? (
                    <View>
                      {peopleShown.map((p, i) => (
                        <PersonRow key={p.key} p={p} first={i === 0} onPress={() => setPersonKey(p.key)} />
                      ))}
                    </View>
                  ) : (
                    <Txt size={12} color={t.faint} style={{ paddingVertical: 6 }}>ไม่พบชื่อที่ตรงกับคำค้น — ลองล้างคำค้น</Txt>
                  )}
                  {people.unnamed ? (
                    <Txt size={11} color={t.faint}>อีก {people.unnamed} เคสในช่วงนี้ไม่ได้ระบุผู้ติดต่อ</Txt>
                  ) : null}
                </>
              )}
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

/** ช่องค้นหา (รูปแบบเดียวกับสมุดรายชื่อ) */
function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.card2, borderRadius: 12, borderWidth: 1, borderColor: t.line, paddingHorizontal: 12 }}>
      <Icon name="search" size={16} color={t.faint} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.faint}
        autoCorrect={false}
        style={{ flex: 1, paddingVertical: 10, color: t.ink, fontFamily: FONT.ui, fontSize: 14 }}
      />
      {value ? (
        <Pressable onPress={() => onChange('')} hitSlop={6}>
          <Icon name="x" size={16} color={t.faint} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** แถวคน 1 คนในแท็บรายชื่อ — ป้ายระดับ · ชื่อ · สรุปย่อ · จำนวนนัด (แตะดูรายละเอียด) */
function PersonRow({ p, first, onPress }: { p: Person; first: boolean; onPress: () => void }) {
  const t = useTokens();
  const last = p.items[p.items.length - 1];
  const d = last ? fromISO(last.date) : null;
  const sub = [
    `เสร็จ ${p.done}/${p.items.length}`,
    p.hours ? hoursText(p.hours * 60) : null,
    d ? `ล่าสุด ${d.getDate()} ${MONTH_TH[d.getMonth()]}` : null,
    p.contacts.length > 1 ? `รวม ${p.contacts.length} รายชื่อชื่อเดียวกัน` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
        borderTopColor: t.line,
      }}>
      <PriTag id={p.pri} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={13.5} weight="med" numberOfLines={1}>{p.name}</Txt>
        <Txt size={11} color={t.faint} numberOfLines={1}>{sub}</Txt>
      </View>
      <Txt size={13} num weight="bold" color={t.sub}>{p.items.length}</Txt>
      <Icon name="chevR" size={15} color={t.faint} />
    </Pressable>
  );
}

/** รายละเอียดคน 1 คน (drill-down ในการ์ด) — ปุ่มย้อนกลับ + ช่องทางติดต่อ + สรุปนัดในช่วง + รายการนัด */
function PersonDetail({
  p,
  nameById,
  onBack,
  showToast,
}: {
  p: Person;
  nameById: Record<number, string>;
  onBack: () => void;
  showToast: (m: string) => void;
}) {
  const t = useTokens();
  const rate = p.items.length ? p.done / p.items.length : 0;
  return (
    <View style={{ gap: 12 }}>
      <Pressable onPress={onBack} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chevL" size={16} color={t.sub} />
        </View>
        <Txt size={15} weight="bold" style={{ flex: 1 }} numberOfLines={1}>{p.name}</Txt>
        <PriBadge id={p.pri} withLabel />
      </Pressable>

      <ContactMethods contacts={p.contacts} showToast={showToast} />

      {/* สรุปนัดของคนนี้ในช่วงที่เลือก */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <MiniStat k="นัดในช่วงนี้" v={`${p.items.length}`} />
        <MiniStat k="ทำเสร็จ" v={`${p.done}`} tint={p.done ? GREEN : undefined} />
        <MiniStat k="อัตราสำเร็จ" v={`${Math.round(rate * 100)}%`} />
        <MiniStat k="ชั่วโมงรวม" v={hoursText(p.hours * 60)} />
      </View>

      {/* รายการนัดของคนนี้ — แตะเปิด bottom sheet รายละเอียดเต็ม */}
      <View>
        {p.items.map((it, i) => (
          <CaseRow key={`${it.id}:${it.date}`} it={it} first={i === 0} nameById={nameById} />
        ))}
      </View>
    </View>
  );
}

/** ป้ายระดับความสำคัญขนาดคงที่ (ไม่ระบุระดับ → ขีดจาง) — ใช้หน้าแถวรายการ */
function PriTag({ id }: { id: PriorityId | null }) {
  const t = useTokens();
  const p = id ? PRI_BY_ID[id] : null;
  return (
    <View style={{ backgroundColor: p ? p.color : t.chip, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, minWidth: 28, alignItems: 'center' }}>
      <Txt size={11} weight="bold" color={p ? '#FFFFFF' : t.faint}>{p ? p.id : '–'}</Txt>
    </View>
  );
}

/** แถวเคส 1 เรื่องในแท็บตามเคส — ป้ายระดับ · ชื่อเคส · สรุปย่อ · จำนวนนัด (แตะดูรายละเอียด) */
function CaseGroupRow({ g, first, nameById, onPress }: { g: CaseGroup; first: boolean; nameById: Record<number, string>; onPress: () => void }) {
  const t = useTokens();
  const last = g.items[g.items.length - 1];
  const d = last ? fromISO(last.date) : null;
  const names = g.contactIds.map((id) => nameById[id]).filter(Boolean).join(', ');
  const sub = [
    `เสร็จ ${g.done}/${g.items.length}`,
    g.hours ? hoursText(g.hours * 60) : null,
    d ? `ล่าสุด ${d.getDate()} ${MONTH_TH[d.getMonth()]}` : null,
    names || null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
        borderTopColor: t.line,
      }}>
      <PriTag id={g.pri} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={13.5} weight="med" numberOfLines={1}>{g.title}</Txt>
        <Txt size={11} color={t.faint} numberOfLines={1}>{sub}</Txt>
      </View>
      <Txt size={13} num weight="bold" color={t.sub}>{g.items.length}</Txt>
      <Icon name="chevR" size={15} color={t.faint} />
    </Pressable>
  );
}

/** รายละเอียดเคส 1 เรื่อง (drill-down ในการ์ด) — ปุ่มย้อนกลับ + สรุปรวม + ผู้ติดต่อ/ช่องทาง + รายการนัดทุกครั้ง */
function CaseGroupDetail({ g, nameById, onBack }: { g: CaseGroup; nameById: Record<number, string>; onBack: () => void }) {
  const t = useTokens();
  const rate = g.items.length ? g.done / g.items.length : 0;
  const names = g.contactIds.map((id) => nameById[id]).filter(Boolean);
  const first = g.items[0];
  const last = g.items[g.items.length - 1];
  const span =
    first && last
      ? first.date === last.date
        ? `${fromISO(first.date).getDate()} ${MONTH_TH[fromISO(first.date).getMonth()]}`
        : `${fromISO(first.date).getDate()} ${MONTH_TH[fromISO(first.date).getMonth()]} – ${fromISO(last.date).getDate()} ${MONTH_TH[fromISO(last.date).getMonth()]}`
      : '';
  const channel = [g.online ? `ออนไลน์ ${g.online}` : null, g.inperson ? `พบตัว ${g.inperson}` : null].filter(Boolean).join(' · ');
  return (
    <View style={{ gap: 12 }}>
      <Pressable onPress={onBack} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chevL" size={16} color={t.sub} />
        </View>
        <Txt size={15} weight="bold" style={{ flex: 1 }} numberOfLines={2}>{g.title}</Txt>
        <PriBadge id={g.pri} withLabel />
      </Pressable>

      {/* สรุปเคสนี้ในช่วงที่เลือก */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <MiniStat k="นัดในช่วงนี้" v={`${g.items.length}`} />
        <MiniStat k="ทำเสร็จ" v={`${g.done}`} tint={g.done ? GREEN : undefined} />
        <MiniStat k="อัตราสำเร็จ" v={`${Math.round(rate * 100)}%`} />
        <MiniStat k="ชั่วโมงรวม" v={hoursText(g.hours * 60)} />
      </View>

      {span || channel || names.length ? (
        <View style={{ backgroundColor: t.card2, borderRadius: 14, borderWidth: 1, borderColor: t.line, padding: 12, gap: 8 }}>
          {span ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="calendar" size={14} color={t.sub} />
              <Txt size={12.5} color={t.sub} style={{ flex: 1 }}>{span}</Txt>
            </View>
          ) : null}
          {channel ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name={g.online >= g.inperson ? 'video' : 'mappin'} size={14} color={t.sub} />
              <Txt size={12.5} color={t.sub} style={{ flex: 1 }}>{channel}</Txt>
            </View>
          ) : null}
          {names.length ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <View style={{ paddingTop: 1 }}><Icon name="users" size={14} color={t.sub} /></View>
              <Txt size={12.5} color={t.sub} style={{ flex: 1 }}>{names.join(', ')}</Txt>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* ทุกนัดของเคสนี้ — แตะเปิด bottom sheet รายละเอียดเต็ม */}
      <View>
        {g.items.map((it, i) => (
          <CaseRow key={`${it.id}:${it.date}`} it={it} first={i === 0} nameById={nameById} />
        ))}
      </View>
    </View>
  );
}

/** ช่องทางติดต่อ — รวมจากทุกรายชื่อที่ชื่อเหมือนกัน (ค่าซ้ำแสดงครั้งเดียว) · แตะเพื่อเปิดแอป */
function ContactMethods({ contacts, showToast }: { contacts: Contact[]; showToast: (m: string) => void }) {
  const t = useTokens();

  const methods = useMemo(() => {
    type M = { label: string; icon: string; display: string; url: string; fallback?: string };
    const out: M[] = [];
    const seen = new Set<string>();
    const add = (m: M) => {
      const k = `${m.label}:${m.display}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push(m);
    };
    for (const c of contacts) {
      if (c.phone) add({ label: 'เบอร์โทร', icon: 'phone', display: c.phone, url: `tel:${c.phone.replace(/[^0-9+]/g, '')}` });
      if (c.line) add({ label: 'LINE', icon: 'line', display: c.line, url: `https://line.me/R/ti/p/~${c.line.replace(/^@/, '')}` });
      if (c.email) add({ label: 'อีเมล', icon: 'mail', display: c.email, url: `mailto:${c.email}` });
      // Zoom: เปิดแอปด้วย zoomus:// ก่อน ไม่มีแอปค่อยตกไปที่ลิงก์เว็บ
      if (c.zoom) add({ label: 'Zoom', icon: 'video', display: 'ห้อง Zoom', url: zoomAppLink(c.zoom) ?? zoomWebLink(c.zoom), fallback: zoomWebLink(c.zoom) });
      if (c.googlemeet) add({ label: 'Google Meet', icon: 'video', display: 'ห้อง Google Meet', url: meetLink(c.googlemeet) });
    }
    return out;
  }, [contacts]);

  const notes = contacts.map((c) => c.note?.trim()).filter(Boolean) as string[];
  const [opening, setOpening] = useState<string | null>(null); // ช่องทางที่กำลังเปิดอยู่ (key ของแถว)

  const open = async (key: string, label: string, url: string, fallback?: string) => {
    setOpening(key);
    const res = await openLink(url, fallback);
    setOpening(null);
    if (res === 'fallback') showToast(`ไม่พบแอป ${label} — เปิดในเบราว์เซอร์แทน`);
    if (res === 'fail') showToast(`เปิด ${label} ไม่ได้`);
  };

  return (
    <View style={{ backgroundColor: t.card2, borderRadius: 14, borderWidth: 1, borderColor: t.line, padding: 12, gap: 9 }}>
      {methods.map((m) => {
        const key = `${m.label}:${m.display}`;
        const busy = opening === key;
        return (
          <Pressable
            key={key}
            disabled={busy}
            onPress={() => open(key, m.label, m.url, m.fallback)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, opacity: busy ? 0.6 : 1 }}>
            <SvgIcon name={m.icon} size={14} color={t.sub} />
            <Txt size={13} style={{ flex: 1 }} numberOfLines={1}>{busy ? `กำลังเปิด ${m.label}…` : m.display}</Txt>
            {busy ? <ActivityIndicator size="small" color={ACCENT} /> : <SvgIcon name="extLink" size={14} color={ACCENT} />}
          </Pressable>
        );
      })}
      {notes.map((n, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
          <View style={{ paddingTop: 1 }}><SvgIcon name="note" size={13} color={t.sub} /></View>
          <Txt size={12} color={t.sub} style={{ flex: 1 }}>{n}</Txt>
        </View>
      ))}
      {methods.length === 0 && notes.length === 0 ? (
        <Txt size={12} color={t.faint}>ยังไม่มีช่องทางติดต่อ — เพิ่มได้ในสมุดรายชื่อ</Txt>
      ) : null}
    </View>
  );
}

/** กล่องตัวเลขย่อยในรายละเอียดคน (เรียง 2 คอลัมน์บนจอเล็ก) */
function MiniStat({ k, v, tint }: { k: string; v: string; tint?: string }) {
  const t = useTokens();
  return (
    <View style={{ flexGrow: 1, minWidth: '46%', backgroundColor: t.chip, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, gap: 2 }}>
      <Txt size={11} color={t.sub}>{k}</Txt>
      <Txt size={15} num weight="bold" color={tint}>{v}</Txt>
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
