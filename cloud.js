/* ==========================================================
   cloud.js - Firebase: accounts, email verification, cloud tournaments, analytics.
   Loaded as a module; exposes window.Cloud for the other scripts.
   ========================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, sendPasswordResetEmail, sendEmailVerification } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, writeBatch, serverTimestamp, collection, query, where, getDocs,
  runTransaction, deleteDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(window.FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

/* ---------- Usage analytics (optional, fails quietly if blocked) ---------- */
let analytics = null, logEventFn = null;
if (window.FIREBASE_CONFIG.measurementId) {
  import("https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js").then(async m => {
    if (await m.isSupported()) { analytics = m.getAnalytics(app); logEventFn = m.logEvent; }
  }).catch(() => {});
}
const track = (name, params) => { try { if (analytics) logEventFn(analytics, name, params || {}); } catch (e) {} };

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
  'app/username-taken': 'That username is already taken. Choose another one.',
  'app/not-signed-in': 'Please log in first.',
  'app/conflict': 'This tournament was changed on another device.',
  'app/code-failed': 'Could not make a share code. Please try again.',
  'app/bad-code': 'That code does not look right. Codes have 6 letters and numbers.',
  'permission-denied': 'Access was refused. Make sure you are logged in with a verified email.',
  'unavailable': 'No internet connection. Try again when you are online.'
};
const friendly = e => MSG[e && e.code] || 'Something went wrong. Please try again.';
const coded = code => Object.assign(new Error(code), { code });
function validUsername(name) {
  const lower = String(name || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(lower)) throw coded('app/username-invalid');
  return lower;
}
const verifyUrl = () => location.origin + location.pathname;

/* ---------- Pending username (chosen at sign-up, claimed once the email is verified) ---------- */
const readPending = uid => { try { const p = JSON.parse(localStorage.getItem('arena.pending')); return p && p.uid === uid ? p : null; } catch (e) { return null; } };
const clearPending = () => { try { localStorage.removeItem('arena.pending'); } catch (e) {} };

/* ---------- Who is signed in? ---------- */
const listeners = []; let last = { user: null, profile: null, ready: false }, note = '';

async function loadProfile(uid) {
  const key = 'arena.profile.' + uid;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) { try { localStorage.setItem(key, JSON.stringify(snap.data())); } catch (e) {} return snap.data(); }
    return null;
  } catch (e) {                                       // offline: use the saved copy
    try { return JSON.parse(localStorage.getItem(key)); } catch (e2) { return null; }
  }
}
async function claim(user, username, avatar) {
  const lower = validUsername(username), nameRef = doc(db, 'usernames', lower);
  if ((await getDoc(nameRef)).exists()) throw coded('app/username-taken');
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', user.uid), { username: username.trim(), usernameLower: lower, avatar: avatar || '⚽', createdAt: serverTimestamp() });
  batch.set(nameRef, { uid: user.uid });
  try { await batch.commit(); } catch (e) { throw coded(e.code === 'permission-denied' ? 'app/username-taken' : e.code); }
}
async function publish(user) {
  const verified = !!(user && user.emailVerified);
  let profile = null; note = '';
  if (verified) {
    profile = await loadProfile(user.uid);
    if (!profile) {
      const p = readPending(user.uid);
      if (p) {
        try { await claim(user, p.username, p.avatar); profile = await loadProfile(user.uid); }
        catch (e) { note = friendly(e); }
        clearPending();
      }
    }
  }
  last = { user: user ? { uid: user.uid, email: user.email, verified } : null, profile, ready: true };
  listeners.forEach(f => f(last));
}
onAuthStateChanged(auth, user => publish(user));

/* ---------- Account actions ---------- */
async function signUp(email, password, username, avatar) {
  const lower = validUsername(username);
  if ((await getDoc(doc(db, 'usernames', lower))).exists()) throw coded('app/username-taken');
  const cred = await createUserWithEmailAndPassword(auth, String(email).trim(), password);
  try { localStorage.setItem('arena.pending', JSON.stringify({ uid: cred.user.uid, username: username.trim(), avatar })); } catch (e) {}
  try { await sendEmailVerification(cred.user, { url: verifyUrl() }); } catch (e) {}
  track('sign_up', { method: 'email' });
}
async function logIn(email, password) { await signInWithEmailAndPassword(auth, String(email).trim(), password); track('login', { method: 'email' }); }
async function checkVerified() {
  const u = auth.currentUser; if (!u) return false;
  await u.reload();
  if (u.emailVerified) { await u.getIdToken(true); await publish(u); }
  return u.emailVerified;
}
async function resendVerification() {
  if (!auth.currentUser) throw coded('app/not-signed-in');
  await sendEmailVerification(auth.currentUser, { url: verifyUrl() });
}
async function claimProfile(username, avatar) {
  if (!auth.currentUser) throw coded('app/not-signed-in');
  await claim(auth.currentUser, username, avatar); await publish(auth.currentUser);
}

