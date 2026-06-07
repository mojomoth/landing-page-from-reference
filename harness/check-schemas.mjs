// 검증 사다리 1단계 (가장 쌈): JSON Schema 컴파일 + fixture 검증.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let Ajv2020;
try {
  ({ default: Ajv2020 } = await import("ajv/dist/2020.js"));
} catch {
  console.error("✗ ajv 미설치. 'npm install' 후 재실행하세요 (Phase B).");
  process.exit(1);
}

const ajv = new Ajv2020({ allErrors: true, strict: false });

const cases = [
  { name: "analysis", schema: "schemas/analysis.schema.json", fixture: "schemas/examples/analysis.example.json" },
  { name: "patch", schema: "schemas/patch.schema.json", fixture: "schemas/examples/patch.example.json" },
];

let ok = true;
for (const c of cases) {
  let validate;
  try {
    const schema = JSON.parse(readFileSync(join(root, c.schema), "utf8"));
    validate = ajv.compile(schema);
  } catch (e) {
    ok = false;
    console.error(`✗ ${c.name}: 스키마 컴파일 실패 — ${e.message}`);
    continue;
  }
  const data = JSON.parse(readFileSync(join(root, c.fixture), "utf8"));
  if (validate(data)) {
    console.log(`✓ ${c.name}: fixture 검증 통과`);
  } else {
    ok = false;
    console.error(`✗ ${c.name}: fixture 검증 실패`);
    for (const e of validate.errors ?? []) console.error(`   ${e.instancePath || "/"} ${e.message}`);
  }
}

process.exit(ok ? 0 : 1);
