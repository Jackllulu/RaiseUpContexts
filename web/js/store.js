import { PRESET_TAGS } from "./catalog.js";

const KEY = "xinsheng-rili-demo-v1";

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultState() {
  return {
    currentWechatId: "wx-a",
    wechats: {
      "wx-a": { id: "wx-a", label: "微信 A（本机）", tickets: 0, mutedUntil: null, joinedAt: null },
    },
    household: null,
    completions: {},
    notices: [],
    demoDate: formatToday(),
    demoHour: 10,
    pendingInvite: null,
    openQuestionsAck: false,
  };
}

function formatToday() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch {
    return defaultState();
  }
}

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function currentWechat(state) {
  return state.wechats[state.currentWechatId];
}

export function hasHousehold(state) {
  return Boolean(state.household);
}

export function isMuted(state, wechatId = state.currentWechatId) {
  const w = state.wechats[wechatId];
  if (!w?.mutedUntil) return false;
  return w.mutedUntil >= state.demoDate;
}

export function createHousehold(state, payload) {
  const inviteCode = uid("INV");
  state.household = {
    region: payload.region,
    child: {
      dueDate: payload.dueDate || null,
      birthday: payload.birthday || null,
      careMode: payload.careMode || "",
    },
    father: payload.father || emptyParent(),
    mother: payload.mother || emptyParent(),
    tags: [],
    customTag: null,
    members: [state.currentWechatId],
    inviteCode,
  };
  const w = currentWechat(state);
  w.joinedAt = state.demoDate;
  if (payload.subscribe) {
    w.tickets = Math.max(w.tickets, 3);
  }
  return state;
}

export function emptyParent() {
  return { filled: false, workStatus: "", experience: "", concerns: "", leaveNote: "" };
}

export function grantTickets(state, n = 3) {
  if (isMuted(state)) return state;
  currentWechat(state).tickets += n;
  return state;
}

export function consumeTicket(state, wechatId) {
  const w = state.wechats[wechatId];
  if (!w || w.tickets <= 0) return false;
  w.tickets -= 1;
  return true;
}

export function ensureSecondWechat(state) {
  if (!state.wechats["wx-b"]) {
    state.wechats["wx-b"] = {
      id: "wx-b",
      label: "微信 B（同浏览器模拟）",
      tickets: 0,
      mutedUntil: null,
      joinedAt: null,
    };
  }
  return state.wechats["wx-b"];
}

export function switchWechat(state, id) {
  ensureSecondWechat(state);
  state.currentWechatId = id;
}

export function joinHousehold(state) {
  if (!state.household) return { ok: false, reason: "邀请无效：还没有家庭。" };
  if (state.household.members.includes(state.currentWechatId)) {
    return { ok: true, reason: "已在家庭中。" };
  }
  if (state.household.members.length >= 2) {
    return { ok: false, reason: "家庭已有 2 个微信，不可再加。" };
  }
  state.household.members.push(state.currentWechatId);
  currentWechat(state).joinedAt = state.demoDate;
  return { ok: true };
}

export function leaveHousehold(state) {
  if (!state.household) return;
  state.household.members = state.household.members.filter((id) => id !== state.currentWechatId);
  currentWechat(state).joinedAt = null;
  currentWechat(state).tickets = 0;
  if (state.household.members.length === 0) {
    state.household = null;
    state.completions = {};
    state.notices = [];
  }
}

export function wipeAll() {
  localStorage.removeItem(KEY);
  return defaultState();
}

export function toggleComplete(state, itemId) {
  state.completions[itemId] = !state.completions[itemId];
}

export function upsertPresetTag(state, tagId, until) {
  const def = PRESET_TAGS.find((t) => t.id === tagId);
  if (!def) return;
  const tags = state.household.tags.filter((t) => t.id !== tagId);
  tags.push({ id: tagId, name: def.name, until, kind: "preset" });
  state.household.tags = tags;
}

export function removeTag(state, tagId) {
  state.household.tags = state.household.tags.filter((t) => t.id !== tagId);
  if (state.household.customTag?.id === tagId) state.household.customTag = null;
}

export function setCustomTag(state, name, until) {
  state.household.customTag = { id: "custom", name: name.trim().slice(0, 12), until, kind: "custom" };
}

export function activeTags(state) {
  if (!state.household) return [];
  const all = [...state.household.tags];
  if (state.household.customTag) all.push(state.household.customTag);
  return all.filter((t) => t.until >= state.demoDate);
}

export function recordNotice(state, payload) {
  state.notices.unshift({
    id: uid("n"),
    date: state.demoDate,
    wechatId: state.currentWechatId,
    ...payload,
  });
  state.notices = state.notices.slice(0, 20);
}
