// src/App.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { motion } from "framer-motion";
import { Toaster, toast } from "sonner";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import {
  Bell,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  LayoutDashboard,
  ListChecks,
  Moon,
  Plus,
  Repeat,
  Search,
  Sun,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  KanbanSquare,
  Mail,
  Palette,
} from "lucide-react";

import { auth, db, signInAnon } from "./firebase";
import EmojiPickerButton from "./components/EmojiPickerButton";

import {
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  linkWithPopup,
  signOut as fbSignOut,
  EmailAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  linkWithCredential,
} from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  getDocs,
  getDoc,
} from "firebase/firestore";

{/* ---------------------- utils ---------------------- */}
const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const nextWeekday = (d) => { const x = addDays(d, 1); while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() + 1); return x; };
const classNames = (...xs) => xs.filter(Boolean).join(" ");

const parseTimeToDate = (iso, hhmm) => {
  const [y, m, d] = iso.split("-").map(Number);
  let [h, min] = [9, 0];
  if (hhmm && hhmm.includes(":")) [h, min] = hhmm.split(":").map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0);
};

  {/* --- timezone-safe plain date helpers (no UTC drift) --- */}
const fromISO = (iso) => {
  if (!iso) return new Date(NaN);
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0); // noon to dodge DST edges
};
const toISO = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const todayISO = () => toISO(new Date());

    {/* ---- sorting helpers ---- */}
