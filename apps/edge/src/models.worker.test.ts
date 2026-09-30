import { EXAMPLE_PROFILE, InstanceProfileSchema } from "@workbench/contracts";
import { describe, expect, it } from "vitest";
import {
  chatModelReachable,
  ModelUnavailableError,
  needsToolCallRepair,
  placeholderImage,
  resolveChatModel,
} from "./models";

const withChat = (chat: object) =>
  InstanceProfileSchema.parse({
    ...EXAMPLE_PROFILE,
    models: { ...EXAMPLE_PROFILE.models, chat },
  });

describe("resolveChatModel", () => {
  it("builds an Ollama model with no account or binding", () => {
    const model = resolveChatModel(EXAMPLE_PROFILE, {});
    expect(model).toMatchObject({ modelId: "gpt-oss:20b" });
  });

  it("refuses Workers AI without the binding", () => {
    const profile = withChat({ provider: "workers-ai", model: "@cf/openai/gpt-oss-20b" });
    expect(() => resolveChatModel(profile, {})).toThrow(ModelUnavailableError);
  });

  it("builds a Bedrock model from the region", () => {
    const profile = withChat({ provider: "bedrock", model: "openai.gpt-oss-20b-1:0" });
    expect(resolveChatModel(profile, { AWS_REGION: "us-east-1" })).toMatchObject({
      modelId: "openai.gpt-oss-20b-1:0",
    });
  });

  it("repairs tool calls only for gpt-oss models", () => {
    expect(needsToolCallRepair(EXAMPLE_PROFILE)).toBe(true);
    expect(needsToolCallRepair(withChat({ provider: "ollama", model: "qwen3:14b" }))).toBe(false);
  });
});

describe("chatModelReachable", () => {
  it("is true when the endpoint lists models", async () => {
    let requested = "";
    const ok = await chatModelReachable(EXAMPLE_PROFILE, {}, async (url) => {
      requested = String(url);
      return new Response("{}", { status: 200 });
    });
    expect(ok).toBe(true);
    expect(requested).toBe("http://127.0.0.1:11434/v1/models");
  });

  it("is false when the endpoint is down", async () => {
    const down = await chatModelReachable(EXAMPLE_PROFILE, {}, async () => {
      throw new Error("ECONNREFUSED");
    });
    expect(down).toBe(false);
  });
});

describe("placeholderImage", () => {
  it("draws a valid 1024×1024 PNG that is stable per prompt", async () => {
    const first = placeholderImage("spring launch");
    const view = new DataView(first.png.buffer, first.png.byteOffset);
    expect([...first.png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([1024, 1024]);
    const digest = async (png: Uint8Array) =>
      Buffer.from(await crypto.subtle.digest("SHA-256", png)).toString("hex");
    expect(await digest(placeholderImage("spring launch").png)).toBe(await digest(first.png));
    expect(await digest(placeholderImage("winter sale").png)).not.toBe(await digest(first.png));
    expect(first.model).toBe("local-placeholder");
    // The IDAT stream must inflate to 1024 rows of one filter byte plus 1024 RGB pixels.
    const idatLength = view.getUint32(33);
    const idat = first.png.slice(41, 41 + idatLength);
    const inflated = await new Response(
      new Blob([idat]).stream().pipeThrough(new DecompressionStream("deflate")),
    ).arrayBuffer();
    expect(inflated.byteLength).toBe(1024 * (1 + 1024 * 3));
  });
});
