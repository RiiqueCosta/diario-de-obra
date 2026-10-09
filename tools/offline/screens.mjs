// Capturas de tela com API do Supabase SIMULADA (dados de demonstração, só para revisão visual).
// Uso: node tools/offline/screens.mjs <saida> [rotas...]
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const require = createRequire('/opt/npm-tools/node_modules/')
const { chromium } = require('playwright')

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dist = path.join(root, 'dist-offline')
const outDir = path.resolve(process.argv[2] ?? '/tmp/screens')
fs.mkdirSync(outDir, { recursive: true })

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.map': 'application/json' }
const server = http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname))
  if (!p.startsWith(dist) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(dist, 'index.html')
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] ?? 'application/octet-stream' })
  fs.createReadStream(p).pipe(res)
}).listen(0)
const base = `http://127.0.0.1:${server.address().port}`

const ORG = '11111111-1111-4111-8111-111111111111'
const UID = '22222222-2222-4222-8222-222222222222'
const P1 = '33333333-3333-4333-8333-333333333331'
const now = new Date().toISOString()
const project = (id, code, name, status, pct, extra = {}) => ({
  id, organization_id: ORG, code, name, client_name: 'Cliente de demonstração', client_document: null, address: 'Rua Exemplo, 100', city: 'São Paulo', state: 'SP',
  description: 'Obra fictícia usada apenas para revisão visual.', technical_responsible: 'Eng. Responsável (demo)', technical_registration: 'CREA-SP 000000',
  start_date: '2026-03-02', expected_end_date: '2027-02-26', actual_end_date: null, status, progress_method: 'peso_etapa', progress_percentage: pct,
  cover_storage_key: null, general_notes: null, row_version: 1, created_by: UID, created_at: now, updated_at: now, archived_at: null, archived_by: null, ...extra,
})
const PROJECTS = [
  project(P1, 'OB-2026-014', 'Residencial Jardim das Águas — Bloco B', 'em_andamento', 42.5),
  project('33333333-3333-4333-8333-333333333332', 'OB-2026-009', 'Galpão logístico Cajamar', 'paralisada', 67),
  project('33333333-3333-4333-8333-333333333333', 'OB-2026-021', 'Reforma da sede administrativa', 'planejamento', 0),
]
const isAdmin = process.env.ROLE !== 'membro'

