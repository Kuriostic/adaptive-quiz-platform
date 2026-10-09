const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { updateAbility, pickNext } = require("../utils/adaptive");

const router = express.Router();

// .env mein comma se alag kiye hue models, order mein try honge
const MODELS = (process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || "gemini-3.6-flash")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const CACHE_DIR = path.join(__dirname, "..", "cache");
fs.mkdirSync(CACHE_DIR, { recursive: true });
const cachePath = (topic) =>
  path.join(CACHE_DIR, topic.toLowerCase().replace(/[^a-z0-9]+/g, "_") + ".json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildPrompt(topic, count) {
  return `Create ${count} multiple-choice questions on the topic "${topic}".
Rules:
- Each question has exactly 4 options.
- "answerIndex" is the index (0 to 3) of the correct option.
- "difficulty" is an integer from 1 (very easy) to 5 (very hard).
- Spread the difficulty evenly across 1 to 5.
- "explanation" is one short sentence on why the answer is correct.
Return ONLY a JSON array in this format:
[{"question":"...","options":["A","B","C","D"],"answerIndex":0,"difficulty":1,"explanation":"..."}]`;
}

async function callGemini(model, prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );
  if (!res.ok) {
    const err = new Error(`Gemini error ${res.status} (${model})`);
    err.status = res.status;
    err.body = (await res.text()).slice(0, 300);
    throw err;
  }
  const data = await res.json();
  return (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
}

function parseQuestions(text) {
  const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
  if (!Array.isArray(parsed)) throw new Error("Response is not an array");
  return parsed
    .filter(
      (q) =>
        q.question &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        Number.isInteger(q.answerIndex) &&
        q.answerIndex >= 0 &&
        q.answerIndex <= 3
    )
    .map((q, i) => ({
      id: i + 1,
      question: q.question,
      options: q.options,
      answerIndex: q.answerIndex,
      difficulty: Math.min(5, Math.max(1, parseInt(q.difficulty) || 3)),
      explanation: q.explanation || "",
    }));
}

function saveCache(topic, questions) {
  try {
    fs.writeFileSync(cachePath(topic), JSON.stringify(questions, null, 1));
  } catch (e) {
    console.error("Cache save failed:", e.message);
  }
}

function loadCache(topic, count) {
  try {
    const all = JSON.parse(fs.readFileSync(cachePath(topic), "utf8"));
    if (!Array.isArray(all) || all.length < 3) return null;
    const sorted = [...all].sort((a, b) => a.difficulty - b.difficulty);
    const n = Math.min(count, sorted.length);
    const picked =
      n === sorted.length
        ? sorted
        : Array.from({ length: n }, (_, i) =>
            sorted[Math.round((i * (sorted.length - 1)) / Math.max(1, n - 1))]
          );
    return picked.map((q, i) => ({ ...q, id: i + 1 }));
  } catch {
    return null;
  }
}

async function generateQuestions(topic, count) {
    if (process.env.PREFER_CACHE === "true") {
    const c = loadCache(topic, count);
    if (c) return { questions: c, source: "cache" };
  }
  const prompt = buildPrompt(topic, count);
  let lastErr;

  for (const model of MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const questions = parseQuestions(await callGemini(model, prompt));
        if (questions.length < 3) throw new Error("Too few valid questions");
        saveCache(topic, questions);
        return { questions, source: model };
      } catch (e) {
        lastErr = e;
        console.error(`[${model}] attempt ${attempt} failed: ${e.message}`, e.body || "");
        // 400/403/404 = key ya model ka problem, retry bekaar, agle model pe jao
        const temporary = !e.status || [429, 500, 503].includes(e.status);
        if (!temporary) break;
        await sleep(1500);
      }
    }
  }

  const cached = loadCache(topic, count);
  if (cached) {
    console.warn(`All models failed, serving cached quiz for "${topic}"`);
    return { questions: cached, source: "cache" };
  }
  throw lastErr || new Error("Question generation failed");
}

function errorResponse(res, e, fallbackMsg) {
  console.error(e.message, e.body || "");
  const busy = e.status === 503 || e.status === 429;
  res.status(busy ? 503 : 500).json({
    error: busy ? "The AI service is busy right now. Please try again in a few seconds." : fallbackMsg,
    details: e.message,
  });
}

// ---------- test / pre-warm route (browser mein khol sakte ho) ----------
async function handler(req, res) {
  const src = req.method === "GET" ? req.query : req.body;
  const topic = (src.topic || "").trim();
  const count = Math.min(parseInt(src.count) || 10, 15);
  if (!topic) return res.status(400).json({ error: "topic is required" });
  try {
    const { questions, source } = await generateQuestions(topic, count);
    res.json({ topic, source, questions });
  } catch (e) {
    errorResponse(res, e, "Failed to generate questions");
  }
}
router.get("/generate", handler);
router.post("/generate", handler);

// tere API key pe kaunse models available hain (key bahar expose nahi hoti)
router.get("/models", async (req, res) => {
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=100", {
      headers: { "x-goog-api-key": process.env.GEMINI_API_KEY },
    });
    const d = await r.json();
    const names = (d.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => m.name.replace("models/", ""));
    res.json({ configured: MODELS, available: names });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- adaptive quiz sessions ----------
const sessions = new Map();

const publicQ = (q) => ({
  id: q.id,
  question: q.question,
  options: q.options,
  difficulty: q.difficulty,
});

router.post("/start", async (req, res) => {
  const topic = (req.body.topic || "").trim();
  const count = Math.min(parseInt(req.body.count) || 10, 15);
  if (!topic) return res.status(400).json({ error: "topic is required" });

  try {
    const { questions, source } = await generateQuestions(topic, count);
    const startAbility = 3;
    const first = pickNext(questions, [], startAbility);
    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, {
      topic,
      questions,
      asked: [first.id],
      current: first,
      ability: startAbility,
      history: [],
    });
    res.json({
      sessionId,
      source,
      total: questions.length,
      ability: startAbility,
      question: publicQ(first),
    });
  } catch (e) {
    errorResponse(res, e, "Failed to start quiz");
  }
});

router.post("/answer", (req, res) => {
  const { sessionId, selectedIndex } = req.body;
  const s = sessions.get(sessionId);
  if (!s) return res.status(404).json({ error: "Session not found" });
  if (!s.current) return res.status(400).json({ error: "Quiz already finished" });

  const q = s.current;
  const correct = Number(selectedIndex) === q.answerIndex;
  const before = s.ability;
  s.ability = updateAbility(s.ability, q.difficulty, correct);

  s.history.push({
    id: q.id,
    question: q.question,
    difficulty: q.difficulty,
    correct,
    abilityBefore: before,
    abilityAfter: s.ability,
  });

  const feedback = {
    correct,
    correctIndex: q.answerIndex,
    explanation: q.explanation,
    ability: s.ability,
  };

  const next = pickNext(s.questions, s.asked, s.ability);
  if (!next) {
    s.current = null;
    const score = s.history.filter((h) => h.correct).length;
    return res.json({
      ...feedback,
      finished: true,
      result: {
        topic: s.topic,
        score,
        total: s.history.length,
        finalAbility: s.ability,
        history: s.history,
      },
    });
  }

  s.asked.push(next.id);
  s.current = next;
  res.json({ ...feedback, finished: false, question: publicQ(next) });
});

module.exports = router;