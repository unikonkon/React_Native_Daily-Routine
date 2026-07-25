// Bottom Sheet รายละเอียดกิจกรรม (APP_STRUCTURE.md §3.3) — ใช้ร่วมแท็บวันนี้ + สรุปเคส
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Keyboard, Linking, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { SvgIcon } from '@/components/svg-icon';
import { Btn, Chip, ChipRow, PriBadge, Txt, useTokens } from '@/components/ui';
import { ACCENT, CAT_BY_ID, FONT, GREEN, PRI } from '@/constants/theme';
import { durText, fmtRange, thaiDate } from '@/lib/dates';
import type { Contact } from '@/lib/types';
import { useActivities, useDay } from '@/stores/activities';
import { meetLink, useContacts, zoomDeepLink } from '@/stores/contacts';
import { useDraft } from '@/stores/draft';
import { useUI } from '@/stores/ui';

export function ActivitySheet() {
  const sheet = useUI((s) => s.sheet);
  return sheet ? <SheetBody id={sheet.id} date={sheet.date} /> : null;
}

/** ความสูงคีย์บอร์ดปัจจุบัน (0 = ปิด) — รองรับทั้ง iOS (will) และ Android (did) */
function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvt, (e) => setHeight(e.endCoordinates?.height ?? 0));
    const h = Keyboard.addListener(hideEvt, () => setHeight(0));
    return () => {
      s.remove();
      h.remove();
    };
  }, []);
  return height;
}

