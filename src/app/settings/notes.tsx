// 6.x จัดการโน้ต — รวมทุกอย่างเรื่องโน้ตรายครั้งไว้ที่เดียว แยกการ์ดตาม "จุดที่โน้ตไปแสดง" + ตัวอย่างสดที่เปลี่ยนทันทีเมื่อปรับค่า
// (1) การ์ดรายการ · (2) แผ่นรายละเอียด · (3) ฟอร์มเพิ่ม/แก้ไข · (4) ส่งออกและแจ้งเตือน
// (5) โน้ตสำเร็จรูป: เพิ่ม/แก้/ลบ · ปักหมุด (ขึ้นก่อน เรียง ↑↓ ได้) · ซ่อน (ไม่ขึ้นเป็นชิป) — รายการเรียงตามลำดับชิปจริง
// (6) ค่าต่อหมวด: ข้อความตัวอย่าง · แม่แบบ · ถามเมื่อติ๊กเสร็จ (ค่าเดียวกับหน้าหมวดหมู่ — editor ใช้ร่วม components/note-editor)
// ทุกค่าในหน้านี้เป็นการตั้งค่า — โน้ตที่จดไปแล้วเก็บแยก (occ_notes) จึงไม่ถูกแก้/ลบจากหน้านี้
import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { StatusDot } from '@/components/b1/status-circle';
import { Icon } from '@/components/icon';
import { NoteEditor } from '@/components/note-editor';
import { Screen } from '@/components/screen';
import { SvgIcon } from '@/components/svg-icon';
import { Btn, Card, Chip, ChipRow, Row, Toggle, Txt, useTokens } from '@/components/ui';
import { CATS, CAT_BY_ID, DANGER, FONT, NOTE_DEFAULTS, type CatId } from '@/constants/theme';
import { snippetsFor } from '@/lib/notes';
import { resyncNotifications, useActivities } from '@/stores/activities';
import { NOTE_DISPLAY_DEFAULTS, NOTE_LIMITS, useSettings, type NoteDisplay, type NoteSnippet } from '@/stores/settings';
import { useUI } from '@/stores/ui';

/** โน้ตตัวอย่างในพรีวิวการ์ด — ยาวกว่าจำนวนบรรทัดสูงสุด (7) 1 บรรทัด ให้เห็นผลของ "จำนวนบรรทัด" และการตัด … ทุกค่า */
const SAMPLE_NOTE =
  'เสร็จ: สรุปขอบเขตงานเฟส 2\nค้าง: รอลูกค้ายืนยันราคา\nนัดต่อ: ศุกร์นี้ 10:00\nเตรียม: สไลด์สรุป\nผู้เข้าร่วม: ทีมออกแบบ 4 คน\nงบ: รอฝ่ายบัญชีอนุมัติ\nความเสี่ยง: กำหนดส่งชนวันหยุด\nหมายเหตุ: ส่งสรุปทางอีเมลภายในวันนี้';

