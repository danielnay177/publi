import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyA1ZoA_os6Nxq0iNVI8JBgxfHM_GGefBQI',
  authDomain: 'publi-fa006.firebaseapp.com',
  projectId: 'publi-fa006',
  storageBucket: 'publi-fa006.firebasestorage.app',
  messagingSenderId: '951832801508',
  appId: '1:951832801508:web:eedd122366220256ee7cf1',
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = (() => {
  try {
    return initializeAuth(firebaseApp, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    return getAuth(firebaseApp);
  }
})();
