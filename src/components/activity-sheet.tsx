// Bottom Sheet รายละเอียดกิจกรรม (APP_STRUCTURE.md §3.3) — ใช้ร่วมแท็บวันนี้ + สรุปเคส
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Keyboard, Modal, Pressable, ScrollView, TextInput, View, useWindowDimensions, type TextInputInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StatusDot } from '@/components/b1/status-circle';
import { useNow } from '@/components/b1/use-now';
import { Icon } from '@/components/icon';
import { NoteBtn, NoteKeyboardBar, useKeyboardHeight } from '@/components/note-bar';
import { SnippetChips } from '@/components/snippet-chips';
import { SvgIcon } from '@/components/svg-icon';
import { Btn, Chip, ChipRow, PriBadge, Txt, pressFade, useTokens } from '@/components/ui';
import { ATTN, CAT_BY_ID, DANGER, FONT, GREEN, PRI, type PriorityId } from '@/constants/theme';
import { MONTH_TH, WD_TH, addDays, durText, fmtMin, fmtRange, fromISO, thaiDate, wdMon } from '@/lib/dates';
import { daytimeFreeSlots, seriesDates } from '@/lib/engine';
import { appendNote, previousNotes, stripTemplate } from '@/lib/notes';
import { isPast, railState } from '@/lib/progress';
import type { Contact, ContactInfo, DayItem, OccStatus } from '@/lib/types';
import { useActivities, useDay } from '@/stores/activities';
import { contactMethods, openLink, useContacts, type ContactMethod } from '@/stores/contacts';
import { useDraft } from '@/stores/draft';
import { useSettings } from '@/stores/settings';
import { useUI } from '@/stores/ui';

export function ActivitySheet() {
  const sheet = useUI((s) => s.sheet);
  const resc = useUI((s) => s.resc);
  // แผ่นที่วาดอยู่ — ค้างไว้หลัง store ปิดแล้ว จนแอนิเมชันปิดเล่นจบ (SheetBody เรียก onClosed)
  const [shown, setShown] = useState(sheet);
  if (sheet && sheet !== shown) setShown(sheet);
  // ปิดเพื่อเปิดแผ่นเลื่อนนัดต่อทันที → ถอดแผ่นนี้เลย ไม่เล่นปิด (Modal สองอันซ้อนช่วงสั้น ๆ เปิดไม่ขึ้นบน iOS)
  else if (!sheet && shown && resc) setShown(null);
  if (!shown) return null;
  return (
    <SheetBody
      key={`${shown.id}:${shown.date}`}
      id={shown.id}
      date={shown.date}
      focusNote={!!shown.focusNote}
      closing={!sheet}
      onClosed={() => setShown((cur) => (useUI.getState().sheet ? cur : null))}
    />
  );
}

