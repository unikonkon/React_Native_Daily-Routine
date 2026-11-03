// แท็บ 2 — เพิ่ม/แก้ไขกิจกรรม (ระบบ B1): ฟอร์ม 4 ขั้น เปิดทีละขั้น · ขั้นที่เสร็จพับเป็นแถวสรุป (แตะ "แก้" เพื่อเปิด)
// ① หมวด+รายละเอียด → ② วันที่+ทำซ้ำ → ③ เวลา (เตือนชน + เสนอช่วงว่างที่ใกล้ที่สุด) → ④ แจ้งเตือน
// แก้ไข: แถบ "กำลังแก้ไข" + ป้าย "เปลี่ยนแล้ว" ต่อขั้น + การ์ดขอบเขตชุดทำซ้ำ (มีผล n ครั้ง)
// แถบล่าง: ‹ กลับ (เพิ่ม = เก็บร่างไว้ · แก้ไข = ทิ้งการแก้ไข) + บันทึก / บันทึกการแก้ไข
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, TextInput, View, type LayoutChangeEvent, type ScrollViewInstance } from 'react-native';

import { Icon } from '@/components/icon';
import { MonthGrid } from '@/components/month-grid';
import { MonthYearPicker } from '@/components/month-year-picker';
import { Screen } from '@/components/screen';
import { SvgIcon } from '@/components/svg-icon';
import { TimeDragBar, TimeDragRail } from '@/components/time-drag';
import { Btn, Card, Chip, ChipRow, PriBadge, Segmented, Toggle, Txt, useTokens } from '@/components/ui';
import { CATS, CAT_BY_ID, CAT_OPTIONS, DAY_END, DAY_START, FONT, GREEN, PRI, SNAP, type CatId } from '@/constants/theme';
import { MONTH_TH, MONTH_TH_FULL, WD_TH, addDays, beYear, durText, fmtMin, fromISO, hoursText, thaiDate, todayISO, wdMon } from '@/lib/dates';
import { FREE_WINDOW_END, conflictsOn, freeSlots, maskFromDates, seriesDates } from '@/lib/engine';
import { HORIZON_DAYS, type Activity, type Contact, type Horizon, type RepeatRule } from '@/lib/types';
import { getDay, useActivities, useDayReader } from '@/stores/activities';
import { contactChannels, useContacts } from '@/stores/contacts';
import { useDraft } from '@/stores/draft';
import { useSettings } from '@/stores/settings';
import { useUI } from '@/stores/ui';

type Step = 1 | 2 | 3 | 4;
type Draft = ReturnType<typeof useDraft.getState>;

const REPEATS: { key: RepeatRule; label: string }[] = [
  { key: 'none', label: 'ครั้งเดียว' },
  { key: 'daily', label: 'ทุกวัน' },
  { key: 'weekday', label: 'จ–ศ' },
  { key: 'weekend', label: 'ส–อา' },
  { key: 'custom', label: 'เลือกเอง' },
];
const REPEAT_LABEL: Record<RepeatRule, string> = { none: 'ครั้งเดียว', daily: 'ทุกวัน', weekday: 'ทุก จ–ศ', weekend: 'ทุก ส–อา', custom: 'เลือกวันเอง' };

// ช่วงเวลาสำเร็จรูป — แตะแล้วตั้งเวลาเริ่ม (สิ้นสุด = เริ่ม + ระยะเวลาที่เลือกอยู่)
// 02:00 = 1560 นาที (ตี 2 ของวันถัดไป — หน้าต่างวันคือ 06:00–30:00)
const PERIOD_PRESETS = [
  { label: '06:00', start: 360 },
  { label: '13:00', start: 780 },
  { label: '17:00', start: 1020 },
  { label: '20:00', start: 1200 },
];

// จุดแบ่ง "ช่วงดึก" — 01:00 ของวันถัดไป (นาทีในหน้าต่าง 06:00–30:00)
const NIGHT_START = 1500;

interface PreviewSlot {
  start: number;
  end: number;
  night: boolean;
}

/** แยกช่วงว่างที่คร่อม 01:00 ออกเป็น 2 ท่อน — กลางวัน (…–01:00) + ดึก (01:00–06:00) · ท่อนสั้นกว่า 15 นาทีทิ้ง */
function splitAtNight(slots: { start: number; end: number }[]): PreviewSlot[] {
  const out: PreviewSlot[] = [];
  for (const s of slots) {
    const parts =
      s.start < NIGHT_START && s.end > NIGHT_START
        ? [
            { start: s.start, end: NIGHT_START },
            { start: NIGHT_START, end: s.end },
          ]
        : [s];
    for (const p of parts) if (p.end - p.start >= SNAP) out.push({ ...p, night: p.start >= NIGHT_START });
  }
  return out;
}

const HORIZONS: { key: Horizon; label: string }[] = [
  { key: '1w', label: '1 สัปดาห์' },
  { key: '2w', label: '2 สัปดาห์' },
  { key: '1m', label: '1 เดือน' },
  { key: '6m', label: '6 เดือน' },
  { key: '1y', label: '1 ปี' },
];

/** "พฤ 5 พ.ย." — วันสั้นในแถวสรุป */
function shortDate(iso: string): string {
  const dt = fromISO(iso);
  return `${WD_TH[wdMon(iso)]} ${dt.getDate()} ${MONTH_TH[dt.getMonth()]}`;
}
/** "พฤ 5 พ.ย. – ศ 4 ธ.ค. 2569" */
function dateRange(a: string, b: string): string {
  return a === b ? thaiDate(a) : `${shortDate(a)} – ${shortDate(b)} ${beYear(fromISO(b).getFullYear())}`;
}

/** ค่าที่โหลดมาตอนเปิดฟอร์ม — เทียบหา "เปลี่ยนแล้ว" ในโหมดแก้ไข */
function snapOf(d: Draft) {
  return {
    s1: JSON.stringify([d.cat, d.title.trim(), d.sub, d.loc, d.channel, d.priority, d.contactIds]),
    s2: JSON.stringify([d.repeat, d.dates.length, d.dates[0], d.dates[d.dates.length - 1]]),
    start: d.start,
    end: d.end,
    s4: JSON.stringify([d.notify, d.before]),
  };
}
/** ขั้นที่เปิดเมื่อโหลดร่างชุดใหม่ — แก้ไข = ขั้นสุดท้าย (ขั้นอื่นพับเป็นสรุปให้ตรวจ) · เพิ่ม = ขั้น 1 */
const firstOpen = (d: Draft): Step => (d.editId ? 4 : 1);

