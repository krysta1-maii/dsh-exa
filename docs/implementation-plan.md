# dsh-exa 施工计划

## 1. 项目定位

### 1.1 目标

在当前工作区实现一个独立的 DSH 插件包 `@moguiyu/dsh-exa`，参考现有 `@moguiyu/dsh-tavily` 的 Host/Client 结构，提供：

1. 三个直接暴露给 DSH Agent 的工具：`exa_search`、`exa_search_advanced`、`exa_fetch`。
2. 一个位于 **Plugins 插件管理页面、插件详情区域** 的管理卡片。
3. 多 API key 的新增、查看、替换、删除、显式 reveal，以及启动环境只读状态的展示。
4. 可选的 Team Management service key 配置，以及同一卡片内多个 key 的预算、超预算状态、时间段费用和分项用量展示。
5. 两种 key 使用策略：手动优先级和轮询。
6. 可拖动调整的 key 顺序，并提供上移/下移按钮作为键盘和无拖动环境下的替代操作；用量数据与排序控件位于同一界面。
7. 与 `dsh-tavily` 相同的卸载清理、结构化工具输出和 PTC 兼容能力。

### 1.2 非目标

首版明确不包含：

- Exa Agent / Research / `agent_run`。
- Tavily 风格的 `map`、`crawl` 工具；Exa 的 `subpages` 仅作为高级搜索参数保留。
- 主界面侧栏入口、独立页面或 Chat 卡片。
- 对内置 `web_search` / `web_fetch` 的替换，或对 `ctx.web` provider 的修改。
- 自动停用现有 `mcp-exa`；是否由原生插件替代 MCP 配置由用户另行决定。
- 基于历史用量自动调整 key 顺序。用量用于展示和帮助用户手工排序，不在每次搜索前调用 Admin API，避免增加工具延迟和管理凭据依赖。
- 团队 credit 余额展示。此次官方文档确认了按 key 用量和预算接口，但未确认团队 credit 余额查询端点。
- 将 key 管理操作暴露为 Agent 工具。新增、reveal、替换、删除和排序均由用户在管理卡片中主动执行。

## 2. 已核实的实现依据

- 当前 DSH 版本为 `0.2.1-rc.3`，对应源码锁定提交 `1f81c047fc48fa190a683e469daa699857e9afe8`。
- 当前 `@moguiyu/dsh-tavily@0.3.2` 已验证 `defineTool`、credentials、webServer、systemPrompt 和插件卡片的组合可以在此环境运行。
- Host `tools.register(definition)` 返回工具注销函数；`ToolDefinition` 支持 canonical `output.schema`、`output.render`、`timeoutMs` 和并发安全声明。
- credentials 的 `resolve` 应在每次操作时重新调用；`describe` 返回来源和 `writable`；`set` / `unset` 管理可写存储。
- `systemPrompt.section`、`webServer.register` 和 Client slot 注册均具有可清理的生命周期。
- Client slot `plugins.bundle.config` 是 keyed slot，注册 key 使用包名 `@moguiyu/dsh-exa`。卡片由插件详情页在描述和 rows 之间渲染，props 使用 `view: 'summary' | 'page'`。
- Exa 官方接口：
  - Search：`POST https://api.exa.ai/search`，文档 <https://docs.exa.ai/reference/search>。
  - Contents：`POST https://api.exa.ai/contents`，文档 <https://docs.exa.ai/reference/contents-api-guide-for-coding-agents>。
  - Team Management：`https://admin-api.exa.ai/team-management`，OpenAPI <https://exa.ai/docs/team-management-spec.yaml>。
  - key 列表与预算：`GET /api-keys`，文档 <https://exa.ai/docs/reference/team-management/list-api-keys.md>。
  - 按 key 用量：`GET /api-keys/{id}/usage`，文档 <https://exa.ai/docs/reference/team-management/get-api-key-usage.md>。
