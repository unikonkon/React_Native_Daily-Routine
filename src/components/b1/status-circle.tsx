// วงกลมสถานะของระบบ B1 — วาด 24px แต่พื้นที่แตะ 44×44 · ใช้ทั้งบนราง แผ่นรายละเอียด และหน้าทบทวน
// ติ๊กว่าทำแล้ว: วงเด้งเบา ๆ + เครื่องหมายถูกวาดเป็นเส้น + คลื่นเขียวจาง 1 วง (เปิดมาเป็น "ทำแล้ว" อยู่แล้วไม่เล่น)
import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { EASE_OUT, Pop, useBurst } from '@/components/motion';
import { SvgIcon } from '@/components/svg-icon';
import { useTokens } from '@/components/ui';
import { ATTN, GREEN } from '@/constants/theme';
import type { RailState } from '@/lib/progress';

const LABEL: Record<RailState, string> = {
  done: 'ทำแล้ว — แตะเพื่อเปลี่ยนเป็นยังไม่ทำ',
  skipped: 'ข้าม — แตะเพื่อเปลี่ยนเป็นยังไม่ทำ',
  overdue: 'ค้างบันทึก — แตะเพื่อบันทึกว่าทำแล้ว',
  current: 'กำลังทำ — แตะเพื่อบันทึกว่าทำแล้ว',
  planned: 'แตะเพื่อบันทึกว่าทำแล้ว',
  next: 'แตะเพื่อบันทึกว่าทำแล้ว',
  rescheduled: 'เลื่อนไปแล้ว',
};

const AnimatedPath = Animated.createAnimatedComponent(Path);
/** ความยาวเส้นเครื่องหมายถูก (viewBox 24) ≈ 22.6 — เผื่อไว้ให้ปลายเส้นมนไม่โผล่ตอนเริ่ม */
const CHECK_LEN = 24;

/** เครื่องหมายถูกที่ "วาด" จากขีดสั้นไปขีดยาว — รูปเดียวกับไอคอน check ของ svg-icon */
function DrawnCheck({ size, color }: { size: number; color: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withDelay(70, withTiming(1, { duration: 240, easing: EASE_OUT })));
  }, [p]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: CHECK_LEN * (1 - p.value), opacity: p.value < 0.02 ? 0 : 1 }));
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <AnimatedPath d="M4 12l5 5L20 6" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={CHECK_LEN} animatedProps={props} />
    </Svg>
  );
}

/**
 * หน้าตาวงกลม (ไม่มีพื้นที่แตะ) — ใช้ในปุ่มอื่น เช่นตัวเลือกสถานะในแผ่นรายละเอียด
 * drawCheck = วาดเครื่องหมายถูกเป็นเส้นตอนเปิด (ใช้ตอนเพิ่งติ๊ก)
 */
export function StatusDot({ state, size = 24, drawCheck }: { state: RailState; size?: number; drawCheck?: boolean }) {
  const t = useTokens();
  const s = {
    done: { bg: GREEN, bd: 'transparent', ink: '#FFFFFF', icon: 'check' },
    skipped: { bg: t.skipFill, bd: 'transparent', ink: t.sub, icon: 'minus' },
    overdue: { bg: t.card, bd: ATTN, ink: ATTN, icon: 'check' },
    current: { bg: t.card, bd: t.accent, ink: 'transparent', icon: '' },
    planned: { bg: t.card, bd: t.railDash, ink: 'transparent', icon: '' },
    next: { bg: t.card, bd: t.ink, ink: 'transparent', icon: '' },
    rescheduled: { bg: t.card, bd: t.railDash, ink: t.muted, icon: 'chevR' },
  }[state];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: s.bg,
        borderWidth: s.bd === 'transparent' ? 0 : 2,
        borderColor: s.bd,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {state === 'done' && drawCheck ? (
        <DrawnCheck size={size * 0.58} color={s.ink} />
      ) : s.icon ? (
        <SvgIcon name={s.icon} size={size * 0.58} color={s.ink} strokeWidth={3} />
      ) : null}
      {/* กำลังทำ = วงสีเน้นของธีม + จุดกลาง (สีเดียวกับเส้น "ตอนนี้") · ค้างบันทึก = ส้มคงที่ทุกธีม */}
      {state === 'current' ? <View style={{ width: size * 0.42, height: size * 0.42, borderRadius: size, backgroundColor: t.accent }} /> : null}
    </View>
  );
}

/** คลื่นเขียว 1 วง ขยายออกจากวงกลมแล้วจางหาย — บอกว่า "บันทึกแล้ว" โดยไม่ต้องอ่าน toast */
function DoneRipple({ size }: { size: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withTiming(1, { duration: 520, easing: EASE_OUT }));
  }, [p]);
  const style = useAnimatedStyle(() => ({ opacity: 0.38 * (1 - p.value), transform: [{ scale: 1 + 0.75 * p.value }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: (44 - size) / 2, top: (44 - size) / 2, width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: GREEN }, style]}
    />
  );
}

/** วงกลมสถานะที่กดได้ (ปุ่มติ๊ก) */
export function StatusCircle({ state, onPress, size = 24, label }: { state: RailState; onPress?: () => void; size?: number; label?: string }) {
  // จำนวนครั้งที่ "เพิ่งกลายเป็นทำแล้ว" — เปลี่ยน key ให้แอนิเมชันเริ่มใหม่ทุกครั้งที่ติ๊ก
  const burst = useBurst(state === 'done');
  const fresh = burst > 0 && state === 'done';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? LABEL[state]}
      onPress={onPress}
      disabled={!onPress || state === 'rescheduled'}
      style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.88 : 1 }] })}>
      {/* key ต้องไม่ซ้ำกันระหว่างพี่น้อง — ใช้คำนำหน้าแยกคลื่นกับตัววงกลม */}
      {fresh ? <DoneRipple key={`ripple-${burst}`} size={size} /> : null}
      {/* ชิ้นแอนิเมชันมีเฉพาะตอนเพิ่งติ๊ก — ปกติเป็นวงกลมธรรมดา (ทุกแถวบนรางมีปุ่มนี้ ต้องเบาที่สุด) */}
      {fresh ? (
        <Pop key={`dot-${burst}`} play>
          <StatusDot state={state} size={size} drawCheck />
        </Pop>
      ) : (
        <StatusDot state={state} size={size} />
      )}
    </Pressable>
  );
}
