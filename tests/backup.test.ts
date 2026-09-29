import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { NotebookDB } from "../src/db";
import { newQuestion } from "../src/domain";
import { exportBackup, importBackup } from "../src/backup";
import { unzipSync, strFromU8, strToU8, zipSync } from "fflate";
it("完整恢复图片与复习记录，排除凭据", async () => {
  const a = new NotebookDB("source-" + crypto.randomUUID());
  const b = new NotebookDB("target-" + crypto.randomUUID());
  await a.credentials.put({
    id: "api",
    key: "TEST_SECRET_NEVER_EXPORT",
    baseUrl: "https://example.com/v1",
  });
  const blob = new Blob(["image-bytes"], { type: "image/png" });
  await a.assets.put({
    id: "img",
    hash: "hash",
    name: "原图",
    type: "image/jpeg",
    display: new Blob(["display"], { type: "image/jpeg" }),
    original: blob,
    width: 100,
    height: 100,
    createdAt: 1,
  });
  const q = newQuestion({
    id: "q",
    regions: [{ assetId: "img", x: 0, y: 0, w: 1, h: 1 }],
  });
  await a.questions.put(q);
  await a.reviews.put({
    id: "r",
    questionId: "q",
    at: 1,
    answer: "A",
    seconds: 42,
    guessed: false,
    revealed: false,
    grade: "吃力",
    correct: true,
    reason: "",
  });
  const bytes = await exportBackup(a);
  expect(bytes.length).toBeGreaterThan(20);
  const content = unzipSync(bytes);
  expect(
    Object.values(content)
      .map((v) => strFromU8(v))
      .join(""),
  ).not.toContain("TEST_SECRET_NEVER_EXPORT");
  await importBackup(bytes, b);
  expect(await b.questions.count()).toBe(1);
  expect(await (await b.assets.get("img"))!.display.text()).toBe("display");
  expect((await b.assets.get("img"))!.original!.type).toBe("image/png");
  expect(await (await b.assets.get("img"))!.original!.text()).toBe(
    "image-bytes",
  );
  expect((await b.reviews.get("r"))?.seconds).toBe(42);
  expect(await b.credentials.count()).toBe(0);
  await a.delete();
  await b.delete();
});
it("篡改内容时整体拒绝，不修改已有库", async () => {
  const a = new NotebookDB("tamper-" + crypto.randomUUID());
  await a.questions.put(newQuestion({ id: "keep" }));
  const files = unzipSync(await exportBackup(a));
  files["data.json"] = strToU8("{}");
  await expect(importBackup(zipSync(files), a)).rejects.toThrow();
  expect(await a.questions.count()).toBe(1);
  await a.delete();
});

it("导出拒绝超过可恢复大小的单张图片", async () => {
  const a = new NotebookDB("size-" + crypto.randomUUID());
  const large = new Blob([new Uint8Array(61 * 1024 * 1024)], {
    type: "image/jpeg",
  });
  await a.assets.put({
    id: "large",
    hash: "hash",
    name: "large",
    type: "image/jpeg",
    display: large,
    width: 100,
    height: 100,
    createdAt: 1,
  });
  await expect(exportBackup(a)).rejects.toThrow("限制");
  await a.delete();
});
