import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  getDocs,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Firestore with offline persistence, multi-tab safe.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export {
  collection,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  getDocs,
  serverTimestamp,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
};
