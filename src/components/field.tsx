// ช่องกรอกแบบมีป้ายกำกับ + ปุ่ม "วาง" จากคลิปบอร์ด (ไม่บังคับ) — ใช้ร่วมกันในหน้าสมุดรายชื่อและฟอร์มนัดเคส (โหมดช่องทางติดต่อ)
import React from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Txt, useTokens } from '@/components/ui';
import { FONT } from '@/constants/theme';

export function Field({
  label,
  value,
  onChange,
  optional,
  placeholder,
  multiline,
  keyboard,
  autoFocus,
  onPaste,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  optional?: boolean;
  placeholder?: string;
  multiline?: boolean;
  keyboard?: 'phone-pad' | 'email-address';
  autoFocus?: boolean;
  /** ปุ่ม "วาง" จากคลิปบอร์ดท้ายช่อง */
  onPaste?: () => void;
}) {
  const t = useTokens();
  return (
    <View style={{ gap: 5 }}>
      <Txt size={12.5} color={t.sub}>
        {label}
        {optional ? <Txt size={12.5} color={t.faint}>{' (ไม่บังคับ)'}</Txt> : null}
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', gap: 8, minHeight: multiline ? 72 : 46, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: t.line, backgroundColor: t.bg }}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={t.faint}
          accessibilityLabel={label}
          multiline={multiline}
          keyboardType={keyboard}
          autoFocus={autoFocus}
          autoCapitalize={keyboard === 'email-address' ? 'none' : undefined}
          style={{ flex: 1, minWidth: 0, color: t.ink, fontFamily: FONT.ui, fontSize: 15, paddingVertical: multiline ? 10 : 0, textAlignVertical: multiline ? 'top' : 'center' }}
        />
        {/* วางจากคลิปบอร์ด — แสดงตลอด (มีค่าอยู่แล้วก็วางทับได้) */}
        {onPaste ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`วาง${label}`} onPress={onPaste} hitSlop={6} style={({ pressed }) => ({ height: 32, paddingHorizontal: 10, borderRadius: 16, backgroundColor: pressed ? t.rail : t.track, justifyContent: 'center' })}>
            <Txt size={12.5} weight="bold" color={t.sub}>
              วาง
            </Txt>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
