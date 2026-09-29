import { db } from "./db";
import { digest } from "./backup";
import type { Asset, Region } from "./domain";
async function load(blob: Blob) {
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(new Error("无法读取图片，请在相册中转为 JPEG 或 PNG"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
const canvasBlob = (c: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    c.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("图片处理失败"))),
      "image/jpeg",
      0.9,
    ),
  );
export async function saveImage(
  file: File,
): Promise<{ asset: Asset; duplicate: boolean }> {
  if (file.size > 25 * 1024 * 1024) throw new Error("单张图片请小于 25 MB");
  const hash = await digest(new Uint8Array(await file.arrayBuffer()));
  const existing = await db.assets.where("hash").equals(hash).first();
  if (existing) return { asset: existing, duplicate: true };
  const img = await load(file);
  if (img.naturalWidth * img.naturalHeight > 50000000)
    throw new Error("图片分辨率过大，请裁剪后上传");
  const scale = Math.min(
    1,
    2200 / Math.max(img.naturalWidth, img.naturalHeight),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const display = await canvasBlob(canvas);
  const asset: Asset = {
    id: crypto.randomUUID(),
    hash,
    name: file.name,
    type: "image/jpeg",
    width: canvas.width,
    height: canvas.height,
    display,
    original: file,
    createdAt: Date.now(),
  };
  await db.assets.add(asset);
  return { asset, duplicate: false };
}
export async function cropRegion(r: Region) {
  const asset = await db.assets.get(r.assetId);
  if (!asset) throw new Error("题图缺失，请重新上传");
  const img = await load(asset.display);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.naturalWidth * r.w));
  c.height = Math.max(1, Math.round(img.naturalHeight * r.h));
  c.getContext("2d")!.drawImage(
    img,
    img.naturalWidth * r.x,
    img.naturalHeight * r.y,
    img.naturalWidth * r.w,
    img.naturalHeight * r.h,
    0,
    0,
    c.width,
    c.height,
  );
  return canvasBlob(c);
}
export const dataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("图片读取失败"));
    r.readAsDataURL(blob);
  });
export async function imageParts(regions: Region[]) {
  const out = [];
  for (const r of regions)
    out.push({
      type: "image_url",
      image_url: { url: await dataUrl(await cropRegion(r)) },
    });
  return out;
}
