import { db, acceptCard } from "./db";
import { newQuestion, type Analysis } from "./domain";
// Self-authored, hand-verified teaching fixtures. They are never model accuracy evidence.
export async function loadDemo() {
  const base: Analysis = {
    answer: "B",
    issues: [],
    clues: "看到“增长率”先找本期与基期，分母必须是基期。",
    choice: "本期与基期都是整百附近，直接计算最容易想到，无需套用复杂技巧。",
    firstMove: "先写增长量：125 − 100 = 25。",
    quickSteps: ["增长率 = 增长量 ÷ 基期量。", "25 ÷ 100 = 25%，选择 B。"],
    stop: "算得25%，与B一致且其他选项不同即可停止。",
    stuck: "若找不准基期，回到材料圈出年份；仍不确定就保留标记回做。",
    pitfalls: "不要除以本期125；25/125=20%是增长量占本期的比重。",
    alternatives: [],
    decision: "优先拿分",
    decisionReason: "初始建议：一步减法、一步除法；尚无你的历史数据。",
    timeRange: [20, 45],
    checks: [
      {
        label: "增长率",
        expression: { op: "div", args: [{ op: "sub", args: [125, 100] }, 100] },
        expected: 0.25,
      },
    ],
    category: "资料·增长率",
    tags: ["基期", "增长率"],
    knowledge: {
      title: "增长率：先确定基期",
      concept: "增长率 =（本期 − 基期）/ 基期。",
      signals: "问比上年、同比或比基期增长百分之几。",
      steps: "定位同口径的本期与基期，求差后除以基期。",
      boundary: "必须同一指标、同一统计口径；百分数与百分点不可混淆。",
      traps: "用本期作分母。",
      counterexample:
        "从100增长到125是增长25%；从125降到100是下降20%，不是25%。",
      stop: "精度已能区分所有选项即停止，接近选项需保留更多位。",
    },
  };
  const q = newQuestion({
    title: "增长率的分母，应该选谁？",
    stem: "某市2024年公共图书馆到馆人次为100万人次，2025年为125万人次。2025年同比增长率是多少？",
    options: ["A. 20%", "B. 25%", "C. 80%", "D. 125%"],
    category: base.category,
    source: "自编演示",
    status: "已完成",
    confirmed: true,
    imagesSafe: true,
    analysis: base,
    reference: {
      answer: "B",
      source: "自编样本，人工算式核对：25 ÷ 100 = 25%",
      explanation: "",
    },
    verification: ["自编演示，手工核对数值；不是 API 实测结果"],
    reason: "做对但太慢",
  });
  await db.questions.add(q);
  await acceptCard(q);
  const q2 = newQuestion({
    title: "先翻译“只有……才……”",
    stem: "只有完成报名，才能参加考试。小林参加了考试。可以推出什么？",
    options: [
      "A. 小林完成了报名",
      "B. 完成报名的人都参加了考试",
      "C. 小林没有报名",
      "D. 未报名也能考试",
    ],
    category: "判断·翻译与排列",
    source: "自编演示",
    status: "待核对",
    issues: ["演示：请先核对题目，再自行分析或配置 API"],
    reference: {
      answer: "A",
      explanation: "参加考试 → 完成报名；肯定前件可肯定后件。",
      source: "自编样本，按命题逻辑蕴含规则核对",
    },
  });
  await db.questions.add(q2);
}
