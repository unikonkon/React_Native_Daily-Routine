// Smart Reschedule Modal (APP_STRUCTURE.md §3.4) — เฉพาะนัดหมวด case
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardHeight } from '@/components/note-bar';
import { WeekPicker } from '@/components/period-nav';
import { SvgIcon } from '@/components/svg-icon';
import { ToastHost } from '@/components/toast';
import { Btn, Chip, ChipRow, Txt, pressFade, useTokens } from '@/components/ui';
import { FONT, GREEN } from '@/constants/theme';
import { addDays, fmtMin, mondayOf, nowMin, shortThai, thaiDate, thaiWeekRange, todayISO } from '@/lib/dates';
import { plainTitle, rescRangeDates, rescheduleSlots, type RescCandidate, type RescRange } from '@/lib/engine';
import type { DayItem } from '@/lib/types';
import { useActivities } from '@/stores/activities';
import { useUI } from '@/stores/ui';

const RANGES: { key: RescRange; label: string }[] = [
  { key: '3d', label: 'ภายใน 3 วัน' },
  { key: 'w', label: 'สัปดาห์นี้' },
  { key: 'nw', label: 'สัปดาห์หน้า' },
];

/** filter ช่วงค้นหา: ช่วงสำเร็จรูป หรือสัปดาห์ที่เลือกเอง (week = วันจันทร์) */
type RangeSel = RescRange | { week: string };

/** ตัดช่วงว่างที่ล้ำเข้าไปในกลางดึก 01:00–06:00 — เก็บเฉพาะช่วงที่จบไม่เกิน 01:00 (24:00+60 = 1500 นาที) */
const NIGHT_CUTOFF = 1500;

export function RescheduleModal() {
  const resc = useUI((s) => s.resc);
  // นัดที่วาดอยู่ — ค้างไว้หลัง store ปิดแล้ว จนแอนิเมชันปิดเล่นจบ (Body เรียก onClosed)
  const sheet = useUI((s) => s.sheet);
  const [shown, setShown] = useState(resc);
  if (resc && resc !== shown) setShown(resc);
  // ยกเลิกแล้วกลับไปแผ่นรายละเอียด → ถอดหน้าต่างนี้ทันที ไม่เล่นปิด (Modal สองอันซ้อนช่วงสั้น ๆ เปิดไม่ขึ้นบน iOS)
  else if (!resc && shown && sheet) setShown(null);
  if (!shown) return null;
  return <Body key={`${shown.id}:${shown.date}`} item={shown} closing={!resc} onClosed={() => setShown((cur) => (useUI.getState().resc ? cur : null))} />;
}

