// 6.2 สมุดรายชื่อ (ระบบ B1) — รายชื่อคนที่นัด (ใช้เลือกในฟอร์มนัดเคส)
// รายการ: ค้นหา (ชื่อ · องค์กร · เบอร์ · LINE) + ชิปกรอง ทั้งหมด/P1–P6 พร้อมจำนวน · แถว = ป้ายระดับ + ชื่อ + องค์กร + นัดถัดไป · ปุ่มโทร/LINE
// แก้ไข: หน้าเต็ม — ข้อมูลหลัก (ชื่อ · องค์กร) · ระดับ · ช่องทางติดต่อ (ช่องเสริมพับไว้) · ลบมีขั้นยืนยัน
// แถบล่าง: รายการ = ‹ กลับ + เพิ่มรายชื่อ · แก้ไข = ‹ กลับ + บันทึก
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, TextInput, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { SvgIcon } from '@/components/svg-icon';
import { Btn, Chip, Txt, useTokens } from '@/components/ui';
import { FONT, PRI, PRI_BY_ID, type PriorityId } from '@/constants/theme';
import { MONTH_TH, WD_TH, fmtMin, fromISO, nowMin, todayISO, wdMon } from '@/lib/dates';
import { seriesDates } from '@/lib/engine';
import type { Activity, Contact } from '@/lib/types';
import { useActivities } from '@/stores/activities';
import { useContacts } from '@/stores/contacts';
import { useUI } from '@/stores/ui';

type Draft = Partial<Contact>;

const PRI_ORDER: Record<PriorityId, number> = { P1: 1, P2: 2, P3: 3, P4: 4, P5: 5, P6: 6 };

/** นัด (กิจกรรมนัดเคส) ที่ผูกกับแต่ละคน + วันนัดถัดไป */
function useLinks(acts: Activity[]) {
  return useMemo(() => {
    const today = todayISO();
    const now = nowMin();
    const map = new Map<number, { count: number; next: { date: string; start: number } | null }>();
    for (const a of acts) {
      if (a.status !== 'active' || !a.contactIds.length) continue;
      // ครั้งถัดไปของชุดนี้ — วันนี้นับเฉพาะที่ยังไม่เริ่ม
      const nextDate = seriesDates(a).find((d) => d > today || (d === today && a.startMin > now));
      for (const id of a.contactIds) {
        const cur = map.get(id) ?? { count: 0, next: null };
        cur.count++;
        if (nextDate && (!cur.next || nextDate < cur.next.date || (nextDate === cur.next.date && a.startMin < cur.next.start))) cur.next = { date: nextDate, start: a.startMin };
        map.set(id, cur);
      }
    }
    return map;
  }, [acts]);
}

function nextText(next: { date: string; start: number } | null): string {
  if (!next) return 'ยังไม่มีนัด';
  if (next.date === todayISO()) return `นัดถัดไป วันนี้ ${fmtMin(next.start)}`;
  const d = fromISO(next.date);
  return `นัดถัดไป ${WD_TH[wdMon(next.date)]} ${d.getDate()} ${MONTH_TH[d.getMonth()]}`;
}

export default function ContactsScreen() {
  const router = useRouter();
  const list = useContacts((s) => s.list);
  const acts = useActivities((s) => s.acts);
  const links = useLinks(acts);
  // มาจากปุ่ม "แก้ไข" ที่อื่น (ฟอร์มนัดเคส / แผ่นรายละเอียด) ด้วย ?edit=<id> → เปิดหน้าแก้ไขของคนนั้นเลย
  // อ่านครั้งเดียวตอนเปิดหน้า (รายชื่อโหลดตั้งแต่เปิดแอปแล้ว) — บันทึกแล้วไม่เด้งกลับมาเปิดซ้ำ
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const [fromParam] = useState(() => (edit ? list.find((x) => x.id === Number(edit)) ?? null : null));
  const [editing, setEditing] = useState<Draft | null>(fromParam);
  const [returnAfterEdit, setReturnAfterEdit] = useState(!!fromParam);

  // ปิดหน้าแก้ไข — ถ้าเปิดตรงมาจากที่อื่น กลับไปที่นั่นเลย (ไม่ค้างที่รายการ)
  const closeEdit = () => {
    if (returnAfterEdit && router.canGoBack()) {
      setReturnAfterEdit(false);
      router.back();
      useUI.getState().restoreSheet();
      return;
    }
    setReturnAfterEdit(false);
    setEditing(null);
  };

  return editing ? (
    <ContactEdit key={editing.id ?? 'new'} draft={editing} linked={editing.id ? links.get(editing.id) ?? null : null} onClose={closeEdit} />
  ) : (
    <ContactList list={list} links={links} onEdit={setEditing} />
  );
}

