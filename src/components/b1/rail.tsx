// รายการบนราง (ระบบ B1) — แทนตารางชั่วโมงเดิม
// แถว: เวลา │ วงกลมสถานะบนราง (= ปุ่มติ๊ก, แตะได้ 44px) │ ชื่อ (≤3 บรรทัด) + รายละเอียด (≤2 บรรทัด, เส้นสีหมวด)
// นัดเคส: ใต้รายละเอียดมีแถวรายชื่อ คนละแถว + ไอคอนช่องทางติดต่อ (แตะเปิด · กดค้างคัดลอก) — โหมดช่องทางติดต่อมี 1 แถว
// แทรก: ช่วงเวลาว่าง (กรอบเส้นประเขียว → เพิ่ม) · เส้น "ตอนนี้" · รายการถัดไปเป็นการ์ดขาว
// "ตอนนี้" อยู่ในช่วงของรายการ → รวมเส้นตอนนี้เข้าการ์ด "กำลังทำ" (แถบความคืบหน้า + เวลาที่เหลือ)
// รายการที่เวลาทับกัน (≥2) → รวมเป็นกลุ่มซ้อน: พื้นแผ่นเดียว + ขอบการ์ดซ้อนด้านล่าง
//   หัวกลุ่ม = "ซ้อนเวลา n รายการ · ทับกัน 18:30–19:30" + แถบเวลาย่อ (แท่งละรายการ · ช่วงที่ทับกันแรเงา)
//   ในกลุ่ม: คอลัมน์ซ้ายโชว์แค่เวลาเริ่ม (ซ้ำกับแถวก่อน = เว้นว่าง) · เวลาจบย้ายไปบรรทัดรายละเอียด "ถึง 19:30"
import React from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';

import { ContactIcons } from '@/components/b1/contact-icons';
import { StatusCircle } from '@/components/b1/status-circle';
import { useCaseContacts } from '@/components/today/parts';
import { Txt, useTokens } from '@/components/ui';
import { CAT_BY_ID } from '@/constants/theme';
import { durText, fmtMin, hoursText } from '@/lib/dates';
import { nextItemId, railState, type NowRef, type RailState } from '@/lib/progress';
import type { DayItem, FreeSlot } from '@/lib/types';

const TIME_W = 42;
const RAIL_W = 28;
const LINE_X = 13; // กึ่งกลางราง (เส้นหนา 2)
const DOT_Y = 13; // กึ่งกลางวงกลม = บรรทัดแรกของชื่อ

const NOW_ORANGE = '#D2603A';
/** ระยะที่แผ่นกลุ่มซ้อนยื่นออกนอกคอลัมน์ราง/เนื้อหา */
const GROUP_PAD = 6;

type Row =
  | { kind: 'item'; key: string; at: number; it: DayItem; state: RailState }
  | { kind: 'free'; key: string; at: number; slot: FreeSlot }
  | { kind: 'now'; key: string; at: number };

interface Cluster {
  keys: string[];
  items: DayItem[];
  start: number;
  end: number;
  /** ช่วงที่มีรายการพร้อมกัน ≥2 */
  overlaps: { start: number; end: number }[];
}

type Block = { kind: 'row'; key: string; row: Row; idx: number } | { kind: 'group'; key: string; cluster: Cluster; rows: { row: Row; idx: number }[] };

/** ช่วงเวลาที่มีรายการทับกันตั้งแต่ 2 รายการ (sweep จุดเริ่ม/จบ) — ช่วงที่ติดกันรวมเป็นช่วงเดียว */
function overlapSpans(list: DayItem[]): { start: number; end: number }[] {
  const ev = list.flatMap((it) => [
    { at: it.startMin, d: 1 },
    { at: it.endMin, d: -1 },
  ]);
  ev.sort((a, b) => a.at - b.at || a.d - b.d); // จบก่อนเริ่มเมื่อเวลาเท่ากัน (ต่อท้ายกันไม่นับว่าทับ)
  const out: { start: number; end: number }[] = [];
  let n = 0;
  let from = 0;
  for (const e of ev) {
    const before = n;
    n += e.d;
    if (before < 2 && n >= 2) from = e.at;
    else if (before >= 2 && n < 2 && e.at > from) {
      const last = out[out.length - 1];
      if (last && last.end === from) last.end = e.at;
      else out.push({ start: from, end: e.at });
    }
  }
  return out;
}

