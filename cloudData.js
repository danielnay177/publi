import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import {
  collection, deleteDoc, doc, getDoc, getDocs, getFirestore, onSnapshot,
  orderBy, query, runTransaction, serverTimestamp, setDoc, updateDoc, waitForPendingWrites,
} from '@react-native-firebase/firestore';
import { deleteObject, getDownloadURL, getMetadata, getStorage, putFile, ref, writeToFile } from '@react-native-firebase/storage';

// All user content is scoped to the authenticated UID. Callers must pass the
// current user's UID; rules independently enforce that ownership on the server.
const db = () => getFirestore();
const bucket = () => getStorage();
const userDoc = (uid) => doc(db(), 'users', uid);
const draftsCollection = (uid) => collection(db(), 'users', uid, 'drafts');
const recordingsCollection = (uid) => collection(db(), 'users', uid, 'recordings');
const voiceStoriesCollection = (uid) => collection(db(), 'users', uid, 'voiceStories');
const askThreadsCollection = (uid) => collection(db(), 'users', uid, 'askThreads');
const askTurnsCollection = (uid, threadId) => collection(db(), 'users', uid, 'askThreads', threadId, 'turns');
const validUid = (uid) => {
  if (!uid || typeof uid !== 'string' || uid.includes('/')) throw new Error('Sign in before saving your work.');
};
const validId = (id) => {
  if (!id || typeof id !== 'string' || id.includes('/')) throw new Error('Invalid record identifier.');
};
const sorted = (items) => items.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
const snapshotItems = (snap) => sorted(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
// Inline Gemini audio is base64 encoded, so keep its source below the 20 MB
// request limit. Match the bound used by aiService.js.
const MAX_ANALYSIS_AUDIO_BYTES = 14 * 1024 * 1024;
const MAX_ASK_IMAGE_BYTES = 10 * 1024 * 1024;

export const newAskThreadId = (uid) => { validUid(uid); return doc(askThreadsCollection(uid)).id; };
export const newAskTurnId = (uid, threadId) => { validUid(uid); validId(threadId); return doc(askTurnsCollection(uid, threadId)).id; };

export function subscribeAskThreads(uid, onData, onError) {
  validUid(uid);
  return onSnapshot(query(askThreadsCollection(uid), orderBy('updatedAtMs', 'desc')),
    (snap) => onData(snapshotItems(snap)), onError);
}

export function subscribeAskTurns(uid, threadId, onData, onError) {
  validUid(uid); validId(threadId);
  return onSnapshot(query(askTurnsCollection(uid, threadId), orderBy('createdAtMs', 'asc')),
    (snap) => onData(snap.docs.map((item) => ({ id: item.id, ...item.data() }))), onError);
}

export async function createAskThread(uid, id, prompt) {
  validUid(uid); validId(id);
  const now = Date.now();
  const title = String(prompt || '').trim().slice(0, 90) || 'Photo question';
  const value = { title, lastMessagePreview: title, createdAtMs: now, updatedAtMs: now,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  await setDoc(doc(db(), 'users', uid, 'askThreads', id), value);
  return { id, ...value };
}

export async function deleteAskThread(uid, id) {
  validUid(uid); validId(id);
  // Firestore does not cascade subcollections when their parent is deleted.
  const turns = await getDocs(askTurnsCollection(uid, id));
  for (const turn of turns.docs) {
    const value = turn.data();
    for (const [path, remove] of [[value.audioPath, deleteAskAudio], [value.imagePath, deleteAskImage]]) {
      if (path) {
        try { await remove(uid, path); }
        catch (error) { if (error?.code !== 'storage/object-not-found') throw error; }
      }
    }
    await deleteDoc(turn.ref);
  }
  await deleteDoc(doc(db(), 'users', uid, 'askThreads', id));
}

export async function updateAskThread(uid, id, { title, lastMessagePreview } = {}) {
  validUid(uid); validId(id);
  const update = { updatedAtMs: Date.now(), updatedAt: serverTimestamp() };
  if (title !== undefined) update.title = String(title || '').trim().slice(0, 90);
  if (lastMessagePreview !== undefined) update.lastMessagePreview = String(lastMessagePreview || '').trim().slice(0, 300);
  await updateDoc(doc(db(), 'users', uid, 'askThreads', id), update);
}

export async function createAskTurn(uid, threadId, id, { prompt, imagePath = '', imageContentType = '', audioPath = '', audioContentType = '' }) {
  validUid(uid); validId(threadId); validId(id);
  const now = Date.now();
  const value = { prompt: String(prompt || '').trim().slice(0, 4000), imagePath, imageContentType, audioPath, audioContentType,
    answer: '', status: 'processing', error: '', createdAtMs: now,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  await setDoc(doc(db(), 'users', uid, 'askThreads', threadId, 'turns', id), value);
  return { id, ...value };
}

export async function updateAskTurn(uid, threadId, id, { prompt, answer = '', status = 'ready', error = '' }) {
  validUid(uid); validId(threadId); validId(id);
  const update = {
    answer: String(answer || '').trim().slice(0, 20000), status,
    error: String(error || '').slice(0, 1000), updatedAt: serverTimestamp(),
  };
  if (prompt !== undefined) update.prompt = String(prompt || '').trim().slice(0, 4000);
  await updateDoc(doc(db(), 'users', uid, 'askThreads', threadId, 'turns', id), update);
}

export async function uploadAskAudio(uid, threadId, turnId, uri) {
  validUid(uid); validId(threadId); validId(turnId);
  const file = new File(uri);
  if (!file.exists || !file.size || file.size > MAX_ANALYSIS_AUDIO_BYTES) {
    throw new Error('This recording is unavailable or too long. Try a shorter question.');
  }
  const audioPath = `users/${uid}/askAudio/${threadId}/${turnId}.m4a`;
  await putFile(ref(bucket(), audioPath), decodeURI(uri.replace(/^file:\/\//, '')), { contentType: 'audio/mp4' });
  return audioPath;
}

export async function downloadAskAudio(uid, audioPath) {
  validUid(uid);
  if (!audioPath?.startsWith(`users/${uid}/askAudio/`) || !audioPath.endsWith('.m4a')) {
    throw new Error('Invalid voice message path.');
  }
  const file = new File(Paths.cache, `publi-ask-${Date.now()}-${doc(askThreadsCollection(uid)).id}.m4a`);
  try {
    const object = ref(bucket(), audioPath);
    const metadata = await getMetadata(object);
    await writeToFile(object, file.uri);
    if (!file.exists || !file.size || file.size !== metadata.size) throw new Error('The saved audio download was incomplete. Please retry.');
    return file.uri;
  } catch (error) { if (file.exists) file.delete(); throw error; }
}

export async function uploadAskImage(uid, threadId, turnId, uri, mimeType = 'image/jpeg') {
  validUid(uid); validId(threadId); validId(turnId);
  const types = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const extension = types[mimeType];
  if (!extension) throw new Error('Choose a JPEG, PNG, or WebP photo.');
  const file = new File(uri);
  if (!file.exists || !file.size || file.size > MAX_ASK_IMAGE_BYTES) {
    throw new Error('This photo is unavailable or larger than 10 MB. Choose a smaller photo.');
  }
  const imagePath = `users/${uid}/askImages/${threadId}/${turnId}.${extension}`;
  await putFile(ref(bucket(), imagePath), decodeURI(uri.replace(/^file:\/\//, '')), { contentType: mimeType });
  return imagePath;
}

export async function downloadAskImage(uid, imagePath) {
  validUid(uid);
  const prefix = `users/${uid}/askImages/`;
  if (!imagePath?.startsWith(prefix)) throw new Error('Invalid photo path.');
  const extension = imagePath.split('.').pop();
  if (!['jpg', 'png', 'webp'].includes(extension)) throw new Error('Unsupported photo format.');
  const file = new File(Paths.cache, `publi-ask-${Date.now()}-${doc(askThreadsCollection(uid)).id}.${extension}`);
  await writeToFile(ref(bucket(), imagePath), file.uri);
  return file.uri;
}

export async function deleteAskImage(uid, imagePath) {
  validUid(uid);
  if (!imagePath?.startsWith(`users/${uid}/askImages/`)) return;
  await deleteObject(ref(bucket(), imagePath));
}

export async function deleteAskAudio(uid, audioPath) {
  validUid(uid);
  if (!audioPath?.startsWith(`users/${uid}/askAudio/`)) return;
  await deleteObject(ref(bucket(), audioPath));
}

export function subscribeDrafts(uid, onData, onError) {
  validUid(uid);
  return onSnapshot(query(draftsCollection(uid), orderBy('createdAtMs', 'desc')),
    (snap) => onData(snapshotItems(snap).map((draft) => ({
      ...draft,
      date: draft.updatedAtMs === draft.createdAtMs ? 'Saved' : 'Updated',
    }))), onError);
}

export async function saveDraft(uid, draft) {
  validUid(uid);
  const id = draft.id || doc(draftsCollection(uid)).id;
  validId(id);
  const reference = doc(db(), 'users', uid, 'drafts', id);
  const old = await getDoc(reference);
  const now = Date.now();
  const value = {
    title: String(draft.title || '').trim().slice(0, 200),
    body: String(draft.body || '').trim().slice(0, 100000),
    createdAtMs: old.exists() ? old.data().createdAtMs : now,
    updatedAtMs: now,
    updatedAt: serverTimestamp(),
  };
  if (!value.body) throw new Error('Add some text before saving the draft.');
  if (!old.exists()) value.createdAt = serverTimestamp();
  await setDoc(reference, value, { merge: true });
  return { id, ...value, date: old.exists() ? 'Updated just now' : 'Just now' };
}

export async function deleteDraft(uid, id) {
  validUid(uid); validId(id);
  await deleteDoc(doc(db(), 'users', uid, 'drafts', id));
}

export function subscribeRecordings(uid, onData, onError) {
  validUid(uid);
  return onSnapshot(query(recordingsCollection(uid), orderBy('createdAtMs', 'desc')),
    (snap) => onData(snapshotItems(snap)), onError);
}

// A voice story groups a sequence of recordings independently of a saved text
// draft. Older recordings without storyId remain available to callers.
export function subscribeVoiceStories(uid, onData, onError) {
  validUid(uid);
  return onSnapshot(query(voiceStoriesCollection(uid), orderBy('createdAtMs', 'desc')),
    (snap) => onData(snapshotItems(snap)), onError);
}

export async function createVoiceStory(uid, { title = '', openingText = '' } = {}) {
  validUid(uid);
  const cleanTitle = String(title || '').trim().slice(0, 200);
  const reference = doc(voiceStoriesCollection(uid));
  const now = Date.now();
  const story = {
    title: cleanTitle,
    titleSource: cleanTitle ? 'user' : 'untitled',
    archived: false,
    openingText: String(openingText || '').trim().slice(0, 100000),
    createdAtMs: now, updatedAtMs: now,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  };
  await setDoc(reference, story);
  return { id: reference.id, ...story };
}

export async function updateVoiceStory(uid, id, patch) {
  validUid(uid); validId(id);
  const update = { updatedAtMs: Date.now(), updatedAt: serverTimestamp() };
  if (Object.prototype.hasOwnProperty.call(patch, 'title')) {
    update.title = String(patch.title || '').trim().slice(0, 200);
    update.titleSource = update.title ? 'user' : 'untitled';
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'openingText')) {
    update.openingText = String(patch.openingText || '').trim().slice(0, 100000);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'archived')) {
    update.archived = patch.archived === true;
  }
  await updateDoc(doc(db(), 'users', uid, 'voiceStories', id), update);
}

export async function deleteVoiceStory(uid, id) {
  validUid(uid); validId(id);
  const storyRecordings = await getDocs(recordingsCollection(uid));
  for (const item of storyRecordings.docs) {
    if (item.data().storyId === id) await deleteRecording(uid, item.id, item.data().storagePath);
  }
  await deleteDoc(doc(db(), 'users', uid, 'voiceStories', id));
}

// AI may name an untitled story, but cannot replace a title entered by the user.
export async function applySuggestedVoiceStoryTitle(uid, id, suggestedTitle) {
  validUid(uid); validId(id);
  const title = String(suggestedTitle || '').trim().slice(0, 200);
  if (!title) return false;
  const reference = doc(db(), 'users', uid, 'voiceStories', id);
  return runTransaction(db(), async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists() || snapshot.data().titleSource === 'user') return false;
    transaction.update(reference, {
      title, titleSource: 'ai', updatedAtMs: Date.now(), updatedAt: serverTimestamp(),
    });
    return true;
  });
}

// Attach a preexisting flat recording to a new story without moving or
// re-uploading its audio. Only recordings that have never belonged to a story
// may be adopted; security rules permit this one-time metadata migration.
export async function adoptRecordingAsVoiceStory(uid, recordingId, { title = '' } = {}) {
  validUid(uid); validId(recordingId);
  const recordingRef = doc(db(), 'users', uid, 'recordings', recordingId);
  const current = await getDoc(recordingRef);
  if (!current.exists()) throw new Error('This recording no longer exists.');
  if (current.data().storyId) throw new Error('This recording already belongs to a story.');
  const story = await createVoiceStory(uid, { title });
  try {
    await updateDoc(recordingRef, {
      storyId: story.id, parentRecordingId: null, attemptIndex: 1,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    await deleteDoc(doc(db(), 'users', uid, 'voiceStories', story.id)).catch(() => {});
    throw error;
  }
  return story;
}

const audioType = (uri) => {
  const suffix = String(uri).split('?')[0].split('.').pop()?.toLowerCase();
  if (suffix === 'wav') return { extension: 'wav', contentType: 'audio/wav' };
  if (suffix === 'mp3') return { extension: 'mp3', contentType: 'audio/mpeg' };
  if (suffix === 'caf') return { extension: 'caf', contentType: 'audio/x-caf' };
  if (suffix === '3gp') return { extension: '3gp', contentType: 'audio/3gpp' };
  return { extension: 'm4a', contentType: 'audio/mp4' };
};

export async function saveRecording(uid, {
  uri, draftId = null, storyId = null, parentRecordingId = null,
  attemptIndex = 1, prompt = '', durationMillis = 0, onProgress,
}) {
  validUid(uid);
  if (!uri || typeof uri !== 'string') throw new Error('The recording file is unavailable.');
  if (draftId !== null) validId(draftId);
  if (storyId !== null) validId(storyId);
  if (parentRecordingId !== null) validId(parentRecordingId);
  if (parentRecordingId && !storyId) throw new Error('A follow-up needs a voice story.');
  if (!Number.isInteger(attemptIndex) || attemptIndex < 1 || attemptIndex > 10000) {
    throw new Error('Invalid attempt number.');
  }
  const id = doc(recordingsCollection(uid)).id;
  const format = audioType(uri);
  const storagePath = `users/${uid}/recordings/${id}.${format.extension}`;
  const object = ref(bucket(), storagePath);
  const localPath = decodeURI(uri.replace(/^file:\/\//, ''));
  const upload = putFile(object, localPath, { contentType: format.contentType });
  const unsubscribe = typeof onProgress === 'function'
    ? upload.on('state_changed', (snapshot) => {
      if (snapshot.totalBytes > 0) {
        onProgress(Math.min(1, Math.max(0, snapshot.bytesTransferred / snapshot.totalBytes)));
      }
    })
    : null;
  try { await upload; }
  finally { if (unsubscribe) unsubscribe(); }
  const now = Date.now();
  const recording = {
    draftId, storyId, parentRecordingId, attemptIndex,
    prompt: String(prompt || '').slice(0, 1000), durationMillis: Math.max(0, Math.round(durationMillis || 0)),
    storagePath, contentType: format.contentType, status: 'processing',
    recordingTitle: '', transcript: '', polishedText: '', questions: [], error: '',
    createdAtMs: now, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  };
  try {
    await setDoc(doc(db(), 'users', uid, 'recordings', id), recording);
  } catch (error) {
    await deleteObject(object).catch(() => {});
    throw error;
  }
  return { id, ...recording };
}

export async function updateRecording(uid, id, patch) {
  validUid(uid); validId(id);
  const allowed = ['recordingTitle', 'transcript', 'polishedText', 'questions', 'status', 'error'];
  const update = { updatedAt: serverTimestamp() };
  for (const field of allowed) if (Object.prototype.hasOwnProperty.call(patch, field)) {
    update[field] = field === 'recordingTitle' ? String(patch[field] || '').trim().slice(0, 200) : patch[field];
  }
  await updateDoc(doc(db(), 'users', uid, 'recordings', id), update);
}

export async function getRecordingPlaybackUrl(storagePath) {
  if (!storagePath || !storagePath.startsWith('users/')) throw new Error('Invalid recording path.');
  return getDownloadURL(ref(bucket(), storagePath));
}

// Restore a saved voice note to a temporary local file for a retry of AI
// transcription. The native Storage download uses Firebase Auth and App Check;
// no shareable download URL is needed. The caller must run cleanup() in finally.
export async function downloadRecordingForAnalysis(uid, storagePath) {
  validUid(uid);
  const prefix = `users/${uid}/recordings/`;
  if (typeof storagePath !== 'string' || !storagePath.startsWith(prefix)) {
    throw new Error('Invalid recording path.');
  }
  const fileName = storagePath.slice(prefix.length);
  if (!/^[A-Za-z0-9_-]+\.(m4a|mp3|wav|caf|3gp)$/.test(fileName)) {
    throw new Error('Invalid recording path.');
  }
  const object = ref(bucket(), storagePath);
  const metadata = await getMetadata(object);
  if (!Number.isFinite(metadata.size) || metadata.size <= 0 || metadata.size > MAX_ANALYSIS_AUDIO_BYTES) {
    throw new Error('This recording is too long for instant transcription. Try a shorter voice note.');
  }
  const mimeTypes = {
    m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav',
    caf: 'audio/x-caf', '3gp': 'audio/3gpp',
  };
  const extension = fileName.split('.').pop();
  const file = new File(Paths.cache, `publi-analysis-${Date.now()}-${doc(recordingsCollection(uid)).id}.${extension}`);
  const cleanup = () => { if (file.exists) file.delete(); };
  try {
    await writeToFile(object, file.uri);
    if (!file.exists || !file.size || file.size !== metadata.size || file.size > MAX_ANALYSIS_AUDIO_BYTES) {
      throw new Error('The saved recording could not be downloaded for transcription.');
    }
    return { uri: file.uri, mimeType: mimeTypes[extension], cleanup };
  } catch (error) {
    try { cleanup(); } catch { /* Preserve the download error. */ }
    throw error;
  }
}

export async function deleteRecording(uid, id, storagePath) {
  validUid(uid); validId(id);
  const expectedPrefix = `users/${uid}/recordings/${id}.`;
  if (!storagePath?.startsWith(expectedPrefix)) throw new Error('Invalid recording path.');
  try { await deleteObject(ref(bucket(), storagePath)); }
  catch (error) { if (error?.code !== 'storage/object-not-found') throw error; }
  await deleteDoc(doc(db(), 'users', uid, 'recordings', id));
}

export function subscribeProfile(uid, onData, onError) {
  validUid(uid);
  return onSnapshot(userDoc(uid), (snap) => onData(snap.exists() ? snap.data() : null), onError);
}

export function subscribeBookmarks(uid, onData, onError) {
  return subscribeProfile(uid, (profile) => onData(profile?.bookmarks || []), onError);
}

export async function saveProfile(uid, { name, email }) {
  validUid(uid);
  await setDoc(userDoc(uid), {
    name: String(name || '').trim().slice(0, 120),
    email: String(email || '').trim().slice(0, 320),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function saveBookmarks(uid, names) {
  validUid(uid);
  await setDoc(userDoc(uid), {
    bookmarks: [...new Set(names.map((name) => String(name).slice(0, 160)))].slice(0, 500),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// Legacy AsyncStorage was not scoped by account. Import only when cloud data
// has not yet been populated, then remove each local key after its cloud write.
export async function migrateLocalData(uid) {
  validUid(uid);
  const [draftRaw, name, email, bookmarkRaw] = await AsyncStorage.multiGet([
    'publi.drafts', 'publi.profile.name', 'publi.profile.email', 'publi.bookmarks',
  ]).then((pairs) => pairs.map(([, value]) => value));
  if (draftRaw) {
    const legacy = JSON.parse(draftRaw);
    if (Array.isArray(legacy)) for (const item of legacy) {
      if (typeof item?.body === 'string' && item.body.trim()) {
        const id = String(item.id || doc(draftsCollection(uid)).id);
        if (!id.includes('/')) {
          const existing = await getDoc(doc(db(), 'users', uid, 'drafts', id));
          if (!existing.exists()) await saveDraft(uid, { id, title: item.title, body: item.body });
        }
      }
    }
    await AsyncStorage.removeItem('publi.drafts');
  }
  if (name || email || bookmarkRaw) {
    const existing = await getDoc(userDoc(uid));
    const bookmarks = bookmarkRaw ? JSON.parse(bookmarkRaw) : [];
    const current = existing.exists() ? existing.data() : {};
    const updates = { updatedAt: serverTimestamp() };
    if (!current.name && name) updates.name = String(name).slice(0, 120);
    if (!current.email && email) updates.email = String(email).slice(0, 320);
    if (!current.bookmarks && Array.isArray(bookmarks)) updates.bookmarks = bookmarks.map((item) => String(item).slice(0, 160)).slice(0, 500);
    await setDoc(userDoc(uid), updates, { merge: true });
    await AsyncStorage.multiRemove(['publi.profile.name', 'publi.profile.email', 'publi.bookmarks']);
  }
}

export async function deleteCloudAccountData(uid) {
  validUid(uid);
  const askThreads = await getDocs(askThreadsCollection(uid));
  for (const thread of askThreads.docs) {
    const turns = await getDocs(askTurnsCollection(uid, thread.id));
    for (const turn of turns.docs) {
      for (const path of [turn.data().imagePath, turn.data().audioPath].filter(Boolean)) {
        try { await deleteObject(ref(bucket(), path)); }
        catch (error) { if (error?.code !== 'storage/object-not-found') throw error; }
      }
      await deleteDoc(turn.ref);
    }
    await deleteDoc(thread.ref);
  }
  const recordings = await getDocs(recordingsCollection(uid));
  for (const item of recordings.docs) {
    const path = item.data().storagePath;
    if (path) {
      try { await deleteObject(ref(bucket(), path)); }
      catch (error) { if (error?.code !== 'storage/object-not-found') throw error; }
    }
    await deleteDoc(item.ref);
  }
  const drafts = await getDocs(draftsCollection(uid));
  for (const item of drafts.docs) await deleteDoc(item.ref);
  const voiceStories = await getDocs(voiceStoriesCollection(uid));
  for (const item of voiceStories.docs) await deleteDoc(item.ref);
  await deleteDoc(userDoc(uid));
  await waitForPendingWrites(db());
}
