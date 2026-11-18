import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHED = join(HERE, 'superagent.mjs');
const ROOT = mkdtempSync(join(tmpdir(), 'superagent-smoke-'));
let passed = 0;
let failed = 0;

function check(cond, label) {
  if (cond) {
    passed++;
    console.log(`✓ ${label}`);
  } else {
    failed++;
    console.log(`✗ ${label}`);
  }
}

function run(args) {
  const r = spawnSync(process.execPath, [SCHED, ...args], { encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

function writePlan(name, tasks, extra = {}) {
  const file = join(ROOT, name);
  writeFileSync(file, JSON.stringify({
    version: 1,
    goal: 'smoke',
    deliverables: ['out/x.md'],
    acceptance: [{ id: 'AC1', criterion: 'fixture', method: 'fixture' }],
    tasks,
    ...extra,
  }, null, 2), 'utf8');
  return file;
}

function task(id, deps, output, extra = {}) {
  return {
    id,
    title: `task ${id}`,
    deps,
    inputs: ['inputs/x.md'],
    outputs: [output],
    acceptance: ['AC1'],
    boundary: { inScope: ['do'], outOfScope: ['no'], stopWhen: 'ok' },
    ...extra,
  };
}

function parseNext(file, args) {
  const r = run(['next', file, ...args]);
  let json = null;
  try { json = JSON.parse(r.out); } catch { /* 保持 null 让断言失败 */ }
  return { ...r, json };
}

function statusOf(file) {
  const r = run(['status', file, '--json']);
  let json = null;
  try { json = JSON.parse(r.out); } catch { /* 保持 null 让断言失败 */ }
  return { ...r, json };
}

try {
  const happy = writePlan('happy.json', [
    task('S1', [], 'out/a.md'),
    task('S2', [], 'out/b.md'),
    task('S3', ['S1', 'S2'], 'out/c.md'),
  ]);

  check(run(['validate', happy]).status === 0, '合法计划校验通过');
  const preview = parseNext(happy, ['--json']);
  check(preview.json?.batch.length === 2 && preview.json.counts.pending === 3, '优先派发两个无依赖任务');
  check(preview.json?.batch[0].inputs?.length > 0 && preview.json.batch[0].boundary, 'JSON 批次包含完整 brief 字段');
  check(preview.json?.batch[0].acceptanceDetails?.[0]?.criterion === 'fixture', 'JSON 批次解析出验收判据');
  check(preview.json?.goal === 'smoke' && Array.isArray(preview.json.deliverables), 'JSON 批次带 plan 目标与交付物');
  check(preview.status === 0 && preview.json?.approval?.status === 'pending', '未确认时预览仍可查看但标记 pending');

  check(run(['next', happy, '--claim']).status === 1, '未人工确认时 claim 被门禁拒绝');
  check(run(['update', happy, 'S1', '--status', 'done']).status === 1, '未人工确认时置 done 被门禁拒绝');
  check(run(['request-changes', happy]).status === 1, 'request-changes 缺少说明退出 1');
  check(run(['request-changes', happy, '--note', '补充统计口径']).status === 0, 'request-changes 记录修改意见');
  check(statusOf(happy).json?.approval.status === 'changes_requested', 'status 显示 changes_requested');
  check(run(['next', happy, '--claim']).status === 1, '要求修改后 claim 仍被拒绝');
  check(run(['approve', happy, '--note', '需求与验收已确认']).status === 0, 'approve 解锁门禁');
  check(statusOf(happy).json?.approval.status === 'approved', 'status 显示 approved');

  const claimed = parseNext(happy, ['--claim', '--json']);
  check(claimed.json?.running === 2 && claimed.json.batch.every((t) => t.attempts === 1), 'claim 后 running/attempts 正确');
  check(run(['request-changes', happy, '--note', '跑起来后改需求']).status === 1, '运行中拒绝变更人工确认');
  run(['update', happy, 'S1', '--status', 'done']);
  run(['update', happy, 'S2', '--status', 'done']);
  const third = parseNext(happy, ['--claim', '--json']);
  check(third.json?.batch[0]?.id === 'S3', '依赖完成后才派发 S3');
  run(['update', happy, 'S3', '--status', 'done']);
  const doneState = statusOf(happy);
  check(doneState.status === 0 && doneState.json?.allDone === true, '全部完成后 status 退出 0');

  const gate = writePlan('gate.json', [
    task('G1', [], 'out/g1.md'),
  ]);
  check(run(['approve', gate, '--note', '确认']).status === 0, '确认后记录计划指纹');
  writePlan('gate.json', [task('G1', [], 'out/g1.md')], { goal: 'smoke-changed' });
  check(run(['next', gate, '--claim']).status === 1, '计划在确认后变更则旧确认失效');
  check(run(['approve', gate, '--note', '按变更后计划重新确认']).status === 0, '变更后可重新确认');
  const gateClaim = parseNext(gate, ['--claim', '--json']);
  check(gateClaim.json?.running === 1, '重新确认后恢复领取');

  const chain = writePlan('chain.json', [
    task('F1', [], 'out/f1.md'),
    task('F2', ['F1'], 'out/f2.md'),
    task('F3', ['F2'], 'out/f3.md'),
  ], { maxRetries: 1 });
  run(['approve', chain, '--note', '确认']);
  run(['next', chain, '--claim']);
  run(['update', chain, 'F1', '--status', 'done']);
  run(['next', chain, '--claim']);
  run(['update', chain, 'F2', '--status', 'done']);
  run(['next', chain, '--claim']);
  run(['update', chain, 'F3', '--status', 'done']);

  run(['update', chain, 'F2', '--status', 'failed', '--note', 'boom']);
  let state = statusOf(chain).json;
  const f2 = state.tasks.find((t) => t.id === 'F2');
  const f3 = state.tasks.find((t) => t.id === 'F3');
  check(f2.status === 'pending' && f2.failures === 1, '失败回到 pending 并计 failures');
  check(f3.status === 'pending' && f3.resets === 1, '失败重置已完成下游并计 resets');

  run(['update', chain, 'F2', '--status', 'failed', '--note', 'again']);
  state = statusOf(chain).json;
  check(state.tasks.find((t) => t.id === 'F2').status === 'blocked', '超过重试上限进入 blocked');
  check(run(['status', chain]).status === 2, '存在 blocked 时 status 退出 2');
  check(run(['update', chain, 'F2', '--status', 'done']).status === 1, 'blocked 任务拒绝直接置 done');
  run(['update', chain, 'F2', '--status', 'pending']);
  state = statusOf(chain).json;
  const reopened = state.tasks.find((t) => t.id === 'F2');
  check(reopened.status === 'pending' && reopened.failures === 0 && reopened.resets === 0, '重开 blocked 清零失败/重置计数');

  const cycle = writePlan('cycle.json', [
    task('X', ['Y'], 'out/x1.md'),
    task('Y', ['X'], 'out/x2.md'),
  ]);
  check(run(['validate', cycle]).status === 1, '依赖环校验失败退出 1');

  const resetCap = writePlan('reset-cap.json', [
    task('R1', [], 'out/r1.md'),
    task('R2', ['R1'], 'out/r2.md'),
  ], { maxRetries: 1 });
  run(['approve', resetCap, '--note', '确认']);
  run(['next', resetCap, '--claim']);
  run(['update', resetCap, 'R1', '--status', 'done']);
  run(['next', resetCap, '--claim']);
  run(['update', resetCap, 'R2', '--status', 'done']);
  run(['update', resetCap, 'R1', '--status', 'pending']);
  run(['next', resetCap, '--claim']);
  run(['update', resetCap, 'R1', '--status', 'done']);
  run(['next', resetCap, '--claim']);
  run(['update', resetCap, 'R2', '--status', 'done']);
  run(['update', resetCap, 'R1', '--status', 'pending']);
  state = statusOf(resetCap).json;
  check(state.tasks.find((t) => t.id === 'R2').status === 'blocked', '下游被反复重置超过上限进入 blocked');

  const conflict = writePlan('conflict.json', [
    task('C1', [], './work/a.md'),
    task('C2', [], 'work/a.md'),
  ]);
  check(run(['validate', conflict]).status === 1, '规范化路径冲突校验失败退出 1');

  const missingDep = writePlan('missing-dep.json', [
    task('M1', [], 'work/m1.md'),
    task('M2', [], 'work/m2.md', { inputs: ['work/m1.md'] }),
  ]);
  check(run(['validate', missingDep]).status === 1, '读取他人产物但未声明依赖时校验失败退出 1');

  const declaredDep = writePlan('declared-dep.json', [
    task('D1', [], 'work/d1.md'),
    task('D2', ['D1'], 'work/d2.md', { inputs: ['work/d1.md'] }),
  ]);
  check(run(['validate', declaredDep]).status === 0, '声明上游依赖后可读取其产物');
} finally {
  rmSync(ROOT, { recursive: true, force: true });
}

console.log('');
console.log(failed === 0 ? `✓ smoke 通过：${passed} 项` : `✗ smoke 失败：${failed} 项，通过 ${passed} 项`);
process.exitCode = failed === 0 ? 0 : 1;