// ---------- รายการ ----------

function ContactList({ list, links, onEdit }: { list: Contact[]; links: ReturnType<typeof useLinks>; onEdit: (c: Draft) => void }) {
  const t = useTokens();
  const [priFilter, setPriFilter] = useState<PriorityId | null>(null);
  const [query, setQuery] = useState('');

  const countByPri = useMemo(() => {
    const m = {} as Record<PriorityId, number>;
    for (const c of list) m[c.priority] = (m[c.priority] ?? 0) + 1;
    return m;
  }, [list]);

  // กรองระดับ + คำค้น (ชื่อ · องค์กร · เบอร์ · LINE) · เรียงตามความสำคัญ แล้วตามชื่อ
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/[^0-9]/g, '');
    return list
      .filter((c) => !priFilter || c.priority === priFilter)
      .filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          (c.org ?? '').toLowerCase().includes(q) ||
          (c.line ?? '').toLowerCase().includes(q) ||
          (!!digits && (c.phone ?? '').replace(/[^0-9]/g, '').includes(digits)),
      )
      .sort((a, b) => PRI_ORDER[a.priority] - PRI_ORDER[b.priority] || a.name.localeCompare(b.name, 'th'));
  }, [list, priFilter, query]);

  return (
    <Screen
      title="สมุดรายชื่อ"
      subtitle={`${list.length} คน · แตะชื่อเพื่อแก้ไข · ใช้กับนัดเคส`}
      variant="sub"
      action={{ label: 'เพิ่มรายชื่อ', icon: 'plus', onPress: () => onEdit({}) }}>
      {list.length ? (
        <>
          <View style={{ gap: 6 }}>
            <Txt size={12.5} color={t.sub} style={{ marginHorizontal: 2 }}>
              ค้นหา
            </Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingHorizontal: 12, borderRadius: 12, backgroundColor: t.card, borderWidth: 1, borderColor: t.line }}>
              <Icon name="search" size={17} color={t.sub} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="ชื่อ องค์กร เบอร์ หรือ LINE"
                placeholderTextColor={t.faint}
                accessibilityLabel="ค้นหารายชื่อ"
                style={{ flex: 1, minWidth: 0, color: t.ink, fontFamily: FONT.ui, fontSize: 15, paddingVertical: 0 }}
              />
              {query ? (
                <Pressable accessibilityRole="button" accessibilityLabel="ล้างคำค้น" onPress={() => setQuery('')} hitSlop={8}>
                  <SvgIcon name="x" size={16} color={t.sub} strokeWidth={2.2} />
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* ชิปกรองตามระดับ — เลื่อนแนวนอน */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -18 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 18 }}>
            <PriChip label="ทั้งหมด" count={list.length} on={!priFilter} onPress={() => setPriFilter(null)} />
            {PRI.map((p) => (
              <PriChip key={p.id} label={p.id} color={p.color} count={countByPri[p.id] ?? 0} on={priFilter === p.id} onPress={() => setPriFilter(priFilter === p.id ? null : p.id)} a11y={`${p.id} ${p.label}`} />
            ))}
          </ScrollView>

          <View style={{ gap: 6 }}>
            <Txt size={13} weight="bold" color={t.sub} style={{ marginHorizontal: 2 }}>
              {priFilter ? `${priFilter} · ${PRI_BY_ID[priFilter].label}` : 'เรียงตามความสำคัญ'}
            </Txt>
            <View style={{ backgroundColor: t.card, borderRadius: 16, overflow: 'hidden', shadowColor: '#221C13', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}>
              {shown.length ? (
                shown.map((c, i) => <ContactRow key={c.id} c={c} last={i === shown.length - 1} link={links.get(c.id) ?? null} onPress={() => onEdit(c)} />)
              ) : (
                <Txt size={13} color={t.faint} style={{ textAlign: 'center', padding: 18 }}>
                  ไม่พบรายชื่อที่ตรงกับตัวกรอง — ลองล้างคำค้นหรือเลือก “ทั้งหมด”
                </Txt>
              )}
            </View>
          </View>
        </>
      ) : (
        <View style={{ alignItems: 'center', paddingVertical: 48, gap: 6 }}>
          <Txt size={16} weight="bold">
            ยังไม่มีรายชื่อ
          </Txt>
          <Txt size={13} color={t.sub} style={{ textAlign: 'center' }}>
            เพิ่มคนที่นัดเป็นประจำไว้ เลือกซ้ำในฟอร์มนัดเคสได้ทันที
          </Txt>
        </View>
      )}
    </Screen>
  );
}

