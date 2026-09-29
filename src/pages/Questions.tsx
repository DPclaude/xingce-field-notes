import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Search, Plus } from "lucide-react";
import { db } from "../db";
import { taxonomy } from "../domain";
import { PageTitle, QuestionRow, Empty, go } from "../components";
export default function Questions() {
  const all =
    useLiveQuery(
      () => db.questions.orderBy("updatedAt").reverse().toArray(),
      [],
    ) ?? [];
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState(
      location.hash.includes("pending") ? "待处理" : "全部",
    ),
    [category, setCategory] = useState("全部");
  const qs = all.filter(
    (q) =>
      (!search ||
        `${q.title} ${q.stem} ${q.tags.join(" ")} ${q.reason}`.includes(
          search,
        )) &&
      (category === "全部" || q.category === category) &&
      (filter === "全部" ||
        (filter === "收藏" && q.favorite) ||
        (filter === "到期" &&
          q.status === "已完成" &&
          q.schedule.due <= Date.now()) ||
        (filter === "待处理" && q.status !== "已完成")),
  );
  return (
    <>
      <PageTitle
        eyebrow="每次犹豫，都有迹可循"
        title="我的错题"
        description={`${all.length} 道记录 · 做错、做慢和蒙对都值得留下`}
      />
      <div className="search">
        <Search size={18} />
        <input
          aria-label="搜索错题"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索题目、知识点或错因"
        />
      </div>
      <div className="chips">
        {["全部", "待处理", "到期", "收藏"].map((f) => (
          <button
            key={f}
            className={filter === f ? "active" : ""}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>
      <label className="select-line">
        题目分类
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option>全部</option>
          {taxonomy.map((t) => (
            <option key={t[0]}>{t[0]}</option>
          ))}
        </select>
      </label>
      {qs.length ? (
        <div className="list-card">
          {qs.map((q) => (
            <QuestionRow key={q.id} q={q} />
          ))}
        </div>
      ) : (
        <Empty title="这里还没有符合条件的题目">
          换个筛选条件，或记录一道新题。
        </Empty>
      )}
      <button className="floating" onClick={() => go("new")}>
        <Plus size={20} />
        录入新题
      </button>
    </>
  );
}
