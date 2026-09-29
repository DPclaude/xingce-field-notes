import { z } from "zod";
export const taxonomy = [
  ["政治理论", "政治理论"],
  ["常识判断", "常识判断"],
  ["言语·逻辑填空", "言语理解"],
  ["言语·主旨概括", "言语理解"],
  ["言语·语句表达", "言语理解"],
  ["数量·方程与比例", "数量关系"],
  ["数量·行程工程", "数量关系"],
  ["数量·排列概率", "数量关系"],
  ["数量·几何与计数", "数量关系"],
  ["判断·图形推理", "判断推理"],
  ["判断·定义判断", "判断推理"],
  ["判断·类比推理", "判断推理"],
  ["判断·逻辑论证", "判断推理"],
  ["判断·翻译与排列", "判断推理"],
  ["资料·增长率", "资料分析"],
  ["资料·比重与平均数", "资料分析"],
  ["资料·倍数与比较", "资料分析"],
  ["资料·综合分析", "资料分析"],
] as const;
export const statuses = [
  "待分析",
  "分析中",
  "已完成",
  "待核对",
  "失败",
] as const;
const text = z.string().max(40000);
const id = z.string().min(1).max(160);
const time = z.number().finite().nonnegative();
export const regionSchema = z
  .object({
    assetId: id,
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().positive().max(1),
    h: z.number().positive().max(1),
  })
  .refine((r) => r.x + r.w <= 1.001 && r.y + r.h <= 1.001, "裁剪范围超出图片");
