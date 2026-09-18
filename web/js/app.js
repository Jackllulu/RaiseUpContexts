import {
  CATALOG,
  CARE_MODES,
  PRESET_TAGS,
  TYPE_LABEL,
  ROLE_LABEL,
  DEPTH_LABEL,
  WORK_STATUSES,
  itemById,
} from "./catalog.js";
import {
  addDays,
  catchUpItems,
  deriveStage,
  diffDays,
  pushDayForHour,
  scheduledItems,
  todayMergedNotice,
} from "./schedule.js";
import * as S from "./store.js";

let state = S.loadState();
let wizard = blankWizard();
let flash = "";

function blankWizard() {
  return {
    step: 1,
    region: "shanghai",
    mode: "due",
    dueDate: "",
    birthday: "",
    careMode: "",
    father: S.emptyParent(),
    mother: S.emptyParent(),
    skipParents: true,
    subscribe: null,
  };
}

function persist() {
  S.saveState(state);
  render();
}

function go(hash) {
  location.hash = hash;
}

function route() {
  const raw = (location.hash || "#/launch").slice(1);
  const [path, qs] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(qs || ""));
  return { parts, params, path: "/" + parts.join("/") };
}

function setFlash(msg) {
  flash = msg;
}

function wechat() {
  return S.currentWechat(state);
}

function stage() {
  if (!state.household) return null;
  return deriveStage(state.household.child, state.demoDate);
}

function sched() {
  if (!state.household) return [];
  return scheduledItems(CATALOG, state.household, state.demoDate);
}

function el(html) {
  return html.trim();
}

function pendingStrip() {
  return el(`
    <div class="pending">
      <strong>待确认</strong>（演示占位，不挡使用）<br/>
      ① 个人主体类目 / 一次性订阅模板能否过审<br/>
      ② 细稿权威来源与法务免责原文<br/>
      ③ 节拍边角见「我的 · 免责」与仓库 docs/demo-open-questions.md
    </div>
  `);
}

function roleChip(role) {
  return `<span class="chip ${role}">${ROLE_LABEL[role]}</span>`;
}
function typeChip(type) {
  return `<span class="chip ${type}">${TYPE_LABEL[type]}</span>`;
}
function depthChip(depth) {
  return `<span class="chip ${depth}">${DEPTH_LABEL[depth]}</span>`;
}

function nav(title, back) {
  const backBtn = back ? `<button class="back" data-go="${back}">返回</button>` : `<span></span>`;
  document.getElementById("nav-top").innerHTML = `${backBtn}<h2>${title}</h2>`;
}

function tabs(active) {
  const bar = document.getElementById("tabbar");
  const show = Boolean(state.household && state.household.members.includes(state.currentWechatId));
  bar.hidden = !show;
  if (!show) return;
  bar.innerHTML = ["calendar:日历", "family:家庭", "me:我的"]
    .map((x) => {
      const [id, label] = x.split(":");
      return `<button class="${id === active ? "active" : ""}" data-go="/${id}">${label}</button>`;
    })
    .join("");
}

function bindClicks(root) {
  root.querySelectorAll("[data-go]").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      go("#" + b.getAttribute("data-go"));
    });
  });
}

function medicalLine() {
  return `<div class="disclaimer">日历不是问诊，不替代就诊，不提供剂量或处方。红旗/急救请打当地急救电话或去医院。上海口径仅供上海用户参考；其他地区以当地社区/医院/教育局为准。免责全文在「我的」。来源与法务原文待确认。</div>`;
}

function renderLaunch() {
  nav("新生日历");
  tabs("");
  const invite = state.household?.inviteCode;
  return el(`
    ${pendingStrip()}
    <p class="tiny">启动：模拟微信登录。无家庭走创建向导；有邀请可加入同一家庭（仍看父母双方副本）。</p>
    <div class="card">
      <div class="muted">当前模拟登录</div>
      <strong>${wechat().label}</strong>
      <div class="tiny">票 ${wechat().tickets} · ${S.isMuted(state) ? "已静音" : "未静音"}</div>
    </div>
    <div class="btn-row">
      <button class="btn-primary" id="login">${state.household ? "进入日历" : "登录并创建家庭"}</button>
    </div>
    ${
      invite
        ? `<p class="tiny">家庭邀请码 ${invite}</p>
           <button class="btn" data-go="/join">我有邀请，加入家庭</button>`
        : ""
    }
    <div class="btn-row">
      <button class="btn-ghost" id="as-b">切换为微信 B 模拟登录</button>
    </div>
    ${flash ? `<p class="tiny">${flash}</p>` : ""}
  `);
}

