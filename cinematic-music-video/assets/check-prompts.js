#!/usr/bin/env node
// check-prompts.js —— 「提示词块到底渲染出来没有」的静态自检闸门（零额度，纯 Node 内置模块 + render）
//
// 为什么要有它（HARDENING 坑位 75）：
//   2026-10-04《春风许我再少年》开关键帧试点，S04/S13 里出现了**两个女人**，
//   而分镜写的是 close-up / medium close-up。根因不是模型，是
//   `refHandlingBlock()` 拿到的是**字符串**数组 ["identity","identity","scene"]，
//   却按对象 `x.role` 去读 —— 字符串没有 .role，于是三个 if 全不进，
//   **逐图分工三行一行都没输出**，只留了最后一句通用话。
//   函数照常返回、断言不响、日志不报：一个纯静默的降级。
//   三张参考图（同一人的全身 + 面部特写 + 空场景）没有分工说明，
//   模型就把两张肖像当成两个人并排画了出来。
//
//   同一类 bug 的形态是固定的：**「本该注入一段话的函数，静默返回了空/半截」。**
//   它不会报错，只会画错，而且是在烧完 48 张关键帧之后才发现。
//   所以本工具在**烧额度之前**，把真实产出的提示词拆成块逐块断言。
//
// 用法：
//   node assets/check-prompts.js --project "<项目目录>"
//   node assets/check-prompts.js --project "<项目目录>" --json
//   node assets/check-prompts.js --selftest        # 内置自检，不需要项目
//
// 退出码：0 = 全部通过；1 = 有块缺失/退化（可直接当门禁接进流水线）
//
// 断言清单：
//   A. REFERENCE HANDLING —— 挂了 ≥2 张身份图时，必须出现"同一人不同角度、合并成一个人"的合并句，
//      且括号行数不得少于 身份+场景+通用 的应有条数（抓"静默少输出"）；
//   B. HAIR ORNAMENTS —— 身份锁里声明了头饰时，**脸部锚点 / 全身参考 / 关键帧**三处都要有同一段
//      （坑位 74：同一个配件被两类参考图各画一个版本）；
//   C. FRAMING —— 每个有 shot_size 的镜头都要带上正向景别句
//      （坑位 75 附：只写 "close-up" 三个字压不住全身参考的构图惯性，会被拽成远景）。

const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const getArg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const hasFlag = (n) => argv.includes(n);

const SKILL_LIB = path.join(__dirname, "..", "scripts", "lib");
const render = require(path.join(SKILL_LIB, "render"));
const assets = require(path.join(SKILL_LIB, "assets"));
const cli = require(path.join(SKILL_LIB, "cli"));