/* ---------- Tournaments in the cloud. The document id IS the share code. ---------- */
const tref = code => doc(db, 'tournaments', code);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O/1/I to avoid mix-ups
function makeCode() { const a = new Uint32Array(6); crypto.getRandomValues(a); return Array.from(a, x => CODE_CHARS[x % 32]).join(''); }
async function newCode() {
  for (let i = 0; i < 8; i++) { const c = makeCode(); if (!(await getDoc(tref(c))).exists()) return c; }
  throw coded('app/code-failed');
}
function pack(t, rev) {
  return { ownerId: auth.currentUser.uid, ownerName: (last.profile && last.profile.username) || '', name: String(t.name).slice(0, 60),
    game: String(t.game).slice(0, 40), sport: t.sport, format: t.format, status: t.status || 'running', championName: t.championName || null,
    createdAt: t.createdAt || Date.now(), updatedAt: serverTimestamp(), rev, data: JSON.stringify(t) };
}
// Saves only if nobody else changed it since we loaded it (rev must match), otherwise throws app/conflict.
async function saveTournament(t) {
  const ref = tref(t.id);
  const rev = await runTransaction(db, async tx => {
    const snap = await tx.get(ref), cur = snap.exists() ? snap.data().rev : 0;
    if (cur !== (t.rev || 0)) throw coded('app/conflict');
    tx.set(ref, pack(t, cur + 1));
    return cur + 1;
  });
  t.rev = rev;
}
const parseT = d => { const x = d.data(), t = JSON.parse(x.data); t.id = d.id; t.rev = x.rev; t.ownerId = x.ownerId; return t; };
async function loadMine() {
  const snap = await getDocs(query(collection(db, 'tournaments'), where('ownerId', '==', auth.currentUser.uid)));
  return snap.docs.map(parseT);
}
const deleteTournament = id => deleteDoc(tref(id));

/* ---------- Spectating: live view-only access by share code, and the Following list ---------- */
const normCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const validCode = c => /^[A-HJ-NP-Z2-9]{6}$/.test(c);
// Calls onData(tournament, meta) now and again every time the host saves. onData(null) = no such tournament.
function watchTournament(code, onData, onError) {
  return onSnapshot(tref(code), snap => {
    if (!snap.exists()) return onData(null);
    try { const x = snap.data(); onData(parseT(snap), { ownerName: x.ownerName, status: x.status, championName: x.championName }); }
    catch (e) { onError(e); }
  }, onError);
}
async function peekTournament(code) {
  const s = await getDoc(tref(code));
  if (!s.exists()) return null;
  const x = s.data();
  return { name: x.name, game: x.game, ownerName: x.ownerName, status: x.status, championName: x.championName };
}
const fcol = () => collection(db, 'users', auth.currentUser.uid, 'following');
async function follow(code, info) {
  if (!auth.currentUser) throw coded('app/not-signed-in');
  await setDoc(doc(fcol(), code), { code, name: String(info.name).slice(0, 60), game: String(info.game).slice(0, 40),
    ownerName: String(info.ownerName || '').slice(0, 20), followedAt: Date.now() });
  track('follow_tournament');
}
const unfollow = code => deleteDoc(doc(fcol(), code));
async function loadFollowing() {
  if (!auth.currentUser) throw coded('app/not-signed-in');
  const snap = await getDocs(fcol());
  return snap.docs.map(d => d.data()).sort((a, b) => b.followedAt - a.followedAt);
}

window.Cloud = {
  onAuth(f) { listeners.push(f); if (last.ready) f(last); },
  signUp, logIn, claimProfile, checkVerified, resendVerification, friendly, validUsername, track,
  newCode, saveTournament, loadMine, deleteTournament,
  normCode, validCode, watchTournament, peekTournament, follow, unfollow, loadFollowing,
  note: () => note,
  logOut: () => signOut(auth),
  resetPassword: email => sendPasswordResetEmail(auth, String(email).trim(), { url: verifyUrl() })
};
window.dispatchEvent(new Event('cloud-ready'));