export default function NotesScreen() {
  const t = useTokens();
  const showToast = useUI((s) => s.showToast);
  const notes = useActivities((s) => s.notes);
  const morningOn = useSettings((s) => s.morning);
  const display = useSettings((s) => s.noteDisplay);
  const setDisplay = useSettings((s) => s.setNoteDisplay);
  const snippets = useSettings((s) => s.noteSnippets);
  const addSnippet = useSettings((s) => s.addSnippet);
  const noteCfg = useSettings((s) => s.noteCfg);
  const setNoteCfg = useSettings((s) => s.setNoteCfg);

  /** ฟอร์มเพิ่มโน้ตสำเร็จรูปเปิดอยู่ไหม */
  const [adding, setAdding] = useState(false);
  /** โน้ตสำเร็จรูปที่กำลังแก้ (id) */
  const [editing, setEditing] = useState<string | null>(null);
  const [openCat, setOpenCat] = useState<CatId | null>(null);

  const written = Object.values(notes).reduce((n, day) => n + Object.keys(day).length, 0);
  const isDefaultDisplay = (Object.keys(NOTE_DISPLAY_DEFAULTS) as (keyof NoteDisplay)[]).every((k) => display[k] === NOTE_DISPLAY_DEFAULTS[k]);
  /** ลำดับชิปจริง (ไม่กรองหมวด) แล้วต่อด้วยตัวที่ซ่อน — รายการในคลังเรียงแบบนี้ให้เห็นว่าอันไหนขึ้นก่อน */
  const chipOrder = snippetsFor(null, snippets);
  const libraryOrder = [...chipOrder, ...snippets.filter((x) => x.hidden)];
  const pinnedIds = chipOrder.filter((x) => x.pinned).map((x) => x.id);

  const set = (patch: Partial<NoteDisplay>) => {
    setDisplay(patch);
    // แนบโน้ตในสรุปตอนเช้า → ตั้งคิวแจ้งเตือนใหม่ให้ข้อความตรงกับค่าที่เลือก
    if ('morning' in patch) resyncNotifications();
  };

  return (
    <Screen title="จัดการโน้ต" subtitle="จุดที่แสดงโน้ต · โน้ตสำเร็จรูป · แม่แบบต่อหมวด" variant="sub">
      {/* สรุป + บอกชัดว่าหน้านี้ไม่แตะโน้ตที่จดไว้ */}
      <Card tone="card2" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: t.track, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="note" size={19} color={t.sub} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt size={14} weight="bold">
            จดโน้ตไว้แล้ว {written} ครั้ง · โน้ตสำเร็จรูป {snippets.length}
          </Txt>
          <Txt size={11.5} color={t.faint}>
            ค่าในหน้านี้เปลี่ยนแค่การแสดงผล — โน้ตที่จดไปแล้วไม่ถูกแก้หรือลบ (แก้ได้ที่แผ่นรายละเอียด หรือฟอร์มแก้ไขรายการ)
          </Txt>
        </View>
      </Card>

      {/* ---------- ① การ์ดรายการ ---------- */}
      <Section
        n={1}
        title="การ์ดรายการ"
        where="หน้าวัน · การ์ดวันในมุมมองเดือน · หน้าทบทวน"
        right={<Toggle value={display.rail} onChange={(rail) => set({ rail })} label="แสดงโน้ตบนการ์ดรายการ" />}>
        {display.rail ? (
          <StepRow
            label="ความยาวโน้ตบนการ์ด"
            sub="ยาวกว่านี้ตัดด้วย … — แตะการ์ดเพื่ออ่านเต็ม"
            value={display.railLines}
            range={NOTE_LIMITS.railLines}
            unit="บรรทัด"
            onChange={(railLines) => set({ railLines })}
          />
        ) : null}
        <Preview caption={display.rail ? `แสดงโน้ต ${display.railLines} บรรทัดใต้รายละเอียด` : 'ปิดอยู่ — การ์ดไม่แสดงโน้ต (ยังอ่านได้ในแผ่นรายละเอียด)'}>
          <RailPreview note={display.rail ? SAMPLE_NOTE : ''} lines={display.railLines} />
        </Preview>
      </Section>

      {/* ---------- ② แผ่นรายละเอียด ---------- */}
      <Section n={2} title="แผ่นรายละเอียด" where="แตะรายการ → ช่อง “โน้ตของครั้งนี้”">
        <StepRow
          label="โน้ตครั้งก่อน"
          sub="ของกิจกรรมเดียวกัน ใหม่ → เก่า · แต่ละอันกด “ใช้ต่อ” ได้"
          value={display.prevCount}
          range={NOTE_LIMITS.prevCount}
          unit="ครั้ง"
          offLabel="ไม่แสดง"
          onChange={(prevCount) => set({ prevCount })}
        />
        <StepRow
          label="ชิปโน้ตสำเร็จรูป"
          sub="ปักหมุดขึ้นก่อน แล้วใช้บ่อย · ที่เหลือกด “ทั้งหมด”"
          value={display.chips}
          range={NOTE_LIMITS.chips}
          unit="ชิป"
          offLabel="ไม่แสดง"
          onChange={(chips) => set({ chips })}
        />
        <Preview caption="ลำดับชิปจริงกรองตามหมวดของรายการ">
          {display.prevCount ? <PrevPreview count={display.prevCount} /> : null}
          <ChipsPreview list={chipOrder} limit={display.chips} />
          <InputPreview />
        </Preview>
      </Section>

      {/* ---------- ③ ฟอร์มเพิ่ม/แก้ไข ---------- */}
      <Section
        n={3}
        title="ฟอร์มเพิ่ม / แก้ไขรายการ"
        where="ขั้น ① หมวดและรายละเอียด · บันทึกพร้อมกิจกรรม"
        right={<Toggle value={display.form} onChange={(form) => set({ form })} label="ช่องโน้ตในฟอร์มเพิ่ม/แก้ไข" />}>
        {display.form ? (
          <StepRow
            label="ชิปโน้ตสำเร็จรูป"
            sub="ตั้งแยกจากแผ่นรายละเอียด"
            value={display.formChips}
            range={NOTE_LIMITS.formChips}
            unit="ชิป"
            offLabel="ไม่แสดง"
            onChange={(formChips) => set({ formChips })}
          />
        ) : null}
        <Preview
          caption={
            display.form
              ? 'เพิ่ม: ลงวันแรกหรือทุกวันที่เลือก · แก้ไข: โน้ตของวันที่เปิดมาแก้ (ตัวเดียวกับแผ่นรายละเอียด)'
              : 'ปิดอยู่ — ฟอร์มไม่มีช่องโน้ต (โน้ตเดิมไม่หาย และย้ายตามเมื่อเปลี่ยนวันของรายการ)'
          }>
          {display.form ? (
            <>
              <ChipsPreview list={chipOrder} limit={display.formChips} />
              <InputPreview />
            </>
          ) : null}
        </Preview>
      </Section>

      {/* ---------- ④ ส่งออกและแจ้งเตือน ---------- */}
      <Section n={4} title="ส่งออกและแจ้งเตือน" where="ไฟล์รายงาน · Google Sheets · สรุปตอนเช้า">
        <Row
          icon="download"
          label="รายงาน · Excel · CSV · Google Sheets"
          sub={display.report ? 'มีชีต “โน้ตรายครั้ง” + คอลัมน์ “โน้ต” ในรายการ' : 'ไม่ใส่โน้ตในไฟล์ที่ส่งออก/ส่งขึ้นชีต'}
          right={<Toggle value={display.report} onChange={(report) => set({ report })} label="ใส่โน้ตในรายงานและไฟล์ส่งออก" />}
        />
        <Row
          icon="bell"
          label="แนบในสรุปตอนเช้า 06:00"
          sub={!morningOn ? 'ต้องเปิด “สรุปตอนเช้า” ที่หน้าตั้งค่าก่อน' : display.morning ? 'ใต้นัดเคส: “↳ ครั้งก่อน: …” บรรทัดแรกของโน้ต' : 'ไม่แนบโน้ต'}
          subColor={!morningOn && display.morning ? t.warn : undefined}
          right={<Toggle value={display.morning} onChange={(morning) => set({ morning })} label="แนบโน้ตครั้งก่อนในสรุปตอนเช้า" />}
          last
        />
      </Section>

      {!isDefaultDisplay ? (
        <Btn
          kind="ghost"
          label="คืนค่าเริ่มต้นของการแสดงโน้ตทั้งหมด (① – ④)"
          onPress={() => {
            set(NOTE_DISPLAY_DEFAULTS);
            showToast('คืนค่าเริ่มต้นแล้ว ✓');
          }}
        />
      ) : null}

      {/* ---------- ⑤ โน้ตสำเร็จรูป ---------- */}
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt size={14} weight="bold">
              ⑤ โน้ตสำเร็จรูป ({snippets.length})
            </Txt>
            <Txt size={11.5} color={t.faint}>
              ข้อความที่จดบ่อย แตะชิปเพื่อแทรก · เรียงตามลำดับชิปจริง: 📌 ปักหมุดก่อน (เลื่อน ↑↓ ได้) → ใช้บ่อย · ซ่อน = ไม่ขึ้นเป็นชิปแต่ยังอยู่ในคลัง
            </Txt>
          </View>
          {!adding ? (
            <Chip
              small
              icon="plus"
              label="เพิ่ม"
              onPress={() => {
                setEditing(null);
                setAdding(true);
              }}
            />
          ) : null}
        </View>

        {adding ? (
          <SnippetForm
            submitLabel="เพิ่มโน้ต"
            onCancel={() => setAdding(false)}
            onSubmit={(text, cats) => {
              addSnippet(text, cats);
              setAdding(false);
              showToast('เพิ่มโน้ตสำเร็จรูปแล้ว ✓');
            }}
          />
        ) : null}

        {libraryOrder.length ? (
          libraryOrder.map((sn) =>
            editing === sn.id ? (
              <SnippetForm
                key={sn.id}
                initial={sn}
                submitLabel="บันทึก"
                onCancel={() => setEditing(null)}
                onSubmit={(text, cats) => {
                  useSettings.getState().updateSnippet(sn.id, { text, cats });
                  setEditing(null);
                  showToast('บันทึกการแก้ไขแล้ว ✓');
                }}
              />
            ) : (
              <SnippetItem
                key={sn.id}
                sn={sn}
                order={sn.hidden ? null : chipOrder.indexOf(sn) + 1}
                canUp={sn.pinned && pinnedIds.indexOf(sn.id) > 0}
                canDown={sn.pinned && pinnedIds.indexOf(sn.id) < pinnedIds.length - 1}
                onEdit={() => {
                  setAdding(false);
                  setEditing(sn.id);
                }}
              />
            ),
          )
        ) : !adding ? (
          <Txt size={12.5} color={t.faint} style={{ paddingVertical: 6 }}>
            ยังไม่มีโน้ตสำเร็จรูป — กด “เพิ่ม” เช่น “สควอท 40 กก. 3×10” (ออกกำลังกาย) หรือ “ส่งใบเสนอราคาแล้ว” (นัดเคส)
          </Txt>
        ) : null}
      </Card>

      {/* ---------- ⑥ ค่าต่อหมวด (ค่าเดียวกับหน้าหมวดหมู่) ---------- */}
      <Card>
        <Txt size={14} weight="bold">
          ⑥ ค่าโน้ตต่อหมวด
        </Txt>
        <Txt size={11.5} color={t.faint} style={{ marginBottom: 4 }}>
          ข้อความตัวอย่างในช่อง · แม่แบบ (เติมให้เมื่อแตะช่องว่าง) · ถามโน้ตเมื่อติ๊กเสร็จ — ใช้ทั้งแผ่นรายละเอียดและฟอร์ม
        </Txt>
        {CATS.map((c, i) => {
          const opened = openCat === c.id;
          const cfg = noteCfg[c.id];
          const sub = [cfg.template.trim() ? 'มีแม่แบบ' : 'ไม่มีแม่แบบ', cfg.askOnDone ? 'ถามโน้ตเมื่อติ๊กเสร็จ' : ''].filter(Boolean).join(' · ');
          return (
            <View key={c.id}>
              <Row
                label={c.name}
                sub={sub}
                last={(i === CATS.length - 1 && !opened) || opened}
                onPress={() => setOpenCat(opened ? null : c.id)}
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
                <View style={{ marginBottom: 10 }}>
                  <NoteEditor key={`note-${c.id}`} cfg={cfg} defaults={NOTE_DEFAULTS[c.id]} onChange={(patch) => setNoteCfg(c.id, patch)} />
                </View>
              ) : null}
            </View>
          );
        })}
      </Card>

      <Txt size={11} color={t.faint} style={{ textAlign: 'center' }}>
        ค่าในหน้านี้ไปกับไฟล์สำรอง JSON ด้วย — ย้ายเครื่องแล้วไม่ต้องตั้งใหม่
      </Txt>
    </Screen>
  );
}