function renderOnboarding() {
  nav("创建家庭", "/launch");
  tabs("");
  const s = wizard.step;
  const steps = ["地区", "孩子", "家长（可跳过）", "订阅（可跳过）"];
  let body = `<p class="muted">步骤 ${s} / 4 · ${steps[s - 1]}</p>${pendingStrip()}`;

  if (s === 1) {
    body += `
      <label class="field">地区</label>
      <div class="seg">
        <button class="choice ${wizard.region === "shanghai" ? "on" : ""}" data-region="shanghai">上海</button>
        <button class="choice ${wizard.region === "other" ? "on" : ""}" data-region="other">其他</button>
      </div>
      <p class="tiny">上海用地方产检/接种/入园口径提示；其他为全国共性兜底，并写「以当地为准」。</p>
      <button class="btn-primary" id="next">下一步</button>`;
  }
  if (s === 2) {
    body += `
      <label class="field">锚点（必填其一，否则无法算 T0）</label>
      <div class="seg">
        <button class="choice ${wizard.mode === "due" ? "on" : ""}" data-mode="due">预产期</button>
        <button class="choice ${wizard.mode === "birth" ? "on" : ""}" data-mode="birth">生日</button>
      </div>
      ${
        wizard.mode === "due"
          ? `<label class="field">预产期</label><input type="date" id="due" value="${wizard.dueDate}">`
          : `<label class="field">出生日期</label><input type="date" id="bday" value="${wizard.birthday}">`
      }
      <label class="field">照护形态（可选）</label>
      <select id="care">
        <option value="">暂不填</option>
        ${CARE_MODES.map((m) => `<option value="${m.id}" ${wizard.careMode === m.id ? "selected" : ""}>${m.label}</option>`).join("")}
      </select>
      <p class="tiny">出生后以生日覆盖预产期。演示时钟今天是 ${state.demoDate}。</p>
      <div class="btn-row">
        <button class="btn" id="prev">上一步</button>
        <button class="btn-primary" id="next">下一步</button>
      </div>`;
  }
  if (s === 3) {
    body += parentFields("father", wizard.father) + parentFields("mother", wizard.mother);
    body += `<p class="tiny">可先只填一侧，另一套可空。任一登录都能代填。空资料仍能看到该角色事项。</p>
      <div class="btn-row">
        <button class="btn" id="skip-p">跳过家长资料</button>
        <button class="btn-primary" id="next">下一步</button>
      </div>
      <button class="btn-ghost" id="prev">上一步</button>`;
  }
  if (s === 4) {
    body += `
      <p>打开日历前请一次一次性订阅（模拟）。同意才有提醒票；拒绝仍可用日历，只是没有服务通知。</p>
      <div class="btn-row">
        <button class="btn-primary" id="sub-yes">模拟同意（+3 票）</button>
        <button class="btn" id="sub-no">跳过</button>
      </div>
      <p class="tiny">个人主体模板名能否过审：待确认。本演示只模拟票数。</p>
      <button class="btn-ghost" id="prev">上一步</button>`;
  }
  return body;
}

function parentFields(role, data) {
  const title = role === "father" ? "父亲资料" : "母亲资料";
  return `
    <div class="card">
      <strong>${title}</strong>
      <label class="field">身体与假期</label>
      <select data-parent="${role}" data-k="workStatus">
        <option value="">未填</option>
        ${WORK_STATUSES.map((w) => `<option value="${w.id}" ${data.workStatus === w.id ? "selected" : ""}>${w.label}</option>`).join("")}
      </select>
      <label class="field">经验</label>
      <input type="text" data-parent="${role}" data-k="experience" value="${escapeAttr(data.experience)}" placeholder="可空" />
      <label class="field">顾虑</label>
      <input type="text" data-parent="${role}" data-k="concerns" value="${escapeAttr(data.concerns)}" placeholder="可空" />
    </div>`;
}

