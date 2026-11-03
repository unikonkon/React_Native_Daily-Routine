// ลบรายการ (ระบบ B1) — เลือกลบได้ 4 แบบ: ทีละรายการ · ทั้งวัน · ทั้งสัปดาห์ · ทั้งเดือน
// ชุดทำซ้ำ = ยกเลิกเฉพาะวันที่เลือก (ชุดยังอยู่) · ครั้งเดียว = ลบทั้งรายการ · ลบแล้วมี toast "เลิกทำ"
// แถบล่าง: ‹ กลับ + ลบ n รายการ (กดแล้วขึ้นการ์ดสรุปผล → กดยืนยันอีกครั้ง)
// ต่างจาก "ล้างข้อมูลเก่า" (manage) ที่ลบถาวรจากฐานข้อมูลเพื่อคืนพื้นที่
import React, { useMemo, useRef, useState } from 'react';
import { Pressable, View, type ScrollViewInstance } from 'react-native';

import { Screen } from '@/components/screen';
import { SvgIcon } from '@/components/svg-icon';
import { Btn, Segmented, Txt, useTokens } from '@/components/ui';
import { CAT_BY_ID } from '@/constants/theme';
import { MONTH_TH, MONTH_TH_FULL, WD_TH, addDays, beYear, fmtMin, fromISO, mondayOf, thaiDate, toISO, todayISO } from '@/lib/dates';
import type { DayItem } from '@/lib/types';
import { useActivities, useDayReader } from '@/stores/activities';
import { useUI } from '@/stores/ui';

type Mode = 'item' | 'day' | 'week' | 'month';
const keyOf = (it: Pick<DayItem, 'id' | 'date'>) => `${it.id}:${it.date}`;
const REPEAT_SHORT: Record<string, string> = { daily: 'ทุกวัน', weekday: 'จ–ศ', weekend: 'ส–อา', custom: 'เลือกวันเอง' };

