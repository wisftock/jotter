# WisfJS

A fast, free and open-source desktop scratchpad for JavaScript, TypeScript, JSX
and TSX. Sketch an idea, test a regex, hit an API or try a package — all without
setting up a project.

Live evaluation with **Node.js** and **browser** runtimes, npm packages and
snippets. No license, no paywall.

## Features

- **Live evaluation** — code runs as you type (debounced), or press `Ctrl/Cmd + Enter`.
- **Two environments**
  - **Node.js**: full Node APIs, `require`/`import`, top-level `await` and npm packages.
  - **Browser**: DOM and Web APIs, executed in a sandboxed frame.
- **Magic comments** — append `//?` to any line to print its value inline:
  ```js
  const doubled = [1, 2, 3].map((n) => n * 2)
  doubled //? doubled values
  ```
- **Every expression** is evaluated and shown automatically, without labels.
- **Multiple work tabs** — several independent sessions open from the start
  (double-click a tab to rename, `+` to add, `×` to close).
- **Languages** — JavaScript, TypeScript, JSX and TSX. JSX/TSX use the
  automatic React runtime (no `import React` needed).
- **Web View** — mount React apps into a sandboxed preview with a `#root`
  element. Install `react` and `react-dom`, pick a JSX/TSX language, a Browser
  environment, and enable **Web View**:
  ```jsx
  import { createRoot } from 'react-dom/client'

  function App() {
    return <h1>Hello from WisfJS</h1>
  }

  createRoot(document.getElementById('root')).render(<App />)
  ```
- **npm in the browser** — the Browser environment bundles your snippet with
  esbuild so packages like React, styled-components, etc. work there too.
- **npm packages** — install packages from the Packages panel; the npm CLI ships
  with the app, so no system Node.js is required.
- **Snippets** — save and reopen code fragments.
- **Self-cleaning (with a choice)** — temporary files are always removed. When
  you close the app it asks whether to keep or delete the installed npm
  packages, so your work is only discarded when you want it to be.

## Requirements

- To run from source: Node.js 20+.
- To use the packaged app: none.

## Development

```bash
npm install
npm run dev        # start with hot reload
npm run typecheck  # type-check main, preload and renderer
npm test           # run the test suite (Vitest)
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

`.gitlab-ci.yml` runs type-check, tests and build on every push/MR. On a tag it
packages the Linux AppImage automatically and creates a GitLab **Release**;
Windows/macOS packaging jobs run on self-hosted runners tagged `windows`/`macos`.

GitHub Actions workflows are also provided under `.github/workflows/` in case
the project is mirrored to GitHub (delete `.github/` if you only use GitLab).

### Bump the version

Locally (needs push access to the repo):

```bash
npm run release:patch   # or release:minor / release:major
```

This bumps `package.json`, commits and pushes the `vX.Y.Z` tag, which triggers
the packaging/release jobs.

### Code signing (optional but recommended)

Set these as **CI/CD variables** in GitLab (or repository secrets on GitHub).
Without them the builds are unsigned: macOS users will hit Gatekeeper and
Windows users will see SmartScreen warnings.

| Secret | Platform | Description |
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
build/        app icons
```

## Not affiliated

WisfJS is an independent project. It is **not affiliated with, endorsed by, or
sponsored by RunJS (Haas Labs Ltd) or any other product**. The name, logo and
design are original to this project.

## License

MIT — see [LICENSE](./LICENSE). Third-party licenses are listed in
[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
