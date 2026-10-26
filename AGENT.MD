# AGENT.MD — 项目持久文档

## 项目描述
Rank Analysis：基于 Riot 官方 LCU API 的英雄联盟排位助手（Tauri 2 桌面应用），核心是数据驱动的 AI 对局复盘——把每局量化（KDA、伤害/承伤占比、参团率、经济、阵容）后流式喂给大模型，给出胜负归因。

## 背景
- 仓库 `wnzzer/rank-analysis`，MIT 协议，AI 辅助维护。
- 安装包目标 ~5MB：Rust release 用 `opt-level="z"` + LTO + strip；`crate-type` 只留 rlib。
- 不注入 DLL、不读游戏内存，只调 LCU 本地 API；当前仅支持腾讯服务器。
- 平台：Windows（NSIS 安装包）+ macOS Apple Silicon（DMG，ad-hoc 签名未公证）。免 WeGame 启动与管理员重启两项为 Windows 独有。

## 要求
- 技术栈：Tauri 2 + Rust（tokio 异步、reqwest、tokio-tungstenite 连 LCU WebSocket）+ Vue 3 `<script setup>` + TypeScript + Vite + Pinia + vue-router(hash)。
- UI 库为 **naive-ui**（main.ts `app.use(naive)`，devDependencies 含 naive-ui）——注意：全局默认指令要求 Element Plus，但本项目既有代码全部基于 naive-ui；改前端时以项目现状为准，避免混用两套组件库。
- 质量门禁：`cd rank-analysis-app && npm run check`（prettier + eslint + vue-tsc + cargo fmt --check + clippy -Dwarnings，与 CI `.github/workflows/quality-checks.yml` 一致）；测试 `npm run test`（vitest）+ `cd src-tauri && cargo test`。
- 注释规范见 `CLAUDE.md`（TS 用 JSDoc，Rust 用 RustDoc）；命名：Vue 组件 PascalCase、TS 文件 camelCase、Rust 文件 snake_case、测试 `*.spec.ts` / `*_tests.rs`。
- Git 提交：`<type>: <description>`，type ∈ feat/fix/refactor/docs/test/chore；commit 流程见 `.claude/skills/shipping-changes/SKILL.md`。

## 结构
```
rank-analysis-app/
├── src/                      # 前端 (Vue3 + TS)
│   ├── main.ts / boot.ts     # 启动：prepareBoot(平台/主题/缩放) → pinia init → mount
│   ├── router/index.ts       # 路由（hash）；meta.offlineCapable 标记不依赖 LCU 的页面
│   ├── views/                # Record 战绩 / Gaming 对局分析 / Champions 英雄榜 /
│   │                         # MatchDetail 详情(独立窗口) / Loading / Settings(+子页) / IntelDemo
│   ├── components/           # record/ gaming/ automation/ champions/ tags/ common/ + Framework/Header/SideNavigation
│   ├── composables/          # useGameState(连接监听) useMatchAIAnalysis useTheme 等
│   ├── pinia/                # setting / playerNotes / cloudSync
│   ├── services/             # ai/（AI 核心流水线：matchDetail 归因+批判、matchSearch、tagSuggest、
│   │                         #   prompts、stream 流式、modelConfig）等
│   └── types/
└── src-tauri/src/            # 后端 (Rust)
    ├── main.rs               # 提权辅助模式 → 迁移 → logger/Sentry → Tauri 启动
    ├── lib.rs                # 模块声明
    ├── lcu/                  # LCU 客户端：api/（summoner、match_history、champion_select、
    │                         #   session、sgp…）+ listener(WebSocket) + util/token(令牌获取)
    ├── command/              # Tauri commands：ai、bp、bp_suggest、cloud_sync、rank、
    │                         #   match_history、launcher、portable_update、sgp、rune_page…
    ├── automation.rs         # 自动接受/秒选任务管理
    ├── bp_decision/ + rule_engine.rs   # 规则化 BP 决策引擎
    ├── game_state_monitor.rs # 对局状态心跳监控（≤10s）
    ├── ai_config.rs / config.rs / paths.rs / migrate.rs / observability.rs(Sentry opt-in)
    ├── fandom/ + cn_patch_notes.rs     # Fandom 数据与国服补丁说明
    └── opgg/                 # OP.GG 快照（英雄榜数据源）
```

## 记忆
- UI 库是 naive-ui 而非 Element Plus（历史选择）；如需前端新页面，先确认是否沿用 naive-ui。
- 体积优先是硬约束：新增 Rust 依赖时注意 feature 裁剪（参考 Cargo.toml 中 sevenz-rust2 的注释写法）。
- LCU 页面断连时会被 useGameState 弹回 Loading（≤10s 心跳）；新页面若不依赖 LCU 必须声明 `meta.offlineCapable`（踩坑 #168）。
- 迁移 `migrate_legacy_data()` 必须在 config/observability 初始化之前跑，否则老用户数据被空数据挤掉。
- 错误上报 Sentry 默认关闭、用户 opt-in；日志转发前经 `scrub_log` 脱敏（LCU 令牌/puuid 不外传）。

## 进度
- 2026-10-26:初次学习了解项目全貌（README、CLAUDE.md、package.json/Cargo.toml、前后端目录、路由、main 入口、tauri.conf.json），创建本 AGENT.MD。
- 2026-10-26:梳理 AI 调用链（services/ai → command/ai.rs）并交付「替换内置 LLM API」改造方案；随后实现 custom provider：Rust `Provider::Custom`（OpenAI 兼容端点，`base_url` 自动补全 `/chat/completions`，不带 `enable_thinking`，超时放宽 600s/首字 120s 适配本地推理）+ 前端 `customBaseUrl`/`customApiKey`/`customModel` 三个配置键 + 设置页第三张「自定义」卡片 + stream.ts/modelConfig.ts 路由（getSelectedProvider 导出）。vitest 528 全过、typecheck/lint/prettier 全绿；本机无 cargo，cargo test/clippy 待有 Rust 工具链的环境补跑。
- 2026-10-26:盘点打包环境：缺 Rust 工具链（rustup stable-msvc）与 MSVC Build Tools（link.exe），WebView2 运行时已装、Node/前端依赖/@tauri-apps/cli 就绪；bundle 目标仅 nsis 且 createUpdaterArtifacts=true，打包前需配置 TAURI_SIGNING_PRIVATE_KEY。安装命令与后续验证步骤见当日会话结论。
