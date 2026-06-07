// SSOT 타입 — schemas/*.schema.json 의 거울. (GOAL.md Iron Law 2)
// 변경 시: 스키마 먼저 고치고 → 이 타입 → validate → render 순서로 전파.

export type Viewport = "desktop" | "tablet" | "mobile";
export type SectionType =
  | "header" | "hero" | "feature" | "cards" | "testimonial" | "pricing" | "faq" | "footer" | "custom";
export type LayoutMode = "centered" | "split" | "grid" | "asymmetric" | "stacked";
export type CtaVariant = "primary" | "secondary" | "ghost";
export type Density = "compact" | "balanced" | "spacious";
export type Radius = "sharp" | "soft" | "round";
export type Shadow = "none" | "subtle" | "strong";

export interface Cta {
  label: string;
  href: string;
  variant: CtaVariant;
}
export interface SectionItem {
  title: string | null;
  body: string | null;
  value: string | null;
  href: string | null;
}
export interface SectionContent {
  eyebrow: string | null;
  headline: string | null;
  body: string | null;
  ctas: Cta[];
  items: SectionItem[];
}
export interface SectionLayout {
  mode: LayoutMode;
  maxWidth: string;
  spacing: string;
}
export interface SectionStyle {
  background: string;
  textColor: string;
  accentColor: string | null;
  radius: string | null;
}
export interface SectionSpec {
  id: string;
  type: SectionType;
  label: string;
  order: number;
  enabled: boolean;
  layout: SectionLayout;
  content: SectionContent;
  style: SectionStyle;
}
export interface DesignSystem {
  colors: { background: string[]; text: string[]; accent: string[]; border: string[] };
  typography: { fontFamilies: string[]; headingScale: string[]; bodyScale: string[] };
  spacing: { sectionGap: string; containerWidth: string; paddingPattern: string };
  visualStyle: { mood: string[]; density: Density; radius: Radius; shadow: Shadow };
}
export interface LandingReferenceAnalysis {
  source: { url: string; capturedAt: string; viewport: Viewport };
  designSystem: DesignSystem;
  structure: { sections: SectionSpec[] };
}

export interface PatchOperation {
  op: "add" | "replace" | "remove";
  path: string;
  value: string | null; // JSON 인코딩된 값 (applier 가 JSON.parse). remove 면 null.
  reason: string;
}
export interface CustomizationPatch {
  target: { sectionId: string | null; path: string | null };
  instruction: string;
  operations: PatchOperation[];
}

export type RunStatus =
  | "created" | "capturing" | "analyzing" | "customizing" | "generating" | "verifying" | "completed" | "failed";
export interface LandingRun {
  id: string;
  status: RunStatus;
  referenceUrl: string;
  userGoal: string;
  analysisVersion: number;
  customizationVersion: number;
  generationVersion: number;
  createdAt: string;
  updatedAt: string;
}

// ───────────── coercion: LLM/patch 결과를 항상 스키마 유효 객체로 정규화 ─────────────
const SECTION_TYPES: SectionType[] = [
  "header", "hero", "feature", "cards", "testimonial", "pricing", "faq", "footer", "custom",
];
const LAYOUT_MODES: LayoutMode[] = ["centered", "split", "grid", "asymmetric", "stacked"];
const CTA_VARIANTS: CtaVariant[] = ["primary", "secondary", "ghost"];

function asStr(v: unknown, d = ""): string {
  return typeof v === "string" ? v : d;
}
function asStrOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function asStrArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function asNum(v: unknown, d = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}
function asBool(v: unknown, d = true): boolean {
  return typeof v === "boolean" ? v : d;
}
function asEnum<T extends string>(v: unknown, allowed: T[], d: T): T {
  return typeof v === "string" && (allowed as string[]).includes(v) ? (v as T) : d;
}
function asStrArrOr(v: unknown, fallback: string[]): string[] {
  const a = asStrArr(v);
  return a.length ? a : fallback;
}

