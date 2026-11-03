// แถบลอยล่างของระบบ B1
//  - CalendarBar: หน้าปฏิทิน (วัน/สัปดาห์/เดือน/ปี) — [‹ • วันนี้ ›] ซ้าย + [ปฏิทิน][＋] ขวา · ‹ › เลื่อนตามหน่วยของมุมมอง
//  - SubBar: หน้าย่อย/ฟอร์ม — [‹ กลับ] ซ้าย + ปุ่มหลักของหน้านั้นขวา (ไม่มีปุ่มกลับด้านบนอีกแล้ว)
//  - BarFade: ไล่สีจางใต้แถบ ให้เนื้อหาที่เลื่อนลอดใต้แถบดูเป็นการเลื่อน ไม่ใช่ถูกตัด
import React from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { SvgIcon } from '@/components/svg-icon';
import { Txt, useTokens } from '@/components/ui';

/** ระยะที่เนื้อหาควรเว้นล่างให้พ้นแถบ (ไม่รวม safe area) — ใช้กับ paddingBottom ของ ScrollView และตำแหน่ง toast */
export const BOTTOM_BAR_SPACE = 92;
const BAR_BOTTOM = 20;

const SHADOW: ViewStyle = {
  shadowColor: '#221C13',
  shadowOpacity: 0.14,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 8,
};

export function BarFade() {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const h = 110 + insets.bottom;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: h }}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="b1fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.bg} stopOpacity={0} />
            <Stop offset="0.6" stopColor={t.bg} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#b1fade)" />
      </Svg>
    </View>
  );
}

interface CalendarBarProps {
  onPrev: () => void;
  onNext: () => void;
  /** ดูช่วงอื่นอยู่ → กลับมาวันนี้ · อยู่วันนี้แล้ว → เลื่อนไปที่เส้น "ตอนนี้" */
  onToday: () => void;
  onCalendar: () => void;
  onAdd: () => void;
  prevLabel: string;
  nextLabel: string;
  /** อยู่ที่ช่วงของวันนี้แล้วหรือยัง — ยังไม่ใช่ = จุดหน้าคำว่า "วันนี้" เป็นสีส้มสด บอกว่ากดแล้วจะพากลับ */
  atToday: boolean;
  /** ปุ่มปฏิทินแสดงเป็น "หน้าปัจจุบัน" (มุมมองเดือน) */
  calendarActive?: boolean;
}

export function CalendarBar({ onPrev, onNext, onToday, onCalendar, onAdd, prevLabel, nextLabel, atToday, calendarActive }: CalendarBarProps) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  return (
    <>
      <BarFade />
      <View style={{ position: 'absolute', left: 18, right: 18, bottom: insets.bottom + BAR_BOTTOM, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={[{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, borderRadius: 26, padding: 4 }, SHADOW]}>
          <Pressable accessibilityRole="button" accessibilityLabel={prevLabel} onPress={onPrev} hitSlop={4} style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <SvgIcon name="chevL" size={17} color={t.sub} strokeWidth={2.2} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={atToday ? 'วันนี้ — เลื่อนไปที่ตอนนี้' : 'กลับมาวันนี้'}
            onPress={onToday}
            style={({ pressed }) => ({
              height: 44,
              paddingHorizontal: 16,
              borderRadius: 22,
              backgroundColor: t.ink,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 7,
              transform: [{ scale: pressed ? 0.95 : 1 }],
            })}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: atToday ? '#F08A64' : '#FF6B3D' }} />
            <Txt size={14} weight="bold" color={t.bg}>
              วันนี้
            </Txt>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={nextLabel} onPress={onNext} hitSlop={4} style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <SvgIcon name="chevR" size={17} color={t.sub} strokeWidth={2.2} />
          </Pressable>
        </View>

        <View style={[{ flexDirection: 'row', gap: 4, backgroundColor: t.card, borderRadius: 26, padding: 4 }, SHADOW]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="ปฏิทิน"
            accessibilityState={{ selected: !!calendarActive }}
            onPress={onCalendar}
            style={({ pressed }) => ({
              width: 50,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: calendarActive || pressed ? 'rgba(210,96,58,0.15)' : 'transparent',
            })}>
            <SvgIcon name="calendar" size={20} color={calendarActive ? t.accentInk : t.sub} strokeWidth={1.8} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="เพิ่มกิจกรรม"
            onPress={onAdd}
            style={({ pressed }) => ({
              width: 50,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#B44E2C',
              transform: [{ scale: pressed ? 0.94 : 1 }],
            })}>
            <SvgIcon name="plus" size={20} color="#FFFFFF" strokeWidth={2.3} />
          </Pressable>
        </View>
      </View>
    </>
  );
}

export interface SubBarAction {
  label: string;
  icon?: string;
  onPress: () => void;
  /** danger = ปุ่มลบ (แดง) */
  tone?: 'accent' | 'danger';
  disabled?: boolean;
}

/** แถบล่างของหน้าย่อย — ‹ กลับ + ปุ่มหลัก 1 ปุ่ม (ถ้ามี) */
export function SubBar({ onBack, backLabel = 'กลับ', action }: { onBack: () => void; backLabel?: string; action?: SubBarAction }) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  return (
    <>
      <BarFade />
      <View style={{ position: 'absolute', left: 18, right: 18, bottom: insets.bottom + BAR_BOTTOM, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <View style={[{ backgroundColor: t.card, borderRadius: 26, padding: 4 }, SHADOW]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            onPress={onBack}
            style={({ pressed }) => ({ height: 44, paddingLeft: 10, paddingRight: 16, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: pressed ? t.track : 'transparent' })}>
            <SvgIcon name="chevL" size={18} color={t.ink} strokeWidth={2.2} />
            <Txt size={15} weight="bold">
              {backLabel}
            </Txt>
          </Pressable>
        </View>
        {action ? (
          <Pressable
            accessibilityRole="button"
            onPress={action.onPress}
            disabled={action.disabled}
            style={({ pressed }) => [
              {
                flexShrink: 1,
                height: 52,
                paddingHorizontal: 22,
                borderRadius: 26,
                backgroundColor: action.tone === 'danger' ? t.warn : '#B44E2C',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                opacity: action.disabled ? 0.45 : 1,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              },
              SHADOW,
            ]}>
            {action.icon ? <SvgIcon name={action.icon} size={18} color="#FFFFFF" strokeWidth={2.4} /> : null}
            <Txt size={15} weight="bold" color="#FFFFFF" numberOfLines={1} style={{ flexShrink: 1 }}>
              {action.label}
            </Txt>
          </Pressable>
        ) : null}
      </View>
    </>
  );
}
