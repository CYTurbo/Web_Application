// Stitches the dist-single build into one HTML fragment with everything inline,
// for hosts that serve a single page and block outside requests.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

const dir = 'dist-single/assets'
const files = readdirSync(dir)
const read = (ext) => files.filter((f) => f.endsWith(ext)).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n')
const js = read('.js').replace(/<\/script/gi, '<\\/script')
const out = process.argv[2] ?? 'dist-single/portfolio-lens.html'
writeFileSync(
  out,
  `<title>Portfolio Lens</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>${read('.css')}</style>
<div id="root"></div>
<script type="module">${js}</script>
`,
)
console.log(`${out}: ${(readFileSync(out).length / 1024).toFixed(0)} KB, ${files.length} asset files`)
