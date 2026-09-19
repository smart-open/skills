#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * Image Pipeline
 * =============
 * Seedream 5.0 Pro image generation pipeline.
 * Step 1: Generate individual portraits (i2i)
 * Step 2: Generate couple scene frames (multi-image2image)
 */

const fs = require("fs");
const path = require("path");
const { postImageGeneration, sleep } = require("./ark_client");

// ---- Utilities ----
function fileToBase64(filePath) {
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase().replace(".", "") || "jpeg";
  return "data:image/" + ext + ";base64," + buf.toString("base64");
}

async function downloadImage(url, outPath) {
  const https = require("https");
  const http = require("http");
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 300000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(downloadImage(res.headers.location, outPath));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("Download failed, HTTP " + res.statusCode)); }
      const chunks = [];
      let received = 0;
      res.on("data", (chunk) => { chunks.push(chunk); received += chunk.length; });
      res.on("end", () => {
        if (received === 0) return reject(new Error("Downloaded 0 bytes"));
        const buf = Buffer.concat(chunks, received);
        const fd = fs.openSync(outPath, "w");
        fs.writeSync(fd, buf, 0, received, 0);
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        try { fs.chmodSync(outPath, 0o444); } catch (e) {}
        resolve(received);
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(new Error("Download timed out")); });
  });
}

function injectCustomDesc(prompt, customDesc) {
  if (!customDesc) return prompt;
  // Insert custom description naturally into the prompt
  const insertPoint = prompt.lastIndexOf(". ");
  if (insertPoint > 0) {
    return prompt.slice(0, insertPoint + 2) +
      "The scene captures their personal story: " + customDesc + ". " +
      prompt.slice(insertPoint + 2);
  }
  return prompt + " The scene captures their personal story: " + customDesc + ".";
}

// ---- Step 1: Generate Portraits ----
async function generatePortraits(malePhotoPath, femalePhotoPath, dynasties, apiKey, options) {
  options = options || {};
  const customDesc = options.customDesc || "";
  const concurrency = options.concurrency || 3;
  const portraitsDir = options.portraitsDir;
  const state = options.state;

  console.log("\n=== Step 1: Generating portraits for " + dynasties.length + " dynasties ===");

  // Pre-encode photos to base64
  console.log("  Encoding photos to base64...");
  const maleBase64 = fileToBase64(malePhotoPath);
  const femaleBase64 = fileToBase64(femalePhotoPath);
  console.log("  Male photo: " + (maleBase64.length / 1024).toFixed(1) + "KB base64");
  console.log("  Female photo: " + (femaleBase64.length / 1024).toFixed(1) + "KB base64");

  const tasks = [];
  for (const d of dynasties) {
    tasks.push({ dynasty: d, gender: "male", base64: maleBase64 });
    tasks.push({ dynasty: d, gender: "female", base64: femaleBase64 });
  }

  // Process with concurrency limit
  const results = {};
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    await Promise.all(batch.map(async (task) => {
      const d = task.dynasty;
      const gender = task.gender;
      const base64 = task.base64;
      const isMale = gender === "male";

      // Check if already exists in state
      if (state.portraits && state.portraits[d.id] && state.portraits[d.id][gender]) {
        console.log("  [" + d.name + "] " + gender + " portrait already exists, skipping.");
        results[d.id + "_" + gender] = state.portraits[d.id][gender];
        return;
      }

      console.log("  [" + d.name + "] Generating " + gender + " portrait...");

      const prompt = isMale ? d.portraitPromptMale : d.portraitPromptFemale;
      // [方法论借鉴 short-drama-studio：identity-lock] 定妆照阶段即锁定身份：
      // 强调保留参考照片的面部特征，强识别特征（痣/疤等）必须原样保留
      const identityLock =
        " Keep the exact same facial features, face shape, eyes, nose, mouth and skin tone as the reference photo. " +
        "Any distinctive identifying marks (mole, scar) must be preserved exactly, no beautification, no face drift.";
      const payload = {
        model: "doubao-seedream-5-0-pro-260628",
        prompt: prompt + identityLock,
        image: base64,
        size: "1424x800",
      };
      // [方法论借鉴 short-drama-studio：固定 seed] 同 seed + 同描述可复现
      if (options.seed != null) payload.seed = Number(options.seed);

      try {
        const res = await postImageGeneration(payload, apiKey);
        const imageUrl = res.data && res.data[0] && res.data[0].url;
        if (!imageUrl) {
          throw new Error("No image URL in response: " + JSON.stringify(res).slice(0, 500));
        }

        const outPath = path.join(portraitsDir, d.id + "_" + gender + ".jpg");
        await downloadImage(imageUrl, outPath);

        const info = { localPath: outPath, url: imageUrl };
        if (!state.portraits) state.portraits = {};
        if (!state.portraits[d.id]) state.portraits[d.id] = {};
        state.portraits[d.id][gender] = info;
        results[d.id + "_" + gender] = info;

        console.log("  [" + d.name + "] " + gender + " portrait saved: " + outPath);
      } catch (e) {
        console.error("  [" + d.name + "] " + gender + " portrait FAILED: " + e.message.split("\n")[0]);
        if (!state.errors) state.errors = {};
        if (!state.errors[d.id]) state.errors[d.id] = {};
        state.errors[d.id][gender] = e.message;
      }
    }));
  }

  console.log("=== Portraits generation complete ===");
  return results;
}

