# 兼容性核对 — 0.2.2-rc.3 之后未发布提交

Date: 2026-11-13, Asia/Hong_Kong

Baseline: `dsh-exa` 0.4.2；DSH 发布标签 `dsh-v0.2.2-rc.3`（commit `38a6a5c965aa99ab525161efb7cc5cf1fe62fced`）；被核对的官方仓库 HEAD 为 `39163dd30f703a79079e2d2446545cff3c453738`（2026-11-13 15:37 HKT）。

Status: 核对完成。本文件只记录结论与证据，不包含代码改动；第 8 节的建议项尚未实施。

## 1. 范围与基线

本次核对针对官方 `deepseek-harness` 仓库在 `dsh-v0.2.2-rc.3` 之后、尚未形成发布版本的提交。两个端点之间的差量为 608 个提交、3309 个文件（104,100 行新增、36,870 行删除）。差量中的大部分文件属于测试、文档与 `experimental/` 包，真正需要逐项核对的是本项目实际使用的接口面：

- Host 入口：`webServer` 与 `credentials` 服务、`/api/exa-manager` 具名路由、启动时的缺 key 警告；
- preset 入口：`tools` 与 `systemPrompt` 服务、三个 `defineTool` 定义、canonical 输出模式、`tool:exa` 提示段；
- 客户端：`window.__ModuleLoader__.load({ id, factory })` 注册、`plugins.bundle.config` 槽位、`ctx.locale.register`、组件内联样式；
- 清单与装配：`package.json` 的 `dsh` 字段（`bundle.patch`、`client.platform`、`client.inject`）、`engines.dsh`、`dsh.compatibility.dshReleases`、`cordis.patch.yml`；
- 运行环境：Cordis 的插件生命周期与 `ctx.get`、PTC 的 canonical 值传递、`@deepseek-ai/dsh-home-paths` 的 `resolveDshHome`。

官方仓库在本机的实际安装运行时是 `0.2.2-rc.3`，与已确认可用的版本一致。核对采用两条证据链：先对 rc.3 与 HEAD 之间本项目依赖的文件做逐文件比对，并阅读这次新增的 upgrade guide；再把 HEAD 的源码实际跑起来做行为验证。对于差量中未改动的文件，使用本机 rc.3 的同一份实现执行，并在结果中注明等价关系。

## 2. 结论

在本项目实际使用的接口面上，只有一处构成真正的行为破坏：**具名 HTTP 路由的默认准入策略从直接放行改成了必须认证**。本项目的 `/api/exa-manager` 没有声明 `auth`，在未发布版本中会落入 `required` 默认值。官方 Web profile 中，带着登录 Cookie 的浏览器访问时仍然正常，Plugins 卡片本身可用；未认证的 HTTP 客户端则会得到 401（有 Connection 时）或 503（没有授权决定时），项目现有的 curl 式验收流程、以及没有挂载 Connection/Token 的自定义组合会直接失效。

其余变动要么不触及本项目的接口，要么只是文档与未来维护项：版本准入范围能覆盖下一个 0.2.2 rc 或正式版，但会拒绝 0.2.3；客户端 bundle 在 HEAD 的新模块系统下可以正常加载和渲染；`defineTool`、canonical 输出模式、system-prompt section、credentials 服务、bundle patch 组合均未破坏；Cordis rc.12、`dsh-tools/presentation` 子路径移除、Python PTC 移除、CUA、搜索过滤、Session 状态迁移等与本项目无关。

| 集成面 | 未发布变动 | 对本项目的影响 | 判定 |
| --- | --- | --- | --- |
| `ctx.webServer.register` 具名路由 | `auth` 默认 `required`，新增 Token Provider | 未认证请求 401/503；GUI 带 Cookie 可用；验收脚本失效 | 需要修改声明 |
| `engines.dsh` 准入 | 版本范围语义未变 | `0.2.2-rc.4`/`0.2.2` 可进入；`0.2.3-rc.1` 被拒 | 维护项 |
| 客户端模块系统 | 注册可带 `meta`，静态模块改为 manifest | 现有 bundle 正常加载；CSS 仍由组件内 `<style>` 承担 | 无破坏 |
| `defineTool` / 输出模式 | `pipeline.ts` 取消分类调整；`./presentation` 子路径移除 | 三个工具注册与模式校验通过；未引用被移除子路径 | 无破坏 |
| Cordis | 升级到上游 4.0.0-rc.12 语义 | 未使用 `ctx.root`、`Service.metadata`、`isolate` 等 | 无破坏 |
| PTC | 改用 `inspect()` 显式输出；Python 运行时移除 | 工具仍可在 PTC 中调用；仅影响演示与文档习惯 | 无破坏 |
| Home 路径 | 新增 `dshPath` 分类助手，提案尚未落地 | `~/.dsh/exa-manager.json` 仍有效 | 观察项 |
| 其他（CUA、session-status、web-fetch 错误码等） | 大量实验包变动 | 未使用 | 无影响 |