/** กลุ่มรายการที่เวลาทับกัน (เรียงตามเวลาเริ่ม · ต่อกลุ่มตราบที่เริ่มก่อนกลุ่มจบ) — คืนเฉพาะกลุ่มที่มี ≥2 รายการ */
function overlapClusters(items: DayItem[]): Cluster[] {
  const list = items
    .filter((it) => it.ostatus !== 'rescheduled')
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.startMin - b.startMin || a.endMin - b.endMin));
  const out: Cluster[] = [];
  let cur: { date: string; items: DayItem[]; start: number; end: number } | null = null;
  const flush = () =>
    cur &&
    cur.items.length > 1 &&
    out.push({ keys: cur.items.map((x) => `${x.id}:${x.date}`), items: cur.items, start: cur.start, end: cur.end, overlaps: overlapSpans(cur.items) });
  for (const it of list) {
    if (cur && it.date === cur.date && it.startMin < cur.end) {
      cur.items.push(it);
      cur.end = Math.max(cur.end, it.endMin);
    } else {
      flush();
      cur = { date: it.date, items: [it], start: it.startMin, end: it.endMin };
    }
  }
  flush();
  return out;
}

interface RailProps {
  items: DayItem[];
  now: NowRef;
  /** ช่วงว่างที่จะแทรก (เฉพาะรายการวันเดียว) */
  free?: FreeSlot[];
  /** แทรกเส้น "ตอนนี้" (ต้องเป็นวันเดียวกับ now.date) */
  showNow?: boolean;
  onPressItem: (it: DayItem) => void;
  onToggle: (it: DayItem, state: RailState) => void;
  onPressSlot?: (slot: FreeSlot) => void;
  /** โน้ตรายครั้ง (key = `${id}:${date}`) — โชว์ต่อท้ายรายละเอียด */
  noteOf?: (it: DayItem) => string | undefined;
  /** ปุ่มเสริมท้ายแถว เช่น "ข้าม" ในหน้าทบทวน */
  renderRight?: (it: DayItem) => React.ReactNode;
  /** พื้นของการ์ด "ถัดไป" — ค่าเริ่มต้น t.card (ในการ์ดขาวให้ส่ง t.bg) */
  nextCardBg?: string;
  /** วัด y ของเส้น "ตอนนี้" — ให้หน้าเลื่อนไปหาได้ */
  onNowLayout?: (y: number) => void;
}

/** เส้นประแนวตั้ง — วาดเองเป็นขีด ๆ (borderStyle ด้านเดียวเพี้ยนบน Android) */
function VDash({ color }: { color: string }) {
  return (
    <View style={{ position: 'absolute', left: LINE_X, top: 0, bottom: 0, width: 2, overflow: 'hidden' }}>
      {Array.from({ length: 40 }, (_, i) => (
        <View key={i} style={{ width: 2, height: 4, marginBottom: 4, backgroundColor: color }} />
      ))}
    </View>
  );
}