export default function AddScreen() {
  const t = useTokens();
  const d = useDraft();
  const router = useRouter();
  const showToast = useUI((s) => s.showToast);
  const acts = useActivities((s) => s.acts);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const step1Done = !!d.cat && !!d.title.trim();

  // ขั้นที่เปิด + ค่าตอนโหลด — ผูกกับ loadRev (ร่างชุดใหม่ → เริ่มใหม่) โดยปรับ state ระหว่าง render แทน effect
  const [nav, setNav] = useState(() => ({ rev: d.loadRev, open: firstOpen(d) as Step | null, snap: snapOf(d) }));
  const cur = nav.rev === d.loadRev ? nav : { rev: d.loadRev, open: firstOpen(d) as Step | null, snap: snapOf(d) };
  if (cur !== nav) setNav(cur);
  // ขั้น 1 ยังไม่ครบ → ขั้น 1 เปิดเสมอ (ขั้นอื่นยังไปไม่ได้)
  const open = step1Done ? cur.open : 1;
  const setOpen = (n: Step | null) => setNav({ ...cur, open: n });

  // เปิดแท็บเพิ่มด้วยร่างว่าง (ยังไม่เลือกหมวด) → ตั้งเวลาตั้งต้นใหม่ = ช่วงว่าง 1 ชม. แรกหลังตอนนี้
  useFocusEffect(
    useCallback(() => {
      useDraft.getState().refreshDefaultTime();
    }, []),
  );

  // แท็บนี้ mount ค้างไว้ → โหลดร่างใหม่แล้วเลื่อนกลับบนสุด (iOS ไม่ดึงตำแหน่งเลื่อนกลับเอง)
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [d.loadRev]);
  // เปิดขั้นใหม่ → เลื่อนให้หัวขั้นนั้นอยู่บนจอ
  // y ของหัวแต่ละขั้น (เทียบกับกล่องขั้น) + y ของกล่องขั้นในหน้า — วัดจาก onLayout
  const stepY = useRef<Record<number, number>>({});
  const stepsTop = useRef(0);
  useEffect(() => {
    if (open == null || open === 1) return;
    const id = setTimeout(() => {
      const y = stepY.current[open];
      if (y != null) scrollRef.current?.scrollTo({ y: Math.max(stepsTop.current + y - 12, 0), animated: true });
    }, 60);
    return () => clearTimeout(id);
  }, [open]);

  const editing = d.editId ? acts.find((a) => a.id === d.editId) : undefined;
  const askScope = !!editing && editing.repeat !== 'none' && !!d.editDate && d.editDate > editing.startDate;
  const analysis = useScheduleAnalysis();
  const [dragging, setDragging] = useState(false); // ลากเลือกเวลาอยู่ → ล็อกการเลื่อนหน้า
  const onSave = useSave(editing, askScope, () => setOpen(1));

  const dirty = !!d.cat || !!d.title || !!d.editId;
  const goBack = () => {
    if (d.editId) d.reset(); // แก้ไข: กลับ = ไม่บันทึกการแก้ไข
    else if (dirty) showToast('เก็บร่างไว้แล้ว — กลับมาทำต่อได้ที่แท็บเพิ่ม');
    if (router.canGoBack()) router.back();
    else router.navigate('/');
    useUI.getState().restoreSheet(); // เปิดจากแผ่นรายละเอียด → เปิดแผ่นคืน
  };

  const snap = cur.snap;
  const changed = (n: Step) =>
    !!d.editId &&
    (n === 1
      ? snapOf(d).s1 !== snap.s1
      : n === 2
        ? snapOf(d).s2 !== snap.s2
        : n === 3
          ? d.start !== snap.start || d.end !== snap.end
          : snapOf(d).s4 !== snap.s4);

  const headerRight = d.editId ? (
    <HeaderPill
      label="ยกเลิกแก้ไข"
      onPress={() => {
        d.reset();
        showToast('ยกเลิกการแก้ไขแล้ว');
      }}
    />
  ) : dirty ? (
    <HeaderPill
      label="ล้างค่า"
      onPress={() => {
        d.reset();
        showToast('ล้างค่าฟอร์มแล้ว');
      }}
    />
  ) : undefined;

  const cat = d.cat ? CAT_BY_ID[d.cat] : null;
  const contacts = useContacts((s) => s.list);
  const who = d.cat === 'case' ? d.contactIds.map((id) => contacts.find((c) => c.id === id)?.name).filter(Boolean).join(', ') : '';
  const s1Text = [d.title.trim(), who, d.sub, d.loc].filter(Boolean).join(' · ');
  const last = d.dates[d.dates.length - 1];
  const s2Text =
    d.repeat === 'none'
      ? `ครั้งเดียว · ${thaiDate(d.dates[0])}`
      : `${REPEAT_LABEL[d.repeat]} · ${d.dates.length} วัน · ${dateRange(d.dates[0], last)}`;
  const dur = d.end - d.start;

  return (
    <Screen
      title={d.editId ? 'แก้ไขกิจกรรม' : 'เพิ่มกิจกรรม'}
      headerRight={headerRight}
      scrollRef={scrollRef}
      scrollLocked={dragging}
      onBack={goBack}
      action={{ label: d.editId ? 'บันทึกการแก้ไข' : 'บันทึก', icon: 'check', onPress: onSave }}>
      {d.editId ? <EditBanner title={editing?.title ?? d.title} date={d.editDate} /> : null}

      <View onLayout={(e: LayoutChangeEvent) => (stepsTop.current = e.nativeEvent.layout.y)} style={{ gap: 8 }}>
        {/* ① หมวดและรายละเอียด */}
        <View onLayout={(e: LayoutChangeEvent) => (stepY.current[1] = e.nativeEvent.layout.y)}>
          {open === 1 ? (
            <StepOpen n={1} title="หมวดและรายละเอียด">
              <DetailsBody />
              <NextBtn label="ถัดไป · วันที่และการทำซ้ำ" disabled={!step1Done} hint={!d.cat ? 'เลือกหมวดก่อน' : !step1Done ? 'ใส่ชื่อกิจกรรม' : undefined} onPress={() => setOpen(2)} />
            </StepOpen>
          ) : (
            <StepSummary n={1} label="หมวดและรายละเอียด" done={step1Done} changed={changed(1)} onPress={() => setOpen(1)}>
              {cat ? (
                <Txt size={14.5} weight="med" numberOfLines={2} style={{ lineHeight: 20 }}>
                  <Txt size={14.5} weight="bold" color={cat.color}>
                    ●{' '}
                  </Txt>
                  {cat.short}
                  {s1Text ? ` · ${s1Text}` : ' · ยังไม่ได้ใส่ชื่อ'}
                </Txt>
              ) : (
                <Txt size={14.5} color={t.sub}>
                  ยังไม่ได้เลือกหมวด
                </Txt>
              )}
            </StepSummary>
          )}
        </View>

        {/* ② วันที่และการทำซ้ำ */}
        <View onLayout={(e: LayoutChangeEvent) => (stepY.current[2] = e.nativeEvent.layout.y)}>
          {!step1Done ? (
            <StepPending n={2} title="วันที่และการทำซ้ำ" />
          ) : open === 2 ? (
            <StepOpen n={2} title="วันที่และการทำซ้ำ" right={`${d.dates.length} วัน`}>
              <DatesBody />
              <NextBtn label="ถัดไป · เวลา" onPress={() => setOpen(3)} />
            </StepOpen>
          ) : (
            <StepSummary n={2} label="วันที่และการทำซ้ำ" done changed={changed(2)} onPress={() => setOpen(2)}>
              <Txt size={14.5} weight="med" numberOfLines={2} style={{ lineHeight: 20 }}>
                {s2Text}
                {d.editId && !changed(2) ? <Txt size={14.5} color={t.sub}>{' (เดิม)'}</Txt> : null}
              </Txt>
            </StepSummary>
          )}
        </View>

        {/* ③ เวลา */}
        <View onLayout={(e: LayoutChangeEvent) => (stepY.current[3] = e.nativeEvent.layout.y)}>
          {!step1Done ? (
            <StepPending n={3} title="เวลา" />
          ) : open === 3 ? (
            <StepOpen n={3} title="เวลา">
              <TimeBody analysis={analysis} onDragState={setDragging} />
              <NextBtn label="ถัดไป · แจ้งเตือน" onPress={() => setOpen(4)} />
            </StepOpen>
          ) : (
            <StepSummary
              n={3}
              label="เวลา"
              done={dur > 0}
              warn={analysis.conflictDays > 0}
              changed={changed(3)}
              onPress={() => setOpen(3)}
              footer={analysis.conflictDays > 0 ? <SuggestStrip analysis={analysis} inset /> : undefined}>
              <Txt size={14.5} weight="med" numberOfLines={2} style={{ lineHeight: 20 }}>
                <Txt size={14.5} num weight="med">
                  {fmtMin(d.start)}–{fmtMin(d.end)}
                </Txt>
                <Txt size={14.5} color={t.sub}>
                  {dur > 0 ? ` · ${durText(dur)}` : ' · เวลาไม่ถูกต้อง'}
                </Txt>
                {changed(3) ? (
                  <>
                    {'  '}
                    <Txt size={13} num color={t.faint} style={{ textDecorationLine: 'line-through' }}>
                      {`${fmtMin(snap.start)}–${fmtMin(snap.end)}`}
                    </Txt>
                  </>
                ) : null}
              </Txt>
              {analysis.conflictDays > 0 ? (
                <Txt size={12.5} weight="bold" color={t.warn} style={{ marginTop: 3 }}>
                  {analysis.text}
                </Txt>
              ) : null}
            </StepSummary>
          )}
        </View>

        {/* ④ แจ้งเตือน (ไม่บังคับ) */}
        <View onLayout={(e: LayoutChangeEvent) => (stepY.current[4] = e.nativeEvent.layout.y)}>
          {!step1Done ? (
            <StepPending n={4} title="แจ้งเตือน" right="ไม่บังคับ" />
          ) : open === 4 ? (
            <StepOpen n={4} title="แจ้งเตือน" right="ไม่บังคับ">
              <NotifyBody />
            </StepOpen>
          ) : (
            <StepSummary n={4} label="แจ้งเตือน" done changed={changed(4)} onPress={() => setOpen(4)}>
              <Txt size={14.5} weight="med">
                {d.notify ? (d.before === 0 ? 'แจ้งเมื่อถึงเวลาเริ่ม' : `แจ้งก่อนเริ่ม ${durText(d.before)}`) : 'ไม่แจ้งเตือน'}
              </Txt>
            </StepSummary>
          )}
        </View>

        {askScope && editing && d.editDate ? <ScopeCard editing={editing} editDate={d.editDate} /> : null}
      </View>
    </Screen>
  );
}

