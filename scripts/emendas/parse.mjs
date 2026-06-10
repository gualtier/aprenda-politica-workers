/** "10.000,00" -> 10000 (em reais). */
export function parseBRL(s) {
  if (!s) return 0
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/** Nome do estado (sem acento, maiúsculo) -> sigla. */
const UF_BY_NAME = {
  'ACRE': 'AC', 'ALAGOAS': 'AL', 'AMAPA': 'AP', 'AMAZONAS': 'AM', 'BAHIA': 'BA', 'CEARA': 'CE',
  'DISTRITO FEDERAL': 'DF', 'ESPIRITO SANTO': 'ES', 'GOIAS': 'GO', 'MARANHAO': 'MA',
  'MATO GROSSO': 'MT', 'MATO GROSSO DO SUL': 'MS', 'MINAS GERAIS': 'MG', 'PARA': 'PA',
  'PARAIBA': 'PB', 'PARANA': 'PR', 'PERNAMBUCO': 'PE', 'PIAUI': 'PI', 'RIO DE JANEIRO': 'RJ',
  'RIO GRANDE DO NORTE': 'RN', 'RIO GRANDE DO SUL': 'RS', 'RONDONIA': 'RO', 'RORAIMA': 'RR',
  'SANTA CATARINA': 'SC', 'SAO PAULO': 'SP', 'SERGIPE': 'SE', 'TOCANTINS': 'TO',
}
const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** "LONDRINA - PR" -> {municipio, uf}. "SÃO PAULO (UF)" -> destino estadual {null, uf}. Nacional/múltiplo -> nulls. */
export function parseLocalidade(s) {
  const v = (s || '').trim().toUpperCase()
  if (!v || v === 'NACIONAL' || v === 'EXTERIOR' || v === 'MÚLTIPLO' || v === 'MULTIPLO') return { municipio: null, uf: null }
  // "ESTADO (UF)" -> destino estadual (estado inteiro, sem município)
  if (v.endsWith('(UF)')) {
    const name = stripAccents(v.replace(/\s*\(UF\)\s*$/, '').trim())
    return { municipio: null, uf: UF_BY_NAME[name] ?? null }
  }
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
