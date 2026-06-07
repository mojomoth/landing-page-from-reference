"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LandingReferenceAnalysis, LandingRun, SectionSpec } from "@/lib/schema";
import { LandingRenderer } from "@/components/LandingRenderer";

type Tab = "preview" | "json" | "controls";
type HistoryItem = { id: number; kind: string; payload: unknown; createdAt: string };

const STEPS = ["입력", "캡처", "분석", "커스터마이징", "생성"] as const;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(json?.error ?? `${res.status} ${res.statusText}`);
  return json as T;
}

export default function Page() {
  const [runs, setRuns] = useState<LandingRun[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<LandingReferenceAnalysis | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [url, setUrl] = useState("https://stripe.com");
  const [goal, setGoal] = useState("AI 강의 랜딩");
  const [composer, setComposer] = useState("");
  const [tab, setTab] = useState<Tab>("preview");
  const [busy, setBusy] = useState<string | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [generated, setGenerated] = useState<{ previewUrl: string; codePath: string } | null>(null);

  const activeRun = useMemo(() => runs.find((r) => r.id === activeId) ?? null, [runs, activeId]);
  const addLog = useCallback((m: string) => setLog((l) => [...l.slice(-40), m]), []);

  const loadRuns = useCallback(async () => {
    try {
      const { runs } = await api<{ runs: LandingRun[] }>("/api/runs");
      setRuns(runs);
    } catch (e) {
      addLog(`runs 로드 실패: ${(e as Error).message}`);
    }
  }, [addLog]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const openRun = useCallback(
    async (id: string) => {
      setActiveId(id);
      setGenerated(null);
      setDirty(false);
      try {
        const data = await api<{ run: LandingRun; analysis: LandingReferenceAnalysis | null; history: HistoryItem[] }>(`/api/runs/${id}`);
        setAnalysis(data.analysis);
        setHistory(data.history ?? []);
        setStepIdx(data.analysis ? 3 : 1);
        addLog(`run ${id} 로드 (${data.analysis ? "분석 있음" : "분석 없음"})`);
      } catch (e) {
        addLog(`run 로드 실패: ${(e as Error).message}`);
      }
    },
    [addLog],
  );

  const newRunForm = useCallback(() => {
    setActiveId(null);
    setAnalysis(null);
    setHistory([]);
    setGenerated(null);
    setStepIdx(0);
  }, []);

  // 입력 → 생성 파이프라인: create → capture → analyze
  const runAnalyze = useCallback(async () => {
    if (!url.trim()) {
      addLog("URL 을 입력하세요.");
      return;
    }
    try {
      setBusy("run 생성 중…");
      setStepIdx(0);
      const { run } = await api<{ run: LandingRun }>("/api/runs", {
        method: "POST",
        body: JSON.stringify({ referenceUrl: url.trim(), userGoal: goal.trim() }),
      });
      setActiveId(run.id);
      await loadRuns();

      setBusy("레퍼런스 캡처 중…");
      setStepIdx(1);
      const cap = await api<{ ok: boolean; fallback: boolean; summary: string }>("/api/capture", {
        method: "POST",
        body: JSON.stringify({ runId: run.id }),
      });
      addLog(`캡처 ${cap.fallback ? "(폴백)" : "성공"}: ${cap.summary}`);

      setBusy("디자인/구조 분석 중…");
      setStepIdx(2);
      const ana = await api<{ analysis: LandingReferenceAnalysis; mode: string }>("/api/analyze", {
        method: "POST",
        body: JSON.stringify({ runId: run.id }),
      });
      setAnalysis(ana.analysis);
      setStepIdx(3);
      addLog(`분석 완료 (${ana.mode}) — 섹션 ${ana.analysis.structure.sections.length}개`);
      await loadRuns();
      void openRun(run.id);
    } catch (e) {
      addLog(`분석 실패: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, [url, goal, addLog, loadRuns, openRun]);

  // 자연어 커스터마이징 → patch
  const sendComposer = useCallback(async () => {
    const instruction = composer.trim();
    if (!instruction || !activeId) return;
    try {
      setBusy("패치 생성 중…");
      setStepIdx(3);
      const data = await api<{ analysis: LandingReferenceAnalysis; patch: { operations: unknown[] }; mode: string }>("/api/patch", {
        method: "POST",
        body: JSON.stringify({ runId: activeId, instruction }),
      });
      setAnalysis(data.analysis);
      setComposer("");
      setDirty(false);
      addLog(`패치 적용 (${data.mode}) — ${data.patch.operations.length}개 연산`);
      void openRun(activeId);
    } catch (e) {
      addLog(`패치 실패: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, [composer, activeId, addLog, openRun]);

  // UI 컨트롤 직접 편집 저장 → PUT
  const saveAnalysis = useCallback(async () => {
    if (!activeId || !analysis) return;
    try {
      setBusy("저장 중…");
      const data = await api<{ analysis: LandingReferenceAnalysis }>(`/api/runs/${activeId}`, {
        method: "PUT",
        body: JSON.stringify({ analysis }),
      });
      setAnalysis(data.analysis);
      setDirty(false);
      addLog("변경 저장됨 (customization 버전 +1)");
      void loadRuns();
    } catch (e) {
      addLog(`저장 실패: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, [activeId, analysis, addLog, loadRuns]);

  // Make → generate
  const runGenerate = useCallback(async () => {
    if (!activeId) return;
    try {
      setBusy("랜딩 생성 중…");
      setStepIdx(4);
      const data = await api<{ previewUrl: string; codePath: string }>("/api/generate", {
        method: "POST",
        body: JSON.stringify({ runId: activeId }),
      });
      setGenerated(data);
      addLog(`생성 완료 → ${data.previewUrl} (코드: ${data.codePath})`);
      void loadRuns();
    } catch (e) {
      addLog(`생성 실패: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, [activeId, addLog, loadRuns]);

  // ── 로컬 섹션 편집 (Controls 탭) ──
  const mutateSection = useCallback((idx: number, fn: (s: SectionSpec) => SectionSpec) => {
    setAnalysis((prev) => {
      if (!prev) return prev;
      const sections = prev.structure.sections.map((s, i) => (i === idx ? fn(s) : s));
      return { ...prev, structure: { ...prev.structure, sections } };
    });
    setDirty(true);
  }, []);

  const moveSection = useCallback((idx: number, dir: -1 | 1) => {
    setAnalysis((prev) => {
      if (!prev) return prev;
      const arr = [...prev.structure.sections];
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return prev;
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      const reordered = arr.map((s, i) => ({ ...s, order: i }));
      return { ...prev, structure: { ...prev.structure, sections: reordered } };
    });
    setDirty(true);
  }, []);

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand">Landing Page from Reference</div>
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
          {busy && <span className="muted" style={{ fontSize: "0.8rem" }}>{busy}</span>}
          <span className="pill">{process.env.NEXT_PUBLIC_MODE ?? "auto"}</span>
        </div>
      </div>

      {/* History sidebar */}
      <aside className="sidebar">
        <button className="btn btn-primary btn-block" onClick={newRunForm}>
          + 새 분석
        </button>
        <div className="sidebar-title">History</div>
        {runs.length === 0 && <div className="muted" style={{ fontSize: "0.82rem", padding: "0.4rem" }}>아직 run 이 없습니다.</div>}
        {runs.map((r) => (
          <button key={r.id} className={`run-item${r.id === activeId ? " active" : ""}`} onClick={() => void openRun(r.id)}>
            <div className="run-url">{r.referenceUrl}</div>
            <div className="run-meta">
              {r.status} · {r.userGoal || "—"} · v{r.customizationVersion}
            </div>
          </button>
        ))}
      </aside>

      {/* Main workspace */}
      <main className="workspace">
        <div className="steps">
          {STEPS.map((label, i) => (
            <span key={label} className={`step${i === stepIdx ? " active" : i < stepIdx ? " done" : ""}`}>
              {i + 1}. {label}
            </span>
          ))}
        </div>

        {!analysis && (
          <div className="card" style={{ maxWidth: 640 }}>
            <h2 style={{ marginTop: 0 }}>레퍼런스 입력</h2>
            <p className="muted" style={{ marginTop: "-0.4rem" }}>
              URL 의 구조·시각 리듬을 분석해 JSON 으로 만든 뒤 커스터마이징합니다. (원본 자산은 복사하지 않습니다)
            </p>
            <div className="field">
              <label className="label">레퍼런스 URL</label>
              <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" />
            </div>
            <div className="field">
              <label className="label">목적 / 브랜드</label>
              <input className="input" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="예: AI 강의 랜딩, SaaS 랜딩" />
            </div>
            <button className="btn btn-primary" onClick={() => void runAnalyze()} disabled={!!busy}>
              {busy ? "진행 중…" : "분석 시작"}
            </button>
          </div>
        )}

        {analysis && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.6rem" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{activeRun?.referenceUrl}</div>
                  <div className="muted" style={{ fontSize: "0.82rem" }}>
                    섹션 {analysis.structure.sections.length}개 · mood {analysis.designSystem.visualStyle.mood.join(", ")} · {activeRun?.status}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button className="btn" onClick={() => void runGenerate()} disabled={!!busy}>
                    Make (생성)
                  </button>
                  {generated && (
                    <a className="btn" href={generated.previewUrl} target="_blank" rel="noreferrer">
                      새 탭에서 열기 ↗
                    </a>
                  )}
                </div>
              </div>
            </div>

            {generated && (
              <div className="card">
                <div className="muted" style={{ fontSize: "0.82rem", marginBottom: "0.5rem" }}>
                  생성된 랜딩 (영속 프리뷰) · 코드 스냅샷: <code>{generated.codePath}</code>
                </div>
                <iframe className="preview-frame" src={generated.previewUrl} title="generated-preview" />
              </div>
            )}

            {history.length > 0 && (
              <div className="card">
                <div className="sidebar-title" style={{ margin: "0 0 0.5rem" }}>작업 기록</div>
                {history.map((h) => (
                  <div key={h.id} className="muted" style={{ fontSize: "0.8rem" }}>
                    · {h.kind} — {new Date(h.createdAt).toLocaleString("ko-KR")}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {log.length > 0 && (
          <div style={{ marginTop: "1rem" }}>
            <div className="sidebar-title" style={{ margin: "0 0 0.4rem" }}>로그</div>
            <div className="log">{log.join("\n")}</div>
          </div>
        )}
      </main>

      {/* Inspector */}
      <aside className="inspector">
        <div className="tabs">
          {(["preview", "json", "controls"] as Tab[]).map((t) => (
            <button key={t} className={`tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
              {t === "preview" ? "실시간 프리뷰" : t === "json" ? "JSON" : "컨트롤"}
            </button>
          ))}
        </div>
        <div className="inspector-body">
          {!analysis && <div className="muted" style={{ fontSize: "0.85rem" }}>분석 결과가 여기에 표시됩니다.</div>}

          {analysis && tab === "preview" && (
            <div className="live-preview">
              <LandingRenderer analysis={analysis} />
            </div>
          )}

          {analysis && tab === "json" && <pre className="json">{JSON.stringify(analysis, null, 2)}</pre>}

          {analysis && tab === "controls" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
                <span className="muted" style={{ fontSize: "0.8rem" }}>섹션 {analysis.structure.sections.length}개</span>
                <button className="btn btn-primary" onClick={() => void saveAnalysis()} disabled={!dirty || !!busy}>
                  {dirty ? "변경 저장" : "저장됨"}
                </button>
              </div>
              {analysis.structure.sections.map((s, idx) => (
                <div key={s.id} style={{ marginBottom: "0.8rem", border: "1px solid var(--border)", borderRadius: "0.55rem", padding: "0.6rem", background: "var(--bg)" }}>
                  <div className="sec-row" style={{ border: "none", padding: 0, marginBottom: "0.5rem", background: "transparent" }}>
                    <input type="checkbox" checked={s.enabled} onChange={(e) => mutateSection(idx, (x) => ({ ...x, enabled: e.target.checked }))} />
                    <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                      {s.label} <span className="pill">{s.type}</span>
                    </span>
                    <button className="btn" style={{ padding: "0.2rem 0.45rem" }} onClick={() => moveSection(idx, -1)}>↑</button>
                    <button className="btn" style={{ padding: "0.2rem 0.45rem" }} onClick={() => moveSection(idx, 1)}>↓</button>
                  </div>
                  <input
                    className="input"
                    style={{ marginBottom: "0.4rem" }}
                    placeholder="headline"
                    value={s.content.headline ?? ""}
                    onChange={(e) => mutateSection(idx, (x) => ({ ...x, content: { ...x.content, headline: e.target.value || null } }))}
                  />
                  <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                    <span className="muted" style={{ fontSize: "0.75rem" }}>배경</span>
                    <input
                      type="color"
                      value={/^#[0-9a-fA-F]{6}$/.test(s.style.background) ? s.style.background : "#0b0b0f"}
                      onChange={(e) => mutateSection(idx, (x) => ({ ...x, style: { ...x.style, background: e.target.value } }))}
                      style={{ width: 38, height: 28, background: "transparent", border: "1px solid var(--border)", borderRadius: 6 }}
                    />
                    <input
                      className="input"
                      style={{ flex: 1 }}
                      value={s.style.background}
                      onChange={(e) => mutateSection(idx, (x) => ({ ...x, style: { ...x.style, background: e.target.value } }))}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Bottom composer */}
      <div className="composer">
        <textarea
          className="textarea"
          rows={1}
          placeholder={activeId ? "이 섹션을 더 애플처럼 바꿔줘 / 전체를 다크모드로 / 히어로를 더 강렬하게…" : "먼저 분석을 실행하세요"}
          value={composer}
          onChange={(e) => setComposer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void sendComposer();
          }}
          disabled={!activeId || !!busy}
        />
        <button className="btn btn-primary" onClick={() => void sendComposer()} disabled={!activeId || !composer.trim() || !!busy}>
          보내기
        </button>
      </div>
    </div>
  );
}
