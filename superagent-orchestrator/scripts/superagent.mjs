#!/usr/bin/env node
// SuperAgent 确定性控制面：计划校验、就绪取批、状态流转、下游重置。
// 不调用任何 LLM，不修改计划内容，只维护 plan.state.json。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';

const HARD_MAX_PARALLEL = 3;
const HARD_MAX_RETRIES = 5;
const STATUSES = new Set(['pending', 'running', 'done', 'blocked']);
const APPROVAL_STATUSES = new Set(['pending', 'approved', 'changes_requested']);
const WORKERS = new Set(['research', 'plan', 'build', 'review']);
const RESERVED_IDS = new Set(['__proto__', 'prototype', 'constructor']);
const USAGE = `用法：
  node superagent.mjs validate <plan.json>
  node superagent.mjs next     <plan.json> [--claim] [--json]
  node superagent.mjs update   <plan.json> <taskId> --status done|failed|running|pending [--note "原因"] [--state <file>]
  node superagent.mjs status   <plan.json> [--json]
  node superagent.mjs approve  <plan.json> --note "人工确认说明" [--state <file>]
  node superagent.mjs request-changes <plan.json> --note "需修改的内容" [--state <file>]

执行门禁：next --claim 要求 plan.state.json 中的 approval 为 approved，且计划未在确认后变更。

退出码：0 正常 / 1 计划、参数或门禁错误 / 2 存在 blocked / 3 停滞`;

function fail(msg, code = 1) {
  console.error(`✗ ${msg}`);
  process.exit(code);
}

function parseArgs(argv) {
  const VALUE_OPTS = new Set(['status', 'note', 'state']);
  const res = { positional: [], opts: {} };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      res.positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (VALUE_OPTS.has(key)) {
      const val = argv[i + 1];
      if (val === undefined || val.startsWith('--')) fail(`参数 --${key} 缺少取值`);
      res.opts[key] = val;
      i++;
    } else {
      res.opts[key] = true;
    }
  }
  return res;
}

function readJson(file, label) {
  if (!existsSync(file)) fail(`${label} 不存在：${file}`);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    fail(`${label} 不是合法 JSON：${file}\n  ${err.message}`);
  }
}

function nonEmptyStringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string' && v.trim() !== '');
}

function positiveInt(value, fallback, name, max, errors) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > max) {
    errors.push(`${name} 必须是 1–${max} 的整数（当前 ${JSON.stringify(value)}）`);
    return fallback;
  }
  return value;
}

function validatePlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    return { errors: ['plan 根节点必须是对象'], order: [] };
  }
  if (plan.version !== 1) errors.push('version 必须为 1');
  if (typeof plan.goal !== 'string' || plan.goal.trim() === '') errors.push('goal 不能为空');
  if (!nonEmptyStringArray(plan.deliverables)) errors.push('deliverables 必须是非空字符串数组');

  const maxParallel = positiveInt(plan.maxParallel, HARD_MAX_PARALLEL, 'maxParallel', HARD_MAX_PARALLEL, errors);
  const maxRetries = positiveInt(plan.maxRetries, HARD_MAX_RETRIES, 'maxRetries', HARD_MAX_RETRIES, errors);
  for (const key of ['assumptions', 'openQuestions']) {
    if (plan[key] !== undefined && !(Array.isArray(plan[key]) && plan[key].every((v) => typeof v === 'string'))) {
      errors.push(`${key} 必须是字符串数组`);
    }
  }

  const acIds = new Set();
  if (!Array.isArray(plan.acceptance) || plan.acceptance.length === 0) {
    errors.push('acceptance 必须是非空数组');
  } else {
    for (const [i, ac] of plan.acceptance.entries()) {
      const at = `acceptance[${i}]`;
      if (!ac || typeof ac !== 'object') { errors.push(`${at} 必须是对象`); continue; }
      if (typeof ac.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(ac.id)) {
        errors.push(`${at}.id 必须匹配 [A-Za-z0-9_-]+`);
      } else if (acIds.has(ac.id)) {
        errors.push(`验收项 id 重复：${ac.id}`);
      } else {
        acIds.add(ac.id);
      }
      if (typeof ac.criterion !== 'string' || ac.criterion.trim() === '') errors.push(`${at}.criterion 不能为空`);
      if (typeof ac.method !== 'string' || ac.method.trim() === '') errors.push(`${at}.method 不能为空`);
    }
  }

  const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  if (tasks.length === 0) errors.push('tasks 必须是非空数组');
  const ids = new Set();
  const byId = new Map();
  for (const [i, task] of tasks.entries()) {
    const at = `tasks[${i}]`;
    if (!task || typeof task !== 'object') { errors.push(`${at} 必须是对象`); continue; }
    if (typeof task.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(task.id)) {
      errors.push(`${at}.id 必须匹配 [A-Za-z0-9_-]+`);
      continue;
    }
    if (RESERVED_IDS.has(task.id)) {
      errors.push(`${at}.id 不能使用保留名：${task.id}`);
      continue;
    }
    if (ids.has(task.id)) { errors.push(`任务 id 重复：${task.id}`); continue; }
    ids.add(task.id);
    byId.set(task.id, task);
    if (typeof task.title !== 'string' || task.title.trim() === '') errors.push(`${task.id}.title 不能为空`);
    if (!Array.isArray(task.deps)) errors.push(`${task.id}.deps 必须是数组`);
    if (!nonEmptyStringArray(task.inputs)) errors.push(`${task.id}.inputs 必须是非空字符串数组`);
    if (!nonEmptyStringArray(task.outputs)) errors.push(`${task.id}.outputs 必须是非空字符串数组`);
    if (!Array.isArray(task.acceptance) || task.acceptance.length === 0) {
      errors.push(`${task.id}.acceptance 必须是非空数组`);
    } else {
      for (const ac of task.acceptance) {
        if (!acIds.has(ac)) errors.push(`${task.id}.acceptance 引用了不存在的验收项：${ac}`);
      }
    }
    const b = task.boundary;
    if (!b || typeof b !== 'object') {
      errors.push(`${task.id}.boundary 缺失`);
    } else {
      if (!nonEmptyStringArray(b.inScope)) errors.push(`${task.id}.boundary.inScope 必须是非空字符串数组`);
      if (!nonEmptyStringArray(b.outOfScope)) errors.push(`${task.id}.boundary.outOfScope 必须是非空字符串数组`);
      if (typeof b.stopWhen !== 'string' || b.stopWhen.trim() === '') errors.push(`${task.id}.boundary.stopWhen 不能为空`);
    }
    if (task.priority !== undefined && !Number.isFinite(task.priority)) errors.push(`${task.id}.priority 必须是数字`);
    if (task.estMinutes !== undefined && (!Number.isFinite(task.estMinutes) || task.estMinutes <= 0)) {
      errors.push(`${task.id}.estMinutes 必须是正数`);
    }
    if (task.worker !== undefined && !WORKERS.has(task.worker)) {
      errors.push(`${task.id}.worker 只能是 ${[...WORKERS].join('/')}`);
    }
  }

  for (const task of byId.values()) {
    if (!Array.isArray(task.deps)) continue;
    const seen = new Set();
    for (const dep of task.deps) {
      if (typeof dep !== 'string') { errors.push(`${task.id}.deps 含非字符串项`); continue; }
      if (seen.has(dep)) errors.push(`${task.id}.deps 重复依赖：${dep}`);
      seen.add(dep);
      if (dep === task.id) errors.push(`${task.id} 不能依赖自身`);
      else if (!byId.has(dep)) errors.push(`${task.id} 依赖了不存在的任务：${dep}`);
    }
  }

  // 每个全局验收项都必须被至少一个任务覆盖
  if (acIds.size > 0 && tasks.length > 0) {
    const covered = new Set();
    for (const task of byId.values()) {
      if (Array.isArray(task.acceptance)) {
        for (const ac of task.acceptance) if (acIds.has(ac)) covered.add(ac);
      }
    }
    for (const ac of acIds) {
      if (!covered.has(ac)) errors.push(`验收项 ${ac} 未被任何任务覆盖`);
    }
  }

  // 拓扑排序 + 环检测
  const order = [];
  const indegree = new Map();
  const children = new Map();
  for (const id of byId.keys()) {
    indegree.set(id, 0);
    children.set(id, []);
  }
  for (const task of byId.values()) {
    const deps = Array.isArray(task.deps) ? task.deps.filter((d) => byId.has(d)) : [];
    indegree.set(task.id, deps.length);
    for (const dep of deps) children.get(dep).push(task.id);
  }
  const queue = [...byId.keys()].filter((id) => indegree.get(id) === 0);
  while (queue.length > 0) {
    const id = queue.shift();
    order.push(id);
    for (const child of children.get(id)) {
      indegree.set(child, indegree.get(child) - 1);
      if (indegree.get(child) === 0) queue.push(child);
    }
  }
  if (order.length !== byId.size) {
    const cycle = [...byId.keys()].filter((id) => !order.includes(id));
    errors.push(`存在依赖环，涉及任务：${cycle.join(', ')}`);
  }

  // 写冲突与输入来源：并行任务不得写同一路径；读取他人产物必须声明依赖
  if (errors.length === 0) {
    const isAncestor = (a, b) => {
      const stack = [...(byId.get(b).deps || [])];
      const seen = new Set();
      while (stack.length) {
        const cur = stack.pop();
        if (cur === a) return true;
        if (seen.has(cur) || !byId.has(cur)) continue;
        seen.add(cur);
        stack.push(...(byId.get(cur).deps || []));
      }
      return false;
    };
    const outKey = (p) => {
      const normalized = path.normalize(p).replace(/\\/g, '/');
      return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    };
    const list = [...byId.values()];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const bKeys = new Set(b.outputs.map(outKey));
        const shared = a.outputs.filter((p) => bKeys.has(outKey(p)));
        if (shared.length && !isAncestor(a.id, b.id) && !isAncestor(b.id, a.id)) {
          errors.push(`${a.id} 与 ${b.id} 可能并行写同一路径：${shared.join(', ')}`);
        }
      }
    }

    const producers = new Map();
    for (const t of list) {
      for (const out of t.outputs) {
        const key = outKey(out);
        if (!producers.has(key)) producers.set(key, []);
        producers.get(key).push(t.id);
      }
    }
    for (const t of list) {
      for (const input of t.inputs) {
        for (const owner of producers.get(outKey(input)) || []) {
          if (owner !== t.id && !isAncestor(owner, t.id)) {
            errors.push(`${t.id} 的输入 ${input} 由 ${owner} 产出，但 ${owner} 不是其上游；请补充依赖`);
          }
        }
      }
    }
  }

  return { errors, order, maxParallel, maxRetries, byId, children };
}

