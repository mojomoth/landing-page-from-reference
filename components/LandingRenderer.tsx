// 데이터 기반 랜딩 렌더러 — 최종 JSON(LandingReferenceAnalysis)을 React 로 렌더.
// /preview/[runId] (영속) 과 Inspector 실시간 프리뷰가 공유한다. (GOAL.md 정식 해석)
import type { CSSProperties } from "react";
import type { LandingReferenceAnalysis, DesignSystem, SectionSpec, Cta } from "@/lib/schema";

function radiusOf(s: SectionSpec, ds: DesignSystem): string {
  if (s.style.radius) return s.style.radius;
  return ds.visualStyle.radius === "round" ? "1.5rem" : ds.visualStyle.radius === "sharp" ? "0px" : "0.75rem";
}
function shadowOf(ds: DesignSystem): string {
  return ds.visualStyle.shadow === "strong"
    ? "0 24px 60px rgba(0,0,0,0.28)"
    : ds.visualStyle.shadow === "subtle"
      ? "0 10px 30px rgba(0,0,0,0.10)"
      : "none";
}
function gapOf(ds: DesignSystem): string {
  return ds.visualStyle.density === "spacious" ? "7rem" : ds.visualStyle.density === "compact" ? "3rem" : "5rem";
}

function CtaButton({ cta, accent }: { cta: Cta; accent: string }) {
  const base: CSSProperties = {
    display: "inline-block",
    padding: "0.85rem 1.5rem",
    borderRadius: "0.6rem",
    fontWeight: 600,
    fontSize: "0.95rem",
    textDecoration: "none",
    lineHeight: 1,
  };
  const style: CSSProperties =
    cta.variant === "primary"
      ? { ...base, background: accent, color: "#fff", boxShadow: `0 8px 20px ${accent}40` }
      : cta.variant === "secondary"
        ? { ...base, background: "transparent", color: accent, border: `1px solid ${accent}` }
        : { ...base, background: "transparent", color: "inherit", opacity: 0.75 };
  return (
    <a href={cta.href} style={style}>
      {cta.label}
    </a>
  );
}

