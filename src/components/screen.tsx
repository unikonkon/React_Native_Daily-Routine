// โครงหน้าจอทุกแท็บ: header + เนื้อหา
// หน้าแท็บ → header แสดง "แถบแท็บ" (active = pill ส้ม icon+label, อื่น = ไอคอนล้วน) แทนหัวข้อ + ปุ่มสลับธีม
// หน้าย่อย (back) → header แบบเดิม: ปุ่มย้อนกลับ + หัวข้อ 30px + ปุ่มสลับธีม
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Txt, useTokens } from '@/components/ui';
import { ACCENT, GREEN } from '@/constants/theme';
import { useSettings } from '@/stores/settings';
import { useUI } from '@/stores/ui';

interface ScreenProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** scroll = ห่อด้วย ScrollView (ค่าปกติ) — ปิดเมื่อหน้ามี list/timeline จัดการ scroll เอง */
  scroll?: boolean;
  /** แสดงปุ่มย้อนกลับ + หัวข้อ (หน้า settings ย่อย) แทนแถบแท็บ */
  back?: boolean;
}

/** แถบแท็บย้ายขึ้นไปอยู่ใน header แล้ว — ไม่มีแถบล่างอีกต่อไป (คงชื่อไว้เพื่อระยะ padding ล่าง) */
export const TABBAR_H = 0;

/** 4 แท็บหลัก — ใช้ทั้งใน header (screen.tsx) และ routing (app/(tabs)/_layout.tsx) */
export const TABS = [
  { name: 'index', label: 'วันนี้', icon: 'calendar', href: '/' },
  { name: 'add', label: 'เพิ่ม', icon: 'plus', href: '/add' },
  { name: 'summary', label: 'สรุป', icon: 'bars', href: '/summary' },
  { name: 'settings', label: 'ตั้งค่า', icon: 'sliders', href: '/settings' },
] as const;

/** ปุ่มสลับธีม (มุมขวาบนของทุก header) */
function ThemeToggle() {
  const t = useTokens();
  const theme = useSettings((s) => s.theme);
  const toggleTheme = useSettings((s) => s.toggleTheme);
  return (
    <Pressable
      onPress={toggleTheme}
      style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={theme === 'light' ? 'moon' : 'sun'} size={18} color={t.sub} />
    </Pressable>
  );
}

/** ปุ่มสลับโหมด "วันที่ว่าง" ↔ "ไม่นับวันที่ว่าง" — active = ดึงช่วงเวลาว่างออกมาให้แตะเพิ่มกิจกรรม */
function DayliyUseToggle() {
  const t = useTokens();
  const freeMode = useUI((s) => s.freeMode);
  const toggleFreeMode = useUI((s) => s.toggleFreeMode);
  return (
    <Pressable
      onPress={toggleFreeMode}
      style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: freeMode ? GREEN : t.card,
        borderWidth: 1,
        borderColor: freeMode ? GREEN : t.line,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Icon name="clock" size={18} color={freeMode ? '#FFFFFF' : t.sub} />
    </Pressable>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** สปริงสำหรับเลื่อน/ขยาย pill ตอนเปลี่ยนแท็บ */
const PILL_SPRING = LinearTransition.springify().damping(20).stiffness(200).mass(0.3);

/**
 * แถบแท็บมินิมอล — แท็บที่ active ขยายเป็น pill สีส้ม (icon + label)
 * แท็บอื่นเหลือแค่ไอคอน · เปลี่ยนแท็บแล้ว pill เลื่อน+ขยายแบบสปริง (Reanimated layout animation)
 */
function TabStrip() {
  const t = useTokens();
  const router = useRouter();
  const pathname = usePathname();
  const activeName = TABS.find((tab) => tab.href === pathname)?.name ?? 'index';
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {TABS.map((tab) => {
        const active = tab.name === activeName;
        return (
          <AnimatedPressable
            key={tab.name}
            layout={PILL_SPRING}
            onPress={() => {
              if (!active) router.navigate(tab.href);
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              height: 40,
              width: active ? undefined : 40,
              paddingHorizontal: active ? 15 : 0,
              borderRadius: 99,
              backgroundColor: active ? ACCENT : 'transparent',
            }}>
            <Icon name={tab.icon} size={22} color={active ? '#FFFFFF' : t.sub} />
            {active ? (
              <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(100)}>
                <Txt size={13.5} weight="bold" color="#FFFFFF">
                  {tab.label}
                </Txt>
              </Animated.View>
            ) : null}
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

export function Screen({ title, subtitle, children, scroll = true, back }: ScreenProps) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();

  const header = back ? (
    // หน้าย่อย — header เดิม: ปุ่มย้อนกลับ + หัวข้อ 30px + ปุ่มสลับธีม
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10, gap: 10 }}>
      <Pressable
        onPress={() => router.back()}
        style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="chevL" size={20} color={t.sub} />
      </Pressable>
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
      <ThemeToggle />
    </View>
  ) : (
    // หน้าแท็บ — แถบแท็บแทนหัวข้อ + ปุ่มสลับธีม (subtitle แสดงใต้แถบถ้ามี)
    <View style={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TabStrip />
        {pathname === '/' ? <DayliyUseToggle /> : null}
        <ThemeToggle />
      </View>
      {subtitle ? (
        <Txt size={13} color={t.sub} style={{ paddingHorizontal: 4 }}>
          {subtitle}
        </Txt>
      ) : null}
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
