// แท็บ 2 — เพิ่ม/แก้ไขกิจกรรม (ระบบ B1): ฟอร์ม 4 ขั้น เปิดทีละขั้น · ขั้นที่เสร็จพับเป็นแถวสรุป (แตะ "แก้" เพื่อเปิด)
// ① หมวด+รายละเอียด → ② วันที่+ทำซ้ำ → ③ เวลา (เตือนเวลาซ้อน + เสนอช่วงว่างที่ใกล้ที่สุด) → ④ แจ้งเตือน
// แก้ไข: แถบ "กำลังแก้ไข" + ป้าย "เปลี่ยนแล้ว" ต่อขั้น + การ์ดขอบเขตชุดทำซ้ำ (มีผล n ครั้ง)
// แถบล่าง: ‹ กลับ (เพิ่ม = เก็บร่างไว้ · แก้ไข = ทิ้งการแก้ไข) + บันทึก / บันทึกการแก้ไข
// โน้ตของครั้งนั้น (ขั้น ① · ไม่บังคับ): บันทึกพร้อมกิจกรรม — ชุดเดียวกับโน้ตในแผ่นรายละเอียด (ตั้งค่าที่ ตั้งค่า › จัดการโน้ต)
// ขณะพิมพ์โน้ต: แถบ ยกเลิก / เสร็จ ติดขอบบนคีย์บอร์ด (ปุ่มบันทึกของฟอร์มอยู่หลังคีย์บอร์ด และ Enter ในช่องโน้ต = ขึ้นบรรทัดใหม่)
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Keyboard, Linking, Pressable, ScrollView, TextInput, View, useWindowDimensions, type LayoutChangeEvent, type ScrollViewInstance, type TextInputInstance } from 'react-native';

import { Field } from '@/components/field';
import { Icon } from '@/components/icon';
import { MonthGrid } from '@/components/month-grid';
import { MonthYearPicker } from '@/components/month-year-picker';
import { FadeInView, Pop, useBurst } from '@/components/motion';
import { NoteBtn, NoteKeyboardBar, useKeyboardHeight } from '@/components/note-bar';
import { Screen } from '@/components/screen';
import { SnippetChips } from '@/components/snippet-chips';
import { SvgIcon } from '@/components/svg-icon';
import { TimeDragBar, TimeDragRail } from '@/components/time-drag';
import { Btn, Card, Chip, ChipRow, NavCircle, PriBadge, Segmented, Toggle, Txt, pressFade, useTokens } from '@/components/ui';
import { ATTN, CATS, CAT_BY_ID, CAT_OPTIONS, DAY_END, DAY_START, FONT, GREEN, PRI, SNAP, type CatId } from '@/constants/theme';
import { MONTH_TH, MONTH_TH_FULL, WD_TH, addDays, beYear, durText, fmtMin, fromISO, hoursText, thaiDate, todayISO, wdMon } from '@/lib/dates';
import { FREE_WINDOW_END, conflictsOn, freeSlots, maskFromDates, seriesDates } from '@/lib/engine';
import { appendNote, stripTemplate } from '@/lib/notes';
import { notifPermissionState, requestNotifPermission } from '@/lib/notifications';
import { HORIZON_DAYS, type Activity, type Contact, type Horizon, type InlineContact, type RepeatRule } from '@/lib/types';
import { getDay, resyncNotifications, useActivities, useDayReader } from '@/stores/activities';
import { contactChannels, isEmail, useContacts } from '@/stores/contacts';
import { cleanInline, discardDraft, useDraft, type ContactMode } from '@/stores/draft';
import { useSettings } from '@/stores/settings';
import { useUI } from '@/stores/ui';

type Step = 1 | 2 | 3 | 4;
type Draft = ReturnType<typeof useDraft.getState>;
/** รอบการพิมพ์โน้ต (ตั้งแต่แตะช่องจนคีย์บอร์ดหุบ) — before = ข้อความตอนแตะช่อง ไว้ให้ "ยกเลิก" ย้อนกลับ */
type NoteSession = { before: string };
/** ช่องที่ทำให้บันทึกไม่ได้ — ฟอร์มพาไปที่ขั้นนั้น ขึ้นขอบเตือน + ข้อความใต้ช่อง (หายเองเมื่อแก้แล้ว) */
type ErrField = 'cat' | 'title' | 'inline' | 'email' | 'time';
/** ความสูงโดยประมาณของแถบเหนือคีย์บอร์ด — ใช้เลื่อนช่องโน้ตให้พ้นแถบ */
const NOTE_BAR_H = 56;

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
  { label: 'เช้า 06:00', start: 360 },
  { label: '13:00', start: 780 },
  { label: '17:00', start: 1020 },
  { label: 'ค่ำ 20:00', start: 1200 },
];
/** ระยะเวลาสำเร็จรูป (นาที) — มีช่วงสั้นสำหรับกิจวัตรไม่ถึงชั่วโมง */
const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];
const durChip = (m: number) => (m < 60 ? `${m} น.` : `${m / 60} ชม.`);

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

const WD_FULL = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];

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
/** โน้ตในร่างหลังตัดบรรทัดแม่แบบที่ไม่ได้กรอก (ข้อความที่จะบันทึกจริง) */
function draftNote(d: Pick<Draft, 'note' | 'cat'>): string {
  return stripTemplate(d.note, d.cat ? useSettings.getState().noteCfg[d.cat].template : '');
}

