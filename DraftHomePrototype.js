import React, { useMemo, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { File, Paths } from 'expo-file-system';
import Clipboard from 'react-native/Libraries/Components/Clipboard/Clipboard';
import AskAnythingScreen from './AskAnythingScreen';
import CaptureRecordingScreen from './CaptureRecordingScreen';

const color = {
  background: '#171C1B', paper: '#222927', raised: '#2A322E', line: '#39433E',
  ink: '#F5F3EC', muted: '#A7AEA7', green: '#91B69F', rust: '#D28A70', gold: '#D3B16C',
};

const duration = (millis = 0) => {
  const seconds = Math.max(0, Math.floor(millis / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

function dateGroup(millis) {
  const day = new Date(millis || Date.now());
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (day >= today) return 'Today';
  if (day >= yesterday) return 'Yesterday';
  return day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function attemptTitle(recording, story) {
  return recording.recordingTitle?.trim() || story?.title?.trim() ||
    (recording.status === 'processing' ? 'Shaping your voice note…' :
      recording.polishedText?.trim().split(/\s+/).slice(0, 7).join(' ') || 'Untitled voice note');
}

function ReadingText({ value }) {
  const paragraphs = String(value || '').replace(/\r\n/g, '\n').trim().split(/\n\s*\n/).filter(Boolean);
  return <View style={styles.readingBody}>{paragraphs.map((paragraph, index) => {
    const heading = /^\s*#{1,4}\s+/.test(paragraph) || /^\*\*[^*]+\*\*$/.test(paragraph.trim()) || /^[A-Z][A-Z0-9 ,:()/-]{3,}$/.test(paragraph.trim());
    const content = paragraph.replace(/^\s*#{1,4}\s+/, '').trim();
    const spans = content.split(/(\*\*[\s\S]+?\*\*)/g).map((span, spanIndex) =>
      span.startsWith('**') && span.endsWith('**')
        ? <Text key={spanIndex} style={styles.readingBold}>{span.slice(2, -2)}</Text>
        : span.replace(/\*\*/g, ''));
    return <Text key={index} style={[heading ? styles.readingHeading : styles.polishedText, index > 0 && styles.readingParagraphGap]}>{spans}</Text>;
  })}</View>;
}

function IconButton({ name, label, onPress }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.iconButton}>
    <Ionicons name={name} size={23} color={color.ink} />
  </Pressable>;
}

export default function DraftHomePrototype({
  onExit, uid, recordings = [], voiceStories = [], onStartRecording, onPauseRecording,
  onResumeRecording, onCancelRecording, onFinishRecording, isRecording = false,
  isPaused = false, durationMillis = 0, metering, recordingBusy = false, processingStage = '',
  pendingUpload = false, onRetryUpload, onRetryAnalysis, onPlayRecording,
  playingRecordingId, loadingRecordingId, isPlaying = false, playbackPosition = 0, playbackDuration = 0,
  onStopPlayback, onEditStoryTitle, onArchiveStory, onDeleteStory,
}) {
  const [screen, setScreen] = useState('home');
  const [selectedRecordingId, setSelectedRecordingId] = useState(null);
  const [selectedFallback, setSelectedFallback] = useState(null);
  const [search, setSearch] = useState('');
  const [askOpen, setAskOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureContext, setCaptureContext] = useState(null);
  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const finishingRef = useRef(false);
  const [retrying, setRetrying] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pendingShareRef = useRef(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const allRecordings = useMemo(() => selectedFallback && !recordings.some(item => item.id === selectedFallback.id)
    ? [selectedFallback, ...recordings] : recordings, [recordings, selectedFallback]);
  const attempts = useMemo(() => [...allRecordings].sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0)).map(recording => {
    const story = voiceStories.find(item => item.id === recording.storyId);
    const date = new Date(recording.createdAtMs || Date.now());
    return { ...recording, title: attemptTitle(recording, story), group: dateGroup(recording.createdAtMs),
      dayKey: date.toDateString(), time: date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }), duration: duration(recording.durationMillis) };
  }), [allRecordings, voiceStories]);
  const historyItems = useMemo(() => {
    const seen = new Set();
    return attempts.filter(item => {
      const key = item.storyId || item.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [attempts]);
  const visibleAttempts = useMemo(() => historyItems.filter(item => {
    const story = voiceStories.find(value => value.id === item.storyId);
    const displayTitle = story?.title?.trim() || item.title;
    return Boolean(story?.archived) === showArchived && displayTitle.toLowerCase().includes(search.trim().toLowerCase());
  }), [historyItems, voiceStories, showArchived, search]);
  const selectedAttempt = attempts.find(item => item.id === selectedRecordingId) || null;
  const selectedStory = voiceStories.find(item => item.id === selectedAttempt?.storyId) || null;
  const relatedRecordings = selectedAttempt ? attempts.filter(item => selectedAttempt.storyId ? item.storyId === selectedAttempt.storyId : item.id === selectedAttempt.id).reverse() : [];
  const lastRelated = relatedRecordings[relatedRecordings.length - 1] || selectedAttempt;
  const displayTitle = selectedStory?.title?.trim() || selectedAttempt?.title || 'Voice note';
  const transcriptFor = (raw = false) => `${displayTitle}\n\n${relatedRecordings.map((item) => {
    const body = (raw ? item.transcript : item.polishedText) || item.transcript || item.polishedText || '';
    return `${item.title}${item.prompt ? `\nQuestion: ${item.prompt}` : ''}\n${body}`;
  }).join('\n\n')}`;
  const shareTranscript = () => {
    const transcript = transcriptFor(false).trim();
    if (!relatedRecordings.some(item => item.polishedText?.trim() || item.transcript?.trim())) {
      Alert.alert('Transcript still processing', 'Try sharing once your transcript is ready.');
      return;
    }
    try {
      const safeTitle = displayTitle.replace(/[\\/:*?"<>|]/g, '-').trim().slice(0, 80) || 'Voice story';
      const file = new File(Paths.cache, `${safeTitle}-${Date.now()}.txt`);
      file.write(transcript);
      pendingShareRef.current = { uri: file.uri, title: displayTitle, transcript };
      setMenuOpen(false);
    } catch (error) {
      Alert.alert('Could not prepare transcript', error?.message || 'Please try again.');
    }
  };
  const presentTranscriptShare = () => {
    const pending = pendingShareRef.current;
    pendingShareRef.current = null;
    if (!pending) return;
    const content = Platform.OS === 'ios' ? { url: pending.uri } : { message: pending.transcript, title: pending.title };
    Share.share(content, { subject: pending.title }).catch(error => {
      Alert.alert('Could not share transcript', error?.message || 'Please try again.');
    });
  };
  const runAction = async (action, errorTitle) => {
    if (actionBusy) return;
    setActionBusy(true);
    try { await action(); }
    catch (error) { Alert.alert(errorTitle, error?.message || 'Please try again.'); }
    finally { setActionBusy(false); }
  };
  const saveTitle = () => runAction(async () => {
    const nextTitle = editTitle.trim();
    if (!nextTitle) { Alert.alert('Add a title', 'Enter a title for this voice story.'); return; }
    await onEditStoryTitle?.(selectedStory, selectedAttempt, nextTitle);
    setEditOpen(false);
  }, 'Could not save title');
  const archiveStory = () => runAction(async () => {
    await onArchiveStory?.(selectedStory, selectedAttempt, !selectedStory?.archived);
    setMenuOpen(false); setScreen('history');
  }, 'Could not archive story');
  const deleteStory = () => {
    setMenuOpen(false);
    Alert.alert('Delete this voice story?', 'Its recordings and transcripts will be permanently removed from your account.', [
      { text: 'Keep story', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => runAction(async () => {
        await onDeleteStory?.(selectedStory, selectedAttempt);
        setSelectedFallback(null); setSelectedRecordingId(null); setScreen('history');
      }, 'Could not delete story') },
    ]);
  };
  const title = screen === 'history' ? 'Your attempts' : screen === 'detail' ? 'Voice story' : 'Draft';

  const goBack = () => {
    if (screen === 'detail') { onStopPlayback?.(); setMenuOpen(false); setScreen('history'); }
    else setScreen('home');
  };

  const openAttempt = (attempt) => { setSelectedRecordingId(attempt.id); setScreen('detail'); };
  const startCapture = async (context = null) => {
    if (starting || recordingBusy || pendingUpload || isRecording) return;
    setStarting(true);
    try {
      const started = await onStartRecording?.();
      if (started !== false) { setCaptureContext(context); setCaptureOpen(true); }
    } catch (error) {
      console.warn('Could not start capture:', error);
    } finally { setStarting(false); }
  };
  const finishCapture = async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    let openedSavedStory = false;
    const openSavedStory = (saved) => {
      if (!saved?.id) return;
      openedSavedStory = true;
      setSelectedFallback(saved);
      setSelectedRecordingId(saved.id);
      setScreen('detail');
      setCaptureOpen(false);
    };
    try {
      const saved = await onFinishRecording?.({ fresh: !captureContext?.recording, sourceRecording: captureContext?.recording || null, question: captureContext?.question || '', onUploaded: openSavedStory });
      if (saved?.id) openSavedStory(saved);
      else if (!openedSavedStory) { setScreen('home'); setCaptureOpen(false); }
    } finally { finishingRef.current = false; setFinishing(false); setCaptureContext(null); }
  };
  const cancelCapture = async () => {
    if (finishing) return;
    await onCancelRecording?.();
    setCaptureOpen(false); setCaptureContext(null);
  };
  const retryUpload = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      const saved = await onRetryUpload?.();
      if (saved?.id) { setSelectedFallback(saved); setSelectedRecordingId(saved.id); setScreen('detail'); }
    } finally { setRetrying(false); }
  };

  return <View style={styles.root}>
    <View style={styles.header}>
      <IconButton name={screen === 'home' ? 'menu-outline' : 'arrow-back'} label={screen === 'home' ? 'Open attempts history' : 'Back to Draft'} onPress={screen === 'home' ? () => setScreen('history') : goBack} />
      <Text style={styles.headerTitle}>{title}</Text>
      {screen === 'home' ? <IconButton name="home-outline" label="Back to Publi home" onPress={onExit} /> : screen === 'detail' ? <IconButton name="ellipsis-horizontal" label="Voice story options" onPress={() => { setCopyOpen(false); setMenuOpen(true); }} /> : <View style={styles.headerSpacer} />}
    </View>

    {screen === 'home' && <>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
        <View style={styles.kickerRow}><View style={styles.kickerDot} /><Text style={styles.kicker}>YOUR SPACE TO THINK OUT LOUD</Text></View>
        <Text style={styles.headline}>Every story starts with a thought.</Text>
        <Text style={styles.intro}>Catch it while it’s fresh. Give it room to grow.</Text>
        <View style={styles.heroCard}>
          <View style={styles.orbitLarge} /><View style={styles.orbitSmall} />
          <Ionicons name="sparkles-outline" size={24} color={color.gold} />
          <Text style={styles.heroTitle}>Make room for what’s on your mind.</Text>
          <Text style={styles.heroBody}>Speak a thought, follow a question, and find the story inside it.</Text>
          <View style={styles.heroRule} /><Text style={styles.heroFoot}>THE FIRST DRAFT BEGINS HERE</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => setScreen('history')} style={styles.historyLink}>
          <View style={styles.historyLinkIcon}><Ionicons name="time-outline" size={20} color={color.green} /></View>
          <View style={{ flex: 1 }}><Text style={styles.historyLinkTitle}>Your attempts</Text><Text style={styles.historyLinkSub}>{historyItems.length ? `${historyItems.length} saved voice ${historyItems.length === 1 ? 'story' : 'stories'}` : 'Your recordings will appear here'}</Text></View>
          <Ionicons name="arrow-forward" size={19} color={color.green} />
        </Pressable>
        {pendingUpload && <Pressable accessibilityRole="button" onPress={retryUpload} disabled={retrying || recordingBusy} style={styles.retryCard}><Ionicons name="cloud-upload-outline" size={20} color={color.rust} /><View style={{ flex: 1 }}><Text style={styles.retryTitle}>Voice note waiting to upload</Text><Text style={styles.retryBody}>{retrying || recordingBusy ? processingStage || 'Retrying…' : 'Tap to retry saving it to your account.'}</Text></View><Ionicons name="refresh" size={19} color={color.green} /></Pressable>}
      </ScrollView>
      <View style={styles.bottomSafe}>
        <View style={styles.bottomActions}>
          <Pressable accessibilityRole="button" disabled={starting || recordingBusy || pendingUpload} onPress={() => startCapture()} style={[styles.action, styles.capture, (starting || recordingBusy || pendingUpload) && styles.disabled]}><BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFillObject} /><View style={styles.captureTint} /><View style={styles.captureIcon}><Ionicons name="mic-outline" size={22} color={color.ink} /></View><Text style={styles.captureText}>{starting ? 'Starting…' : 'Capture'}</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setAskOpen(true)} style={[styles.action, styles.ask]}><BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFillObject} /><View style={styles.askTint} /><Text style={styles.askText}>Ask anything</Text><Ionicons name="sparkles-outline" size={17} color={color.ink} /></Pressable>
        </View>
        <View style={styles.tabSpace} />
      </View>
    </>}

    {screen === 'history' && <ScrollView style={styles.scroll} contentContainerStyle={styles.historyContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionEyebrow}>A PLACE FOR EVERY FIRST TRY</Text>
      <Text style={styles.pageTitle}>Your thoughts, kept close.</Text>
      <Text style={styles.previewNote}>{historyItems.filter(item => !voiceStories.find(story => story.id === item.storyId)?.archived).length} saved {historyItems.length === 1 ? 'story' : 'stories'}</Text>
      <View style={styles.searchBox}><Ionicons name="search-outline" size={20} color={color.muted} /><TextInput value={search} onChangeText={setSearch} placeholder="Search attempts" placeholderTextColor={color.muted} style={styles.searchInput} accessibilityLabel="Search attempts" /></View>
      <View style={styles.historyFilters}><Pressable onPress={() => setShowArchived(false)} style={[styles.historyFilter, !showArchived && styles.historyFilterActive]}><Text style={[styles.historyFilterText, !showArchived && styles.historyFilterTextActive]}>Recent</Text></Pressable><Pressable onPress={() => setShowArchived(true)} style={[styles.historyFilter, showArchived && styles.historyFilterActive]}><Text style={[styles.historyFilterText, showArchived && styles.historyFilterTextActive]}>Archived</Text></Pressable></View>
      {visibleAttempts.length === 0 && <Text style={styles.noResults}>{search ? 'No stories match your search.' : showArchived ? 'No archived voice stories.' : 'Your first recording will appear here after you tap Capture.'}</Text>}
      {[...new Set(visibleAttempts.map(item => item.dayKey))].map(dayKey => <View key={dayKey} style={styles.group}>
        <Text style={styles.groupTitle}>{visibleAttempts.find(item => item.dayKey === dayKey)?.group}</Text>
        {visibleAttempts.filter(item => item.dayKey === dayKey).map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Open attempt ${item.title}`} onPress={() => openAttempt(item)} style={styles.attemptCard}>
          <View style={styles.attemptIcon}><Ionicons name="mic-outline" size={22} color={color.green} /></View>
          <View style={styles.attemptCopy}><Text numberOfLines={1} style={styles.attemptTitle}>{voiceStories.find(story => story.id === item.storyId)?.title || item.title}</Text><Text style={styles.attemptMeta}>{item.time}  ·  {item.duration}</Text></View>
          <Ionicons name="chevron-forward" size={18} color={color.muted} />
        </Pressable>)}
      </View>)}
    </ScrollView>}

    {screen === 'detail' && <>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionEyebrow}>YOUR VOICE STORY</Text>
        <Text style={styles.pageTitle}>{displayTitle}</Text>
        <Text style={styles.previewNote}>{relatedRecordings.length} {relatedRecordings.length === 1 ? 'recording' : 'recordings'} · {selectedAttempt?.group}</Text>
        {relatedRecordings.map((recording, index) => <View key={recording.id} style={styles.timelineRow}>
          <View style={styles.timelineRail}><View style={styles.timelineDot}><Ionicons name="mic" size={15} color={color.green} /></View><View style={styles.timelineLine} /></View>
          <View style={styles.timelineBody}>
            <View style={styles.transcriptCard}>
              <Pressable accessibilityRole="button" accessibilityLabel={playingRecordingId === recording.id && isPlaying ? `Pause ${recording.title}` : `Play ${recording.title}`} onPress={() => onPlayRecording?.(recording)} style={styles.playRow}>
                <Ionicons name={loadingRecordingId === recording.id ? 'cloud-download-outline' : playingRecordingId === recording.id && isPlaying ? 'pause' : 'play'} size={19} color={color.ink} />
                <Text numberOfLines={2} style={styles.recordingTitle}>{recording.title}</Text>
              </Pressable>
              {recording.prompt ? <Text style={styles.answerPrompt}>Answering: {recording.prompt}</Text> : null}
              <Text style={styles.transcriptLabel}>POLISHED TRANSCRIPT</Text>
              <ReadingText value={recording.polishedText || (recording.status === 'error' ? 'Audio saved. Transcription needs another try.' : 'Uploading and polishing your voice note…')} />
              <Text style={styles.recordingDate}>{recording.time} · {recording.duration}</Text>
              {recording.status === 'error' && <Pressable accessibilityRole="button" onPress={() => onRetryAnalysis?.(recording)} style={styles.retryAnalysis}><Ionicons name="refresh" size={16} color={color.green} /><Text style={styles.retryAnalysisText}>Retry transcription</Text></Pressable>}
            </View>
            {Array.isArray(recording.questions) && recording.questions.length > 0 && <View style={styles.followUps}>
              <View style={styles.followUpHeading}><Ionicons name="sparkles-outline" size={15} color={color.muted} /><Text style={styles.followUpLabel}>KEEP EXPLORING</Text></View>
              {recording.questions.slice(0, 3).map((question, questionIndex) => <Pressable key={`${recording.id}-${questionIndex}`} accessibilityRole="button" accessibilityLabel={`Record an answer to ${question}`} onPress={() => startCapture({ recording, question })} style={styles.questionCard}><Text style={styles.questionText}>{question}</Text><Ionicons name="arrow-forward" size={16} color={color.muted} /></Pressable>)}
            </View>}
          </View>
        </View>)}
      </ScrollView>
      <View style={styles.bottomSafe}>
        {playingRecordingId && relatedRecordings.some(item => item.id === playingRecordingId) && <View style={styles.audioPlayer}>
          <Pressable accessibilityRole="button" accessibilityLabel={isPlaying ? 'Pause audio' : 'Resume audio'} onPress={() => onPlayRecording?.(relatedRecordings.find(item => item.id === playingRecordingId))} style={styles.audioControl}><Ionicons name={isPlaying ? 'pause' : 'play'} size={21} color={color.background} /></Pressable>
          <View style={styles.audioProgress}><View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: Math.max(1, Math.ceil(playbackDuration)), now: Math.max(0, Math.floor(playbackPosition)) }} style={styles.audioTrack}><View style={[styles.audioFill, { width: `${Math.max(0, Math.min(100, playbackDuration > 0 ? playbackPosition / playbackDuration * 100 : 0))}%` }]} /></View><View style={styles.audioTimes}><Text style={styles.audioTime}>{duration(playbackPosition * 1000)}</Text><Text style={styles.audioTime}>-{duration(Math.max(0, playbackDuration - playbackPosition) * 1000)}</Text></View></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close audio player" onPress={onStopPlayback} style={styles.audioClose}><Ionicons name="close" size={22} color={color.ink} /></Pressable>
        </View>}
        <Pressable accessibilityRole="button" accessibilityLabel="Record more ideas and thoughts" disabled={starting || recordingBusy || pendingUpload} onPress={() => startCapture({ recording: lastRelated, question: '' })} style={[styles.addThoughts, (starting || recordingBusy || pendingUpload) && styles.disabled]}><View style={styles.addMic}><Ionicons name="mic" size={23} color={color.ink} /></View><Text style={styles.addThoughtsText}>Add ideas/thoughts…</Text><Ionicons name="arrow-up" size={18} color={color.muted} /></Pressable><View style={styles.tabSpace} /></View>
    </>}
    <Modal transparent visible={menuOpen} animationType="fade" onRequestClose={() => setMenuOpen(false)} onDismiss={presentTranscriptShare}><Pressable style={styles.modalShade} onPress={() => setMenuOpen(false)}><Pressable style={styles.storyMenu} onPress={(event) => event.stopPropagation()}>
      <Pressable style={styles.menuItem} disabled={actionBusy} onPress={() => { setEditTitle(displayTitle); setMenuOpen(false); setEditOpen(true); }}><Ionicons name="pencil-outline" size={20} color={color.ink} /><Text style={styles.menuText}>Edit title</Text></Pressable>
      <Pressable style={styles.menuItem} accessibilityRole="button" accessibilityLabel="Share transcript" onPress={shareTranscript}><Ionicons name="share-outline" size={20} color={color.ink} /><Text style={styles.menuText}>Share transcript</Text></Pressable>
      <Pressable style={styles.menuItem} onPress={() => setCopyOpen(!copyOpen)}><Ionicons name="copy-outline" size={20} color={color.ink} /><Text style={styles.menuText}>Copy transcript</Text><Ionicons name={copyOpen ? 'chevron-up' : 'chevron-down'} size={16} color={color.muted} /></Pressable>
      {copyOpen && <><Pressable style={styles.menuSubItem} onPress={() => { Clipboard.setString(transcriptFor(true)); setMenuOpen(false); Alert.alert('Copied', 'Raw transcript copied.'); }}><Text style={styles.menuText}>Copy raw transcript</Text></Pressable><Pressable style={styles.menuSubItem} onPress={() => { Clipboard.setString(transcriptFor(false)); setMenuOpen(false); Alert.alert('Copied', 'Polished transcript copied.'); }}><Text style={styles.menuText}>Copy polished transcript</Text></Pressable></>}
      <Pressable style={styles.menuItem} disabled={actionBusy} onPress={archiveStory}><Ionicons name={selectedStory?.archived ? 'archive-outline' : 'archive-outline'} size={20} color={color.ink} /><Text style={styles.menuText}>{selectedStory?.archived ? 'Unarchive' : 'Archive'}</Text></Pressable>
      <Pressable style={styles.menuItem} disabled={actionBusy} onPress={deleteStory}><Ionicons name="trash-outline" size={20} color="#EF7770" /><Text style={[styles.menuText, { color: '#EF7770' }]}>Delete</Text></Pressable>
    </Pressable></Pressable></Modal>
    <Modal transparent visible={editOpen} animationType="fade" onRequestClose={() => setEditOpen(false)}><View style={styles.modalShade}><View style={styles.editCard}><Text style={styles.editHeading}>Edit voice story title</Text><TextInput value={editTitle} onChangeText={setEditTitle} maxLength={200} autoFocus selectTextOnFocus style={styles.editInput} placeholder="Voice story title" placeholderTextColor={color.muted} /><View style={styles.editActions}><Pressable onPress={() => setEditOpen(false)}><Text style={styles.editCancel}>Cancel</Text></Pressable><Pressable disabled={actionBusy} onPress={saveTitle} style={styles.editSave}><Text style={styles.editSaveText}>{actionBusy ? 'Saving…' : 'Save'}</Text></Pressable></View></View></View></Modal>
    <AskAnythingScreen visible={askOpen} onClose={() => setAskOpen(false)} uid={uid} attempts={attempts} onOpenAttempt={(attempt) => { openAttempt(attempt); setAskOpen(false); }} />
    <CaptureRecordingScreen visible={captureOpen} isPaused={isPaused} isProcessing={finishing || recordingBusy} durationMillis={durationMillis} metering={metering} processingStage={processingStage} prompt={captureContext?.question || ''} onPause={onPauseRecording} onResume={onResumeRecording} onStop={finishCapture} onCancel={cancelCapture} />
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.background },
  header: { height: 68, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.paper, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: color.ink, fontSize: 21, fontWeight: '700' }, headerSpacer: { width: 44 },
  scroll: { flex: 1 }, homeContent: { paddingHorizontal: 25, paddingTop: 31, paddingBottom: 32 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, kickerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.rust },
  kicker: { color: color.green, fontSize: 10, fontWeight: '800', letterSpacing: 1.7 },
  headline: { color: color.ink, fontSize: 36, lineHeight: 43, fontWeight: '700', marginTop: 18, maxWidth: 335 },
  intro: { color: color.muted, fontSize: 15, lineHeight: 23, marginTop: 14, marginBottom: 27 },
  heroCard: { minHeight: 323, overflow: 'hidden', padding: 27, borderRadius: 27, borderWidth: 1, borderColor: '#506153', backgroundColor: '#2A3B34', justifyContent: 'flex-end' },
  orbitLarge: { position: 'absolute', width: 285, height: 285, borderRadius: 145, borderWidth: 1, borderColor: 'rgba(211,177,108,.25)', right: -80, top: -105 },
  orbitSmall: { position: 'absolute', width: 195, height: 195, borderRadius: 100, borderWidth: 1, borderColor: 'rgba(211,177,108,.24)', right: -32, top: -62 },
  heroTitle: { color: color.ink, fontSize: 28, lineHeight: 35, fontWeight: '700', marginTop: 16, maxWidth: 260 },
  heroBody: { color: '#C3CEC4', fontSize: 13, lineHeight: 20, marginTop: 11, maxWidth: 275 },
  heroRule: { height: 1, backgroundColor: 'rgba(245,243,236,.18)', marginTop: 25 },
  heroFoot: { color: color.gold, fontSize: 9, fontWeight: '800', letterSpacing: 1.35, marginTop: 14 },
  historyLink: { marginTop: 17, padding: 17, borderRadius: 19, backgroundColor: color.paper, borderWidth: 1, borderColor: color.line, flexDirection: 'row', alignItems: 'center', gap: 13 },
  historyLinkIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#304138', alignItems: 'center', justifyContent: 'center' },
  historyLinkTitle: { color: color.ink, fontSize: 15, fontWeight: '700' }, historyLinkSub: { color: color.muted, fontSize: 11, marginTop: 4 },
  retryCard: { marginTop: 14, padding: 15, borderRadius: 17, borderWidth: 1, borderColor: '#705246', backgroundColor: '#302924', flexDirection: 'row', alignItems: 'center', gap: 12 },
  retryTitle: { color: color.ink, fontSize: 13, fontWeight: '700' }, retryBody: { color: color.muted, fontSize: 11, marginTop: 4 },
  bottomSafe: { backgroundColor: color.background, borderTopWidth: 1, borderTopColor: color.line },
  bottomActions: { flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 13 },
  tabSpace: { height: 90 },
  action: { flex: 1, minHeight: 59, borderRadius: 31, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  capture: { backgroundColor: 'rgba(77,57,49,.34)', borderWidth: 1, borderColor: 'rgba(255,219,197,.70)' },
  captureTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(211,135,105,.27)' },
  askTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(218,232,228,.10)' },
  captureIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,232,213,.16)' },
  captureText: { color: color.ink, fontWeight: '800', fontSize: 16 },
  ask: { backgroundColor: 'rgba(45,58,52,.31)', borderWidth: 1, borderColor: 'rgba(230,246,239,.66)' }, askText: { color: color.ink, fontWeight: '800', fontSize: 15 },
  disabled: { opacity: .5 },
  historyContent: { paddingHorizontal: 23, paddingTop: 25, paddingBottom: 115 },
  sectionEyebrow: { color: color.green, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  pageTitle: { color: color.ink, fontSize: 31, lineHeight: 39, fontWeight: '700', marginTop: 13 },
  previewNote: { color: color.muted, fontSize: 12, marginTop: 10 },
  searchBox: { height: 54, borderWidth: 1, borderColor: color.line, borderRadius: 27, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 17, marginTop: 28, backgroundColor: color.paper },
  searchInput: { flex: 1, color: color.ink, fontSize: 15, height: 24, paddingVertical: 0, textAlignVertical: 'center' },
  historyFilters: { flexDirection: 'row', gap: 9, marginTop: 17 },
  historyFilter: { paddingHorizontal: 17, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: color.line },
  historyFilterActive: { backgroundColor: color.ink, borderColor: color.ink },
  historyFilterText: { color: color.muted, fontSize: 12, fontWeight: '700' },
  historyFilterTextActive: { color: color.background },
  group: { marginTop: 29 }, groupTitle: { color: color.muted, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  attemptCard: { minHeight: 88, backgroundColor: color.paper, borderRadius: 21, borderWidth: 1, borderColor: color.line, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 10 },
  attemptIcon: { width: 53, height: 53, borderRadius: 17, backgroundColor: color.raised, alignItems: 'center', justifyContent: 'center' },
  attemptCopy: { flex: 1, minWidth: 0 }, attemptTitle: { color: color.ink, fontSize: 15, fontWeight: '700' }, attemptMeta: { color: color.muted, fontSize: 12, marginTop: 7 },
  noResults: { color: color.muted, fontSize: 14, marginTop: 30 },
  detailContent: { paddingHorizontal: 20, paddingTop: 26, paddingBottom: 28 },
  timelineRow: { flexDirection: 'row', marginTop: 25 },
  timelineRail: { width: 34, alignItems: 'center' },
  timelineDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: '#54695A', backgroundColor: '#304138', alignItems: 'center', justifyContent: 'center' },
  timelineLine: { width: 1, flex: 1, backgroundColor: color.line },
  timelineBody: { flex: 1, paddingBottom: 7 },
  transcriptCard: { paddingHorizontal: 5, paddingVertical: 8 },
  playRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  recordingTitle: { flex: 1, color: color.ink, fontSize: 20, lineHeight: 27, fontWeight: '700' },
  answerPrompt: { color: color.muted, fontSize: 14, lineHeight: 22, marginTop: 18 },
  transcriptLabel: { color: color.green, fontSize: 11, fontWeight: '800', letterSpacing: 1.25, marginTop: 25 },
  readingBody: { marginTop: 17 },
  polishedText: { color: color.ink, fontSize: 18, lineHeight: 31, fontWeight: '400' },
  readingHeading: { color: color.ink, fontSize: 16, lineHeight: 24, fontWeight: '800', letterSpacing: .45 },
  readingBold: { fontWeight: '700', color: color.ink },
  readingParagraphGap: { marginTop: 20 },
  recordingDate: { color: color.muted, fontSize: 12, marginTop: 15 },
  retryAnalysis: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  retryAnalysisText: { color: color.green, fontSize: 12, fontWeight: '700' },
  followUps: { marginTop: 16, marginBottom: 5 },
  followUpHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 9 },
  followUpLabel: { color: color.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  questionCard: { marginBottom: 9, paddingVertical: 17, paddingHorizontal: 15, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: '#465048', backgroundColor: '#202724', flexDirection: 'row', alignItems: 'center', gap: 9 },
  questionText: { flex: 1, color: '#AEB8AE', fontSize: 13, lineHeight: 20 },
  addThoughts: { height: 60, marginHorizontal: 17, marginTop: 11, marginBottom: 12, borderRadius: 31, backgroundColor: color.paper, borderWidth: 1, borderColor: color.line, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10 },
  addMic: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#304138', alignItems: 'center', justifyContent: 'center' },
  addThoughtsText: { flex: 1, color: color.muted, fontSize: 14 },
  audioPlayer: { marginHorizontal: 17, marginTop: 12, paddingHorizontal: 12, height: 78, borderRadius: 32, backgroundColor: color.paper, borderWidth: 1, borderColor: color.line, flexDirection: 'row', alignItems: 'center', gap: 12 },
  audioControl: { width: 42, height: 42, borderRadius: 21, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center' },
  audioProgress: { flex: 1, gap: 7 },
  audioTrack: { height: 5, borderRadius: 4, backgroundColor: color.line, overflow: 'hidden' },
  audioFill: { height: '100%', borderRadius: 4, backgroundColor: color.green },
  audioTimes: { flexDirection: 'row', justifyContent: 'space-between' },
  audioTime: { color: color.muted, fontSize: 11 },
  audioClose: { width: 38, height: 38, borderRadius: 19, backgroundColor: color.raised, alignItems: 'center', justifyContent: 'center' },
  modalShade: { flex: 1, backgroundColor: 'rgba(0,0,0,.52)', justifyContent: 'flex-start', alignItems: 'flex-end', paddingTop: 70, paddingHorizontal: 18 },
  storyMenu: { width: 260, borderRadius: 22, backgroundColor: color.raised, borderWidth: 1, borderColor: color.line, paddingVertical: 8 },
  menuItem: { minHeight: 50, paddingHorizontal: 19, flexDirection: 'row', alignItems: 'center', gap: 14 },
  menuSubItem: { minHeight: 44, paddingLeft: 55, paddingRight: 14, justifyContent: 'center' },
  menuText: { flex: 1, color: color.ink, fontSize: 14 },
  editCard: { alignSelf: 'center', width: '100%', maxWidth: 390, marginTop: 120, padding: 22, borderRadius: 22, backgroundColor: color.raised, borderWidth: 1, borderColor: color.line },
  editHeading: { color: color.ink, fontSize: 21, fontWeight: '700', marginBottom: 19 },
  editInput: { height: 51, paddingHorizontal: 15, borderRadius: 12, borderWidth: 1, borderColor: color.line, backgroundColor: color.paper, color: color.ink, fontSize: 15 },
  editActions: { marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 20 },
  editCancel: { color: color.muted, fontSize: 14, fontWeight: '700' },
  editSave: { backgroundColor: color.green, paddingHorizontal: 21, paddingVertical: 11, borderRadius: 12 },
  editSaveText: { color: color.background, fontSize: 14, fontWeight: '800' },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 35, paddingBottom: 70 },
  previewIcon: { width: 82, height: 82, borderRadius: 25, backgroundColor: color.paper, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  previewTitle: { color: color.ink, fontSize: 28, lineHeight: 36, fontWeight: '700', textAlign: 'center', marginTop: 25 },
  previewMeta: { color: color.green, fontSize: 13, marginTop: 8 },
  previewBody: { color: color.muted, fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 18, maxWidth: 320 },
});
