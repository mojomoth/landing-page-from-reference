// 결정적 mock — 외부 의존(LLM/네트워크) 실패·부재 시 폴백 (GOAL.md Iron Law 5).
// 같은 입력이면 같은 출력 (Math.random 미사용) → 재현 가능.
import type { LandingReferenceAnalysis, CustomizationPatch, PatchOperation, SectionSpec } from "./schema";
import { normalizeAnalysis } from "./schema";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface Theme {
  name: string;
  bg: string;
  panel: string;
  text: string;
  muted: string;
  accent: string;
  border: string;
  mood: string[];
}

const THEMES: Theme[] = [
  { name: "indigo-dark", bg: "#0b0b0f", panel: "#14141b", text: "#e7e7ee", muted: "#9a9aab", accent: "#6366f1", border: "#262633", mood: ["bold", "modern", "tech"] },
  { name: "clean-light", bg: "#ffffff", panel: "#f5f5f7", text: "#111114", muted: "#6b7280", accent: "#2563eb", border: "#e5e7eb", mood: ["clean", "trustworthy"] },
  { name: "warm-editorial", bg: "#fbf7f0", panel: "#f3ece0", text: "#1c1917", muted: "#78716c", accent: "#ea580c", border: "#e7e0d4", mood: ["warm", "editorial"] },
];

function brandFromUrl(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    const base = h.split(".")[0] || "Brand";
    return base.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return "Brand";
  }
}

export function mockAnalysis(url: string, goal: string): LandingReferenceAnalysis {
  const seed = hash(`${url}|${goal}`);
  const t = THEMES[seed % THEMES.length];
  const brand = brandFromUrl(url);
  const topic = goal.trim() || "더 나은 제품";

  const sections: SectionSpec[] = [
    {
      id: "sec-header", type: "header", label: "Header", order: 0, enabled: true,
      layout: { mode: "split", maxWidth: "1200px", spacing: "gap-6" },
      content: {
        eyebrow: null, headline: brand, body: null,
        ctas: [{ label: "시작하기", href: "#cta", variant: "primary" }],
        items: [
          { title: "기능", body: null, value: null, href: "#features" },
          { title: "가격", body: null, value: null, href: "#pricing" },
          { title: "FAQ", body: null, value: null, href: "#faq" },
        ],
      },
      style: { background: t.bg, textColor: t.text, accentColor: t.accent, radius: null },
    },
    {
      id: "sec-hero", type: "hero", label: "Hero", order: 1, enabled: true,
      layout: { mode: "split", maxWidth: "1120px", spacing: "gap-12" },
      content: {
        eyebrow: topic,
        headline: `${topic}, ${brand}와 함께 시작하세요`,
        body: `${brand}는 레퍼런스의 구조와 시각 리듬을 재해석해 만든 데모 랜딩입니다.`,
        ctas: [
          { label: "무료로 시작", href: "#cta", variant: "primary" },
          { label: "데모 보기", href: "#demo", variant: "ghost" },
        ],
        items: [],
      },
      style: { background: t.bg, textColor: t.text, accentColor: t.accent, radius: "1.25rem" },
    },
    {
      id: "sec-features", type: "feature", label: "Features", order: 2, enabled: true,
      layout: { mode: "grid", maxWidth: "1120px", spacing: "gap-8" },
      content: {
        eyebrow: "기능", headline: "핵심 가치", body: null, ctas: [],
        items: [
          { title: "빠른 분석", body: "URL 하나로 디자인 토큰과 섹션 구조를 추출합니다.", value: null, href: null },
          { title: "자연어 커스터마이징", body: "원하는 변화를 말로 입력하면 JSON Patch로 반영됩니다.", value: null, href: null },
          { title: "즉시 생성", body: "최종 JSON에서 랜딩을 곧바로 렌더링합니다.", value: null, href: null },
        ],
      },
      style: { background: t.panel, textColor: t.text, accentColor: t.accent, radius: "1rem" },
    },
    {
      id: "sec-pricing", type: "pricing", label: "Pricing", order: 3, enabled: true,
      layout: { mode: "grid", maxWidth: "1120px", spacing: "gap-6" },
      content: {
        eyebrow: "가격", headline: "간단한 요금제", body: null, ctas: [],
        items: [
          { title: "Starter", body: "개인 프로젝트", value: "₩0", href: "#cta" },
          { title: "Pro", body: "성장하는 팀", value: "₩19,000", href: "#cta" },
          { title: "Scale", body: "대규모 조직", value: "문의", href: "#cta" },
        ],
      },
      style: { background: t.bg, textColor: t.text, accentColor: t.accent, radius: "1rem" },
    },
    {
      id: "sec-faq", type: "faq", label: "FAQ", order: 4, enabled: true,
      layout: { mode: "stacked", maxWidth: "820px", spacing: "gap-4" },
      content: {
        eyebrow: "FAQ", headline: "자주 묻는 질문", body: null, ctas: [],
        items: [
          { title: "원본을 그대로 복사하나요?", body: "아니요. 구조와 스타일만 재해석하고 원본 자산은 복사하지 않습니다.", value: null, href: null },
          { title: "API 키가 필요한가요?", body: "없으면 결정적 mock 모드로 동작합니다.", value: null, href: null },
        ],
      },
      style: { background: t.panel, textColor: t.text, accentColor: t.accent, radius: "0.75rem" },
    },
    {
      id: "sec-footer", type: "footer", label: "Footer", order: 5, enabled: true,
      layout: { mode: "centered", maxWidth: "1120px", spacing: "gap-3" },
      content: { eyebrow: null, headline: null, body: `© 2026 ${brand}. Reference-inspired, not copied.`, ctas: [], items: [] },
      style: { background: t.bg, textColor: t.muted, accentColor: t.accent, radius: null },
    },
  ];

  return normalizeAnalysis({
    source: { url, capturedAt: new Date().toISOString(), viewport: "desktop" },
    designSystem: {
      colors: { background: [t.bg, t.panel], text: [t.text, t.muted], accent: [t.accent], border: [t.border] },
      typography: {
        fontFamilies: ["Inter, system-ui, sans-serif"],
        headingScale: ["3.5rem", "2.25rem", "1.5rem"],
        bodyScale: ["1.125rem", "1rem", "0.875rem"],
      },
      spacing: { sectionGap: "6rem", containerWidth: "1120px", paddingPattern: "py-24 px-6" },
      visualStyle: { mood: t.mood, density: "balanced", radius: "soft", shadow: "subtle" },
    },
    structure: { sections },
  });
}

