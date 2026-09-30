import { z } from "zod";

/** Where the orchestrator's chat model runs. Local by default: Ollama on the presenter's machine. */
export const ChatProviderSchema = z.enum(["ollama", "openai-compatible", "workers-ai", "bedrock"]);
/** Where campaign images come from. `placeholder` draws a deterministic on-brand image locally. */
export const ImageProviderSchema = z.enum(["placeholder", "openai-compatible", "workers-ai"]);

export const InstanceProfileSchema = z.object({
  instance: z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/),
    displayName: z.string().min(1).max(80),
  }),
  client: z.object({
    /** The fictional brand shown in the UI and used in every prompt. */
    brand: z.string().min(1).max(80),
    /** Whether the demo is for an internal enablement session or an external client discussion. */
    audience: z.enum(["internal", "external"]),
    industry: z.string().min(1),
    region: z.string().min(1).default("United States"),
    language: z.string().min(1).default("English"),
    brandVoice: z.string().min(1).max(400),
    customerSegments: z.array(z.string().min(1)).max(12).default([]),
    products: z.array(z.string().min(1)).max(20).default([]),
    compliance: z.array(z.string().min(1)).max(12).default([]),
  }),
  useCases: z.array(z.string().min(1)).min(1),
  models: z.object({
    chat: z.object({
      provider: ChatProviderSchema,
      model: z.string().min(1),
      /** Ollama / OpenAI-compatible endpoint; ignored by hosted providers. */
      baseUrl: z.url().optional(),
    }),
    image: z.object({
      provider: ImageProviderSchema,
      model: z.string().min(1).optional(),
      baseUrl: z.url().optional(),
    }),
  }),
  caps: z.object({
    images: z.number().int().positive().default(100),
    spendUsd: z.number().nonnegative().default(25),
  }),
  retention: z.object({
    transcriptHours: z.number().int().positive().default(24),
    imageDays: z.number().int().positive().default(7),
  }),
  salesforce: z.object({
    mode: z.enum(["fixture", "sandbox"]).default("fixture"),
    mcpUrl: z.url().optional(),
  }),
  deploy: z.object({ target: z.enum(["local", "cloudflare", "aws"]).default("local") }),
});
export type InstanceProfile = z.infer<typeof InstanceProfileSchema>;

/** The profile a fresh checkout runs with before `pnpm workbench:init` has been run. */
export const EXAMPLE_PROFILE: InstanceProfile = InstanceProfileSchema.parse({
  instance: { id: "example", displayName: "Example workbench" },
  client: {
    brand: "Example Brand",
    audience: "internal",
    industry: "Retail",
    brandVoice: "Warm, direct, and practical.",
  },
  useCases: ["campaign-creation"],
  models: {
    chat: { provider: "ollama", model: "gpt-oss:20b", baseUrl: "http://127.0.0.1:11434/v1" },
    image: { provider: "placeholder" },
  },
  caps: {},
  retention: {},
  salesforce: { mode: "fixture" },
  deploy: { target: "local" },
});

/** True for gpt-oss models, which need the tool-call repair middleware. */
export const isGptOss = (model: string) => /gpt-oss/i.test(model);