- Team Management API 按团队开通，使用从 API keys 页面 Service keys 标签创建的 service account API key。普通搜索 key 不能替代它；service key 与目标 API key 必须属于同一团队。
- 用量接口默认返回最近 30 天的 `total_cost_usd` 和 `cost_breakdown`，支持自定义 `start_date` / `end_date`，最早可查 180 天。key 列表返回 `id`、`name`、`rateLimit`、`budgetCents` 和 `isOverBudget`。

## 3. 包结构与职责

计划采用 plain ESM Host 和预构建 Client，结构如下：

```text
package.json                 包元数据、exports、DSH bundle/client 声明、peer dependencies
cordis.patch.yml             插入 id 为 dsh-exa 的 Host row
src/index.js                 Host 入口，组合工具、管理路由和生命周期
src/tools.js                 三个 defineTool 定义、参数校验、结果投影
src/exa-client.js            Exa HTTP 请求、超时/取消、错误分类、key 故障切换
src/key-manager.js           多 key 与 service key 读写、排序、策略持久化
src/usage.js                 Team Management key 映射、预算和用量查询及缓存
src/backend.js               /api/exa-manager 与 /api/exa-usage 路由及输入校验
src/lib.js                   纯函数：解析、去重、掩码、排序、序列化
src/client.js                Plugins 管理卡片源文件
lib/client.js                构建后的 Client bundle
scripts/build-client.mjs     Client 构建脚本
locale/en.json               英文插件元数据与卡片文本
locale/zh.json               中文插件元数据与卡片文本
icon.svg                     有再分发许可的 Exa 图标或原创图标
test/                        纯函数、HTTP、Host 和策略测试
README.md                    安装、配置、工具参数和策略说明
LICENSE                      项目许可证
THIRD_PARTY_NOTICES.md       第三方图标或代码的 attribution（如适用）
docs/implementation-plan.md  本文档
```

实现时只保留实际需要的模块，避免继续拆分职责重复的文件。`lib/client.js` 是构建产物，发布包必须包含它；本地目录安装时仍要执行构建，不能只更新 `src/client.js`。

## 4. 三个 Agent 工具

### 4.1 共同约定

- 使用 `@deepseek-ai/dsh-tools` 根 export 的 `defineTool`。
- 每次调用重新解析 key；请求携带 `exec.signal`，并叠加工具自己的硬超时。
- 三个工具均声明 `isConcurrencySafe: () => true`。
- 成功结果返回符合 `output.schema` 的 canonical JSON；PTC 直接读取该结构，模型文本由 `output.render` 生成。
- 搜索结果 render 包含可引用的 Markdown URL；高级搜索和 fetch 以 bounded JSON 为主。
- API 返回的 `requestId`、`resolvedSearchType`、`costDollars` 在存在时保留，不把它们解释为账单结算数据。
- 不缓存跨调用的凭据，不记录完整 key、Authorization header 或含 key 的请求数据。
- 默认不请求大段全文；只有调用者显式设置正文参数时才增加内容和费用。

### 4.2 `exa_search`

用途：语义搜索的简单入口。

| 参数 | 规则 |
| --- | --- |
| `query` | 必填非空字符串，工具描述引导使用语义完整的查询 |
| `numResults` | 可选整数，1–20，默认 10 |

行为：固定使用 Exa `type: 'auto'`，默认请求 highlights，不开放高级过滤器。结果保留标题、URL、ID、作者、发布日期、highlights 和分数等实际返回字段。工具超时计划为 30 秒。

### 4.3 `exa_search_advanced`

用途：直接映射 Exa 的高级搜索与内容选项。

| 参数组 | 计划字段 |
| --- | --- |
| 基础 | `query`、`numResults`（1–100，默认 10）、`type`（仅 `auto` / `lite`） |
| 分类与域名 | `category`、`includeDomains`、`excludeDomains` |
| 日期 | `startPublishedDate`、`endPublishedDate`、`startCrawlDate`、`endCrawlDate` |
| 文本与地域 | `includeText`、`excludeText`、`userLocation`、`moderation` |
| 查询扩展 | `additionalQueries` |
| 内容 | `textMaxCharacters`、`contextMaxCharacters` |
| 摘要 | `enableSummary`、`summaryQuery` |
| 高亮 | `enableHighlights`、`highlightsMaxCharacters`、`highlightsQuery` |
| 缓存与实时抓取 | `maxAgeHours`、`livecrawlTimeout` |
| 子页面 | `subpages`、`subpageTarget` |