function SheetBody({ id, date }: { id: number; date: string }) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const closeSheet = useUI((s) => s.closeSheet);
  const openResc = useUI((s) => s.openResc);
  const showToast = useUI((s) => s.showToast);
  const { setStatus, deleteOne, deleteSeries, update, acts } = useActivities();
  const contacts = useContacts((s) => s.list);
  const item = useDay(date).find((i) => i.id === id);
  const [confirm, setConfirm] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const kb = useKeyboardHeight();

  // เข้าเร็วและลื่น: Modal ไม่ใส่แอนิเมชันของระบบ (ช้า ~300ms) — สไลด์ขึ้น+จางเข้าเองด้วย native driver สั้น ๆ
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [anim]);

  if (!item) {
    closeSheet();
    return null;
  }
  const cat = CAT_BY_ID[item.cat];
  const done = item.ostatus === 'done';
  const caseContacts = item.contactIds
    .map((cid) => contacts.find((c) => c.id === cid))
    .filter((c): c is Contact => !!c);

  /**
   * เปลี่ยนรายชื่อของเคสนี้ — สลับ id ในกิจกรรม (ทั้งชุดถ้าเป็นกิจกรรมทำซ้ำ) แล้วให้ฟอร์มไปแก้ข้อมูลของคนใหม่ต่อ
   * ถ้าคนใหม่อยู่ในเคสนี้อยู่แล้ว → แค่ถอดคนเดิมออก (กันชื่อซ้ำในเคสเดียว)
   */
  const swapContact = (from: Contact, to: Contact) => {
    const a = acts.find((x) => x.id === item.id);
    if (!a) return showToast('ไม่พบกิจกรรมนี้');
    if (from.id !== to.id) {
      update({
        ...a,
        contactIds: a.contactIds.includes(to.id)
          ? a.contactIds.filter((cid) => cid !== from.id)
          : a.contactIds.map((cid) => (cid === from.id ? to.id : cid)),
      });
      showToast(`เปลี่ยนเป็น ${to.name} แล้ว ✓`);
    }
    setEditContact(to);
  };

  const onEdit = () => {
    const a = acts.find((x) => x.id === item.id);
    if (a) {
      useDraft.getState().loadActivity(a);
      closeSheet();
      router.push('/add');
    }
  };

  return (
    <Modal transparent animationType="none" onRequestClose={closeSheet}>
      {/* ไม่มีฉากหลังมืด — โปร่งใส แตะพื้นที่ว่างเพื่อปิดได้เหมือนเดิม */}
      <Pressable style={{ flex: 1 }} onPress={closeSheet} />
      <Animated.View
        style={{
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
          backgroundColor: t.sheet,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          padding: 20,
          // ยกแผ่นให้พ้นคีย์บอร์ด (iOS/Android) — เปิดคีย์บอร์ด: ดันขึ้นด้วย marginBottom, ปิด: เว้น safe area
          marginBottom: kb,
          paddingBottom: kb > 0 ? 20 : insets.bottom + 20,
          gap: 12,
          // เงานุ่มแทน overlay — ให้แผ่นยังแยกจากเนื้อหาด้านหลังชัด
          shadowColor: '#000',
          shadowOpacity: 0.22,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: -8 },
          elevation: 16,
        }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: t.line2, alignSelf: 'center' }} />

        {editContact ? (
          <ContactEditForm
            key={editContact.id}
            c={editContact}
            showToast={showToast}
            onSwap={(next) => swapContact(editContact, next)}
            onClose={() => setEditContact(null)}
          />
        ) : (
        <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: cat.color + '22', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 }}>
            <SvgIcon name={cat.icon} size={13} color={cat.color} />
            <Txt size={12} color={cat.color} weight="med">{cat.short}</Txt>
          </View>
          {item.cat === 'case' ? <PriBadge id={item.priority} withLabel /> : null}
          {done ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <SvgIcon name="check" size={13} color={GREEN} />
              <Txt size={12} color={GREEN} weight="med">ทำแล้ว</Txt>
            </View>
          ) : null}
          {item.ostatus === 'rescheduled' ? <Txt size={12} color="#D2603A" weight="med">เลื่อนแล้ว</Txt> : null}
        </View>

        <Txt size={22} weight="bold">{item.title}</Txt>
        <Txt size={14} num color={t.sub}>
          {thaiDate(date)} · {fmtRange(item.startMin, item.endMin)} ({durText(item.endMin - item.startMin)})
        </Txt>
        {item.loc ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <SvgIcon name="mappin" size={14} color={t.sub} />
            <Txt size={13} color={t.sub}>{item.loc}</Txt>
          </View>
        ) : null}
        {item.cat === 'case' ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <SvgIcon name={item.channel === 'online' ? 'video' : 'users'} size={14} color={t.sub} />
              <Txt size={13} color={t.sub}>
                {item.channel === 'online' ? 'ออนไลน์' : 'พบตัว'}
                {caseContacts.length ? ` · ${caseContacts.length} รายชื่อ` : ''}
              </Txt>
            </View>
            {caseContacts.length ? (
              <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {caseContacts.map((c) => (
                  <ContactCard key={c.id} c={c} onEdit={setEditContact} showToast={showToast} />
                ))}
              </ScrollView>
            ) : null}
          </>
        ) : null}

        {!confirm ? (
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn
                style={{ flex: 1 }}
                kind={done ? 'ghost' : 'green'}
                renderIcon={(c, s) => <SvgIcon name={done ? 'restore' : 'check'} size={s} color={c} />}
                label={done ? 'ยังไม่ทำ' : 'ทำแล้ว'}
                onPress={() => {
                  setStatus(item, done ? null : 'done');
                  if (!done) showToast('เยี่ยม! ทำสำเร็จ ✓');
                }}
              />
              {item.cat === 'case' && item.ostatus !== 'rescheduled' ? (
                <Btn style={{ flex: 1 }} kind="primary" renderIcon={(c, s) => <SvgIcon name="skip" size={s} color={c} />} label="เลื่อนนัด" onPress={() => openResc(item)} />
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn style={{ flex: 1 }} kind="ghost" renderIcon={(c, s) => <SvgIcon name="edit" size={s} color={c} />} label="แก้ไข" onPress={onEdit} />
              <Btn style={{ flex: 1 }} kind="ghost" renderIcon={(c, s) => <SvgIcon name="trash" size={s} color={c} />} label="ลบ" onPress={() => setConfirm(true)} />
            </View>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            <Txt size={13} color={t.sub}>
              {item.repeat !== 'none' ? 'กิจกรรมนี้เป็นชุดทำซ้ำ — ลบแบบไหน?' : 'ยืนยันการลบ?'}
            </Txt>
            {item.repeat !== 'none' ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Btn
                  style={{ flex: 1 }}
                  kind="danger"
                  label="เฉพาะครั้งนี้"
                  onPress={() => {
                    deleteOne(item);
                    closeSheet();
                    showToast('ลบครั้งนี้แล้ว');
                  }}
                />
                <Btn
                  style={{ flex: 1 }}
                  kind="danger"
                  label="ทั้งชุด (เก็บประวัติ)"
                  onPress={() => {
                    deleteSeries(item);
                    closeSheet();
                    showToast('ลบทั้งชุดแล้ว');
                  }}
                />
              </View>
            ) : (
              <Btn
                kind="danger"
                renderIcon={(c, s) => <SvgIcon name="trash" size={s} color={c} />}
                label="ลบกิจกรรมนี้"
                onPress={() => {
                  deleteOne(item);
                  closeSheet();
                  showToast('ลบแล้ว');
                }}
              />
            )}
            <Btn kind="ghost" label="ยกเลิก" onPress={() => setConfirm(false)} />
          </View>
        )}
        </>
        )}
      </Animated.View>
    </Modal>
  );
}

