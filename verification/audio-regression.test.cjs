const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {transformSync} = require('@babel/core');
function load(file, mocks, globals={}) {
  const module={exports:{}};
  const code=transformSync(fs.readFileSync(file,'utf8'),{configFile:false,babelrc:false,plugins:['@babel/plugin-transform-modules-commonjs']}).code;
  vm.runInNewContext(code,{module,exports:module.exports,require:name=>{if(!mocks[name.replace(/\.js$/, '').replace('/index', '')]) throw Error(name);return mocks[name.replace(/\.js$/, '').replace('/index', '')];},setTimeout,clearTimeout,...globals});
  return module.exports;
}
test('saved audio waits for native readiness, unmutes, and reports decoder errors',async()=>{
  const api=load('audioPlayback.js',{'react-native':{NativeModules:{}},'expo-audio':{setAudioModeAsync:async()=>{}}});
  let listener,removed=false,playing=false;
  const player={addListener:(_e,fn)=>{listener=fn;return{remove:()=>removed=true};},pause:()=>{},replace:()=>{},isLoaded:true};
  let ready=false;
  const pending=api.replaceAudioAndWait(player,'file:///recording.m4a').then(()=>ready=true);
  await Promise.resolve();
  assert.equal(ready,false,'stale loaded state from previous audio must not start this file');
  assert.equal(player.muted,false);assert.equal(player.volume,1);
  listener({isLoaded:true});await pending;assert.equal(removed,true);
  const failed=api.replaceAudioAndWait(player,'file:///bad.m4a');
  listener({error:'Incomplete audio'});await assert.rejects(failed,/Incomplete audio/);
});
test('playback explicitly restores speaker-compatible playback mode',async()=>{
  let mode,native=false;
  const api=load('audioPlayback.js',{'react-native':{NativeModules:{LivePCMPlayer:{preparePlaybackSession:async()=>native=true}}},'expo-audio':{setAudioModeAsync:async value=>mode=value}});
  await api.prepareAudioPlayback();
  assert.equal(mode.allowsRecording,false);assert.equal(mode.playsInSilentMode,true);assert.equal(mode.shouldRouteThroughEarpiece,false);assert.equal(native,true);
});
test('Firebase Live decodes binary server audio without React Native Blob.text',async()=>{
  let socket;
  class Socket {
    static OPEN=1;
    constructor(){socket=this;this.events={};this.readyState=1;}
    addEventListener(name,fn){(this.events[name]??=[]).push(fn);}
    removeEventListener(name,fn){this.events[name]=(this.events[name]||[]).filter(v=>v!==fn);}
    dispatch(name,event){for(const fn of [...(this.events[name]||[])])fn(event);}
    close(){this.dispatch('close',{code:1000});}
  }
  class RNBlob {} // intentionally no text() method
  class AIError extends Error {constructor(code,message){super(message);this.code=code;}}
  const api=load('node_modules/@react-native-firebase/ai/dist/module/websocket.js',{'./errors':{AIError},'./logger':{logger:{warn:()=>{}}},'./types':{AIErrorCode:{}}},{WebSocket:Socket,Blob:RNBlob,ArrayBuffer,TextDecoder});
  const handler=new api.WebSocketHandlerImpl();const connected=handler.connect('wss://example.test');
  assert.equal(socket.binaryType,'arraybuffer');socket.dispatch('open',{});await connected;
  const iterator=handler.listen();const next=iterator.next();
  const bytes=new TextEncoder().encode(JSON.stringify({serverContent:{modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm',data:'AA=='}}]}}}));
  socket.dispatch('message',{data:bytes.buffer});
  const event=await next;
  assert.equal(event.value.serverContent.modelTurn.parts[0].inlineData.data,'AA==');
  socket.dispatch('close',{code:1006,reason:'network lost'});
  await assert.rejects(iterator.next(),/network lost/);
});

test('chat history deletion removes owned attachments and turns before the thread',async()=>{
  const removed=[];
  const firestore={getFirestore:()=>({}),collection:(_db,...parts)=>parts.join('/'),doc:(_db,...parts)=>parts.join('/'),
    getDocs:async()=>({docs:[{id:'turn',ref:'users/test/askThreads/thread/turns/turn',data:()=>({audioPath:'users/test/askAudio/thread/turn.m4a',imagePath:'users/test/askImages/thread/turn.jpg'})}]}),deleteDoc:async ref=>removed.push(ref)};
  const api=load('cloudData.js',{'@react-native-async-storage/async-storage':{},'expo-file-system':{},'@react-native-firebase/firestore':firestore,
    '@react-native-firebase/storage':{getStorage:()=>({}),ref:(_bucket,path)=>path,deleteObject:async path=>removed.push(path)}});
  await api.deleteAskThread('test','thread');
  assert.deepEqual(removed,['users/test/askAudio/thread/turn.m4a','users/test/askImages/thread/turn.jpg','users/test/askThreads/thread/turns/turn','users/test/askThreads/thread']);
});
test('failed attachment deletion keeps chat reachable for a retry',async()=>{
  const removed=[];
  const api=load('cloudData.js',{'@react-native-async-storage/async-storage':{},'expo-file-system':{},'@react-native-firebase/firestore':{
    getFirestore:()=>({}),collection:()=>({}),getDocs:async()=>({docs:[{ref:'turn',data:()=>({audioPath:'users/test/askAudio/thread/turn.m4a'})}]}),deleteDoc:async ref=>removed.push(ref)},
    '@react-native-firebase/storage':{getStorage:()=>({}),ref:()=>({}),deleteObject:async()=>{throw Error('Offline');}}});
  await assert.rejects(api.deleteAskThread('test','thread'),/Offline/);assert.equal(removed.length,0);
});
