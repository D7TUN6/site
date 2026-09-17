import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const DIST = path.join(process.cwd(), 'dist')
const htmlPath = path.join(DIST, 'index.html')

const html = await readFile(htmlPath, 'utf-8')

const cssMatch = html.match(/<link\s+rel="stylesheet"[^>]*href="([^"]*\.css)"[^>]*\/?>/i)
if (!cssMatch) {
  console.warn('inline-css: stylesheet link not found, leaving as-is')
  process.exit(0)
}

const cssPath = path.join(DIST, cssMatch[1].replace(/^\//, ''))
const css = await readFile(cssPath, 'utf-8')

const next = html.replace(cssMatch[0], `<style data-inline>\n${css}\n</style>`)
await writeFile(htmlPath, next)
await rm(cssPath, { force: true })

console.log(`inline-css: inlined ${path.basename(cssPath)} (${css.length} bytes) into dist/index.html`)