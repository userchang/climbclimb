# 留言板后端部署（Cloudflare Workers + D1）

纯网页操作，本机不用装 wrangler、不用敲命令行。整个过程约 15 分钟。

## 一、建数据库

1. 登录 Cloudflare → 左侧 **Workers & Pages** → **D1**（有的版本在「存储和数据库」下）
2. Create → 名字填 `climbclimb-guestbook` → 建好后点进去
3. 切到 **Console** 标签，把 `schema.sql` 的内容整段粘进去 → Execute

看到 `messages` 表出现就成功了。

## 二、建 Worker

1. **Workers & Pages** → **Create** → **Create Worker** → 名字 `climbclimb-api` → Deploy
2. 部署完点 **Edit code**，把 `worker.js` 的内容**整个覆盖**进去 → 右上角 Deploy
3. 回到 Worker 页面 → **Settings** → **Variables** → **D1 Database Bindings** → Add：
   - Variable name 填 `DB`（必须叫这个，代码里写死了）
   - D1 database 选刚才那个 `climbclimb-guestbook`
   - 再点 Deploy 让它生效

## 三、绑自己的域名（不要用 workers.dev）

`workers.dev` 在国内经常连不上，必须绑到自己的域名上：

Worker → **Settings** → **Domains & Routes**（或 Triggers → Custom Domains）→ Add：
- Domain：`climbclimb.top`（域名必须已经在 Cloudflare 托管，也就是 NS 已经转过去）
- Route 填 `api.climbclimb.top/*`

> 如果域名 DNS 还在阿里云，这里会提示加不了。
> 要么把 NS 转到 Cloudflare（推荐，见 `上线准备清单.md`），
> 要么先用 `xxx.workers.dev` 凑合（国内可能打不开）。

## 四、验收

浏览器直接打开：`https://api.climbclimb.top/api/messages`
应该看到 `{"messages":[]}`（还没有留言就是空数组）。

发一条试试：

```bash
curl -X POST https://api.climbclimb.top/api/messages \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"测试\",\"content\":\"第一条\"}"
```

返回 `{"ok":true}` 就成了，再刷新前面那个地址能看到它。

## 五、前端接上去

前端还没加留言卡片（等你确认版面再动 `index.html`）。到时候就是一段 fetch：

```js
fetch('https://api.climbclimb.top/api/messages')
  .then(r => r.json())
  .then(d => d.messages.forEach(渲染一条));
```

渲染时**必须用 `textContent` 而不是 `innerHTML`**，否则留言内容里的 HTML 会被执行。

## 免费额度参考

| 项 | 免费档 | 留言板够不够 |
|---|---|---|
| Workers 请求 | 10 万次/天 | 一天几百次，绰绰有余 |
| D1 读 | 500 万行/天 | 每次刷留言板读 50 行 |
| D1 写 | 10 万行/天 | 一天发几十条 |
| D1 存储 | 5GB | 一条留言不到 1KB |

不需要绑信用卡，所以不会出现意外账单。
