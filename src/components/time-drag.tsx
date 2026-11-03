// เลือกเวลาด้วยการลาก (ฟอร์มเพิ่ม/แก้ไข ขั้น "เวลา")
// • TimeDragBar  — แถบ 24 ชม. แนวนอน (06:00–06:00) เห็นทั้งวันในแถบเดียว
// • TimeDragRail — รางแนวตั้งแบบละเอียด (1 ชม. = 48px) เลื่อนดูได้ ลากได้แม่นกว่า
// ทั้งสองแบบ: กดค้างที่บล็อกส้มแล้วลาก = ย้ายทั้งช่วง (ความยาวเท่าเดิม) · กดค้างที่ขอบแล้วลาก = ยืด/หด
//             แตะที่ว่างบนแถบ = ย้ายช่วงไปเวลานั้น · ขยับทีละ 15 นาที · กิจกรรมเดิมของวันนั้นเป็นบล็อกเทา
// ใช้ PanResponder ของ RN (ไม่ต้องห่อ GestureHandlerRootView) · กดค้างก่อนจึงลากได้ → ไม่แย่งการเลื่อนหน้าจอ
import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, ScrollView, View, type GestureResponderEvent, type LayoutChangeEvent, type PanResponderGestureState, type ScrollViewInstance } from 'react-native';

import { Txt, useTokens } from '@/components/ui';
import { DAY_END, DAY_START, SNAP } from '@/constants/theme';
import { durText, fmtMin } from '@/lib/dates';
import type { DayItem } from '@/lib/types';

const LONG_PRESS = 220; // ms ก่อนเริ่มลากได้
const SLOP = 8; // ขยับเกินนี้ก่อนครบเวลากดค้าง = ตั้งใจเลื่อนหน้าจอ ไม่ใช่ลาก
const ACCENT_INK = '#B44E2C';

type Target = 'move' | 'start' | 'end';

interface DragOpts {
  axis: 'x' | 'y';
  start: number;
  end: number;
  pxPerMin: number;
  /** ตำแหน่งตามแกน (px จากต้นแถบ) → นาที */
  minAt: (pos: number) => number;
  /** ส่วนไหนของบล็อกที่ถูกกด (null = ที่ว่าง) */
  hitTest: (pos: number) => Target | null;
  onChange: (start: number, end: number) => void;
  /** เริ่ม/เลิกลาก — ให้หน้าล็อกการเลื่อนระหว่างลาก */
  onDragState?: (dragging: boolean) => void;
}

const snap = (m: number) => Math.round(m / SNAP) * SNAP;

/**
 * กดค้าง → ลาก (ทีละ 15 นาที) · แตะสั้นที่ว่าง → ย้ายช่วงไปที่นั่น
 * handler อ่านค่าล่าสุดจาก ref (อัปเดตใน effect) เพราะ PanResponder สร้างครั้งเดียว
 */
function useTimeDrag(opts: DragOpts) {
  const latest = useRef(opts);
  useEffect(() => {
    latest.current = opts;
  });
  const [active, setActive] = useState<Target | null>(null);

  // PanResponder ต้องสร้างครั้งเดียว — ref ถูกอ่านเฉพาะใน callback ของท่าทาง (ไม่ใช่ตอน render) จึงปิดกฎนี้เฉพาะจุด
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let armed = false;
    let moved = false;
    let target: Target | null = null;
    let origin = { start: 0, end: 0, pos: 0 };
    const pos = (e: GestureResponderEvent) => (latest.current.axis === 'x' ? e.nativeEvent.locationX : e.nativeEvent.locationY);
    const delta = (g: PanResponderGestureState) => (latest.current.axis === 'x' ? g.dx : g.dy);
    const stop = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (armed) latest.current.onDragState?.(false);
      armed = false;
      setActive(null);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      // กำลังลากอยู่ห้ามปล่อยให้ ScrollView แย่ง · ยังไม่ลาก = ให้เลื่อนหน้าได้ตามปกติ
      onPanResponderTerminationRequest: () => !armed,
      onShouldBlockNativeResponder: () => false,
      onPanResponderGrant: (e) => {
        const o = latest.current;
        const p = pos(e);
        origin = { start: o.start, end: o.end, pos: p };
        target = o.hitTest(p);
        moved = false;
        if (!target) return;
        timer = setTimeout(() => {
          armed = true;
          setActive(target);
          latest.current.onDragState?.(true);
        }, LONG_PRESS);
      },
      onPanResponderMove: (_e, g) => {
        const d = delta(g);
        if (!armed) {
          if (Math.abs(g.dx) > SLOP || Math.abs(g.dy) > SLOP) {
            moved = true;
            if (timer) clearTimeout(timer);
            timer = null;
          }
          return;
        }
        const o = latest.current;
        const dm = snap(d / o.pxPerMin);
        const dur = origin.end - origin.start;
        if (target === 'move') {
          const s = Math.min(Math.max(origin.start + dm, DAY_START), DAY_END - dur);
          if (s !== o.start) o.onChange(s, s + dur);
        } else if (target === 'start') {
          const s = Math.min(Math.max(origin.start + dm, DAY_START), origin.end - SNAP);
          if (s !== o.start) o.onChange(s, origin.end);
        } else if (target === 'end') {
          const e = Math.max(Math.min(origin.end + dm, DAY_END), origin.start + SNAP);
          if (e !== o.end) o.onChange(origin.start, e);
        }
      },
      onPanResponderRelease: () => {
        // แตะสั้นที่ว่าง (ไม่ได้กดค้าง ไม่ได้เลื่อน) → ย้ายทั้งช่วงไปกึ่งกลางที่แตะ
        if (!armed && !moved && !target) {
          const o = latest.current;
          const dur = o.end - o.start;
          const s = Math.min(Math.max(snap(o.minAt(origin.pos) - dur / 2), DAY_START), DAY_END - dur);
          if (s !== o.start) o.onChange(s, s + dur);
        }
        stop();
      },
      onPanResponderTerminate: stop,
    });
  });

  return { handlers: responder.panHandlers, active };
}

