// Envia de volta para o bucket "obra-arquivos" os arquivos de uma pasta de backup.
// Use em um projeto Supabase de destino já com as migrações aplicadas.
//
//   export SUPABASE_URL=https://<ref-destino>.supabase.co
//   export SUPABASE_SECRET_KEY=<chave secreta do projeto de destino>
//   node tools/backup/restaurar-arquivos.mjs backups/2026-10-09_1800
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
if (!url || !key || !process.argv[2]) { console.error('Uso: SUPABASE_URL=… SUPABASE_SECRET_KEY=… node restaurar-arquivos.mjs <pasta-do-backup>'); process.exit(1) }
const src = path.resolve(process.argv[2], 'arquivos')
const sb = createClient(url, key, { auth: { persistSession: false } })
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.pdf': 'application/pdf' }

function* files(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* files(p); else yield p
  }
}
let ok = 0, fail = 0
for (const f of files(src)) {
  const rel = path.relative(src, f).split(path.sep).join('/')
  const { error } = await sb.storage.from('obra-arquivos').upload(rel, fs.readFileSync(f), {
    upsert: true, contentType: MIME[path.extname(f).toLowerCase()] ?? 'application/octet-stream',
  })
  if (error) { fail++; console.error('falhou:', rel, error.message) } else ok++
}
console.log(`Restaurados ${ok} arquivos; ${fail} falhas.`)
if (fail) process.exit(2)
