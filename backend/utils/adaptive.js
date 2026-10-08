// Probability that student answers correctly (Rasch / 1PL IRT model)
function probCorrect(ability, difficulty) {
  return 1 / (1 + Math.exp(-(ability - difficulty)));
}

// Update ability after each answer, scale 1 to 5
function updateAbility(ability, difficulty, correct, k = 1) {
  const p = probCorrect(ability, difficulty);
  const next = ability + k * ((correct ? 1 : 0) - p);
  return Math.min(5, Math.max(1, Number(next.toFixed(2))));
}

// Pick the unasked question whose difficulty is closest to current ability
function pickNext(questions, askedIds, ability) {
  const remaining = questions.filter((q) => !askedIds.includes(q.id));
  if (remaining.length === 0) return null;
  remaining.sort(
    (a, b) => Math.abs(a.difficulty - ability) - Math.abs(b.difficulty - ability)
  );
  return remaining[0];
}

module.exports = { probCorrect, updateAbility, pickNext };