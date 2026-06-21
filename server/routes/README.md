# 服务路由拆分计划

`ui-server.mjs` 继续作为当前稳定启动入口。本轮不进行大规模后端重写，只为后续按业务边界拆分预留目录。

计划模块：

- `project-routes.js`
- `collector-routes.js`
- `transcript-routes.js`
- `rewrite-routes.js`
- `tts-routes.js`
- `director-routes.js`
- `assets-routes.js`
- `video-output-routes.js`
- `settings-routes.js`

拆分时每个模块只注册自己的 HTTP 路由，继续复用现有 service、SQLite、Provider Router 和统一错误响应。完成单个模块迁移并通过回归检查后，再从 `ui-server.mjs` 移除对应内联路由。
