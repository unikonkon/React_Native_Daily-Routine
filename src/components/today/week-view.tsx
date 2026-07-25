// มุมมองสัปดาห์ (ไทม์ไลน์ 7 คอลัมน์) — ต่อยอดจากไทม์ไลน์ day-view
// หัวคอลัมน์เป็นแถบปัดได้ (paging) เลื่อนสัปดาห์ + แกนเวลา 06:00–30:00 (ช่วง 01:00–06:00 ย่อครึ่ง) + บล็อกสีตามหมวด (แยก lane กันซ้อน)
// เต็มจอ ไม่ต้องเลื่อน — เห็นภาพรวม "ช่วงไหนของวันไหนยุ่ง" ทันที
import React, { useEffect, useMemo, useRef } from 'react';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, Pressable, useWindowDimensions, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Txt, useTokens } from '@/components/ui';
import { ACCENT, CAT_BY_ID, CATS, DANGER, DAY_END, DAY_START, GREEN } from '@/constants/theme';
import { addDays, fmtMin, fromISO, mondayOf, nowMin, todayISO, WD_TH } from '@/lib/dates';
import { assignLanes, daytimeFreeSlots, freeMinutes } from '@/lib/engine';
import type { DayItem } from '@/lib/types';
import { useDayReader } from '@/stores/activities';
import { useContacts } from '@/stores/contacts';

const GUTTER = 34; // แกนเวลาซ้าย
const HPAD = 8;
// แกนเวลาแบบ "ย่อช่วงดึก" — 01:00–06:00 (บนแกนคือ 25:00–30:00) สูงแค่ 50% ของสเกลปกติ
// ความสูงที่เหลือถูกเฉลี่ยคืนให้ช่วง 06:00–01:00 อัตโนมัติ (เพราะรวมกันเป็น 100% เท่าเดิม)
const NIGHT_START = 1500; // 01:00 ของวันถัดไป
const NIGHT_SQUEEZE = 0.5;
const DAY_SPAN = NIGHT_START - DAY_START; // 06:00–01:00 = 1140 นาที (สเกลเต็ม)
const UNITS = DAY_SPAN + (DAY_END - NIGHT_START) * NIGHT_SQUEEZE; // หน่วยรวมของแกน = 1290
/** นาที → % ความสูงบนแกน (เชิงเส้นเป็นช่วง: ก่อน 01:00 สเกลเต็ม, หลังจากนั้นสเกลครึ่งเดียว) */
const pct = (min: number) => {
  const u = min <= NIGHT_START ? min - DAY_START : DAY_SPAN + (min - NIGHT_START) * NIGHT_SQUEEZE;
  return (u / UNITS) * 100;
};

/** ป้ายชื่อของบล็อก "นัดเคส" — ชื่อคนในเคส (คนแรก + จำนวนที่เหลือ) ไม่มีรายชื่อ → ใช้ชื่อกิจกรรมแทน */
function caseLabel(it: DayItem, nameById: Record<number, string>) {
  const names = it.contactIds.map((id) => nameById[id]).filter((s) => !!s?.trim());
  if (!names.length) return it.title.trim();
  return names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0];
}

// แถบหัวสัปดาห์แบบปัดได้ (paging) — FlatList แนวนอน virtualized เลื่อนได้ ±~9 ปี
const WK_SPAN = 500;
const WK_COUNT = WK_SPAN * 2 + 1;

interface WeekViewProps {
  monday: string;
  onChangeMonday: (monday: string) => void;
  onPressItem: (item: DayItem) => void;
  onPressDay: (iso: string) => void;
  bottomPad?: number;
  /** โหมด "วันที่ว่าง" — ดึงช่วงเวลาว่างออกมาให้แตะเพิ่มกิจกรรม (กิจกรรมเดิมจาง) */
  freeMode?: boolean;
  onPressSlot?: (date: string, start: number, end: number) => void;
  /** โหมดลบ — แตะบล็อกเพื่อเลือก/ถอนเลือกแทนการเปิดแผ่นรายละเอียด */
  delMode?: boolean;
  /** คีย์ของรายการที่เลือกไว้ (`id:date`) */
  selectedKeys?: Set<string>;
  onToggleSelect?: (item: DayItem) => void;
}

/** คีย์ประจำ occurrence หนึ่ง ๆ (กิจกรรมชุดทำซ้ำใช้ id เดียวกันหลายวัน) */
export const itemKey = (it: DayItem) => `${it.id}:${it.date}`;