实现要求：

- 扁平的模型参数在适配层转换为 Exa 的嵌套 `contents` 请求体。
- 按官方文档校验日期、数组、整数和枚举；对 `lite` 不支持的组合在发起请求前给出明确错误。
- 不加入 `deep`、Agent 或已经标记为 legacy 的 `fast` / `instant`。
- 输出按实际响应投影 results、context、requestId、resolvedSearchType 和 costDollars，并限制正文体积。
- 工具超时计划为 60 秒；若实测子页面请求经常超时，再依据结果调整，不预先增加后台任务机制。

### 4.4 `exa_fetch`

用途：读取已知 URL 的正文。

| 参数 | 规则 |
| --- | --- |
| `urls` | 必填数组，至少 1 项；首版最多 20 项，只接受 HTTP/HTTPS 绝对 URL |
| `maxCharacters` | 可选正整数，默认 3000；设置实现层上限，避免单次结果过大 |

请求映射为 `{ urls, text: { maxCharacters } }`。输出保留每页 URL、ID、标题、作者、发布日期、正文及 Exa 实际返回的状态/错误信息；请求级 `requestId` 和 `costDollars` 在存在时保留。工具超时计划为 60 秒。

## 5. 多 key 与调用策略

### 5.1 凭据来源与顺序

- `EXA_API_KEYS`：逗号分隔的有序 key 列表，非空时为权威来源。
- `EXA_API_KEY`：仅在列表为空时作为单 key fallback。
- `EXA_SERVICE_API_KEY`：可选的 Team Management service account key，仅用于 Admin API，不参与三个工具的调用轮换。
- 读取时 trim、去空、按首次出现位置去重。
- 可写环境中保存列表时同步更新 `EXA_API_KEY` 为第一项；若启动环境拥有该变量且不可写，列表保存不受其影响。
- key 顺序只保存在有序 `EXA_API_KEYS` 中，不另存一份顺序，避免两份状态分叉。
- `exa-manager.json` 仅保存策略、保存时间和用量查询所需的 key ID 关联等非 secret 元数据，文件权限计划为 `0600`。

### 5.2 策略定义

| 策略 | 每次调用的起始 key | 故障切换 | 手动顺序的作用 |
| --- | --- | --- | --- |
| `priority`（默认） | 永远从列表第一项开始 | 失败后按列表向后尝试 | 直接表示调用优先级 |
| `round-robin` | 按共享游标从当前列表中轮流选择 | 从起始位置继续向后尝试 | 决定轮询次序 |

共同规则：

1. HTTP 401 和 429 才触发换 key；每个不同 key 在一次工具调用中最多尝试一次。
2. 400、402 及其他非 401/429 响应直接返回错误，不盲目遍历 key。
3. 超时、调用方取消和网络错误不通过更换 key 重试。
4. `round-robin` 在调用开始时快照游标和当前列表，避免并发调用读取到同一个不断变化的位置。
5. 所有 key 均失败时返回汇总错误，不包含 secret。
6. 卡片保存新顺序后，下一次工具调用立即使用新顺序，无需重启。
7. 不根据 `costDollars` 或 Admin API 历史用量自动排序；前者是单次请求估计，后者用于管理卡片展示，手动顺序只能由用户修改。

## 6. Plugins 管理卡片

### 6.1 注册位置

- slot：`plugins.bundle.config`。
- key / id：`@moguiyu/dsh-exa`。
- `summary`：一句插件配置说明。
- `page`：完整管理表单，由 Plugins 页面提供标题、图标和布局容器。
- 不注册 `conversation.*`、主侧栏、独立 panel 或 `shell.overlay`。

