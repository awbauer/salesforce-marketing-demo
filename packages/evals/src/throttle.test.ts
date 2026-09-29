import { describe, expect, it } from "vitest";
// @ts-expect-error the runner helper is plain JavaScript
import { createLimiter, requestsPerMinute } from "../../../scripts/lib/eval-throttle.mjs";

describe("eval rate limiter", () => {
  it("delays calls beyond the per-minute limit until the window frees", async () => {
    let clock = 0;
    const slept: number[] = [];
    const limiter = createLimiter(
      2,
      () => clock,
      async (ms: number) => {
        slept.push(ms);
        clock += ms;
      },
    );
    await limiter.acquire();
    await limiter.acquire();
    expect(slept).toEqual([]);
    await limiter.acquire();
    expect(slept).toHaveLength(1);
    expect(slept[0]).toBeGreaterThanOrEqual(60_000);
    expect(clock).toBeGreaterThanOrEqual(60_000);
  });

  it("serves contestant turns before queued judge calls", async () => {
    let clock = 0;
    const order: string[] = [];
    const limiter = createLimiter(
      1,
      () => clock,
      async (ms: number) => {
        clock += ms;
      },
    );
    await limiter.acquire(0);
    const judge = limiter.acquire(1).then(() => order.push("judge"));
    const turn = limiter.acquire(0).then(() => order.push("turn"));
    await Promise.all([judge, turn]);
    expect(order).toEqual(["turn", "judge"]);
  });

  it("holds the frontier models to Cloudflare's 20 requests per minute", () => {
    expect(requestsPerMinute("@cf/zai-org/glm-5.3")).toBeLessThan(20);
    expect(requestsPerMinute("@cf/openai/gpt-oss-120b")).toBeGreaterThan(100);
  });
});