// ---------------------------------------------------------------------------
// 断言核心：喂 prompt 文本，返回 findings
// ---------------------------------------------------------------------------
function inspect(opts) {
  const { prompt, facePrompt, bodyPrompt, kfPrompts, hasOrnaments, ornamentProbe, identityRefCount } = opts;
  const bad = [];
  const ok = [];
  // A. 参考图分工块
  const rh = prompt.slice(prompt.indexOf("REFERENCE HANDLING"));
  const rhBody = rh.slice(0, rh.indexOf("\n\n") >= 0 ? rh.indexOf("\n\n") : rh.length);
  const bullets = (rhBody.match(/\n\s+•/g) || []).length;
  const mergeSentence = /ONE AND THE SAME individual/i.test(rhBody) || /same woman seen from different angles/i.test(prompt);
  if (identityRefCount >= 2 && !mergeSentence) {
    bad.push("REFERENCE HANDLING 缺'同一人不同角度'合并句 —— 多个身份参考会被画成多个人（坑位 75）");
  }
  if (identityRefCount >= 2 && bullets < 3) {
    bad.push(`REFERENCE HANDLING 只有 ${bullets} 条 •，应为 身份 + 合并 + 场景 + 通用 至少 3 条 —— 分工块疑似静默少输出（坑位 75）`);
  }
  if (!bad.length) ok.push(`REFERENCE HANDLING 分工块 ${bullets} 条 •，合并句${mergeSentence ? "在" : "缺"}`);

  // B. 头饰段三处同源
  if (hasOrnaments && ornamentProbe) {
    // 关键帧那一格必须用**角色镜**的提示词 —— kfPrompts[0] 往往是 S01 空镜，
    // 空镜本就不该有头饰段，用它检查必然误报。
    const spots = [
      ["脸部锚点", facePrompt],
      ["全身参考", bodyPrompt],
      ["关键帧", prompt],
    ];
    const missing = spots.filter(([, t]) => !t.includes(ornamentProbe)).map(([n]) => n);
    if (missing.length) bad.push(`头饰段未逐字出现在：${missing.join("、")} —— 同一配件会出现多个版本（坑位 74）`);
    else ok.push("头饰段在 脸部锚点 / 全身参考 / 关键帧 三处逐字一致");
  }

  // C. 景别句
  // 判据：FRAMING 那一行若是「关键词 + 句号」= 1 个句点（只有关键词），
  // 带上正向景别句后是 **2 个句点**。用长度/结尾判断都会误伤，因为两者都以 "." 结尾。
  const noClause = kfPrompts.filter((p) => {
    const i = p.indexOf("FRAMING:");
    if (i < 0) return true;
    const end = p.indexOf("\n", i);
    const line = p.slice(i, end >= 0 ? end : undefined);
    return (line.match(/\./g) || []).length < 2;
  });
  if (noClause.length) bad.push(`${noClause.length} 个镜头的 FRAMING 只有关键词、没有正向景别句 —— 会被全身参考拽成远景（坑位 75 附）`);
  else ok.push(`FRAMING 景别句覆盖 ${kfPrompts.length}/${kfPrompts.length}`);

  return { ok, bad };
}

