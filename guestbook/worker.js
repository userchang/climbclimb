/**
 * 爬爬顶小站 · 留言板后端
 * 跑在 Cloudflare Workers 上，数据存 D1（SQLite）。免费额度足够个人站用。
 *
 * 接口：
 *   GET  /api/messages           取最近 50 条
 *   POST /api/messages           发一条，body 是 JSON {name, content}
 *
 * 部署前要在 Worker 的「设置 → 变量」里加一个 D1 绑定，变量名必须叫 DB。
 */

/* 允许跨域的前端来源；本地预览可以加 http://localhost:8000 */
var ALLOW = [
  'https://climbclimb.top',
  'https://www.climbclimb.top',
  'http://localhost:8000'
];

var LIMIT_CHARS = 500;   /* 单条留言最长字数 */
var NAME_CHARS = 24;     /* 昵称最长字数 */
var COOLDOWN = 60;       /* 同一个 IP 多少秒才能再发一条，防刷 */

function headers(origin) {
  var ok = ALLOW.indexOf(origin) >= 0 ? origin : ALLOW[0];
  return {
    'Access-Control-Allow-Origin': ok,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

function json(body, origin, status) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: headers(origin) });
}

export default {
  async fetch(request, env) {
    var origin = request.headers.get('Origin') || '';

    /* 浏览器的预检请求，直接放行 */
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: headers(origin) });
    }

    var path = new URL(request.url).pathname;
    if (path !== '/api/messages') return json({ error: 'not found' }, origin, 404);

    if (request.method === 'GET') {
      var res = await env.DB.prepare(
        'SELECT id, name, content, created_at FROM messages ORDER BY id DESC LIMIT 50'
      ).all();
      return json({ messages: res.results }, origin);
    }

    if (request.method === 'POST') {
      var data;
      try { data = await request.json(); }
      catch (e) { return json({ error: '数据格式不对' }, origin, 400); }

      var name = String(data.name || '').trim().slice(0, NAME_CHARS) || '路人';
      var content = String(data.content || '').trim().slice(0, LIMIT_CHARS);
      if (!content) return json({ error: '内容不能为空' }, origin, 400);

      /* 限流：同一个 IP 在冷却时间内只认第一条 */
      var ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
      var last = await env.DB.prepare(
        'SELECT created_at FROM messages WHERE ip = ? ORDER BY id DESC LIMIT 1'
      ).bind(ip).first();
      if (last && Date.now() - last.created_at < COOLDOWN * 1000) {
        return json({ error: '慢一点，' + COOLDOWN + ' 秒后再来一条' }, origin, 429);
      }

      await env.DB.prepare(
        'INSERT INTO messages (name, content, ip, created_at) VALUES (?, ?, ?, ?)'
      ).bind(name, content, ip, Date.now()).run();

      return json({ ok: true }, origin);
    }

    return json({ error: 'method not allowed' }, origin, 405);
  }
};