// ---------- ชิ้นส่วนของขั้น ----------

function HeaderPill({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTokens();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: pressed ? t.rail : t.track, justifyContent: 'center' })}>
      <Txt size={13} weight="med" color={t.sub}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** วงกลมเลขขั้น — open = ส้มทึบ · done = เขียว ✓ · warn = วงส้ม "!" · pending = วงเทา */
function StepDot({ n, kind }: { n: number; kind: 'open' | 'done' | 'warn' | 'pending' }) {
  const t = useTokens();
  const bg = kind === 'open' ? '#B44E2C' : kind === 'done' ? GREEN : t.card;
  const bd = kind === 'warn' ? '#D2603A' : kind === 'pending' ? t.railDash : 'transparent';
  return (
    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: bg, borderWidth: bd === 'transparent' ? 0 : 2, borderColor: bd, alignItems: 'center', justifyContent: 'center' }}>
      {kind === 'done' ? (
        <SvgIcon name="check" size={14} color="#FFFFFF" strokeWidth={3} />
      ) : (
        <Txt size={12} num weight="bold" color={kind === 'open' ? '#FFFFFF' : kind === 'warn' ? '#D2603A' : t.sub}>
          {kind === 'warn' ? '!' : n}
        </Txt>
      )}
    </View>
  );
}

function StepOpen({ n, title, right, children }: { n: Step; title: string; right?: string; children: ReactNode }) {
  const t = useTokens();
  return (
    <View style={{ gap: 8 }}>
      <View accessibilityRole="header" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 4, paddingHorizontal: 2 }}>
        <StepDot n={n} kind="open" />
        <Txt size={15} weight="bold" style={{ flex: 1 }}>
          {title}
        </Txt>
        {right ? (
          <Txt size={13} weight="bold" color={t.accentInk}>
            {right}
          </Txt>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** ขั้นที่ยังไปไม่ถึง (ขั้น 1 ยังไม่ครบ) — หัวจาง แตะไม่ได้ */
function StepPending({ n, title, right }: { n: Step; title: string; right?: string }) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 4, paddingHorizontal: 2, opacity: 0.6 }}>
      <StepDot n={n} kind="pending" />
      <Txt size={15} weight="bold" style={{ flex: 1 }}>
        {title}
      </Txt>
      {right ? (
        <Txt size={12.5} color={t.sub}>
          {right}
        </Txt>
      ) : null}
    </View>
  );
}

/** ขั้นที่พับ — แถวสรุปแตะได้ทั้งแถว (แก้) · footer = แถบเสนอทางแก้ต่อท้ายในการ์ดเดียวกัน */
function StepSummary({
  n,
  label,
  done,
  warn,
  changed,
  onPress,
  footer,
  children,
}: {
  n: Step;
  label: string;
  done: boolean;
  warn?: boolean;
  changed?: boolean;
  onPress: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const t = useTokens();
  return (
    <View style={{ backgroundColor: t.card, borderRadius: 16, overflow: 'hidden', shadowColor: '#221C13', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`แก้ขั้น ${n} ${label}`}
        onPress={onPress}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 9, paddingLeft: 14, paddingRight: 12, backgroundColor: pressed ? t.track : 'transparent' })}>
        <StepDot n={n} kind={warn ? 'warn' : done ? 'done' : 'pending'} />
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Txt size={12} color={t.sub}>
              {n} · {label}
            </Txt>
            {changed ? (
              <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: 8, backgroundColor: 'rgba(210,96,58,0.15)' }}>
                <Txt size={11.5} weight="bold" color={t.warn}>
                  เปลี่ยนแล้ว
                </Txt>
              </View>
            ) : null}
          </View>
          {children}
        </View>
        <Txt size={13} weight="bold" color={t.accentInk}>
          แก้
        </Txt>
      </Pressable>
      {footer}
    </View>
  );
}