function taskDueDate(t) {
  if (!t.nextDue) return null;
  const hhmm = (t.time && t.time.includes(":")) ? t.time : "23:59";
  return parseTimeToDate(t.nextDue, hhmm);
}
function sortByDue(a, b) {
  const da = taskDueDate(a);
  const db = taskDueDate(b);
  if (da && db) return da - db;
  if (da) return -1;
  if (db) return 1;
  return (a.createdAt || "").localeCompare(b.createdAt || "");
}
const formatDateShort = (dateish) => {
  const d = typeof dateish === "string" ? fromISO(dateish) : dateish;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

{/* ---- THEME helpers ---- */}
const defaultTheme = { from: "#0b1220", via: "#1b2450", to: "#0ea5e9", accent: "#38bdf8" };


// Flat Theme tokens for light/dark (no gradients)
const FLAT_TOKENS = {
  light: {
    base: "#F6F7FB",
    surface: "#FFFFFF",
    subsurface: "#F9FAFD",
    border: "#E7EBF1",
    text: "#0B1220",
    meta: "#6B7280",
    countBg: "#EFF2F7",
  },
  dark: {
    base: "#1B2230",
    surface: "#242B39",
    subsurface: "#2A3140",
    border: "#2D3545",
    text: "#E6EAF2",
    meta: "#A9B1C3",
    countBg: "#303747",
  }
};

function applyThemeTokens(isDark) {
  const t = isDark ? FLAT_TOKENS.dark : FLAT_TOKENS.light;
  const root = document.documentElement;
  root.style.setProperty("--base", t.base);
  root.style.setProperty("--surface", t.surface);
  root.style.setProperty("--subsurface", t.subsurface);
  root.style.setProperty("--border", t.border);
  root.style.setProperty("--text", t.text);
  root.style.setProperty("--meta", t.meta);
  root.style.setProperty("--count-bg", t.countBg);
}
function getContrastText(hex) {
  let c = (hex || "#000").replace("#", "");
  if (c.length === 3) c = c.split("").map(x => x + x).join("");
  const r = parseInt(c.slice(0,2), 16), g = parseInt(c.slice(2,4), 16), b = parseInt(c.slice(4,6), 16);
  const yiq = (r*299 + g*587 + b*114) / 1000;
  return yiq >= 150 ? "#000000" : "#ffffff";
}

{/* ---- extra date helpers (nth weekday etc.) ---- */}
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const nextOnOrAfterWeekday = (dateish, weekday) => {
  const d = typeof dateish === "string" ? fromISO(dateish) : new Date(dateish.valueOf());
  const diff = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d;
};
function nthWeekdayOfMonth(y, m, weekday, ordinal) {
  const make = (Y, M, day) => new Date(Y, M, day, 12, 0, 0, 0); // always noon

  if (ordinal === -1) {
    const last = new Date(y, m + 1, 0);
    const diff = (last.getDay() - weekday + 7) % 7;
    return make(y, m, last.getDate() - diff);
  } else {
    const first = new Date(y, m, 1);
    const diff = (weekday - first.getDay() + 7) % 7;
    const day = 1 + diff + (ordinal - 1) * 7;
    const dim = daysInMonth(y, m);
    if (day > dim) return null;
    return make(y, m, day);
  }
}
function nextMonthlyNth(base, monthsStep, weekday, ordinal) {
  let y = base.getFullYear();
  let m = base.getMonth();
  m += monthsStep;
  y += Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  let candidate = nthWeekdayOfMonth(y, m, weekday, ordinal);
  while (!candidate) {
    m += monthsStep;
    y += Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    candidate = nthWeekdayOfMonth(y, m, weekday, ordinal);
  }
  return candidate;
}
// Snap to the next date on/after baseISO that matches ordinal+weekday
function alignMonthlyNthISO(baseISO, weekday, ordinal) {
  const baseStr = baseISO || todayISO();
  const base = fromISO(baseStr);

  let cand = nthWeekdayOfMonth(base.getFullYear(), base.getMonth(), weekday, ordinal);
  if (!cand) return toISO(nextMonthlyNth(base, 1, weekday, ordinal));

  const candStr = toISO(cand);
  if (candStr < baseStr) {
    return toISO(nextMonthlyNth(base, 1, weekday, ordinal));
  }
  return candStr;
}

{/* ---- range helpers for multi-day tasks ---- */}
const isMultiDay = (t) => !!t.nextDue && !!t.endDate && t.endDate !== t.nextDue;
function eachDateInRange(startISO, endISO) {
  if (!startISO) return [];
  const start = fromISO(startISO);
  const end = fromISO(endISO || startISO);
  const days = [];
  const d = new Date(start);
  while (d <= end) { days.push(toISO(d)); d.setDate(d.getDate() + 1); }
  return days;
}
function daysBetweenInclusive(startISO, endISO) {
  if (!startISO) return 0;
  const s = fromISO(startISO);
  const e = fromISO(endISO || startISO);
  return Math.max(0, Math.round((e - s) / 86400000));
}
function formatRangeShort(startISO, endISO) {
  if (!startISO) return "—";
  const s = fromISO(startISO);
  const e = fromISO(endISO || startISO);
  const sameDay = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === e.getDate();
  if (sameDay) return s.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const sameMonth = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth();
  const sStr = sameMonth ? String(s.getDate()) : s.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const eStr = e.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${sStr}–${eStr}`;
}

{/* ---------- Auto-placement helpers ---------- */}
const isISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
function computeAutoStatus(task, now = new Date()) {
  if (task.status === "done") return "done";
  if (!task.nextDue || !isISO(task.nextDue)) return "backlog";

  const start = parseTimeToDate(task.nextDue, task.time || "09:00");
  const endISO = task.endDate && isISO(task.endDate) ? task.endDate : task.nextDue;
  const end = parseTimeToDate(endISO, "23:59"); // close of day

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const endOfUpcoming = new Date(endOfToday); endOfUpcoming.setDate(endOfUpcoming.getDate() + 7);

  if (end < startOfToday) return "today";                      // overdue range
  if (start <= endOfToday && end >= startOfToday) return "today"; // overlaps today
  if (start <= endOfUpcoming) return "upcoming";               // starts within 7 days
  return "backlog";
}
function effectiveStatus(task) {
  const mode = task.statusMode || "auto";
  return mode === "manual" ? (task.status || "today") : computeAutoStatus(task);
}

{/* ---------- Sample data ---------- */}
const SAMPLE_TASKS = [
  { id: uid(), title: "Morning stretch", notes: "5–10 minutes of mobility", status: "today", priority: "low", tags: ["wellness"], nextDue: todayISO(), endDate: todayISO(), time: "08:00", remindBefore: [10], repeat: "weekdays", repeatIntervalDays: 1, createdAt: new Date().toISOString(), lastCompletedAt: null, checklist: [ { id: uid(), text: "Neck rolls", done: false }, { id: uid(), text: "Hamstrings", done: false } ] },
  { id: uid(), title: "Inbox zero", notes: "Clear 10 emails", status: "today", priority: "medium", tags: ["work"], nextDue: todayISO(), endDate: todayISO(), time: "09:00", remindBefore: [5], repeat: "daily", repeatIntervalDays: 1, createdAt: new Date().toISOString(), lastCompletedAt: null, checklist: [] },
  { id: uid(), title: "Pay bills", notes: "Utilities + phone", status: "upcoming", priority: "high", tags: ["finance"], nextDue: todayISO(), endDate: todayISO(), time: "18:00", remindBefore: [60, 10], repeat: "monthly", repeatIntervalDays: 1, createdAt: new Date().toISOString(), lastCompletedAt: null, checklist: [] },
  { id: uid(), title: "Basement deep clean", notes: "Declutter, mop, shelves", status: "upcoming", priority: "medium", tags: ["home"], nextDue: todayISO(), endDate: toISO(addDays(new Date(), 6)), time: "", remindBefore: [], repeat: "none", repeatIntervalDays: 1, createdAt: new Date().toISOString(), lastCompletedAt: null, checklist: [] },
];

{/* ---------------------- App ---------------------- */}
export default function App() {
  // Auth
  const [user, setUser] = useState(null);
  useEffect(() => {
    signInAnon().catch(console.error);
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);
  const tasksCol = user ? collection(db, "users", user.uid, "tasks") : null;
  const prefsDoc = user ? doc(db, "users", user.uid, "meta", "prefs") : null;

  // App State
  const [tasks, setTasks] = useState(SAMPLE_TASKS);
  const [prefs, setPrefs] = useState({ theme: "auto", view: "kanban", showCompleted: true, sound: true, themeColors: { ...defaultTheme } });

  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  // Email/Password Auth
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPass, setAuthPass] = useState("");

  const timeoutsRef = useRef([]);
  const audioRef = useRef(null);
  const fileRef = useRef(null);

  // Light/Dark class
  useEffect(() => {
    const root = document.documentElement;
    const apply = (mode) => {
      const isDark = mode === "dark" || (mode === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.classList.toggle("dark", isDark);
    };
    apply(prefs.theme);
  }, [prefs.theme]);

  
  // Apply flat theme tokens
  useEffect(() => {
    const isDark =
      prefs.theme === "dark" ||
      (prefs.theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);

    const t = isDark
      ? { base:"#1B2230", surface:"#242B39", subsurface:"#2A3140", border:"#2D3545", rule:"#2C3240", text:"#E6EAF2", meta:"#A9B1C3", countBg:"#303747" }
      : { base:"#F6F7FB", surface:"#FFFFFF", subsurface:"#F9FAFD", border:"#E7EBF1", rule:"#E5E8EE", text:"#0B1220", meta:"#6B7280", countBg:"#EFF2F7" };

    const root = document.documentElement;
    root.style.setProperty("--base", t.base);
    root.style.setProperty("--surface", t.surface);
    root.style.setProperty("--subsurface", t.subsurface);
    root.style.setProperty("--border", t.border);
    root.style.setProperty("--rule", t.rule);
    root.style.setProperty("--text", t.text);
    root.style.setProperty("--meta", t.meta);
    root.style.setProperty("--count-bg", t.countBg);

    const accent = (prefs.themeColors && prefs.themeColors.accent) || "#38BDF8";
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--accent-text", getContrastText(accent));

    // flatten any leftover gradient usages
    root.style.setProperty("--bg-from", t.base);
    root.style.setProperty("--bg-via",  t.base);
    root.style.setProperty("--bg-to",   t.base);
  }, [prefs.theme, prefs.themeColors]);


  // Firestore listeners & seed
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

  // Persist prefs debounce
  useEffect(() => {
    if (!user || !prefsDoc) return;
    const t = setTimeout(() => setDoc(prefsDoc, prefs, { merge: true }), 300);
    return () => clearTimeout(t);
  }, [prefs, user]);

  // Reminders
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
        : formatDateShort(fromISO(task.nextDue)),
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

  // Filters
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

  {/* ---------- Columns with 7-day Upcoming + sorting ---------- */}
  const columns = useMemo(() => {
    const bucket = { today: [], upcoming: [], backlog: [], done: [] };
    for (const t of filteredTasks) {
      const s = effectiveStatus(t);
      (bucket[s] ||= []).push(t);
    }
    bucket.today.sort(sortByDue);
    bucket.upcoming.sort(sortByDue);
    bucket.backlog.sort(sortByDue);
    bucket.done.sort(sortByDue);
    return bucket;
  }, [filteredTasks]);

  {/* ---------- One-time auto realignment for existing data ---------- */}
 useEffect(() => {
  if (!tasksCol || !tasks.length) return;

  const updates = [];
  for (const t of tasks) {
    if (!t.nextDue || !isISO(t.nextDue)) continue;

    if (t.repeat === "monthly-nth" && t.repeatWeekday != null && t.repeatNth != null) {
      const aligned = alignMonthlyNthISO(t.nextDue, Number(t.repeatWeekday), Number(t.repeatNth));
      const patch = {};
      if (aligned !== t.nextDue) patch.nextDue = aligned;
      if (isMultiDay(t) && t.endDate && t.endDate < aligned) patch.endDate = aligned;
      if (Object.keys(patch).length) updates.push({ id: t.id, patch });
    }

    if (t.repeat === "weekly" && t.repeatWeekday != null) {
      const aligned = toISO(nextOnOrAfterWeekday(t.nextDue, Number(t.repeatWeekday)));
      if (aligned !== t.nextDue) {
        const patch = { nextDue: aligned };
        if (isMultiDay(t) && t.endDate && t.endDate < aligned) patch.endDate = aligned;
        updates.push({ id: t.id, patch });
      }
    }
  }

  updates.forEach(({ id, patch }) => setDoc(doc(tasksCol, id), patch, { merge: true }));
}, [tasksCol, tasks]);

  {/* ---------- Writes ---------- */}
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

  // Completion (recurring vs one-off)
  async function completeTask(task) {
    if (task.repeat && task.repeat !== "none") {
      const nextStart = computeNextDue(task);
      const spanDays = daysBetweenInclusive(task.nextDue, task.endDate);
      const nextEnd = addDays(nextStart, spanDays);
      const advanced = {
        ...task,
        nextDue: toISO(nextStart),
        endDate: toISO(nextEnd),
        lastCompletedAt: new Date().toISOString(),
        statusMode: "auto",
      };
      advanced.status = computeAutoStatus(advanced);
      await upsertTask(advanced);
      toast.success("Recurring task advanced");
    } else {
      await upsertTask({
        ...task,
        status: "done",
        statusMode: "manual",
        lastCompletedAt: new Date().toISOString()
      });
      toast.success("Nice! Completed");
    }
  }

  // Weekly step that respects chosen weekday
  function computeNextWeekly(base, weeks, weekday) {
    if (weekday == null) return addDays(base, 7 * weeks);
    const next = addDays(base, 7 * weeks);
    const diff = (weekday - next.getDay() + 7) % 7;
    next.setDate(next.getDate() + diff);
    return next;
  }

  function computeNextDue(task) {
    const base = parseTimeToDate(task.nextDue || todayISO(), task.time || "09:00");
    const n = Number(task.repeatIntervalDays || 1);

    switch (task.repeat) {
      case "daily":    return addDays(base, n);
      case "weekly":   return computeNextWeekly(base, n, task.repeatWeekday);
      case "monthly":  return addMonths(base, n);
      case "weekdays": {
        let next = base;
        for (let i = 0; i < n; i++) next = nextWeekday(next);
        return next;
      }
      case "monthly-nth": {
        const weekday = Number(task.repeatWeekday ?? 1);
        const ordinal = Number(task.repeatNth ?? 1);
        return nextMonthlyNth(base, Math.max(1, n), weekday, ordinal);
      }
      case "custom":   return addDays(base, n);
      default:         return base;
    }
  }

  {/* ---------- DnD: manual override on drag ---------- */}
  async function onDragEnd(result) {
    const { source, destination, draggableId } = result;
    if (!destination || source.droppableId === destination.droppableId) return;
    const current = tasks.find((t) => t.id === draggableId);
    if (!current) return;
    await upsertTask({ ...current, status: destination.droppableId, statusMode: "manual" });
    toast("Manual override enabled for this task");
  }

  {/* ---------- Export / Import JSON ---------- */}
  function exportData() {
    const payload = { tasks, prefs, exportedAt: new Date().toISOString(), version: 1 };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aurora-tasks-${toISO(new Date())}.json`;
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

  // Google sign-in / link / sign-out
  const provider = new GoogleAuthProvider();
  async function signInWithGoogle() {
    try {
      const current = auth.currentUser;
      if (current && current.isAnonymous) {
        try {
          await linkWithPopup(current, provider);
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

  // Email/Password auth
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

  {/* ---------- Calendar state ---------- */}
  const [calMonth, setCalMonth] = useState(() => new Date());
  const monthStart = startOfMonth(calMonth);
  const startGrid = addDays(monthStart, -((monthStart.getDay() + 6) % 7)); // Monday grid start
  const daysArray = [...Array(42)].map((_, i) => addDays(startGrid, i));

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--base)", color: "var(--text)" }}
    >

      <audio ref={audioRef} src="data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCA//////////////////////////////8AAABJTE5B" preload="auto" />
      <Toaster richColors position="top-right" />

      <header className="sticky top-0 z-40 border-b shadow-md"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
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

            {/* Light/Dark toggle */}
            <button
              onClick={() => setPrefs((p) => ({ ...p, theme: p.theme === "dark" ? "light" : p.theme === "light" ? "auto" : "dark" }))}
              className="p-2 rounded-xl border hover:opacity-90"
              style={{ background: "var(--subsurface)", borderColor: "var(--border)" }}
              title="Theme mode"
            >
              {prefs.theme === "dark" ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>

            {/* Theme colors modal button */}
            <button
              onClick={() => setShowThemeModal(true)}
              className="p-2 rounded-xl border hover:opacity-90"
              style={{ background: "var(--subsurface)", borderColor: "var(--border)" }}
              title="Theme colors"
            >
              <Palette className="w-5 h-5" />
            </button>

            {/* New task */}
            <button
              onClick={() => setShowTaskModal(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl shadow-sm"
              style={{ background: "var(--accent)", color: "var(--accent-text)" }}
            >
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
            tasks={filteredTasks}
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
              tasks={filteredTasks}
              onOpen={(task) => { setEditingTask(task); setShowTaskModal(true); }}
            />
          </div>
        )}
      </main>

      {/* Modals */}
      <TaskModal
        open={showTaskModal}
        onClose={() => { setShowTaskModal(false); setEditingTask(null); }}
        task={editingTask}
        onSave={(task) => { upsertTask(task); setShowTaskModal(false); setEditingTask(null); }}
        allTags={allTags}
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

      <ThemeModal
        open={showThemeModal}
        onClose={() => setShowThemeModal(false)}
        colors={prefs.themeColors || defaultTheme}
        onChange={(next) => setPrefs((p) => ({ ...p, themeColors: { ...(p.themeColors || {}), ...next } }))}
        onPreset={(preset) => setPrefs((p) => ({ ...p, themeColors: { ...preset } }))}
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

{/* ---------- Portal for dragged cards ---------- */}
function DragPortal({ children, isDragging }) {
  const portalRef = React.useRef(null);
  React.useEffect(() => {
    let el = document.getElementById("drag-portal");
    if (!el) {
      el = document.createElement("div");
      el.id = "drag-portal";
      el.style.position = "relative";
      el.style.zIndex = 10000;
      document.body.appendChild(el);
    }
    portalRef.current = el;
  }, []);
  return isDragging && portalRef.current
    ? ReactDOM.createPortal(children, portalRef.current)
    : children;
}

{/* ---------- UI pieces ---------- */}
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
          className={classNames("inline-flex items-center gap-2 px-3 py-1.5 rounded-lg", value === o.key ? "bg-white/20" : "hover:bg-white/10")}
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
      <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="px-3 py-2 bg-white/10 border border-white/10 rounded-xl" title="Filter by tag">
        <option value="all">All tags</option>
        {allTags.map((t) => (<option key={t} value={t}>{t}</option>))}
      </select>
      <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="px-3 py-2 bg-white/10 border border-white/10 rounded-xl" title="Filter by priority">
        <option value="all">All priorities</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      <label className="ml-2 flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-sky-400" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
        Show completed
      </label>
    </div>
  );
}

function Kanban({ columns, prefs, onDragEnd, onEdit, onComplete, onDelete }) {
  const columnMeta = {
    today:   { title: "Today",     hint: "Focus",          color: "from-sky-500/30 to-sky-600/30" },
    upcoming:{ title: "Upcoming",  hint: "Next 7 days",    color: "from-indigo-500/30 to-indigo-600/30" },
    backlog: { title: "Backlog",   hint: "Later",          color: "from-amber-500/30 to-amber-600/30" },
    done:    { title: "Completed", hint: "Archive",        color: "from-emerald-500/20 to-emerald-600/20" },
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {Object.keys(columnMeta).map((key) => (
          <div key={key} className="relative pl-3">
            <div className="absolute left-0 top-0 bottom-0" style={{ width: 1, background: "var(--rule)" }} aria-hidden />
            <div className="flex items-center gap-2 px-1 pb-2">
              <div className="flex-1">
                <div className="text-[15px] font-semibold leading-tight" style={{ color: "var(--text)" }}>
                  {columnMeta[key].hint}
                </div>
                <div className="text-[12px]" style={{ color: "var(--meta)" }}>
                  {columnMeta[key].title}
                </div>
              </div>
              <span
                className="text-[11px] px-1.5 py-0.5 rounded-md"
                style={{ background: "var(--count-bg)", color: "var(--meta)" }}
                title="count"
              >
                {columns[key].length}
              </span>
            </div>

            <Droppable droppableId={key}>
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="min-h-[260px] flex flex-col gap-3 overflow-visible">
                  <>
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
                                style={{ ...provided.draggableProps.style, zIndex: snapshot.isDragging ? 10000 : "auto" }}
                                className={(snapshot.isDragging ? "relative z-50 " : "relative ") + "will-change-transform"}
                              >
                                <motion.div
                                  initial={false}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ duration: 0.15 }}
                                  layout={false}
                                  className="group rounded-2xl border p-3 shadow-sm hover:shadow-md transition"
                                  style={{ background: "var(--subsurface)", borderColor: "var(--border)" }}
                                >
                                  <CardContent t={t} onEdit={onEdit} onComplete={onComplete} onDelete={onDelete} />
                                </motion.div>
                              </div>
                            </DragPortal>
                          )}
                        </Draggable>
                      ))}
                    {provided.placeholder}
                  </>
                </div>
              )}
            </Droppable>
          </div>
        ))}
      </div>
    </DragDropContext>
  );
}

