// ชั้นของมุมมองในแท็บวันนี้ (วัน/สัปดาห์/เดือน/ปี) — มุมมองที่เปิดแล้วถูก "เก็บไว้" แทนการทิ้งแล้วสร้างใหม่ทุกครั้งที่สลับ
// การสร้างมุมมองใหม่ทั้งจอ (โดยเฉพาะเดือน/สัปดาห์ที่รายการเยอะ) คืองานที่ทำให้การสลับช้า — เก็บไว้แล้วสลับกลับ = แค่เปิดให้เห็น
//
// ทุกชั้นวางซ้อนกันเต็มพื้นที่ (absolute) · ชั้นที่ไม่ได้ดูอยู่: ทึบ 0 + ไม่รับการแตะ + ซ่อนจากโปรแกรมอ่านจอ
// (ไม่ใช้ display:'none' — ชั้นยังถูกจัดวางตามจริง ตำแหน่งเลื่อนและตำแหน่งที่วัดไว้จึงไม่เพี้ยน)
// ชั้นที่ซ่อนอยู่ไม่ทำงานตามข้อมูล: memo ข้ามค่าที่ส่งมาจากด้านบน + "ประตู" (lib/active) กั้นการติดตาม store/เวลา
import React, { memo, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { EASE_OUT } from '@/components/motion';
import { GateCtx, createGate, setGate } from '@/lib/active';

function LayerImpl({ active, children }: { active: boolean; children: React.ReactNode }) {
  // ประตูของชั้นนี้ — object ตัวเดิมตลอด (ค่าใน context ไม่เปลี่ยน สลับชั้นแล้วข้างในไม่ถูกวาดใหม่เพราะ context)
  const [gate] = useState(() => createGate(active));
  // ความทึบของชั้น — ซ่อน = 0 ทันที · กลับมาแสดง = เริ่มที่ครึ่งทึบแล้วชัดขึ้นใน 0.12 วิ (เห็นเนื้อหาทันที ไม่ต้องรอแอนิเมชัน)
  const o = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    // เปิดประตู = ข้างในรับข้อมูล/เวลาปัจจุบัน (เฉพาะตัวที่ค่าเปลี่ยนจริงถึงถูกวาดใหม่) · ปิด = หยุดตามข้อมูล
    setGate(gate, active);
    o.set(active ? withSequence(withTiming(0.5, { duration: 0 }), withTiming(1, { duration: 120, easing: EASE_OUT })) : withTiming(0, { duration: 0 }));
  }, [active, gate, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      pointerEvents={active ? 'auto' : 'none'}
      aria-hidden={!active}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      style={[StyleSheet.absoluteFill, style]}>
      <GateCtx.Provider value={gate}>{children}</GateCtx.Provider>
    </Animated.View>
  );
}

/** ชั้นที่ซ่อนอยู่ทั้งก่อนและหลัง → ไม่ต้องวาดใหม่ (ค่าที่ส่งมาใหม่ถูกรับตอนชั้นกลับมาแสดง) */
export const Layer = memo(LayerImpl, (prev, next) => !prev.active && !next.active);