export function TodayWeekView({
  monday,
  onChangeMonday,
  onPressItem,
  onPressDay,
  bottomPad = 120,
  freeMode = false,
  onPressSlot,
  delMode = false,
  selectedKeys,
  onToggleSelect,
}: WeekViewProps) {
  const t = useTokens();
  const getDay = useDayReader();
  const contacts = useContacts((s) => s.list);
  const nameById = useMemo(() => Object.fromEntries(contacts.map((c) => [c.id, c.name])) as Record<number, string>, [contacts]);
  const today = todayISO();
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  // เส้นชั่วโมงทุก 3 ชม. + เส้น 01:00 (จุดเริ่มช่วงที่ย่อสเกล — ให้อ่านออกว่าด้านล่างนี้บีบลงครึ่งหนึ่ง)
  const hours: number[] = [];
  for (let m = DAY_START; m <= DAY_END; m += 180) hours.push(m);
  if (!hours.includes(NIGHT_START)) hours.push(NIGHT_START);
  hours.sort((a, b) => a - b);

  // เส้น "ตอนนี้" (เฉพาะคอลัมน์วันนี้ ถ้าอยู่ในสัปดาห์นี้)
  const now = nowMin();
  const nowTop = now >= DAY_START ? now : now + 1440;

  return (
    <View style={{ flex: 1 }}>
      {/* หัวคอลัมน์ (จันทร์นำ) — ปัดซ้าย/ขวาเพื่อเลื่อนสัปดาห์ย้อนหลัง/อนาคต */}
      {/* โหมดลบ — ล็อกการแตะหัววัน (กันหลุดออกจากมุมมองสัปดาห์ทั้งที่เลือกค้างไว้) */}
      {/* ไอคอนโหมดในช่องแกนเวลาซ้ายมือของแถบหัววัน บอกว่าตอนนี้แตะหัววันได้/ไม่ได้ (ดู ModeGlyph) */}
      <WeekHeaderStrip
        monday={monday}
        onChangeMonday={onChangeMonday}
        onPressDay={(iso) => {
          if (!delMode) onPressDay(iso);
        }}
        freeMode={freeMode && !delMode}
        delMode={delMode}
      />

      {/* เวที (definite height ผ่าน flex) — วางเส้นชั่วโมง + คอลัมน์ทับกันด้วย % */}
      <View style={{ flex: 1, marginHorizontal: HPAD, paddingBottom: bottomPad }}>
        <View style={{ flex: 1, position: 'relative' }}>
          {/* เส้นชั่วโมง + ป้ายเวลา — height 14 + marginTop -7 ให้เส้นตกที่ตำแหน่งเวลาพอดี (ตรงกับบล็อก) */}
          {hours.map((m) => (
            <View key={m} style={{ position: 'absolute', top: `${pct(m)}%`, left: 0, right: 0, height: 14, marginTop: -7, flexDirection: 'row', alignItems: 'center' }}>
              <Txt size={9} num color={t.faint} style={{ width: GUTTER, textAlign: 'right', paddingRight: 5 }}>
                {fmtMin(m)}
              </Txt>
              <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
            </View>
          ))}

          {/* 7 คอลัมน์ (ทับบนเส้นชั่วโมง) */}
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: GUTTER, right: 0, flexDirection: 'row' }}>
            {days.map((d, ci) => {
              const items = getDay(d);
              const lanes = assignLanes(items);
              const isToday = d === today;
              return (
                <View
                  key={d}
                  style={{
                    flex: 1,
                    position: 'relative',
                    borderLeftWidth: ci === 0 ? 0 : 1,
                    borderLeftColor: t.line,
                    backgroundColor: isToday ? ACCENT + '0f' : 'transparent',
                  }}>
                  {items.map((it) => {
                    const cat = CAT_BY_ID[it.cat];
                    const { lane, n } = lanes[it.id] ?? { lane: 0, n: 1 };
                    const top = pct(it.startMin);
                    const h = Math.max(pct(it.endMin) - top, 1.6);
                    const done = it.ostatus === 'done';
                    const dim = it.ostatus === 'rescheduled' ? 0.5 : 1;
                    const dur = it.endMin - it.startMin;
                    // นัดเคส → โชว์ชื่อคนในเคส (หลายคน = ชื่อแรก +n) เฉพาะบล็อกที่สูง/กว้างพอ
                    const caseName = cat.isCase ? caseLabel(it, nameById) : '';
                    const showName = !!caseName && dur >= 30 && n <= 2;
                    const showIcon = dur >= 45 && n <= 2 && (!showName || dur >= 75); // โชว์ไอคอนเฉพาะบล็อกที่สูง/กว้างพอ
                    // โหมดลบ: ที่เลือกไว้ = ขอบแดง + ติ๊กถูก · ที่ยังไม่เลือก = จางลงให้ตัวที่เลือกเด่น
                    const picked = delMode && !!selectedKeys?.has(itemKey(it));
                    return (
                      <Pressable
                        key={itemKey(it)}
                        onPress={() => (delMode ? onToggleSelect?.(it) : onPressItem(it))}
                        style={{
                          position: 'absolute',
                          top: `${top}%`,
                          height: `${h}%`,
                          left: `${(100 / n) * lane + 3}%`,
                          width: `${100 / n - 5}%`,
                          minHeight: 5,
                          borderRadius: 3,
                          backgroundColor: cat.color,
                          opacity: (done ? 0.4 : 0.98) * dim * (freeMode ? 0.3 : 1) * (delMode && !picked ? 0.45 : 1),
                          borderWidth: picked ? 1.5 : 0,
                          borderColor: DANGER,
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                          paddingHorizontal: 1,
                        }}>
                        {picked ? <Icon name="check" size={11} color="#FFFFFF" /> : showIcon ? <Icon name={cat.icon} size={11} color="#FFFFFF" /> : null}
                        {showName ? (
                          <Txt size={8} weight="med" color="#FFFFFF" numberOfLines={2} style={{ textAlign: 'center', lineHeight: 9.5 }}>
                            {caseName}
                          </Txt>
                        ) : null}
                      </Pressable>
                    );
                  })}

                  {/* ช่วงเวลาว่าง (โหมดวันที่ว่าง) — แตะเพื่อเปิดฟอร์มเพิ่มพร้อมช่วงเวลา (ไม่นับ 00:00–06:00) · ซ่อนตอนโหมดลบ */}
                  {freeMode && !delMode
                    ? daytimeFreeSlots(items).map((s) => {
                        const top = pct(s.start);
                        const sh = Math.max(pct(s.end) - top, 1.8);
                        return (
                          <Pressable
                            key={`slot:${s.start}`}
                            onPress={() => onPressSlot?.(d, s.start, s.end)}
                            style={{
                              position: 'absolute',
                              top: `${top}%`,
                              height: `${sh}%`,
                              left: '3%',
                              right: '3%',
                              minHeight: 6,
                              borderRadius: 3,
                              borderWidth: 1,
                              borderColor: GREEN,
                              backgroundColor: GREEN + '26',
                              alignItems: 'center',
                              justifyContent: 'center',
                              overflow: 'hidden',
                            }}>
                            {s.end - s.start >= 60 ? <Icon name="plus" size={11} color={GREEN} /> : null}
                          </Pressable>
                        );
                      })
                    : null}

                  {/* เส้นตอนนี้ (เฉพาะวันนี้) */}
                  {isToday ? (
                    <View style={{ position: 'absolute', top: `${pct(nowTop)}%`, left: 0, right: 0, height: 3, backgroundColor: ACCENT }}>
                      <View style={{ position: 'absolute', left: -3, top: -2, width: 7, height: 7, borderRadius: 3, backgroundColor: ACCENT }} />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>

        {/* คำอธิบายไอคอนหมวด (legend) — ถอดความหมายไอคอนในบล็อก */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4, paddingHorizontal: HPAD + 4, paddingVertical: 8, marginTop: 4 }}>
          {delMode ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 12, height: 12, borderRadius: 3, borderWidth: 1.5, borderColor: DANGER, backgroundColor: DANGER + '26' }} />
              <Txt size={11} weight="med" color={DANGER}>
                แตะบล็อกเพื่อเลือกที่จะลบ
              </Txt>
            </View>
          ) : null}
          {freeMode && !delMode ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 12, height: 12, borderRadius: 3, borderWidth: 1, borderColor: GREEN, backgroundColor: GREEN + '26' }} />
              <Txt size={11} weight="med" color={GREEN}>
                แตะช่วงว่างเพื่อเพิ่ม
              </Txt>
            </View>
          ) : null}
          {CATS.map((cat) => (
            <View key={cat.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name={cat.icon} size={12} color={cat.color} />
              <Txt size={11} color={t.sub}>
                {cat.short}
              </Txt>
            </View>
          ))}
        </View>
      </View>

    </View>
  );
}

