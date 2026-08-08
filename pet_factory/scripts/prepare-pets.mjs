import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectDirectory = resolve(import.meta.dirname, "..");
const sourceDirectory = resolve(projectDirectory, "..", "pets");
const outputDirectory = resolve(projectDirectory, "public", "pets");

const entries = await readdir(sourceDirectory, { withFileTypes: true });
const pets = [];

for (const entry of entries) {
  if (!entry.isDirectory()) continue;

  const sourcePetDirectory = resolve(sourceDirectory, entry.name);
  const manifestPath = resolve(sourcePetDirectory, "pet.json");
  const spritesheetPath = resolve(sourcePetDirectory, "spritesheet.webp");

  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    await readFile(spritesheetPath);

    if (
      manifest.spriteVersionNumber !== 2 ||
      typeof manifest.id !== "string" ||
      typeof manifest.displayName !== "string" ||
      manifest.id !== entry.name
    ) {
      console.warn(`跳过 ${entry.name}：需要匹配目录名的 hatch-pet v2 pet.json`);
      continue;
    }

    const targetPetDirectory = resolve(outputDirectory, manifest.id);
    await mkdir(targetPetDirectory, { recursive: true });
    await cp(manifestPath, resolve(targetPetDirectory, "pet.json"));
    await cp(spritesheetPath, resolve(targetPetDirectory, "spritesheet.webp"));

    pets.push({
      id: manifest.id,
      displayName: manifest.displayName,
      description: typeof manifest.description === "string" ? manifest.description : "",
      spriteVersionNumber: manifest.spriteVersionNumber,
      spritesheetUrl: `/pets/${encodeURIComponent(manifest.id)}/spritesheet.webp`,
    });
  } catch {
    console.warn(`跳过 ${entry.name}：缺少 pet.json 或 spritesheet.webp`);
  }
}

pets.sort((left, right) => left.displayName.localeCompare(right.displayName, "zh-Hans-CN"));
if (pets.length === 0) throw new Error("pets/ 下没有可打包的 hatch-pet v2 角色");

await mkdir(outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, "index.json"), `${JSON.stringify({ pets }, null, 2)}\n`);
console.log(`已发现并准备 ${pets.length} 个宠物：${pets.map((pet) => pet.displayName).join("、")}`);
