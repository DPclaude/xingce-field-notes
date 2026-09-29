import "fake-indexeddb/auto";
import { it, expect, beforeEach } from "vitest";
import { parseModelJSON, apiError } from "../src/api";
import { db } from "../src/db";
import { setKey, saveApiKey, keyStatus } from "../src/api";
const origin = "https://example.test/v1";
beforeEach(async () => {
  await setKey("", origin, false);
});
it("保存后清空输入框不会删除会话密钥，勾选记住可保存已有密钥", async () => {
  await saveApiKey("  test-only-key  ", origin, false);
  expect(await keyStatus(origin)).toBe("session");
  expect(await db.credentials.count()).toBe(0);
  await saveApiKey("", origin, true);
  expect(await keyStatus(origin)).toBe("device");
  expect((await db.credentials.get("api"))?.key).toBe("test-only-key");
  await saveApiKey("", origin, false);
  expect(await keyStatus(origin)).toBe("session");
  expect(await db.credentials.count()).toBe(0);
});
it("切换地址不能继承或保存原服务的密钥", async () => {
  await saveApiKey("test-only-key", origin, false);
  expect(await keyStatus("https://other.test/v1")).toBe("none");
  await saveApiKey("", "https://other.test/v1", true);
  expect(await db.credentials.count()).toBe(0);
});
it("截断及非 JSON 不能当成结论", () => {
  expect(() => parseModelJSON('{"answer":')).toThrow();
  expect(() => parseModelJSON("答案是B")).toThrow();
});
it("允许完整 JSON 围栏但不提取混杂的部分结论", () => {
  expect(parseModelJSON('```json\n{"answer":"A"}\n```')).toEqual({
    answer: "A",
  });
  expect(() => parseModelJSON('前言 {"answer":"A"}')).toThrow();
});
it("认证错误说明不回显可能包含密钥的服务端正文", () => {
  expect(apiError(401)).toContain("密钥");
  expect(apiError(429)).toContain("限流");
});
