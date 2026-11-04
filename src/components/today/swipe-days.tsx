// ปัดซ้าย/ขวาที่รายการของมุมมองวัน → เปลี่ยนวัน (ซ้าย = วันถัดไป · ขวา = วันก่อน)
// ใช้ PanResponder ของ RN (ไม่ต้องห่อ GestureHandlerRootView) · จับเฉพาะการลากแนวนอนชัด ๆ → ไม่แย่งการเลื่อนขึ้นลง/การแตะ
// ระหว่างลาก รายการเลื่อนตามนิ้ว + ขอบจอโชว์วันที่จะไป · ปล่อยเกินระยะ/ปัดเร็ว → เลื่อนออก แล้ววันใหม่เลื่อนเข้าจากอีกฝั่ง
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, View, useWindowDimensions } from 'react-native';

import { useNow } from '@/components/b1/use-now';
import { SvgIcon } from '@/components/svg-icon';
import { Txt, useTokens } from '@/components/ui';
import { MONTH_TH, WD_TH, addDays, fromISO, wdMon } from '@/lib/dates';

/** ลากแนวนอนเกินเท่านี้ (และมากกว่าแนวตั้ง 1.5 เท่า) ถึงนับเป็นการปัด */
const START_DX = 18;
/** ปล่อยนิ้วเมื่อเลื่อนไปเกินสัดส่วนนี้ของความกว้าง หรือปัดเร็วพอ → เปลี่ยนวัน */
const COMMIT_RATIO = 0.22;
const COMMIT_VX = 0.45;

function dayLabel(iso: string, today: string): string {
  if (iso === today) return 'วันนี้';
  if (iso === addDays(today, 1)) return 'พรุ่งนี้';
  if (iso === addDays(today, -1)) return 'เมื่อวาน';
  const d = fromISO(iso);
  return `${WD_TH[wdMon(iso)]} ${d.getDate()} ${MONTH_TH[d.getMonth()]}`;
}

export function SwipeDays({ focus, onChangeFocus, children }: { focus: string; onChangeFocus: (iso: string) => void; children: React.ReactNode }) {
  const t = useTokens();
  // วันนี้แบบ reactive — ป้าย วันนี้/พรุ่งนี้/เมื่อวาน ถูกต้องแม้เปิดแอปทิ้งข้ามเที่ยงคืน
  const today = useNow().date;
  const { width } = useWindowDimensions();
  const [tx] = useState(() => new Animated.Value(0));
  // ค่าล่าสุดสำหรับ handler ของ PanResponder (สร้างครั้งเดียว)
  const latest = useRef({ focus, onChangeFocus, width });
  useEffect(() => {
    latest.current = { focus, onChangeFocus, width };
  }, [focus, onChangeFocus, width]);

  // handler อ่าน latest.current ตอนลากเท่านั้น (ไม่ใช่ตอน render) — กฎ refs จับรวมเพราะส่ง ref เข้า PanResponder.create
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => {
    const isSwipe = (dx: number, dy: number) => Math.abs(dx) > START_DX && Math.abs(dx) > Math.abs(dy) * 1.5;
    const back = () => Animated.spring(tx, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
    return PanResponder.create({
      // capture: ชนะปุ่ม/การ์ดด้านในเมื่อเป็นการลากแนวนอน (แตะเฉย ๆ ยังเป็นของปุ่ม)
      onMoveShouldSetPanResponderCapture: (_, g) => isSwipe(g.dx, g.dy),
      onMoveShouldSetPanResponder: (_, g) => isSwipe(g.dx, g.dy),
      onPanResponderMove: (_, g) => tx.setValue(g.dx),
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, g) => {
        const { focus: f, onChangeFocus: go, width: w } = latest.current;
        const far = Math.abs(g.dx) > w * COMMIT_RATIO;
        const fast = Math.abs(g.vx) > COMMIT_VX && Math.sign(g.vx) === Math.sign(g.dx);
        if (!g.dx || (!far && !fast)) return back();
        const dir = g.dx < 0 ? 1 : -1; // ปัดซ้าย = วันถัดไป
        Animated.timing(tx, { toValue: -dir * w, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => {
          go(addDays(f, dir));
          // วันใหม่เลื่อนเข้าจากอีกฝั่ง
          tx.setValue(dir * w * 0.35);
          Animated.timing(tx, { toValue: 0, duration: 190, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
        });
      },
      onPanResponderTerminate: back,
    });
  });

  // ป้ายวันปลายทางที่ขอบจอ — โผล่ตามระยะที่ลาก
  const prevOpacity = tx.interpolate({ inputRange: [0, 70], outputRange: [0, 1], extrapolate: 'clamp' });
  const nextOpacity = tx.interpolate({ inputRange: [-70, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <View style={{ flex: 1, overflow: 'hidden' }} {...pan.panHandlers}>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 14, top: 40, opacity: prevOpacity }}>
        <EdgeLabel icon="chevL" label={dayLabel(addDays(focus, -1), today)} color={t.sub} bg={t.track} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', right: 14, top: 40, opacity: nextOpacity }}>
        <EdgeLabel icon="chevR" label={dayLabel(addDays(focus, 1), today)} color={t.sub} bg={t.track} trailing />
      </Animated.View>
      <Animated.View style={{ flex: 1, transform: [{ translateX: tx }] }}>{children}</Animated.View>
    </View>
  );
}

function EdgeLabel({ icon, label, color, bg, trailing }: { icon: string; label: string; color: string; bg: string; trailing?: boolean }) {
  return (
    <View style={{ flexDirection: trailing ? 'row-reverse' : 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 10, borderRadius: 15, backgroundColor: bg }}>
      <SvgIcon name={icon} size={14} color={color} strokeWidth={2.4} />
      <Txt size={12.5} weight="bold" color={color}>
        {label}
      </Txt>
    </View>
  );
}
