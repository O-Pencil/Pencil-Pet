# Pencil-Pet 🐱

[English](#english) | [简体中文](#简体中文)

---

## English

Pencil-Pet is a charming desktop companion designed for the **Pencil Multi-Agent Ecosystem**. It bridges the gap between the invisible CLI execution and the user's workspace by providing an emotionally responsive, visual interface for your AI agents.

### 🌟 Key Features

- **Multi-Agent Awareness**: Seamlessly monitors sessions across the `~/.pencils` architecture.
- **Dynamic Persona Mapping**: Transitions between different states (Thinking, Working, Resting, Stretching) based on agent activity.
- **Non-Intrusive Presence**: A transparent, click-through, and always-on-top window that feels like a sticker on your desktop.
- **Smart Notifications**: Real-time speech bubbles triggered by agent events like task completion, permission requests, or errors.
- **macOS Sequoia Optimized**: Uses a specialized Data URL IPC pipeline to ensure stability and perfect transparency on the latest macOS.

### 🚀 Quick Start

1. **Install Dependencies**:
   ```bash
   pnpm install
   ```
2. **Run in Development**:
   ```bash
   pnpm dev
   ```
3. **Build and Package**:
   ```bash
   pnpm dist
   ```

### 🎨 Customization

Generate your own pet assets using the optimized prompts located in `scripts/optimized_pet_prompts.md`. Simply place your transparent PNGs in the `assets/` folder to personalize your experience.

---

## 简体中文

Pencil-Pet 是专为 **Pencil 多智能体生态** 打造的桌面萌宠。它通过为 AI Agent 提供有情感反馈的可视化界面，将原本“隐形”的 CLI 执行过程转化为直观的桌面互动体验。

### 🌟 核心特性

- **多 Agent 感知**：深度适配 `~/.pencils` 目录架构，实时监控不同 Agent 的会话动态。
- **动态状态映射**：根据 Agent 的活动（思考、工作、休息、唤醒等）自动切换宠物形象。
- **无感陪伴**：全透明、可穿透、始终置顶的窗口设计，宛如桌面贴纸。
- **智能气泡提醒**：当 Agent 完成任务、请求权限或遇到错误时，通过实时气泡进行互动提醒。
- **macOS Sequoia 深度优化**：采用高性能 Data URL IPC 链路，解决新版系统上的透明窗口闪退与协议加载冲突。

### 🚀 快速开始

1. **安装依赖**:
   ```bash
   pnpm install
   ```
2. **启动开发模式**:
   ```bash
   pnpm dev
   ```
3. **构建安装包**:
   ```bash
   pnpm dist
   ```

### 🎨 自定义宠物

参考 `scripts/optimized_pet_prompts.md` 中的优化提示词生成你自己的宠物素材。只需将透明 PNG 图片放入 `assets/` 目录即可完成替换。

---

**License**: MIT
