import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// lê .env simples
const env = Object.fromEntries(readFileSync('.env','utf8').split('\n')
  .filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0,i), l.slice(i+1)] }))

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const slugify = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
  .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')

const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']

let total = 0
for (const uf of UFS) {
  const { data: state } = await supabase.from('states').select('id').eq('abbr', uf).single()
  if (!state) { console.warn(`${uf}: estado não encontrado`); continue }
  const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`)
  if (!res.ok) { console.warn(`${uf}: IBGE ${res.status}`); continue }
  const raw = await res.json()
  const rows = raw.map(m => ({ name: m.nome, slug: slugify(m.nome), ibge_code: m.id, state_id: state.id, population: null }))
  const { error } = await supabase.from('municipalities').upsert(rows, { onConflict: 'ibge_code' })
  if (error) { console.error(`${uf}: ${error.message}`); continue }
  total += rows.length
  console.log(`${uf}: ${rows.length} municípios`)
}
console.log(`\nTOTAL: ${total} municípios`)