## 3. 路由准入

### 3.1 官方改动

HEAD 的 `packages/host/webserver/src/index.ts` 给 `WebRoute`、`WebResourceRoute`、`WebUpgradeRoute` 都加了可选 `auth` 字段（第 124、142、155 行），并在 `authPolicy()` 里写成 `auth ?? 'required'`（第 781 行）。没有任何 `webserver/authorize` 监听器给出决定时，`required` 落到 `{ kind: 'deny', status: 503 }`（第 788 行）；官方 Web bundle 现在默认挂载 `@deepseek-ai/dsh-host-authentication-token`（`packages/bundle/web-app/cordis.patch.yml` 第 246 行），Connection 的监听器（`packages/client/connection/src/rpc-host.ts` 第 87 行）在浏览器没有有效 Cookie 时返回 401。

新增的 upgrade guide 在 `docs/upgrade-guide/v0.2.2-rc.2/connection-page-peer/guide.md` 里写明了迁移要求：审计所有 `webServer.register`、`registerFallback`、`registerUpgrade` 调用；公开资源显式声明 `auth: 'anonymous'`；受保护的管理处理器保持认证访问。同一 guide 还说明 Token Provider 从 Connection 手中接管默认登录交换，Connection 移除了 `authorizeIndex`、`authenticatedUrl`、`requestRejection` 等旧接口。

### 3.2 本项目的现状

本项目在 [src/backend.js](../src/backend.js:419) 注册路由时只写了 `kind`、`path`、`handler` 三个字段，没有 `auth`。用 HEAD 的 `host-webserver` 源码在临时端口上的实测结果如下：

| 场景 | 响应 | 说明 |
| --- | --- | --- |
| 不声明 `auth`，无授权决定 | 503 | 自定义组合只挂 `webServer` 时的结果 |
| 不声明 `auth`，授权方拒绝无 Cookie 请求 | 401 | 官方 Web profile 下未登录客户端的典型结果 |
| 不声明 `auth`，授权通过并给出 Peer | 200 | 浏览器带 Token Cookie 访问时的结果，处理器收到第三个 `peer` 参数 |
| `auth: 'deny'` | 403 | 显式拒绝语义正常 |
| `auth: 'anonymous'`，无授权决定 | 200 | 保持旧行为的写法 |

官方 Web profile 的实际链路是：浏览器先打开带 `?token=` 的入口，Token Provider 在首页请求上写入 `Path=/`、`HttpOnly`、`SameSite=Strict` 的 Cookie（`packages/host/authentication-token/src/browser-auth.ts` 第 139 行）；此后页面内同源 `fetch` 自带该 Cookie。因此卡片的加载、刷新、保存操作仍然可用，主路径没有功能损失。

受影响的是三类边界。项目自己的验收流程直接以 `GET /api/exa-manager` 期望 200（[README.md](../README.md:264)、[docs/verification.md](./verification.md:88)），在未发布版本上必须改成先建立认证会话，或者改成“未认证 401/503、认证后 200”的双断言。任何绕过浏览器的本地脚本或外部工具，旧版本可以不认证直接读写 key 列表，新版本会得到 401 或 503。自定义组合方面，本项目 Host 入口只 `inject` 了 `webServer` 与 `credentials`，没有要求 `connection` 或 Token Provider；只挂 `webServer` 的组合会让路由永远拿不到授权决定，卡片和 API 一起失效。官方 Web bundle 现在默认包含 Connection 与 Token，所以这不是主路径问题，但它是一个真实的组合级回归。

### 3.3 建议的改法

在 [src/backend.js](../src/backend.js:419) 的路由对象里显式声明策略。作为管理 Exa key 的接口，首选 `auth: 'required'`，与 DSH 新默认和 guide 对 administrative handler 的建议一致：

```js
ctx.effect(() => ctx.webServer.register({
  kind: 'exact',
  path: '/api/exa-manager',
  auth: 'required',
  handler: async (req, res) => { /* 原逻辑不变 */ },
}), 'dsh-exa: route /api/exa-manager')
```