/** วันทั้งหมดของเดือน (ym = 'YYYY-MM') */
function monthDays(ym: string): string[] {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return Array.from({ length: last }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`);
}
const weekDays = (mon: string) => Array.from({ length: 7 }, (_, i) => addDays(mon, i));
/** "3–9 พ.ย." / "29 ธ.ค. – 4 ม.ค." */
function weekLabel(mon: string): string {
  const a = fromISO(mon);
  const b = fromISO(addDays(mon, 6));
  return a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${MONTH_TH[b.getMonth()]}` : `${a.getDate()} ${MONTH_TH[a.getMonth()]} – ${b.getDate()} ${MONTH_TH[b.getMonth()]}`;
}

export default function DeleteScreen() {
  const t = useTokens();
  const getDay = useDayReader();
  const deleteMany = useActivities((s) => s.deleteMany);
  const showToast = useUI((s) => s.showToast);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const today = todayISO();

  const [mode, setMode] = useState<Mode>('item');
  const [ym, setYm] = useState(() => today.slice(0, 7)); // เดือนที่ดูอยู่ (item/day/week)
  const [year, setYear] = useState(() => Number(today.slice(0, 4))); // ปีที่ดูอยู่ (month)
  const [focusDay, setFocusDay] = useState(today); // วันที่เปิดดูรายการ (ทีละรายการ)
  const [items, setItems] = useState<string[]>([]); // key id:date
  const [days, setDays] = useState<string[]>([]);
  const [weeks, setWeeks] = useState<string[]>([]); // วันจันทร์
  const [months, setMonths] = useState<string[]>([]); // YYYY-MM
  const [confirmFor, setConfirmFor] = useState<string | null>(null);

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const clearAll = () => {
    setItems([]);
    setDays([]);
    setWeeks([]);
    setMonths([]);
  };

  // รายการที่จะโดนลบ ตามแบบที่เลือกอยู่ (อ่านสดจากข้อมูลปัจจุบัน)
  const targets = useMemo((): DayItem[] => {
    if (mode === 'item') {
      return items
        .map((k) => {
          const [id, date] = [Number(k.split(':')[0]), k.split(':')[1]];
          return getDay(date).find((x) => x.id === id);
        })
        .filter((x): x is DayItem => !!x);
    }
    const dates = mode === 'day' ? days : mode === 'week' ? weeks.flatMap(weekDays) : months.flatMap(monthDays);
    return [...new Set(dates)].flatMap((d) => getDay(d));
  }, [mode, items, days, weeks, months, getDay]);

  const picks = mode === 'item' ? items.length : mode === 'day' ? days.length : mode === 'week' ? weeks.length : months.length;
  const unit = mode === 'item' ? 'รายการ' : mode === 'day' ? 'วัน' : mode === 'week' ? 'สัปดาห์' : 'เดือน';
  // การ์ดยืนยันผูกกับชุดที่เลือก — เปลี่ยนการเลือกแล้วต้องกดลบใหม่
  const selKey = `${mode}|${targets.map(keyOf).join(',')}`;
  const confirming = confirmFor === selKey && targets.length > 0;

  const repeatN = targets.filter((x) => x.repeat !== 'none').length;
  const doneN = targets.filter((x) => x.ostatus === 'done' || x.ostatus === 'skipped').length;

  const onDelete = () => {
    if (!targets.length) return;
    if (!confirming) {
      setConfirmFor(selKey);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    const n = targets.length;
    const undo = deleteMany(targets);
    clearAll();
    setConfirmFor(null);
    showToast(`ลบแล้ว ${n} รายการ`, { label: 'เลิกทำ', run: undo });
  };

  const changeMode = (m: Mode) => {
    setMode(m);
    clearAll();
    setConfirmFor(null);
  };
  const stepMonth = (dir: 1 | -1) => {
    const [y, m] = ym.split('-').map(Number);
    setYm(toISO(new Date(y, m - 1 + dir, 1)).slice(0, 7));
  };

  return (
    <Screen
      title="ลบรายการ"
      subtitle="เลือกทีละรายการ หรือทั้งวัน · สัปดาห์ · เดือน"
      variant="sub"
      scrollRef={scrollRef}
      action={{
        label: !targets.length ? 'เลือกก่อนลบ' : confirming ? `ยืนยันลบ ${targets.length} รายการ` : `ลบ ${targets.length} รายการ`,
        icon: 'trash',
        tone: 'danger',
        disabled: !targets.length,
        onPress: onDelete,
      }}>
      <Segmented<Mode>
        options={[
          { key: 'item', label: 'ทีละรายการ' },
          { key: 'day', label: 'ทั้งวัน' },
          { key: 'week', label: 'สัปดาห์' },
          { key: 'month', label: 'เดือน' },
        ]}
        value={mode}
        onChange={changeMode}
      />

      {/* สรุปที่เลือก + ล้าง */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 }}>
        <Txt size={13} color={picks ? t.ink : t.sub} weight={picks ? 'bold' : 'reg'} style={{ flex: 1 }}>
          {picks
            ? mode === 'item'
              ? `เลือกไว้ ${picks} รายการ`
              : `เลือกไว้ ${picks} ${unit} · ${targets.length} รายการ`
            : mode === 'item'
              ? 'แตะวันบนปฏิทิน แล้วติ๊กรายการที่จะลบ'
              : mode === 'day'
                ? 'แตะวันบนปฏิทินเพื่อเลือกทั้งวัน (เลือกได้หลายวัน)'
                : mode === 'week'
                  ? 'ติ๊กสัปดาห์ที่จะลบ (เลือกได้หลายสัปดาห์)'
                  : 'ติ๊กเดือนที่จะลบ (เลือกได้หลายเดือน)'}
        </Txt>
        {picks ? (
          <Pressable accessibilityRole="button" onPress={clearAll} hitSlop={6} style={({ pressed }) => ({ height: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: pressed ? t.rail : t.track, justifyContent: 'center' })}>
            <Txt size={13} weight="med" color={t.sub}>
              ล้างที่เลือก
            </Txt>
          </Pressable>
        ) : null}
      </View>

      {confirming ? (
        <View style={{ backgroundColor: t.card, borderRadius: 16, borderWidth: 1.5, borderColor: t.warn, padding: 14, gap: 8 }}>
          <Txt size={15} weight="bold">
            ลบ {targets.length} รายการ?
          </Txt>
          {repeatN ? <Bullet text={`ชุดทำซ้ำ ${repeatN} รายการ — ลบเฉพาะวันที่เลือก วันอื่นของชุดยังอยู่`} /> : null}
          {targets.length - repeatN ? <Bullet text={`ครั้งเดียว ${targets.length - repeatN} รายการ — ลบทั้งรายการ`} /> : null}
          {doneN ? <Bullet warn text={`บันทึกแล้ว (ทำแล้ว/ข้าม) ${doneN} รายการ — สถิติของวันนั้นจะหายไปด้วย`} /> : null}
          <Txt size={12.5} color={t.sub}>
            ลบแล้วกด “เลิกทำ” ได้ภายในไม่กี่วินาที · กดปุ่มแดงด้านล่างอีกครั้งเพื่อยืนยัน
          </Txt>
          <Btn kind="ghost" label="ไม่ลบ" onPress={() => setConfirmFor(null)} />
        </View>
      ) : null}

      {mode === 'month' ? (
        <>
          <PeriodNav label={`พ.ศ. ${beYear(year)}`} onPrev={() => setYear(year - 1)} onNext={() => setYear(year + 1)} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
            {Array.from({ length: 12 }, (_, m) => {
              const k = `${year}-${String(m + 1).padStart(2, '0')}`;
              const n = monthDays(k).reduce((a, d) => a + getDay(d).length, 0);
              return (
                <View key={k} style={{ width: '50%', padding: 4 }}>
                  <PickCard on={months.includes(k)} disabled={!n} title={MONTH_TH_FULL[m]} sub={n ? `${n} รายการ` : 'ไม่มีรายการ'} onPress={() => setMonths(toggle(months, k))} />
                </View>
              );
            })}
          </View>
        </>
      ) : (
        <>
          <PeriodNav label={`${MONTH_TH_FULL[Number(ym.slice(5)) - 1]} ${beYear(Number(ym.slice(0, 4)))}`} onPrev={() => stepMonth(-1)} onNext={() => stepMonth(1)} />
          {mode === 'week' ? (
            <View style={{ gap: 8 }}>
              {weeksOf(ym).map((mon) => {
                const n = weekDays(mon).reduce((a, d) => a + getDay(d).length, 0);
                return (
                  <PickCard
                    key={mon}
                    on={weeks.includes(mon)}
                    disabled={!n}
                    title={weekLabel(mon)}
                    sub={n ? `${n} รายการ${mon <= today && today <= addDays(mon, 6) ? ' · สัปดาห์นี้' : ''}` : 'ไม่มีรายการ'}
                    onPress={() => setWeeks(toggle(weeks, mon))}
                  />
                );
              })}
            </View>
          ) : (
            <DayGrid
              ym={ym}
              today={today}
              countOf={(d) => getDay(d).length}
              // ทั้งวัน: แตะ = เลือก/เอาออก · ทีละรายการ: แตะ = เปิดดูรายการของวันนั้น
              isOn={(d) => (mode === 'day' ? days.includes(d) : false)}
              isFocus={(d) => mode === 'item' && d === focusDay}
              pickedOf={(d) => (mode === 'item' ? items.filter((k) => k.endsWith(`:${d}`)).length : 0)}
              onPress={(d) => (mode === 'day' ? setDays(toggle(days, d)) : setFocusDay(d))}
            />
          )}

          {mode === 'item' ? <DayItems date={focusDay} items={getDay(focusDay)} picked={items} onToggle={(k) => setItems(toggle(items, k))} onSetAll={(keys, on) => setItems(on ? [...new Set([...items, ...keys])] : items.filter((k) => !keys.includes(k)))} /> : null}
        </>
      )}
    </Screen>
  );
}

/** วันจันทร์ของทุกสัปดาห์ที่คาบเกี่ยวเดือนนี้ */
function weeksOf(ym: string): string[] {
  const days = monthDays(ym);
  const out: string[] = [];
  for (let m = mondayOf(days[0]); m <= days[days.length - 1]; m = addDays(m, 7)) out.push(m);
  return out;
}

function Bullet({ text, warn }: { text: string; warn?: boolean }) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Txt size={13} color={warn ? t.warn : t.sub}>
        •
      </Txt>
      <Txt size={13} weight={warn ? 'bold' : 'reg'} color={warn ? t.warn : t.ink} style={{ flex: 1, lineHeight: 19 }}>
        {text}
      </Txt>
    </View>
  );
}

