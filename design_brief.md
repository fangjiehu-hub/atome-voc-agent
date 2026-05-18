# Atome VoC Early Warning Agent — Design Brief

> 这是一份给 claude.ai/design 用的项目简报。粘贴到对话开头，让 Claude 在有完整上下文的前提下帮你做设计。本地实现仍在终端 Claude Code 里做。
>
> Last updated: 2026-05-17 by fangjie

---

## TL;DR（30 秒读懂）

Atome 是东南亚 BNPL（先买后付）平台。这个 agent 自动监听社交媒体（Twitter / Reddit / FB / Google Play / App Store）上对 Atome 的负面评论和投诉，分类、聚类、按严重度推送告警给对应团队，**取代客服现在每天手动巡场各平台的工作**。

仓库已交接，核心 pipeline 跑通了：Reddit + Twitter 爬取 → Claude Sonnet 标注分类 → 规则引擎覆盖严重度 → 按类别+平台聚类成 incident → 发 Slack/Lark/Email 告警。但 PRD 10 项功能里只有 1 项做完，剩下 9 项部分实现。**现在要做：UI 重设计 + 后端架构重构 + 产品功能补齐**。

---

## 1. 当前系统（30 秒架构图）

```
                    ┌────────────────────────────────────────┐
                    │   APScheduler (cron at 8am/8pm PHT)    │
                    └────────────────┬───────────────────────┘
                                     │
                ┌────────────────────┼────────────────────┐
                ▼                    ▼                    ▼
        ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
        │ Reddit crawl │    │ Twitter crawl│    │  (FB/Play/App│
        │ Apify→Brave→ │    │ Apify→Brave  │    │   Store 未做)│
        │ Reddit API   │    │              │    └──────────────┘
        └──────┬───────┘    └──────┬───────┘
               │                   │
               └─────────┬─────────┘
                         ▼
              ┌──────────────────────┐
              │   posts 表 (upsert) │
              │   ON CONFLICT skip   │
              └──────────┬───────────┘
                         ▼
              ┌──────────────────────┐
              │ Claude Sonnet 4 标注 │ ← 批量 8 条/次
              │ category/severity/   │
              │ is_negative/summary  │
              └──────────┬───────────┘
                         ▼
              ┌──────────────────────┐
              │ 规则引擎覆盖严重度    │
              │ (9 条规则: 阈值+类别) │
              └──────────┬───────────┘
                         ▼
              ┌──────────────────────┐
              │ 聚类: (category +    │
              │  platform) 精确匹配  │ ← 不是语义聚类
              │ → incident           │
              └──────────┬───────────┘
                         ▼
              ┌──────────────────────┐
              │ 路由表查 channel +   │
              │ 收件人 → 推 Slack /  │
              │ Lark / Email         │
              └──────────────────────┘
```

**技术栈：**
- Backend: FastAPI + SQLAlchemy(async) + PostgreSQL + APScheduler + Alembic
- Frontend: Next.js 14 + TailwindCSS + TypeScript
- LLM: `claude-sonnet-4-20250514` via Anthropic SDK
- Crawlers: Apify (主) + Brave Search (兜底)
- Deploy: Docker Compose (本地) + Fly.io (生产，待重建)

---

## 2. 真实数据样本（让 design 不脱离实际）

刚跑了一轮 7 天爬虫，捞了 22 条 Reddit post，分类结果：

| Category | Count | % |
|---|---|---|
| not_negative（一般提及） | 13 | 59.1% |
| debt_collection（催收） | 5 | 22.7% |
| fraud（诈骗） | 2 | 9.1% |
| spend_limit（额度） | 1 | 4.5% |
| transaction（交易） | 1 | 4.5% |

聚类出 4 个 incidents，最严重的一个是 **INC-2026-0516-01：[REDDIT] Debt Collection Complaints (5 posts)**，标题摘要：

> 22-year-old student concerned about Atome home visits and contact access for overdue payments

→ 严重度自动 escalate 到 `high`（因为 debt_collection 是高风险类别 + 5 条聚类）。

**实际投诉关键词**（让 UI 设计有真实文案感）：
- "home visits"（催收家访）
- "contact access for overdue"（访问通讯录）
- "harassment threatening calls"
- "unauthorized transaction"
- "refund delayed merchant dispute"
- "interest rate hidden fees"

---

## 3. 代码地图（仓库结构）