function SheetBody({ id, date, focusNote, closing, onClosed }: { id: number; date: string; focusNote: boolean; closing: boolean; onClosed: () => void }) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const closeSheet = useUI((s) => s.closeSheet);
  const openResc = useUI((s) => s.openResc);
  const showToast = useUI((s) => s.showToast);
  const { setStatus, setNote, reschedule, deleteMany, deleteSeries, update, acts, occ, notes } = useActivities();
  const now = useNow();
  const contacts = useContacts((s) => s.list);
  const dayList = useDay(date);
  const live = dayList.find((i) => i.id === id);
  // ภาพล่าสุดของรายการ — ระหว่างเล่นปิดใช้ภาพนี้ (รายการถูกลบ/เลื่อนไปแล้ว เนื้อหาบนแผ่นไม่กระตุกเปลี่ยน)
  const [snap, setSnap] = useState<DayItem | undefined>(live);
  if (!closing && live && live !== snap) setSnap(live);
  const item = closing ? (snap ?? live) : (live ?? snap);
  const tomorrowList = useDay(addDays(date, 1));
  const noteCfgs = useSettings((s) => s.noteCfg);
  const noteDisplay = useSettings((s) => s.noteDisplay);
  const savedNote = notes[date]?.[id] ?? '';
  const [noteText, setNoteText] = useState(savedNote);
  /** แม่แบบเติมให้ได้ครั้งเดียวต่อการเปิดแผ่น — ล้างข้อความแล้วไม่เด้งแม่แบบกลับมา */
  const [tplArmed, setTplArmed] = useState(!savedNote);
  const noteRef = useRef<TextInputInstance>(null);
  const [confirm, setConfirm] = useState(false);
  /** โน้ตยังไม่บันทึกแต่ผู้ใช้จะปิดแผ่น/ไปหน้าอื่น — เก็บสิ่งที่จะทำต่อไว้ แล้วถามก่อน (ทิ้ง / บันทึกแล้วไปต่อ) */
  const [leaveAsk, setLeaveAsk] = useState<{ go: () => void } | null>(null);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [adding, setAdding] = useState(false); // เปิดรายการรายชื่อเพื่อเพิ่มเข้าเคสนี้
  const kb = useKeyboardHeight();
  const { height: winH } = useWindowDimensions();
  /** เคอร์เซอร์อยู่ในช่องโน้ต — คู่กับคีย์บอร์ดเปิด = โหมดจดโน้ต (แผ่นย่อเหลือส่วนโน้ต + แถบปุ่มติดเหนือคีย์บอร์ด) */
  const [noteFocused, setNoteFocused] = useState(false);

  // เข้าเร็วและลื่น: Modal ไม่ใส่แอนิเมชันของระบบ (ช้า ~300ms) — สไลด์ขึ้น+จางเข้าเองด้วย native driver สั้น ๆ
  // ปิด: เล่นย้อน (เลื่อนลง+จางออก) จบแล้วค่อยถอด Modal ผ่าน onClosed
  const [anim] = useState(() => new Animated.Value(0));
  const closed = useEffectEvent(onClosed);
  useEffect(() => {
    Animated.timing(anim, {
      toValue: closing ? 0 : 1,
      duration: closing ? 140 : 160,
      easing: closing ? Easing.in(Easing.quad) : Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && closing) closed();
    });
  }, [anim, closing]);

  // รายการหายไปขณะแผ่นเปิดอยู่ (ถูกลบจากที่อื่น) → ปิดแผ่น
  useEffect(() => {
    if (!live && !closing) closeSheet();
  }, [live, closing, closeSheet]);

  if (!item) return null;
  const cat = CAT_BY_ID[item.cat];
  const state = railState(item, now, null);
  const canResc = item.ostatus !== 'rescheduled';
  const dur = item.endMin - item.startMin;

  // ตัวเลือกสถานะ 3 ทาง — วงกลมชุดเดียวกับราง · กดซ้ำอันที่เลือกอยู่ = ไม่เปลี่ยน
  const pickStatus = (next: OccStatus | null) => {
    const cur: OccStatus | null = item.ostatus === 'planned' ? null : item.ostatus;
    if (cur === next) return;
    setStatus(item, next);
    showToast(next === 'done' ? 'บันทึกว่าทำแล้ว' : next === 'skipped' ? 'บันทึกว่าข้าม' : 'เปลี่ยนเป็นยังไม่ทำ', { label: 'เลิกทำ', run: () => setStatus(item, cur) });
  };

  // โน้ตตามหมวด: ข้อความตัวอย่าง + แม่แบบ (เติมให้เมื่อแตะช่องที่ยังว่าง · บรรทัดแม่แบบที่ไม่ได้กรอกถูกตัดตอนบันทึก)
  const noteCfg = noteCfgs[item.cat];
  // จำนวนโน้ตครั้งก่อน / ชิปโน้ตสำเร็จรูป ตั้งที่ ตั้งค่า › จัดการโน้ต (0 = ไม่แสดง)
  const prevNotes = previousNotes(item, notes, acts, noteDisplay.prevCount);

  const fillTemplate = () => {
    if (!tplArmed) return;
    setTplArmed(false);
    if (!noteText.trim() && noteCfg.template.trim()) setNoteText(noteCfg.template);
  };
  const cleanNote = stripTemplate(noteText, noteCfg.template);
  /**
   * การแก้ไขโน้ตที่ยังไม่บันทึก — ทุกแบบต้องกด "บันทึก" (หรือ "ยืนยันลบ") ก่อนถึงจะมีผล · "ยกเลิก" = กลับเป็นโน้ตเดิม
   * add = ยังไม่มีโน้ตแล้วพิมพ์ใหม่ · edit = แก้โน้ตเดิม · delete = กด "ลบโน้ต" หรือล้างช่องจนว่างทั้งที่มีโน้ตเดิม
   * (ช่องที่มีแค่แม่แบบยังไม่ได้กรอก = ไม่มีการแก้ไข)
   */
  const notePending: 'add' | 'edit' | 'delete' | null =
    cleanNote === savedNote ? null : !cleanNote ? 'delete' : savedNote ? 'edit' : 'add';
  // แก้จนกลับเป็นโน้ตเดิมแล้ว — แถบถามก่อนออกที่ค้างไว้ไม่ต้องใช้แล้ว
  if (leaveAsk && !notePending) setLeaveAsk(null);
  /** บันทึกการแก้ไขที่ค้างอยู่ (รวมยืนยันลบ) */
  const commitNote = () => {
    if (!notePending) return;
    setLeaveAsk(null);
    noteRef.current?.blur();
    setTplArmed(false);
    if (notePending === 'delete') {
      setNoteText('');
      setNote(item, '');
      showToast('ลบโน้ตแล้ว');
      return;
    }
    setNoteText(cleanNote); // ตัดบรรทัดแม่แบบที่ไม่ได้กรอกออกจากช่องด้วย
    setNote(item, cleanNote);
    showToast(notePending === 'add' ? 'บันทึกโน้ตแล้ว ✓' : 'บันทึกการแก้ไขโน้ตแล้ว ✓');
  };
  /** ยกเลิกการแก้ไข — กลับเป็นโน้ตที่บันทึกไว้ (ยังไม่มีโน้ต: แตะช่องครั้งหน้าแม่แบบเติมให้ใหม่) */
  const discardNote = () => {
    setLeaveAsk(null);
    noteRef.current?.blur();
    setNoteText(savedNote);
    setTplArmed(!savedNote);
  };
  /** ล้างข้อความในช่องแล้วโฟกัสให้พิมพ์ใหม่ — มีโน้ตเดิมแล้วปล่อยว่าง = ร่างการลบ (ต้องยืนยัน) */
  const clearNoteText = () => {
    setTplArmed(false);
    setNoteText('');
    noteRef.current?.focus();
  };
  /** "ลบโน้ต" — ยังไม่ลบจริง: ล้างช่องเป็นร่างการลบ รอกด "ยืนยันลบ" หรือ "ยกเลิก" */
  const deleteNote = () => {
    setTplArmed(false);
    setNoteText('');
    noteRef.current?.blur();
  };
  /** ปิดแผ่น/ไปหน้าอื่น — โน้ตยังไม่บันทึกให้ถามก่อน (แผ่นถูกถอดออกแล้วร่างจะหาย) */
  const leave = (go: () => void) => {
    if (!notePending) return go();
    Keyboard.dismiss();
    setLeaveAsk({ go });
  };
  const requestClose = () => leave(closeSheet);
  /**
   * โหมดจดโน้ต: กำลังพิมพ์ในช่องโน้ตและคีย์บอร์ดเปิดอยู่ — ซ่อนส่วนอื่นของแผ่นชั่วคราว (สถานะ/เลื่อน/แก้ไข/ลบ/รายชื่อ)
   * ให้ช่องโน้ต + โน้ตครั้งก่อน + ชิปพอดีเหนือคีย์บอร์ด และย้ายปุ่ม ยกเลิก/บันทึก ไปแถบติดขอบคีย์บอร์ด (ไม่ถูกคีย์บอร์ดบัง)
   * ซ่อนด้วยการสลับเป็น null ทีละส่วน — ช่องโน้ตต้องอยู่ตำแหน่งเดิมในโครง ไม่งั้นถูกสร้างใหม่แล้วคีย์บอร์ดหุบ
   */
  const typing = noteFocused && kb > 0 && !adding && !editContact && !confirm && !leaveAsk;
  /** ความสูงที่แผ่นใช้ได้เหนือคีย์บอร์ด (ไม่ทับแถบสถานะ) — เกินนี้โน้ตครั้งก่อนหดก่อน */
  const typingMax = winH - kb - insets.top - 6;
  /** จอเตี้ย: ตัดบรรทัดวันเวลาออกด้วย ให้ช่องโน้ตยังสูงพอ */
  const tight = typing && typingMax < 460;
  /**
   * แทรกโน้ตครั้งก่อน/โน้ตสำเร็จรูปลงช่อง — ช่องว่าง (หรือมีแค่แม่แบบ) = แทนที่ · มีข้อความแล้ว = ต่อท้าย
   * เป็นร่างจนกด "บันทึก" เหมือนการพิมพ์เอง · ข้อความถูกคัดลอกมา (แก้/ลบต้นทางทีหลังไม่กระทบโน้ตนี้)
   */
  const insertNote = (text: string) => {
    setTplArmed(false);
    setNoteText(appendNote(noteText, noteCfg.template, text));
  };
  const openNoteSettings = () =>
    leave(() => {
      useUI.getState().parkSheet();
      router.push('/settings/notes');
    });

  // เลื่อนด่วน: ช่วงว่างถัดไปที่ยาวพอ (วันเดียวกัน หลังตอนนี้/หลังรายการนี้) · พรุ่งนี้เวลาเดิม · เลือกเอง (Reschedule Modal)
  const others = dayList.filter((x) => x.id !== item.id);
  const after = Math.max(item.endMin, date === now.date ? now.min : 0);
  const slot = daytimeFreeSlots(others).find((s) => Math.max(s.start, after) + dur <= s.end);
  const slotStart = slot ? Math.ceil(Math.max(slot.start, after) / 15) * 15 : null;
  const quickSlot = slotStart != null && slotStart + dur <= slot!.end ? slotStart : null;
  const tomorrowBusy = tomorrowList.some((x) => x.id !== item.id && x.startMin < item.endMin && item.startMin < x.endMin);
  const moveTo = (toDate: string, start: number, label: string) =>
    leave(() => {
      reschedule(item, { date: toDate, start, end: start + dur }, '');
      closeSheet();
      showToast(`เลื่อนไป ${label} แล้ว`);
    });

  // สรุปของชุดทำซ้ำ (ถึงวันนี้)
  const series = acts.find((a) => a.id === item.id);
  const seriesStat = (() => {
    if (!series || series.repeat === 'none') return null;
    let total = 0;
    let doneN = 0;
    let skip = 0;
    for (const d of seriesDates(series)) {
      if (d > now.date) break;
      const st = occ[d]?.[series.id];
      if (st === 'cancelled' || st === 'rescheduled') continue;
      if (!st && isPast({ date: d, endMin: series.endMin }, now) === false) continue;
      total++;
      if (st === 'done') doneN++;
      if (st === 'skipped') skip++;
    }
    return total ? { total, done: doneN, skip } : null;
  })();
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

  /** เพิ่มรายชื่อเข้าเคสนี้ (ทั้งชุดถ้าเป็นกิจกรรมทำซ้ำ) — คนที่อยู่แล้วไม่เพิ่มซ้ำ */
  const addContact = (c: Contact) => {
    const a = acts.find((x) => x.id === item.id);
    if (!a) return showToast('ไม่พบกิจกรรมนี้');
    setAdding(false);
    if (a.contactIds.includes(c.id)) return showToast(`${c.name} อยู่ในเคสนี้อยู่แล้ว`);
    update({ ...a, contactIds: [...a.contactIds, c.id] });
    showToast(`เพิ่ม ${c.name} เข้าเคสแล้ว ✓`);
  };

  /** ถอดรายชื่อออกจากเคสนี้ (ทั้งชุดถ้าเป็นกิจกรรมทำซ้ำ) — ตัวรายชื่อในสมุดยังอยู่ครบ */
  const removeContact = (c: Contact) => {
    const a = acts.find((x) => x.id === item.id);
    if (!a) return showToast('ไม่พบกิจกรรมนี้');
    update({ ...a, contactIds: a.contactIds.filter((cid) => cid !== c.id) });
    showToast(`ถอด ${c.name} ออกจากเคสแล้ว`);
  };

  /** ไปหน้าสมุดรายชื่อ — พักแผ่นนี้ไว้ก่อน กด "กลับ" ที่หน้านั้นแล้วแผ่นจะเปิดคืนให้เอง */
  const openContactBook = () =>
    leave(() => {
      useUI.getState().parkSheet();
      router.push('/settings/contacts');
    });

  // แก้ไข → พาไปฟอร์ม พร้อมพักแผ่นไว้: กด "กลับ" ที่ฟอร์มแล้วแผ่นของกิจกรรมนี้เปิดคืน (ฟอร์มยังคาแก้ไขไว้เหมือนเดิม)
  const onEdit = () => {
    const a = acts.find((x) => x.id === item.id);
    if (a) {
      leave(() => {
        useDraft.getState().loadActivity(a, item.date); // จำวันที่เปิด — ใช้กับขอบเขต "เฉพาะครั้งนี้/ตั้งแต่ครั้งนี้"
        useUI.getState().parkSheet();
        router.push('/add');
      });
    }
  };

  return (
    <Modal
      transparent
      animationType="none"
      onRequestClose={() => {
        // กำลังเล่นปิด (เช่น พักแผ่นไว้เพื่อไปหน้าแก้ไข) — ปุ่มย้อนกลับของเครื่องไม่ต้องสั่งปิดซ้ำ จะไปล้างแผ่นที่พักไว้
        if (!closing) requestClose();
      }}>
      {/* ไม่มีฉากหลังมืด — โปร่งใส แตะพื้นที่ว่างเพื่อปิดได้เหมือนเดิม */}
      <Pressable style={{ flex: 1 }} onPress={closing ? undefined : requestClose} />
      <Animated.View
        // กำลังเล่นปิด — ไม่รับการแตะแล้ว
        pointerEvents={closing ? 'none' : 'auto'}
        style={{
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
          backgroundColor: t.sheet,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          padding: 20,
          // ยกแผ่นให้พ้นคีย์บอร์ด (iOS/Android) — เปิดคีย์บอร์ด: ดันขึ้นด้วย marginBottom, ปิด: เว้น safe area
          marginBottom: kb,
          paddingBottom: typing ? 0 : kb > 0 ? 20 : insets.bottom + 20,
          maxHeight: typing ? typingMax : undefined,
          gap: 12,
          // เงานุ่มแทน overlay — ให้แผ่นยังแยกจากเนื้อหาด้านหลังชัด
          shadowColor: '#000',
          shadowOpacity: 0.22,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: -8 },
          elevation: 16,
        }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: t.line2, alignSelf: 'center' }} />

        {/* ถามก่อนปิด/ออกเมื่อโน้ตยังไม่บันทึก — อยู่บนสุดของแผ่นให้เห็นทันที */}
        {leaveAsk && notePending ? (
          <LeaveNoteAsk
            pending={notePending}
            onBack={() => setLeaveAsk(null)}
            onDiscard={() => {
              const { go } = leaveAsk;
              setLeaveAsk(null);
              discardNote();
              go();
            }}
            onSave={() => {
              const { go } = leaveAsk;
              setLeaveAsk(null);
              commitNote();
              go();
            }}
          />
        ) : null}

        {adding ? (
          <ContactPicker
            title="เพิ่มรายชื่อเข้าเคส"
            selectedIds={item.contactIds}
            onPick={addContact}
            onOpenBook={openContactBook}
            onCancel={() => setAdding(false)}
          />
        ) : editContact ? (
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
          {item.repeat !== 'none' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="repeat" size={13} color={t.sub} />
              <Txt size={12} color={t.sub}>ชุดทำซ้ำ</Txt>
            </View>
          ) : null}
          <View style={{ flex: 1 }} />
          <Pressable accessibilityRole="button" accessibilityLabel="ปิด" onPress={requestClose} hitSlop={6} style={pressFade({ width: 40, height: 40, borderRadius: 20, backgroundColor: t.track, alignItems: 'center', justifyContent: 'center' })}>
            <SvgIcon name="x" size={16} color={t.sub} strokeWidth={2.4} />
          </Pressable>
        </View>

        {typing ? null : state === 'overdue' ? (
          <Txt size={12.5} weight="bold" color={t.warn}>
            ค้างบันทึก · เลยเวลามา {date < now.date ? 'ตั้งแต่วันก่อน' : durText(now.min - item.endMin)}
          </Txt>
        ) : state === 'current' ? (
          <Txt size={12.5} weight="bold" color={t.accentInk}>
            กำลังทำ · เหลืออีก {durText(item.endMin - now.min)}
          </Txt>
        ) : item.ostatus === 'rescheduled' ? (
          <Txt size={12.5} weight="bold" color={t.accentInk}>เลื่อนไปแล้ว</Txt>
        ) : null}
        <Txt size={typing ? 17 : 21} weight="bold" numberOfLines={typing ? 1 : undefined} style={{ lineHeight: typing ? 24 : 29, flexShrink: 0 }}>{item.title}</Txt>
        {tight ? null : (
          <Txt size={14} num color={t.sub}>
            {thaiDate(date)} · {fmtRange(item.startMin, item.endMin)} ({durText(item.endMin - item.startMin)})
          </Txt>
        )}
        {item.loc && !typing ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <SvgIcon name="mappin" size={14} color={t.sub} />
            <Txt size={13} color={t.sub}>{item.loc}</Txt>
          </View>
        ) : null}
        {item.cat === 'case' && !typing ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <SvgIcon name={item.channel === 'online' ? 'video' : 'users'} size={14} color={t.sub} />
              <Txt size={13} color={t.sub}>
                {item.channel === 'online' ? 'ออนไลน์' : 'พบตัว'}
                {item.inlineContact ? ' · ช่องทางติดต่อ' : caseContacts.length ? ` · ${caseContacts.length} รายชื่อ` : ''}
              </Txt>
            </View>
            {item.inlineContact ? (
              // โหมดช่องทางติดต่อ — ข้อมูลอยู่กับนัดนี้ แก้ไขผ่านฟอร์มกิจกรรม (ไม่มีปุ่มเพิ่มจากสมุดรายชื่อ)
              <ContactCard c={item.inlineContact} inline onEdit={onEdit} showToast={showToast} />
            ) : caseContacts.length ? (
              <>
                <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {caseContacts.map((c) => (
                    <ContactCard key={c.id} c={c} onEdit={() => setEditContact(c)} onRemove={() => removeContact(c)} showToast={showToast} />
                  ))}
                </ScrollView>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                  <Pressable onPress={() => setAdding(true)} style={pressFade({ flexDirection: 'row', alignItems: 'center', gap: 5 })} hitSlop={6}>
                    <Icon name="plus" size={14} color={t.accent} />
                    <Txt size={12.5} weight="med" color={t.accent}>เพิ่มรายชื่ออีกคน</Txt>
                  </Pressable>
                  <Pressable onPress={openContactBook} style={pressFade({ flexDirection: 'row', alignItems: 'center', gap: 5 })} hitSlop={6}>
                    <Icon name="user" size={14} color={t.accent} />
                    <Txt size={12.5} weight="med" color={t.accent}>สมุดรายชื่อ</Txt>
                    <Icon name="chevR" size={13} color={t.accent} />
                  </Pressable>
                </View>
              </>
            ) : (
              /* เคสที่ยังไม่มีรายชื่อ — เลือกจากรายการที่มี หรือไปจัดการที่สมุดรายชื่อ */
              <View style={{ backgroundColor: t.card2, borderRadius: 14, borderWidth: 1, borderColor: t.line, padding: 12, gap: 10 }}>
                <Txt size={12.5} color={t.faint}>ยังไม่มีรายชื่อในเคสนี้ — เลือกจากสมุดรายชื่อเพื่อผูกกับนัดนี้</Txt>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Btn
                    style={{ flex: 1 }}
                    kind="primary"
                    renderIcon={(c, s) => <Icon name="plus" size={s} color={c} />}
                    label="เพิ่มรายชื่อ"
                    onPress={() => setAdding(true)}
                  />
                  <Btn
                    style={{ flex: 1 }}
                    kind="ghost"
                    renderIcon={(c, s) => <Icon name="user" size={s} color={c} />}
                    label="สมุดรายชื่อ"
                    onPress={openContactBook}
                  />
                </View>
              </View>
            )}
          </>
        ) : null}

        {!confirm ? (
          <View style={{ gap: 12, flexShrink: 1 }}>
            {canResc && !typing ? (
              <View style={{ gap: 6 }}>
                <Txt size={12.5} weight="bold" color={t.sub}>สถานะครั้งนี้</Txt>
                <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', backgroundColor: t.track, borderRadius: 14, padding: 3, gap: 2 }}>
                  {([
                    ['done', 'ทำแล้ว', 'done'],
                    ['skipped', 'ข้าม', 'skipped'],
                    [null, 'ยังไม่ทำ', state === 'overdue' || state === 'current' ? state : 'planned'],
                  ] as const).map(([st, label, dot]) => {
                    const on = (item.ostatus === 'planned' ? null : item.ostatus) === st;
                    return (
                      <Pressable
                        key={label}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on }}
                        onPress={() => pickStatus(st)}
                        style={pressFade({ flex: 1, height: 46, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: on ? t.card : 'transparent' })}>
                        <StatusDot state={dot} size={20} />
                        <Txt size={13.5} weight={on ? 'bold' : 'med'} color={on ? t.ink : t.sub}>{label}</Txt>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <View style={{ gap: 6, flexShrink: 1 }}>
              <Txt size={12.5} weight="bold" color={t.sub}>
                โน้ตของครั้งนี้ <Txt size={12.5} color={t.faint}>(ไม่บังคับ)</Txt>
              </Txt>
              {/* โน้ตครั้งก่อนของกิจกรรมเดียวกัน (ใหม่ → เก่า ตามจำนวนที่ตั้งไว้) — ดูความต่อเนื่อง · "ใช้ต่อ" = เอามาเป็นตั้งต้น */}
              {prevNotes.length ? (
                // โหมดจดโน้ต: เตี้ยลงและหดก่อนส่วนอื่นเมื่อที่เหลือน้อย (flexShrink สูง) · persistTaps ให้ "ใช้ต่อ" กดได้ทันทีโดยคีย์บอร์ดไม่หุบ
                <ScrollView style={{ maxHeight: typing ? 112 : 176, flexGrow: 0, flexShrink: 100 }} nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                  {prevNotes.map((p, i) => (
                    <View key={p.date} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: t.track, borderRadius: 10, paddingLeft: 10, paddingRight: 6, paddingVertical: 7 }}>
                      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                        <Txt size={11.5} weight="bold" color={t.sub}>
                          {i === 0 ? 'ครั้งก่อน' : `ก่อนหน้า ${i + 1} ครั้ง`} · {shortThai(p.date)}
                        </Txt>
                        <Txt size={12.5} color={t.ink} numberOfLines={i === 0 ? 3 : 2} style={{ lineHeight: 18 }}>
                          {p.note}
                        </Txt>
                      </View>
                      <Pressable accessibilityRole="button" accessibilityLabel={`ใช้โน้ตของ ${shortThai(p.date)}`} onPress={() => insertNote(p.note)} hitSlop={6} style={({ pressed }) => ({ height: 30, paddingHorizontal: 10, borderRadius: 15, backgroundColor: pressed ? t.rail : t.card, justifyContent: 'center' })}>
                        <Txt size={12} weight="bold" color={t.sub}>
                          ใช้ต่อ
                        </Txt>
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              ) : null}
              {/* โน้ตสำเร็จรูปของหมวดนี้ — แตะเพื่อแทรก (ปักหมุดก่อน แล้วใช้บ่อย) · จำนวนตั้งที่ จัดการโน้ต › แผ่นรายละเอียด */}
              <SnippetChips cat={item.cat} limit={noteDisplay.chips} onPick={insertNote} onManage={openNoteSettings} />
              {/* ช่องโน้ตหดได้เป็นลำดับสุดท้าย (จอเตี้ยมาก) — แถบปุ่มต้องไม่ถูกดันลงหลังคีย์บอร์ด */}
              <View style={{ flexShrink: 1 }}>
                <TextInput
                  ref={noteRef}
                  value={noteText}
                  onChangeText={setNoteText}
                  onFocus={() => {
                    setNoteFocused(true);
                    fillTemplate();
                  }}
                  onBlur={() => setNoteFocused(false)}
                  autoFocus={focusNote}
                  placeholder={noteCfg.hint || 'เช่น สรุปสั้น ๆ ของครั้งนี้'}
                  placeholderTextColor={t.faint}
                  multiline
                  accessibilityLabel="โน้ตของครั้งนี้"
                  style={{ minHeight: 64, maxHeight: 120, flexShrink: 1, borderRadius: 12, borderWidth: 1, borderColor: notePending === 'delete' ? DANGER : notePending ? t.accent : t.rail, backgroundColor: t.card, paddingLeft: 12, paddingRight: 40, paddingTop: 10, paddingBottom: 10, fontFamily: FONT.ui, fontSize: 14, color: t.ink, textAlignVertical: 'top' }}
                />
                {/* ✕ ล้างข้อความทั้งหมดในช่อง — มีโน้ตเดิมแล้วปล่อยว่าง = ร่างการลบ (ยังไม่ลบจนกด "ยืนยันลบ") */}
                {noteText ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="ล้างข้อความในช่องโน้ต" onPress={clearNoteText} hitSlop={8} style={({ pressed }) => ({ position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: pressed ? t.rail : t.track, alignItems: 'center', justifyContent: 'center' })}>
                    <SvgIcon name="x" size={12} color={t.sub} strokeWidth={2.6} />
                  </Pressable>
                ) : null}
              </View>
              {/* มีการแก้ไขค้าง → สถานะ + ยกเลิก / บันทึก (ยืนยันลบ) · ไม่มี → ✓ บันทึกแล้ว + ลบโน้ต · โหมดจดโน้ต: ย้ายไปแถบเหนือคีย์บอร์ด */}
              {typing ? null : notePending ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 34 }}>
                  <Txt size={11.5} weight="bold" color={notePending === 'delete' ? DANGER : t.accentInk} style={{ flex: 1 }} numberOfLines={2}>
                    {notePending === 'delete' ? 'จะลบโน้ตนี้ — ยืนยันเพื่อลบ' : notePending === 'add' ? 'โน้ตใหม่ · ยังไม่บันทึก' : 'แก้ไขแล้ว · ยังไม่บันทึก'}
                  </Txt>
                  <NoteBtn label="ยกเลิก" onPress={discardNote} />
                  <NoteBtn
                    label={notePending === 'delete' ? 'ยืนยันลบ' : 'บันทึก'}
                    icon={notePending === 'delete' ? 'trash' : 'check'}
                    tone={notePending === 'delete' ? 'danger' : 'primary'}
                    onPress={commitNote}
                  />
                </View>
              ) : savedNote ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 34 }}>
                  <Txt size={11.5} color={t.greenInk} style={{ flex: 1 }} numberOfLines={1}>
                    ✓ บันทึกแล้ว
                  </Txt>
                  <Pressable accessibilityRole="button" onPress={deleteNote} hitSlop={6} style={({ pressed }) => ({ height: 32, paddingHorizontal: 10, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: pressed ? DANGER + '22' : 'transparent' })}>
                    <SvgIcon name="trash" size={13} color={DANGER} />
                    <Txt size={12.5} weight="med" color={DANGER}>
                      ลบโน้ต
                    </Txt>
                  </Pressable>
                </View>
              ) : null}
            </View>

            {canResc && !typing ? (
              <View style={{ gap: 6 }}>
                <Txt size={12.5} weight="bold" color={t.sub}>เลื่อนครั้งนี้ไป</Txt>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {quickSlot != null ? (
                    <Pressable accessibilityRole="button" onPress={() => moveTo(date, quickSlot, `${fmtMin(quickSlot)}`)} style={pressFade({ height: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.freeLine, justifyContent: 'center' })}>
                      <Txt size={13} weight="bold" color={t.greenInk}>ช่วงว่าง {fmtMin(quickSlot)}</Txt>
                    </Pressable>
                  ) : null}
                  {!tomorrowBusy ? (
                    <Pressable accessibilityRole="button" onPress={() => moveTo(addDays(date, 1), item.startMin, `พรุ่งนี้ ${fmtMin(item.startMin)}`)} style={pressFade({ height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: t.track, justifyContent: 'center' })}>
                      <Txt size={13} weight="med">พรุ่งนี้ {fmtMin(item.startMin)}</Txt>
                    </Pressable>
                  ) : null}
                  <Pressable accessibilityRole="button" onPress={() => openResc(item)} style={pressFade({ height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: t.track, justifyContent: 'center' })}>
                    <Txt size={13} weight="med">เลือกวันเวลา…</Txt>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {typing ? null : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Btn style={{ flex: 1 }} kind="ghost" renderIcon={(c, sz) => <SvgIcon name="edit" size={sz} color={c} />} label="แก้ไขกิจกรรม" onPress={onEdit} />
                <Pressable accessibilityRole="button" onPress={() => setConfirm(true)} style={pressFade({ height: 46, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 })}>
                  <SvgIcon name="trash" size={16} color={t.warn} />
                  <Txt size={14} weight="bold" color={t.warn}>ลบ…</Txt>
                </Pressable>
              </View>
            )}

            {seriesStat && !typing ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: t.line, paddingTop: 10 }}>
                <Txt size={12.5} color={t.sub} style={{ flex: 1 }}>
                  ชุดนี้: ทำแล้ว {seriesStat.done} จาก {seriesStat.total} ครั้ง{seriesStat.skip ? ` · ข้าม ${seriesStat.skip}` : ''}
                </Txt>
                <Pressable style={pressFade()}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() =>
                    leave(() => {
                      useUI.getState().parkSheet();
                      router.push('/settings/stats');
                    })
                  }>
                  <Txt size={12.5} weight="bold" color={t.accentInk}>ดูสถิติ ›</Txt>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            <Txt size={13} color={t.sub}>
              {item.repeat !== 'none' ? 'กิจกรรมนี้เป็นชุดทำซ้ำ — ลบแบบไหน? (ครั้งก่อนหน้าและสถิติคงเดิมทั้งสองแบบ)' : 'ยืนยันการลบ?'}
            </Txt>
            {item.repeat !== 'none' ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Btn
                  style={{ flex: 1 }}
                  kind="danger"
                  label="เฉพาะครั้งนี้"
                  onPress={() => {
                    const undo = deleteMany([item]);
                    closeSheet();
                    showToast('ลบครั้งนี้แล้ว', { label: 'เลิกทำ', run: undo });
                  }}
                />
                <Btn
                  style={{ flex: 1 }}
                  kind="danger"
                  // ตัดชุดให้จบเมื่อวาน — ตรงกับที่ระบบทำจริง (เดิมป้ายเขียนว่า "ทั้งชุด")
                  label="ตั้งแต่ครั้งนี้ไป"
                  onPress={() => {
                    deleteSeries(item);
                    closeSheet();
                    showToast('ลบตั้งแต่ครั้งนี้เป็นต้นไปแล้ว');
                  }}
                />
              </View>
            ) : (
              <Btn
                kind="danger"
                renderIcon={(c, s) => <SvgIcon name="trash" size={s} color={c} />}
                label="ลบกิจกรรมนี้"
                onPress={() => {
                  const undo = deleteMany([item]);
                  closeSheet();
                  showToast('ลบแล้ว', { label: 'เลิกทำ', run: undo });
                }}
              />
            )}
            <Btn kind="ghost" label="ยกเลิก" onPress={() => setConfirm(false)} />
          </View>
        )}
        </>
        )}

        {/* แถบปุ่มโน้ตติดขอบบนคีย์บอร์ด — มีการแก้ไขค้าง: ยกเลิก / บันทึก (ยืนยันลบ) · ไม่มี: เสร็จ = หุบคีย์บอร์ด */}
        {typing ? (
          <NoteKeyboardBar
            bleed={20}
            strong={!!notePending}
            color={notePending === 'delete' ? DANGER : notePending ? t.accentInk : savedNote ? t.greenInk : t.faint}
            text={
              notePending === 'delete'
                ? 'จะลบโน้ตนี้ — ยืนยันเพื่อลบ'
                : notePending === 'add'
                  ? 'โน้ตใหม่ · ยังไม่บันทึก'
                  : notePending === 'edit'
                    ? 'แก้ไขแล้ว · ยังไม่บันทึก'
                    : savedNote
                      ? '✓ บันทึกแล้ว'
                      : 'ยังไม่มีโน้ต — พิมพ์แล้วกดบันทึก'
            }>
            {notePending ? (
              <>
                <NoteBtn big label="ยกเลิก" onPress={discardNote} />
                <NoteBtn
                  big
                  label={notePending === 'delete' ? 'ยืนยันลบ' : 'บันทึก'}
                  icon={notePending === 'delete' ? 'trash' : 'check'}
                  tone={notePending === 'delete' ? 'danger' : 'primary'}
                  onPress={commitNote}
                />
              </>
            ) : (
              <NoteBtn big label="เสร็จ" a11y="เสร็จ หุบคีย์บอร์ด" onPress={() => noteRef.current?.blur()} />
            )}
          </NoteKeyboardBar>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

/** แถบถามก่อนปิดแผ่น/ไปหน้าอื่น ขณะโน้ตยังไม่บันทึก — กลับไปแก้ต่อ · ทิ้งการแก้ไข · บันทึกแล้วไปต่อ */
function LeaveNoteAsk({ pending, onBack, onDiscard, onSave }: { pending: 'add' | 'edit' | 'delete'; onBack: () => void; onDiscard: () => void; onSave: () => void }) {
  const t = useTokens();
  const del = pending === 'delete';
  return (
    <View style={{ backgroundColor: t.card2, borderRadius: 14, borderWidth: 1, borderColor: del ? DANGER : ATTN, padding: 12, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ paddingTop: 2 }}>
          <SvgIcon name="note" size={15} color={del ? DANGER : t.accentInk} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt size={13.5} weight="bold">
            {del ? 'ยังไม่ได้ยืนยันลบโน้ต' : 'โน้ตยังไม่บันทึก'}
          </Txt>
          <Txt size={12} color={t.sub}>
            {del ? 'ออกตอนนี้โน้ตเดิมจะยังอยู่ — หรือลบให้เลยก่อนออก' : 'ออกตอนนี้ข้อความที่แก้จะหายไป'}
          </Txt>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="กลับไปแก้โน้ตต่อ" onPress={onBack} hitSlop={8} style={({ pressed }) => ({ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.rail : t.track })}>
          <SvgIcon name="x" size={12} color={t.sub} strokeWidth={2.6} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn style={{ flex: 1 }} kind="ghost" label={del ? 'ไม่ลบ ออกเลย' : 'ทิ้งการแก้ไข'} onPress={onDiscard} />
        <Btn style={{ flex: 1 }} kind={del ? 'danger' : 'primary'} label={del ? 'ลบแล้วออก' : 'บันทึกแล้วออก'} onPress={onSave} />
      </View>
    </View>
  );
}

/** "อ 3 พ.ย." — วันที่ย่อสำหรับป้ายโน้ตครั้งก่อน */
function shortThai(iso: string): string {
  const d = fromISO(iso);
  return `${WD_TH[wdMon(iso)]} ${d.getDate()} ${MONTH_TH[d.getMonth()]}`;
}

/**
 * การ์ดข้อมูลผู้ติดต่อของเคส — แต่ละช่องทาง (โทร/LINE/อีเมล/Zoom/Meet) มี 2 ปุ่ม: คัดลอก + เปิดแอป
 * ดินสอ = แก้ไข/เปลี่ยนรายชื่อ · ถังขยะ = ถอดออกจากเคส (ถามยืนยันในการ์ด — ตัวรายชื่อในสมุดไม่ถูกลบ)
 * inline = ช่องทางที่กรอกไว้ในนัด (โหมดช่องทางติดต่อ): ไม่มีระดับ/ถังขยะ · ดินสอพาไปแก้ไขกิจกรรม
 */
function ContactCard({
  c,
  onEdit,
  onRemove,
  inline,
  showToast,
}: {
  c: ContactInfo & { priority?: PriorityId };
  onEdit: () => void;
  onRemove?: () => void;
  inline?: boolean;
  showToast: (m: string) => void;
}) {
  const t = useTokens();
  const [confirmDel, setConfirmDel] = useState(false);

  const copy = async (label: string, value: string) => {
    await Clipboard.setStringAsync(value);
    showToast(`คัดลอก${label}แล้ว ✓`);
  };
  /** เปิดช่องทางนั้น — คืน false เมื่อเปิดไม่ได้ ให้ปุ่มขึ้นสถานะ "เปิดไม่ได้" เอง */
  const open = async (m: ContactMethod) => {
    const res = await openLink(m.url, m.fallback);
    if (res === 'fallback') showToast(`ไม่พบแอป ${m.label} — เปิดในเบราว์เซอร์แทน`);
    if (res === 'fail') showToast(`เปิด ${m.label} ไม่ได้ — ลองคัดลอกแล้ววางในแอปนั้นแทน`);
    return res !== 'fail';
  };

  const methods = contactMethods(c);

  return (
    <View style={{ backgroundColor: t.card2, borderRadius: 14, borderWidth: 1, borderColor: t.line, padding: 12, gap: 9 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <SvgIcon name={inline ? 'phone' : 'user'} size={14} color={t.sub} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt size={14} weight="bold" numberOfLines={1}>{c.name.trim() || 'ช่องทางติดต่อ'}</Txt>
          {c.org ? (
            <Txt size={12} color={t.sub} numberOfLines={1} style={{ lineHeight: 16 }}>
              {c.org}
            </Txt>
          ) : null}
        </View>
        {inline ? (
          <Txt size={11.5} color={t.faint}>เฉพาะนัดนี้</Txt>
        ) : (
          <PriBadge id={c.priority ?? null} withLabel />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={inline ? 'แก้ไขช่องทางติดต่อในนัด' : `แก้ไข ${c.name}`}
          onPress={onEdit}
          hitSlop={6}
          style={pressFade({ width: 28, height: 28, borderRadius: 8, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' })}>
          <SvgIcon name="edit" size={14} color={t.sub} />
        </Pressable>
        {onRemove ? (
          <Pressable
            onPress={() => setConfirmDel(true)}
            hitSlop={6}
            style={pressFade({ width: 28, height: 28, borderRadius: 8, backgroundColor: confirmDel ? DANGER + '22' : t.chip, alignItems: 'center', justifyContent: 'center' })}>
            <SvgIcon name="trash" size={14} color={confirmDel ? DANGER : t.sub} />
          </Pressable>
        ) : null}
      </View>

      {confirmDel && onRemove ? (
        <View style={{ gap: 8 }}>
          <Txt size={12} color={t.sub}>ถอด {c.name} ออกจากเคสนี้? — รายชื่อในสมุดยังอยู่ครบ</Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn style={{ flex: 1 }} kind="ghost" label="ยกเลิก" onPress={() => setConfirmDel(false)} />
            <Btn
              style={{ flex: 1 }}
              kind="danger"
              renderIcon={(col, s) => <SvgIcon name="trash" size={s} color={col} />}
              label="ถอดออก"
              onPress={() => {
                setConfirmDel(false);
                onRemove();
              }}
            />
          </View>
        </View>
      ) : null}

      {methods.map((m) => (
        <View key={m.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SvgIcon name={m.icon} size={14} color={t.sub} />
          <Txt size={13} color={t.ink} style={{ flex: 1 }} numberOfLines={1}>
            {m.display}
          </Txt>
          <MiniBtn icon="copy" label="คัดลอก" feedbackIcon="check" feedbackLabel="คัดลอกแล้ว" onPress={() => copy(m.label, m.value)} />
          <MiniBtn
            icon="extLink"
            label="เปิด"
            primary
            busyLabel="กำลังเปิด…"
            feedbackIcon="check"
            feedbackLabel="เปิดแล้ว"
            errorLabel="เปิดไม่ได้"
            onPress={() => open(m)}
          />
        </View>
      ))}

      {c.note ? (
        // หมายเหตุของคนนี้ — กล่องพื้นอ่อนแยกจากแถวช่องทาง ให้รู้ว่าเป็นข้อความอ่าน ไม่ใช่ปุ่ม
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: t.chip, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }}>
          <View style={{ paddingTop: 2 }}><SvgIcon name="note" size={13} color={t.sub} /></View>
          <Txt size={12.5} color={t.ink} style={{ flex: 1, lineHeight: 18 }}>
            <Txt size={12.5} weight="med" color={t.sub}>หมายเหตุ · </Txt>
            {c.note}
          </Txt>
        </View>
      ) : null}
      {methods.length === 0 && !c.note ? (
        <Txt size={12} color={t.faint}>{inline ? 'ยังไม่มีช่องทางติดต่อ — แตะดินสอเพื่อแก้ไขนัด' : 'ยังไม่มีช่องทางติดต่อ — เพิ่มได้ในสมุดรายชื่อ'}</Txt>
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
        org: d.org || null,
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
        title="เลือกรายชื่อ"
        selectedIds={[c.id]}
        onPick={(next) => {
          setPicking(false);
          if (next.id !== c.id) onSwap(next); // คนใหม่ → พ่อแม่สลับรายชื่อของเคส แล้ว remount ฟอร์มเป็นของคนใหม่
        }}
        rename={{
          current: c,
          onRename: (name) => {
            setD({ ...d, name });
            setPicking(false);
            showToast('เปลี่ยนชื่อแล้ว — กด "ยืนยัน" เพื่อบันทึก');
          },
        }}
        onCancel={() => setPicking(false)}
      />
    );

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <SvgIcon name="edit" size={16} color={t.accent} />
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
          style={pressFade({
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
          })}>
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
        <Field value={d.org ?? ''} placeholder="องค์กร / บริษัท (ไม่บังคับ)" onChange={(org) => setD({ ...d, org })} showToast={showToast} />
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
 * เลือกรายชื่อ — ลิสต์รายชื่อทั้งหมดในสมุด (ค้นหาชื่อ/เบอร์/LINE/อีเมลได้) ใช้ 2 งาน:
 *  • เพิ่มรายชื่อเข้าเคส (จากปุ่มในแผ่นรายละเอียด) — คนที่อยู่ในเคสแล้วจะมีเครื่องหมายถูก
 *  • เปลี่ยนรายชื่อในฟอร์มแก้ไข — ส่ง rename มาด้วยเพื่อให้พิมพ์ชื่อใหม่แทนคนปัจจุบันได้
 */
function ContactPicker({
  title,
  selectedIds,
  rename,
  onPick,
  onOpenBook,
  onCancel,
}: {
  title: string;
  /** id ที่ถือว่า "เลือกอยู่" — ไฮไลต์ + ติ๊กถูกในรายการ */
  selectedIds: number[];
  /** โหมดแก้ไขรายชื่อ: พิมพ์ชื่อที่ยังไม่มีในสมุด → ใช้เป็นชื่อใหม่ของคนปัจจุบัน */
  rename?: { current: Contact; onRename: (name: string) => void };
  onPick: (c: Contact) => void;
  /** ไปหน้าสมุดรายชื่อ (สร้าง/แก้รายชื่อ) — แสดงเป็นทางออกเมื่อไม่เจอคนที่ต้องการ */
  onOpenBook?: () => void;
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
  // พิมพ์ชื่อที่ยังไม่มีในสมุด (และไม่ใช่ชื่อเดิม) → เสนอเป็นการเปลี่ยนชื่อคนปัจจุบัน (เฉพาะโหมดแก้ไข)
  const canRename = !!rename && !!query && !all.some((c) => c.name.trim().toLowerCase() === k);

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Pressable
          onPress={onCancel}
          hitSlop={6}
          style={pressFade({ width: 28, height: 28, borderRadius: 8, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' })}>
          <Icon name="chevL" size={15} color={t.sub} />
        </Pressable>
        <Txt size={16} weight="bold" style={{ flex: 1 }} numberOfLines={1}>{title}</Txt>
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
          <Pressable style={pressFade()} onPress={() => setQ('')} hitSlop={6}>
            <SvgIcon name="x" size={14} color={t.faint} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 2 }}>
        {shown.map((c) => (
          <PickRow key={c.id} c={c} active={selectedIds.includes(c.id)} onPress={() => onPick(c)} />
        ))}
        {!shown.length ? (
          <Txt size={12.5} color={t.faint} style={{ paddingVertical: 8 }}>
            {all.length ? 'ไม่พบรายชื่อที่ตรงกับคำค้น' : 'ยังไม่มีรายชื่อในสมุด — เพิ่มได้ที่ ตั้งค่า › สมุดรายชื่อ'}
          </Txt>
        ) : null}
        {canRename && rename ? (
          <Pressable
            onPress={() => rename.onRename(query)}
            style={pressFade({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: t.accent + '55',
              backgroundColor: t.accent + '12',
              paddingHorizontal: 11,
              paddingVertical: 10,
            })}>
            <SvgIcon name="edit" size={14} color={t.accent} />
            <Txt size={13} color={t.accent} weight="med" style={{ flex: 1 }} numberOfLines={2}>
              ใช้ “{query}” เป็นชื่อใหม่ของ {rename.current.name}
            </Txt>
          </Pressable>
        ) : null}
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn style={{ flex: 1 }} kind="ghost" label="ยกเลิก" onPress={onCancel} />
        {onOpenBook ? (
          <Btn
            style={{ flex: 1 }}
            kind="ghost"
            renderIcon={(c, s) => <Icon name="user" size={s} color={c} />}
            label="สมุดรายชื่อ"
            onPress={onOpenBook}
          />
        ) : null}
      </View>
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
      style={pressFade({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: active ? t.accent : t.line,
        backgroundColor: active ? t.accent + '10' : t.card2,
        paddingHorizontal: 11,
        paddingVertical: 9,
      })}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={13.5} weight={active ? 'bold' : 'med'} numberOfLines={1}>{c.name}</Txt>
        {sub ? <Txt size={11} color={t.faint} numberOfLines={1}>{sub}</Txt> : null}
      </View>
      <PriBadge id={c.priority} />
      {active ? <SvgIcon name="check" size={15} color={t.accent} /> : null}
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
      style={pressFade({
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
      })}>
      <SvgIcon name={icon} size={12} color={t.sub} />
      <Txt size={11} weight="med" color={t.sub}>{label}</Txt>
    </Pressable>
  );
}

/**
 * ปุ่มเล็กในการ์ดผู้ติดต่อ (คัดลอก / เปิด) — บอกสถานะบนตัวปุ่มเอง 4 สถานะ:
 * idle → busy (สปินเนอร์ + "กำลังเปิด…") → done (เขียว ✓) หรือ error (แดง "เปิดไม่ได้") แล้วกลับเป็น idle
 * onPress คืน false = ถือว่าไม่สำเร็จ
 */
function MiniBtn({
  icon,
  label,
  primary,
  busyLabel,
  feedbackIcon,
  feedbackLabel,
  errorLabel,
  onPress,
}: {
  icon: string;
  label: string;
  primary?: boolean;
  busyLabel?: string;
  feedbackIcon?: string;
  feedbackLabel?: string;
  errorLabel?: string;
  onPress: () => void | boolean | Promise<void | boolean>;
}) {
  const t = useTokens();
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const handle = async () => {
    if (state === 'busy') return; // กันกดรัว ๆ ระหว่างรอแอปเปิด
    if (timer.current) clearTimeout(timer.current);
    setState('busy');
    let ok = true;
    try {
      ok = (await onPress()) !== false;
    } catch {
      ok = false;
    }
    const next = ok ? (feedbackLabel ? 'done' : 'idle') : errorLabel ? 'error' : 'idle';
    setState(next);
    if (next !== 'idle') timer.current = setTimeout(() => setState('idle'), 1400);
  };

  const bg = state === 'done' ? GREEN : state === 'error' ? DANGER : primary || state === 'busy' ? t.accent : t.chip;
  const fg = state === 'idle' && !primary ? t.sub : '#FFFFFF';
  const text = state === 'busy' ? busyLabel ?? 'กำลังเปิด…' : state === 'done' ? feedbackLabel : state === 'error' ? errorLabel : label;
  return (
    <Pressable
      onPress={handle}
      hitSlop={4}
      style={pressFade({ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9, backgroundColor: bg, opacity: state === 'busy' ? 0.85 : 1 })}>
      {state === 'busy' ? (
        <ActivityIndicator size="small" color={fg} style={{ width: 12, height: 12, transform: [{ scale: 0.7 }] }} />
      ) : (
        <SvgIcon name={state === 'done' ? feedbackIcon ?? icon : state === 'error' ? 'x' : icon} size={12} color={fg} />
      )}
      <Txt size={12} weight="med" color={fg}>{text}</Txt>
    </Pressable>
  );
}
