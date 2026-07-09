// แท็บ 2 — เพิ่ม/แก้ไขกิจกรรม: วิซาร์ด 2 ขั้น (APP_STRUCTURE.md §4)
// ขั้น 1 เลือกหมวด+รายละเอียด → ขั้น 2 วันเวลา+ทำซ้ำ+พรีวิว+แจ้งเตือน
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { ACCENT, CATS, FONT, GREEN, PRI, QUICK_PICKS, SNAP, type CatId } from '@/constants/theme';
import { Icon } from '@/components/icon';
import { MonthGrid } from '@/components/month-grid';
import { MonthYearPicker } from '@/components/month-year-picker';
import { Screen } from '@/components/screen';
import { Btn, Card, Chip, ChipRow, Toggle, Txt, useTokens } from '@/components/ui';
import { MONTH_TH_FULL, addDays, beYear, fmtMin, fromISO, hoursText, thaiDate } from '@/lib/dates';
import { conflictsOn, freeSlots, maskFromDates } from '@/lib/engine';
import { DAY_END, DAY_START } from '@/constants/theme';
import { HORIZON_DAYS, type Horizon, type RepeatRule } from '@/lib/types';
import { getDay, useActivities } from '@/stores/activities';
import { useContacts } from '@/stores/contacts';
import { useDraft } from '@/stores/draft';
import { useUI } from '@/stores/ui';

const REPEATS: { key: RepeatRule; label: string }[] = [
  { key: 'none', label: 'ครั้งเดียว' },
  { key: 'daily', label: 'ทุกวัน' },
  { key: 'weekday', label: 'จ–ศ' },
  { key: 'weekend', label: 'ส–อา' },
  { key: 'custom', label: 'เลือกเอง' },
];

const HORIZONS: { key: Horizon; label: string }[] = [
  { key: '1w', label: '1 สัปดาห์' },
  { key: '2w', label: '2 สัปดาห์' },
  { key: '1m', label: '1 เดือน' },
  { key: '6m', label: '6 เดือน' },
  { key: '1y', label: '1 ปี' },
];

export default function AddScreen() {
  const d = useDraft();
  return (
    <Screen title={d.editId ? 'แก้ไขกิจกรรม' : 'เพิ่มกิจกรรม'} subtitle={`ขั้นที่ ${d.step} จาก 2`}>
      <StepDots step={d.step} />
      {d.step === 1 ? <Step1 /> : <Step2 />}
    </Screen>
  );
}

function StepDots({ step }: { step: number }) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
      {[1, 2].map((s) => (
        <View key={s} style={{ width: s === step ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: s === step ? ACCENT : t.line2 }} />
      ))}
    </View>
  );
}

// ---------- ขั้นที่ 1 ----------

