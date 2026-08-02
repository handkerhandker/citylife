// citylife 中转站（EdgeOne Pages 边缘函数）：收游戏请求 → 贴上密钥 → 转给 DeepSeek → 送回答案
// 密钥只存在 EdgeOne 项目的环境变量 DEEPSEEK_API_KEY 中，本文件零密钥。
const MODEL = 'deepseek-chat';   // 可调：模型名
const MAX_TOKENS = 1000;         // 可调：单次回复长度上限
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
function json(obj, status){
  return new Response(JSON.stringify(obj), { status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=UTF-8' }, CORS) });
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
  const key = env && env.DEEPSEEK_API_KEY;
  const url = new URL(request.url);
  if(request.method === 'GET'){
    if(url.searchParams.get('test') === '1' && key){
      try{ return json({ ok: true, reply: await callDS(key, '只回复一个字：通') }); }
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
    try{ return json({ text: await callDS(key, prompt) }); }
    catch(e){ return json({ error: String(e).slice(0, 200) }, 502); }
  }
  return json({ error: '不支持的方法' }, 405);
}
