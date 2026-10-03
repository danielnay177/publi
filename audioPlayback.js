import { NativeModules } from 'react-native';
import { setAudioModeAsync } from 'expo-audio';

// Recording and Live share iOS's audio session. Restore a playback category
// before replay so the receiver/voice-processing route cannot swallow it.
export async function prepareAudioPlayback() {
  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false,
    shouldRouteThroughEarpiece: false, interruptionMode: 'doNotMix' });
  await NativeModules.LivePCMPlayer?.preparePlaybackSession?.();
}

export function replaceAudioAndWait(player, uri) {
  return new Promise((resolve, reject) => {
    let subscription;
    let timer;
    const finish = (error) => {
      clearTimeout(timer);
      subscription?.remove();
      error ? reject(error) : resolve();
    };
    subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (status.error) finish(new Error(status.error));
      else if (status.isLoaded) finish();
    });
    timer = setTimeout(() => finish(new Error('The audio could not load. Please try again.')), 15000);
    try {
      player.pause();
      player.muted = false;
      player.volume = 1;
      player.replace({ uri });
    } catch (error) { finish(error); }
  });
}
