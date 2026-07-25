// คัดลอกกิจกรรม (ตั้งค่า → การจัดการ) — วิซาร์ด 2 ขั้น บนตารางเดือนตัวเดียวที่สลับความหมายตามขั้น
// สองโหมด:
//   • แบบรายการ — ติ๊กกิจกรรมทีละรายการ (ข้ามวันได้) → เลือกวันปลายทางหลายวัน → ทุกรายการลงทุกวันที่เลือก
//   • แบบวัน    — เลือก "ทั้งวัน" หลายวัน → แตะวันเริ่มวันเดียว → ยกไปวางเป็นบล็อกโดยรักษาระยะห่างเดิม
//                 (ต้นทาง 1,2,5 → เริ่ม 15 ได้ 15,16,19) · ข้ามรายการที่ถูกเลื่อนออกไปแล้ว (rescheduled)
// การวาง = สร้าง Activity ใหม่แบบครั้งเดียว (repeat 'none') ที่วันปลายทาง — ไม่แตะของเดิม
// และไม่สืบทอดสถานะรายวัน (done/skipped อยู่คนละตาราง) ของใหม่จึงเริ่มที่ planned เสมอ
// โหมดวางแบบ "แทนที่ทั้งวัน" จะลบกิจกรรมเดิมของวันปลายทางก่อน (deleteOne เดียวกับที่แผ่นรายละเอียดใช้)
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { StepBtn } from '@/components/today/parts';
import { Btn, Card, Chip, ChipRow, PriBadge, Segmented, Txt, useTokens } from '@/components/ui';
import { ACCENT, CAT_BY_ID, DANGER, GREEN, type CatId } from '@/constants/theme';
import { MONTH_TH_FULL, WD_TH, addDays, beYear, fmtRange, fromISO, mondayOf, thaiDate, toISO, todayISO } from '@/lib/dates';
import { conflictsOn } from '@/lib/engine';
import type { DayItem } from '@/lib/types';
import { useActivities, useDayReader } from '@/stores/activities';
import { useUI } from '@/stores/ui';

type CopyMode = 'item' | 'day';
type PasteMode = 'add' | 'replace';

/** หน้าตาของช่องวันหนึ่งช่อง — คำนวณจากโหมด+ขั้นตอนแล้วส่งให้ DayCell วาด */
interface CellLook {
  fill: 'accent' | 'green' | null;
  ring: 'accent' | 'green' | null;
  label: string;
  labelColor: string;
  dim: boolean;
}

/** คีย์ประจำ occurrence (ชุดทำซ้ำใช้ id เดียวกันหลายวัน จึงต้องมีวันในคีย์ด้วย) */
const keyOf = (it: DayItem) => `${it.id}:${it.date}`;

/** จำนวนวันจาก a ถึง b (ทั้งคู่เป็นเที่ยงคืนท้องถิ่น — ปัดเศษกัน DST) */
const daysBetween = (a: string, b: string) => Math.round((+fromISO(b) - +fromISO(a)) / 86400000);

/** วันเดียวกันของเดือนถัดไป (ปัดลงถ้าเดือนใหม่ไม่มีวันนั้น เช่น 31 ม.ค. → 28/29 ก.พ.) */
function addMonth(iso: string): string {
  const d = fromISO(iso);
  const day = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return toISO(new Date(target.getFullYear(), target.getMonth(), Math.min(day, last)));
}

