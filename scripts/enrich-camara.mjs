/**
 * Enriquece deputados federais com dados da API da Câmara:
 * bio (nome civil, nascimento, escolaridade) + redes sociais.
 * Uso: node scripts/enrich-camara.mjs [--all]   (default: só quem não tem bio)
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n')
  .filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] }))
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const ALL = process.argv.includes('--all')
const API = 'https://dadosabertos.camara.leg.br/api/v2'

const titleCase = s => (s || '').toLowerCase().replace(/(^|\s|')\p{L}/gu, c => c.toUpperCase())
const fmtDate = d => { if (!d) return ''; const [y, m, day] = d.split('-'); return `${day}/${m}/${y}` }

function platformOf(url) {
  const u = url.toLowerCase()
  if (u.includes('instagram')) return 'Instagram'
  if (u.includes('facebook')) return 'Facebook'
  if (u.includes('twitter') || /\/\/(www\.)?x\.com/.test(u)) return 'Twitter'
  if (u.includes('youtube')) return 'YouTube'
  if (u.includes('tiktok')) return 'TikTok'
  if (u.includes('linkedin')) return 'LinkedIn'
  if (u.includes('flickr')) return 'Flickr'
  return 'Site'
}

async function fetchDeputado(id, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 25000)
      const res = await fetch(`${API}/deputados/${id}`, { headers: { Accept: 'application/json' }, signal: ctrl.signal })
      clearTimeout(t)
      if (res.ok) return (await res.json()).dados
      if (res.status === 404) return null
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 800 * 2 ** i))
  }
  throw new Error('falha após retries')
}

function buildBio(d) {
  const us = d.ultimoStatus || {}
  const parts = []
  if (d.nomeCivil) parts.push(`Nome civil: ${titleCase(d.nomeCivil)}.`)
  const local = [d.municipioNascimento, d.ufNascimento].filter(Boolean).join('-')
  if (d.dataNascimento) parts.push(`Nascido(a)${local ? ` em ${local}` : ''} em ${fmtDate(d.dataNascimento)}.`)
  if (d.escolaridade) parts.push(`Formação: ${d.escolaridade}.`)
  if (us.siglaPartido) parts.push(`Deputado(a) Federal pelo ${us.siglaPartido}-${us.siglaUf}.`)
  if (us.email) parts.push(`Contato: ${us.email}.`)
  return parts.join(' ')
}

async function main() {
  const { data: pos } = await supabase.from('positions').select('id').eq('slug', 'deputado-federal').single()
  let q = supabase.from('politicians').select('id, external_id, name, bio').eq('position_id', pos.id).not('external_id', 'is', null)
  if (!ALL) q = q.is('birth_date', null)
  const { data: deps } = await q
  console.log(`[camara] ${deps?.length ?? 0} deputados a enriquecer (${ALL ? 'todos' : 'sem bio'})`)

  let ok = 0, fail = 0, skip = 0
  for (const dep of deps ?? []) {
    try {
      const d = await fetchDeputado(dep.external_id)
      if (!d) { skip++; continue }
      const us = d.ultimoStatus || {}
      const patch = {}
      const bio = buildBio(d); if (bio) patch.bio = bio
      const social = (d.redeSocial || []).filter(Boolean).map(url => ({ platform: platformOf(url), url }))
      if (social.length) patch.social_links = social
      // campos estruturados
      if (d.dataNascimento && !Number.isNaN(Date.parse(d.dataNascimento))) patch.birth_date = d.dataNascimento
      if (d.sexo === 'M' || d.sexo === 'F') patch.gender = d.sexo
      if (d.escolaridade) patch.education = d.escolaridade
      if (/^[A-Z]{2}$/.test(d.ufNascimento || '')) patch.birth_state = d.ufNascimento
      const email = (us.email || '').trim().toLowerCase()
      if (email.includes('@')) patch.email = email
      if (Object.keys(patch).length) await supabase.from('politicians').update(patch).eq('id', dep.id)
      ok++
      if (ok % 50 === 0) console.log(`  ...${ok} ok`)
    } catch (e) {
      fail++
      console.warn(`  ✗ ${dep.name}: ${e.message}`)
    }
    await new Promise(r => setTimeout(r, 120)) // gentil com a API
  }
  console.log(`[camara] concluído: ${ok} enriquecidos, ${skip} sem dados, ${fail} falhas`)
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
