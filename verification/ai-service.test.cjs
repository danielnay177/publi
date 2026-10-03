const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const { transformSync } = require('@babel/core');

// Exercise the real service with controlled files and backend responses.
// These checks do not replace Firebase or signed-device integration testing.
function service(reply, files = {}, segments) {
  const calls = [];
  const schema = new Proxy({}, { get: () => (value) => value });
  const mocks = {
    'react-native': { NativeModules: { LivePCMPlayer: segments ? { exportAudioSegments: async () => segments } : {} } },
    'expo-file-system': { File: class {
      constructor(uri) { Object.assign(this, files[uri] || { exists: false, size: 0 }); }
      async base64() { return 'dGVzdA=='; }
      delete() { this.exists = false; }
    } },
    '@react-native-firebase/ai': {
      Schema: schema,
      getGenerativeModel: (_ai, config) => ({ generateContent: async (parts) => {
        calls.push({ config, parts });
        const response = Array.isArray(reply) ? reply[calls.length - 1] : reply;
        if (response instanceof Error) throw response;
        return { response: { candidates: [{finishReason: response?.finishReason || 'STOP'}], text: () => typeof response === 'string' ? response : JSON.stringify(response) } };
      } }),
    },
    './firebase': { initializeFirebaseServices: async () => ({ ai: {} }) },
  };
  const module = { exports: {} };
  const code = transformSync(fs.readFileSync(require.resolve('../aiService.js'), 'utf8'), {
    configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  vm.runInNewContext(code, { module, exports: module.exports, require: (name) => {
    if (!mocks[name]) throw new Error(`Unexpected dependency: ${name}`);
    return mocks[name];
  } });
  return { api: module.exports, calls };
}

test('recording keeps transcript, edited text, three follow-ups and title', async () => {
  const { api, calls } = service({ transcript: ' I moved here. ', polishedText: ' I moved here. ',
    followUpQuestions: [' Why? ', 'When?', 'How?'], suggestedTitle: ' A new home ' },
  { audio: { exists: true, size: 1000 } });
  const result = await api.analyzeRecording({ uri: 'audio' });
  assert.equal(result.transcript, 'I moved here.');
  assert.equal(result.polishedText, 'I moved here.');
  assert.equal(result.followUpQuestions.length, 3);
  assert.equal(result.suggestedTitle, 'A new home');
  assert.equal(calls[0].parts[1].inlineData.mimeType, 'audio/mp4');
});

test('silent audio and incomplete follow-up responses are rejected', async () => {
  const files = { audio: { exists: true, size: 1000 } };
  await assert.rejects(service({ transcript: '', polishedText: 'invented' }, files).api
    .analyzeRecording({ uri: 'audio' }), /enough speech/);
  await assert.rejects(service({ transcript: 'speech', polishedText: 'speech', followUpQuestions: ['one'] }, files).api
    .analyzeRecording({ uri: 'audio' }), /incomplete questions/);
});

test('outline requires a title and exactly ten useful points', async () => {
  const { api } = service({ points: Array.from({ length: 10 }, (_, i) => `Idea ${i + 1}`) });
  assert.equal((await api.generateStoryOutline('Learning a language')).length, 10);
  await assert.rejects(api.generateStoryOutline(' '), /working title/);
  await assert.rejects(service({ points: ['one'] }).api.generateStoryOutline('Title'), /incomplete outline/);
});

test('text chat succeeds and includes previous context', async () => {
  const { api, calls } = service({ transcript: '', answer: ' Try a concrete memory. ', suggestedTitle: 'Essay ideas' });
  assert.equal((await api.askPubli({ prompt: 'What next?', history: [{ prompt: 'Language', answer: 'Start with a scene' }] })).answer,
    'Try a concrete memory.');
  assert.match(calls[0].parts[0], /Start with a scene/);
});

test('audio questions require a faithful transcript', async () => {
  const { api } = service({ answer: 'An answer', transcript: '' }, { audio: { exists: true, size: 1000 } });
  await assert.rejects(api.askPubli({ audioUri: 'audio' }), /could not hear/);
});

test('missing, oversized and unsupported media never reaches the model', async () => {
  const { api, calls } = service({}, { huge: { exists: true, size: 15 * 1024 * 1024 },
    photo: { exists: true, size: 1000 } });
  await assert.rejects(api.analyzeRecording({ uri: 'missing' }), /unavailable/);
  await assert.rejects(api.analyzeRecording({ uri: 'huge' }), /too long/);
  await assert.rejects(api.askPubli({ prompt: 'Photo', imageUri: 'photo', imageMimeType: 'image/heic' }), /JPEG/);
  assert.equal(calls.length, 0);
});

test('combined photo and audio stay within the inline request budget', async () => {
  const { api, calls } = service({}, { photo: { exists: true, size: 8 * 1024 * 1024 },
    audio: { exists: true, size: 8 * 1024 * 1024 } });
  await assert.rejects(api.askPubli({ audioUri: 'audio', imageUri: 'photo', imageMimeType: 'image/jpeg' }), /too large together/);
  assert.equal(calls.length, 0);
});

test('malformed responses and backend outages surface retryable errors', async () => {
  await assert.rejects(service('not JSON').api.askPubli({ prompt: 'Question' }), /unreadable response/);
  await assert.rejects(service({ answer: '' }).api.askPubli({ prompt: 'Question' }), /did not return an answer/);
  await assert.rejects(service(new Error('Backend unavailable')).api.askPubli({ prompt: 'Question' }), /Backend unavailable/);
});


test('long recording transcribes every clip before editing and preserves its ending', async () => {
  const { api, calls } = service([
    { transcript: 'I moved here. I am trying to find opportunities' },
    { transcript: 'trying to find opportunities to go out. My last thought is hope.' },
    { polishedText: 'I moved here. I am trying to find opportunities to go out. My last thought is hope.', followUpQuestions: ['Why?', 'When?', 'How?'], suggestedTitle: 'Hope' },
  ], { first: { exists: true, size: 10 }, second: { exists: true, size: 10 }, original: {exists:true,size:20} },
  [{uri:'first', temporary:true}, {uri:'second', temporary:true}]);
  const result = await api.analyzeRecording({uri:'original'});
  assert.equal(result.transcript, 'I moved here. I am trying to find opportunities\n\nto go out. My last thought is hope.');
  assert.match(result.polishedText, /last thought is hope/);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].config.generationConfig.temperature, 0);
  assert.match(calls[2].parts, /My last thought is hope/);
  assert.equal(calls[2].config.generationConfig.responseSchema.properties.transcript, undefined);
});

test('token-limited model replies cannot be saved as complete transcripts', async () => {
  const {api} = service({ transcript:'Only the beginning', finishReason:'MAX_TOKENS' }, { audio:{exists:true,size:10} });
  await assert.rejects(api.analyzeRecording({uri:'audio'}), /stopped before finishing/);
});

test('clip joining retains unmatched accented wording and uncertainty', () => {
  const {api} = service({});
  assert.equal(api.joinTranscriptClips(['I said [unclear].', 'I try go outside.']), 'I said [unclear].\n\nI try go outside.');
});