function Body({ item, closing, onClosed }: { item: DayItem; closing: boolean; onClosed: () => void }) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const closeResc = useUI((s) => s.closeResc);
  const showToast = useUI((s) => s.showToast);
  const store = useActivities();
  const reschedule = store.reschedule;
  // ระหว่างเล่นปิด ใช้ข้อมูลชุดก่อนปิด — ยืนยันเลื่อนแล้วรายการช่วงว่างบนแผ่นไม่จัดเรียงใหม่ให้เห็น
  const [data, setData] = useState({ acts: store.acts, occ: store.occ });
  if (!closing && (data.acts !== store.acts || data.occ !== store.occ)) setData({ acts: store.acts, occ: store.occ });
  const { acts, occ } = data;

  const [reason, setReason] = useState('');
  const [range, setRange] = useState<RangeSel>('3d');
  const [weekOpen, setWeekOpen] = useState(false);
  // เลือกด้วย key "date:start" — null = ใช้ช่วงแนะนำ (คะแนนสูงสุด)
  const [pick, setPick] = useState<string | null>(null);
  const kb = useKeyboardHeight();
  const isCase = item.cat === 'case';
  const word = isCase ? 'นัด' : 'กิจกรรม';
  /** ยกเลิกการเลื่อน → กลับไปแผ่นรายละเอียดของรายการเดิม (เดิมปิดหายไปเลย ต้องแตะเปิดรายการใหม่) */
  const cancel = () => {
    closeResc();
    useUI.getState().openSheet(item.id, item.date);
  };

  // วันนี้ปักหมุดบนสุดเสมอ (ตัดเวลาที่ผ่านแล้ว) + ช่วงว่างตาม filter ต่อท้าย (เริ่มพรุ่งนี้ กันซ้ำกับกลุ่มวันนี้)
  const today = todayISO();
  const cands = useMemo(() => {
    const todaySlots = rescheduleSlots(acts, occ, item, today, today, nowMin());
    let { from, to } = typeof range === 'string' ? rescRangeDates(range) : { from: range.week, to: addDays(range.week, 6) };
    const tomorrow = addDays(today, 1);
    if (from <= today) from = tomorrow;
    const rest = to < from ? [] : rescheduleSlots(acts, occ, item, from, to);
    // ไม่เสนอช่วงว่างที่ล้ำเข้าไปในเวลากลางดึก 01:00–06:00 (นาที 1500–1800 ของหน้าต่างวัน) — เก็บเฉพาะช่วงที่จบก่อน 01:00
    return [...todaySlots, ...rest].filter((c) => c.end <= NIGHT_CUTOFF);
  }, [acts, occ, item, range, today]);

  const keyOf = (c: RescCandidate) => `${c.date}:${c.start}`;
  const best = useMemo(
    () => cands.reduce<RescCandidate | null>((a, c) => (c.score > (a?.score ?? -1) ? c : a), null),
    [cands],
  );
  const picked = cands.find((c) => keyOf(c) === pick) ?? best;

  // จัดกลุ่มรายวันเพื่อแสดงหัววัน + ชิปเวลา
  const byDay = useMemo(() => {
    const days: { date: string; slots: RescCandidate[] }[] = [];
    for (const c of cands) {
      const last = days[days.length - 1];
      if (last && last.date === c.date) last.slots.push(c);
      else days.push({ date: c.date, slots: [c] });
    }
    return days;
  }, [cands]);

  // เข้าเร็วและลื่นแบบเดียวกับ ActivitySheet: ไม่ใช้แอนิเมชันของระบบ — สไลด์ขึ้น+จางเข้าเองด้วย native driver สั้น ๆ
  // ปิด: เล่นย้อน (เลื่อนลง+จางออก) จบแล้วค่อยถอด Modal ผ่าน onClosed
  const [anim] = useState(() => new Animated.Value(0));
  const closed = useEffectEvent(onClosed);
  useEffect(() => {
    Animated.timing(anim, {
      toValue: closing ? 0 : 1,
      duration: closing ? 140 : 160,
      easing: closing ? Easing.in(Easing.quad) : Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && closing) closed();
    });
  }, [anim, closing]);

  return (
    <Modal transparent animationType="none" onRequestClose={closeResc}>
      {/* ไม่มีฉากหลังมืด — โปร่งใส แตะพื้นที่ว่างเพื่อปิดได้เหมือนเดิม */}
      <Pressable style={{ flex: 1 }} onPress={closing ? undefined : closeResc} />
      {closing ? null : <ToastHost docked />}
      <Animated.View
        // กำลังเล่นปิด — ไม่รับการแตะแล้ว
        pointerEvents={closing ? 'none' : 'auto'}
        style={{
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
          backgroundColor: t.sheet,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          padding: 20,
          // คีย์บอร์ดเปิด (ช่องเหตุผล) → ยกแผ่นขึ้นพ้นคีย์บอร์ด ปุ่มยืนยันไม่ถูกบัง
          marginBottom: kb,
          paddingBottom: kb > 0 ? 16 : insets.bottom + 20,
          gap: 12,
          maxHeight: '85%',
          // เงานุ่มแทน overlay — ให้แผ่นยังแยกจากเนื้อหาด้านหลังชัด
          shadowColor: t.shadow,
          shadowOpacity: 0.22,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: -8 },
          elevation: 16,
        }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: t.line2, alignSelf: 'center' }} />
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <Txt size={20} weight="bold" numberOfLines={2} style={{ flex: 1, lineHeight: 27 }}>เลื่อน{word} · {plainTitle(item.title)}</Txt>
          <Pressable accessibilityRole="button" accessibilityLabel="ยกเลิกการเลื่อน กลับไปรายละเอียด" onPress={cancel} hitSlop={6} style={pressFade({ width: 40, height: 40, borderRadius: 20, backgroundColor: t.track, alignItems: 'center', justifyContent: 'center' })}>
            <SvgIcon name="x" size={16} color={t.sub} strokeWidth={2.4} />
          </Pressable>
        </View>
        <Txt size={13} num color={t.sub}>
          เดิม: {thaiDate(item.date)} {fmtMin(item.startMin)}–{fmtMin(item.endMin)}
        </Txt>

        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder={`เหตุผล (ไม่บังคับ) เช่น ${isCase ? 'ลูกค้าติดประชุม' : 'ติดธุระ'}`}
          accessibilityLabel="เหตุผลที่เลื่อน ไม่บังคับ"
          returnKeyType="done"
          placeholderTextColor={t.faint}
          style={{ backgroundColor: t.card2, borderRadius: 12, borderWidth: 1, borderColor: t.line, padding: 12, color: t.ink, fontFamily: FONT.ui, fontSize: 14 }}
        />

        {/* filter: ช่วงสำเร็จรูป + เลือกสัปดาห์เอง (ชิปแสดงช่วงสัปดาห์ที่เลือก) */}
        <ChipRow>
          {RANGES.map((r) => (
            <Chip key={r.key} small label={r.label} active={range === r.key} onPress={() => { setRange(r.key); setPick(null); }} />
          ))}
          <Chip
            small
            icon="calendar"
            label={typeof range === 'object' ? thaiWeekRange(range.week) : 'เลือกสัปดาห์'}
            active={typeof range === 'object'}
            onPress={() => setWeekOpen(true)}
          />
        </ChipRow>

        <Txt size={12} color={t.sub}>
          {cands.length
            ? `พบ ${cands.length} ช่วงว่าง · ★ แนะนำ: ${thaiDate(best!.date)} ${fmtMin(best!.start)}`
            : 'ไม่มีช่วงว่างพอในช่วงนี้ — ลองเปลี่ยนช่วงค้นหา'}
        </Txt>

        {/* ช่วงว่างทั้งหมด จัดกลุ่มรายวัน: วันนี้ปักหมุดบนสุด + ชิปเวลาให้แตะเลือก */}
        <ScrollView style={{ maxHeight: 300, flexShrink: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ gap: 14 }}>
            {byDay[0]?.date !== today ? (
              <View style={{ gap: 4 }}>
                <Txt size={13} weight="med" color={t.accent}>วันนี้ · {thaiDate(today)}</Txt>
                <Txt size={12} color={t.sub}>ไม่มีช่วงว่างเหลือแล้ววันนี้</Txt>
              </View>
            ) : null}
            {byDay.map((day) => (
              <View key={day.date} style={{ gap: 8 }}>
                <Txt size={13} weight="med" color={day.date === today ? t.accent : undefined}>
                  {day.date === today ? 'วันนี้ · ' : ''}{thaiDate(day.date)}{' '}
                  <Txt size={12} color={t.sub}>· ว่าง {day.slots.length} ช่วง</Txt>
                </Txt>
                <ChipRow>
                  {day.slots.map((c) => {
                    const k = keyOf(c);
                    const isBest = best ? keyOf(best) === k : false;
                    return (
                      <Chip
                        key={k}
                        small
                        label={`${isBest ? '★ ' : ''}${fmtMin(c.start)}–${fmtMin(c.end)}`}
                        active={picked ? keyOf(picked) === k : false}
                        color={isBest ? GREEN : undefined}
                        onPress={() => setPick(k)}
                      />
                    );
                  })}
                </ChipRow>
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn style={{ flex: 1 }} kind="ghost" label="ยกเลิก" onPress={cancel} />
          <Btn
            style={{ flex: 2 }}
            label={picked ? `เลื่อนไป ${shortThai(picked.date)} · ${fmtMin(picked.start)}` : 'เลือกช่วงเวลาก่อน'}
            disabled={!picked}
            onPress={async () => {
              if (!picked) return;
              closeResc();
              const undo = await reschedule(item, picked, reason.trim());
              // บอกปลายทาง + พูดถึงแจ้งเตือนเฉพาะรายการที่เปิดแจ้งเตือนไว้จริง
              if (undo) showToast(`เลื่อนไป ${shortThai(picked.date)} ${fmtMin(picked.start)} แล้ว${item.notify ? ' · ย้ายแจ้งเตือนให้แล้ว' : ''}`, { label: 'เลิกทำ', run: undo });
            }}
          />
        </View>
      </Animated.View>

      {/* popup เลือกสัปดาห์ (ตัวเดียวกับแถบนำทางสัปดาห์) */}
      <WeekPicker
        visible={weekOpen}
        monday={typeof range === 'object' ? range.week : mondayOf(todayISO())}
        onClose={() => setWeekOpen(false)}
        onPick={(m) => {
          setRange({ week: m });
          setPick(null);
          setWeekOpen(false);
        }}
      />
    </Modal>
  );
}
