import type { Analysis, Question } from "./domain";
export function safeCalculate(value: unknown, depth = 0): number {
  if (depth > 16) throw new Error("表达式过深");
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= 1e15
  )
    return value;
  if (!value || typeof value !== "object")
    throw new Error("仅支持数值和白名单运算");
  const { op, args } = value as { op: string; args: unknown[] };
  if (!Array.isArray(args) || args.length !== 2)
    throw new Error("每次运算需两个参数");
  const [a, b] = args.map((v) => safeCalculate(v, depth + 1));
  let result: number;
  switch (op) {
    case "add":
      result = a + b;
      break;
    case "sub":
      result = a - b;
      break;
    case "mul":
      result = a * b;
      break;
    case "div":
      if (b === 0) throw new Error("不能除以零");
      result = a / b;
      break;
    case "pow":
      if (Math.abs(b) > 12) throw new Error("幂超出范围");
      result = a ** b;
      break;
    default:
      throw new Error("不支持的计算类型");
  }
  if (!Number.isFinite(result) || Math.abs(result) > 1e15)
    throw new Error("结果超出范围");
  return result;
}
export function reviewSchedule(
  previous: {
    stage: number;
    stable: number;
    lastReviewed?: number;
    masteredAt?: number;
  },
  result: {
    correct: boolean;
    grade: string;
    seconds: number;
    guessed: boolean;
    revealed: boolean;
    fastLimit: number;
  },
  now = Date.now(),
) {
  const fresh =
    !previous.lastReviewed ||
    new Date(previous.lastReviewed).toDateString() !==
      new Date(now).toDateString();
  const strong =
    result.correct &&
    result.grade === "掌握" &&
    !result.guessed &&
    !result.revealed &&
    result.seconds > 0 &&
    result.seconds <= result.fastLimit;
  const stable = strong ? (fresh ? previous.stable + 1 : previous.stable) : 0;
  const stage = strong
    ? fresh
      ? Math.min(4, previous.stage + 1)
      : previous.stage
    : result.correct && !result.guessed && !result.revealed
      ? Math.min(previous.stage, 1)
      : 0;
  const due = new Date(now);
  due.setDate(due.getDate() + [1, 3, 7, 14, 30][stage]);
  return {
    stage,
    stable,
    due: due.getTime(),
    lastReviewed: now,
    masteredAt: stable >= 3 ? (previous.masteredAt ?? now) : undefined,
  };
}
export function assessAnalysis(
  a: Pick<Analysis, "answer" | "issues" | "checks">,
  reference: string,
) {
  const issues = [...a.issues];
  const verification: string[] = [];
  if (!a.answer.trim()) issues.push("未得到答案");
  if (
    reference.trim() &&
    a.answer.trim().toUpperCase() !== reference.trim().toUpperCase()
  )
    issues.push(`答案冲突：模型 ${a.answer} / 参考 ${reference}`);
  for (const check of a.checks) {
    try {
      const actual = safeCalculate(check.expression);
      const ok =
        Math.abs(actual - check.expected) <=
        1e-9 * Math.max(1, Math.abs(actual));
      verification.push(
        `${check.label}：${actual}，${ok ? "数值计算已核对（不代表题目建模正确）" : "与模型给出的数值不符"}`,
      );
      if (!ok) issues.push(`计算不一致：${check.label}`);
    } catch {
      issues.push(`无法受控验证：${check.label}`);
    }
  }
  if (!a.checks.length)
    verification.push("未执行程序数值验证；模型自身复核不属于独立验证");
  return {
    status: issues.length ? ("待核对" as const) : ("已完成" as const),
    issues,
    verification,
  };
}
export function cleanCandidates(
  questions: Question[],
  days: number,
  now = Date.now(),
) {
  return questions.filter(
    (q) =>
      q.schedule.masteredAt &&
      now - q.schedule.masteredAt >= days * 86400000 &&
      !q.favorite &&
      q.schedule.stable >= 3,
  );
}

export function observedTiming(
  records: {
    at: number;
    seconds: number;
    correct: boolean;
    guessed: boolean;
    revealed: boolean;
  }[],
) {
  const days = new Map<string, number>();
  for (const r of [...records].sort((a, b) => a.at - b.at)) {
    if (
      r.correct &&
      !r.guessed &&
      !r.revealed &&
      Number.isFinite(r.seconds) &&
      r.seconds > 0
    )
      days.set(new Date(r.at).toDateString(), r.seconds);
  }
  const times = [...days.values()].slice(-8).sort((a, b) => a - b);
  if (times.length < 3) return;
  return {
    count: times.length,
    range: [times[0], times[times.length - 1]],
    median: times[Math.floor(times.length / 2)],
  };
}
