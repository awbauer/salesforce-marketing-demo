import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { type InstanceProfile, isGptOss } from "@workbench/contracts";
import type { LanguageModel } from "ai";
import { createWorkersAI } from "workers-ai-provider";

/** Bindings a hosted provider may need; every one is optional so local runs need no account. */
export type ModelBindings = {
  AI?: Ai;
  AI_GATEWAY_ID?: string;
  OLLAMA_BASE_URL?: string;
  OPENAI_COMPATIBLE_API_KEY?: string;
  AWS_REGION?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_SESSION_TOKEN?: string;
};

export const DEFAULT_WORKERS_AI_IMAGE_MODEL = "@cf/black-forest-labs/flux-2-klein-4b";
export const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434/v1";

export class ModelUnavailableError extends Error {}

/** The profile's chat model as an AI SDK model. Throws ModelUnavailableError when misconfigured. */
export function resolveChatModel(
  profile: InstanceProfile,
  env: ModelBindings,
): Exclude<LanguageModel, string> {
  const { provider, model, baseUrl } = profile.models.chat;
  switch (provider) {
    case "ollama":
    case "openai-compatible":
      return createOpenAICompatible({
        name: provider,
        baseURL: baseUrl ?? env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_URL,
        apiKey: env.OPENAI_COMPATIBLE_API_KEY,
      })(model);
    case "workers-ai":
      if (!env.AI) throw new ModelUnavailableError("The Workers AI binding is not configured.");
      return createWorkersAI({
        binding: env.AI,
        ...(env.AI_GATEWAY_ID ? { gateway: { id: env.AI_GATEWAY_ID } } : {}),
      })(model as Parameters<ReturnType<typeof createWorkersAI>>[0]);
    case "bedrock":
      return createAmazonBedrock({
        region: env.AWS_REGION,
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        sessionToken: env.AWS_SESSION_TOKEN,
      })(model);
  }
}

/** gpt-oss models leak channel markup and tool arguments; only they get the repair middleware. */
export const needsToolCallRepair = (profile: InstanceProfile) =>
  isGptOss(profile.models.chat.model);

/** Whether the configured chat endpoint answers. Local runs fall back to scripted mode if not. */
export async function chatModelReachable(
  profile: InstanceProfile,
  env: ModelBindings,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const { provider, baseUrl } = profile.models.chat;
  if (provider === "workers-ai") return Boolean(env.AI);
  if (provider === "bedrock") return Boolean(env.AWS_REGION);
  const root = (baseUrl ?? env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_URL).replace(/\/$/, "");
  try {
    const response = await fetchImpl(`${root}/models`, { signal: AbortSignal.timeout(2500) });
    return response.ok;
  } catch {
    return false;
  }
}

export type GeneratedImage = { png: Uint8Array; model: string };

const encoder = new TextEncoder();
function hash(text: string) {
  let h = 2166136261;
  for (const char of text) h = Math.imul(h ^ char.charCodeAt(0), 16777619) >>> 0;
  return h;
}
const crc32Table = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (const b of bytes) c = (crc32Table[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function adler32(bytes: Uint8Array) {
  let a = 1;
  let b = 0;
  // 5552 is the largest run that cannot overflow 32 bits before the modulo.
  for (let i = 0; i < bytes.length; i += 5552) {
    const end = Math.min(i + 5552, bytes.length);
    for (let j = i; j < end; j++) {
      a += bytes[j] as number;
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}
function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(encoder.encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * A deterministic size×size PNG gradient seeded by the prompt, so every concept gets a distinct
 * on-brand-looking placeholder with no model, network or account. Uses stored (uncompressed) deflate.
 */
export function placeholderImage(prompt: string, size = 1024): GeneratedImage {
  const seed = hash(prompt);
  const hue = (seed % 360) / 360;
  const channel = (n: number) => {
    const k = (n + hue * 12) % 12;
    return Math.round(255 * (0.55 - 0.35 * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  const [r, g, b] = [channel(0), channel(8), channel(4)] as [number, number, number];
  const stride = 1 + size * 3;
  const raw = new Uint8Array(size * stride);
  for (let y = 0; y < size; y++) {
    // Each row is one flat colour that darkens toward the bottom; the row is filled by doubling.
    const shade = 1 - (y / size) * 0.45;
    const row = y * stride;
    raw.set(
      [Math.min(255, r * shade), Math.min(255, g * shade), Math.min(255, b * shade)],
      row + 1,
    );
    for (let filled = 3; filled < size * 3; filled *= 2)
      raw.copyWithin(row + 1 + filled, row + 1, row + 1 + Math.min(filled, size * 3 - filled));
  }
  const blocks: number[] = [0x78, 0x01];
  const parts: Uint8Array[] = [];
  for (let i = 0; i < raw.length; i += 65535) {
    const slice = raw.subarray(i, Math.min(i + 65535, raw.length));
    const final = i + 65535 >= raw.length ? 1 : 0;
    const head = new Uint8Array(5);
    new DataView(head.buffer).setUint8(0, final);
    new DataView(head.buffer).setUint16(1, slice.length, true);
    new DataView(head.buffer).setUint16(3, ~slice.length & 0xffff, true);
    parts.push(head, slice);
  }
  const trailer = new Uint8Array(4);
  new DataView(trailer.buffer).setUint32(0, adler32(raw));
  const deflated = new Uint8Array(2 + parts.reduce((n, p) => n + p.length, 0) + 4);
  deflated.set(blocks.slice(0, 2));
  let at = 2;
  for (const part of parts) {
    deflated.set(part, at);
    at += part.length;
  }
  deflated.set(trailer, at);
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, size);
  view.setUint32(4, size);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const pieces = [
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflated),
    chunk("IEND", new Uint8Array()),
  ];
  const png = new Uint8Array(pieces.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const piece of pieces) {
    png.set(piece, offset);
    offset += piece.length;
  }
  return { png, model: "local-placeholder" };
}
