// ช่องกรอกแบบมีป้ายกำกับ + ปุ่ม "วาง" จากคลิปบอร์ด (ไม่บังคับ) — ใช้ร่วมกันในหน้าสมุดรายชื่อและฟอร์มนัดเคส (โหมดช่องทางติดต่อ)
import React from 'react';
import { Pressable, TextInput, View, type TextInputInstance } from 'react-native';

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
  error,
  inputRef,
  onSubmit,
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
  /** ข้อความผิดพลาดใต้ช่อง (ขอบช่องเป็นสีเตือน) — บอกตรงช่องที่ต้องแก้ แทน toast ที่หายเอง */
  error?: string;
  /** ref ของช่อง — ให้ช่องก่อนหน้าส่งเคอร์เซอร์มาต่อด้วยปุ่ม "ถัดไป" บนคีย์บอร์ด */
  inputRef?: React.Ref<TextInputInstance>;
  /** กดปุ่ม "ถัดไป" บนคีย์บอร์ด (ช่องบรรทัดเดียว) — ไม่ส่ง = ปุ่มเป็น "เสร็จ" หุบคีย์บอร์ด */
  onSubmit?: () => void;
}) {
  const t = useTokens();
  return (
    <View style={{ gap: 5 }}>
      <Txt size={12.5} color={t.sub}>
        {label}
        {optional ? <Txt size={12.5} color={t.faint}>{' (ไม่บังคับ)'}</Txt> : null}
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', gap: 8, minHeight: multiline ? 72 : 46, paddingHorizontal: 12, borderRadius: 12, borderWidth: error ? 1.5 : 1, borderColor: error ? t.warn : t.line, backgroundColor: t.bg }}>
        <TextInput
          ref={inputRef}
          returnKeyType={multiline ? undefined : onSubmit ? 'next' : 'done'}
          submitBehavior={multiline ? undefined : onSubmit ? 'submit' : 'blurAndSubmit'}
          onSubmitEditing={multiline ? undefined : onSubmit}
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
      {error ? (
        <Txt size={12} weight="med" color={t.warn}>
          {error}
        </Txt>
      ) : null}
    </View>
  );
}
