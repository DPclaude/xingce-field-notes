import Dexie, { type Table } from "dexie";
import {
  defaultSettings,
  normalize,
  type Question,
  type Asset,
  type Material,
  type Card,
  type ReviewRecord,
  type Usage,
  type Settings,
} from "./domain";
export class NotebookDB extends Dexie {
  questions!: Table<Question, string>;
  assets!: Table<Asset, string>;
  materials!: Table<Material, string>;
  cards!: Table<Card, string>;
  reviews!: Table<ReviewRecord, string>;
  usage!: Table<Usage, string>;
  preferences!: Table<{ id: string; value: Settings }, string>;
  credentials!: Table<{ id: string; key: string; baseUrl: string }, string>;
  constructor(name = "xingce-notebook") {
    super(name);
    this.version(1).stores({
      questions: "id,updatedAt,status,category,materialId",
      assets: "id,hash",
      materials: "id",
      cards: "id,category",
      reviews: "id,questionId,at",
      usage: "id,questionId,status,at",
      preferences: "id",
      credentials: "id",
    });
  }
}
export const db = new NotebookDB();
export async function getSettings() {
  return (await db.preferences.get("settings"))?.value ?? defaultSettings;
}
export async function saveQuestion(q: Question) {
  q.updatedAt = Date.now();
  await db.questions.put(q);
}
export function editedQuestion(q: Question): Question {
  return {
    ...q,
    revision: q.revision + 1,
    confirmed: false,
    imagesSafe: false,
    status: "待核对",
    analysis: undefined,
    analysisHistory: q.analysis
      ? [...q.analysisHistory, { at: Date.now(), analysis: q.analysis }]
      : q.analysisHistory,
    issues: q.issues,
    updatedAt: Date.now(),
  };
}
export async function invalidateQuestion(q: Question) {
  await db.transaction("rw", db.questions, db.cards, async () => {
    const current = await db.questions.get(q.id);
    if (!current || current.revision !== q.revision)
      throw new Error(
        "另一页面已修改此题。为避免覆盖，本次编辑未保存；请复制当前文字后刷新再合并。",
      );
    if (current.status === "分析中")
      throw new Error("当前题目正在分析，请稍后编辑");
    const cards = await db.cards.toArray();
    for (const c of cards)
      if (c.questionIds.includes(q.id))
        await db.cards.update(c.id, {
          needsReview: true,
          updatedAt: Date.now(),
        });
    await db.questions.put(editedQuestion(q));
  });
}
export async function confirmQuestion(
  id: string,
  revision: number,
  imagesSafe: boolean,
) {
  await db.transaction("rw", db.questions, async () => {
    const q = await db.questions.get(id);
    if (!q || q.revision !== revision || q.status === "分析中")
      throw new Error("题目版本已改变，请刷新后重新核对");
    if (!q.stem.trim() || q.issues.length)
      throw new Error("题干缺失或还有待解决的问题");
    await db.questions.update(id, {
      confirmed: true,
      imagesSafe,
      status: "待分析",
      error: undefined,
      updatedAt: Date.now(),
    });
  });
}
export async function acceptCard(q: Question) {
  if (q.status !== "已完成" || !q.analysis || q.issues.length) return;
  const k = q.analysis.knowledge;
  const existing = await db.cards
    .where("category")
    .equals(q.category)
    .toArray();
  // A category may contain multiple rules. Reuse matching canonical titles, never merge unrelated rules by category alone.
  let c = existing.find((c) => normalize(c.title) === normalize(k.title));
  const variant = { questionId: q.id, revision: q.revision, content: k };
  if (c) {
    const variants = c.variants.filter((v) => v.questionId !== q.id);
    const differs = variants.some(
      (v) => JSON.stringify(v.content) !== JSON.stringify(k),
    );
    c = {
      ...c,
      variants: [...variants, variant],
      questionIds: [...new Set([...c.questionIds, q.id])],
      needsReview: c.needsReview || differs,
      updatedAt: Date.now(),
    };
  } else
    c = {
      id: crypto.randomUUID(),
      category: q.category,
      title: k.title,
      variants: [variant],
      questionIds: [q.id],
      needsReview: false,
      due: Date.now() + 86400000,
      updatedAt: Date.now(),
    };
  await db.cards.put(c);
}
export async function recoverInterrupted() {
  const now = Date.now();
  await db.transaction("rw", db.usage, db.questions, async () => {
    const active = await db.usage.where("status").equals("进行中").toArray();
    for (const task of active) {
      if (now - task.heartbeat < 60000) continue;
      await db.usage.update(task.id, {
        status: "中断",
        estimateNote: "请求结果未知，可能已经计费；不会自动重试",
      });
    }
    for (const q of await db.questions
      .where("status")
      .equals("分析中")
      .toArray()) {
      if (
        now - q.updatedAt < 60000 ||
        active.some((t) => t.questionId === q.id && now - t.heartbeat < 60000)
      )
        continue;
      await db.questions.update(q.id, {
        status: "待核对",
        revision: q.revision + 1,
        error: "上次请求已中断，可能已计费。草稿已恢复，请检查后手动重试。",
      });
    }
  });
}
