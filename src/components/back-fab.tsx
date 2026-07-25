// ปุ่ม "กลับ" ลอยล่างของหน้าย่อย (ลุคเดียวกับ fabbar ของแท็บวันนี้) — แตะแล้วกลับหน้าก่อนหน้า
// ถ้ามีแผ่นรายละเอียดที่ "พักไว้" ตอนกระโดดมาหน้านี้ (useUI.parkSheet) จะเปิดคืนให้ด้วย — ทำงานต่อจากเดิมได้ทันที
import { useRouter, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Txt, useTokens } from '@/components/ui';
import { useUI } from '@/stores/ui';

/** ระยะเผื่อท้ายเนื้อหา ไม่ให้ปุ่มลอยบังแถวสุดท้าย */
export const BACK_FAB_SPACE = 72;

export function BackFab({
  label = 'กลับ',
  fallbackHref = '/',
}: {
  label?: string;
  /** ปลายทางเมื่อไม่มีหน้าก่อนหน้าให้กลับ (เช่น เปิดจากลิงก์ตรง) */
  fallbackHref?: Href;
}) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(fallbackHref);
    useUI.getState().restoreSheet(); // ไม่มีแผ่นพักไว้ = ไม่เกิดอะไรขึ้น
  };

  return (
    <View style={{ position: 'absolute', left: 18, bottom: insets.bottom + 16 }}>
      <Pressable
        onPress={goBack}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: t.card,
          borderWidth: 1,
          borderColor: t.line,
          borderRadius: 24,
          paddingLeft: 14,
          paddingRight: 20,
          paddingVertical: 11,
          shadowColor: '#000',
          shadowOpacity: 0.28,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}>
        <Icon name="chevL" size={18} color={t.sub} />
        <Txt size={15} weight="bold">{label}</Txt>
      </Pressable>
    </View>
  );
}
