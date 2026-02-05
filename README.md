# 🤖 Claude Code Community

> **Deobfuscated & reconstructed source code of Claude Code CLI**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-Runtime-f9f1e1?logo=bun)](https://bun.sh/)
[![React](https://img.shields.io/badge/React-18-61dafb?logo=react)](https://react.dev/)
[![Ink](https://img.shields.io/badge/Ink-4.0-green)](https://github.com/vadimdemedes/ink)

## 📋 Overview

This project reconstructs Anthropic's Claude Code CLI from its obfuscated source into readable, maintainable TypeScript/React modules.

**What's included:**
- 🔓 Deobfuscated `cli.js` (7,583 lines → structured modules)
- 📦 Clean TypeScript/React architecture
- 🛠️ 10+ built-in tools (Bash, Read, Write, Edit, Glob, Grep, etc.)
- 🎨 Ink-based terminal UI components
- 🔌 Anthropic API client with streaming support

## ⚡ Quick Start

```bash
# Install
bun install

# Development
bun run dev

# Build
bun run build

# Compile binary
bun run build:compile
```

## 🚀 Usage

```bash
./dist/claude --version          # Show version
./dist/claude --help             # Show help
./dist/claude "Hello, Claude!"   # One-shot prompt
./dist/claude                    # Interactive mode
```

## 📁 Project Structure

```
src/
├── 📂 api/        # Anthropic API client (streaming, auth, errors)
├── 📂 cli/        # CLI entry & main React app
├── 📂 config/     # Version, models, themes, feature flags
├── 📂 tools/      # Built-in tools (Bash, Read, Write, Edit, Glob, Grep, LSP...)
├── 📂 types/      # TypeScript definitions
├── 📂 ui/         # Ink/React components (Box, Text, Spinner, StatusLine...)
└── 📂 utils/      # Helper functions
```

## 🛠️ Available Tools

| Tool | Description | Confirmation |
|------|-------------|:------------:|
| 🖥️ Bash | Execute shell commands | ✅ |
| 📖 Read | Read file contents | ❌ |
| ✏️ Write | Write files | ✅ |
| 🔧 Edit | String replacement edits | ✅ |
| 🔍 Glob | Find files by pattern | ❌ |
| 🔎 Grep | Search content in files | ❌ |
| 🤖 Task | Spawn subagent | ❌ |
| 🌐 WebFetch | Fetch URL content | ❌ |
| 🔎 WebSearch | Web search | ❌ |
| 📡 LSP | Language Server Protocol | ❌ |

## 🎯 Models

```typescript
// Supported models
opus: 'claude-opus-4-5-20251101'
sonnet: 'claude-sonnet-4-5-20250929'
haiku: 'claude-haiku-3-5-20250929'
```

## ⚙️ Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | 🔑 API key for authentication |
| `CLAUDE_MODEL` | 🤖 Default model |
| `CLAUDE_THEME` | 🎨 Theme (dark/light/monokai/solarized) |

## 🔬 Deobfuscation Process

1. 📥 Parse original minified `cli.js`
2. 🔍 Analyze patterns using `tweakcc` insights
3. 🌳 AST parsing with `@babel/parser`
4. ✨ Beautify with `prettier`
5. 📦 Split into logical modules
6. 🏷️ Map obfuscated → readable identifiers
7. 📝 Generate TypeScript with full types
8. 🔨 Build with `bun`

## 📜 License

**UNLICENSED** - Educational/research project only.  
Original source belongs to [Anthropic](https://anthropic.com).

---

<p align="center">
  <sub>🔧 Reconstructed with Claude AI assistance</sub>
</p>
