
import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Toaster, toast } from "sonner";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import {
  Bell, Calendar as CalendarIcon, CheckCircle2, Clock, LayoutDashboard, ListChecks,
  Moon, Plus, Repeat, Search, Sun, Trash2, X, ChevronLeft, ChevronRight, KanbanSquare, Mail
} from "lucide-react";

import { auth, db, signInAnon } from "./firebase";
import {
  onAuthStateChanged, GoogleAuthProvider, signInWithPopup, linkWithPopup, signOut as fbSignOut,
  EmailAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, linkWithCredential
} from "firebase/auth";
import {
  collection, doc, onSnapshot, setDoc, deleteDoc, getDocs, getDoc
} from "firebase/firestore";

const uid = () => Math.random().toString(36).slice(2, 9);
const todayISO = () => new Date().toISOString().slice(0, 10);
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const addDays   = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const nextWeekday = (d) => { const x = addDays(d, 1); while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() + 1); return x; };
const classNames = (...xs) => xs.filter(Boolean).join(" ");
const parseTimeToDate = (iso, hhmm) => {
  const [y, m, d] = iso.split("-").map(Number);
  let [h, min] = [9, 0];
  if (hhmm && hhmm.includes(":")) [h, min] = hhmm.split(":").map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0);
};
const formatDateShort = (dateish) => {
  const d = typeof dateish === "string" ? new Date(dateish) : dateish;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const SAMPLE_TASKS = [
  { id: uid(), title: "Morning stretch", notes: "5–10 minutes of mobility", status: "today", priority: "low", tags: ["wellness"], nextDue: todayISO(), time: "08:00", remindBefore: [10], repeat: "weekdays", repeatIntervalDays: 0, createdAt: new Date().toISOString(), lastCompletedAt: null, checklist: [ { id: uid(), text: "Neck rolls", done: false }, { id: uid(), text: "Hamstrings", done: false } ] },
  { id: uid(), title: "Inbox zero", notes: "Clear 10 emails", status: "today", priority: "medium", tags: ["work"], nextDue: todayISO(), time: "09:00", remindBefore: [5], repeat: "daily", repeatIntervalDays: 0, createdAt: new Date().toISOString(), lastCompletedAt: null, checklist: [] },
  { id: uid(), title: "Pay bills", notes: "Utilities + phone", status: "upcoming", priority: "high", tags: ["finance"], nextDue: todayISO(), time: "18:00", remindBefore: [60, 10], repeat: "monthly", repeatIntervalDays: 0, createdAt: new Date().toISOString(), lastCompletedAt: null, checklist: [] },
  { id: uid(), title: "Deep clean kitchen", notes: "Stove, sink, counters, floor", status: "backlog", priority: "medium", tags: ["home"], nextDue: todayISO(), time: "", remindBefore: [], repeat: "weekly", repeatIntervalDays: 0, createdAt: new Date().toISOString(), lastCompletedAt: null, checklist: [] },
];

export default function App() {
  // ---------- Auth ----------
  const [user, setUser] = useState(null);
  useEffect(() => {
    signInAnon().catch(console.error);
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  const tasksCol = user ? collection(db, "users", user.uid, "tasks") : null;
  const prefsDoc = user ? doc(db, "users", user.uid, "meta", "prefs") : null;

  // ---------- State ----------
  const [tasks, setTasks] = useState(SAMPLE_TASKS);
  const [prefs, setPrefs] = useState({ theme: "auto", view: "kanban", showCompleted: true, sound: true });

  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [authMode, setAuthMode] = useState("signin"); // 'signin' | 'signup' | 'reset'
  const [authEmail, setAuthEmail] = useState("");
  const [authPass, setAuthPass] = useState("");

  const timeoutsRef = useRef([]);
  const audioRef = useRef(null);
  const fileRef = useRef(null);

  // Theme
  useEffect(() => {
    const root = document.documentElement;
    const apply = (mode) => {
      const isDark = mode === "dark" || (mode === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.classList.toggle("dark", isDark);
    };
    apply(prefs.theme);
  }, [prefs.theme]);

  // ---------- Firestore: listeners & seed ----------
  useEffect(() => {
    if (!user || !tasksCol || !prefsDoc) return;

    getDocs(tasksCol).then((snap) => {
      if (snap.empty) {
        SAMPLE_TASKS.forEach((t) => setDoc(doc(tasksCol, t.id), t));
        setDoc(prefsDoc, prefs, { merge: true });
      }
    });

    const unsubTasks = onSnapshot(tasksCol, (snap) => {
      const arr = snap.docs.map((d) => d.data());
      arr.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      setTasks(arr);
    });
    const unsubPrefs = onSnapshot(prefsDoc, (docSnap) => {
      if (docSnap.exists()) setPrefs((p) => ({ ...p, ...docSnap.data() }));
    });
    return () => { unsubTasks(); unsubPrefs(); };
  }, [user]);

  useEffect(() => {
    if (!user || !prefsDoc) return;
    const t = setTimeout(() => setDoc(prefsDoc, prefs, { merge: true }), 300);
    return () => clearTimeout(t);
  }, [prefs, user]);

  // ---------- Reminders ----------
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
  }, []);

  useEffect(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    const now = Date.now();
    const MAX_DELAY = 2147483647;
    const scheduleAt = (whenMs, cb) => {
      const delay = whenMs - Date.now();
      if (delay <= 0) return cb();
      if (delay > MAX_DELAY) return;
      const t = setTimeout(cb, delay);
      timeoutsRef.current.push(t);
    };
    tasks.forEach((t) => {
      if (!t.nextDue) return;
      const baseDue = parseTimeToDate(t.nextDue, t.time || "09:00");
      if (baseDue.getTime() <= now && now - baseDue.getTime() < 30 * 60 * 1000) {
        inAppNotify(`${t.title} is due now`, t);
      }
      (t.remindBefore || []).forEach((mins) => {
        const remindAt = new Date(baseDue.getTime() - mins * 60 * 1000);
        if (remindAt.getTime() > now) scheduleAt(remindAt.getTime(), () => inAppNotify(`${t.title} due in ${mins} min`, t));
      });
      if (baseDue.getTime() > now) scheduleAt(baseDue.getTime(), () => inAppNotify(`${t.title} is due`, t));
    });
    return () => { timeoutsRef.current.forEach(clearTimeout); timeoutsRef.current = []; };
  }, [tasks, prefs.sound]);

  function inAppNotify(message, task) {
    if (prefs.sound && audioRef.current) { try { audioRef.current.currentTime = 0; audioRef.current.play(); } catch {} }
    toast(message, {
      description: task.time
        ? `${formatDateShort(parseTimeToDate(task.nextDue, task.time))} • ${task.time}`
        : formatDateShort(new Date(task.nextDue)),
      action: { label: "Snooze 10m", onClick: () => snoozeTask(task, 10) },
    });
    if ("Notification" in window && Notification.permission === "granted") {
      try { new Notification("Aurora Tasks", { body: message }); } catch {}
    }
  }
  function snoozeTask(task, minutes = 10) {
    toast.success(`Snoozed for ${minutes} min`);
    const t = setTimeout(() => inAppNotify(`${task.title} — snooze ended`, task), minutes * 60000);
    timeoutsRef.current.push(t);
  }

  // ---------- Filters ----------
  const allTags = useMemo(() => Array.from(new Set(tasks.flatMap((t) => t.tags || []))).sort(), [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const q = query.toLowerCase();
      const matchesQuery = !q || t.title.toLowerCase().includes(q) || (t.notes || "").toLowerCase().includes(q);
      const matchesTag = tagFilter === "all" || (t.tags || []).includes(tagFilter);
      const matchesPriority = priorityFilter === "all" || t.priority === priorityFilter;
      return matchesQuery && matchesTag && matchesPriority;
    });
  }, [tasks, query, tagFilter, priorityFilter]);

  const columns = useMemo(
    () => ({
      today: filteredTasks.filter((t) => t.status === "today"),
      upcoming: filteredTasks.filter((t) => t.status === "upcoming"),
      backlog: filteredTasks.filter((t) => t.status === "backlog"),
      done: filteredTasks.filter((t) => t.status === "done"),
    }),
    [filteredTasks]
  );

  // ---------- Writes ----------
  async function upsertTask(task) {
    if (user && tasksCol) {
      await setDoc(doc(tasksCol, task.id), task, { merge: true });
    } else {
      setTasks((prev) => (prev.some((p) => p.id === task.id) ? prev.map((p) => (p.id === task.id ? task : p)) : [task, ...prev]));
    }
  }
  async function deleteTask(id) {
    if (user && tasksCol) await deleteDoc(doc(tasksCol, id));
    else setTasks((prev) => prev.filter((t) => t.id !== id));
    toast("Task deleted");
  }
  async function completeTask(task) {
    if (task.repeat && task.repeat !== "none") {
      const next = computeNextDue(task);
      const advanced = { ...task, nextDue: next.toISOString().slice(0, 10), lastCompletedAt: new Date().toISOString(), status: "today" };
      await upsertTask(advanced);
      toast.success("Recurring task advanced");
    } else {
      await upsertTask({ ...task, status: "done", lastCompletedAt: new Date().toISOString() });
      toast.success("Nice! Completed");
    }
  }
  function computeNextDue(task) {
    const base = parseTimeToDate(task.nextDue || todayISO(), task.time || "09:00");
    switch (task.repeat) {
      case "daily": return addDays(base, 1);
      case "weekly": return addDays(base, 7);
      case "monthly": return addMonths(base, 1);
      case "weekdays": return nextWeekday(base);
      case "custom": return addDays(base, Number(task.repeatIntervalDays || 1));
      default: return base;
    }
  }

  function onDragEnd(result) {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    setTasks((prev) => {
      const i = prev.findIndex((t) => t.id === draggableId);
      if (i === -1) return prev;
      const moved = { ...prev[i], status: destination.droppableId };
      const rest = prev.filter((t) => t.id !== draggableId);
      let beforeIdx = rest.length, seen = 0;
      for (let j = 0; j < rest.length; j++) {
        if (rest[j].status === destination.droppableId) {
          if (seen === destination.index) { beforeIdx = j; break; }
          seen++;
        }
      }
      const out = [...rest.slice(0, beforeIdx), moved, ...rest.slice(beforeIdx)];
      upsertTask(moved);
      return out;
    });
  }

  // ---------- Export / Import JSON ----------
  function exportData() {
    const payload = { tasks, prefs, exportedAt: new Date().toISOString(), version: 1 };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aurora-tasks-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported backup");
  }
  function importData(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (Array.isArray(parsed.tasks)) {
          for (const t of parsed.tasks) await upsertTask(t);
        }
        if (parsed.prefs && typeof parsed.prefs === "object") {
          setPrefs((p) => ({ ...p, ...parsed.prefs }));
        }
        toast.success("Data imported");
      } catch {
        toast.error("Invalid file");
      }
    };
    reader.readAsText(file);
  }

  // ---------- Google Sign-in / Link / Sign-out ----------
  const provider = new GoogleAuthProvider();
  async function signInWithGoogle() {
    try {
      const current = auth.currentUser;
      if (current && current.isAnonymous) {
        try {
          await linkWithPopup(current, provider); // keep same UID
          toast.success("Account linked to Google");
        } catch (err) {
          if (err.code === "auth/credential-already-in-use" || err.code === "auth/email-already-in-use") {
            const oldUid = current.uid;
            const result = await signInWithPopup(auth, provider);
            const newUid = result.user.uid;
            await migrateUserData(oldUid, newUid);
            toast.success("Signed in with Google • data migrated");
          } else {
            console.error(err);
            toast.error("Google sign-in failed");
          }
        }
      } else {
        await signInWithPopup(auth, provider);
        toast.success("Signed in with Google");
      }
    } catch (e) {
      console.error(e);
      toast.error("Sign-in cancelled or failed");
    }
  }

  async function handleEmailSubmit(e) {
    e.preventDefault();
    const email = authEmail.trim();
    const password = authPass;
    if (!email || (!password && authMode !== "reset")) {
      return toast.error("Enter your email and password");
    }
    try {
      const current = auth.currentUser;
      if (authMode === "signup") {
        if (current && current.isAnonymous) {
          const cred = EmailAuthProvider.credential(email, password);
          await linkWithCredential(current, cred);
          toast.success("Account created & linked");
        } else {
          await createUserWithEmailAndPassword(auth, email, password);
          toast.success("Account created");
        }
      } else if (authMode === "signin") {
        if (current && current.isAnonymous) {
          try {
            const cred = EmailAuthProvider.credential(email, password);
            await linkWithCredential(current, cred);
            toast.success("Signed in (linked to existing session)");
          } catch (err) {
            if (err.code === "auth/credential-already-in-use" || err.code === "auth/email-already-in-use") {
              const oldUid = current.uid;
              const res = await signInWithEmailAndPassword(auth, email, password);
              const newUid = res.user.uid;
              await migrateUserData(oldUid, newUid);
              toast.success("Signed in • data migrated");
            } else {
              throw err;
            }
          }
        } else {
          await signInWithEmailAndPassword(auth, email, password);
          toast.success("Signed in");
        }
      } else if (authMode === "reset") {
        await sendPasswordResetEmail(auth, email);
        toast.success("Password reset email sent");
      }
      setShowEmailModal(false);
      setAuthPass("");
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Auth failed");
    }
  }

  async function migrateUserData(oldUid, newUid) {
    const oldTasksCol = collection(db, "users", oldUid, "tasks");
    const oldSnap = await getDocs(oldTasksCol);
    for (const d of oldSnap.docs) {
      const data = d.data();
      await setDoc(doc(db, "users", newUid, "tasks", d.id), data, { merge: true });
    }
    const oldPrefsRef = doc(db, "users", oldUid, "meta", "prefs");
    const newPrefsRef = doc(db, "users", newUid, "meta", "prefs");
    const oldPrefs = await getDoc(oldPrefsRef);
    if (oldPrefs.exists()) await setDoc(newPrefsRef, oldPrefs.data(), { merge: true });
  }

  async function signOut() {
    await fbSignOut(auth);
    await signInAnon().catch(() => {});
    toast("Signed out");
  }

  // ---------- Calendar ----------
  const [calMonth, setCalMonth] = useState(() => new Date());
  const monthStart = startOfMonth(calMonth);
  const startGrid = addDays(monthStart, -((monthStart.getDay() + 6) % 7));
  const daysArray = [...Array(42)].map((_, i) => addDays(startGrid, i));
  const tasksByDate = useMemo(() => {
    const map = {};
    filteredTasks.forEach((t) => { if (t.nextDue) (map[t.nextDue] ||= []).push(t); });
    return map;
  }, [filteredTasks]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-sky-900 text-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
      <AuroraBackground />
      <audio ref={audioRef} src="data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCA//////////////////////////////8AAABJTE5B" preload="auto" />
      <Toaster richColors position="top-right" />

      <header className="sticky top-0 z-40 backdrop-blur bg-black/10 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <KanbanSquare className="w-6 h-6 text-sky-300" />
          <h1 className="text-xl font-semibold tracking-tight">Aurora Tasks</h1>
          <span className="ml-1 text-xs text-sky-200/70">daily flow</span>

          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tasks…"
                className="pl-9 pr-3 py-2 rounded-xl bg-white/10 border border-white/10 placeholder:text-slate-400 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
              />
            </div>

            <button onClick={() => setPrefs((p) => ({ ...p, theme: p.theme === "dark" ? "light" : p.theme === "light" ? "auto" : "dark" }))}
                    className="p-2 rounded-xl bg-white/10 border border-white/10 hover:bg-white/15" title="Theme">
              {prefs.theme === "dark" ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>

            <button onClick={() => setShowTaskModal(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-black shadow-lg shadow-sky-900/30">
              <Plus className="w-4 h-4" /> New
            </button>

            <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
            <button onClick={exportData} className="px-3 py-2 rounded-xl bg-white/10 border border-white/10 hover:bg-white/15">Export</button>
            <button onClick={() => fileRef.current?.click()} className="px-3 py-2 rounded-xl bg-white/10 border border-white/10 hover:bg-white/15">Import</button>

            {user && !user.isAnonymous ? (
              <>
                <span className="text-xs text-slate-300 mr-1">{user.email || "Signed in"}</span>
                <button onClick={signOut} className="px-3 py-2 rounded-xl bg-white/10 border border-white/10 hover:bg-white/15">Sign out</button>
              </>
            ) : (
              <>
                <button onClick={signInWithGoogle} className="px-3 py-2 rounded-xl bg-emerald-500/90 text-black hover:bg-emerald-400">Sign in with Google</button>
                <button onClick={() => { setShowEmailModal(true); setAuthMode('signin'); }} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 border border-white/10 hover:bg-white/15">
                  <Mail className="w-4 h-4" /> Email sign in
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <ViewToggle value={prefs.view} onChange={(v) => setPrefs((p) => ({ ...p, view: v }))} />
          <TagAndPriorityFilters
            allTags={allTags}
            tagFilter={tagFilter}
            setTagFilter={setTagFilter}
            priorityFilter={priorityFilter}
            setPriorityFilter={setPriorityFilter}
            showCompleted={prefs.showCompleted}
            setShowCompleted={(val) => setPrefs((p) => ({ ...p, showCompleted: val }))}
          />
        </div>

        {prefs.view === "kanban" && (
          <Kanban
            columns={columns}
            prefs={prefs}
            onDragEnd={onDragEnd}
            onEdit={(t) => { setEditingTask(t); setShowTaskModal(true); }}
            onComplete={completeTask}
            onDelete={(id) => deleteTask(id)}
          />
        )}

        {prefs.view === "calendar" && (
          <CalendarView
            calMonth={calMonth}
            setCalMonth={setCalMonth}
            daysArray={daysArray}
            tasksByDate={tasksByDate}
            onOpen={(task) => { setEditingTask(task); setShowTaskModal(true); }}
          />
        )}

        {prefs.view === "split" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Kanban
              columns={columns}
              prefs={prefs}
              onDragEnd={onDragEnd}
              onEdit={(t) => { setEditingTask(t); setShowTaskModal(true); }}
              onComplete={completeTask}
              onDelete={(id) => deleteTask(id)}
            />
            <CalendarView
              calMonth={calMonth}
              setCalMonth={setCalMonth}
              daysArray={daysArray}
              tasksByDate={tasksByDate}
              onOpen={(task) => { setEditingTask(task); setShowTaskModal(true); }}
            />
          </div>
        )}
      </main>

      <TaskModal
        open={showTaskModal}
        onClose={() => { setShowTaskModal(false); setEditingTask(null); }}
        task={editingTask}
        onSave={(task) => { upsertTask(task); setShowTaskModal(false); setEditingTask(null); }}
      />

      <EmailAuthModal
        open={showEmailModal}
        mode={authMode}
        setMode={setAuthMode}
        email={authEmail}
        setEmail={setAuthEmail}
        pass={authPass}
        setPass={setAuthPass}
        onClose={() => setShowEmailModal(false)}
        onSubmit={handleEmailSubmit}
      />

      <footer className="max-w-7xl mx-auto px-4 pb-10 text-xs text-slate-400/80">
        <div className="flex items-center gap-3">
          <ShieldPill icon={<Bell className="w-3.5 h-3.5" />} text="Reminders" />
          <ShieldPill icon={<Repeat className="w-3.5 h-3.5" />} text="Recurring" />
          <ShieldPill icon={<CalendarIcon className="w-3.5 h-3.5" />} text="Calendar" />
          <ShieldPill icon={<KanbanSquare className="w-3.5 h-3.5" />} text="Kanban" />
          <span className="ml-auto">Pro tip: drag cards between columns ✨</span>
        </div>
      </footer>
    </div>
  );
}

function ViewToggle({ value, onChange }) {
  const options = [
    { key: "kanban", label: "Kanban", icon: <LayoutDashboard className="w-4 h-4" /> },
    { key: "calendar", label: "Calendar", icon: <CalendarIcon className="w-4 h-4" /> },
    { key: "split", label: "Split", icon: <ListChecks className="w-4 h-4" /> },
  ];
  return (
    <div className="flex p-1 rounded-xl bg-white/10 border border-white/10">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={classNames(
            "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg",
            value === o.key ? "bg-white/20" : "hover:bg-white/10"
          )}
        >
          {o.icon}
          <span className="text-sm">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function TagAndPriorityFilters({ allTags, tagFilter, setTagFilter, priorityFilter, setPriorityFilter, showCompleted, setShowCompleted }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}
              className="px-3 py-2 bg-white/10 border border-white/10 rounded-xl" title="Filter by tag">
        <option value="all">All tags</option>
        {allTags.map((t) => (<option key={t} value={t}>{t}</option>))}
      </select>

      <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}
              className="px-3 py-2 bg-white/10 border border-white/10 rounded-xl" title="Filter by priority">
        <option value="all">All priorities</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>

      <label className="ml-2 flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-sky-400" checked={showCompleted}
               onChange={(e) => setShowCompleted(e.target.checked)} />
        Show completed
      </label>
    </div>
  );
}
function DragPortal({ children, isDragging }) {
  const portalRef = React.useRef(null);

  React.useEffect(() => {
    let el = document.getElementById("drag-portal");
    if (!el) {
      el = document.createElement("div");
      el.id = "drag-portal";
      el.style.position = "relative";
      el.style.zIndex = 9999; // keep above everything
      document.body.appendChild(el);
    }
    portalRef.current = el;
  }, []);

  return isDragging && portalRef.current
    ? ReactDOM.createPortal(children, portalRef.current)
    : children;
}
function Kanban({ columns, prefs, onDragEnd, onEdit, onComplete, onDelete }) {
  const columnMeta = {
    today:   { title: "Today",     hint: "Focus",   color: "from-sky-500/30 to-sky-600/30" },
    upcoming:{ title: "Upcoming",  hint: "Next",    color: "from-indigo-500/30 to-indigo-600/30" },
    backlog: { title: "Backlog",   hint: "Later",   color: "from-amber-500/30 to-amber-600/30" },
    done:    { title: "Completed", hint: "Archive", color: "from-emerald-500/20 to-emerald-600/20" },
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {Object.keys(columnMeta).map((key) => (
          <motion.div key={key} layout className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-3 overflow-visible">
            <div className="flex items-center justify-between px-1 pb-2">
              <div>
                <div className="text-sm text-slate-300">{columnMeta[key].hint}</div>
                <div className="font-semibold flex items-center gap-2">
                  <span className={`bg-gradient-to-r text-transparent bg-clip-text ${columnMeta[key].color}`}>
                    {columnMeta[key].title}
                  </span>
                  <span className="text-xs text-slate-400">{columns[key].length}</span>
                </div>
              </div>
            </div>

            <Droppable droppableId={key}>
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="min-h-[200px] flex flex-col gap-3 overflow-visible">
                  <AnimatePresence>
                    {columns[key]
                      .filter((t) => key !== "done" || (key === "done" && prefs.showCompleted))
                      .map((t, idx) => (
                        <Draggable key={t.id} draggableId={t.id} index={idx}>
                          {(provided, snapshot) => (
                            <DragPortal isDragging={snapshot.isDragging}>
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                style={{ ...provided.draggableProps.style, zIndex: snapshot.isDragging ? 10000 : 'auto' }}
                                className={snapshot.isDragging ? "relative z-50" : "relative"}
                              >
                                <motion.div
                                  initial={{ opacity: 0, y: 8 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.98 }}
                                  transition={{ duration: 0.15 }}
                                  className="group rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-3 shadow-lg"
                                >
                                  <CardContent t={t} onEdit={onEdit} onComplete={onComplete} onDelete={onDelete} />
                                </motion.div>
                              </div>
                            </DragPortal>
                          )}
                        </Draggable>
                      ))}
                  </AnimatePresence>
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </motion.div>
        ))}
      </div>
    </DragDropContext>
  );
}

function CardContent({ t, onEdit, onComplete, onDelete }) {
  return (
    <>
      <div className="flex items-start gap-2">
        <PriorityDot level={t.priority} />
        <div className="flex-1">
          <div className="font-medium leading-tight">{t.title}</div>
          {t.notes && <div className="text-xs text-slate-300/80 mt-1">{t.notes}</div>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {t.tags?.map((tag) => (
              <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 border border-white/10">#{tag}</span>
            ))}
            {t.repeat !== "none" && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-white/10 border border-white/10">
                <Repeat className="w-3 h-3" /> {t.repeat}
              </span>
            )}
            {t.time && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-white/10 border border-white/10">
                <Clock className="w-3 h-3" /> {t.time}
              </span>
            )}
            {t.nextDue && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-white/10 border border-white/10">
                <CalendarIcon className="w-3 h-3" /> {t.nextDue}
              </span>
            )}
          </div>

          {t.checklist?.length ? (
            <div className="mt-3 bg-black/10 rounded-xl p-2">
              {t.checklist.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-xs py-1">
                  <input type="checkbox" className="accent-sky-400" checked={c.done}
                         onChange={() => onEdit({ ...t, _toggleChecklistId: c.id })} />
                  <span className={classNames(c.done && "line-through text-slate-400")}>{c.text}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button className="px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/10 text-xs hover:bg-white/15" onClick={() => onEdit(t)}>Edit</button>
        <button className="px-2.5 py-1.5 rounded-lg bg-emerald-500/90 text-black text-xs hover:bg-emerald-400 inline-flex items-center gap-1" onClick={() => onComplete(t)}>
          <CheckCircle2 className="w-3.5 h-3.5" /> Done
        </button>
        <button className="ml-auto p-1.5 rounded-lg hover:bg-white/10" onClick={() => onDelete(t.id)}>
          <Trash2 className="w-4 h-4 text-slate-300" />
        </button>
      </div>
    </>
  );
}

function CalendarView({ calMonth, setCalMonth, daysArray, tasksByDate, onOpen }) {
  const isCurrentMonth = (d) => d.getMonth() === calMonth.getMonth();
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-4">
      <div className="flex items-center gap-2 mb-3">
        <button className="p-2 rounded-lg hover:bg-white/10" onClick={() => setCalMonth(addMonths(calMonth, -1))}>
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="font-semibold">
          {calMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </div>
        <button className="p-2 rounded-lg hover:bg-white/10" onClick={() => setCalMonth(addMonths(calMonth, 1))}>
          <ChevronRight className="w-5 h-5" />
        </button>
        <button className="ml-auto px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15"
                onClick={() => setCalMonth(new Date())}>
          Today
        </button>
      </div>

      <div className="grid grid-cols-7 text-xs text-slate-300 mb-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="px-2 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {daysArray.map((d) => {
          const iso = d.toISOString().slice(0, 10);
          const items = tasksByDate[iso] || [];
          const isToday = isSameDay(d, new Date());
          return (
            <div key={iso} className={classNames(
              "min-h-[110px] rounded-xl border p-2 flex flex-col gap-1",
              "border-white/10 bg-white/5",
              !isCurrentMonth(d) && "opacity-40"
            )}>
              <div className="flex items-center justify-between">
                <div className={classNames("text-sm", isToday && "font-semibold text-sky-300")}>{d.getDate()}</div>
                {!!items.length && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-500/20 border border-sky-500/30">{items.length}</span>
                )}
              </div>
              <div className="space-y-1 overflow-auto">
                {items.slice(0, 3).map((t) => (
                  <button key={t.id} onClick={() => onOpen(t)}
                          className="w-full text-left text-[11px] px-2 py-1 rounded-lg bg-black/20 hover:bg-black/30 border border-white/10">
                    <span className="opacity-80">{t.time ? `${t.time} • ` : ""}</span>{t.title}
                  </button>
                ))}
                {items.length > 3 && (
                  <div className="text-[10px] text-slate-400">+{items.length - 3} more…</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PriorityDot({ level }) {
  const map = { low: "bg-emerald-400", medium: "bg-amber-400", high: "bg-rose-400" };
  return <span className={classNames("mt-1 w-2.5 h-2.5 rounded-full", map[level] || "bg-slate-300")} />;
}

function ShieldPill({ icon, text }) {
  return (
    <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10">
      {icon}
      {text}
    </span>
  );
}

function TaskModal({ open, onClose, task, onSave }) {
  const [data, setData] = useState(() => emptyTask());

  useEffect(() => {
    if (!open) return;
    if (task) {
      const copy = { ...task };
      if (task._toggleChecklistId) {
        copy.checklist = (copy.checklist || []).map((c) => c.id === task._toggleChecklistId ? { ...c, done: !c.done } : c);
        delete copy._toggleChecklistId;
      }
      setData(copy);
    } else {
      setData({ ...emptyTask(), nextDue: todayISO() });
    }
  }, [task, open]);

  function emptyTask() {
    return {
      id: uid(),
      title: "",
      notes: "",
      status: "today",
      priority: "medium",
      tags: [],
      nextDue: todayISO(),
      time: "",
      remindBefore: [],
      repeat: "none",
      repeatIntervalDays: 1,
      createdAt: new Date().toISOString(),
      lastCompletedAt: null,
      checklist: [],
    };
  }

  const save = () => {
    if (!data.title.trim()) return toast.error("Please add a title");
    onSave(data);
    toast.success("Task saved");
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
        className="absolute left-1/2 top-10 -translate-x-1/2 w-[95vw] max-w-2xl rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">{task ? "Edit task" : "New task"}</div>
          <button className="p-2 rounded-lg hover:bg-white/10" onClick={onClose}><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-300">Title</label>
              <input
                value={data.title}
                onChange={(e) => setData({ ...data, title: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10"
                placeholder="What do you need to do?"
              />
            </div>
            <div>
              <label className="text-xs text-slate-300">Notes</label>
              <textarea
                value={data.notes}
                onChange={(e) => setData({ ...data, notes: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10 min-h-[84px]"
                placeholder="Details, links, etc."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-300">Status</label>
                <select
                  value={data.status}
                  onChange={(e) => setData({ ...data, status: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10"
                >
                  <option value="today">Today</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="backlog">Backlog</option>
                  <option value="done">Completed</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-300">Priority</label>
                <select
                  value={data.priority}
                  onChange={(e) => setData({ ...data, priority: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-300">Date</label>
                <input
                  type="date"
                  value={data.nextDue}
                  onChange={(e) => setData({ ...data, nextDue: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10"
                />
              </div>
              <div>
                <label className="text-xs text-slate-300">Time</label>
                <input
                  type="time"
                  value={data.time}
                  onChange={(e) => setData({ ...data, time: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-300">Reminders</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {(data.remindBefore || []).map((m) => (
                  <button key={m} onClick={() => setData((d) => ({ ...d, remindBefore: d.remindBefore.filter((x) => x !== m) }))}
                          className="text-xs px-2 py-1 rounded-lg bg-black/20 border border-white/10">
                    {m} min ✕
                  </button>
                ))}
                {[5, 10, 15, 30, 60, 120].map((m) => (
                  <button key={m} onClick={() => setData((d) => ({ ...d, remindBefore: Array.from(new Set([...(d.remindBefore || []), m])).sort((a,b)=>a-b) }))}
                          className="text-xs px-2 py-1 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15">
                    +{m}m
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-300">Tags</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {(data.tags || []).map((t) => (
                  <span key={t} className="text-xs px-2 py-1 rounded-lg bg-black/20 border border-white/10">
                    #{t} <button className="ml-1 opacity-60 hover:opacity-100"
                                onClick={() => setData((d) => ({ ...d, tags: d.tags.filter((x) => x !== t) }))}>✕</button>
                  </span>
                ))}
                <TagAdder onAdd={(t) => t && setData((d) => ({ ...d, tags: Array.from(new Set([...(d.tags || []), t])) }))} />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-300">Recurring</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <select
                  value={data.repeat}
                  onChange={(e) => setData({ ...data, repeat: e.target.value })}
                  className="px-3 py-2 rounded-xl bg-white/10 border border-white/10"
                >
                  <option value="none">None</option>
                  <option value="daily">Daily</option>
                  <option value="weekdays">Weekdays</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="custom">Custom (days)</option>
                </select>
                <input
                  type="number"
                  min={1}
                  value={data.repeatIntervalDays}
                  onChange={(e) => setData({ ...data, repeatIntervalDays: clamp(Number(e.target.value || 1), 1, 365) })}
                  disabled={data.repeat !== "custom"}
                  className="px-3 py-2 rounded-xl bg-white/10 border border-white/10 disabled:opacity-50"
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">Complete the task to auto-advance the next due date.</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-xs text-slate-300 mb-2">Quick actions</div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setData({ ...data, status: "today" })}
                        className="px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15">
                  Set for today
                </button>
                <button onClick={() => setData({ ...data, time: "09:00" })}
                        className="px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15">
                  9:00 AM
                </button>
                <button onClick={() => setData({ ...data, remindBefore: [10] })}
                        className="px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15">
                  Remind 10m
                </button>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-2 justify-end">
              <button className="px-3 py-2 rounded-xl bg-white/10 border border-white/10 hover:bg-white/15" onClick={onClose}>Cancel</button>
              <button className="px-3 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-black" onClick={save}>Save task</button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function TagAdder({ onAdd }) {
  const [val, setVal] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!val.trim()) return; onAdd(val.trim()); setVal(""); }}
          className="flex items-center gap-2">
      <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="tag"
             className="px-2 py-1 rounded-lg bg-white/10 border border-white/10 text-xs w-24" />
      <button className="text-xs px-2 py-1 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15">Add</button>
    </form>
  );
}

function AuroraBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10">
      <div className="absolute -top-1/3 left-0 right-0 h-[60vh] bg-gradient-to-b from-sky-500/20 to-transparent blur-3xl" />
      <div className="absolute bottom-0 left-0 right-0 h-[50vh] bg-gradient-to-t from-indigo-500/20 to-transparent blur-3xl" />
      <svg className="absolute inset-0 w-full h-full opacity-30">
        <filter id="glow">
          <feGaussianBlur stdDeviation="40" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </svg>
    </div>
  );
}

function EmailAuthModal({ open, mode, setMode, email, setEmail, pass, setPass, onClose, onSubmit }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
        className="absolute left-1/2 top-16 -translate-x-1/2 w-[95vw] max-w-md rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">
            {mode === "signup" ? "Create account" : mode === "reset" ? "Reset password" : "Sign in"}
          </div>
          <button className="p-2 rounded-lg hover:bg-white/10" onClick={onClose}><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-slate-300">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email"
                   className="mt-1 w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10" required />
          </div>

          {mode !== "reset" && (
            <div>
              <label className="text-xs text-slate-300">Password</label>
              <input value={pass} onChange={(e) => setPass(e.target.value)} type="password" minLength={6}
                     className="mt-1 w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10" required />
            </div>
          )}

          <div className="flex items-center gap-2 justify-end">
            {mode === "signin" && (
              <button type="button" onClick={() => setMode("reset")} className="text-xs text-slate-300 underline underline-offset-2 mr-auto">
                Forgot password?
              </button>
            )}
            <button type="button" onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
                    className="px-3 py-2 rounded-xl bg-white/10 border border-white/10 hover:bg-white/15">
              {mode === "signup" ? "Have an account? Sign in" : "New here? Create account"}
            </button>
            <button type="submit" className="px-3 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-black">
              {mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