function escapeAttr(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

function renderJoin() {
  nav("加入家庭", "/launch");
  tabs("");
  const code = state.household?.inviteCode || "";
  return el(`
    ${pendingStrip()}
    <p>用邀请进入<strong>同一家庭</strong>，看到给父亲/给母亲两套，不是开通「对方收件箱」。</p>
    <label class="field">邀请码</label>
    <input type="text" id="code" value="${code}" />
    <div class="btn-row">
      <button class="btn-primary" id="join">确认加入</button>
      <button class="btn" data-go="/onboarding">改为自己创建</button>
    </div>
    <p class="tiny" id="join-msg"></p>
  `);
}

function bannerBlock() {
  const muted = S.isMuted(state);
  const tickets = wechat().tickets;
  if (muted) {
    return `<div class="banner mute">本微信已静音：期间 0 条提醒（含截止/安全）。日历仍可操作。静音不打破。</div>`;
  }
  if (tickets <= 0) {
    const first = wechat().joinedAt && tickets === 0;
    return `<div class="banner warn">提醒已停，点此续订（无票仍可看日历，不发服务通知）。
      <div class="btn-row"><button class="btn-primary" data-go="/me/tickets">去续票</button></div></div>`;
  }
  return `<div class="banner ok">本微信余票 ${tickets}。同一自然日父亲条+母亲条合并为 ≤1 条服务通知。</div>`;
}

function pushSimulation(todayItems) {
  const muted = S.isMuted(state);
  const tickets = wechat().tickets;
  const hour = state.demoHour;
  const sent = state.notices.find((n) => n.date === state.demoDate && n.wechatId === state.currentWechatId);
  if (!todayItems.length) {
    return `<div class="muted">今日无节拍，不发服务通知。</div>`;
  }
  if (muted) {
    return `<div class="notice"><h3>推送模拟</h3><p class="tiny">已静音，不展示服务通知，也不消耗票。</p></div>`;
  }
  if (tickets <= 0 && !sent) {
    return `<div class="notice"><h3>推送模拟</h3><p class="tiny">无票：当天不发。日历事项仍在下方。</p></div>`;
  }
  const sampleT0 = todayItems[0].t0;
  const gate = pushDayForHour(state.demoDate, hour, sampleT0);
  if (gate.skippedPastT0) {
    return `<div class="notice"><h3>推送模拟</h3><p class="tiny">夜间顺延会越过 T0 → 不推，进补课包。</p></div>`;
  }
  if (gate.delayed && gate.sendOn !== state.demoDate) {
    return `<div class="notice"><h3>推送模拟</h3><p class="tiny">当前 ${hour}:00，处于 21:00–8:00，顺延至 ${gate.sendOn} 上午。不在此刻下发。</p></div>`;
  }
  const lines = todayItems
    .map((s) => `${ROLE_LABEL[s.item.role]} · ${TYPE_LABEL[s.item.type]} · ${s.item.title}（为何是现在：相对 T0 ${s.t0}）`)
    .join("<br/>");
  return `<div class="notice">
    <h3>今日合并服务通知（≤1/天）</h3>
    <p class="tiny">角色标签 + 阶段 + 今天做什么。点条目进详情。本模拟将消耗 1 票（每天最多一次）。</p>
    <p>${lines}</p>
    ${sent ? `<p class="tiny">今日已合并发送（已耗 1 票）。</p>` : `<button class="btn" id="consume-notice">模拟点开通知</button>`}
  </div>`;
}

function renderCalendar() {
  nav("日历");
  tabs("calendar");
  if (!state.household) return renderLaunch();
  const st = stage();
  const all = sched();
  const filter = new URLSearchParams(location.hash.split("?")[1] || "").get("role") || "all";
  const completions = state.completions;
  const todayItems = todayMergedNotice(all, state.demoDate).filter((s) => !completions[s.item.id]);
  const upcoming = all
    .filter((s) => !s.pastT0)
    .filter((s) => filter === "all" || s.item.role === filter)
    .sort((a, b) => a.t0.localeCompare(b.t0) || a.item.role.localeCompare(b.item.role));
  const makeupN = catchUpItems(all, completions).length;
  const tags = S.activeTags(state);

  const list =
    upcoming.length === 0
      ? `<div class="empty">这个阶段只有大纲，或今天没有 ≤T0 的事项。<br/>骨架期常见。可去档案改锚点，或看补课包。</div>`
      : upcoming
          .map((s) => itemRow(s, completions[s.item.id]))
          .join("");

  return el(`
    ${pendingStrip()}
    ${bannerBlock()}
    <div class="card">
      <div class="row">
        <strong>${st.label}</strong>
        <span class="chip">${st.detail}</span>
        <span class="chip">${state.household.region === "shanghai" ? "上海" : "其他"}</span>
        ${S.isMuted(state) ? `<span class="chip">已静音</span>` : ""}
      </div>
      <p class="tiny">同一列表含给父亲 / 给母亲。筛选不是权限隔离。</p>
      ${tags.length ? `<p class="tiny">标签：${tags.map((t) => t.name).join("、")}</p>` : `<p class="tiny">当前无有效情境标签</p>`}
    </div>
    <div class="seg" style="grid-template-columns:1fr 1fr 1fr">
      <button class="choice ${filter === "all" ? "on" : ""}" data-filter="all">全部</button>
      <button class="choice ${filter === "father" ? "on" : ""}" data-filter="father">仅父亲</button>
      <button class="choice ${filter === "mother" ? "on" : ""}" data-filter="mother">仅母亲</button>
    </div>
    <div class="btn-row">
      <button class="btn" data-go="/makeup">补课包${makeupN ? `（${makeupN}）` : ""}</button>
    </div>
    ${pushSimulation(todayMergedNotice(all, state.demoDate))}
    <p class="muted">今日与即将（均 ≤T0，过 T0 进补课包）</p>
    ${list}
  `);
}

function itemRow(s, done) {
  const d = diffDays(state.demoDate, s.t0);
  const t0txt = d === 0 ? "今天 T0" : d > 0 ? `T0 还有 ${d} 天` : `已过 T0`;
  const beat = s.beatToday ? " · 今日节拍" : s.nextBeat ? ` · 下节拍 ${s.nextBeat}` : "";
  return `
    <button class="item" data-go="/item/${s.item.id}">
      <div>
        <div class="row">${roleChip(s.item.role)} ${typeChip(s.item.type)} ${depthChip(s.item.depth)}</div>
        <div class="t">${s.item.title}</div>
        <div class="tiny">${t0txt}${beat} · ${s.item.stage}</div>
      </div>
      <div class="check ${done ? "on" : ""}">${done ? "✓" : ""}</div>
    </button>`;
}

function renderItem(id) {
  const item = itemById(id);
  nav("事项详情", "/calendar");
  tabs("calendar");
  if (!item) return `<div class="empty">已撤下</div>`;
  const s = sched().find((x) => x.item.id === id);
  const done = Boolean(state.completions[id]);
  const past = s?.pastT0;
  return el(`
    ${pendingStrip()}
    <div class="row">${roleChip(item.role)} ${typeChip(item.type)} ${depthChip(item.depth)} <span class="chip">${item.stage}</span></div>
    <h3 style="margin:8px 0">${item.title}</h3>
    ${item.highRisk ? medicalLine() : `<p class="tiny">日历非问诊。详情免责摘要，全文在「我的」。</p>`}
    <div class="card">
      <div class="muted">为何是现在</div>
      <p>${item.whyNow}</p>
      <p class="tiny">T0 ${s?.t0 || "—"} · 节拍 ${(s?.beats || []).join("、")}</p>
      ${past ? `<p class="tiny">已过 T0：可从补课包打开，不再承诺会推送。</p>` : ""}
    </div>
    <div class="card">
      <p>${item.body}</p>
      ${item.steps?.length ? `<ol class="steps">${item.steps.map((x) => `<li>${x}</li>`).join("")}</ol>` : ""}
      ${
        item.checklist?.length
          ? `<div class="list-check">${item.checklist.map((c) => `<label><input type="checkbox"> ${c}</label>`).join("")}</div>`
          : ""
      }
    </div>
    <label class="list-check"><input type="checkbox" id="done" ${done ? "checked" : ""}> 已准备 / 已练习</label>
    <p class="tiny">返回日历时，若未静音可再申请续票（模拟）。</p>
    <div class="btn-row">
      <button class="btn" data-go="/calendar" id="back-renew">返回</button>
    </div>
  `);
}

function renderMakeup() {
  nav("补课包", "/calendar");
  tabs("calendar");
  const items = catchUpItems(sched(), state.completions);
  const father = items.filter((s) => s.item.role === "father");
  const mother = items.filter((s) => s.item.role === "mother");
  const group = (title, arr) =>
    `<h4>${title}</h4>` +
    (arr.length ? arr.map((s) => itemRow(s, false)).join("") : `<p class="tiny">无</p>`);
  return el(`
    ${pendingStrip()}
    <p class="tiny">已过 T0、未完成的一次性汇总，不按原节奏连推。晚注册同此。</p>
    ${items.length === 0 ? `<div class="empty">没有需要补看的</div>` : group("给父亲", father) + group("给母亲", mother)}
  `);
}

function parentSummary(role) {
  const p = state.household[role];
  const name = role === "father" ? "父亲" : "母亲";
  if (!p?.filled && !p?.workStatus && !p?.experience && !p?.concerns) {
    return `<button class="item" data-go="/parents"><div><strong>${name}资料</strong><div class="tiny">未填，仍可看该角色内容</div></div></button>`;
  }
  const ws = WORK_STATUSES.find((w) => w.id === p.workStatus)?.label || "假期未填";
  return `<button class="item" data-go="/parents"><div><strong>${name}资料</strong><div class="tiny">${ws} · ${p.experience || "经验未填"}</div></div></button>`;
}

function renderFamily() {
  nav("家庭");
  tabs("family");
  const c = state.household.child;
  const st = stage();
  const tags = S.activeTags(state);
  return el(`
    ${pendingStrip()}
    <button class="item" data-go="/child">
      <div>
        <strong>孩子档案</strong>
        <div class="tiny">${st.label} ${st.detail} · ${state.household.region === "shanghai" ? "上海" : "其他"} · 预产期 ${c.dueDate || "无"} · 生日 ${c.birthday || "无"}</div>
      </div>
    </button>
    ${parentSummary("father")}
    ${parentSummary("mother")}
    <button class="item" data-go="/tags">
      <div>
        <strong>情境标签</strong>
        <div class="tiny">${tags.length ? tags.map((t) => `${t.name}→${t.until}`).join("、") : "无有效标签 · 预设 + 1 自定义"}</div>
      </div>
    </button>
    <div class="btn-row">
      <button class="btn" id="refresh-region">按新地区刷新未完成项</button>
    </div>
    <p class="tiny">改地区后：未发送且 ≤T0 的节拍按新口径重算。已发送不自动重推。本演示无真实已发送队列，刷新会按当前地区过滤上海/其他条目。</p>
  `);
}

function renderChild() {
  nav("孩子档案", "/family");
  tabs("family");
  const c = state.household.child;
  return el(`
    ${pendingStrip()}
    <label class="field">地区</label>
    <div class="seg">
      <button class="choice ${state.household.region === "shanghai" ? "on" : ""}" data-region="shanghai">上海</button>
      <button class="choice ${state.household.region === "other" ? "on" : ""}" data-region="other">其他</button>
    </div>
    <label class="field">预产期</label>
    <input type="date" id="due" value="${c.dueDate || ""}" />
    <label class="field">出生日期（填写后覆盖预产期用于 0–7 岁）</label>
    <input type="date" id="bday" value="${c.birthday || ""}" />
    <p class="tiny">若同时有预产期与生日：出生后以生日为准排月龄事项；孕期事项 T0 若已过则进补课包。</p>
    <label class="field">照护形态</label>
    <select id="care">
      <option value="">未填</option>
      ${CARE_MODES.map((m) => `<option value="${m.id}" ${c.careMode === m.id ? "selected" : ""}>${m.label}</option>`).join("")}
    </select>
    <div class="btn-row"><button class="btn-primary" id="save-child">保存</button></div>
  `);
}

function renderParents() {
  nav("家长资料", "/family");
  tabs("family");
  const f = state.household.father;
  const m = state.household.mother;
  return el(`
    ${pendingStrip()}
    <p class="tiny">家庭上两套，非按微信隔离。允许一侧全空。</p>
    ${parentFields("father", f)}
    ${parentFields("mother", m)}
    <div class="btn-row"><button class="btn-primary" id="save-parents">保存</button></div>
  `);
}

function renderTags() {
  nav("情境标签", "/family");
  tabs("family");
  const active = S.activeTags(state);
  const custom = state.household.customTag;
  return el(`
    ${pendingStrip()}
    <p class="tiny">点选预设 + 全家庭 1 个自定义。到期失效。不当病历、不开处方。不适只用观察类，导向就医。</p>
    ${PRESET_TAGS.map((t) => {
      const on = active.find((a) => a.id === t.id);
      return `<button class="item" data-tag="${t.id}">
        <div><strong>${t.name}</strong><div class="tiny">${t.hint}${on ? ` · 有效至 ${on.until}` : ""}</div></div>
        <div class="check ${on ? "on" : ""}">${on ? "✓" : ""}</div>
      </button>`;
    }).join("")}
    <div class="card">
      <strong>自定义（全家庭同时仅 1 个）</strong>
      ${custom ? `<p class="tiny">已有「${custom.name}」至 ${custom.until}，保存将替换。</p>` : ""}
      <label class="field">短标签</label>
      <input type="text" id="custom-name" maxlength="12" placeholder="不要写诊断名" />
      <label class="field">有效至</label>
      <input type="date" id="custom-until" value="${addDays(state.demoDate, 3)}" />
      <button class="btn" id="save-custom">保存自定义</button>
    </div>
  `);
}

function renderMe() {
  nav("我的");
  tabs("me");
  return el(`
    ${pendingStrip()}
    <button class="item" data-go="/me/tickets"><div><strong>提醒与续票</strong><div class="tiny">余票 ${wechat().tickets} · 断票即停</div></div></button>
    <button class="item" data-go="/me/mute"><div><strong>静音</strong><div class="tiny">${S.isMuted(state) ? `至 ${wechat().mutedUntil}` : "未静音 · 按本微信"}</div></div></button>
    <button class="item" data-go="/me/invite"><div><strong>邀请第二微信</strong><div class="tiny">${state.household.members.length}/2 登录</div></div></button>
    <button class="item" data-go="/me/disclaimer"><div><strong>免责声明</strong><div class="tiny">非问诊 · 口径差异</div></div></button>
    <button class="item" data-go="/me/exit"><div><strong>退出家庭 / 注销</strong><div class="tiny">解绑本微信或删档</div></div></button>
    <p class="tiny">当前 ${wechat().label}</p>
  `);
}

function renderTickets() {
  nav("提醒与续票", "/me");
  tabs("me");
  const muted = S.isMuted(state);
  return el(`
    ${pendingStrip()}
    <div class="card">
      <strong>${wechat().tickets > 0 ? `有票：${wechat().tickets}` : "无票"}</strong>
      <p>一次性订阅：通常一票发一条该模板。打开小程序（看完、勾选、保存）时可再申请续票。票记在这个微信上，不按角色拆库存。</p>
      <p class="tiny">已接受：若不回来打开续票，提醒停止直到回来。不改用客服消息、不破静音、不做服务号模板补发。</p>
    </div>
    ${
      muted
        ? `<p>静音结束后再续订。静音中不发起订阅弹窗。</p>`
        : `<div class="btn-row"><button class="btn-primary" id="renew">模拟续票 +3</button></div>`
    }
    <p class="tiny">待确认：个人主体能否申请到可用的一次性订阅模板名称。</p>
  `);
}

function renderMute() {
  nav("静音", "/me");
  tabs("me");
  return el(`
    ${pendingStrip()}
    <p>本微信的静音日期。期间任何提醒都不发（无截止例外）。结束不清积压；每条内容最多补 1 次仍 ≤T0 的最近节拍。</p>
    <label class="field">静音至（含）</label>
    <input type="date" id="mute-until" value="${wechat().mutedUntil || addDays(state.demoDate, 3)}" />
    <div class="btn-row">
      <button class="btn-primary" id="save-mute">开启静音</button>
      <button class="btn" id="clear-mute">关闭静音</button>
    </div>
  `);
}

function renderInvite() {
  nav("邀请第二微信", "/me");
  tabs("me");
  const full = state.household.members.length >= 2;
  return el(`
    ${pendingStrip()}
    <p>对方将看到全家两套角色内容（给父亲 / 给母亲），并自己授权自己的订阅票、自己设静音。邀请第二微信即共享这本日历。</p>
    ${
      full
        ? `<div class="banner warn">已有两人，停发邀请。</div>`
        : `<div class="card"><div class="muted">邀请码</div><strong>${state.household.inviteCode}</strong>
           <p class="tiny">本演示在同一浏览器模拟第二微信。</p>
           <button class="btn-primary" id="sim-join">用微信 B 打开邀请并加入</button></div>`
    }
    <p class="tiny">成员：${state.household.members.map((id) => state.wechats[id]?.label || id).join("、")}</p>
  `);
}

function renderDisclaimer() {
  nav("免责声明", "/me");
  tabs("me");
  return el(`
    ${pendingStrip()}
    <div class="card">
      <p><strong>新生日历不是问诊产品。</strong>内容用于提醒「可能该准备/该学什么」，不能诊断、开药、解释检查报告或替代产科/儿科就诊。</p>
      <p>不提供药物剂量、处方、疫苗商品名针次医嘱。急救场景请拨打当地急救电话或前往医院。</p>
      <p>上海用户看到的地方材料/接种程序仅为「去核对官方窗口」的提示，以当年社区、医院、疾控、教育局公示为准。</p>
      <p>选择「其他」时只提供全国共性骨架，并请以当地社区/医院/教育局为准，不写死外地截止日期。</p>
      <p>情境标签不是病历。自定义标签请勿填写诊断名称。</p>
      <p>细稿的权威来源清单与法务最终免责原文<strong>待确认</strong>；上线前以法务审定稿替换本页。</p>
      <p>演示中的节拍假设见 docs/demo-open-questions.md（如：预产期按 40 周倒推；「其他」类默认加 T0）。</p>
    </div>
  `);
}

function renderExit() {
  nav("退出 / 注销", "/me");
  tabs("me");
  return el(`
    ${pendingStrip()}
    <p><strong>退出家庭</strong>：本微信解绑。若还有另一登录，家庭内容仍留给对方。</p>
    <button class="btn" id="leave">退出家庭</button>
    <p><strong>注销</strong>：删除本机演示档案（家庭、勾选、票）。</p>
    <button class="btn-danger" id="wipe">注销 / 删档</button>
  `);
}

function afterRender(r) {
  const view = document.getElementById("view");
  bindClicks(view);
  bindClicks(document.getElementById("nav-top"));
  bindClicks(document.getElementById("tabbar"));

  const $ = (id) => view.querySelector(id);

  if (r.path === "/launch" || r.path === "/") {
    $("#login")?.addEventListener("click", () => {
      if (state.household && state.household.members.includes(state.currentWechatId)) go("#/calendar");
      else go("#/onboarding");
    });
    $("#as-b")?.addEventListener("click", () => {
      S.switchWechat(state, "wx-b");
      persist();
    });
  }

  if (r.path === "/onboarding") {
    view.querySelectorAll("[data-region]").forEach((b) =>
      b.addEventListener("click", () => {
        wizard.region = b.getAttribute("data-region");
        render();
      })
    );
    view.querySelectorAll("[data-mode]").forEach((b) =>
      b.addEventListener("click", () => {
        wizard.mode = b.getAttribute("data-mode");
        render();
      })
    );
    bindParentInputs(view);
    $("#next")?.addEventListener("click", () => {
      if (wizard.step === 2) {
        wizard.dueDate = $("#due")?.value || "";
        wizard.birthday = $("#bday")?.value || "";
        wizard.careMode = $("#care")?.value || "";
        const ok = wizard.mode === "due" ? wizard.dueDate : wizard.birthday;
        if (!ok) {
          setFlash("未填锚点不能完成");
          alert("未填预产期或生日，无法计算 T0。");
          return;
        }
      }
      wizard.step = Math.min(4, wizard.step + 1);
      render();
    });
    $("#prev")?.addEventListener("click", () => {
      wizard.step = Math.max(1, wizard.step - 1);
      render();
    });
    $("#skip-p")?.addEventListener("click", () => {
      wizard.skipParents = true;
      wizard.step = 4;
      render();
    });
    $("#sub-yes")?.addEventListener("click", () => finishWizard(true));
    $("#sub-no")?.addEventListener("click", () => finishWizard(false));
  }

  if (r.path === "/join") {
    $("#join")?.addEventListener("click", () => {
      const code = $("#code").value.trim();
      if (!state.household || code !== state.household.inviteCode) {
        $("#join-msg").textContent = "邀请无效或已失效。";
        return;
      }
      const res = S.joinHousehold(state);
      $("#join-msg").textContent = res.reason || "";
      if (res.ok) {
        persist();
        go("#/calendar");
      }
    });
  }

  if (r.path === "/calendar") {
    view.querySelectorAll("[data-filter]").forEach((b) =>
      b.addEventListener("click", () => go(`#/calendar?role=${b.getAttribute("data-filter")}`))
    );
    $("#consume-notice")?.addEventListener("click", () => {
      const items = todayMergedNotice(sched(), state.demoDate);
      if (S.isMuted(state) || wechat().tickets <= 0) return;
      const already = state.notices.find((n) => n.date === state.demoDate && n.wechatId === state.currentWechatId);
      if (!already) {
        S.consumeTicket(state, state.currentWechatId);
        S.recordNotice(state, { titles: items.map((i) => i.item.title) });
      }
      persist();
      if (items[0]) go("#/item/" + items[0].item.id);
    });
  }

  if (r.parts[0] === "item") {
    $("#done")?.addEventListener("change", (e) => {
      state.completions[r.parts[1]] = e.target.checked;
      persist();
    });
    $("#back-renew")?.addEventListener("click", () => {
      if (!S.isMuted(state) && wechat().tickets < 5) {
        /* optional prompt on return — keep calendar usable */
      }
    });
  }

  if (r.path === "/family") {
    $("#refresh-region")?.addEventListener("click", () => {
      alert("已按当前地区重算未完成且 ≤T0 的可见事项（上海条目在「其他」下隐藏，反之亦然）。已过 T0 的仍在补课包，不连推。");
      go("#/calendar");
    });
  }

  if (r.path === "/child") {
    view.querySelectorAll("[data-region]").forEach((b) =>
      b.addEventListener("click", () => {
        state.household.region = b.getAttribute("data-region");
        persist();
      })
    );
    $("#save-child")?.addEventListener("click", () => {
      state.household.child.dueDate = $("#due").value || null;
      state.household.child.birthday = $("#bday").value || null;
      state.household.child.careMode = $("#care").value;
      persist();
      go("#/family");
    });
  }

  if (r.path === "/parents") {
    bindParentInputs(view);
    $("#save-parents")?.addEventListener("click", () => {
      readParentsFrom(view);
      persist();
      go("#/family");
    });
  }

  if (r.path === "/tags") {
    view.querySelectorAll("[data-tag]").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.getAttribute("data-tag");
        const on = S.activeTags(state).some((t) => t.id === id);
        if (on) S.removeTag(state, id);
        else S.upsertPresetTag(state, id, addDays(state.demoDate, PRESET_TAGS.find((t) => t.id === id).defaultDays));
        persist();
      })
    );
    $("#save-custom")?.addEventListener("click", () => {
      const name = $("#custom-name").value.trim();
      if (!name) return;
      S.setCustomTag(state, name, $("#custom-until").value);
      persist();
    });
  }

  if (r.path === "/me/tickets") {
    $("#renew")?.addEventListener("click", () => {
      S.grantTickets(state, 3);
      persist();
    });
  }

  if (r.path === "/me/mute") {
    $("#save-mute")?.addEventListener("click", () => {
      wechat().mutedUntil = $("#mute-until").value;
      persist();
      go("#/me");
    });
    $("#clear-mute")?.addEventListener("click", () => {
      wechat().mutedUntil = null;
      persist();
    });
  }

  if (r.path === "/me/invite") {
    $("#sim-join")?.addEventListener("click", () => {
      S.ensureSecondWechat(state);
      S.switchWechat(state, "wx-b");
      persist();
      go("#/join");
    });
  }

  if (r.path === "/me/exit") {
    $("#leave")?.addEventListener("click", () => {
      S.leaveHousehold(state);
      persist();
      go("#/launch");
    });
    $("#wipe")?.addEventListener("click", () => {
      state = S.wipeAll();
      wizard = blankWizard();
      persist();
      go("#/launch");
    });
  }
}