function normCta(v: unknown): Cta {
  const o = (v ?? {}) as Record<string, unknown>;
  return { label: asStr(o.label, "자세히"), href: asStr(o.href, "#"), variant: asEnum(o.variant, CTA_VARIANTS, "primary") };
}
function normItem(v: unknown): SectionItem {
  const o = (v ?? {}) as Record<string, unknown>;
  return { title: asStrOrNull(o.title), body: asStrOrNull(o.body), value: asStrOrNull(o.value), href: asStrOrNull(o.href) };
}

export function normalizeSection(v: unknown, index = 0): SectionSpec {
  const o = (v ?? {}) as Record<string, unknown>;
  const content = (o.content ?? {}) as Record<string, unknown>;
  const layout = (o.layout ?? {}) as Record<string, unknown>;
  const style = (o.style ?? {}) as Record<string, unknown>;
  const type = asEnum(o.type, SECTION_TYPES, "custom");
  return {
    id: asStr(o.id, `sec-${type}-${index}`),
    type,
    label: asStr(o.label, type),
    order: asNum(o.order, index),
    enabled: asBool(o.enabled, true),
    layout: {
      mode: asEnum(layout.mode, LAYOUT_MODES, "centered"),
      maxWidth: asStr(layout.maxWidth, "1120px"),
      spacing: asStr(layout.spacing, "gap-8"),
    },
    content: {
      eyebrow: asStrOrNull(content.eyebrow),
      headline: asStrOrNull(content.headline),
      body: asStrOrNull(content.body),
      ctas: Array.isArray(content.ctas) ? content.ctas.map(normCta) : [],
      items: Array.isArray(content.items) ? content.items.map(normItem) : [],
    },
    style: {
      background: asStr(style.background, "#ffffff"),
      textColor: asStr(style.textColor, "#0b0b0f"),
      accentColor: asStrOrNull(style.accentColor),
      radius: asStrOrNull(style.radius),
    },
  };
}

export function normalizeAnalysis(v: unknown): LandingReferenceAnalysis {
  const o = (v ?? {}) as Record<string, unknown>;
  const source = (o.source ?? {}) as Record<string, unknown>;
  const ds = (o.designSystem ?? {}) as Record<string, unknown>;
  const colors = (ds.colors ?? {}) as Record<string, unknown>;
  const typo = (ds.typography ?? {}) as Record<string, unknown>;
  const spacing = (ds.spacing ?? {}) as Record<string, unknown>;
  const vs = (ds.visualStyle ?? {}) as Record<string, unknown>;
  const structure = (o.structure ?? {}) as Record<string, unknown>;
  const sections = Array.isArray(structure.sections) ? structure.sections : [];
  return {
    source: {
      url: asStr(source.url, ""),
      capturedAt: asStr(source.capturedAt, new Date().toISOString()),
      viewport: asEnum(source.viewport, ["desktop", "tablet", "mobile"] as Viewport[], "desktop"),
    },
    designSystem: {
      colors: {
        background: asStrArrOr(colors.background, ["#ffffff"]),
        text: asStrArrOr(colors.text, ["#0b0b0f"]),
        accent: asStrArrOr(colors.accent, ["#6366f1"]),
        border: asStrArrOr(colors.border, ["#e5e7eb"]),
      },
      typography: {
        fontFamilies: asStrArrOr(typo.fontFamilies, ["Inter, sans-serif"]),
        headingScale: asStrArrOr(typo.headingScale, ["3rem", "2rem", "1.25rem"]),
        bodyScale: asStrArrOr(typo.bodyScale, ["1rem"]),
      },
      spacing: {
        sectionGap: asStr(spacing.sectionGap, "6rem"),
        containerWidth: asStr(spacing.containerWidth, "1120px"),
        paddingPattern: asStr(spacing.paddingPattern, "py-24 px-6"),
      },
      visualStyle: {
        mood: asStrArrOr(vs.mood, ["clean", "modern"]),
        density: asEnum(vs.density, ["compact", "balanced", "spacious"] as Density[], "balanced"),
        radius: asEnum(vs.radius, ["sharp", "soft", "round"] as Radius[], "soft"),
        shadow: asEnum(vs.shadow, ["none", "subtle", "strong"] as Shadow[], "subtle"),
      },
    },
    structure: { sections: sections.map((s, i) => normalizeSection(s, i)) },
  };
}
