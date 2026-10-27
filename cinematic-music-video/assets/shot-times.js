// shot-times.js — 从 storyboard 算出"每镜该抽哪一帧"的时刻，供成片反向抽帧核验（SOP §4.4）
//
// 为什么要有它：抽帧时刻必须来自**故事板时间轴**（shot.start / shot.end），不能拍脑袋定
// （比如"取 60% 处"）。assemble 的槽位帧数是按故事板 duration 用最大余数法分配的，
// 所以 `(start+end)/2` 一定落在该镜自己的槽位内 —— 用别处算出来的时间会跨到隔壁镜。
//
// 用法:
//   node shot-times.js --project <项目目录>                      # 全部镜，取中点
//   node shot-times.js --project <dir> --ids S12,S26,S28         # 只算点名的镜
//   node shot-times.js --project <dir> --ratio 0.6               # 改取样比例（0=镜首,1=镜尾）
//   node shot-times.js --file <storyboard.json> --ids S02
//
// 输出（每行一条，可直接喂给 ffmpeg 循环）:
//   S12 82.04
//
// 典型用法（成片反向抽帧）:
//   node shot-times.js --project ./mv-x --ids S12,S26 > times.txt
//   while read id t; do ffmpeg -v error -y -ss "$t" -i 成片_字幕.mp4 -frames:v 1 "hit/$id.jpg"; done < times.txt
const fs = require("fs");
const path = require("path");

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : def;
}

const projectDir = arg("project", null);
let sbFile = arg("file", null);
if (!sbFile) {
  if (!projectDir) { console.error("必须给 --project <项目目录> 或 --file <storyboard.json>"); process.exit(2); }
  sbFile = path.join(projectDir, "01_plan", "storyboard.json");
}
const ratio = Number(arg("ratio", "0.5"));
const idsRaw = arg("ids", "");
const ids = idsRaw ? idsRaw.split(",").map((x) => x.trim()).filter(Boolean) : null;

if (!fs.existsSync(sbFile)) { console.error("找不到 storyboard: " + sbFile); process.exit(2); }
const sb = JSON.parse(fs.readFileSync(sbFile, "utf8"));
const shots = sb.shots || sb;
if (!Array.isArray(shots)) { console.error("storyboard 里没有 shots[]"); process.exit(2); }

let n = 0;
for (const s of shots) {
  const id = s.id || s.shot || s.shot_id;
  if (!id) continue;
  if (ids && !ids.includes(id)) continue;
  if (typeof s.start !== "number" || typeof s.end !== "number") continue;
  const t = (s.start + (s.end - s.start) * ratio).toFixed(2);
  console.log(id + " " + t);
  n++;
}
if (!n) { console.error("没有匹配到任何镜头（检查 --ids 写法，或 storyboard 结构）"); process.exit(1); }
