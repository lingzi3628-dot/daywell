import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import {
  ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Modal, Platform, Pressable,
  RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TextInput, View,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { fetch as expoFetch } from "expo/fetch";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

const API_URL = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/$/, "");
const TOKEN_KEY = "daywell_mobile_session";
type User = { id: string; name: string; email: string; role: string };
type Goal = { id: string; title: string; description: string; category: string; status: string; targetDate: string | null };
type Task = { id: string; title: string; goalId: string | null; completed: boolean; priority: string; dueDate: string | null };
type Reminder = { id: string; title: string; note: string; remindAt: string; done: boolean };
type Message = { id: string; role: string; content: string; createdAt: string };
type Project = { id: string; title: string; type: string; genre: string; premise: string; content: string; updatedAt: string };
type Checkin = { id: string; day: string; mood: string; note: string; reflection: string };
type FocusSession = { id: string; label: string; durationSeconds: number; elapsedSeconds: number; status: "running" | "paused" | "finished" | "discarded"; lastResumedAt: string | null };
type Connection = { id: string; provider: string; model: string; endpoint?: string | null; isActive: boolean; createdAt: string };
type Data = { goals: Goal[]; tasks: Task[]; reminders: Reminder[]; messages: Message[]; projects: Project[]; checkins: Checkin[]; focus: FocusSession[]; connections: Connection[] };
type Tab = "Today" | "Goals" | "Focus" | "Companion" | "Writing" | "Check-in" | "Reminders" | "Account";
const blank: Data = { goals: [], tasks: [], reminders: [], messages: [], projects: [], checkins: [], focus: [], connections: [] };

