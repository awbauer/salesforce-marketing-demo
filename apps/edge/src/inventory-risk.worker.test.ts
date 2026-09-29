import { runInDurableObject, SELF } from "cloudflare:test";
import type { Confirmation, OrchestratorState } from "@northstar/contracts";
import { describe, expect, it } from "vitest";
import { demandCondition, fetchForecast } from "./campaign-context/open-meteo";
import { locationInventory } from "./campaign-context/store-inventory";
import { assessInventoryRisk, inventoryCaseDetails, inventoryRiskPrompt } from "./inventory-risk";
import { isInventoryCheck } from "./turn-policy";
import { agentStubFor } from "./worker.test-helpers";

const forecast = {
  location: "sacramento",
  city: "Sacramento",
  days: [
    { date: "2026-09-27", demandCondition: "clear", highF: 84 },
    { date: "2026-09-28", demandCondition: "heat", highF: 95 },
  ],
};
const demand = {
  locationId: "sacramento",
  city: "Sacramento",
  found: true,
  manager: { name: "Tom Okafor" },
  menuItems: [{ name: "Açaí Sunrise Bowl", conditions: [{ condition: "heat", lift: 2 }] }],
  inventoryItems: [
    {
      id: "acai",
      name: "Açaí packs",
      unit: "pack",
      usedBy: [{ menuItem: "Açaí Sunrise Bowl", perServing: 2 }],
    },
  ],
};
const inventory = (onHand: number, onOrder = 0) => ({
  location: "sacramento",
  city: "Sacramento",
  countedAt: "2026-09-27",
  items: [{ id: "acai", name: "Açaí packs", unit: "pack", onHand, onOrder, avgDailyUse: 50 }],
});

describe("inventory risk", () => {
  it("raises daily use by the demand lift on the days whose weather lifts a dish", () => {
    // 50 on the clear day, 50 × 2 on the heat day.
    const risk = assessInventoryRisk(forecast, demand, inventory(100, 20));
    expect(risk?.lowItems).toEqual([
      {
        name: "Açaí packs",
        unit: "pack",
        onHand: 100,
        onOrder: 20,
        projectedNeed: 150,
        menuItems: ["Açaí Sunrise Bowl"],
      },
    ]);
    expect(risk?.window).toEqual({ from: "2026-09-27", to: "2026-09-28", days: 2 });
    // A delivery on order counts toward covering the forecast.
    expect(assessInventoryRisk(forecast, demand, inventory(100, 50))?.lowItems).toEqual([]);
  });

  it("waits for all three results, for the same location", () => {
    expect(assessInventoryRisk(forecast, demand, undefined)).toBeNull();
    expect(
      assessInventoryRisk({ ...forecast, location: "fresno" }, demand, inventory(10)),
    ).toBeNull();
  });

  it("describes the case and the prompt without contact data", () => {
    const risk = assessInventoryRisk(forecast, demand, inventory(10));
    if (!risk) throw new Error("expected a risk");
    const details = JSON.parse(inventoryCaseDetails(risk));
    expect(details).toMatchObject({
      locationId: "sacramento",
      managerName: "Tom Okafor",
      window: { from: "2026-09-27", to: "2026-09-28", days: 2 },
    });
    expect(inventoryRiskPrompt(risk)).toContain(
      "Açaí packs: 10 pack on hand and 0 on order, 150 needed",
    );
    expect(inventoryCaseDetails(risk)).not.toMatch(/@/);
  });
});

