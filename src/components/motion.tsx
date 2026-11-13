// ชิ้นส่วนแอนิเมชันร่วมของแอป (Reanimated) — โทนเรียบนุ่ม: สั้น ไม่เด้งแรง ใช้เพื่อบอกว่า "ค่าเปลี่ยน" เท่านั้น
// ทุกตัวใช้ค่าเริ่มต้น reduceMotion ของ Reanimated (ตามการตั้งค่าเครื่อง) — เปิด "ลดการเคลื่อนไหว" แล้วข้ามไปค่าปลายทางทันที
import React, { useEffect, useState } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';

/** จังหวะมาตรฐานของแอป — ออกตัวเร็วแล้วค่อย ๆ หยุด */
export const EASE_OUT = Easing.out(Easing.cubic);

/**
 * ค่าที่ไล่ตาม value อย่างนุ่มนวล — เปิดมาครั้งแรกอยู่ที่ค่าจริงเลย (ไม่เล่น) แล้วเลื่อนเฉพาะตอนค่าเปลี่ยน
 * from = ค่าตั้งต้นตอนเปิด (เช่น 0 ให้วงแหวนค่อย ๆ เติมตอนเปิดหน้า)
 */
export function useEased(value: number, duration = 420, from?: number): SharedValue<number> {
  const sv = useSharedValue(from ?? value);
  useEffect(() => {
    sv.set(withTiming(value, { duration, easing: EASE_OUT }));
  }, [value, duration, sv]);
  return sv;
}

/**
 * นับจำนวนครั้งที่ on เปลี่ยนจาก false → true ตั้งแต่เปิดมา (เปิดมาเป็น true อยู่แล้ว = 0)
 * ใช้เป็น key ให้ชิ้นแอนิเมชันเริ่มเล่นใหม่ทุกครั้งที่ "เพิ่งเกิดขึ้น" เช่น เพิ่งติ๊กว่าทำแล้ว
 */
export function useBurst(on: boolean): number {
  const [prev, setPrev] = useState(on);
  const [n, setN] = useState(0);
  if (prev !== on) {
    setPrev(on);
    if (on) setN(n + 1);
  }
  return n;
}

/** เนื้อแถบความคืบหน้า (0–1) — วางในรางที่ overflow: 'hidden' · ค่าเปลี่ยนแล้วค่อย ๆ ยืด/หด */
export function ProgressFill({ pct, color, height }: { pct: number; color: string; height: number }) {
  const p = useEased(Math.min(Math.max(pct, 0), 1));
  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: p.value }] }));
  return <Animated.View style={[{ width: '100%', height, backgroundColor: color, transformOrigin: 'left' }, style]} />;
}

/**
 * เนื้อหาที่ค่อย ๆ "ลงตัว" เมื่อ signal เปลี่ยน — เช่น ติ๊กว่าทำแล้ว ชื่อรายการจางลงแล้วกลับมาในสภาพขีดฆ่า
 * เปิดมาครั้งแรกไม่เล่น · ปรับแค่ความทึบของกล่องเดิม (ไม่ถอด/ใส่ใหม่) ตำแหน่งในแถวจึงไม่ขยับ
 */
export function SettleIn({ signal, children }: { signal: string | number | boolean; children: React.ReactNode }) {
  const [prev, setPrev] = useState(signal);
  const [n, setN] = useState(0);
  if (prev !== signal) {
    setPrev(signal);
    setN(n + 1);
  }
  const o = useSharedValue(1);
  useEffect(() => {
    if (n) o.set(withSequence(withTiming(0.3, { duration: 90, easing: EASE_OUT }), withTiming(1, { duration: 260, easing: EASE_OUT })));
  }, [n, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