/** การ์ดของจุดหนึ่ง — หัวข้อ (เลข + ชื่อ + ที่อยู่ของจุดนั้น) + สวิตช์รวม (ถ้ามี) + ค่าตั้ง + ตัวอย่าง */
function Section({ n, title, where, right, children }: { n: number; title: string; where: string; right?: React.ReactNode; children: React.ReactNode }) {
  const t = useTokens();
  return (
    <Card style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 6 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt size={14} weight="bold">
            {'①②③④'[n - 1]} {title}
          </Txt>
          <Txt size={11.5} color={t.faint}>
            {where}
          </Txt>
        </View>
        {right}
      </View>
      {children}
    </Card>
  );
}

/** กรอบ "ตัวอย่าง" — เปลี่ยนตามค่าที่ตั้งทันที */
function Preview({ caption, children }: { caption: string; children?: React.ReactNode }) {
  const t = useTokens();
  return (
    <View style={{ marginTop: 8, gap: 6 }}>
      <Txt size={11} weight="bold" color={t.faint}>
        ตัวอย่าง
      </Txt>
      {children ? <View style={{ borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: t.line2, backgroundColor: t.bg, padding: 10, gap: 8 }}>{children}</View> : null}
      <Txt size={11} color={t.faint}>
        {caption}
      </Txt>
    </View>
  );
}