export function Rail({ items, now, free = [], showNow, onPressItem, onToggle, onPressSlot, noteOf, renderRight, nextCardBg, onNowLayout }: RailProps) {
  const t = useTokens();
  const caseContactsOf = useCaseContacts();
  const nextId = nextItemId(items, now);

  const rows: Row[] = [
    ...items.map((it) => ({ kind: 'item' as const, key: `${it.id}:${it.date}`, at: it.startMin, it, state: railState(it, now, nextId) })),
    ...free.map((s) => ({ kind: 'free' as const, key: `free:${s.start}`, at: s.start, slot: s })),
  ];
  // "ตอนนี้" อยู่ในรายการที่กำลังทำ → ไม่แทรกเส้นแยก (การ์ดกำลังทำแสดงแทน)
  const ongoing = showNow ? rows.find((r) => r.kind === 'item' && r.state === 'current') : undefined;
  if (showNow && !ongoing) rows.push({ kind: 'now', key: 'now', at: now.min });
  // เรียงตามเวลา · เวลาเท่ากัน: ช่วงว่าง → ตอนนี้ → รายการ (เส้นตอนนี้อยู่ "ก่อน" สิ่งที่เริ่มตอนนี้)
  const order = { free: 0, now: 1, item: 2 };
  rows.sort((a, b) => a.at - b.at || order[a.kind] - order[b.kind]);
  const nowKey = ongoing?.key ?? (showNow ? 'now' : null);

  // จัดแถวเป็นบล็อก: แถวเดี่ยว / กลุ่มซ้อน (ตั้งแต่รายการแรกถึงรายการสุดท้ายของกลุ่ม รวมแถวที่แทรกอยู่ระหว่างนั้น)
  const clusters = overlapClusters(items);
  const clusterOf = new Map<string, number>();
  clusters.forEach((c, ci) => c.keys.forEach((k) => clusterOf.set(k, ci)));
  const lastIdx = new Map<number, number>();
  rows.forEach((r, i) => {
    const ci = clusterOf.get(r.key);
    if (ci !== undefined) lastIdx.set(ci, i);
  });
  const blocks: Block[] = [];
  for (let i = 0; i < rows.length; i++) {
    const ci = rows[i].kind === 'item' ? clusterOf.get(rows[i].key) : undefined;
    if (ci === undefined) {
      blocks.push({ kind: 'row', key: rows[i].key, row: rows[i], idx: i });
      continue;
    }
    const end = lastIdx.get(ci)!;
    blocks.push({ kind: 'group', key: `group:${rows[i].key}`, cluster: clusters[ci], rows: rows.slice(i, end + 1).map((row, j) => ({ row, idx: i + j })) });
    i = end;
  }

  // ช่วงว่างที่คร่อมเวลาปัจจุบัน — เส้นตอนนี้อยู่หลังช่วงว่างนั้น (ช่วงว่างเริ่มก่อน) และรางยังเป็นเส้นประต่อเนื่อง
  const inFree = (at: number) => free.some((s) => s.start <= at && at < s.end);
  const nowLayout = (has: boolean) => (onNowLayout && has ? (e: LayoutChangeEvent) => onNowLayout(e.nativeEvent.layout.y) : undefined);

  /** เส้นรางของแถว — idx = ลำดับในทุกแถว (แถวแรกเริ่มที่วงกลม · แถวสุดท้ายจบที่วงกลม) · lead = แถวหัวกลุ่มที่อยู่ก่อนรายการแรก */
  const railLine = (idx: number, dashed: boolean, lead = false, inGroup = false) => {
    if (dashed) return <VDash color={t.railDash} />;
    if (lead && idx === 0) return null;
    const first = idx === 0 && !lead;
    const last = idx === rows.length - 1 && !lead;
    return (
      <View
        style={{
          position: 'absolute',
          left: LINE_X,
          width: 2,
          // บนแผ่นกลุ่ม (พื้น track) สีรางปกติกลืน — ใช้สีเข้มขึ้น
          backgroundColor: inGroup ? t.railDash : t.rail,
          top: first ? DOT_Y : 0,
          ...(last ? { height: DOT_Y } : { bottom: 0 }),
        }}
      />
    );
  };

  /** inGroup: แถวในกลุ่มซ้อน · hideStart: เวลาเริ่มซ้ำกับรายการก่อนหน้าในกลุ่ม → ไม่โชว์ซ้ำ */
  const renderRow = (r: Row, idx: number, inGroup: boolean, layout?: (e: LayoutChangeEvent) => void, hideStart = false) => {
    const dashed = r.kind === 'free' || (r.kind === 'now' && inFree(r.at));
    const rail = railLine(idx, dashed, false, inGroup);

    if (r.kind === 'now') {
      return (
        <View key={r.key} onLayout={layout} style={{ flexDirection: 'row', gap: 8, minHeight: 30, marginBottom: 10 }}>
          <View style={{ width: TIME_W, alignItems: 'flex-end', paddingTop: 5 }}>
            <Txt size={13} num weight="bold" color={t.accentInk}>
              {fmtMin(r.at)}
            </Txt>
          </View>
          <View style={{ width: RAIL_W }}>
            {rail}
            <View style={{ position: 'absolute', left: 9, top: 8, width: 10, height: 10, borderRadius: 5, backgroundColor: '#B44E2C', shadowColor: '#B44E2C', shadowOpacity: 0.3, shadowRadius: 4, elevation: 2 }} />
          </View>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 26, paddingRight: inGroup ? GROUP_PAD : 0 }}>
            <View style={{ backgroundColor: '#B44E2C', borderRadius: 9, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Txt size={11.5} weight="bold" color="#FFFFFF">
                ตอนนี้
              </Txt>
            </View>
            <View style={{ flex: 1, height: 1.5, backgroundColor: '#B44E2C' }} />
          </View>
        </View>
      );
    }

    if (r.kind === 'free') {
      const s = r.slot;
      // ช่วงที่คร่อม "ตอนนี้" บอกเวลาที่เหลือ · ช่วงอื่นบอกความยาวทั้งช่วง
      const live = showNow && s.start < now.min && now.min < s.end;
      const label = live ? `ว่างอีก ${durText(s.end - now.min)} · ถึง ${fmtMin(s.end)}` : `ว่าง ${hoursText(s.end - s.start)} · ถึง ${fmtMin(s.end)}`;
      return (
        <View key={r.key} onLayout={layout} style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ width: TIME_W, alignItems: 'flex-end', paddingTop: 12 }}>
            <Txt size={13} num color={t.muted}>
              {fmtMin(s.start)}
            </Txt>
          </View>
          <View style={{ width: RAIL_W }}>{rail}</View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label} — แตะเพื่อเพิ่มกิจกรรม`}
            onPress={() => onPressSlot?.(s)}
            disabled={!onPressSlot}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 42,
              marginBottom: 12,
              marginRight: inGroup ? GROUP_PAD : 0,
              paddingHorizontal: 12,
              borderRadius: 12,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: t.freeLine,
              backgroundColor: pressed ? 'rgba(76,154,106,0.08)' : 'transparent',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            })}>
            <Txt size={13.5} color={t.greenInk} style={{ flex: 1 }} numberOfLines={1}>
              {label}
            </Txt>
            {onPressSlot ? (
              <Txt size={13.5} weight="bold" color={t.greenInk}>
                ＋ เพิ่ม
              </Txt>
            ) : null}
          </Pressable>
        </View>
      );
    }

    const it = r.it;
    const st = r.state;
    const cat = CAT_BY_ID[it.cat];
    const muted = st === 'done' || st === 'skipped' || st === 'rescheduled';
    const next = st === 'next';
    const live = st === 'current' && showNow;
    const card = next || live;
    // นัดเคส: รายชื่อแยกเป็นแถวไอคอนช่องทางติดต่อ (ไม่ซ้ำชื่อในบรรทัดรายละเอียด)
    const people = !cat.isCase ? [] : it.inlineContact ? [it.inlineContact] : caseContactsOf(it);
    const where = cat.isCase ? [it.channel === 'online' ? 'ออนไลน์' : it.channel === 'inperson' ? 'พบตัว' : '', it.loc].filter(Boolean).join(' · ') : [it.sub, it.loc].filter(Boolean).join(' · ');
    const note = noteOf?.(it);
    // ในกลุ่มซ้อน เวลาจบอยู่บรรทัดรายละเอียด (การ์ดกำลังทำมี "จบ" ในแถบความคืบหน้าแล้ว)
    const until = inGroup && !live ? `ถึง ${fmtMin(it.endMin)}` : '';
    // นัดเคส: ป้ายบอกประเภทผู้ติดต่อที่เลือก (คนที่นัด / ช่องทางติดต่อ) แทนชื่อหมวด "นัดเคส"
    const kind = cat.isCase ? (it.inlineContact ? 'ช่องทางติดต่อ' : 'คนที่นัด') : cat.short;
    const meta = [until, st === 'skipped' ? 'ข้าม' : kind, where, note ? `โน้ต: ${note}` : ''].filter(Boolean).join(' · ');
    const tag =
      st === 'overdue'
        ? 'ค้างบันทึก — แตะวงกลมเพื่อบันทึก'
        : live
          ? `กำลังทำ · เหลืออีก ${durText(it.endMin - now.min)}`
          : next && it.date === now.date
            ? `ถัดไป · อีก ${durText(it.startMin - now.min)}`
            : st === 'rescheduled'
              ? 'เลื่อนไปแล้ว'
              : '';
    const pct = live ? Math.min(Math.max((now.min - it.startMin) / Math.max(it.endMin - it.startMin, 1), 0), 1) * 100 : 0;
    return (
      <View key={r.key} onLayout={layout} style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ width: TIME_W, alignItems: 'flex-end', paddingTop: 2 }}>
          {hideStart ? null : (
            <Txt size={13} num weight={live ? 'bold' : 'reg'} color={live ? t.accentInk : muted ? t.muted : t.ink}>
              {fmtMin(it.startMin)}
            </Txt>
          )}
          {inGroup ? null : (
            <Txt size={11} num color={t.muted}>
              {fmtMin(it.endMin)}
            </Txt>
          )}
        </View>
        <View style={{ width: RAIL_W }}>
          {rail}
          {/* กำลังทำ: รางช่วงที่ผ่านไปแล้วเป็นสีส้ม (ตั้งแต่วงกลมลงมาตาม % ที่ผ่าน) */}
          {live ? (
            <View style={{ position: 'absolute', left: LINE_X, width: 2, top: DOT_Y, bottom: 0 }}>
              <View style={{ width: 2, height: `${pct}%`, backgroundColor: NOW_ORANGE, borderRadius: 1 }} />
            </View>
          ) : null}
          <View style={{ position: 'absolute', left: -8, top: -9 }}>
            <StatusCircle state={st} onPress={() => onToggle(it, st)} />
          </View>
        </View>
        {/* ตัวการ์ดเป็น View — ส่วนที่แตะเปิดรายละเอียดคือ Pressable ด้านใน · แถวรายชื่อแยกออกมา (ปุ่มซ้อนปุ่มไม่ได้บนเว็บ) */}
        <View
          style={{
            flex: 1,
            minWidth: 0,
            ...(card
              ? {
                  backgroundColor: nextCardBg ?? t.card,
                  borderRadius: 14,
                  borderWidth: live ? 1.5 : 0,
                  borderColor: NOW_ORANGE,
                  paddingTop: 10,
                  paddingHorizontal: 12,
                  paddingBottom: 12,
                  marginTop: -9,
                  marginBottom: 16,
                  shadowColor: '#221C13',
                  shadowOpacity: 0.07,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 2,
                }
              : { paddingTop: 1, paddingBottom: 18, paddingRight: inGroup ? GROUP_PAD : 0 }),
          }}>
          <Pressable
            accessibilityRole="button"
            accessibilityHint="เปิดรายละเอียด"
            onPress={() => onPressItem(it)}
            style={({ pressed }) => ({ gap: 2, opacity: pressed ? 0.7 : 1 })}>
            {tag ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {live ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: NOW_ORANGE }} /> : null}
                <Txt size={12} weight="bold" color={st === 'overdue' ? t.warn : t.accentInk} style={{ flexShrink: 1 }}>
                  {tag}
                </Txt>
              </View>
            ) : null}
            <Txt
              size={15}
              weight={card ? 'bold' : 'med'}
              numberOfLines={3}
              color={muted ? t.muted : t.ink}
              style={{ lineHeight: 21, textDecorationLine: st === 'done' ? 'line-through' : 'none' }}>
              {it.title}
            </Txt>
            {meta ? (
              <View style={{ flexDirection: 'row', marginTop: 3 }}>
                <View style={{ width: 2, borderRadius: 1, backgroundColor: cat.color, marginRight: 7 }} />
                <Txt size={12.5} color={t.sub} numberOfLines={2} style={{ flex: 1, lineHeight: 18 }}>
                  {until ? (
                    <Txt size={12.5} num weight="med" color={muted ? t.muted : t.ink}>
                      {until}
                    </Txt>
                  ) : null}
                  {until ? meta.slice(until.length) : meta}
                </Txt>
              </View>
            ) : null}
            {live ? (
              // แถบความคืบหน้า = เส้น "ตอนนี้" ที่ผ่านรายการนี้อยู่ · หมุดส้มคือเวลาปัจจุบัน
              <View accessible accessibilityLabel={`ตอนนี้ ${fmtMin(now.min)} ผ่านไป ${Math.round(pct)}%`} style={{ marginTop: 10, gap: 5 }}>
                <View style={{ height: 10, justifyContent: 'center' }}>
                  <View style={{ height: 4, borderRadius: 2, backgroundColor: t.track, overflow: 'hidden' }}>
                    <View style={{ width: `${pct}%`, height: 4, backgroundColor: NOW_ORANGE }} />
                  </View>
                  <View style={{ position: 'absolute', left: `${pct}%`, marginLeft: -5, width: 10, height: 10, borderRadius: 5, backgroundColor: '#B44E2C', borderWidth: 2, borderColor: nextCardBg ?? t.card }} />
                </View>
                <View style={{ flexDirection: 'row' }}>
                  <Txt size={11.5} num weight="bold" color={t.accentInk} style={{ flex: 1 }}>
                    ตอนนี้ {fmtMin(now.min)}
                  </Txt>
                  <Txt size={11.5} num color={t.muted}>
                    จบ {fmtMin(it.endMin)}
                  </Txt>
                </View>
              </View>
            ) : null}
          </Pressable>
          <ContactIcons contacts={people} dim={muted} />
        </View>
        {renderRight ? <View style={{ paddingTop: 0 }}>{renderRight(it)}</View> : null}
      </View>
    );
  };

  return (
    <View>
      {blocks.map((b) => {
        if (b.kind === 'row') return renderRow(b.row, b.idx, false, nowLayout(b.key === nowKey));
        const c = b.cluster;
        const firstIdx = b.rows[0].idx;
        const hasLive = b.rows.some(({ row }) => row.kind === 'item' && row.state === 'current' && showNow);
        const spans = c.overlaps.map((o) => `${fmtMin(o.start)}–${fmtMin(o.end)}`);
        const spanText = spans.length > 2 ? `${spans.slice(0, 2).join(', ')} …` : spans.join(', ');
        return (
          <View key={b.key} onLayout={nowLayout(b.rows.some(({ row }) => row.key === nowKey))} style={{ paddingBottom: 6, marginBottom: 12 }}>
            {/* ขอบการ์ดซ้อนด้านหลัง (โผล่ใต้แผ่น) + แผ่นกลุ่ม — เริ่มที่คอลัมน์ราง ให้วงกลมอยู่บนแผ่น */}
            <View pointerEvents="none" style={{ position: 'absolute', left: TIME_W + 8 + 4, right: 4, top: 16, bottom: 0, borderRadius: 14, backgroundColor: t.rail }} />
            <View
              pointerEvents="none"
              style={{ position: 'absolute', left: TIME_W + 8 - GROUP_PAD, right: -GROUP_PAD, top: 0, bottom: 6, borderRadius: 16, backgroundColor: t.track, borderWidth: hasLive ? 1 : 0, borderColor: hasLive ? 'rgba(210,96,58,0.35)' : 'transparent' }}
            />
            <View
              accessible
              accessibilityRole="header"
              accessibilityLabel={`${hasLive ? 'กำลังทำ · ' : ''}ซ้อนเวลา ${c.keys.length} รายการ ช่วง ${fmtMin(c.start)} ถึง ${fmtMin(c.end)} · ทับกัน ${spanText}`}
              style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ width: TIME_W }} />
              <View style={{ width: RAIL_W }}>{railLine(firstIdx, false, true, true)}</View>
              <View style={{ flex: 1, minWidth: 0, paddingTop: 10, paddingBottom: 14, paddingRight: GROUP_PAD + 6, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <StackGlyph color={hasLive ? NOW_ORANGE : t.sub} bg={t.track} />
                  <Txt size={12.5} weight="bold" color={hasLive ? t.accentInk : t.sub}>
                    {hasLive ? 'กำลังทำ · ' : ''}ซ้อนเวลา {c.keys.length} รายการ
                  </Txt>
                  {spanText ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, height: 20, borderRadius: 10, backgroundColor: 'rgba(210,96,58,0.12)' }}>
                      <Txt size={11.5} weight="med" color={t.accentInk}>
                        ทับกัน
                      </Txt>
                      <Txt size={11.5} num weight="bold" color={t.accentInk}>
                        {spanText}
                      </Txt>
                    </View>
                  ) : null}
                </View>
                <OverlapBar cluster={c} now={showNow ? now.min : null} />
              </View>
            </View>
            {b.rows.map(({ row, idx }, j) => {
              // เวลาเริ่มเท่ากับรายการก่อนหน้าในกลุ่ม → ไม่พิมพ์ซ้ำ (วงกลมบนรางยังบอกว่าเป็นอีกรายการ)
              const prev = b.rows.slice(0, j).reverse().find((x) => x.row.kind === 'item');
              const hide = row.kind === 'item' && prev?.row.kind === 'item' && prev.row.it.startMin === row.it.startMin;
              return renderRow(row, idx, true, undefined, hide);
            })}
          </View>
        );
      })}
    </View>
  );
}

/** ไอคอนการ์ดซ้อน 2 ใบ (วาดด้วย View — ไม่มีใน svg-icon) */
function StackGlyph({ color, bg }: { color: string; bg: string }) {
  return (
    <View style={{ width: 14, height: 12 }}>
      <View style={{ position: 'absolute', left: 3, top: 0, width: 11, height: 8, borderRadius: 2, borderWidth: 1.5, borderColor: color, opacity: 0.55 }} />
      <View style={{ position: 'absolute', left: 0, top: 4, width: 11, height: 8, borderRadius: 2, borderWidth: 1.5, borderColor: color, backgroundColor: bg }} />
    </View>
  );
}

/**
 * แถบเวลาย่อของกลุ่มซ้อน — แกนนอน = ช่วงเวลาของกลุ่ม · 1 แท่งต่อรายการ (สีหมวด, เรียงตามแถว)
 * ช่วงที่ทับกันแรเงาส้มอ่อนทุกแท่ง · มีป้ายเวลาเฉพาะต้น/ท้ายแกน (และขอบช่วงทับ) ไม่ให้ตัวเลขรก · เส้นส้ม = ตอนนี้
 */
function OverlapBar({ cluster, now }: { cluster: Cluster; now: number | null }) {
  const t = useTokens();
  const { start, end, items, overlaps } = cluster;
  const span = Math.max(end - start, 1);
  const x = (m: number) => `${((m - start) / span) * 100}%` as `${number}%`;
  const w = (a: number, b: number) => `${((b - a) / span) * 100}%` as `${number}%`;
  // ป้ายแกน: ต้น/ท้าย + ขอบช่วงทับ (ตัดที่ใกล้กันเกินไปออก — ห่าง < 18% ของแกน)
  const marks = [...new Set([start, ...overlaps.flatMap((o) => [o.start, o.end]), end])].sort((a, b) => a - b);
  const shown = marks.filter((m, i) => m === start || m === end || ((m - marks[i - 1]) / span >= 0.18 && (end - m) / span >= 0.18));
  const BAR = 5;
  const GAP = 3;
  const h = items.length * BAR + (items.length - 1) * GAP;
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={{ height: h + 6, justifyContent: 'center' }}>
        {overlaps.map((o) => (
          <View key={o.start} style={{ position: 'absolute', left: x(o.start), width: w(o.start, o.end), top: 0, bottom: 0, borderRadius: 3, backgroundColor: 'rgba(210,96,58,0.14)' }} />
        ))}
        <View style={{ gap: GAP }}>
          {items.map((it) => {
            const off = it.ostatus === 'done' || it.ostatus === 'skipped';
            return (
              <View key={`${it.id}:${it.date}`} style={{ height: BAR }}>
                <View style={{ position: 'absolute', left: x(it.startMin), width: w(it.startMin, it.endMin), height: BAR, borderRadius: BAR / 2, backgroundColor: CAT_BY_ID[it.cat].color, opacity: off ? 0.35 : 0.9 }} />
              </View>
            );
          })}
        </View>
        {now != null && now > start && now < end ? (
          <View style={{ position: 'absolute', left: x(now), marginLeft: -1, width: 2, top: -2, bottom: -2, borderRadius: 1, backgroundColor: NOW_ORANGE }} />
        ) : null}
      </View>
      <View style={{ height: 14, marginTop: 3 }}>
        {shown.map((m) => {
          const atEnd = m === end;
          const inOv = overlaps.some((o) => o.start === m || o.end === m);
          return (
            <Txt
              key={m}
              size={10.5}
              num
              weight={inOv ? 'med' : 'reg'}
              color={inOv ? t.accentInk : t.muted}
              style={{ position: 'absolute', ...(atEnd ? { right: 0 } : m === start ? { left: 0 } : { left: x(m), transform: [{ translateX: -14 }] }) }}>
              {fmtMin(m)}
            </Txt>
          );
        })}
      </View>
    </View>
  );
}
