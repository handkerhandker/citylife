// 第 177 单·AI 成本闸（中转站侧）取证工具（只读诊断，进冒烟档 1）
//
// 为什么要有它：成本闸的三件套（限流／缓存／预算熔断）与可选通行证都落在 `functions/relay.js` 里，
//   而它平时跑在 EdgeOne 边缘（本机没有真环境）。本工具把 relay.js 复制成 .mjs **直接 import**，
//   用假 fetch 顶掉上游 DeepSeek——"上游被调了几次"数得清清楚楚，于是
//   「缓存真省了钱」「熔断真拦住了」「通行证真挡得住」都成了可判的读数，不是看源码猜。
//
// 判据：
//   ① OPTIONS 预检 200 ＋ CORS 头齐；② GET 状态路由；③ POST 正常应答（上游 +1）；
//   ④ 同一道题再发 ⇒ 命中缓存（cached:true）且**上游计数不变**；⑤ 换一道题 ⇒ 上游 +1；
//   ⑥ 每人每分钟上限 ⇒ 超出即 429 rate_limited；
//   ⑦ 每人每天上限 ⇒ 超出即 429 daily_limit；
//   ⑧ 全站预算熔断 ⇒ 超出即 429 budget_exhausted；
//   ⑨ 通行证（设了 RELAY_PASS）⇒ 不带 `x-pass` 403 pass_required、带对了放行；
//   ⑩ 默认值不误伤：不设任何限额环境变量时连发 5 道不同的题全部放行。
// 用法：node tools/ai-gate/probe.cjs
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const 仓库 = path.resolve(__dirname, '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const 沙盒 = path.join('F:/临时', 今天, 'ai-gate');
fs.mkdirSync(沙盒, { recursive: true });

/* 假上游：数次数、回固定形状（照 DeepSeek 的响应体） */
let 上游 = 0;
globalThis.fetch = async (url, opts) => {
  上游++;
  let 题 = '';
  try{ 题 = String(((JSON.parse(opts.body) || {}).messages || [{}])[0].content || ''); }catch(_){}
  return new Response(JSON.stringify({ choices: [{ message: { content: '（上游答）' + 题.slice(0, 10) } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } });
};

let 序 = 0;
async function 新实例(){
  序++;
  const p = path.join(沙盒, 'relay-' + 序 + '.mjs');
  fs.copyFileSync(path.join(仓库, 'functions', 'relay.js'), p);
  const m = await import(pathToFileURL(p).href);
  return m.onRequest;
}
const 密钥 = { DEEPSEEK_API_KEY: '测试密钥' };
async function 发(onRequest, 参){
  const o = Object.assign({ method: 'POST', prompt: '题面', env: 密钥, headers: {} }, 参 || {});
  const init = { method: o.method, headers: Object.assign({ 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.1' }, o.headers) };
  if (o.method === 'POST') init.body = JSON.stringify({ prompt: o.prompt });
  const r = await onRequest({ request: new Request('https://relay.example/relay', init), env: o.env });
  let j = null; try{ j = await r.json(); }catch(_){}
  return { s: r.status, j, cors: r.headers.get('access-control-allow-origin') };
}
let 红 = 0;
const 判 = (名, ok, 读) => { if(!ok) 红++; console.log((ok ? ' ok  ' : ' FAIL ') + 名 + '：' + JSON.stringify(读)); };

(async () => {
{
  const o = await 新实例();
  const r = await 发(o, { method: 'OPTIONS', env: {} });
  判('① OPTIONS 预检 200 ＋ CORS', r.s === 200 && r.cors === '*', { s: r.s, cors: r.cors });
  const g = await 发(o, { method: 'GET', env: {} });
  判('② GET 状态路由（无密钥如实报 false）', g.s === 200 && g.j && g.j.key === false, g.j);
}
{
  const o = await 新实例();
  上游 = 0;
  const a = await 发(o, { prompt: '同一道题' });
  const 上游1 = 上游;
  const b = await 发(o, { prompt: '同一道题' });
  const 上游2 = 上游;
  const c = await 发(o, { prompt: '另一道题' });
  判('③ POST 正常应答（上游 +1）', a.s === 200 && typeof a.j.text === 'string' && 上游1 === 1, { s: a.s, 上游1 });
  判('④ 同一道题命中缓存且上游不变', b.s === 200 && b.j.cached === true && 上游2 === 1, { cached: b.j.cached, 上游2 });
  判('⑤ 换一道题 ⇒ 上游 +1', c.s === 200 && c.j.cached !== true && 上游 === 2, { 上游 });
}
{
  const o = await 新实例();
  const env = Object.assign({}, 密钥, { RELAY_PER_MIN: '3' });
  const rs = [];
  for(let i = 1; i <= 4; i++) rs.push(await 发(o, { prompt: '分钟题' + i, env }));
  判('⑥ 每分钟上限：3 过 1 拦（429 rate_limited）',
    rs[0].s === 200 && rs[1].s === 200 && rs[2].s === 200 && rs[3].s === 429 && rs[3].j.error === 'rate_limited',
    rs.map(x => x.s));
}
{
  const o = await 新实例();
  const env = Object.assign({}, 密钥, { RELAY_PER_DAY: '2' });
  const rs = [];
  for(let i = 1; i <= 3; i++) rs.push(await 发(o, { prompt: '每天题' + i, env }));
  判('⑦ 每天上限：2 过 1 拦（429 daily_limit）',
    rs[0].s === 200 && rs[1].s === 200 && rs[2].s === 429 && rs[2].j.error === 'daily_limit',
    rs.map(x => x.s + (x.j && x.j.error ? (':' + x.j.error) : '')));
}
{
  const o = await 新实例();
  const env = Object.assign({}, 密钥, { RELAY_GLOBAL_DAY: '2' });
  const rs = [];
  for(let i = 1; i <= 3; i++) rs.push(await 发(o, { prompt: '熔断题' + i, env }));
  判('⑧ 全站预算熔断：2 过 1 拦（429 budget_exhausted）',
    rs[0].s === 200 && rs[1].s === 200 && rs[2].s === 429 && rs[2].j.error === 'budget_exhausted',
    rs.map(x => x.s + (x.j && x.j.error ? (':' + x.j.error) : '')));
}
{
  const o = await 新实例();
  const env = Object.assign({}, 密钥, { RELAY_PASS: 'men-lian-2026' });   // 通行证走 HTTP 头 ⇒ 用 ASCII
  const 没带 = await 发(o, { prompt: '门帘题', env });
  const 带对 = await 发(o, { prompt: '门帘题', env, headers: { 'x-pass': 'men-lian-2026' } });
  判('⑨ 通行证：不带 403 pass_required／带对放行',
    没带.s === 403 && 没带.j.error === 'pass_required' && 带对.s === 200,
    { 没带: 没带.s, 带对: 带对.s });
}
{
  const o = await 新实例();
  const rs = [];
  for(let i = 1; i <= 5; i++) rs.push(await 发(o, { prompt: '默认题' + i }));
  判('⑩ 默认值不误伤：连发 5 道不同的题全过', rs.every(x => x.s === 200), rs.map(x => x.s));
}
{
  const o = await 新实例();
  const 空 = await 发(o, { prompt: '' });
  const 怪 = await 发(o, { method: 'PUT', prompt: 'x' });
  判('⑪ 边角：空请求 400／不支持的方法 405', 空.s === 400 && 怪.s === 405, { 空: 空.s, 怪: 怪.s });
}

console.log(红 ? ('成本闸·中转站侧：' + 红 + ' 条判红') : '成本闸·中转站侧：全绿（上游调用数可数、缓存与三道上限都可判）');
process.exit(红 ? 1 : 0);
})();