// หัวคอลัมน์แบบปัดได้ (paging) — แต่ละหน้า = 7 วันของสัปดาห์นั้น (ตรงแนวกับคอลัมน์ไทม์ไลน์ด้านล่าง)
// ปัดจบ → เปลี่ยน monday (ไทม์ไลน์อัปเดตทันที) · แตะวัน → เข้ามุมมองวัน
// ชั่วโมงว่างแบบกระชับ (สำหรับหัวคอลัมน์แคบ) — 90→"1.5ชม", 120→"2ชม"
const hCompact = (min: number) => `${Number((min / 60).toFixed(1))} ชม`;

/**
 * ไอคอนบอกโหมดของแถบหัววัน — วางในช่องแกนเวลา (GUTTER) ที่ว่างอยู่ซ้ายมือ จึงตรงแนวกับป้ายเวลาด้านล่าง
 * ลบ → lock (หัววันถูกล็อก แตะไม่ได้) · วันที่ว่าง → clockPlus (แตะช่วงว่างเพื่อเพิ่ม) · ปกติ → calendar (แตะเข้ามุมมองวัน)
 * อยู่นอก FlatList เพราะเป็นสถานะของทั้งแถบ ไม่ใช่ของสัปดาห์ใดสัปดาห์หนึ่ง — ปัดเปลี่ยนสัปดาห์แล้วต้องไม่เลื่อนตาม
 */
