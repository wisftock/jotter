import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { sep } from 'node:path'

/**
 * Computes the real path of the esbuild native binary.
 *
 * In a packaged app `require.resolve` returns a virtual path inside
 * `app.asar`, e.g. `.../app.asar/node_modules/@esbuild/<platform>/bin/esbuild`.
 * That path cannot be spawned (an asar archive is a single file), so it is
 * remapped to the unpacked copy. Note that `app.asar.unpacked` also contains
 * the substring `app.asar`, so the check must include the trailing separator.
 *
 * Exported for testing; returns `null` when no real binary path can be found.
 */
export function computeEsbuildBinaryPath(
  resolve: (specifier: string) => string,
  exists: (path: string) => boolean,
  platform: NodeJS.Platform = process.platform
): string | null {
  try {
    const pkg = `@esbuild/${platform}-${process.arch}`
    const subpath = platform === 'win32' ? 'esbuild.exe' : 'bin/esbuild'
    let bin = resolve(`${pkg}/${subpath}`)

    const asarSegment = `app.asar${sep}`
    if (bin.includes(asarSegment)) {
      const unpacked = bin.replace(asarSegment, `app.asar.unpacked${sep}`)
      if (exists(unpacked)) bin = unpacked
    }

    // Only trust a real on-disk path; a remaining asar segment cannot be spawned.
    if (!bin.includes(asarSegment) && exists(bin)) return bin
    return null
  } catch {
    return null
  }
}

/**
 * Points ESBUILD_BINARY_PATH at the unpacked esbuild binary before esbuild is
 * required (esbuild reads the variable when its module is first evaluated).
 */
export function setupEsbuildBinaryPath(): void {
  if (process.env.ESBUILD_BINARY_PATH) return
  try {
    const require_ = createRequire(__filename)
    const bin = computeEsbuildBinaryPath((specifier) => require_.resolve(specifier), existsSync)
    if (bin) process.env.ESBUILD_BINARY_PATH = bin
  } catch {
    /* fall back to esbuild's own resolution */
  }
}
