# dsh-exa 0.4.0：Host / Preset 分离架构升级施工计划

> 状态：阶段 A、B、C、E 已实施；阶段 D 的组合级检查已完成，运行进程验收待重启  
> 编写日期：2026-11-02  
> 当前版本：dsh-exa 0.3.1  
> 目标版本：dsh-exa 0.4.0  
> DSH 基线：0.2.1-rc.5  
> 目标环境：web profile  
> 默认目标 preset：standard-instant、ptc-instant、cordis-ptc

## 1. 背景与问题定义

dsh-exa 0.3.1 通过 bundle 的 cordis.patch.yml 在 Host 层插入一个 dsh-exa 行。src/index.js 无条件调用 installTools 与 installBackend，使同一个插件实例同时承担：

- 注册 exa_search、exa_search_advanced、exa_fetch 三个 Agent 工具；
- 注册 tool:exa 系统提示；
- 注册 /api/exa-manager 精确路由；
- 作为 dsh.client 浏览器管理卡片的 Host Loader 载体。

Host 全局工具会被 web profile 下所有 preset 继承，包括 minimal。升级目标是把模型能力限定到明确选择的 preset，同时保留 Plugins 页中的密钥和路由管理卡片。

调查确认，不能把现有根入口直接移入 preset：多个 standing preset 会同时激活，重复注册 /api/exa-manager 会使后续 preset 挂载失败；Client 模块发现只扫描 Host Loader，删除 Host 行还会导致管理卡片消失。

## 2. 升级目标

本次升级完成后，应同时满足以下条件：

1. 仍然只发布、安装和维护一个 dsh-exa 插件包。
2. 包根入口只承担 Host 管理面：/api/exa-manager 与 Client 卡片载体。
3. 新增 dsh-exa/tools 子路径入口，只承担三个工具和 tool:exa 系统提示。
4. standard-instant、ptc-instant、cordis-ptc 显式引用 dsh-exa/tools。
5. minimal、chat-assistant、官方 standard/ptc/cordis 及其他未配置 preset 不再继承 Exa 工具。
6. Plugins → dsh-exa 卡片和 /api/exa-manager 保持可用，路由在 Host 中只注册一次。
7. 三个工具的参数、canonical output、render、错误映射、凭据读取和 Exa HTTP 行为保持不变。
8. 内置 web_search、web_fetch 和 ctx.web 不受影响。
9. 卸载、禁用、重载和版本回滚步骤有明确顺序，不留下导致 preset broken 的引用。

## 3. 非目标

本次不做以下扩展：

- 不修改 @moguiyu/dsh-tavily；
- 不新增或删除 Exa 工具，不改变工具名称和 schema；
- 不引入 per-preset API key、策略或状态文件；
- 不追求跨 preset 的全局 round-robin 游标；
- 不实现 Plugins 页的一键 preset 安装器；
- 不让 bundle 自动修改任意 preset 的 config.plugins；
- 不新增 Host 服务、RPC 桥或凭据转发层；
- 不承诺 preset 内运行的插件模块的热重载；
- 未获得费用许可时，不调用真实 Exa Search/Contents API。

## 4. 已确定的架构决策

### 4.1 单包双入口

采用一个包、两个按运行位置分离的入口：

| 入口 | 运行位置 | 职责 |
| --- | --- | --- |
| dsh-exa | Host Loader | 管理路由、Client 卡片载体、一次性的缺 key 启动检查 |
| dsh-exa/tools | 各目标 preset 的 PresetTree | 三个工具、一段系统提示、该 preset revision 的轮询游标 |

不引入 tools/backend 布尔 Config。入口本身表达职责，避免出现 Host 与 preset 配置组合错误，也避免 tools-only 入口静态依赖 webServer。

### 4.2 根入口直接转为管理面

0.4.0 的包根入口不再保留 0.3.1 的全局工具注册兼容模式。这是一次有意的行为变更，因此：