如果产品上必须保留“本地脚本无需登录即可管理 key”的旧能力，应显式写 `auth: 'anonymous'`，并在 README 里说明这是有意为之。两种写法都比继续依赖默认值好，因为默认值已经从放行变成了必须认证。

## 4. 版本准入

`packages/boot/app-boot/src/plugin-compatibility.ts` 在差量中没有改动。`engines.dsh` 仍然单独决定准入，并用 `includePrerelease: true` 匹配预发布版本。用同一份逻辑对本项目 [package.json](../package.json:31) 的 `engines.dsh`（`>=0.2.1-0 <0.2.2-0 || >=0.2.2-0 <0.2.3-0`）求值，结果如下：

| 运行时版本 | 准入结果 |
| --- | --- |
| `0.2.2-rc.3` | 通过 |
| `0.2.2-rc.4` | 通过 |
| `0.2.2`（正式版） | 通过 |
| `0.2.3-rc.1` | 拒绝，`engines.dsh` 不满足 |
| `0.3.0-rc.1` | 拒绝，`engines.dsh` 不满足 |

rc.3 标签之后，`release/dsh-0.2.2` 分支已经合回 master，root `package.json` 仍是 `0.2.2-rc.3`，说明下一个标签大概率还是 0.2.2 线的 rc 或正式版，落在现有范围内。这里不需要提前放宽范围。等下一个标签出现后，应把对应版本补进 `dsh.compatibility.dshReleases`；如果届时决定支持 0.2.3，再把 `engines.dsh` 与两个 DSH peer 范围一起改成覆盖 0.2.3 的形式，并且要先完成第 3 节的路由迁移与复测，不能只改版本号。

`dsh.compatibility.dshReleases` 是描述性字段，Host 不读取，不影响准入，只影响项目自己的证据记录。当前表里还没有 `0.2.2-rc.3`，可以在下一次版本更新时顺手补上。

## 5. 客户端 bundle

这次客户端侧的核心改动有三处。`packages/client/modules/src/client/manifest.ts` 把注册面从“仅 `{ id, factory }`”扩展为 `DshClientModuleManifest`，允许可选的 `meta`（样式表描述）；`packages/client/web/src/seed.ts` 把平台单例从直接导出对象改成 manifest 列表；`ui-renderer` 接管模块样式安装，并停止由 Modules 删除 `style[data-plugin]` 元素。对应的升级说明是 `docs/upgrade-guide/v0.2.2-rc.2/client-module-metadata/guide.md`，其中明确写到：用新 preset 构建的 bundle 可以在更早的 DSH 上运行但会丢失样式；更早 preset 的 bundle 仍然可以加载，只是样式不再由 Modules 清理。

本项目正好落在“更早 preset 的 bundle”这一侧：`lib/client.js` 由 [scripts/build-client.mjs](../scripts/build-client.mjs:38) 手工生成，只调用 `window.__ModuleLoader__.load({ id, factory })`，没有 `meta`；卡片的 CSS 是组件内部通过 `react.createElement('style', null, CSS)` 渲染的，没有 `data-plugin` 属性，随组件卸载由 React 移除。因此这两条改动都不会伤害它。

把 HEAD 的 `packages/client/modules/src/client` 整套源码复制到临时目录，用 jsdom 提供 `window`，以 HEAD 的 `createClientModuleSystem` 加载实际构建出的 `lib/client.js`，并让 `require('react')` 解析到一个静态模块。结果是：bundle 注册成功，`import('dsh-exa')` 返回 `{ apply, inject }`，`apply` 注册了 `dshExa` 命名空间下的 zh/en 字典（各 97 个键），并把 `plugins.bundle.config` 槽位登记为 `{ name: 'plugins.bundle.config', key: 'dsh-exa', id: 'dsh-exa', locale: 'dshExa' }`。随后用真实的 React 18 与 `react-dom/server` 渲染卡片，得到 4,320 字节的初始加载态 HTML，包含 `.dex-btn` 样式与 `style` 元素。

由此可以确认：不需要重新构建客户端 bundle，也不需要为了这次改动在注册里补 `meta`。如果将来想让卡片改用新的模块样式机制，必须同时把 `engines.dsh` 的下限抬到包含该机制的版本，否则旧 DSH 会忽略 `meta` 而丢失样式；当前没有这个必要。

`dsh.client.inject` 仍然是有效字段，`packages/client/locale` 与 `packages/client/ui-slots` 在差量中没有改动，`plugins.bundle.config` 槽位的 keyed 语义也没有变。`PluginManagerPage.tsx` 的改动只涉及插件列表的搜索过滤，不涉及配置卡片的属性；卡片收到的 `view` 仍然是 `'summary' | 'page'`，本项目的 `ExaCard` 对这两个值的处理都正确。

