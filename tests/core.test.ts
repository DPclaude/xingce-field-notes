import { describe, it, expect } from "vitest";
import {
  safeCalculate,
  reviewSchedule,
  assessAnalysis,
  observedTiming,
} from "../src/core";
describe("受控验证", () => {
  it("只计算有界白名单表达式", () => {
    expect(
      safeCalculate({
        op: "div",
        args: [{ op: "sub", args: [125, 100] }, 100],
      }),
    ).toBe(0.25);
  });
  it("拒绝任意代码和零除", () => {
    expect(() => safeCalculate({ op: "eval", args: ["alert(1)"] })).toThrow();
    expect(() => safeCalculate({ op: "div", args: [5, 0] })).toThrow();
  });
});
describe("复习间隔", () => {
  const now = new Date("2026-09-29T12:00:00Z").getTime();
  it("即时看答案后答对不算掌握", () => {
    const r = reviewSchedule(
      { stage: 3, stable: 2 },
      {
        correct: true,
        grade: "掌握",
        seconds: 30,
        guessed: false,
        revealed: true,
        fastLimit: 60,
      },
      now,
    );
    expect(r.stable).toBe(0);
    expect(r.stage).toBe(0);
  });
  it("错误回到近期复习", () => {
    expect(
      reviewSchedule(
        { stage: 4, stable: 4 },
        {
          correct: false,
          grade: "不会",
          seconds: 20,
          guessed: false,
          revealed: false,
          fastLimit: 60,
        },
        now,
      ).stage,
    ).toBe(0);
  });
  it("跨日稳定快速答对才延长", () => {
    expect(
      reviewSchedule(
        { stage: 1, stable: 1, lastReviewed: now - 86400000 },
        {
          correct: true,
          grade: "掌握",
          seconds: 40,
          guessed: false,
          revealed: false,
          fastLimit: 60,
        },
        now,
      ).stage,
    ).toBe(2);
  });
});
describe("结论闸门", () => {
  it("参考答案冲突进入待核对", () => {
    expect(
      assessAnalysis({ answer: "B", issues: [], checks: [] }, "A").status,
    ).toBe("待核对");
  });
  it("算式通过不能消除缺失条件", () => {
    expect(
      assessAnalysis(
        {
          answer: "A",
          issues: ["数字模糊"],
          checks: [
            {
              label: "相加",
              expression: { op: "add", args: [1, 2] },
              expected: 3,
            },
          ],
        },
        "",
      ).status,
    ).toBe("待核对");
  });
});

it("实测时间只采用跨日独立答对记录，排除猜测与刚看过解析", () => {
  const rows = [
    { at: 1, seconds: 40, correct: true, guessed: false, revealed: false },
    {
      at: 86400001,
      seconds: 50,
      correct: true,
      guessed: false,
      revealed: false,
    },
    {
      at: 172800001,
      seconds: 60,
      correct: true,
      guessed: false,
      revealed: false,
    },
    {
      at: 259200001,
      seconds: 3,
      correct: true,
      guessed: false,
      revealed: true,
    },
  ];
  expect(observedTiming(rows)).toEqual({
    count: 3,
    range: [40, 60],
    median: 50,
  });
  expect(observedTiming(rows.slice(0, 2))).toBeUndefined();
});