```
atome-voc-agent/
├── backend/
│   ├── api/                      ← 35 个 endpoint，10 个 router
│   │   ├── analytics.py          ← overview/trend/categories/channels/severity/drilldown
│   │   ├── incidents.py          ← CRUD + 状态流转
│   │   ├── alerts.py             ← 列表 + acknowledge
│   │   ├── crawler.py            ← 手动触发爬虫/重聚类/重告警
│   │   ├── taxonomy.py           ← 类别 + sub-issue CRUD
│   │   ├── routing.py            ← 路由规则 CRUD
│   │   ├── lark_bots.py          ← Lark webhook 配置
│   │   ├── feedback.py           ← 人工反馈记录
│   │   ├── monitor.py            ← post 查询 + 批量保存
│   │   └── auth.py               ← JWT 登录（GET /me 还是 stub）
│   ├── services/
│   │   ├── crawler_reddit.py     ← Apify→Brave→Reddit API 兜底链
│   │   ├── crawler_twitter.py    ← Apify→Brave
│   │   ├── llm_annotator.py      ← 批量 Claude 标注（8 条/批）
│   │   ├── llm_prompts.py        ← SYSTEM_PROMPT + 用户模板
│   │   ├── severity_calculator.py ← 9 条规则覆盖 LLM 给的 severity
│   │   ├── clustering.py         ← (category, platform) 精确聚类
│   │   ├── alerting.py           ← Slack / Lark / Email 分发
│   │   └── dedup.py              ← 内容去重 + 噪音账号过滤
│   ├── models/                   ← 8 张表
│   └── main.py                   ← FastAPI 入口 + APScheduler
├── frontend/src/app/
│   ├── overview/                 ← KPI 卡 + 趋势图 + incident 表
│   ├── incidents/                ← 列表 + 详情
│   ├── alerts/                   ← 列表 + ack
│   ├── feedback/                 ← 人工修正
│   ├── taxonomy/                 ← 类别管理
│   ├── routing/                  ← 路由规则
│   ├── settings/                 ← 爬虫触发 + Lark bot 管理
│   ├── methodology/              ← 静态方法论介绍
│   └── analytics/                ← 趋势/类别/严重度图表
└── scripts/                      ← 种子数据脚本
```

**数据库表：**
- `users`, `posts` (23 列), `incidents` (15 列), `alerts` (14 列)
- `feedback`, `taxonomy_categories`, `taxonomy_sub_issues`
- `routing_rules`, `lark_bots`

---

## 4. PRD vs 现状 — 差距清单（设计要补齐的部分）

| 功能模块 | 现状 | 缺什么 |
|---|---|---|
| **FR1 数据源** | Twitter + Reddit 跑通 | Facebook / Google Play / App Store / Forums 没做；关键词写死在 .py 文件里不可配；硬编码 PH 单市场 |
| **FR2 相关性过滤** | 基础去重 + 品牌提及检测 | 无置信度评分；无误报队列；无"标记为不相关"的工作流 |
| **FR3 情感/投诉识别** | 二值 is_negative + LLM 分类 | 无连续情感分；无显式"声誉风险/监管敏感"flag |
| **FR4 类别分类** | 11 类已落地，CRUD 完整 ✅ | 无版本号；多标签部分支持（category 单值，sub_issues 数组） |
| **FR5 严重度** | 5 级 + 9 条规则 | PRD 要 10 个维度加权组合，现在只用了 5 个；无 explainability 字段写回 |
| **FR6 聚类** | 按 (category, platform) 精确匹配 | 不是语义聚类（PRD 要 embedding）；无截图重复检测；单市场 |
| **FR7 告警/路由** | Slack + Lark 跑通 | Email 未配 SMTP；无 WhatsApp；无 dashboard 内通知；无周报；告警体里没"为什么标红""建议下一步" |
| **FR8 案件管理** | 状态流转 + 详情页完整 | 无 due date / 内部 notes / 升级历史 / JIRA 联动 |
| **FR9 人工反馈闭环** | 反馈 API 存在 | 无"标记误报"按钮；无 merge/split 聚类；反馈未回灌给模型 |
| **FR10 报表** | KPI / 趋势 / 类别 / 渠道 dashboard | 无周报 / 月度根因报告；无 time-to-ack / time-to-resolve 指标 |

---

## 5. 三条设计 track（在 claude.ai/design 里要产出的东西）

### Track A — UI/UX 重设计

