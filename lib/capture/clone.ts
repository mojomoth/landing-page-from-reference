// Loop C — buildClone: rendered-dom.html 을 읽어 mirrorAssets 로 모든 asset 을 로컬 mirror +
// URL rewrite 한 뒤 clone.html 로 저장한다. 원본 렌더 결과의 로컬 재배치가 목표이므로
// 임의 보정 스타일은 추가하지 않는다. LLM 미관여.
import { readFile, writeFile } from "node:fs/promises";
import { capFile, FILES } from "../paths";
import { mirrorAssets } from "./mirror";

export interface BuildCloneResult {
  clonePath: string;
  assetCount: number;
  blocked: string[];
}

export async function buildClone(
  captureId: string,
  baseUrl: string,
): Promise<BuildCloneResult> {
  const domPath = capFile(captureId, FILES.renderedDom);
  const html = await readFile(domPath, "utf8");

  const { html: mirrored, assetCount, blocked } = await mirrorAssets(
    captureId,
    baseUrl,
    html,
  );

  // <base> 태그가 있으면 상대 경로 해석을 깨뜨리므로 제거(모든 URL 은 이미 rewrite 됨).
  let out = mirrored.replace(/<base\b[^>]*>/gi, "");

  // DOCTYPE 보존(직렬화에 빠졌으면 추가).
  if (!/^\s*<!doctype/i.test(out)) {
    out = `<!DOCTYPE html>\n${out}`;
  }

  const clonePath = capFile(captureId, FILES.clone);
  await writeFile(clonePath, out, "utf8");
  return { clonePath, assetCount, blocked };
}
