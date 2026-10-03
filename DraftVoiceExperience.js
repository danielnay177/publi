import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const C = {
  bg: '#171C1B', paper: '#222927', ink: '#E7E8E1', muted: '#A7AEA7',
  line: '#39433E', green: '#91B69F', greenSoft: '#2C3C34', rust: '#D28A70',
  gold: '#D3B16C', white: '#F5F3EC',
};

const clock = (millis = 0) => {
  const seconds = Math.max(0, Math.floor(millis / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

const attemptTime = (millis) => millis
  ? new Date(millis).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : '';

const BRAINSTORMING_STARTERS = [
  { label: 'A turning point', prompt: 'What moment changed the way you saw this story?' },
  { label: 'A person', prompt: 'Whose perspective would make this story more complete?' },
  { label: 'A tension', prompt: 'What feels unresolved or surprising about this topic?' },
  { label: 'A consequence', prompt: 'Who is affected, and what might happen next?' },
];

export function TopicIdeas({ outline = [], onChooseTopic, onBuildOutline, loading = false, title = '' }) {
  const points = Array.isArray(outline) ? outline : [];
  return <View style={s.topicRoot}>
    <View style={s.topicHeader}><Ionicons name="bulb-outline" size={20} color={C.gold} /><View style={{ flex: 1 }}><Text style={s.eyebrow}>TOPIC IDEAS</Text><Text style={s.sectionTitle}>Find a thread to follow.</Text></View></View>
    <Text style={s.topicIntro}>{title.trim() ? `Ideas for “${title.trim()}”` : 'Add a working title for ideas tailored to your story, or use a starter below.'}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={loading ? 'Building topic ideas' : 'Build ten topic ideas'} accessibilityState={{ disabled: loading }} onPress={onBuildOutline} disabled={loading} style={[s.topicBuild, loading && s.disabled]}><Ionicons name="sparkles-outline" size={17} color={C.green} /><Text style={s.topicBuildText}>{loading ? 'Finding ideas…' : points.length ? 'Refresh ideas' : 'Build ten ideas'}</Text></Pressable>
    {points.length > 0 && <View style={s.topicList}><Text style={s.topicGroupLabel}>FOR THIS STORY</Text>{points.map((point, index) => <Pressable key={`${index}-${point}`} accessibilityRole="button" accessibilityLabel={`Choose topic ${index + 1}: ${point}`} onPress={() => onChooseTopic?.(point)} style={s.topicCard}><Text style={s.topicNumber}>{String(index + 1).padStart(2, '0')}</Text><Text style={s.topicText}>{point}</Text><Ionicons name="arrow-forward" size={16} color={C.green} /></Pressable>)}</View>}
    <View style={s.topicList}><Text style={s.topicGroupLabel}>WAYS IN</Text>{BRAINSTORMING_STARTERS.map((starter) => <Pressable key={starter.label} accessibilityRole="button" accessibilityLabel={`Choose ${starter.label}: ${starter.prompt}`} onPress={() => onChooseTopic?.(starter.prompt)} style={s.starterCard}><View style={{ flex: 1 }}><Text style={s.starterLabel}>{starter.label}</Text><Text style={s.starterPrompt}>{starter.prompt}</Text></View><Ionicons name="arrow-forward" size={16} color={C.muted} /></Pressable>)}</View>
  </View>;
}

// Presentation only: the parent owns the Expo recorder, playback, and Firebase operations.
export default function DraftVoiceExperience({
  recordings = [], activeRecording = null, selectedQuestion = '', title = '',
  onSelectQuestion, onStart, onFinish, onCancel, onPause, onResume,
  onSpeakQuestion, onStopSpeaking, speaking = false,
  isRecording = false, isPaused = false, durationMillis = 0, recordingBusy = false, processingStage = '',
  pendingUpload = false, onRetryUpload, onRetryAnalysis,
  playingRecordingId = null, isPlaying = false, onPlay, onDelete,
}) {
  const [recordingOpen, setRecordingOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [interview, setInterview] = useState(null);
  const [recordingPrompt, setRecordingPrompt] = useState('');
  const chronological = [...recordings].sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));

  const start = async (prompt = '') => {
    if (starting || recordingBusy || pendingUpload || isRecording) return;
    setStarting(true);
    try {
      const started = await onStart?.();
      if (started !== false) { setRecordingPrompt(typeof prompt === 'string' ? prompt : ''); setRecordingOpen(true); }
    } catch (error) { Alert.alert('Could not start recording', error?.message || 'Please try again.'); }
    finally { setStarting(false); }
  };
  const finish = () => { setRecordingOpen(false); onFinish?.(); };
  const cancel = async () => { await onCancel?.(); setRecordingOpen(false); };
  const activePrompt = recordingPrompt || selectedQuestion || (title.trim() ? `What is the story behind “${title.trim()}”?` : 'What is on your mind?');
  const interviewQuestions = interview?.recording?.questions?.slice(0, 3) || [];
  const interviewQuestion = interviewQuestions[interview?.index || 0] || '';
  const closeInterview = () => { onStopSpeaking?.(); setInterview(null); };
  const moveInterview = (direction) => {
    onStopSpeaking?.();
    setInterview((previous) => previous ? { ...previous, index: Math.max(0, Math.min(Math.min(previous.recording.questions?.length || 1, 3) - 1, previous.index + direction)) } : null);
  };
  const recordInterviewAnswer = async () => {
    if (!interviewQuestion || !interview) return;
    try { if (await onSelectQuestion?.(interviewQuestion, interview.recording) === false) return; }
    catch (error) { Alert.alert('Could not choose question', error?.message || 'Please try again.'); return; }
    closeInterview();
    // Let the interview dismiss before presenting the recorder on iOS.
    setTimeout(() => { void start(interviewQuestion); }, 350);
  };

  return <View style={s.root}>
    <View style={s.launcher}>
      <View style={s.launcherTop}>
        <View style={s.launcherIcon}><Ionicons name="mic-outline" size={23} color={C.rust} /></View>
        <Text style={s.eyebrow}>SAY IT OUT LOUD</Text>
      </View>
      <Text style={s.launcherTitle}>{selectedQuestion ? 'Follow this thought.' : 'Start with your voice.'}</Text>
      <Text style={s.launcherBody}>{selectedQuestion || 'Speak freely. Publi will save your voice, shape your words, and ask where the story might go next.'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={selectedQuestion ? 'Record an answer to the selected question' : 'Start a voice note'} onPress={() => start()} disabled={starting || recordingBusy || pendingUpload} style={[s.primaryButton, (starting || recordingBusy || pendingUpload) && s.disabled]}>
        <Ionicons name="mic" size={17} color={C.bg} />
        <Text style={s.primaryText}>{recordingBusy ? 'Shaping your voice note…' : pendingUpload ? 'Retry your saved recording below' : starting ? 'Opening microphone…' : selectedQuestion ? 'Record your answer' : 'Start a voice note'}</Text>
        <Ionicons name="arrow-forward" size={17} color={C.bg} />
      </Pressable>
      <Text style={s.privacyNote}>Your audio is saved to your account. Gemini helps transcribe and polish it.</Text>
    </View>
    {recordingBusy && <View accessibilityLiveRegion="polite" style={s.processingCard}>
      <Ionicons name="sparkles-outline" size={20} color={C.green} />
      <View style={{ flex: 1 }}><Text style={s.processingTitle}>{processingStage || 'Shaping your voice note…'}</Text><Text style={s.processingBody}>Your recording is being saved and turned into ideas you can build on.</Text></View>
    </View>}
    {pendingUpload && <View style={s.processingCard}><Ionicons name="cloud-upload-outline" size={20} color={C.rust} /><View style={{ flex: 1 }}><Text style={s.processingTitle}>Your voice note is still on this device.</Text><Text style={s.processingBody}>The cloud upload did not finish. Retry to save this recording before starting another.</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry voice note upload" onPress={onRetryUpload} style={s.retryButton}><Text style={s.retryText}>Retry upload</Text><Ionicons name="arrow-forward" size={15} color={C.bg} /></Pressable></View></View>}

    <View style={s.sectionHeading}>
      <View><Text style={s.eyebrow}>YOUR VOICE, OVER TIME</Text><Text style={s.sectionTitle}>The story so far.</Text></View>
      <Text style={s.count}>{chronological.length} {chronological.length === 1 ? 'attempt' : 'attempts'}</Text>
    </View>
    {chronological.length === 0 ? <View style={s.empty}>
      <Ionicons name="chatbubble-ellipses-outline" size={27} color={C.green} />
      <Text style={s.emptyTitle}>A story starts with one thought.</Text>
      <Text style={s.emptyBody}>Your recordings and the questions they inspire will appear here in order.</Text>
    </View> : chronological.map((recording, index) => {
      const questions = Array.isArray(recording.questions) ? recording.questions : [];
      const playing = playingRecordingId === recording.id && isPlaying;
      return <View key={recording.id || index} style={s.timelineRow}>
        <View style={s.rail}><View style={s.railDot}><Ionicons name="mic" size={13} color={C.green} /></View><View style={s.railLine} /></View>
        <View style={s.timelineContent}>
          <View style={s.attemptCard}>
            <View style={s.attemptHeader}>
              <View style={{ flex: 1 }}><Text style={s.attemptLabel}>VOICE NOTE {index + 1}</Text><Text style={s.attemptDate}>{attemptTime(recording.createdAtMs)}{recording.durationMillis ? ` · ${clock(recording.durationMillis)}` : ''}</Text></View>
              {questions.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel={`Open interview questions for voice note ${index + 1}`} onPress={() => setInterview({ recording, index: 0 })} style={s.interviewLink}><Text style={s.interviewLinkText}>Interview</Text><Ionicons name="chevron-forward" size={14} color={C.green} /></Pressable>}
              <Pressable accessibilityRole="button" accessibilityLabel={playing ? `Pause voice note ${index + 1}` : `Play voice note ${index + 1}`} onPress={() => onPlay?.(recording)} style={s.playButton}>
                <Ionicons name={playing ? 'pause' : 'play'} size={18} color={C.bg} />
              </Pressable>
            </View>
            {recording.prompt ? <View style={s.promptBox}><Ionicons name="chatbox-outline" size={14} color={C.gold} /><Text style={s.promptText}>{recording.prompt}</Text></View> : null}
            {recording.transcript ? <View style={s.textSection}><Text style={s.textLabel}>WHAT YOU SAID</Text><Text style={s.transcript}>{recording.transcript}</Text></View> : null}
            {recording.polishedText ? <View style={s.polishedBox}><Text style={s.textLabel}>SHAPED THOUGHT</Text><Text style={s.polished}>{recording.polishedText}</Text></View> : <Text style={s.pending}>{recording.status === 'error' ? 'Your audio is saved. AI processing needs another try.' : 'Saving and shaping your voice note…'}</Text>}
            {recording.status === 'error' && onRetryAnalysis && <Pressable accessibilityRole="button" accessibilityLabel={`Retry AI for voice note ${index + 1}`} onPress={() => onRetryAnalysis(recording)} style={s.retryButton}><Text style={s.retryText}>Retry transcription</Text><Ionicons name="refresh" size={15} color={C.bg} /></Pressable>}
            {onDelete ? <Pressable accessibilityRole="button" accessibilityLabel={`Delete voice note ${index + 1}`} onPress={() => onDelete(recording)} style={s.deleteButton}><Ionicons name="trash-outline" size={15} color={C.muted} /><Text style={s.deleteText}>Delete voice note</Text></Pressable> : null}
          </View>
          {questions.length > 0 && <View style={s.questionGroup}>
            <View style={s.questionHeading}><Ionicons name="sparkles-outline" size={15} color={C.green} /><Text style={s.questionHeadingText}>KEEP EXPLORING</Text></View>
            {questions.slice(0, 3).map((question, questionIndex) => {
              const selected = selectedQuestion === question && activeRecording?.id === recording.id;
              return <Pressable key={`${recording.id}-${questionIndex}`} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`Question ${questionIndex + 1}: ${question}`} onPress={() => onSelectQuestion?.(question, recording)} style={[s.questionCard, selected && s.questionSelected]}>
                <Text style={[s.questionText, selected && s.questionTextSelected]}>{question}</Text>
                <Ionicons name={selected ? 'checkmark-circle' : 'arrow-forward'} size={17} color={selected ? C.green : C.muted} />
              </Pressable>;
            })}
            {selectedQuestion && activeRecording?.id === recording.id ? <Text style={s.selectedHint}>Selected · Use “Record your answer” above to continue.</Text> : null}
          </View>}
        </View>
      </View>;
    })}

    <Modal visible={!!interview} animationType="slide" presentationStyle="fullScreen" onRequestClose={closeInterview}>
      <SafeAreaProvider>
      <SafeAreaView style={s.modal} edges={['top', 'bottom']}>
        <View style={s.modalHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close interview" onPress={closeInterview} style={s.headerButton}><Ionicons name="close" size={23} color={C.ink} /></Pressable>
          <Text style={s.modalHeaderText}>Interview</Text>
          <View style={s.headerButton} />
        </View>
        <View style={s.promptPanel}><Text style={s.promptEyebrow}>QUESTION {(interview?.index || 0) + 1} OF {interviewQuestions.length}</Text><ScrollView contentContainerStyle={s.promptScroll}><Text style={s.modalPrompt}>{interviewQuestion}</Text></ScrollView></View>
        {onSpeakQuestion && <Pressable accessibilityRole="button" accessibilityLabel={speaking ? 'Stop reading question aloud' : 'Read question aloud'} onPress={() => speaking ? onStopSpeaking?.() : onSpeakQuestion(interviewQuestion)} style={s.speakButton}><Ionicons name={speaking ? 'stop-circle-outline' : 'volume-high-outline'} size={19} color={C.green} /><Text style={s.speakText}>{speaking ? 'Stop reading' : 'Read aloud'}</Text></Pressable>}
        <View style={s.interviewNav}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous question" accessibilityState={{ disabled: (interview?.index || 0) === 0 }} disabled={(interview?.index || 0) === 0} onPress={() => moveInterview(-1)} style={[s.navButton, (interview?.index || 0) === 0 && s.disabled]}><Ionicons name="arrow-back" size={19} color={C.ink} /><Text style={s.navText}>Previous</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Next question" accessibilityState={{ disabled: (interview?.index || 0) >= interviewQuestions.length - 1 }} disabled={(interview?.index || 0) >= interviewQuestions.length - 1} onPress={() => moveInterview(1)} style={[s.navButton, (interview?.index || 0) >= interviewQuestions.length - 1 && s.disabled]}><Text style={s.navText}>Next</Text><Ionicons name="arrow-forward" size={19} color={C.ink} /></Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Record an answer to this question" onPress={recordInterviewAnswer} disabled={starting || recordingBusy || pendingUpload} style={[s.interviewRecord, (starting || recordingBusy || pendingUpload) && s.disabled]}><Ionicons name="mic" size={20} color={C.bg} /><Text style={s.interviewRecordText}>Record an answer</Text></Pressable>
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
    <Modal visible={recordingOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={cancel}>
      <SafeAreaProvider>
      <SafeAreaView style={s.modal} edges={['top', 'bottom']}>
        <View style={s.modalHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel recording" onPress={cancel} style={s.headerButton}><Ionicons name="close" size={23} color={C.ink} /></Pressable>
          <Text style={s.modalHeaderText}>Recording</Text>
          <View style={s.headerButton} />
        </View>
        <View style={s.promptPanel}><Text style={s.promptEyebrow}>A THOUGHT TO FOLLOW</Text><ScrollView contentContainerStyle={s.promptScroll}><Text style={s.modalPrompt}>{activePrompt}</Text></ScrollView></View>
        <View style={s.recordingIndicator}><View style={[s.liveDot, isPaused && s.pausedDot]} /><Text style={s.recordingStatus}>{isPaused ? 'Paused' : 'Listening'}</Text><Text style={s.timer}>{clock(durationMillis)}</Text></View>
        <View style={s.recordingActions}>
          {onPause && onResume ? <Pressable accessibilityRole="button" accessibilityLabel={isPaused ? 'Resume recording' : 'Pause recording'} onPress={isPaused ? onResume : onPause} style={s.pauseButton}><Ionicons name={isPaused ? 'play' : 'pause'} size={21} color={C.ink} /><Text style={s.pauseText}>{isPaused ? 'Resume' : 'Pause'}</Text></Pressable> : <View style={s.actionSpacer} />}
          <Pressable accessibilityRole="button" accessibilityLabel="Finish recording" onPress={finish} style={s.finishButton}><Ionicons name="checkmark" size={22} color={C.bg} /><Text style={s.finishText}>Finish</Text></Pressable>
        </View>
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  </View>;
}

const s = StyleSheet.create({
  root: { marginBottom: 20 },
  eyebrow: { color: C.green, fontSize: 9, fontWeight: '800', letterSpacing: 1.3 },
  launcher: { backgroundColor: C.paper, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 20, marginBottom: 27 },
  launcherTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  launcherIcon: { width: 39, height: 39, borderRadius: 20, backgroundColor: '#343B37', alignItems: 'center', justifyContent: 'center' },
  launcherTitle: { fontFamily: 'Georgia', color: C.ink, fontSize: 25, lineHeight: 30, marginTop: 17 },
  launcherBody: { color: C.muted, fontSize: 13, lineHeight: 20, marginTop: 8 },
  primaryButton: { backgroundColor: C.green, minHeight: 48, borderRadius: 24, paddingHorizontal: 17, marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  primaryText: { color: C.bg, fontWeight: '800', fontSize: 13, flex: 1, textAlign: 'center' },
  disabled: { opacity: .55 },
  privacyNote: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 12, textAlign: 'center' },
  processingCard: { marginTop: -14, marginBottom: 25, flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 15, backgroundColor: C.greenSoft, borderRadius: 11, borderWidth: 1, borderColor: '#52665B' },
  processingTitle: { color: C.ink, fontSize: 12, fontWeight: '700' },
  processingBody: { color: C.muted, fontSize: 10, lineHeight: 16, marginTop: 4 },
  retryButton: { alignSelf: 'flex-start', backgroundColor: C.green, borderRadius: 18, minHeight: 34, paddingHorizontal: 12, marginTop: 11, flexDirection: 'row', alignItems: 'center', gap: 7 },
  retryText: { color: C.bg, fontSize: 11, fontWeight: '800' },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 15 },
  sectionTitle: { fontFamily: 'Georgia', fontSize: 23, color: C.ink, marginTop: 4 },
  count: { color: C.muted, fontSize: 11 },
  empty: { borderColor: C.line, borderWidth: 1, borderStyle: 'dashed', borderRadius: 13, padding: 25, alignItems: 'center', marginBottom: 10 },
  emptyTitle: { fontFamily: 'Georgia', color: C.ink, fontSize: 18, marginTop: 12 },
  emptyBody: { color: C.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 },
  timelineRow: { flexDirection: 'row' },
  rail: { width: 30, alignItems: 'center' },
  railDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.greenSoft, borderWidth: 1, borderColor: '#506658', alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  railLine: { width: 1, flex: 1, backgroundColor: C.line },
  timelineContent: { flex: 1, paddingBottom: 18 },
  attemptCard: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, borderRadius: 13, padding: 15 },
  attemptHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  attemptLabel: { color: C.green, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  attemptDate: { color: C.muted, fontSize: 10, marginTop: 4 },
  playButton: { backgroundColor: C.green, width: 37, height: 37, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  promptBox: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: '#2B302D', borderRadius: 9, padding: 10, marginTop: 14 },
  promptText: { flex: 1, color: C.gold, fontSize: 11, lineHeight: 17 },
  textSection: { marginTop: 15 },
  textLabel: { color: C.green, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  transcript: { color: C.muted, fontSize: 12, lineHeight: 19, marginTop: 6 },
  polishedBox: { marginTop: 15, paddingTop: 14, borderTopWidth: 1, borderColor: C.line },
  polished: { color: C.ink, fontFamily: 'Georgia', fontSize: 15, lineHeight: 23, marginTop: 7 },
  pending: { color: C.muted, fontSize: 11, lineHeight: 17, marginTop: 15 },
  deleteButton: { alignSelf: 'flex-end', flexDirection: 'row', gap: 5, alignItems: 'center', paddingTop: 11, paddingBottom: 2 },
  deleteText: { color: C.muted, fontSize: 10 },
  questionGroup: { marginTop: 12 },
  questionHeading: { flexDirection: 'row', gap: 7, alignItems: 'center', marginBottom: 8 },
  questionHeadingText: { color: C.green, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  interviewLink: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 5, paddingLeft: 8 },
  interviewLinkText: { color: C.green, fontSize: 11, fontWeight: '700' },
  questionCard: { backgroundColor: '#252E29', borderWidth: 1, borderColor: '#3C4A40', borderRadius: 11, paddingVertical: 13, paddingHorizontal: 14, marginBottom: 7, flexDirection: 'row', gap: 8, alignItems: 'center' },
  questionSelected: { borderColor: C.green, backgroundColor: '#2D3F34' },
  questionText: { flex: 1, color: '#BCC8BE', fontSize: 12, lineHeight: 18 },
  questionTextSelected: { color: C.ink },
  selectedHint: { color: C.green, fontSize: 10, lineHeight: 15, marginTop: 3 },
  modal: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 20 },
  modalHeader: { height: 65, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  modalHeaderText: { color: C.ink, fontSize: 15, fontWeight: '700' },
  promptPanel: { flex: 1, backgroundColor: C.paper, borderColor: C.line, borderWidth: 1, borderRadius: 18, padding: 22, marginTop: 12 },
  promptEyebrow: { color: C.green, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  promptScroll: { flexGrow: 1, justifyContent: 'center' },
  modalPrompt: { fontFamily: 'Georgia', color: C.ink, fontSize: 28, lineHeight: 38 },
  speakButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 7, paddingVertical: 12 },
  speakText: { color: C.green, fontSize: 12, fontWeight: '700' },
  interviewNav: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 15 },
  navButton: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 9 },
  navText: { color: C.ink, fontSize: 12, fontWeight: '700' },
  interviewRecord: { backgroundColor: C.green, height: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginBottom: 17 },
  interviewRecordText: { color: C.bg, fontSize: 13, fontWeight: '800' },
  recordingIndicator: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 8, paddingVertical: 24 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.rust },
  pausedDot: { backgroundColor: C.muted },
  recordingStatus: { color: C.muted, fontSize: 13 },
  timer: { color: C.ink, fontSize: 14, fontVariant: ['tabular-nums'], fontWeight: '700' },
  recordingActions: { flexDirection: 'row', gap: 12, paddingBottom: 17 },
  actionSpacer: { flex: 1 },
  pauseButton: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 25, height: 50, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  pauseText: { color: C.ink, fontSize: 13, fontWeight: '700' },
  finishButton: { flex: 1, backgroundColor: C.green, borderRadius: 25, height: 50, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  finishText: { color: C.bg, fontSize: 13, fontWeight: '800' },
  topicRoot: { backgroundColor: C.paper, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 17, marginBottom: 20 },
  topicHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  topicIntro: { color: C.muted, fontSize: 11, lineHeight: 17, marginTop: 12 },
  topicBuild: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, borderColor: '#52665B', borderWidth: 1, borderRadius: 22, paddingHorizontal: 13, paddingVertical: 10, marginTop: 14 },
  topicBuildText: { color: C.green, fontSize: 11, fontWeight: '700' },
  topicList: { marginTop: 20 },
  topicGroupLabel: { color: C.green, fontSize: 9, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 },
  topicCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#293630', borderRadius: 10, padding: 12, marginBottom: 7 },
  topicNumber: { color: C.green, fontSize: 10, fontWeight: '800' },
  topicText: { flex: 1, color: C.ink, fontSize: 12, lineHeight: 18 },
  starterCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderColor: C.line, paddingVertical: 12 },
  starterLabel: { color: C.ink, fontSize: 12, fontWeight: '700' },
  starterPrompt: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
});