function Step1() {
  const t = useTokens();
  const d = useDraft();
  const showToast = useUI((s) => s.showToast);
  const contacts = useContacts((s) => s.list);
  const upsertContact = useContacts((s) => s.upsert);
  const [newName, setNewName] = useState('');
  const [addingContact, setAddingContact] = useState(false);

  const next = () => {
    if (!d.cat) return showToast('เลือกหมวดก่อน');
    if (!d.title.trim()) return showToast('ใส่ชื่อกิจกรรม');
    d.set({ step: 2 });
  };

  return (
    <>
      <Txt size={14} weight="med" color={t.sub}>เลือกหมวดของกิจกรรม</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {CATS.map((c) => {
          const active = d.cat === c.id;
          return (
            <Pressable
              key={c.id}
              onPress={() => d.set({ cat: c.id })}
              style={{
                width: '47.5%',
                padding: 14,
                borderRadius: 18,
                backgroundColor: active ? c.color + '22' : t.card,
                borderWidth: 1.5,
                borderColor: active ? c.color : t.line,
                gap: 8,
              }}>
              <Icon name={c.icon} size={22} color={c.color} />
              <Txt size={13} weight="med">{c.name}</Txt>
            </Pressable>
          );
        })}
      </View>

      {d.cat ? (
        <Card style={{ gap: 12 }}>
          <TextInput
            value={d.title}
            onChangeText={(title) => d.set({ title })}
            placeholder="พิมพ์ชื่อ…"
            placeholderTextColor={t.faint}
            style={{ backgroundColor: t.card2, borderRadius: 12, borderWidth: 1, borderColor: t.line, padding: 12, color: t.ink, fontFamily: FONT.uiMed, fontSize: 15 }}
          />
          <ChipRow>
            {QUICK_PICKS[d.cat].map((q) => (
              <Chip key={q} small label={q} active={d.title === q} onPress={() => d.set({ title: q })} />
            ))}
          </ChipRow>

          {d.cat === 'work' ? (
            <>
              <Txt size={13} weight="med" color={t.sub}>สถานที่</Txt>
              <ChipRow>
                {['ออฟฟิศ', 'บ้าน (WFH)', 'ลูกค้า'].map((l) => (
                  <Chip key={l} small label={l} active={d.loc === l} onPress={() => d.set({ loc: d.loc === l ? '' : l })} />
                ))}
              </ChipRow>
            </>
          ) : null}

          {d.cat === 'ex' ? (
            <>
              <Txt size={13} weight="med" color={t.sub}>ประเภท</Txt>
              <ChipRow>
                {[
                  { k: 'weight', l: 'เวท' },
                  { k: 'cardio', l: 'คาร์ดิโอ' },
                  { k: 'class', l: 'คลาส' },
                ].map((s) => (
                  <Chip key={s.k} small label={s.l} active={d.sub === s.k} onPress={() => d.set({ sub: d.sub === s.k ? '' : s.k })} />
                ))}
              </ChipRow>
            </>
          ) : null}

          {d.cat === 'learn' ? (
            <>
              <Txt size={13} weight="med" color={t.sub}>สื่อ</Txt>
              <ChipRow>
                {[
                  { k: 'book', l: 'หนังสือ' },
                  { k: 'audio', l: 'เสียง/พอดแคสต์' },
                ].map((s) => (
                  <Chip key={s.k} small label={s.l} active={d.sub === s.k} onPress={() => d.set({ sub: d.sub === s.k ? '' : s.k })} />
                ))}
              </ChipRow>
            </>
          ) : null}
        </Card>
      ) : null}

      {d.cat === 'case' ? (
        <Card style={{ gap: 12 }}>
          <Txt size={13} weight="med" color={t.sub}>คนที่นัด</Txt>
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
            <Chip small label="+ เพิ่ม" onPress={() => setAddingContact(true)} />
          </ChipRow>
          {addingContact ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="ชื่อรายชื่อใหม่…"
                placeholderTextColor={t.faint}
                style={{ flex: 1, backgroundColor: t.card2, borderRadius: 12, borderWidth: 1, borderColor: t.line, padding: 10, color: t.ink, fontFamily: FONT.ui, fontSize: 14 }}
              />
              <Btn
                label="เพิ่ม"
                onPress={async () => {
                  const name = newName.trim();
                  if (!name) return;
                  await upsertContact({ name, priority: 'P6', phone: null, line: null });
                  setNewName('');
                  setAddingContact(false);
                }}
              />
            </View>
          ) : null}

          <Txt size={13} weight="med" color={t.sub}>ระดับความสำคัญ</Txt>
          <ChipRow>
            {PRI.map((p) => (
              <Chip key={p.id} small label={p.id} color={p.color} active={d.priority === p.id} onPress={() => d.set({ priority: p.id })} />
            ))}
          </ChipRow>

          <Txt size={13} weight="med" color={t.sub}>ช่องทาง</Txt>
          <ChipRow>
            <Chip small icon="video" label="ออนไลน์" active={d.channel === 'online'} onPress={() => d.set({ channel: 'online' })} />
            <Chip small icon="mappin" label="พบตัว" active={d.channel === 'inperson'} onPress={() => d.set({ channel: 'inperson' })} />
          </ChipRow>
        </Card>
      ) : null}

      <Btn label="ถัดไป" icon="arrowR" onPress={next} />
    </>
  );
}

// ---------- ขั้นที่ 2 ----------

