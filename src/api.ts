import { z } from "zod";
import { db, type NotebookDB } from "./db";
import type { Settings, Usage } from "./domain";
let sessionKey = "";
let sessionOrigin = "";
export async function setKey(key: string, baseUrl: string, remember: boolean) {
  sessionKey = key;
  sessionOrigin = baseUrl;
  await db.credentials.delete("api");
  if (remember && key) await db.credentials.put({ id: "api", key, baseUrl });
}
export async function hasKey(baseUrl: string) {
  return !!(await getKey(baseUrl));
}
async function getKey(baseUrl: string) {
  if (sessionOrigin === baseUrl && sessionKey) return sessionKey;
  const row = await db.credentials.get("api");
  return row?.baseUrl === baseUrl ? row.key : "";
}
export function parseModelJSON(s: string): unknown {
  const cleaned = s
    .trim()
    .replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/, "$1");
  if (cleaned.length > 250000) throw new Error("返回内容过大");
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(
      "模型返回不完整或不是 JSON，未保存为确定结论；不会自动重试。",
    );
  }
}
export function apiError(n: number): string {
  return (
    (
      {
        401: "密钥无效或过期，请在“我的”重新填写",
        402: "平台余额不足",
        403: "模型未开通或无访问权限",
        404: "API 地址或模型 ID 不正确",
        429: "平台限流或配额不足，请稍后手动尝试",
      } as Record<number, string>
    )[n] ?? `接口错误（HTTP ${n}），未自动重试`
  );
}
const controllers = new Map<string, AbortController>();
export const cancelRequest = (id: string) => controllers.get(id)?.abort();
export async function claimRequest(u: Usage, database: NotebookDB = db) {
  await database.transaction("rw", database.usage, async () => {
    const active = await database.usage
      .where("status")
      .equals("进行中")
      .toArray();
    if (active.some((t) => t.questionId === u.questionId))
      throw new Error("这道题已有请求进行中，请勿重复发送");
    await database.usage.add(u);
  });
}
export async function callModel<T>(
  settings: Settings,
  questionId: string,
  kind: Usage["kind"],
  system: string,
  content: unknown[],
  schema: z.ZodType<T>,
): Promise<T> {
  const url = new URL(settings.baseUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("API 地址必须为不含密钥、查询参数的 HTTPS 地址");
  const key = await getKey(settings.baseUrl);
  if (!key) throw new Error("请先在“我的”填写 API Key");
  const id = crypto.randomUUID();
  const task: Usage = {
    id,
    questionId,
    kind,
    at: Date.now(),
    heartbeat: Date.now(),
    status: "进行中",
    currency: settings.currency,
    estimateNote: "接口用量尚未返回，无法精确统计",
    model: settings.model,
  };
  await claimRequest(task);
  const controller = new AbortController();
  controllers.set(questionId, controller);
  const heartbeat = setInterval(
    () => void db.usage.update(id, { heartbeat: Date.now() }),
    10000,
  );
  const timeout = setTimeout(() => controller.abort(), 180000);
  try {
    const response = await fetch(
      settings.baseUrl.replace(/\/$/, "") + "/chat/completions",
      {
        method: "POST",
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: settings.model,
          stream: false,
          messages: [
            { role: "system", content: system },
            { role: "user", content },
          ],
        }),
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error(apiError(response.status));
    const data = await response.json();
    const u = data.usage;
    const valid = (n: unknown) =>
      typeof n === "number" && Number.isFinite(n) && n >= 0;
    const input = valid(u?.prompt_tokens) ? u.prompt_tokens : undefined,
      output = valid(u?.completion_tokens) ? u.completion_tokens : undefined;
    const cost =
      input !== undefined && output !== undefined && settings.pricesConfirmed
        ? ((input * settings.inputPrice + output * settings.outputPrice) /
            1e6) *
          settings.multiplier
        : undefined;
    await db.usage.update(id, {
      input,
      output,
      cached: valid(u?.prompt_tokens_details?.cached_tokens)
        ? u.prompt_tokens_details.cached_tokens
        : undefined,
      cost,
      estimateNote:
        cost === undefined
          ? "缺少完整用量或未确认价格，无法精确统计"
          : "按输入/输出价格估算；图片、缓存、推理等特殊计费最终以平台账单为准",
    });
    if (data.choices?.[0]?.finish_reason === "length")
      throw new Error("输出被截断，保留草稿；请调整平台输出限制后手动重试");
    const raw = data.choices?.[0]?.message?.content;
    if (typeof raw !== "string")
      throw new Error("平台返回格式不兼容，未找到文本结果");
    const result = schema.safeParse(parseModelJSON(raw));
    if (!result.success)
      throw new Error(
        "模型返回缺少必要字段或结构不正确，需核对；未生成正式结论",
      );
    await db.usage.update(id, { status: "成功", heartbeat: Date.now() });
    return result.data;
  } catch (e) {
    await db.usage.update(id, {
      status: controller.signal.aborted ? "中断" : "失败",
    });
    if (controller.signal.aborted)
      throw new Error("请求中断或超过 3 分钟；可能已计费，未自动重试");
    if (e instanceof TypeError)
      throw new Error(
        "无法连接接口：可能是跨域限制或网络问题。草稿已保留，未自动重试",
      );
    throw e;
  } finally {
    clearTimeout(timeout);
    clearInterval(heartbeat);
    controllers.delete(questionId);
  }
}
