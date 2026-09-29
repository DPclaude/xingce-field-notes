import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { BookOpen, ChevronRight, Link2, Layers } from "lucide-react";
import { db, invalidateQuestion } from "../db";
import type { Card } from "../domain";
import {
  PageTitle,
  Section,
  Empty,
  Rich,
  Notice,
  go,
  useTask,
} from "../components";
export default function Knowledge() {
  const cards = useLiveQuery(() => db.cards.toArray(), []) ?? [];
  const questions = useLiveQuery(() => db.questions.toArray(), []) ?? [];
  const materials = useLiveQuery(() => db.materials.toArray(), []) ?? [];
  const [selected, setSelected] = useState(""),
    [search, setSearch] = useState(""),
    [move, setMove] = useState<string[]>([]),
    [target, setTarget] = useState(""),
    [materialId, setMaterialId] = useState(""),
    [materialText, setMaterialText] = useState("");
  const t = useTask();
  const c = cards.find((c) => c.id === selected);
  const split = () =>
    t.run(async () => {
      if (!c || !move.length || move.length === c.questionIds.length)
        throw new Error("请选择部分关联题目拆分，原卡片至少保留一道题");
      const next: Card = {
        ...c,
        id: crypto.randomUUID(),
        title: c.title + " · 分支",
        questionIds: move,
        variants: c.variants.filter((v) => move.includes(v.questionId)),
        needsReview: true,
        updatedAt: Date.now(),
      };
      await db.transaction("rw", db.cards, async () => {
        await db.cards.add(next);
        await db.cards.update(c.id, {
          questionIds: c.questionIds.filter((id) => !move.includes(id)),
          variants: c.variants.filter((v) => !move.includes(v.questionId)),
          needsReview: true,
        });
      });
      setMove([]);
      setSelected(next.id);
    });
  return (
    <>
      <PageTitle
        eyebrow="从一道题，走向一类题"
        title="知识与方法"
        description="保留来源，积累能在考场真正用上的判断。"
      />
      {c ? (
        <>
          <button className="text-button" onClick={() => setSelected("")}>
            ← 返回目录
          </button>
          <div className="knowledge-heading">
            <span className="tag">{c.category}</span>
            <h2>{c.title}</h2>
            <p>
              {c.questionIds.length} 道关联题 ·{" "}
              {c.needsReview ? "归纳待核对" : "已归档"}
            </p>
          </div>
          {c.needsReview && (
            <Notice>
              来源表述有变化或题目已修订。以下是保留的来源版本，尚未合并为确定规则。
            </Notice>
          )}
          {c.variants.map((v, i) => (
            <details
              className="accordion"
              open={i === 0}
              key={`${v.questionId}-${i}`}
            >
              <summary>
                来源 {i + 1} ·{" "}
                {questions.find((q) => q.id === v.questionId)?.title ??
                  "来源缺失"}
              </summary>
              {[
                ["核心概念", v.content.concept],
                ["识别信号", v.content.signals],
                ["可复用步骤", v.content.steps],
                ["适用条件与失效情形", v.content.boundary],
                ["常见误区", v.content.traps],
                ["有依据的反例", v.content.counterexample],
                ["停止与换法", v.content.stop],
              ].map(([label, body]) => (
                <div key={label}>
                  <h4>{label}</h4>
                  <Rich text={body} />
                </div>
              ))}
              <button
                className="text-button"
                onClick={() => go(`question/${v.questionId}`)}
              >
                <Link2 size={16} />
                查看来源题目（版本 {v.revision}）
              </button>
            </details>
          ))}
          {c.needsReview && (
            <button
              className="secondary full"
              onClick={() =>
                t.run(async () => {
                  const stale = c.variants.some((v) => {
                    const q = questions.find((q) => q.id === v.questionId);
                    return (
                      !q || q.status !== "已完成" || q.revision !== v.revision
                    );
                  });
                  if (stale)
                    throw new Error(
                      "来源题目仍未重新分析或结论待核对，请先处理对应错题",
                    );
                  if (
                    confirm(
                      "请确认已经对照各来源检查过规则、条件与反例，且没有未解决冲突。",
                    )
                  )
                    await db.cards.update(c.id, { needsReview: false });
                })
              }
            >
              我已核对所有来源，确认可归档
            </button>
          )}
          {!c.needsReview && (
            <button
              className="primary full"
              onClick={() =>
                t.run(async () => {
                  await db.cards.update(c.id, {
                    due: Date.now() + 3 * 86400000,
                  });
                  t.setMessage("知识卡片复习已记录，3 天后再看一次。");
                })
              }
            >
              已复习这张卡片
            </button>
          )}
          <details className="accordion">
            <summary>整理卡片 · 合并 / 拆分</summary>
            <label>
              合并到已有卡片
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="">选择目标</option>
                {cards
                  .filter((x) => x.id !== c.id)
                  .map((x) => (
                    <option value={x.id} key={x.id}>
                      {x.title}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="secondary"
              onClick={() =>
                t.run(async () => {
                  const other = cards.find((x) => x.id === target);
                  if (!other) throw new Error("先选择目标卡片");
                  if (
                    !confirm(
                      "合并后保留全部来源，标记待核对。可用拆分功能再分开。",
                    )
                  )
                    return;
                  await db.transaction("rw", db.cards, async () => {
                    await db.cards.update(other.id, {
                      variants: [...other.variants, ...c.variants],
                      questionIds: [
                        ...new Set([...other.questionIds, ...c.questionIds]),
                      ],
                      needsReview: true,
                    });
                    await db.cards.delete(c.id);
                  });
                  setSelected(other.id);
                  setTarget("");
                })
              }
            >
              合并并保留来源
            </button>
            <hr />
            <p>选择要拆入新卡片的题目：</p>
            {c.questionIds.map((id) => (
              <label className="check" key={id}>
                <input
                  type="checkbox"
                  checked={move.includes(id)}
                  onChange={(e) =>
                    setMove(
                      e.target.checked
                        ? [...move, id]
                        : move.filter((x) => x !== id),
                    )
                  }
                />
                {questions.find((q) => q.id === id)?.title}
              </label>
            ))}
            <button className="secondary" onClick={split}>
              将所选题目拆为新卡片
            </button>
          </details>
        </>
      ) : (
        <>
          <div className="search">
            <BookOpen size={18} />
            <input
              aria-label="搜索知识卡片"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索概念或解题方法"
            />
          </div>
          <Section title="方法卡片">
            {cards.length ? (
              <div className="card-grid">
                {cards
                  .filter((c) => `${c.title}${c.category}`.includes(search))
                  .map((c) => (
                    <button
                      className="knowledge-card"
                      key={c.id}
                      onClick={() => {
                        setSelected(c.id);
                        setMove([]);
                      }}
                    >
                      <div>
                        <span className="tag">{c.category}</span>
                        {c.needsReview ? (
                          <span className="status">待核对</span>
                        ) : c.due <= Date.now() ? (
                          <span className="status">待复习</span>
                        ) : null}
                      </div>
                      <h3>{c.title}</h3>
                      <p>{c.variants[0]?.content.signals}</p>
                      <footer>
                        {c.questionIds.length} 道关联题{" "}
                        <ChevronRight size={16} />
                      </footer>
                    </button>
                  ))}
              </div>
            ) : (
              <Empty title="方法体系，从可靠的解析中长出来">
                完成第一道题的分析后，自动归入稳定目录。未解决的疑问不会成为正式卡片。
              </Empty>
            )}
          </Section>
        </>
      )}
      <Section title="共享材料">
        <div className="list-card">
          {materials.map((m) => (
            <div className="material-row" key={m.id}>
              <button
                className="text-button"
                onClick={() => {
                  setMaterialId(m.id);
                  setMaterialText(m.text);
                }}
              >
                <Layers size={17} />
                {m.title}
              </button>
              <small>
                {questions.filter((q) => q.materialId === m.id).length} 道小题
              </small>
            </div>
          ))}
          {!materials.length && (
            <p className="muted pad">
              录入资料分析时，可将同一材料关联多个小题。
            </p>
          )}
        </div>
        {materialId && (
          <div className="form-card">
            <label>
              修正材料原文
              <textarea
                rows={6}
                value={materialText}
                onChange={(e) => setMaterialText(e.target.value)}
              />
            </label>
            <button
              className="secondary"
              onClick={() =>
                t.run(async () => {
                  const affected = questions.filter(
                    (q) => q.materialId === materialId,
                  );
                  if (affected.some((q) => q.status === "分析中"))
                    throw new Error("相关小题正在分析，请等待结束再修改");
                  await db.transaction(
                    "rw",
                    db.materials,
                    db.questions,
                    db.cards,
                    async () => {
                      await db.materials.update(materialId, {
                        text: materialText,
                      });
                      for (const q of affected) await invalidateQuestion(q);
                    },
                  );
                  setMaterialId("");
                  t.setMessage("材料已更新，关联小题和知识归纳已标记待核对。");
                })
              }
            >
              保存并重新核对关联题目
            </button>
          </div>
        )}
      </Section>
      {t.message && <Notice>{t.message}</Notice>}
    </>
  );
}
