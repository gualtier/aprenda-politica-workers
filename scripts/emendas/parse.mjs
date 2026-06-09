/** "10.000,00" -> 10000 (em reais). */
export function parseBRL(s) {
  if (!s) return 0
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/** "LONDRINA - PR" -> { municipio, uf }. UF sozinha -> {municipio:null, uf}. Nacional -> nulls. */
export function parseLocalidade(s) {
  const v = (s || '').trim().toUpperCase()
  if (!v || v === 'NACIONAL' || v === 'EXTERIOR' || v === 'MÚLTIPLO' || v === 'MULTIPLO') return { municipio: null, uf: null }
  const m = v.match(/^(.+?)\s*-\s*([A-Z]{2})$/)
  if (m) return { municipio: m[1].trim(), uf: m[2] }
  if (/^[A-Z]{2}$/.test(v)) return { municipio: null, uf: v }
  return { municipio: v, uf: null }
}

/** tipoEmenda -> grupo. */
export function tipoGrupo(t) {
  const s = (t || '').toLowerCase()
  if (s.includes('individual')) return 'individual'
  if (s.includes('bancada')) return 'bancada'
  if (s.includes('comiss')) return 'comissao'
  if (s.includes('relator')) return 'relator'
  return 'outro'
}