function NextBtn({ label, onPress, disabled, hint }: { label: string; onPress: () => void; disabled?: boolean; hint?: string }) {
  const t = useTokens();
  return (
    <View style={{ alignItems: 'flex-end', gap: 4, paddingTop: 2 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => ({ height: 44, paddingLeft: 18, paddingRight: 12, borderRadius: 22, backgroundColor: disabled ? t.track : pressed ? '#000000' : t.ink, flexDirection: 'row', alignItems: 'center', gap: 4, opacity: disabled ? 0.7 : 1 })}>
        <Txt size={14} weight="bold" color={disabled ? t.faint : t.bg}>
          {label}
        </Txt>
        <SvgIcon name="chevR" size={16} color={disabled ? t.faint : t.bg} strokeWidth={2.4} />
      </Pressable>
      {disabled && hint ? (
        <Txt size={12} color={t.faint}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

function EditBanner({ title, date }: { title: string; date: string | null }) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 2 }}>
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(90,126,168,0.14)', alignItems: 'center', justifyContent: 'center' }}>
        <SvgIcon name="edit" size={16} color="#3F5E82" strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Txt size={12.5} color={t.sub}>
          กำลังแก้ไข{date ? ` · เปิดจาก ${thaiDate(date)}` : ''}
        </Txt>
        <Txt size={17} weight="bold" numberOfLines={3} style={{ lineHeight: 24 }}>
          {title}
        </Txt>
      </View>
    </View>
  );
}

// ---------- วิเคราะห์เวลาชน + เสนอช่วงว่าง ----------

interface Analysis {
  per: { date: string; items: ReturnType<typeof getDay>; conflicts: ReturnType<typeof getDay>; slots: PreviewSlot[] }[];
  conflictDays: number;
  /** "ชน “ตื่นนอน” 06:00–06:30 ทั้ง 22 วัน" */
  text: string;
  /** เวลาเริ่มที่ใกล้ที่สุด (ความยาวเท่าเดิม) ที่ไม่ชนเลยทุกวันที่เลือก — null = หาไม่เจอ */
  suggest: number | null;
  multi: boolean;
}

/** ตรวจได้สูงสุดกี่วันตอนหาช่วงว่างร่วม (ชุดยาว 1 ปี ตรวจแค่ช่วงต้น ๆ พอ) */
const SUGGEST_SAMPLE = 62;

function useScheduleAnalysis(): Analysis {
  const d = useDraft();
  const getDay = useDayReader(); // อ่านผ่าน hook — อัปเดตเมื่อข้อมูลเปลี่ยน (ปลอดภัยกับ React Compiler)
  return useMemo(() => {
    const itemsOf = (date: string) => getDay(date).filter((i) => i.id !== d.editId);
    const per = d.dates.slice(0, 5).map((date) => {
      const items = itemsOf(date);
      // ช่วงว่าง — แยกท่อนดึก (01:00–06:00) ออกมาเป็นอีกชิ้น เพื่อไม่ให้ช่วงกลางวันถูกลากยาวข้ามคืน
      return { date, items, conflicts: conflictsOn(items, d.start, d.end), slots: splitAtNight(freeSlots(items)).slice(0, 6) };
    });
    let conflictDays = 0;
    const hits = new Map<number, { title: string; start: number; end: number; n: number }>();
    for (const date of d.dates) {
      const c = conflictsOn(itemsOf(date), d.start, d.end);
      if (!c.length) continue;
      conflictDays++;
      for (const x of c) {
        const h = hits.get(x.id) ?? { title: x.title, start: x.startMin, end: x.endMin, n: 0 };
        h.n++;
        hits.set(x.id, h);
      }
    }
    const total = d.dates.length;
    const ranked = [...hits.values()].sort((a, b) => b.n - a.n);
    const days = total === 1 ? '' : conflictDays === total ? ` ทั้ง ${total} วัน` : ` ใน ${conflictDays} จาก ${total} วัน`;
    const short = (s: string) => (s.length > 24 ? `${s.slice(0, 23)}…` : s);
    const text = !ranked.length
      ? ''
      : ranked.length === 1
        ? `ชน “${short(ranked[0].title)}” ${fmtMin(ranked[0].start)}–${fmtMin(ranked[0].end)}${days}`
        : `ชนกับ ${ranked.length} กิจกรรม เช่น “${short(ranked[0].title)}”${days}`;

    let suggest: number | null = null;
    const dur = d.end - d.start;
    if (conflictDays && dur > 0) {
      const sample = d.dates.slice(0, SUGGEST_SAMPLE).map(itemsOf);
      // เสนอเฉพาะช่วงกลางวัน (ถึง 24:00) — ยกเว้นกิจกรรมเดิมตั้งไว้ดึกอยู่แล้ว (ไม่เสนอให้ไปตี 2 แทนเวลาเย็น)
      const limit = d.end > FREE_WINDOW_END ? DAY_END : FREE_WINDOW_END;
      const ok = (s: number) => s >= DAY_START && s + dur <= limit && sample.every((items) => conflictsOn(items, s, s + dur).length === 0);
      // ไล่ห่างจากเวลาเดิมทีละ 15 นาที — เวลาหลังก่อนเวลาก่อน (เลื่อนออกไปมักง่ายกว่าเลื่อนเข้ามา)
      for (let k = 1; k * SNAP <= DAY_END - DAY_START && suggest === null; k++) {
        if (ok(d.start + k * SNAP)) suggest = d.start + k * SNAP;
        else if (ok(d.start - k * SNAP)) suggest = d.start - k * SNAP;
      }
    }
    return { per, conflictDays, text, suggest, multi: total > 1 };
  }, [getDay, d.dates, d.start, d.end, d.editId]);
}

/** แถบเสนอช่วงว่างที่ใกล้ที่สุด (ความยาวเท่าเดิม) — แตะ "ใช้" แล้วย้ายเวลาให้เลย */
function SuggestStrip({ analysis, inset }: { analysis: Analysis; inset?: boolean }) {
  const t = useTokens();
  const d = useDraft();
  const showToast = useUI((s) => s.showToast);
  const dur = d.end - d.start;
  const s = analysis.suggest;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 8,
        paddingRight: 12,
        paddingLeft: inset ? 50 : 12,
        borderTopWidth: inset ? 1 : 0,
        borderTopColor: t.line,
        borderRadius: inset ? 0 : 12,
        backgroundColor: 'rgba(210,96,58,0.07)',
      }}>
      <Txt size={12.5} color={t.sub} style={{ flex: 1, lineHeight: 18 }}>
        {s == null ? (analysis.multi ? 'ไม่มีช่วงที่ว่างตรงกันทุกวัน — บันทึกซ้อนได้' : 'ไม่มีช่วงว่างพอในวันนี้ — บันทึกซ้อนได้') : analysis.multi ? 'ช่วงที่ว่างทุกวันและใกล้ที่สุด' : 'ช่วงว่างที่ใกล้ที่สุด'}
      </Txt>
      {s != null ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            d.set({ start: s, end: s + dur });
            showToast(`ย้ายไป ${fmtMin(s)}–${fmtMin(s + dur)} แล้ว`, { label: 'เลิกทำ', run: () => useDraft.getState().set({ start: d.start, end: d.end }) });
          }}
          style={({ pressed }) => ({ height: 40, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1.5, borderColor: '#B44E2C', backgroundColor: pressed ? 'rgba(180,78,44,0.08)' : t.card, justifyContent: 'center' })}>
          <Txt size={13} num weight="bold" color={t.accentInk}>
            ใช้ {fmtMin(s)}–{fmtMin(s + dur)}
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

// ---------- บันทึก ----------

