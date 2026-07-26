// 6.2 จัดการหมวดหมู่ — หมวดคงที่ 6 หมวดตาม prototype แต่แก้ "ลิสต์ตัวเลือก" ของแต่ละหมวดได้
// แตะหมวดเพื่อกาง editor: (1) ตัวเลือกด่วน = ชื่อกิจกรรม · (2) ตัวเลือกย่อยของหมวด = สถานที่ / ประเภท / สื่อ
// ทั้งสองลิสต์ เพิ่ม/แก้/ลบ/คืนค่าเริ่มต้นได้ เก็บลงตาราง settings (stores/settings) และมีผลกับฟอร์มเพิ่มกิจกรรมทันที
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { Btn, Card, Chip, ChipRow, Row, Txt, useTokens } from '@/components/ui';
import { CATS, CAT_OPTIONS, FONT, PRI, QUICK_PICKS, type CatId } from '@/constants/theme';
import { useSettings } from '@/stores/settings';
import { useUI } from '@/stores/ui';

export default function CategoriesScreen() {
  const t = useTokens();
  const quickPicks = useSettings((s) => s.quickPicks);
  const setQuickPicks = useSettings((s) => s.setQuickPicks);
  const catOptions = useSettings((s) => s.catOptions);
  const setCatOptions = useSettings((s) => s.setCatOptions);

  const [open, setOpen] = useState<CatId | null>(null);

  return (
    <Screen title="จัดการหมวดหมู่" subtitle="6 หมวด · แก้ลิสต์ตัวเลือกได้" back>
      <Card>
        {CATS.map((c, i) => {
          const opened = open === c.id;
          const picks = quickPicks[c.id];
          const optionSet = CAT_OPTIONS[c.id];
          const options = catOptions[c.id];
          const subText = [
            `ตัวเลือกด่วน ${picks.length} รายการ`,
            optionSet ? `${optionSet.title} ${options.length} รายการ` : '',
            c.isCase ? 'มีรายชื่อคน + เลื่อนนัดได้' : '',
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <View key={c.id}>
              <Row
                label={c.name}
                sub={subText}
                last={(i === CATS.length - 1 && !opened) || opened}
                onPress={() => setOpen(opened ? null : c.id)}
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
                <View style={{ gap: 12, marginBottom: 10 }}>
                  <ListEditor
                    title="ตัวเลือกด่วน (ชื่อกิจกรรม)"
                    hint="ชิปชื่อกิจกรรมในฟอร์มเพิ่ม — แตะชิปเพื่อแก้ไข/ลบ"
                    color={c.color}
                    values={picks}
                    defaults={QUICK_PICKS[c.id]}
                    onChange={(list) => setQuickPicks(c.id, list)}
                  />
                  {optionSet ? (
                    <ListEditor
                      title={optionSet.title}
                      hint={`ตัวเลือก "${optionSet.title}" ของหมวดนี้ในฟอร์มเพิ่ม — แตะชิปเพื่อแก้ไข/ลบ`}
                      color={c.color}
                      values={options}
                      defaults={optionSet.defaults}
                      onChange={(list) => setCatOptions(c.id, list)}
                    />
                  ) : null}
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
        ชื่อหมวด/สีเป็นชุดมาตรฐานตามดีไซน์ — ลิสต์ตัวเลือกแก้ได้และมีผลกับฟอร์มเพิ่มกิจกรรมทันที
      </Txt>
    </Screen>
  );
}

/**
 * กล่องแก้ไขลิสต์ตัวเลือก 1 ชุด — แตะชิปเพื่อแก้/ลบ · ช่องว่างด้านล่างเพื่อเพิ่มใหม่ · คืนค่าเริ่มต้นได้
 * เก็บ state การแก้ไว้ในตัวเอง ทำให้หลายลิสต์ในหมวดเดียวกันทำงานแยกกันได้
 */
function ListEditor({
  title,
  hint,
  color,
  values,
  defaults,
  onChange,
}: {
  title: string;
  hint: string;
  color: string;
  values: string[];
  defaults: string[];
  onChange: (list: string[]) => void;
}) {
  const t = useTokens();
  const showToast = useUI((s) => s.showToast);
  /** index ของชิปที่กำลังแก้ (null = โหมดเพิ่มใหม่) */
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [text, setText] = useState('');

  const isDefault = values.length === defaults.length && values.every((v, i) => v === defaults[i]);

  const close = () => {
    setEditIdx(null);
    setText('');
  };

  const save = () => {
    const v = text.replace(/\s+/g, ' ').trim();
    if (!v) return showToast('พิมพ์ชื่อตัวเลือกก่อน');
    if (values.some((x, i) => x === v && i !== editIdx)) return showToast('มีตัวเลือกนี้อยู่แล้ว');
    const list = [...values];
    if (editIdx === null) list.push(v);
    else list[editIdx] = v;
    onChange(list);
    close();
    showToast(editIdx === null ? `เพิ่ม${title}แล้ว ✓` : 'แก้ไขแล้ว ✓');
  };

  const removeAt = () => {
    if (editIdx === null) return;
    onChange(values.filter((_, i) => i !== editIdx));
    close();
    showToast('ลบตัวเลือกแล้ว');
  };

  return (
    <View style={{ gap: 10, padding: 12, borderRadius: 12, backgroundColor: t.card2, borderWidth: 1, borderColor: t.line }}>
      <Txt size={13} weight="bold">{title}</Txt>
      <Txt size={12} color={t.sub}>{hint}</Txt>
      <ChipRow>
        {values.map((q, idx) => (
          <Chip
            key={`${q}-${idx}`}
            small
            label={q}
            color={color}
            active={editIdx === idx}
            onPress={() => {
              if (editIdx === idx) close();
              else {
                setEditIdx(idx);
                setText(q);
              }
            }}
          />
        ))}
        {values.length === 0 ? <Txt size={12} color={t.faint}>ยังไม่มีตัวเลือก — เพิ่มด้านล่าง</Txt> : null}
      </ChipRow>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={editIdx === null ? `เพิ่ม${title}ใหม่…` : 'แก้ไขชื่อตัวเลือก…'}
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
            <Btn style={{ flex: 1 }} kind="ghost" label="ยกเลิก" onPress={close} />
            <Btn style={{ flex: 1 }} kind="danger" label="ลบ" onPress={removeAt} />
          </>
        ) : null}
        <Btn style={{ flex: 1 }} label={editIdx === null ? '+ เพิ่ม' : 'บันทึก'} disabled={!text.trim()} onPress={save} />
      </View>
      {!isDefault ? <Btn kind="ghost" label="คืนค่าเริ่มต้นของลิสต์นี้" onPress={() => { onChange(defaults); close(); showToast('คืนค่าเริ่มต้นแล้ว ✓'); }} /> : null}
    </View>
  );
}