function stateFileFor(planFile, opts) {
  return opts.state ? path.resolve(opts.state) : planFile.replace(/\.json$/i, '') + '.state.json';
}

function planFingerprint(plan) {
  return createHash('sha256').update(JSON.stringify(plan)).digest('hex').slice(0, 16);
}

function approvalIssue(plan, state) {
  const approval = state.approval;
  if (approval.status === 'changes_requested') return '人工确认要求修改，尚未重新通过';
  if (approval.status !== 'approved') return '尚未完成人工确认';
  if (approval.planHash !== planFingerprint(plan)) return '计划在确认后发生变更，旧确认已失效';
  return '';
}

function loadState(plan, file) {
  const state = existsSync(file) ? readJson(file, 'state 文件') : { tasks: {} };
  if (!state || typeof state !== 'object' || Array.isArray(state) ||
    !state.tasks || typeof state.tasks !== 'object' || Array.isArray(state.tasks)) {
    fail('state 文件根节点必须是含 tasks 对象的 JSON 对象');
  }
  for (const task of plan.tasks) {
    const cur = state.tasks[task.id] || {};
    state.tasks[task.id] = {
      status: STATUSES.has(cur.status) ? cur.status : 'pending',
      attempts: Number.isInteger(cur.attempts) && cur.attempts >= 0 ? cur.attempts : 0,
      failures: Number.isInteger(cur.failures) && cur.failures >= 0 ? cur.failures : 0,
      resets: Number.isInteger(cur.resets) && cur.resets >= 0 ? cur.resets : 0,
      lastError: typeof cur.lastError === 'string' ? cur.lastError : '',
      note: typeof cur.note === 'string' ? cur.note : '',
      updatedAt: typeof cur.updatedAt === 'string' ? cur.updatedAt : null,
    };
  }
  for (const id of Object.keys(state.tasks)) {
    if (!state.tasks[id] || !plan.tasks.some((t) => t.id === id)) delete state.tasks[id];
  }
  const raw = state.approval && typeof state.approval === 'object' && !Array.isArray(state.approval)
    ? state.approval : {};
  state.approval = {
    status: APPROVAL_STATUSES.has(raw.status) ? raw.status : 'pending',
    note: typeof raw.note === 'string' ? raw.note : '',
    planHash: typeof raw.planHash === 'string' ? raw.planHash : '',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
  };
  return state;
}

