// ชิ้นส่วนแอนิเมชันร่วมของแอป (Reanimated) — โทนเรียบนุ่ม: สั้น ไม่เด้งแรง ใช้เพื่อบอกว่า "ค่าเปลี่ยน" เท่านั้น
// ทุกตัวใช้ค่าเริ่มต้น reduceMotion ของ Reanimated (ตามการตั้งค่าเครื่อง) — เปิด "ลดการเคลื่อนไหว" แล้วข้ามไปค่าปลายทางทันที
//
// หลักเรื่องความเร็ว: ชิ้นที่อยู่ในรายการยาว (แถวบนราง · แถบ % ใต้วัน) ต้อง "นิ่งจนกว่าจะมีอะไรเปลี่ยน"
// — วาดเป็น View ธรรมดาก่อน แล้วค่อยสลับเป็นชิ้นแอนิเมชันตอนค่าเปลี่ยนครั้งแรก
// ค่าแชร์ + สไตล์แอนิเมชันมีต้นทุนตอนสร้าง (ต่อชิ้น) — คูณจำนวนแถวแล้วทำให้เปิดมุมมอง/เปลี่ยนวันช้าลงอย่างเห็นได้
import React, { useEffect, useRef, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useResumed } from '@/lib/active';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';

/** จังหวะมาตรฐานของแอป — ออกตัวเร็วแล้วค่อย ๆ หยุด */
export const EASE_OUT = Easing.out(Easing.cubic);

/**
 * ค่าที่ไล่ตาม value อย่างนุ่มนวล — เปิดมาครั้งแรกอยู่ที่ค่าจริงเลย (ไม่เล่น) แล้วเลื่อนเฉพาะตอนค่าเปลี่ยน
 * from = ค่าตั้งต้นตอนเปิด (เช่น 0 ให้วงแหวนค่อย ๆ เติมตอนเปิดหน้า)
 */
export function useEased(value: number, duration = 420, from?: number): SharedValue<number> {
  const start = from ?? value;
  const sv = useSharedValue(start);
  // ค่าปลายทางล่าสุดที่สั่งไปแล้ว — เปิดมาอยู่ที่ค่าจริงอยู่แล้วไม่ต้องสั่งแอนิเมชัน (ประหยัดงานข้ามเธรดตอนเปิดจอ)
  const target = useRef(start);
  useEffect(() => {
    if (target.current === value) return;
    target.current = value;
    sv.set(withTiming(value, { duration, easing: EASE_OUT }));
  }, [value, duration, sv]);
  return sv;
}

/**
 * นับจำนวนครั้งที่ on เปลี่ยนจาก false → true ตั้งแต่เปิดมา (เปิดมาเป็น true อยู่แล้ว = 0)
 * ใช้เป็น key ให้ชิ้นแอนิเมชันเริ่มเล่นใหม่ทุกครั้งที่ "เพิ่งเกิดขึ้น" เช่น เพิ่งติ๊กว่าทำแล้ว
 */
export function useBurst(on: boolean): number {
  // มุมมองที่ถูกซ่อนไว้ (แท็บวันนี้) กลับมาแสดงพร้อมข้อมูลใหม่ → รับค่าเงียบ ๆ ไม่นับ (ไม่ใช่การกระทำที่เพิ่งเกิดตรงหน้า)
  const resumed = useResumed();
  const [prev, setPrev] = useState(on);
  const [n, setN] = useState(0);
  if (prev !== on) {
    setPrev(on);
    if (on && !resumed) setN(n + 1);
  }
  return n;
}

/**
 * เนื้อแถบความคืบหน้า (0–1) — วางในรางที่ overflow: 'hidden' · ค่าเปลี่ยนแล้วค่อย ๆ ยืด/หด
 * นิ่ง (View ธรรมดา) จนกว่าค่าจะเปลี่ยนครั้งแรก แล้วค่อยสลับเป็นชิ้นแอนิเมชันที่เริ่มจากค่าเดิม
 */
export function ProgressFill({ pct, color, height }: { pct: number; color: string; height: number }) {
  const v = Math.min(Math.max(pct, 0), 1);
  const [first] = useState(v);
  const [live, setLive] = useState(false);
  if (!live && v !== first) setLive(true);
  if (!live) return <View style={{ width: '100%', height, backgroundColor: color, transformOrigin: 'left', transform: [{ scaleX: v }] }} />;
  return <AnimatedFill from={first} pct={v} color={color} height={height} />;
}

function AnimatedFill({ from, pct, color, height }: { from: number; pct: number; color: string; height: number }) {
  const p = useEased(pct, 420, from);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: p.value }] }));
  return <Animated.View style={[{ width: '100%', height, backgroundColor: color, transformOrigin: 'left' }, style]} />;
}

