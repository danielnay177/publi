import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { File, Paths } from 'expo-file-system';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioPlayer, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import * as Speech from 'expo-speech';
import { askPubli } from './aiService';
import LiveVoiceConversation from './LiveVoiceConversation';
import HistoryDeleteMenu from './HistoryDeleteMenu';
import { prepareAudioPlayback, replaceAudioAndWait } from './audioPlayback';
import {
  createAskThread, createAskTurn, deleteAskImage, deleteAskAudio, deleteAskThread,
  downloadAskAudio, downloadAskImage, newAskThreadId, newAskTurnId,
  subscribeAskThreads, subscribeAskTurns, updateAskThread, updateAskTurn,
  uploadAskAudio, uploadAskImage,
} from './cloudData';

const C = { bg: '#171C1B', panel: '#222927', raised: '#2A322E', line: '#3C4440',
  ink: '#F5F3EC', muted: '#A7AEA7', green: '#91B69F', blue: '#188DFF', rust: '#D28A70' };
const clock = (millis = 0) => {
  const seconds = Math.max(0, Math.floor(millis / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
const dateGroup = (millis) => {
  const day = new Date(millis || Date.now());
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (day >= today) return 'Today';
  if (day >= yesterday) return 'Yesterday';
  return day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};
const answerForSpeech = (answer = '') => String(answer).replace(/^#{1,4}\s+/gm, '').replace(/\*\*/g, '');
const formattedAnswer = (answer = '') => String(answer).replace(/\r\n/g, '\n')
  .replace(/([:;.!?])\s+(?=\d{1,2}\.\s+[A-Z])/g, '$1\n\n')
  .trim().split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => {
  const heading = /^\s*#{1,4}\s+/.test(paragraph) || /^\*\*[^*]+\*\*$/.test(paragraph.trim()) || /^[A-Z][A-Z0-9 ,:()/-]{3,}$/.test(paragraph.trim());
  const content = paragraph.replace(/^\s*#{1,4}\s+/, '').trim();
  const spans = content.split(/(\*\*[\s\S]+?\*\*)/g).map((part, partIndex) =>
    part.startsWith('**') && part.endsWith('**')
      ? <Text key={partIndex} style={s.answerEmphasis}>{part.slice(2, -2)}</Text>
      : part.replace(/\*\*/g, ''));
  return <Text key={index} style={[heading ? s.answerHeading : s.answerText, index > 0 && s.answerParagraphGap]}>{spans}</Text>;
});
const pickerHtml = (source) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no" /></head>
<body style="background:#171C1B;color:#F5F3EC;font-family:-apple-system,Arial;text-align:center;padding:45px 20px">
<div style="font-size:48px;margin:25px">${source === 'camera' ? '📷' : '▧'}</div>
<h2>${source === 'camera' ? 'Take a photo' : 'Choose a photo'}</h2>
<p style="color:#A7AEA7;line-height:1.5">Your photo will be attached to your question.</p>
<input id="photo" type="file" accept="image/*" ${source === 'camera' ? 'capture="environment"' : ''} style="display:none" />
<button onclick="document.getElementById('photo').click()" style="margin-top:25px;border:0;border-radius:28px;background:#91B69F;color:#171C1B;font-size:17px;font-weight:700;padding:17px 35px">${source === 'camera' ? 'Open camera' : 'Open photos'}</button>
<script>document.getElementById('photo').addEventListener('change',function(e){
 var f=e.target.files&&e.target.files[0];if(!f)return;
 var url=URL.createObjectURL(f),img=new Image();
 img.onload=function(){try{var scale=Math.min(1,1600/Math.max(img.width,img.height));var c=document.createElement('canvas');c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);window.ReactNativeWebView.postMessage(JSON.stringify({type:'image',data:c.toDataURL('image/jpeg',.78)}));URL.revokeObjectURL(url);}catch(x){window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',message:String(x)}));}};
 img.onerror=function(){window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',message:'This photo could not be opened.'}));};img.src=url;
});</script></body></html>`;

export default function AskAnythingScreen({ visible, onClose, attempts = [], onOpenAttempt, onDeleteAttempt, uid }) {
  const [page, setPage] = useState('compose');
  const [deleteItem, setDeleteItem] = useState(null);
  const [deletingHistory, setDeletingHistory] = useState(false);
  const [threadId, setThreadId] = useState(null);
  const [threads, setThreads] = useState([]);
  const [turns, setTurns] = useState([]);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [pickerSource, setPickerSource] = useState(null);
  const [imageUris, setImageUris] = useState({});
  const [audioUris, setAudioUris] = useState({});
  const [sending, setSending] = useState(false);
  const [recordingMode, setRecordingMode] = useState(null);
  const [speakingTurnId, setSpeakingTurnId] = useState(null);
  const [speechPaused, setSpeechPaused] = useState(false);
  const scrollRef = useRef(null);
  const voiceSessionRef = useRef(false);
  const startRecordingRef = useRef(null);
  const speechGenerationRef = useRef(0);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const player = useAudioPlayer(null);

  useEffect(() => {
    if (!visible || !uid) return undefined;
    return subscribeAskThreads(uid, setThreads, (error) => Alert.alert('Could not load chats', error?.message || 'Please try again.'));
  }, [visible, uid]);
  useEffect(() => {
    if (!visible || !uid || !threadId) { setTurns([]); return undefined; }
    return subscribeAskTurns(uid, threadId, setTurns, (error) => Alert.alert('Could not load conversation', error?.message || 'Please try again.'));
  }, [visible, uid, threadId]);
  useEffect(() => {
    if (!visible || !uid) return;
    for (const turn of turns) {
      if (turn.imagePath && !imageUris[turn.id]) {
        downloadAskImage(uid, turn.imagePath).then((uri) => setImageUris((old) => ({ ...old, [turn.id]: uri }))).catch(() => {});
      }
    }
  }, [visible, uid, turns, imageUris]);

  const historyItems = useMemo(() => [
    ...threads.map((item) => ({ kind: 'chat', id: item.id, title: item.title,
      preview: item.lastMessagePreview, createdAtMs: item.updatedAtMs,
      time: new Date(item.updatedAtMs || Date.now()).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) })),
    ...attempts.map((item) => ({ ...item, kind: 'voice' })),
  ].sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0)), [threads, attempts]);
  const matches = historyItems.filter((item) => `${item.title} ${item.preview || ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  const currentThread = threads.find((item) => item.id === threadId);

  const stopAnswer = async () => {
    speechGenerationRef.current += 1;
    setSpeakingTurnId(null);
    setSpeechPaused(false);
    await Speech.stop().catch(() => {});
  };
  const playAnswer = async (answer, turnId, continueConversation = false) => {
    const generation = ++speechGenerationRef.current;
    await Speech.stop().catch(() => {});
    if (generation !== speechGenerationRef.current) return;
    setSpeakingTurnId(turnId);
    setSpeechPaused(false);
    try {
      await prepareAudioPlayback();
      Speech.speak(answerForSpeech(answer), {
        rate: .95,
        onDone: () => {
          if (generation !== speechGenerationRef.current) return;
          setSpeakingTurnId(null);
          setSpeechPaused(false);
          if (continueConversation && voiceSessionRef.current) {
            setTimeout(() => startRecordingRef.current?.('conversation'), 300);
          }
        },
        onError: () => {
          if (generation === speechGenerationRef.current) setSpeakingTurnId(null);
        },
      });
    } catch {
      if (generation === speechGenerationRef.current) setSpeakingTurnId(null);
      Alert.alert('Could not play reply', 'Please try Listen again.');
    }
  };
  const toggleSpeechPause = async () => {
    try {
      if (speechPaused) await Speech.resume();
      else await Speech.pause();
      setSpeechPaused(!speechPaused);
    } catch { Alert.alert('Could not control playback', 'Please try again.'); }
  };

  const cancelRecording = async () => {
    if (!recordingMode) return;
    try { await recorder.stop(); await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }); }
    catch { /* Close the recorder even if the file cannot be kept. */ }
    setRecordingMode(null);
  };
  const back = () => {
    if (recordingMode) { cancelRecording(); return; }
    voiceSessionRef.current = false;
    if (page === 'history' || page === 'voice') { stopAnswer(); setPage('compose'); return; }
    stopAnswer(); onClose();
  };
  const newConversation = () => {
    voiceSessionRef.current = false;
    if (recordingMode) cancelRecording();
    stopAnswer();
    setThreadId(null); setTurns([]); setMessage(''); setSelectedImage(null);
    setPage('compose'); Keyboard.dismiss();
  };
  useEffect(() => {
    if (!visible) return;
    newConversation();
    setQuery('');
    setAttachmentMenuOpen(false);
    setPickerSource(null);
  }, [visible]);
  const openHistory = () => { voiceSessionRef.current = false; if (recordingMode) cancelRecording(); stopAnswer(); Keyboard.dismiss(); setAttachmentMenuOpen(false); setPage('history'); };

  const pickImage = async (source) => {
    setAttachmentMenuOpen(false);
    Keyboard.dismiss();
    setPickerSource(source);
  };
  const onPickerMessage = (event) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data);
      if (payload.type === 'error') throw new Error(payload.message || 'Could not read this photo.');
      if (payload.type !== 'image' || !/^data:image\/jpeg;base64,/.test(payload.data)) return;
      const base64 = payload.data.split(',')[1];
      if (base64.length > 12 * 1024 * 1024) throw new Error('This photo is too large. Choose a smaller one.');
      const file = new File(Paths.cache, `publi-ask-photo-${Date.now()}.jpg`);
      file.write(base64, { encoding: 'base64' });
      setSelectedImage({ uri: file.uri, mimeType: 'image/jpeg' });
      setPickerSource(null);
    } catch (error) { setPickerSource(null); Alert.alert('Could not add photo', error?.message || 'Please try again.'); }
  };

  const send = async ({ audioUri = '', speakAnswer = false } = {}) => {
    if (sending || !uid) return;
    const prompt = audioUri ? 'Voice message' : message.trim() || (selectedImage ? 'What do you notice in this photo?' : '');
    if (!prompt) return;
    const image = selectedImage;
    const targetId = threadId || newAskThreadId(uid);
    const turnId = newAskTurnId(uid, targetId);
    let imagePath = ''; let audioPath = ''; let threadCreated = false; let turnCreated = false;
    setSending(true); Keyboard.dismiss(); setAttachmentMenuOpen(false);
    try {
      if (image) imagePath = await uploadAskImage(uid, targetId, turnId, image.uri, image.mimeType);
      if (audioUri) audioPath = await uploadAskAudio(uid, targetId, turnId, audioUri);
      if (!threadId) {
        await createAskThread(uid, targetId, audioUri ? 'Voice conversation' : prompt);
        threadCreated = true;
      }
      await createAskTurn(uid, targetId, turnId, { prompt, imagePath,
        imageContentType: image ? image.mimeType : '', audioPath,
        audioContentType: audioUri ? 'audio/mp4' : '' });
      turnCreated = true;
      if (image) setImageUris((old) => ({ ...old, [turnId]: image.uri }));
      if (audioUri) setAudioUris((old) => ({ ...old, [turnId]: audioUri }));
      setThreadId(targetId); setMessage(''); setSelectedImage(null);
      const result = await askPubli({ prompt: audioUri ? '' : prompt,
        imageUri: image?.uri || '', imageMimeType: image?.mimeType || '', audioUri,
        history: turns.filter((item) => item.status === 'ready') });
      const finalPrompt = audioUri ? result.transcript : prompt;
      await updateAskTurn(uid, targetId, turnId, { prompt: audioUri ? finalPrompt : undefined,
        answer: result.answer, status: 'ready' });
      await updateAskThread(uid, targetId, { title: !threadId && result.suggestedTitle ? result.suggestedTitle : undefined,
        lastMessagePreview: finalPrompt }).catch(() => {});
      if (speakAnswer && voiceSessionRef.current) playAnswer(result.answer, turnId, true);
    } catch (error) {
      if (turnCreated) {
        await updateAskTurn(uid, targetId, turnId, { status: 'error', error: error?.message || 'Publi could not answer.' }).catch(() => {});
        Alert.alert('Publi could not answer', `${error?.message || 'Please try again.'} Your question is saved; tap Retry in the chat.`);
      } else {
        if (imagePath) await deleteAskImage(uid, imagePath).catch(() => {});
        if (audioPath) await deleteAskAudio(uid, audioPath).catch(() => {});
        if (threadCreated) await deleteAskThread(uid, targetId).catch(() => {});
        Alert.alert('Could not save question', error?.message || 'Please try again.');
      }
    } finally { setSending(false); }
  };
  const retryTurn = async (turn) => {
    if (sending || !uid || !threadId) return;
    setSending(true);
    try {
      await updateAskTurn(uid, threadId, turn.id, { status: 'processing' });
      const imageUri = turn.imagePath ? imageUris[turn.id] || await downloadAskImage(uid, turn.imagePath) : '';
      const audioUri = turn.audioPath ? audioUris[turn.id] || await downloadAskAudio(uid, turn.audioPath) : '';
      const result = await askPubli({ prompt: audioUri ? '' : turn.prompt, imageUri,
        imageMimeType: turn.imageContentType, audioUri,
        history: turns.filter((item) => item.createdAtMs < turn.createdAtMs && item.status === 'ready') });
      await updateAskTurn(uid, threadId, turn.id, { prompt: audioUri && turn.prompt === 'Voice message' ? result.transcript : undefined,
        answer: result.answer, status: 'ready' });
      await updateAskThread(uid, threadId, { lastMessagePreview: audioUri ? result.transcript : turn.prompt }).catch(() => {});
      if (page === 'voice') playAnswer(result.answer, turn.id, voiceSessionRef.current);
    } catch (error) {
      await updateAskTurn(uid, threadId, turn.id, { status: 'error', error: error?.message || 'Please try again.' }).catch(() => {});
      Alert.alert('Could not retry', error?.message || 'Please try again.');
    } finally { setSending(false); }
  };
  const startRecording = async (mode) => {
    if (sending || recordingMode) return;
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) { Alert.alert('Microphone permission needed', 'Allow Publi to use the microphone in Settings.'); return; }
      await stopAnswer();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync(); recorder.record(); setRecordingMode(mode);
    } catch (error) { Alert.alert('Could not record', error?.message || 'Please try again.'); }
  };
  startRecordingRef.current = startRecording;
  const finishRecording = async () => {
    const mode = recordingMode;
    if (!mode) return;
    try {
      await recorder.stop();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      setRecordingMode(null);
      if (!recorder.uri) throw new Error('Your recording was unavailable.');
      await send({ audioUri: recorder.uri, speakAnswer: mode === 'conversation' });
    } catch (error) { setRecordingMode(null); Alert.alert('Could not finish recording', error?.message || 'Please try again.'); }
  };
  const playAudio = async (turn) => {
    try {
      const uri = audioUris[turn.id] || await downloadAskAudio(uid, turn.audioPath);
      setAudioUris((old) => ({ ...old, [turn.id]: uri }));
      await stopAnswer();
      await prepareAudioPlayback();
      await replaceAudioAndWait(player, uri);
      player.play();
    } catch (error) { Alert.alert('Could not play voice message', error?.message || 'Please try again.'); }
  };

  const deleteHistory = async () => {
    if (!deleteItem || deletingHistory || sending) return;
    setDeletingHistory(true);
    try {
      if (deleteItem.kind === 'chat') {
        player.pause(); await stopAnswer();
        await deleteAskThread(uid, deleteItem.id);
        if (threadId === deleteItem.id) { setThreadId(null); setTurns([]); }
      } else await onDeleteAttempt?.(deleteItem);
      setDeleteItem(null);
    } catch (error) { Alert.alert('Could not delete history', error?.message || 'Please try again.'); }
    finally { setDeletingHistory(false); }
  };

  return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={pickerSource ? () => setPickerSource(null) : back}>
    <SafeAreaProvider><SafeAreaView edges={['top', 'bottom']} style={[s.safe, page === 'voice' && s.liveSafe]}>
      <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {pickerSource ? <><View style={s.pickerHeader}><Pressable onPress={() => setPickerSource(null)} accessibilityRole="button" accessibilityLabel="Close photo picker" style={s.headerButton}><Ionicons name="close" size={25} color={C.ink} /></Pressable><Text style={s.headerTitle}>Add a photo</Text><View style={s.headerButton} /></View><WebView originWhitelist={['*']} source={{ html: pickerHtml(pickerSource) }} onMessage={onPickerMessage} javaScriptEnabled style={s.pickerWeb} /></> : <>
        {page !== 'voice' && <View style={s.header}>
          <Pressable onPress={back} accessibilityRole="button" accessibilityLabel={page === 'compose' ? 'Back to Draft' : 'Back'} style={s.headerButton}><Ionicons name="arrow-back" size={24} color={C.ink} /></Pressable>
          <Text numberOfLines={1} style={s.headerTitle}>{page === 'history' ? 'Your attempts' : page === 'voice' ? 'Voice conversation' : currentThread?.title || 'Ask publi'}</Text>
          {page === 'history' ? <Pressable onPress={newConversation} accessibilityRole="button" accessibilityLabel="New conversation" style={s.headerButton}><Ionicons name="create-outline" size={22} color={C.ink} /></Pressable> :
            <View style={s.headerActions}>
              {threadId && <Pressable onPress={newConversation} accessibilityRole="button" accessibilityLabel="New conversation" style={s.headerButton}><Ionicons name="create-outline" size={22} color={C.ink} /></Pressable>}
              <Pressable onPress={openHistory} accessibilityRole="button" accessibilityLabel="Open searchable attempt history" style={s.headerButton}><Ionicons name="menu-outline" size={25} color={C.ink} /></Pressable>
            </View>}
        </View>}

        {page === 'history' ? <ScrollView style={s.scroll} contentContainerStyle={s.historyContent} keyboardShouldPersistTaps="handled">
          <Text style={s.eyebrow}>YOUR THOUGHTS, KEPT CLOSE</Text><Text style={s.historyTitle}>Attempt history</Text>
          <Text style={s.subtle}>{historyItems.length} saved {historyItems.length === 1 ? 'attempt' : 'attempts'}</Text>
          <View style={s.searchBox}><Ionicons name="search-outline" size={20} color={C.muted} /><TextInput value={query} onChangeText={setQuery} placeholder="Search attempts" placeholderTextColor={C.muted} accessibilityLabel="Search attempts" style={s.searchInput} /></View>
          {matches.length === 0 && <Text style={s.emptyResults}>{historyItems.length ? 'No attempts match your search.' : 'Your chats and recordings will appear here.'}</Text>}
          {[...new Set(matches.map((item) => new Date(item.createdAtMs || Date.now()).toDateString()))].map((dayKey) => <View key={dayKey} style={s.group}>
            <Text style={s.groupTitle}>{dateGroup(matches.find((item) => new Date(item.createdAtMs || Date.now()).toDateString() === dayKey)?.createdAtMs)}</Text>
            {matches.filter((item) => new Date(item.createdAtMs || Date.now()).toDateString() === dayKey).map((item) => <Pressable key={`${item.kind}-${item.id}`} accessibilityRole="button" accessibilityLabel={`Open ${item.kind === 'chat' ? 'chat' : 'attempt'} ${item.title}`} onLongPress={() => setDeleteItem(item)} delayLongPress={350} onPress={() => {
              if (item.kind === 'chat') { setThreadId(item.id); setPage('compose'); }
              else { setPage('compose'); onOpenAttempt?.(item); }
            }} style={s.historyCard}>
              <View style={s.historyIcon}><Ionicons name={item.kind === 'chat' ? 'chatbubble-ellipses-outline' : 'mic-outline'} size={21} color={C.green} /></View>
              <View style={s.historyCopy}><Text numberOfLines={1} style={s.historyItemTitle}>{item.title}</Text><Text numberOfLines={1} style={s.historyMeta}>{item.time} · {item.kind === 'chat' ? 'Chat' : item.duration}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Show actions for ${item.title}`} onPress={(event) => { event.stopPropagation(); setDeleteItem(item); }} hitSlop={10}><Ionicons name="ellipsis-horizontal" size={21} color={C.muted} /></Pressable>
            </Pressable>)}
          </View>)}
        </ScrollView> : page === 'voice' ? <LiveVoiceConversation uid={uid} threadId={threadId} history={turns} onThreadCreated={setThreadId} onClose={back} /> : <>
          <ScrollView ref={scrollRef} style={s.scroll} contentContainerStyle={s.chatContent} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled">
            {turns.length === 0 ? <View style={s.welcome}><View style={s.welcomeIcon}><Ionicons name="sparkles-outline" size={28} color={C.green} /></View><Text style={s.welcomeTitle}>Work with publi</Text><Text style={s.welcomeText}>Ask a question, explore an idea, or share a photo or voice note.</Text></View> : null}
            {turns.map((turn) => <View key={turn.id} style={s.turn}>
              <View style={s.userBubble}>
                {turn.imagePath && (imageUris[turn.id] ? <Image source={{ uri: imageUris[turn.id] }} style={s.chatImage} /> : <Text style={s.subtle}>Loading photo…</Text>)}
                {turn.audioPath && <Pressable onPress={() => playAudio(turn)} accessibilityRole="button" accessibilityLabel="Play voice message" style={s.audioRow}><Ionicons name="play-circle-outline" size={24} color={C.ink} /><Text style={s.userText}>Voice message</Text></Pressable>}
                <Text style={s.userText}>{turn.prompt}</Text>
              </View>
              <View style={s.assistantRow}><View style={s.assistantIcon}><Ionicons name="sparkles" size={16} color={C.green} /></View><View style={s.assistantBubble}>
                {turn.status === 'processing' ? <><Text style={s.subtle}>Publi is thinking…</Text><Pressable onPress={() => retryTurn(turn)} disabled={sending} accessibilityRole="button" accessibilityLabel="Retry pending answer" style={s.retry}><Ionicons name="refresh" size={16} color={C.green} /><Text style={s.retryText}>Retry if stuck</Text></Pressable></> : turn.status === 'error' ? <><Text style={s.errorText}>{turn.error || 'Could not answer yet.'}</Text><Pressable onPress={() => retryTurn(turn)} disabled={sending} accessibilityRole="button" accessibilityLabel="Retry answer" style={s.retry}><Ionicons name="refresh" size={16} color={C.green} /><Text style={s.retryText}>Retry</Text></Pressable></> : <><View style={s.answerBody}>{formattedAnswer(turn.answer)}</View><Pressable onPress={() => { voiceSessionRef.current = false; playAnswer(turn.answer, turn.id); }} accessibilityRole="button" accessibilityLabel="Listen to Publi answer" style={s.retry}><Ionicons name="volume-medium-outline" size={18} color={C.green} /><Text style={s.retryText}>Listen</Text></Pressable></>}
              </View></View>
            </View>)}
          </ScrollView>

          {!!speakingTurnId && <View style={s.speechPlayer} accessibilityLabel="Publi reply audio player">
            <View style={s.speechPlayerIcon}><Ionicons name="volume-high-outline" size={20} color={C.green} /></View>
            <View style={s.speechPlayerCopy}><Text style={s.speechPlayerTitle}>Publi’s reply</Text><Text style={s.speechPlayerDetail}>{speechPaused ? 'Paused' : 'Speaking aloud'}</Text></View>
            {Platform.OS === 'ios' && <Pressable onPress={toggleSpeechPause} accessibilityRole="button" accessibilityLabel={speechPaused ? 'Resume reply audio' : 'Pause reply audio'} style={s.speechPlayerButton}><Ionicons name={speechPaused ? 'play' : 'pause'} size={22} color={C.ink} /></Pressable>}
            <Pressable onPress={() => { voiceSessionRef.current = false; stopAnswer(); }} accessibilityRole="button" accessibilityLabel="Stop reply audio" style={s.speechPlayerButton}><Ionicons name="close" size={23} color={C.ink} /></Pressable>
          </View>}

          {recordingMode ? <View style={s.recordingArea}><Text style={s.subtle}>Recording your question · {clock(recorderState.durationMillis)}</Text><View style={s.recordingActions}><Pressable onPress={cancelRecording} style={s.cancelVoice}><Text style={s.cancelText}>Cancel</Text></Pressable><Pressable onPress={finishRecording} accessibilityRole="button" accessibilityLabel="Stop and send voice message" style={s.finishVoice}><Ionicons name="stop" size={17} color={C.bg} /><Text style={s.finishText}>Send voice</Text></Pressable></View></View> : <View style={s.composerArea}>
            {attachmentMenuOpen && <View style={s.attachmentMenu}>
              <Pressable onPress={() => pickImage('camera')} accessibilityRole="button" style={s.attachmentOption}><View style={s.attachmentIcon}><Ionicons name="camera-outline" size={23} color={C.ink} /></View><Text style={s.attachmentText}>Camera</Text></Pressable>
              <View style={s.divider} /><Pressable onPress={() => pickImage('photos')} accessibilityRole="button" style={s.attachmentOption}><View style={s.attachmentIcon}><Ionicons name="images-outline" size={23} color={C.ink} /></View><Text style={s.attachmentText}>Photos</Text></Pressable>
            </View>}
            <View style={s.composer}>
              {selectedImage && <View style={s.imagePreview}><Image source={{ uri: selectedImage.uri }} style={s.previewImage} /><Pressable onPress={() => setSelectedImage(null)} accessibilityRole="button" accessibilityLabel="Remove photo" style={s.removeImage}><Ionicons name="close" size={17} color={C.ink} /></Pressable></View>}
              <TextInput value={message} onChangeText={setMessage} placeholder="Work with publi" placeholderTextColor="#858D89" accessibilityLabel="Work with publi" multiline maxLength={4000} style={s.input} textAlignVertical="top" onFocus={() => setAttachmentMenuOpen(false)} />
              <View style={s.toolbar}>
                <Pressable accessibilityRole="button" accessibilityLabel={attachmentMenuOpen ? 'Close attachment menu' : 'Add an attachment'} onPress={() => { Keyboard.dismiss(); setAttachmentMenuOpen((open) => !open); }} style={s.toolButton}><Ionicons name={attachmentMenuOpen ? 'close' : 'add'} size={30} color={C.ink} /></Pressable>
                <View style={{ flex: 1 }} /><Pressable accessibilityRole="button" accessibilityLabel="Record a voice question" onPress={() => startRecording('dictation')} disabled={sending} style={s.toolButton}><Ionicons name="mic-outline" size={24} color={C.ink} /></Pressable>
                {message.trim() || selectedImage ? <Pressable accessibilityRole="button" accessibilityLabel="Send question" onPress={() => send()} disabled={sending} style={s.sendButton}><Ionicons name={sending ? 'hourglass-outline' : 'arrow-up'} size={24} color="#fff" /></Pressable> :
                  <Pressable accessibilityRole="button" accessibilityLabel="Start live voice conversation" onPress={async () => { await stopAnswer(); player.pause(); Keyboard.dismiss(); setPage('voice'); }} disabled={sending} style={s.sendButton}><Ionicons name="pulse" size={25} color="#fff" /></Pressable>}
              </View>
            </View>
          </View>}
        </>}
        </>}
      </KeyboardAvoidingView>
      <HistoryDeleteMenu item={deleteItem} busy={deletingHistory || sending} onClose={() => setDeleteItem(null)} onDelete={deleteHistory} />
    </SafeAreaView></SafeAreaProvider>
  </Modal>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg }, liveSafe: { backgroundColor: '#000' }, root: { flex: 1 },
  header: { height: 65, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row' }, headerTitle: { flex: 1, color: C.ink, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  scroll: { flex: 1 }, chatContent: { paddingHorizontal: 17, paddingBottom: 25, flexGrow: 1 },
  welcome: { flex: 1, minHeight: 330, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 25 },
  welcomeIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#26382F', alignItems: 'center', justifyContent: 'center' },
  welcomeTitle: { color: C.ink, fontSize: 29, fontWeight: '700', marginTop: 20 },
  welcomeText: { color: C.muted, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 12 },
  turn: { marginTop: 20 }, userBubble: { alignSelf: 'flex-end', maxWidth: '86%', padding: 14, borderRadius: 20, borderBottomRightRadius: 7, backgroundColor: '#304239' },
  userText: { color: C.ink, fontSize: 18, lineHeight: 31 }, chatImage: { width: 210, height: 160, borderRadius: 13, marginBottom: 9 },
  audioRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  assistantRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 15 },
  assistantIcon: { width: 29, height: 29, borderRadius: 15, backgroundColor: '#29392F', alignItems: 'center', justifyContent: 'center' },
  assistantBubble: { flex: 1, paddingTop: 2, paddingRight: 4, paddingBottom: 7 },
  answerBody: { marginBottom: 7 },
  answerText: { color: C.ink, fontSize: 18, lineHeight: 31 },
  answerHeading: { color: C.ink, fontSize: 17, lineHeight: 25, fontWeight: '800', letterSpacing: .35 },
  answerEmphasis: { color: C.ink, fontWeight: '700' },
  answerParagraphGap: { marginTop: 20 }, subtle: { color: C.muted, fontSize: 13 },
  speechPlayer: { marginHorizontal: 14, marginBottom: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: C.raised, flexDirection: 'row', alignItems: 'center', gap: 10 },
  speechPlayerIcon: { width: 37, height: 37, borderRadius: 19, backgroundColor: '#344638', alignItems: 'center', justifyContent: 'center' },
  speechPlayerCopy: { flex: 1 }, speechPlayerTitle: { color: C.ink, fontSize: 14, fontWeight: '700' }, speechPlayerDetail: { color: C.muted, fontSize: 12, marginTop: 2 },
  speechPlayerButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: C.rust, fontSize: 14, lineHeight: 20 }, retry: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }, retryText: { color: C.green, fontWeight: '700' },
  composerArea: { paddingHorizontal: 14, paddingBottom: 12 }, composer: { minHeight: 130, backgroundColor: C.panel, borderRadius: 28, borderWidth: 1, borderColor: C.line, paddingTop: 16, paddingHorizontal: 14, paddingBottom: 10 },
  input: { color: C.ink, fontSize: 18, lineHeight: 31, minHeight: 57, maxHeight: 148, paddingHorizontal: 5, paddingTop: 0, paddingBottom: 8 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 9 }, toolButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sendButton: { width: 45, height: 45, borderRadius: 23, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' },
  imagePreview: { width: 77, height: 77, marginLeft: 5, marginBottom: 8 }, previewImage: { width: 77, height: 77, borderRadius: 12 },
  removeImage: { position: 'absolute', right: -8, top: -8, width: 25, height: 25, borderRadius: 13, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' },
  attachmentMenu: { position: 'absolute', left: 21, bottom: 154, width: 220, paddingVertical: 7, borderRadius: 23, backgroundColor: C.raised, borderWidth: 1, borderColor: C.line, zIndex: 10, elevation: 12 },
  attachmentOption: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 13, paddingVertical: 10 },
  attachmentIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#343A38', alignItems: 'center', justifyContent: 'center' },
  attachmentText: { color: C.ink, fontSize: 17 }, divider: { height: 1, marginHorizontal: 15, backgroundColor: C.line },
  voiceArea: { alignItems: 'center', paddingBottom: 25, gap: 12 }, voiceControl: { width: 82, height: 82, borderRadius: 41, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' },
  voiceControlActive: { backgroundColor: C.rust }, stopSpeech: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  recordingArea: { padding: 20, gap: 16, alignItems: 'center' }, recordingActions: { flexDirection: 'row', gap: 10 },
  cancelVoice: { flex: 1, height: 48, borderRadius: 24, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: C.ink, fontWeight: '700' }, finishVoice: { flex: 1, height: 48, borderRadius: 24, backgroundColor: C.rust, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }, finishText: { color: C.bg, fontWeight: '800' },
  historyContent: { paddingHorizontal: 22, paddingTop: 25, paddingBottom: 35 }, eyebrow: { color: C.green, fontSize: 10, letterSpacing: 1.4, fontWeight: '800' },
  historyTitle: { color: C.ink, fontSize: 32, fontWeight: '700', marginTop: 12 },
  searchBox: { marginTop: 27, height: 54, paddingHorizontal: 16, borderRadius: 27, borderWidth: 1, borderColor: C.line, backgroundColor: C.panel, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, height: '100%', color: C.ink, fontSize: 15 }, emptyResults: { color: C.muted, fontSize: 14, marginTop: 30 },
  group: { marginTop: 28 }, groupTitle: { color: C.muted, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  historyCard: { minHeight: 85, padding: 12, marginBottom: 10, borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: C.panel, flexDirection: 'row', alignItems: 'center', gap: 12 },
  historyIcon: { width: 51, height: 51, borderRadius: 16, backgroundColor: '#303A34', alignItems: 'center', justifyContent: 'center' },
  historyCopy: { flex: 1, minWidth: 0 }, historyItemTitle: { color: C.ink, fontSize: 15, fontWeight: '700' },
  historyMeta: { color: C.muted, fontSize: 12, marginTop: 6 },
  pickerHeader: { height: 65, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 },
  pickerWeb: { flex: 1, backgroundColor: C.bg },
});