function saveState(state, file) {
  state.updatedAt = new Date().toISOString();
  try {
    writeFileSync(file, JSON.stringify(state, null, 2) + '\n', 'utf8');
  } catch (err) {
    fail(`无法写入状态文件：${file}\n  ${err.message}`);
  }
}

function loadAll(planFile) {
  const plan = readJson(planFile, 'plan 文件');
  const meta = validatePlan(plan);
  if (meta.errors.length) {
    for (const err of meta.errors) console.error(`✗ ${err}`);
    process.exit(1);
  }
  return { plan, meta };
}

function descendants(meta, id) {
  const result = [];
  const stack = [...(meta.children.get(id) || [])];
  const seen = new Set();
  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);
    result.push(cur);
    stack.push(...(meta.children.get(cur) || []));
  }
  return result;
}

function resetDoneDescendants(meta, state, taskId, now) {
  const reset = [];
  for (const id of descendants(meta, taskId)) {
    const ds = state.tasks[id];
    if (ds.status !== 'done') continue;
    ds.status = 'pending';
    ds.resets++;
    ds.updatedAt = now;
    ds.note = `被上游 ${taskId} 变更重置`;
    if (ds.resets > meta.maxRetries) {
      ds.status = 'blocked';
      ds.lastError = `被上游反复重置超过 ${meta.maxRetries} 次`;
    }
    reset.push(id);
  }
  return reset;
}

function displayWidth(text) {
  let width = 0;
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    width += (code >= 0x1100 && (code <= 0x115f || (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) || (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) || (code >= 0x1f300 && code <= 0x1f64f) ||
      (code >= 0x20000 && code <= 0x3fffd))) ? 2 : 1;
  }
  return width;
}

function pad(text, width) {
  const s = String(text);
  return s + ' '.repeat(Math.max(0, width - displayWidth(s)));
}

function countsOf(plan, state) {
  const counts = { pending: 0, running: 0, done: 0, blocked: 0 };
  for (const task of plan.tasks) counts[state.tasks[task.id].status]++;
  return counts;
}

function readyTasks(meta, state) {
  const ready = meta.order.filter((id) => {
    const st = state.tasks[id];
    if (st.status !== 'pending') return false;
    const task = meta.byId.get(id);
    return (task.deps || []).every((dep) => state.tasks[dep].status === 'done');
  });
  const index = new Map(meta.order.map((id, i) => [id, i]));
  return ready.sort((a, b) => {
    const pa = meta.byId.get(a).priority ?? Number.MAX_SAFE_INTEGER;
    const pb = meta.byId.get(b).priority ?? Number.MAX_SAFE_INTEGER;
    return pa === pb ? index.get(a) - index.get(b) : pa - pb;
  });
}

function cmdValidate(planFile) {
  const { plan, meta } = loadAll(planFile);
  const ac = plan.acceptance.length;
  console.log(`✓ 计划合法：${plan.tasks.length} 个任务 / ${ac} 个验收项 / 并发上限 ${meta.maxParallel} / 重试上限 ${meta.maxRetries}`);
  console.log(`  拓扑顺序：${meta.order.join(' → ')}`);
  const fanout = meta.order.filter((id) => (meta.byId.get(id).deps || []).length === 0);
  console.log(`  起始任务：${fanout.join(', ')}`);
}