### 6.2 管理功能

| 功能 | 交互与约束 |
| --- | --- |
| key 列表 | 显示顺序号、掩码、保存时间、来源和只读状态；默认不显示完整 key |
| service key | 单独配置、替换、reveal 和删除 `EXA_SERVICE_API_KEY`；说明 Admin API 需要按团队开通 |
| 多 key 用量 | 每行显示 Exa key 名称、预算、超预算状态和所选时间段总费用；可展开查看分项 quantity 与 amount |
| 时间范围 | 默认最近 30 天，可设置 start/end；拒绝超过 180 天的起点、反向区间和非法日期 |
| key 关联 | key 字符串与 Admin API 返回 ID 可直接匹配时自动关联；否则由用户从团队 key 列表选择并保存关联 |
| 用量刷新 | 手动刷新并使用短时缓存；单个 key 查询失败只影响该行，不影响搜索工具或其他行 |
| 新增 | 支持单个或逗号/换行分隔的批量输入，服务端 trim、去空、去重 |
| reveal | 用户逐项主动点击后返回完整值；响应 `cache-control: no-store` |
| 替换 | 使用新值替换指定 key，保持原位置 |
| 删除 | 二次确认；删除后按剩余列表重新确定第一项 |
| 拖动排序 | 通过拖动把手调整本地草稿，显示明确的未保存状态 |
| 非拖动排序 | 每行提供上移/下移按钮，支持键盘操作 |
| 保存顺序 | 一次提交完整的有序 key ID 列表；另提供取消以恢复服务端顺序 |
| 策略 | `priority` / `round-robin` 选择框及行为说明 |
| 只读环境 | 禁止修改启动环境提供的 key，并说明应在启动 shell 或凭据文件中调整 |
| 状态反馈 | 显示保存中、成功、冲突和失败原因，不在错误中回显 secret |

拖动过程中不发送连续写请求。用户点击“保存顺序”后才写入凭据，避免一次拖动产生多次持久化，也便于处理失败和取消。

### 6.3 管理路由与共享逻辑

计划使用两个 exact 路由：

- `/api/exa-manager`
  - `GET`：返回普通 key 与 service key 的掩码、稳定本地 ID、顺序、策略、来源、writability 和已保存的 Admin key ID 关联。
  - `POST`：使用明确的 `action` 字段处理 add、reveal、replace、remove、reorder、setStrategy，以及 service key 和用量关联的修改。
- `/api/exa-usage`
  - `GET`：接受可选 `start_date` / `end_date` 和 refresh 参数，返回多个已配置 key 的预算与用量行。
  - 内部先调用 Admin `GET /api-keys`，再按关联 ID 调用 `GET /api-keys/{id}/usage`。默认最近 30 天，不传递文档中明确“无实际作用”的 `group_by`。
  - 采用约 60 秒短缓存并合并相同的进行中查询；缓存键包含 key ID 和时间范围，不跨时间范围复用。

所有管理操作调用 `key-manager.js` / `usage.js` 中的共享实现，路由只负责 HTTP 输入输出。reorder 只接收本地 key ID，不接收完整 key。服务端重新读取当前列表，验证提交 ID 与当前 key 集合完全一致后再保存，防止利用排序请求新增或丢失 key。

用量关联保存“本地 key ID → Exa Admin key ID”，不保存完整 secret。可自动匹配时直接关联；无法匹配的 key 显示“未关联”，由用户在同一个表格行中选择团队 key。Admin 返回 401 时提示检查 service key，403/404 或跨团队失败按行展示，不回退到猜测用量。

除显式 reveal 外，任何响应都不包含完整普通 key 或 service key。UI 与 Host 日志均不得记录 secret。用量未配置或不可用时，key 管理与排序仍然可用。

### 6.4 UI 实现约束