## 6. 工具与 PTC

`packages/core/tools` 在差量中真正的源码改动只有 `src/pipeline.ts`：在调用方取消后，对“外包装抛出的取消原因或名为 `AbortError` 的普通错误”补充 `ABORTED`/`ABORTED_BEFORE_DISPATCH` 分类。本项目的 `execute` 直接抛 `ExaApiError` 或普通 `Error`，没有 `tools/execute` 包装器，取消时仍是普通错误结果，与旧行为一致。`defineTool` 所在的 `schema.ts`、`json-schema.ts`、`contracts.ts` 以及整个 `@deepseek-ai/dsh-tools` 的导出面没有变化，唯一被移除的是 `./presentation` 子路径，本项目只从包根导入 `defineTool`。

用同一份未改动的 `defineTool` 与 JSON Schema 校验代码构造了三个工具，三个都注册成功，输出模式与参数模式都通过了 `assertSupportedJsonSchema`，示例 canonical 输出通过 `validateJsonSchemaValue`，`tool:exa` section 的 `name`、`order`（111）也与预期一致。项目自身的 `npm run check` 与 `node --test` 全部通过，79 个用例无失败。

PTC 侧需要区分代码契约与模型可见行为。`run_code` 的程序输出现在必须通过 `inspect(...)` 显式选择，函数返回值不再自动进入结果；`@deepseek-ai/dsh-tool-executor-ptc` 的 SDK 渲染把 `inspect` 写进了声明，并移除了 Python 运行时与 `jsonSchemaToPy`/`renderToolsSdkPy`。本项目的工具仍然通过 `definition.output.schema` 进入 `ToolOutputMap`；把三个工具的模式交给该渲染器，得到 8,565 字节的 TypeScript SDK 声明，三个工具名、`ToolOutputMap` 与 `results` 字段都在。因此插件代码不需要改。如果 README 或演示里要展示 PTC 调用，示例应改成 `inspect(await tools.exa_search(...))`，否则程序会出现“有返回值但没有可见输出”的情况。

## 7. 其余变动

Cordis 的 vendored 源码从 rc.3 的 4.1.0 语义升级到上游 4.0.0-rc.12 语义，`ctx.root`、`Service.config`、`Service.resolveConfig`、`symbols.metadata`、`ctx.isolate` 的兜底规则都变了。本项目没有使用这些接口，`inject` 是数组形式而不是会被改变优先级的对象形式，`ctx.effect` 与 `ctx.get` 的用法也不受影响。`@deepseek-ai/cordis` 的包版本仍是 4.1.0，所以本项目的 peer 范围 `>=4.0.5 <5.0.0` 仍然匹配，npm 不会给出任何提示；这一点值得记录，因为“版本没变但语义变了”是这次最容易被忽略的背景。

Home 路径方面，`packages/util/home-paths/src/index.ts` 新增了 `dshPath(category, ...segments)`，`dshHomePath` 仍然保留，`resolveDshHome` 的签名与行为没有变。本项目的 [src/state.js](../src/state.js:24) 仍然把状态写到 `~/.dsh/exa-manager.json`。这个路径在已经提交的提案 `.agents/notes/proposed/architecture/2026-11-04-dsh-home-path-categories.md` 中属于“插件自有、尚未迁移”的条目，提案状态是 proposed，运行时没有强制。建议保持现状，不要为了迎合分类约定而移动已有用户的文件；若未来 DSH 真的迁移这些条目，再按提案要求做带迁移的路径切换。新增文件时可以优先用 `dshPath('state', 'exa', ...)`，这属于下一轮改造。

插件管理器在差量中新增了 `PluginManagerError`（profile 读取失败、管理器已释放），`install_bundle`/`remove_bundle` 的语义与参数没有变，本项目的安装说明不受影响。`packages/credentials/credentials` 完全没变，`resolve`/`describe`/`set`/`unset` 的用法继续有效；Token Provider 使用的 `client-connection/browser-session` 凭据与本项目的 `EXA_API_KEYS`/`EXA_API_KEY` 不冲突。`@deepseek-ai/dsh-system-prompt`、`@deepseek-ai/dsh-client-locale`、`@deepseek-ai/dsh-client-ui-slots` 三个包在差量中没有改动。

