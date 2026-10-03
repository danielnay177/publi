import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

const C = { bg: '#171C1B', paper: '#222927', ink: '#F5F3EC', muted: '#A7AEA7', line: '#39433E', rust: '#D28A70', green: '#91B69F' };

const clock = (millis = 0) => {
  const seconds = Math.max(0, Math.floor(millis / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

export default function CaptureRecordingScreen({ visible, isPaused, isProcessing, durationMillis, metering, processingStage, prompt, onPause, onResume, onStop, onCancel }) {
  const breath = useRef(new Animated.Value(0)).current;
  const voice = useRef(new Animated.Value(0)).current;
  const baseScale = useRef(new Animated.Value(1)).current;
  const active = visible && !isPaused && !isProcessing;

  useEffect(() => {
    if (!active) {
      breath.stopAnimation();
      Animated.timing(breath, { toValue: 0, duration: 250, useNativeDriver: true }).start();
      return;
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(breath, { toValue: 1, duration: 1300, useNativeDriver: true }),
      Animated.timing(breath, { toValue: 0, duration: 1500, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [active, breath]);

  useEffect(() => {
    const level = active && Number.isFinite(metering) ? Math.min(1, Math.max(0, (metering + 52) / 42)) : 0;
    Animated.timing(voice, { toValue: level, duration: level > 0 ? 110 : 260, useNativeDriver: true }).start();
  }, [active, metering, voice]);

  const orbScale = useMemo(() => Animated.add(Animated.add(baseScale, breath.interpolate({ inputRange: [0, 1], outputRange: [0, .025] })), voice.interpolate({ inputRange: [0, 1], outputRange: [0, .085] })), [baseScale, breath, voice]);
  const cloudScale = useMemo(() => Animated.add(baseScale, voice.interpolate({ inputRange: [0, 1], outputRange: [0, .18] })), [baseScale, voice]);
  const drift = useMemo(() => breath.interpolate({ inputRange: [0, 1], outputRange: [-5, 5] }), [breath]);
  return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={isProcessing ? undefined : onCancel}>
    <SafeAreaProvider><SafeAreaView edges={['top', 'bottom']} style={s.safe}>
      <View style={s.header}>
        <Pressable onPress={onCancel} disabled={isProcessing} accessibilityRole="button" accessibilityLabel="Cancel recording" style={s.headerButton}><Ionicons name="close" size={25} color={C.ink} /></Pressable>
        <Text style={s.headerTitle}>Capture</Text><View style={s.headerButton} />
      </View>
      <View style={s.body}>
      <View style={s.fixedCapture}>
        <Text style={s.eyebrow}>{isProcessing ? 'SAVING YOUR THOUGHT' : isPaused ? 'RECORDING PAUSED' : 'RECORDING IN PROGRESS'}</Text>
        <Animated.View style={[s.recordingOrb, isPaused && s.recordingOrbPaused, isProcessing && s.recordingOrbProcessing, { transform: [{ scale: orbScale }] }]}>
          <View style={s.outerRing}><View style={s.innerRing}>
            {!isProcessing && <Animated.View pointerEvents="none" style={[s.cloud, { transform: [{ translateX: drift }, { scale: cloudScale }] }]}><View style={s.cloudLeft} /><View style={s.cloudCenter} /><View style={s.cloudRight} /></Animated.View>}
            <Ionicons name={isProcessing ? 'cloud-upload-outline' : 'mic'} size={44} color={isProcessing ? C.green : C.rust} style={s.micIcon} />
          </View></View>
        </Animated.View>
        <View style={s.signalRow}>{[13, 24, 36, 19, 31, 17, 27, 12].map((height, index) => <Animated.View key={index} style={[s.signalBar, { height, opacity: isPaused || isProcessing ? .25 : voice.interpolate({ inputRange: [0, 1], outputRange: [.45, 1] }) }]} />)}</View>
        <Text style={s.timer}>{clock(durationMillis)}</Text>
        <Text style={s.status}>{isProcessing ? (processingStage || 'Preparing your voice note…') : isPaused ? 'Paused. Resume when you’re ready.' : 'Listening to your story…'}</Text>
      </View>
      <ScrollView style={s.questionScroll} contentContainerStyle={s.questionContent} showsVerticalScrollIndicator={false}>
        {prompt ? <View style={s.promptCard}><Text style={s.promptLabel}>A QUESTION TO EXPLORE</Text><Text style={s.prompt}>{prompt}</Text></View> : <Text style={s.hint}>Take your time. Your voice note will be saved when you tap Finish.</Text>}
      </ScrollView>
      </View>
      <View style={s.actions}>
        <Pressable onPress={isPaused ? onResume : onPause} disabled={isProcessing} accessibilityRole="button" accessibilityLabel={isPaused ? 'Resume recording' : 'Pause recording'} style={[s.glassButton, isProcessing && s.disabled]}><BlurView intensity={65} tint="dark" style={StyleSheet.absoluteFillObject} /><View style={s.glassShade} /><View style={s.buttonContent}><Ionicons name={isPaused ? 'play' : 'pause'} size={20} color={C.ink} /><Text style={s.pauseText}>{isPaused ? 'Resume' : 'Pause'}</Text></View></Pressable>
        <Pressable onPress={onStop} disabled={isProcessing} accessibilityRole="button" accessibilityLabel="Finish and save recording" style={[s.glassButton, s.finishButton, isProcessing && s.disabled]}><BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFillObject} /><View style={s.finishShade} /><View style={s.buttonContent}><Ionicons name="stop" size={18} color={C.ink} /><Text style={s.stopText}>{isProcessing ? 'Saving…' : 'Finish'}</Text></View></Pressable>
      </View>
    </SafeAreaView></SafeAreaProvider>
  </Modal>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { height: 68, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: C.ink, fontSize: 18, fontWeight: '700' },
  body: { flex: 1, minHeight: 0, overflow: 'hidden' },
  fixedCapture: { flexShrink: 0, alignItems: 'center', paddingHorizontal: 30, paddingTop: 18, paddingBottom: 8 },
  questionScroll: { flex: 1, minHeight: 0, overflow: 'hidden', marginBottom: 12 },
  questionContent: { paddingHorizontal: 30, paddingTop: 4, paddingBottom: 28 },
  eyebrow: { color: C.rust, fontWeight: '800', letterSpacing: 1.6, fontSize: 10 },
  recordingOrb: { width: 210, height: 210, borderRadius: 105, borderWidth: 1, borderColor: 'rgba(210,138,112,.38)', backgroundColor: 'rgba(210,138,112,.055)', alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  recordingOrbPaused: { opacity: .55 }, recordingOrbProcessing: { borderColor: 'rgba(145,182,159,.35)', backgroundColor: 'rgba(145,182,159,.05)' },
  outerRing: { width: 158, height: 158, borderRadius: 79, borderWidth: 1, borderColor: 'rgba(210,138,112,.42)', alignItems: 'center', justifyContent: 'center' },
  innerRing: { width: 110, height: 110, borderRadius: 55, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cloud: { position: 'absolute', width: 108, height: 74, alignItems: 'center', justifyContent: 'center', opacity: .75 },
  cloudLeft: { position: 'absolute', width: 55, height: 55, borderRadius: 28, left: 0, top: 19, backgroundColor: 'rgba(210,138,112,.14)' },
  cloudCenter: { position: 'absolute', width: 73, height: 73, borderRadius: 37, left: 18, top: 0, backgroundColor: 'rgba(210,138,112,.18)' },
  cloudRight: { position: 'absolute', width: 52, height: 52, borderRadius: 26, right: 0, top: 20, backgroundColor: 'rgba(210,138,112,.13)' },
  micIcon: { zIndex: 1 },
  signalRow: { height: 39, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 15 },
  signalBar: { width: 5, borderRadius: 4, backgroundColor: C.rust },
  timer: { color: C.ink, fontSize: 38, fontWeight: '600', marginTop: 10 },
  status: { color: C.muted, fontSize: 13, textAlign: 'center', marginTop: 7 },
  promptCard: { width: '100%', padding: 18, borderRadius: 17, borderWidth: 1, borderColor: C.line, backgroundColor: C.paper },
  promptLabel: { color: C.green, fontSize: 9, fontWeight: '800', letterSpacing: 1.3 },
  prompt: { color: C.ink, fontSize: 18, lineHeight: 29, marginTop: 9 },
  hint: { color: C.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', alignSelf: 'center', maxWidth: 260 },
  actions: { flexShrink: 0, flexDirection: 'row', gap: 11, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12, backgroundColor: C.bg, zIndex: 2 },
  glassButton: { flex: 1, height: 58, borderRadius: 30, borderWidth: 1, borderColor: 'rgba(255,255,255,.30)', backgroundColor: 'rgba(255,255,255,.09)', overflow: 'hidden' },
  glassShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,.035)' },
  finishButton: { borderColor: 'rgba(255,213,194,.48)', backgroundColor: 'rgba(210,138,112,.35)' },
  finishShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(210,138,112,.26)' },
  buttonContent: { flex: 1, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center' },
  pauseText: { color: C.ink, fontSize: 15, fontWeight: '700' },
  stopText: { color: C.ink, fontSize: 15, fontWeight: '800' }, disabled: { opacity: .45 },
});