function PeriodNav({ label, onPrev, onNext }: { label: string; onPrev: () => void; onNext: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <NavCircle icon="chevL" onPress={onPrev} a11y="ก่อนหน้า" />
      <Txt size={15} weight="bold" style={{ flex: 1, textAlign: 'center' }}>
        {label}
      </Txt>
      <NavCircle icon="chevR" onPress={onNext} a11y="ถัดไป" />
    </View>
  );
}

function NavCircle({ icon, onPress, a11y }: { icon: string; onPress: () => void; a11y: string }) {
  const t = useTokens();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: pressed ? t.rail : t.track, alignItems: 'center', justifyContent: 'center' })}>
      <SvgIcon name={icon} size={18} color={t.ink} strokeWidth={2.2} />
    </Pressable>
  );
}

/** การ์ดเลือก (สัปดาห์/เดือน) — ติ๊กแล้วกรอบแดง */
function PickCard({ on, disabled, title, sub, onPress }: { on: boolean; disabled?: boolean; title: string; sub: string; onPress: () => void }) {
  const t = useTokens();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled: !!disabled }}
      accessibilityLabel={`${title} ${sub}`}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 60,
        paddingHorizontal: 14,
        borderRadius: 16,
        backgroundColor: t.card,
        borderWidth: 1.5,
        borderColor: on ? t.warn : 'transparent',
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        shadowColor: '#221C13',
        shadowOpacity: 0.06,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
      })}>
      <Check on={on} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt size={14.5} weight="bold">
          {title}
        </Txt>
        <Txt size={12.5} color={t.sub}>
          {sub}
        </Txt>
      </View>
    </Pressable>
  );
}

