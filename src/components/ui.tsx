// UI primitives ชุดเดียวใช้ทั้งแอป — การ์ด / ชิป / segmented / toggle / ปุ่ม / แถวตั้งค่า
import React from 'react';
import { Pressable, StyleSheet, Text, TextStyle, View, ViewStyle, useColorScheme } from 'react-native';

import { Icon } from '@/components/icon';
import { FONT, GREEN, PALETTES, PRI_BY_ID, type Palette, type PriorityId, type ThemeName } from '@/constants/theme';
import { useSettings } from '@/stores/settings';

/** ธีมที่ใช้จริง — "ตามระบบ" อ่านจากเครื่อง (เปลี่ยนตามทันทีเมื่อผู้ใช้สลับโหมดมืดของเครื่อง) */
export function useThemeName(): ThemeName {
  const pref = useSettings((s) => s.theme);
  const sys = useColorScheme();
  return pref === 'system' ? (sys === 'dark' ? 'dark' : 'light') : pref;
}

/** palette ตามธีมปัจจุบัน */
export function useTokens(): Palette {
  return PALETTES[useThemeName()];
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
    // ระบบ B1 — การ์ดขาวมุม 16 + เงาบาง (ไม่มีเส้นขอบ) · card2 = พื้นรองในการ์ด (ไม่มีเงา)
    <View
      style={[
        tone === 'card'
          ? { backgroundColor: t.card, borderRadius: 16, padding: 14, shadowColor: '#221C13', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }
          : { backgroundColor: t.card2, borderRadius: 12, padding: 12 },
        style,
      ]}>
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
  const theme = useThemeName();
  // ระบบ B1 — ชิปทรงแคปซูลสูง 34/40 (แตะง่าย) · ไม่เลือก = พื้นราง · เลือก = หมึกเข้ม (หรือสีที่ส่งมา)
  const bg = active ? (color ?? t.ink) : t.track;
  const fg = active ? (theme === 'dark' && !color ? '#141009' : '#FFFFFF') : t.sub;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: pressed && !active ? t.rail : bg,
        borderRadius: small ? 17 : 20,
        height: small ? 34 : 40,
        paddingHorizontal: small ? 13 : 16,
      })}>
      {icon ? <Icon name={icon} size={small ? 13 : 15} color={fg} /> : null}
      <Txt size={small ? 13 : 14} color={fg} weight={active ? 'bold' : 'med'}>
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
    // ระบบ B1 — รางสีเบจ มุม 14 · ตัวที่เลือก = การ์ดขาวมีเงาบาง
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: t.track, borderRadius: 14, padding: 3, gap: 2 }}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.key)}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              minHeight: 40,
              paddingHorizontal: 4,
              borderRadius: 11,
              backgroundColor: active ? t.card : 'transparent',
              shadowColor: '#221C13',
              shadowOpacity: active ? 0.12 : 0,
              shadowRadius: 3,
              shadowOffset: { width: 0, height: 1 },
              elevation: active ? 1 : 0,
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

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label?: string }) {
  const t = useTokens();
  // ระบบ B1 — สวิตช์เขียวเมื่อเปิด · พื้นที่แตะ 52×44
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      onPress={() => onChange(!value)}
      style={{ width: 52, height: 44, marginRight: -4, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: 46,
          height: 28,
          borderRadius: 14,
          padding: 3,
          backgroundColor: value ? GREEN : t.railDash,
          alignItems: value ? 'flex-end' : 'flex-start',
          justifyContent: 'center',
        }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF', shadowColor: '#221C13', shadowOpacity: 0.25, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 }} />
      </View>
    </Pressable>
  );
}

interface BtnProps {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost' | 'danger' | 'green';
  icon?: string;
  /** วาดไอคอนเอง (เช่น SVG) — รับสี/ขนาดจากปุ่มเพื่อให้เข้าธีม; ทับ icon เมื่อกำหนด */
  renderIcon?: (color: string, size: number) => React.ReactNode;
  style?: ViewStyle;
  disabled?: boolean;
}

export function Btn({ label, onPress, kind = 'primary', icon, renderIcon, style, disabled }: BtnProps) {
  const t = useTokens();
  // ระบบ B1 — ปุ่มแคปซูลสูง 48 · หลัก = ส้มเข้ม · รอง (ghost) = พื้นราง · ลบ = แดงอิฐ
  const bg = kind === 'primary' ? '#B44E2C' : kind === 'danger' ? t.warn : kind === 'green' ? GREEN : t.track;
  const fg = kind === 'ghost' ? t.ink : '#FFFFFF';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          gap: 6,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed && kind === 'ghost' ? t.rail : bg,
          borderRadius: 24,
          minHeight: 48,
          paddingVertical: 10,
          paddingHorizontal: 18,
          opacity: disabled ? 0.45 : pressed && kind !== 'ghost' ? 0.88 : 1,
        },
        style,
      ]}>
      {renderIcon ? renderIcon(fg, 16) : icon ? <Icon name={icon} size={16} color={fg} /> : null}
      <Txt size={14.5} weight="bold" color={fg} style={{ flexShrink: 1, textAlign: 'center' }}>
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
  /** สีของบรรทัดรอง (เช่น เขียวเมื่อสำรองล่าสุดเพิ่งทำ) */
  subColor?: string;
}

/** แถวเมนูตั้งค่า (ระบบ B1) — ไอคอนในกล่องพื้นราง 34px · สูงอย่างน้อย 52 · เส้นคั่นบาง */
export function Row({ icon, label, sub, right, onPress, last, subColor }: RowProps) {
  const t = useTokens();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 52,
        paddingVertical: 8,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: t.line,
        opacity: pressed ? 0.7 : 1,
      })}>
      {icon ? (
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: t.track, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={17} color={t.sub} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt size={14.5}>{label}</Txt>
        {sub ? (
          <Txt size={12} color={subColor ?? t.sub} weight={subColor ? 'bold' : 'reg'}>
            {sub}
          </Txt>
        ) : null}
      </View>
      {right ?? (onPress ? <Icon name="chevR" size={16} color={t.faint} /> : null)}
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
