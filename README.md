# Cloudflare Modular Site

一个可部署到 Cloudflare Workers 的模块化网站骨架。静态前端由 Workers Static Assets 托管，`/api/*` 请求先进入 Worker，适合逐步加入仪表盘、表单、数据查询、AI 功能或后台管理能力。

## 当前站点与维护入口

- 正式网站：`https://neyc.de5.net`；管理后台：`/admin`。
- GitHub 仓库：`larryllr/modular-site`，主分支 `main`。
- Worker：`cloudflare-modular-site`；当前线上代码版本：`3eadcfb6-d652-4e4b-9414-ca409371df0e`。
- 2026-10-14 已按 Cloudflare 当前部署同步本地代码与 GitHub；网站内容独立保存在 KV `SITE_CONFIG` 和 D1 `GAME_DB`，不能用旧配置覆盖远端内容。
- 新维护对话先读 [HANDOFF.md](HANDOFF.md)，再查看 `git status`、最近提交和 Cloudflare 当前部署。
- 本机内容快照及备份位于 `Documents/Codex Website Backups/sync-20261014-website/`，受保护数据不进入公开仓库。

## 2026-10-15 网站重设计与博客公开投稿

- 管理后台和普通用户界面已完成整体重设计，采用新的白色/中性灰视觉系统、响应式布局、移动端导航抽屉、键盘焦点和 reduced-motion 支持。
- 博客现在允许游客免登录投稿：前台通过 `POST /api/blog/articles` 接收署名、标题、分类、标签、封面地址、简介和纯文本正文；服务端会限制长度、转义 HTML、过滤危险封面协议，并把文章标记为 `authorRole: "public"`。
- 管理员可通过博客列表删除文章，接口为 `DELETE /api/admin/blog/articles`；完整管理员可以删除所有文章，limited 管理员不能删除 `admin` 发布的文章。删除使用 `updatedAt` 冲突校验，不通过公开配置写入接口绕过权限。
- 分页面模块编辑器已改为集中式添加：去掉模块之间重复的添加条和新增弹窗，用户只需在页面顶部选择类型；新增模块自动打开编辑，适合连续往分页面里放内容。
- 本轮发布使用的前端 bundle 为 `/site-assets/public/app-QNY4GG3M.js`、`/site-assets/admin/app-A22SJKVK.js` 和 `/site-assets/styles-81e871a51f51.css`。Cloudflare Version ID：`3eadcfb6-d652-4e4b-9414-ca409371df0e`。

## 目录

- `public/`：前端页面、样式和浏览器端功能模块。
- `public/modules/manifest.js`：前端模块注册表。
- `public/modules/*.js`：独立功能模块。
- `src/index.ts`：Cloudflare Worker API 路由。
- `wrangler.jsonc`：Cloudflare 部署配置。

## 本地运行

```bash
npm install
npm install --prefix vendor/cubecity --ignore-scripts --legacy-peer-deps --registry=https://registry.npmmirror.com
npm run dev
```

## 恢复本地内容快照

远端网站内容导出不提交 GitHub。本机维护备份中的 `cloudflare/local-kv-import.json` 可用以下命令恢复到 `.wrangler/state/v3`，图片和 PCK 会按二进制保存并读回校验：

```bash
npm run sync:kv:local -- "备份目录/cloudflare/local-kv-import.json"
```

此工具只使用本地 bindings。恢复前备份已有 `.wrangler/state/v3`；D1 元数据另用 Wrangler 的 `d1 execute GAME_DB --local --file` 从本机 SQL 恢复。图片/PCK 不应使用当前 Wrangler 的 `kv bulk put --local` 导入，因为其 Base64 分支会转成文本。

## 内置游戏