function PriChip({ label, count, on, color, onPress, a11y }: { label: string; count: number; on: boolean; color?: string; onPress: () => void; a11y?: string }) {
  const t = useTokens();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${a11y ?? label} ${count} คน`}
      onPress={onPress}
      style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: on ? t.ink : t.track, opacity: !on && count === 0 ? 0.5 : 1 }}>
      {color ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /> : null}
      <Txt size={13.5} weight={on ? 'bold' : 'med'} color={on ? t.bg : t.sub}>
        {label}
      </Txt>
      <Txt size={12.5} num color={on ? t.bg : t.faint} style={{ opacity: on ? 0.75 : 1 }}>
        {count}
      </Txt>
    </Pressable>
  );
}

function ContactRow({ c, last, link, onPress }: { c: Contact; last: boolean; link: { count: number; next: { date: string; start: number } | null } | null; onPress: () => void }) {
  const t = useTokens();
  const p = PRI_BY_ID[c.priority];
  const tel = c.phone ? `tel:${c.phone.replace(/[^0-9+]/g, '')}` : null;
  const line = c.line ? `https://line.me/R/ti/p/~${c.line.replace(/^@/, '')}` : null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, paddingLeft: 12, paddingRight: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: t.line }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`แก้ไข ${c.name}`}
        onPress={onPress}
        style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 11, opacity: pressed ? 0.7 : 1 })}>
        <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: p.color, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Txt size={13} num weight="bold" color={p.color}>
            {p.id}
          </Txt>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <Txt size={15} weight="med" style={{ lineHeight: 21 }}>
            {c.name}
          </Txt>
          {c.org ? (
            <Txt size={13} color={t.sub} style={{ lineHeight: 19 }}>
              {c.org}
            </Txt>
          ) : null}
          <Txt size={12.5} color={t.muted} style={{ lineHeight: 18 }}>
            {p.id} {p.label} · {nextText(link?.next ?? null)}
          </Txt>
        </View>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <ActionCircle icon="phone" label={tel ? `โทรหา ${c.name}` : `ยังไม่มีเบอร์ของ ${c.name}`} url={tel} />
        <ActionCircle icon="line" label={line ? `ส่ง LINE ถึง ${c.name}` : `ยังไม่มี LINE ของ ${c.name}`} url={line} />
      </View>
    </View>
  );
}

/** ปุ่มกลมโทร/LINE — ไม่มีข้อมูล = กรอบเส้นประจาง (กดไม่ได้) */
function ActionCircle({ icon, label, url }: { icon: string; label: string; url: string | null }) {
  const t = useTokens();
  const showToast = useUI((s) => s.showToast);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !url }}
      disabled={!url}
      onPress={() => url && Linking.openURL(url).catch(() => showToast('เปิดลิงก์ไม่สำเร็จ'))}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: url ? (pressed ? t.rail : t.track) : 'transparent',
        borderWidth: url ? 0 : 1.5,
        borderStyle: 'dashed',
        borderColor: t.railDash,
      })}>
      <SvgIcon name={icon} size={18} color={url ? t.greenInk : t.railDash} strokeWidth={2} />
    </Pressable>
  );
}

// ---------- แก้ไข / เพิ่ม ----------

