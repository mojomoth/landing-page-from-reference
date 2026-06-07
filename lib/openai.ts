// OpenAI Structured Outputs 헬퍼 + mock 게이트 (GOAL.md Iron Law 5: 조기 정지 금지).
// 키가 없거나 호출이 실패하면 호출부가 lib/mock.ts 로 폴백한다.
import OpenAI from "openai";

export function hasApiKey(): boolean {
  const k = process.env.OPENAI_API_KEY;
  return typeof k === "string" && k.trim().length > 20;
}

export function modelName(): string {
  const m = process.env.OPENAI_MODEL;
  return m && m.trim() ? m.trim() : "gpt-4o-mini";
}

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

export interface StructuredParams {
  schema: Record<string, unknown>;
  schemaName: string;
  system: string;
  user: string;
  imagesDataUrls?: string[];
}

/** JSON Schema(strict)로 강제된 구조화 출력. 실패 시 throw → 호출부에서 mock 폴백. */
export async function structuredJson<T>(p: StructuredParams): Promise<T> {
  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [{ type: "text", text: p.user }];
  for (const url of p.imagesDataUrls ?? []) {
    userContent.push({ type: "image_url", image_url: { url } });
  }

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: p.system },
    { role: "user", content: userContent },
  ];

  const res = await client().chat.completions.create({
    model: modelName(),
    messages,
    temperature: 0.4,
    response_format: {
      type: "json_schema",
      json_schema: { name: p.schemaName, schema: p.schema, strict: true },
    },
  });

  const text = res.choices[0]?.message?.content ?? "";
  if (!text) throw new Error("structuredJson: 빈 응답");
  return JSON.parse(text) as T;
}
