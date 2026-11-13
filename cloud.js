/* ==========================================================
   cloud.js - Firebase connection: accounts + profiles.
   Loaded as a module; exposes window.Cloud for the other scripts.
   ========================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, sendPasswordResetEmail, deleteUser } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(window.FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

const MSG = {
  'auth/email-already-in-use': 'That email already has an account. Try logging in.',
  'auth/invalid-email': 'That email address does not look right.',
  'auth/weak-password': 'Choose a stronger password (at least 6 characters).',
  'auth/invalid-credential': 'Email or password is wrong.',
  'auth/wrong-password': 'Email or password is wrong.',
  'auth/user-not-found': 'Email or password is wrong.',
  'auth/too-many-requests': 'Too many tries. Wait a few minutes and try again.',
  'auth/network-request-failed': 'No internet connection. Try again when you are online.',
  'app/username-invalid': 'Username must be 3 to 20 letters, numbers or underscores.',
  'app/username-taken': 'That username is already taken. Try another one.',
  'app/not-signed-in': 'Please log in first.'
};
const friendly = e => MSG[e && e.code] || 'Something went wrong. Please try again.';
const coded = code => Object.assign(new Error(code), { code });

function validUsername(name) {
  const lower = String(name || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(lower)) throw coded('app/username-invalid');
  return lower;
}

/* ---------- Who is signed in? ---------- */
const listeners = []; let last = { user: null, profile: null, ready: false }, signingUp = false;

async function loadProfile(uid) {
  const key = 'arena.profile.' + uid;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) { try { localStorage.setItem(key, JSON.stringify(snap.data())); } catch (e) {} return snap.data(); }
    return null;
  } catch (e) {                                      // offline: use the saved copy
    try { return JSON.parse(localStorage.getItem(key)); } catch (e2) { return null; }
  }
}
async function publish(user) {
  const profile = user ? await loadProfile(user.uid) : null;
  last = { user: user ? { uid: user.uid, email: user.email } : null, profile, ready: true };
  listeners.forEach(f => f(last));
}
onAuthStateChanged(auth, user => { if (!signingUp) publish(user); });

/* ---------- Profile + username claim (both saved together or not at all) ---------- */
async function claim(user, username, avatar) {
  const lower = validUsername(username), nameRef = doc(db, 'usernames', lower);
  if ((await getDoc(nameRef)).exists()) throw coded('app/username-taken');
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', user.uid), { username: username.trim(), usernameLower: lower, avatar: avatar || '⚽', createdAt: serverTimestamp() });
  batch.set(nameRef, { uid: user.uid });
  try { await batch.commit(); } catch (e) { throw coded(e.code === 'permission-denied' ? 'app/username-taken' : e.code); }
}

async function signUp(email, password, username, avatar) {
  const lower = validUsername(username);
  if ((await getDoc(doc(db, 'usernames', lower))).exists()) throw coded('app/username-taken');
  signingUp = true;
  let cred;
  try { cred = await createUserWithEmailAndPassword(auth, String(email).trim(), password); }
  catch (e) { signingUp = false; throw e; }
  try { await claim(cred.user, username, avatar); }
  catch (e) { try { await deleteUser(cred.user); } catch (x) {} signingUp = false; await publish(null); throw e; }
  signingUp = false; await publish(cred.user);
}
async function claimProfile(username, avatar) {
  if (!auth.currentUser) throw coded('app/not-signed-in');
  await claim(auth.currentUser, username, avatar); await publish(auth.currentUser);
}

window.Cloud = {
  onAuth(f) { listeners.push(f); if (last.ready) f(last); },
  signUp, claimProfile, friendly, validUsername,
  logIn: (email, password) => signInWithEmailAndPassword(auth, String(email).trim(), password),
  logOut: () => signOut(auth),
  resetPassword: email => sendPasswordResetEmail(auth, String(email).trim())
};
window.dispatchEvent(new Event('cloud-ready'));
