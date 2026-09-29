// Quality scoring: an LLM judge panel rates each answer on anchored 1-5 scales, and this module
// turns those ratings into a 0-100 index with confidence intervals. It has no I/O so it is unit-tested.
export const QUALITY_DIMENSIONS = [
  "contextFidelity",
  "accuracy",
  "clarity",
  "brandVoice",
  "engagement",
  "actionIntent",
  "marketerUsefulness",
] as const;
export type QualityDimension = (typeof QUALITY_DIMENSIONS)[number];

export type DimensionMeta = {
  label: string;
  /** What the judge is asked; for actionIntent the judge answers as the audience persona. */
  question: string;
  /** Written anchors for scores 1 through 5, in that order. */
  anchors: readonly [string, string, string, string, string];
};

export const DIMENSION_META: Record<QualityDimension, DimensionMeta> = {
  contextFidelity: {
    label: "Context fidelity",
    question:
      "Does the answer use the real context the tools returned (weather, time of day, menu, history) rather than generic filler?",
    anchors: [
      "Ignores the tool context entirely or contradicts it.",
      "Mentions context but only one piece, or in a token way.",
      "Uses most of the relevant context, but at least one key fact is missing.",
      "Uses the relevant context accurately and the copy visibly depends on it.",
      "Weaves every relevant fact (weather, time, menu item, past performance) into the copy so it could not be reused elsewhere.",
    ],
  },
  accuracy: {
    label: "Accuracy",
    question:
      "Is every fact and number in the answer supported by the tool results, with nothing invented?",
    anchors: [
      "Mostly invented or contradicts the tool results.",
      "Several unsupported or wrong claims.",
      "Mostly correct, with one unsupported claim or a wrong number.",
      "Correct throughout; at most a harmless paraphrase.",
      "Every claim traceable to a tool result; limits and gaps are stated honestly.",
    ],
  },
  clarity: {
    label: "Clarity",
    question: "Is the answer easy to scan and the right length for the person reading it?",
    anchors: [
      "Confusing, disorganized, or malformed (stray markup, raw tool calls).",
      "Hard to follow: wall of text or scattered structure.",
      "Understandable but wordy or unevenly structured.",
      "Well structured and appropriately brief.",
      "Immediately scannable; labeled, ordered, no wasted words.",
    ],
  },
  brandVoice: {
    label: "Brand voice",
    question:
      "Does the copy sound like the brand: warm, concise, specific, and free of hype or exclamation spam?",
    anchors: [
      "Off-brand: hype, clichés, or robotic corporate tone.",
      "Mostly generic; the voice could belong to any brand.",
      "Acceptable tone with some generic or forced phrases.",
      "Clearly on-brand and natural.",
      "Distinctly on-brand; memorable phrasing that a human copywriter would keep.",
    ],
  },
  engagement: {
    label: "Engagement",
    question:
      "Would the copy earn attention: a specific hook, timely relevance, sensory or emotional pull, not a generic promotion?",
    anchors: [
      "Generic or off-putting; would be skimmed past.",
      "Bland: states an offer with no hook.",
      "Competent but predictable; a hook exists but is weak.",
      "Has a specific, timely hook that would stand out in an inbox or lock screen.",
      "A vivid, specific hook tied to the moment; you would remember it.",
    ],
  },
  actionIntent: {
    label: "Would act",
    question:
      "Answering as the audience persona: how likely are you to tap, open, or order after seeing this? 1 = definitely would not, 2 = probably would not, 3 = might or might not, 4 = probably would, 5 = definitely would.",
    anchors: [
      "Definitely would not act.",
      "Probably would not act.",
      "Might or might not act.",
      "Probably would act.",
      "Definitely would act.",
    ],
  },
  marketerUsefulness: {
    label: "Marketer usefulness",
    question:
      "Could the marketer act on this answer right now: does it give next steps and decisions with no padding?",
    anchors: [
      "Unusable: does not address the request.",
      "Partly relevant but the marketer must redo the work.",
      "Usable with edits or missing next steps.",
      "Ready to act on with clear next steps.",
      "Ready to act on, prioritized, and anticipates the next question.",
    ],
  },
};