/** การ์ดรายการจำลอง (หน้าตาเดียวกับราง) — โน้ตตัดตามจำนวนบรรทัดที่ตั้ง */
function RailPreview({ note, lines }: { note: string; lines: number }) {
  const t = useTokens();
  const cat = CAT_BY_ID.work;
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ width: 40, alignItems: 'flex-end' }}>
        <Txt size={13} num weight="bold">
          09:00
        </Txt>
        <Txt size={11.5} num color={t.muted}>
          10:00
        </Txt>
      </View>
      <StatusDot state="planned" size={20} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt size={14.5} weight="med" numberOfLines={1}>
          ประชุมทีมออกแบบ
        </Txt>
        <View style={{ flexDirection: 'row', marginTop: 3 }}>
          <View style={{ width: 2, borderRadius: 1, backgroundColor: cat.color, marginRight: 7 }} />
          <Txt size={12.5} color={t.sub}>
            {cat.short}
          </Txt>
        </View>
        {note ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 5 }}>
            <View style={{ paddingTop: 2 }}>
              <SvgIcon name="note" size={12} color={t.muted} />
            </View>
            <Txt size={12} color={t.sub} numberOfLines={lines} style={{ flex: 1, lineHeight: 17 }}>
              {note}
            </Txt>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** กล่องโน้ตครั้งก่อนจำลอง — โชว์ไม่เกิน 2 กล่อง ที่เหลือบอกเป็นตัวเลข */