function Step2() {
  const t = useTokens();
  const d = useDraft();
  const router = useRouter();
  const showToast = useUI((s) => s.showToast);
  const { add, update, acts, version } = useActivities();
  useActivities((s) => s.version);

  const anchor = d.dates[0]; // draft การันตีมีอย่างน้อย 1 วันเสมอ
  const [ym, setYm] = useState(() => {
    const dt = fromISO(anchor);
    return { y: dt.getFullYear(), m: dt.getMonth() };
  });
  const [pickerOpen, setPickerOpen] = useState(false);

  const timeInvalid = d.end <= d.start;

  // วิเคราะห์การชน + พรีวิว — ตัดกิจกรรมที่กำลังแก้ไขออก
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const analysis = useMemo(() => {
    const per = d.dates.slice(0, 3).map((date) => {
      const items = getDay(date).filter((i) => i.id !== d.editId);
      return { date, items, conflicts: conflictsOn(items, d.start, d.end), slots: freeSlots(items).slice(0, 4) };
    });
    const conflictDays = d.dates.filter((date) => {
      const items = getDay(date).filter((i) => i.id !== d.editId);
      return conflictsOn(items, d.start, d.end).length > 0;
    }).length;
    return { per, conflictDays };
  }, [version, d.dates, d.start, d.end, d.editId]);

  const onSave = async () => {
    if (timeInvalid) return showToast('เวลาสิ้นสุดต้องมากกว่าเริ่ม');
    if (!d.cat) return showToast('เลือกหมวดก่อน');
    const isOnce = d.repeat === 'none';
    const startDate = d.dates[0];
    const endDate = isOnce
      ? null
      : d.repeat === 'custom'
        ? d.dates[d.dates.length - 1]
        : addDays(startDate, HORIZON_DAYS[d.horizon] - 1);

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
      startDate,
      endDate,
      notify: d.notify,
      notifyBefore: d.before,
      detachedFrom: null,
      status: 'active' as const,
      contactIds: d.cat === 'case' ? d.contactIds : [],
    };

    if (d.editId) {
      const prev = acts.find((a) => a.id === d.editId);
      update({ ...fields, id: d.editId, detachedFrom: prev?.detachedFrom ?? null });
      showToast('บันทึกการแก้ไขแล้ว ✓');
    } else {
      await add(fields);
      showToast(`เพิ่มแล้ว ${d.dates.length} วัน ✓`);
    }
    d.reset();
    router.navigate('/');
  };

  return (
    <>
      {/* เวลา */}
      <Card style={{ gap: 10 }}>
        <Txt size={13} weight="med" color={t.sub}>เวลา (ปรับทีละ 15 นาที)</Txt>
        <TimeStepper label="เริ่ม" value={d.start} onChange={(v) => d.set({ start: v })} />
        <TimeStepper label="สิ้นสุด" value={d.end} onChange={(v) => d.set({ end: v })} />
        {timeInvalid ? <Txt size={12} color="#C0392B">เวลาสิ้นสุดต้องมากกว่าเริ่ม</Txt> : null}
      </Card>

      {/* ทำซ้ำ + horizon */}
      <Card style={{ gap: 10 }}>
        <Txt size={13} weight="med" color={t.sub}>รูปแบบทำซ้ำ</Txt>
        <ChipRow>
          {REPEATS.map((r) => (
            <Chip key={r.key} small label={r.label} active={d.repeat === r.key} onPress={() => d.setRepeat(r.key)} />
          ))}
        </ChipRow>
        {d.repeat !== 'none' && d.repeat !== 'custom' ? (
          <>
            <Txt size={13} weight="med" color={t.sub}>ระยะเวลาที่ลง</Txt>
            <ChipRow>
              {HORIZONS.map((h) => (
                <Chip key={h.key} small label={h.label} active={d.horizon === h.key} onPress={() => d.setHorizon(h.key)} />
              ))}
            </ChipRow>
          </>
        ) : null}
        <Txt size={12} color={t.faint}>
          {d.repeat === 'none' ? `ลงวันเดียว: ${thaiDate(d.dates[0])}` : `รวม ${d.dates.length} วัน · เริ่ม ${thaiDate(d.dates[0])}`}
        </Txt>
      </Card>

      {/* ปฏิทินเลือกวันที่ */}
      <Card style={{ gap: 8 }}>
        <Pressable onPress={() => setPickerOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Txt size={14} weight="bold">{MONTH_TH_FULL[ym.m]} {beYear(ym.y)}</Txt>
          <Icon name="chevD" size={16} color={t.sub} />
        </Pressable>
        <MonthGrid
          year={ym.y}
          month={ym.m}
          mode="select"
          selected={d.dates}
          onPressDay={(iso) => d.toggleDate(iso)}
        />
      </Card>
      <MonthYearPicker visible={pickerOpen} year={ym.y} month={ym.m} onClose={() => setPickerOpen(false)} onPick={(y, m) => setYm({ y, m })} />

      {/* เตือนเวลาชน (ไม่บล็อก) */}
      {analysis.conflictDays > 0 ? (
        <Card style={{ borderColor: '#D2603A55', backgroundColor: '#D2603A14' }}>
          <Txt size={13} color="#D2603A" weight="med">
            ⚠ เวลาที่เลือกชนกับกิจกรรมเดิมใน {analysis.conflictDays} วัน — บันทึกต่อได้
          </Txt>
        </Card>
      ) : null}

      {/* พรีวิวรายวัน (≤3 วัน) */}
      {d.dates.length <= 3 ? (
        analysis.per.map((p) => <DayPreview key={p.date} {...p} newStart={d.start} newEnd={d.end} />)
      ) : (
        <Txt size={12} color={t.faint} style={{ textAlign: 'center' }}>
          เลือกไว้ {d.dates.length} วัน — พรีวิวรายวันแสดงเมื่อเลือกไม่เกิน 3 วัน
        </Txt>
      )}

      {/* แจ้งเตือน */}
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Txt size={14} weight="med" style={{ flex: 1 }}>แจ้งเตือน</Txt>
          <Toggle value={d.notify} onChange={(v) => d.set({ notify: v })} />
        </View>
        {d.notify ? (
          <ChipRow>
            {[15, 30, 60].map((m) => (
              <Chip key={m} small label={`${m} นาที`} active={d.before === m} onPress={() => d.set({ before: m })} />
            ))}
          </ChipRow>
        ) : null}
      </Card>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn style={{ flex: 1 }} kind="ghost" label="ย้อนกลับ" onPress={() => d.set({ step: 1 })} />
        <Btn style={{ flex: 2 }} label={d.editId ? 'บันทึกการแก้ไข' : 'บันทึกกิจกรรม'} onPress={onSave} />
      </View>
    </>
  );
}

function TimeStepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const t = useTokens();
  const step = (dir: 1 | -1) => onChange(Math.min(Math.max(value + dir * SNAP, 0), DAY_END));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Txt size={13} color={t.sub} style={{ width: 48 }}>{label}</Txt>
      <Pressable onPress={() => step(-1)} style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }}>
        <Txt size={18} color={t.sub}>−</Txt>
      </Pressable>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Txt size={20} num weight="bold">
          {fmtMin(value)}
          {value > 1440 ? ' +1' : ''}
        </Txt>
      </View>
      <Pressable onPress={() => step(1)} style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }}>
        <Txt size={18} color={t.sub}>+</Txt>
      </Pressable>
    </View>
  );
}

interface DayPreviewProps {
  date: string;
  items: ReturnType<typeof getDay>;
  conflicts: ReturnType<typeof getDay>;
  slots: { start: number; end: number }[];
  newStart: number;
  newEnd: number;
}

function DayPreview({ date, items, conflicts, slots, newStart, newEnd }: DayPreviewProps) {
  const t = useTokens();
  const span = DAY_END - DAY_START;
  const seg = (s: number, e: number) => ({
    left: `${((Math.max(s, DAY_START) - DAY_START) / span) * 100}%` as const,
    width: `${((Math.min(e, DAY_END) - Math.max(s, DAY_START)) / span) * 100}%` as const,
  });
  return (
    <Card tone="card2" style={{ gap: 8 }}>
      <Txt size={13} weight="med">{thaiDate(date)} · มีกิจกรรมเดิม {items.length} รายการ</Txt>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: t.chip, overflow: 'hidden' }}>
        {items.map((i) => (
          <View key={`${i.id}`} style={{ position: 'absolute', top: 0, bottom: 0, backgroundColor: t.faint, opacity: 0.6, ...seg(i.startMin, i.endMin) }} />
        ))}
        <View style={{ position: 'absolute', top: 0, bottom: 0, backgroundColor: ACCENT, ...seg(newStart, newEnd) }} />
      </View>
      {slots.length ? (
        <ChipRow>
          {slots.map((s) => (
            <View key={s.start} style={{ backgroundColor: GREEN + '22', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Txt size={11} num color={GREEN}>
                {fmtMin(s.start)}–{fmtMin(s.end)} ({hoursText(s.end - s.start)})
              </Txt>
            </View>
          ))}
        </ChipRow>
      ) : null}
      {conflicts.length ? (
        <Txt size={12} color="#D2603A">ชนกับ: {conflicts.map((c) => c.title).join(', ')}</Txt>
      ) : null}
    </Card>
  );
}