/** 자연어 → CustomizationPatch (mock 휴리스틱). value 는 JSON 인코딩 문자열. */
export function mockPatch(instruction: string, analysis: LandingReferenceAnalysis): CustomizationPatch {
  const ops: PatchOperation[] = [];
  const text = instruction;
  const sections = analysis.structure.sections;
  const heroIdx = sections.findIndex((s) => s.type === "hero");

  if (/(다크|dark|어둡|night)/i.test(text)) {
    sections.forEach((_s, idx) => {
      ops.push({ op: "replace", path: `/structure/sections/${idx}/style/background`, value: JSON.stringify(idx % 2 === 0 ? "#0b0b0f" : "#111114"), reason: "다크 테마 배경" });
      ops.push({ op: "replace", path: `/structure/sections/${idx}/style/textColor`, value: JSON.stringify("#e7e7ee"), reason: "다크 대비 텍스트" });
    });
  }
  if (/(넓|spacious|여백|roomy)/i.test(text)) {
    ops.push({ op: "replace", path: `/designSystem/spacing/sectionGap`, value: JSON.stringify("9rem"), reason: "섹션 여백 확대" });
    ops.push({ op: "replace", path: `/designSystem/visualStyle/density`, value: JSON.stringify("spacious"), reason: "밀도 spacious" });
  }
  if (/(강렬|bold|시네마|impact|cinem)/i.test(text) && heroIdx >= 0) {
    ops.push({ op: "replace", path: `/structure/sections/${heroIdx}/content/headline`, value: JSON.stringify("압도적인 경험을 지금 시작하세요"), reason: "히어로 임팩트 강화" });
    ops.push({ op: "replace", path: `/structure/sections/${heroIdx}/style/background`, value: JSON.stringify("#0b0b0f"), reason: "시네마틱 다크" });
  }
  if (ops.length === 0 && heroIdx >= 0) {
    ops.push({ op: "replace", path: `/structure/sections/${heroIdx}/content/eyebrow`, value: JSON.stringify(text.slice(0, 48)), reason: "지시를 eyebrow 에 반영 (mock 기본 동작)" });
  }

  return {
    target: { sectionId: heroIdx >= 0 ? sections[heroIdx].id : null, path: null },
    instruction,
    operations: ops,
  };
}