- 版本从 0.3.1 升为 0.4.0；
- README 和升级说明必须明确：只升级包而未配置 preset 行时，所有 preset 都不会再获得 Exa 工具；
- 当前 web profile 采用停服迁移，在一次重启中同时更新包与 preset 声明；
- 回滚时同时恢复旧包并删除 dsh-exa/tools 行。

### 4.3 Host 行继续保留

cordis.patch.yml 仍插入 id/name 均为 dsh-exa 的 Host 行。该行必须保持启用，才能由 dsh-client-modules 发现并加载管理卡片。

preset 中的 dsh-exa/tools 行不承担 Client 发现职责，也不注册路由。

### 4.4 目标 preset 固定为三个

| Preset | 升级后的 Exa 能力 | 呈现方式 |
| --- | --- | --- |
| standard-instant | 有 | 原生工具 |
| ptc-instant | 有 | run_code 的 TypeScript SDK 绑定 |
| cordis-ptc | 有 | run_code 的 TypeScript SDK 绑定 |
| minimal | 无 | 不适用 |
| chat-assistant | 无 | 不适用 |
| standard / ptc / cordis | 无 | 不适用 |

子代理省略 preset 时继承父代理当前 composition，因此是否获得 Exa 由父 preset 决定；显式选择其他 preset 时由新 preset 决定。

### 4.5 round-robin 改为按 preset revision 计数

installTools 当前创建局部 rotation 对象。拆分后保留这一实现，自然形成每个 preset revision 一个游标：

- 同一 preset 下的会话与继承它的子代理共享游标；
- 不同 preset 独立计数，首次调用可能选择同一个 key；
- preset 重建或 Harness 重启会重置对应游标；
- routing strategy、key 顺序、active 状态和 402 停用记录仍由共享凭据及 ~/.dsh/exa-manager.json 提供。

该变化需要在 README 和测试中固定下来，不增加跨 preset 共享服务。

## 5. 包结构与代码修改

### 5.1 src/index.js：改为 Host 管理入口

修改内容：

1. 保留 name = 'dsh-exa'。
2. 将 inject 改为 ['webServer', 'credentials']。
3. 删除对 installTools 的导入和调用。
4. apply(ctx) 只调用 installBackend(ctx)。
5. 执行一次缺 key 启动检查，避免每个目标 preset 重复打印同一警告。
6. 更新文件头注释，说明该入口不负责模型工具。

预期结果：Host 行挂载后只有一条路由，不产生全局工具和全局 tool:exa 提示。

### 5.2 新增 src/tools-entry.js：preset 工具入口

文件职责保持单一：

- 导出 name = 'dsh-exa-tools'；
- 导出 inject = ['tools', 'credentials', 'systemPrompt']；
- 从 src/tools.js 导入 installTools；
- apply(ctx) 通过 ctx.effect(() => installTools(ctx), 'dsh-exa: tools') 注册工具和提示；
- 不导入 src/backend.js，不读取 webServer，不注册任何 HTTP 路由。

预期结果：该入口可放入多个 preset，每个 standing composition 各有一套工具注册和 rotation，但路由数量仍为零。

### 5.3 src/tools.js：保留工具实现，移出全局启动检查

以下内容原样保留：

- 三个 defineTool 定义；
- 参数校验与 Exa 请求映射；
- canonical output schema 与 render；
- systemPrompt.section({ name: 'tool:exa', ... })；
- 每次调用重新读取凭据与 manager state；
- installTools 返回的统一 disposer；
- 局部 rotation = { cursor: 0 }。

将 installTools 尾部的“未配置 Exa key”启动警告移到 Host 管理入口。工具执行时已有的 not_configured 错误保持不变，因此即使未来在其他组合中单独使用 dsh-exa/tools，也不会影响错误可诊断性。

### 5.4 src/key-manager.js：承载共享启动检查

