# JOTTER

**A fast, free and open-source desktop scratchpad for JavaScript, TypeScript, JSX and TSX.**

Sketch an idea, test a regex, hit an API or try a package — without setting up a project.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-Linux%20%7C%20Windows%20%7C%20macOS-informational)](#installation)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Electron](https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white)](https://www.electronjs.org)

---

JOTTER is a scratchpad: open it, type, and see results immediately. It runs your
code live in both a **Node.js** and a **browser** runtime, installs npm packages
on the fly, and saves reusable snippets. No account, no license, no paywall.

## Table of contents

- [Features](#features)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Environments](#environments)
- [Installation](#installation)
- [Development](#development)
- [Build](#build)
- [Releasing](#releasing)
- [Project layout](#project-layout)
- [Not affiliated](#not-affiliated)
- [License](#license)

## Features

- **Live evaluation** — code runs as you type (debounced).
- **Two environments** — a full Node.js runtime and a sandboxed browser runtime.
- **Magic comments** — append `//?` to any line to print its value inline:

  ```js
  const doubled = [1, 2, 3].map((n) => n * 2)
  doubled //? doubled values
  ```

- **Every expression** is evaluated and shown automatically, no labels needed.
- **Multiple work tabs** — several independent sessions open from the start
  (double-click a tab to rename, `+` to add, `×` to close).
- **Languages** — JavaScript, TypeScript, JSX and TSX. JSX/TSX use the automatic
  React runtime, so no `import React` is required.
- **Web View** — mount React apps into a sandboxed preview with a `#root`
  element. Install `react` and `react-dom`, choose JSX/TSX + the Browser
  environment, and enable **Web View**:

  ```jsx
  import { createRoot } from 'react-dom/client'

  function App() {
    return <h1>Hello from JOTTER</h1>
  }

  createRoot(document.getElementById('root')).render(<App />)
  ```

- **npm in the browser** — the Browser environment bundles your snippet with
  esbuild, so packages like React or styled-components work there too.
- **npm packages** — install from the Packages panel; the npm CLI ships with the
  app, so no system Node.js is required.
- **Snippets** — save and reopen code fragments.
- **Self-cleaning (with a choice)** — temporary files are always removed, and on
  exit JOTTER asks whether to keep or delete the installed npm packages, so your
  work is only discarded when you want it to be.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + Enter` | Run the current tab |
| `Enter` | Confirm rename, save snippet or install package |
| `Escape` | Cancel a tab rename |

## Environments

| | Node.js | Browser |
| --- | --- | --- |
| Node APIs (`require`/`import`) | Yes | No |
| DOM & Web APIs | No | Yes |
| Top-level `await` | Yes | Yes |
| npm packages | Yes | Yes (bundled with esbuild) |
| Web View preview | No | Yes |

## Installation

### Prebuilt packages

Grab the artifact for your platform from the releases page:

| Platform | Format |
| --- | --- |
| Linux | `.AppImage`, `.deb` |
| Windows | NSIS `.exe` installer |
| macOS | `.dmg` |

```bash
# Linux AppImage
chmod +x JOTTER-*.AppImage && ./JOTTER-*.AppImage

# Linux Debian/Ubuntu
sudo apt install ./jotter_*.deb
```

### From source

See [Development](#development) below. The packaged app requires nothing else;
running from source requires Node.js 20+.

## Development

```bash
npm install
npm run dev        # start with hot reload
npm run typecheck  # type-check main, preload and renderer
npm test           # run the test suite (Vitest)
npm run test:watch # tests in watch mode
```

## Build

```bash
npm run build        # compile to out/
npm run build:linux  # AppImage + deb
npm run build:win    # NSIS installer
npm run build:mac    # dmg
```

Artifacts are written to `release/`. Cross-compiling: Linux and Windows can be
built from Linux (Windows needs Wine); macOS builds must run on macOS.

> On Arch Linux the `.deb` target needs `libxcrypt-compat` (it provides
> `libcrypt.so.1`, required by the bundled `fpm`). GitHub's `ubuntu-latest`
> runners already include it, so CI is unaffected.

## Releasing

### CI

The GitLab pipeline (`.gitlab-ci.yml`) runs type-check, tests and build on
pushes to `main`, and on tags it packages the Linux AppImage automatically and
creates a GitLab **Release**. Windows/macOS packaging jobs run on self-hosted
runners tagged `windows`/`macos`.

### Bump the version

Locally (needs push access to the repo):

```bash
npm run release:patch   # or release:minor / release:major
```

This bumps `package.json`, commits and pushes the `vX.Y.Z` tag, which triggers
the packaging/release jobs.

### Code signing (optional but recommended)

Set these as **CI/CD variables** in GitLab. Without them builds are unsigned:
macOS users will hit Gatekeeper and Windows users will see SmartScreen warnings.

| Variable | Platform | Description |
| --- | --- | --- |
| `MAC_CSC_LINK` | macOS | base64 of the Developer ID Application `.p12` |
| `MAC_CSC_KEY_PASSWORD` | macOS | password of the `.p12` |
| `APPLE_ID` | macOS | Apple ID used for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | macOS | app-specific password for notarization |
| `APPLE_TEAM_ID` | macOS | Apple Developer Team ID |
| `WIN_CSC_LINK` | Windows | base64 of the code-signing `.pfx` |
| `WIN_CSC_KEY_PASSWORD` | Windows | password of the `.pfx` |

To base64-encode a certificate:

```bash
base64 -w0 certificate.p12   # macOS/Linux
```

macOS signing uses `build/entitlements.mac.plist` (hardened runtime with JIT
allowed so V8 can run user code). Notarization is performed automatically by
electron-builder when the Apple credentials are present.

## Project layout

```
src/
  main/       Electron main process, Node executor, npm manager, snippets
  preload/    contextBridge API exposed to the renderer
  renderer/   React UI (Monaco editor, tabs, console, panels)
  shared/     types and the magic-comment transform
tests/        Vitest suite (dev only, safe to delete)
build/        app icons and macOS entitlements
```

## Not affiliated

JOTTER is an independent project. It is **not affiliated with, endorsed by, or
sponsored by RunJS (Haas Labs Ltd) or any other product**. The name, logo and
design are original to this project.

## License

MIT — see [LICENSE](./LICENSE). Third-party licenses are listed in
[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
