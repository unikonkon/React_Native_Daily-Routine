// คัดลอกกิจกรรม (ตั้งค่า → การจัดการ) — วิซาร์ด 2 ขั้น ใช้ตารางเดือนตัวเดียวสลับโหมด
//   ① ต้นทาง: เลื่อนหาเดือน → แตะวัน → ติ๊กกิจกรรม (สะสมข้ามวันได้) · "เลือกทั้งวัน" ได้ในกดเดียว
//   ② ปลายทาง: ตารางเดิมเปลี่ยนเป็นโหมดเลือกวัน (หลายวันได้) + ทางลัด +1/+2 สัปดาห์ · +1 เดือน
// การวาง = สร้าง Activity ใหม่แบบครั้งเดียว (repeat 'none') ที่วันปลายทาง — ไม่แตะของเดิม
// และไม่สืบทอดสถานะรายวัน (done/skipped อยู่คนละตาราง) ของใหม่จึงเริ่มที่ planned เสมอ
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { StepBtn } from '@/components/today/parts';
import { Btn, Card, Chip, ChipRow, PriBadge, Txt, useTokens } from '@/components/ui';
import { ACCENT, CAT_BY_ID, DANGER, GREEN } from '@/constants/theme';
import { MONTH_TH_FULL, WD_TH, addDays, beYear, fmtRange, fromISO, mondayOf, thaiDate, toISO, todayISO } from '@/lib/dates';
import { conflictsOn } from '@/lib/engine';
import type { DayItem } from '@/lib/types';
import { useActivities, useDayReader } from '@/stores/activities';
import { useUI } from '@/stores/ui';

