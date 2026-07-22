// 6.2 จัดการหมวดหมู่ — หมวดคงที่ 6 หมวดตาม prototype แต่แก้ quick picks (ตัวเลือกด่วน) ต่อหมวดได้
// แตะหมวดเพื่อกาง editor: เพิ่ม/แก้/ลบชิป + คืนค่าเริ่มต้น — เก็บลงตาราง settings (stores/settings)
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { Btn, Card, Chip, ChipRow, Row, Txt, useTokens } from '@/components/ui';
import { CATS, FONT, PRI, QUICK_PICKS, type CatId } from '@/constants/theme';
import { useSettings } from '@/stores/settings';
import { useUI } from '@/stores/ui';

export default function CategoriesScreen() {
  const t = useTokens();
  const quickPicks = useSettings((s) => s.quickPicks);
  const setQuickPicks = useSettings((s) => s.setQuickPicks);
  const showToast = useUI((s) => s.showToast);

  const [open, setOpen] = useState<CatId | null>(null);
  /** index ของชิปที่กำลังแก้ (null = โหมดเพิ่มใหม่) */
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [text, setText] = useState('');

  const closeEditor = () => {
    setEditIdx(null);
    setText('');
  };

  const toggle = (id: CatId) => {
    setOpen(open === id ? null : id);
    closeEditor();
  };

  const save = (cat: CatId) => {
    const v = text.replace(/\s+/g, ' ').trim();
    if (!v) return showToast('พิมพ์ชื่อตัวเลือกก่อน');
    const list = [...quickPicks[cat]];
    if (list.some((x, i) => x === v && i !== editIdx)) return showToast('มีตัวเลือกนี้อยู่แล้ว');
    if (editIdx === null) list.push(v);
    else list[editIdx] = v;
    setQuickPicks(cat, list);
    closeEditor();
    showToast(editIdx === null ? 'เพิ่มตัวเลือกแล้ว ✓' : 'แก้ไขแล้ว ✓');
  };

  const removeAt = (cat: CatId) => {
    if (editIdx === null) return;
    setQuickPicks(cat, quickPicks[cat].filter((_, i) => i !== editIdx));
    closeEditor();
    showToast('ลบตัวเลือกแล้ว');
  };

  const reset = (cat: CatId) => {
    setQuickPicks(cat, QUICK_PICKS[cat]);
    closeEditor();
    showToast('คืนค่าเริ่มต้นแล้ว ✓');
  };

  return (
    <Screen title="จัดการหมวดหมู่" subtitle="6 หมวด · แก้ตัวเลือกด่วนได้" back>
      <Card>
        {CATS.map((c, i) => {
          const opened = open === c.id;
          const picks = quickPicks[c.id];
          const isDefault =
            picks.length === QUICK_PICKS[c.id].length && picks.every((v, idx) => v === QUICK_PICKS[c.id][idx]);
          return (
            <View key={c.id}>
              <Row
                label={c.name}
                sub={`ตัวเลือกด่วน ${picks.length} รายการ${c.isCase ? ' · มีรายชื่อคน + เลื่อนนัดได้' : ''}`}
                last={(i === CATS.length - 1 && !opened) || opened}
                onPress={() => toggle(c.id)}
                right={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Icon name={opened ? 'chevD' : 'chevR'} size={16} color={t.faint} />
                    <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: c.color + '22', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={c.icon} size={17} color={c.color} />
                    </View>
                  </View>
                }
              />
              {opened ? (
                <View
                  style={{
                    gap: 10,
                    padding: 12,
                    marginBottom: 10,
                    borderRadius: 12,
                    backgroundColor: t.card2,
                    borderWidth: 1,
                    borderColor: t.line,
                  }}>
                  <Txt size={12} color={t.sub}>ตัวเลือกด่วนในฟอร์มเพิ่มกิจกรรม — แตะชิปเพื่อแก้ไข/ลบ</Txt>
                  <ChipRow>
                    {picks.map((q, idx) => (
                      <Chip
                        key={`${q}-${idx}`}
                        small
                        label={q}
                        color={c.color}
                        active={editIdx === idx}
                        onPress={() => {
                          if (editIdx === idx) closeEditor();
                          else {
                            setEditIdx(idx);
                            setText(q);
                          }
                        }}
                      />
                    ))}
                    {picks.length === 0 ? <Txt size={12} color={t.faint}>ยังไม่มีตัวเลือก — เพิ่มด้านล่าง</Txt> : null}
                  </ChipRow>
                  <TextInput
                    value={text}
                    onChangeText={setText}
                    placeholder={editIdx === null ? 'เพิ่มตัวเลือกใหม่…' : 'แก้ไขชื่อตัวเลือก…'}
                    placeholderTextColor={t.faint}
                    style={{
                      backgroundColor: t.card,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: t.line,
                      padding: 12,
                      color: t.ink,
                      fontFamily: FONT.ui,
                      fontSize: 14,
                    }}
                  />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {editIdx !== null ? (
                      <>
                        <Btn style={{ flex: 1 }} kind="ghost" label="ยกเลิก" onPress={closeEditor} />
                        <Btn style={{ flex: 1 }} kind="danger" label="ลบ" onPress={() => removeAt(c.id)} />
                      </>
                    ) : null}
                    <Btn style={{ flex: 1 }} label={editIdx === null ? '+ เพิ่ม' : 'บันทึก'} onPress={() => save(c.id)} />
                  </View>
                  {!isDefault ? <Btn kind="ghost" label="คืนค่าเริ่มต้นของหมวดนี้" onPress={() => reset(c.id)} /> : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </Card>

      <Card>
        <Txt size={12} weight="bold" color={t.faint} style={{ marginBottom: 4 }}>ระดับความสำคัญของเคส (P1–P6)</Txt>
        {PRI.map((p, i) => (
          <Row
            key={p.id}
            label={`${p.id} · ${p.label}`}
            last={i === PRI.length - 1}
            right={<View style={{ width: 18, height: 18, borderRadius: 6, backgroundColor: p.color }} />}
          />
        ))}
      </Card>

      <Txt size={11} color={t.faint} style={{ textAlign: 'center' }}>
        ชื่อหมวด/สีเป็นชุดมาตรฐานตามดีไซน์ — ตัวเลือกด่วนแก้ได้และมีผลกับฟอร์มเพิ่มกิจกรรมทันที
      </Txt>
    </Screen>
  );
}