function ContactEdit({ draft, linked, onClose }: { draft: Draft; linked: { count: number; next: { date: string; start: number } | null } | null; onClose: () => void }) {
  const t = useTokens();
  const upsert = useContacts((s) => s.upsert);
  const remove = useContacts((s) => s.remove);
  const showToast = useUI((s) => s.showToast);
  const [d, setD] = useState<Draft>(draft);
  const [confirmDel, setConfirmDel] = useState(false);
  // ช่องเสริม (อีเมล · Zoom · Meet · หมายเหตุ) — เปิดเองถ้ามีข้อมูลอยู่แล้ว
  const [more, setMore] = useState(() => !!(draft.email || draft.zoom || draft.googlemeet || draft.note));
  const set = (p: Draft) => setD((x) => ({ ...x, ...p }));
  const pri = (d.priority ?? 'P6') as PriorityId;

  const save = async () => {
    const name = d.name?.trim();
    if (!name) return showToast('ใส่ชื่อก่อน');
    await upsert({
      id: d.id,
      name,
      priority: pri,
      phone: d.phone?.trim() || null,
      line: d.line?.trim() || null,
      email: d.email?.trim() || null,
      zoom: d.zoom?.trim() || null,
      googlemeet: d.googlemeet?.trim() || null,
      note: d.note?.trim() || null,
      org: d.org?.trim() || null,
    });
    showToast('บันทึกรายชื่อแล้ว ✓');
    onClose();
  };

  const paste = async (field: 'phone' | 'line') => {
    const s = (await Clipboard.getStringAsync()).trim();
    if (!s) return showToast('คลิปบอร์ดว่าง');
    set({ [field]: s });
  };

  return (
    <Screen
      title={d.id ? 'แก้ไขรายชื่อ' : 'เพิ่มรายชื่อ'}
      subtitle={d.id ? `${draft.name ?? ''}${linked?.count ? ` · ผูกอยู่กับ ${linked.count} นัด` : ''}` : 'ใช้เลือกในนัดเคส'}
      variant="sub"
      onBack={onClose}
      action={{ label: 'บันทึก', icon: 'check', onPress: save }}>
      <FieldGroup title="ข้อมูลหลัก">
        <Field label="ชื่อ-นามสกุล" value={d.name ?? ''} onChange={(name) => set({ name })} autoFocus={!d.id} />
        <Field label="องค์กร / บริษัท" optional value={d.org ?? ''} onChange={(org) => set({ org })} placeholder="เช่น บริษัท … จำกัด" />
      </FieldGroup>

      <FieldGroup title="ระดับความสำคัญ" hint="ระดับตั้งต้นเมื่อเลือกคนนี้ในนัดเคส">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {PRI.map((p) => (
            <Chip key={p.id} small label={`${p.id} · ${p.label}`} color={p.color} active={pri === p.id} onPress={() => set({ priority: p.id })} />
          ))}
        </View>
      </FieldGroup>

      <FieldGroup title="ช่องทางติดต่อ">
        <Field label="เบอร์โทร" value={d.phone ?? ''} onChange={(phone) => set({ phone })} keyboard="phone-pad" onPaste={() => paste('phone')} />
        <Field label="LINE ID" value={d.line ?? ''} onChange={(line) => set({ line })} onPaste={() => paste('line')} />
        {more ? (
          <>
            <Field label="อีเมล" optional value={d.email ?? ''} onChange={(email) => set({ email })} keyboard="email-address" />
            <Field label="Zoom" optional value={d.zoom ?? ''} onChange={(zoom) => set({ zoom })} placeholder="ลิงก์ หรือ Meeting ID เช่น 123 4567 8901" />
            <Field label="Google Meet" optional value={d.googlemeet ?? ''} onChange={(googlemeet) => set({ googlemeet })} placeholder="ลิงก์ หรือรหัสห้อง เช่น abc-defg-hij" />
            <Field label="หมายเหตุ" optional value={d.note ?? ''} onChange={(note) => set({ note })} multiline />
          </>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setMore(true)} style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
            <Txt size={13.5} weight="bold" color={t.accentInk}>
              ＋ อีเมล · Zoom · Google Meet · หมายเหตุ
            </Txt>
          </Pressable>
        )}
      </FieldGroup>

      {d.id ? (
        confirmDel ? (
          <View style={{ backgroundColor: t.card, borderRadius: 16, borderWidth: 1.5, borderColor: t.warn, padding: 14, gap: 10 }}>
            <Txt size={15} weight="bold">
              ลบ “{draft.name}” ออกจากสมุดรายชื่อ?
            </Txt>
            <Txt size={12.5} color={t.sub} style={{ lineHeight: 19 }}>
              {linked?.count ? `รายชื่อนี้ผูกอยู่กับ ${linked.count} นัด${linked.next ? ` (${nextText(linked.next).replace('นัดถัดไป', 'ถัดไป')})` : ''} — นัดทั้งหมดยังอยู่ แต่จะไม่มีชื่อคนนี้แล้ว · ` : ''}
              ลบแล้วกู้คืนไม่ได้
            </Txt>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn style={{ flex: 1 }} kind="ghost" label="ไม่ลบ" onPress={() => setConfirmDel(false)} />
              <Btn
                style={{ flex: 1 }}
                kind="danger"
                label="ลบรายชื่อ"
                onPress={() => {
                  remove(d.id!);
                  showToast('ลบรายชื่อแล้ว');
                  onClose();
                }}
              />
            </View>
          </View>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setConfirmDel(true)} style={({ pressed }) => ({ alignSelf: 'center', minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
            <Txt size={14} weight="bold" color={t.warn}>
              ลบรายชื่อนี้…
            </Txt>
          </Pressable>
        )
      ) : null}
    </Screen>
  );
}

function FieldGroup({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const t = useTokens();
  return (
    <View style={{ gap: 6 }}>
      <Txt size={13} weight="bold" color={t.sub} style={{ marginHorizontal: 2 }}>
        {title}
      </Txt>
      <View style={{ backgroundColor: t.card, borderRadius: 16, padding: 14, gap: 12, shadowColor: '#221C13', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}>
        {hint ? (
          <Txt size={12} color={t.faint} style={{ marginTop: -4 }}>
            {hint}
          </Txt>
        ) : null}
        {children}
      </View>
    </View>
  );
}

function Field({
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
        {onPaste && !value ? (
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