/** คีย์ประจำ occurrence (ชุดทำซ้ำใช้ id เดียวกันหลายวัน จึงต้องมีวันในคีย์ด้วย) */
const keyOf = (it: DayItem) => `${it.id}:${it.date}`;

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
  const showToast = useUI((s) => s.showToast);

  const [step, setStep] = useState<1 | 2>(1);
  const [ym, setYm] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [openDay, setOpenDay] = useState<string | null>(todayISO()); // วันที่กางรายการอยู่ (ขั้น 1)
  const [picked, setPicked] = useState<DayItem[]>([]); // กิจกรรมต้นทางที่เลือกไว้ (ข้ามวันได้)
  const [targets, setTargets] = useState<string[]>([]); // วันปลายทาง
  const [busy, setBusy] = useState(false);

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

  // ---------- ขั้น 1: เลือกต้นทาง ----------
  const pickedKeys = new Set(picked.map(keyOf));
  const srcDates = [...new Set(picked.map((p) => p.date))].sort();
  const openItems = openDay ? [...getDay(openDay)].sort((a, b) => a.startMin - b.startMin) : [];
  const openAllPicked = openItems.length > 0 && openItems.every((i) => pickedKeys.has(keyOf(i)));

  const toggleItem = (it: DayItem) =>
    setPicked((cur) => (cur.some((x) => keyOf(x) === keyOf(it)) ? cur.filter((x) => keyOf(x) !== keyOf(it)) : [...cur, it]));

  // เลือก/ล้างทั้งวัน — ปุ่มเดียวสลับตามสถานะปัจจุบันของวันนั้น
  const toggleOpenDay = () => {
    if (!openDay) return;
    setPicked((cur) => {
      const rest = cur.filter((x) => x.date !== openDay);
      return openAllPicked ? rest : [...rest, ...openItems];
    });
  };

  // ---------- ขั้น 2: เลือกปลายทาง ----------
  const toggleTarget = (d: string) => setTargets((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  const anchor = srcDates[0] ?? todayISO(); // วันต้นทางแรก — ฐานของทางลัด
  const shortcuts = [
    { label: '+1 สัปดาห์', date: addDays(anchor, 7) },
    { label: '+2 สัปดาห์', date: addDays(anchor, 14) },
    { label: '+1 เดือน', date: addMonth(anchor) },
  ];

  const total = picked.length * targets.length;
  // วันปลายทางที่มีเวลาชนกับของเดิม (เตือนอย่างเดียว ไม่บล็อก — เหมือนหน้าเพิ่มกิจกรรม)
  const clashDays = targets.filter((d) => {
    const items = getDay(d);
    return picked.some((p) => conflictsOn(items, p.startMin, p.endMin).length > 0);
  });

  const onPaste = async () => {
    if (!total || busy) return;
    setBusy(true);
    try {
      const order = [...picked].sort((a, b) => a.startMin - b.startMin);
      for (const date of [...targets].sort()) {
        for (const it of order) {
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
            startDate: date,
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
      const days = targets.length;
      setPicked([]);
      setTargets([]);
      setStep(1);
      showToast(`คัดลอกแล้ว ${n} รายการ ลง ${days} วัน ✓`);
    } catch {
      showToast('คัดลอกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="คัดลอกกิจกรรม" subtitle={step === 1 ? 'ขั้นที่ 1 จาก 2 · เลือกต้นทาง' : 'ขั้นที่ 2 จาก 2 · เลือกวันปลายทาง'} back>
      {/* หัวขั้นตอน — เลขวงกลม/✓ แบบเดียวกับฟอร์มเพิ่มกิจกรรม */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <StepDot n={1} state={step === 1 ? 'now' : 'done'} />
        <Txt size={14} weight="bold" color={step === 1 ? t.ink : t.sub} style={{ flex: 1 }}>
          {picked.length ? `เลือกไว้ ${picked.length} รายการ · ${srcDates.length} วัน` : 'เลือกกิจกรรมที่จะคัดลอก'}
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

        {/* ตาราง — ขั้น 1 แตะเพื่อกางรายการ · ขั้น 2 แตะเพื่อเลือก/ถอนวันปลายทาง
            ห่อทุกแถวไว้ใน View เดียว ไม่ให้ gap ของ Card แทรกระหว่างแถวปฏิทิน */}
        <View style={{ marginTop: -4 }}>
          {Array.from({ length: gridDays.length / 7 }, (_, r) => (
            <View key={r} style={{ flexDirection: 'row' }}>
              {gridDays.slice(r * 7, r * 7 + 7).map((d) => (
                <DayCell
                  key={d}
                  date={d}
                  items={inRange(d) ? getDay(d) : []}
                  inRange={inRange(d)}
                  step={step}
                  open={step === 1 && d === openDay}
                  pickedCount={picked.filter((p) => p.date === d).length}
                  isTarget={targets.includes(d)}
                  isSource={srcDates.includes(d)}
                  onPress={() => (step === 1 ? setOpenDay(d) : toggleTarget(d))}
                />
              ))}
            </View>
          ))}
        </View>
      </Card>

      {step === 1 ? (
        <>
          {/* รายการของวันที่กางอยู่ — ติ๊กทีละรายการ หรือเลือกทั้งวันในกดเดียว */}
          {openDay ? (
            <Card style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Txt size={14} weight="bold" style={{ flex: 1 }}>
                  {thaiDate(openDay)}
                </Txt>
                {openItems.length ? (
                  <Chip small icon={openAllPicked ? 'x' : 'check'} label={openAllPicked ? 'ล้างทั้งวัน' : 'เลือกทั้งวัน'} onPress={toggleOpenDay} />
                ) : null}
              </View>

              {openItems.length === 0 ? (
                <Txt size={13} color={t.faint}>
                  ไม่มีกิจกรรมในวันนี้
                </Txt>
              ) : (
                openItems.map((it, i) => {
                  const on = pickedKeys.has(keyOf(it));
                  const cat = CAT_BY_ID[it.cat];
                  return (
                    <Pressable
                      key={keyOf(it)}
                      onPress={() => toggleItem(it)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 9,
                        paddingVertical: 8,
                        borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                        borderTopColor: t.line,
                      }}>
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
              {picked.length ? `เลือกไว้ ${picked.length} รายการ จาก ${srcDates.length} วัน` : 'แตะวันบนตาราง แล้วติ๊กกิจกรรมที่จะคัดลอก'}
            </Txt>
            <Btn label="ถัดไป" disabled={!picked.length} onPress={() => setStep(2)} renderIcon={(c, s) => <Icon name="chevR" size={s} color={c} />} />
          </Card>
        </>
      ) : (
        <>
          {/* สรุปสิ่งที่จะวาง + แก้ไขได้ด้วยการย้อนกลับ */}
          <Card style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Txt size={14} weight="bold" style={{ flex: 1 }}>
                จะคัดลอก {picked.length} รายการ
              </Txt>
              <Chip small icon="edit" label="แก้รายการ" onPress={() => setStep(1)} />
            </View>
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
          </Card>

          {/* ทางลัดจากวันต้นทางแรก + วันที่เลือกไว้ */}
          <Card style={{ gap: 8 }}>
            <Txt size={13} weight="med" color={t.sub}>
              ทางลัด (นับจาก {thaiDate(anchor)})
            </Txt>
            <ChipRow>
              {shortcuts.map((s) => (
                <Chip key={s.label} small label={s.label} active={targets.includes(s.date)} color={GREEN} onPress={() => toggleTarget(s.date)} />
              ))}
              {targets.length ? <Chip small icon="x" label="ล้างวันที่เลือก" onPress={() => setTargets([])} /> : null}
            </ChipRow>
            <Txt size={12} color={t.faint}>
              {targets.length ? `ปลายทาง: ${[...targets].sort().map(thaiDate).join(' · ')}` : 'แตะวันบนตารางด้านบนเพื่อเลือกวันปลายทาง (เลือกได้หลายวัน)'}
            </Txt>
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
              {total ? `${picked.length} รายการ × ${targets.length} วัน = สร้างใหม่ ${total} รายการ` : 'ยังไม่ได้เลือกวันปลายทาง'}
            </Txt>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn style={{ flex: 1 }} kind="ghost" label="ย้อนกลับ" disabled={busy} onPress={() => setStep(1)} />
              <Btn
                style={{ flex: 1 }}
                kind="green"
                label={busy ? 'กำลังวาง…' : `วาง ${total || ''} รายการ`.trim()}
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
  items: DayItem[];
  inRange: boolean;
  step: 1 | 2;
  open: boolean; // ขั้น 1: วันที่กางรายการอยู่
  pickedCount: number; // ขั้น 1: จำนวนที่ติ๊กไว้ในวันนั้น
  isTarget: boolean; // ขั้น 2: เลือกเป็นวันปลายทาง
  isSource: boolean; // วันที่มีรายการต้นทางถูกเลือก (โชว์จุดส้มในขั้น 2)
  onPress: () => void;
}

/** ช่องวันในตาราง — โครงเดียวกับมุมมองเดือนของแท็บวันนี้ (เลขในวงกลม + จุดสีหมวดใต้เลข) */
function DayCell({ date, items, inRange, step, open, pickedCount, isTarget, isSource, onPress }: CellProps) {
  const t = useTokens();
  const isToday = date === todayISO();
  const cats = [...new Set(items.map((i) => i.cat))].slice(0, 4);
  // ขั้น 2 — วันที่ไม่ได้เลือกจางลงให้ปลายทางเด่น
  const dim = step === 2 && inRange && !isTarget;

  let ring = 'transparent';
  if (open) ring = ACCENT;
  else if (step === 2 && isSource) ring = ACCENT + '80';

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
          backgroundColor: isTarget ? GREEN : isToday ? ACCENT : 'transparent',
          borderWidth: ring === 'transparent' ? 0 : 1.5,
          borderColor: ring,
        }}>
        <Txt size={14} num weight={isTarget || isToday || open ? 'bold' : 'reg'} color={isTarget || isToday ? '#FFFFFF' : inRange ? t.ink : t.faint}>
          {fromISO(date).getDate()}
        </Txt>
      </View>

      {/* ขั้น 1: จำนวนที่ติ๊กในวันนั้น (ถ้ามี) แทนจุดสีหมวด — เห็นได้ทันทีว่าหยิบไปกี่รายการ */}
      {pickedCount > 0 && step === 1 ? (
        <Txt size={10} num weight="bold" color={ACCENT}>
          ✓{pickedCount}
        </Txt>
      ) : isTarget ? (
        <Txt size={9.5} weight="bold" color={GREEN}>
          วาง
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
