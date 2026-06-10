const ORGAOS = [
  { query: '"Câmara dos Deputados"', orgao: 'Câmara dos Deputados', category: 'camara',  sphere: 'federal', label: 'Câmara dos Deputados' },
  { query: '"Senado Federal"',       orgao: 'Senado Federal',       category: 'senado',  sphere: 'federal', label: 'Senado Federal' },
  { query: '"Supremo Tribunal Federal" OR STF', orgao: 'STF',       category: 'justica', sphere: 'federal', label: 'STF' },
  { query: '"Tribunal Superior Eleitoral" OR TSE', orgao: 'TSE',    category: 'eleicoes',sphere: 'federal', label: 'TSE' },
]

const TEMAS = [
  { slug: 'saude', query: 'saúde política Brasil', category: 'governo' },
  { slug: 'educacao', query: 'educação política Brasil', category: 'governo' },
  { slug: 'seguranca', query: 'segurança pública Brasil', category: 'justica' },
  { slug: 'meio-ambiente', query: 'meio ambiente política Brasil', category: 'governo' },
  { slug: 'economia-impostos', query: 'economia impostos Brasil congresso', category: 'economia' },
  { slug: 'trabalho', query: 'trabalho emprego política Brasil', category: 'economia' },
  { slug: 'transporte', query: 'transporte mobilidade política Brasil', category: 'cidades' },
]

const CARGO_TERM = {
  'presidente': 'presidente', 'governador': 'governador', 'senador': 'senador',
  'deputado-federal': 'deputado federal', 'deputado-estadual': 'deputado estadual',
}
const CARGO_CAT = {
  'presidente': ['governo', 'federal'], 'governador': ['governo', 'estadual'],
  'senador': ['senado', 'federal'], 'deputado-federal': ['camara', 'federal'],
  'deputado-estadual': ['governo', 'estadual'],
}

export async function buildSeed(supabase) {
  const seed = []
  for (const o of ORGAOS) seed.push({ ...o, role: 'principal' })
  for (const t of TEMAS) seed.push({ query: t.query, role: 'principal', category: t.category, sphere: 'federal', label: null, topicSlug: t.slug })

  const cargos = Object.keys(CARGO_TERM)
  const { data: positions } = await supabase.from('positions').select('id, slug').in('slug', cargos)
  const posIds = (positions ?? []).map(p => p.id)
  const posSlug = Object.fromEntries((positions ?? []).map(p => [p.id, p.slug]))
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('politicians')
      .select('id, name, position_id').in('position_id', posIds).range(from, from + 999)
    const batch = data ?? []
    for (const p of batch) {
      const slug = posSlug[p.position_id]
      const [category, sphere] = CARGO_CAT[slug] ?? ['governo', 'federal']
      seed.push({
        query: `"${p.name}" ${CARGO_TERM[slug]}`,
        role: 'principal', politician_id: p.id, category, sphere, label: p.name,
      })
    }
    if (batch.length < 1000) break
  }
  return seed
}
