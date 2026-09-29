import { useRef } from "react";
import { Camera, Images, PenLine } from "lucide-react";
import { db } from "../db";
import { newQuestion } from "../domain";
import { saveImage } from "../images";
import { go, Notice, PageTitle, useTask, Spinner } from "../components";
export default function Intake() {
  const album = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null);
  const t = useTask();
  const add = (files: FileList | null) =>
    t.run(async () => {
      if (!files?.length) return;
      if (files.length > 12) throw new Error("一次最多选择 12 张图片");
      const q = newQuestion();
      await db.questions.add(q);
      let duplicates = 0;
      try {
        for (const file of Array.from(files)) {
          const { asset, duplicate } = await saveImage(file);
          if (duplicate) duplicates++;
          q.regions.push({ assetId: asset.id, x: 0, y: 0, w: 1, h: 1 });
          await db.questions.put(q);
        }
      } catch (e) {
        go(`edit/${q.id}`);
        throw e;
      }
      q.title = `图片草稿 · ${q.regions.length} 张`;
      q.error = duplicates
        ? `发现 ${duplicates} 张重复图片，已复用本地文件。请确认是否已有同题解析，避免重复调用。`
        : undefined;
      await db.questions.put(q);
      go(`edit/${q.id}`);
    });
  return (
    <>
      <PageTitle
        back="today"
        eyebrow="先记录，再想明白"
        title="录入一道题"
        description="图片先存进本机。只有你点击识别或分析，才会调用模型。"
      />
      <input
        hidden
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => add(e.target.files)}
      />
      <input
        hidden
        ref={album}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => add(e.target.files)}
      />
      <div className="intake-options">
        <button disabled={t.busy} onClick={() => camera.current?.click()}>
          <Camera size={28} />
          <strong>拍下眼前这道题</strong>
          <span>保留完整题干、选项和必要图形</span>
        </button>
        <button disabled={t.busy} onClick={() => album.current?.click()}>
          <Images size={28} />
          <strong>从相册选图</strong>
          <span>多图一道题，也可以识别后拆分多题</span>
        </button>
        <button
          disabled={t.busy}
          onClick={() =>
            t.run(async () => {
              const q = newQuestion();
              await db.questions.add(q);
              go(`edit/${q.id}`);
            })
          }
        >
          <PenLine size={28} />
          <strong>手动录入文字</strong>
          <span>已有题干时，可以跳过图片识别</span>
        </button>
      </div>
      {t.busy && <Spinner />}
      {t.message && <Notice tone="error">{t.message}</Notice>}
      <Notice>
        截图带答案时，识别后请调整题图边界，排除答案和机构解析。图形推理必须保留必要的图形。
      </Notice>
    </>
  );
}
