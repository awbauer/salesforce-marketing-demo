// Resolves an instance profile plus its industry pack (and optional personalization) into the
// values the app compiles in. Shared by the profile build, the init wizard and the template gate.
import { PackSchema, PersonalizationSchema } from "../../packages/contracts/src/pack.ts";
import { InstanceProfileSchema } from "../../packages/contracts/src/profile.ts";
import { getPack } from "../../packages/industry-packs/src/index.ts";

export function resolveBrands(profile, pack) {
  const brand = profile.client.brand;
  const sample = { restaurant: "Sample Kitchen", wealth: "Sample Wealth" };
  if (pack.id === "composite") return { parent: brand, ...sample };
  if (pack.modules.restaurant) return { parent: `${brand} Group`, ...sample, restaurant: brand };
  if (pack.modules.wealth) return { parent: `${brand} Group`, ...sample, wealth: brand };
  return { parent: brand, ...sample };
}

export function buildInstance(profileJson, personalizationJson) {
  const profile = InstanceProfileSchema.parse(profileJson);
  const base = getPack(profile.client.pack);
  const unknown = profile.useCases.filter((id) => !base.useCases.includes(id));
  if (unknown.length)
    throw new Error(`Use cases not offered by the ${base.id} pack: ${unknown.join(", ")}`);
  const personalization = personalizationJson
    ? PersonalizationSchema.parse(personalizationJson)
    : { vocabulary: undefined };
  const pack = PackSchema.parse({
    ...base,
    vocabulary: { ...base.vocabulary, ...(personalization.vocabulary ?? {}) },
  });
  return { profile, pack, brands: resolveBrands(profile, pack) };
}
