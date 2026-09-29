import "fake-indexeddb/auto";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { db } from "../src/db";
import { newQuestion, defaultSettings } from "../src/domain";
import { setKey } from "../src/api";
import { processQuestion } from "../src/workflow";
import { loadDemo } from "../src/demo";
vi.mock("../src/images", () => ({ imageParts: async () => [] }));
let solution: unknown;
beforeEach(async () => {
  await db.delete(); await db.open(); await loadDemo();
  solution = (await db.questions.toArray()).find(q => q.analysis)!.analysis;
  await db.questions.clear(); await db.cards.clear();
  await setKey("test-only", defaultSettings.baseUrl, false);
});
afterEach(() => vi.unstubAllGlobals());
const item = (extra = {}) => ({title:"增长率",stem:"100增长到125，增长率是多少？",options:["A.20%","B.25%","C.30%","D.50%"],category:"资料·增长率",issues:[],regions:[],reference:{answer:"B",explanation:"PRIVATE_REFERENCE",source:"自编测试"},audit:{complete:true,answerHidden:true},...extra});
const response = (value: unknown) => new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:10,completion_tokens:10}}));
it("完整题目一次点击自动识题求解归类，已完成题不重复调用", async () => {
  await db.questions.add(newQuestion({id:"auto",stem:"100增长到125",options:["A.20%","B.25%"]}));
  let count=0;
  vi.stubGlobal("fetch",async (_:unknown, init:RequestInit) => {
    count++;
    if(count===1) return response({material:null,questions:[item()]});
    expect(String(init.body)).not.toContain("PRIVATE_REFERENCE");
    return response(solution);
  });
  await processQuestion("auto");
  expect(count).toBe(2);
  expect((await db.questions.get("auto"))!.status).toBe("已完成");
  expect(await db.cards.count()).toBe(1);
  await processQuestion("auto"); expect(count).toBe(2);
});
it.each([
  {issues:["右侧数字模糊，请补清晰图"]},
  {audit:{complete:true,answerHidden:false}},
  {audit:undefined},
  {options:[]},
  {category:"判断·图形推理"},
])("条件不完整或图片不安全时自动停止，不生成答案与卡片 %j", async (extra) => {
  await db.questions.add(newQuestion({id:"blocked",stem:"待识别题目"}));
  const fetch=vi.fn(async()=>response({material:null,questions:[item(extra)]}));
  vi.stubGlobal("fetch",fetch);
  await processQuestion("blocked");
  const q=(await db.questions.get("blocked"))!;
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(q.status).toBe("待核对"); expect(q.confirmed).toBe(false);
  expect(q.issues.length).toBeGreaterThan(0); expect(await db.cards.count()).toBe(0);
});
it("求解阶段中断后保留识题结果，下次明确继续不重复识别",async()=>{
  await db.questions.add(newQuestion({id:"resume",stem:"100增长到125"}));
  let count=0;
  vi.stubGlobal("fetch",async()=>{count++;if(count===1)return response({material:null,questions:[item()]});throw new TypeError("network");});
  await expect(processQuestion("resume")).rejects.toThrow();
  expect(count).toBe(2); expect((await db.questions.get("resume"))!.confirmed).toBe(true);
  vi.stubGlobal("fetch",async()=>{count++;return response(solution);});
  await processQuestion("resume"); expect(count).toBe(3);
  expect((await db.questions.get("resume"))!.status).toBe("已完成");
});
it("自动拆出的多题分别处理，有疑问的小题不会影响清楚的小题",async()=>{
  await db.questions.add(newQuestion({id:"multi",stem:"两道小题"}));
  let count=0;
  vi.stubGlobal("fetch",async()=>{count++;return count===1?response({material:null,questions:[item(),item({issues:["第二题缺数字"]})]}):response(solution);});
  const ids=await processQuestion("multi");
  expect(ids).toHaveLength(2);expect(count).toBe(2);
  expect((await db.questions.get(ids[0]))!.status).toBe("已完成");
  expect((await db.questions.get(ids[1]))!.status).toBe("待核对");
});
it("自动流程仍将参考答案冲突留为疑问，不生成正式知识卡",async()=>{
  await db.questions.add(newQuestion({id:"conflict",stem:"测试题"}));
  let count=0;
  vi.stubGlobal("fetch",async()=>{count++;return count===1?response({material:null,questions:[item({reference:{answer:"A",explanation:"",source:"测试参考"}})]}):response(solution);});
  await processQuestion("conflict");
  expect((await db.questions.get("conflict"))!.status).toBe("待核对");
  expect(await db.cards.count()).toBe(0);
});
