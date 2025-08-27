## YouTube 收益计算器（浏览器扩展）

一个用于在 YouTube 视频页面右侧自动显示「预估收益」的浏览器扩展。支持从弹窗（popup）中配置 RPM 与广告投放率，并能在配置变更后实时更新内容页的计算结果。

### 功能特性

- **自动识别视频页**：在 `youtube.com/watch` 页面右侧插入收益卡片
- **自动获取观看量**：解析页面中的观看量，支持中英文格式（如 “12.3 万 次观看”/“1.2M views”）
- **简化收益估算**：按简化公式实时计算展示美元与人民币
- **可配置参数**：在 popup 中设置 `RPM` 与 `广告投放率(Ad Fill Rate)`，并持久化存储
- **设置实时生效**：popup 中改动 `RPM/投放率`，内容页卡片立即自动刷新
- **SPA 导航兼容**：支持 YouTube 的单页路由导航，切换视频时自动重建并重算

### 核心公式（简化版）

```text
预估广告收益(USD) ≈ (观看量 ÷ 1000) × RPM × 投放率 × 55%
```

- `RPM`：每千次观看收益（单位：美元）
- `投放率`：广告实际投放的比例（0%–100%）
- `55%`：创作者分成比例（YouTube 广告分成常见值）

内容页展示同时给出人民币换算（示例采用汇率 1 USD ≈ 7.2 CNY，可在代码中调整）。

### 运行环境

- Chrome 或其他 Chromium 系浏览器（Manifest V3）
- Node.js 16+（建议 18+）

### 开发/构建

本项目采用 Web Extension 开发生态（目录形态与 WXT 相似，`entrypoints/` 下为各入口）。具体脚手架命令依你的本地 `package.json` 而定，下述为常见约定命令，若与你的项目不一致，请以 `package.json` 为准。

```bash
# 安装依赖
npm install

# 开发模式（如有）：
# 一般为 watch + 热更新，自动产物输出到 .output 或 dist 目录
npm run dev

# 构建生产包
npm run build
```

构建完成后，通常会在 `dist` 或 `.output/chrome-mv3` 下产生可加载的扩展目录。

### 在浏览器中加载扩展

1. 打开 Chrome，访问 `chrome://extensions/`
2. 打开「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择构建输出目录（例如：`dist` 或 `.output/chrome-mv3`）

加载后，打开任意 `https://www.youtube.com/watch?v=...` 视频页面，右侧应出现“预估收益”卡片。

### 使用说明

1. 打开任意 YouTube 视频页面
2. 浏览器工具栏点击扩展图标，打开 popup 设置
3. 在 popup 中调整：
   - `RPM`（默认 5）
   - `广告投放率`（默认 60%，滑块可在 40%–80% 之间调整）
4. 设置会持久化到浏览器存储，并**实时**反映到内容页卡片的计算

### 设置与实时更新机制

- popup 侧将 `rpm`、`adRate` 写入 `chrome.storage.sync`
- 内容脚本会在计算时读取 `rpm` 与 `adRate`
- 同时监听 `chrome.storage.onChanged`：当 popup 改动任一值，内容脚本会自动触发重算与 UI 更新

相关实现（节选）：

```12:18:entrypoints/content.ts
    // 监听设置变更（如RPM、广告投放率）并实时刷新展示
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes: any, area: string) => {
          if (area === 'sync' && (changes.rpm || changes.adRate)) {
            // 变更后重算
            setTimeout(calculateRevenue, 0);
          }
        });
      }
    } catch (e) {
      // 忽略监听失败
    }
```

### 目录结构（关键文件）

```text
entrypoints/
  ├─ content.ts           # 内容脚本：注入 YouTube 视频页，负责读取观看量、计算并渲染收益卡片
  ├─ background.ts        # 背景脚本（若需）
  └─ popup/
       ├─ App.vue         # 扩展弹窗主界面，提供 RPM、投放率与其他参数输入
       └─ index.html      # 弹窗入口 HTML
.claude/compute.md         # 设计/计算备注（若需）
```

### 关键逻辑说明

- **页面就绪与重建**：监听 YouTube 的 SPA 导航事件（如 `yt-navigate-finish`），在视频切换时移除旧卡片并延迟重新计算
- **观看量解析**：
  - 中文格式匹配：`/([\d.,]+[万亿]*)\s*次观看/`
  - 英文格式匹配：`/([\d.,]+[KMB]*)\s*views/`
- **存储与同步**：
  - 读写：`chrome.storage.sync.get/set(['rpm','adRate', ...])`
  - 监听：`chrome.storage.onChanged`

### 权限说明

根据你的打包配置，通常需要以下权限（具体以 `manifest.json` 为准）：

- `storage`：读取/写入 RPM、广告投放率等设置
- `tabs`、`scripting`：向当前活动标签发送消息、必要时注入内容脚本
- 主机权限：`https://*.youtube.com/*`

### 准确性声明与限制

- 本扩展仅用于估算展示，结果受多种因素影响（地域、受众、内容类型、季节性等）
- `RPM`、`投放率` 等参数为经验/自定义配置，不代表实际平台结算
- 建议结合你的频道历史数据进行调优

### 常见问题（FAQ）

- 看不到收益卡片？

  - 确保页面为 `youtube.com/watch` 视频页
  - 等待页面元素加载完成；或刷新重试
  - 检查是否在扩展管理页正确加载了构建目录

- popup 修改了 `RPM/投放率`，内容页没有变化？
  - 确认浏览器未禁用第三方 cookie/存储
  - 打开 DevTools Console，查看内容脚本是否输出了“监听到设置变更，重新计算收益”日志

### 贡献与开发建议

- 提交 PR 前请保持代码风格一致，并避免无关格式化改动
- 命名尽量语义化、易读；避免缩写
- 对复杂逻辑添加必要注释（解释“为什么”而非“怎么做”）

### 许可协议

本项目默认以 MIT 许可证开源（如有不同，请在此处替换为实际协议）。

# WXT + Vue 3

This template should help get you started developing with Vue 3 in WXT.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar).