export type Region = z.infer<typeof regionSchema>;
const checkSchema = z.object({
  label: z.string().max(200),
  expression: z.unknown(),
  expected: z.number().finite(),
});
const methodSchema = z.object({
  name: text,
  steps: z.array(text).min(1).max(15),
  why: text,
  load: text,
  risk: text,
  conditions: text,
});
export const analysisSchema = z.object({
  answer: z.string().max(200),
  issues: z.array(text).max(20),
  clues: text,
  choice: text,
  firstMove: text,
  quickSteps: z.array(text).min(1).max(20),
  stop: text,
  stuck: text,
  pitfalls: text,
  alternatives: z.array(methodSchema).max(3),
  decision: z.enum(["优先拿分", "限时尝试", "留到后面"]),
  decisionReason: text,
  timeRange: z
    .tuple([z.number().positive().max(3600), z.number().positive().max(3600)])
    .refine((v) => v[0] <= v[1]),
  checks: z.array(checkSchema).max(20),
  category: z
    .string()
    .refine((v) => taxonomy.some((t) => t[0] === v), "分类不在目录中"),
  tags: z.array(z.string().max(40)).max(3),
  knowledge: z.object({
    title: z.string().min(1).max(80),
    concept: text,
    signals: text,
    steps: text,
    boundary: text,
    traps: text,
    counterexample: text,
    stop: text,
  }),
});
export type Analysis = z.infer<typeof analysisSchema>;
export const scheduleSchema = z.object({
  stage: z.number().int().min(0).max(4),
  stable: z.number().int().min(0),
  due: time,
  lastReviewed: time.optional(),
  masteredAt: time.optional(),
});
export const questionSchema = z.object({
  id,
  createdAt: time,
  updatedAt: time,
  revision: z.number().int().nonnegative(),
  title: text,
  stem: text,
  options: z.array(text).max(10),
  regions: z.array(regionSchema).max(20),
  materialId: id.optional(),
  category: text,
  tags: z.array(text).max(3),
  status: z.enum(statuses),
  issues: z.array(text),
  reference: z.object({ answer: text, explanation: text, source: text }),
  confirmed: z.boolean(),
  imagesSafe: z.boolean(),
  favorite: z.boolean(),
  reason: text,
  analysis: analysisSchema.optional(),
  analysisHistory: z.array(z.object({ at: time, analysis: analysisSchema })),
  verification: z.array(text),
  schedule: scheduleSchema,
  source: z.enum(["个人录入", "自编演示"]),
  error: text.optional(),
  lastStudied: time.optional(),
});
export type Question = z.infer<typeof questionSchema>;
export const materialSchema = z.object({
  id,
  title: text,
  text,
  regions: z.array(regionSchema),
  createdAt: time,
});
export type Material = z.infer<typeof materialSchema>;
export const cardSchema = z.object({
  id,
  category: text,
  title: text,
  variants: z.array(
    z.object({
      questionId: id,
      revision: z.number().int(),
      content: analysisSchema.shape.knowledge,
    }),
  ),
  questionIds: z.array(id),
  needsReview: z.boolean(),
  due: time,
  updatedAt: time,
});
export type Card = z.infer<typeof cardSchema>;
export const recordSchema = z.object({
  id,
  questionId: id,
  at: time,
  answer: text,
  seconds: z.number().nonnegative().finite(),
  guessed: z.boolean(),
  revealed: z.boolean(),
  grade: z.enum(["不会", "吃力", "掌握"]),
  correct: z.boolean(),
  reason: text,
});
export type ReviewRecord = z.infer<typeof recordSchema>;
export const usageSchema = z.object({
  id,
  questionId: text,
  kind: z.enum(["识别", "分析", "连接测试"]),
  at: time,
  status: z.enum(["进行中", "成功", "失败", "中断"]),
  heartbeat: time,
  input: z.number().nonnegative().optional(),
  output: z.number().nonnegative().optional(),
  cached: z.number().nonnegative().optional(),
  cost: z.number().nonnegative().optional(),
  currency: text,
  estimateNote: text,
  model: text,
});
export type Usage = z.infer<typeof usageSchema>;
export const settingsSchema = z.object({
  baseUrl: z.string().url(),
  model: z.string().min(1),
  inputPrice: z.number().nonnegative(),
  outputPrice: z.number().nonnegative(),
  multiplier: z.number().positive(),
  currency: z.string().min(1).max(10),
  budget: z.number().nonnegative(),
  pricesConfirmed: z.boolean(),
  theme: z.enum(["auto", "light", "dark"]),
  largeText: z.boolean(),
  retentionDays: z.number().int().min(1),
  autoClean: z.boolean(),
  preset: z.enum(["福建省考", "国考"]),
  presets: z
    .array(
      z.object({
        name: text,
        minutes: z.number().positive(),
        count: z.number().int().positive(),
        reserve: z.number().nonnegative(),
      }),
    )
    .length(2),
  lastBackup: time.optional(),
});
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = {
  baseUrl: "https://api.xiaomimimo.com/v1",
  model: "mimo-v2.6-pro",
  inputPrice: 3,
  outputPrice: 6,
  multiplier: 1,
  currency: "元",
  budget: 50,
  pricesConfirmed: false,
  theme: "auto",
  largeText: false,
  retentionDays: 90,
  autoClean: false,
  preset: "福建省考",
  presets: [
    { name: "福建省考", minutes: 120, count: 120, reserve: 10 },
    { name: "国考", minutes: 120, count: 135, reserve: 10 },
  ],
};
export interface Asset {
  id: string;
  hash: string;
  name: string;
  type: string;
  display: Blob;
  original?: Blob;
  width: number;
  height: number;
  createdAt: number;
}
export function newQuestion(partial: Partial<Question> = {}): Question {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    revision: 0,
    title: "未命名题目",
    stem: "",
    options: [],
    regions: [],
    category: taxonomy[0][0],
    tags: [],
    status: "待分析",
    issues: [],
    reference: { answer: "", explanation: "", source: "" },
    confirmed: false,
    imagesSafe: false,
    favorite: false,
    reason: "",
    analysisHistory: [],
    verification: [],
    schedule: { stage: 0, stable: 0, due: now },
    source: "个人录入",
    ...partial,
  };
}
export const normalize = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/[\s，。,.：:；;、]/g, "")
    .toLowerCase();
