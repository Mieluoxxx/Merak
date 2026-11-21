# Merak

<p>
  <b>基于 Rust + GPUI 的个人 AI 工作台</b><br>
  Project 导向 · 视觉产物即决策面 · 机器自证与人类裁决分离
</p>

<p>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/built%20with-Rust%20%2B%20GPUI-dea584?logo=rust" alt="Built with Rust + GPUI">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="macOS | Windows | Linux">
</p>

Merak 是一个以项目与视觉产物为核心的原生桌面工作台，采用纯 Rust 与 GPUI 构建（零 Electron、零 WebView），让人与 AI Bot 围绕具体的白板、文档、数据表与验收报告协作，而不是淹没在长对话和命令行日志里。

## 核心理念与功能

- **三域悬浮胶囊导航（主页 / 项目 / Bot）**：左侧独立悬浮导航条配以 120Hz 物理弹簧过渡动画，可平滑展开与收起子侧栏，快速切换全局入口、当前项目产物与后台常驻 Bot。
- **决策白板与多形态产物**：内置基于 Excalidraw 的原生白板（`.excalidraw` 双向兼容）、块级文档编辑器与基于 SQLite 的多维数据表，让架构草图、方案对比与规格文档直接成为工作面。
- **Verify 双轨验收**：将「机器自证（Machine Self-Proof）」与「人类裁决（Human Verdict）」明确拆分——测试命令、输出日志与已知 Gap 一目了然，由人直接给出 Pass / Reject 裁决或 Gap 豁免决定。
- **Linus 风格应用内邮箱（Inbox）**：全局低噪音裁决队列，主从分栏呈现提案邮件、白板方案附件与自证报告，支持原地选型拍板、行内回复与 `J` / `K` / `E` 键盘流处理。
- **原生设置中心与双主题**：平铺分节设计、搜索过滤与完整浅色 / 深色主题支持。
- **纯 Rust + GPUI 原生架构**：界面渲染与核心域逻辑严格分层，详见 [`docs/core-vs-app-boundaries.md`](docs/core-vs-app-boundaries.md)。

## 快速开始

```sh
# 运行 Merak 桌面端
cargo run

# 运行纯 Rust 领域契约测试
cargo test -p merak-contracts

# 全目标静态检查（含离屏截图与自动化 devtools 特性）
cargo check --all-targets --features devtools
```

## 致谢 / Acknowledgements

Merak 的诞生离不开以下优秀开源项目在工程基座、交互范式与架构思路上的启发与支持，谨在此致以诚挚感谢：

### 参考与启发项目

- **[Quiet.md](https://github.com/s1dashu/quiet-md)**（by [@s1dashu](https://github.com/s1dashu)，MIT License）
  Merak 的原生 Rust + GPUI 桌面基座、`fdl_core` 文档 / 白板 / SQLite 数据表引擎、CJK IME 输入与块级编辑能力，以及 [`vendor/zed/patches`](vendor/zed/patches) 中的 36 个 GPUI 平台补丁均演进自 Quiet.md。非常感谢 Quiet.md 打下的扎实工程基础与克制的桌面美学。（注：Merak 未携带 Quiet.md 中的商业 Nucleo 图标及品牌资产。）
- **[Ryugi 流儀](https://github.com/Innei/ryugi)**（by [@Innei](https://github.com/Innei)）
  启发了 Merak 的核心交互范式——「视觉产物即决策面」、并排方案白板选型、文档批注回流，以及「机器自证（Machine Self-Proof）与人类裁决（Human Verdict）」分离的 Verify 验收流程。（仅概念与交互设计启发，不包含其源码或私有产物。）
- **[Nuphos](https://github.com/nuphos/nuphos)**（by [Zeabur](https://github.com/nuphos)，Apache-2.0 License）
  启发了 Merak 的常驻多 Bot 协作视角、Bot 名册与会话组织方式，以及桌面壳与后台运行时的解耦思路。（仅概念与架构启发。）

### 上游开源基石与资产

- **[Zed / GPUI](https://github.com/zed-industries/zed)**（Apache-2.0，见 [`vendor/zed/LICENSE-APACHE`](vendor/zed/LICENSE-APACHE)）：GPU 加速的 Rust 原生 UI 框架。
- **[Excalidraw](https://github.com/excalidraw/excalidraw)**（MIT，Copyright © 2020 Excalidraw）：白板元素模型、`.excalidraw` 双向文件格式及白板工具栏图标（[`assets/icons/excalidraw/`](assets/icons/excalidraw/)，部分源自 MIT 许可的 [Tabler Icons](https://github.com/tabler/tabler-icons)）。
- **[Lucide Icons](https://lucide.dev)**（ISC / MIT，见 [`assets/editor-icons/LICENSE-lucide`](assets/editor-icons/LICENSE-lucide)）：编辑器与界面线性图标。
- **开源字体**：KaTeX 数学字体（OFL-1.1 / MIT，见 [`assets/fonts/katex/LICENSE`](assets/fonts/katex/LICENSE)）、Excalidraw 配套手绘与 CJK 字体（OFL-1.1 / MIT，见 [`assets/fonts/excalidraw/OFL.txt`](assets/fonts/excalidraw/OFL.txt) 与 [`assets/fonts/excalidraw/LICENSE-ComicShanns.txt`](assets/fonts/excalidraw/LICENSE-ComicShanns.txt)）、Noto Color Emoji（OFL-1.1，见 [`assets/fonts/emoji/OFL.txt`](assets/fonts/emoji/OFL.txt)）。

## 许可证 / License

本项目原创源码及演进部分采用 **[MIT License](LICENSE)** 开源发布。

仓库中嵌入或引用的第三方组件与资产各自遵循其原始许可证：[`vendor/zed`](vendor/zed/LICENSE-APACHE) 遵循 Apache-2.0 协议，[`assets/`](assets/editor-icons/LICENSE-lucide) 中的第三方图标与开源字体分别遵循 ISC / MIT / SIL OFL-1.1 协议。
