#import <AVFoundation/AVFoundation.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <TargetConditionals.h>

// A small, interruptible PCM queue for Gemini Live's 24 kHz mono output.
@interface LivePCMPlayer : RCTEventEmitter <RCTBridgeModule>
@property(nonatomic, strong) AVAudioEngine *engine;
@property(nonatomic, strong) AVAudioPlayerNode *player;
@property(nonatomic, strong) AVAudioFormat *format;
@property(nonatomic, assign) NSUInteger queuedFrames;
@property(nonatomic, assign) NSUInteger generation;
@property(atomic, assign) BOOL captureActive;
@property(atomic, assign) BOOL hasListeners;
@end

@implementation LivePCMPlayer
RCT_EXPORT_MODULE();

- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }
- (NSArray<NSString *> *)supportedEvents { return @[@"LiveMicPCM"]; }
- (void)startObserving { self.hasListeners = YES; }
- (void)stopObserving { self.hasListeners = NO; }

- (void)preparePlayer {
  if (self.engine) return;
  AVAudioSession *session = [AVAudioSession sharedInstance];
  [session setCategory:AVAudioSessionCategoryPlayAndRecord
                 mode:AVAudioSessionModeVoiceChat
              options:AVAudioSessionCategoryOptionDefaultToSpeaker | AVAudioSessionCategoryOptionAllowBluetooth
                error:nil];
  [session setPreferredIOBufferDuration:0.01 error:nil];
  [session setActive:YES error:nil];
  self.engine = [AVAudioEngine new];
  // A single voice-processing engine lets iOS subtract our playback from the
  // microphone signal before Gemini's turn detection sees it.
  NSError *voiceError = nil;
  if (![self.engine.inputNode setVoiceProcessingEnabled:YES error:&voiceError])
    NSLog(@"LivePCMPlayer voice processing unavailable: %@", voiceError);
  if (self.engine.inputNode.isVoiceProcessingEnabled) self.engine.inputNode.voiceProcessingInputMuted = NO;
  self.player = [AVAudioPlayerNode new];
  self.format = [[AVAudioFormat alloc] initWithCommonFormat:AVAudioPCMFormatFloat32
                                                sampleRate:24000 channels:1 interleaved:NO];
  [self.engine attachNode:self.player];
  [self.engine connect:self.player to:self.engine.mainMixerNode format:self.format];
  NSError *error = nil;
  [self.engine startAndReturnError:&error];
  if (error) NSLog(@"LivePCMPlayer start failed: %@", error);
  [self.player play];
}

RCT_EXPORT_METHOD(startCapture:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  [self preparePlayer];
  if (!self.engine.isRunning) {
    reject(@"audio_engine", @"Could not start live audio capture.", nil);
    return;
  }
  if (!self.captureActive) {
    AVAudioInputNode *input = self.engine.inputNode;
    AVAudioFormat *sourceFormat = [input outputFormatForBus:0];
    if (!sourceFormat.channelCount || sourceFormat.sampleRate <= 0) {
      reject(@"microphone_route", @"The microphone audio route is unavailable. Disconnect Bluetooth and reconnect.", nil);
      return;
    }
    AVAudioFrameCount bufferSize = (AVAudioFrameCount)MAX(1024, sourceFormat.sampleRate / 10);
    __weak typeof(self) weakSelf = self;
    [input installTapOnBus:0 bufferSize:bufferSize format:sourceFormat
                    block:^(AVAudioPCMBuffer *buffer, AVAudioTime *when) {
      __strong typeof(weakSelf) strongSelf = weakSelf;
      if (!strongSelf || !strongSelf.captureActive || !strongSelf.hasListeners) return;
      NSUInteger inputFrames = buffer.frameLength;
      double step = sourceFormat.sampleRate / 16000.0;
      if (!inputFrames || step <= 0) return;
      NSUInteger outputFrames = (NSUInteger)floor(inputFrames / step);
      if (!outputFrames) return;
      NSMutableData *pcm = [NSMutableData dataWithLength:outputFrames * sizeof(int16_t)];
      int16_t *target = (int16_t *)pcm.mutableBytes;
      float *floats = buffer.floatChannelData ? buffer.floatChannelData[0] : NULL;
      int16_t *integers = buffer.int16ChannelData ? buffer.int16ChannelData[0] : NULL;
      if (!floats && !integers) return;
      NSUInteger stride = sourceFormat.isInterleaved ? sourceFormat.channelCount : 1;
      for (NSUInteger i = 0; i < outputFrames; i++) {
        double position = i * step;
        NSUInteger index = (NSUInteger)position;
        NSUInteger next = MIN(index + 1, inputFrames - 1);
        double blend = position - index;
        float a = floats ? floats[index * stride] : integers[index * stride] / 32768.0f;
        float b = floats ? floats[next * stride] : integers[next * stride] / 32768.0f;
        float value = fmaxf(-1.0f, fminf(1.0f, a + (b - a) * blend));
        target[i] = (int16_t)lrintf(value * 32767.0f);
      }
      NSString *encoded = [pcm base64EncodedStringWithOptions:0];
      dispatch_async(dispatch_get_main_queue(), ^{
        if (strongSelf.captureActive && strongSelf.hasListeners)
          [strongSelf sendEventWithName:@"LiveMicPCM" body:@{ @"data": encoded }];
      });
    }];
    self.captureActive = YES;
  }
#if TARGET_OS_SIMULATOR
  BOOL simulator = YES;
#else
  BOOL simulator = NO;
#endif
  resolve(@{ @"simulator": @(simulator), @"voiceProcessing": @(self.engine.inputNode.isVoiceProcessingEnabled) });
}

