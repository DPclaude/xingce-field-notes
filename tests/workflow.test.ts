import "fake-indexeddb/auto";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  db,
  invalidateQuestion,
  recoverInterrupted,
  acceptCard,
} from "../src/db";
import { newQuestion, defaultSettings } from "../src/domain";
import { claimRequest, setKey } from "../src/api";
import { analyze } from "../src/workflow";
import { loadDemo } from "../src/demo";
beforeEach(async () => {
  await db.delete();
  await db.open();
});
afterEach(() => vi.unstubAllGlobals());
it("用户已解决的疑问可以清空，不重新注入阻碍核对的提示", async () => {
  const q = newQuestion({ id: "edit", issues: ["模糊"] });
  await db.questions.add(q);
  await invalidateQuestion({ ...q, stem: "完整条件", issues: [] });
  expect((await db.questions.get(q.id))!.issues).toEqual([]);
});
it("旧编辑版本不能覆盖另一个页面的新题干", async () => {
  const q = newQuestion({ id: "edit", stem: "旧题干" });
  await db.questions.add(q);
  await invalidateQuestion({ ...q, stem: "已补充的完整题干" });
  await expect(
    invalidateQuestion({ ...q, title: "另页标题" }),
  ).rejects.toThrow();
  expect((await db.questions.get(q.id))!.stem).toBe("已补充的完整题干");
});
it("无请求记录的过期分析锁也能恢复，草稿不丢失", async () => {
  await db.questions.add(
    newQuestion({
      id: "orphan",
      stem: "保留草稿",
      status: "分析中",
      updatedAt: Date.now() - 120000,
    }),
  );
  await recoverInterrupted();
  const q = await db.questions.get("orphan");
  expect(q!.status).toBe("待核对");
  expect(q!.stem).toBe("保留草稿");
});
it("两个页面不能同时领取同一题的付费请求", async () => {
  const u = {
    id: "a",
    questionId: "q",
    kind: "分析" as const,
    at: Date.now(),
    heartbeat: Date.now(),
    status: "进行中" as const,
    currency: "元",
    estimateNote: "",
    model: "test",
  };
  const results = await Promise.allSettled([
    claimRequest(u),
    claimRequest({ ...u, id: "b" }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await db.usage.count()).toBe(1);
});
it("同类不同规则不强行合并，修正题目会让来源卡片待核对", async () => {
  await loadDemo();
  const q = (await db.questions.toArray()).find((q) => q.analysis)!;
  const other = {
    ...q,
    id: "other",
    analysis: {
      ...q.analysis!,
      knowledge: { ...q.analysis!.knowledge, title: "另一条独立规则" },
    },
  };
  await db.questions.add(other);
  await acceptCard(other);
  expect(await db.cards.count()).toBe(2);
  await invalidateQuestion({ ...q, stem: "修正后的题干" });
  const card = (await db.cards.toArray()).find((c) =>
    c.questionIds.includes(q.id),
  );
  expect(card!.needsReview).toBe(true);
});
it("模型求解不收到参考答案，冲突不生成知识卡片，失败不重试", async () => {
  await loadDemo();
  const demo = (await db.questions.toArray()).find((q) => q.analysis)!;
  const analysis = demo.analysis!;
  await db.questions.clear();
  await db.cards.clear();
  await db.questions.add(
    newQuestion({
      id: "solve",
      stem: "计算125比100的增长率",
      options: ["A. 20%", "B. 25%"],
      confirmed: true,
      imagesSafe: true,
      reference: {
        answer: "A",
        explanation: "REFERENCE_TEXT_MUST_NOT_BE_SENT",
        source: "机构",
      },
    }),
  );
  await setKey("test-local-token", defaultSettings.baseUrl, false);
  let count = 0;
  let body = "";
  vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
    count++;
    body = String(init.body);
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify(analysis) },
          },
        ],
        usage: { prompt_tokens: 90, completion_tokens: 100 },
      }),
      { status: 200 },
    );
  });
  await analyze("solve");
  expect(count).toBe(1);
  expect(body).not.toContain("REFERENCE_TEXT_MUST_NOT_BE_SENT");
  expect((await db.questions.get("solve"))!.status).toBe("待核对");
  expect(await db.cards.count()).toBe(0);
  await db.questions.add(
    newQuestion({
      id: "failure",
      stem: "125比100增长多少",
      confirmed: true,
      imagesSafe: true,
    }),
  );
  vi.stubGlobal("fetch", async () => {
    count++;
    throw new TypeError("network");
  });
  await expect(analyze("failure")).rejects.toThrow();
  expect(count).toBe(2);
  expect((await db.questions.get("failure"))!.stem).toContain("125");
});
