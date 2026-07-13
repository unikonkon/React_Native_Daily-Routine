// Root layout: โหลดฟอนต์ + boot stores (SQLite → memory ครั้งเดียว) + host modal/toast กลาง
import { Anuphan_400Regular, Anuphan_500Medium, Anuphan_600SemiBold } from '@expo-google-fonts/anuphan';
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

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
  const theme = useSettings((s) => s.theme);

  useEffect(() => {
    Promise.all([useSettings.getState().boot(), useActivities.getState().boot(), useContacts.getState().boot()])
      .catch(() => {})
      .finally(() => setBooted(true));
  }, []);

  useEffect(() => {
    if (fontsLoaded && booted) SplashScreen.hideAsync();
  }, [fontsLoaded, booted]);

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
