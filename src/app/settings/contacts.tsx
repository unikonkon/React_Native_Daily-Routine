// 6.2 สมุดรายชื่อ — CRUD รายชื่อคนที่นัด (ใช้เลือกในฟอร์มนัดเคส)
import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { FONT, PRI, PRI_BY_ID, type PriorityId } from '@/constants/theme';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { Btn, Card, Chip, ChipRow, PriBadge, Row, Txt, useTokens } from '@/components/ui';
import type { Contact } from '@/lib/types';
import { useContacts } from '@/stores/contacts';
import { useUI } from '@/stores/ui';

export default function ContactsScreen() {
  const t = useTokens();
  const { list, upsert, remove } = useContacts();
  const showToast = useUI((s) => s.showToast);
  const scrollRef = useRef<ScrollView>(null);

  const [editing, setEditing] = useState<Partial<Contact> | null>(null);
  const [priFilter, setPriFilter] = useState<PriorityId | null>(null); // กรองตามระดับความสำคัญ
  const [query, setQuery] = useState(''); // ค้นหาชื่อ

  // จำนวนรายชื่อต่อระดับ (สำหรับป้ายตัวกรอง)
  const countByPri = useMemo(() => {
    const m = {} as Record<PriorityId, number>;
    for (const c of list) m[c.priority] = (m[c.priority] ?? 0) + 1;
    return m;
  }, [list]);

  // รายชื่อหลังกรอง: ระดับ + คำค้นชื่อ
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((c) => (!priFilter || c.priority === priFilter) && (!q || c.name.toLowerCase().includes(q)));
  }, [list, priFilter, query]);

  // แตะรายชื่อ → เปิดฟอร์มแก้ไข แล้วเลื่อนขึ้นไปที่ฟอร์ม (ฟอร์มอยู่บนสุดของหน้า)
  const editContact = (c: Contact) => {
    setEditing(c);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const save = async () => {
    const name = editing?.name?.trim();
    if (!name) return showToast('ใส่ชื่อก่อน');
    await upsert({
      id: editing?.id,
      name,
      priority: (editing?.priority as PriorityId) ?? 'P6',
      phone: editing?.phone || null,
      line: editing?.line || null,
      email: editing?.email || null,
      zoom: editing?.zoom || null,
      googlemeet: editing?.googlemeet || null,
      note: editing?.note || null,
    });
    setEditing(null);
    showToast('บันทึกรายชื่อแล้ว ✓');
  };

  return (
    <Screen title="สมุดรายชื่อ" subtitle={`${list.length} รายชื่อ`} back scrollRef={scrollRef}>
      {editing ? (
        <Card style={{ gap: 10 }}>
          <Txt size={14} weight="bold">{editing.id ? 'แก้ไขรายชื่อ' : 'เพิ่มรายชื่อใหม่'}</Txt>
          <Input value={editing.name ?? ''} placeholder="ชื่อ *" onChange={(name) => setEditing({ ...editing, name })} />
          <Input value={editing.phone ?? ''} placeholder="เบอร์โทร (ไม่บังคับ)" onChange={(phone) => setEditing({ ...editing, phone })} />
          <Input value={editing.line ?? ''} placeholder="LINE ID (ไม่บังคับ)" onChange={(line) => setEditing({ ...editing, line })} />
          <Input value={editing.email ?? ''} placeholder="อีเมล (ไม่บังคับ)" onChange={(email) => setEditing({ ...editing, email })} />
          <Input value={editing.zoom ?? ''} placeholder="ลิงก์ Zoom หรือ Meeting ID (ไม่บังคับ)" onChange={(zoom) => setEditing({ ...editing, zoom })} />
          <Input value={editing.googlemeet ?? ''} placeholder="ลิงก์ Google Meet หรือรหัสห้อง (ไม่บังคับ)" onChange={(googlemeet) => setEditing({ ...editing, googlemeet })} />
          <Txt size={11} color={t.faint}>
            Zoom/Meet ใส่ได้ทั้งลิงก์เต็ม หรือแค่ Meeting ID (เช่น 123 4567 8901) / รหัสห้อง Meet (เช่น abc-defg-hij) — ระบบจะประกอบลิงก์เปิดแอปให้อัตโนมัติ
          </Txt>
          <Input value={editing.note ?? ''} placeholder="หมายเหตุ / ข้อมูลอื่น ๆ (ไม่บังคับ)" onChange={(note) => setEditing({ ...editing, note })} multiline />

          <Txt size={13} weight="med" color={t.sub}>ระดับความสำคัญประจำตัว</Txt>
          <Txt size={12} color={t.faint}>ระดับตั้งต้นเมื่อเลือกคนนี้ในนัดเคส — เลือกได้ 6 ระดับ (P1 สำคัญสุด → P6 ทั่วไป)</Txt>
          <ChipRow>
            {PRI.map((p) => (
              <Chip
                key={p.id}
                small
                label={`${p.id} · ${p.label}`}
                color={p.color}
                active={(editing.priority ?? 'P6') === p.id}
                onPress={() => setEditing({ ...editing, priority: p.id })}
              />
            ))}
          </ChipRow>
          <Txt size={12} weight="med" color={PRI_BY_ID[(editing.priority ?? 'P6') as PriorityId].color}>
            เลือก: {PRI_BY_ID[(editing.priority ?? 'P6') as PriorityId].id} · {PRI_BY_ID[(editing.priority ?? 'P6') as PriorityId].label}
          </Txt>
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

      {/* ตัวกรอง — ค้นหาชื่อ + เลือกดูตามระดับความสำคัญ (เคสแต่ละระดับคืออะไร) */}
      {list.length > 0 ? (
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.card2, borderRadius: 12, borderWidth: 1, borderColor: t.line, paddingHorizontal: 12 }}>
            <Icon name="search" size={16} color={t.faint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="ค้นหาชื่อ…"
              placeholderTextColor={t.faint}
              style={{ flex: 1, paddingVertical: 11, color: t.ink, fontFamily: FONT.ui, fontSize: 14 }}
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={6}>
                <Icon name="x" size={16} color={t.faint} />
              </Pressable>
            ) : null}
          </View>

          <View style={{ gap: 2 }}>
            <Txt size={12} weight="bold" color={t.sub}>กรองตามระดับความสำคัญ</Txt>
            <FilterRow
              badge={<View style={{ width: 26, alignItems: 'center' }}><Icon name="users" size={15} color={t.sub} /></View>}
              label="ทั้งหมด"
              count={list.length}
              active={priFilter === null}
              onPress={() => setPriFilter(null)}
            />
            {PRI.map((p) => (
              <FilterRow
                key={p.id}
                tint={p.color}
                badge={
                  <View style={{ backgroundColor: p.color, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, minWidth: 26, alignItems: 'center' }}>
                    <Txt size={11} weight="bold" color="#FFFFFF">{p.id}</Txt>
                  </View>
                }
                label={p.label}
                count={countByPri[p.id] ?? 0}
                active={priFilter === p.id}
                onPress={() => setPriFilter(priFilter === p.id ? null : p.id)}
              />
            ))}
          </View>
        </Card>
      ) : null}

      <Card>
        {list.length === 0 ? (
          <Txt size={13} color={t.faint} style={{ textAlign: 'center', paddingVertical: 10 }}>
            ยังไม่มีรายชื่อ — เพิ่มรายชื่อคนที่นัดเป็นประจำไว้เลือกซ้ำได้
          </Txt>
        ) : filtered.length === 0 ? (
          <Txt size={13} color={t.faint} style={{ textAlign: 'center', paddingVertical: 10 }}>
            ไม่พบรายชื่อที่ตรงกับตัวกรอง — ลองล้างคำค้นหรือเลือก “ทั้งหมด”
          </Txt>
        ) : (
          filtered.map((c, i) => (
            <Row
              key={c.id}
              label={c.name}
              sub={[c.phone, c.line && `LINE: ${c.line}`, c.email, c.zoom && 'Zoom', c.googlemeet && 'Meet', c.note].filter(Boolean).join(' · ') || undefined}
              last={i === filtered.length - 1}
              onPress={() => editContact(c)}
              right={<PriBadge id={c.priority} />}
            />
          ))
        )}
      </Card>
    </Screen>
  );
}