describe("inventory check tools", () => {
  it("buckets forecast days for demand planning: heat by temperature, rain when wet", async () => {
    expect(demandCondition("clear", 95, 0)).toBe("heat");
    expect(demandCondition("cloudy", 70, 70)).toBe("rain");
    expect(demandCondition("drizzle", 70, 10)).toBe("rain");
    expect(demandCondition("fog", 64, 5)).toBe("fog");
    const result = await fetchForecast("fresno", 2, async (url) => {
      expect(String(url)).toContain("forecast_days=2");
      return new Response(
        JSON.stringify({
          daily: {
            time: ["2026-09-27", "2026-09-28"],
            weather_code: [0, 61],
            temperature_2m_max: [96.4, 71],
            temperature_2m_min: [60, 55],
            precipitation_probability_max: [0, 80],
          },
        }),
      );
    });
    expect(result).toMatchObject({
      city: "Fresno",
      days: [
        { date: "2026-09-27", demandCondition: "heat", highF: 96 },
        { date: "2026-09-28", demandCondition: "rain", precipitationChance: 80 },
      ],
    });
  });

  it("randomizes stock per location and day, and keeps it stable within the day", () => {
    const today = locationInventory("sacramento", "2026-09-27");
    expect(locationInventory("sacramento", "2026-09-27")).toEqual(today);
    expect(locationInventory("sacramento", "2026-09-28")?.items).not.toEqual(today?.items);
    for (const item of today?.items ?? []) {
      expect(item.parLevel).toBeCloseTo(item.avgDailyUse * 3, 0);
      expect(item.onHand).toBeGreaterThan(0);
    }
  });

  it("routes inventory questions to the inventory plan", () => {
    expect(isInventoryCheck("Check inventory at Sacramento against this week's forecast")).toBe(
      true,
    );
    expect(isInventoryCheck("Are any ingredients running low at our Fresno store?")).toBe(true);
    expect(isInventoryCheck("Draft a push for the lunch crowd")).toBe(false);
  });

  it("checks inventory locally, suggests a case, and opens it only after confirmation", async () => {
    await SELF.fetch("https://example.test/agent/working-set/reset", { method: "POST" });
    const stub = await agentStubFor();
    const text = await runInDurableObject(stub, async (instance) => {
      const agent = instance as unknown as {
        messages: unknown[];
        onChatMessage: (onFinish: unknown) => Promise<Response>;
      };
      agent.messages = [
        {
          id: "m1",
          role: "user",
          parts: [
            { type: "text", text: "Check inventory for our Sacramento store against the forecast" },
          ],
        },
      ];
      return (await agent.onChatMessage(() => undefined)).text();
    });
    expect(text).toContain("Inventory check for Coastline Kitchen Sacramento");
    const state = await runInDurableObject(
      stub,
      (instance) => (instance as unknown as { state: OrchestratorState }).state,
    );
    expect(state.inventoryRisk?.manager).toEqual({ name: "Tom Okafor" });
    expect(state.inventoryRisk?.lowItems.length).toBeGreaterThan(0);
    expect(state.workingSet.cards.map((card) => card.eyebrow)).toEqual(
      expect.arrayContaining(["Forecast", "Store inventory", "Inventory risk"]),
    );
    const suggestion = state.suggestions.find((item) => item.action === "create-inventory-case");
    expect(suggestion?.title).toContain("Tom Okafor");

    const prepared = await SELF.fetch(
      `https://example.test/agent/suggestions/${suggestion?.id}/accept`,
      { method: "POST" },
    );
    expect(prepared.status).toBe(201);
    const confirmation = (await prepared.json()) as Confirmation;
    expect(confirmation).toMatchObject({
      action: "create-inventory-case",
      recordId: "location:sacramento",
      inventoryCase: { city: "Sacramento", manager: { name: "Tom Okafor" } },
    });
    // The request hash is exactly the SHA-256 of the case contents Salesforce receives.
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(confirmation.inventoryCase?.detailsJson),
    );
    expect(confirmation.requestHash).toBe(
      [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
    );

    const executed = await SELF.fetch("https://example.test/agent/confirmations/execute", {
      method: "POST",
    });
    expect(executed.status).toBe(200);
    const body = (await executed.json()) as { result: { caseNumber: string; readBack: boolean } };
    expect(body.result).toMatchObject({ caseNumber: "00001001", readBack: true });
    const after = await runInDurableObject(
      stub,
      (instance) => (instance as unknown as { state: OrchestratorState }).state,
    );
    expect(after.workingSet.records[0]).toMatchObject({ objectType: "Case", relation: "created" });
  });
});
