/** Classifica topics[] de todas as proposições (idempotente). */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { classifyTopics } from './propositions/topics.mjs'

const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n')
  .filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] }))
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function runPool(items, worker, concurrency = 25) {
  let idx = 0, done = 0
  async function lane() {
    while (idx < items.length) {
      const it = items[idx++]
      try { await worker(it) } catch (e) { console.warn('  ✗', e.message) }
      if (++done % 2000 === 0) console.log(`  ...${done}/${items.length}`)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, lane))
}

async function main() {
  const rows = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from('propositions')
      .select('id, title, summary, themes').order('id').range(from, from + 999)
    if (error) throw error
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 1000) break
    from += data.length
  }
  console.log(`[topics] ${rows.length} proposições a classificar`)
  let comTema = 0
  await runPool(rows, async (p) => {
    const topics = classifyTopics(p.title, p.summary, p.themes ?? [])
    if (topics.length) comTema++
    await supabase.from('propositions').update({ topics }).eq('id', p.id)
  })
  console.log(`[topics] concluído: ${comTema} com ≥1 tema, ${rows.length - comTema} sem tema`)
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
