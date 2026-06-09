import { registry } from './propositions/registry.mjs'
import { ingest } from './propositions/ingest.mjs'

const source = process.argv[2]
const adapter = registry[source]
if (!adapter) {
  console.error(`fonte inválida: "${source}". Disponíveis: ${Object.keys(registry).join(', ')}`)
  process.exit(1)
}
ingest(adapter, { sinceYear: 2023 }).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
