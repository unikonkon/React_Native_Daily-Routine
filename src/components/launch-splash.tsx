// หน้าเปิดแอป ต่อจาก splash ของระบบ: วาดไอคอนไทม์ไลน์ตรงตำแหน่ง/ขนาด/สีเดียวกับ splash-icon.png ทุกจุด
// จึงสลับจาก splash ระบบมาที่นี่ได้โดยไม่เห็นรอยต่อ
// - เปิดเร็ว (ข้อมูลพร้อมภายใน FAST_MS): แสดงไอคอนนิ่งแล้วจางเข้าแอปเลย
// - เปิดช้า: เล่น "เข้า" 0.7 วิ (หดรวมแล้วประกอบใหม่) → คลื่นที่จุด "ตอนนี้" วนรอจนข้อมูลพร้อม → "ออก" 0.45 วิ
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useEffectEvent, useRef } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

const FAST_MS = 400; // พร้อมก่อนนี้ = เปิดเร็ว ไม่เล่นแอนิเมชัน
const GATHER_MS = 120;
const EXIT_MS = 450;
const FAST_FADE_MS = 200;
/** 1 หน่วยของไอคอน (viewBox 72) = 2.5dp → กว้าง 180dp เท่า imageWidth ของ expo-splash-screen ใน app.json */
const U = 2.5;
const SIZE = 72 * U;

// สีต้องตรงกับ splash-icon.png / splash-icon-dark.png และ backgroundColor ใน app.json
const LIGHT = { bg: '#F7F3EC', soft: '#E2DACD', ok: '#4C9A6A', acc: '#D2603A', ink: '#221C13', surf: '#FFFFFF' };
const DARK = { bg: '#141009', soft: '#4A4236', ok: '#4C9A6A', acc: '#D2603A', ink: '#F3ECDF', surf: '#211C14' };

const OUT = Easing.out(Easing.cubic);
const POP = Easing.out(Easing.back(2));

type Phase = 'wait' | 'intro' | 'idle' | 'exit';

/** กล่องตามพิกัดของไอคอน (viewBox 18..90) */
const box = (x: number, y: number, w: number, h: number) => ({
  position: 'absolute' as const,
  left: (x - 18) * U,
  top: (y - 18) * U,
  width: w * U,
  height: h * U,
});

/** หดลงก่อน แล้วค่อยกลับมาเต็ม (ใช้ตอน "เข้า") */
function rebuild(v: SharedValue<number>, delay: number, duration: number, easing: typeof OUT, done?: () => void) {
  v.set(
    withSequence(
      withTiming(0, { duration: GATHER_MS, easing: Easing.in(Easing.quad) }),
      withDelay(
        delay,
        withTiming(1, { duration, easing }, (finished) => {
          'worklet';
          if (finished && done) scheduleOnRN(done);
        }),
      ),
    ),
  );
}