提取一个小型 warnIfNoKeys(ctx) 辅助函数，供 Host 根入口调用。函数只复用现有 collectStoredKeys 与 ctx.get('credentials')，不改变凭据读写策略，不缓存 secret，不输出完整 key。

也可将辅助函数放在其他现有共享模块，但不得新增仅为一条警告而存在的通用服务层。

### 5.5 src/backend.js：行为不变

保留 /api/exa-manager 的 exact route、所有 key 管理 action、no-store 响应、错误映射和 owning-fiber disposer。

本次不增加执行搜索的 Host API；三个工具仍直接复用现有 Exa client 和 key manager。

### 5.6 package.json：增加子路径出口并升级版本

修改项：

1. version 改为 0.4.0。
2. exports 增加 './tools': './src/tools-entry.js'。
3. main 与 exports['.'] 继续指向 ./src/index.js。
4. files 已包含整个 src，无需为 tools-entry.js 新增单独条目。
5. dsh.bundle.patch 保持 ./cordis.patch.yml。
6. dsh.client 保持现有 platform/inject。
7. engines.dsh、peerDependencies 和 compatibility 范围不因本次架构拆分改变。
8. 不需要为入口拆分新增运行时依赖。

### 5.7 cordis.patch.yml：保持 Host 行

继续使用：

```yaml
- insert:
    - id: dsh-exa
      name: dsh-exa
```

该文件不向 preset 写入行，也不覆盖任何 preset 的完整 config。

### 5.8 Client 与 locale

src/client.js 的组件结构和 slot 注册无需改动。为避免用户误以为 Plugins 开关控制全部工具，更新 locale/en.json 与 locale/zh.json 的 summary 或配置提示，明确：

- 此卡片管理全局共享的 Exa key 与路由策略；
- Agent 工具是否可用由各 preset 中的 dsh-exa/tools 行决定；
- 禁用 Host 插件行只会移除管理卡片和路由，不会自动删除 preset 工具。

修改 locale 后运行 scripts/build-client.mjs，重新生成 lib/client.js；不要直接手改构建产物。

## 6. web profile 配置施工

### 6.1 profile package.json

保留 dsh-exa 在 dsh.profile.bundles 和 dependencies 中。单包双入口不需要新增依赖，也不需要把 dsh-exa/tools 写入 dependencies。

### 6.2 三个 preset 的 config.plugins

在 standard-instant、ptc-instant、cordis-ptc 的 config.plugins 中分别加入：

```yaml
- id: exa-tools
  name: dsh-exa/tools
```

三个 PresetTree 可以使用相同的局部 id exa-tools。为保持工具目录顺序可预测，三处都紧挨现有 tool-web 行之后插入。

不得加入 config.backend 等开关；tools 入口不具备 backend 能力，也不需要这种配置。

### 6.3 不修改其他 preset

不向 minimal、chat-assistant、官方 standard/ptc/cordis 添加该引用。它们失去 Host 全局继承的 Exa 工具是本次预期结果。

chat-assistant 的描述仅承诺 Tavily，本计划不改变其文案；若以后迁移 Tavily，再单独处理其描述和能力一致性。

### 6.4 为什么不能只靠 bundle 自动完成

DSH 0.2.1-rc.5 的 patch insert 只能向 group: true 且 config 为数组的组追加子行；dsh-agent-preset 的子插件位于 config.plugins。bundle 没有“选择 preset 并追加到 config.plugins”的安装语义。

因此，本次需要显式修改 web profile 中的三个 preset 声明。未来若要实现一键选择 preset，应另立安装器或组合管理需求，不在本次插件升级中临时实现。

## 7. 生命周期、开关与运行语义

### 7.1 挂载与卸载

- Host 根行卸载：移除 /api/exa-manager，Client 卡片随 Host entry 消失。
- 某个 dsh-exa/tools 行卸载：只移除该 preset scope 的三个工具和 tool:exa。
- 多 preset 同时挂载：不应发生路由冲突，因为 tools 入口不接触 webServer。
- Host 与 preset 同时使用相同包：共享磁盘状态和凭据，不共享 rotation。
- 同一 scope 内不得重复添加两个会注册同名 Exa 工具的入口。