function Check({ on }: { on: boolean }) {
  const t = useTokens();
  return (
    <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: on ? 0 : 2, borderColor: t.railDash, backgroundColor: on ? t.warn : t.card, alignItems: 'center', justifyContent: 'center' }}>
      {on ? <SvgIcon name="check" size={15} color="#FFFFFF" strokeWidth={3} /> : null}
    </View>
  );
}

/** ปฏิทินเดือน — ตัวเลขวัน + จำนวนรายการ · ทั้งวัน: ช่องที่เลือก = แดง · ทีละรายการ: วันที่เปิดดู = วงเข้ม, มีติ๊กไว้ = จุดแดง */
function DayGrid({
  ym,
  today,
  countOf,
  isOn,
  isFocus,
  pickedOf,
  onPress,
}: {
  ym: string;
  today: string;
  countOf: (d: string) => number;
  isOn: (d: string) => boolean;
  isFocus: (d: string) => boolean;
  pickedOf: (d: string) => number;
  onPress: (d: string) => void;
}) {
  const t = useTokens();
  const start = mondayOf(`${ym}-01`);
  return (
    <View style={{ backgroundColor: t.card, borderRadius: 16, padding: 8, shadowColor: '#221C13', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}>
      <View style={{ flexDirection: 'row', paddingBottom: 4 }}>
        {WD_TH.map((w) => (
          <Txt key={w} size={11.5} color={t.sub} style={{ flex: 1, textAlign: 'center' }}>
            {w}
          </Txt>
        ))}
      </View>
      {Array.from({ length: 6 }, (_, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {Array.from({ length: 7 }, (_, c) => {
            const d = addDays(start, r * 7 + c);
            const inMonth = d.slice(0, 7) === ym;
            if (!inMonth) return <View key={d} style={{ flex: 1, height: 54 }} />;
            const n = countOf(d);
            const on = isOn(d);
            const focus = isFocus(d);
            const picked = pickedOf(d);
            return (
              <Pressable
                key={d}
                accessibilityRole="button"
                accessibilityState={{ selected: on || focus }}
                accessibilityLabel={`${thaiDate(d)} · ${n} รายการ${picked ? ` · ติ๊กไว้ ${picked}` : ''}`}
                disabled={!n && !focus}
                onPress={() => onPress(d)}
                style={{ flex: 1, height: 54, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: on ? t.warn : focus ? t.ink : 'transparent',
                    borderWidth: d === today && !on && !focus ? 1.5 : 0,
                    borderColor: '#D2603A',
                  }}>
                  <Txt size={14.5} num weight={on || focus ? 'bold' : 'reg'} color={on ? '#FFFFFF' : focus ? t.bg : n ? t.ink : t.faint}>
                    {fromISO(d).getDate()}
                  </Txt>
                </View>
                <Txt size={10.5} num weight={picked ? 'bold' : 'reg'} color={picked ? t.warn : t.muted}>
                  {picked ? `✓${picked}` : n ? `${n}` : ' '}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** รายการของวันที่เปิดดู — ติ๊กทีละรายการ หรือเลือกทั้งหมดของวันนั้น */
function DayItems({ date, items, picked, onToggle, onSetAll }: { date: string; items: DayItem[]; picked: string[]; onToggle: (k: string) => void; onSetAll: (keys: string[], on: boolean) => void }) {
  const t = useTokens();
  const keys = items.map(keyOf);
  const allOn = keys.length > 0 && keys.every((k) => picked.includes(k));
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 }}>
        <Txt size={13} weight="bold" color={t.sub} style={{ flex: 1 }}>
          {thaiDate(date)}
          {date === todayISO() ? ' · วันนี้' : ''}
        </Txt>
        {items.length ? (
          <Pressable accessibilityRole="button" onPress={() => onSetAll(keys, !allOn)} hitSlop={6} style={{ minHeight: 36, justifyContent: 'center' }}>
            <Txt size={13} weight="bold" color={t.accentInk}>
              {allOn ? 'เอาออกทั้งหมด' : 'เลือกทั้งวัน'}
            </Txt>
          </Pressable>
        ) : null}
      </View>
      <View style={{ backgroundColor: t.card, borderRadius: 16, overflow: 'hidden', shadowColor: '#221C13', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}>
        {items.length ? (
          items.map((it, i) => {
            const k = keyOf(it);
            const on = picked.includes(k);
            const cat = CAT_BY_ID[it.cat];
            const status = it.ostatus === 'done' ? 'ทำแล้ว' : it.ostatus === 'skipped' ? 'ข้าม' : it.ostatus === 'rescheduled' ? 'เลื่อนไปแล้ว' : '';
            const meta = [cat.short, it.repeat !== 'none' ? `ชุด${REPEAT_SHORT[it.repeat] ?? 'ทำซ้ำ'}` : 'ครั้งเดียว', status].filter(Boolean).join(' · ');
            return (
              <Pressable
                key={k}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${fmtMin(it.startMin)} ${it.title} ${meta}`}
                onPress={() => onToggle(k)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  minHeight: 60,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderBottomWidth: i === items.length - 1 ? 0 : 1,
                  borderBottomColor: t.line,
                  backgroundColor: on ? 'rgba(163,63,31,0.07)' : pressed ? t.track : 'transparent',
                })}>
                <Check on={on} />
                <View style={{ width: 44 }}>
                  <Txt size={13} num>
                    {fmtMin(it.startMin)}
                  </Txt>
                  <Txt size={11} num color={t.muted}>
                    {fmtMin(it.endMin)}
                  </Txt>
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Txt size={14.5} weight="med" numberOfLines={2} style={{ lineHeight: 20 }}>
                    {it.title}
                  </Txt>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 2, alignSelf: 'stretch', borderRadius: 1, backgroundColor: cat.color }} />
                    <Txt size={12} color={t.sub} numberOfLines={1} style={{ flex: 1 }}>
                      {meta}
                    </Txt>
                  </View>
                </View>
              </Pressable>
            );
          })
        ) : (
          <Txt size={13} color={t.faint} style={{ textAlign: 'center', padding: 18 }}>
            ไม่มีรายการในวันนี้ — แตะวันอื่นบนปฏิทิน
          </Txt>
        )}
      </View>
    </View>
  );
}