// Nicely format the repeat badge on cards
const ordMap = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", "-1": "Last" };
const wkMap  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
function formatRepeat(t) {
  const n = Number(t.repeatIntervalDays || 1);
  switch (t.repeat) {
    case "daily":    return n === 1 ? "Daily" : `Every ${n} days`;
    case "weekdays": return n === 1 ? "Weekdays" : `Every ${n} workdays`;
    case "weekly": {
      const wk = t.repeatWeekday != null ? wkMap[Number(t.repeatWeekday)] : null;
      if (n === 1) return wk ? `Weekly (${wk})` : "Weekly";
      return wk ? `Every ${n} weeks (${wk})` : `Every ${n} weeks`;
    }
    case "monthly":  return n === 1 ? "Monthly" : `Every ${n} months`;
    case "monthly-nth": {
      const ord = ordMap[String(t.repeatNth ?? 1)] || "1st";
      const wk  = wkMap[Number(t.repeatWeekday ?? 1)] || "Mon";
      const step = Number(t.repeatIntervalDays || 1);
      return step === 1 ? `${ord} ${wk}` : `Every ${step} months (${ord} ${wk})`;
    }
    case "custom":   return `Every ${n} days`;
    default:         return "—";
  }
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
                <Repeat className="w-3 h-3" /> {formatRepeat(t)}
              </span>
            )}
            {t.time && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-white/10 border border-white/10">
                <Clock className="w-3 h-3" /> {t.time}
              </span>
            )}
            {t.nextDue && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-white/10 border border-white/10">
                <CalendarIcon className="w-3 h-3" />
                {formatRangeShort(t.nextDue, t.endDate)}
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

function CalendarView({ calMonth, setCalMonth, daysArray, tasks, onOpen }) {
  const isCurrentMonth = (d) => d.getMonth() === calMonth.getMonth();
  const monIdx = (d) => (d.getDay() + 6) % 7; // Monday=0..Sunday=6

  // Build 6 week starts from the 42-day grid
  const weeks = useMemo(() => Array.from({ length: 6 }, (_, i) => daysArray[i * 7]), [daysArray]);

// For each week, compute bar segments and stack into lanes
    function computeWeekLanes(weekStart) {
      const weekStartDate = new Date(weekStart);
      const weekEndDate   = addDays(weekStartDate, 6);
    
      // filter tasks that touch this week
      const overlapping = tasks.filter((t) => {
        if (!t.nextDue) return false;
        const s = fromISO(t.nextDue);                 // noon
        const e = fromISO(t.endDate || t.nextDue);    // noon
        return e >= weekStartDate && s <= weekEndDate;
      });
    
      const segs = overlapping.map((t) => {
        const start = fromISO(t.nextDue);              // noon
        const end   = fromISO(t.endDate || t.nextDue); // noon
    
        // clamp to this week, then normalize to date-noon for accurate day math
        const rawStart = start < weekStartDate ? weekStartDate : start;
        const rawEnd   = end   > weekEndDate   ? weekEndDate   : end;
        const segStart = fromISO(toISO(rawStart));
        const segEnd   = fromISO(toISO(rawEnd));
    
        const colStart = (segStart.getDay() + 6) % 7;  // Monday index
        const days = Math.max(0, Math.floor((segEnd - segStart) / 86400000));
        const span = Math.min(7 - colStart, days + 1); // inclusive, no spill to next day
    
        const isStart = toISO(segStart) === toISO(start);
        const isEnd   = toISO(segEnd)   === toISO(end);
        return { task: t, colStart, span, isStart, isEnd };
      });
    
      // Sort: earlier first, then longer span
      segs.sort((a, b) => (a.colStart - b.colStart) || (b.span - a.span));
    
      // Greedy lane assignment (avoid overlaps)
      const lanes = [];
      for (const seg of segs) {
        let placed = false;
        for (const lane of lanes) {
          const overlaps = lane.some((s) => !(
            seg.colStart + seg.span - 1 < s.colStart ||
            s.colStart + s.span - 1 < seg.colStart
          ));
          if (!overlaps) { lane.push(seg); placed = true; break; }
        }
        if (!placed) lanes.push([seg]);
      }
      return lanes;
    }
  return (
    <div className="rounded-2xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
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

      {/* Weekday headers */}
      <div className="grid grid-cols-7 text-xs text-slate-300 mb-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="px-2 py-1">{d}</div>
        ))}
      </div>

      {/* 6 weeks */}
      <div className="space-y-3">
        {weeks.map((weekStart, wi) => {
          const weekDays = daysArray.slice(wi * 7, wi * 7 + 7);
          const lanes = computeWeekLanes(weekStart);
          const isToday = (d) => isSameDay(d, new Date());

          return (
            <div key={wi} className="rounded-xl border p-2"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              {/* Day cells row */}
              <div className="grid grid-cols-7 gap-2">
                {weekDays.map((d) => (
                  <div
                    key={d.toISOString()}
                    className={classNames(
                      "min-h-[64px] rounded-lg border p-2",
                      "",
                      !isCurrentMonth(d) && "opacity-50"
                    )}
                    style={{ background: "var(--subsurface)", borderColor: isToday(d) ? "var(--accent)" : "var(--border)" }}
                  >
                    <div className={classNames("inline-flex items-center justify-center w-7 h-7 rounded-full text-sm")}
                      style={isToday(d) ? { background: "var(--accent)", color: "var(--accent-text)" } : {}}>
                      {d.getDate()}
                    </div>
                  </div>
                ))}
              </div>

              {/* Bars lanes */}
              <div className="mt-2 space-y-1">
                {lanes.map((lane, li) => (
                  <div key={li} className="grid grid-cols-7 gap-2 h-7">
                    {lane.map((seg, si) => (
                      <button
                        key={si}
                        onClick={() => onOpen(seg.task)}
                        title={seg.task.title}
                        style={{ gridColumn: `${seg.colStart + 1} / span ${seg.span}` }}
                        className={classNames(
                          "h-7 px-2 text-[11px] overflow-hidden whitespace-nowrap text-ellipsis",
                          "flex items-center border border-white/10",
                          "bg-[var(--accent)]",
                          "text-[var(--accent-text)]",
                          seg.isStart ? "rounded-l-md" : "rounded-l-none",
                          seg.isEnd ? "rounded-r-md" : "rounded-r-none",
                          (!seg.isStart || !seg.isEnd) && "opacity-95"
                        )}
                      >
                        {seg.task.title}
                        {isMultiDay(seg.task) && (
                          <span className="ml-2 opacity-80">
                            ({formatRangeShort(seg.task.nextDue, seg.task.endDate)})
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ))}
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

{/* ---------- Task Modal ---------- */}
function TaskModal({ open, onClose, task, onSave, allTags }) {
  const [data, setData] = React.useState(() => emptyTask());
  const titleRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    if (task) {
      const copy = { ...task };
      if (task._toggleChecklistId) {
        copy.checklist = (copy.checklist || []).map((c) => c.id === task._toggleChecklistId ? { ...c, done: !c.done } : c);
        delete copy._toggleChecklistId;
      }
      if (!copy.statusMode) copy.statusMode = "auto";
      if (!copy.endDate) copy.endDate = copy.nextDue;
      setData(copy);
    } else {
      const t = emptyTask();
      t.nextDue = todayISO();
      t.endDate = t.nextDue;
      setData(t);
    }
  }, [task, open]);

  function emptyTask() {
    return {
      id: uid(),
      title: "",
      notes: "",
      status: "today",
      statusMode: "auto",
      priority: "medium",
      tags: [],
      nextDue: todayISO(),
      endDate: todayISO(),
      time: "",
      remindBefore: [],
      repeat: "none",
      repeatIntervalDays: 1,
      repeatNth: 1,
      repeatWeekday: 1,
      createdAt: new Date().toISOString(),
      lastCompletedAt: null,
      checklist: [],
    };
  }

  const isAuto = (data.statusMode || "auto") === "auto";
  const autoPreview = computeAutoStatus(data);
  const capital = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");

  const save = () => {
    if (!data.title.trim()) return toast.error("Please add a title");
    const start = data.nextDue;
    const end = !data.endDate || data.endDate < start ? start : data.endDate;
    onSave({ ...data, endDate: end });
    toast.success("Task saved");
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute left-1/2 top-10 -translate-x-1/2 w-[95vw] max-w-2xl rounded-2xl border p-4 max-h-[85vh] overflow-hidden flex flex-col"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">{task ? "Edit task" : "New task"}</div>
          <button className="p-2 rounded-lg hover:bg-white/10" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto space-y-4 pr-1">
        {/* Title */}
        <div className="space-y-1">
          <label className="text-xs text-slate-300">Title</label>
          <div className="relative flex items-center gap-2">
            <input
              ref={titleRef}
              value={data.title || ""}
              onChange={(e) => setData({ ...data, title: e.target.value })}
              className="mt-1 w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10"
              placeholder="What do you need to do?"
            />
            <EmojiPickerButton
              inputRef={titleRef}
              theme="dark"
              className="rounded-lg border px-2 py-1"
              style={{ background: "var(--subsurface)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1 mt-3">
          <label className="text-xs text-slate-300">Notes</label>
          <motion.div initial={false} animate={{ opacity: 1, y: 0 }} className="mt-1">
            <textarea
              value={data.notes || ""}
              onChange={(e) => setData({ ...data, notes: e.target.value })}
              placeholder="Details, links, etc."
              className="w-full min-h-[80px] rounded-xl px-3 py-2 bg-white/10 border border-white/10"
            />
          </motion.div>
        </div>

        {/* Auto/Manual toggle + preview */}
        <div className="mt-3 flex items-center justify-between rounded-xl bg-black/20 border border-white/10 p-2">
          <span className="text-xs text-slate-300">Auto place by due date</span>
          <button
            onClick={() =>
              setData((d) => ({
                ...d,
                statusMode: (d.statusMode || "auto") === "auto" ? "manual" : "auto",
              }))
            }
            className="px-2 py-1 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15 text-xs"
          >
            {isAuto ? "On" : "Off"}
          </button>
        </div>
        {isAuto && (
          <div className="text-[11px] -mt-1 text-slate-300/90">
            Will appear in: <span className="font-medium">{capital(autoPreview)}</span>
          </div>
        )}

        {/* Status + priority */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-300">Status</label>
            <select
              value={data.status}
              onChange={(e) => setData({ ...data, status: e.target.value, statusMode: "manual" })}
              disabled={isAuto}
              className="mt-1 w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10 disabled:opacity-50"
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

        {/* Date + time */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-300">Start date</label>
            <input
              type="date"
              value={data.nextDue}
              onChange={(e) => {
                const v = e.target.value;
                setData((d) => {
                  const wasMulti = isMultiDay(d);
                  let end = d.endDate || v;
                  if (end < v) end = v;
                  if (!wasMulti) end = v;
                  return { ...d, nextDue: v, endDate: end };
                });
              }}
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

        {/* Multi-day toggle + end date */}
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isMultiDay(data)}
            onChange={(e) => {
              const on = e.target.checked;
              setData((d) => {
                if (!on) return { ...d, endDate: d.nextDue };
                const curEnd = d.endDate || d.nextDue;
                const needsBump = curEnd <= d.nextDue;
                const bumped = toISO(addDays(fromISO(d.nextDue), 1));
                return { ...d, endDate: needsBump ? bumped : curEnd };
              });
            }}
          />
          Spans multiple days
        </label>

        {isMultiDay(data) && (
          <div className="mt-2">
            <label className="text-xs text-slate-300">End date</label>
            <input
              type="date"
              value={data.endDate}
              min={data.nextDue}
              onChange={(e) => {
                const v = e.target.value;
                setData((d) => ({ ...d, endDate: v < d.nextDue ? d.nextDue : v }));
              }}
              className="mt-1 w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10"
            />
          </div>
        )}

        {/* Reminders */}
        <div className="mt-3">
          <label className="text-xs text-slate-300">Reminders</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {(data.remindBefore || []).map((m) => (
              <button
                key={m}
                onClick={() => setData((d) => ({ ...d, remindBefore: d.remindBefore.filter((x) => x !== m) }))}
                className="text-xs px-2 py-1 rounded-lg bg-black/20 border border-white/10"
              >
                {m} min ✕
              </button>
            ))}
            {[5, 10, 15, 30, 60, 120].map((m) => (
              <button
                key={m}
                onClick={() =>
                  setData((d) => ({
                    ...d,
                    remindBefore: Array.from(new Set([...(d.remindBefore || []), m])).sort((a, b) => a - b),
                  }))
                }
                className="text-xs px-2 py-1 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15"
              >
                +{m}m
              </button>
            ))}
          </div>
        </div>

        {/* Tags */}
        <div className="mt-3">
          <label className="text-xs text-slate-300">Tags</label>
          <TagPicker
            available={allTags}
            value={data.tags || []}
            onChange={(next) => setData((d) => ({ ...d, tags: next }))}
          />
        </div>

        {/* Recurring */}
        <div className="mt-3 space-y-2">
          <label className="text-xs text-slate-300">Recurring</label>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={data.repeat}
              onChange={(e) => {
                const v = e.target.value;
                setData((d) => {
                  const wasMulti = isMultiDay(d);
                  if (v === "weekly") {
                    const base = d.nextDue || todayISO();
                    const wd = d.repeatWeekday ?? fromISO(base).getDay();
                    const alignedISO = toISO(nextOnOrAfterWeekday(base, wd));
                    const newEnd = wasMulti ? (d.endDate < alignedISO ? alignedISO : d.endDate) : alignedISO;
                    return { ...d, repeat: v, repeatWeekday: wd, nextDue: alignedISO, endDate: newEnd };
                  }
                  if (v === "monthly-nth") {
                    const base = d.nextDue || todayISO();
                    const wd = d.repeatWeekday ?? fromISO(base).getDay();
                    const ord = d.repeatNth ?? 1;
                    const alignedISO = alignMonthlyNthISO(base, wd, ord);
                    const newEnd = wasMulti ? (d.endDate < alignedISO ? alignedISO : d.endDate) : alignedISO;
                    return { ...d, repeat: v, repeatWeekday: wd, repeatNth: ord, nextDue: alignedISO, endDate: newEnd };
                  }
                  const newEnd = wasMulti ? d.endDate : d.nextDue;
                  return { ...d, repeat: v, endDate: newEnd };
                });
              }}
              className="px-3 py-2 rounded-xl bg-white/10 border border-white/10"
            >
              <option value="none">None</option>
              <option value="daily">Daily</option>
              <option value="weekdays">Weekdays</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="monthly-nth">Monthly (nth weekday)</option>
              <option value="custom">Custom (days)</option>
            </select>

            <input
              type="number"
              min={1}
              value={data.repeatIntervalDays}
              onChange={(e) => setData({ ...data, repeatIntervalDays: Math.max(1, Math.min(365, Number(e.target.value || 1))) })}
              className="px-3 py-2 rounded-xl bg-white/10 border border-white/10"
              placeholder="Every…"
            />
          </div>

          {/* Weekly weekday picker */}
          {data.repeat === "weekly" && (
            <div className="grid grid-cols-2 gap-2">
              <select
                value={data.repeatWeekday ?? fromISO(data.nextDue || todayISO()).getDay()}
                onChange={(e) => {
                  const wd = Number(e.target.value);
                  const iso = toISO(nextOnOrAfterWeekday(data.nextDue || todayISO(), wd));
                  setData((d) => {
                    const wasMulti = isMultiDay(d);
                    const newEnd = wasMulti ? (d.endDate < iso ? iso : d.endDate) : iso;
                    return { ...d, repeatWeekday: wd, nextDue: iso, endDate: newEnd };
                  });
                }}
                className="px-3 py-2 rounded-xl bg-white/10 border border-white/10"
              >
                <option value={1}>Monday</option>
                <option value={2}>Tuesday</option>
                <option value={3}>Wednesday</option>
                <option value={4}>Thursday</option>
                <option value={5}>Friday</option>
                <option value={6}>Saturday</option>
                <option value={0}>Sunday</option>
              </select>
              <div className="self-center text-xs text-slate-400">
                Repeats every {data.repeatIntervalDays} week(s)
              </div>
            </div>
          )}

          {/* Monthly (nth weekday) pickers */}
          {data.repeat === "monthly-nth" && (
            <div className="grid grid-cols-2 gap-2">
              <select
                value={data.repeatNth ?? 1}
                onChange={(e) => {
                  const ord = Number(e.target.value);
                  setData((d) => {
                    const base = d.nextDue || todayISO();
                    const wd = Number(d.repeatWeekday ?? fromISO(base).getDay());
                    const iso = alignMonthlyNthISO(base, wd, ord);
                    const wasMulti = isMultiDay(d);
                    const newEnd = wasMulti ? (d.endDate < iso ? iso : d.endDate) : iso;
                    return { ...d, repeatNth: ord, nextDue: iso, endDate: newEnd };
                  });
                }}
                className="px-3 py-2 rounded-xl bg-white/10 border border-white/10"
              >
                <option value={1}>1st</option>
                <option value={2}>2nd</option>
                <option value={3}>3rd</option>
                <option value={4}>4th</option>
                <option value={-1}>Last</option>
              </select>

              <select
                value={data.repeatWeekday ?? fromISO(data.nextDue || todayISO()).getDay()}
                onChange={(e) => {
                  const wd = Number(e.target.value);
                  setData((d) => {
                    const base = d.nextDue || todayISO();
                    const ord = Number(d.repeatNth ?? 1);
                    const iso = alignMonthlyNthISO(base, wd, ord);
                    const wasMulti = isMultiDay(d);
                    const newEnd = wasMulti ? (d.endDate < iso ? iso : d.endDate) : iso;
                    return { ...d, repeatWeekday: wd, nextDue: iso, endDate: newEnd };
                  });
                }}
                className="px-3 py-2 rounded-xl bg-white/10 border border-white/10"
              >
                <option value={1}>Monday</option>
                <option value={2}>Tuesday</option>
                <option value={3}>Wednesday</option>
                <option value={4}>Thursday</option>
                <option value={5}>Friday</option>
                <option value={6}>Saturday</option>
                <option value={0}>Sunday</option>
              </select>
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-xs text-slate-300 mb-2">Quick actions</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setData({ ...data, statusMode: "auto" })}
                    className="px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15">
              Use auto placement
            </button>
            <button onClick={() => setData({ ...data, status: "today", statusMode: "manual" })}
                    className="px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15">
              Pin to Today
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
          {isAuto && (
            <div className="text-[11px] text-slate-400 mt-2">
              With Auto on, changing Date/Time updates the target column preview above.
            </div>
          )}
        </div>
      </div>
      {/* Actions (sticky footer) */}
      <div
        className="sticky bottom-0 -mx-4 px-4 pt-3 pb-3 flex items-center gap-2 justify-end border-t"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                <button
                  className="px-3 py-2 rounded-xl bg-white/10 border border-white/10 hover:bg-white/15"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  className="px-3 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-black"
                  onClick={save}
                >
                  Save task
                </button>
              </div>
        
            </motion.div>   {/* Panel end */}
          </div>
        );
        }  // end of TaskModal


// ---------- Tag Picker ----------
function TagPicker({ available = [], value = [], onChange }) {
  const [input, setInput] = React.useState("");
  const normalized = React.useMemo(
    () => Array.from(new Set(available.map((t) => String(t).trim()).filter(Boolean))).sort(),
    [available]
  );
  const selected = value;
  const lower = input.toLowerCase();

  const suggestions = React.useMemo(
    () =>
      normalized
        .filter((t) => !selected.includes(t))
        .filter((t) => (lower ? t.toLowerCase().includes(lower) : true))
        .slice(0, 8),
    [normalized, selected, lower]
  );

  const add = (tag) => {
    const clean = (tag || "").trim();
    if (!clean) return;
    onChange(Array.from(new Set([...selected, clean])));
    setInput("");
  };

  const remove = (tag) => onChange(selected.filter((t) => t !== tag));

                return (
                  <div className="mt-1">
                    {/* Selected chips */}
                    <div className="flex flex-wrap gap-2 mb-2">
                      {selected.map((t) => (
                        <span key={t} className="text-xs px-2 py-1 rounded-lg bg-black/20 border border-white/10 inline-flex items-center gap-1">
                          #{t}
                          <button
                            type="button"
                            className="ml-1 opacity-60 hover:opacity-100"
                            onClick={() => remove(t)}
                            aria-label={`Remove ${t}`}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
              
                    {/* Input */}
                    <div className="relative">
                      <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            add(input);
                          }
                        }}
                        placeholder="Add or select tag…"
                        className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10"
                      />
              
                      {/* Suggestions dropdown */}
                      {(suggestions.length > 0 || (input && !normalized.includes(input))) && (
                        <div className="absolute z-50 left-0 right-0 mt-2 rounded-xl border border-white/10 bg-black/80 backdrop-blur p-2">
                          {suggestions.map((s) => (
                            <button
                              key={s}
                              type="button"
                              className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10"
                              onClick={() => add(s)}
                            >
                              #{s}
                            </button>
                          ))}
                          {input && !normalized.includes(input) && (
                            <button
                              type="button"
                              className="mt-1 w-full text-left px-2 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30"
                              onClick={() => add(input)}
                            >
                              Add “{input}”
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }
{/* ---------- Visuals & other modals ---------- */}
function AuroraBackground() { return null; }

function EmailAuthModal({ open, mode, setMode, email, setEmail, pass, setPass, onClose, onSubmit }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="absolute left-1/2 top-16 -translate-x-1/2 w-[95vw] max-w-md rounded-2xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}
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

function ThemeModal({ open, onClose, colors, onChange, onPreset }) {
  if (!open) return null;

  const presets = [
    { name: "Aurora", from: "#0b1220", via: "#1b2450", to: "#0ea5e9", accent: "#38bdf8" },
    { name: "Sunset", from: "#140e1a", via: "#5f2239", to: "#ff6b6b", accent: "#ffd166" },
    { name: "Forest", from: "#0d1f1a", via: "#134e4a", to: "#10b981", accent: "#34d399" },
    { name: "Grape",  from: "#1a1026", via: "#3b1d5a", to: "#a78bfa", accent: "#c084fc" },
    { name: "Mono",   from: "#0f172a", via: "#1f2937", to: "#334155", accent: "#e2e8f0" },
  ];

  const set = (key) => (e) => onChange({ [key]: e.target.value });

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute left-1/2 top-16 -translate-x-1/2 w-[95vw] max-w-lg rounded-2xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold flex items-center gap-2">
            <Palette className="w-5 h-5" /> Theme
          </div>
          <button className="p-2 rounded-lg hover:bg-white/10" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-300">Background From</label>
            <input type="color" value={colors.from} onChange={set("from")}
                   className="mt-1 w-full h-10 rounded-lg border border-white/10 bg-transparent" />
          </div>
          <div>
            <label className="text-xs text-slate-300">Background Via</label>
            <input type="color" value={colors.via} onChange={set("via")}
                   className="mt-1 w-full h-10 rounded-lg border border-white/10 bg-transparent" />
          </div>
          <div>
            <label className="text-xs text-slate-300">Background To</label>
            <input type="color" value={colors.to} onChange={set("to")}
                   className="mt-1 w-full h-10 rounded-lg border border-white/10 bg-transparent" />
          </div>
          <div>
            <label className="text-xs text-slate-300">Accent</label>
            <input type="color" value={colors.accent} onChange={set("accent")}
                   className="mt-1 w-full h-10 rounded-lg border border-white/10 bg-transparent" />
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs text-slate-300 mb-2">Presets</div>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button key={p.name} onClick={() => onPreset(p)} className="rounded-xl border border-white/10 overflow-hidden" title={p.name}>
                <div className="flex">
                  <div className="w-10 h-8" style={{ background: p.from }} />
                  <div className="w-10 h-8" style={{ background: p.via }} />
                  <div className="w-10 h-8" style={{ background: p.to }} />
                  <div className="w-10 h-8" style={{ background: p.accent }} />
                </div>
                <div className="text-[10px] text-center py-1 px-2">{p.name}</div>
              </button>
            ))}
            <button onClick={() => onPreset(defaultTheme)} className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/10 hover:bg-white/15 text-xs">
              Reset
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 p-3">
          <div className="text-xs text-slate-300 mb-2">Preview</div>
          <div className="h-20 w-full rounded-lg border border-white/10"
               style={{ background: `linear-gradient(135deg, ${colors.from}, ${colors.via}, ${colors.to})` }} />
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg"
               style={{ background: colors.accent, color: getContrastText(colors.accent) }}>
            Accent button
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button className="px-3 py-2 rounded-xl bg-white/10 border border-white/10 hover:bg-white/15" onClick={onClose}>
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}
