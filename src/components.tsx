import { useEffect, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  LoaderCircle,
  X,
} from "lucide-react";
import { db } from "./db";
import type { Question, Region } from "./domain";
import { cropRegion } from "./images";
export function go(path: string) {
  location.hash = path;
  window.scrollTo(0, 0);
}
export function useTask() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "操作失败，请检查后重试");
    } finally {
      setBusy(false);
    }
  };
  return { busy, message, setMessage, run };
}
export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={`notice ${tone}`}
    >
      {children}
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  back,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  back?: string;
}) {
  return (
    <header className="page-title">
      {back && (
        <button className="text-button back" onClick={() => go(back)}>
          <ArrowLeft size={18} />
          返回
        </button>
      )}
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {description && <p className="muted">{description}</p>}
    </header>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <BookOpen size={28} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Spinner() {
  return (
    <span className="loading">
      <LoaderCircle size={18} className="spin" />
      正在处理…
    </span>
  );
}
export function Rich({ text }: { text: string }) {
  return (
    <div className="rich">
      <Markdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { strict: false, trust: false }]]}
        components={{
          a: ({ children }) => <span>{children}</span>,
          img: () => null,
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
export function Status({ status }: { status: string }) {
  return <span className={`status s-${status}`}>{status}</span>;
}
export function QuestionRow({
  q,
  review = false,
}: {
  q: Question;
  review?: boolean;
}) {
  return (
    <button
      className="question-row"
      onClick={() => go(`${review ? "review" : "question"}/${q.id}`)}
    >
      <span className="row-symbol">
        {q.category.startsWith("资料")
          ? "数"
          : q.category.startsWith("判断")
            ? "理"
            : "题"}
      </span>
      <span className="row-body">
        <span className="row-meta">
          {q.category} {q.source === "自编演示" && "· 演示"}
        </span>
        <strong>{review ? "独立作答 · 答案已隐藏" : q.title}</strong>
        <span className="row-bottom">
          <Status status={q.status} />
          {q.reason && <span>{q.reason}</span>}
        </span>
      </span>
      <ChevronRight size={18} />
    </button>
  );
}
export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
export function ImageView({
  region,
  original = false,
}: {
  region: Region;
  original?: boolean;
}) {
  const asset = useLiveQuery(
    () => db.assets.get(region.assetId),
    [region.assetId],
  );
  const [src, setSrc] = useState(""),
    [zoom, setZoom] = useState(false);
  useEffect(() => {
    let alive = true,
      url = "";
    setSrc("");
    if (asset)
      (original
        ? Promise.resolve(asset.original ?? asset.display)
        : cropRegion(region)
      )
        .then((b) => {
          url = URL.createObjectURL(b);
          if (alive) setSrc(url);
          else URL.revokeObjectURL(url);
        })
        .catch(() => {});
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [asset, original, region.assetId, region.x, region.y, region.w, region.h]);
  return (
    <>
      {src ? (
        <button
          className="image-button"
          onClick={() => setZoom(true)}
          aria-label="放大题图"
        >
          <img
            src={src}
            alt={original ? "原图（可能含参考答案）" : "题目裁剪图"}
          />
          <span>
            点击放大 <ArrowUpRight size={12} />
          </span>
        </button>
      ) : (
        <div className="notice">题图加载中或文件缺失</div>
      )}
      {zoom && (
        <div
          className="zoom"
          role="dialog"
          aria-modal="true"
          aria-label="查看题图"
        >
          <button className="zoom-close" onClick={() => setZoom(false)}>
            <X />
            关闭
          </button>
          <div className="zoom-scroll">
            <img src={src} alt="可缩放题目图片" />
          </div>
        </div>
      )}
    </>
  );
}