**现状痛点**（基于代码 review，不是用户测试）：
- Topbar 上的过滤按钮是死的（[Topbar.tsx](frontend/src/components/Topbar.tsx)），不工作
- `IncidentCard` 组件定义了但没人用
- 所有页面没有"empty state" 设计（首次跑时全是 0）
- 没有 dark mode（公司 brand guideline 默认浅色，但夜班 ops 团队可能想要）
- 没有手机端 responsive（CS team 在外面可能想用手机看告警）

**要设计的页面/组件：**
1. **Overview 重设计**：KPI 卡 + 趋势图 + 严重 incident 列表的"指挥中心"视角
2. **Incident 详情页**：左主体（事件总结 + 时间线 + 相关 posts），右栏（路由、负责人、SLA 倒计时、操作按钮）
3. **Alert 中心**：未确认告警的瀑布流，按严重度分组
4. **Settings 重设计**：当前只有爬虫触发 + Lark bot；要加：关键词管理、严重度规则可视化编辑、市场切换器
5. **新增页面：Feedback 工作台**（标记误报、merge/split、改 category）
6. **新增页面：Reports**（周报、月报、跨市场对比）

**设计约束：**
- 必须用 TailwindCSS（不能引新 UI 框架，CLAUDE.md 规定）
- 必须用 React 18 函数式组件 + Zustand 状态管理
- 配色参考 AIG 品牌规范（如果 design 工具能查 anthropic-skills:aig-brand-guidelines 更好）

**给 design 的具体任务示例：**
- "画一张 Incident 详情页的 mockup，包含 SLA 倒计时、操作按钮、相关 post 的时间线"
- "设计一个'误报标记'的交互流：用户点'这条不是投诉'→ 弹什么 → 数据怎么流"
- "做一个 dark mode + light mode 配色对照图"

---

### Track B — 后端架构 / 数据模型重构

**现状痛点：**
- `brand="atome_ph"` 硬编码在 ~12 处（models、crawler keywords、API filters、frontend），无法支持多市场
- 严重度计算是 9 条规则链取 max，不是 PRD 要的"10 维度加权公式"
- 聚类按 `(category, platform)` 精确匹配，重复投诉用不同词描述就分到不同 incident
- 关键词列表写死在 `crawler_*.py` 里，运营改一个词要发版
- 静默异常：crawler 失败只 `logger.exception()` 然后继续，dashboard 不知道
- `GET /api/auth/me` 还是 `pass` 的 stub

**要设计的架构：**

1. **多市场数据模型**
   - 现状：`posts.brand = "atome_ph"` 单值
   - 设计：抽出 `markets` 表（PH/SG/ID/MY），所有相关表加 `market_id` 外键
   - 影响范围：posts / incidents / alerts / routing_rules / taxonomy / 前端筛选器
   - **要 design 出 ER 图 + 迁移路径**

2. **加权严重度公式**
   - 现状：if-elif 链取 max
   - PRD 要求 10 维度：sentiment、topic sensitivity、user impact、virality、recurrence、market sensitivity、regulatory exposure、executive sensitivity、trend acceleration、credibility
   - 设计：每维度 0–1 评分 → 可配置权重向量 → 加权求和映射到 5 级
   - **要 design 出公式 + 权重默认值 + 可调参数 UI**

3. **语义聚类**
   - 现状：精确匹配
   - 设计：用 embedding（sentence-transformers 或 Claude embedding）→ 相似度阈值聚类
   - 难点：embedding 服务怎么部署？阈值怎么调？老数据怎么回填？
   - **要 design 出方案选型 + 性能/成本估算**

4. **关键词配置化**
   - 现状：硬编码 list
   - 设计：搬到 DB（`monitoring_keywords` 表）+ CRUD API + Settings 页编辑器
   - 同时支持精确、模糊、正则三种匹配模式

5. **可观测性**
   - 设计 crawl/annotate/cluster 的 metrics + 错误率 dashboard
   - 集成 Sentry 或类似工具（待选）

**给 design 的具体任务示例：**
- "画一张多市场支持的 ER 图，标出哪些表加 market_id"
- "设计 10 维度严重度公式的具体计算示意（含一个真实 post 的算例）"
- "对比 sentence-transformers 自托管 vs Cohere/OpenAI embedding API 的成本和延迟"

---

### Track C — 产品功能 / PRD 补齐

**要设计的产品能力：**

1. **JIRA 联动**：incident → 一键创建 JIRA ticket（CS team 跟单工具是 JIRA）
   - 设计：双向同步还是单向？字段映射？状态回写？

2. **SLA 与 due date**：critical 4h ack / 24h resolve；high 12h / 72h（等等）
   - 设计：SLA 表 + 超时升级机制 + dashboard 红绿灯指标

