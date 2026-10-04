// citylife 中转站（EdgeOne Pages 边缘函数）：收游戏请求 → 贴上密钥 → 转给 DeepSeek → 送回答案
// 密钥只存在 EdgeOne 项目的环境变量 DEEPSEEK_API_KEY 中，本文件零密钥。
/* ── 第 177 单·成本闸（《AI 通道与成本闸方案 v1》阶段二·服务端一侧）──────────────────────
   三件套：**限流**（每人每分钟/每天）＋**缓存**（同一道题不重复花钱）＋**预算熔断**（全站当天封顶）。
   另加一道可选的**通行证**（env.RELAY_PASS 设了才查；客户端带 `x-pass` 头）。
   配套台账：内存计数（calls／hits／blocked），到点打一行 console 便于出账与定位。
   口径（都可用环境变量覆盖；默认值按"正常玩不受影响、跑飞立刻刹车"取）：
     RELAY_PER_MIN     默认 20   每人每分钟请求数上限
     RELAY_PER_DAY     默认 600  每人每天请求数上限
     RELAY_GLOBAL_DAY  默认 5000 全站每天请求数上限（熔断：超了全站回 429，客户端自动走模板）
     RELAY_CACHE       默认 200  缓存条数上限（满了先丢最旧的）
     RELAY_PASS        默认 空   非空则要求请求头 `x-pass` 与它一致（**门帘，不是保险箱**）
   边界照实登记（别拿它当万能证明）：
     ① 边缘函数可能多实例、会冷启动，内存计数是**尽力而为**——它挡的是"跑飞的客户端"，
        不是"成规模的攻击"；要更硬的限制得接 EdgeOne 的存储/KV（另立单）。
     ② 缓存只存"题→答"的文本对、只活在实例内存里，进程回收即消失：不落盘、不外发。
     ③ 本文件改完**不自动部署**——部署属于"动线上"，须决策者点头（项目规约 6.16）。 */
const MODEL = 'deepseek-chat';   // 可调：模型名
const MAX_TOKENS = 1000;         // 可调：单次回复长度上限（也是钱包闸的一道：防"被要求写长文"式刷量）
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,x-pass',
};
/* 内存台账与三张桶（模块级：同一实例内共享；冷启动即清零） */
const 分钟桶 = new Map();   // 身份 → {k:分钟键, n:次数}
const 日桶   = new Map();   // 身份 → {d:日键,   n:次数}
const 缓存   = new Map();   // 题指纹 → 答文本
let 全站 = { d:'', n:0 };
let 账 = { calls:0, hits:0, blocked:0, lastLog:0 };
const LOG_EVERY = 50;       // 可调：每 50 次调用打一行台账