### 7.2 Plugins 页开关的新语义

升级后 Plugins 页 Host 行开关只直接控制管理面，不再是一键停用全部 Exa 能力的总开关。

完全停用 Exa 需要：

1. 禁用或删除所有目标 preset 中的 exa-tools 行；
2. 禁用 Host dsh-exa 行，或取消选择 bundle。

UI 与 README 必须明确这一点，避免把“管理面已禁用”误读为“模型已不能调用 Exa”。

### 7.3 卸载顺序

卸载包前必须先删除所有 preset 中的 dsh-exa/tools 引用，再执行插件卸载。否则包依赖消失后，相关 preset 会因模块导入失败而 broken。

推荐顺序：

1. 停止 Harness；
2. 删除三个 exa-tools 行；
3. 执行 remove_bundle 或对应插件卸载操作；
4. 再启动 Harness；
5. 确认没有 exa-tools 引用残留。

### 7.4 HMR 与重启

本次迁移采用完整重启，不依赖 HMR 完成包入口和 preset 声明的原子切换。

后续开发按以下边界处理：

- src/index.js、src/backend.js 等 Host 管理面变化仍按 Host 插件流程验证；
- src/tools-entry.js、src/tools.js 等只被 preset 使用的变化，默认按需要重启处理，不承诺热重载；
- Client 源或 locale 变化必须重建 lib/client.js，并在现有 Web 构建 watcher 与页面刷新条件下验证；
- 不用 Host Loader 中路由或卡片正常来推断 preset 工具已经加载。

### 7.5 现有会话

preset 定义更新后，活跃 Agent 可能保留旧 revision。为避免“当前会话仍看到旧工具、新会话已经使用新组合”的混合状态，本次升级和回滚都在 Harness 停止时修改配置，再统一启动。

重启后，会话按当前同 id preset 定义恢复。未配置 Exa 的 preset 中，历史消息仍可保留旧工具调用记录，但新请求不再提供相应工具。

## 8. 实施顺序

### 阶段 A：入口拆分与单元测试

1. 修改 src/index.js 为 Host-only。
2. 新增 src/tools-entry.js。
3. 移动缺 key 启动检查。
4. 修改 package.json 的 version/exports。
5. 更新 Host/entry/package 测试。
6. 运行 npm run check 与 node --test。

完成标准：两个入口各自只注册自己的资源，现有工具与 backend 测试全部通过。

### 阶段 B：文档、卡片文案与构建产物

1. 更新 README 的安装、可见性、开关、卸载、round-robin 和开发说明。
2. 更新中英文 locale。
3. 重建 lib/client.js。
4. 更新 docs/verification.md 的计划检查项。
5. 核对发布包包含 src/tools-entry.js、更新后的 src/index.js 和 lib/client.js。

完成标准：npm 包仍只有一个，dsh-exa 与 dsh-exa/tools 均可从同一安装物解析。

### 阶段 C：停服迁移当前 web profile

1. 记录当前 profile package.json 与 cordis.patch.yml 的备份或 Git 差异。
2. 停止当前 Harness。
3. 将 dsh-exa 0.4.0 安装或同步到现有 link 目标。
4. 在三个目标 preset 中添加 exa-tools 行。
5. 检查没有 preset 使用旧根入口 dsh-exa 作为工具行。
6. 启动 Harness。

完成标准：启动日志没有 preset broken、路由重复或模块解析错误。

### 阶段 D：Host、Client 与各 preset 验收

按第 9 节执行验证，记录实际结果和未执行项。真实 Exa 调用仍需单独费用许可。

### 阶段 E：发布与后续维护

1. 更新 docs/verification.md 为实际结果。
2. 生成并核对发布包。
3. 发布 0.4.0。
4. 后续 DSH 升级时，继续同步三个自定义 preset 的官方模板差异；exa-tools 行作为本地增量保留。