网站内置了 MIT 许可的 [CubeCity](https://github.com/hexianWeb/CubeCity)，访问
`/llrgamecubecity` 可全屏进入游戏。主页和侧边栏默认显示“放松一下”入口，完整管理员
可以在后台隐藏入口，或修改入口标题、说明、背景和图标。
游戏默认使用简体中文和中文城市名，右上角仍可切换英文。

游戏源码固定在 `vendor/cubecity/`，上游版本和本地调整记录在
`vendor/cubecity/UPSTREAM.md`。单独构建游戏：

```bash
npm run build:cubecity
```

## 部署

```bash
npm run deploy
```

部署命令会先执行 Godot 关卡补丁、审计、运行探针和 PCK 导出，然后重建站点 bundle 与 CubeCity，最后发布 Worker 和静态资源。Godot 4.3 可放在 `.codex-cache/godot-bin/`，也可用环境变量 `LLR_GODOT_BIN` 指定可执行文件。只同步已核验一致的线上版本时不必重复部署。

第一次部署会打开 Cloudflare 登录授权。按浏览器提示登录后，Wrangler 会把 Worker 和静态文件发布到 Cloudflare。

后台配置保存在 Cloudflare Workers KV。正式部署前需要创建 KV 命名空间，并把返回的 `id` 填到 `wrangler.jsonc` 的 `kv_namespaces`：

```bash
npm run types
npm run wrangler -- kv namespace create SITE_CONFIG
```

本地开发会使用 Wrangler 的本地 KV 模拟，所以不填 `id` 也可以先预览。

## 管理员后台

- 访问 `/admin` 进入管理员界面。
- 默认管理员密码：`admin`。
- 登录页不会显示默认密码，避免把密码直接暴露在界面上。
- 管理员界面可以直接修改管理员密码，修改后会保存在 Cloudflare KV 中。
- 管理员界面可以新增分页面、修改页面标题和说明、设置网址后缀、控制是否在主页显示入口、为页面勾选系统模块、添加自定义文本模块。
- 管理员界面现在是页面搭建器：内容区顶部直接提供文字、图片、视频、实用工具、网站卡片、导航列表、文章入口、博客和留言区快捷卡片；点击后自动追加到页面底部并展开编辑。模块可复制、上移、下移、删除，复制会生成独立 ID。
- 图片模块支持粘贴图片地址或上传本地图片；可以选择正常图片显示，也可以作为背景图片显示。
- 每个分页面的主页入口卡片可以自定义入口标题、说明、卡片背景、小方块文字和小方块背景。
- 评论模块支持免登录发言，访客可自定义名字；前台会显示评论 IP 和发布时间。管理员可以删除单条评论或清空当前分页面全部评论。
- 评论区既可以作为页面片段插入任意位置，也可以在分页面底部固定展示。
- `/` 是默认主页，会自动显示所有启用分页面的入口。
- 每个分页面通过自己的后缀进入，例如后缀是 `workspace`，访问路径就是 `/workspace`。

## 本地客户端

`client/` 目录提供一个 Electron 桌面客户端，用来补足网页做不到的本机能力：

- 显示同一 Cloudflare 信令房间内的在线设备。
- 声明本机协议和端口，启动本机 `127.0.0.1` TCP/UDP 监听。
- 通过 WebRTC DataChannel 传输文件。
- 通过系统屏幕捕获发起串流。

注意：Cloudflare Worker 负责在线列表和 WebRTC 信令，不会直接转发 TCP/UDP 流量。真正跨 NAT 的端口转发需要客户端双方在线，并继续基于 WebRTC 数据通道实现协议适配；浏览器网页本身无法监听或转发任意本机 TCP/UDP 端口。

客户端构建：

```bash
cd client
npm install
npm run pack
```

安装包会生成在 `client/dist/`。

也可以使用 Cloudflare secret 修改管理员密码。线上运行：

```bash
npm run wrangler -- secret put admin
```

本地开发可以新建 `.dev.vars`：

```bash
admin="你的新密码"
```

不要把真实密码提交到 GitHub；仓库里只保留了 `.dev.vars.example` 作为示例。

## 上传到 GitHub

本机已经安装 GitHub CLI。网络可以访问 GitHub 登录接口后，在项目目录运行：

```bash
gh auth login
gh repo create cloudflare-modular-site --private --source . --remote origin --push
```

如果想公开仓库，把 `--private` 改成 `--public`。

## 添加前端功能模块

1. 在 `public/modules/` 新建一个模块文件，例如 `tasks.js`。
2. 默认导出一个包含 `id`、`name`、`category`、`description`、`mount(ctx)` 的对象。
3. 在 `public/modules/manifest.js` 里添加 loader。

示例：

```js
export default {
  id: "tasks",
  name: "任务",
  category: "workflow",
  description: "任务列表模块",
  defaultEnabled: true,
  mount() {
    const el = document.createElement("section");
    el.className = "module-panel";
    el.innerHTML = "<h2>任务</h2>";
    return el;
  }
};
```

## 添加服务端 API

在 `src/index.ts` 的 `apiRoutes` 中注册新路由即可。路径以 `/api/` 开头时会优先进入 Worker。