- 使用 Host 提供的 React 和 `ctx.slots.inject/register`，不加载另一份 React，不直接 import Harness Client primitives。
- 控件、间距、颜色和字体沿用 Plugins 页面风格，颜色只使用 `--dsw-alias-*` theme tokens。
- 可见文本通过 Client locale 服务注册，至少提供英文和中文。
- 拖动使用浏览器事件和组件状态，首版不引入大型拖拽依赖。
- 卡片卸载时清理注册和事件资源；不修改组件外部 DOM。

## 7. Host 与生命周期

Host 入口声明所需的 `tools`、`webServer`、`credentials`、`systemPrompt` 服务。实现时按实际使用情况决定硬依赖与 `ctx.get` 可选读取，保持目标 Web profile 可加载。

所有注册纳入 owning fiber：

- 三个工具及统一 disposer。
- 管理 HTTP 路由。
- system prompt section。
- Client slot 和 locale 注册。

禁用或卸载插件后，上述能力应全部消失；重复卸载不抛错。系统提示只保留一段简短的工具路由和引用说明，参数规则放在各工具 schema 中，避免重复维护。

## 8. 测试计划

### 8.1 纯函数与单元测试

- 三个工具的参数归一化、边界值、非法 URL 和 `lite` 不支持参数组合。
- Search/Contents 请求体映射，尤其是嵌套 `contents`。
- 响应投影与 output schema 校验，包括可选字段和错误状态。
- key 列表解析、去重、掩码、序列化、首 key 同步。
- `priority` 的固定起始顺序和 `round-robin` 的游标行为。
- 401/429 故障切换、每个 key 最多一次、全部失败、非轮换错误和取消。
- 并发调用下的起始 key 快照。
- reorder 的 ID 集合校验和只读凭据拒绝路径。
- Admin key 列表、预算字段、零用量、费用分项和时间范围的响应映射。
- 自动/手工 key ID 关联、跨团队失败、无 service key、Admin 401/403/404 和部分行失败。
- 用量缓存隔离、refresh 绕过缓存，以及普通搜索 key 与 service key 不混用。

网络测试使用 mock fetch，不依赖真实 Exa 额度或 Team Management 权限。

### 8.2 Host 集成测试

- 在 DSH `0.2.1-rc.3` 目标组合中加载 bundle。
- 通过 Cordis Inspect 确认恰好注册 `exa_search`、`exa_search_advanced`、`exa_fetch` 三个工具。
- 分别以 native 和 PTC 路径调用 mock 后端，核对 canonical value 与 render 内容。
- 验证内置 `web_search` 的 schema 和 provider 未改变。
- 卸载/重载后工具、路由和 prompt 无残留或重复注册。

### 8.3 卡片与浏览器验收

- 卡片只出现在 Plugins → `@moguiyu/dsh-exa` 详情页，主界面侧栏无新增入口。
- 新增、reveal、替换、删除和策略保存后重新加载仍正确。
- 配置有效 service key 后，同一表格展示多个 key 的预算、超预算状态和时间段用量；未配置时显示设置提示而不遮挡排序功能。
- 修改时间范围、展开分项用量、手动关联 key 和刷新用量均正确；单 key 失败不阻塞其他行。
- 用量刷新不会改变 key 顺序；拖动与上移/下移得到相同顺序，保存前刷新不改变服务端顺序，保存后刷新保持新顺序。
- 顺序保存后，下一次 API 调用按所选策略使用新顺序。
- 启动环境只读 key 的修改控件正确禁用并显示原因。
- 中文/英文、亮色/暗色、窄宽布局和长掩码下无溢出。
- 浏览器控制台无 slot entry crash；网络与日志中不出现非预期完整 key。

### 8.4 真实 API smoke test

真实 Search/Contents API 测试可能产生费用，与 mock 测试分开执行。仅在已有可用 key 且实施阶段确认可以调用时，以最小 `numResults` 和 `maxCharacters` 各执行一次 search 与 fetch，记录实际响应兼容性；没有 key 时明确报告未执行，不用其他工具的测试结果替代。

