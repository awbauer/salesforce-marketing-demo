import { z } from "zod";

export const EVAL_SUITES = ["demo-scenarios", "routing-pipeline", "routing-model-only"] as const;
export const EVAL_CHECKS = [
  "toolCorrect",
  "textProduced",
  "noToolErrors",
  "plainText",
  "noFalseWriteClaim",
] as const;

const ChecksSchema = z.object(
  Object.fromEntries(EVAL_CHECKS.map((check) => [check, z.boolean()])) as Record<
    (typeof EVAL_CHECKS)[number],
    z.ZodBoolean
  >,
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
});
export type EvalCaseResult = z.infer<typeof EvalCaseResultSchema>;

export const EvalSummarySchema = z.object({
  model: z.string(),
  suite: z.enum(EVAL_SUITES),
  passed: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  checkRates: z.object(
    Object.fromEntries(EVAL_CHECKS.map((check) => [check, z.number().min(0).max(1)])) as Record<
      (typeof EVAL_CHECKS)[number],
      z.ZodNumber
    >,
  ),
  latencyP50Ms: z.number().nonnegative(),
  latencyP90Ms: z.number().nonnegative(),
  meanOutputTokens: z.number().nonnegative(),
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
  }),
  models: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      included: z.boolean(),
      note: z.string().optional(),
    }),
  ),
  summaries: z.array(EvalSummarySchema),
  results: z.array(EvalCaseResultSchema),
});
export type EvalReport = z.infer<typeof EvalReportSchema>;