function api(url, method) {
  const u = new URL(url)
  const p = u.pathname
  if (p.endsWith('/rpc/accept_pending_invites')) return [200, 0]
  if (p.endsWith('/rpc/dashboard_summary')) return [200, { total_obras: 3, obras_em_andamento: 1, obras_concluidas: 0, obras_paralisadas: 1, obras_com_atraso: 1, diarios_hoje: 0, diarios_no_periodo: 0, diarios_pendentes: 0, diarios_devolvidos: 0, ocorrencias_abertas: 0, ocorrencias_sem_responsavel: 0, atividades_atrasadas: 2, atividades_bloqueadas: 0, pendencias_vencendo: 1, gerado_em: now }]
  if (p.endsWith('/rpc/my_project_permissions')) return [200, { 'obra.editar': true, is_admin: isAdmin, role: null }]
  if (p.endsWith('/profiles')) {
    if (u.searchParams.get('id')?.startsWith('in.')) return [200, [{ id: UID, name: 'Luiz Costa (demo)', email: 'demo@exemplo.invalid' }]]
    return [200, { id: UID, name: 'Luiz Costa (demo)', email: 'demo@exemplo.invalid', status: 'ativo', must_change_password: false, created_at: now, updated_at: now }]
  }
  if (p.endsWith('/organization_members')) {
    if (u.searchParams.get('select')?.includes('organization:organizations')) return [200, [{ id: 'm1', organization_id: ORG, role: isAdmin ? 'admin' : 'membro', status: 'ativo', organization: { id: ORG, name: 'Construtora Demonstração Ltda.', document_number: null, logo_storage_key: null } }]]
    return [200, [
      { id: 'm1', organization_id: ORG, user_id: UID, role: 'admin', status: 'ativo', created_at: now, updated_at: now, created_by: null, profile: { id: UID, name: 'Luiz Costa (demo)', email: 'demo@exemplo.invalid', status: 'ativo' } },
      { id: 'm2', organization_id: ORG, user_id: 'u2', role: 'membro', status: 'ativo', created_at: now, updated_at: now, created_by: null, profile: { id: 'u2', name: 'Marcos Encarregado (demo)', email: 'marcos@exemplo.invalid', status: 'ativo' } },
      { id: 'm3', organization_id: ORG, user_id: 'u3', role: 'membro', status: 'convidado', created_at: now, updated_at: now, created_by: null, profile: { id: 'u3', name: 'Ana Engenheira (demo)', email: 'ana@exemplo.invalid', status: 'ativo' } },
    ]]
  }
  if (p.endsWith('/notifications')) return [200, [], { 'content-range': '0-0/2' }]
  if (p.endsWith('/projects')) {
    const id = u.searchParams.get('id')
    if (id) return [200, PROJECTS.find((x) => `eq.${x.id}` === id) ?? null]
    return [200, PROJECTS, { 'content-range': `0-2/3` }]
  }
  if (p.endsWith('/project_members')) return [200, [
    { id: 'pm1', project_id: P1, user_id: 'u2', role: 'encarregado', permissions: {}, created_at: now, updated_at: now, created_by: null, profile: { id: 'u2', name: 'Marcos Encarregado (demo)', email: 'marcos@exemplo.invalid' } },
    { id: 'pm2', project_id: P1, user_id: 'u3', role: 'engenheiro', permissions: { 'diario.aprovar': false }, created_at: now, updated_at: now, created_by: null, profile: { id: 'u3', name: 'Ana Engenheira (demo)', email: 'ana@exemplo.invalid' } },
  ]]
  if (p.endsWith('/org_settings')) return [200, { organization_id: ORG, stale_project_days: 3, due_soon_days: 3, max_image_mb: 15, max_document_mb: 30, engineer_can_approve: true, allow_complementary_reports: true, updated_at: now }]
  if (p.endsWith('/audit_logs')) return [200, [
    { id: 'a1', organization_id: ORG, user_id: UID, project_id: P1, entity_type: 'projects', entity_id: P1, action: 'update', previous_values: { name: 'Residencial Jardim', status: 'planejamento' }, new_values: { name: 'Residencial Jardim das Águas — Bloco B', status: 'em_andamento' }, created_at: now },
    { id: 'a2', organization_id: ORG, user_id: UID, project_id: P1, entity_type: 'project_members', entity_id: 'pm1', action: 'insert', previous_values: null, new_values: { role: 'encarregado' }, created_at: now },
  ], { 'content-range': '0-1/2' }]
  return [200, []]
}

const browser = await chromium.launch()
const routes = process.argv.slice(3).length ? process.argv.slice(3) : ['/entrar', '/', '/obras', `/obras/${P1}`, '/obras/nova', '/config/usuarios']
for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'celular', width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, deviceScaleFactor: vp.deviceScaleFactor ?? 1, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
  await ctx.route(/supabase\.co/, async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    const [status, body, headers = {}] = api(req.url(), req.method())
    await route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', ...headers }, body: JSON.stringify(body) })
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  for (const r of routes) {
    if (r === '/entrar') {
      await page.goto(base + r)
    } else {
      await page.goto(base + '/entrar')
      await page.evaluate(([ref]) => {
        const exp = Math.floor(Date.now() / 1000) + 3600 * 24
        localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'demo', refresh_token: 'demo', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: '22222222-2222-4222-8222-222222222222', email: 'demo@exemplo.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } }))
      }, ['jywexpgdccyrhapvlzem'])
      await page.goto(base + r)
    }
    await page.waitForTimeout(900)
    const file = path.join(outDir, `${vp.name}${r.replace(/\//g, '_') || '_inicio'}.png`)
    await page.screenshot({ path: file, fullPage: true })
    console.log('captura', file)
  }
  if (errors.length) console.log(`[${vp.name}] erros no console:\n` + [...new Set(errors)].join('\n'))
  await ctx.close()
}
await browser.close()
server.close()
