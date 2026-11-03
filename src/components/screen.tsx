// โครงหน้าจอทุกแท็บ: header + เนื้อหา
// หน้าแท็บ → header แสดง "แถบแท็บ" (active = pill ส้ม icon+label, อื่น = ไอคอนล้วน) แทนหัวข้อ
// หน้าย่อย (variant="sub") → หัวเรื่อง 26px + แถบล่าง ‹ กลับ + ปุ่มหลัก
// สลับธีมได้ที่เดียว: ตั้งค่า → โหมดแสดงผล
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, View, type ScrollViewInstance } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BOTTOM_BAR_SPACE, SubBar, type SubBarAction } from '@/components/b1/bottom-bar';
import { SvgIcon } from '@/components/svg-icon';
import { Icon } from '@/components/icon';
import { Txt, useTokens } from '@/components/ui';
import { GREEN } from '@/constants/theme';
import { useUI } from '@/stores/ui';

interface ScreenProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** scroll = ห่อด้วย ScrollView (ค่าปกติ) — ปิดเมื่อหน้ามี list/timeline จัดการ scroll เอง */
  scroll?: boolean;
  /** ref ไปยัง ScrollView ภายใน — ให้หน้าเลื่อนเนื้อหาเองได้ (เช่น เลื่อนขึ้นไปฟอร์มแก้ไข) */
  scrollRef?: React.Ref<ScrollViewInstance>;
  /**
   * 'sub' = หน้าย่อยแบบ B1: หัวเรื่อง 26px (ไม่มีปุ่มกลับด้านบน) + แถบล่าง ‹ กลับ + ปุ่มหลัก (action)
   * ค่าเริ่มต้น: หน้าแท็บ (แถบแท็บด้านบน)
   */
  variant?: 'sub';
  /** ปุ่มหลักในแถบล่างของหน้าย่อย B1 */
  action?: SubBarAction;
  /** แทนการ router.back() ของปุ่ม ‹ กลับ (เช่น ย้อนขั้นในฟอร์มหลายขั้น) */
  onBack?: () => void;
  /** แสดงปุ่มเวลาว่างข้างแถบแท็บ (ค่าเริ่มต้น: เฉพาะแท็บวันนี้) */
  showFreeToggle?: boolean;
  /** ปุ่มมุมขวาของแถบแท็บ (แทนปุ่มเวลาว่าง) เช่น "ล้างค่า" ในฟอร์มเพิ่ม */
  headerRight?: React.ReactNode;
}

/** แถบแท็บย้ายขึ้นไปอยู่ใน header แล้ว — ไม่มีแถบล่างอีกต่อไป (คงชื่อไว้เพื่อระยะ padding ล่าง) */
export const TABBAR_H = 0;

/** 3 แท็บหลัก — ใช้ทั้งใน header (screen.tsx) และ routing (app/(tabs)/_layout.tsx) */
export const TABS = [
  { name: 'index', label: 'วันนี้', icon: 'calendar', href: '/' },
  { name: 'add', label: 'เพิ่ม', icon: 'plus', href: '/add' },
  { name: 'settings', label: 'ตั้งค่า', icon: 'sliders', href: '/settings' },
] as const;

/**
 * หาแท็บที่ "ตรง" กับ path ปัจจุบัน — นับหน้าย่อยเป็นแท็บแม่ด้วย (/settings/stats → แท็บ settings)
 * จำเป็นเพราะตอน router.push หน้าย่อย หน้าแท็บยังถูก mount อยู่ระหว่างทรานซิชัน
 * ถ้าเทียบแบบ href === pathname เฉย ๆ จะไม่เจอ → pill เด้งกลับแท็บแรก ('วันนี้') ทุกครั้งที่กดเมนู
 * เทียบจาก href ที่ยาวสุดก่อน เพื่อไม่ให้ '/' ไปคว้าทุก path
 */
