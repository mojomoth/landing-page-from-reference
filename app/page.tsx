"use client";

import { useCallback, useState } from "react";
import type { VerificationResult, DesignRetentionResult, ViewportScore } from "@/lib/clone-types";

type Stage = "input" | "clone" | "analyze" | "customize";

interface EditableField {
  id: string;
  kind?: string;
  type?: string;
  currentValue?: string;
  selector?: string;
  styleLocked?: boolean;
  layoutLocked?: boolean;
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(json?.error ?? `${res.status} ${res.statusText}`);
  return json as T;
}

function pct(n: number): string {
  return `${(Math.max(0, Math.min(1, n)) * 100).toFixed(1)}%`;
}

function ScoreTable({ label, s }: { label: string; s: ViewportScore }) {
  const visual = (s.pixelSimilarity + s.ssim) / 2;
  return (
    <div className="card" style={{ flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <strong>{label}</strong>
        <span className="pill" style={{ borderColor: s.passed ? "var(--ok)" : "var(--err)", color: s.passed ? "var(--ok)" : "var(--err)" }}>
          {s.passed ? "통과" : "실패"}
        </span>
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)", display: "grid", gridTemplateColumns: "1fr auto", rowGap: 4 }}>
        <span>시각 (pixel+ssim)/2</span><b style={{ color: visual >= 0.9 ? "var(--ok)" : "var(--err)" }}>{pct(visual)}</b>
        <span>pixel</span><span>{pct(s.pixelSimilarity)}</span>
        <span>ssim</span><span>{pct(s.ssim)}</span>
        <span>layout (IoU)</span><span>{pct(s.layoutSimilarity)}</span>
        <span>palette</span><span>{pct(s.paletteSimilarity)}</span>
      </div>
    </div>
  );
}

export default function Page() {
  const [stage, setStage] = useState<Stage>("input");
  const [url, setUrl] = useState("/fixture/index.html");
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null);
  const [fields, setFields] = useState<EditableField[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [retention, setRetention] = useState<DesignRetentionResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const addLog = useCallback((m: string) => setLog((l) => [...l.slice(-30), m]), []);
  const absUrl = useCallback((u: string) => (u.startsWith("http") ? u : `${location.origin}${u.startsWith("/") ? "" : "/"}${u}`), []);

  const runClone = useCallback(async () => {
    try {
      setBusy("캡처 → 에셋 mirror → clone 생성 → 재캡처 → 시각 비교 중… (수십 초)");
      setVerification(null);
      setAnalysis(null);
      setRetention(null);
      const target = absUrl(url.trim());
      const data = await api<{ captureId: string; verification: VerificationResult }>("/api/clone", { url: target });
      setCaptureId(data.captureId);
      setVerification(data.verification);
      setStage("clone");
      addLog(`clone ${data.verification.overallPassed ? "통과 ✓" : "실패 ✗"} — D ${pct((data.verification.desktop.pixelSimilarity + data.verification.desktop.ssim) / 2)} / M ${pct((data.verification.mobile.pixelSimilarity + data.verification.mobile.ssim) / 2)}`);
    } catch (e) {
      addLog(`clone 실패: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, [url, absUrl, addLog]);

  const runAnalyze = useCallback(async () => {
    if (!captureId) return;
    try {
      setBusy("clone 아티팩트 분석 중…");
      const data = await api<Record<string, unknown>>("/api/clone-analyze", { captureId });
      setAnalysis(data);
      const schema = (data.customizableSchema ?? data["customizable-schema"] ?? data.schema) as
        | { editableFields?: EditableField[] }
        | undefined;
      const ef = schema?.editableFields ?? [];
      setFields(ef);
      setEdits(Object.fromEntries(ef.filter((f) => (f.kind ?? f.type) === "text" || (f.kind ?? f.type) === "cta").map((f) => [f.id, f.currentValue ?? ""])));
      setStage("analyze");
      addLog(`분석 완료 — editable ${ef.length}개`);
    } catch (e) {
      addLog(`분석 실패(가드레일 차단 가능): ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, [captureId, addLog]);

  const runCustomize = useCallback(async () => {
    if (!captureId) return;
    try {
      setBusy("커스터마이징 적용 + 디자인 유지 검증 중…");
      const editList = Object.entries(edits)
        .filter(([, v]) => v.trim().length > 0)
        .map(([id, value]) => {
          const f = fields.find((x) => x.id === id);
          return { id, kind: (f?.kind ?? f?.type ?? "text") as string, value };
        });
      const data = await api<{ customizedHtmlWebPath: string; retention: DesignRetentionResult }>("/api/clone-customize", {
        captureId,
        edits: editList,
      });
      setRetention(data.retention);
      setStage("customize");
      addLog(`커스터마이징 ${data.retention.passed ? "유지 통과 ✓" : "유지 실패 ✗"} — component ${pct(data.retention.componentRetention)}`);
    } catch (e) {
      addLog(`커스터마이징 실패: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, [captureId, edits, fields, addLog]);

  const STAGES: { key: Stage; label: string }[] = [
    { key: "input", label: "1. 입력" },
    { key: "clone", label: "2. Capture & Clone" },
    { key: "analyze", label: "3. Analyze" },
    { key: "customize", label: "4. Customize & Generate" },
  ];
  const stageIdx = STAGES.findIndex((s) => s.key === stage);
  const guardPassed = verification?.overallPassed ?? false;
  const ts = (analysis?.designTokens ?? analysis?.["design-tokens"]) as
    | { colors?: { palette?: string[] }; typography?: { fontFamilies?: string[] } }
    | undefined;

  return (
    <div className="shell" style={{ gridTemplateColumns: "300px minmax(0,1fr) 480px" }}>
      <div className="topbar">
        <div className="brand">Landing Page from Reference — Clone</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {busy && <span className="muted" style={{ fontSize: 12 }}>{busy}</span>}
          {verification && (
            <span className="pill" style={{ borderColor: guardPassed ? "var(--ok)" : "var(--err)", color: guardPassed ? "var(--ok)" : "var(--err)" }}>
              Guardrail {guardPassed ? "PASS ≥90%" : "FAIL <90%"}
            </span>
          )}
        </div>
      </div>

      {/* Left: 파이프라인 + 입력 */}
      <aside className="sidebar">
        <div className="sidebar-title">파이프라인</div>
        {STAGES.map((s, i) => (
          <div key={s.key} className={`run-item${i === stageIdx ? " active" : ""}`} style={{ cursor: "default" }}>
            <div className="run-url">{s.label}</div>
            <div className="run-meta">{i < stageIdx ? "완료" : i === stageIdx ? "진행" : "대기"}</div>
          </div>
        ))}
        <div className="sidebar-title" style={{ marginTop: 16 }}>Reference URL</div>
        <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com 또는 /fixture/index.html" />
        <button className="btn btn-primary btn-block" style={{ marginTop: 10 }} onClick={() => void runClone()} disabled={!!busy}>
          Capture & Clone
        </button>
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          실제 브라우저 렌더 결과를 캡처하고 에셋을 mirror 해 로컬 clone 을 만든 뒤 ≥90% 일치를 강제합니다.
        </p>
        {log.length > 0 && <div className="log" style={{ marginTop: 12 }}>{log.join("\n")}</div>}
      </aside>

      {/* Center: 스크린샷 + 비교 */}
      <main className="workspace">
        {!verification && (
          <div className="card" style={{ maxWidth: 560 }}>
            <h2 style={{ marginTop: 0 }}>Reference 입력 후 Capture &amp; Clone</h2>
            <p className="muted">
              좌측에서 URL 을 넣고 실행하세요. 기본값은 통제 fixture(<code>/fixture/index.html</code>)입니다.
            </p>
          </div>
        )}

        {verification && captureId && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", gap: 12 }}>
              <ScoreTable label="Desktop 1440×900" s={verification.desktop} />
              <ScoreTable label="Mobile 390×844" s={verification.mobile} />
            </div>

            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <strong>원본 vs Clone (desktop)</strong>
                <span className="muted" style={{ fontSize: 12 }}>
                  섹션차 {verification.sectionCountDiff} · 폰트 {pct(verification.fontSimilarity)}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {(["original", "clone", "diff"] as const).map((k) => (
                  <figure key={k} style={{ margin: 0 }}>
                    <img src={`/captures/${captureId}/${k}-desktop.png`} alt={k} style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, background: "#fff" }} />
                    <figcaption className="muted" style={{ fontSize: 11, textAlign: "center", marginTop: 4 }}>{k}</figcaption>
                  </figure>
                ))}
              </div>
            </div>

            {!guardPassed && verification.failureReasons.length > 0 && (
              <div className="card" style={{ borderColor: "var(--err)" }}>
                <strong style={{ color: "var(--err)" }}>가드레일 실패 — 분석 차단 (GOAL §3)</strong>
                <ul className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                  {verification.failureReasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}

            {guardPassed && (
              <div className="card">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn btn-primary" onClick={() => void runAnalyze()} disabled={!!busy}>분석 (Loop E)</button>
                  <a className="btn" href={`/captures/${captureId}/clone.html`} target="_blank" rel="noreferrer">Clone 새 탭 ↗</a>
                  {retention && <a className="btn" href={`/customizations/${captureId}/customized-page.html`} target="_blank" rel="noreferrer">Customized 새 탭 ↗</a>}
                </div>
              </div>
            )}

            {retention && (
              <div className="card">
                <strong>디자인 유지 검증 (Loop G) — {retention.passed ? "통과 ✓" : "실패 ✗"}</strong>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 10, fontSize: 13 }}>
                  {([["token", retention.designTokenRetention], ["layout", retention.layoutRetention], ["typography", retention.typographyRetention], ["spacing", retention.spacingRetention], ["color", retention.colorRetention], ["component", retention.componentRetention]] as const).map(([k, v]) => (
                    <div key={k} className="muted">{k}: <b style={{ color: "var(--text)" }}>{pct(v)}</b></div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Right: 분석 + 커스터마이징 */}
      <aside className="inspector">
        <div className="tabs"><div className="tab active">분석 &amp; 커스터마이징</div></div>
        <div className="inspector-body">
          {!analysis && <div className="muted" style={{ fontSize: 13 }}>가드레일 통과 후 분석하면 구조·디자인 토큰·편집 필드가 여기 표시됩니다.</div>}

          {analysis && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {ts?.colors?.palette && (
                <div>
                  <div className="sidebar-title" style={{ margin: "0 0 6px" }}>팔레트</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {ts.colors.palette.slice(0, 12).map((c, i) => (
                      <span key={i} title={c} style={{ width: 22, height: 22, borderRadius: 5, background: c, border: "1px solid var(--border)" }} />
                    ))}
                  </div>
                </div>
              )}
              {ts?.typography?.fontFamilies && (
                <div className="muted" style={{ fontSize: 12 }}>폰트: {ts.typography.fontFamilies.slice(0, 3).join(" / ")}</div>
              )}

              <div className="sidebar-title" style={{ margin: "4px 0 0" }}>콘텐츠 편집 (디자인 잠금 🔒)</div>
              {fields.filter((f) => (f.kind ?? f.type) === "text" || (f.kind ?? f.type) === "cta").slice(0, 12).map((f) => (
                <div key={f.id}>
                  <label className="label">
                    {f.id} <span className="pill">{f.kind ?? f.type}</span> {f.styleLocked && <span className="pill">style 🔒</span>}
                  </label>
                  <input className="input" value={edits[f.id] ?? ""} onChange={(e) => setEdits((m) => ({ ...m, [f.id]: e.target.value }))} />
                </div>
              ))}
              {fields.length === 0 && <div className="muted" style={{ fontSize: 12 }}>편집 가능한 텍스트 필드가 감지되지 않았습니다.</div>}

              <button className="btn btn-primary" onClick={() => void runCustomize()} disabled={!!busy || fields.length === 0}>
                적용 + 유지 검증 (Loop F/G)
              </button>
              <p className="muted" style={{ fontSize: 11 }}>
                layout · typography · spacing · color · motion 은 잠금. 텍스트/CTA/이미지만 변경되며, 변경 후 디자인 유지를 텍스트 마스킹 비교로 검증합니다.
              </p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
