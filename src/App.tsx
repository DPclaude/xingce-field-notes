import { useState, useEffect, Component, type ReactNode } from "react";
import {
  Sun,
  BookOpen,
  Layers,
  UserRound,
  Leaf,
  WifiOff,
  Download,
} from "lucide-react";
import Home from "./pages/Home";
import Questions from "./pages/Questions";
import Intake from "./pages/Intake";
import Editor from "./pages/Editor";
import Question from "./pages/Question";
import Review from "./pages/Review";
import Knowledge from "./pages/Knowledge";
import Settings from "./pages/Settings";
import { db, getSettings, recoverInterrupted } from "./db";
import { cleanupOriginals } from "./storage";
import { go, Notice } from "./components";
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="form-card">
        <h2>页面暂时没能打开</h2>
        <p>请刷新后重试，应用不会因此清空题库。</p>
        <button onClick={() => location.reload()}>刷新页面</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  const [route, setRoute] = useState(location.hash.slice(1) || "today"),
    [online, setOnline] = useState(navigator.onLine),
    [error, setError] = useState(""),
    [update, setUpdate] = useState(false);
  useEffect(() => {
    const hash = () => setRoute(location.hash.slice(1) || "today");
    const status = () => setOnline(navigator.onLine);
    const theme = async () => {
      const s = await getSettings();
      document.documentElement.dataset.theme = s.theme;
      document.documentElement.dataset.large = String(s.largeText);
    };
    const init = async () => {
      await recoverInterrupted();
      await theme();
      if ((await getSettings()).autoClean) await cleanupOriginals();
    };
    init().catch(() =>
      setError(
        "本地数据库无法打开或空间不足。请检查浏览器设置；不要清除站点数据。",
      ),
    );
    const timer = setInterval(
      () => recoverInterrupted().catch(() => {}),
      20000,
    );
    const updated = () => setUpdate(true);
    window.addEventListener("hashchange", hash);
    window.addEventListener("online", status);
    window.addEventListener("offline", status);
    window.addEventListener("settings-changed", theme);
    window.addEventListener("app-update", updated);
    return () => {
      clearInterval(timer);
      window.removeEventListener("hashchange", hash);
      window.removeEventListener("online", status);
      window.removeEventListener("offline", status);
      window.removeEventListener("settings-changed", theme);
      window.removeEventListener("app-update", updated);
    };
  }, []);
  const [page, id] = route.split("/");
  const active =
    page === "today"
      ? "today"
      : page === "knowledge"
        ? "knowledge"
        : page === "me"
          ? "me"
          : "questions";
  let content: ReactNode;
  if (page === "today") content = <Home />;
  else if (page.startsWith("questions")) content = <Questions />;
  else if (page === "new") content = <Intake />;
  else if (page === "edit" && id) content = <Editor key={id} id={id} />;
  else if (page === "question" && id) content = <Question key={id} id={id} />;
  else if (page === "review" && id) content = <Review key={id} id={id} />;
  else if (page === "knowledge") content = <Knowledge />;
  else if (page === "me") content = <Settings />;
  else content = <Home />;
  return (
    <div className="app-shell">
      <div className="brand-bar">
        <button onClick={() => go("today")} aria-label="知行首页">
          <span className="brand-symbol">
            <Leaf size={21} />
          </span>
          <strong>
            知行<span>行测考场思维错题本</span>
          </strong>
        </button>
        <span className="edition">个人版 · 01</span>
      </div>
      <main>
        {!online && (
          <Notice>
            <WifiOff size={16} />
            当前离线，已保存题目与复习仍可使用；新分析需要联网。
          </Notice>
        )}
        {update && (
          <Notice>
            新版本已就绪。
            <button
              className="text-button"
              onClick={async () => {
                if (await db.usage.where("status").equals("进行中").count()) {
                  setError("请等当前请求结束后更新");
                  return;
                }
                if (
                  confirm(
                    "请确认当前编辑已经保存，再更新页面。题库不会被删除。",
                  )
                )
                  window.dispatchEvent(new Event("apply-update"));
              }}
            >
              <Download size={15} />
              保存后更新
            </button>
          </Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        <ErrorBoundary key={page}>{content}</ErrorBoundary>
      </main>
      <nav className="bottom-nav" aria-label="主导航">
        {[
          { id: "today", name: "今天", icon: Sun },
          { id: "questions", name: "错题", icon: BookOpen },
          { id: "knowledge", name: "知识点", icon: Layers },
          { id: "me", name: "我的", icon: UserRound },
        ].map((n) => (
          <button
            key={n.id}
            className={active === n.id ? "selected" : ""}
            aria-current={active === n.id ? "page" : undefined}
            onClick={() => go(n.id)}
          >
            <n.icon size={22} strokeWidth={active === n.id ? 2 : 1.6} />
            <span>{n.name}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
