// js/firebase.js — Firebase setup + all data operations

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, signInAnonymously, signInWithPopup, GoogleAuthProvider, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, doc, collection, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp, writeBatch }
  from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

<script type="module">
  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries

  // Your web app's Firebase configuration
  const firebaseConfig = {
    apiKey: "AIzaSyDbL5hPbfsR_8xXI9Tu84ulBMVGujfM_1s",
    authDomain: "compass-workshop-7a0e1.firebaseapp.com",
    projectId: "compass-workshop-7a0e1",
    storageBucket: "compass-workshop-7a0e1.firebasestorage.app",
    messagingSenderId: "382072424967",
    appId: "1:382072424967:web:8d0b0159f1f7b3ba0e78a2"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
</script>

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// ── Auth ───────────────────────────────────────────────────────────────────

export async function signInAnon() {
  const cred = await signInAnonymously(auth);
  return cred.user;
}

export async function signInGoogle() {
  const cred = await signInWithPopup(auth, googleProvider);
  return cred.user;
}

export function onAuth(cb) {
  return onAuthStateChanged(auth, cb);
}

export function currentUser() {
  return auth.currentUser;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function uid() { return currentUser()?.uid; }
function userRef() { return doc(db, 'users', uid()); }
function projectsRef() { return collection(db, 'users', uid(), 'projects'); }
function projectRef(pid) { return doc(db, 'users', uid(), 'projects', pid); }
function tasksRef(pid) { return collection(db, 'users', uid(), 'projects', pid, 'tasks'); }
function taskRef(pid, tid) { return doc(db, 'users', uid(), 'projects', pid, 'tasks', tid); }
function plansRef(pid) { return collection(db, 'users', uid(), 'projects', pid, 'plans'); }
function planRef(pid, weekId) { return doc(db, 'users', uid(), 'projects', pid, 'plans', weekId); }
function reviewsRef(pid) { return collection(db, 'users', uid(), 'projects', pid, 'reviews'); }
function reviewRef(pid, weekId) { return doc(db, 'users', uid(), 'projects', pid, 'reviews', weekId); }
function fixedBlocksRef(pid) { return doc(db, 'users', uid(), 'projects', pid, 'meta', 'fixedBlocks'); }

export function weekId(date = new Date()) {
  // Monday-anchored ISO week string: "2025-W22"
  const d = new Date(date);
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
  const iso = d.toISOString().split('T')[0];
  return iso;
}

export function weekDates(weekStart) {
  const base = new Date(weekStart);
  const days = ['Mon','Tue','Wed','Thu','Fri'];
  return days.map((label, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return { label, date: d.toISOString().split('T')[0] };
  });
}

export function nextWeekId(wid) {
  const d = new Date(wid);
  d.setDate(d.getDate() + 7);
  return weekId(d);
}

export function prevWeekId(wid) {
  const d = new Date(wid);
  d.setDate(d.getDate() - 7);
  return weekId(d);
}

export function formatWeekLabel(wid) {
  const d = new Date(wid);
  const end = new Date(d); end.setDate(d.getDate() + 4);
  const opts = { day: 'numeric', month: 'short' };
  return `${d.toLocaleDateString('en-AU', opts)} – ${end.toLocaleDateString('en-AU', opts)}`;
}

function genId() {
  return Math.random().toString(36).slice(2,11) + Date.now().toString(36);
}

// ── Projects ───────────────────────────────────────────────────────────────

export async function createProject({ name, description, template, icon }) {
  const id = genId();
  const data = {
    id, name, description, template, icon,
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(projectRef(id), data);
  return id;
}

export async function getProjects() {
  const snap = await getDocs(query(projectsRef(), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => d.data());
}

export function onProjects(cb) {
  return onSnapshot(query(projectsRef(), orderBy('createdAt', 'desc')), snap => {
    cb(snap.docs.map(d => d.data()));
  });
}

export async function getProject(pid) {
  const snap = await getDoc(projectRef(pid));
  return snap.exists() ? snap.data() : null;
}

export async function updateProject(pid, data) {
  await updateDoc(projectRef(pid), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteProject(pid) {
  // Delete tasks first
  const taskSnap = await getDocs(tasksRef(pid));
  const batch = writeBatch(db);
  taskSnap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(projectRef(pid));
  await batch.commit();
}

// ── Tasks ──────────────────────────────────────────────────────────────────
// Task shape:
// { id, projectId, text, quadrant ('do'|'plan'|'delegate'|'drop'|null),
//   status ('active'|'complete'|'archived'), sortOrder, tags[],
//   weekSlot: { weekId, day, slot } | null, createdAt, updatedAt }

export async function createTask(pid, { text, quadrant = null, tags = [] }) {
  const id = genId();
  const existing = await getDocs(tasksRef(pid));
  const maxOrder = existing.docs.reduce((m, d) => Math.max(m, d.data().sortOrder ?? 0), 0);
  const data = {
    id, projectId: pid, text, quadrant, tags,
    status: 'active',
    sortOrder: maxOrder + 1000,
    weekSlot: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(taskRef(pid, id), data);
  return id;
}

export function onTasks(pid, cb) {
  return onSnapshot(query(tasksRef(pid), orderBy('sortOrder')), snap => {
    cb(snap.docs.map(d => d.data()));
  });
}

export async function updateTask(pid, tid, data) {
  await updateDoc(taskRef(pid, tid), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteTask(pid, tid) {
  await deleteDoc(taskRef(pid, tid));
}

export async function reorderTasks(pid, orderedIds) {
  const batch = writeBatch(db);
  orderedIds.forEach((id, i) => {
    batch.update(taskRef(pid, id), { sortOrder: (i + 1) * 1000 });
  });
  await batch.commit();
}

// ── Fixed blocks (resource audit) ─────────────────────────────────────────
// Structure: { blocks: { 'Mon-morning': 'Basketball', 'Wed-lunch': 'Drama', ... } }

export async function getFixedBlocks(pid) {
  const snap = await getDoc(fixedBlocksRef(pid));
  return snap.exists() ? snap.data().blocks ?? {} : {};
}

export async function saveFixedBlocks(pid, blocks) {
  await setDoc(fixedBlocksRef(pid), { blocks });
}

// ── Weekly plan ────────────────────────────────────────────────────────────
// Plan shape: { weekId, slots: { 'Mon-morning': [taskId,...], ... }, notes, createdAt }

export async function getWeekPlan(pid, wid) {
  const snap = await getDoc(planRef(pid, wid));
  return snap.exists() ? snap.data() : { weekId: wid, slots: {}, notes: '' };
}

export async function saveWeekPlan(pid, wid, data) {
  await setDoc(planRef(pid, wid), { ...data, weekId: wid, updatedAt: serverTimestamp() });
}

export async function assignTaskToSlot(pid, tid, wid, day, slot) {
  await updateTask(pid, tid, { weekSlot: { weekId: wid, day, slot } });
}

export async function removeTaskFromSlot(pid, tid) {
  await updateTask(pid, tid, { weekSlot: null });
}

// ── Weekly review ──────────────────────────────────────────────────────────

export async function getReview(pid, wid) {
  const snap = await getDoc(reviewRef(pid, wid));
  return snap.exists() ? snap.data() : null;
}

export async function saveReview(pid, wid, { reflection, carriedTaskIds }) {
  await setDoc(reviewRef(pid, wid), {
    weekId: wid, reflection, carriedTaskIds,
    createdAt: serverTimestamp()
  });
  // Re-activate carried tasks for next week planning
  for (const tid of carriedTaskIds) {
    await updateTask(pid, tid, { weekSlot: null });
  }
}

export async function rollWeekForward(pid, currentWid) {
  const plan = await getWeekPlan(pid, currentWid);
  const tasks = await getDocs(tasksRef(pid));
  const taskMap = {};
  tasks.docs.forEach(d => { taskMap[d.id] = d.data(); });

  const completed = [];
  const incomplete = [];

  // Find all tasks assigned to this week
  tasks.docs.forEach(d => {
    const t = d.data();
    if (t.weekSlot?.weekId === currentWid) {
      if (t.status === 'complete') completed.push(t);
      else incomplete.push(t);
    }
  });

  return { completed, incomplete };
}