// ---- Step 2: Generate Scene Frames ----
async function generateSceneFrames(dynasties, apiKey, options) {
  options = options || {};
  const customDesc = options.customDesc || "";
  const concurrency = options.concurrency || 3;
  const portraitsDir = options.portraitsDir;
  const scenesDir = options.scenesDir;
  const state = options.state;

  console.log("\n=== Step 2: Generating couple scene frames ===");

  const tasks = [];
  for (const d of dynasties) {
    // Check if already exists
    if (state.scenes && state.scenes[d.id]) {
      console.log("  [" + d.name + "] Scene frame already exists, skipping.");
      continue;
    }
    tasks.push(d);
  }

  if (tasks.length === 0) {
    console.log("  All scene frames already exist.");
    return;
  }

  // Process with concurrency limit
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    await Promise.all(batch.map(async (d) => {
      console.log("  [" + d.name + "] Generating couple scene...");

      // Read portrait files
      const malePortraitPath = state.portraits[d.id].male.localPath;
      const femalePortraitPath = state.portraits[d.id].female.localPath;
      const maleBase64 = fileToBase64(malePortraitPath);
      const femaleBase64 = fileToBase64(femalePortraitPath);

      const prompt = injectCustomDesc(d.couplePrompt, customDesc) +
        // [方法论借鉴 short-drama-studio：identity-lock] 双人场景阶段继续锁定身份：
        // 男女面容必须与两张参考肖像一致，且两人脸在整幅画面中保持不变
        " The man and the woman must keep the exact same facial features, face shape and skin tone as their respective reference portrait photos; " +
        "both faces stay consistent throughout the frame, no beautification, no face drift, no extra people.";

      const payload = {
        model: "doubao-seedream-5-0-pro-260628",
        prompt: prompt,
        image: [maleBase64, femaleBase64],
        size: "1424x800",
      };
      // [方法论借鉴 short-drama-studio：固定 seed] 同 seed + 同描述可复现
      if (options.seed != null) payload.seed = Number(options.seed);

      try {
        const res = await postImageGeneration(payload, apiKey);
        const imageUrl = res.data && res.data[0] && res.data[0].url;
        if (!imageUrl) {
          throw new Error("No image URL in response: " + JSON.stringify(res).slice(0, 500));
        }

        const outPath = path.join(scenesDir, d.id + "_scene.jpg");
        await downloadImage(imageUrl, outPath);

        const info = { localPath: outPath, url: imageUrl };
        if (!state.scenes) state.scenes = {};
        state.scenes[d.id] = info;

        console.log("  [" + d.name + "] Scene saved: " + outPath);
      } catch (e) {
        console.error("  [" + d.name + "] Scene generation FAILED: " + e.message.split("\n")[0]);
        if (!state.errors) state.errors = {};
        state.errors[d.id + "_scene"] = e.message;
      }
    }));
  }

  console.log("=== Scene frames generation complete ===");
}

module.exports = {
  generatePortraits,
  generateSceneFrames,
};
