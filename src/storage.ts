import { db, getSettings } from "./db";
import { cleanCandidates } from "./core";
export async function cleanupPreview() {
  const settings = await getSettings();
  const qs = await db.questions.toArray();
  const candidates = cleanCandidates(qs, settings.retentionDays).filter(
    (q) => !q.category.startsWith("资料") && q.category !== "判断·图形推理",
  );
  const allowed = new Set(candidates.map((q) => q.id));
  const ids = new Set(
    candidates.flatMap((q) => q.regions.map((r) => r.assetId)),
  );
  for (const q of qs)
    if (!allowed.has(q.id)) for (const r of q.regions) ids.delete(r.assetId);
  for (const m of await db.materials.toArray())
    for (const r of m.regions) ids.delete(r.assetId);
  const assets = (await db.assets.toArray()).filter(
    (a) => ids.has(a.id) && a.original,
  );
  return {
    assets,
    bytes: assets.reduce((s, a) => s + (a.original?.size ?? 0), 0),
  };
}
export async function cleanupOriginals() {
  const { assets } = await cleanupPreview();
  await db.transaction("rw", db.assets, async () => {
    for (const a of assets)
      await db.assets.update(a.id, { original: undefined });
  });
  return assets.length;
}
