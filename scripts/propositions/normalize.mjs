export function slugify(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function normalizeType(t) {
  return (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
}

export function buildSlug({ type, number, year, source, externalId }) {
  const t = slugify(type)
  if (number && year) return `${t}-${number}-${year}`
  if (year) return `${t}-${year}-${slugify(source)}-${slugify(externalId)}`
  return `${t}-${slugify(source)}-${slugify(externalId)}`
}

export function dedupeAuthors(authors) {
  const byName = new Map()
  for (const a of authors) {
    if (!a.author_name) continue
    if (!byName.has(a.author_name)) byName.set(a.author_name, a)
  }
  return [...byName.values()]
}

// Tipos substantivos de interesse cidadão (exclui lixo procedural: REQ, RIC, EMC, PRL, RPD, DOC...).
export const SUBSTANTIVE_TYPES = new Set([
  'PL', 'PLP', 'PEC', 'PDL', 'PLV', 'MPV', 'PRC', 'PRS', 'PLN', 'PLC', 'PDS', 'PLS',
])
