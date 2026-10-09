// Build offline com esbuild (equivalente ao `vite build` para verificação local).
// Uso: node tools/offline/build.mjs [--watch]  → gera dist-offline/
import * as esbuild from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const vendor = process.env.VENDOR ?? '/home/claude/vendor-src'
const core = `${vendor}/supabase-js/packages/core`
const out = path.join(root, 'dist-offline')
const env = {
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? 'https://jywexpgdccyrhapvlzem.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_7-wXjWJl93gtwSA8qy-Wkg_XopbgYct',
}

fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })

await esbuild.build({
  entryPoints: [path.join(root, 'src/main.tsx')],
  bundle: true,
  format: 'esm',
  splitting: true,
  outdir: path.join(out, 'assets'),
  sourcemap: true,
  target: 'es2022',
  jsx: 'automatic',
  loader: { '.svg': 'file', '.png': 'file' },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(env.VITE_SUPABASE_PUBLISHABLE_KEY),
    'process.env.NODE_ENV': '"production"',
  },
  alias: {
    '@': path.join(root, 'src'),
    '@supabase/supabase-js': `${core}/supabase-js/src/index.ts`,
    '@supabase/auth-js': `${core}/auth-js/src/index.ts`,
    '@supabase/postgrest-js': `${core}/postgrest-js/src/index.ts`,
    '@supabase/storage-js': `${core}/storage-js/src/index.ts`,
    '@supabase/functions-js': `${core}/functions-js/src/index.ts`,
    '@supabase/realtime-js': `${core}/realtime-js/src/index.ts`,
    '@supabase/phoenix': `${vendor}/phoenix/priv/static/phoenix.mjs`,
    'iceberg-js': `${vendor}/iceberg-js/src/index.ts`,
    '@supabase/tracing': `${vendor}/supabase-js/packages/shared/tracing/src/index.ts`,
  },
  nodePaths: [path.join(root, 'node_modules'), '/opt/npm-tools/node_modules'],
  minify: true,
  logLevel: 'warning',
})

// index.html com o bundle no lugar do script do Vite
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace('<script type="module" src="/src/main.tsx"></script>',
           '<link rel="stylesheet" href="/assets/main.css" />\n    <script type="module" src="/assets/main.js"></script>')
fs.writeFileSync(path.join(out, 'index.html'), html)
for (const f of fs.readdirSync(path.join(root, 'public'))) {
  fs.copyFileSync(path.join(root, 'public', f), path.join(out, f))
}
console.log('ok: dist-offline gerado')
