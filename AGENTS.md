# AGENTS.md - GNOME Shell Extension Development Guide

## Build/Test/Lint Commands

- **Lint**: `npx eslint .` or `npx eslint src/` (JavaScript files in src/)
- **Format**: `npx prettier --write .`
- **Build**: `make compile` (compiles GLib schemas)
- **Package**: `make pack` (creates .shell-extension.zip)
- **Install**: `make install` (install extension locally)
- **No test framework** - this is a GNOME Shell extension

## Code Style

- **Indentation**: 4 spaces (ESLint enforced)
- **Quotes**: Double quotes for strings (Prettier config)
- **Semicolons**: Required (ESLint + Prettier)
- **Imports**: ES6 imports (`import X from "gi://X"` for GI modules)
- **JSDoc**: Required for all functions/classes with proper types
- **File headers**: Include LGPL-3.0+ license header with copyright
- **Naming**: camelCase for variables/methods, PascalCase for classes
- **Error handling**: Use try/catch, `.catch()` for promises, console.log for errors
- **GNOME imports**: Use `gi://` prefix (e.g., `import Meta from "gi://Meta"`)
- **Extension imports**: Use relative paths (e.g., `import { QuakeMode } from "./quake-mode.js"`)