/** แถวตัวกรองระดับความสำคัญ — ป้าย + คำอธิบาย + จำนวน (ไฮไลต์เมื่อเลือก) */
function FilterRow({ badge, label, count, active, tint, onPress }: { badge: React.ReactNode; label: string; count: number; active: boolean; tint?: string; onPress: () => void }) {
  const t = useTokens();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 7,
        paddingHorizontal: 8,
        borderRadius: 10,
        backgroundColor: active ? (tint ? tint + '1F' : t.chip) : 'transparent',
        opacity: count === 0 && !active ? 0.45 : 1,
      }}>
      {badge}
      <Txt size={13} weight="med" style={{ flex: 1 }} numberOfLines={1}>{label}</Txt>
      <Txt size={13} num weight="bold" color={t.sub}>{count}</Txt>
    </Pressable>
  );
}

function Input({ value, placeholder, onChange, multiline }: { value: string; placeholder: string; onChange: (v: string) => void; multiline?: boolean }) {
  const t = useTokens();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={t.faint}
      multiline={multiline}
      style={{
        backgroundColor: t.card2,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: t.line,
        padding: 12,
        color: t.ink,
        fontFamily: FONT.ui,
        fontSize: 14,
        minHeight: multiline ? 64 : undefined,
        textAlignVertical: multiline ? 'top' : 'center',
      }}
    />
  );
}