Team Management smoke test 仅使用 GET，不创建、修改或删除远程 key。仅在用户已配置有权限的 service key 时验证 key 列表和一个用量请求；未开通该功能或没有 service key 时，以官方 schema 和 mock 测试为准并明确报告未做真实 Admin API 验证。

## 9. 实施顺序

| 阶段 | 工作内容 | 完成标准 |
| --- | --- | --- |
| 1. 包骨架 | manifest、patch、locale、图标、构建脚本、README 基础 | 包可被识别，元数据和发布文件完整 |
| 2. Exa 适配与工具 | HTTP client、三个工具、输出 schema、单元测试 | mock 环境下三个工具可执行，取消和错误路径通过 |
| 3. key 与用量管理 | credentials 读写、两种策略、Admin 适配、key 关联、管理路由和测试 | 顺序和策略在下一次调用生效，多 key 用量可按行返回，只读行为正确 |
| 4. 管理卡片 | slot、管理表单、预算/用量表格、时间范围、拖动/按钮排序、中英文 | 插件详情页可在同一界面查看多 key 用量并完成全部管理操作 |
| 5. 安装与验收 | 构建、安装、Inspect、native/PTC、浏览器和卸载检查 | 满足第 10 节验收条件，记录未验证事项 |

每一阶段先交付可运行的小闭环，再进入下一阶段；不提前加入 Agent、后台任务、团队余额推算、用量自动排序或自动禁用 MCP 等扩展。

## 10. 首版验收条件

1. DSH 中可见且仅可见三个新增 Exa 工具，不包含 Agent 工具。
2. search、高级 search、fetch 分别正确调用 Exa `/search` 与 `/contents`，canonical JSON 通过 schema 校验。
3. 内置 web 工具和现有 MCP Exa 配置不被修改。
4. 多 key 的增删改查、显式 reveal 和只读环境行为符合设计，日志不泄露 secret。
5. `priority` 与 `round-robin` 行为有自动化测试，401/429 按规则切换。
6. 配置有权限的 service key 后，用户可在同一界面看到多个 key 的预算、超预算状态和时间段用量；无权限或未配置时降级为明确提示。
7. 用户可在 Plugins 详情页通过拖动或按钮调整顺序；保存、刷新和下一次调用均保持该顺序，用量刷新不会自动改变顺序。
8. 卡片不在主界面侧栏创建入口，插件卸载后无工具、路由、prompt、缓存任务或 slot 残留。
9. README 记录安装、参数、策略、service key 权限、key 关联、只读限制和真实 API 验证结果。

## 11. 风险与处理

| 风险 | 处理方式 |
| --- | --- |
| Exa API 参数或响应继续演进 | 将 API 映射集中在适配层，以官方文档和真实 smoke response 校准，不把 MCP 文本当作 canonical schema |
| 与现有 MCP Exa 工具重复 | 首版共存并完成验证；是否停用 `mcp-exa` 由用户后续决定 |
| 多 key 并发轮换产生不确定顺序 | 快照每次调用的起始位置，并用自动化测试固定策略语义 |
| 拖动误触发多次写入 | 本地草稿、显式保存、服务端 key 集合校验 |
| 环境变量不可写 | 通过 `describe().writable` 驱动 UI 和 Host 双重拒绝，不在写入后才发现部分成功 |
| Team Management 未开通或 service key 无权限 | 用量区域显示配置/权限说明，普通工具、key 管理和手动排序继续工作 |
| 本地 key 无法自动匹配 Admin key ID | 提供显式关联选择并持久化非 secret 映射，不按名称猜测 |
| 用量时间范围与预算周期不同 | 并列展示时间段费用和当前预算状态，不用默认 30 天费用推算预算剩余或团队余额 |
| 多 key Admin 查询造成延迟或部分失败 | 短缓存、进行中查询合并、按行错误和手动刷新，不让用量查询阻塞工具调用 |
| 浏览器验证能力受限 | 使用已连接的 Harness 页面；无法执行视觉验收时如实记录，不用静态 mock 页面替代 |