// ---------------------------------------------------------------------------
// --selftest：用合成输入验证"抓得到退化"
// ---------------------------------------------------------------------------
function selftest() {
  const hoProbe = "HAIR ORNAMENTS";
  const good = inspect({
    prompt: "x\n\nREFERENCE HANDLING — each attached image has one job:\n  • a\n  • Those identity images all show ONE AND THE SAME individual.\n  • c\n  • d\n\nnext" +
      "\n" + hoProbe + "\nFRAMING: shot size close-up, camera angle eye level. The frame is cropped tight on the head and shoulders.",
    facePrompt: hoProbe, bodyPrompt: hoProbe,
    kfPrompts: [
      hoProbe + "\nFRAMING: shot size close-up, camera angle eye level. The frame is cropped tight on the head and shoulders.",
    ],
    hasOrnaments: true, ornamentProbe: hoProbe, identityRefCount: 2,
  });
  const degenerate = inspect({
    // 就是坑位 75 的真实形态：分工块只剩最后那句通用话
    prompt: "x\n\nREFERENCE HANDLING — each attached image has one job:\n  • NONE of the references may dictate this frame's shot size.\n\nnext" +
      "\nFRAMING: shot size close-up, camera angle eye level.",
    facePrompt: hoProbe, bodyPrompt: "",  // 全身参考丢了头饰（坑位 74 的原始形态）
    kfPrompts: ["FRAMING: shot size close-up, camera angle eye level."],
    hasOrnaments: true, ornamentProbe: hoProbe, identityRefCount: 2,
  });

  let fail = 0;
  if (good.bad.length) { console.error("x 自检失败：干净输入被误报 ——\n  " + good.bad.join("\n  ")); fail++; }
  else console.log(`✓ 干净输入通过（${good.ok.join("；")}）`);
  const EXPECT_DEGENERATE = 4; // 合并句 + 分工条数 + 头饰三处 + 景别句
  if (degenerate.bad.length !== EXPECT_DEGENERATE) {
    console.error(`x 自检失败：退化输入应报 ${EXPECT_DEGENERATE} 类问题，实报 ${degenerate.bad.length}`);
    degenerate.bad.forEach((b) => console.error("    - " + b));
    fail++;
  } else {
    console.log(`✓ 退化输入被抓住 ${EXPECT_DEGENERATE} 类：`);
    degenerate.bad.forEach((b) => console.log("    - " + b));
  }
  if (fail) process.exit(1);
  console.log("✓ check-prompts 自检通过");
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
function main() {
  if (hasFlag("--selftest")) return selftest();

  const projectDir = cli.resolveProjectDir(getArg("--project"));
  const project = cli.loadProject(projectDir);
  if (!project.storyboard || !fs.existsSync(project.storyboard)) {
    console.error(`x 找不到分镜：${project.storyboard}`);
    process.exit(2);
  }
  const sb = JSON.parse(fs.readFileSync(project.storyboard, "utf8"));
  const dir = cli.stageDir(projectDir, "images");
  const lockPath = path.join(dir, "character_lock.json");
  if (!fs.existsSync(lockPath)) {
    console.error(`x 找不到身份锁 ${lockPath}（先跑派生阶段）`);
    process.exit(2);
  }
  const id = JSON.parse(fs.readFileSync(lockPath, "utf8"));

  const ornamentProbe = (() => {
    const ho = render.headOrnamentBlock(id);
    return ho ? ho.slice(0, 80) : "";
  })();

  // 用**真实**的参考图装配函数求 roles，不再手写猜测。
  //
  // 教训（2026-10-04）：上一版这里按景别猜形状（tight ? ["identity"] : ...），
  // 结果 images.js 的空镜分支残留了一个已删除的旧变量（refAssets），
  // 闸门两版全绿、实跑第一步就 `images.js FAILED: refAssets is not defined`。
  // **猜出来的形状测不出真实装配链的错** —— 参考图是这条流水线里最容易断的一环，
  // 闸门必须走同一条代码路径。所以现在直接调 assets.pickShotRefs，
  // 它同时也是"每镜恒 1 张身份图 + 1 张地点盘"这条规则的唯一真源。
  const charAssets = assets.loadCharacterAssets(dir);
  const sceneAssets = assets.loadSceneAssets(dir, sb);

  const kfPrompts = [];
  let charShots = 0;
  let firstCharPrompt = "";
  let firstCharIdentityRefs = 0;

  for (const shot of sb.shots || []) {
    const names = Array.isArray(shot.characters_in_shot)
      ? shot.characters_in_shot.map((n) => String(n == null ? "" : n).trim()).filter(Boolean)
      : [];
    const hasCharacter = names.length > 0;
    if (hasCharacter) charShots++;
    const refs = assets.pickShotRefs(shot, charAssets, {
      hasCharacter,
      sceneRef: assets.sceneRefFor(shot, sceneAssets),
    });
    const refRoles = refs.roles;
    const p = render.buildKeyframePrompt(shot, sb, {
      identity: hasCharacter ? id : null,
      hasCharacter,
      refRoles,
      hasScene: refRoles.indexOf("scene") >= 0,
    });
    kfPrompts.push(p);
    // 参考图分工块 / 头饰段只对**角色镜**有意义：空镜本来就只有场景锚点一张参考。
    // 拿 kfPrompts[0]（往往是 S01 空镜）去检查会误报 —— 这正是第一版犯的错。
    if (hasCharacter && !firstCharPrompt) {
      firstCharPrompt = p;
      firstCharIdentityRefs = refRoles.filter((x) => x === "identity").length;
    }
  }

  const r = inspect({
    prompt: firstCharPrompt || kfPrompts[0] || "",
    facePrompt: render.buildFaceRefPrompt(id),
    bodyPrompt: render.buildAngleRefPrompt(id, "front"),
    kfPrompts,
    hasOrnaments: !!ornamentProbe,
    ornamentProbe,
    identityRefCount: firstCharIdentityRefs,
  });

  const result = { project: path.basename(projectDir), shots: (sb.shots || []).length, charShots, ...r };

  if (hasFlag("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`check-prompts — ${result.project}  ${result.shots} 镜（角色镜 ${charShots}）`);
    result.ok.forEach((s) => console.log("  ✓ " + s));
    result.bad.forEach((s) => console.log("  ✘ " + s));
  }
  process.exit(result.bad.length ? 1 : 0);
}

main();
