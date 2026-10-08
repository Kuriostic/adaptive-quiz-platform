const express = require("express");
const router = express.Router();

const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

async function generateQuestions(topic, count) {
  const prompt = `Create ${count} multiple-choice questions on the topic "${topic}".
Rules:
- Each question has exactly 4 options.
- "answerIndex" is the index (0 to 3) of the correct option.
- "difficulty" is an integer from 1 (very easy) to 5 (very hard).
- Spread the difficulty evenly across 1 to 5.
- "explanation" is one short sentence on why the answer is correct.
Return ONLY a JSON array in this format:
[{"question":"...","options":["A","B","C","D"],"answerIndex":0,"difficulty":1,"explanation":"..."}]`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
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
    throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  let text = (data.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || "")
    .join("");
  text = text.replace(/```json|```/g, "").trim();

  const parsed = JSON.parse(text);

  // sirf valid questions rakho
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

async function handler(req, res) {
  const src = req.method === "GET" ? req.query : req.body;
  const topic = (src.topic || "").trim();
  const count = Math.min(parseInt(src.count) || 10, 15);

  if (!topic) return res.status(400).json({ error: "topic is required" });

  try {
    const questions = await generateQuestions(topic, count);
    res.json({ topic, questions });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: "Failed to generate questions", details: e.message });
  }
}

// GET browser test ke liye, POST frontend ke liye
router.get("/generate", handler);
router.post("/generate", handler);

const crypto = require("crypto");
const { updateAbility, pickNext } = require("../utils/adaptive");

// demo ke liye memory mein sessions (baad mein MongoDB mein jayega)
const sessions = new Map();

// student ko answer aur explanation mat dikhao
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
    const questions = await generateQuestions(topic, count);
    if (questions.length < 3) {
      return res.status(500).json({ error: "Not enough questions generated, try again" });
    }
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
      total: questions.length,
      ability: startAbility,
      question: publicQ(first),
    });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: "Failed to start quiz", details: e.message });
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