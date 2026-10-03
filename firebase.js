import { getApp } from '@react-native-firebase/app';
import { getAuth } from '@react-native-firebase/auth';
import { initializeAppCheck } from '@react-native-firebase/app-check';
import { getAI, GoogleAIBackend } from '@react-native-firebase/ai';

// The native Firebase app is configured by GoogleService-Info.plist / google-services.json.
export const firebaseApp = getApp();
export const auth = getAuth(firebaseApp);

let servicesPromise;

// Call before any Firestore, Storage, or AI request. A shared promise also prevents
// multiple App Check provider initializations during concurrent screen effects.
export function initializeFirebaseServices() {
  if (!servicesPromise) {
    servicesPromise = (async () => {
      const isDevelopment = typeof __DEV__ !== 'undefined' && __DEV__;
      const debugToken = isDevelopment
        ? process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN
        : undefined;
      const appCheck = await initializeAppCheck(firebaseApp, {
        provider: {
          providerOptions: {
            apple: {
              provider: isDevelopment ? 'debug' : 'appAttestWithDeviceCheckFallback',
              ...(debugToken ? { debugToken } : {}),
            },
            android: {
              provider: isDevelopment ? 'debug' : 'playIntegrity',
              ...(debugToken ? { debugToken } : {}),
            },
          },
        },
        isTokenAutoRefreshEnabled: true,
      });
      const ai = getAI(firebaseApp, {
        backend: new GoogleAIBackend(),
        appCheck,
        auth,
      });
      return { appCheck, ai };
    })().catch((error) => {
      servicesPromise = undefined;
      throw error;
    });
  }
  return servicesPromise;
}
