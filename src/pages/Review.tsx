import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Timer } from "lucide-react";
import { db } from "../db";
import { reviewSchedule } from "../core";
import { PageTitle, Notice, Rich, ImageView, go, useTask } from "../components";
import { AnalysisView } from "./Question";
export default function Review({ id }: { id: string }) {
  const q = useLiveQuery(() => db.questions.get(id), [id]);
  const m = useLiveQuery(
    async () => (q?.materialId ? db.materials.get(q.materialId) : undefined),
    [q?.materialId],
  );
  const [start] = useState(Date.now()),
    [seconds, setSeconds] = useState(0),
    [answer, setAnswer] = useState(""),
    [guessed, setGuessed] = useState(false),
    [submitted, setSubmitted] = useState(false),
    [saved, setSaved] = useState(false),
    [seenBefore, setSeenBefore] = useState<boolean>();
  const t = useTask();
  useEffect(() => {
    if (submitted) return;
    const timer = setInterval(
      () => setSeconds(Math.round((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [start, submitted]);
  if (!q) return null;
  if (q.status !== "已完成" || !q.analysis)
    return (
      <Notice>
        本题结论尚待核对，暂不纳入答案反馈复习。
        <button onClick={() => go(`question/${id}`)}>查看题目</button>
      </Notice>
    );
  const recentlySeen =
    seenBefore ?? (!!q.lastStudied && start - q.lastStudied < 30 * 60000);
  const grade = (rating: "不会" | "吃力" | "掌握") =>
    t.run(async () => {
      const at = Date.now();
      const correct =
        answer.trim().toUpperCase() === q.analysis!.answer.trim().toUpperCase();
      const record = {
        id: crypto.randomUUID(),
        questionId: id,
        at,
        answer,
        seconds,
        guessed,
        revealed: recentlySeen,
        grade: rating,
        correct,
        reason: q.reason,
      };
      const schedule = reviewSchedule(
        q.schedule,
        { ...record, fastLimit: q.analysis!.timeRange[1] },
        at,
      );
      await db.transaction(
        "rw",
        db.questions,
        db.reviews,
        db.cards,
        async () => {
          await db.reviews.add(record);
          await db.questions.update(id, { schedule, lastStudied: at });
          const failed = (
            await db.reviews.where("questionId").equals(id).toArray()
          ).filter((r) => !r.correct).length;
          if (!correct || rating === "不会") {
            for (const card of await db.cards
              .where("category")
              .equals(q.category)
              .toArray()) {
              const related = await db.reviews
                .where("questionId")
                .anyOf(card.questionIds)
                .toArray();
              if (failed >= 2 || related.filter((r) => !r.correct).length >= 2)
                await db.cards.update(card.id, { due: at });
            }
          }
        },
      );
      setSaved(true);
    });
  return (
    <>
      <PageTitle
        back="today"
        eyebrow="先自己做，再看解析"
        title="独立作答"
        description="不急着看答案，先观察自己从哪一步开始。"
      />
      <div className="review-timer">
        <Timer size={18} />
        {seconds} 秒 <span>按真实经过时间计时</span>
      </div>
      {recentlySeen && (
        <Notice>你近期看过这道题的解析。本次用于巩固，不计为稳定掌握。</Notice>
      )}
      {m && (
        <div className="problem-card">
          <h3>材料</h3>
          <Rich text={m.text} />
          {q.imagesSafe &&
            m.regions.map((r, i) => <ImageView key={i} region={r} />)}
        </div>
      )}
      <div className="problem-card">
        <Rich text={q.stem} />
        {q.regions.length > 0 && !q.imagesSafe && (
          <Notice>图片尚未确认排除答案，请先到编辑页处理。</Notice>
        )}
        {q.imagesSafe &&
          q.regions.map((r, i) => <ImageView key={i} region={r} />)}
        {q.options.map((o, i) => {
          const letter =
            o.match(/^\s*([A-H])/i)?.[1]?.toUpperCase() ??
            String.fromCharCode(65 + i);
          return (
            <button
              disabled={submitted}
              className={`answer-option ${answer === letter ? "chosen" : ""}`}
              key={i}
              onClick={() => setAnswer(letter)}
            >
              <span>{letter}</span>
              <Rich text={o.replace(/^\s*[A-H][.．、:：)）]?\s*/i, "")} />
            </button>
          );
        })}
      </div>
      <label>
        我的答案
        <input
          disabled={submitted}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="选择选项或输入答案"
        />
      </label>
      <label className="check">
        <input
          disabled={submitted}
          type="checkbox"
          checked={guessed}
          onChange={(e) => setGuessed(e.target.checked)}
        />
        这次是猜的 / 不确定
      </label>
      {!submitted ? (
        <button
          className="primary full"
          disabled={!answer.trim() || t.busy}
          onClick={() =>
            t.run(async () => {
              setSeenBefore(recentlySeen);
              await db.questions.update(id, { lastStudied: Date.now() });
              setSeconds(Math.max(1, Math.round((Date.now() - start) / 1000)));
              setSubmitted(true);
            })
          }
        >
          提交答案，查看反馈
        </button>
      ) : (
        <>
          <Notice
            tone={
              answer.trim().toUpperCase() ===
              q.analysis.answer.trim().toUpperCase()
                ? "success"
                : "error"
            }
          >
            {answer.trim().toUpperCase() ===
            q.analysis.answer.trim().toUpperCase()
              ? "答案一致。再看看自己的方法是否稳妥。"
              : `你的答案 ${answer}，已保存结论 ${q.analysis.answer}。请对照思路。`}
          </Notice>
          <AnalysisView q={q} />
          {saved ? (
            <Notice tone="success">
              记录已保存，下次复习已在本机安排。
              <button className="text-button" onClick={() => go("today")}>
                返回今天
              </button>
            </Notice>
          ) : (
            <div className="form-card">
              <label>
                实际用时（可修正，秒）
                <input
                  type="number"
                  min="1"
                  value={seconds}
                  onChange={(e) =>
                    setSeconds(Math.max(1, Number(e.target.value)))
                  }
                />
              </label>
              <p>这次独立作答的感受是？</p>
              <div className="grade-buttons">
                {(["不会", "吃力", "掌握"] as const).map((g) => (
                  <button disabled={t.busy} key={g} onClick={() => grade(g)}>
                    {g}
                  </button>
                ))}
              </div>
              <p className="micro">
                猜对、近期看过解析或同一天反复作答，不会直接计为稳定掌握。
              </p>
            </div>
          )}
        </>
      )}
      {t.message && <Notice tone="error">{t.message}</Notice>}
    </>
  );
}