async function request(path: string, token: string | null, init: RequestInit = {}) {
  if (!API_URL) throw new Error("Set EXPO_PUBLIC_API_URL to your deployed Daywell server URL in mobile/.env.");
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Could not reach Daywell. Check your connection and try again.");
  return body;
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<Data>(blank);
  const [tab, setTab] = useState<Tab>("Today");
  const [booting, setBooting] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [modal, setModal] = useState<"goal" | "task" | "reminder" | null>(null);
  const [title, setTitle] = useState("");
  const [chatText, setChatText] = useState("");
  const [writingTitle, setWritingTitle] = useState("");
  const [writingPremise, setWritingPremise] = useState("");
  const [writingBusy, setWritingBusy] = useState(false);
  const [checkinMood, setCheckinMood] = useState("");
  const [checkinNote, setCheckinNote] = useState("");
  const [focusNow, setFocusNow] = useState(0);
  const [aiInfo, setAiInfo] = useState("");
  const [offlinePreview, setOfflinePreview] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [providerKey, setProviderKey] = useState("");
  const [providerModel, setProviderModel] = useState("openai/gpt-4o-mini");
  const [connectionFeedback, setConnectionFeedback] = useState("");

  const refresh = useCallback(async (session = token) => {
    if (offlinePreview) return;
    if (!session) return;
    const [result, focusResult, checkinResult] = await Promise.all([
      request("/api/data", session, { cache: "no-store" }),
      request("/api/focus", session, { cache: "no-store" }),
      request("/api/checkins", session, { cache: "no-store" }),
    ]);
    setData({ goals: result.goals || [], tasks: result.tasks || [], reminders: result.reminders || [], messages: result.messages || [], projects: result.projects || [], checkins: checkinResult.items || [], focus: focusResult.items || [], connections: result.connections || [] });
  }, [token, offlinePreview]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(TOKEN_KEY);
        if (saved) {
          const result = await request("/api/auth", saved, { cache: "no-store" });
          if (active && result.user) { setToken(saved); setUser(result.user); await refresh(saved); }
          else await SecureStore.deleteItemAsync(TOKEN_KEY);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Could not load your workspace.");
      } finally { if (active) setBooting(false); }
    })();
    return () => { active = false; };
  // This runs once on app launch to restore the secure device session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!token || offlinePreview) return;
    const timer = setInterval(() => { if (AppState.currentState === "active") void refresh(); }, 20000);
    const appState = AppState.addEventListener("change", state => { if (state === "active") void refresh(); });
    return () => { clearInterval(timer); appState.remove(); };
  }, [token, offlinePreview, refresh]);

  const load = async () => {
    setRefreshing(true); setError("");
    try { await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not refresh your workspace."); }
    finally { setRefreshing(false); }
  };

  const authenticate = async (action: "login" | "register" | "demo") => {
    setBusy(true); setError("");
    try {
      const result = await request("/api/auth", null, { method: "POST", body: JSON.stringify({ action, client: "native", name, email, password }) });
      if (!result.user || !result.sessionToken) throw new Error("Sign-in did not complete. Please try again.");
      await SecureStore.setItemAsync(TOKEN_KEY, result.sessionToken);
      setToken(result.sessionToken); setUser(result.user); setPassword("");
      await refresh(result.sessionToken);
    } catch (e) { setError(e instanceof Error ? e.message : "Sign-in failed."); }
    finally { setBusy(false); }
  };

  const signOut = async () => {
    if (!offlinePreview) try { await request("/api/auth", token, { method: "POST", body: JSON.stringify({ action: "logout" }) }); } catch { /* Clear this device even while offline. */ }
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null); setUser(null); setData(blank); setTab("Today"); setOfflinePreview(false);
  };

  const enterOfflinePreview = () => {
    const now = Date.now();
    const today = new Date(now).toISOString().slice(0, 10);
    setData({
      goals: [
        { id: "preview-goal-1", title: "Build a mindful morning routine", description: "Start each day with intention, movement, and a clear mind.", category: "Wellness", status: "active", targetDate: null },
        { id: "preview-goal-2", title: "Launch my side project", description: "Turn a creative idea into a real product, one step at a time.", category: "Business", status: "active", targetDate: null },
      ],
      tasks: [
        { id: "preview-task-1", title: "Take a 20-minute walk outside", goalId: "preview-goal-1", completed: false, priority: "medium", dueDate: today },
        { id: "preview-task-2", title: "Sketch the first version of my landing page", goalId: "preview-goal-2", completed: false, priority: "high", dueDate: today },
        { id: "preview-task-3", title: "Write for 15 minutes without editing", goalId: null, completed: true, priority: "low", dueDate: today },
      ],
      reminders: [{ id: "preview-reminder-1", title: "Take a screen break", note: "Step away and recharge for a few minutes.", remindAt: new Date(now + 60 * 60 * 1000).toISOString(), done: false }],
      messages: [{ id: "preview-message-1", role: "assistant", content: "Hey Taylor! I’m here to help you turn big ideas into small, doable steps.", createdAt: new Date(now).toISOString() }],
      projects: [{ id: "preview-project-1", title: "The Last Bookshop", type: "Story", genre: "Literary fiction", premise: "A quiet bookshop owner discovers messages hidden in donated books.", content: "The bell above the door rang just as the rain began. Mara looked up from her ledger to find a stranger holding a book she had never seen before.", updatedAt: new Date(now).toISOString() }],
      checkins: [], focus: [], connections: [],
    });
    setUser({ id: "offline-preview", name: "Taylor Morgan", email: "preview@daywell.local", role: "Preview account" });
    setToken(null); setOfflinePreview(true); setTab("Today"); setError("");
  };

  const toggleTask = async (task: Task) => {
    if (offlinePreview) { setData(current => ({ ...current, tasks: current.tasks.map(item => item.id === task.id ? { ...item, completed: !item.completed } : item) })); return; }
    try {
      await request("/api/data", token, { method: "PATCH", body: JSON.stringify({ resource: "tasks", id: task.id, data: { completed: !task.completed } }) });
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update task."); }
  };

  const saveItem = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle || !modal) return;
    setBusy(true); setError("");
    if (offlinePreview) {
      const id = `preview-${modal}-${Date.now()}`;
      setData(current => modal === "goal"
        ? { ...current, goals: [{ id, title: cleanTitle, description: "", category: "Personal", status: "active", targetDate: null }, ...current.goals] }
        : modal === "task"
          ? { ...current, tasks: [{ id, title: cleanTitle, goalId: null, completed: false, priority: "medium", dueDate: null }, ...current.tasks] }
          : { ...current, reminders: [{ id, title: cleanTitle, note: "", remindAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), done: false }, ...current.reminders] });
      setTitle(""); setModal(null); setBusy(false); return;
    }
    const resource = modal === "goal" ? "goals" : modal === "task" ? "tasks" : "reminders";
    const payload = modal === "reminder"
      ? { title: cleanTitle, note: "", remindAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() }
      : { title: cleanTitle };
    try {
      await request("/api/data", token, { method: "POST", body: JSON.stringify({ resource, data: payload }) });
      setTitle(""); setModal(null); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save this item."); }
    finally { setBusy(false); }
  };

  const sendChat = async () => {
    const prompt = chatText.trim();
    if (!prompt || busy) return;
    setChatText(""); setBusy(true); setError("");
    if (offlinePreview) {
      const stamp = new Date().toISOString();
      setData(current => ({ ...current, messages: [...current.messages, { id: `preview-user-${Date.now()}`, role: "user", content: prompt, createdAt: stamp }, { id: `preview-assistant-${Date.now()}`, role: "assistant", content: "Let’s make this manageable. What’s one small action you could finish in the next 10 minutes?", createdAt: stamp }] }));
      setBusy(false); return;
    }
    const stamp = new Date().toISOString();
    const userMessage: Message = { id: "stream-user", role: "user", content: prompt, createdAt: stamp };
    const assistantMessage: Message = { id: "stream-assistant", role: "assistant", content: "", createdAt: stamp };
    setData(current => ({ ...current, messages: [...current.messages, userMessage, assistantMessage] }));
    try {
      const headers = new Headers({ "Content-Type": "application/json" });
      if (token) headers.set("Authorization", `Bearer ${token}`);
      const response = await expoFetch(`${API_URL}/api/ai`, { method: "POST", headers, body: JSON.stringify({ action: "chat-stream", input: prompt }) });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || "Could not send your message."); }
      if (!response.body) throw new Error("This app could not open the AI response stream.");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let saved = false;
      const consume = (block: string) => {
        const line = block.split(/\r?\n/).find(item => item.startsWith("data:"));
        if (!line) return;
        const event = JSON.parse(line.slice(5).trim()) as { type: string; token?: string; error?: string; sent?: Message; received?: Message };
        if (event.type === "token" && event.token) setData(current => ({ ...current, messages: current.messages.map(item => item.id === "stream-assistant" ? { ...item, content: item.content + event.token } : item) }));
        if (event.type === "error") throw new Error(event.error || "The AI reply failed.");
        if (event.type === "done" && event.sent && event.received) {
          saved = true;
          setData(current => ({ ...current, messages: [...current.messages.filter(item => item.id !== "stream-user" && item.id !== "stream-assistant"), event.sent!, event.received!] }));
        }
      };
      while (true) {
        const { value, done } = await reader.read(); buffer += decoder.decode(value, { stream: !done });
        const blocks = buffer.split(/\r?\n\r?\n/); buffer = blocks.pop() || ""; blocks.forEach(consume);
        if (done) break;
      }
      if (buffer.trim()) consume(buffer);
      if (!saved) throw new Error("The AI stream ended before the reply was saved. Please try again.");
    } catch (e) {
      setData(current => ({ ...current, messages: current.messages.filter(item => item.id !== "stream-user" && item.id !== "stream-assistant") }));
      setError(e instanceof Error ? e.message : "Could not send your message."); setChatText(prompt);
    }
    finally { setBusy(false); }
  };

  const createWriting = async () => {
    if (!writingTitle.trim() || !writingPremise.trim() || writingBusy) return;
    setWritingBusy(true); setError("");
    if (offlinePreview) {
      const stamp = new Date().toISOString();
      setData(current => ({ ...current, projects: [{ id: `preview-project-${Date.now()}`, title: writingTitle.trim(), type: "Story", genre: "Contemporary", premise: writingPremise.trim(), content: `The morning had begun like any other, which was why the change felt so impossible to name.\n\n${writingPremise.trim()}\n\nOutside, a decision waited.`, updatedAt: stamp }, ...current.projects] }));
      setWritingTitle(""); setWritingPremise(""); setWritingBusy(false); return;
    }
    try {
      const generated = await request("/api/ai", token, { method: "POST", body: JSON.stringify({ action: "write", title: writingTitle.trim(), type: "Story", genre: "Contemporary", mode: "draft", input: writingPremise.trim() }) });
      await request("/api/data", token, { method: "POST", body: JSON.stringify({ resource: "projects", data: { title: writingTitle.trim(), type: "Story", genre: "Contemporary", premise: writingPremise.trim(), content: generated.content } }) });
      setWritingTitle(""); setWritingPremise(""); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create your draft."); }
    finally { setWritingBusy(false); }
  };

  const saveCheckin = async () => {
    if (!checkinMood || busy) return;
    setBusy(true); setError("");
    if (offlinePreview) {
      const today = new Date().toISOString().slice(0, 10);
      setData(current => ({ ...current, checkins: [{ id: `preview-checkin-${Date.now()}`, day: today, mood: checkinMood, note: checkinNote, reflection: "Thanks for checking in. Take one small step and be kind to yourself along the way." }, ...current.checkins.filter(item => item.day !== today)] }));
      setCheckinNote(""); setBusy(false); return;
    }
    try {
      const result = await request("/api/checkins", token, { method: "POST", body: JSON.stringify({ mood: checkinMood, note: checkinNote }) });
      setData(current => ({ ...current, checkins: [result.item, ...current.checkins.filter(item => item.day !== result.item.day)] }));
      setCheckinNote("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save your check-in."); }
    finally { setBusy(false); }
  };

  const focusAction = async (action: "start" | "pause" | "resume" | "finish" | "discard") => {
    setBusy(true); setError("");
    if (offlinePreview) {
      const session = data.focus.find(item => item.status === "running" || item.status === "paused");
      const stamp = new Date().toISOString();
      if (action === "start") setData(current => ({ ...current, focus: [{ id: `preview-focus-${Date.now()}`, label: "Focused work", durationSeconds: 1500, elapsedSeconds: 0, status: "running", lastResumedAt: stamp }, ...current.focus] }));
      else if (session) {
        const elapsed = Math.min(session.durationSeconds, session.elapsedSeconds + (session.status === "running" && session.lastResumedAt ? Math.floor((Date.now() - new Date(session.lastResumedAt).getTime()) / 1000) : 0));
        const status = action === "pause" ? "paused" : action === "resume" ? "running" : action === "finish" ? "finished" : "discarded";
        setData(current => ({ ...current, focus: current.focus.map(item => item.id === session.id ? { ...item, elapsedSeconds: elapsed, status, lastResumedAt: status === "running" ? stamp : null } : item) }));
      }
      setBusy(false); return;
    }
    try {
      if (action === "start") await request("/api/focus", token, { method: "POST", body: JSON.stringify({ minutes: 25, label: "Focused work" }) });
      else {
        const session = data.focus.find(item => item.status === "running" || item.status === "paused");
        if (session) await request("/api/focus", token, { method: "PATCH", body: JSON.stringify({ id: session.id, action }) });
      }
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update your focus session."); }
    finally { setBusy(false); }
  };

  const setReminderDone = async (reminder: Reminder) => {
    if (offlinePreview) { setData(current => ({ ...current, reminders: current.reminders.map(item => item.id === reminder.id ? { ...item, done: true } : item) })); return; }
    try { await request("/api/data", token, { method: "PATCH", body: JSON.stringify({ resource: "reminders", id: reminder.id, data: { done: true } }) }); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update reminder."); }
  };

  const connectOpenRouter = async () => {
    if (!providerKey.trim() || busy) return;
    setBusy(true); setError(""); setConnectionFeedback("");
    try {
      if (offlinePreview) {
        setData(current => ({ ...current, connections: [{ id: `preview-connection-${Date.now()}`, provider: "OpenRouter", model: providerModel.trim(), isActive: true, createdAt: new Date().toISOString() }, ...current.connections] }));
        setConnectionFeedback("Preview only: this key was not sent or saved.");
      } else {
        await request("/api/data", token, { method: "POST", body: JSON.stringify({ resource: "connections", data: { provider: "OpenRouter", model: providerModel.trim(), apiKey: providerKey.trim() } }) });
        await refresh(); setConnectionFeedback("OpenRouter is connected and the key is encrypted on the server.");
      }
      setProviderKey(""); setConnectionOpen(false);
    } catch (e) { setConnectionFeedback(e instanceof Error ? e.message : "Could not connect OpenRouter."); }
    finally { setBusy(false); }
  };

  const removeConnection = async (connection: Connection) => {
    if (offlinePreview) { setData(current => ({ ...current, connections: current.connections.filter(item => item.id !== connection.id) })); return; }
    try { await request("/api/data", token, { method: "DELETE", body: JSON.stringify({ resource: "connections", id: connection.id }) }); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not remove this connection."); }
  };

  const openTasks = useMemo(() => data.tasks.filter(task => !task.completed), [data.tasks]);
  const dueReminders = useMemo(() => data.reminders.filter(reminder => !reminder.done).sort((a,b) => a.remindAt.localeCompare(b.remindAt)), [data.reminders]);
  const activeFocus = data.focus.find(session => session.status === "running" || session.status === "paused");
  const focusElapsed = activeFocus ? Math.min(activeFocus.durationSeconds, activeFocus.elapsedSeconds + (activeFocus.status === "running" && activeFocus.lastResumedAt ? Math.max(0, Math.floor((focusNow - new Date(activeFocus.lastResumedAt).getTime()) / 1000)) : 0)) : 0;
  const focusLeft = activeFocus ? Math.max(0, activeFocus.durationSeconds - focusElapsed) : 25 * 60;
  useEffect(() => { const timer = setInterval(() => setFocusNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (tab === "Account" && token) void request("/api/ai", token, { cache: "no-store" }).then(status => setAiInfo(status.mode === "own" ? `Using your ${status.provider} · ${status.model}` : status.mode === "included" ? `Staff-managed OpenRouter is active · ${status.remaining} included requests left today` : "Staff shared AI is not configured yet. You can connect your own OpenRouter key below.")).catch(() => setAiInfo("AI status is unavailable right now.")); }, [tab, token]);

  if (booting) return <SafeAreaProvider><SafeAreaView style={styles.center}><ActivityIndicator size="large" color="#54735a"/><Text style={styles.muted}>Opening your space…</Text></SafeAreaView></SafeAreaProvider>;

  return <SafeAreaProvider><SafeAreaView style={styles.safe}>
    <StatusBar barStyle="dark-content" backgroundColor="#fbf8f3"/>
    {!user ? <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.authWrap} keyboardShouldPersistTaps="handled">
        <View style={styles.logoMark}><Text style={styles.logoStar}>✦</Text></View>
        <Text style={styles.brand}>daywell<Text style={styles.brandDot}>.</Text></Text>
        <Text style={styles.authTitle}>{authMode === "login" ? "Welcome back" : "Make room for what matters"}</Text>
        <Text style={styles.authSubtitle}>Your ideas, goals, and creative life — all in one place.</Text>
        <View style={styles.authCard}>
          {authMode === "register" && <Field label="Your name" value={name} onChangeText={setName} placeholder="Alex Morgan"/>}
          <Field label="Email address" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none"/>
          <Field label="Password" value={password} onChangeText={setPassword} placeholder="At least 8 characters" secureTextEntry/>
          {!!error && <Text style={styles.error}>{error}</Text>}
          <ActionButton label={busy ? "Please wait…" : authMode === "login" ? "Sign in" : "Create account"} onPress={() => void authenticate(authMode)} disabled={busy}/>
          <Pressable onPress={() => { setAuthMode(authMode === "login" ? "register" : "login"); setError(""); }}><Text style={styles.switchText}>{authMode === "login" ? "New to Daywell? Create an account" : "Already have an account? Sign in"}</Text></Pressable>
          <Pressable onPress={() => void authenticate("demo")} disabled={busy}><Text style={styles.demoText}>Explore a demo workspace</Text></Pressable>
          {!API_URL && <><View style={styles.previewDivider}/><ActionButton label="Open offline preview" onPress={enterOfflinePreview}/><Text style={styles.previewNote}>Temporary sample data only. Connect the Neon-backed server to sign in and sync.</Text></>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView> : <>
      <View style={styles.topBar}><View><Text style={styles.eyebrow}>YOUR PERSONAL SPACE</Text><Text style={styles.screenTitle}>{tab === "Today" ? `Hello, ${user.name.split(" ")[0]}` : tab}</Text></View><Pressable style={styles.avatar} onPress={() => Alert.alert("Your account", `${user.email}\n${user.role}`, [{ text: "Sign out", style: "destructive", onPress: () => void signOut() }, { text: "Close" }])}><Text style={styles.avatarText}>{user.name.split(" ").map(part => part[0]).slice(0,2).join("").toUpperCase()}</Text></Pressable></View>
      {offlinePreview && <Text style={styles.offlineBanner}>OFFLINE PREVIEW · CHANGES ARE LOCAL ONLY</Text>}
      {!!error && <Pressable onPress={() => setError("")}><Text style={styles.errorBanner}>{error}  ×</Text></Pressable>}
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} tintColor="#54735a"/>} keyboardShouldPersistTaps="handled">
        {tab === "Today" && <>
          <View style={styles.hero}><Text style={styles.heroKicker}>A LITTLE PROGRESS ADDS UP</Text><Text style={styles.heroTitle}>Make today{`\n`}your own.</Text><Text style={styles.heroCopy}>One small step is enough to get moving.</Text><Pressable onPress={() => setTab("Goals")} style={styles.heroButton}><Text style={styles.heroButtonText}>See my goals  →</Text></Pressable></View>
          <View style={styles.statsRow}><Stat value={String(data.goals.filter(g => g.status === "active").length)} label="Active goals"/><Stat value={String(openTasks.length)} label="Open tasks"/><Stat value={String(dueReminders.length)} label="Reminders"/></View>
          <SectionTitle title="A good next step" action="Add task" onAction={() => setModal("task")}/>
          {openTasks.slice(0,5).map(task => <TaskRow key={task.id} task={task} onPress={() => void toggleTask(task)}/>)}
          {!openTasks.length && <EmptyCard title="A clear page" detail="Add a small task to get your day moving."/>}
          <SectionTitle title="Your goals" action="See all" onAction={() => setTab("Goals")}/>
          {data.goals.slice(0,3).map(goal => <GoalCard key={goal.id} goal={goal}/>)}
        </>}
        {tab === "Goals" && <>
          <SectionTitle title="Goals to grow into" action="＋ New goal" onAction={() => setModal("goal")}/>
          {data.goals.map(goal => <GoalCard key={goal.id} goal={goal}/>)}
          <SectionTitle title="Small steps" action="＋ Add task" onAction={() => setModal("task")}/>
          {data.tasks.map(task => <TaskRow key={task.id} task={task} onPress={() => void toggleTask(task)}/>)}
          {!data.goals.length && <EmptyCard title="Start with what matters" detail="Create a goal for something you want to make space for."/>}
        </>}
        {tab === "Focus" && <>
          <View style={styles.focusCard}><Text style={styles.heroKicker}>FOCUS STUDIO</Text><Text style={styles.focusClock}>{`${String(Math.floor(focusLeft / 60)).padStart(2, "0")}:${String(focusLeft % 60).padStart(2, "0")}`}</Text><Text style={styles.muted}>{activeFocus ? activeFocus.label : "A little protected time for what matters."}</Text>{activeFocus?.status === "paused" ? <ActionButton label="Resume session" onPress={() => void focusAction("resume")} disabled={busy}/> : activeFocus ? <ActionButton label="Pause session" onPress={() => void focusAction("pause")} disabled={busy}/> : <ActionButton label="Start a 25 minute focus" onPress={() => void focusAction("start")} disabled={busy} />}{activeFocus && <Pressable onPress={() => Alert.alert("Finish focus session?", "You can finish or discard this session.", [{ text: "Keep going" }, { text: "Discard", style: "destructive", onPress: () => void focusAction("discard") }, { text: "Finish", onPress: () => void focusAction("finish") }])}><Text style={styles.focusDiscard}>Finish or discard session</Text></Pressable>}</View>
          <SectionTitle title="Recent focus sessions" action="Refresh" onAction={() => void load()}/>
          {data.focus.filter(session => session.status === "finished").slice(0,8).map(session => <View style={styles.goalCard} key={session.id}><View style={styles.flex}><Text style={styles.cardTitle}>{session.label}</Text><Text style={styles.muted}>{Math.round(session.elapsedSeconds / 60)} minutes · completed</Text></View></View>)}
          {!data.focus.length && <EmptyCard title="Build a little momentum" detail="Start your first session when you’re ready."/>}
        </>}
        {tab === "Companion" && <>
          <View style={styles.chatIntro}><Text style={styles.chatSymbol}>✦</Text><Text style={styles.cardTitle}>A thought partner for your day</Text><Text style={styles.muted}>Ask for a plan, a fresh perspective, or a small next step.</Text></View>
          {data.messages.map(message => <View key={message.id} style={[styles.message, message.role === "user" ? styles.userMessage : styles.assistantMessage]}><Text style={message.role === "user" ? styles.userMessageText : styles.messageText}>{message.content}</Text></View>)}
          <View style={styles.chatComposer}><TextInput style={styles.chatInput} value={chatText} onChangeText={setChatText} placeholder="What’s on your mind?" multiline/><Pressable onPress={() => void sendChat()} style={styles.sendButton} disabled={busy}><Text style={styles.sendText}>↑</Text></Pressable></View>
        </>}
        {tab === "Writing" && <>
          <View style={styles.writeIntro}><Text style={styles.heroKicker}>THE CREATIVE DESK</Text><Text style={styles.cardTitle}>Give your idea a first page.</Text><Text style={styles.muted}>Describe a story idea and Daywell will create an opening draft and keep it in your studio.</Text></View>
          <View style={styles.writeForm}><Field label="Story title" value={writingTitle} onChangeText={setWritingTitle} placeholder="The Last Bookshop"/><Text style={styles.fieldLabel}>Your premise</Text><TextInput style={styles.premiseInput} value={writingPremise} onChangeText={setWritingPremise} placeholder="A quiet bookshop owner discovers messages hidden in donated books…" multiline/><ActionButton label={writingBusy ? "Writing…" : "Create opening draft"} onPress={() => void createWriting()} disabled={writingBusy || !writingTitle.trim() || !writingPremise.trim()}/></View>
          <SectionTitle title="Your projects" action="Refresh" onAction={() => void load()}/>
          {data.projects.map(project => <View style={styles.projectCard} key={project.id}><Text style={styles.projectKicker}>{project.type.toUpperCase()} · {project.genre}</Text><Text style={styles.cardTitle}>{project.title}</Text><Text style={styles.muted}>{project.premise}</Text><Text style={styles.projectContent}>{project.content}</Text></View>)}
          {!data.projects.length && <EmptyCard title="A blank page, full of possibility" detail="Create a draft above to start your first writing project."/>}
        </>}
        {tab === "Check-in" && <>
          <View style={styles.writeIntro}><Text style={styles.heroKicker}>A MOMENT FOR YOU</Text><Text style={styles.cardTitle}>How are you feeling today?</Text><Text style={styles.muted}>A small check-in can help you notice what you need.</Text></View>
          <View style={styles.moodRow}>{["Great", "Good", "Okay", "Low", "Stressed"].map(mood => <Pressable key={mood} onPress={() => setCheckinMood(mood)} style={[styles.moodChip, checkinMood === mood && styles.moodChipOn]}><Text style={[styles.moodText, checkinMood === mood && styles.moodTextOn]}>{mood}</Text></Pressable>)}</View>
          <TextInput style={styles.premiseInput} value={checkinNote} onChangeText={setCheckinNote} placeholder="Anything on your mind? (optional)" multiline/>
          <ActionButton label={busy ? "Saving…" : "Save today’s check-in"} onPress={() => void saveCheckin()} disabled={busy || !checkinMood}/>
          <SectionTitle title="Recent reflections" action="Refresh" onAction={() => void load()}/>
          {data.checkins.slice(0,7).map(checkin => <View style={styles.projectCard} key={checkin.id}><Text style={styles.projectKicker}>{checkin.day} · {checkin.mood}</Text>{!!checkin.note && <Text style={styles.muted}>“{checkin.note}”</Text>}<Text style={styles.projectContent}>{checkin.reflection}</Text></View>)}
          {!data.checkins.length && <EmptyCard title="Your reflections live here" detail="Save a check-in to see it again later."/>}
        </>}
        {tab === "Reminders" && <>
          <SectionTitle title="Keep the important close" action="＋ New reminder" onAction={() => setModal("reminder")}/>
          {dueReminders.map(reminder => <View key={reminder.id} style={styles.reminderCard}><Text style={styles.reminderTime}>{new Date(reminder.remindAt).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</Text><Text style={styles.cardTitle}>{reminder.title}</Text>{!!reminder.note && <Text style={styles.muted}>{reminder.note}</Text>}<Pressable style={styles.doneReminder} onPress={() => void setReminderDone(reminder)}><Text style={styles.sectionAction}>Mark as done  ✓</Text></Pressable></View>)}
          {!dueReminders.length && <EmptyCard title="Your schedule is clear" detail="Add a gentle reminder for something that matters."/>}
        </>}
        {tab === "Account" && <>
          <View style={styles.accountCard}><View style={styles.avatar}><Text style={styles.avatarText}>{user.name.split(" ").map(part => part[0]).slice(0,2).join("").toUpperCase()}</Text></View><Text style={styles.cardTitle}>{user.name}</Text><Text style={styles.muted}>{user.email}</Text><Text style={styles.accountRole}>{user.role}</Text></View>
          <View style={styles.projectCard}><Text style={styles.projectKicker}>STAFF AI SERVICE</Text><Text style={styles.cardTitle}>Shared OpenRouter</Text><Text style={styles.muted}>{offlinePreview ? "Offline preview only; staff AI status is not connected." : aiInfo || "Checking your AI connection…"}</Text><Text style={styles.projectContent}>Staff enable shared access by setting OPENROUTER_API_KEY and OPENROUTER_MODEL on the server. Keep this secret out of the app build.</Text></View>
          <SectionTitle title="Your AI connections" action="＋ Add OpenRouter" onAction={() => { setConnectionFeedback(""); setConnectionOpen(true); }}/>
          {data.connections.map(connection => <View style={styles.connectionCard} key={connection.id}><View style={styles.flex}><Text style={styles.cardTitle}>{connection.provider}</Text><Text style={styles.muted}>{connection.model} · {connection.isActive ? "Active" : "Inactive"}</Text></View><Pressable onPress={() => Alert.alert("Remove connection?", "This only removes the encrypted key from your Daywell account.", [{ text: "Cancel" }, { text: "Remove", style: "destructive", onPress: () => void removeConnection(connection) }])}><Text style={styles.removeConnection}>Remove</Text></Pressable></View>)}
          {!data.connections.length && <EmptyCard title="No personal AI connection" detail="Use the staff shared OpenRouter service, or add your own private key."/>}
          {!!connectionFeedback && <Text style={styles.connectionFeedback}>{connectionFeedback}</Text>}
          <Pressable style={styles.signOutButton} onPress={() => void signOut()}><Text style={styles.signOutText}>Sign out</Text></Pressable>
        </>}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarInner}>{(["Today", "Goals", "Focus", "Companion", "Writing", "Check-in", "Reminders", "Account"] as Tab[]).map(item => <Pressable key={item} onPress={() => { setTab(item); setError(""); }} style={styles.tabItem}><Text style={[styles.tabGlyph, tab === item && styles.tabGlyphOn]}>{item === "Today" ? "⌂" : item === "Goals" ? "◎" : item === "Focus" ? "◷" : item === "Companion" ? "✦" : item === "Writing" ? "✎" : item === "Check-in" ? "♡" : item === "Reminders" ? "♧" : "◉"}</Text><Text style={[styles.tabLabel, tab === item && styles.tabLabelOn]}>{item}</Text></Pressable>)}</ScrollView>
    </>}
    <Modal visible={!!modal} transparent animationType="fade" onRequestClose={() => setModal(null)}><KeyboardAvoidingView style={styles.modalShade} behavior={Platform.OS === "ios" ? "padding" : undefined}><View style={styles.modalCard}><Text style={styles.modalTitle}>{modal === "goal" ? "A goal worth growing" : modal === "task" ? "One small next step" : "A gentle reminder"}</Text><Text style={styles.muted}>{modal === "reminder" ? "We’ll set this for one hour from now." : "Keep it clear and achievable."}</Text><TextInput style={styles.modalInput} value={title} onChangeText={setTitle} placeholder={modal === "goal" ? "e.g. Build a morning routine" : modal === "task" ? "e.g. Write for 20 minutes" : "e.g. Take a screen break"} autoFocus/><View style={styles.modalActions}><Pressable onPress={() => { setModal(null); setTitle(""); }} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable><ActionButton label={busy ? "Saving…" : "Save"} onPress={() => void saveItem()} disabled={busy || !title.trim()}/></View></View></KeyboardAvoidingView></Modal>
    <Modal visible={connectionOpen} transparent animationType="fade" onRequestClose={() => setConnectionOpen(false)}><KeyboardAvoidingView style={styles.modalShade} behavior={Platform.OS === "ios" ? "padding" : undefined}><View style={styles.modalCard}><Text style={styles.modalTitle}>Connect OpenRouter</Text><Text style={styles.muted}>Your key is sent over HTTPS, tested, then encrypted on the Daywell server.</Text><Text style={styles.fieldLabel}>Model ID</Text><TextInput style={styles.modalInput} value={providerModel} onChangeText={setProviderModel} autoCapitalize="none" placeholder="openai/gpt-4o-mini"/><Text style={styles.fieldLabel}>OpenRouter API key</Text><TextInput style={styles.modalInput} value={providerKey} onChangeText={setProviderKey} secureTextEntry autoCapitalize="none" placeholder="sk-or-v1-…"/><View style={styles.modalActions}><Pressable onPress={() => { setProviderKey(""); setConnectionOpen(false); }} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable><ActionButton label={busy ? "Testing and saving…" : "Test & connect"} onPress={() => void connectOpenRouter()} disabled={busy || !providerKey.trim() || !providerModel.trim()}/></View></View></KeyboardAvoidingView></Modal>
  </SafeAreaView></SafeAreaProvider>;
}

function Field(props: ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput style={styles.input} placeholderTextColor="#a19c91" autoCorrect={false} {...inputProps}/></View>;
}
function ActionButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} style={[styles.actionButton, disabled && styles.disabled]}><Text style={styles.actionButtonText}>{label}</Text></Pressable>;
}
function SectionTitle({ title, action, onAction }: { title: string; action: string; onAction: () => void }) {
  return <View style={styles.sectionTitleRow}><Text style={styles.sectionTitle}>{title}</Text><Pressable onPress={onAction}><Text style={styles.sectionAction}>{action}</Text></Pressable></View>;
}
function Stat({ value, label }: { value: string; label: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}
function GoalCard({ goal }: { goal: Goal }) {
  return <View style={styles.goalCard}><View style={styles.goalDot}/><View style={styles.flex}><Text style={styles.cardTitle}>{goal.title}</Text><Text style={styles.muted}>{goal.category} · {goal.status}</Text>{!!goal.description && <Text numberOfLines={2} style={styles.goalDescription}>{goal.description}</Text>}</View></View>;
}
function TaskRow({ task, onPress }: { task: Task; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.taskRow}><View style={[styles.checkbox, task.completed && styles.checkboxDone]}>{task.completed && <Text style={styles.check}>✓</Text>}</View><Text style={[styles.taskTitle, task.completed && styles.taskDone]}>{task.title}</Text><Text style={styles.taskPriority}>{task.priority}</Text></Pressable>;
}
function EmptyCard({ title, detail }: { title: string; detail: string }) {
  return <View style={styles.emptyCard}><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.muted}>{detail}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fbf8f3" }, flex: { flex: 1 }, center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#fbf8f3" },
  authWrap: { flexGrow: 1, justifyContent: "center", padding: 26, paddingTop: 44 }, logoMark: { width: 46, height: 46, borderRadius: 16, backgroundColor: "#55735a", alignItems: "center", justifyContent: "center", marginBottom: 12 }, logoStar: { color: "#fffaf1", fontSize: 24 }, brand: { fontSize: 25, fontWeight: "700", color: "#2f3c32", letterSpacing: -1 }, brandDot: { color: "#d7966c" },
  authTitle: { fontSize: 30, lineHeight: 36, fontWeight: "700", color: "#303a32", marginTop: 38, letterSpacing: -0.6 }, authSubtitle: { fontSize: 15, lineHeight: 23, color: "#78776d", marginTop: 9, marginBottom: 24 }, authCard: { backgroundColor: "#fff", borderRadius: 22, padding: 20, borderWidth: 1, borderColor: "#eee9e1" }, field: { marginBottom: 16 }, fieldLabel: { color: "#444a40", fontSize: 13, fontWeight: "600", marginBottom: 8 }, input: { height: 50, borderWidth: 1, borderColor: "#e8e3da", borderRadius: 13, paddingHorizontal: 14, color: "#303a32", fontSize: 15, backgroundColor: "#fff" },
  previewDivider: { height: 1, backgroundColor: "#eee9e1", marginVertical: 17 }, previewNote: { color: "#928d81", fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 9 }, offlineBanner: { backgroundColor: "#f7e9ce", color: "#8b6a30", textAlign: "center", paddingVertical: 7, fontSize: 9, letterSpacing: 1, fontWeight: "700" },
  actionButton: { minHeight: 49, borderRadius: 13, backgroundColor: "#55735a", paddingHorizontal: 20, alignItems: "center", justifyContent: "center" }, actionButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 }, disabled: { opacity: 0.55 }, switchText: { textAlign: "center", color: "#55735a", fontWeight: "600", marginTop: 18, fontSize: 13 }, demoText: { textAlign: "center", color: "#878479", marginTop: 17, fontSize: 13 }, error: { color: "#a44339", marginBottom: 13, fontSize: 13 },
  topBar: { paddingHorizontal: 22, paddingTop: 13, paddingBottom: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, eyebrow: { fontSize: 9, letterSpacing: 1.7, color: "#8b8a7c", fontWeight: "700" }, screenTitle: { fontSize: 26, color: "#303a32", fontWeight: "700", marginTop: 4, letterSpacing: -0.4 }, avatar: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#eee7da" }, avatarText: { color: "#526c57", fontWeight: "700" }, content: { paddingHorizontal: 20, paddingBottom: 28 }, errorBanner: { color: "#963f35", paddingHorizontal: 20, paddingBottom: 10, fontSize: 13 },
  hero: { backgroundColor: "#e9ede4", padding: 22, borderRadius: 23, marginTop: 3, marginBottom: 15 }, heroKicker: { color: "#68816a", fontSize: 9, fontWeight: "700", letterSpacing: 1.5 }, heroTitle: { fontSize: 32, lineHeight: 36, color: "#35443a", fontWeight: "700", marginTop: 13, letterSpacing: -0.8 }, heroCopy: { color: "#727a6c", fontSize: 13, marginTop: 8 }, heroButton: { marginTop: 17, backgroundColor: "#55735a", alignSelf: "flex-start", paddingHorizontal: 15, paddingVertical: 10, borderRadius: 11 }, heroButtonText: { color: "#fff", fontWeight: "600", fontSize: 12 }, statsRow: { flexDirection: "row", gap: 9, marginBottom: 24 }, stat: { flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: "#eee9e1", borderRadius: 15, paddingVertical: 14, paddingHorizontal: 12 }, statValue: { color: "#35443a", fontWeight: "700", fontSize: 21 }, statLabel: { color: "#89867d", fontSize: 10, marginTop: 4 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 15, marginBottom: 11 }, sectionTitle: { color: "#343c34", fontSize: 17, fontWeight: "700", letterSpacing: -0.2 }, sectionAction: { color: "#628066", fontSize: 12, fontWeight: "600" },
  taskRow: { backgroundColor: "#fff", minHeight: 56, borderRadius: 14, borderWidth: 1, borderColor: "#eee9e1", paddingHorizontal: 13, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 11 }, checkbox: { width: 21, height: 21, borderRadius: 7, borderWidth: 1.5, borderColor: "#d9d4ca", alignItems: "center", justifyContent: "center" }, checkboxDone: { borderColor: "#66836a", backgroundColor: "#66836a" }, check: { color: "#fff", fontSize: 13, fontWeight: "700" }, taskTitle: { flex: 1, color: "#454941", fontSize: 13 }, taskDone: { color: "#9c9a90", textDecorationLine: "line-through" }, taskPriority: { color: "#a49f91", fontSize: 10, textTransform: "capitalize" },
  goalCard: { flexDirection: "row", gap: 12, padding: 15, borderRadius: 16, backgroundColor: "#fff", borderWidth: 1, borderColor: "#eee9e1", marginBottom: 9 }, goalDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#d6a783", marginTop: 5 }, cardTitle: { fontSize: 14, fontWeight: "700", color: "#3c433a", marginBottom: 4 }, muted: { color: "#87857b", fontSize: 12, lineHeight: 18 }, goalDescription: { color: "#77786f", fontSize: 12, lineHeight: 18, marginTop: 7 }, emptyCard: { borderWidth: 1, borderColor: "#ebe6dc", borderStyle: "dashed", borderRadius: 16, padding: 19, alignItems: "center", marginTop: 3, backgroundColor: "#fffdf9" }, emptyTitle: { color: "#41483f", fontWeight: "700", fontSize: 14, marginBottom: 5 },
  tabBar: { flexGrow: 0, borderTopWidth: 1, borderTopColor: "#eee9e1", backgroundColor: "#fffdf9", paddingTop: 9, paddingBottom: Platform.OS === "ios" ? 5 : 8 }, tabBarInner: { alignItems: "center" }, tabItem: { minWidth: 67, alignItems: "center", gap: 3 }, tabGlyph: { fontSize: 20, color: "#9a988d" }, tabGlyphOn: { color: "#55735a" }, tabLabel: { fontSize: 9, color: "#97958a" }, tabLabelOn: { color: "#55735a", fontWeight: "700" },
  chatIntro: { alignItems: "center", backgroundColor: "#e9ede4", borderRadius: 19, padding: 18, marginTop: 4, marginBottom: 14 }, chatSymbol: { color: "#55735a", fontSize: 23, marginBottom: 8 }, message: { maxWidth: "88%", borderRadius: 16, padding: 13, marginBottom: 9 }, userMessage: { alignSelf: "flex-end", backgroundColor: "#55735a", borderBottomRightRadius: 5 }, assistantMessage: { alignSelf: "flex-start", backgroundColor: "#fff", borderWidth: 1, borderColor: "#eee9e1", borderBottomLeftRadius: 5 }, messageText: { color: "#41473f", fontSize: 13, lineHeight: 19 }, userMessageText: { color: "#fff", fontSize: 13, lineHeight: 19 }, chatComposer: { flexDirection: "row", alignItems: "flex-end", gap: 9, backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: "#e9e4dc", padding: 7, marginTop: 12, marginBottom: 22 }, chatInput: { flex: 1, minHeight: 40, maxHeight: 110, paddingHorizontal: 9, paddingTop: 10, color: "#343a33" }, sendButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#55735a", alignItems: "center", justifyContent: "center" }, sendText: { color: "#fff", fontSize: 22, fontWeight: "700" },
  reminderCard: { backgroundColor: "#fff", padding: 16, borderRadius: 16, borderWidth: 1, borderColor: "#eee9e1", marginBottom: 9 }, reminderTime: { color: "#79907b", fontWeight: "600", fontSize: 11, marginBottom: 8 },
  connectionCard: { backgroundColor: "#fff", flexDirection: "row", alignItems: "center", borderRadius: 15, borderWidth: 1, borderColor: "#eee9e1", padding: 14, marginBottom: 8 }, removeConnection: { color: "#a34f42", fontSize: 12, fontWeight: "600", padding: 8 }, connectionFeedback: { color: "#648068", fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 8 },
  focusCard: { backgroundColor: "#e9ede4", borderRadius: 23, padding: 23, alignItems: "center", marginTop: 5, marginBottom: 17, gap: 13 }, focusClock: { color: "#35443a", fontWeight: "700", fontSize: 61, letterSpacing: -2 }, focusDiscard: { color: "#8f6250", fontSize: 12, fontWeight: "600", paddingVertical: 4 },
  writeIntro: { backgroundColor: "#e9ede4", borderRadius: 19, padding: 18, marginTop: 5, marginBottom: 12, gap: 8 }, writeForm: { backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: "#eee9e1", padding: 16 }, premiseInput: { minHeight: 100, textAlignVertical: "top", borderWidth: 1, borderColor: "#e8e3da", borderRadius: 13, padding: 13, color: "#303a32", fontSize: 14, marginBottom: 14, backgroundColor: "#fff" }, projectCard: { backgroundColor: "#fff", borderRadius: 17, borderWidth: 1, borderColor: "#eee9e1", padding: 16, marginBottom: 10 }, projectKicker: { color: "#79907b", fontWeight: "700", fontSize: 10, letterSpacing: 1, marginBottom: 8 }, projectContent: { color: "#55584f", fontSize: 13, lineHeight: 20, marginTop: 10 }, moodRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }, moodChip: { borderWidth: 1, borderColor: "#e4dfd5", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: "#fff" }, moodChipOn: { backgroundColor: "#55735a", borderColor: "#55735a" }, moodText: { color: "#66675e", fontSize: 12 }, moodTextOn: { color: "#fff", fontWeight: "700" }, doneReminder: { alignSelf: "flex-start", marginTop: 13 }, accountCard: { backgroundColor: "#fff", padding: 19, borderRadius: 18, borderColor: "#eee9e1", borderWidth: 1, alignItems: "center", marginTop: 6, marginBottom: 12, gap: 6 }, accountRole: { color: "#789079", fontSize: 12, marginTop: 2 }, signOutButton: { minHeight: 49, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#d8bdb0", marginTop: 9 }, signOutText: { color: "#9c5543", fontWeight: "700" },
  modalShade: { flex: 1, justifyContent: "center", padding: 22, backgroundColor: "rgba(35,40,35,0.38)" }, modalCard: { backgroundColor: "#fffdf9", borderRadius: 22, padding: 21 }, modalTitle: { color: "#343d35", fontSize: 21, fontWeight: "700", marginBottom: 5 }, modalInput: { height: 50, borderWidth: 1, borderColor: "#e7e2d9", borderRadius: 13, paddingHorizontal: 13, marginTop: 18, marginBottom: 17, color: "#303a32" }, modalActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10 }, cancelButton: { minHeight: 47, justifyContent: "center", paddingHorizontal: 13 }, cancelText: { color: "#76756b", fontWeight: "600" },
});
