// 검증 사다리 3단계(런타임): 분석/패치 JSON 을 SSOT 스키마로 검증 (ajv).
import Ajv2020 from "ajv/dist/2020";
import type { AnySchema, ValidateFunction } from "ajv";
import analysisSchema from "../schemas/analysis.schema.json";
import patchSchema from "../schemas/patch.schema.json";
import type { LandingReferenceAnalysis, CustomizationPatch } from "./schema";

const ajv = new Ajv2020({ allErrors: true, strict: false });

const _validateAnalysis = ajv.compile(analysisSchema as unknown as AnySchema) as unknown as ValidateFunction<LandingReferenceAnalysis>;
const _validatePatch = ajv.compile(patchSchema as unknown as AnySchema) as unknown as ValidateFunction<CustomizationPatch>;

export type ValidationResult<T> = { ok: true; data: T } | { ok: false; errors: string[] };

function fmtErrors(fn: ValidateFunction): string[] {
  return (fn.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim());
}

export function validateAnalysis(data: unknown): ValidationResult<LandingReferenceAnalysis> {
  if (_validateAnalysis(data)) return { ok: true, data: data as LandingReferenceAnalysis };
  return { ok: false, errors: fmtErrors(_validateAnalysis) };
}

export function validatePatch(data: unknown): ValidationResult<CustomizationPatch> {
  if (_validatePatch(data)) return { ok: true, data: data as CustomizationPatch };
  return { ok: false, errors: fmtErrors(_validatePatch) };
}
