// SQLite 영속 — Node 26 내장 node:sqlite (네이티브 빌드 없음, GOAL.md Iron Law 1).
// lazy open: db() 첫 호출 시에만 연결 → next build 의 page-data 수집 단계에서 안전.
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import type { LandingRun, RunStatus, LandingReferenceAnalysis } from "./schema";

const DB_PATH = join(process.cwd(), "db.sqlite");
let _db: DatabaseSync | null = null;

export function db(): DatabaseSync {
  if (_db) return _db;
  const d = new DatabaseSync(DB_PATH);
  d.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      reference_url TEXT NOT NULL,
      user_goal TEXT NOT NULL,
      analysis_version INTEGER NOT NULL DEFAULT 0,
      customization_version INTEGER NOT NULL DEFAULT 0,
      generation_version INTEGER NOT NULL DEFAULT 0,
      analysis_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  _db = d;
  return d;
}

function nowIso(): string {
  return new Date().toISOString();
}
function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function safeParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

interface RunRow {
  id: string;
  status: string;
  reference_url: string;
  user_goal: string;
  analysis_version: number;
  customization_version: number;
  generation_version: number;
  analysis_json: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRun(r: RunRow): LandingRun {
  return {
    id: r.id,
    status: r.status as RunStatus,
    referenceUrl: r.reference_url,
    userGoal: r.user_goal,
    analysisVersion: r.analysis_version,
    customizationVersion: r.customization_version,
    generationVersion: r.generation_version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function createRun(input: { referenceUrl: string; userGoal: string }): LandingRun {
  const id = genId("run");
  const now = nowIso();
  db()
    .prepare(
      `INSERT INTO runs (id, status, reference_url, user_goal, analysis_version, customization_version, generation_version, analysis_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, "created", input.referenceUrl, input.userGoal, 0, 0, 0, null, now, now);
  const run = getRun(id);
  if (!run) throw new Error("createRun: 방금 만든 run 을 다시 읽지 못함");
  return run;
}

export function getRun(id: string): LandingRun | null {
  const r = db().prepare(`SELECT * FROM runs WHERE id = ?`).get(id) as RunRow | undefined;
  return r ? rowToRun(r) : null;
}

export function getAnalysis(id: string): LandingReferenceAnalysis | null {
  const r = db().prepare(`SELECT analysis_json FROM runs WHERE id = ?`).get(id) as
    | { analysis_json: string | null }
    | undefined;
  return r ? safeParse<LandingReferenceAnalysis>(r.analysis_json) : null;
}

export function listRuns(): LandingRun[] {
  const rows = db().prepare(`SELECT * FROM runs ORDER BY created_at DESC`).all() as unknown as RunRow[];
  return rows.map(rowToRun);
}

export function setStatus(id: string, status: RunStatus): void {
  db().prepare(`UPDATE runs SET status = ?, updated_at = ? WHERE id = ?`).run(status, nowIso(), id);
}

type BumpKind = "analysis" | "customization" | "generation";
export function setAnalysis(id: string, analysis: LandingReferenceAnalysis, bump: BumpKind = "analysis"): void {
  const col =
    bump === "customization" ? "customization_version" : bump === "generation" ? "generation_version" : "analysis_version";
  db()
    .prepare(`UPDATE runs SET analysis_json = ?, ${col} = ${col} + 1, updated_at = ? WHERE id = ?`)
    .run(JSON.stringify(analysis), nowIso(), id);
}

export function appendHistory(runId: string, kind: string, payload: unknown): void {
  db()
    .prepare(`INSERT INTO history (run_id, kind, payload_json, created_at) VALUES (?, ?, ?, ?)`)
    .run(runId, kind, JSON.stringify(payload ?? null), nowIso());
}

export interface HistoryEntry {
  id: number;
  kind: string;
  payload: unknown;
  createdAt: string;
}
export function listHistory(runId: string): HistoryEntry[] {
  const rows = db()
    .prepare(`SELECT id, kind, payload_json, created_at FROM history WHERE run_id = ? ORDER BY id ASC`)
    .all(runId) as unknown as { id: number; kind: string; payload_json: string; created_at: string }[];
  return rows.map((r) => ({ id: r.id, kind: r.kind, payload: safeParse(r.payload_json), createdAt: r.created_at }));
}
