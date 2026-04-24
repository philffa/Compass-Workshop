// js/firebase.js — data layer
// Firebase is initialised in boot.js — this module reads from window globals.

export function currentUser() { return window.__firebaseAuth?.currentUser ?? null; }

export async function signInAnon() {
  const { signInAnonymously } = await import('firebase/auth');
  return signInAnonymously(window.__firebaseAuth);
}

export async function signInGoogle() {
  const { GoogleAuthProvider, signInWithPopup, linkWithPopup } = await import('firebase/auth');
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
  import('firebase/auth').then(({ onAuthStateChanged }) => onAuthStateChanged(auth, cb));
  return () => {};
}

function db() { return window.__firebaseDb; }
function FM() { return window.__firestoreModule; }
function uid() { return currentUser()?.uid; }

function ref(...segs) {
  const { doc, collection } = FM();
  const full = ['users', uid(), ...segs];
  return full.length % 2 === 0 ? doc(db(), ...full) : collection(db(), ...full);
}

function genId() {
  return Math.random().toString(36).slice(2,11) + Date.now().toString(36);
}

// ── Week utilities ─────────────────────────────────────────────────────────
export function weekId(date = new Date()) {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() - ((d.getDay()+6)%7));
  return d.toISOString().split('T')[0];
}
export function nextWeekId(wid) { const d=new Date(wid); d.setDate(d.getDate()+7); return weekId(d); }
export function prevWeekId(wid) { const d=new Date(wid); d.setDate(d.getDate()-7); return weekId(d); }
export function formatWeekLabel(wid) {
  const d=new Date(wid), end=new Date(d);
  end.setDate(d.getDate()+4);
  const o={day:'numeric',month:'short'};
  return `${d.toLocaleDateString('en-AU',o)} – ${end.toLocaleDateString('en-AU',o)}`;
}
export function weekDates(weekStart) {
  const base=new Date(weekStart);
  return ['Mon','Tue','Wed','Thu','Fri'].map((label,i)=>{
    const d=new Date(base); d.setDate(base.getDate()+i);
    return {label, date:d.toISOString().split('T')[0]};
  });
}

// ── Projects ───────────────────────────────────────────────────────────────
export async function createProject({name,description,template,icon,templateData}) {
  const {setDoc,serverTimestamp}=FM(); const id=genId();
  await setDoc(ref('projects',id),{id,name,description,template,icon,
    templateData:templateData??{},status:'active',
    createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  return id;
}
export async function getProjects() {
  const {getDocs,query,orderBy}=FM();
  const snap=await getDocs(query(ref('projects'),orderBy('createdAt','desc')));
  return snap.docs.map(d=>d.data());
}
export function onProjects(cb) {
  const {onSnapshot,query,orderBy}=FM();
  return onSnapshot(query(ref('projects'),orderBy('createdAt','desc')),
    snap=>cb(snap.docs.map(d=>d.data())));
}
export async function getProject(pid) {
  const {getDoc}=FM();
  const snap=await getDoc(ref('projects',pid));
  return snap.exists()?snap.data():null;
}
export async function updateProject(pid,data) {
  const {updateDoc,serverTimestamp}=FM();
  await updateDoc(ref('projects',pid),{...data,updatedAt:serverTimestamp()});
}
export async function deleteProject(pid) {
  const {getDocs,writeBatch}=FM();
  const snap=await getDocs(ref('projects',pid,'tasks'));
  const batch=writeBatch(db());
  snap.docs.forEach(d=>batch.delete(d.ref));
  batch.delete(ref('projects',pid));
  await batch.commit();
}

// ── Tasks ──────────────────────────────────────────────────────────────────
export async function createTask(pid,{text,quadrant=null,tags=[]}) {
  const {setDoc,getDocs,serverTimestamp}=FM();
  const snap=await getDocs(ref('projects',pid,'tasks'));
  const maxOrder=snap.docs.reduce((m,d)=>Math.max(m,d.data().sortOrder??0),0);
  const id=genId();
  await setDoc(ref('projects',pid,'tasks',id),{
    id,projectId:pid,text,quadrant,tags,status:'active',
    sortOrder:maxOrder+1000,weekSlot:null,
    createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  return id;
}
export function onTasks(pid,cb) {
  const {onSnapshot,query,orderBy}=FM();
  return onSnapshot(query(ref('projects',pid,'tasks'),orderBy('sortOrder')),
    snap=>cb(snap.docs.map(d=>d.data())));
}
export async function updateTask(pid,tid,data) {
  const {updateDoc,serverTimestamp}=FM();
  await updateDoc(ref('projects',pid,'tasks',tid),{...data,updatedAt:serverTimestamp()});
}
export async function deleteTask(pid,tid) {
  const {deleteDoc}=FM(); await deleteDoc(ref('projects',pid,'tasks',tid));
}
export async function reorderTasks(pid,orderedIds) {
  const {writeBatch}=FM(); const batch=writeBatch(db());
  orderedIds.forEach((id,i)=>batch.update(ref('projects',pid,'tasks',id),{sortOrder:(i+1)*1000}));
  await batch.commit();
}

// ── Fixed blocks ───────────────────────────────────────────────────────────
export async function getFixedBlocks(pid) {
  const {getDoc}=FM();
  const snap=await getDoc(ref('projects',pid,'meta','fixedBlocks'));
  return snap.exists()?snap.data().blocks??{}:{};
}
export async function saveFixedBlocks(pid,blocks) {
  const {setDoc}=FM();
  await setDoc(ref('projects',pid,'meta','fixedBlocks'),{blocks});
}

// ── Weekly plan ────────────────────────────────────────────────────────────
export async function getWeekPlan(pid,wid) {
  const {getDoc}=FM();
  const snap=await getDoc(ref('projects',pid,'plans',wid));
  return snap.exists()?snap.data():{weekId:wid,slots:{},notes:''};
}
export async function saveWeekPlan(pid,wid,data) {
  const {setDoc,serverTimestamp}=FM();
  await setDoc(ref('projects',pid,'plans',wid),{...data,weekId:wid,updatedAt:serverTimestamp()});
}
export async function assignTaskToSlot(pid,tid,wid,day,slot) {
  await updateTask(pid,tid,{weekSlot:{weekId:wid,day,slot}});
}
export async function removeTaskFromSlot(pid,tid) {
  await updateTask(pid,tid,{weekSlot:null});
}

// ── Weekly review ──────────────────────────────────────────────────────────
export async function getReview(pid,wid) {
  const {getDoc}=FM();
  const snap=await getDoc(ref('projects',pid,'reviews',wid));
  return snap.exists()?snap.data():null;
}
export async function saveReview(pid,wid,{reflection,carriedTaskIds}) {
  const {setDoc,serverTimestamp}=FM();
  await setDoc(ref('projects',pid,'reviews',wid),{
    weekId:wid,reflection,carriedTaskIds,createdAt:serverTimestamp()});
  for (const tid of carriedTaskIds) await updateTask(pid,tid,{weekSlot:null});
}
export async function rollWeekForward(pid,currentWid) {
  const {getDocs}=FM();
  const snap=await getDocs(ref('projects',pid,'tasks'));
  const completed=[],incomplete=[];
  snap.docs.forEach(d=>{
    const t=d.data();
    if (t.weekSlot?.weekId===currentWid)
      (t.status==='complete'?completed:incomplete).push(t);
  });
  return {completed,incomplete};
}