function useSave(editing: Activity | undefined, askScope: boolean, openStep1: () => void) {
  const d = useDraft();
  const router = useRouter();
  const showToast = useUI((s) => s.showToast);
  const { add, editActivity } = useActivities();
  return async () => {
    if (!d.cat || !d.title.trim()) {
      openStep1();
      return showToast(!d.cat ? 'เลือกหมวดก่อน' : 'ใส่ชื่อกิจกรรม');
    }
    if (d.end <= d.start) return showToast('เวลาสิ้นสุดต้องมากกว่าเริ่ม');
    const isOnce = d.repeat === 'none';
    const isCustom = d.repeat === 'custom';
    const startDate = d.dates[0];
    // แก้ไขชุดเดิมที่ยังไม่ได้เลือกระยะเวลาใหม่ → จบวันเดิม (keepEnd) ไม่รีเซ็ตเป็นค่าตาม horizon
    const endDate = isOnce ? null : isCustom ? d.dates[d.dates.length - 1] : d.keepEnd ? d.keepEnd.endDate : addDays(startDate, HORIZON_DAYS[d.horizon] - 1);

    const fields = {
      title: d.title.trim(),
      cat: d.cat as CatId,
      sub: d.sub || null,
      loc: d.loc || null,
      channel: d.cat === 'case' ? d.channel : null,
      priority: d.cat === 'case' ? d.priority : null,
      startMin: d.start,
      endMin: d.end,
      repeat: d.repeat,
      daysMask: isOnce ? 0 : maskFromDates(d.dates),
      // "เลือกเอง" เก็บวันที่ที่เลือกจริง — daysMask อย่างเดียวจะงอกทุกวันในสัปดาห์เดียวกันที่อยู่ในช่วง
      dates: isCustom ? [...d.dates] : null,
      startDate,
      endDate,
      notify: d.notify,
      notifyBefore: d.before,
      detachedFrom: null,
      status: 'active' as const,
      contactIds: d.cat === 'case' ? d.contactIds : [],
      color: null, // สีจากไฟล์ Time Table เท่านั้น — กิจกรรมที่สร้างในแอปใช้สีตามหมวด
    };

    // วันที่ให้แท็บวันนี้เปิดโชว์หลังบันทึก — แก้เฉพาะ/ตั้งแต่ครั้งนี้ = วันที่เปิดมาแก้
    let focusDate = startDate;
    try {
      if (d.editId) {
        if (!editing) return showToast('ไม่พบกิจกรรมนี้แล้ว');
        // แก้ไขกิจกรรมที่นำเข้ามา: รักษาสีเดิมที่จำจากไฟล์ไว้
        const scope = askScope ? d.scope : 'all';
        await editActivity(editing, { ...fields, detachedFrom: editing.detachedFrom, color: editing.color }, scope, d.editDate);
        if (scope !== 'all' && d.editDate) focusDate = d.editDate;
        showToast(scope === 'one' ? 'บันทึกเฉพาะครั้งนี้แล้ว ✓' : scope === 'future' ? 'บันทึกตั้งแต่ครั้งนี้เป็นต้นไปแล้ว ✓' : 'บันทึกการแก้ไขแล้ว ✓');
      } else {
        await add(fields);
        showToast(`เพิ่มแล้ว ${d.dates.length} วัน ✓`);
      }
    } catch (e) {
      // เขียนลงเครื่องไม่สำเร็จ — คงฟอร์มไว้ให้กดบันทึกใหม่ได้ ไม่ล้างทิ้ง
      console.warn('[add] save failed', e);
      return showToast('บันทึกไม่สำเร็จ — ลองกดบันทึกอีกครั้ง');
    }
    d.reset();
    useUI.getState().closeSheet(); // บันทึกแล้วจบงาน — ทิ้งแผ่นที่พักไว้ ไม่ให้เด้งขึ้นทับหน้าวันนี้
    // ให้แท็บวันนี้เปิดโชว์วันของกิจกรรมที่เพิ่งบันทึก — ผู้ใช้เห็นผลทันทีแม้ลงวันอื่น
    useUI.getState().setFocusDate(focusDate);
    router.navigate('/');
  };
}

// ---------- ส่วนบน: หมวด + รายละเอียด ----------