/**
 * เนื้อหาที่ค่อย ๆ "ลงตัว" เมื่อ signal เปลี่ยน — เช่น ติ๊กว่าทำแล้ว ชื่อรายการจางลงแล้วกลับมาในสภาพขีดฆ่า
 * เปิดมาครั้งแรกไม่เล่น และยังเป็น View ธรรมดา (ทุกแถวบนรางมีชิ้นนี้) — สลับเป็นชิ้นแอนิเมชันตอน signal เปลี่ยนครั้งแรก
 */
export function SettleIn({ signal, children }: { signal: string | number | boolean; children: React.ReactNode }) {
  // กลับมาจากการถูกซ่อน (ดู useBurst) → รับสถานะใหม่เงียบ ๆ ไม่เล่น
  const resumed = useResumed();
  const [prev, setPrev] = useState(signal);
  const [n, setN] = useState(0);
  if (prev !== signal) {
    setPrev(signal);
    if (!resumed) setN(n + 1);
  }
  return n ? <SettleAnim n={n}>{children}</SettleAnim> : <View>{children}</View>;
}

/** จางลงแล้วกลับมา 1 ครั้งทุกครั้งที่ n เปลี่ยน (รวมตอนเปิด) — ปรับแค่ความทึบของกล่อง ตำแหน่งในแถวไม่ขยับ */
function SettleAnim({ n, children }: { n: number; children: React.ReactNode }) {
  const o = useSharedValue(1);
  useEffect(() => {
    o.set(withSequence(withTiming(0.3, { duration: 90, easing: EASE_OUT }), withTiming(1, { duration: 260, easing: EASE_OUT })));
  }, [n, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/**
 * กล่องที่จางเข้าตอนเปิด (และลอยเข้าเล็กน้อยถ้าตั้ง rise) — ใช้กับเนื้อหาที่เพิ่งสลับ/กางออก ให้ตามทันว่า "ส่วนนี้เปลี่ยน"
 * ปรับความทึบ/ตำแหน่งของกล่องเดิมด้วยค่าแชร์ (ไม่ใช้ layout animation) — ลำดับและตำแหน่งในหน้าไม่ขยับ
 * rise = ระยะที่ลอยเข้า (px · ค่าลบ = ลอยลงมาจากด้านบน) · delay = หน่วงก่อนเริ่ม (ms)
 * from = ความทึบตั้งต้น (0 = จางจากมองไม่เห็น · 0.5 = เห็นเนื้อหาทันทีแล้วค่อยชัด — ใช้กับจอใหญ่ที่ไม่ควรรอแอนิเมชัน)
 */
export function FadeInView({ children, style, rise = 0, duration = 200, delay = 0, from = 0 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; rise?: number; duration?: number; delay?: number; from?: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withDelay(delay, withTiming(1, { duration, easing: EASE_OUT })));
  }, [p, duration, delay]);
  const anim = useAnimatedStyle(() => ({ opacity: from + (1 - from) * p.value, transform: [{ translateY: (1 - p.value) * rise }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/** ย่อแล้วคืนขนาดแบบสปริงนุ่ม (เกินขนาดจริงเพียงเล็กน้อย) ตอนเปิด — play = false: นิ่ง · เปลี่ยน key เพื่อเล่นใหม่ */
export function Pop({ play, children, from = 0.84 }: { play: boolean; children: React.ReactNode; from?: number }) {
  const s = useSharedValue(play ? from : 1);
  useEffect(() => {
    if (play) s.set(withSpring(1, { duration: 300, dampingRatio: 0.68 }));
  }, [play, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/**
 * วงคลื่นจาง ๆ ที่ขยายออกจากจุดช้า ๆ วนไปเรื่อย ๆ — บอกว่าจุดนี้ "กำลังเดินอยู่ตอนนี้" (เส้นตอนนี้ · กำลังทำ)
 * วางซ้อนใต้จุดจริงในกล่องเดียวกัน · เครื่องที่เปิด "ลดการเคลื่อนไหว" จะไม่เล่น
 */
export function Pulse({ size, color, style }: { size: number; color: string; style?: StyleProp<ViewStyle> }) {
  const p = useSharedValue(0);
  useEffect(() => {
    // ขยาย 1.6 วิ แล้วพัก 0.9 วิ ก่อนวงถัดไป — ช้าพอที่จะไม่กวนสายตา
    p.set(withRepeat(withSequence(withTiming(1, { duration: 1600, easing: EASE_OUT }), withDelay(900, withTiming(0, { duration: 0 }))), -1, false));
  }, [p]);
  const anim = useAnimatedStyle(() => ({ opacity: 0.4 * (1 - p.value), transform: [{ scale: 1 + 1.6 * p.value }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style, anim]} />;
}