/** การ์ดข้อมูลผู้ติดต่อของเคส — แต่ละช่องทาง (โทร/LINE/อีเมล/Zoom/Meet) มี 2 ปุ่ม: คัดลอก + เปิดแอป · แตะดินสอเพื่อแก้ไข */
function ContactCard({ c, onEdit, showToast }: { c: Contact; onEdit: (c: Contact) => void; showToast: (m: string) => void }) {
  const t = useTokens();

  const copy = async (label: string, value: string) => {
    await Clipboard.setStringAsync(value);
    showToast(`คัดลอก${label}แล้ว ✓`);
  };
  const open = async (label: string, url: string) => {
    showToast(`กำลังเปิด ${label}…`);
    try {
      await Linking.openURL(url);
    } catch {
      showToast('เปิดแอปไม่ได้');
    }
  };

  // ช่องทางติดต่อที่มีข้อมูล — ไอคอน SVG + สิ่งที่แสดง (display) + สิ่งที่คัดลอก (value) + URL สำหรับเปิดแอป
  const methods = [
    c.phone && { label: 'เบอร์โทร', icon: 'phone', display: c.phone, value: c.phone, url: `tel:${c.phone.replace(/[^0-9+]/g, '')}` },
    c.line && { label: 'LINE', icon: 'line', display: c.line, value: c.line, url: `https://line.me/R/ti/p/~${c.line.replace(/^@/, '')}` },
    c.email && { label: 'อีเมล', icon: 'mail', display: c.email, value: c.email, url: `mailto:${c.email}` },
    c.zoom && { label: 'Zoom', icon: 'video', display: 'ห้อง Zoom', value: c.zoom, url: zoomDeepLink(c.zoom) },
    c.googlemeet && { label: 'Google Meet', icon: 'video', display: 'ห้อง Google Meet', value: c.googlemeet, url: meetLink(c.googlemeet) },
  ].filter(Boolean) as { label: string; icon: string; display: string; value: string; url: string }[];

  return (
    <View style={{ backgroundColor: t.card2, borderRadius: 14, borderWidth: 1, borderColor: t.line, padding: 12, gap: 9 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <SvgIcon name="user" size={14} color={t.sub} />
        <Txt size={14} weight="bold" style={{ flex: 1 }} numberOfLines={1}>{c.name}</Txt>
        <PriBadge id={c.priority} withLabel />
        <Pressable
          onPress={() => onEdit(c)}
          hitSlop={6}
          style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }}>
          <SvgIcon name="edit" size={14} color={t.sub} />
        </Pressable>
      </View>

      {methods.map((m) => (
        <View key={m.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SvgIcon name={m.icon} size={14} color={t.sub} />
          <Txt size={13} color={t.ink} style={{ flex: 1 }} numberOfLines={1}>
            {m.display}
          </Txt>
          <MiniBtn icon="copy" label="คัดลอก" feedbackIcon="check" feedbackLabel="คัดลอกแล้ว" onPress={() => copy(m.label, m.value)} />
          <MiniBtn icon="extLink" label="เปิด" primary onPress={() => open(m.label, m.url)} />
        </View>
      ))}

      {c.note ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
          <View style={{ paddingTop: 1 }}><SvgIcon name="note" size={13} color={t.sub} /></View>
          <Txt size={12} color={t.sub} style={{ flex: 1 }}>{c.note}</Txt>
        </View>
      ) : null}
      {methods.length === 0 && !c.note ? (
        <Txt size={12} color={t.faint}>ยังไม่มีช่องทางติดต่อ — เพิ่มได้ในสมุดรายชื่อ</Txt>
      ) : null}
    </View>
  );
}