其余新增 guide 逐条对照的结果是：`package-export-cleanup` 里的七个被移除子路径本项目一个都没用；`cordis-root-and-intercept-metadata` 不涉及；`experimental-tool-error-codes` 只改实验包与内置工具的错误身份，本项目抛普通错误的行为不变；`python-ptc-removal`、`ptc-bootstrap-protocol`、`ptc-scoped-repl-default` 属于 PTC 运行时配置；`shared-search-filter`、`session-status-package`、`web-fetch-transport-error-codes`、`shell-fs-tool-error-codes`、`deepseek-files-timeout` 与三个 CUA 条目都与本项目无关。

## 8. 建议的后续动作

以下动作本次均未实施：

1. 给 `/api/exa-manager` 显式声明 `auth`。首选 `auth: 'required'`；如果必须保留旧的外部脚本访问，则用 `auth: 'anonymous'` 并在文档里写清楚这是有意降低访问限制。
2. 更新验收与文档。README 与 verification.md 里“`GET /api/exa-manager` 返回 200”的动作要改成先认证再请求，或者明确写成“未认证 401/503、认证后 200”。
3. 把 `0.2.2-rc.3` 补进 `dsh.compatibility.dshReleases`，并在下一次发布后补对应条目。
4. 版本范围暂不动。等下一个 `dsh-v0.2.2*` 标签出现并完成复测后，再决定是否扩到 0.2.3；扩范围时 `engines.dsh` 与两个 DSH peer 必须同步修改。
5. 如果 README 或演示包含 `run_code` 示例，补上 `inspect(...)`。
6. 客户端 bundle 不需要重建，也不需要加 `meta`。

## 9. 实测记录与限制

实际执行的检查如下：

| 检查 | 方法 | 结果 |
| --- | --- | --- |
| 版本准入 | rc.3 的 `evaluatePluginCompatibility`（文件在差量中未改动） | rc.3、rc.4、0.2.2 通过；0.2.3-rc.1、0.3.0-rc.1 被拒 |
| bundle patch | rc.3 的 `composeEntries`（`profile.ts` 与 `vendor/include/src/patch.ts` 未改动） | 组合出唯一一行 `{ id: 'dsh-exa', name: 'dsh-exa' }`，无告警 |
| 工具注册 | 未改动的 `defineTool` 与 JSON Schema 校验器 | 三个工具注册成功，参数与输出模式全部通过 |
| 客户端加载 | HEAD 的 `client/modules` 源码 + jsdom + 真实 `lib/client.js` | bundle 注册、物化、槽位与字典注册均成功 |
| 卡片渲染 | 真实 React 18 + `react-dom/server` | 4,320 字节初始 HTML，含 `.dex-btn` 与内联样式 |
| 路由准入 | HEAD 的 `host-webserver` 源码 | 503/401/403/200 四种结果与源码语义一致 |
| PTC SDK | rc.3 的渲染器（`jsonSchemaToTs` 在差量中未改） | 8,565 字节声明，三个工具均在 |
| 项目自身检查 | `npm run check`、`node --test` | 9 个入口语法检查通过；79 个用例通过 |

未覆盖的部分有四项。没有把 HEAD 的 monorepo 完整构建并启动一个 Web profile，因为该仓库的依赖安装不完整，构建与启动成本也超出本次核对范围；没有发出真实的 Exa API 请求；没有做浏览器视觉验收，卡片只验证到结构渲染与真实 React 服务端渲染；WebServer 的准入测试使用 HEAD 的 webserver 源码搭配本机 rc.3 的 Cordis，授权逻辑本身不依赖新 Cordis 的语义，但整套 Web profile 的启动时序没有实测。这四项不影响“路由默认策略变化”与“客户端 bundle 可加载”两个核心结论：前者由源码与独立实例的行为共同确认，后者由 HEAD 模块系统与真实 bundle 的加载确认。

## 附录：复现要点

差量端点固定为 `dsh-v0.2.2-rc.3..39163dd30f703a79079e2d2446545cff3c453738`。关键比对命令为 `git diff --stat <tag>..<head> -- <package>`，重点关注 `packages/core/tools`、`packages/client/modules`、`packages/client/web`、`packages/host/webserver`、`packages/host/frontend-static`、`packages/util/home-paths`、`packages/boot/app-boot`、`packages/bundle/web-app`、`packages/client/connection`、`vendor/cordis` 与 `docs/upgrade-guide`。

运行验证使用官方仓库自带的 `tsx` 与 jsdom。未改动的模块直接来自本机安装的 `@deepseek-ai/dsh@0.2.2-rc.3`；改动的模块复制 HEAD 源码到临时目录，再补上运行依赖。临时脚本不随仓库提交。项目自身的构建、检查与测试命令为：

```bash
node scripts/build-client.mjs
npm run check
node --test
```
