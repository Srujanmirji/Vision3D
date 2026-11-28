import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const source = process.argv[2];
const input = await readFile(source);
const length = input.readUInt32LE(12);
const binary = input.subarray(20 + length);
const text = input.toString("utf8", 20, 20 + length);
for (const variant of ["roughness-only", "normal-only"]) {
  const doc = JSON.parse(text);
  const material = doc.materials[0];
  const pbr = material.pbrMetallicRoughness;
  pbr.metallicFactor = 0;
  if (variant === "roughness-only") delete material.normalTexture;
  else pbr.roughnessFactor = 1;
  const json = Buffer.from(JSON.stringify(doc));
  const padding = Buffer.alloc((4 - json.length % 4) % 4, " ");
  const header = Buffer.from(input.subarray(0, 20));
  header.writeUInt32LE(json.length + padding.length, 12);
  header.writeUInt32LE(header.length + json.length + padding.length + binary.length, 8);
  await writeFile(path.join(path.dirname(source), `shoe-${variant}.glb`), Buffer.concat([header, json, padding, binary]));
}
