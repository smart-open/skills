# Task DAG 规格（plan.json / plan.state.json）

## 1. plan.json 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `version` | number | 是 | 固定 `1` |
| `goal` | string | 是 | 一句话结果目标 |
| `deliverables` | string[] | 是 | 交付物路径/名称清单 |
| `acceptance` | object[] | 是 | 全局验收项，见下表 |
| `tasks` | object[] | 是 | 任务节点，见下表 |
| `maxParallel` | number | 否 | 并发上限，默认 3，**硬上限 3**，超过校验失败 |
| `maxRetries` | number | 否 | 单任务重试上限，默认 5，硬上限 5 |
| `assumptions` | string[] | 否 | P1 中做出的假设 |
| `openQuestions` | string[] | 否 | 未阻塞执行的待确认问题 |

### acceptance 项

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | `AC1` 形式，全局唯一 |
| `criterion` | 是 | 可观测判据（数值/字段/状态/文件） |
| `method` | 是 | 验证方法（命令、读取路径、对比对象） |
| `evidence` | 否 | 验收时应附的证据形式 |

### task 节点

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | `[A-Za-z0-9_-]+`，全局唯一 |
| `title` | 是 | 动作型标题 |
| `deps` | 是 | 上游任务 id 数组，可为空；不得自依赖/重复 |
| `inputs` | 是 | 输入路径或上游产物说明，非空 |
| `outputs` | 是 | 输出路径，非空；并行任务不得重叠写同一文件 |
| `acceptance` | 是 | 覆盖的 AC id 数组，非空，且必须在全局 acceptance 中存在 |
| `boundary` | 是 | 见下 |
| `priority` | 否 | 数字小者先派发，默认按数组顺序 |
| `estMinutes` | 否 | 机械时间估算，用于关键路径判断 |
| `worker` | 否 | `research` / `plan` / `build` / `review`，默认 `build` |

### boundary

| 字段 | 必填 | 说明 |
|------|------|------|
| `inScope` | 是 | 必须做的事，非空 |
| `outOfScope` | 是 | 明确不做的事，非空 |
| `stopWhen` | 是 | 停止条件（可观测） |

> 所有交付物写入 run 目录；run 目录默认 `<cwd>/out/superagent-<主题>/`，项目整体（plan/state/work/assets/out/report）随目录一起落位。`outputs` 使用相对 run 目录或绝对路径，禁止写回技能安装目录。
>
> **输入依赖**：若 `inputs` 中某项与另一任务的 `outputs` 精确相同（路径规范化后），该任务必须直接或传递依赖产出者；否则 `validate` 退出 1，报「读取他人产物但未声明依赖」。外部资料、URL、环境变量等非任务产物不受此限制。
>
> **分离生成与排版**：底图只依赖提示词与 API 规范，版式/文案迭代走本地渲染；不要为了复用底图而删除真实输入依赖，改为拆分节点。

## 2. plan.state.json 字段

由脚本维护，路径默认 `plan.json` → `plan.state.json`（可用 `--state` 覆盖）。

```json
{
  "updatedAt": "2026-11-18T10:00:00.000Z",
  "approval": {
    "status": "approved",
    "note": "需求、DAG、验收与审查方案已确认",
    "planHash": "3f2a9c1b7d4e5a60",
    "updatedAt": "2026-11-18T09:00:00.000Z"
  },
  "tasks": {
    "T1": {
      "status": "done",
      "attempts": 1,
      "failures": 0,
      "resets": 0,
      "lastError": "",
      "note": "产物与证据摘要",
      "updatedAt": "2026-11-18T09:30:00.000Z"
    }
  }
}
```

| 字段 | 说明 |
|------|------|
| `approval` | 人工确认记录，见第 3 节 |
| `status` | `pending` / `running` / `done` / `blocked` |
| `attempts` | 领取执行的次数（`running` 时 +1） |
| `failures` | 失败次数，决定是否 blocked |
| `resets` | 被上游失败/变更重置的次数 |
| `lastError` | 最近一次失败说明 |
| `note` | 最近一次回报摘要（产物路径 + 证据） |

## 3. 人工确认门禁（approval）

```json
"approval": {
  "status": "pending | approved | changes_requested",
  "note": "人工确认说明或修改点",
  "planHash": "当前计划 SHA-256 前 16 位，仅 approved 时有值",
  "updatedAt": "2026-11-18T09:00:00.000Z"
}
```

| 操作 | 前置条件 | 结果 |
|------|----------|------|
| `approve --note "..."` | 无 `running` 任务 | `status=approved`，记录当前 `planHash` 与时间 |
| `request-changes --note "..."` | 必须带 `--note`，无 `running` 任务 | `status=changes_requested`，清空 `planHash` |
| `next --claim` | `approved` 且指纹与当前 plan 一致 | 允许领取；否则退出 1 |
| `update --status running\|done` | 同上 | 允许；否则退出 1 |
| `next`（预览）/ `status` | 无限制 | 只读；输出中带 `approval.status` 与 `issue` |

- 指纹计算：`sha256(JSON.stringify(plan))` 取前 16 位。空白格式变化不影响；对象键顺序变化会改变指纹，视为计划变更。
- 计划内容任何变更都会让旧 `planHash` 失配，`approvalIssue` 返回「计划在确认后发生变更，旧确认已失效」，必须重新 `approve`。
- 重新确认前先判断变更是否影响已完成任务：若影响，按 P3/P5 重开相关上游，由脚本重置其已完成下游，避免旧结果拼新计划。
- `request-changes` 记录后回到 P1/P2 修订，重新 `validate`，再 `approve`；期间 `next --claim` 与置 done/running 均被拒绝。
- 有任务 `running` 时 `approve` / `request-changes` 都拒绝（退出 1），避免执行中途换规格；先收敛当前批次。
- 全部任务完成后 `status` 不再打印门禁提示，但确认记录保留。