function PrevPreview({ count }: { count: number }) {
  const t = useTokens();
  const shown = Math.min(count, 2);
  return (
    <View style={{ gap: 4 }}>
      {Array.from({ length: shown }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.track, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
          <View style={{ flex: 1 }}>
            <Txt size={11} weight="bold" color={t.sub}>
              {i === 0 ? 'ครั้งก่อน · อ 10 พ.ย.' : `ก่อนหน้า ${i + 1} ครั้ง · อ 3 พ.ย.`}
            </Txt>
            <Txt size={12} numberOfLines={1}>
              {i === 0 ? 'สควอท 40 กก. 3×10' : 'สควอท 35 กก. 3×10'}
            </Txt>
          </View>
          <Txt size={11.5} weight="bold" color={t.sub}>
            ใช้ต่อ
          </Txt>
        </View>
      ))}
      {count > shown ? (
        <Txt size={11} color={t.faint}>
          …และอีก {count - shown} ครั้ง (เลื่อนดูในกล่อง)
        </Txt>
      ) : null}
    </View>
  );
}

/** แถวชิปจำลองจากโน้ตสำเร็จรูปจริง (ลำดับจริง) */
function ChipsPreview({ list, limit }: { list: NoteSnippet[]; limit: number }) {
  const t = useTokens();
  if (!limit) {
    return (
      <Txt size={11.5} color={t.faint}>
        ไม่แสดงชิปโน้ตสำเร็จรูป
      </Txt>
    );
  }
  if (!list.length) {
    return (
      <Txt size={11.5} color={t.faint}>
        ยังไม่มีโน้ตสำเร็จรูปที่แสดงได้ — เพิ่มที่ ⑤ ด้านล่าง
      </Txt>
    );
  }
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
      {list.slice(0, limit).map((sn) => (
        <View key={sn.id} style={{ maxWidth: '100%', height: 28, paddingHorizontal: 10, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: t.track }}>
          <SvgIcon name={sn.pinned ? 'pin' : 'plus'} size={10} color={t.sub} strokeWidth={2.6} />
          <Txt size={11.5} weight="med" numberOfLines={1} style={{ flexShrink: 1 }}>
            {sn.text.replace(/\s*\n\s*/g, ' · ')}
          </Txt>
        </View>
      ))}
      {list.length > limit ? (
        <View style={{ height: 28, paddingHorizontal: 6, justifyContent: 'center' }}>
          <Txt size={11.5} weight="bold" color={t.accentInk}>
            ทั้งหมด ({list.length})
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

function InputPreview() {
  const t = useTokens();
  return (
    <View style={{ height: 40, borderRadius: 10, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, justifyContent: 'center', paddingHorizontal: 10 }}>
      <Txt size={12} color={t.faint}>
        โน้ตของครั้งนี้…
      </Txt>
    </View>
  );
}

/** แถวตั้งจำนวนด้วยปุ่ม − / + (ค่าต่ำสุดพร้อม offLabel = ปิด) */
function StepRow({
  label,
  sub,
  value,
  range,
  unit,
  offLabel,
  onChange,
}: {
  label: string;
  sub: string;
  value: number;
  range: readonly [number, number];
  unit: string;
  offLabel?: string;
  onChange: (v: number) => void;
}) {
  const t = useTokens();
  const [lo, hi] = range;
  const btn = (icon: 'minus' | 'plus', next: number, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${icon === 'plus' ? 'เพิ่ม' : 'ลด'}${label}`}
      disabled={disabled}
      onPress={() => onChange(next)}
      hitSlop={6}
      style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.rail : t.track, opacity: disabled ? 0.35 : 1 })}>
      <SvgIcon name={icon} size={15} color={t.sub} strokeWidth={2.6} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: t.line }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={14} weight="med">
          {label}
        </Txt>
        <Txt size={11.5} color={t.faint}>
          {sub}
        </Txt>
      </View>
      {btn('minus', value - 1, value <= lo)}
      <Txt size={13} num weight="bold" color={value === lo && offLabel ? t.faint : t.ink} style={{ minWidth: 56, textAlign: 'center' }}>
        {value === lo && offLabel ? offLabel : `${value} ${unit}`}
      </Txt>
      {btn('plus', value + 1, value >= hi)}
    </View>
  );
}

/** ป้ายหมวดของโน้ตสำเร็จรูป */
const catsLabel = (cats: CatId[]) => (cats.length ? cats.map((c) => CAT_BY_ID[c].short).join(' · ') : 'ทุกหมวด');

/**
 * โน้ตสำเร็จรูปหนึ่งรายการ — แถวบน: ลำดับชิป + ข้อความ + หมวด/จำนวนใช้
 * แถวล่าง: ปักหมุด · ↑↓ (เฉพาะที่ปักหมุด) · ซ่อน/แสดง · แก้ไข · ลบ (ยืนยันในแถว — โน้ตที่จดไปแล้วไม่หาย)
 */
function SnippetItem({ sn, order, canUp, canDown, onEdit }: { sn: NoteSnippet; order: number | null; canUp: boolean; canDown: boolean; onEdit: () => void }) {
  const t = useTokens();
  const showToast = useUI((s) => s.showToast);
  const update = useSettings((s) => s.updateSnippet);
  const move = useSettings((s) => s.moveSnippet);
  const [confirmDel, setConfirmDel] = useState(false);
  return (
    <View style={{ backgroundColor: t.card2, borderRadius: 12, borderWidth: 1, borderColor: confirmDel ? DANGER : sn.pinned ? t.line2 : t.line, padding: 10, gap: 8, opacity: sn.hidden && !confirmDel ? 0.62 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ minWidth: 26, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: sn.pinned ? '#D2603A22' : t.track }}>
          <Txt size={11} num weight="bold" color={sn.pinned ? t.accentInk : t.sub}>
            {order ?? '–'}
          </Txt>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Txt size={13.5} color={t.ink} numberOfLines={3} style={{ lineHeight: 19 }}>
            {sn.text}
          </Txt>
          <Txt size={11.5} color={t.faint}>
            {[sn.pinned ? '📌 ปักหมุด' : '', sn.hidden ? 'ซ่อนอยู่' : '', catsLabel(sn.cats), `ใช้ ${sn.uses} ครั้ง`].filter(Boolean).join(' · ')}
          </Txt>
        </View>
      </View>
      {confirmDel ? (
        <View style={{ gap: 8 }}>
          <Txt size={12} color={t.sub}>
            ลบออกจากคลัง? โน้ตที่เคยแทรกไปแล้วยังอยู่ครบ
          </Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn style={{ flex: 1 }} kind="ghost" label="ยกเลิก" onPress={() => setConfirmDel(false)} />
            <Btn
              style={{ flex: 1 }}
              kind="danger"
              label="ลบจากคลัง"
              onPress={() => {
                useSettings.getState().removeSnippet(sn.id);
                showToast('ลบโน้ตสำเร็จรูปแล้ว');
              }}
            />
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <ActBtn
            icon="pin"
            label={sn.pinned ? 'เลิกปักหมุด' : 'ปักหมุด'}
            active={sn.pinned}
            onPress={() => {
              update(sn.id, { pinned: !sn.pinned, ...(sn.pinned ? {} : { hidden: false }) });
              showToast(sn.pinned ? 'เลิกปักหมุดแล้ว' : 'ปักหมุดแล้ว — ขึ้นเป็นชิปแรก ๆ ✓');
            }}
          />
          {sn.pinned ? (
            <>
              <ActBtn icon="chevU" a11y="เลื่อนขึ้น" disabled={!canUp} onPress={() => move(sn.id, -1)} />
              <ActBtn icon="chevD" a11y="เลื่อนลง" disabled={!canDown} onPress={() => move(sn.id, 1)} />
            </>
          ) : null}
          <ActBtn
            icon={sn.hidden ? 'eye' : 'eyeOff'}
            label={sn.hidden ? 'แสดง' : 'ซ่อน'}
            onPress={() => {
              update(sn.id, { hidden: !sn.hidden, ...(sn.hidden ? {} : { pinned: false }) });
              showToast(sn.hidden ? 'แสดงเป็นชิปแล้ว ✓' : 'ซ่อนแล้ว — ไม่ขึ้นเป็นชิป (ยังอยู่ในคลัง)');
            }}
          />
          <View style={{ flex: 1 }} />
          <ActBtn icon="edit" a11y="แก้ไขโน้ตสำเร็จรูป" onPress={onEdit} />
          <ActBtn icon="trash" a11y="ลบโน้ตสำเร็จรูป" danger onPress={() => setConfirmDel(true)} />
        </View>
      )}
    </View>
  );
}

/** ปุ่มเล็กในแถวโน้ตสำเร็จรูป — มีป้าย (ปักหมุด/ซ่อน) หรือไอคอนล้วน */
function ActBtn({ icon, label, a11y, active, danger, disabled, onPress }: { icon: string; label?: string; a11y?: string; active?: boolean; danger?: boolean; disabled?: boolean; onPress: () => void }) {
  const t = useTokens();
  const color = danger ? DANGER : active ? t.accentInk : t.sub;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        height: 30,
        minWidth: 30,
        paddingHorizontal: label ? 10 : 0,
        borderRadius: 15,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        opacity: disabled ? 0.3 : 1,
        backgroundColor: pressed ? t.rail : active ? '#D2603A22' : t.track,
      })}>
      <SvgIcon name={icon} size={13} color={color} strokeWidth={2.2} />
      {label ? (
        <Txt size={12} weight={active ? 'bold' : 'med'} color={color}>
          {label}
        </Txt>
      ) : null}
    </Pressable>
  );
}

/** ฟอร์มเพิ่ม/แก้โน้ตสำเร็จรูป — ข้อความ (หลายบรรทัดได้) + หมวดที่ให้ชิปขึ้น (ไม่เลือก = ทุกหมวด) */
function SnippetForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: NoteSnippet;
  submitLabel: string;
  onSubmit: (text: string, cats: CatId[]) => void;
  onCancel: () => void;
}) {
  const t = useTokens();
  const [text, setText] = useState(initial?.text ?? '');
  const [cats, setCats] = useState<CatId[]>(initial?.cats ?? []);
  const toggle = (c: CatId) => setCats((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : CATS.map((x) => x.id).filter((x) => x === c || cur.includes(x))));
  const ok = !!text.trim();
  return (
    <View style={{ gap: 10, padding: 12, borderRadius: 12, backgroundColor: t.card2, borderWidth: 1, borderColor: t.line2 }}>
      <TextInput
        value={text}
        onChangeText={setText}
        autoFocus
        multiline
        placeholder={'เช่น สควอท 40 กก. 3×10\nหรือ ส่งใบเสนอราคาแล้ว รอตอบกลับ'}
        placeholderTextColor={t.faint}
        accessibilityLabel="ข้อความโน้ตสำเร็จรูป"
        style={{ minHeight: 64, maxHeight: 140, borderRadius: 12, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, fontFamily: FONT.ui, fontSize: 14, color: t.ink, textAlignVertical: 'top' }}
      />
      <View style={{ gap: 6 }}>
        <Txt size={12} color={t.sub}>
          ให้ขึ้นในหมวด <Txt size={12} color={t.faint}>(ไม่เลือก = ทุกหมวด)</Txt>
        </Txt>
        <ChipRow style={{ gap: 6 }}>
          <Chip small label="ทุกหมวด" active={!cats.length} onPress={() => setCats([])} />
          {CATS.map((c) => (
            <Chip key={c.id} small label={c.short} color={c.color} active={cats.includes(c.id)} onPress={() => toggle(c.id)} />
          ))}
        </ChipRow>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn style={{ flex: 1 }} kind="ghost" label="ยกเลิก" onPress={onCancel} />
        <Btn style={{ flex: 1 }} label={submitLabel} disabled={!ok} onPress={() => onSubmit(text, cats)} />
      </View>
    </View>
  );
}
