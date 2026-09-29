import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Star,
  PenLine,
  Play,
  ArrowRight,
  Timer,
  CheckCircle2,
} from "lucide-react";
import { db } from "../db";
import { observedTiming } from "../core";
import { analyze, processQuestion } from "../workflow";
import { cancelRequest } from "../api";
import type { Question as Q } from "../domain";
import {
  PageTitle,
  Rich,
  Notice,
  Status,
  ImageView,
  Section,
  go,
  useTask,
  Spinner,
} from "../components";
export function AnalysisView({ q }: { q: Q }) {
  const timingRecords =
    useLiveQuery(
      () => db.reviews.where("questionId").equals(q.id).toArray(),
      [q.id],
    ) ?? [];
  const measured = observedTiming(timingRecords);
  const a = q.analysis;
  if (!a) return null;
  return (
    <>
      <div className="answer-strip">
        <span>
          {q.source === "自编演示" ? "演示参考结论" : "模型结论"}{" "}
          <b>{a.answer || "未确定"}</b>
        </span>
        <Status status={q.status} />
      </div>
      {q.status !== "已完成" && (
        <Notice tone="error">
          系统发现尚未解决的问题，暂不作为确定答案，也不会形成正式知识归纳。
        </Notice>
      )}
      <div className="decision">
        <Timer size={20} />
        <div>
          <strong>
            {a.decision} · {(measured?.range ?? a.timeRange).join("–")} 秒
          </strong>
          <p>
            {measured
              ? `最近 ${measured.count} 个不同日期独立答对的实际区间，中位数 ${measured.median} 秒；不是下次完成时间保证。`
              : "估计区间，待实测。"}
            {a.decisionReason}
          </p>
        </div>
      </div>
      <Section title="推荐考场解法">
        <div className="thinking-card">
          {[
            ["01", "识别线索", a.clues],
            ["02", "为什么选这个方法", a.choice],
            ["03", "第一动作", a.firstMove],
          ].map(([n, title, body]) => (
            <div className="thinking-step" key={n}>
              <span>{n}</span>
              <div>
                <h3>{title}</h3>
                <Rich text={body} />
              </div>
            </div>
          ))}
          <div className="quick-solution">
            <p className="eyebrow">考场快解</p>
            {a.quickSteps.map((s, i) => (
              <div className="solution-step" key={i}>
                <b>{i + 1}</b>
                <Rich text={s} />
              </div>
            ))}
          </div>
          <div className="thinking-step">
            <CheckCircle2 size={20} />
            <div>
              <h3>到这里，就可以停下</h3>
              <Rich text={a.stop} />
            </div>
          </div>
        </div>
      </Section>
      <details className="accordion">
        <summary>卡住时怎样取舍</summary>
        <Rich text={a.stuck} />
      </details>
      <details className="accordion">
        <summary>易错点与适用边界</summary>
        <Rich text={a.pitfalls} />
      </details>
      {a.alternatives.map((m, i) => (
        <details className="accordion" key={i}>
          <summary>{m.name}</summary>
          <Rich text={m.why} />
          {m.steps.map((s, j) => (
            <Rich key={j} text={`${j + 1}. ${s}`} />
          ))}
          <p>计算与记忆负担：{m.load}</p>
          <p>易错风险：{m.risk}</p>
          <p>适用条件：{m.conditions}</p>
        </details>
      ))}
      <details className="accordion">
        <summary>验证记录 · 验证了什么</summary>
        {q.verification.map((v, i) => (
          <p key={i}>{v}</p>
        ))}
        <p className="micro">
          数值核对仅验证对应算式，不能据此宣称整题一定正确。
        </p>
      </details>
    </>
  );
}
export default function Question({ id }: { id: string }) {
  const q = useLiveQuery(() => db.questions.get(id), [id]);
  const material = useLiveQuery(
    async () => (q?.materialId ? db.materials.get(q.materialId) : undefined),
    [q?.materialId],
  );
  const reviews =
    useLiveQuery(
      () => db.reviews.where("questionId").equals(id).reverse().toArray(),
      [id],
    ) ?? [];
  const t = useTask();
  useEffect(() => {
    if (q?.analysis) void db.questions.update(id, { lastStudied: Date.now() });
  }, [id, q?.analysis?.answer]);
  if (!q) return <Notice>题目不存在或正在加载。</Notice>;
  return (
    <>
      <PageTitle back="questions" eyebrow={q.category} title={q.title} />
      <div className="toolbar">
        <Status status={q.status} />
        <button
          className={`text-button ${q.favorite ? "starred" : ""}`}
          onClick={() => db.questions.update(id, { favorite: !q.favorite })}
        >
          <Star size={17} fill={q.favorite ? "currentColor" : "none"} />
          {q.favorite ? "已收藏" : "收藏"}
        </button>
        <button
          className="text-button"
          disabled={q.status === "分析中"}
          onClick={() => go(`edit/${id}`)}
        >
          <PenLine size={17} />
          补充或更正
        </button>
      </div>
      {q.source === "自编演示" && (
        <Notice>
          自编演示题，参考答案按公式或逻辑规则核对；并非真实模型测试结果。
        </Notice>
      )}
      {q.error && <Notice tone="error">{q.error}</Notice>}
      {q.issues.length > 0 && (
        <Notice tone="error">
          {q.issues.map((s, i) => (
            <p key={i}>{s}</p>
          ))}
        </Notice>
      )}
      {material && (
        <details className="accordion" open>
          <summary>共享材料 · {material.title}</summary>
          <Rich text={material.text} />
          {material.regions.map((r, i) => (
            <ImageView key={i} region={r} />
          ))}
        </details>
      )}
      <div className="problem-card">
        <Rich text={q.stem || "图片草稿已保存，请先进行识题核对。"} />
        {q.options.map((o, i) => (
          <div className="option" key={i}>
            <Rich text={o} />
          </div>
        ))}
        {q.regions.map((r, i) => (
          <ImageView key={i} region={r} />
        ))}
      </div>
      {!q.analysis && q.status !== "分析中" && (
        <>
          <button className="primary full" disabled={t.busy} onClick={() => t.run(() => processQuestion(id))}>
            <Play size={18} />{t.busy ? "正在自动处理…" : q.confirmed ? "继续生成解析" : "自动识别并解析"}
          </button>
          <p className="micro">自动检查完整性并求解，无需逐项勾选。联网处理可能计费；缺少条件时会说明需要补哪一处。</p>
        </>
      )}
      {q.status === "分析中" && (
        <Notice>
          <Spinner />
          <p>请保持页面打开。锁屏或切到后台可能中断；草稿已经保存。</p>
          <button className="text-button" onClick={() => cancelRequest(id)}>
            取消本页发起的请求（仍可能计费）
          </button>
        </Notice>
      )}
      {q.analysis && <AnalysisView q={q} />}
      <details className="accordion">
        <summary>
          参考答案与机构解析 · {q.reference.source || "未提供来源"}
        </summary>
        <p>参考答案：{q.reference.answer || "未提供"}</p>
        <Rich text={q.reference.explanation || "未提供机构解析"} />
        <p className="micro">与模型结论分开保存，参考答案也可能有误。</p>
      </details>
      <Section title="这道题为什么值得留下">
        <select
          aria-label="错因"
          value={q.reason}
          onChange={(e) => db.questions.update(id, { reason: e.target.value })}
        >
          {[
            "",
            "做错了",
            "做对但太慢",
            "蒙对",
            "方法不清楚",
            "来不及做",
            "漏看条件",
            "计算失误",
            "方法选择不当",
          ].map((x) => (
            <option key={x} value={x}>
              {x || "暂不填写"}
            </option>
          ))}
        </select>
      </Section>
      {q.status === "已完成" && (
        <button className="primary full" onClick={() => go(`review/${id}`)}>
          隐藏答案，独立再做一次 <ArrowRight size={18} />
        </button>
      )}
      {!!reviews.length && (
        <details className="accordion">
          <summary>练习记录 · {reviews.length} 次</summary>
          {reviews.map((r) => (
            <p key={r.id}>
              {new Date(r.at).toLocaleDateString()} ·{" "}
              {r.correct ? "答对" : "答错"} · {r.seconds}秒 · {r.grade}
              {r.guessed ? " · 猜测" : ""}
              {r.revealed ? " · 近期看过解析" : ""}
            </p>
          ))}
        </details>
      )}
      {!!q.analysisHistory.length && (
        <details className="accordion">
          <summary>历史解析 · {q.analysisHistory.length} 个版本</summary>
          {q.analysisHistory.map((h, i) => (
            <details key={i}>
              <summary>
                {new Date(h.at).toLocaleString()} · 答案 {h.analysis.answer}
              </summary>
              <Rich text={h.analysis.quickSteps.join("\n\n")} />
            </details>
          ))}
        </details>
      )}
      {q.analysis && (
        <button
          className="text-button danger"
          disabled={t.busy || q.status === "分析中"}
          onClick={() => {
            if (
              confirm(
                "重新分析会再次调用模型并可能收费，旧版本会保留。继续吗？",
              )
            )
              t.run(() => analyze(id, true));
          }}
        >
          重新分析（再次计费）
        </button>
      )}
      {t.message && <Notice tone="error">{t.message}</Notice>}
    </>
  );
}