3. **周报 / 月报自动生成**
   - 设计：模板 + 数据查询 + Lark/Email 分发；要 design 出报表 layout

4. **反馈闭环**
   - 设计：误报标记 → 训练样本累积 → 定期 prompt 调优；merge/split 聚类的 UX

5. **WhatsApp 告警**（PRD 列了但没做）
   - 设计：是否值得做？走哪家 API（Twilio / WhatsApp Business）？

6. **多市场扩展产品形态**
   - 同一 dashboard 看 4 个市场 vs 每市场独立 dashboard？
   - 跨市场对比报表怎么设计？

7. **角色与权限**
   - 现在 role 字段在 users 表里但没用到
   - 设计：viewer / analyst / admin 三级，各自能看/改什么

**给 design 的具体任务示例：**
- "设计 incident → JIRA 同步的 user flow（含错误处理）"
- "画 SLA 倒计时组件的 UI + 告警升级规则"
- "设计周报的内容结构和 Lark 推送格式"

---

## 6. 约束 / 不能改的部分

- **技术栈固定**：TypeScript + React 18 + TailwindCSS + Zustand + FastAPI + PostgreSQL（CLAUDE.md 强制）
- **LLM 厂商**：Anthropic Claude（不允许换 OpenAI / 自研）
- **部署平台**：Fly.io（已选定）
- **预算导向**：Apify 免费 $5/月 + Brave Free + Anthropic API 按量
- **市场**：先做 PH/SG/ID/MY 四个，不考虑越南/泰国

---

## 7. 当前公开问题（design 决策时要考虑）

1. **Embedding 服务**：自托管（sentence-transformers + GPU 容器）vs API（Cohere / OpenAI / Voyage）？成本和延迟权衡？
2. **多市场 UI 形态**：单一 dashboard 含市场筛选器 vs 每市场独立子站？
3. **角色权限粒度**：3 级是否足够？要不要加"按市场授权"？
4. **告警重复抑制**：同一 incident 短时间内多次升级要不要合并通知？
5. **数据保留期**：post 表无限增长，要不要 6 个月归档策略？

---

## 8. 期望 claude.ai/design 产出的交付物

针对三条 track 分别期望：

**Track A — UI/UX：**
- [ ] 6 个核心页面的高保真 mockup（Overview / Incident 详情 / Alert 中心 / Feedback 工作台 / Settings / Reports）
- [ ] 组件库规范（按钮、卡片、状态徽章、严重度色阶）
- [ ] 关键交互的 flow 图（标误报、merge incident、SLA 升级、市场切换）
- [ ] dark mode 配色对照

**Track B — 架构：**
- [ ] 多市场数据模型 ER 图 + 迁移 SQL 示意
- [ ] 10 维度严重度公式定义 + 权重默认值 + 算例
- [ ] 语义聚类技术选型 decision doc
- [ ] 关键词配置化的 schema + CRUD API 设计
- [ ] 可观测性方案（Sentry / Datadog / 内置 metrics 表三选一）

**Track C — 产品：**
- [ ] JIRA 联动 user flow + 字段映射表
- [ ] SLA 规则表 + 升级机制设计
- [ ] 周报/月报内容模板
- [ ] 反馈闭环工作流图
- [ ] 角色权限矩阵

---

## 9. 工作流（design ↔ 实现）

```
claude.ai/design                  此处 (Claude Code 终端)
─────────────                     ──────────────────────
1. 粘贴本简报开聊                  ← 持续接收 design 决策
2. 推进 Track A/B/C
3. 产出 mockup / 方案
4. 你 review / 提反馈
5. design 定稿                    →  6. 终端 Claude Code 接 spec
                                      改代码 + 跑测试 + commit
                                      → 把"已实现"反馈回 design
```

**约定：**
- 设计决策落在文档里（推荐写成 `docs/decisions/NNN-题目.md`，ADR 风格）
- 大改前先在 design 出方案，避免边写边返工
- 每个 PR commit message 引用对应 ADR 编号

---

## 10. 给 design 的开场提示

粘贴本文件后，第一句话可以这样问 design：

> 我刚把这份简报粘进来了，包含 Atome VoC agent 的现状、差距、和我要在 UI/架构/产品三个方向上设计的范围。
> 你先帮我梳理：基于这份简报，**这三条 track 应该按什么顺序推进？** 哪条的"高 ROI、低风险"开局能马上看到价值？
> 给一份 2 周的设计 sprint plan，包含每天产出什么交付物。