## 9. 测试与验收计划

### 9.1 自动化测试

#### Host 入口

- 挂载后工具数为零、prompt section 数为零、路由只有 /api/exa-manager。
- 卸载后路由和启动检查相关资源全部清理。
- 重复挂载不产生重复路由。
- 缺 key 警告每次 Host 挂载最多一次。

#### tools 入口

- 挂载后恰好注册 exa_search、exa_search_advanced、exa_fetch 和 tool:exa。
- 不注册任何 HTTP 路由。
- 卸载后三个工具与提示全部消失。
- 清洁卸载后可重新挂载。
- 两个独立 tools 实例没有路由交互，rotation 各自独立。
- 原有参数、请求、响应、错误和 failover 测试继续通过。

#### 包清单与 Client

- exports['.'] 与 exports['./tools'] 均指向存在且语法有效的文件。
- dsh-exa/tools 不导出或调用 installBackend。
- cordis.patch.yml 仍只有一个 Host dsh-exa 行。
- Client locale key 集一致，lib/client.js 与源文件同步。
- 发布文件列表包含新增入口。

### 9.2 实际组合验收

| 检查项 | 预期结果 |
| --- | --- |
| Host 全局工具目录 | 不含三个 Exa 工具 |
| standard-instant 新会话 | 原生工具表包含三个 Exa 工具 |
| ptc-instant 新会话 | run_code SDK 包含三个 Exa 绑定 |
| cordis-ptc 新会话 | run_code SDK 包含三个 Exa 绑定 |
| minimal / chat-assistant / 其他未配置 preset | 不含 Exa 工具或 tool:exa 提示 |
| 三个目标 preset registry 状态 | 均无 broken 诊断 |
| Plugins → dsh-exa | 管理卡片正常显示 |
| GET /api/exa-manager | HTTP 200，no-store，masked key 行为不变 |
| 路由注册数量 | Host 中恰好一条 |
| 内置 web 工具 | schema、provider 和可用性不变 |
| 子代理 | 省略 preset 时继承父能力；显式选择时遵循新 preset |

### 9.3 状态与策略验收

使用 mock fetch 和临时 DSH_HOME，不消耗真实额度：

- 一个 preset 中发生 402 后，另一个 preset 的下一次调用能读到共享 inactive 状态；
- 两个 preset 的 round-robin 游标独立推进；
- 卡片修改策略后，所有 preset 的下一次调用使用新策略；
- key 增删、排序、active 切换和只读环境行为与 0.3.1 一致。

### 9.4 开关与卸载验收

在隔离的测试 profile 或已备份的维护窗口中验证：

1. 禁用 Host 行后卡片和路由消失，preset 工具按新语义仍存在；
2. 重新启用 Host 行后卡片和路由恢复，不出现重复工具或路由；
3. 删除全部 exa-tools 行后卸载包，不出现 preset broken；
4. 重装包并恢复三行后，所有目标能力恢复。

### 9.5 浏览器验收

- 页面刷新后卡片出现且控制台无模块加载错误；
- 中英文提示均说明 preset 控制工具可见性；
- 亮色、暗色、窄宽布局无新增溢出；
- key 管理、排序、策略和 Billing 按钮保持原行为。

### 9.6 真实 API 限制

默认只使用 mock。只有在明确批准费用后，才以最小 numResults/maxCharacters 分别执行一次 search/fetch；未执行时在验证记录中明确标注，不以 PTC schema 检查替代真实 API 成功验证。

## 10. 文档修改清单

README.md 至少需要更新：

- 当前版本与安装步骤；
- 单包双入口结构图；
- 三个目标 preset 的配置示例；
- 各 preset 的工具可见性矩阵；
- Host 开关不再控制全部工具；
- 正确卸载顺序；
- round-robin 游标的按 preset revision 语义；
- Host/preset/Client 不同的重载边界；
- 0.3.1 → 0.4.0 的停服迁移与回滚说明。