function DetailsBody() {
  const t = useTokens();
  const d = useDraft();
  const router = useRouter();
  const showToast = useUI((s) => s.showToast);
  const contacts = useContacts((s) => s.list);
  const upsertContact = useContacts((s) => s.upsert);
  const quickPicks = useSettings((s) => s.quickPicks);
  const catOptions = useSettings((s) => s.catOptions);
  const optionSet = d.cat ? CAT_OPTIONS[d.cat] : undefined; // สถานที่ (งาน) · ประเภท (ออกกำลังกาย) · สื่อ (เรียนรู้)
  const [newName, setNewName] = useState('');
  const [addingContact, setAddingContact] = useState(false);

  // คนที่เลือกไว้ (ตามลำดับที่กด) — ใช้กางรายละเอียดช่องทางติดต่อใต้แถวชิป
  const pickedContacts = d.contactIds.map((id) => contacts.find((c) => c.id === id)).filter((c): c is Contact => !!c);

  return (
    <>
      {/* หมวด + รายละเอียด รวมในการ์ดพื้นหลังเดียว — ส่วนรายละเอียดโผล่ใต้เส้นคั่นเมื่อเลือกหมวดแล้ว */}
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {CATS.map((c) => {
            const active = d.cat === c.id;
            return (
              <Pressable
                key={c.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                onPress={() => d.set({ cat: c.id })}
                style={{
                  width: '47.5%',
                  padding: 14,
                  borderRadius: 18,
                  backgroundColor: active ? c.color + '22' : t.bg,
                  borderWidth: 1.5,
                  borderColor: active ? c.color : 'transparent',
                  gap: 8,
                }}>
                <Icon name={c.icon} size={22} color={c.color} />
                <Txt size={13} weight="med">{c.name}</Txt>
              </Pressable>
            );
          })}
        </View>

        {d.cat ? (
          <>
            <View style={{ height: 1, backgroundColor: t.line }} />
            <TextInput
              value={d.title}
              onChangeText={(title) => d.set({ title })}
              placeholder="พิมพ์ชื่อกิจกรรม…"
              placeholderTextColor={t.faint}
              accessibilityLabel="ชื่อกิจกรรม"
              style={{ backgroundColor: t.bg, borderRadius: 12, borderWidth: 1, borderColor: t.line, minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, color: t.ink, fontFamily: FONT.uiMed, fontSize: 15 }}
            />
            <ChipRow>
              {quickPicks[d.cat].map((q) => (
                <Chip key={q} small label={q} active={d.title === q} onPress={() => d.set({ title: q })} />
              ))}
            </ChipRow>

            {/* ตัวเลือกย่อยของหมวด (สถานที่/ประเภท/สื่อ) — รายการมาจากตั้งค่า › จัดการหมวดหมู่ แก้ไข/เพิ่ม/ลบได้ที่นั่น */}
            {optionSet ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Txt size={13} weight="med" color={t.sub} style={{ flex: 1 }}>{optionSet.title}</Txt>
                  <Chip small icon="edit" label="แก้ไขตัวเลือก" onPress={() => router.push('/settings/categories')} />
                </View>
                <ChipRow>
                  {catOptions[d.cat].map((o) => {
                    const cur = optionSet.field === 'loc' ? d.loc : d.sub;
                    return (
                      <Chip
                        key={o}
                        small
                        label={o}
                        active={cur === o}
                        onPress={() => d.set({ [optionSet.field]: cur === o ? '' : o })}
                      />
                    );
                  })}
                  {catOptions[d.cat].length === 0 ? (
                    <Txt size={12} color={t.faint}>ยังไม่มีตัวเลือก — เพิ่มได้ที่ ตั้งค่า › จัดการหมวดหมู่</Txt>
                  ) : null}
                </ChipRow>
              </>
            ) : null}
          </>
        ) : null}

        {d.cat === 'case' ? (
          <>
            <View style={{ height: 1, backgroundColor: t.line }} />
            {/* คนที่นัด — เลือกจากสมุดรายชื่อ · ปุ่มแก้ไขพาไปหน้าสมุดรายชื่อเพื่อเติม/แก้ข้อมูลติดต่อ */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Txt size={13} weight="med" color={t.sub} style={{ flex: 1 }}>คนที่นัด</Txt>
              <Chip small icon="edit" label="แก้ไขรายชื่อ" onPress={() => router.push('/settings/contacts')} />
            </View>
            <ChipRow>
              {contacts.map((c) => (
                <Chip
                  key={c.id}
                  small
                  label={c.name}
                  active={d.contactIds.includes(c.id)}
                  onPress={() =>
                    d.set({
                      contactIds: d.contactIds.includes(c.id) ? d.contactIds.filter((x) => x !== c.id) : [...d.contactIds, c.id],
                    })
                  }
                />
              ))}
              <Chip small label="+ เพิ่ม" active={addingContact} onPress={() => setAddingContact(true)} />
            </ChipRow>
            {addingContact ? (
              <View style={{ gap: 8 }}>
                <TextInput
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="ชื่อรายชื่อใหม่…"
                  placeholderTextColor={t.faint}
                  autoFocus
                  style={{ backgroundColor: t.card2, borderRadius: 12, borderWidth: 1, borderColor: t.line, padding: 10, color: t.ink, fontFamily: FONT.ui, fontSize: 14 }}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {/* ยกเลิกการเพิ่ม — ปิดช่องกรอกและทิ้งชื่อที่พิมพ์ค้างไว้ */}
                  <Btn
                    style={{ flex: 1 }}
                    kind="ghost"
                    label="ยกเลิก"
                    onPress={() => {
                      setNewName('');
                      setAddingContact(false);
                    }}
                  />
                  <Btn
                    style={{ flex: 1 }}
                    label="เพิ่ม"
                    disabled={!newName.trim()}
                    onPress={async () => {
                      const name = newName.trim();
                      if (!name) return;
                      await upsertContact({ name, priority: 'P6', phone: null, line: null, email: null, zoom: null, googlemeet: null, note: null, org: null });
                      setNewName('');
                      setAddingContact(false);
                      showToast(`เพิ่ม ${name} ในสมุดรายชื่อแล้ว ✓`);
                    }}
                  />
                </View>
              </View>
            ) : null}

            {/* รายละเอียดของคนที่เลือกไว้ — ช่องทางติดต่อที่มี พร้อมหัวข้อกำกับ · แตะแก้ไขเพื่อไปเติมในสมุดรายชื่อ */}
            {pickedContacts.map((c) => {
              const channels = contactChannels(c);
              return (
                <View key={c.id} style={{ backgroundColor: t.card2, borderRadius: 12, borderWidth: 1, borderColor: t.line, padding: 10, gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <SvgIcon name="user" size={14} color={t.sub} />
                    <Txt size={13.5} weight="bold" style={{ flex: 1 }} numberOfLines={1}>{c.name}</Txt>
                    <PriBadge id={c.priority} />
                    <Chip small icon="edit" label="แก้ไข" onPress={() => router.push({ pathname: '/settings/contacts', params: { edit: String(c.id) } })} />
                  </View>
                  {channels.length ? (
                    channels.map((ch) => (
                      <View key={ch.label} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 7 }}>
                        <SvgIcon name={ch.icon} size={13} color={t.faint} />
                        <Txt size={12} color={t.faint} style={{ width: 54 }}>{ch.label}</Txt>
                        <Txt size={12.5} color={t.ink} style={{ flex: 1 }} numberOfLines={ch.label === 'หมายเหตุ' ? 3 : 1}>
                          {ch.value}
                        </Txt>
                      </View>
                    ))
                  ) : (
                    <Txt size={12} color={t.faint}>ยังไม่มีข้อมูลติดต่อ — แตะ “แก้ไข” เพื่อเพิ่มเบอร์/LINE/ห้องประชุม</Txt>
                  )}
                </View>
              );
            })}

            <Txt size={13} weight="med" color={t.sub}>ระดับความสำคัญ</Txt>
            <ChipRow>
              {PRI.map((p) => (
                <Chip key={p.id} small label={`${p.id} · ${p.label}`} color={p.color} active={d.priority === p.id} onPress={() => d.set({ priority: p.id })} />
              ))}
            </ChipRow>

            <Txt size={13} weight="med" color={t.sub}>ช่องทาง</Txt>
            <ChipRow>
              <Chip small icon="video" label="ออนไลน์" active={d.channel === 'online'} onPress={() => d.set({ channel: 'online' })} />
              <Chip small icon="mappin" label="พบตัว" active={d.channel === 'inperson'} onPress={() => d.set({ channel: 'inperson' })} />
            </ChipRow>
          </>
        ) : null}
      </Card>
    </>
  );
}

// ---------- ② วันที่และการทำซ้ำ ----------

function DatesBody() {
  const t = useTokens();
  const d = useDraft();
  const showToast = useUI((s) => s.showToast);
  const anchor = d.dates[0]; // draft การันตีมีอย่างน้อย 1 วันเสมอ
  const [ym, setYm] = useState(() => {
    const dt = fromISO(anchor);
    return { y: dt.getFullYear(), m: dt.getMonth() };
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  // ปฏิทิน: เปิดเองอัตโนมัติเมื่อต้องเลือกวันเอง (ครั้งเดียว / เลือกเอง) · ทำซ้ำตามสูตร = พับไว้ แตะ "ดูบนปฏิทิน"
  const [calPref, setCalPref] = useState<boolean | null>(null);
  const calOpen = calPref ?? (d.repeat === 'none' || d.repeat === 'custom');
  // วันแรกเปลี่ยน (โหลดร่าง/แตะวัน) → เลื่อนปฏิทินตาม — ปรับ state ระหว่าง render แทน effect
  const [seenAnchor, setSeenAnchor] = useState(anchor);
  if (seenAnchor !== anchor) {
    setSeenAnchor(anchor);
    const dt = fromISO(anchor);
    setYm({ y: dt.getFullYear(), m: dt.getMonth() });
  }
  const last = d.dates[d.dates.length - 1];
  const datesDirty = d.repeat !== 'none' || d.dates.length > 1 || d.dates[0] !== todayISO();

  return (
    <Card style={{ gap: 10, padding: 12 }}>
      <Segmented<RepeatRule> options={REPEATS} value={d.repeat} onChange={(r) => d.setRepeat(r)} />

      {d.repeat !== 'none' && d.repeat !== 'custom' ? (
        <>
          <Txt size={12.5} color={t.sub}>
            ลงต่อเนื่องนาน
          </Txt>
          <ChipRow style={{ gap: 6, marginTop: -4 }}>
            {/* แก้ไขชุดเดิมที่ช่วงไม่ตรงชิปไหน — คงวันสิ้นสุดเดิมไว้จนกว่าจะเลือกระยะเวลาใหม่เอง */}
            {d.keepEnd ? <Chip small label={d.keepEnd.endDate ? `เดิม: ถึง ${shortDate(d.keepEnd.endDate)}` : 'เดิม: ไม่มีวันสิ้นสุด'} active /> : null}
            {HORIZONS.map((h) => (
              <Chip key={h.key} small label={h.label} active={!d.keepEnd && d.horizon === h.key} onPress={() => d.setHorizon(h.key)} />
            ))}
          </ChipRow>
        </>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: calOpen }}
        onPress={() => setCalPref(!calOpen)}
        style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: pressed ? t.track : t.bg, flexDirection: 'row', alignItems: 'center', gap: 8 })}>
        <SvgIcon name="calendar" size={16} color={t.sub} strokeWidth={1.8} />
        <Txt size={13} style={{ flex: 1 }} numberOfLines={2}>
          {d.repeat === 'none' ? (
            <>
              ลงวันเดียว · <Txt size={13} weight="bold">{thaiDate(anchor)}</Txt>
            </>
          ) : (
            <>
              รวม <Txt size={13} weight="bold">{d.dates.length} วัน</Txt> · {dateRange(anchor, last)}
            </>
          )}
        </Txt>
        <Txt size={13} weight="bold" color={t.accentInk}>
          {calOpen ? 'ซ่อนปฏิทิน' : d.repeat === 'none' ? 'เปลี่ยนวัน ›' : 'ดูบนปฏิทิน ›'}
        </Txt>
      </Pressable>

      {calOpen ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Pressable accessibilityRole="button" onPress={() => setPickerOpen(true)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 }}>
              <Txt size={14} weight="bold">
                {MONTH_TH_FULL[ym.m]} {beYear(ym.y)}
              </Txt>
              <Icon name="chevD" size={16} color={t.sub} />
            </Pressable>
            {datesDirty ? (
              <Chip
                small
                icon="restore"
                label="รีเซ็ตเป็นวันนี้"
                onPress={() => {
                  d.resetDates();
                  showToast('รีเซ็ตเป็นวันนี้วันเดียวแล้ว');
                }}
              />
            ) : null}
          </View>
          <MonthGrid
            year={ym.y}
            month={ym.m}
            mode="select"
            selected={d.dates}
            // ครั้งเดียว: แตะวัน = ย้ายไปวันนั้น · แบบอื่น: แตะเพิ่ม/เอาออก (กลายเป็น "เลือกเอง")
            onPressDay={(iso) => (d.repeat === 'none' ? d.set({ dates: [iso] }) : d.toggleDate(iso))}
          />
          <Txt size={12} color={t.faint}>
            {d.repeat === 'none' ? 'แตะวันเพื่อย้ายไปวันนั้น' : 'แตะวันเพื่อเพิ่ม/เอาออก — แก้เองแล้วจะเป็น "เลือกเอง"'}
          </Txt>
        </>
      ) : null}
      <MonthYearPicker visible={pickerOpen} year={ym.y} month={ym.m} onClose={() => setPickerOpen(false)} onPick={(y, m) => setYm({ y, m })} />
    </Card>
  );
}

