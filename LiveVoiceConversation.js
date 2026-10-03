import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, NativeEventEmitter, NativeModules, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AudioModule, setAudioModeAsync } from 'expo-audio';
import { toByteArray } from 'base64-js';
import { getLiveGenerativeModel, ResponseModality } from '@react-native-firebase/ai';
import { initializeFirebaseServices } from './firebase';
import { createAskThread, createAskTurn, newAskThreadId, newAskTurnId, updateAskThread, updateAskTurn } from './cloudData';

const player = NativeModules.LivePCMPlayer;
const MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
const MAX_SESSION_MS = 12 * 60 * 1000;

export default function LiveVoiceConversation({ uid, threadId, history, onThreadCreated, onClose }) {
  const [phase, setPhase] = useState('connecting');
  const [muted, setMuted] = useState(false);
  const [tapToInterrupt, setTapToInterrupt] = useState(false);
  const [error, setError] = useState('');
  const [lastUser, setLastUser] = useState('');
  const [lastReply, setLastReply] = useState('');
  const [visibleTurns, setVisibleTurns] = useState(() => (history || []).filter((turn) => turn.status === 'ready').slice(-8)
    .map((turn) => ({ id: turn.id, input: turn.prompt, output: turn.answer })));
  const scrollRef = useRef(null);
  const sessionRef = useRef(null);
  const activeRef = useRef(false);
  const mutedRef = useRef(false);
  const speakingRef = useRef(false);
  const suppressOutputRef = useRef(false);
  const transcriptRef = useRef({ input: '', output: '' });
  const threadRef = useRef(threadId);
  const savingRef = useRef(Promise.resolve());
  const timerRef = useRef(null);
  const micWatchdogRef = useRef(null);
  const micBuffersRef = useRef(0);
  const connectionGenerationRef = useRef(0);
  const listenerRef = useRef(null);
  const pauseUplinkDuringPlaybackRef = useRef(false);
  const playbackTimerRef = useRef(null);
  const playbackUntilRef = useRef(0);
  const orbScale = useRef(new Animated.Value(1)).current;
  const cloudMotion = useRef(new Animated.Value(0)).current;
  const animateLevel = (level) => Animated.timing(orbScale, {
    toValue: 1 + Math.min(0.22, level / 11000), duration: 140,
    easing: Easing.out(Easing.quad), useNativeDriver: true,
  }).start();
  const handleMicBuffer = ({ data }) => {
    const session = sessionRef.current;
    if (!activeRef.current || mutedRef.current || !session || session.isClosed) return;
    // Without reliable acoustic echo cancellation, speaker audio can look like
    // a new user turn and interrupt Publi. The orb remains tappable to barge in.
    if (speakingRef.current && pauseUplinkDuringPlaybackRef.current) return;
    micBuffersRef.current += 1;
    const bytes = toByteArray(data);
    let energy = 0;
    for (let i = 0; i + 1 < bytes.length; i += 16) {
      let value = bytes[i] | (bytes[i + 1] << 8);
      if (value > 32767) value -= 65536;
      energy += Math.abs(value);
    }
    const level = energy / Math.max(1, Math.ceil(bytes.length / 16));
    if (!speakingRef.current) animateLevel(level);
    try {
      session.sendAudioRealtime({ mimeType: 'audio/pcm;rate=16000', data }).catch((sendError) => {
        if (activeRef.current && sessionRef.current === session) {
          setError(sendError?.message || 'The live connection was interrupted.');
        }
      });
    } catch (sendError) {
      setError(sendError?.message || 'The live connection was interrupted.');
    }
  };

  const saveTurn = (input, output) => {
    const prompt = input.trim();
    const answer = output.trim();
    if (!prompt && !answer) return;
    setVisibleTurns((current) => [...current, { id: `${Date.now()}-${current.length}`, input: prompt, output: answer }]);
    setLastUser(''); setLastReply('');
    savingRef.current = savingRef.current.then(async () => {
      let id = threadRef.current;
      const newThread = !id;
      if (!id) {
        id = newAskThreadId(uid);
        await createAskThread(uid, id, prompt || 'Live voice conversation');
        threadRef.current = id;
        onThreadCreated?.(id);
      }
      const turnId = newAskTurnId(uid, id);
      await createAskTurn(uid, id, turnId, { prompt: prompt || 'Voice conversation' });
      await updateAskTurn(uid, id, turnId, { answer, status: 'ready' });
      await updateAskThread(uid, id, { lastMessagePreview: prompt || answer, title: newThread ? (prompt || 'Voice conversation').slice(0, 75) : undefined });
    }).catch((saveError) => setError(`Conversation continued, but history could not save: ${saveError?.message || 'Please try again.'}`));
  };

  const handleServer = async (session) => {
    for await (const event of session.receive()) {
      if (!activeRef.current || sessionRef.current !== session) break;
      if (event.type === 'goAway') {
        setError('Live session is ending. Reconnect to keep talking.');
        break;
      }
      if (event.type !== 'serverContent') continue;
      if (event.interrupted) {
        suppressOutputRef.current = false;
        player?.clear();
        clearTimeout(playbackTimerRef.current);
        playbackUntilRef.current = 0;
        speakingRef.current = false;
        setPhase(mutedRef.current ? 'muted' : 'listening');
        if (transcriptRef.current.output) {
          saveTurn(transcriptRef.current.input, transcriptRef.current.output);
          transcriptRef.current = { input: '', output: '' };
        }
      }
      if (event.inputTranscription?.text) {
        transcriptRef.current.input += event.inputTranscription.text;
        setLastUser(transcriptRef.current.input);
        setPhase('thinking');
      }
      if (event.outputTranscription?.text) {
        transcriptRef.current.output += event.outputTranscription.text;
        setLastReply(transcriptRef.current.output);
      }
      for (const part of event.modelTurn?.parts || []) {
        if (part.inlineData?.data && part.inlineData?.mimeType?.startsWith('audio/')) {
          if (suppressOutputRef.current) continue;
          speakingRef.current = true;
          setPhase('speaking');
          const bytes = toByteArray(part.inlineData.data);
          let energy = 0;
          for (let i = 0; i + 1 < bytes.length; i += 32) {
            let value = bytes[i] | (bytes[i + 1] << 8);
            if (value > 32767) value -= 65536;
            energy += Math.abs(value);
          }
          animateLevel(energy / Math.max(1, Math.ceil(bytes.length / 32)));
          player?.enqueue(part.inlineData.data);
          const durationMs = bytes.length / 2 / 24000 * 1000;
          playbackUntilRef.current = Math.max(Date.now(), playbackUntilRef.current) + durationMs;
        }
      }
      if (event.turnComplete) {
        suppressOutputRef.current = false;
        saveTurn(transcriptRef.current.input, transcriptRef.current.output);
        transcriptRef.current = { input: '', output: '' };
        clearTimeout(playbackTimerRef.current);
        const remainingMs = Math.max(0, playbackUntilRef.current - Date.now());
        playbackTimerRef.current = setTimeout(() => {
          speakingRef.current = false;
          playbackUntilRef.current = 0;
          if (activeRef.current) setPhase(mutedRef.current ? 'muted' : 'listening');
        }, remainingMs + 200);
      }
    }
    if (activeRef.current && sessionRef.current === session) { disconnect(); setPhase('disconnected'); setError((current) => current || 'Connection ended. Tap Reconnect to continue.'); }
  };

  const disconnect = () => {
    activeRef.current = false;
    connectionGenerationRef.current += 1;
    clearTimeout(micWatchdogRef.current);
    clearTimeout(timerRef.current);
    clearTimeout(playbackTimerRef.current);
    playbackUntilRef.current = 0;
    speakingRef.current = false;
    suppressOutputRef.current = false;
    listenerRef.current?.remove();
    listenerRef.current = null;
    player?.stopCapture();
    player?.shutdown();
    const session = sessionRef.current;
    sessionRef.current = null;
    session?.close().catch(() => {});
  };

  const connect = async () => {
    disconnect();
    mutedRef.current = false; setMuted(false);
    setError(''); setPhase('connecting');
    if (!player) { setPhase('disconnected'); setError('Live audio playback is unavailable in this build.'); return; }
    activeRef.current = true;
    const generation = connectionGenerationRef.current;
    const isCurrent = () => activeRef.current && generation === connectionGenerationRef.current;
    micBuffersRef.current = 0;
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error('Please allow Publi to use the microphone in Settings.');
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true, shouldRouteThroughEarpiece: false, interruptionMode: 'doNotMix' });
      const { ai } = await initializeFirebaseServices();
      if (!isCurrent()) return;
      const recent = (history || []).filter((turn) => turn.status === 'ready').slice(-6)
        .map((turn) => `User: ${turn.prompt}\nPubli: ${turn.answer}`).join('\n');
      const model = getLiveGenerativeModel(ai, {
        model: MODEL,
        generationConfig: { responseModalities: [ResponseModality.AUDIO], inputAudioTranscription: {}, outputAudioTranscription: {} },
        systemInstruction: `You are Publi, a thoughtful voice companion. Converse naturally and briefly. Ask useful follow-up questions that help the user develop their own ideas. Let the user interrupt you. Do not speak markdown formatting.${recent ? `\nRecent chat context:\n${recent}` : ''}`,
      });
      const session = await model.connect();
      if (!isCurrent()) { await session.close(); return; }
      sessionRef.current = session;
      listenerRef.current = new NativeEventEmitter(player).addListener('LiveMicPCM', handleMicBuffer);
      const capture = await player.startCapture();
      if (!isCurrent()) return;
      pauseUplinkDuringPlaybackRef.current = !!capture?.simulator || !capture?.voiceProcessing;
      setTapToInterrupt(pauseUplinkDuringPlaybackRef.current);
      // Mute may be tapped while the connection/capture is still opening.
      if (mutedRef.current) player.stopCapture();
      setPhase(mutedRef.current ? 'muted' : 'listening');
      micWatchdogRef.current = setTimeout(() => {
        if (isCurrent() && !mutedRef.current && !micBuffersRef.current) {
          disconnect(); setPhase('disconnected');
          setError('No microphone audio reached the conversation. Check microphone access and reconnect.');
        }
      }, 8000);
      timerRef.current = setTimeout(() => {
        if (activeRef.current) { disconnect(); setPhase('disconnected'); setError('This live session reached its time limit. Reconnect to continue.'); }
      }, MAX_SESSION_MS);
      handleServer(session).catch((receiveError) => {
        if (isCurrent() && sessionRef.current === session) { disconnect(); setPhase('disconnected'); setError(receiveError?.message || 'Live connection failed.'); }
      });
      // An audible greeting confirms that the response channel is working
      // before the person starts talking into a seemingly silent session.
      await session.send('Briefly say hello and invite me to share what is on my mind.');
    } catch (connectError) {
      if (!isCurrent()) return;
      disconnect(); setPhase('disconnected'); setError(connectError?.message || 'Could not connect to Gemini Live.');
    }
  };

  useEffect(() => {
    const motion = Animated.loop(Animated.sequence([
      Animated.timing(cloudMotion, { toValue: 1, duration: 4800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(cloudMotion, { toValue: 0, duration: 4800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    motion.start(); connect();
    return () => { motion.stop(); disconnect(); };
  }, []);
  const toggleMute = async () => {
    const next = !mutedRef.current;
    mutedRef.current = next; setMuted(next);
    if (next) { player?.stopCapture(); setPhase('muted'); }
    else if (sessionRef.current) {
      try { await player.startCapture(); setPhase(speakingRef.current ? 'speaking' : 'listening'); }
      catch (captureError) { disconnect(); setPhase('disconnected'); setError(captureError?.message || 'Could not resume microphone.'); }
    }
  };
  const interruptPlayback = () => {
    if (!speakingRef.current) return;
    suppressOutputRef.current = true;
    player?.clear();
    clearTimeout(playbackTimerRef.current);
    playbackUntilRef.current = 0;
    speakingRef.current = false;
    setPhase(mutedRef.current ? 'muted' : 'listening');
  };

  const motionX = cloudMotion.interpolate({ inputRange: [0, 1], outputRange: [-15, 15] });
  const motionY = cloudMotion.interpolate({ inputRange: [0, 1], outputRange: [11, -11] });
  const phaseText = ({ connecting: 'Connecting…', listening: 'Listening', thinking: 'Thinking…', speaking: 'Publi is speaking', muted: 'Microphone muted', disconnected: 'Disconnected' })[phase];
  return <View style={styles.root}>
    <ScrollView ref={scrollRef} style={styles.conversation} contentContainerStyle={styles.conversationContent} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
      {visibleTurns.map((turn) => <View key={turn.id}>
        {!!turn.input && <View style={styles.userBubble}><Text style={styles.userText}>{turn.input}</Text></View>}
        {!!turn.output && <Text style={styles.replyText}>{turn.output}</Text>}
      </View>)}
      {!!lastUser && <View style={styles.userBubble}><Text style={styles.userText}>{lastUser}</Text></View>}
      {!!lastReply && <Text style={styles.replyText}>{lastReply}</Text>}
    </ScrollView>
    <View style={styles.orbRegion}>
      <Pressable onPress={interruptPlayback} accessibilityRole="button" accessibilityLabel="Interrupt Publi speech">
      <Animated.View style={[styles.orb, { transform: [{ scale: orbScale }] }]} accessibilityLabel={`Publi voice orb. ${phaseText}`}>
        <Animated.Image source={require('./assets/voice-cloud.png')} style={[styles.cloudImage, { transform: [{ translateX: motionX }, { translateY: motionY }] }]} />
        <Animated.Image source={require('./assets/voice-cloud.png')} style={[styles.cloudOverlay, { transform: [{ translateX: motionY }, { translateY: motionX }] }]} />
      </Animated.View>
      </Pressable>
      <Text style={styles.phase}>{phaseText}</Text>
      <Text style={styles.hint}>{phase === 'speaking' ? (tapToInterrupt ? 'Tap the orb to interrupt' : 'Speak anytime to interrupt') : phase === 'listening' ? 'Speak naturally' : phase === 'muted' ? 'Tap the mic to continue' : ''}</Text>
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
    <View style={styles.controls}>
      <Pressable accessibilityRole="button" accessibilityLabel="Return to Publi chat" onPress={onClose} style={styles.workButton}><Ionicons name="add" size={27} color="#F5F3EC" /><Text style={styles.workText}>Work with publi</Text></Pressable>
      {phase === 'disconnected' ? <Pressable accessibilityRole="button" accessibilityLabel="Reconnect live voice conversation" onPress={connect} style={styles.roundButton}><Ionicons name="refresh" size={25} color="#F5F3EC" /></Pressable> :
        <Pressable accessibilityRole="button" accessibilityLabel={muted ? 'Unmute microphone' : 'Mute microphone'} onPress={toggleMute} style={styles.roundButton}><Ionicons name={muted ? 'mic-off' : 'mic'} size={26} color="#F5F3EC" /></Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel="End voice conversation" onPress={onClose} style={styles.closeButton}><Ionicons name="close" size={31} color="#111" /></Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  conversation: { flex: 1 }, conversationContent: { paddingHorizontal: 24, paddingTop: 22, paddingBottom: 12, flexGrow: 1, justifyContent: 'flex-end' },
  userBubble: { alignSelf: 'flex-end', maxWidth: '88%', backgroundColor: '#0B126C', paddingHorizontal: 17, paddingVertical: 12, borderRadius: 20, marginBottom: 19 },
  userText: { color: '#F5F5FF', fontSize: 18, lineHeight: 31 },
  replyText: { color: '#F8F8FA', fontSize: 18, lineHeight: 31, marginBottom: 18 },
  orbRegion: { minHeight: 335, alignItems: 'center', justifyContent: 'center' },
  orb: { width: 220, height: 220, borderRadius: 110, overflow: 'hidden', backgroundColor: '#427EFA', marginBottom: 19 },
  cloudImage: { position: 'absolute', width: 265, height: 265, top: -23, left: -23 },
  cloudOverlay: { position: 'absolute', width: 260, height: 260, top: -20, left: -20, opacity: 0.22 },
  phase: { color: '#E5E7EE', fontSize: 15, fontWeight: '600' },
  hint: { color: '#858998', fontSize: 13, textAlign: 'center', marginTop: 5 },
  error: { color: '#E69B8C', textAlign: 'center', marginTop: 12, marginHorizontal: 24, fontSize: 13 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 18 },
  workButton: { flex: 1, height: 58, borderRadius: 30, paddingHorizontal: 16, borderWidth: 1, borderColor: '#343434', backgroundColor: '#151515', flexDirection: 'row', alignItems: 'center', gap: 10 },
  workText: { color: '#8F8F95', fontSize: 15 },
  roundButton: { width: 58, height: 58, borderRadius: 29, borderWidth: 1, borderColor: '#343434', backgroundColor: '#151515', alignItems: 'center', justifyContent: 'center' },
  closeButton: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#F3F3F3', alignItems: 'center', justifyContent: 'center' },
});
