import "fake-indexeddb/auto";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { db } from "../src/db";
import { newQuestion, defaultSettings } from "../src/domain";
import { setKey } from "../src/api";
import { recognize } from "../src/workflow";
vi.mock("../src/images", () => ({
  imageParts: async (regions: unknown[]) =>
    regions.map(() => ({
      type: "image_url",
      image_url: { url: "data:image/png;base64,TEST" },
    })),
}));
beforeEach(async () => {
  await db.delete();
  await db.open();
  await setKey("test-local-only", defaultSettings.baseUrl, false);
});
afterEach(() => vi.unstubAllGlobals());
it("模拟一图多题：裁剪坐标换算正确且小题共享同一材料", async () => {
  await db.questions.add(
    newQuestion({
      id: "split",
      regions: [{ assetId: "image1", x: 0, y: 0.1, w: 1, h: 0.8 }],
    }),
  );
  const ref = { answer: "B", explanation: "参考说明", source: "测试截图" };
  const region = { imageIndex: 0, x: 0, y: 0.5, w: 1, h: 0.5 };
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  material: {
                    title: "同一材料",
                    text: "2025年125，2024年100",
                    regions: [{ imageIndex: 0, x: 0, y: 0, w: 1, h: 0.5 }],
                  },
                  questions: [
                    {
                      title: "第一题",
                      stem: "增长率",
                      options: ["A", "B"],
                      category: "资料·增长率",
                      issues: [],
                      regions: [region],
                      reference: ref,
                    },
                    {
                      title: "第二题",
                      stem: "比较大小",
                      options: ["A", "B"],
                      category: "资料·倍数与比较",
                      issues: ["模糊数字"],
                      regions: [region],
                      reference: ref,
                    },
                  ],
                }),
              },
            },
          ],
        }),
      ),
  );
  await recognize("split", true);
  const qs = await db.questions.toArray();
  expect(qs).toHaveLength(2);
  expect(qs.every((q) => q.materialId === qs[0].materialId)).toBe(true);
  expect(qs.every((q) => q.status === "待核对" && !q.confirmed)).toBe(true);
  expect(qs[0].regions[0]).toEqual({
    assetId: "image1",
    x: 0,
    y: 0.5,
    w: 1,
    h: 0.4,
  });
  expect(await db.materials.count()).toBe(1);
  expect(await db.cards.count()).toBe(0);
});
it("模型引用不存在的图片时拒绝结果并保留草稿", async () => {
  await db.questions.add(
    newQuestion({
      id: "bad",
      stem: "保留文字",
      regions: [{ assetId: "image1", x: 0, y: 0, w: 1, h: 1 }],
    }),
  );
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  material: null,
                  questions: [
                    {
                      title: "坏结果",
                      stem: "新文字",
                      options: [],
                      category: "常识判断",
                      issues: [],
                      regions: [{ imageIndex: 8, x: 0, y: 0, w: 1, h: 1 }],
                      reference: { answer: "", explanation: "", source: "" },
                    },
                  ],
                }),
              },
            },
          ],
        }),
      ),
  );
  await expect(recognize("bad", true)).rejects.toThrow("不存在");
  expect((await db.questions.get("bad"))!.stem).toBe("保留文字");
  expect(await db.questions.count()).toBe(1);
});
