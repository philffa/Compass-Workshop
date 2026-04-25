// js/firebase.js — data layer (v2 — shared projects, trash, team codes)

export function currentUser() {
  return window.__firebaseAuth?.currentUser ?? null;
}

async function _authMod() {
  return import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
}

export async function signInAnon() {
  const mod = await _authMod();
  return mod.signInAnonymously(window.__firebaseAuth);
}

export async function signInGoogle() {
  const { GoogleAuthProvider, signInWithPopup, linkWithPopup } = await _authMod();
  const provider = new GoogleAuthProvider();
  const auth = window.__firebaseAuth;
  if (auth.currentUser?.isAnonymous) {
    try { return await linkWithPopup(auth.currentUser, provider); }
    catch(e) { if (e.code !== 'auth/credential-already-in-use') throw e; }
  }
  return signInWithPopup(auth, provider);
}

export function onAuth(cb) {
  const auth = window.__firebaseAuth;
  if (!auth) { cb(null); return () => {}; }
  cb(auth.currentUser);
  _authMod().then(({ onAuthStateChanged }) => onAuthStateChanged(auth, cb));
  return () => {};
}

// ── Firestore refs ─────────────────────────────────────────────────────────
function db()  { return window.__firebaseDb; }
function FM()  { return window.__firestoreModule; }
function uid() { return currentUser()?.uid; }

// Personal project ref (under user's own space)
function userRef(...segs) {
  const { doc, collection } = FM();
  const full = ['users', uid(), ...segs];
  return full.length % 2 === 0 ? doc(db(), ...full) : collection(db(), ...full);
}

// Shared project ref (at Firestore root — accessible by all members)
function sharedRef(...segs) {
  const { doc, collection } = FM();
  return segs.length % 2 === 0 ? doc(db(), ...segs) : collection(db(), ...segs);
}

// Resolve the right ref depending on whether project is shared
function projectDataRef(pid, shared, ...segs) {
  if (shared) return sharedRef('projects', pid, ...segs);
  return userRef('projects', pid, ...segs);
}

function genId() {
  return Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}

function gen6() {
  // 6 digit alphanumeric code, uppercase, no ambiguous chars
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ── Week utilities ─────────────────────────────────────────────────────────
export function weekId(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().split('T')[0];
}
export function nextWeekId(wid) {
  const d = new Date(wid); d.setDate(d.getDate() + 7); return weekId(d);
}
export function prevWeekId(wid) {
  const d = new Date(wid); d.setDate(d.getDate() - 7); return weekId(d);
}
export function formatWeekLabel(wid) {
  const d = new Date(wid), end = new Date(d);
  end.setDate(d.getDate() + 4);
  const o = { day: 'numeric', month: 'short' };
  return `${d.toLocaleDateString('en-AU', o)} – ${end.toLocaleDateString('en-AU', o)}`;
}
export function weekDates(weekStart, includeWeekend = false) {
  const base = new Date(weekStart);
  const days = includeWeekend
    ? ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
    : ['Mon','Tue','Wed','Thu','Fri'];
  return days.map((label, i) => {
    const d = new Date(base); d.setDate(base.getDate() + i);
    return { label, date: d.toISOString().split('T')[0] };
  });
}
export function todayDayLabel(includeWeekend = false) {
  const days = includeWeekend
    ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    : ['Mon','Tue','Wed','Thu','Fri'];
  const jsDay = new Date().getDay(); // 0=Sun
  const label = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][jsDay];
  return days.includes(label) ? label : 'Mon';
}