function bindParentInputs(view) {
  view.querySelectorAll("[data-parent]").forEach((inp) => {
    inp.addEventListener("change", () => readParentsFrom(view));
    inp.addEventListener("input", () => readParentsFrom(view));
  });
}

function readParentsFrom(view) {
  const target = state.household ? state.household : wizard;
  for (const role of ["father", "mother"]) {
    const obj = { ...target[role] };
    view.querySelectorAll(`[data-parent="${role}"]`).forEach((inp) => {
      obj[inp.getAttribute("data-k")] = inp.value;
    });
    obj.filled = Boolean(obj.workStatus || obj.experience || obj.concerns);
    target[role] = obj;
  }
}

function finishWizard(subscribe) {
  if (wizard.mode === "due") wizard.birthday = "";
  else wizard.dueDate = "";
  if (!wizard.dueDate && !wizard.birthday) {
    alert("未填锚点不能完成");
    wizard.step = 2;
    render();
    return;
  }
  S.createHousehold(state, { ...wizard, subscribe });
  persist();
  go("#/calendar");
}

function render() {
  document.getElementById("clock-label").textContent = `${String(state.demoHour).padStart(2, "0")}:00`;
  document.getElementById("ticket-label").textContent = `票 ${wechat()?.tickets ?? 0}`;
  document.getElementById("demo-date").value = state.demoDate;
  document.getElementById("demo-hour").value = String(state.demoHour);
  const st = stage();
  document.getElementById("stage-readout").textContent = st
    ? `当前派生阶段：${st.label} ${st.detail}`
    : "尚未建家庭";

  const r = route();
  const view = document.getElementById("view");
  const inHouse = state.household && state.household.members.includes(state.currentWechatId);
  const needHouse = ["calendar", "family", "child", "parents", "tags", "makeup", "me", "item"].includes(r.parts[0]);
  if (needHouse && !inHouse) {
    view.innerHTML = renderLaunch();
    nav("新生日历");
    tabs("");
    afterRender({ path: "/launch", parts: ["launch"] });
    return;
  }

  let html = "";
  if (r.parts[0] === "item") html = renderItem(r.parts[1]);
  else {
    const map = {
      "/launch": renderLaunch,
      "/": renderLaunch,
      "/onboarding": renderOnboarding,
      "/join": renderJoin,
      "/calendar": renderCalendar,
      "/makeup": renderMakeup,
      "/family": renderFamily,
      "/child": renderChild,
      "/parents": renderParents,
      "/tags": renderTags,
      "/me": renderMe,
      "/me/tickets": renderTickets,
      "/me/mute": renderMute,
      "/me/invite": renderInvite,
      "/me/disclaimer": renderDisclaimer,
      "/me/exit": renderExit,
    };
    html = (map[r.path] || renderLaunch)();
  }
  view.innerHTML = html;
  afterRender(r);
}

window.addEventListener("hashchange", render);
document.getElementById("demo-date").addEventListener("change", (e) => {
  state.demoDate = e.target.value;
  persist();
});
document.getElementById("demo-hour").addEventListener("change", (e) => {
  state.demoHour = Math.min(23, Math.max(0, Number(e.target.value) || 0));
  persist();
});
document.getElementById("preset-late").addEventListener("click", () => {
  const today = state.demoDate;
  const due = addDays(today, 56);
  S.switchWechat(state, "wx-a");
  wizard = blankWizard();
  S.createHousehold(state, {
    region: "shanghai",
    dueDate: due,
    birthday: null,
    careMode: "parents",
    father: { filled: true, workStatus: "working", experience: "第一次", concerns: "入院时我该干什么", leaveNote: "" },
    mother: { filled: true, workStatus: "maternity", experience: "第一次", concerns: "红旗会不会认不出", leaveNote: "" },
    subscribe: true,
  });
  persist();
  go("#/calendar");
});

if (!location.hash) location.hash = "#/launch";
else render();