interface TimeDragProps {
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
  /** กิจกรรมเดิมของวันที่ใช้อ้างอิง (บล็อกเทา) */
  items: DayItem[];
  /** ช่วงว่างของวันนั้น — แถบเขียวจาง (night = ช่วงดึก 01:00–06:00 โทนเงียบกว่า) */
  free?: { start: number; end: number; night?: boolean }[];
  title?: string;
  onDragState?: (dragging: boolean) => void;
}

const SPAN = DAY_END - DAY_START;
const BAR_TICKS = [360, 540, 720, 900, 1080, 1260, 1440, 1620, 1800];
const overlaps = (a1: number, a2: number, b1: number, b2: number) => a1 < b2 && b1 < a2;

// ---------- แถบแนวนอน ----------

export function TimeDragBar({ start, end, onChange, items, free = [], onDragState }: TimeDragProps) {
  const t = useTokens();
  const [w, setW] = useState(0);
  const ppm = w ? w / SPAN : 0.2;
  const x = (m: number) => (m - DAY_START) * ppm;
  const left = x(start);
  const width = Math.max(x(end) - left, 10);
  const edge = Math.min(16, width / 3);
  const { handlers, active } = useTimeDrag({
    axis: 'x',
    start,
    end,
    pxPerMin: ppm,
    minAt: (p) => DAY_START + p / ppm,
    hitTest: (p) => {
      // บล็อกแคบ (กิจกรรมสั้นบนแถบ 24 ชม.) — ให้พื้นที่จับ "ย้าย" กว้างขึ้นรอบบล็อก ส่วนขอบอยู่ถัดออกไป
      if (width < 40) {
        if (p >= left - 8 && p <= left + width + 8) return 'move';
        if (p >= left - 26 && p < left - 8) return 'start';
        if (p > left + width + 8 && p <= left + width + 26) return 'end';
        return null;
      }
      return p >= left - 14 && p <= left + edge ? 'start' : p >= left + width - edge && p <= left + width + 14 ? 'end' : p > left && p < left + width ? 'move' : null;
    },
    onChange,
    onDragState,
  });
  const clash = items.some((i) => (i.ostatus === 'planned' || i.ostatus === 'done') && overlaps(i.startMin, i.endMin, start, end));
  const label = `${fmtMin(start)}–${fmtMin(end)} · ${durText(end - start)}`;
  // ป้ายเวลาเหนือบล็อก — ชิดขอบไม่ให้ล้นแถบ
  const LABEL_W = 132;
  const labelLeft = Math.min(Math.max(left + width / 2 - LABEL_W / 2, 0), Math.max(w - LABEL_W, 0));

  return (
    <View style={{ gap: 4 }}>
      <View style={{ height: 28 }}>
        <View
          style={{
            position: 'absolute',
            left: labelLeft,
            width: LABEL_W,
            height: 26,
            borderRadius: 13,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: active ? ACCENT_INK : t.ink,
          }}>
          <Txt size={12} num weight="bold" color={active ? '#FFFFFF' : t.bg}>
            {label}
          </Txt>
        </View>
      </View>
      <View
        onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`ช่วงเวลา ${fmtMin(start)} ถึง ${fmtMin(end)}`}
        accessibilityHint="กดค้างที่แถบส้มแล้วลากเพื่อย้าย ลากขอบเพื่อยืดหรือหด หรือใช้ปุ่มปรับละเอียดด้านล่าง"
        accessibilityActions={[
          { name: 'increment', label: 'เลื่อนช้าลง 15 นาที' },
          { name: 'decrement', label: 'เลื่อนเร็วขึ้น 15 นาที' },
        ]}
        onAccessibilityAction={(e) => {
          const dm = e.nativeEvent.actionName === 'increment' ? SNAP : -SNAP;
          const dur = end - start;
          const s = Math.min(Math.max(start + dm, DAY_START), DAY_END - dur);
          onChange(s, s + dur);
        }}
        {...handlers}
        style={{ height: 48, justifyContent: 'center' }}>
        <View pointerEvents="none" style={{ height: 40, borderRadius: 10, backgroundColor: t.track, overflow: 'hidden' }}>
          {BAR_TICKS.slice(1, -1).map((m) => (
            <View key={m} style={{ position: 'absolute', left: x(m), top: 0, bottom: 0, width: 1, backgroundColor: t.line }} />
          ))}
          {free.map((f) => (
            <View key={`f${f.start}`} style={{ position: 'absolute', left: x(f.start), width: Math.max(x(f.end) - x(f.start), 2), top: 0, bottom: 0, backgroundColor: f.night ? 'rgba(110,101,85,0.08)' : 'rgba(76,154,106,0.16)' }} />
          ))}
          {items.map((i) => (
            <View
              key={`${i.id}:${i.date}`}
              style={{ position: 'absolute', left: x(i.startMin), width: Math.max(x(i.endMin) - x(i.startMin), 2), top: 8, bottom: 8, borderRadius: 4, backgroundColor: t.railDash, opacity: i.ostatus === 'skipped' || i.ostatus === 'rescheduled' ? 0.4 : 0.85 }}
            />
          ))}
        </View>
        {/* บล็อกใหม่ — อยู่นอก overflow:hidden เพื่อให้เงา/ขยายตอนลากไม่ถูกตัด */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left,
            width,
            top: active ? 2 : 4,
            bottom: active ? 2 : 4,
            borderRadius: 8,
            backgroundColor: ACCENT_INK,
            borderWidth: clash ? 2 : 0,
            borderColor: '#FFD6C2',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 3,
            shadowColor: '#221C13',
            shadowOpacity: active ? 0.3 : 0.12,
            shadowRadius: active ? 8 : 3,
            shadowOffset: { width: 0, height: active ? 4 : 1 },
            elevation: active ? 6 : 2,
          }}>
          {width >= 24 ? (
            <>
              <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: active === 'start' ? '#FFFFFF' : 'rgba(255,255,255,0.65)' }} />
              <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: active === 'end' ? '#FFFFFF' : 'rgba(255,255,255,0.65)' }} />
            </>
          ) : null}
        </View>
      </View>
      <View style={{ height: 14 }}>
        {BAR_TICKS.map((m, i) => (
          <Txt
            key={m}
            size={10}
            num
            color={t.muted}
            style={{ position: 'absolute', left: i === 0 ? 0 : undefined, right: i === BAR_TICKS.length - 1 ? 0 : undefined, ...(i > 0 && i < BAR_TICKS.length - 1 ? { left: x(m) - 10, width: 20, textAlign: 'center' } : {}) }}>
            {fmtMin(m).slice(0, 2)}
          </Txt>
        ))}
      </View>
    </View>
  );
}

