// UI primitives ชุดเดียวใช้ทั้งแอป — การ์ด / ชิป / segmented / toggle / ปุ่ม / แถวตั้งค่า
import React from 'react';
import { Pressable, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';

import { Icon } from '@/components/icon';
import { ACCENT, FONT, PALETTES, PRI_BY_ID, type Palette, type PriorityId } from '@/constants/theme';
import { useSettings } from '@/stores/settings';

/** palette ตามธีมปัจจุบัน */
export function useTokens(): Palette {
  const theme = useSettings((s) => s.theme);
  return PALETTES[theme];
}

interface TxtProps {
  children: React.ReactNode;
  size?: number;
  color?: string;
  weight?: 'reg' | 'med' | 'bold';
  num?: boolean; // Space Grotesk สำหรับตัวเลข/เวลา
  style?: TextStyle | TextStyle[];
  numberOfLines?: number;
}

export function Txt({ children, size = 14, color, weight = 'reg', num, style, numberOfLines }: TxtProps) {
  const t = useTokens();
  const family = num
    ? weight === 'bold'
      ? FONT.numBold
      : FONT.num
    : weight === 'bold'
      ? FONT.uiBold
      : weight === 'med'
        ? FONT.uiMed
        : FONT.ui;
  return (
    <Text numberOfLines={numberOfLines} style={[{ fontSize: size, color: color ?? t.ink, fontFamily: family }, style]}>
      {children}
    </Text>
  );
}

export function Card({ children, style, tone = 'card' }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[]; tone?: 'card' | 'card2' }) {
  const t = useTokens();
  return (
    <View style={[{ backgroundColor: t[tone], borderRadius: 12, borderWidth: 1, borderColor: t.line, padding: 14 }, style]}>
      {children}
    </View>
  );
}

interface ChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
  color?: string; // สีตอน active (ค่าปกติ = ink)
  small?: boolean;
  icon?: string;
}

export function Chip({ label, active, onPress, color, small, icon }: ChipProps) {
  const t = useTokens();
  const theme = useSettings((s) => s.theme);
  const bg = active ? (color ?? t.ink) : t.chip;
  const fg = active ? (theme === 'dark' && !color ? '#141009' : '#FFFFFF') : t.sub;
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: bg,
        borderRadius: 10,
        paddingHorizontal: small ? 10 : 14,
        paddingVertical: small ? 5 : 8,
      }}>
      {icon ? <Icon name={icon} size={small ? 12 : 14} color={fg} /> : null}
      <Txt size={small ? 12 : 13} color={fg} weight="med">
        {label}
      </Txt>
    </Pressable>
  );
}

export function ChipRow({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, style]}>{children}</View>;
}

interface SegmentedProps<K extends string> {
  /** icon = ชื่อจาก components/icon.tsx, iconColor = สีไอคอนตอน active (ตอน inactive จางตามป้าย) */
  options: { key: K; label: string; icon?: string; iconColor?: string }[];
  value: K;
  onChange: (k: K) => void;
}

export function Segmented<K extends string>({ options, value, onChange }: SegmentedProps<K>) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.chip, borderRadius: 99, padding: 3 }}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              paddingVertical: 7,
              borderRadius: 99,
              backgroundColor: active ? t.card : 'transparent',
            }}>
            {o.icon ? <Icon name={o.icon} size={14} color={active ? (o.iconColor ?? t.ink) : t.sub} /> : null}
            <Txt size={13} weight={active ? 'bold' : 'med'} color={active ? t.ink : t.sub}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const t = useTokens();
  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={{
        width: 50,
        height: 30,
        borderRadius: 99,
        padding: 3,
        backgroundColor: value ? ACCENT : t.line2,
        alignItems: value ? 'flex-end' : 'flex-start',
        justifyContent: 'center',
      }}>
      <View style={{ width: 24, height: 24, borderRadius: 99, backgroundColor: '#FFFFFF' }} />
    </Pressable>
  );
}

interface BtnProps {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost' | 'danger' | 'green';
  icon?: string;
  style?: ViewStyle;
  disabled?: boolean;
}

export function Btn({ label, onPress, kind = 'primary', icon, style, disabled }: BtnProps) {
  const t = useTokens();
  const bg = kind === 'primary' ? ACCENT : kind === 'danger' ? '#C0392B' : kind === 'green' ? '#4C9A6A' : t.chip;
  const fg = kind === 'ghost' ? t.ink : '#FFFFFF';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        {
          flexDirection: 'row',
          gap: 6,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bg,
          borderRadius: 14,
          paddingVertical: 12,
          paddingHorizontal: 16,
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}>
      {icon ? <Icon name={icon} size={16} color={fg} /> : null}
      <Txt size={14} weight="bold" color={fg}>
        {label}
      </Txt>
    </Pressable>
  );
}

interface RowProps {
  icon?: string;
  label: string;
  sub?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
}

/** แถวเมนูตั้งค่า */
export function Row({ icon, label, sub, right, onPress, last }: RowProps) {
  const t = useTokens();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 13,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: t.line2,
      }}>
      {icon ? (
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={17} color={t.sub} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Txt size={14} weight="med">
          {label}
        </Txt>
        {sub ? (
          <Txt size={12} color={t.faint}>
            {sub}
          </Txt>
        ) : null}
      </View>
      {right ?? (onPress ? <Icon name="chevR" size={18} color={t.faint} /> : null)}
    </Pressable>
  );
}

/** ป้าย priority ของเคส */
export function PriBadge({ id, withLabel }: { id: PriorityId | null; withLabel?: boolean }) {
  const p = id ? PRI_BY_ID[id] : null;
  if (!p) return null;
  return (
    <View style={{ backgroundColor: p.color, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <Txt size={10} color="#FFFFFF" weight="bold">
        {withLabel ? `${p.id} ${p.label}` : p.id}
      </Txt>
    </View>
  );
}