function json(obj, status){
  return new Response(JSON.stringify(obj), { status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=UTF-8' }, CORS) });
}
function 取数(v, 默认, 低, 高){
  const n = parseInt(v, 10);
  if(!isFinite(n)) return 默认;
  return Math.max(低, Math.min(高, n));
}
function 配置(env){
  const e = env || {};
  return {
    每分钟: 取数(e.RELAY_PER_MIN, 20, 1, 600),
    每天:   取数(e.RELAY_PER_DAY, 600, 1, 100000),
    全站:   取数(e.RELAY_GLOBAL_DAY, 5000, 1, 10000000),
    缓存:   取数(e.RELAY_CACHE, 200, 0, 5000),
    通行证: typeof e.RELAY_PASS === 'string' ? e.RELAY_PASS : '',
  };
}
function 身份(request){
  const h = request.headers;
  const xf = (h.get('x-forwarded-for') || '').split(',')[0].trim();
  return xf || h.get('cf-connecting-ip') || h.get('x-real-ip') || h.get('x-client-ip') || '未知';
}
function 分钟键(){ return Math.floor(Date.now() / 60000); }
function 日键(){
  // 按东八区日期分桶（与玩家的"每天"对齐）；边缘实例的本地时区不可靠，故手算 UTC+8
  const t = new Date(Date.now() + 8 * 3600 * 1000);
  return t.toISOString().slice(0, 10);
}
function 限流(身份名, cfg){
  const d = 日键(), k = 分钟键();
  let m = 分钟桶.get(身份名);
  if(!m || m.k !== k){ m = { k: k, n:0 }; 分钟桶.set(身份名, m); }
  let dd = 日桶.get(身份名);
  if(!dd || dd.d !== d){ dd = { d: d, n:0 }; 日桶.set(身份名, dd); }
  if(全站.d !== d) 全站 = { d: d, n:0 };
  if(m.n >= cfg.每分钟) return { ok:false, why:'rate_limited', retryAfter: 60 - (Math.floor(Date.now()/1000) % 60) };
  if(dd.n >= cfg.每天)  return { ok:false, why:'daily_limit' };
  if(全站.n >= cfg.全站) return { ok:false, why:'budget_exhausted' };
  m.n++; dd.n++; 全站.n++;
  if(分钟桶.size > 5000 || 日桶.size > 5000){   // 粗清理：实例内存别被身份桶撑爆
    for(const kv of 分钟桶){ if(kv[1].k !== k) 分钟桶.delete(kv[0]); if(分钟桶.size <= 2500) break; }
    for(const kv of 日桶){ if(kv[1].d !== d) 日桶.delete(kv[0]); if(日桶.size <= 2500) break; }
  }
  return { ok:true };
}
async function 指纹(s){
  // Web Crypto 优先；取不到就退回 FNV-1a（只当缓存键用，真撞了也只是多复用一次答案）
  try{
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2, '0'); }).join('').slice(0, 32);
  }catch(_){
    let h = 0x811c9dc5;
    for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return 'fnv' + h.toString(16);
  }
}
function 台账(line){
  if(账.calls - 账.lastLog >= LOG_EVERY || line){
    账.lastLog = 账.calls;
    console.log('[relay] ' + 日键() + ' calls=' + 账.calls + ' cache=' + 账.hits + ' blocked=' + 账.blocked + (line ? (' ' + line) : ''));
  }
}
async function callDS(key, prompt){
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }] }),
  });
  const data = await r.json().catch(function(){ return null; });
  if(!r.ok) throw new Error((data && data.error && data.error.message) || ('HTTP ' + r.status));
  return (((data && data.choices || [])[0] || {}).message || {}).content || '';
}
export async function onRequest({ request, env }){
  if(request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const cfg = 配置(env);
  const key = env && env.DEEPSEEK_API_KEY;
  const url = new URL(request.url);
  /* 通行证：设了 RELAY_PASS 才查（不设＝老行为；门帘不是保险箱——密钥始终只在服务端） */
  if(cfg.通行证 && request.headers.get('x-pass') !== cfg.通行证){
    账.blocked++; 台账('pass');
    return json({ error: 'pass_required' }, 403);
  }
  const 谁 = 身份(request);
  if(request.method === 'GET'){
    if(url.searchParams.get('test') === '1' && key){
      const 限 = 限流(谁, cfg);
      if(!限.ok){ 账.blocked++; 台账(限.why); return json({ error: 限.why, retryAfter: 限.retryAfter || 0 }, 429); }
      try{ 账.calls++; 台账('probe'); return json({ ok: true, reply: await callDS(key, '只回复一个字：通') }); }
      catch(e){ return json({ ok: false, error: String(e).slice(0, 120) }); }
    }
    return json({ ok: true, key: !!key, hint: key ? '中转站就绪' : '尚未配置环境变量 DEEPSEEK_API_KEY' });
  }
  if(request.method === 'POST'){
    if(!key) return json({ error: '中转站未配置密钥' }, 500);
    let body = {};
    try{ body = await request.json(); }catch(_){}
    const prompt = String(body.prompt || '').slice(0, 8000);
    if(!prompt) return json({ error: '空请求' }, 400);
    const 限 = 限流(谁, cfg);
    if(!限.ok){ 账.blocked++; 台账(限.why); return json({ error: 限.why, retryAfter: 限.retryAfter || 0 }, 429); }
    /* 缓存：同一道题（逐字相同）直接复用上次答案——重复的话不花第二次钱 */
    const fp = await 指纹(prompt);
    if(cfg.缓存 > 0 && 缓存.has(fp)){
      账.hits++; 台账('hit');
      return json({ text: 缓存.get(fp), cached: true });
    }
    try{
      账.calls++;
      const text = await callDS(key, prompt);
      if(cfg.缓存 > 0 && text){
        缓存.set(fp, text);
        while(缓存.size > cfg.缓存){ 缓存.delete(缓存.keys().next().value); }   // 满了丢最旧（近似 LRU）
      }
      台账();
      return json({ text: text });
    }
    catch(e){ return json({ error: String(e).slice(0, 200) }, 502); }
  }
  return json({ error: '不支持的方法' }, 405);
}
