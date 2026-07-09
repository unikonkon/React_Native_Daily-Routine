// Bottom Sheet รายละเอียดกิจกรรม (APP_STRUCTURE.md §3.3) — ใช้ร่วมแท็บวันนี้ + สรุปเคส
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CAT_BY_ID, GREEN } from '@/constants/theme';
import { Icon } from '@/components/icon';
import { Btn, PriBadge, Txt, useTokens } from '@/components/ui';
import { durText, fmtRange, thaiDate } from '@/lib/dates';
import { useActivities, useDay } from '@/stores/activities';
import { useContacts } from '@/stores/contacts';
import { useDraft } from '@/stores/draft';
import { useUI } from '@/stores/ui';

export function ActivitySheet() {
  const sheet = useUI((s) => s.sheet);
  return sheet ? <SheetBody id={sheet.id} date={sheet.date} /> : null;
}

function SheetBody({ id, date }: { id: number; date: string }) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const closeSheet = useUI((s) => s.closeSheet);
  const openResc = useUI((s) => s.openResc);
  const showToast = useUI((s) => s.showToast);
  const { setStatus, deleteOne, deleteSeries, acts } = useActivities();
  const contacts = useContacts((s) => s.list);
  const item = useDay(date).find((i) => i.id === id);
  const [confirm, setConfirm] = useState(false);

  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  }, [anim]);

  if (!item) {
    closeSheet();
    return null;
  }
  const cat = CAT_BY_ID[item.cat];
  const done = item.ostatus === 'done';
  const names = item.contactIds
    .map((cid) => contacts.find((c) => c.id === cid)?.name)
    .filter(Boolean)
    .join(', ');

  const onEdit = () => {
    const a = acts.find((x) => x.id === item.id);
    if (a) {
      useDraft.getState().loadActivity(a);
      closeSheet();
      router.push('/add');
    }
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={closeSheet}>
      <Pressable style={{ flex: 1, backgroundColor: t.overlay }} onPress={closeSheet} />
      <Animated.View
        style={{
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) }],
          backgroundColor: t.sheet,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          padding: 20,
          paddingBottom: insets.bottom + 20,
          gap: 12,
        }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: t.line2, alignSelf: 'center' }} />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: cat.color + '22', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Icon name={cat.icon} size={13} color={cat.color} />
            <Txt size={12} color={cat.color} weight="med">{cat.short}</Txt>
          </View>
          {item.cat === 'case' ? <PriBadge id={item.priority} withLabel /> : null}
          {done ? <Txt size={12} color={GREEN} weight="med">✓ ทำแล้ว</Txt> : null}
          {item.ostatus === 'rescheduled' ? <Txt size={12} color="#D2603A" weight="med">เลื่อนแล้ว</Txt> : null}
        </View>

        <Txt size={22} weight="bold">{item.title}</Txt>
        <Txt size={14} num color={t.sub}>
          {thaiDate(date)} · {fmtRange(item.startMin, item.endMin)} ({durText(item.endMin - item.startMin)})
        </Txt>
        {item.loc ? <Txt size={13} color={t.sub}>📍 {item.loc}</Txt> : null}
        {item.cat === 'case' ? (
          <Txt size={13} color={t.sub}>
            {item.channel === 'online' ? '🎥 ออนไลน์' : '🤝 พบตัว'}
            {names ? ` · ${names}` : ''}
          </Txt>
        ) : null}

        {!confirm ? (
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn
                style={{ flex: 1 }}
                kind={done ? 'ghost' : 'green'}
                icon={done ? 'restore' : 'check'}
                label={done ? 'ยังไม่ทำ' : 'ทำแล้ว'}
                onPress={() => {
                  setStatus(item, done ? null : 'done');
                  if (!done) showToast('เยี่ยม! ทำสำเร็จ ✓');
                }}
              />
              {item.cat === 'case' && item.ostatus !== 'rescheduled' ? (
                <Btn style={{ flex: 1 }} kind="primary" icon="skip" label="เลื่อนนัด" onPress={() => openResc(item)} />
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn style={{ flex: 1 }} kind="ghost" icon="edit" label="แก้ไข" onPress={onEdit} />
              <Btn style={{ flex: 1 }} kind="ghost" icon="trash" label="ลบ" onPress={() => setConfirm(true)} />
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
                icon="trash"
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
      </Animated.View>
    </Modal>
  );
}