function ModeGlyph({ freeMode, delMode }: { freeMode?: boolean; delMode?: boolean }) {
  const t = useTokens();
  const [name, color] = delMode ? (['lock', DANGER] as const) : freeMode ? (['clockPlus', GREEN] as const) : (['calendar', t.faint] as const);
  // top 14 = ความสูงของบรรทัดชื่อวัน (10.5) + gap 2 → ไอคอนอยู่ระดับเดียวกับวงกลมวันที่ (สูง 22)
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: HPAD, top: 14, width: GUTTER, height: 22, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={16} color={color} />
    </View>
  );
}

function WeekHeaderStrip({
  monday,
  onChangeMonday,
  onPressDay,
  freeMode,
  delMode,
}: {
  monday: string;
  onChangeMonday: (m: string) => void;
  onPressDay: (iso: string) => void;
  freeMode?: boolean;
  delMode?: boolean;
}) {
  const t = useTokens();
  const getDay = useDayReader();
  const today = todayISO();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<string>>(null);

  // สัปดาห์อ้างอิงคงที่ (สัปดาห์ของวันนี้) — index ไม่ขยับตอน monday เปลี่ยน
  const anchorMonday = useMemo(() => mondayOf(todayISO()), []);
  const weeks = useMemo(() => Array.from({ length: WK_COUNT }, (_, i) => addDays(anchorMonday, (i - WK_SPAN) * 7)), [anchorMonday]);
  const curIndex = useMemo(() => weeks.indexOf(monday), [weeks, monday]);

  // index ที่กำลังโชว์ (กันลูประหว่าง scroll ↔ monday)
  const shownIndex = useRef(curIndex);
  useEffect(() => {
    if (curIndex >= 0 && curIndex !== shownIndex.current) {
      shownIndex.current = curIndex;
      listRef.current?.scrollToIndex({ index: curIndex, animated: false });
    }
  }, [curIndex]);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    if (idx === shownIndex.current) return;
    shownIndex.current = idx;
    const m = weeks[idx];
    if (m) onChangeMonday(m);
  };

  return (
    <View style={{ paddingBottom: 6, borderBottomWidth: 0.5, borderBottomColor: t.line }}>
      <FlatList
        ref={listRef}
        data={weeks}
        extraData={monday}
        keyExtractor={(m) => m}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={curIndex >= 0 ? curIndex : WK_SPAN}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onScrollToIndexFailed={({ index }) => {
          listRef.current?.scrollToOffset({ offset: index * width, animated: false });
        }}
        onMomentumScrollEnd={onMomentumEnd}
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={3}
        renderItem={({ item: wk }) => {
          const wdays = Array.from({ length: 7 }, (_, i) => addDays(wk, i));
          return (
            // paddingLeft = HPAD+GUTTER, paddingRight = HPAD → ตรงแนวกับคอลัมน์ไทม์ไลน์
            <View style={{ width, flexDirection: 'row', paddingLeft: HPAD + GUTTER, paddingRight: HPAD }}>
              {wdays.map((d, i) => {
                const isToday = d === today;
                const fm = freeMode ? freeMinutes(daytimeFreeSlots(getDay(d))) : 0; // เวลาว่างรวมของวันนั้น
                return (
                  <Pressable key={d} onPress={() => onPressDay(d)} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                    <Txt size={10.5} weight="med" color={i === 6 ? ACCENT : t.faint}>
                      {WD_TH[i]}
                    </Txt>
                    <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: isToday ? ACCENT : 'transparent' }}>
                      <Txt size={13} num weight="bold" color={isToday ? '#FFFFFF' : t.ink}>
                        {fromISO(d).getDate()}
                      </Txt>
                    </View>
                    {freeMode ? (
                      <Txt size={11} num weight="bold" color={fm > 0 ? GREEN : t.faint}>
                        {fm > 0 ? hCompact(fm) : '—'}
                      </Txt>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          );
        }}
      />
      {/* วางหลัง FlatList — พี่น้องที่ประกาศทีหลังจะวาดทับ ไอคอนจึงไม่ถูกลิสต์บัง (สำคัญบน Android ที่ไม่มี z-index จาก order เดียว) */}
      <ModeGlyph freeMode={freeMode} delMode={delMode} />
    </View>
  );
}