function cmdNext(planFile, opts) {
  const { plan, meta } = loadAll(planFile);
  const stateFile = stateFileFor(planFile, opts);
  const state = loadState(plan, stateFile);
  const countsBefore = countsOf(plan, state);
  const ready = readyTasks(meta, state);
  const slots = Math.max(0, meta.maxParallel - countsBefore.running);
  const batch = ready.slice(0, slots);
  const gateIssue = approvalIssue(plan, state);

  if (opts.claim && batch.length > 0) {
    if (gateIssue) {
      fail(`执行前门禁未通过：${gateIssue}
  确认需求/DAG/验收/审查方案：approve <plan> --note "确认说明"
  需要修改：request-changes <plan> --note "修改点"，回到 P1/P2 修订后重新确认`);
    }
    const now = new Date().toISOString();
    for (const id of batch) {
      const st = state.tasks[id];
      st.status = 'running';
      st.attempts++;
      st.updatedAt = now;
    }
    saveState(state, stateFile);
  }

  const counts = countsOf(plan, state);
  const remaining = Math.max(0, meta.maxParallel - counts.running);
  const blocked = plan.tasks.filter((t) => state.tasks[t.id].status === 'blocked').map((t) => t.id);
  const allDone = counts.done === plan.tasks.length;

  if (opts.json) {
    const acById = new Map(plan.acceptance.map((a) => [a.id, a]));
    console.log(JSON.stringify({
      goal: plan.goal,
      deliverables: plan.deliverables,
      acceptance: plan.acceptance,
      batch: batch.map((id) => {
        const t = meta.byId.get(id);
        return {
          id,
          title: t.title,
          deps: t.deps,
          inputs: t.inputs,
          outputs: t.outputs,
          acceptance: t.acceptance,
          acceptanceDetails: t.acceptance.map((acId) => acById.get(acId)),
          boundary: t.boundary,
          priority: t.priority ?? null,
          estMinutes: t.estMinutes ?? null,
          worker: t.worker ?? 'build',
          attempts: state.tasks[id].attempts,
        };
      }),
      running: counts.running, slots: remaining, counts, blocked, allDone,
      approval: {
        status: state.approval.status,
        note: state.approval.note,
        planHash: state.approval.planHash,
        issue: gateIssue,
      },
    }, null, 2));
  } else {
    console.log(`进度：done ${counts.done}/${plan.tasks.length}，running ${counts.running}，pending ${counts.pending}，blocked ${counts.blocked}`);
    if (!allDone && gateIssue) {
      console.log(`⚠ 执行前门禁：${gateIssue}（先 approve；预览不会领取任务）`);
    }
    if (batch.length) {
      console.log(`本批${opts.claim ? '领取' : '就绪'} ${batch.length} 个（并发上限 ${meta.maxParallel}，剩余槽位 ${remaining}）：`);
      for (const id of batch) {
        const t = meta.byId.get(id);
        const st = state.tasks[id];
        const retry = st.failures > 0 ? `，第 ${st.failures}/${meta.maxRetries} 次重试` : '';
        console.log(`  - ${id}  ${t.title}  [attempts ${st.attempts}${retry}]`);
      }
    } else if (allDone) {
      console.log('✓ 全部任务已完成，进入验收与交付。');
    } else if (counts.running > 0) {
      const runningIds = plan.tasks.filter((t) => state.tasks[t.id].status === 'running').map((t) => t.id);
      console.log(`并发已占满（${runningIds.join(', ')} 在跑），等待收尾后再次 next。`);
      console.log('  若 worker 已中断：先 update <plan> <taskId> --status pending 重排。');
    } else {
      console.log('✗ 无就绪任务。');
    }
    if (blocked.length) console.log(`⚠ blocked 分支：${blocked.join(', ')}（不影响其他分支，需上报）`);
  }

  if (allDone) return 0;
  if (batch.length || counts.running > 0) return 0;
  if (blocked.length) return 2;
  return 3;
}

