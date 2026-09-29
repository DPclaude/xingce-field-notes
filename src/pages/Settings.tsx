import { useState, useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { z } from "zod";
import {
  ShieldCheck,
  Download,
  Upload,
  Wifi,
  HardDrive,
  Check,
} from "lucide-react";
import { db, getSettings } from "../db";
import {
  settingsSchema,
  defaultSettings,
  type Settings as Config,
} from "../domain";
import { setKey, hasKey, callModel } from "../api";
import { dataUrl } from "../images";
import { exportBackup, importBackup } from "../backup";
import { cleanupPreview, cleanupOriginals } from "../storage";
import { PageTitle, Section, Notice, useTask, Spinner } from "../components";
export default function Settings() {
  const [s, setS] = useState<Config>(defaultSettings),
    [key, setKeyValue] = useState(""),
    [remember, setRemember] = useState(false),
    [keyExists, setKeyExists] = useState(false),
    [usage, setUsage] = useState<{ usage?: number; quota?: number }>({}),
    [preview, setPreview] = useState<{ count: number; bytes: number }>();
  const [pendingImport, setPendingImport] = useState<File>();
  const [download, setDownload] = useState<{ url: string; name: string }>();
  useEffect(
    () => () => {
      if (download) URL.revokeObjectURL(download.url);
    },
    [download],
  );
  const input = useRef<HTMLInputElement>(null);
  const t = useTask();
  const requests =
    useLiveQuery(() => db.usage.orderBy("at").reverse().toArray(), []) ?? [];
  useEffect(() => {
    getSettings().then((v) => {
      setS(v);
      hasKey(v.baseUrl).then(setKeyExists);
    });
    navigator.storage?.estimate().then(setUsage);
  }, []);
  const field = <K extends keyof Config>(name: K, value: Config[K]) =>
    setS({ ...s, [name]: value });
  const save = async () => {
    const checked = settingsSchema.parse(s);
    if (checked.presets.some((p) => p.reserve >= p.minutes))
      throw new Error("预留时间须小于总时长");
    const u = new URL(s.baseUrl);
    if (
      u.protocol !== "https:" ||
      u.search ||
      u.hash ||
      u.username ||
      u.password
    )
      throw new Error("请输入不含凭据和查询参数的 HTTPS API 地址");
    await db.preferences.put({ id: "settings", value: checked });
    if (key) {
      await setKey(key, s.baseUrl, remember);
      setKeyValue("");
      setKeyExists(true);
    }
    window.dispatchEvent(new Event("settings-changed"));
  };
  const month = requests.filter(
    (u) =>
      new Date(u.at).getMonth() === new Date().getMonth() &&
      new Date(u.at).getFullYear() === new Date().getFullYear(),
  );
  const estimated = month
    .filter((u) => u.currency === s.currency)
    .reduce((n, u) => n + (u.cost ?? 0), 0);
  const unknown = month.filter((u) => u.cost === undefined).length;
  const exportFile = () =>
    t.run(async () => {
      const bytes = await exportBackup();
      const blob = new Blob([Uint8Array.from(bytes).buffer], {
        type: "application/zip",
      });
      const file = new File(
        [blob],
        `知行备份-${new Date().toISOString().slice(0, 10)}.zip`,
        { type: blob.type },
      );
      const url = URL.createObjectURL(blob);
      setDownload({ url, name: file.name });
      const next = { ...s, lastBackup: Date.now() };
      await db.preferences.put({ id: "settings", value: next });
      setS(next);
      t.setMessage(
        "备份已生成，请点击“保存备份文件”，再确认已保存到“文件”。可手动选择 iCloud Drive。",
      );
    });
  return (
    <>
      <PageTitle
        eyebrow="你的题库，你来掌握"
        title="我的"
        description="数据留在本机，连接方式和训练节奏由你决定。"
      />
      <div className="privacy-card">
        <ShieldCheck size={26} />
        <div>
          <strong>本地优先，定期备份</strong>
          <p>
            照片和题库保存在本机。浏览器清理数据可能让记录丢失，请导出备份。
          </p>
        </div>
      </div>
      <Section title="模型与连接">
        <div className="form-card">
          <Notice>
            当前默认：LeaderAI 的
            g6a-promotion4。按你的要求先按接口可用设计；跨域、视觉识别和模型准确性尚未真实验证。
          </Notice>
          <label>
            API 地址
            <input
              autoCapitalize="none"
              autoCorrect="off"
              value={s.baseUrl}
              onChange={(e) => field("baseUrl", e.target.value.trim())}
            />
          </label>
          <label>
            模型 ID
            <input
              autoCapitalize="none"
              value={s.model}
              onChange={(e) => field("model", e.target.value)}
            />
          </label>
          <label>
            API Key{" "}
            <small>{keyExists ? "当前地址已有可用的本地密钥" : "未填写"}</small>
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKeyValue(e.target.value)}
              placeholder="只在这里填写，不放进聊天或代码"
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            在此设备记住新输入的密钥
          </label>
          <p className="micro">
            默认仅当前页面会话保存，刷新后可能需重填。记住密钥不是绝对安全的保险箱；本站脚本能访问它。密钥不包含在备份中。
          </p>
          <div className="button-row">
            <button
              className="primary"
              disabled={t.busy}
              onClick={() =>
                t.run(async () => {
                  await save();
                  t.setMessage("设置已保存。");
                })
              }
            >
              <Check size={17} />
              保存设置
            </button>
            <button
              className="secondary"
              disabled={t.busy}
              onClick={() =>
                t.run(async () => {
                  await setKey("", s.baseUrl, false);
                  setKeyValue("");
                  setKeyExists(false);
                  t.setMessage("本地密钥已清除。");
                })
              }
            >
              清除密钥
            </button>
          </div>
          <button
            className="secondary full"
            disabled={t.busy}
            onClick={() =>
              t.run(async () => {
                await save();
                if (
                  !confirm(
                    "连接测试会发送一张本地生成的数字图片，验证图片读取与 JSON 返回，可能产生少量平台费用。继续吗？",
                  )
                )
                  return;
                const code = String(Math.floor(10000 + Math.random() * 90000));
                const c = document.createElement("canvas");
                c.width = 320;
                c.height = 120;
                const ctx = c.getContext("2d")!;
                ctx.fillStyle = "#fff";
                ctx.fillRect(0, 0, 320, 120);
                ctx.fillStyle = "#111";
                ctx.font = "bold 52px sans-serif";
                ctx.fillText(code, 60, 80);
                const blob = await new Promise<Blob>((resolve) =>
                  c.toBlob((b) => resolve(b!), "image/png"),
                );
                await callModel(
                  s,
                  "connection-test",
                  "连接测试",
                  '只读取图片中的数字，以 JSON 返回 {"code":"图片中的数字"}。',
                  [
                    {
                      type: "image_url",
                      image_url: { url: await dataUrl(blob) },
                    },
                  ],
                  z.object({ code: z.literal(code) }),
                );
                t.setMessage(
                  "本次连接、图片数字识别及 JSON 返回测试通过。这不代表行测解题准确性已验证。",
                );
              })
            }
          >
            <Wifi size={17} />
            连接与图片测试（可能计费）
          </button>
        </div>
      </Section>
      <Section title="用量与预算">
        <div className="form-card">
          <div className="usage-number">
            {estimated.toFixed(3)} <small>{s.currency} / 本月已知估算</small>
          </div>
          <p className="micro">
            {unknown}{" "}
            次调用缺少完整费用；最终以平台账单为准。不同币种不合并。已保存解析与复习不调用模型。
          </p>
          {estimated >= s.budget && s.budget > 0 && (
            <Notice>已知估算达到本月预算提醒金额。</Notice>
          )}
          <div className="form-grid">
            <label>
              输入价 / 百万 token
              <input
                type="number"
                min="0"
                value={s.inputPrice}
                onChange={(e) => field("inputPrice", Number(e.target.value))}
              />
            </label>
            <label>
              输出价 / 百万 token
              <input
                type="number"
                min="0"
                value={s.outputPrice}
                onChange={(e) => field("outputPrice", Number(e.target.value))}
              />
            </label>
            <label>
              倍率
              <input
                type="number"
                min="0.01"
                step="0.1"
                value={s.multiplier}
                onChange={(e) => field("multiplier", Number(e.target.value))}
              />
            </label>
            <label>
              计价单位
              <input
                value={s.currency}
                onChange={(e) => field("currency", e.target.value)}
              />
            </label>
            <label>
              月预算提醒
              <input
                type="number"
                min="0"
                value={s.budget}
                onChange={(e) => field("budget", Number(e.target.value))}
              />
            </label>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={s.pricesConfirmed}
              onChange={(e) => field("pricesConfirmed", e.target.checked)}
            />
            我已核对价格口径，启用费用估算
          </label>
          <p className="micro">
            平台页面只确认了输入 725 积分/百万 token
            起，尚无完整输出价格。若填写的是折后实际价，请把倍率设为
            1，避免重复折扣。缓存、图片和思考 token 按平台规则计费。
          </p>
          <details>
            <summary>最近调用记录</summary>
            {requests.slice(0, 15).map((u) => (
              <p className="micro" key={u.id}>
                {new Date(u.at).toLocaleString()} · {u.kind} · {u.status}
                <br />
                {u.input ?? "未知"} 输入 / {u.output ?? "未知"} 输出 ·{" "}
                {u.cost === undefined
                  ? "费用未知"
                  : u.cost.toFixed(3) + " " + u.currency}
                <br />
                {u.estimateNote}
              </p>
            ))}
          </details>
        </div>
      </Section>
      <Section title="训练与显示">
        <div className="form-card">
          <label>
            当前训练预设
            <select
              value={s.preset}
              onChange={(e) =>
                field("preset", e.target.value as Config["preset"])
              }
            >
              <option>福建省考</option>
              <option>国考</option>
            </select>
          </label>
          {s.presets.map((p, i) => (
            <div key={p.name}>
              <h4>{p.name}</h4>
              <div className="form-grid">
                {(["minutes", "count", "reserve"] as const).map((k, n) => (
                  <label key={k}>
                    {["时长 / 分钟", "题量", "涂卡检查 / 分钟"][n]}
                    <input
                      type="number"
                      min={k === "reserve" ? 0 : 1}
                      value={p[k]}
                      onChange={(e) =>
                        field(
                          "presets",
                          s.presets.map((v, j) =>
                            i === j ? { ...v, [k]: Number(e.target.value) } : v,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <p className="micro">
            仅为个人训练配置，不代表所有年份的考试规则。完整试卷计时与模块分析将另行加入。
          </p>
          <label>
            显示模式
            <select
              value={s.theme}
              onChange={(e) =>
                field("theme", e.target.value as Config["theme"])
              }
            >
              <option value="auto">跟随系统</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={s.largeText}
              onChange={(e) => field("largeText", e.target.checked)}
            />
            加大文字
          </label>
          <button
            className="primary"
            onClick={() =>
              t.run(async () => {
                await save();
                t.setMessage("设置已保存");
              })
            }
          >
            保存设置
          </button>
        </div>
      </Section>
      <Section title="备份与恢复">
        <div className="form-card">
          <p>
            {s.lastBackup
              ? `上次生成备份：${new Date(s.lastBackup).toLocaleString()}`
              : "还没有生成过备份。建议每周保存一次。"}
          </p>
          <button
            className="primary full"
            disabled={t.busy}
            onClick={exportFile}
          >
            <Download size={18} />
            导出完整题库（含图片）
          </button>
          {download && (
            <a
              className="primary full"
              href={download.url}
              download={download.name}
            >
              保存备份文件 · {download.name}
            </a>
          )}
          <input
            ref={input}
            type="file"
            hidden
            accept=".zip"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setPendingImport(file);
              e.target.value = "";
            }}
          />
          <button
            className="secondary full"
            disabled={t.busy}
            onClick={() => input.current?.click()}
          >
            <Upload size={18} />
            导入备份
          </button>
          {pendingImport && (
            <Notice>
              准备恢复：{pendingImport.name}。校验通过后加入题库；若已有同 ID
              数据，整次取消，不覆盖旧数据。
              <div className="button-row">
                <button
                  className="primary"
                  disabled={t.busy}
                  onClick={() =>
                    t.run(async () => {
                      const n = await importBackup(
                        new Uint8Array(await pendingImport.arrayBuffer()),
                      );
                      setPendingImport(undefined);
                      t.setMessage(
                        `已完整导入 ${n} 道题，图片、材料和复习记录均已恢复。`,
                      );
                    })
                  }
                >
                  确认恢复备份
                </button>
                <button
                  className="secondary"
                  onClick={() => setPendingImport(undefined)}
                >
                  取消
                </button>
              </div>
            </Notice>
          )}
          <p className="micro">
            备份不含密钥或 API 连接设置。可保存至 iPhone“文件”或手动选择 iCloud
            Drive，不是自动同步。
          </p>
        </div>
      </Section>
      <Section title="存储与清理">
        <div className="form-card">
          <p>
            <HardDrive size={16} /> 已用约{" "}
            {usage.usage === undefined
              ? "暂无法估计"
              : (usage.usage / 1024 / 1024).toFixed(1) + " MB"}
          </p>
          <button
            className="text-button"
            onClick={() =>
              t.run(async () => {
                const ok = await navigator.storage?.persist?.();
                t.setMessage(
                  ok
                    ? "浏览器已授予持久存储。仍需定期备份。"
                    : "浏览器未授予持久存储或不支持此功能，请定期备份。",
                );
              })
            }
          >
            申请持久存储
          </button>
          <label>
            稳定掌握多少天后列入候选
            <input
              type="number"
              min="1"
              value={s.retentionDays}
              onChange={(e) => field("retentionDays", Number(e.target.value))}
            />
          </label>
          <p className="micro">
            收藏、未掌握、图形推理、资料图表和共享材料的原图不清理。只清除合格候选的冗余原图，保留清晰副本、文字与记录。
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={s.autoClean}
              onChange={(e) => {
                if (
                  e.target.checked &&
                  !confirm(
                    "启用后，仅在打开应用时按上述保留规则清理冗余原图，不再逐次确认。继续吗？",
                  )
                )
                  return;
                field("autoClean", e.target.checked);
              }}
            />
            打开应用时自动清理符合规则的冗余原图（保存后生效）
          </label>
          <button
            className="secondary"
            onClick={() =>
              t.run(async () => {
                await save();
                const p = await cleanupPreview();
                setPreview({ count: p.assets.length, bytes: p.bytes });
              })
            }
          >
            查看清理预览
          </button>
          {preview && (
            <Notice>
              可清理 {preview.count} 张冗余原图，约{" "}
              {(preview.bytes / 1024 / 1024).toFixed(1)} MB。
              <button
                disabled={!preview.count}
                className="text-button danger"
                onClick={() =>
                  t.run(async () => {
                    if (
                      confirm(
                        "确认清理预览中的冗余原图？请先备份。清晰副本与题库记录会保留。",
                      )
                    ) {
                      const n = await cleanupOriginals();
                      t.setMessage(`已清理 ${n} 张冗余原图。`);
                      setPreview(undefined);
                      setUsage(await navigator.storage.estimate());
                    }
                  })
                }
              >
                确认清理
              </button>
            </Notice>
          )}
        </div>
      </Section>
      <details className="accordion">
        <summary>添加到 iPhone 主屏幕与每日提醒</summary>
        <p>
          在 Safari 打开部署网址，点击分享 →
          添加到主屏幕。首次联网打开后，已缓存的页面和保存的题目可离线查看。
        </p>
        <p>
          在 iPhone“提醒事项”新建每日提醒，例如“20:00
          复习知行错题本”。本应用只在打开时计算到期题目，不承诺关闭后的准时推送。
        </p>
      </details>
      {t.busy && <Spinner />}
      {t.message && (
        <div className="sticky-message">
          <Notice>
            {t.message}
            <button className="text-button" onClick={() => t.setMessage("")}>
              知道了
            </button>
          </Notice>
        </div>
      )}
    </>
  );
}
