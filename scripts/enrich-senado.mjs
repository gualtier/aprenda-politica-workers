/**
 * Enriquece senadores com dados da API do Senado:
 * bio (nome completo, nascimento, partido/UF, e-mail).
 * Uso: node scripts/enrich-senado.mjs [--all]
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n')
  .filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] }))
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const ALL = process.argv.includes('--all')
const titleCase = s => (s || '').toLowerCase().replace(/(^|\s|')\p{L}/gu, c => c.toUpperCase())
const fmtDate = d => { if (!d) return ''; const [y, m, day] = d.split('-'); return `${day}/${m}/${y}` }

async function fetchSenador(cod, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 25000)
      const res = await fetch(`https://legis.senado.leg.br/dadosabertos/senador/${cod}.json`, { headers: { Accept: 'application/json' }, signal: ctrl.signal })
      clearTimeout(t)
      if (res.ok) return (await res.json())?.DetalheParlamentar?.Parlamentar ?? null
      if (res.status === 404) return null
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 800 * 2 ** i))
  }
  throw new Error('falha após retries')
}

function buildBio(p) {
  const ip = p.IdentificacaoParlamentar || {}
  const db = p.DadosBasicosParlamentar || {}
  const parts = []
  const nome = ip.NomeCompletoParlamentar
  if (nome) parts.push(`Nome completo: ${titleCase(nome)}.`)
  const local = [db.Naturalidade, db.UfNaturalidade].filter(Boolean).join('-')
  if (db.DataNascimento) parts.push(`Nascido(a)${local ? ` em ${local}` : ''} em ${fmtDate(db.DataNascimento)}.`)
  if (ip.SiglaPartidoParlamentar) parts.push(`Senador(a) pelo ${ip.SiglaPartidoParlamentar}-${ip.UfParlamentar}.`)
  if (ip.EmailParlamentar) parts.push(`Contato: ${ip.EmailParlamentar}.`)
  return parts.join(' ')
}

async function main() {
  const { data: pos } = await supabase.from('positions').select('id').eq('slug', 'senador').single()
  let q = supabase.from('politicians').select('id, external_id, name, bio').eq('position_id', pos.id).not('external_id', 'is', null)
  if (!ALL) q = q.is('bio', null)
  const { data: sens } = await q
  console.log(`[senado] ${sens?.length ?? 0} senadores a enriquecer (${ALL ? 'todos' : 'sem bio'})`)

  let ok = 0, fail = 0, skip = 0
  for (const sen of sens ?? []) {
    try {
      const p = await fetchSenador(sen.external_id)
      if (!p) { skip++; continue }
      const bio = buildBio(p)
      const site = p.IdentificacaoParlamentar?.UrlPaginaParticular
      const social = site && /^https?:\/\//.test(site) ? [{ platform: 'Site', url: site }] : undefined
      const patch = { bio: bio || null }
      if (social) patch.social_links = social
      await supabase.from('politicians').update(patch).eq('id', sen.id)
      ok++
    } catch (e) {
      fail++
      console.warn(`  ✗ ${sen.name}: ${e.message}`)
    }
    await new Promise(r => setTimeout(r, 150))
  }
  console.log(`[senado] concluído: ${ok} enriquecidos, ${skip} sem dados, ${fail} falhas`)
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
