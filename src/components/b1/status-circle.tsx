// วงกลมสถานะของระบบ B1 — วาด 24px แต่พื้นที่แตะ 44×44 · ใช้ทั้งบนราง แผ่นรายละเอียด และหน้าทบทวน
import React from 'react';
import { Pressable, View } from 'react-native';

import { SvgIcon } from '@/components/svg-icon';
import { useTokens } from '@/components/ui';
import { GREEN } from '@/constants/theme';
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

/** หน้าตาวงกลม (ไม่มีพื้นที่แตะ) — ใช้ในปุ่มอื่น เช่นตัวเลือกสถานะในแผ่นรายละเอียด */
export function StatusDot({ state, size = 24 }: { state: RailState; size?: number }) {
  const t = useTokens();
  const s = {
    done: { bg: GREEN, bd: 'transparent', ink: '#FFFFFF', icon: 'check' },
    skipped: { bg: t.skipFill, bd: 'transparent', ink: t.sub, icon: 'minus' },
    overdue: { bg: t.card, bd: '#D2603A', ink: '#D2603A', icon: 'check' },
    current: { bg: t.card, bd: '#D2603A', ink: 'transparent', icon: '' },
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
      {s.icon ? <SvgIcon name={s.icon} size={size * 0.58} color={s.ink} strokeWidth={3} /> : null}
      {/* กำลังทำ = วงส้ม + จุดกลาง (สีเดียวกับเส้น "ตอนนี้") */}
      {state === 'current' ? <View style={{ width: size * 0.42, height: size * 0.42, borderRadius: size, backgroundColor: '#D2603A' }} /> : null}
    </View>
  );
}

/** วงกลมสถานะที่กดได้ (ปุ่มติ๊ก) */
export function StatusCircle({ state, onPress, size = 24, label }: { state: RailState; onPress?: () => void; size?: number; label?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? LABEL[state]}
      onPress={onPress}
      disabled={!onPress || state === 'rescheduled'}
      style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.88 : 1 }] })}>
      <StatusDot state={state} size={size} />
    </Pressable>
  );
}