docs/verification.md 记录实际执行命令、组合检查、浏览器检查、未执行的真实 API 测试及任何 restart-required 情况。

docs/implementation-plan.md 继续作为初版历史计划，不在本次重写成现状文档；可在顶部增加指向本升级计划的链接。

## 11. 风险与控制

| 风险 | 控制措施 |
| --- | --- |
| 只升级包，未添加 preset 行 | 0.4.0 明确标记行为变更；停服同时修改包与三个 preset |
| 误在 preset 中使用包根入口 | 配置审查确保 preset 只使用 dsh-exa/tools；启动时检查路由重复和 broken 诊断 |
| 删除 Host 行导致卡片消失 | 保留 bundle 与 Host 根行，并将 Host-only 行为纳入测试 |
| Plugins 开关被误解 | 更新卡片文案与 README，验收实际开关语义 |
| 卸载后 preset broken | 卸载前删除全部 dsh-exa/tools 引用 |
| 多 preset 重复缺 key 警告 | 启动检查移到唯一 Host 入口 |
| 轮询负载分配变化 | 明确按 preset 游标语义并增加独立计数测试 |
| 当前会话仍使用旧 revision | 采用完整重启，验收使用重启后的会话或新会话 |
| 误承诺 preset HMR | 文档规定 tools 侧变化默认重启验证 |
| 工具实现意外变化 | 复用 installTools 与现有全部工具测试，不重写 schema 或请求层 |

## 12. 回滚方案

回滚必须同时恢复包和配置：

1. 停止 Harness。
2. 从 standard-instant、ptc-instant、cordis-ptc 删除 exa-tools 行。
3. 恢复 dsh-exa 0.3.1 包，其中包根入口仍注册全局工具、提示和路由。
4. 保留 ~/.dsh/exa-manager.json；0.4.0 不改变其 schema，无需数据回滚。
5. 启动 Harness。
6. 验证所有 preset 恢复 Host 全局 Exa 工具，卡片和路由正常，未出现重复注册。

若只回滚包而不删除 exa-tools 行，0.3.1 不存在 dsh-exa/tools export，三个目标 preset 会因解析失败而 broken；若只删除 preset 行而保留 0.4.0，则所有 preset 都没有 Exa 工具。两种不完整回滚均不允许作为结束状态。

## 13. 完成定义

只有以下条件全部满足，才将升级标记完成：

- 单包双入口已构建、安装并可解析；
- 自动化测试通过；
- 三个目标 preset 均无 broken，且工具呈现正确；
- 非目标 preset 不再提供 Exa；
- Host 路由唯一，Plugins 卡片可用；
- 开关和卸载的新语义经过验证并写入文档；
- round-robin 与共享状态行为有测试；
- README 和验证记录反映实际结果；
- 回滚步骤可执行且无不完整状态；
- 真实 API 调用结果或“未获费用许可、未执行”的限制已明确记录。

## 14. 主要源码依据

本计划基于以下本仓库和 DSH 0.2.1-rc.5 实现证据：

- dsh-exa：src/index.js、src/tools.js、src/backend.js、src/client.js、package.json、cordis.patch.yml；
- 当前 web profile：package.json、cordis.patch.yml；
- @deepseek-ai/dsh-agent-preset-registry：eager standing composition、mount audit、broken 诊断与 revision 保留；
- @deepseek-ai/dsh-host-webserver：duplicate exact route 抛错；
- @deepseek-ai/dsh-client-modules：只扫描 Host Loader entries；
- @deepseek-ai/dsh-tools 与 dsh-system-prompt：全局/scoped 注册和可见性合并；
- @deepseek-ai/dsh-app-boot：bundle/profile patch 层序与组插入边界；
- @deepseek-ai/dsh-hmr：Host Loader managed entries 与 unmanaged preset 插件的重启限制。
