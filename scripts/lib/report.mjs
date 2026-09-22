import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

async function activeWorkUnit() {
  const units = await readdir("docs/work-units");
  for (const file of units
    .filter((name) => name.startsWith("WU-") && name.endsWith(".md"))
    .sort()) {
    const content = await readFile(`docs/work-units/${file}`, "utf8");
    if (/^status: active$/m.test(content)) return file.match(/^(WU-\d+)/)?.[1] ?? "WU-002";
  }
  return "WU-002";
}

export async function report(name, data, workUnit) {
  const targetWorkUnit = workUnit ?? (await activeWorkUnit());
  const path = resolve(`artifacts/reports/${targetWorkUnit}/${name}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), ...data }, null, 2)}\n`,
  );
  return path;
}