export type DimensionWeights = Partial<Record<QualityDimension, number>>;
export type DimensionScores = Partial<Record<QualityDimension, number>>;

const mean = (values: readonly number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

/** Mean score per dimension across the judges that scored it. */
export function dimensionMeans(judges: readonly { scores: DimensionScores }[]): DimensionScores {
  const means: DimensionScores = {};
  for (const dimension of QUALITY_DIMENSIONS) {
    const scores = judges.flatMap((judge) => {
      const value = judge.scores[dimension];
      return value === undefined ? [] : [value];
    });
    if (scores.length) means[dimension] = mean(scores);
  }
  return means;
}

/** Weighted mean of (score - 1) / 4 over the scenario's dimensions, as 0-100. */
export function qualityIndex(means: DimensionScores, weights: DimensionWeights): number {
  let total = 0;
  let weightSum = 0;
  for (const dimension of QUALITY_DIMENSIONS) {
    const weight = weights[dimension] ?? 0;
    const score = means[dimension];
    if (weight <= 0 || score === undefined) continue;
    total += weight * ((score - 1) / 4);
    weightSum += weight;
  }
  return weightSum ? (total / weightSum) * 100 : 0;
}

function hashSeed(text: string) {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

// mulberry32: a small seeded generator, so a bootstrap interval is reproducible across runs.
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Interval = { mean: number; ciLow: number; ciHigh: number; n: number };

/** Mean with a 95% percentile-bootstrap interval. With fewer than two values the interval collapses. */
export function bootstrapMean(
  values: readonly number[],
  seed: string,
  iterations = 1000,
): Interval {
  const center = mean(values);
  if (values.length < 2) return { mean: center, ciLow: center, ciHigh: center, n: values.length };
  const random = seededRandom(hashSeed(seed));
  const means = Array.from({ length: iterations }, () =>
    mean(
      Array.from(
        { length: values.length },
        () => values[Math.floor(random() * values.length)] ?? 0,
      ),
    ),
  ).sort((a, b) => a - b);
  return {
    mean: center,
    ciLow: means[Math.floor(iterations * 0.025)] ?? center,
    ciHigh: means[Math.min(iterations - 1, Math.floor(iterations * 0.975))] ?? center,
    n: values.length,
  };
}

/** Share of ratings that are 4 or 5: the "top-2-box" read of purchase intent. */
export function topTwoBox(scores: readonly number[]): number {
  return scores.length ? scores.filter((score) => score >= 4).length / scores.length : 0;
}

export type Agreement = {
  /** Dimension ratings that two judges both gave. */
  comparisons: number;
  withinOne: number;
  meanAbsDiff: number;
  /** Turns where two judges differ by two or more points on some dimension. */
  disagreements: number;
  turnsCompared: number;
};

/** How closely two judges agree, over the turns both scored. */
export function judgeAgreement(
  turns: readonly (readonly { scores: DimensionScores }[])[],
): Agreement {
  let comparisons = 0;
  let withinOne = 0;
  let diffTotal = 0;
  let disagreements = 0;
  let turnsCompared = 0;
  for (const judges of turns) {
    if (judges.length < 2) continue;
    const [a, b] = judges;
    if (!a || !b) continue;
    const diffs = QUALITY_DIMENSIONS.flatMap((dimension) => {
      const first = a.scores[dimension];
      const second = b.scores[dimension];
      return first === undefined || second === undefined ? [] : [Math.abs(first - second)];
    });
    if (!diffs.length) continue;
    turnsCompared++;
    comparisons += diffs.length;
    withinOne += diffs.filter((diff) => diff <= 1).length;
    diffTotal += diffs.reduce((sum, diff) => sum + diff, 0);
    if (diffs.some((diff) => diff >= 2)) disagreements++;
  }
  return {
    comparisons,
    withinOne,
    meanAbsDiff: comparisons ? diffTotal / comparisons : 0,
    disagreements,
    turnsCompared,
  };
}
