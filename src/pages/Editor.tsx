import { useState, useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  ScanLine,
} from "lucide-react";
import { db, invalidateQuestion, editedQuestion } from "../db";
import { type Question, type Region, taxonomy, normalize } from "../domain";
import { saveImage } from "../images";
import { processQuestion } from "../workflow";
import {
  go,
  PageTitle,
  Notice,
  ImageView,
  useTask,
  Spinner,
  Section,
} from "../components";
export default function Editor({ id }: { id: string }) {
  const saved = useLiveQuery(() => db.questions.get(id), [id]);
  const materials = useLiveQuery(() => db.materials.toArray(), []) ?? [];
  const all = useLiveQuery(() => db.questions.toArray(), []) ?? [];
  const [q, setQ] = useState<Question>();
  const [original, setOriginal] = useState(false),
    [split, setSplit] = useState(true);
  const [matText, setMatText] = useState(""),
    [matTitle, setMatTitle] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const t = useTask();
  const pending = useRef(0);
  const [saving, setSaving] = useState(false),
    [saveError, setSaveError] = useState(false);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (pending.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);
  useEffect(() => {
    if (saved && !q) {
      setQ(saved);
    }
  }, [saved, q]);
  if (!q) return <Spinner />;
  const update = (patch: Partial<Question>) => {
    t.setMessage("");
    const next = { ...q, ...patch };
    setQ(editedQuestion(next));
    pending.current++;
    setSaving(true);
    void invalidateQuestion(next)
      .catch((e) => {
        setSaveError(true);
        t.setMessage(String(e));
      })
      .finally(() => {
        pending.current--;
        setSaving(pending.current > 0);
      });
  };
  const region = (i: number, patch: Partial<Region>) => {
    const r = { ...q.regions[i], ...patch };
    r.w = Math.max(0.01, Math.min(r.w, 1 - r.x));
    r.h = Math.max(0.01, Math.min(r.h, 1 - r.y));
    update({ regions: q.regions.map((v, n) => (n === i ? r : v)) });
  };
  const duplicates =
    q.stem.trim().length > 12
      ? all.filter(
          (o) => o.id !== q.id && normalize(o.stem) === normalize(q.stem),
        )
      : [];
  const automatic = () => t.run(async () => {
    if (saving || pending.current) throw new Error("正在保存刚才的修改，请稍候");
    if (saveError) throw new Error("编辑保存失败，请先保留文字并处理保存错误");
    try {
      await processQuestion(q.id, split);
    } catch (error) {
      const latest = await db.questions.get(q.id);
      if (latest) setQ(latest);
      throw error;
    }
    go(`question/${q.id}`);
  });
  return (
    <>
      <PageTitle
        back={`question/${id}`}
        eyebrow="核对交给系统，重点看懂方法"
        title="录入与解析"
        description="草稿已在本机保存。点一次，自动识别、检查条件并生成考场解析。"
      />
      <p className="micro" role="status">
        {saveError
          ? "保存未成功，请保留当前文字并查看下方提示"
          : saving
            ? "正在保存，请稍候…"
            : "已保存在本机"}
      </p>
      {q.error && <Notice>{q.error}</Notice>}
      {duplicates.length > 0 && (
        <Notice>
          疑似重复题：
          {duplicates.map((d) => (
            <button
              key={d.id}
              className="text-button"
              onClick={() => go(`question/${d.id}`)}
            >
              {d.title}
            </button>
          ))}{" "}
          可先查看已保存解析，避免重复花费。
        </Notice>
      )}
      <div className="form-card">
        {q.issues.length > 0 && <Notice>需要补充：{q.issues[0]}。可在下方补图或更正，系统会重新检查。</Notice>}
        {q.regions.map((r, i) => <ImageView key={i} region={r} />)}
        {!q.regions.length && q.stem && <p>{q.stem}</p>}
        <button className="primary full" disabled={t.busy || saving || saved?.status === "分析中"} onClick={automatic}>
          <ScanLine size={18} />
          {t.busy ? "正在识别、检查与解析…" : q.analysis ? "查看已有解析" : "自动识别并解析"}
        </button>
        <p className="micro">联网处理可能计费，通常一次识题、一次求解；多题逐题求解。已完成结果直接复用。请保持页面打开。</p>
      </div>
      <details className="accordion" open={!q.regions.length}>
        <summary>补充或更正 · 加图、改文字、调整边界</summary>
      <fieldset
        className="editor-fields"
        disabled={t.busy || saved?.status === "分析中"}
      >
        <Section
          title={`题目图片 · ${q.regions.length} 张`}
          action={
            <button
              className="text-button"
              disabled={t.busy}
              onClick={() => input.current?.click()}
            >
              <Plus size={16} />
              加图
            </button>
          }
        >
          <input
            hidden
            ref={input}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              t.run(async () => {
                const next = [...q.regions];
                for (const file of files) {
                  const { asset, duplicate } = await saveImage(file);
                  if (duplicate)
                    t.setMessage(
                      "检测到重复图片，已复用。请检查是否已有这道题。",
                    );
                  next.push({ assetId: asset.id, x: 0, y: 0, w: 1, h: 1 });
                }
                if (next.length > 20) throw new Error("每题最多 20 个图片区域");
                update({ regions: next });
              });
            }}
          />
          {!!q.regions.length && (
            <>
              <div className="chips">
                <button
                  className={!original ? "active" : ""}
                  onClick={() => setOriginal(false)}
                >
                  解题区域预览
                </button>
                <button
                  className={original ? "active" : ""}
                  onClick={() => setOriginal(true)}
                >
                  原图对照
                </button>
              </div>
              {q.regions.map((r, i) => (
                <div className="region-card" key={`${r.assetId}-${i}`}>
                  <div className="region-head">
                    <strong>图片 {i + 1}</strong>
                    <div>
                      <button
                        aria-label="图片上移"
                        disabled={!i || t.busy}
                        onClick={() => {
                          const a = [...q.regions];
                          [a[i - 1], a[i]] = [a[i], a[i - 1]];
                          update({ regions: a });
                        }}
                      >
                        <ArrowUp size={17} />
                      </button>
                      <button
                        aria-label="图片下移"
                        disabled={i === q.regions.length - 1 || t.busy}
                        onClick={() => {
                          const a = [...q.regions];
                          [a[i + 1], a[i]] = [a[i], a[i + 1]];
                          update({ regions: a });
                        }}
                      >
                        <ArrowDown size={17} />
                      </button>
                      <button
                        aria-label="移除题图关联"
                        disabled={t.busy}
                        onClick={() =>
                          update({
                            regions: q.regions.filter((_, n) => n !== i),
                          })
                        }
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </div>
                  <ImageView region={r} original={original} />
                  <div className="crop-fields">
                    {(["x", "y", "w", "h"] as const).map((k, n) => (
                      <label key={k}>
                        {["左边距", "上边距", "宽度", "高度"][n]} %
                        <input
                          aria-label={`图片${i + 1}${k}`}
                          type="number"
                          min={n < 2 ? 0 : 1}
                          max={n < 2 ? 99 : 100}
                          value={Math.round(r[k] * 100)}
                          onChange={(e) =>
                            region(i, {
                              [k]: Math.max(
                                n < 2 ? 0 : 0.01,
                                Math.min(
                                  n < 2 ? 0.99 : 1,
                                  Number(e.target.value) / 100,
                                ),
                              ),
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <p className="micro">
                    修改边界以排除答案；多题区域可以复制后分别裁剪。
                  </p>
                  <button
                    className="text-button"
                    disabled={t.busy}
                    onClick={() =>
                      t.run(async () => {
                        const copy = {
                          ...q,
                          id: crypto.randomUUID(),
                          title: q.title + " · 拆出小题",
                          regions: [r],
                          analysis: undefined,
                          analysisHistory: [],
                          reference: {
                            answer: "",
                            explanation: "",
                            source: "",
                          },
                          status: "待核对" as const,
                          confirmed: false,
                          imagesSafe: false,
                          createdAt: Date.now(),
                          schedule: { stage: 0, stable: 0, due: Date.now() },
                        };
                        await db.questions.add(copy);
                        go(`edit/${copy.id}`);
                      })
                    }
                  >
                    复制此区域为另一道题
                  </button>
                </div>
              ))}
              <label className="check">
                <input
                  type="checkbox"
                  checked={split}
                  onChange={(e) => setSplit(e.target.checked)}
                />
                自动拆分独立小题（多图连续内容会合成一道题）
              </label>
            </>
          )}
        </Section>
        <div className="form-card">
          <label>
            题目标题
            <input
              value={q.title}
              onChange={(e) => update({ title: e.target.value })}
            />
          </label>
          <label>
            题干（支持 Markdown 表格、$公式$）
            <textarea
              rows={6}
              value={q.stem}
              onChange={(e) => update({ stem: e.target.value })}
              placeholder="输入完整题干，保留单位和否定词"
            />
          </label>
          <label>
            选项（每行一个，保留 A/B/C/D）
            <textarea
              rows={4}
              value={q.options.join("\n")}
              onChange={(e) => update({ options: e.target.value.split("\n") })}
            />
          </label>
          <label>
            分类
            <select
              value={q.category}
              onChange={(e) => update({ category: e.target.value })}
            >
              {taxonomy.map((x) => (
                <option key={x[0]}>{x[0]}</option>
              ))}
            </select>
          </label>
          <label>
            待解决问题（补充后由系统重新检查）
            <textarea
              rows={2}
              value={q.issues.join("\n")}
              onChange={(e) =>
                update({ issues: e.target.value.split("\n").filter(Boolean) })
              }
              placeholder="例如：表格右侧被截断，需补图"
            />
          </label>
        </div>
        <details className="accordion">
          <summary>共享材料 · {q.materialId ? "已关联" : "可选"}</summary>
          <div className="form-card">
            <label>
              关联已有材料
              <select
                value={q.materialId ?? ""}
                onChange={(e) =>
                  update({ materialId: e.target.value || undefined })
                }
              >
                <option value="">不关联</option>
                {materials.map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </label>
            {q.materialId && (
              <p className="muted">
                {materials.find((m) => m.id === q.materialId)?.text}
              </p>
            )}
            <label>
              新材料名称
              <input
                value={matTitle}
                onChange={(e) => setMatTitle(e.target.value)}
              />
            </label>
            <label>
              材料原文（也可保留当前图片区域作为图表）
              <textarea
                rows={4}
                value={matText}
                onChange={(e) => setMatText(e.target.value)}
              />
            </label>
            <button
              className="secondary"
              onClick={() =>
                t.run(async () => {
                  if (!matTitle || !matText)
                    throw new Error("请输入材料名称与原文");
                  const m = {
                    id: crypto.randomUUID(),
                    title: matTitle,
                    text: matText,
                    regions: [...q.regions],
                    createdAt: Date.now(),
                  };
                  await db.materials.add(m);
                  update({ materialId: m.id });
                  setMatText("");
                  setMatTitle("");
                })
              }
            >
              保存为新共享材料并关联
            </button>
            <p className="micro">
              已关联的材料可在“知识点 →
              共享材料”中编辑；更正后会让相关小题重新核对。
            </p>
          </div>
        </details>
        <details className="accordion">
          <summary>参考答案与来源 · 单独保存</summary>
          <div className="form-card">
            <label>
              参考答案
              <input
                value={q.reference.answer}
                onChange={(e) =>
                  update({
                    reference: {
                      ...q.reference,
                      answer: e.target.value.trim().toUpperCase(),
                    },
                  })
                }
                placeholder="例如 B，可留空"
              />
            </label>
            <label>
              来源
              <input
                value={q.reference.source}
                onChange={(e) =>
                  update({
                    reference: { ...q.reference, source: e.target.value },
                  })
                }
                placeholder="年份、机构、书名或来源不详"
              />
            </label>
            <label>
              机构解析
              <textarea
                value={q.reference.explanation}
                onChange={(e) =>
                  update({
                    reference: { ...q.reference, explanation: e.target.value },
                  })
                }
              />
            </label>
          </div>
        </details>
        <button className="primary full" disabled={t.busy || saving || saved?.status === "分析中"} onClick={automatic}>
          <ScanLine size={18} />保存更正并自动解析
        </button>
      </fieldset>
      </details>
      {t.busy && <Spinner />}
      {t.message && <Notice tone="error">{t.message}</Notice>}
    </>
  );
}