// ── Personal projects ──────────────────────────────────────────────────────
export async function createProject({ name, description, template, icon, templateData }) {
  const { setDoc, serverTimestamp } = FM();
  const id = genId();
  await setDoc(userRef('projects', id), {
    id, name, description, template, icon,
    templateData: templateData ?? {},
    shared: false,
    status: 'active',
    showWeekend: false,
    plannerView: 'slots', // 'slots' | 'hourly'
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

export function onProjects(cb) {
  const { onSnapshot, query, orderBy, collection, getDocs } = FM();
  // Listen to personal projects
  const unsub1 = onSnapshot(
    query(userRef('projects'), orderBy('createdAt', 'desc')),
    async () => {
      const personal = await getDocs(query(userRef('projects'), orderBy('createdAt', 'desc')));
      const personalList = personal.docs.map(d => ({ ...d.data(), _personal: true }));

      // Also get shared projects this user is a member of
      const memberships = await getDocs(userRef('memberships'));
      const sharedList = [];
      for (const m of memberships.docs) {
        const { projectId } = m.data();
        try {
          const snap = await getDocs(query(
            sharedRef('projects', projectId, 'tasks'),
          ));
          const pSnap = await FM().getDoc(sharedRef('projects', projectId));
          if (pSnap.exists()) sharedList.push({ ...pSnap.data(), _personal: false });
        } catch(e) { /* member of deleted project */ }
      }
      cb([...personalList, ...sharedList]);
    }
  );
  return unsub1;
}

export async function getProject(pid) {
  const { getDoc } = FM();
  // Try personal first
  let snap = await getDoc(userRef('projects', pid));
  if (snap.exists()) return { ...snap.data(), _personal: true };
  // Try shared
  snap = await getDoc(sharedRef('projects', pid));
  if (snap.exists()) return { ...snap.data(), _personal: false };
  return null;
}

export async function updateProject(pid, data) {
  const { updateDoc, serverTimestamp, getDoc } = FM();
  const snap = await getDoc(userRef('projects', pid));
  if (snap.exists()) {
    await updateDoc(userRef('projects', pid), { ...data, updatedAt: serverTimestamp() });
  } else {
    await updateDoc(sharedRef('projects', pid), { ...data, updatedAt: serverTimestamp() });
  }
}

export async function deleteProject(pid) {
  // For personal: delete the doc (tasks stay — lazy cleanup)
  // For shared: just remove membership, keep project alive for other members
  const { getDoc, deleteDoc, updateDoc, arrayRemove, serverTimestamp } = FM();
  const personalSnap = await getDoc(userRef('projects', pid));
  if (personalSnap.exists()) {
    await deleteDoc(userRef('projects', pid));
  } else {
    // Remove this user's membership
    await deleteDoc(userRef('memberships', pid));
  }
}

// ── Shared projects ────────────────────────────────────────────────────────

export async function createSharedProject({ name, description, template, icon, templateData }) {
  const { setDoc, serverTimestamp } = FM();
  const id = genId();
  const ownerId = uid();
  await setDoc(sharedRef('projects', id), {
    id, name, description, template, icon,
    templateData: templateData ?? {},
    shared: true,
    ownerId,
    members: [ownerId],
    roles: { [ownerId]: 'owner' },
    status: 'active',
    showWeekend: false,
    plannerView: 'slots',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  // Add to owner's memberships
  await setDoc(userRef('memberships', id), { projectId: id, role: 'owner', joinedAt: serverTimestamp() });
  return id;
}

export async function generateInviteCode(pid) {
  const { setDoc, serverTimestamp } = FM();
  const code = gen6();
  // Store code at root — single use, expires when used
  await setDoc(sharedRef('inviteCodes', code), {
    projectId: pid,
    createdBy: uid(),
    createdAt: serverTimestamp(),
    used: false,
  });
  // Also store on project for reference
  await FM().updateDoc(sharedRef('projects', pid), { inviteCode: code });
  return code;
}

export async function joinProjectByCode(code) {
  const { getDoc, updateDoc, setDoc, serverTimestamp, arrayUnion } = FM();
  const codeSnap = await getDoc(sharedRef('inviteCodes', code.toUpperCase()));
  if (!codeSnap.exists()) throw new Error('Code not found — check and try again');
  if (codeSnap.data().used) throw new Error('This code has already been used');

  const { projectId } = codeSnap.data();
  const projectSnap = await getDoc(sharedRef('projects', projectId));
  if (!projectSnap.exists()) throw new Error('Project no longer exists');

  const userId = uid();
  // Mark code as used
  await updateDoc(sharedRef('inviteCodes', code.toUpperCase()), { used: true, usedBy: userId, usedAt: serverTimestamp() });
  // Add user to project members
  await updateDoc(sharedRef('projects', projectId), {
    members: arrayUnion(userId),
    [`roles.${userId}`]: 'member',
  });
  // Add to user's memberships
  await setDoc(userRef('memberships', projectId), { projectId, role: 'member', joinedAt: serverTimestamp() });
  return projectId;
}

// ── Tasks (work for both personal and shared projects) ────────────────────

function taskRef(pid, shared, tid) {
  return projectDataRef(pid, shared, 'tasks', tid);
}
function tasksColRef(pid, shared) {
  return projectDataRef(pid, shared, 'tasks');
}

export async function createTask(pid, { text, quadrant = null, tags = [], shared = false }) {
  const { setDoc, getDocs, serverTimestamp } = FM();
  const snap = await getDocs(tasksColRef(pid, shared));
  const maxOrder = snap.docs.reduce((m, d) => Math.max(m, d.data().sortOrder ?? 0), 0);
  const id = genId();
  await setDoc(taskRef(pid, shared, id), {
    id, projectId: pid, text, quadrant, tags,
    status: 'active',
    sortOrder: maxOrder + 1000,
    weekSlots: [], // array — supports multiple slot assignments
    deletedAt: null,
    createdBy: uid(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

export function onTasks(pid, shared, cb) {
  // Handle old 2-arg call signature: onTasks(pid, cb)
  if (typeof shared === 'function') { cb = shared; shared = false; }
  const { onSnapshot, query, orderBy } = FM();
  return onSnapshot(
    query(tasksColRef(pid, shared), orderBy('sortOrder')),
    snap => cb(snap.docs.map(d => d.data()))
  );
}

export async function updateTask(pid, tid, data, shared = false) {
  const { updateDoc, serverTimestamp } = FM();
  await updateDoc(taskRef(pid, shared, tid), { ...data, updatedAt: serverTimestamp() });
}

export async function softDeleteTask(pid, tid, shared = false) {
  await updateTask(pid, tid, { status: 'deleted', deletedAt: new Date().toISOString() }, shared);
}

export async function restoreTask(pid, tid, shared = false) {
  await updateTask(pid, tid, { status: 'active', deletedAt: null }, shared);
}

export async function duplicateTask(pid, tid, shared = false) {
  const { getDoc, setDoc, getDocs, serverTimestamp } = FM();
  const snap = await getDoc(taskRef(pid, shared, tid));
  if (!snap.exists()) return;
  const original = snap.data();
  const allSnap = await getDocs(tasksColRef(pid, shared));
  const maxOrder = allSnap.docs.reduce((m, d) => Math.max(m, d.data().sortOrder ?? 0), 0);
  const newId = genId();
  await setDoc(taskRef(pid, shared, newId), {
    ...original,
    id: newId,
    sortOrder: maxOrder + 1000,
    weekSlots: [], // duplicate starts unassigned
    status: 'active',
    deletedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return newId;
}

export async function reorderTasks(pid, orderedIds, shared = false) {
  const { writeBatch } = FM();
  const batch = writeBatch(db());
  orderedIds.forEach((id, i) =>
    batch.update(taskRef(pid, shared, id), { sortOrder: (i + 1) * 1000 })
  );
  await batch.commit();
}

// Task slot assignment — supports multiple slots per task
export async function addTaskToSlot(pid, tid, wid, day, slot, shared = false) {
  const { updateDoc, arrayUnion, serverTimestamp } = FM();
  await updateDoc(taskRef(pid, shared, tid), {
    weekSlots: arrayUnion({ weekId: wid, day, slot }),
    updatedAt: serverTimestamp(),
  });
}

export async function removeTaskFromSlot(pid, tid, wid, day, slot, shared = false) {
  const { getDoc, updateDoc, serverTimestamp } = FM();
  const snap = await getDoc(taskRef(pid, shared, tid));
  if (!snap.exists()) return;
  const slots = (snap.data().weekSlots ?? []).filter(
    s => !(s.weekId === wid && s.day === day && s.slot === slot)
  );
  await updateDoc(taskRef(pid, shared, tid), { weekSlots: slots, updatedAt: serverTimestamp() });
}

// Lazy trash cleanup — called when project opens
export async function purgeOldDeletedTasks(pid, shared = false) {
  const { getDocs, writeBatch } = FM();
  const snap = await getDocs(tasksColRef(pid, shared));
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 6);
  const batch = writeBatch(db());
  let count = 0;
  snap.docs.forEach(d => {
    const t = d.data();
    if (t.status === 'deleted' && t.deletedAt && new Date(t.deletedAt) < cutoff) {
      batch.delete(d.ref);
      count++;
    }
  });
  if (count > 0) await batch.commit();
}

// ── Fixed blocks ───────────────────────────────────────────────────────────
export async function getFixedBlocks(pid, shared = false) {
  const { getDoc } = FM();
  const snap = await getDoc(projectDataRef(pid, shared, 'meta', 'fixedBlocks'));
  return snap.exists() ? snap.data().blocks ?? {} : {};
}
export async function saveFixedBlocks(pid, blocks, shared = false) {
  const { setDoc } = FM();
  await setDoc(projectDataRef(pid, shared, 'meta', 'fixedBlocks'), { blocks });
}

// ── Weekly plan ────────────────────────────────────────────────────────────
export async function getWeekPlan(pid, wid, shared = false) {
  const { getDoc } = FM();
  const snap = await getDoc(projectDataRef(pid, shared, 'plans', wid));
  return snap.exists() ? snap.data() : { weekId: wid, slots: {}, notes: '' };
}
export async function saveWeekPlan(pid, wid, data, shared = false) {
  const { setDoc, serverTimestamp } = FM();
  await setDoc(projectDataRef(pid, shared, 'plans', wid), {
    ...data, weekId: wid, updatedAt: serverTimestamp()
  });
}

// ── Weekly review ──────────────────────────────────────────────────────────
export async function getReview(pid, wid, shared = false) {
  const { getDoc } = FM();
  const snap = await getDoc(projectDataRef(pid, shared, 'reviews', wid));
  return snap.exists() ? snap.data() : null;
}
export async function saveReview(pid, wid, { reflection, carriedTaskIds }, shared = false) {
  const { setDoc, serverTimestamp } = FM();
  await setDoc(projectDataRef(pid, shared, 'reviews', wid), {
    weekId: wid, reflection, carriedTaskIds, createdAt: serverTimestamp()
  });
  for (const tid of carriedTaskIds) {
    await updateTask(pid, tid, { weekSlots: [] }, shared);
  }
}
export async function rollWeekForward(pid, currentWid, shared = false) {
  const { getDocs } = FM();
  const snap = await getDocs(tasksColRef(pid, shared));
  const completed = [], incomplete = [];
  snap.docs.forEach(d => {
    const t = d.data();
    const slots = t.weekSlots ?? (t.weekSlot ? [t.weekSlot] : []);
    if (slots.some(s => s.weekId === currentWid) && t.status !== 'deleted')
      (t.status === 'complete' ? completed : incomplete).push(t);
  });
  return { completed, incomplete };
}

// ── Pending review check ───────────────────────────────────────────────────
export async function getPendingReviews(pid, shared = false) {
  const prevWid = prevWeekId(weekId());
  const review = await getReview(pid, prevWid, shared);
  if (review) return null; // already reviewed
  // Check if there were any tasks assigned last week
  const { getDocs } = FM();
  const snap = await getDocs(tasksColRef(pid, shared));
  const hadTasks = snap.docs.some(d => {
    const t = d.data();
    const slots = t.weekSlots ?? (t.weekSlot ? [t.weekSlot] : []);
    return slots.some(s => s.weekId === prevWid) && t.status !== 'deleted';
  });
  return hadTasks ? prevWid : null;
}