function Eyebrow({ text, accent }: { text: string; accent: string }) {
  return (
    <div style={{ color: accent, fontWeight: 700, fontSize: "0.8rem", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.75rem" }}>
      {text}
    </div>
  );
}

function SectionFrame({ s, children, gap }: { s: SectionSpec; children: React.ReactNode; gap: string }) {
  return (
    <section id={s.id} style={{ background: s.style.background, color: s.style.textColor, padding: `${gap} 1.5rem` }}>
      <div style={{ maxWidth: s.layout.maxWidth, margin: "0 auto" }}>{children}</div>
    </section>
  );
}

function HeaderSection({ s }: { s: SectionSpec }) {
  const accent = s.style.accentColor ?? "#6366f1";
  return (
    <header style={{ background: s.style.background, color: s.style.textColor, borderBottom: "1px solid rgba(127,127,127,0.18)" }}>
      <div style={{ maxWidth: s.layout.maxWidth, margin: "0 auto", padding: "1.1rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
        <div style={{ fontWeight: 800, fontSize: "1.15rem" }}>{s.content.headline ?? "Brand"}</div>
        <nav style={{ display: "flex", gap: "1.5rem", alignItems: "center", fontSize: "0.9rem", opacity: 0.85 }}>
          {s.content.items.map((it, i) => (
            <a key={i} href={it.href ?? "#"} style={{ color: "inherit", textDecoration: "none" }}>
              {it.title}
            </a>
          ))}
          {s.content.ctas.map((c, i) => (
            <CtaButton key={i} cta={c} accent={accent} />
          ))}
        </nav>
      </div>
    </header>
  );
}

function HeroSection({ s, ds, gap }: { s: SectionSpec; ds: DesignSystem; gap: string }) {
  const accent = s.style.accentColor ?? ds.colors.accent[0] ?? "#6366f1";
  const h1 = ds.typography.headingScale[0] ?? "3.25rem";
  const split = s.layout.mode === "split";
  return (
    <SectionFrame s={s} gap={gap}>
      <div style={{ display: split ? "grid" : "block", gridTemplateColumns: split ? "1.1fr 0.9fr" : undefined, gap: "3rem", alignItems: "center", textAlign: split ? "left" : "center" }}>
        <div style={{ margin: split ? undefined : "0 auto", maxWidth: split ? undefined : "760px" }}>
          {s.content.eyebrow && <Eyebrow text={s.content.eyebrow} accent={accent} />}
          {s.content.headline && (
            <h1 style={{ fontSize: h1, lineHeight: 1.08, margin: "0 0 1.1rem", fontWeight: 800, letterSpacing: "-0.02em" }}>{s.content.headline}</h1>
          )}
          {s.content.body && <p style={{ fontSize: "1.15rem", lineHeight: 1.6, opacity: 0.8, margin: "0 0 1.8rem" }}>{s.content.body}</p>}
          <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap", justifyContent: split ? "flex-start" : "center" }}>
            {s.content.ctas.map((c, i) => (
              <CtaButton key={i} cta={c} accent={accent} />
            ))}
          </div>
        </div>
        {split && (
          <div
            aria-hidden
            style={{
              height: "320px",
              borderRadius: radiusOf(s, ds),
              background: `linear-gradient(135deg, ${accent} 0%, ${accent}55 45%, transparent 100%)`,
              boxShadow: shadowOf(ds),
              border: "1px solid rgba(127,127,127,0.15)",
            }}
          />
        )}
      </div>
    </SectionFrame>
  );
}

function CardsSection({ s, ds, gap }: { s: SectionSpec; ds: DesignSystem; gap: string }) {
  const accent = s.style.accentColor ?? ds.colors.accent[0] ?? "#6366f1";
  const h2 = ds.typography.headingScale[1] ?? "2rem";
  return (
    <SectionFrame s={s} gap={gap}>
      <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
        {s.content.eyebrow && <Eyebrow text={s.content.eyebrow} accent={accent} />}
        {s.content.headline && <h2 style={{ fontSize: h2, margin: 0, fontWeight: 800, letterSpacing: "-0.01em" }}>{s.content.headline}</h2>}
        {s.content.body && <p style={{ opacity: 0.75, marginTop: "0.75rem" }}>{s.content.body}</p>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.25rem" }}>
        {s.content.items.map((it, i) => (
          <div
            key={i}
            style={{
              padding: "1.6rem",
              borderRadius: radiusOf(s, ds),
              background: "rgba(127,127,127,0.06)",
              border: "1px solid rgba(127,127,127,0.14)",
              boxShadow: shadowOf(ds),
            }}
          >
            <div style={{ width: 40, height: 40, borderRadius: "0.6rem", background: accent, opacity: 0.9, marginBottom: "1rem" }} />
            {it.title && <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem", fontWeight: 700 }}>{it.title}</h3>}
            {it.body && <p style={{ margin: 0, opacity: 0.75, lineHeight: 1.55, fontSize: "0.95rem" }}>{it.body}</p>}
          </div>
        ))}
      </div>
    </SectionFrame>
  );
}

function PricingSection({ s, ds, gap }: { s: SectionSpec; ds: DesignSystem; gap: string }) {
  const accent = s.style.accentColor ?? ds.colors.accent[0] ?? "#6366f1";
  const h2 = ds.typography.headingScale[1] ?? "2rem";
  return (
    <SectionFrame s={s} gap={gap}>
      <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
        {s.content.eyebrow && <Eyebrow text={s.content.eyebrow} accent={accent} />}
        {s.content.headline && <h2 style={{ fontSize: h2, margin: 0, fontWeight: 800 }}>{s.content.headline}</h2>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1.25rem" }}>
        {s.content.items.map((it, i) => {
          const featured = i === 1;
          return (
            <div
              key={i}
              style={{
                padding: "2rem 1.6rem",
                borderRadius: radiusOf(s, ds),
                background: featured ? accent : "rgba(127,127,127,0.06)",
                color: featured ? "#fff" : "inherit",
                border: `1px solid ${featured ? accent : "rgba(127,127,127,0.14)"}`,
                boxShadow: featured ? shadowOf(ds) : "none",
                textAlign: "center",
              }}
            >
              {it.title && <div style={{ fontWeight: 700, fontSize: "1.05rem", marginBottom: "0.5rem" }}>{it.title}</div>}
              {it.value && <div style={{ fontSize: "2rem", fontWeight: 800, margin: "0.25rem 0" }}>{it.value}</div>}
              {it.body && <div style={{ opacity: 0.8, fontSize: "0.9rem", marginBottom: "1.2rem" }}>{it.body}</div>}
              <a
                href={it.href ?? "#"}
                style={{
                  display: "inline-block",
                  padding: "0.6rem 1.2rem",
                  borderRadius: "0.5rem",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  textDecoration: "none",
                  background: featured ? "#fff" : accent,
                  color: featured ? accent : "#fff",
                }}
              >
                선택
              </a>
            </div>
          );
        })}
      </div>
    </SectionFrame>
  );
}

function FaqSection({ s, ds, gap }: { s: SectionSpec; ds: DesignSystem; gap: string }) {
  const accent = s.style.accentColor ?? ds.colors.accent[0] ?? "#6366f1";
  const h2 = ds.typography.headingScale[1] ?? "2rem";
  return (
    <SectionFrame s={s} gap={gap}>
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        {s.content.eyebrow && <Eyebrow text={s.content.eyebrow} accent={accent} />}
        {s.content.headline && <h2 style={{ fontSize: h2, margin: 0, fontWeight: 800 }}>{s.content.headline}</h2>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
        {s.content.items.map((it, i) => (
          <div key={i} style={{ padding: "1.3rem 1.5rem", borderRadius: radiusOf(s, ds), background: "rgba(127,127,127,0.06)", border: "1px solid rgba(127,127,127,0.14)" }}>
            {it.title && <div style={{ fontWeight: 700, marginBottom: "0.4rem" }}>{it.title}</div>}
            {it.body && <div style={{ opacity: 0.78, lineHeight: 1.55, fontSize: "0.95rem" }}>{it.body}</div>}
          </div>
        ))}
      </div>
    </SectionFrame>
  );
}

function TestimonialSection({ s, ds, gap }: { s: SectionSpec; ds: DesignSystem; gap: string }) {
  const accent = s.style.accentColor ?? ds.colors.accent[0] ?? "#6366f1";
  return (
    <SectionFrame s={s} gap={gap}>
      {s.content.headline && <h2 style={{ textAlign: "center", fontSize: "1.8rem", fontWeight: 800, marginBottom: "2rem" }}>{s.content.headline}</h2>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.25rem" }}>
        {s.content.items.map((it, i) => (
          <blockquote key={i} style={{ margin: 0, padding: "1.6rem", borderRadius: radiusOf(s, ds), background: "rgba(127,127,127,0.06)", borderLeft: `3px solid ${accent}` }}>
            {it.body && <p style={{ margin: "0 0 0.8rem", fontStyle: "italic", lineHeight: 1.55 }}>“{it.body}”</p>}
            {it.title && <footer style={{ fontWeight: 700, fontSize: "0.9rem" }}>— {it.title}</footer>}
          </blockquote>
        ))}
      </div>
    </SectionFrame>
  );
}

function FooterSection({ s }: { s: SectionSpec }) {
  return (
    <footer style={{ background: s.style.background, color: s.style.textColor, padding: "3rem 1.5rem" }}>
      <div style={{ maxWidth: s.layout.maxWidth, margin: "0 auto", textAlign: "center", opacity: 0.8, fontSize: "0.9rem" }}>
        {s.content.body ?? "© 2026"}
      </div>
    </footer>
  );
}

function GenericSection({ s, ds, gap }: { s: SectionSpec; ds: DesignSystem; gap: string }) {
  const accent = s.style.accentColor ?? ds.colors.accent[0] ?? "#6366f1";
  return (
    <SectionFrame s={s} gap={gap}>
      {s.content.eyebrow && <Eyebrow text={s.content.eyebrow} accent={accent} />}
      {s.content.headline && <h2 style={{ fontSize: "1.8rem", fontWeight: 800, margin: "0 0 0.75rem" }}>{s.content.headline}</h2>}
      {s.content.body && <p style={{ opacity: 0.78, lineHeight: 1.6 }}>{s.content.body}</p>}
      <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.2rem", flexWrap: "wrap" }}>
        {s.content.ctas.map((c, i) => (
          <CtaButton key={i} cta={c} accent={accent} />
        ))}
      </div>
    </SectionFrame>
  );
}

function renderSection(s: SectionSpec, ds: DesignSystem, gap: string) {
  switch (s.type) {
    case "header":
      return <HeaderSection s={s} />;
    case "hero":
      return <HeroSection s={s} ds={ds} gap={gap} />;
    case "feature":
    case "cards":
      return <CardsSection s={s} ds={ds} gap={gap} />;
    case "pricing":
      return <PricingSection s={s} ds={ds} gap={gap} />;
    case "faq":
      return <FaqSection s={s} ds={ds} gap={gap} />;
    case "testimonial":
      return <TestimonialSection s={s} ds={ds} gap={gap} />;
    case "footer":
      return <FooterSection s={s} />;
    default:
      return <GenericSection s={s} ds={ds} gap={gap} />;
  }
}

export function LandingRenderer({ analysis }: { analysis: LandingReferenceAnalysis }) {
  const ds = analysis.designSystem;
  const font = ds.typography.fontFamilies[0] ?? "Inter, system-ui, sans-serif";
  const gap = gapOf(ds);
  const sections = [...analysis.structure.sections].filter((s) => s.enabled).sort((a, b) => a.order - b.order);
  return (
    <div style={{ fontFamily: font, background: ds.colors.background[0] ?? "#fff", color: ds.colors.text[0] ?? "#0b0b0f" }}>
      {sections.map((s) => (
        <div key={s.id}>{renderSection(s, ds, gap)}</div>
      ))}
    </div>
  );
}
