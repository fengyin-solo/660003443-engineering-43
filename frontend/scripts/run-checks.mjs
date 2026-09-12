/**
 * check-data.ts 的运行器：用 esbuild（vite 自带依赖）打包后交给 node 执行，
 * 避免为运行 TS 检查脚本额外引入 ts-node / tsx 等依赖。
 */
import { buildSync } from 'esbuild'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outfile = join(root, 'node_modules', '.cache', 'check-data.mjs')

buildSync({
  entryPoints: [join(root, 'scripts', 'check-data.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  logLevel: 'warning',
})

// check-data.ts 在执行末尾通过 process.exit(1) 上报失败，退出码会直接透传
await import(pathToFileURL(outfile).href)
