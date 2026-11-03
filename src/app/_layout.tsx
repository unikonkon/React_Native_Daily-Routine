// Root layout: โหลดฟอนต์ + boot stores (SQLite → memory ครั้งเดียว) + host modal/toast กลาง
import { Anuphan_400Regular, Anuphan_500Medium, Anuphan_600SemiBold } from '@expo-google-fonts/anuphan';
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ActivitySheet } from '@/components/activity-sheet';
import { RescheduleModal } from '@/components/reschedule-modal';
import { ToastHost } from '@/components/toast';
import { PALETTES } from '@/constants/theme';
import { useActivities } from '@/stores/activities';
import { useContacts } from '@/stores/contacts';
import { useSettings } from '@/stores/settings';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Anuphan_400Regular,
    Anuphan_500Medium,
    Anuphan_600SemiBold,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });
  const [booted, setBooted] = useState(false);
  // โหลดฐานข้อมูลไม่สำเร็จ — เดิมกลืน error แล้วเปิดแอปเป็นหน้าว่าง (เหมือนข้อมูลหาย และบันทึกทับได้)
  const [bootError, setBootError] = useState<string | null>(null);
  const theme = useSettings((s) => s.theme);

  const boot = useCallback(() => {
    Promise.all([useSettings.getState().boot(), useActivities.getState().boot(), useContacts.getState().boot()])
      .then(() => setBooted(true))
      .catch((e: unknown) => {
        console.warn('[boot] failed', e);
        setBootError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  useEffect(boot, [boot]);

  useEffect(() => {
    if (fontsLoaded && (booted || bootError)) SplashScreen.hideAsync();
  }, [fontsLoaded, booted, bootError]);

  if (bootError) {
    const pal = PALETTES[theme];
    return (
      <View style={{ flex: 1, backgroundColor: pal.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
        <Text style={{ color: pal.ink, fontSize: 18, fontWeight: '600', textAlign: 'center' }}>เปิดข้อมูลในเครื่องไม่สำเร็จ</Text>
        <Text style={{ color: pal.sub, fontSize: 14, textAlign: 'center' }}>
          ข้อมูลของคุณยังอยู่ ยังไม่ถูกแก้ไข — ลองเปิดใหม่อีกครั้ง
        </Text>
        <Text style={{ color: pal.faint, fontSize: 12, textAlign: 'center' }}>{bootError}</Text>
        <Pressable
          onPress={() => {
            setBootError(null);
            boot();
          }}
          style={{ marginTop: 8, backgroundColor: pal.ink, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 12 }}>
          <Text style={{ color: pal.bg, fontSize: 15, fontWeight: '600' }}>ลองใหม่</Text>
        </Pressable>
      </View>
    );
  }

  if (!fontsLoaded || !booted) return null;

  return (
    <>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: PALETTES[theme].bg } }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
      <ActivitySheet />
      <RescheduleModal />
      <ToastHost />
    </>
  );
}