function snapOf(d: Draft) {
  return {
    // นัดเคส: เทียบเฉพาะข้อมูลของโหมดที่เลือก (อีกโหมดไม่ถูกบันทึก)
    s1: JSON.stringify([d.cat, d.title.trim(), d.sub, d.loc, d.channel, d.contactMode === 'inline' ? ['inline', cleanInline(d.inline)] : ['people', d.priority, d.contactIds], draftNote(d)]),
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
  // just = ขั้นที่เพิ่งพับไปตอนเปิดขั้นใหม่ — วงเลขของขั้นนั้นเด้งเบา ๆ ตอนกลายเป็น ✓ (เปิดฟอร์มมาครั้งแรกไม่เล่น)
  const [nav, setNav] = useState(() => ({ rev: d.loadRev, open: firstOpen(d) as Step | null, snap: snapOf(d), just: null as Step | null }));
  const cur = nav.rev === d.loadRev ? nav : { rev: d.loadRev, open: firstOpen(d) as Step | null, snap: snapOf(d), just: null as Step | null };
  if (cur !== nav) setNav(cur);
  // ขั้น 1 ยังไม่ครบ → ขั้น 1 เปิดเสมอ (ขั้นอื่นยังไปไม่ได้)
  const open = step1Done ? cur.open : 1;
  const setOpen = (n: Step | null) => setNav({ ...cur, open: n, just: open });

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

  // ---------- แถบ ยกเลิก / เสร็จ เหนือคีย์บอร์ด ขณะพิมพ์โน้ต ----------
  const kb = useKeyboardHeight();
  const { height: winH } = useWindowDimensions();
  const noteInputRef = useRef<TextInputInstance>(null);
  const scrollY = useRef(0);
  const [noteSession, setNoteSession] = useState<NoteSession | null>(null);
  const noteBarOn = !!noteSession && kb > 0;
  /** โน้ตเปลี่ยนจากตอนแตะช่องรอบนี้ไหม (เทียบหลังตัดบรรทัดแม่แบบที่ไม่ได้กรอก) — เปลี่ยนแล้วถึงมีปุ่ม "ยกเลิก" */
  const noteTouched = !!noteSession && draftNote(d) !== draftNote({ note: noteSession.before, cat: d.cat });
  // แถบกินที่เหนือคีย์บอร์ดเพิ่ม — ช่องโน้ตที่ถูกแถบ/คีย์บอร์ดบังให้เลื่อนขึ้นมาพ้น (รอคีย์บอร์ดขึ้นสุดก่อนวัด)
  useEffect(() => {
    if (!noteBarOn) return;
    const id = setTimeout(() => {
      noteInputRef.current?.measureInWindow((_x, y, _w, h) => {
        const over = y + h - (winH - kb - NOTE_BAR_H - 12);
        if (over > 0) scrollRef.current?.scrollTo({ y: scrollY.current + over, animated: true });
      });
    }, 320);
    return () => clearTimeout(id);
  }, [noteBarOn, kb, winH]);
  const noteBar = noteBarOn ? (
    <NoteKeyboardBar
      text={
        noteTouched
          ? d.editId
            ? 'แก้โน้ตแล้ว · บันทึกพร้อมการแก้ไขกิจกรรม'
            : 'โน้ตบันทึกพร้อมกิจกรรมเมื่อกด “บันทึก”'
          : 'พิมพ์โน้ตของครั้งนี้ (ไม่บังคับ)'
      }
      color={noteTouched ? t.accentInk : t.faint}
      strong={noteTouched}>
      {noteTouched ? (
        <NoteBtn
          big
          label="ยกเลิก"
          a11y="ยกเลิกที่พิมพ์โน้ตรอบนี้"
          onPress={() => {
            // ย้อนเป็นข้อความตอนแตะช่องรอบนี้ (ที่กด "เสร็จ" ไปก่อนหน้ายังอยู่) แล้วหุบคีย์บอร์ด
            if (noteSession) d.set({ note: noteSession.before });
            Keyboard.dismiss();
          }}
        />
      ) : null}
      <NoteBtn big label="เสร็จ" icon="check" tone="primary" a11y="เสร็จ เก็บโน้ตไว้ในฟอร์มและหุบคีย์บอร์ด" onPress={() => Keyboard.dismiss()} />
    </NoteKeyboardBar>
  ) : null;
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

  // บันทึกไม่ผ่าน → เปิดขั้นของช่องนั้น เลื่อนไปหา โฟกัสช่องชื่อ และขึ้นข้อความใต้ช่อง (เดิมมีแค่ toast 2 วินาที)
  const titleRef = useRef<TextInputInstance>(null);
  const [errAt, setErrAt] = useState<{ field: ErrField; rev: number } | null>(null);
  const err = errAt && errAt.rev === d.loadRev ? errAt.field : null;
  const fail = (field: ErrField, msg: string) => {
    setErrAt({ field, rev: d.loadRev });
    showToast(msg);
    if (field === 'time') return setOpen(3); // ขั้น 3 เลื่อนเข้าจอเองตอนเปิด
    setOpen(1);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    if (field === 'title') setTimeout(() => titleRef.current?.focus(), 260);
  };
  const onSave = useSave(editing, askScope, fail);

  const dirty = !!d.cat || !!d.title || !!d.editId;
  const goBack = () => {
    const leave = () => {
      if (router.canGoBack()) router.back();
      else router.navigate('/');
      useUI.getState().restoreSheet(); // เปิดจากแผ่นรายละเอียด → เปิดแผ่นคืน
    };
    if (d.editId) {
      // แก้ไข: กลับ = ไม่บันทึกการแก้ไข — ถ้าแก้ไปแล้วให้ "แก้ต่อ" ได้ (เดิมทิ้งเงียบ ๆ)
      const edited = ([1, 2, 3, 4] as Step[]).some(changed);
      if (edited) {
        discardDraft('ยังไม่ได้บันทึกการแก้ไข — ทิ้งแล้ว', () => d.reset(), 'แก้ต่อ', () => {
          useUI.getState().closeSheet();
          router.navigate('/add');
        });
      } else d.reset();
    } else if (dirty) showToast('เก็บร่างไว้ให้แล้ว — กลับมาทำต่อได้ที่แท็บเพิ่ม');
    leave();
  };

  const headerRight = d.editId ? (
    <HeaderPill label="ยกเลิกแก้ไข" onPress={() => discardDraft('ยกเลิกการแก้ไขแล้ว', () => d.reset())} />
  ) : dirty ? (
    <HeaderPill label="ล้างค่า" onPress={() => discardDraft('ล้างค่าฟอร์มแล้ว', () => d.reset())} />
  ) : undefined;

  const cat = d.cat ? CAT_BY_ID[d.cat] : null;
  const contacts = useContacts((s) => s.list);
  const who =
    d.cat !== 'case'
      ? ''
      : d.contactMode === 'inline'
        ? cleanInline(d.inline) ? d.inline.name.trim() || 'ช่องทางติดต่อ' : ''
        : d.contactIds.map((id) => contacts.find((c) => c.id === id)?.name).filter(Boolean).join(', ');
  const s1Text = [d.title.trim(), who, d.sub, d.loc].filter(Boolean).join(' · ');
  // แถวโน้ตในสรุปขั้น ① — แก้ไขแล้วล้างโน้ตเดิม = แจ้งว่าจะลบตอนบันทึก
  const noteOn = useSettings((s) => s.noteDisplay.form);
  const noteNow = noteOn ? draftNote(d) : '';
  const noteGone = noteOn && !!d.editId && !!d.noteOrig && !noteNow;
  const noteLine = noteGone ? 'จะลบโน้ตของวันนี้เมื่อบันทึก' : noteNow ? `โน้ต: ${noteNow.replace(/\s*\n\s*/g, ' · ')}` : '';
  const last = d.dates[d.dates.length - 1];
  // ชุดไม่มีวันสิ้นสุด: ไม่นับจำนวนวัน (วันที่ในร่างเป็นแค่ตัวอย่างล่วงหน้า 1 ปี)
  const endless = d.repeat !== 'none' && d.repeat !== 'custom' && !!d.keepEnd && d.keepEnd.endDate === null;
  const repLabel = d.repeat === 'custom' && d.weekMask ? `ทุก ${WD_TH.filter((_, i) => (d.weekMask! >> i) & 1).join(' ')}` : REPEAT_LABEL[d.repeat];
  const s2Text =
    d.repeat === 'none'
      ? `ครั้งเดียว · ${thaiDate(d.dates[0])}`
      : endless
        ? `${repLabel} · เริ่ม ${shortDate(d.dates[0])} · ไม่มีวันสิ้นสุด`
        : `${repLabel} · ${d.dates.length} วัน · ${dateRange(d.dates[0], last)}`;
  const dur = d.end - d.start;
  // ประโยคเดียวอ่านทวนสิ่งที่จะบันทึก (วัน/การทำซ้ำ · เวลา · จำนวนครั้ง) — อยู่ท้ายฟอร์มเหนือปุ่มบันทึก
  const saveLine =
    (d.repeat === 'none' ? thaiDate(d.dates[0]) : `${repLabel} ${endless ? 'ไม่มีวันสิ้นสุด' : `${d.dates.length} ครั้ง ถึง ${shortDate(last)}`}`) +
    ` · ${fmtMin(d.start)}–${fmtMin(d.end)}`;
  // แก้ไขชุดทำซ้ำ: ปุ่มบันทึกบอกขอบเขตที่เลือก (เดิมเขียน "บันทึกการแก้ไข" เหมือนกันทุกขอบเขต)
  const saveLabel = !d.editId
    ? 'บันทึก'
    : !askScope
      ? 'บันทึกการแก้ไข'
      : d.scope === 'one'
        ? `บันทึก · เฉพาะ ${d.editDate ? shortDate(d.editDate) : 'ครั้งนี้'}`
        : d.scope === 'future'
          ? 'บันทึก · ตั้งแต่ครั้งนี้'
          : 'บันทึก · ทั้งชุด';

  return (
    <Screen
      title={d.editId ? 'แก้ไขกิจกรรม' : 'เพิ่มกิจกรรม'}
      headerRight={headerRight}
      scrollRef={scrollRef}
      scrollLocked={dragging}
      keyboardBar={noteBar}
      onScrollY={(y) => (scrollY.current = y)}
      onBack={goBack}
      action={{ label: saveLabel, icon: 'check', onPress: onSave }}>
      {d.editId ? <EditBanner title={editing?.title ?? d.title} date={d.editDate} /> : null}

      <View onLayout={(e: LayoutChangeEvent) => (stepsTop.current = e.nativeEvent.layout.y)} style={{ gap: 8 }}>
        {/* ① หมวดและรายละเอียด */}
        <View onLayout={(e: LayoutChangeEvent) => (stepY.current[1] = e.nativeEvent.layout.y)}>
          {open === 1 ? (
            <StepOpen n={1} title="หมวดและรายละเอียด">
              <DetailsBody noteInputRef={noteInputRef} onNoteSession={setNoteSession} titleRef={titleRef} err={err} />
              <NextBtn
                label="ถัดไป · วันที่และการทำซ้ำ"
                disabled={!step1Done}
                hint={!d.cat ? 'เลือกหมวดก่อน' : !step1Done ? 'ใส่ชื่อกิจกรรม' : undefined}
                // ค่าเริ่มต้นของขั้นที่เหลือใช้ได้เลย — บอกให้รู้ว่าไม่ต้องเดินครบ 4 ขั้น
                note={!d.editId && dur > 0 ? `หรือกด “บันทึก” ได้เลย · ${saveLine}` : undefined}
                onPress={() => setOpen(2)}
              />
            </StepOpen>
          ) : (
            <StepSummary n={1} label="หมวดและรายละเอียด" done={step1Done} changed={changed(1)} pop={cur.just === 1} onPress={() => setOpen(1)}>
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
              {noteLine ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <SvgIcon name="note" size={12} color={noteGone ? t.warn : t.sub} />
                  <Txt size={12.5} color={noteGone ? t.warn : t.sub} numberOfLines={1} style={{ flex: 1 }}>
                    {noteLine}
                  </Txt>
                </View>
              ) : null}
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
            <StepSummary n={2} label="วันที่และการทำซ้ำ" done changed={changed(2)} pop={cur.just === 2} onPress={() => setOpen(2)}>
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
              warn={analysis.conflictDays > 0 || dur <= 0}
              changed={changed(3)}
              pop={cur.just === 3}
              onPress={() => setOpen(3)}
              footer={analysis.conflictDays > 0 ? <SuggestStrip analysis={analysis} inset /> : undefined}>
              <Txt size={14.5} weight="med" numberOfLines={2} style={{ lineHeight: 20 }}>
                <Txt size={14.5} num weight="med">
                  {fmtMin(d.start)}–{fmtMin(d.end)}
                </Txt>
                <Txt size={14.5} weight={dur > 0 ? 'reg' : 'bold'} color={dur > 0 ? t.sub : t.warn}>
                  {dur > 0 ? ` · ${durText(dur)}` : ' · เวลาสิ้นสุดต้องหลังเวลาเริ่ม'}
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
            <StepSummary n={4} label="แจ้งเตือน" done changed={changed(4)} pop={cur.just === 4} onPress={() => setOpen(4)}>
              <Txt size={14.5} weight="med">
                {d.notify ? (d.before === 0 ? 'แจ้งเมื่อถึงเวลาเริ่ม' : `แจ้งก่อนเริ่ม ${durText(d.before)}`) : 'ไม่แจ้งเตือน'}
              </Txt>
            </StepSummary>
          )}
        </View>

        {askScope && editing && d.editDate ? <ScopeCard editing={editing} editDate={d.editDate} /> : null}

        {/* อ่านทวนก่อนบันทึก — ครบแล้วกดปุ่มด้านล่าง */}
        {step1Done && dur > 0 ? (
          <View accessible accessibilityLabel={`พร้อมบันทึก ${saveLine}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 8, paddingHorizontal: 8 }}>
            <SvgIcon name="check" size={14} color={t.greenInk} strokeWidth={2.6} />
            <Txt size={12.5} color={t.sub} numberOfLines={2} style={{ flexShrink: 1, textAlign: 'center', lineHeight: 18 }}>
              พร้อมบันทึก · <Txt size={12.5} weight="bold">{saveLine}</Txt>
            </Txt>
          </View>
        ) : null}
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

/** วงกลมเลขขั้น — open = ส้มทึบ · done = เขียว ✓ · warn = วงส้ม "!" · pending = วงเทา · pop = เด้งเบา ๆ ตอนเปิด (ขั้นที่เพิ่งเสร็จ) */
function StepDot({ n, kind, pop }: { n: number; kind: 'open' | 'done' | 'warn' | 'pending'; pop?: boolean }) {
  const t = useTokens();
  const bg = kind === 'open' ? t.primary : kind === 'done' ? GREEN : t.card;
  const bd = kind === 'warn' ? ATTN : kind === 'pending' ? t.railDash : 'transparent';
  return (
    <Pop play={!!pop && kind === 'done'}>
    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: bg, borderWidth: bd === 'transparent' ? 0 : 2, borderColor: bd, alignItems: 'center', justifyContent: 'center' }}>
      {kind === 'done' ? (
        <SvgIcon name="check" size={14} color="#FFFFFF" strokeWidth={3} />
      ) : (
        <Txt size={12} num weight="bold" color={kind === 'open' ? '#FFFFFF' : kind === 'warn' ? ATTN : t.sub}>
          {kind === 'warn' ? '!' : n}
        </Txt>
      )}
    </View>
    </Pop>
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
      {/* เปิดขั้น → เนื้อหาจางเข้า + ลอยขึ้นเล็กน้อย ให้รู้ว่าส่วนไหนเพิ่งกางออก */}
      <FadeInView rise={8} duration={220} style={{ gap: 8 }}>
        {children}
      </FadeInView>
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
  pop,
  onPress,
  footer,
  children,
}: {
  n: Step;
  label: string;
  done: boolean;
  warn?: boolean;
  changed?: boolean;
  /** ขั้นนี้เพิ่งพับ (เพิ่งทำเสร็จ) — วงเลขเด้งเบา ๆ */
  pop?: boolean;
  onPress: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const t = useTokens();
  return (
    <FadeInView duration={180}>
    <View style={{ backgroundColor: t.card, borderRadius: 20, overflow: 'hidden', shadowColor: t.shadow, shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`แก้ขั้น ${n} ${label}`}
        onPress={onPress}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 9, paddingLeft: 14, paddingRight: 12, backgroundColor: pressed ? t.track : 'transparent' })}>
        <StepDot n={n} kind={warn ? 'warn' : done ? 'done' : 'pending'} pop={pop} />
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Txt size={12} color={t.sub}>
              {n} · {label}
            </Txt>
            {changed ? (
              <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: 8, backgroundColor: ATTN + '26' }}>
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
    </FadeInView>
  );
}

function NextBtn({ label, onPress, disabled, hint, note }: { label: string; onPress: () => void; disabled?: boolean; hint?: string; note?: string }) {
  const t = useTokens();
  return (
    <View style={{ alignItems: 'flex-end', gap: 4, paddingTop: 2 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => ({ height: 44, paddingLeft: 18, paddingRight: 12, borderRadius: 22, backgroundColor: disabled ? t.track : t.ink, flexDirection: 'row', alignItems: 'center', gap: 4, opacity: disabled ? 0.7 : pressed ? 0.8 : 1 })}>
        <Txt size={14} weight="bold" color={disabled ? t.faint : t.bg}>
          {label}
        </Txt>
        <SvgIcon name="chevR" size={16} color={disabled ? t.faint : t.bg} strokeWidth={2.4} />
      </Pressable>
      {disabled && hint ? (
        <Txt size={12} color={t.sub}>
          {hint}
        </Txt>
      ) : null}
      {!disabled && note ? (
        <Txt size={12} color={t.sub} numberOfLines={2} style={{ textAlign: 'right', lineHeight: 17 }}>
          {note}
        </Txt>
      ) : null}
    </View>
  );
}

function EditBanner({ title, date }: { title: string; date: string | null }) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 2 }}>
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.accent + '24', alignItems: 'center', justifyContent: 'center' }}>
        <SvgIcon name="edit" size={16} color={t.accentInk} strokeWidth={2} />
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
        ? `เวลาซ้อนกับ “${short(ranked[0].title)}” ${fmtMin(ranked[0].start)}–${fmtMin(ranked[0].end)}${days}`
        : `เวลาซ้อนกับ ${ranked.length} กิจกรรม เช่น “${short(ranked[0].title)}”${days}`;

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
        backgroundColor: t.accent + '12',
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
          style={({ pressed }) => ({ height: 40, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1.5, borderColor: t.accentInk, backgroundColor: pressed ? t.accentInk + '14' : t.card, justifyContent: 'center' })}>
          <Txt size={13} num weight="bold" color={t.accentInk}>
            ใช้ {fmtMin(s)}–{fmtMin(s + dur)}
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

// ---------- บันทึก ----------

function useSave(editing: Activity | undefined, askScope: boolean, fail: (field: ErrField, msg: string) => void) {
  const d = useDraft();
  const router = useRouter();
  const showToast = useUI((s) => s.showToast);
  const { add, editActivity, setNote, setNotes } = useActivities();
  return async () => {
    if (!d.cat) return fail('cat', 'เลือกหมวดก่อนบันทึก');
    if (!d.title.trim()) return fail('title', 'ใส่ชื่อกิจกรรมก่อนบันทึก');
    if (d.end <= d.start) return fail('time', 'เวลาสิ้นสุดต้องหลังเวลาเริ่ม');
    // นัดเคสโหมดช่องทางติดต่อ: ต้องกรอกอย่างน้อย 1 ช่อง — ไม่งั้นบันทึกแล้วเปิดแก้ไขจะกลายเป็นโหมด "คนที่นัด"
    if (d.cat === 'case' && d.contactMode === 'inline') {
      if (!cleanInline(d.inline)) return fail('inline', 'กรอกช่องทางติดต่ออย่างน้อย 1 ช่อง หรือเปลี่ยนเป็น “คนที่นัด”');
      if (d.inline.email?.trim() && !isEmail(d.inline.email)) return fail('email', 'อีเมลไม่ถูกต้อง — ตัวอย่าง name@example.com');
    }
    const isOnce = d.repeat === 'none';
    const isCustom = d.repeat === 'custom';
    const startDate = d.dates[0];
    // แก้ไขชุดเดิมที่ยังไม่ได้เลือกระยะเวลาใหม่ → จบวันเดิม (keepEnd) ไม่รีเซ็ตเป็นค่าตาม horizon
    const endDate = isOnce ? null : isCustom ? d.dates[d.dates.length - 1] : d.keepEnd ? d.keepEnd.endDate : addDays(startDate, HORIZON_DAYS[d.horizon] - 1);

    // นัดเคสโหมดช่องทางติดต่อ: ไม่ผูกสมุดรายชื่อ และไม่มีระดับความสำคัญ
    const inline = d.cat === 'case' && d.contactMode === 'inline';
    const fields = {
      title: d.title.trim(),
      cat: d.cat as CatId,
      sub: d.sub || null,
      loc: d.loc || null,
      channel: d.cat === 'case' ? d.channel : null,
      priority: d.cat === 'case' && !inline ? d.priority : null,
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
      contactIds: d.cat === 'case' && !inline ? d.contactIds : [],
      inlineContact: inline ? cleanInline(d.inline) : null,
      color: null, // สีจากไฟล์ Time Table เท่านั้น — กิจกรรมที่สร้างในแอปใช้สีตามหมวด
    };

    // วันที่ให้แท็บวันนี้เปิดโชว์หลังบันทึก — แก้เฉพาะ/ตั้งแต่ครั้งนี้ = วันที่เปิดมาแก้
    let focusDate = startDate;
    try {
      // โน้ตของครั้งนั้น — ช่องโน้ตในฟอร์มปิดอยู่ (ตั้งค่า › จัดการโน้ต) = คงโน้ตเดิมไว้ตามเดิม
      const noteOn = useSettings.getState().noteDisplay.form;
      const note = noteOn ? draftNote(d) : d.noteOrig;
      if (d.editId) {
        if (!editing) return showToast('ไม่พบกิจกรรมนี้แล้ว');
        // แก้ไขกิจกรรมที่นำเข้ามา: รักษาสีเดิมที่จำจากไฟล์ไว้
        const scope = askScope ? d.scope : 'all';
        const targetId = await editActivity(editing, { ...fields, detachedFrom: editing.detachedFrom, color: editing.color }, scope, d.editDate);
        if (scope !== 'all' && d.editDate) focusDate = d.editDate;
        // โน้ตของวันที่เปิดมาแก้ — กิจกรรมครั้งเดียวที่ย้ายวัน: ย้ายโน้ตตามไปวันใหม่ (เดิมค้างอยู่วันเก่าแล้วหายจากจอ)
        const fromDate = d.editDate ?? editing.startDate;
        const toDate = editing.repeat === 'none' && scope === 'all' ? startDate : fromDate;
        if (targetId !== null) {
          if (toDate !== fromDate) {
            if (d.noteOrig) setNote({ id: editing.id, date: fromDate }, null);
            if (note) setNote({ id: targetId, date: toDate }, note);
          } else if (note !== d.noteOrig) setNote({ id: targetId, date: toDate }, note || null);
        }
        const noteMsg = !noteOn || note === d.noteOrig ? '' : !note ? ' · ลบโน้ตแล้ว' : d.noteOrig ? ' · แก้โน้ตแล้ว' : ' · เพิ่มโน้ตแล้ว';
        showToast((scope === 'one' ? 'บันทึกเฉพาะครั้งนี้แล้ว' : scope === 'future' ? 'บันทึกตั้งแต่ครั้งนี้เป็นต้นไปแล้ว' : 'บันทึกการแก้ไขแล้ว') + noteMsg);
      } else {
        const full = await add(fields);
        // เพิ่มหลายวัน: โน้ตลงวันแรก หรือทุกวันที่เลือก (ตามที่เลือกใต้ช่องโน้ต)
        const noteDates = note ? (d.noteAll ? d.dates : [startDate]) : [];
        setNotes(noteDates.map((date) => ({ id: full.id, date })), note);
        showToast(`เพิ่ม “${fields.title.length > 18 ? `${fields.title.slice(0, 17)}…` : fields.title}” แล้ว${d.dates.length > 1 ? ` ${d.dates.length} วัน` : ''}${noteDates.length ? ` · โน้ต ${noteDates.length === 1 ? '1 วัน' : `${noteDates.length} วัน`}` : ''}`);
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

function DetailsBody({
  noteInputRef,
  onNoteSession,
  titleRef,
  err,
}: {
  noteInputRef: RefObject<TextInputInstance | null>;
  onNoteSession: (s: NoteSession | null) => void;
  titleRef: RefObject<TextInputInstance | null>;
  /** ช่องที่ทำให้บันทึกไม่ผ่าน — ข้อความเตือนขึ้นเฉพาะตอนที่ช่องนั้นยังไม่ถูกแก้ */
  err: ErrField | null;
}) {
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
  const titleMissing = err === 'title' && !d.title.trim();
  const inlineErr =
    err === 'inline' && !cleanInline(d.inline)
      ? 'กรอกอย่างน้อย 1 ช่อง หรือเปลี่ยนเป็น “คนที่นัด”'
      : err === 'email' && !!d.inline.email?.trim() && !isEmail(d.inline.email)
        ? 'รูปแบบอีเมลไม่ถูกต้อง — เช่น name@example.com'
        : '';

  return (
    <>
      {/* หมวด + รายละเอียด รวมในการ์ดพื้นหลังเดียว — ส่วนรายละเอียดโผล่ใต้เส้นคั่นเมื่อเลือกหมวดแล้ว */}
      <Card style={{ gap: 12 }}>
        {err === 'cat' && !d.cat ? (
          <Txt size={12.5} weight="bold" color={t.warn}>
            เลือกหมวดของกิจกรรมก่อน
          </Txt>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {CATS.map((c) => (
            <CatCard key={c.id} c={c} active={d.cat === c.id} onPress={() => d.set({ cat: c.id })} />
          ))}
        </View>

        {d.cat ? (
          // เลือกหมวดแล้ว → ส่วนรายละเอียดจางเข้าใต้การ์ดหมวด
          <FadeInView rise={8} duration={220} style={{ gap: 12 }}>
            <View style={{ height: 1, backgroundColor: t.line }} />
            <TextInput
              ref={titleRef}
              value={d.title}
              onChangeText={(title) => d.set({ title })}
              placeholder="พิมพ์ชื่อกิจกรรม…"
              placeholderTextColor={t.faint}
              accessibilityLabel="ชื่อกิจกรรม"
              returnKeyType="done"
              style={{ backgroundColor: t.bg, borderRadius: 12, borderWidth: titleMissing ? 1.5 : 1, borderColor: titleMissing ? t.warn : t.line, minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, color: t.ink, fontFamily: FONT.uiMed, fontSize: 15 }}
            />
            {titleMissing ? (
              <Txt size={12} weight="med" color={t.warn} style={{ marginTop: -6 }}>
                ใส่ชื่อกิจกรรม หรือแตะชื่อสำเร็จรูปด้านล่าง
              </Txt>
            ) : null}
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
          </FadeInView>
        ) : null}

        {d.cat === 'case' ? (
          <FadeInView rise={8} duration={220} style={{ gap: 12 }}>
            <View style={{ height: 1, backgroundColor: t.line }} />
            {/* ผู้ติดต่อของนัด 2 โหมด (ทีละโหมด): คนที่นัด = เลือกจากสมุดรายชื่อ + ระดับความสำคัญ (ตามเดิม)
                · ช่องทางติดต่อ = กรอกข้อมูลของนัดนี้เอง ไม่ลงสมุดรายชื่อ ไม่ต้องเลือกระดับ */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Txt size={13} weight="med" color={t.sub} style={{ flex: 1 }}>ผู้ติดต่อ</Txt>
              {d.contactMode === 'people' ? <Chip small icon="edit" label="แก้ไขรายชื่อ" onPress={() => router.push('/settings/contacts')} /> : null}
            </View>
            <Segmented<ContactMode>
              options={[
                { key: 'people', label: 'คนที่นัด', icon: 'user' },
                { key: 'inline', label: 'ช่องทางติดต่อ', icon: 'phone' },
              ]}
              value={d.contactMode}
              onChange={(contactMode) => d.set({ contactMode })}
            />
            <Txt size={12} color={t.faint} style={{ marginTop: -4 }}>
              {d.contactMode === 'people'
                ? 'เลือกคนจากสมุดรายชื่อ และกำหนดระดับความสำคัญของนัด'
                : 'กรอกช่องทางติดต่อของนัดนี้ — ไม่บันทึกลงสมุดรายชื่อ และไม่ต้องเลือกระดับความสำคัญ'}
            </Txt>

            {d.contactMode === 'inline' ? (
              <>
                <InlineContactForm value={d.inline} onChange={(inline) => d.set({ inline })} />
                {inlineErr ? (
                  <Txt size={12} weight="med" color={t.warn}>
                    {inlineErr}
                  </Txt>
                ) : null}
              </>
            ) : (
              <>
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
                          showToast(`เพิ่ม ${name} ในสมุดรายชื่อแล้ว`);
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
              </>
            )}

            <Txt size={13} weight="med" color={t.sub}>ช่องทาง</Txt>
            <ChipRow>
              <Chip small icon="video" label="ออนไลน์" active={d.channel === 'online'} onPress={() => d.set({ channel: 'online' })} />
              <Chip small icon="mappin" label="พบตัว" active={d.channel === 'inperson'} onPress={() => d.set({ channel: 'inperson' })} />
            </ChipRow>
          </FadeInView>
        ) : null}

        {d.cat ? <FormNote cat={d.cat} inputRef={noteInputRef} onSession={onNoteSession} /> : null}
      </Card>
    </>
  );
}

/**
 * โน้ตของครั้งนั้น ในขั้น ① (ไม่บังคับ · เปิด/ปิดและจำนวนชิปตั้งที่ ตั้งค่า › จัดการโน้ต › ฟอร์มเพิ่ม/แก้ไข)
 * เป็นร่างจนกด "บันทึก" ของฟอร์ม — แก้ไข: โน้ตของวันที่เปิดมาแก้ ตัวเดียวกับในแผ่นรายละเอียด (ไม่ลงทั้งชุด)
 * แม่แบบ/ข้อความตัวอย่างตามหมวด · ชิปโน้ตสำเร็จรูป (ปักหมุดก่อน) · ✕ ล้าง · เพิ่มหลายวันเลือกได้ว่าลงวันแรกหรือทุกวัน
 */
/** การ์ดเลือกหมวด — ไอคอนในวงสีอ่อนของหมวด · กดแล้วยุบเล็กน้อย · เลือกแล้วไอคอนเด้งเบา ๆ */
function CatCard({ c, active, onPress }: { c: (typeof CATS)[number]; active: boolean; onPress: () => void }) {
  const t = useTokens();
  const burst = useBurst(active);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => ({
        width: '47.5%',
        padding: 14,
        borderRadius: 18,
        backgroundColor: active ? c.color + '22' : t.bg,
        borderWidth: 1.5,
        borderColor: active ? c.color : 'transparent',
        gap: 8,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}>
      <Pop key={burst} play={burst > 0 && active} from={0.8}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.color + (active ? '38' : '24'), alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={c.icon} size={20} color={c.color} />
        </View>
      </Pop>
      <Txt size={13} weight={active ? 'bold' : 'med'}>
        {c.name}
      </Txt>
    </Pressable>
  );
}

function FormNote({ cat, inputRef, onSession }: { cat: CatId; inputRef: RefObject<TextInputInstance | null>; onSession: (s: NoteSession | null) => void }) {
  const t = useTokens();
  const d = useDraft();
  const router = useRouter();
  const display = useSettings((s) => s.noteDisplay);
  const cfg = useSettings((s) => s.noteCfg[cat]);
  /** แม่แบบเติมให้เมื่อแตะช่องที่ยังว่าง — ล้างด้วย ✕ ระหว่างพิมพ์แล้วไม่เด้งกลับ (ออกจากช่องทั้งที่ว่าง = พร้อมเติมใหม่รอบหน้า) */
  const [tplArmed, setTplArmed] = useState(!d.note);
  // ช่องถูกถอดทั้งที่ยังโฟกัส (พับขั้น ① / ล้างฟอร์ม) → ไม่มี onBlur — ปิดแถบเหนือคีย์บอร์ดเอง
  useEffect(() => () => onSession(null), [onSession]);
  if (!display.form) return null;

  const clean = stripTemplate(d.note, cfg.template);
  const orig = d.noteOrig;
  /** สถานะเทียบโน้ตเดิม (แก้ไข) — เพิ่มใหม่ไม่มีโน้ตเดิมให้เทียบ */
  const state: 'add' | 'edit' | 'delete' | 'same' | null = !d.editId
    ? clean
      ? 'add'
      : null
    : clean === orig
      ? orig
        ? 'same'
        : null
      : !clean
        ? 'delete'
        : orig
          ? 'edit'
          : 'add';
  const many = !d.editId && d.dates.length > 1;
  const fill = () => {
    if (!tplArmed) return;
    setTplArmed(false);
    if (!d.note.trim() && cfg.template.trim()) d.set({ note: cfg.template });
  };
  const insert = (text: string) => {
    setTplArmed(false);
    d.set({ note: appendNote(d.note, cfg.template, text) });
  };
  const tone = state === 'delete' ? t.warn : state === 'add' || state === 'edit' ? t.accentInk : t.greenInk;
  const msg =
    state === 'delete'
      ? 'จะลบโน้ตเดิมของวันนี้เมื่อกดบันทึก'
      : state === 'edit'
        ? 'แก้โน้ตแล้ว — บันทึกพร้อมการแก้ไขกิจกรรม'
        : state === 'add'
          ? d.editId
            ? 'โน้ตใหม่ของวันนี้ — บันทึกพร้อมการแก้ไขกิจกรรม'
            : 'บันทึกพร้อมกิจกรรม'
          : state === 'same'
            ? '✓ โน้ตเดิมของวันนี้'
            : '';

  return (
    <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: t.line, paddingTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <SvgIcon name="note" size={14} color={t.sub} />
        <Txt size={13} weight="med" color={t.sub} style={{ flex: 1 }}>
          {d.editId && d.editDate ? `โน้ตของวัน ${shortDate(d.editDate)}` : 'โน้ต'} <Txt size={12} color={t.faint}>(ไม่บังคับ)</Txt>
        </Txt>
      </View>
      <SnippetChips cat={cat} limit={display.formChips} onPick={insert} onManage={() => router.push('/settings/notes')} />
      <View>
        <TextInput
          value={d.note}
          onChangeText={(note) => d.set({ note })}
          ref={inputRef}
          onFocus={() => {
            onSession({ before: d.note }); // ก่อนเติมแม่แบบ — "ยกเลิก" ย้อนถึงตรงนี้
            fill();
          }}
          onBlur={() => {
            onSession(null);
            if (!useDraft.getState().note.trim()) setTplArmed(true);
          }}
          placeholder={cfg.hint || 'เช่น สรุปสั้น ๆ ของครั้งนี้'}
          placeholderTextColor={t.faint}
          multiline
          accessibilityLabel="โน้ตของครั้งนี้"
          style={{
            minHeight: 64,
            maxHeight: 140,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: state === 'delete' ? t.warn : state === 'add' || state === 'edit' ? t.accent : t.line,
            backgroundColor: t.card2,
            paddingLeft: 12,
            paddingRight: 40,
            paddingTop: 10,
            paddingBottom: 10,
            fontFamily: FONT.ui,
            fontSize: 14,
            color: t.ink,
            textAlignVertical: 'top',
          }}
        />
        {d.note ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="ล้างข้อความในช่องโน้ต"
            onPress={() => {
              setTplArmed(false);
              d.set({ note: '' });
            }}
            hitSlop={8}
            style={({ pressed }) => ({ position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: pressed ? t.rail : t.track, alignItems: 'center', justifyContent: 'center' })}>
            <SvgIcon name="x" size={12} color={t.sub} strokeWidth={2.6} />
          </Pressable>
        ) : null}
      </View>
      {msg || state === 'same' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 }}>
          <Txt size={11.5} weight={state === 'same' ? 'reg' : 'bold'} color={tone} style={{ flex: 1 }} numberOfLines={2}>
            {msg}
          </Txt>
          {/* แก้ไข: คืนโน้ตเดิม / ลบโน้ตเดิม (มีผลตอนกดบันทึก) */}
          {d.editId && (state === 'edit' || state === 'delete' || (state === 'add' && orig)) ? (
            <Chip small label={state === 'delete' ? 'ไม่ลบ' : 'คืนโน้ตเดิม'} onPress={() => d.set({ note: orig })} />
          ) : null}
          {state === 'same' ? <Chip small icon="trash" label="ลบโน้ต" onPress={() => d.set({ note: '' })} /> : null}
        </View>
      ) : null}
      {/* เพิ่มหลายวัน: ลงวันแรก หรือทุกวันที่เลือก */}
      {many && clean ? (
        <View style={{ gap: 6 }}>
          <Txt size={12} color={t.sub}>ใส่โน้ตนี้ใน</Txt>
          <ChipRow style={{ gap: 6 }}>
            <Chip small label={`เฉพาะวันแรก · ${shortDate(d.dates[0])}`} active={!d.noteAll} onPress={() => d.set({ noteAll: false })} />
            <Chip small label={`ทุกวันที่เลือก · ${d.dates.length} วัน`} active={d.noteAll} onPress={() => d.set({ noteAll: true })} />
          </ChipRow>
        </View>
      ) : null}
      {d.editId && editingSeries(d) ? (
        <Txt size={11.5} color={t.faint}>
          โน้ตเป็นของครั้งนี้ครั้งเดียว ไม่ลงทั้งชุด — ครั้งอื่นจดได้ที่แผ่นรายละเอียดของวันนั้น
        </Txt>
      ) : null}
    </View>
  );
}

/** กำลังแก้ชุดทำซ้ำ (ไม่ใช่ครั้งเดียว) */
const editingSeries = (d: Draft) => d.repeat !== 'none' || d.dates.length > 1;

/**
 * ฟอร์มช่องทางติดต่อของนัด (โหมด "ช่องทางติดต่อ") — ช่องเหมือนสมุดรายชื่อ แต่ไม่มีระดับความสำคัญ
 * โชว์ชื่อ/องค์กร/โทร/LINE ก่อน · อีเมล/Zoom/Meet/หมายเหตุ อยู่ใต้ "ช่องทางอื่น" (กางเองเมื่อมีค่าอยู่แล้ว)
 */
function InlineContactForm({ value, onChange }: { value: InlineContact; onChange: (v: InlineContact) => void }) {
  const t = useTokens();
  const showToast = useUI((s) => s.showToast);
  const hasMore = !!(value.email || value.zoom || value.googlemeet || value.note);
  const [moreOpen, setMoreOpen] = useState(false);
  const more = moreOpen || hasMore;
  const set = (p: Partial<InlineContact>) => onChange({ ...value, ...p });
  const paste = async (field: 'phone' | 'line' | 'email' | 'zoom' | 'googlemeet') => {
    const s = (await Clipboard.getStringAsync()).trim();
    if (!s) return showToast('คลิปบอร์ดว่าง');
    set({ [field]: s });
  };
  return (
    <View style={{ gap: 10 }}>
      <Field label="ชื่อผู้ติดต่อ / หัวข้อ" optional value={value.name} onChange={(name) => set({ name })} placeholder="เช่น คุณสมชาย · ทีมจัดซื้อ" />
      <Field label="องค์กร / บริษัท" optional value={value.org ?? ''} onChange={(org) => set({ org })} placeholder="เช่น บริษัท … จำกัด" />
      <Field label="เบอร์โทร" value={value.phone ?? ''} onChange={(phone) => set({ phone })} keyboard="phone-pad" onPaste={() => paste('phone')} />
      <Field label="LINE ID" value={value.line ?? ''} onChange={(line) => set({ line })} onPaste={() => paste('line')} />
      {more ? (
        <>
          <Field label="อีเมล" value={value.email ?? ''} onChange={(email) => set({ email })} keyboard="email-address" onPaste={() => paste('email')} />
          <Field label="Zoom" value={value.zoom ?? ''} onChange={(zoom) => set({ zoom })} placeholder="ลิงก์ หรือ Meeting ID" onPaste={() => paste('zoom')} />
          <Field label="Google Meet" value={value.googlemeet ?? ''} onChange={(googlemeet) => set({ googlemeet })} placeholder="ลิงก์ หรือรหัสห้อง" onPaste={() => paste('googlemeet')} />
          <Field label="หมายเหตุ" optional value={value.note ?? ''} onChange={(note) => set({ note })} placeholder="เช่น โทรได้หลัง 10 โมง" multiline />
        </>
      ) : (
        <Pressable accessibilityRole="button" onPress={() => setMoreOpen(true)} hitSlop={6} style={pressFade({ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 })}>
          <Icon name="plus" size={14} color={t.accentInk} />
          <Txt size={13} weight="med" color={t.accentInk}>
            ช่องทางอื่น · อีเมล Zoom Google Meet หมายเหตุ
          </Txt>
        </Pressable>
      )}
    </View>
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
  // เลือกวันสิ้นสุดเอง ("ถึงวันที่…") — ปฏิทินเล็กกางใต้ชิประยะเวลา
  const [endPick, setEndPick] = useState(false);
  const [endYm, setEndYm] = useState(ym);
  const shiftYm = (cur: { y: number; m: number }, dir: 1 | -1) => {
    const dt = new Date(cur.y, cur.m + dir, 1);
    return { y: dt.getFullYear(), m: dt.getMonth() };
  };
  // วันในสัปดาห์ที่ชุดนี้ลง (bit 0 = จันทร์) — กฎสำเร็จรูปรู้จากกฎ · "เลือกเอง" ดูจากวันที่เลือกจริง
  const weekMask = d.repeat === 'daily' ? 127 : d.repeat === 'weekday' ? 31 : d.repeat === 'weekend' ? 96 : (d.weekMask ?? maskFromDates(d.dates));
  // ปรับระยะเวลาได้เมื่อวันถูกสร้างจากกฎ (สำเร็จรูป หรือชิปวันในสัปดาห์) — แตะเลือกวันบนปฏิทินเองไม่มีระยะเวลา
  const spanned = d.repeat !== 'none' && (d.repeat !== 'custom' || d.weekMask != null);
  const customEnd = d.keepEnd?.endDate ?? null;
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

      {d.repeat !== 'none' ? (
        // เลือกวันในสัปดาห์ได้เอง (เช่น จ พ ศ) — เดิมต้องแตะบนปฏิทินทีละวัน เดือนต่อเดือน
        <FadeInView rise={6} style={{ gap: 6 }}>
          <Txt size={12.5} color={t.sub}>
            ทำซ้ำวันไหนบ้าง
          </Txt>
          <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 6 }}>
            {WD_TH.map((w, i) => {
              const on = ((weekMask >> i) & 1) === 1;
              return (
                <Pressable
                  key={w}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`วัน${WD_FULL[i]}`}
                  onPress={() => {
                    const next = weekMask ^ (1 << i);
                    if (!next) return showToast('ต้องเลือกอย่างน้อย 1 วัน');
                    d.setWeekdays(next);
                  }}
                  style={({ pressed }) => ({ flex: 1, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.ink : pressed ? t.rail : t.track })}>
                  <Txt size={13.5} weight={on ? 'bold' : 'med'} color={on ? t.bg : i === 6 ? t.accentInk : t.sub}>
                    {w}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </FadeInView>
      ) : null}

      {spanned ? (
        <FadeInView rise={6} style={{ gap: 6 }}>
          <Txt size={12.5} color={t.sub}>
            ทำซ้ำไปอีก
          </Txt>
          <ChipRow style={{ gap: 6 }}>
            {HORIZONS.map((h) => (
              <Chip key={h.key} small label={h.label} active={!d.keepEnd && d.horizon === h.key} onPress={() => { setEndPick(false); d.setHorizon(h.key); }} />
            ))}
            {/* ไม่มีวันสิ้นสุด — เฉพาะกฎสำเร็จรูป ("เลือกเอง" ต้องเก็บเป็นรายวัน จึงต้องมีวันจบ) */}
            {d.repeat !== 'custom' ? (
              <Chip small label="ไม่มีวันสิ้นสุด" active={!!d.keepEnd && d.keepEnd.endDate === null} onPress={() => { setEndPick(false); d.setEnd(null); }} />
            ) : null}
            <Chip
              small
              icon="calendar"
              label={customEnd ? `ถึง ${shortDate(customEnd)}` : 'ถึงวันที่…'}
              active={!!customEnd}
              onPress={() => {
                const dt = fromISO(customEnd ?? last);
                setEndYm({ y: dt.getFullYear(), m: dt.getMonth() });
                setEndPick(!endPick);
              }}
            />
          </ChipRow>
          {endPick ? (
            <FadeInView rise={-6} style={{ gap: 8, padding: 10, borderRadius: 14, backgroundColor: t.bg }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <NavCircle dir="prev" label="เดือนก่อนหน้า" onPress={() => setEndYm(shiftYm(endYm, -1))} />
                <Txt size={13.5} weight="bold" style={{ flex: 1, textAlign: 'center' }}>
                  วันสุดท้าย · {MONTH_TH_FULL[endYm.m]} {beYear(endYm.y)}
                </Txt>
                <NavCircle dir="next" label="เดือนถัดไป" onPress={() => setEndYm(shiftYm(endYm, 1))} />
              </View>
              <MonthGrid
                year={endYm.y}
                month={endYm.m}
                mode="select"
                selected={customEnd ? [customEnd] : []}
                onPressDay={(iso) => {
                  if (iso < anchor) return showToast('วันสุดท้ายต้องไม่ก่อนวันแรก');
                  d.setEnd(iso);
                  setEndPick(false);
                }}
              />
            </FadeInView>
          ) : null}
        </FadeInView>
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
              รวม <Txt size={13} weight="bold">{d.dates.length} วัน</Txt> · {customEnd === null && d.keepEnd ? `เริ่ม ${shortDate(anchor)} · ไม่มีวันสิ้นสุด` : dateRange(anchor, last)}
            </>
          )}
        </Txt>
        <Txt size={13} weight="bold" color={t.accentInk}>
          {calOpen ? 'ซ่อนปฏิทิน' : d.repeat === 'none' ? 'เปลี่ยนวัน ›' : 'ดูบนปฏิทิน ›'}
        </Txt>
      </Pressable>

      {calOpen ? (
        <FadeInView rise={-6} style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {/* ‹ › เปลี่ยนเดือนได้ตรงนี้ — แตะชื่อเดือนเพื่อกระโดดไปเดือน/ปีอื่น */}
            <NavCircle dir="prev" label="เดือนก่อนหน้า" onPress={() => setYm(shiftYm(ym, -1))} />
            <Pressable accessibilityRole="button" accessibilityLabel={`${MONTH_TH_FULL[ym.m]} ${beYear(ym.y)} — แตะเพื่อเลือกเดือนและปี`} onPress={() => setPickerOpen(true)} style={pressFade({ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40 })}>
              <Txt size={14} weight="bold">
                {MONTH_TH_FULL[ym.m]} {beYear(ym.y)}
              </Txt>
              <Icon name="chevD" size={16} color={t.sub} />
            </Pressable>
            <NavCircle dir="next" label="เดือนถัดไป" onPress={() => setYm(shiftYm(ym, 1))} />
          </View>
          {datesDirty ? (
            <View style={{ alignItems: 'flex-end', marginTop: -4 }}>
              <Chip
                small
                icon="restore"
                label="กลับเป็นวันนี้"
                onPress={() => {
                  const before = { dates: d.dates, repeat: d.repeat, horizon: d.horizon, keepEnd: d.keepEnd, weekMask: d.weekMask, weekBase: d.weekBase };
                  d.resetDates();
                  showToast('กลับเป็นวันนี้วันเดียวแล้ว', { label: 'เลิกทำ', run: () => useDraft.getState().set(before) });
                }}
              />
            </View>
          ) : null}
          <MonthGrid
            year={ym.y}
            month={ym.m}
            mode="select"
            selected={d.dates}
            // ครั้งเดียว: แตะวัน = ย้ายไปวันนั้น · แบบอื่น: แตะเพิ่ม/เอาออก (กลายเป็น "เลือกเอง")
            onPressDay={(iso) => (d.repeat === 'none' ? d.set({ dates: [iso] }) : d.toggleDate(iso))}
          />
          <Txt size={12} color={t.sub}>
            {d.repeat === 'none' ? 'แตะวันเพื่อย้ายไปวันนั้น' : 'แตะวันเพื่อเพิ่ม/เอาออก — แก้เองแล้วจะเป็น “เลือกเอง”'}
          </Txt>
        </FadeInView>
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
  // แตะเวลา "เริ่ม"/"สิ้นสุด" → กางชิปชั่วโมง/นาทีให้เลือกตรง ๆ (เดิมมีแต่ปุ่ม ± ทีละ 15 นาที)
  const [pick, setPick] = useState<'start' | 'end' | null>(null);
  // แตะบล็อกบนแถบเวลาเฉย ๆ → เน้นคำอธิบายวิธีลาก 3 วินาที
  const [hintOn, setHintOn] = useState(0);
  useEffect(() => {
    if (!hintOn) return;
    const id = setTimeout(() => setHintOn(0), 3200);
    return () => clearTimeout(id);
  }, [hintOn]);
  // เปลี่ยนเวลาเริ่ม = ย้ายทั้งช่วง (ระยะเวลาเท่าเดิม) — เดิมเลื่อนเริ่มเลยเวลาจบแล้วกลายเป็น "เวลาไม่ถูกต้อง"
  const setStart = (v: number) => {
    const len = duration > 0 ? duration : 60;
    const st = Math.min(Math.max(v, DAY_START), DAY_END - SNAP);
    setRange(st, Math.min(st + len, DAY_END));
  };
  const setEnd = (v: number) => d.set({ end: Math.min(Math.max(v, DAY_START + SNAP), DAY_END) });

  return (
    <Card style={{ gap: 10 }}>
      {/* ── ตั้งเวลาตรง ๆ ก่อน: เริ่ม · สิ้นสุด · ระยะเวลา · ช่วงของวัน ── */}
      <TimeStepper label="เริ่ม" value={d.start} onChange={setStart} open={pick === 'start'} onToggle={() => setPick(pick === 'start' ? null : 'start')} />
      {pick === 'start' ? <TimePick value={d.start} onChange={setStart} /> : null}
      <TimeStepper label="สิ้นสุด" value={d.end} onChange={setEnd} open={pick === 'end'} onToggle={() => setPick(pick === 'end' ? null : 'end')} />
      {pick === 'end' ? <TimePick value={d.end} onChange={setEnd} /> : null}
      {timeInvalid ? (
        <Txt size={12.5} weight="bold" color={t.warn}>
          เวลาสิ้นสุดต้องหลังเวลาเริ่ม
        </Txt>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Txt size={12.5} color={t.sub} style={{ flex: 1 }}>
          ระยะเวลา
        </Txt>
        <Txt size={13} num weight="bold" color={timeInvalid ? t.warn : t.accentInk}>
          {timeInvalid ? '—' : durText(duration)}
        </Txt>
      </View>
      <ChipRow style={{ gap: 6, marginTop: -4 }}>
        {DURATIONS.map((m) => (
          <Chip key={m} small label={durChip(m)} active={duration === m} onPress={() => d.set({ end: Math.min(d.start + m, DAY_END) })} />
        ))}
      </ChipRow>

      <Txt size={12.5} color={t.sub}>
        ช่วงของวัน
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

      <View style={{ height: 1, backgroundColor: t.line }} />

      {/* ── ดูทั้งวัน: ลากบนแถบเวลา + กิจกรรมเดิม + ช่วงว่าง + ที่ซ้อน ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Txt size={13} weight="bold" style={{ flex: 1 }} numberOfLines={1}>
          หรือลากบนแถบเวลา
        </Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: detailed }}
          onPress={() => setDetailed(!detailed)}
          hitSlop={6}
          style={({ pressed }) => ({ height: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: pressed ? t.rail : t.track, justifyContent: 'center' })}>
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
                  accessibilityLabel={`${thaiDate(p.date)}${p.conflicts.length ? ' · เวลาซ้อน' : ''}`}
                  onPress={() => setRefPick(i)}
                  style={pressFade({ height: 34, paddingHorizontal: 12, borderRadius: 17, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: on ? t.ink : t.track })}>
                  <Txt size={13} weight={on ? 'bold' : 'med'} color={on ? t.bg : t.sub}>
                    {shortDate(p.date)}
                  </Txt>
                  {p.conflicts.length ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: ATTN }} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {detailed ? (
        <FadeInView key="rail">
          <TimeDragRail start={d.start} end={d.end} items={refItems} free={slots} title={d.title.trim()} onDragState={onDragState} onChange={setRange} onHint={() => setHintOn(hintOn + 1)} />
        </FadeInView>
      ) : (
        <FadeInView key="bar">
          <TimeDragBar start={d.start} end={d.end} items={refItems} free={slots} onDragState={onDragState} onChange={setRange} onHint={() => setHintOn(hintOn + 1)} />
        </FadeInView>
      )}
      {/* วิธีลาก — อยู่ติดใต้แถบ (เดิมอยู่ไกลลงไปด้านล่าง) · แตะบล็อกเฉย ๆ แล้วบรรทัดนี้เด่นขึ้น */}
      <Txt size={12} weight={hintOn ? 'bold' : 'reg'} color={hintOn ? t.accentInk : t.sub} style={{ lineHeight: 17, marginTop: -4 }}>
        {detailed ? 'กดค้างที่บล็อกสีแล้วลาก = ย้าย · ลากขอบบน/ล่าง = ยืด/หด · แตะที่ว่าง = ย้ายไปเวลานั้น' : 'ลากบล็อกสีไปซ้าย–ขวา = ย้าย · ลากขอบ = ยืด/หด · แตะที่ว่าง = ย้ายไปเวลานั้น'}
      </Txt>

      {/* พื้นที่ผลลัพธ์สูงคงที่ขั้นต่ำ — ระหว่างลาก กล่อง "ซ้อน/ไม่ซ้อน" สลับกันแล้วส่วนล่างไม่กระตุกขึ้นลง */}
      <View style={{ minHeight: 24, justifyContent: 'center' }}>
      {/* ผลของช่วงที่เลือก — ชน (ทุกวันที่ลง) + เสนอช่วงที่ใกล้ที่สุด · หรือว่างตลอดช่วง */}
        {analysis.conflictDays > 0 ? (
          <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: ATTN + '73' }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10 }}>
              <SvgIcon name="alert" size={16} color={t.warn} strokeWidth={2} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt size={12.5} weight="bold" color={t.warn} style={{ lineHeight: 18 }}>
                  {analysis.text} — บันทึกซ้อนได้
                </Txt>
                {multi && ref ? (
                  <Txt size={12} color={t.sub} style={{ lineHeight: 17 }}>
                    {shortDate(ref.date)}: {ref.conflicts.length ? `ซ้อนกับ ${ref.conflicts.map((c) => `“${c.title}”`).join(', ')}` : 'ไม่ซ้อน'}
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
              ไม่ซ้อนกับกิจกรรมเดิม{multi ? `ทุกวันที่ลง (${d.dates.length} วัน)` : ''}
            </Txt>
          </View>
        ) : null}
      </View>

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
                    backgroundColor: on ? c : pressed ? t.greenInk + '38' : s.night ? t.track : t.greenInk + '1F',
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
    </Card>
  );
}

// ---------- ④ แจ้งเตือน ----------

function NotifyBody() {
  const t = useTokens();
  const d = useDraft();
  const showToast = useUI((s) => s.showToast);
  const master = useSettings((s) => s.notifMaster);
  // เปิดแจ้งเตือนของกิจกรรม = จังหวะที่ขอสิทธิ์จากเครื่อง (ถ้ายังไม่เคยให้) — ผู้ใช้เพิ่งบอกเองว่าอยากให้เตือน
  const setNotify = async (v: boolean) => {
    d.set({ notify: v });
    if (!v) return;
    const st = await notifPermissionState().catch(() => 'granted' as const);
    if (st === 'granted') return;
    const ok = st === 'ask' ? await requestNotifPermission().catch(() => false) : false;
    if (ok) return resyncNotifications();
    showToast('เครื่องยังไม่อนุญาตให้แอปนี้แจ้งเตือน — กิจกรรมจะยังไม่เด้งเตือน', { label: 'ไปตั้งค่า', run: () => Linking.openSettings() });
  };
  return (
    <Card style={{ gap: 10, paddingVertical: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 10 }}>
        <Txt size={14.5} style={{ flex: 1 }}>
          แจ้งเตือนก่อนเริ่ม
        </Txt>
        <Txt size={13} color={t.sub}>
          {d.notify ? 'เปิด' : 'ปิด'}
        </Txt>
        <Toggle label="แจ้งเตือนก่อนเริ่ม" value={d.notify} onChange={setNotify} />
      </View>
      {d.notify ? (
        <FadeInView rise={-6} style={{ gap: 8, paddingBottom: 8 }}>
          <ChipRow style={{ gap: 6 }}>
            {/* 0 = แจ้งทันทีตอนถึงเวลาเริ่ม */}
            {[0, 1, 5, 10, 15, 30, 60, 120].map((m) => (
              <Chip key={m} small label={m === 0 ? 'ตอนเริ่ม' : m >= 60 ? `${m / 60} ชม.` : `${m} นาที`} active={d.before === m} onPress={() => d.set({ before: m })} />
            ))}
          </ChipRow>
          {!master ? (
            <Txt size={12} weight="med" color={t.warn}>
              การแจ้งเตือนของแอปปิดอยู่ — เปิดได้ที่ ตั้งค่า › เปิดการแจ้งเตือน
            </Txt>
          ) : null}
        </FadeInView>
      ) : (
        <Txt size={12} color={t.sub} style={{ paddingBottom: 10, marginTop: -6 }}>
          ไม่บังคับ — ครบแล้ว กด “บันทึก” ด้านล่างได้เลย
        </Txt>
      )}
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
    <View style={{ marginTop: 6, backgroundColor: t.card, borderRadius: 20, borderWidth: 1.5, borderColor: t.accent, padding: 14, gap: 10 }}>
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

/**
 * แถวปรับเวลา — − / เวลา / ＋ ทีละ 15 นาที · กดค้างปุ่มแล้วเลื่อนต่อเนื่อง (ไม่ต้องแตะรัว)
 * แตะตัวเลขเวลา = กาง/พับชิปเลือกชั่วโมงและนาที (TimePick)
 */
function TimeStepper({ label, value, onChange, open, onToggle }: { label: string; value: number; onChange: (v: number) => void; open: boolean; onToggle: () => void }) {
  const t = useTokens();
  // ค่าล่าสุดสำหรับตัวจับเวลาตอนกดค้าง (อัปเดตหลัง render)
  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopRepeat = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stopRepeat, []);
  const step = (dir: 1 | -1) => latest.current.onChange(latest.current.value + dir * SNAP);
  const btn = (dir: 1 | -1) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${dir > 0 ? 'เพิ่ม' : 'ลด'} 15 นาที`}
      accessibilityHint="กดค้างเพื่อเลื่อนต่อเนื่อง"
      onPress={() => step(dir)}
      delayLongPress={320}
      onLongPress={() => {
        stopRepeat();
        timer.current = setInterval(() => step(dir), 110);
      }}
      onPressOut={stopRepeat}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: pressed ? t.rail : t.track, alignItems: 'center', justifyContent: 'center' })}>
      <SvgIcon name={dir > 0 ? 'plus' : 'minus'} size={18} color={t.ink} strokeWidth={2.2} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Txt size={13} color={t.sub} style={{ width: 48 }}>{label}</Txt>
      {btn(-1)}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label} ${fmtMin(value)}${value > 1440 ? ' วันถัดไป' : ''} — แตะเพื่อเลือกชั่วโมงและนาที`}
        onPress={onToggle}
        style={({ pressed }) => ({ flex: 1, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: open ? t.accent + '1F' : pressed ? t.track : 'transparent' })}>
        <Txt size={20} num weight="bold" color={open ? t.accentInk : t.ink}>
          {fmtMin(value)}
        </Txt>
        {value > 1440 ? (
          <Txt size={11.5} color={t.sub}>
            วันถัดไป
          </Txt>
        ) : null}
        <Icon name="chevD" size={14} color={open ? t.accentInk : t.faint} />
      </Pressable>
      {btn(1)}
    </View>
  );
}

/** ชั่วโมงในหน้าต่างวัน 06:00 → 06:00 ของวันถัดไป */
const PICK_HOURS = Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => DAY_START / 60 + i);

/** เลือกชั่วโมง (แถวเลื่อนแนวนอน) + นาที (00/15/30/45) ตรง ๆ — ชั่วโมงหลังเที่ยงคืนมีป้าย "+1" */
function TimePick({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const t = useTokens();
  const h = Math.floor(value / 60);
  const m = value % 60;
  const scRef = useRef<ScrollViewInstance>(null);
  const CELL = 46;
  // เปิดมาเลื่อนให้ชั่วโมงที่เลือกอยู่กลางแถว
  const [x0] = useState(() => Math.max((h - DAY_START / 60) * (CELL + 6) - 120, 0));
  return (
    <FadeInView rise={-6} style={{ gap: 8, padding: 10, borderRadius: 14, backgroundColor: t.bg }}>
      <ScrollView ref={scRef} horizontal showsHorizontalScrollIndicator={false} contentOffset={{ x: x0, y: 0 }} onContentSizeChange={() => scRef.current?.scrollTo({ x: x0, animated: false })} contentContainerStyle={{ gap: 6 }}>
        {PICK_HOURS.map((hh) => {
          const on = hh === h;
          return (
            <Pressable
              key={hh}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${hh % 24} นาฬิกา${hh >= 24 ? ' วันถัดไป' : ''}`}
              onPress={() => onChange(hh * 60 + m)}
              style={({ pressed }) => ({ width: CELL, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.ink : pressed ? t.rail : t.track })}>
              <Txt size={14} num weight={on ? 'bold' : 'med'} color={on ? t.bg : hh >= 24 ? t.muted : t.ink}>
                {`${hh % 24}`.padStart(2, '0')}
                {hh >= 24 ? <Txt size={9.5} color={on ? t.bg : t.muted}>{' +1'}</Txt> : null}
              </Txt>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Txt size={12} color={t.sub} style={{ width: 40 }}>
          นาที
        </Txt>
        {[0, 15, 30, 45].map((mm) => {
          const on = mm === m;
          return (
            <Pressable
              key={mm}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${mm} นาที`}
              onPress={() => onChange(h * 60 + mm)}
              style={({ pressed }) => ({ flex: 1, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.ink : pressed ? t.rail : t.track })}>
              <Txt size={14} num weight={on ? 'bold' : 'med'} color={on ? t.bg : t.ink}>
                :{`${mm}`.padStart(2, '0')}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </FadeInView>
  );
}