export default function CopyScreen() {
  const t = useTokens();
  const getDay = useDayReader(); // อ่านหลายวันแบบ cache — อัปเดตเองเมื่อข้อมูลเปลี่ยน
  const add = useActivities((s) => s.add);
  const deleteOne = useActivities((s) => s.deleteOne);
  const showToast = useUI((s) => s.showToast);

  const [copyMode, setCopyMode] = useState<CopyMode>('item');
  const [pasteMode, setPasteMode] = useState<PasteMode>('add');
  const [step, setStep] = useState<1 | 2>(1);
  const [ym, setYm] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [openDay, setOpenDay] = useState<string | null>(todayISO()); // วันที่กางรายการอยู่ (ขั้น 1)
  const [picked, setPicked] = useState<DayItem[]>([]); // โหมดรายการ: กิจกรรมต้นทางที่ติ๊กไว้
  const [targets, setTargets] = useState<string[]>([]); // โหมดรายการ: วันปลายทาง (หลายวัน)
  const [srcDays, setSrcDays] = useState<string[]>([]); // โหมดวัน: วันต้นทางที่เลือกไว้
  const [startDay, setStartDay] = useState<string | null>(null); // โหมดวัน: วันเริ่มวางของบล็อก
  const [excluded, setExcluded] = useState<string[]>([]); // โหมดวัน: กิจกรรมที่เอาออก (ค่าเริ่มต้น = เอาทุกกิจกรรมของวันนั้น)
  const [busy, setBusy] = useState(false);

  /** รายการของวันที่คัดลอกได้ — ข้ามตัวที่ถูกเลื่อนออกไปวันอื่นแล้ว (เป็นแค่เงาของนัดที่ย้ายไป) */
  const copyableOf = (d: string) => getDay(d).filter((i) => i.ostatus !== 'rescheduled');
  /** รายการที่จะถูกคัดลอกจริงของวันนั้น (โหมดวัน — หักตัวที่ผู้ใช้เอาออก) */
  const chosenOf = (d: string) => copyableOf(d).filter((i) => !excluded.includes(keyOf(i)));

  // สลับโหมด = เริ่มใหม่ทั้งหมด (ต้นทางคนละความหมายกัน จะเก็บค้างไว้ไม่ได้)
  const switchMode = (m: CopyMode) => {
    setCopyMode(m);
    setStep(1);
    setPicked([]);
    setTargets([]);
    setSrcDays([]);
    setStartDay(null);
    setExcluded([]);
  };

  // ---------- ตารางเดือนที่ใช้ร่วมกันทั้งสองขั้น (จันทร์นำ 6 แถว) ----------
  const first = toISO(new Date(ym.y, ym.m, 1));
  const ymKey = first.slice(0, 7);
  const gridDays = Array.from({ length: 42 }, (_, i) => addDays(mondayOf(first), i));
  const inRange = (d: string) => d.slice(0, 7) === ymKey;
  const rangeLabel = `${MONTH_TH_FULL[ym.m]} ${beYear(ym.y)}`;

  const shiftMonth = (dir: 1 | -1) => {
    const d = new Date(ym.y, ym.m + dir, 1);
    setYm({ y: d.getFullYear(), m: d.getMonth() });
  };

  // ---------- ขั้น 1: ต้นทาง ----------
  const pickedKeys = new Set(picked.map(keyOf));
  const srcDates = copyMode === 'item' ? [...new Set(picked.map((p) => p.date))].sort() : [...srcDays].sort();
  const openItems = openDay ? [...copyableOf(openDay)].sort((a, b) => a.startMin - b.startMin) : [];
  const openAllPicked = openItems.length > 0 && openItems.every((i) => pickedKeys.has(keyOf(i)));

  const toggleItem = (it: DayItem) =>
    setPicked((cur) => (cur.some((x) => keyOf(x) === keyOf(it)) ? cur.filter((x) => keyOf(x) !== keyOf(it)) : [...cur, it]));

  // เลือก/ล้างทั้งวัน (โหมดรายการ) — ปุ่มเดียวสลับตามสถานะปัจจุบันของวันนั้น
  const toggleOpenDay = () => {
    if (!openDay) return;
    setPicked((cur) => {
      const rest = cur.filter((x) => x.date !== openDay);
      return openAllPicked ? rest : [...rest, ...openItems];
    });
  };

  // เลือก/ถอนวันต้นทาง (โหมดวัน) — ถอดวันออกแล้วล้างรายการที่เคยเอาออกของวันนั้นด้วย เพื่อให้กลับมาเป็น "เอาทุกอัน"
  const toggleSrcDay = (d: string) => {
    const on = srcDays.includes(d);
    setSrcDays(on ? srcDays.filter((x) => x !== d) : [...srcDays, d]);
    if (on) setExcluded((ex) => ex.filter((k) => !k.endsWith(`:${d}`)));
  };

  const toggleExclude = (it: DayItem) =>
    setExcluded((cur) => (cur.includes(keyOf(it)) ? cur.filter((k) => k !== keyOf(it)) : [...cur, keyOf(it)]));

  // เอาทั้งวัน / ไม่เอาทั้งวัน (โหมดวัน) — สลับตามสถานะปัจจุบันของวันที่กางอยู่
  const openInSet = copyMode === 'day' && !!openDay && srcDays.includes(openDay);
  const openChosenCount = openDay ? chosenOf(openDay).length : 0;
  const dayAllOn = openItems.length > 0 && openChosenCount === openItems.length;
  const toggleOpenDayItems = () => {
    if (!openDay) return;
    const keys = openItems.map(keyOf);
    setExcluded((ex) => (dayAllOn ? [...ex, ...keys] : ex.filter((k) => !keys.includes(k))));
  };

  // ---------- ขั้น 2: ปลายทาง ----------
  const toggleTarget = (d: string) => setTargets((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  const anchor = srcDates[0] ?? todayISO(); // วันต้นทางแรก — ฐานของทางลัด
  const shortcuts = [
    { label: '+1 สัปดาห์', date: addDays(anchor, 7) },
    { label: '+2 สัปดาห์', date: addDays(anchor, 14) },
    { label: '+1 เดือน', date: addMonth(anchor) },
  ];

  // โหมดวัน: จับคู่วันต่อวัน — รักษาระยะห่างจากวันต้นทางแรก (1,2,5 + เริ่ม 15 → 15,16,19)
  const pairs =
    copyMode === 'day' && startDay
      ? srcDates.map((from) => ({ from, to: addDays(startDay, daysBetween(srcDates[0], from)) }))
      : [];

  /** แผนการวาง — สรุปไว้ล่วงหน้าก่อนแตะข้อมูลจริง (โหมดแทนที่ลบของเดิมทีหลัง จึงต้องอ่านต้นทางให้ครบก่อน) */
  const plan: { date: string; items: DayItem[] }[] =
    copyMode === 'item'
      ? [...targets].sort().map((date) => ({ date, items: picked }))
      : pairs.map((p) => ({ date: p.to, items: chosenOf(p.from) }));

  const targetDates = plan.map((p) => p.date);
  const total = plan.reduce((s, p) => s + p.items.length, 0);
  const replaceCount = pasteMode === 'replace' ? targetDates.reduce((s, d) => s + getDay(d).length, 0) : 0;

  // วันปลายทางที่มีเวลาชนกับของเดิม (เตือนอย่างเดียว ไม่บล็อก — เหมือนหน้าเพิ่มกิจกรรม)
  // โหมดแทนที่ไม่ต้องเตือน เพราะของเดิมจะถูกลบก่อนอยู่แล้ว
  const clashDays =
    pasteMode === 'replace'
      ? []
      : plan
          .filter((p) => {
            const existing = getDay(p.date);
            return p.items.some((it) => conflictsOn(existing, it.startMin, it.endMin).length > 0);
          })
          .map((p) => p.date);

  const onPaste = async () => {
    if (!total || busy) return;
    setBusy(true);
    try {
      // ① ลบของเดิมก่อน (เฉพาะโหมดแทนที่) — plan อ่านต้นทางไว้เรียบร้อยแล้ว ลบทับวันต้นทางเองก็ไม่กระทบ
      if (pasteMode === 'replace') {
        for (const date of [...new Set(targetDates)]) for (const old of getDay(date)) deleteOne(old);
      }
      // ② วางของใหม่
      for (const p of plan) {
        for (const it of [...p.items].sort((a, b) => a.startMin - b.startMin)) {
          await add({
            title: it.title,
            cat: it.cat,
            sub: it.sub,
            loc: it.loc,
            channel: it.channel,
            priority: it.priority,
            startMin: it.startMin,
            endMin: it.endMin,
            repeat: 'none', // วางเป็นครั้งเดียวต่อวันปลายทาง ไม่สร้างชุดทำซ้ำซ้อนของเดิม
            daysMask: 0,
            startDate: p.date,
            endDate: null,
            notify: it.notify,
            notifyBefore: it.notifyBefore,
            detachedFrom: null,
            status: 'active',
            contactIds: it.contactIds,
            color: it.color, // สีที่จำมาจากไฟล์ Time Table (ถ้ามี)
          });
        }
      }
      const n = total;
      const days = new Set(targetDates).size;
      setPicked([]);
      setTargets([]);
      setSrcDays([]);
      setStartDay(null);
      setExcluded([]);
      setStep(1);
      showToast(`คัดลอกแล้ว ${n} รายการ ลง ${days} วัน ✓`);
    } catch {
      showToast('คัดลอกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  // ---------- การแสดงผลของแต่ละช่องวัน (ต่างกันตามโหมด+ขั้น) ----------
  const cellStyleOf = (d: string): CellLook => {
    const isToday = d === todayISO();
    const base: CellLook = { fill: null, ring: null, label: '', labelColor: ACCENT, dim: false };

    if (step === 1) {
      if (copyMode === 'item') {
        const n = picked.filter((p) => p.date === d).length;
        return { ...base, fill: n ? 'accent' : null, ring: d === openDay ? 'accent' : isToday ? 'accent' : null, label: n ? `✓${n}` : '' };
      }
      const on = srcDays.includes(d);
      const n = on ? chosenOf(d).length : 0;
      return {
        ...base,
        fill: on ? 'accent' : null,
        ring: !on && d === openDay ? 'accent' : !on && isToday ? 'accent' : null,
        label: on ? `${n} รายการ` : '',
      };
    }

    // ขั้น 2
    if (copyMode === 'item') {
      const on = targets.includes(d);
      return {
        ...base,
        fill: on ? 'green' : null,
        ring: !on && srcDates.includes(d) ? 'accent' : !on && isToday ? 'accent' : null,
        label: on ? 'วาง' : '',
        labelColor: GREEN,
        dim: !on && inRange(d),
      };
    }
    const pair = pairs.find((p) => p.to === d);
    return {
      ...base,
      fill: pair ? 'green' : null,
      ring: !pair && srcDates.includes(d) ? 'accent' : !pair && isToday ? 'accent' : null,
      label: pair ? (d === startDay ? 'เริ่ม' : 'วาง') : '',
      labelColor: GREEN,
      dim: !pair && inRange(d),
    };
  };

  const onCellPress = (d: string) => {
    if (step === 1) {
      setOpenDay(d);
      if (copyMode === 'day') toggleSrcDay(d);
      return;
    }
    if (copyMode === 'item') return toggleTarget(d);
    setStartDay(d); // โหมดวัน: ปลายทางคือ "วันเริ่ม" วันเดียว ที่เหลือคำนวณให้เอง
  };

  const step1Done = copyMode === 'item' ? picked.length > 0 : srcDays.length > 0;
  const srcItemCount = copyMode === 'item' ? picked.length : srcDates.reduce((s, d) => s + chosenOf(d).length, 0);

  return (
    <Screen
      title="คัดลอกกิจกรรม"
      subtitle={step === 1 ? 'ขั้นที่ 1 จาก 2 · เลือกต้นทาง' : copyMode === 'item' ? 'ขั้นที่ 2 จาก 2 · เลือกวันปลายทาง' : 'ขั้นที่ 2 จาก 2 · เลือกวันเริ่มวาง'}
      back>
      {/* โหมดคัดลอก — สลับแล้วเริ่มเลือกใหม่ (ต้นทางคนละความหมาย) */}
      <Card style={{ gap: 8 }}>
        <Segmented
          options={[
            { key: 'item', label: 'แบบรายการ' },
            { key: 'day', label: 'แบบวัน' },
          ]}
          value={copyMode}
          onChange={switchMode}
        />
        <Txt size={11.5} color={t.faint}>
          {copyMode === 'item'
            ? 'ติ๊กกิจกรรมทีละรายการ แล้ววางรายการชุดเดียวกันลงได้หลายวัน'
            : 'เลือกทั้งวันหลายวัน แล้วแตะ "วันเริ่ม" — ระบบวางต่อกันตามรูปแบบวันต้นทาง (เลือกกี่วัน วางเท่านั้นวัน)'}
        </Txt>
      </Card>

      {/* หัวขั้นตอน */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <StepDot n={1} state={step === 1 ? 'now' : 'done'} />
        <Txt size={14} weight="bold" color={step === 1 ? t.ink : t.sub} style={{ flex: 1 }}>
          {step1Done ? `ต้นทาง ${srcDates.length} วัน · ${srcItemCount} รายการ` : copyMode === 'item' ? 'เลือกกิจกรรมที่จะคัดลอก' : 'เลือกวันที่จะคัดลอก'}
        </Txt>
        <StepDot n={2} state={step === 2 ? 'now' : 'idle'} />
      </View>

      {/* แถบเลื่อนเดือน + ตาราง — ใช้ร่วมกันทั้ง 2 ขั้น */}
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <StepBtn icon="chevL" onPress={() => shiftMonth(-1)} />
          <Txt size={14} weight="bold" style={{ flex: 1, textAlign: 'center' }}>
            {rangeLabel}
          </Txt>
          <StepBtn icon="chevR" onPress={() => shiftMonth(1)} />
        </View>

        {/* หัววัน (จันทร์นำ, อาทิตย์สี accent) */}
        <View style={{ flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line, paddingBottom: 4 }}>
          {WD_TH.map((w, i) => (
            <Txt key={w} size={11} weight="med" color={i === 6 ? ACCENT : t.faint} style={{ flex: 1, textAlign: 'center' }}>
              {w}
            </Txt>
          ))}
        </View>

        {/* ห่อทุกแถวไว้ใน View เดียว ไม่ให้ gap ของ Card แทรกระหว่างแถวปฏิทิน */}
        <View style={{ marginTop: -4 }}>
          {Array.from({ length: gridDays.length / 7 }, (_, r) => (
            <View key={r} style={{ flexDirection: 'row' }}>
              {gridDays.slice(r * 7, r * 7 + 7).map((d) => {
                const s = cellStyleOf(d);
                return (
                  <DayCell
                    key={d}
                    date={d}
                    cats={inRange(d) && !s.label ? ([...new Set(getDay(d).map((i) => i.cat))].slice(0, 4) as CatId[]) : []}
                    inRange={inRange(d)}
                    fill={s.fill}
                    ring={s.ring}
                    label={s.label}
                    labelColor={s.labelColor}
                    dim={s.dim}
                    onPress={() => onCellPress(d)}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </Card>

      {step === 1 ? (
        <>
          {/* รายการของวันที่แตะล่าสุด — โหมดรายการติ๊กได้ทีละรายการ · โหมดวันเป็นแค่ตัวอย่างให้ดู */}
          {openDay ? (
            <Card style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Txt size={14} weight="bold" style={{ flex: 1 }}>
                  {thaiDate(openDay)}
                </Txt>
                {copyMode === 'item' && openItems.length ? (
                  <Chip small icon={openAllPicked ? 'x' : 'check'} label={openAllPicked ? 'ล้างทั้งวัน' : 'เลือกทั้งวัน'} onPress={toggleOpenDay} />
                ) : null}
                {openInSet && openItems.length ? (
                  <Chip small icon={dayAllOn ? 'x' : 'check'} label={dayAllOn ? 'ไม่เอาทั้งวัน' : 'เอาทั้งวัน'} onPress={toggleOpenDayItems} />
                ) : null}
                {copyMode === 'day' ? (
                  <Chip
                    small
                    icon={openInSet ? 'check' : 'plus'}
                    label={openInSet ? 'อยู่ในชุดคัดลอก' : 'ยังไม่เลือกวันนี้'}
                    active={openInSet}
                    onPress={() => toggleSrcDay(openDay)}
                  />
                ) : null}
              </View>

              {openInSet && openItems.length ? (
                <Txt size={11.5} color={t.faint}>
                  แตะรายการเพื่อเอาออก/ใส่กลับ · ตอนนี้เอา {openChosenCount} จาก {openItems.length} รายการ
                </Txt>
              ) : null}

              {openItems.length === 0 ? (
                <Txt size={13} color={t.faint}>
                  ไม่มีกิจกรรมที่คัดลอกได้ในวันนี้
                </Txt>
              ) : (
                openItems.map((it, i) => {
                  // โหมดรายการ = ติ๊กเพื่อเลือก · โหมดวัน (วันอยู่ในชุด) = ติ๊กไว้ทุกอันแล้ว แตะเพื่อเอาออก · วันที่ยังไม่เลือก = ดูอย่างเดียว
                  const selectable = copyMode === 'item' || openInSet;
                  const on = copyMode === 'item' ? pickedKeys.has(keyOf(it)) : openInSet && !excluded.includes(keyOf(it));
                  const cat = CAT_BY_ID[it.cat];
                  return (
                    <Pressable
                      key={keyOf(it)}
                      disabled={!selectable}
                      onPress={() => (copyMode === 'item' ? toggleItem(it) : toggleExclude(it))}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 9,
                        paddingVertical: 8,
                        borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                        borderTopColor: t.line,
                        opacity: selectable && !on ? 0.55 : 1,
                      }}>
                      {selectable ? (
                        <View
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 6,
                            borderWidth: 1.5,
                            borderColor: on ? ACCENT : t.line2,
                            backgroundColor: on ? ACCENT : 'transparent',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                          {on ? <Icon name="check" size={13} color="#FFFFFF" /> : null}
                        </View>
                      ) : null}
                      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: cat.color }} />
                      {it.cat === 'case' ? <PriBadge id={it.priority} /> : null}
                      <Txt size={14} weight={on ? 'bold' : 'med'} numberOfLines={1} style={{ flex: 1 }}>
                        {it.title}
                      </Txt>
                      <Txt size={12} num color={t.sub}>
                        {fmtRange(it.startMin, it.endMin)}
                      </Txt>
                    </Pressable>
                  );
                })
              )}
            </Card>
          ) : null}

          <Card tone="card2" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Txt size={13} color={t.sub} style={{ flex: 1 }}>
              {step1Done
                ? `เลือกไว้ ${srcItemCount} รายการ จาก ${srcDates.length} วัน`
                : copyMode === 'item'
                  ? 'แตะวันบนตาราง แล้วติ๊กกิจกรรมที่จะคัดลอก'
                  : 'แตะวันบนตารางเพื่อเลือกทั้งวัน (เลือกได้หลายวัน)'}
            </Txt>
            <Btn label="ถัดไป" disabled={!step1Done} onPress={() => setStep(2)} renderIcon={(c, s) => <Icon name="chevR" size={s} color={c} />} />
          </Card>
        </>
      ) : (
        <>
          {/* สรุปต้นทาง */}
          <Card style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Txt size={14} weight="bold" style={{ flex: 1 }}>
                {copyMode === 'item' ? `จะคัดลอก ${picked.length} รายการ` : `จะคัดลอก ${srcDates.length} วัน (${srcItemCount} รายการ)`}
              </Txt>
              <Chip small icon="edit" label="แก้ต้นทาง" onPress={() => setStep(1)} />
            </View>

            {copyMode === 'item' ? (
              <>
                {[...picked]
                  .sort((a, b) => (a.date === b.date ? a.startMin - b.startMin : a.date < b.date ? -1 : 1))
                  .slice(0, 4)
                  .map((it) => (
                    <View key={keyOf(it)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: CAT_BY_ID[it.cat].color }} />
                      <Txt size={13} numberOfLines={1} style={{ flex: 1 }}>
                        {it.title}
                      </Txt>
                      <Txt size={11} num color={t.faint}>
                        {fmtRange(it.startMin, it.endMin)}
                      </Txt>
                    </View>
                  ))}
                {picked.length > 4 ? (
                  <Txt size={12} color={t.faint}>
                    และอีก {picked.length - 4} รายการ
                  </Txt>
                ) : null}
                {srcDates.length > 1 ? (
                  <Txt size={11.5} color={t.sub}>
                    รายการมาจาก {srcDates.length} วัน — ทุกรายการจะถูกวางรวมกันในทุกวันปลายทางที่เลือก
                  </Txt>
                ) : null}
              </>
            ) : (
              // โหมดวัน — ตารางจับคู่ วันต้นทาง → วันปลายทาง
              srcDates.map((d, i) => (
                <View key={d} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Txt size={13} style={{ flex: 1 }} numberOfLines={1}>
                    {thaiDate(d)}
                  </Txt>
                  {/* เอา n จากทั้งหมด m — โชว์ตัวหารเฉพาะวันที่มีการเอาบางรายการออก */}
                  <Txt size={11} num color={t.faint}>
                    {chosenOf(d).length}
                    {chosenOf(d).length !== copyableOf(d).length ? `/${copyableOf(d).length}` : ''} รายการ
                  </Txt>
                  <Icon name="arrowR" size={14} color={t.faint} />
                  <Txt size={13} weight="med" color={pairs[i] ? GREEN : t.faint} style={{ width: 118, textAlign: 'right' }} numberOfLines={1}>
                    {pairs[i] ? thaiDate(pairs[i].to) : 'ยังไม่เลือกวันเริ่ม'}
                  </Txt>
                </View>
              ))
            )}
          </Card>

          {/* ทางลัด + สถานะปลายทาง */}
          <Card style={{ gap: 8 }}>
            <Txt size={13} weight="med" color={t.sub}>
              ทางลัด (นับจาก {thaiDate(anchor)})
            </Txt>
            <ChipRow>
              {shortcuts.map((s) => (
                <Chip
                  key={s.label}
                  small
                  label={s.label}
                  color={GREEN}
                  active={copyMode === 'item' ? targets.includes(s.date) : startDay === s.date}
                  onPress={() => (copyMode === 'item' ? toggleTarget(s.date) : setStartDay(s.date))}
                />
              ))}
              {copyMode === 'item' && targets.length ? <Chip small icon="x" label="ล้างวันที่เลือก" onPress={() => setTargets([])} /> : null}
            </ChipRow>
            <Txt size={12} color={t.faint}>
              {copyMode === 'item'
                ? targets.length
                  ? `ปลายทาง: ${[...targets].sort().map(thaiDate).join(' · ')}`
                  : 'แตะวันบนตารางด้านบนเพื่อเลือกวันปลายทาง (เลือกได้หลายวัน)'
                : startDay
                  ? `วางเริ่ม ${thaiDate(startDay)} — รวม ${pairs.length} วัน ถึง ${thaiDate(pairs[pairs.length - 1].to)}`
                  : 'แตะวันบนตารางด้านบน 1 วัน = วันเริ่มวาง (ที่เหลือเรียงต่อให้ตามรูปแบบต้นทาง)'}
            </Txt>
          </Card>

          {/* วิธีวางเมื่อวันปลายทางมีของอยู่แล้ว */}
          <Card style={{ gap: 8 }}>
            <Txt size={13} weight="med" color={t.sub}>
              ถ้าวันปลายทางมีกิจกรรมอยู่แล้ว
            </Txt>
            <ChipRow>
              <Chip small icon="plus" label="วางเพิ่ม" active={pasteMode === 'add'} onPress={() => setPasteMode('add')} />
              <Chip small icon="restore" label="แทนที่ทั้งวัน" color={DANGER} active={pasteMode === 'replace'} onPress={() => setPasteMode('replace')} />
            </ChipRow>
            {pasteMode === 'replace' ? (
              <Txt size={12} weight="med" color={DANGER}>
                จะลบกิจกรรมเดิมของวันปลายทางทั้งหมดก่อนวาง{replaceCount ? ` (${replaceCount} รายการ)` : ''}
              </Txt>
            ) : null}
          </Card>

          {clashDays.length ? (
            <Card style={{ borderColor: DANGER + '55', backgroundColor: DANGER + '14' }}>
              <Txt size={13} weight="med" color={DANGER}>
                ⚠ เวลาชนกับกิจกรรมเดิมใน {clashDays.length} วัน ({[...clashDays].sort().map(thaiDate).join(' · ')}) — วางต่อได้
              </Txt>
            </Card>
          ) : null}

          <Card tone="card2" style={{ gap: 10 }}>
            <Txt size={13} color={t.sub}>
              {total
                ? copyMode === 'item'
                  ? `${picked.length} รายการ × ${targets.length} วัน = สร้างใหม่ ${total} รายการ`
                  : `${pairs.length} วัน = สร้างใหม่ ${total} รายการ`
                : copyMode === 'item'
                  ? 'ยังไม่ได้เลือกวันปลายทาง'
                  : 'ยังไม่ได้เลือกวันเริ่มวาง'}
            </Txt>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn style={{ flex: 1 }} kind="ghost" label="ย้อนกลับ" disabled={busy} onPress={() => setStep(1)} />
              <Btn
                style={{ flex: 1 }}
                kind={pasteMode === 'replace' ? 'danger' : 'green'}
                label={busy ? 'กำลังวาง…' : pasteMode === 'replace' ? `แทนที่ ${total || ''}`.trim() : `วาง ${total || ''} รายการ`.trim()}
                disabled={!total || busy}
                renderIcon={(c, s) => <Icon name="copy" size={s} color={c} />}
                onPress={onPaste}
              />
            </View>
          </Card>
        </>
      )}
    </Screen>
  );
}

/** จุดบอกขั้นตอน — now = ส้ม (กำลังทำ), done = เขียว ✓, idle = จาง */
function StepDot({ n, state }: { n: 1 | 2; state: 'now' | 'done' | 'idle' }) {
  const t = useTokens();
  const bg = state === 'now' ? ACCENT : state === 'done' ? GREEN : t.chip;
  return (
    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      {state === 'done' ? (
        <Icon name="check" size={14} color="#FFFFFF" />
      ) : (
        <Txt size={12} num weight="bold" color={state === 'now' ? '#FFFFFF' : t.faint}>
          {n}
        </Txt>
      )}
    </View>
  );
}

interface CellProps {
  date: string;
  cats: CatId[]; // จุดสีหมวด (โชว์เมื่อไม่มีป้ายอื่นทับ)
  inRange: boolean;
  fill: 'accent' | 'green' | null; // พื้นวงกลมเลขวัน
  ring: 'accent' | 'green' | null; // ขอบวงกลม (วันนี้ / วันที่กางอยู่ / วันต้นทางในขั้น 2)
  label: string; // ป้ายใต้เลข (จำนวนที่เลือก · "วาง" · "เริ่ม")
  labelColor: string;
  dim?: boolean;
  onPress: () => void;
}

/** ช่องวันในตาราง — โครงเดียวกับมุมมองเดือนของแท็บวันนี้ (เลขในวงกลม + จุดสีหมวดใต้เลข) */
function DayCell({ date, cats, inRange, fill, ring, label, labelColor, dim, onPress }: CellProps) {
  const t = useTokens();
  const bg = fill === 'accent' ? ACCENT : fill === 'green' ? GREEN : 'transparent';
  const border = ring === 'accent' ? ACCENT : ring === 'green' ? GREEN : 'transparent';

  return (
    <Pressable
      disabled={!inRange}
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 58,
        paddingTop: 6,
        alignItems: 'center',
        gap: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: t.line,
        opacity: dim ? 0.4 : 1,
      }}>
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bg,
          borderWidth: border === 'transparent' ? 0 : 1.5,
          borderColor: border,
        }}>
        <Txt size={14} num weight={fill || ring ? 'bold' : 'reg'} color={fill ? '#FFFFFF' : inRange ? t.ink : t.faint}>
          {fromISO(date).getDate()}
        </Txt>
      </View>

      {label ? (
        <Txt size={9} num weight="bold" color={labelColor}>
          {label}
        </Txt>
      ) : (
        <View style={{ flexDirection: 'row', gap: 3, minHeight: 6, alignItems: 'center' }}>
          {cats.map((cid) => (
            <View key={cid} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: CAT_BY_ID[cid].color }} />
          ))}
        </View>
      )}
    </Pressable>
  );
}
