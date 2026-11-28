import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const validator = require(process.env.GLTF_VALIDATOR_MODULE || "gltf-validator");
const output = {};
for (const file of process.argv.slice(2)) {
  const report = await validator.validateBytes(new Uint8Array(await readFile(file)), { maxIssues: 30 });
  output[path.relative(fileURLToPath(new URL(".", import.meta.url)), file)] = {
    validatorVersion: report.validatorVersion,
    errors: report.issues.numErrors,
    warnings: report.issues.numWarnings,
    messages: report.issues.messages.map(({ code, severity, pointer }) => ({ code, severity, pointer })),
  };
  if (report.issues.numErrors > 0) process.exitCode = 1;
}
console.log(JSON.stringify(output, null, 2));
