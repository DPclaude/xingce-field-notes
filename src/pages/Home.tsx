import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowRight,
  Camera,
  Plus,
  Sun,
  Clock3,
  FileCheck2,
  ChevronRight,
} from "lucide-react";
import { db, getSettings } from "../db";
import { defaultSettings } from "../domain";
import { loadDemo } from "../demo";
import {
  Empty,
  go,
  Notice,
  QuestionRow,
  Section,
  useTask,
} from "../components";
export default function Home() {
  const questions = useLiveQuery(() => db.questions.toArray(), []) ?? [];
  const settings = useLiveQuery(getSettings, []) ?? defaultSettings;
  const due = questions.filter(
      (q) => q.status === "已完成" && q.schedule.due <= Date.now(),
    ),
    pending = questions.filter((q) => q.status !== "已完成");
  const preset = settings.presets.find((p) => p.name === settings.preset)!;
  const task = useTask();
  return (
    <>
      <div className="home-greeting">
        <span>
          <Sun size={16} />{" "}
          {new Date().toLocaleDateString("zh-CN", {
            month: "long",
            day: "numeric",
            weekday: "long",
          })}
        </span>
        <span className="local-dot">本机保存</span>
      </div>
      <header className="home-title">
        <p className="eyebrow">把会做，变成考场上的会用</p>
        <h1>
          每一道题，
          <br />
          都值得<span>想明白。</span>
        </h1>
        <p className="muted">找到线索，选对方法，知道何时停下。</p>
      </header>
      <div className="hero-card">
        <div className="hero-art" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="hero-overline">
          <Clock3 size={16} /> 今日复习
        </div>
        <div className="hero-number">
          {due.length}
          <small>道题等待重逢</small>
        </div>
        <p>
          {due.length
            ? "先独立作答，再检验自己的思路。"
            : "今天没有到期题目。留一点时间，整理新的收获。"}
        </p>
        <button
          className="cream-button"
          onClick={() => go(due[0] ? `review/${due[0].id}` : "new")}
        >
          {due.length ? "开始今日复习" : "记录第一道题"}
          <ArrowRight size={18} />
        </button>
      </div>
      <div className="quick-grid">
        <button className="quick-card" onClick={() => go("new")}>
          <span className="quick-icon">
            <Camera />
          </span>
          <strong>拍照录入</strong>
          <small>先存草稿，再慢慢核对</small>
          <Plus size={18} className="corner" />
        </button>
        <button className="quick-card" onClick={() => go("questions?pending")}>
          <span className="quick-icon ochre">
            <FileCheck2 />
          </span>
          <strong>
            待处理 <em>{pending.length}</em>
          </strong>
          <small>核对、分析与中断任务</small>
          <ChevronRight size={18} className="corner" />
        </button>
      </div>
      <Section
        title="你的训练节奏"
        action={
          <button className="text-button" onClick={() => go("me")}>
            调整 <ChevronRight size={14} />
          </button>
        }
      >
        <div className="rhythm">
          <div>
            <span className="tag">{preset.name} · 训练配置</span>
            <h3>
              {preset.minutes} 分钟 <span>/ {preset.count} 题</span>
            </h3>
          </div>
          <p>
            预留 {preset.reserve} 分钟涂卡与检查后，
            <br />
            平均约{" "}
            <b>
              {Math.max(
                0,
                Math.round(
                  ((preset.minutes - preset.reserve) * 60) / preset.count,
                ),
              )}{" "}
              秒/题
            </b>
            。分配时间，不必平均用力。
          </p>
        </div>
      </Section>
      <Section
        title="最近记录"
        action={
          <button className="text-button" onClick={() => go("questions")}>
            全部 <ArrowRight size={14} />
          </button>
        }
      >
        {questions.length ? (
          <div className="list-card">
            {[...questions]
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .slice(0, 3)
              .map((q) => (
                <QuestionRow key={q.id} q={q} />
              ))}
          </div>
        ) : (
          <Empty title="从一道让你犹豫的题开始">
            做错、做慢、蒙对，都是值得记录的线索。
            <button
              className="text-button demo-link"
              disabled={task.busy}
              onClick={() => task.run(loadDemo)}
            >
              用两道自编示例体验流程
            </button>
          </Empty>
        )}
      </Section>
      {task.message && <Notice tone="error">{task.message}</Notice>}
      <p className="footnote">题库只在这台设备里。记得定期到“我的”导出备份。</p>
    </>
  );
}