/**
 * ฟอร์มแก้ไขข้อมูลรายชื่อ — เป็นเนื้อหาหลักของแผ่น (แทนรายละเอียดกิจกรรมชั่วคราว)
 * ช่องกรอกอยู่ใน ScrollView เลื่อนได้ · ปุ่มยกเลิก/บันทึกปักท้ายเสมอ (พ้นคีย์บอร์ดเพราะแผ่นถูกยกด้วย marginBottom)
 * ชื่อไม่ได้พิมพ์ตรง ๆ — แตะแถวชื่อเพื่อเปิดรายการรายชื่อทั้งหมด แล้วเลือกเปลี่ยนเป็นคนอื่น (หรือเปลี่ยนชื่อคนเดิม)
 */
function ContactEditForm({
  c,
  showToast,
  onSwap,
  onClose,
}: {
  c: Contact;
  showToast: (m: string) => void;
  /** เลือกรายชื่ออื่นจากสมุด — สลับรายชื่อของเคสนี้เป็นคนที่เลือก */
  onSwap: (next: Contact) => void;
  onClose: () => void;
}) {
  const t = useTokens();
  const [d, setD] = useState<Contact>({ ...c });
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);

  const save = async () => {
    const name = d.name.trim();
    if (!name) return showToast('ใส่ชื่อก่อน');
    setSaving(true);
    try {
      await useContacts.getState().upsert({
        id: d.id,
        name,
        priority: d.priority,
        phone: d.phone || null,
        line: d.line || null,
        email: d.email || null,
        zoom: d.zoom || null,
        googlemeet: d.googlemeet || null,
        note: d.note || null,
      });
      showToast('บันทึกรายชื่อแล้ว ✓');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (picking)
    return (
      <ContactPicker
        current={c}
        onPick={(next) => {
          setPicking(false);
          if (next.id !== c.id) onSwap(next); // คนใหม่ → พ่อแม่สลับรายชื่อของเคส แล้ว remount ฟอร์มเป็นของคนใหม่
        }}
        onRename={(name) => {
          setD({ ...d, name });
          setPicking(false);
          showToast('เปลี่ยนชื่อแล้ว — กด "ยืนยัน" เพื่อบันทึก');
        }}
        onCancel={() => setPicking(false)}
      />
    );

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <SvgIcon name="edit" size={16} color={ACCENT} />
        <Txt size={16} weight="bold" style={{ flex: 1 }} numberOfLines={1}>แก้ไขรายชื่อ · {c.name}</Txt>
      </View>

      <ScrollView
        style={{ maxHeight: 320 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: 2 }}>
        {/* ชื่อ — เลือกจากรายการรายชื่อทั้งหมด (แตะเพื่อเปลี่ยนเป็นคนอื่น / เปลี่ยนชื่อคนนี้) */}
        <Pressable
          onPress={() => setPicking(true)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: t.sheet,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: t.line,
            paddingHorizontal: 11,
            paddingVertical: 9,
            minHeight: 44,
          }}>
          <SvgIcon name="user" size={14} color={t.sub} />
          <View style={{ flex: 1 }}>
            <Txt size={14} weight="med" numberOfLines={1} color={d.name.trim() ? t.ink : t.faint}>
              {d.name.trim() || 'ชื่อ *'}
            </Txt>
            <Txt size={11} color={t.faint}>แตะเพื่อเลือกจากรายชื่อทั้งหมด</Txt>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 9, backgroundColor: t.chip }}>
            <SvgIcon name="users" size={12} color={t.sub} />
            <Txt size={11} weight="med" color={t.sub}>เปลี่ยน</Txt>
          </View>
        </Pressable>
        <Field value={d.phone ?? ''} placeholder="เบอร์โทร (ไม่บังคับ)" keyboardType="phone-pad" onChange={(phone) => setD({ ...d, phone })} showToast={showToast} />
        <Field value={d.line ?? ''} placeholder="LINE ID (ไม่บังคับ)" onChange={(line) => setD({ ...d, line })} showToast={showToast} />
        <Field value={d.email ?? ''} placeholder="อีเมล (ไม่บังคับ)" keyboardType="email-address" onChange={(email) => setD({ ...d, email })} showToast={showToast} />
        <Field value={d.zoom ?? ''} placeholder="ลิงก์ Zoom หรือ Meeting ID (ไม่บังคับ)" onChange={(zoom) => setD({ ...d, zoom })} showToast={showToast} />
        <Field value={d.googlemeet ?? ''} placeholder="ลิงก์ Google Meet หรือรหัสห้อง (ไม่บังคับ)" onChange={(googlemeet) => setD({ ...d, googlemeet })} showToast={showToast} />
        <Field value={d.note ?? ''} placeholder="หมายเหตุ / ข้อมูลอื่น ๆ (ไม่บังคับ)" onChange={(note) => setD({ ...d, note })} multiline showToast={showToast} />

        <Txt size={12} weight="med" color={t.sub}>ระดับความสำคัญ</Txt>
        <ChipRow>
          {PRI.map((p) => (
            <Chip
              key={p.id}
              small
              label={`${p.id} · ${p.label}`}
              color={p.color}
              active={d.priority === p.id}
              onPress={() => setD({ ...d, priority: p.id })}
            />
          ))}
        </ChipRow>
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn style={{ flex: 1 }} kind="ghost" label="ยกเลิก" disabled={saving} onPress={onClose} />
        <Btn style={{ flex: 1 }} renderIcon={(c2, s) => <SvgIcon name="check" size={s} color={c2} />} label={saving ? 'กำลังบันทึก…' : 'ยืนยัน'} disabled={saving} onPress={save} />
      </View>
    </View>
  );
}

