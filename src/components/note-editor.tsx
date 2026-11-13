// แก้ค่าโน้ตของหมวดหนึ่ง (ข้อความตัวอย่าง · แม่แบบ · ถามโน้ตเมื่อติ๊กว่าทำแล้ว) — ใช้ร่วมหน้าหมวดหมู่และหน้าจัดการโน้ต
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';

import { Btn, Toggle, Txt, useTokens } from '@/components/ui';
import { FONT, type NoteCfg } from '@/constants/theme';
import { useUI } from '@/stores/ui';

/**
 * โน้ตรายครั้งของหมวด — ข้อความตัวอย่างในช่องโน้ต · แม่แบบ · ถามโน้ตเมื่อติ๊กว่าทำแล้ว
 * ช่องข้อความเก็บค่าที่กำลังพิมพ์ไว้ในตัวเอง แล้วบันทึกเมื่อออกจากช่อง (ไม่เขียนลง DB ทุกตัวอักษร)
 */
export function NoteEditor({ cfg, defaults, onChange }: { cfg: NoteCfg; defaults: NoteCfg; onChange: (patch: Partial<NoteCfg>) => void }) {
  const t = useTokens();
  const showToast = useUI((s) => s.showToast);
  const [hint, setHint] = useState(cfg.hint);
  const [template, setTemplate] = useState(cfg.template);
  const isDefault = cfg.hint === defaults.hint && cfg.template === defaults.template && cfg.askOnDone === defaults.askOnDone;
  const input = { backgroundColor: t.card, borderRadius: 12, borderWidth: 1, borderColor: t.line, paddingHorizontal: 12, color: t.ink, fontFamily: FONT.ui, fontSize: 14 } as const;

  return (
    <View style={{ gap: 10, padding: 12, borderRadius: 12, backgroundColor: t.card2, borderWidth: 1, borderColor: t.line }}>
      <Txt size={13} weight="bold">โน้ตของแต่ละครั้ง</Txt>

      <View style={{ gap: 5 }}>
        <Txt size={12} color={t.sub}>ข้อความตัวอย่างในช่องโน้ต</Txt>
        <TextInput
          value={hint}
          onChangeText={setHint}
          onBlur={() => hint !== cfg.hint && onChange({ hint: hint.trim() })}
          placeholder="เช่น สรุปสั้น ๆ ของครั้งนี้"
          placeholderTextColor={t.faint}
          accessibilityLabel="ข้อความตัวอย่างในช่องโน้ต"
          style={{ ...input, height: 44 }}
        />
      </View>

      <View style={{ gap: 5 }}>
        <Txt size={12} color={t.sub}>
          แม่แบบโน้ต <Txt size={12} color={t.faint}>(ไม่บังคับ · บรรทัดละหัวข้อ)</Txt>
        </Txt>
        <TextInput
          value={template}
          onChangeText={setTemplate}
          onBlur={() => template !== cfg.template && onChange({ template: template.replace(/\s+$/, '') ? template : '' })}
          placeholder={'เช่น\nท่า:\nน้ำหนัก:'}
          placeholderTextColor={t.faint}
          multiline
          accessibilityLabel="แม่แบบโน้ต"
          style={{ ...input, minHeight: 84, paddingTop: 10, paddingBottom: 10, textAlignVertical: 'top' }}
        />
        <Txt size={11.5} color={t.faint}>
          แตะช่องโน้ตที่ยังว่าง → เติมหัวข้อให้ · หัวข้อที่ไม่ได้กรอกถูกตัดออกตอนบันทึก
        </Txt>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Txt size={13} weight="med">ถามโน้ตเมื่อติ๊กว่าทำแล้ว</Txt>
          <Txt size={11.5} color={t.faint}>ติ๊กวงกลมบนรายการแล้วมีปุ่ม &quot;จดโน้ต&quot; ให้กดต่อ</Txt>
        </View>
        <Toggle value={cfg.askOnDone} onChange={(askOnDone) => onChange({ askOnDone })} label="ถามโน้ตเมื่อติ๊กว่าทำแล้ว" />
      </View>

      {!isDefault ? (
        <Btn
          kind="ghost"
          label="คืนค่าเริ่มต้นของโน้ต"
          onPress={() => {
            onChange(defaults);
            setHint(defaults.hint);
            setTemplate(defaults.template);
            showToast('คืนค่าเริ่มต้นแล้ว ✓');
          }}
        />
      ) : null}
    </View>
  );
}