RCT_EXPORT_METHOD(stopCapture) {
  if (!self.captureActive) return;
  self.captureActive = NO;
  [self.engine.inputNode removeTapOnBus:0];
}

RCT_EXPORT_METHOD(enqueue:(NSString *)base64) {
  NSData *data = [[NSData alloc] initWithBase64EncodedString:base64 options:0];
  NSUInteger frames = data.length / sizeof(int16_t);
  if (!frames || frames > 24000 * 5) return;
  [self preparePlayer];
  if (!self.engine.isRunning) {
    NSError *error = nil;
    [self.engine startAndReturnError:&error];
    if (error) return;
  }
  // Keep every chunk in order. Interruption calls clear(), which discards the
  // queue immediately; dropping queued chunks here cuts words from replies.
  AVAudioPCMBuffer *buffer = [[AVAudioPCMBuffer alloc] initWithPCMFormat:self.format
                                                            frameCapacity:(AVAudioFrameCount)frames];
  buffer.frameLength = (AVAudioFrameCount)frames;
  const int16_t *source = (const int16_t *)data.bytes;
  float *destination = buffer.floatChannelData[0];
  for (NSUInteger i = 0; i < frames; i++) destination[i] = source[i] / 32768.0f;
  self.queuedFrames += frames;
  NSUInteger generation = self.generation;
  [self.player scheduleBuffer:buffer completionHandler:^{
    dispatch_async(dispatch_get_main_queue(), ^{
      if (generation == self.generation) self.queuedFrames = self.queuedFrames > frames ? self.queuedFrames - frames : 0;
    });
  }];
  if (!self.player.isPlaying) [self.player play];
}

RCT_EXPORT_METHOD(clear) {
  self.generation++;
  self.queuedFrames = 0;
  [self.player stop];
  [self.player play];
}

RCT_EXPORT_METHOD(shutdown) {
  if (self.captureActive) {
    self.captureActive = NO;
    [self.engine.inputNode removeTapOnBus:0];
  }
  self.generation++;
  self.queuedFrames = 0;
  [self.player stop];
  [self.engine stop];
  self.player = nil;
  self.engine = nil;
  [[AVAudioSession sharedInstance] setActive:NO withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation error:nil];
}

RCT_EXPORT_METHOD(preparePlaybackSession:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  NSError *error = nil;
  AVAudioSession *session = AVAudioSession.sharedInstance;
  if (![session setCategory:AVAudioSessionCategoryPlayback mode:AVAudioSessionModeDefault options:0 error:&error] ||
      ![session setActive:YES error:&error]) {
    reject(@"playback_session", @"Could not activate audio playback.", error);
    return;
  }
  resolve(@YES);
}

// Export bounded, overlapping clips from the original. Each transcription
// request sees the whole clip; the original saved audio is never rewritten.
RCT_EXPORT_METHOD(exportAudioSegments:(NSString *)uri resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  AVURLAsset *asset = [AVURLAsset URLAssetWithURL:[NSURL URLWithString:uri] options:nil];
  double duration = CMTimeGetSeconds(asset.duration);
  if (!isfinite(duration) || duration <= 0 || ![asset tracksWithMediaType:AVMediaTypeAudio].count) {
    reject(@"invalid_audio", @"This recording has no readable audio track.", nil);
    return;
  }
  if (duration <= 90) {
    resolve(@[@{ @"uri": uri, @"temporary": @NO, @"duration": @(duration) }]);
    return;
  }
  NSMutableArray *clips = [NSMutableArray new];
  __block double start = 0;
  __block void (^exportNext)(void);
  exportNext = ^{
    double length = MIN(90, duration - start);
    NSURL *output = [NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:
      [NSString stringWithFormat:@"publi-transcribe-%@.m4a", NSUUID.UUID.UUIDString]]];
    AVAssetExportSession *exporter = [[AVAssetExportSession alloc] initWithAsset:asset presetName:AVAssetExportPresetAppleM4A];
    exporter.outputURL = output;
    exporter.outputFileType = AVFileTypeAppleM4A;
    exporter.timeRange = CMTimeRangeMake(CMTimeMakeWithSeconds(start, 600), CMTimeMakeWithSeconds(length, 600));
    if (!exporter) {
      for (NSDictionary *clip in clips) [NSFileManager.defaultManager removeItemAtURL:[NSURL URLWithString:clip[@"uri"]] error:nil];
      exportNext = nil;
      reject(@"audio_export", @"Could not prepare the complete recording for transcription.", nil);
      return;
    }
    [exporter exportAsynchronouslyWithCompletionHandler:^{ dispatch_async(dispatch_get_main_queue(), ^{
      if (exporter.status != AVAssetExportSessionStatusCompleted) {
        [NSFileManager.defaultManager removeItemAtURL:output error:nil];
        for (NSDictionary *clip in clips) [NSFileManager.defaultManager removeItemAtURL:[NSURL URLWithString:clip[@"uri"]] error:nil];
        exportNext = nil;
        reject(@"audio_export", @"Could not prepare the complete recording for transcription.", exporter.error);
        return;
      }
      [clips addObject:@{ @"uri": output.absoluteString, @"temporary": @YES, @"duration": @(length) }];
      if (start + length >= duration) { exportNext = nil; resolve(clips); }
      else { start += 88; exportNext(); }
    }); }];
  };
  exportNext();
}
@end