/**
 * เลือกรายชื่อ — ลิสต์รายชื่อทั้งหมดในสมุด (ค้นหาชื่อ/เบอร์/LINE ได้)
 *  • แตะรายชื่อ → สลับรายชื่อของเคสนี้เป็นคนนั้น (คนปัจจุบันมีเครื่องหมายถูก)
 *  • พิมพ์ชื่อที่ยังไม่มีในสมุด → ใช้เป็นชื่อใหม่ของคนปัจจุบันได้ (เท่ากับแก้ชื่อแบบเดิม)
 */
function ContactPicker({
  current,
  onPick,
  onRename,
  onCancel,
}: {
  current: Contact;
  onPick: (c: Contact) => void;
  onRename: (name: string) => void;
  onCancel: () => void;
}) {
  const t = useTokens();
  const all = useContacts((s) => s.list);
  const [q, setQ] = useState('');

  const query = q.trim().replace(/\s+/g, ' ');
  const k = query.toLowerCase();
  const shown = k
    ? all.filter(
        (c) =>
          c.name.toLowerCase().includes(k) ||
          (c.phone ?? '').replace(/\s+/g, '').includes(k) ||
          (c.line ?? '').toLowerCase().includes(k) ||
          (c.email ?? '').toLowerCase().includes(k),
      )
    : all;
  // พิมพ์ชื่อที่ยังไม่มีในสมุด (และไม่ใช่ชื่อเดิม) → เสนอเป็นการเปลี่ยนชื่อคนปัจจุบัน
  const canRename = !!query && !all.some((c) => c.name.trim().toLowerCase() === k);

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Pressable
          onPress={onCancel}
          hitSlop={6}
          style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chevL" size={15} color={t.sub} />
        </Pressable>
        <Txt size={16} weight="bold" style={{ flex: 1 }} numberOfLines={1}>เลือกรายชื่อ</Txt>
        <Txt size={12} num color={t.faint}>{all.length} รายชื่อ</Txt>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.sheet, borderRadius: 10, borderWidth: 1, borderColor: t.line, paddingHorizontal: 11 }}>
        <Icon name="search" size={15} color={t.faint} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="ค้นหาชื่อ / เบอร์ / LINE…"
          placeholderTextColor={t.faint}
          autoCorrect={false}
          style={{ flex: 1, paddingVertical: 10, color: t.ink, fontFamily: FONT.ui, fontSize: 14 }}
        />
        {q ? (
          <Pressable onPress={() => setQ('')} hitSlop={6}>
            <SvgIcon name="x" size={14} color={t.faint} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 2 }}>
        {shown.map((c) => (
          <PickRow key={c.id} c={c} active={c.id === current.id} onPress={() => onPick(c)} />
        ))}
        {!shown.length ? (
          <Txt size={12.5} color={t.faint} style={{ paddingVertical: 8 }}>
            ไม่พบรายชื่อที่ตรงกับคำค้น
          </Txt>
        ) : null}
        {canRename ? (
          <Pressable
            onPress={() => onRename(query)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: ACCENT + '55',
              backgroundColor: ACCENT + '12',
              paddingHorizontal: 11,
              paddingVertical: 10,
            }}>
            <SvgIcon name="edit" size={14} color={ACCENT} />
            <Txt size={13} color={ACCENT} weight="med" style={{ flex: 1 }} numberOfLines={2}>
              ใช้ “{query}” เป็นชื่อใหม่ของ {current.name}
            </Txt>
          </Pressable>
        ) : null}
      </ScrollView>

      <Btn kind="ghost" label="ยกเลิก" onPress={onCancel} />
    </View>
  );
}

