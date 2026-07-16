#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * Video Pipeline
 * =============
 * Seedance 2.0 video generation pipeline.
 * Submit tasks → poll status → download videos.
 */

const fs = require("fs");
const path = require("path");
const { submitVideoTask, queryVideoTask, sleep } = require("./ark_client");

const https = require("https");
const http = require("http");

// ---- Download helper ----
async function downloadFile(url, outPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 300000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(downloadFile(res.headers.location, outPath));
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

// ---- Build content array based on mode ----
function buildContent(dynasty, sceneUrl, portraitUrls, mode, customDesc) {
  const content = [];

  // Text prompt (always included)
  let textPrompt = dynasty.videoPrompt;
  if (customDesc) {
    textPrompt += " Their personal love story: " + customDesc + ".";
  }
  content.push({ type: "text", text: textPrompt });

  switch (mode) {
    case "first-frame":
      content.push({
        type: "image_url",
        image_url: { url: sceneUrl },
        role: "first_frame"
      });
      break;

    case "first-last-frame":
      content.push({
        type: "image_url",
        image_url: { url: sceneUrl },
        role: "first_frame"
      });
      // For last frame, we can use the same scene or a different ending scene
      // Using the same scene for now (can be enhanced later)
      content.push({
        type: "image_url",
        image_url: { url: sceneUrl },
        role: "last_frame"
      });
      break;

    case "multimodal":
      // Use portraits as reference images
      if (portraitUrls && portraitUrls.male) {
        content.push({
          type: "image_url",
          image_url: { url: portraitUrls.male },
          role: "reference_image"
        });
      }
      if (portraitUrls && portraitUrls.female) {
        content.push({
          type: "image_url",
          image_url: { url: portraitUrls.female },
          role: "reference_image"
        });
      }
      content.push({
        type: "image_url",
        image_url: { url: sceneUrl },
        role: "first_frame"
      });
      break;

    case "portrait-reference":
      if (portraitUrls && portraitUrls.male) {
        content.push({
          type: "image_url",
          image_url: { url: portraitUrls.male },
          role: "reference_image"
        });
      }
      if (portraitUrls && portraitUrls.female) {
        content.push({
          type: "image_url",
          image_url: { url: portraitUrls.female },
          role: "reference_image"
        });
      }
      break;

    case "text2video":
      // Text only, no images
      break;

    default:
      throw new Error("Unknown mode: " + mode);
  }

  return content;
}

// ---- Submit video tasks ----
async function submitVideoTasks(dynasties, apiKey, options) {
  options = options || {};
  const mode = options.mode || "first-frame";
  const videoModel = options.videoModel || "doubao-seedance-2-0-260128";
  const duration = options.duration || 8;
  const ratio = options.ratio || "16:9";
  const resolution = options.resolution || "720p";
  const generateAudio = options.generateAudio === true;
  const returnLastFrame = options.returnLastFrame !== false;
  const customDesc = options.customDesc || "";
  const state = options.state;

  console.log("\n=== Step 3: Submitting video generation tasks ===");
  console.log("  Mode: " + mode);
  console.log("  Model: " + videoModel);
  console.log("  Duration: " + duration + "s");
  console.log("  Ratio: " + ratio);

  const tasks = [];
  for (const d of dynasties) {
    // Check if already exists
    if (state.videos && state.videos[d.id] && state.videos[d.id].taskId) {
      console.log("  [" + d.name + "] Video task already submitted, skipping.");
      continue;
    }

    const sceneUrl = state.scenes[d.id].url;
    const portraitUrls = state.portraits[d.id] ? {
      male: state.portraits[d.id].male ? state.portraits[d.id].male.url : null,
      female: state.portraits[d.id].female ? state.portraits[d.id].female.url : null,
    } : null;

    const content = buildContent(d, sceneUrl, portraitUrls, mode, customDesc);

    const payload = {
      model: videoModel,
      content: content,
      duration: duration,
      ratio: ratio,
      resolution: resolution,
      generate_audio: generateAudio,
      return_last_frame: returnLastFrame,
    };

    // Filter out parameters not supported by mini/fast models
    if (videoModel.includes("mini") || videoModel.includes("fast")) {
      delete payload.resolution;
    }

    tasks.push({ dynasty: d, payload: payload });
  }

  // Submit tasks sequentially (to avoid overwhelming the API)
  for (const task of tasks) {
    const d = task.dynasty;
    console.log("  [" + d.name + "] Submitting video task...");

    try {
      const res = await submitVideoTask(task.payload, apiKey);
      const taskId = res.id;
      if (!taskId) {
        throw new Error("No task ID in response: " + JSON.stringify(res).slice(0, 500));
      }

      if (!state.videos) state.videos = {};
      state.videos[d.id] = {
        taskId: taskId,
        status: "submitted",
        submittedAt: Date.now(),
      };

      console.log("  [" + d.name + "] Task submitted: " + taskId);
    } catch (e) {
      console.error("  [" + d.name + "] Task submission FAILED: " + e.message.split("\n")[0]);
      if (!state.errors) state.errors = {};
      state.errors[d.id + "_video_submit"] = e.message;
    }
  }

  console.log("=== Video tasks submission complete ===");
}

// ---- Poll and download ----
async function pollAndDownload(dynasties, apiKey, options) {
  options = options || {};
  const videosDir = options.videosDir;
  const lastFramesDir = options.lastFramesDir;
  const state = options.state;

  console.log("\n=== Step 4: Polling video generation status ===");

  const pendingTasks = [];
  for (const d of dynasties) {
    if (!state.videos || !state.videos[d.id] || !state.videos[d.id].taskId) {
      continue;
    }
    const videoState = state.videos[d.id];
    if (videoState.status === "downloaded") {
      console.log("  [" + d.name + "] Video already downloaded, skipping.");
      continue;
    }
    pendingTasks.push({ dynasty: d, taskId: videoState.taskId });
  }

  if (pendingTasks.length === 0) {
    console.log("  All videos already downloaded.");
    return;
  }

  // Poll all pending tasks
  const completed = [];
  let pollInterval = 3000; // 3 seconds
  const maxWait = 30 * 60 * 1000; // 30 minutes
  const startTime = Date.now();

  while (pendingTasks.length > 0) {
    const elapsed = Date.now() - startTime;
    if (elapsed > maxWait) {
      console.error("  WARNING: Polling timed out after 30 minutes. Some videos may still be processing.");
      break;
    }

    // Check each pending task
    for (let i = pendingTasks.length - 1; i >= 0; i--) {
      const task = pendingTasks[i];
      const d = task.dynasty;

      try {
        const res = await queryVideoTask(task.taskId, apiKey);
        const status = res.status;
        const progress = res.progress != null ? res.progress : -1;

        if (status !== state.videos[d.id].status) {
          state.videos[d.id].status = status;
          console.log("  [" + d.name + "] Status: " + status + (progress >= 0 ? " (" + progress + "%)" : ""));
        }

        if (status === "succeeded") {
          // Download video
          const videoUrl = res.content && res.content.video_url;
          if (videoUrl) {
            const videoPath = path.join(videosDir, d.id + ".mp4");
            console.log("  [" + d.name + "] Downloading video...");
            await downloadFile(videoUrl, videoPath);
            state.videos[d.id].videoPath = videoPath;
            state.videos[d.id].videoUrl = videoUrl;
            console.log("  [" + d.name + "] Video saved: " + videoPath);
          }

          // Download last frame if available
          const lastFrameUrl = res.content && res.content.last_frame_url;
          if (lastFrameUrl && lastFramesDir) {
            const lastFramePath = path.join(lastFramesDir, d.id + "_last.png");
            console.log("  [" + d.name + "] Downloading last frame...");
            await downloadFile(lastFrameUrl, lastFramePath);
            state.videos[d.id].lastFramePath = lastFramePath;
          }

          state.videos[d.id].status = "downloaded";
          completed.push(d.id);
          pendingTasks.splice(i, 1);
        } else if (status === "failed" || status === "expired") {
          console.error("  [" + d.name + "] Video generation " + status + ": " + (res.error || "Unknown error"));
          state.videos[d.id].error = res.error || "Unknown error";
          pendingTasks.splice(i, 1);
        }
      } catch (e) {
        console.error("  [" + d.name + "] Poll error: " + e.message.split("\n")[0]);
      }
    }

    if (pendingTasks.length > 0) {
      await sleep(pollInterval);
      // Increase interval if tasks have been queued for a while
      if (elapsed > 30000) {
        pollInterval = Math.min(pollInterval + 2000, 10000);
      }
    }
  }

  console.log("=== Video generation complete ===");
  console.log("  Completed: " + completed.length + "/" + dynasties.length);
}

module.exports = {
  submitVideoTasks,
  pollAndDownload,
};