// ---------- ③ เวลา ----------

function TimeBody({ analysis, onDragState }: { analysis: Analysis; onDragState: (dragging: boolean) => void }) {
  const t = useTokens();
  const d = useDraft();
  const showToast = useUI((s) => s.showToast);
  // ลากเลือกเวลา: แถบ 24 ชม. (ค่าเริ่มต้น) ↔ รางแนวตั้งแบบละเอียด
  const [detailed, setDetailed] = useState(false);
  // วันที่ใช้เทียบ (กิจกรรมเดิม · ช่วงว่าง · ที่ชน) — เลือกได้เมื่อลงหลายวัน (ดูได้ 5 วันแรก)
  const [refPick, setRefPick] = useState(0);
  const refIdx = Math.min(refPick, Math.max(analysis.per.length - 1, 0));
  const ref = analysis.per[refIdx];
  const refItems = ref?.items ?? [];
  const slots = ref?.slots ?? [];
  // โหมด "ช่วงเวลา" ที่เลือกอยู่ = นาทีเริ่มของพรีเซ็ต (null = ไม่ได้ใช้พรีเซ็ต)
  // เก็บเป็น state แทนการเทียบกับ d.start ตรง ๆ — ปรับละเอียด เริ่ม/สิ้นสุด แล้วชิปพรีเซ็ตยังติดอยู่
  const [period, setPeriod] = useState(() => ({ rev: d.loadRev, start: PERIOD_PRESETS.find((p) => p.start === d.start)?.start ?? null }));
  const periodStart = period.rev === d.loadRev ? period.start : (PERIOD_PRESETS.find((p) => p.start === d.start)?.start ?? null);
  const setPeriodStart = (start: number | null) => setPeriod({ rev: d.loadRev, start });
  const timeInvalid = d.end <= d.start;
  const duration = d.end - d.start;
  const setRange = (s: number, e: number) => {
    setPeriodStart(PERIOD_PRESETS.find((x) => x.start === s)?.start ?? null);
    d.set({ start: s, end: e });
  };
  const multi = d.dates.length > 1;

  return (
    <Card style={{ gap: 10 }}>
      {/* ── ลากเลือกเวลา + กิจกรรมเดิม + ช่วงว่าง + ที่ชน (รวมในที่เดียว) ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Txt size={13} weight="bold" style={{ flex: 1 }} numberOfLines={1}>
          ลากเลือกเวลา
        </Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: detailed }}
          onPress={() => setDetailed(!detailed)}
          hitSlop={6}
          style={({ pressed }) => ({ height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: pressed ? t.rail : t.track, justifyContent: 'center' })}>
          <Txt size={12.5} weight="bold" color={t.accentInk}>
            {detailed ? 'ย่อเป็นแถบ' : 'ขยายแบบละเอียด'}
          </Txt>
        </Pressable>
      </View>

      {multi ? (
        // ลงหลายวัน — เลือกวันที่จะดูกิจกรรมเดิม (จุดแดง = วันนั้นเวลาชน)
        <View style={{ gap: 4 }}>
          <Txt size={12} color={t.sub}>
            ดูกิจกรรมเดิมของวัน{d.dates.length > analysis.per.length ? ` (${analysis.per.length} วันแรกจาก ${d.dates.length})` : ''}
          </Txt>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {analysis.per.map((p, i) => {
              const on = i === refIdx;
              return (
                <Pressable
                  key={p.date}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${thaiDate(p.date)}${p.conflicts.length ? ' · เวลาชน' : ''}`}
                  onPress={() => setRefPick(i)}
                  style={{ height: 34, paddingHorizontal: 12, borderRadius: 17, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: on ? t.ink : t.track }}>
                  <Txt size={13} weight={on ? 'bold' : 'med'} color={on ? t.bg : t.sub}>
                    {shortDate(p.date)}
                  </Txt>
                  {p.conflicts.length ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#D2603A' }} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {detailed ? (
        <TimeDragRail start={d.start} end={d.end} items={refItems} free={slots} title={d.title.trim()} onDragState={onDragState} onChange={setRange} />
      ) : (
        <TimeDragBar start={d.start} end={d.end} items={refItems} free={slots} onDragState={onDragState} onChange={setRange} />
      )}

      {/* ผลของช่วงที่เลือก — ชน (ทุกวันที่ลง) + เสนอช่วงที่ใกล้ที่สุด · หรือว่างตลอดช่วง */}
      {analysis.conflictDays > 0 ? (
        <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(210,96,58,0.45)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10 }}>
            <SvgIcon name="alert" size={16} color={t.warn} strokeWidth={2} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt size={12.5} weight="bold" color={t.warn} style={{ lineHeight: 18 }}>
                {analysis.text} — บันทึกซ้อนได้
              </Txt>
              {multi && ref ? (
                <Txt size={12} color={t.sub} style={{ lineHeight: 17 }}>
                  {shortDate(ref.date)}: {ref.conflicts.length ? `ชนกับ ${ref.conflicts.map((c) => `“${c.title}”`).join(', ')}` : 'ไม่ชน'}
                </Txt>
              ) : null}
            </View>
          </View>
          <SuggestStrip analysis={analysis} />
        </View>
      ) : !timeInvalid ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <SvgIcon name="check" size={15} color={t.greenInk} strokeWidth={2.6} />
          <Txt size={12.5} weight="bold" color={t.greenInk}>
            ไม่ชนกับกิจกรรมเดิม{multi ? `ทุกวันที่ลง (${d.dates.length} วัน)` : ''}
          </Txt>
        </View>
      ) : null}

      {/* ช่วงว่างของวันที่ดูอยู่ — แตะเพื่อใช้ทั้งช่วง (แถบเขียวบนแถบเวลาคือช่วงเดียวกัน) */}
      {slots.length ? (
        <View style={{ gap: 6 }}>
          <Txt size={12} color={t.sub}>
            ช่วงว่าง{multi && ref ? `ของ ${shortDate(ref.date)}` : ''} — แตะเพื่อใช้
          </Txt>
          <ChipRow style={{ gap: 6 }}>
            {slots.map((s) => {
              const on = d.start === s.start && d.end === s.end;
              const c = s.night ? t.sub : t.greenInk;
              return (
                <Pressable
                  key={`${s.start}-${s.end}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    setRange(s.start, s.end);
                    showToast(`ใช้ช่วงว่าง ${fmtMin(s.start)}–${fmtMin(s.end)} แล้ว`);
                  }}
                  style={({ pressed }) => ({
                    height: 34,
                    paddingHorizontal: 12,
                    borderRadius: 17,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    backgroundColor: on ? c : pressed ? 'rgba(76,154,106,0.22)' : s.night ? t.track : 'rgba(76,154,106,0.12)',
                  })}>
                  {s.night ? <Icon name="moon" size={12} color={on ? '#FFFFFF' : c} /> : null}
                  <Txt size={12.5} num weight={on ? 'bold' : 'med'} color={on ? '#FFFFFF' : c}>
                    {fmtMin(s.start)}–{fmtMin(s.end)} · {hoursText(s.end - s.start)}
                  </Txt>
                </Pressable>
              );
            })}
          </ChipRow>
        </View>
      ) : null}

      <Txt size={11.5} color={t.faint} style={{ lineHeight: 17 }}>
        กดค้างที่บล็อกส้มแล้วลาก = ย้าย · ลากขอบ = ยืด/หด · แตะที่ว่าง = ย้ายไปเวลานั้น · ทีละ 15 นาที
      </Txt>

      <View style={{ height: 1, backgroundColor: t.line }} />

      {/* ── ตั้งเร็ว: เริ่มช่วง · ระยะเวลา · ปรับละเอียด ── */}
      <Txt size={12.5} color={t.sub}>
        เริ่มช่วง
      </Txt>
      <ChipRow style={{ gap: 6, marginTop: -4 }}>
        {PERIOD_PRESETS.map((p) => (
          <Chip
            key={p.label}
            small
            label={p.label}
            active={periodStart === p.start}
            onPress={() => {
              setPeriodStart(p.start);
              d.set({ start: p.start, end: Math.min(p.start + (duration > 0 ? duration : 60), DAY_END) });
            }}
          />
        ))}
      </ChipRow>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Txt size={12.5} color={t.sub} style={{ flex: 1 }}>
          ระยะเวลา
        </Txt>
        <Txt size={13} num weight="bold" color={timeInvalid ? t.warn : t.accentInk}>
          {timeInvalid ? 'เวลาไม่ถูกต้อง' : durText(duration)}
        </Txt>
      </View>
      <ChipRow style={{ gap: 6, marginTop: -4 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Chip key={n} small label={`${n} ชม.`} active={duration === n * 60} onPress={() => d.set({ end: Math.min(d.start + n * 60, DAY_END) })} />
        ))}
      </ChipRow>

      <View style={{ height: 1, backgroundColor: t.line }} />
      <TimeStepper label="เริ่ม" value={d.start} onChange={(v) => d.set({ start: v })} />
      <TimeStepper label="สิ้นสุด" value={d.end} onChange={(v) => d.set({ end: v })} />
      {timeInvalid ? (
        <Txt size={12} color={t.warn}>
          เวลาสิ้นสุดต้องมากกว่าเริ่ม
        </Txt>
      ) : null}
    </Card>
  );
}

// ---------- ④ แจ้งเตือน ----------

function NotifyBody() {
  const t = useTokens();
  const d = useDraft();
  return (
    <Card style={{ gap: 10, paddingVertical: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 10 }}>
        <Txt size={14.5} style={{ flex: 1 }}>
          แจ้งเตือนก่อนเริ่ม
        </Txt>
        <Txt size={13} color={t.sub}>
          {d.notify ? 'เปิด' : 'ปิด'}
        </Txt>
        <Toggle value={d.notify} onChange={(v) => d.set({ notify: v })} />
      </View>
      {d.notify ? (
        <ChipRow style={{ gap: 6, paddingBottom: 8 }}>
          {/* 0 = แจ้งทันทีตอนถึงเวลาเริ่ม */}
          {[0, 1, 5, 10, 15, 30, 60, 120].map((m) => (
            <Chip key={m} small label={m === 0 ? 'ตอนเริ่ม' : m >= 60 ? `${m / 60} ชม.` : `${m} นาที`} active={d.before === m} onPress={() => d.set({ before: m })} />
          ))}
        </ChipRow>
      ) : null}
    </Card>
  );
}

// ---------- ขอบเขตการแก้ไขชุดทำซ้ำ ----------

function ScopeCard({ editing, editDate }: { editing: Activity; editDate: string }) {
  const t = useTokens();
  const d = useDraft();
  // ครั้งที่โดนแก้ ตามขอบเขต — คิดจากชุดเดิม (ก่อนแก้)
  const all = useMemo(() => seriesDates(editing), [editing]);
  const hit = d.scope === 'one' ? [editDate] : d.scope === 'future' ? all.filter((x) => x >= editDate) : all;
  const openEnd = !editing.endDate && d.scope !== 'one';
  const effect = !hit.length
    ? 'ไม่มีครั้งที่ได้รับผล'
    : openEnd
      ? `มีผลทุกครั้งตั้งแต่ ${shortDate(hit[0])} ${beYear(fromISO(hit[0]).getFullYear())} (ไม่มีวันสิ้นสุด)`
      : `มีผล ${hit.length} ครั้ง · ${dateRange(hit[0], hit[hit.length - 1])}`;
  return (
    <View style={{ marginTop: 6, backgroundColor: t.card, borderRadius: 16, borderWidth: 1.5, borderColor: '#D2603A', padding: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="repeat" size={18} color={t.accentInk} />
        <Txt size={14.5} weight="bold" style={{ flex: 1 }}>
          ชุดทำซ้ำ — ใช้การแก้ไขกับครั้งไหน?
        </Txt>
      </View>
      <ChipRow style={{ gap: 6 }}>
        <Chip small label={`เฉพาะ ${shortDate(editDate)}`} active={d.scope === 'one'} onPress={() => d.set({ scope: 'one' })} />
        <Chip small label="ตั้งแต่ครั้งนี้เป็นต้นไป" active={d.scope === 'future'} onPress={() => d.set({ scope: 'future' })} />
        <Chip small label="ทั้งชุด (รวมย้อนหลัง)" active={d.scope === 'all'} onPress={() => d.set({ scope: 'all' })} />
      </ChipRow>
      <View style={{ gap: 4, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: t.bg }}>
        <Txt size={13} weight="bold">
          {effect}
        </Txt>
        <Txt size={12.5} color={t.sub} style={{ lineHeight: 19 }}>
          {d.scope === 'one'
            ? 'ใช้ชื่อ เวลา และรายละเอียดใหม่กับครั้งนี้ครั้งเดียว — การเปลี่ยนวันที่/การทำซ้ำจะไม่ถูกใช้'
            : d.scope === 'future'
              ? 'ครั้งก่อนหน้าและสถิติย้อนหลังคงเดิม — สถานะที่บันทึกไว้ตั้งแต่วันนี้ย้ายตามไปด้วย'
              : 'เปลี่ยนทุกครั้งในชุด รวมที่ผ่านมาแล้ว — ชั่วโมงในสถิติย้อนหลังจะเปลี่ยนตาม'}
        </Txt>
      </View>
    </View>
  );
}

function TimeStepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const t = useTokens();
  const step = (dir: 1 | -1) => onChange(Math.min(Math.max(value + dir * SNAP, DAY_START), DAY_END));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Txt size={13} color={t.sub} style={{ width: 48 }}>{label}</Txt>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} ลด 15 นาที`} onPress={() => step(-1)} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: pressed ? t.rail : t.track, alignItems: 'center', justifyContent: 'center' })}>
        <SvgIcon name="minus" size={18} color={t.ink} strokeWidth={2.2} />
      </Pressable>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Txt size={20} num weight="bold">
          {fmtMin(value)}
          {value > 1440 ? ' +1' : ''}
        </Txt>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} เพิ่ม 15 นาที`} onPress={() => step(1)} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: pressed ? t.rail : t.track, alignItems: 'center', justifyContent: 'center' })}>
        <SvgIcon name="plus" size={18} color={t.ink} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}