/** แถวรายชื่อในหน้าเลือก — ป้ายระดับ · ชื่อ · ช่องทางย่อ · ติ๊กถูกถ้าเป็นคนที่ใช้อยู่ */
function PickRow({ c, active, onPress }: { c: Contact; active: boolean; onPress: () => void }) {
  const t = useTokens();
  const sub = [c.phone, c.line, c.email].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: active ? ACCENT : t.line,
        backgroundColor: active ? ACCENT + '10' : t.card2,
        paddingHorizontal: 11,
        paddingVertical: 9,
      }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={13.5} weight={active ? 'bold' : 'med'} numberOfLines={1}>{c.name}</Txt>
        {sub ? <Txt size={11} color={t.faint} numberOfLines={1}>{sub}</Txt> : null}
      </View>
      <PriBadge id={c.priority} />
      {active ? <SvgIcon name="check" size={15} color={ACCENT} /> : null}
    </Pressable>
  );
}

/** ช่องกรอกในฟอร์มแก้ไขรายชื่อ — มีปุ่ม "ลบ" (ล้างข้อความ) + "วาง" (วางจากคลิปบอร์ด) ประจำช่อง */
function Field({
  value,
  placeholder,
  onChange,
  multiline,
  keyboardType,
  showToast,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  showToast: (m: string) => void;
}) {
  const t = useTokens();

  const paste = async () => {
    const txt = await Clipboard.getStringAsync();
    if (!txt) return showToast('คลิปบอร์ดว่าง');
    onChange(multiline ? txt : txt.replace(/\s+/g, ' ').trim());
    showToast('วางข้อความแล้ว ✓');
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', gap: 6 }}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.faint}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
        style={{
          flex: 1,
          backgroundColor: t.sheet,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: t.line,
          paddingHorizontal: 11,
          paddingVertical: 10,
          color: t.ink,
          fontFamily: FONT.ui,
          fontSize: 14,
          minHeight: multiline ? 56 : 44,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
      <View style={{ flexDirection: 'row', gap: 6, paddingTop: multiline ? 4 : 0 }}>
        <FieldBtn icon="x" label="ลบ" disabled={!value} onPress={() => onChange('')} />
        <FieldBtn icon="clipboard" label="วาง" onPress={paste} />
      </View>
    </View>
  );
}

/** ปุ่มประจำช่องกรอก (ลบ/วาง) — ไอคอน + ป้ายสั้น */
function FieldBtn({ icon, label, disabled, onPress }: { icon: string; label: string; disabled?: boolean; onPress: () => void }) {
  const t = useTokens();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        minWidth: 52,
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 9,
        backgroundColor: t.chip,
        opacity: disabled ? 0.4 : 1,
      }}>
      <SvgIcon name={icon} size={12} color={t.sub} />
      <Txt size={11} weight="med" color={t.sub}>{label}</Txt>
    </Pressable>
  );
}

/** ปุ่มเล็กในการ์ดผู้ติดต่อ (คัดลอก / เปิด) — แสดงผลตอบรับชั่วครู่หลังกด (เช่น "คัดลอกแล้ว ✓") */
function MiniBtn({
  icon,
  label,
  primary,
  feedbackIcon,
  feedbackLabel,
  onPress,
}: {
  icon: string;
  label: string;
  primary?: boolean;
  feedbackIcon?: string;
  feedbackLabel?: string;
  onPress: () => void | Promise<void>;
}) {
  const t = useTokens();
  const [hit, setHit] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const handle = async () => {
    await onPress();
    if (feedbackLabel) {
      setHit(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setHit(false), 1300);
    }
  };

  const showFb = hit && !!feedbackLabel;
  const bg = showFb ? GREEN : primary ? ACCENT : t.chip;
  const fg = showFb || primary ? '#FFFFFF' : t.sub;
  return (
    <Pressable
      onPress={handle}
      hitSlop={4}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9, backgroundColor: bg }}>
      <SvgIcon name={showFb ? feedbackIcon ?? icon : icon} size={12} color={fg} />
      <Txt size={12} weight="med" color={fg}>{showFb ? feedbackLabel : label}</Txt>
    </Pressable>
  );
}
