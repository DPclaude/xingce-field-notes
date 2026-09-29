import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { z } from "zod";
import { db, NotebookDB } from "./db";
import {
  questionSchema,
  materialSchema,
  cardSchema,
  recordSchema,
  usageSchema,
  type Asset,
} from "./domain";
const MAX_ZIP = 100 * 1024 * 1024,
  MAX_TOTAL = 300 * 1024 * 1024,
  MAX_FILE = 60 * 1024 * 1024;
export const digest = async (bytes: Uint8Array) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const assetMeta = z.object({
  id: z.string(),
  hash: z.string(),
  name: z.string(),
  type: z.enum(["image/jpeg", "image/png", "image/webp"]),
  width: z.number().positive(),
  height: z.number().positive(),
  createdAt: z.number(),
  displayFile: z.string(),
  originalFile: z.string().optional(),
  originalType: z.string().max(100).optional(),
});
const dataSchema = z.object({
  questions: z.array(questionSchema),
  materials: z.array(materialSchema),
  cards: z.array(cardSchema),
  reviews: z.array(recordSchema),
  usage: z.array(usageSchema),
  assets: z.array(assetMeta),
});
export async function exportBackup(
  database: NotebookDB = db,
): Promise<Uint8Array> {
  const [questions, materials, cards, reviews, usage, assets] =
    await database.transaction(
      "r",
      [
        database.questions,
        database.materials,
        database.cards,
        database.reviews,
        database.usage,
        database.assets,
      ],
      () =>
        Promise.all([
          database.questions.toArray(),
          database.materials.toArray(),
          database.cards.toArray(),
          database.reviews.toArray(),
          database.usage.toArray(),
          database.assets.toArray(),
        ]),
    );
  const blobs = assets.flatMap((a) =>
    a.original ? [a.display, a.original] : [a.display],
  );
  if (
    blobs.some((b) => b.size > MAX_FILE) ||
    blobs.reduce((n, b) => n + b.size, 0) > MAX_TOTAL
  )
    throw new Error(
      "题库图片超过单份备份限制，请先预览并清理冗余原图；未生成不可恢复的备份",
    );
  const files: Record<string, Uint8Array> = {};
  const meta = [];
  for (const [i, a] of assets.entries()) {
    const displayFile = `images/${i}.display`;
    files[displayFile] = new Uint8Array(await a.display.arrayBuffer());
    let originalFile: string | undefined;
    if (a.original) {
      originalFile = `images/${i}.original`;
      files[originalFile] = new Uint8Array(await a.original.arrayBuffer());
    }
    meta.push({
      id: a.id,
      hash: a.hash,
      name: a.name,
      type: a.type,
      width: a.width,
      height: a.height,
      createdAt: a.createdAt,
      displayFile,
      originalFile,
      originalType: a.original?.type,
    });
  }
  // Whitelist schemas and explicit tables: credentials and connection settings never enter this archive.
  files["data.json"] = strToU8(
    JSON.stringify(
      dataSchema.parse({
        questions,
        materials,
        cards,
        reviews,
        usage,
        assets: meta,
      }),
    ),
  );
  if (
    Object.values(files).some((b) => b.length > MAX_FILE) ||
    Object.values(files).reduce((n, b) => n + b.length, 0) >
      MAX_TOTAL - 1024 * 1024
  )
    throw new Error("题库超过单份备份解压大小限制，请先清理冗余原图");
  const hashes: Record<string, string> = {};
  for (const [path, b] of Object.entries(files)) hashes[path] = await digest(b);
  files["manifest.json"] = strToU8(
    JSON.stringify({
      format: "xingce-backup",
      version: 1,
      createdAt: Date.now(),
      hashes,
    }),
  );
  const archive = zipSync(files, { level: 1 });
  if (archive.length > MAX_ZIP)
    throw new Error("备份超过 100 MB，请先清理冗余原图；未生成不可恢复的备份");
  return archive;
}
export async function importBackup(
  bytes: Uint8Array,
  database: NotebookDB = db,
) {
  if (bytes.length > MAX_ZIP)
    throw new Error("备份超过 100 MB，请先分批清理冗余原图");
  let expanded = 0;
  const files = unzipSync(bytes, {
    filter: (f) => {
      expanded += f.originalSize;
      if (
        expanded > MAX_TOTAL ||
        f.originalSize > MAX_FILE ||
        f.name.includes("..") ||
        f.name.startsWith("/")
      )
        throw new Error("备份大小或文件路径异常");
      return true;
    },
  });
  if (!files["manifest.json"] || !files["data.json"])
    throw new Error("不是完整的知行备份");
  const manifest = z
    .object({
      format: z.literal("xingce-backup"),
      version: z.literal(1),
      hashes: z.record(z.string()),
    })
    .parse(JSON.parse(strFromU8(files["manifest.json"])));
  if (
    Object.keys(files).length !== Object.keys(manifest.hashes).length + 1 ||
    !manifest.hashes["data.json"]
  )
    throw new Error("文件清单不完整");
  for (const [path, hash] of Object.entries(manifest.hashes))
    if (!files[path] || (await digest(files[path])) !== hash)
      throw new Error(`备份校验失败：${path}`);
  const data = dataSchema.parse(JSON.parse(strFromU8(files["data.json"])));
  for (const rows of [
    data.questions,
    data.materials,
    data.cards,
    data.reviews,
    data.usage,
    data.assets,
  ])
    if (new Set(rows.map((v) => v.id)).size !== rows.length)
      throw new Error("备份中有重复记录 ID");
  const aIds = new Set(data.assets.map((a) => a.id)),
    qIds = new Set(data.questions.map((q) => q.id)),
    mIds = new Set(data.materials.map((m) => m.id));
  for (const q of data.questions) {
    if (q.materialId && !mIds.has(q.materialId))
      throw new Error("关联材料缺失");
    for (const r of q.regions)
      if (!aIds.has(r.assetId)) throw new Error("关联图片缺失");
  }
  for (const m of data.materials)
    for (const r of m.regions)
      if (!aIds.has(r.assetId)) throw new Error("材料图片缺失");
  for (const c of data.cards)
    if (
      [...c.questionIds, ...c.variants.map((v) => v.questionId)].some(
        (q) => !qIds.has(q),
      )
    )
      throw new Error("知识卡片来源题缺失");
  if (data.reviews.some((r) => !qIds.has(r.questionId)))
    throw new Error("复习记录来源题缺失");
  const assets: Asset[] = data.assets.map((a) => {
    if (!files[a.displayFile] || (a.originalFile && !files[a.originalFile]))
      throw new Error("图片文件缺失");
    return {
      id: a.id,
      hash: a.hash,
      name: a.name,
      type: a.type,
      width: a.width,
      height: a.height,
      createdAt: a.createdAt,
      display: new Blob([Uint8Array.from(files[a.displayFile]).buffer], {
        type: a.type,
      }),
      original: a.originalFile
        ? new Blob([Uint8Array.from(files[a.originalFile]).buffer], {
            type: a.originalType ?? a.type,
          })
        : undefined,
    };
  });
  const pairs = [
    ["questions", data.questions],
    ["materials", data.materials],
    ["cards", data.cards],
    ["reviews", data.reviews],
    ["usage", data.usage],
    ["assets", assets],
  ] as const;
  await database.transaction(
    "rw",
    pairs.map(([name]) => database.table(name)),
    async () => {
      for (const [name, rows] of pairs) {
        const table = database.table(name);
        for (const row of rows)
          if (await table.get(row.id))
            throw new Error(
              "已有同 ID 记录。为避免覆盖，整次导入已取消；请在空题库恢复。",
            );
      }
      for (const q of data.questions)
        if (q.status === "分析中") {
          q.status = "待核对";
          q.error = "备份中的进行中任务不会自动重发";
        }
      for (const u of data.usage) if (u.status === "进行中") u.status = "中断";
      for (const [name, rows] of pairs)
        if (rows.length) await database.table(name).bulkAdd(rows);
    },
  );
  return data.questions.length;
}