// ---------- รางแนวตั้ง (ละเอียด) ----------

const PX_PER_MIN = 0.8; // 1 ชม. = 48px · 15 นาที = 12px
const RAIL_H = 380;
const GUTTER = 50;

export function TimeDragRail({ start, end, onChange, items, free = [], title, onDragState }: TimeDragProps) {
  const t = useTokens();
  const scRef = useRef<ScrollViewInstance>(null);
  const scrolled = useRef(false);
  const [dragging, setDragging] = useState(false);
  const y = (m: number) => (m - DAY_START) * PX_PER_MIN;
  const top = y(start);
  const height = Math.max(y(end) - top, 12);
  const edge = Math.min(14, height / 3);
  const { handlers, active } = useTimeDrag({
    axis: 'y',
    start,
    end,
    pxPerMin: PX_PER_MIN,
    minAt: (p) => DAY_START + p / PX_PER_MIN,
    hitTest: (p) => (p >= top - 12 && p <= top + edge ? 'start' : p >= top + height - edge && p <= top + height + 12 ? 'end' : p > top && p < top + height ? 'move' : null),
    onChange,
    onDragState: (d) => {
      setDragging(d);
      onDragState?.(d);
    },
  });
  // เปิดรางครั้งแรก → เลื่อนให้เห็นช่วงที่เลือก (เผื่อด้านบน 1 ชม.)
  const [initialY] = useState(() => Math.max(y(start) - 48, 0));
  const hours = Array.from({ length: SPAN / 60 + 1 }, (_, i) => DAY_START + i * 60);

  return (
    <View style={{ height: RAIL_H, borderRadius: 14, backgroundColor: t.bg, overflow: 'hidden' }}>
      <ScrollView
        ref={scRef}
        nestedScrollEnabled
        scrollEnabled={!dragging}
        showsVerticalScrollIndicator={false}
        contentOffset={{ x: 0, y: initialY }}
        // contentOffset ไม่ทำงานบนเว็บ/บางเครื่อง — เลื่อนซ้ำครั้งแรกที่รู้ขนาดเนื้อหา
        onContentSizeChange={() => {
          if (scrolled.current) return;
          scrolled.current = true;
          scRef.current?.scrollTo({ y: initialY, animated: false });
        }}
        contentContainerStyle={{ paddingVertical: 10 }}>
        <View style={{ height: SPAN * PX_PER_MIN }}>
          {hours.map((m) => (
            <View key={m} pointerEvents="none" style={{ position: 'absolute', top: y(m) - 7, left: 0, right: 0, flexDirection: 'row', alignItems: 'center' }}>
              <Txt size={11} num color={t.muted} style={{ width: GUTTER - 8, textAlign: 'right' }}>
                {fmtMin(m)}
              </Txt>
              <View style={{ flex: 1, height: 1, marginLeft: 8, backgroundColor: t.line }} />
            </View>
          ))}
          {/* พื้นที่ลาก — กว้างเต็มหลังแกนเวลา */}
          <View {...handlers} style={{ position: 'absolute', left: GUTTER, right: 8, top: 0, bottom: 0 }}>
            {free.map((f) => (
              <View
                key={`f${f.start}`}
                pointerEvents="none"
                style={{ position: 'absolute', left: 0, right: 0, top: y(f.start), height: y(f.end) - y(f.start), borderRadius: 8, backgroundColor: f.night ? 'rgba(110,101,85,0.06)' : 'rgba(76,154,106,0.12)', borderWidth: 1, borderStyle: 'dashed', borderColor: f.night ? t.line : 'rgba(76,154,106,0.45)', paddingHorizontal: 8, paddingTop: 2 }}>
                {y(f.end) - y(f.start) >= 24 ? (
                  <Txt size={11} color={f.night ? t.muted : t.greenInk}>
                    ว่าง {fmtMin(f.start)}–{fmtMin(f.end)}
                  </Txt>
                ) : null}
              </View>
            ))}
            {items.map((i) => (
              <View
                key={`${i.id}:${i.date}`}
                pointerEvents="none"
                style={{ position: 'absolute', left: 0, right: 0, top: y(i.startMin), height: Math.max(y(i.endMin) - y(i.startMin), 8), borderRadius: 8, backgroundColor: t.track, borderLeftWidth: 3, borderLeftColor: t.railDash, paddingHorizontal: 8, paddingTop: 2, opacity: i.ostatus === 'skipped' || i.ostatus === 'rescheduled' ? 0.5 : 1 }}>
                <Txt size={11} color={t.sub} numberOfLines={1}>
                  {fmtMin(i.startMin)} {i.title}
                </Txt>
              </View>
            ))}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 22,
                right: 0,
                top,
                height,
                borderRadius: 10,
                backgroundColor: ACCENT_INK,
                paddingHorizontal: 10,
                justifyContent: 'center',
                shadowColor: '#221C13',
                shadowOpacity: active ? 0.3 : 0.14,
                shadowRadius: active ? 10 : 4,
                shadowOffset: { width: 0, height: active ? 4 : 1 },
                elevation: active ? 6 : 2,
                transform: [{ scale: active === 'move' ? 1.02 : 1 }],
              }}>
              <View style={{ position: 'absolute', top: 3, alignSelf: 'center', width: 28, height: 3, borderRadius: 2, backgroundColor: active === 'start' ? '#FFFFFF' : 'rgba(255,255,255,0.6)' }} />
              {height >= 30 ? (
                <Txt size={12.5} weight="bold" color="#FFFFFF" numberOfLines={1}>
                  {fmtMin(start)}–{fmtMin(end)}
                  {height >= 44 && title ? ` · ${title}` : ''}
                </Txt>
              ) : null}
              <View style={{ position: 'absolute', bottom: 3, alignSelf: 'center', width: 28, height: 3, borderRadius: 2, backgroundColor: active === 'end' ? '#FFFFFF' : 'rgba(255,255,255,0.6)' }} />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
