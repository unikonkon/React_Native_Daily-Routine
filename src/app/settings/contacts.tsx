// 6.2 สมุดรายชื่อ — CRUD รายชื่อคนที่นัด (ใช้เลือกในฟอร์มนัดเคส)
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';

import { FONT, PRI, type PriorityId } from '@/constants/theme';
import { Screen } from '@/components/screen';
import { Btn, Card, Chip, ChipRow, PriBadge, Row, Txt, useTokens } from '@/components/ui';
import type { Contact } from '@/lib/types';
import { useContacts } from '@/stores/contacts';
import { useUI } from '@/stores/ui';

export default function ContactsScreen() {
  const t = useTokens();
  const { list, upsert, remove } = useContacts();
  const showToast = useUI((s) => s.showToast);

  const [editing, setEditing] = useState<Partial<Contact> | null>(null);

  const save = async () => {
    const name = editing?.name?.trim();
    if (!name) return showToast('ใส่ชื่อก่อน');
    await upsert({
      id: editing?.id,
      name,
      priority: (editing?.priority as PriorityId) ?? 'P6',
      phone: editing?.phone || null,
      line: editing?.line || null,
    });
    setEditing(null);
    showToast('บันทึกรายชื่อแล้ว ✓');
  };

  return (
    <Screen title="สมุดรายชื่อ" subtitle={`${list.length} รายชื่อ`} back>
      {editing ? (
        <Card style={{ gap: 10 }}>
          <Txt size={14} weight="bold">{editing.id ? 'แก้ไขรายชื่อ' : 'เพิ่มรายชื่อใหม่'}</Txt>
          <Input value={editing.name ?? ''} placeholder="ชื่อ *" onChange={(name) => setEditing({ ...editing, name })} />
          <Input value={editing.phone ?? ''} placeholder="เบอร์โทร (ไม่บังคับ)" onChange={(phone) => setEditing({ ...editing, phone })} />
          <Input value={editing.line ?? ''} placeholder="LINE ID (ไม่บังคับ)" onChange={(line) => setEditing({ ...editing, line })} />
          <Txt size={13} weight="med" color={t.sub}>ระดับความสำคัญประจำตัว</Txt>
          <ChipRow>
            {PRI.map((p) => (
              <Chip
                key={p.id}
                small
                label={p.id}
                color={p.color}
                active={(editing.priority ?? 'P6') === p.id}
                onPress={() => setEditing({ ...editing, priority: p.id })}
              />
            ))}
          </ChipRow>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn style={{ flex: 1 }} kind="ghost" label="ยกเลิก" onPress={() => setEditing(null)} />
            {editing.id ? (
              <Btn
                style={{ flex: 1 }}
                kind="danger"
                label="ลบ"
                onPress={() => {
                  remove(editing.id!);
                  setEditing(null);
                  showToast('ลบรายชื่อแล้ว');
                }}
              />
            ) : null}
            <Btn style={{ flex: 1 }} label="บันทึก" onPress={save} />
          </View>
        </Card>
      ) : (
        <Btn label="+ เพิ่มรายชื่อใหม่" onPress={() => setEditing({})} />
      )}

      <Card>
        {list.length === 0 ? (
          <Txt size={13} color={t.faint} style={{ textAlign: 'center', paddingVertical: 10 }}>
            ยังไม่มีรายชื่อ — เพิ่มรายชื่อคนที่นัดเป็นประจำไว้เลือกซ้ำได้
          </Txt>
        ) : (
          list.map((c, i) => (
            <Row
              key={c.id}
              label={c.name}
              sub={[c.phone, c.line && `LINE: ${c.line}`].filter(Boolean).join(' · ') || undefined}
              last={i === list.length - 1}
              onPress={() => setEditing(c)}
              right={<PriBadge id={c.priority} />}
            />
          ))
        )}
      </Card>
    </Screen>
  );
}

function Input({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (v: string) => void }) {
  const t = useTokens();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={t.faint}
      style={{ backgroundColor: t.card2, borderRadius: 12, borderWidth: 1, borderColor: t.line, padding: 12, color: t.ink, fontFamily: FONT.ui, fontSize: 14 }}
    />
  );
}
