import { z } from "zod";
import { QUALITY_DIMENSIONS } from "./quality.ts";

const DimensionScoresSchema = z.object(
  Object.fromEntries(
    QUALITY_DIMENSIONS.map((dimension) => [dimension, z.number().optional()]),
  ) as Record<(typeof QUALITY_DIMENSIONS)[number], z.ZodOptional<z.ZodNumber>>,
);
const CostSchema = z.object({ usd: z.number().nonnegative(), neurons: z.number().nonnegative() });
const JudgeVerdictSchema = z.object({
  model: z.string(),
  scores: DimensionScoresSchema,
  evidence: z.record(z.string(), z.string()),
  rationale: z.string(),
});
const IntervalSchema = z.object({
  mean: z.number(),
  ciLow: z.number(),
  ciHigh: z.number(),
  n: z.number().int().nonnegative(),
});

export const EVAL_SUITES = ["demo-scenarios", "routing-pipeline", "routing-model-only"] as const;
// Markdown answers are allowed and rendered, so formatting is not scored.
export const EVAL_CHECKS = [
  "toolCorrect",
  "textProduced",
  "noToolErrors",
  "noFalseWriteClaim",
  "graphGrounded",
  "agentRequestGrounded",
] as const;
export type EvalCheck = (typeof EVAL_CHECKS)[number];
// Checks added after the first published run; results recorded before them leave them out.
export const LATER_CHECKS: readonly EvalCheck[] = ["graphGrounded", "agentRequestGrounded"];

const ChecksSchema = z.object(
  Object.fromEntries(
    EVAL_CHECKS.map((check) => [
      check,
      LATER_CHECKS.includes(check) ? z.boolean().optional() : z.boolean(),
    ]),
  ) as Record<EvalCheck, z.ZodBoolean | z.ZodOptional<z.ZodBoolean>>,
);

export const EvalCaseResultSchema = z.object({
  model: z.string(),
  suite: z.enum(EVAL_SUITES),
  caseId: z.string(),
  prompt: z.string(),
  expected: z.string(),
  trial: z.number().int().nonnegative(),
  route: z.enum(["model", "confirmation-required", "unsupported", "error"]),
  toolCalled: z.string().nullable(),
  checks: ChecksSchema,
  passed: z.boolean(),
  latencyMs: z.number().nonnegative(),
  inputTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(),
  steps: z.string(),
  excerpt: z.string().max(240),
  failure: z.string().max(240).optional(),
  /** Input tokens served from cache, where the provider reports them. */
  cachedInputTokens: z.number().nonnegative().optional(),
  /** Workers AI cost of the model turn, at Cloudflare's list price. */
  cost: CostSchema.optional(),
  /** The full answer, kept for demo scenarios so quality can be re-judged and inspected. */
  answer: z.string().max(3000).optional(),
  /** What the model asked each tool for, for scenarios where the request shapes the result. */
  toolRequests: z.array(z.string().max(1000)).optional(),
  /** Rubric criteria the answer met; reported beside, not inside, the pass gate. */
  criteria: z.array(z.object({ id: z.string(), met: z.boolean() })).optional(),
  quality: z
    .object({
      judges: z.array(JudgeVerdictSchema),
      dimensionMeans: DimensionScoresSchema,
      /** Weighted 0-100 index over the scenario's dimensions. */
      index: z.number().min(0).max(100),
      judgeError: z.string().max(240).optional(),
    })
    .optional(),
});
export type EvalCaseResult = z.infer<typeof EvalCaseResultSchema>;

export const EvalSummarySchema = z.object({
  model: z.string(),
  suite: z.enum(EVAL_SUITES),
  passed: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  /** Share of turns passing each check; a later check is absent when no turn measured it. */
  checkRates: z.object(
    Object.fromEntries(
      EVAL_CHECKS.map((check) => {
        const rate = z.number().min(0).max(1);
        return [check, LATER_CHECKS.includes(check) ? rate.optional() : rate];
      }),
    ) as Record<EvalCheck, z.ZodNumber | z.ZodOptional<z.ZodNumber>>,
  ),
  latencyP50Ms: z.number().nonnegative(),
  latencyP90Ms: z.number().nonnegative(),
  meanOutputTokens: z.number().nonnegative(),
  costUsd: z.number().nonnegative().optional(),
  costPerTurnUsd: z.number().nonnegative().optional(),
  /** Spend divided by passing turns; absent when nothing passed. */
  costPerPassUsd: z.number().nonnegative().optional(),
  criteriaMetRate: z.number().min(0).max(1).optional(),
  qualityIndex: IntervalSchema.optional(),
  dimensionMeans: DimensionScoresSchema.optional(),
  /** Share of judged "would act" ratings that are 4 or 5. */
  actionIntentTop2: z.number().min(0).max(1).optional(),
  /** Quality Index points per USD spent on the model's judged turns. */
  qualityPerUsd: z.number().nonnegative().optional(),
});

export const EvalReportSchema = z.object({
  generatedAt: z.string().datetime(),
  gitSha: z.string().regex(/^[a-f0-9]{7,40}$/),
  productionModel: z.string(),
  methodology: z.object({
    summary: z.string(),
    pipeline: z.array(z.string()),
    toolResults: z.string(),
    suites: z.array(
      z.object({
        id: z.enum(EVAL_SUITES),
        label: z.string(),
        description: z.string(),
        trials: z.number(),
      }),
    ),
    checks: z.array(
      z.object({ id: z.enum(EVAL_CHECKS), label: z.string(), definition: z.string() }),
    ),
    limitations: z.array(z.string()),
    costModel: z.string().optional(),
    rubric: z
      .array(
        z.object({
          caseId: z.string(),
          goal: z.string(),
          persona: z.string().optional(),
          criteria: z.array(z.object({ id: z.string(), label: z.string() })),
          weights: z.record(z.string(), z.number()),
        }),
      )
      .optional(),
    dimensions: z
      .array(
        z.object({
          id: z.enum(QUALITY_DIMENSIONS),
          label: z.string(),
          question: z.string(),
          anchors: z.array(z.string()).length(5),
        }),
      )
      .optional(),
  }),
  models: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      included: z.boolean(),
      note: z.string().optional(),
      tier: z.enum(["default", "frontier"]).optional(),
    }),
  ),
  summaries: z.array(EvalSummarySchema),
  results: z.array(EvalCaseResultSchema),
  cost: z
    .object({
      contestantsUsd: z.number().nonnegative(),
      judgesUsd: z.number().nonnegative(),
      simulatorUsd: z.number().nonnegative(),
      totalUsd: z.number().nonnegative(),
      neurons: z.number().nonnegative(),
      pricingAsOf: z.string(),
      pricingSource: z.string().url(),
    })
    .optional(),
  judges: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
  agreement: z
    .object({
      comparisons: z.number().int().nonnegative(),
      withinOne: z.number().int().nonnegative(),
      meanAbsDiff: z.number().nonnegative(),
      disagreements: z.number().int().nonnegative(),
      turnsCompared: z.number().int().nonnegative(),
    })
    .optional(),
  calibration: z
    .object({
      ranAt: z.string().datetime(),
      passed: z.boolean(),
      /** Mean score gap between strong and weak reference answers, per judge. */
      strongMinusWeak: z.record(z.string(), z.number()),
    })
    .optional(),
});
export type EvalReport = z.infer<typeof EvalReportSchema>;
