// โครงหน้าจอทุกแท็บ: header (หัวข้อ 30px + ข้อความรอง + ปุ่มสลับธีม) + เนื้อหา
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Txt, useTokens } from '@/components/ui';
import { useSettings } from '@/stores/settings';

interface ScreenProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** scroll = ห่อด้วย ScrollView (ค่าปกติ) — ปิดเมื่อหน้ามี list/timeline จัดการ scroll เอง */
  scroll?: boolean;
  /** แสดงปุ่มย้อนกลับ (หน้า settings ย่อย) */
  back?: boolean;
}

export const TABBAR_H = 88;

export function Screen({ title, subtitle, children, scroll = true, back }: ScreenProps) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useSettings((s) => s.theme);
  const toggleTheme = useSettings((s) => s.toggleTheme);

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10, gap: 10 }}>
      {back ? (
        <Pressable
          onPress={() => router.back()}
          style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chevL" size={20} color={t.sub} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        <Txt size={30} weight="bold">
          {title}
        </Txt>
        {subtitle ? (
          <Txt size={13} color={t.sub}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      <Pressable
        onPress={toggleTheme}
        style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={theme === 'light' ? 'moon' : 'sun'} size={18} color={t.sub} />
      </Pressable>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      {header}
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: TABBAR_H + insets.bottom + 24, gap: 14 }}
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{children}</View>
      )}
    </View>
  );
}
