import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

async function activeWorkUnit() {
  const units = await readdir("docs/work-units");
  let newestBlocked;
  for (const file of units
    .filter((name) => name.startsWith("WU-") && name.endsWith(".md"))
    .sort()) {
    const content = await readFile(`docs/work-units/${file}`, "utf8");
    const id = file.match(/^(WU-\d+)/)?.[1];
    if (/^status: (active|in_progress)$/m.test(content)) return id ?? "WU-002";
    if (/^status: blocked$/m.test(content) && id) newestBlocked = id;
  }
  return newestBlocked ?? "WU-002";
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