function cmdUpdate(planFile, taskId, opts) {
  if (!taskId) fail('用法：update <plan.json> <taskId> --status done|failed|running|pending');
  const status = opts.status;
  if (!['done', 'failed', 'running', 'pending'].includes(status)) {
    fail('--status 只能是 done / failed / running / pending');
  }
  const { plan, meta } = loadAll(planFile);
  if (!meta.byId.has(taskId)) fail(`任务不存在：${taskId}`);
  const stateFile = stateFileFor(planFile, opts);
  const state = loadState(plan, stateFile);
  const st = state.tasks[taskId];
  const task = meta.byId.get(taskId);
  const note = typeof opts.note === 'string' ? opts.note : '';
  const now = new Date().toISOString();
  if (st.status === 'blocked' && status !== 'pending') {
    fail(`${taskId} 处于 blocked，请先 update --status pending 重开后再执行`);
  }
  if (status === 'running' || status === 'done') {
    const issue = approvalIssue(plan, state);
    if (issue) fail(`执行门禁未通过：${issue}\n  先 approve 当前计划，或 request-changes 后回到 P1/P2 修订`);
  }
  const wasBlocked = st.status === 'blocked';
  const wasDone = st.status === 'done';
  const unfinishedDeps = (task.deps || []).filter((dep) => state.tasks[dep].status !== 'done');

  if (status === 'running') {
    if (unfinishedDeps.length) console.log(`⚠ 上游未完成：${unfinishedDeps.join(', ')}`);
    st.status = 'running';
    st.attempts++;
    if (note) st.note = note;
    if (wasDone) {
      const reset = resetDoneDescendants(meta, state, taskId, now);
      console.log(`↺ 重新执行已完成任务${reset.length ? `，下游已重置：${reset.join(', ')}` : ''}`);
    }
  } else if (status === 'done') {
    if (unfinishedDeps.length) console.log(`⚠ 上游未完成：${unfinishedDeps.join(', ')}，本次完成结果可能不可信`);
    st.status = 'done';
    st.lastError = '';
    if (note) st.note = note;
  } else if (status === 'pending') {
    st.status = 'pending';
    if (wasBlocked) { st.failures = 0; st.resets = 0; st.lastError = ''; }
    if (note) st.note = note;
    const reset = wasDone ? resetDoneDescendants(meta, state, taskId, now) : [];
    console.log(`✓ ${taskId} 已手动重开${wasBlocked ? '（失败/重置计数已清零）' : ''}` +
      `${reset.length ? `；下游已重置：${reset.join(', ')}` : ''}`);
  } else {
    st.failures++;
    st.lastError = note || '未提供失败原因';
    st.status = st.failures > meta.maxRetries ? 'blocked' : 'pending';
    const reset = resetDoneDescendants(meta, state, taskId, now);
    if (st.status === 'blocked') {
      console.log(`✗ ${taskId} 失败 ${st.failures} 次，已达重试上限 ${meta.maxRetries}，标记 blocked，需上报。`);
    } else {
      console.log(`↻ ${taskId} 失败（${st.failures}/${meta.maxRetries}），已回到 pending 待重试。`);
    }
    if (reset.length) console.log(`  下游已重置：${reset.join(', ')}`);
  }

  st.updatedAt = now;
  saveState(state, stateFile);
  const shown = st.lastError || st.note;
  console.log(`✓ ${taskId} → ${st.status}${shown ? `（${shown}）` : ''}`);
  return 0;
}

function cmdApprove(planFile, opts, status) {
  const { plan, meta } = loadAll(planFile);
  const stateFile = stateFileFor(planFile, opts);
  const state = loadState(plan, stateFile);
  const counts = countsOf(plan, state);
  const note = typeof opts.note === 'string' ? opts.note.trim() : '';
  const now = new Date().toISOString();

  if (status === 'changes_requested' && !note) {
    fail('request-changes 必须用 --note 写清需要修改的内容，否则无法回到需求分析');
  }
  if (counts.running > 0) {
    fail(`仍有任务处于 running，不能变更人工确认；先收敛运行中的任务再确认`);
  }

  if (status === 'changes_requested') {
    state.approval = { status, note, planHash: '', updatedAt: now };
    saveState(state, stateFile);
    console.log(`↩ 已记录修改意见，执行门禁保持关闭：${note}`);
    console.log('下一步：回到 P1/P2 修订 plan.json，validate 通过后重新 approve。');
    return 0;
  }

  const previousHash = state.approval.planHash;
  const planHash = planFingerprint(plan);
  state.approval = { status: 'approved', note, planHash, updatedAt: now };
  saveState(state, stateFile);
  console.log(`✓ 人工确认通过，执行门禁已解锁（计划指纹 ${planHash}）`);
  if (note) console.log(`  确认说明：${note}`);
  if (previousHash && previousHash !== planHash) {
    console.log('  计划在旧确认后发生过变更，本次确认对当前版本生效。');
  }
  const ready = readyTasks(meta, state);
  if (ready.length) console.log(`  当前就绪：${ready.slice(0, HARD_MAX_PARALLEL).join(', ')}`);
  else if (counts.done === plan.tasks.length) console.log('  全部任务已完成，无需再执行。');
  return 0;
}