export function LaunchSplash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  // splash ของระบบใช้ธีมของเครื่อง (ยังไม่รู้ค่าธีมที่ตั้งในแอป) — ต้องใช้แบบเดียวกันถึงจะต่อกันเนียน
  const c = useColorScheme() === 'dark' ? DARK : LIGHT;
  const phase = useRef<Phase>('wait');
  const readyRef = useRef(ready);

  const rail = useSharedValue(1);
  const n1 = useSharedValue(1);
  const n2 = useSharedValue(1);
  const n3 = useSharedValue(1);
  const b1 = useSharedValue(1);
  const b2 = useSharedValue(1);
  const b3 = useSharedValue(1);
  const rip = useSharedValue(0);
  const ripOn = useSharedValue(0);
  const lift = useSharedValue(0);
  const fade = useSharedValue(1);

  const railStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: rail.value }] }));
  const n1Style = useAnimatedStyle(() => ({ opacity: n1.value, transform: [{ scale: n1.value }] }));
  const n2Style = useAnimatedStyle(() => ({ opacity: n2.value, transform: [{ scale: n2.value }] }));
  const n3Style = useAnimatedStyle(() => ({ opacity: n3.value, transform: [{ scale: n3.value }] }));
  const b1Style = useAnimatedStyle(() => ({ opacity: b1.value, transform: [{ scaleX: b1.value }] }));
  const b2Style = useAnimatedStyle(() => ({ opacity: b2.value, transform: [{ scaleX: b2.value }] }));
  const b3Style = useAnimatedStyle(() => ({ opacity: b3.value, transform: [{ scaleX: b3.value }] }));
  const ripStyle = useAnimatedStyle(() => ({
    opacity: ripOn.value * interpolate(rip.value, [0, 1], [0.8, 0]),
    transform: [{ scale: interpolate(rip.value, [0, 1], [1, 2.3]) }],
  }));
  const iconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(lift.value, [0, 0.7, 1], [1, 0, 0]),
    transform: [{ translateY: lift.value * -16 }],
  }));
  const screenStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  const finish = () => onDone();

  const exit = () => {
    phase.current = 'exit';
    ripOn.set(withTiming(0, { duration: 150 }));
    lift.set(withTiming(1, { duration: EXIT_MS, easing: Easing.inOut(Easing.quad) }));
    fade.set(
      withTiming(0, { duration: EXIT_MS }, (finished) => {
        'worklet';
        if (finished) scheduleOnRN(finish);
      }),
    );
  };

  const introDone = () => {
    if (readyRef.current) exit();
    else {
      // รอข้อมูล: คลื่นวงออกจากจุด "ตอนนี้" เป็นจังหวะ
      phase.current = 'idle';
      ripOn.set(1);
      rip.set(0);
      rip.set(withRepeat(withTiming(1, { duration: 1200, easing: Easing.out(Easing.quad) }), -1, false));
    }
  };

  const startIntro = useEffectEvent(() => {
    if (phase.current !== 'wait') return;
    phase.current = 'intro';
    rebuild(rail, 0, 300, OUT);
    rebuild(n1, 50, 250, POP);
    rebuild(n2, 150, 250, POP);
    rebuild(n3, 270, 250, POP);
    rebuild(b1, 120, 250, OUT);
    rebuild(b2, 220, 250, OUT);
    rebuild(b3, 320, 250, OUT, introDone); // ชิ้นสุดท้าย: 120 + 320 + 250 ≈ 0.7 วิ
  });

  const onReady = useEffectEvent(() => {
    readyRef.current = true;
    if (phase.current === 'wait') {
      // เปิดเร็ว: ไม่เล่นแอนิเมชัน แค่จางเข้าแอป
      phase.current = 'exit';
      fade.set(
        withTiming(0, { duration: FAST_FADE_MS }, (finished) => {
          'worklet';
          if (finished) scheduleOnRN(finish);
        }),
      );
    } else if (phase.current === 'idle') exit();
    // 'intro' → introDone() เป็นคนพาออกเมื่อเล่นครบ
  });

  useEffect(() => {
    const t = setTimeout(startIntro, FAST_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (ready) onReady();
  }, [ready]);

  return (
    <Animated.View
      // วาดเสร็จแล้วค่อยปิด splash ระบบ — ภาพเหมือนกันทุกจุด จึงไม่เห็นรอยสลับ
      onLayout={() => SplashScreen.hide()}
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: c.bg }, screenStyle]}
    >
      <Animated.View style={[{ width: SIZE, height: SIZE }, iconStyle]}>
        <Animated.View
          style={[
            box(36, 32, 4, 44),
            { borderRadius: 2 * U, backgroundColor: c.soft, transformOrigin: 'top' },
            railStyle,
          ]}
        />
        <Animated.View
          style={[
            box(51, 30, 24, 8),
            { borderRadius: 4 * U, backgroundColor: c.soft, transformOrigin: 'left' },
            b1Style,
          ]}
        />
        <Animated.View
          style={[
            box(51, 49, 30, 10),
            { borderRadius: 5 * U, backgroundColor: c.ink, transformOrigin: 'left' },
            b2Style,
          ]}
        />
        <Animated.View
          style={[
            box(51, 70, 18, 8),
            { borderRadius: 4 * U, backgroundColor: c.soft, transformOrigin: 'left' },
            b3Style,
          ]}
        />
        <Animated.View style={[box(31.5, 27.5, 13, 13), { borderRadius: 6.5 * U, backgroundColor: c.ok }, n1Style]}>
          <Svg width={13 * U} height={13 * U} viewBox="31.5 27.5 13 13">
            <Path
              d="M35.2 34.2 l2 2 l3.6 -3.8"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Animated.View>
        <Animated.View
          style={[
            box(30.5, 46.5, 15, 15),
            { borderRadius: 7.5 * U, borderWidth: 2.5 * U, borderColor: c.acc },
            ripStyle,
          ]}
        />
        <Animated.View style={[box(30.5, 46.5, 15, 15), { borderRadius: 7.5 * U, backgroundColor: c.acc }, n2Style]} />
        <Animated.View
          style={[
            box(31, 67, 14, 14),
            { borderRadius: 7 * U, borderWidth: 3 * U, borderColor: c.soft, backgroundColor: c.surf },
            n3Style,
          ]}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
});
