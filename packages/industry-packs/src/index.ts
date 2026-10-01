import type { IndustryPack, PackId } from "../../contracts/src/pack.ts";
import { b2bTechnology } from "./b2b-technology.ts";
import { composite } from "./composite.ts";
import { financialServices } from "./financial-services.ts";
import { healthcarePayer } from "./healthcare-payer.ts";
import { restaurant } from "./restaurant.ts";
import { retail } from "./retail.ts";
import { travelHospitality } from "./travel-hospitality.ts";

export const PACKS: Record<PackId, IndustryPack> = {
  composite,
  retail,
  restaurant,
  "financial-services": financialServices,
  "healthcare-payer": healthcarePayer,
  "b2b-technology": b2bTechnology,
  "travel-hospitality": travelHospitality,
};

export const getPack = (id: PackId): IndustryPack => PACKS[id];
export { CORE_USE_CASES } from "./retail.ts";
