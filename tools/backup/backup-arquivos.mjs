// Copia todos os arquivos do bucket privado "obra-arquivos" para uma pasta local.
// Rode no SEU computador. A chave secreta dá acesso total: nunca a coloque no site,
// no Git ou em mensagens.
//
//   export SUPABASE_URL=https://<ref>.supabase.co
//   export SUPABASE_SECRET_KEY=<chave secreta (service_role) do painel do Supabase>
//   node tools/backup/backup-arquivos.mjs backups/2026-10-09_1800
//
// Requer: npm install (usa @supabase/supabase-js do próprio projeto). Arquivos já copiados
// com o mesmo tamanho são pulados, então dá para rodar de novo para continuar.
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
if (!url || !key) { console.error('Defina SUPABASE_URL e SUPABASE_SECRET_KEY.'); process.exit(1) }
const dest = path.resolve(process.argv[2] ?? `backups/${new Date().toISOString().slice(0, 10)}`, 'arquivos')
const BUCKET = 'obra-arquivos'
const sb = createClient(url, key, { auth: { persistSession: false } })

async function* walk(prefix) {
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from(BUCKET).list(prefix, { limit: 1000, offset })
    if (error) throw error
    for (const item of data) {
      const full = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id === null) yield* walk(full) // pasta
      else yield { path: full, size: item.metadata?.size ?? -1 }
    }
    if (data.length < 1000) break
  }
}

let copied = 0, skipped = 0, failed = 0
for await (const f of walk('')) {
  const out = path.join(dest, f.path)
  if (fs.existsSync(out) && fs.statSync(out).size === f.size) { skipped++; continue }
  const { data, error } = await sb.storage.from(BUCKET).download(f.path)
  if (error) { failed++; console.error('falhou:', f.path, error.message); continue }
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, Buffer.from(await data.arrayBuffer()))
  copied++
  if (copied % 50 === 0) console.log(`${copied} arquivos copiados…`)
}
console.log(`Concluído: ${copied} copiados, ${skipped} já existiam, ${failed} falhas. Pasta: ${dest}`)
if (failed) process.exit(2)