export function activeTabName(pathname: string): (typeof TABS)[number]['name'] {
  const hit = [...TABS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((tab) => pathname === tab.href || (tab.href !== '/' && pathname.startsWith(`${tab.href}/`)));
  return hit?.name ?? 'index';
}

/**
 * ปุ่มสลับโหมด "วันที่ว่าง" ↔ "ไม่นับวันที่ว่าง" — active = ดึงช่วงเวลาว่างออกมาให้แตะเพิ่มกิจกรรม
 * ไอคอนเปลี่ยนตามโหมด: clock (ดูตารางตามปกติ) → clockPlus (นาฬิกา+บวก = แตะช่วงว่างเพื่อเพิ่มได้)
 * เปลี่ยนทั้งไอคอนไม่ใช่แค่สี — ปุ่มยังอ่านออกตอนธีมมืด/ตาบอดสี ที่แยกเขียว-เทาไม่ออก
 */
function DayliyUseToggle() {
  const t = useTokens();
  const freeMode = useUI((s) => s.freeMode);
  const toggleFreeMode = useUI((s) => s.toggleFreeMode);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="แสดงเวลาว่าง"
      accessibilityState={{ selected: freeMode }}
      onPress={toggleFreeMode}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: freeMode ? GREEN : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {freeMode ? <Icon name="clockPlus" size={20} color="#FFFFFF" /> : <SvgIcon name="clock" size={20} color={t.sub} strokeWidth={1.8} />}
    </Pressable>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** สปริงสำหรับเลื่อน/ขยาย pill ตอนเปลี่ยนแท็บ */
const PILL_SPRING = LinearTransition.springify().damping(20).stiffness(200).mass(0.3);

/**
 * แถบแท็บ (ระบบ B1) — แท็บที่ active = pill พื้นอ่อน (ไอคอน + ชื่อ) · แท็บอื่นเป็นชื่ออย่างเดียว อ่านออกทุกแท็บ
 * เปลี่ยนแท็บแล้ว pill เลื่อน+ขยายแบบสปริง (Reanimated layout animation)
 */
function TabStrip() {
  const t = useTokens();
  const router = useRouter();
  const pathname = usePathname();
  const activeName = activeTabName(pathname);
  return (
    <View accessibilityRole="tablist" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {TABS.map((tab) => {
        const active = tab.name === activeName;
        return (
          <AnimatedPressable
            key={tab.name}
            layout={PILL_SPRING}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) router.navigate(tab.href);
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              height: 38,
              paddingHorizontal: active ? 14 : 10,
              borderRadius: 19,
              backgroundColor: active ? t.tabOn : 'transparent',
            }}>
            {active ? (
              <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(100)}>
                <Icon name={tab.icon} size={18} color={t.ink} />
              </Animated.View>
            ) : null}
            <Txt size={13.5} weight={active ? 'bold' : 'reg'} color={active ? t.ink : t.sub}>
              {tab.label}
            </Txt>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

export function Screen({ title, subtitle, children, scroll = true, scrollRef, variant, action, onBack, showFreeToggle, headerRight }: ScreenProps) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();

  // ออกจากหน้าย่อยด้วยปุ่มระบบ/ปัดจอ (ไม่ได้ผ่านปุ่มในแอป) — คืนแผ่นที่พักไว้ให้ด้วยตอนหน้านี้ถูกปิด
  const sub = variant === 'sub';
  // แถบล่าง ‹ กลับ + ปุ่มหลัก — หน้าย่อย B1 ทุกหน้า และหน้าแท็บที่ส่ง action มา (ฟอร์มเพิ่ม/แก้ไข)
  const bar = sub || !!action;
  React.useEffect(() => {
    if (!sub) return;
    return () => useUI.getState().restoreSheet();
  }, [sub]);

  const goBack = () => {
    if (onBack) return onBack();
    if (router.canGoBack()) router.back();
    else router.navigate('/');
    useUI.getState().restoreSheet(); // กลับจากหน้าที่กระโดดมาจากแผ่นรายละเอียด → เปิดแผ่นคืน
  };

  const header = sub ? (
    // หน้าย่อย B1 — หัวเรื่องอย่างเดียว ปุ่มกลับอยู่แถบล่าง
    <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 }}>
      <Txt size={26} weight="bold">
        {title}
      </Txt>
      {subtitle ? (
        <Txt size={13} color={t.sub}>
          {subtitle}
        </Txt>
      ) : null}
    </View>
  ) : (
    // หน้าแท็บ — แถบแท็บแทนหัวข้อ (subtitle แสดงใต้แถบถ้ามี)
    <View style={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TabStrip />
        {headerRight ?? ((showFreeToggle ?? pathname === '/') ? <DayliyUseToggle /> : null)}
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
          ref={scrollRef}
          contentContainerStyle={{
            paddingHorizontal: 18,
            paddingBottom: TABBAR_H + insets.bottom + 24 + (bar ? BOTTOM_BAR_SPACE : 0), // เผื่อที่ให้แถบลอยล่าง
            gap: 14,
          }}
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{children}</View>
      )}
      {/* แถบล่าง ‹ กลับ + ปุ่มหลัก — หน้าย่อยทุกหน้า และฟอร์มเพิ่ม/แก้ไข */}
      {bar ? <SubBar onBack={goBack} action={action} /> : null}
    </View>
  );
}