## 4. 状态机

```text
pending --claim(attempts++)--> running
running --done---------------> done
running --failed(failures++)-> pending          （failures ≤ maxRetries）
running --failed(failures++)-> blocked          （failures  > maxRetries）
done --上游失败 / 人工重开--> pending            （resets++，传递闭包）
blocked --人工 update pending--> pending        （唯一允许离开 blocked 的转移；失败/重置计数清零）
```

- `blocked` 除 `pending` 外拒绝其他 update 操作，需先重开。
- 重置只作用于「失败任务的传递下游」，且只把 `done` 改回 `pending`；已经 `blocked` 的下游保持 blocked（其自身预算已耗尽），在 report 中标注「结果可能过期」。
- `running` 的任务不会因上游失败被重置（调度器保证上游失败时下游尚未启动）。
- worker 中断会让任务停留在 `running`，`next` 不会重复派发；确认无活跃 worker 后执行 `update <taskId> --status pending` 重排。
- 同一 plan 只允许一个编排者进程操作；脚本不做跨进程锁。

## 5. 就绪与取批算法

`next`：

1. `ready = tasks.filter(status == pending && deps 全部 done)`；
2. 按 `priority` 升序（同优先级按 plan 数组顺序）排序；
3. `slots = maxParallel - running 数`；
4. `batch = ready.slice(0, max(0, slots))`；
5. 带 `--claim` 时先检查人工确认门禁，再对 batch 置 `running` 并 `attempts+1`，落盘后输出；不带则只预览。

停滞判定：`batch 为空 && running == 0 && 未全部完成` → 存在 blocked 则退出码 2，否则退出码 3。

## 6. 失败与重置算法

```text
update T --status failed --note 原因：
  failures++
  lastError = 原因
  if failures > maxRetries: status = blocked; 打印「已达重试上限，等待上报」
  else: status = pending; 打印「第 failures/maxRetries 次重试」
  for d in descendants(T):
    if d.status == done:
      d.status = pending; d.resets++
      if d.resets > maxRetries: d.status = blocked; 记录原因「被上游反复重置」
```

`descendants` 为传递闭包（BFS 反向边）。失败任务本身不计入 `resets`。
重开 `done` 任务（置 running 或 pending）同样执行上述下游重置；重开 `blocked` 任务会清零 failures 与 resets，给予新的预算。

## 7. 退出码

| 码 | 含义 |
|----|------|
| 0 | 正常（校验通过 / 有可执行批次或正在运行 / 全部完成 / 确认记录成功） |
| 1 | 计划非法、参数错误、文件不存在、门禁拒绝（未确认/确认失效/运行中变更） |
| 2 | `next`：无就绪批次且存在 blocked；`status`：存在任意 blocked |
| 3 | 停滞：无就绪、无运行、未完成且无 blocked（依赖无法满足） |

## 8. 计划模板

```json
{
  "version": 1,
  "goal": "为 X 交付 Y",
  "deliverables": ["out/report.md"],
  "maxParallel": 3,
  "maxRetries": 5,
  "assumptions": ["用户默认使用当前 cwd"],
  "openQuestions": [],
  "acceptance": [
    {
      "id": "AC1",
      "criterion": "report.md 包含 5 个章节且总行数 ≥80",
      "method": "grep '^## ' out/report.md | wc -l",
      "evidence": "命令输出截图/文本"
    }
  ],
  "tasks": [
    {
      "id": "T1",
      "title": "收集输入资料",
      "deps": [],
      "inputs": ["用户提供的链接与文件"],
      "outputs": ["work/T1-notes.md"],
      "acceptance": ["AC1"],
      "boundary": {
        "inScope": ["整理事实与出处"],
        "outOfScope": ["写最终结论"],
        "stopWhen": "每个事实均有来源"]
      },
      "priority": 1,
      "estMinutes": 15,
      "worker": "research"
    },
    {
      "id": "T2",
      "title": "撰写报告",
      "deps": ["T1"],
      "inputs": ["work/T1-notes.md"],
      "outputs": ["out/report.md"],
      "acceptance": ["AC1"],
      "boundary": {
        "inScope": ["按模板成文"],
        "outOfScope": ["编造未核实数据"],
        "stopWhen": "模板章节齐全且证据可追溯"]
      },
      "priority": 2,
      "estMinutes": 30,
      "worker": "build"
    }
  ]
}
```

## 9. 使用顺序

```bash
node scripts/superagent.mjs validate <run-dir>/plan.json
node scripts/superagent.mjs approve <run-dir>/plan.json --note "需求/DAG/验收/审查方案已确认"
node scripts/superagent.mjs next <run-dir>/plan.json --claim
node scripts/superagent.mjs update <run-dir>/plan.json T1 --status done --note "work/T1-notes.md；3 个来源"
node scripts/superagent.mjs status <run-dir>/plan.json
# 需要修改时（无 running 任务）：
node scripts/superagent.mjs request-changes <run-dir>/plan.json --note "修改点"   # 回到 P1/P2
```

`status` 只读；`next` 不带 `--claim` 时也只读。所有写操作都会更新 `plan.state.json` 的 `updatedAt`。
`--claim` 与 `update --status running` 二选一，重复执行会让 `attempts` 双计。
`next --json` 的 batch 项包含 `id/title/deps/inputs/outputs/acceptance/acceptanceDetails/boundary/priority/estMinutes/worker/attempts`，根级含 `goal/deliverables/acceptance` 与 `approval`，可直接拼装 worker brief。