function cmdStatus(planFile, opts) {
  const { plan, meta } = loadAll(planFile);
  const stateFile = stateFileFor(planFile, opts);
  const state = loadState(plan, stateFile);
  const counts = countsOf(plan, state);
  const ready = readyTasks(meta, state);
  const blocked = plan.tasks.filter((t) => state.tasks[t.id].status === 'blocked').map((t) => t.id);
  const allDone = counts.done === plan.tasks.length;
  const stalled = !allDone && ready.length === 0 && counts.running === 0 && blocked.length === 0;
  const gateIssue = approvalIssue(plan, state);

  if (opts.json) {
    console.log(JSON.stringify({
      goal: plan.goal, counts, ready, blocked, allDone, stalled,
      approval: {
        status: state.approval.status,
        note: state.approval.note,
        planHash: state.approval.planHash,
        issue: gateIssue,
      },
      tasks: plan.tasks.map((t) => ({ id: t.id, title: t.title, deps: t.deps, ...state.tasks[t.id] })),
    }, null, 2));
  } else {
    console.log(`目标：${plan.goal}`);
    const pct = Math.round((counts.done / plan.tasks.length) * 100);
    console.log(`进度：${counts.done}/${plan.tasks.length}（${pct}%）  running ${counts.running}  blocked ${counts.blocked}  pending ${counts.pending}`);
    if (!allDone) {
      if (gateIssue) console.log(`人工确认：${state.approval.status}（${gateIssue}）`);
      else console.log(`人工确认：approved${state.approval.note ? `（${state.approval.note}）` : ''}`);
    }
    console.log('');
    console.log(`  ${pad('ID', 6)}${pad('任务', 26)}${pad('状态', 9)}失败/重试  重置  备注`);
    for (const t of plan.tasks) {
      const s = state.tasks[t.id];
      const note = (s.lastError || s.note || '').replace(/\s+/g, ' ');
      const shortNote = displayWidth(note) > 40 ? note.slice(0, 20) + '…' : note;
      console.log(`  ${pad(t.id, 6)}${pad(t.title, 26)}${pad(s.status, 9)}` +
        `${pad(`${s.failures}/${meta.maxRetries}`, 10)}${pad(String(s.resets), 6)}${shortNote}`);
    }
    console.log('');
    if (ready.length) console.log(`就绪：${ready.join(', ')}`);
    if (blocked.length) console.log(`⚠ blocked：${blocked.join(', ')}`);
    if (allDone) console.log('✓ 全部任务完成，可进入验收与交付。');
    else if (stalled) console.log('✗ 停滞：无就绪、无运行、未完成，请检查依赖与计划。');
  }

  if (blocked.length) return 2;
  if (stalled) return 3;
  return 0;
}

function main() {
  const { positional, opts } = parseArgs(process.argv.slice(2));
  const [command, planFile, taskId] = positional;
  if (!command || !planFile) fail(USAGE);
  if (!existsSync(planFile)) fail(`plan 文件不存在：${planFile}`);
  switch (command) {
    case 'validate': return cmdValidate(planFile);
    case 'next': return cmdNext(planFile, opts);
    case 'update': return cmdUpdate(planFile, taskId, opts);
    case 'approve': return cmdApprove(planFile, opts, 'approved');
    case 'request-changes': return cmdApprove(planFile, opts, 'changes_requested');
    case 'status': return cmdStatus(planFile, opts);
    default: fail(`未知命令：${command}\n${USAGE}`);
  }
}

process.exitCode = main() ?? 0;
