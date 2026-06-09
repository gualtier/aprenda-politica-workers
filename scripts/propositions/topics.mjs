// Espelho de aprenda-politica/src/lib/topics.ts (regras de classificação). Manter em sincronia.
const TOPIC_KEYWORDS = {
  'saude': 'saude|sus|hospital|posto de saude|ubs|medic|enfermag|vacina|imuniz|doenca|epidemi|pandemia|farmac|remedio|medicament|cancer|diabetes|saude mental|psicolog|psiquiatr|samu|plano de saude|anvisa|sanitari',
  'educacao': 'educac|escola|ensino|aluno|professor|universidad|faculdad|creche|alfabetiz|merenda|fundeb|enem|bolsa de estudo|magisterio|pedagog|curricul|analfabet',
  'seguranca': 'seguranca publica|policia|policial|crime|criminal|violencia|homicidio|furto|roubo|trafico| pena |presidio|penitenciari|delegacia|arma de fogo|porte de arma|codigo penal|feminicidio|milicia|guarda municipal',
  'meio-ambiente': 'meio ambiente|ambiental|desmatament|floresta|amazonia|clima|aquecimento global|poluic|residuo|reciclag| agua |saneament|fauna|flora|biodiversidad|sustentavel|carbono|energia renovavel|preservac',
  'trabalho': 'trabalh|emprego|clt|salario|fgts|sindicato|aposentad|previdenc|inss|jornada|ferias|demiss|carteira|estagi|terceirizac|piso salarial|seguro-desemprego',
  'economia-impostos': 'imposto|tribut|icms| iss |ipva|iptu|imposto de renda| taxa |aliquota|fiscal|orcament|divida publica|juros|inflac| credito |financ|economia|microempresa|simples nacional| mei ',
  'mulher': 'mulher|feminin|feminic|maria da penha|violencia domestica|igualdade de genero|materni|gestante|assedio',
  'animais': 'maus-tratos|maus tratos|bem-estar animal|protecao animal|animais|crueldade contra|veterinari|zoonose|adocao de animais|castracao| pet ',
  'transporte': 'transporte|transito|veiculo|automovel|motocicleta| ctb |codigo de transito|rodovia|pedagio|onibus| metro |ciclovia| cnh |habilitac|estacionament|mobilidade urbana',
  'tecnologia': 'internet| digital|dados pessoais| lgpd |tecnolog|software|aplicativo|rede social|cibern|inteligencia artificial|telecomunicac|provedor|marco civil',
  'consumidor': 'consumidor| cdc |codigo de defesa do consumidor|procon|publicidade enganosa| cobranca|fornecedor|relacao de consumo',
  'crianca': 'crianca|infanti|adolescent| eca |estatuto da crianca| menor |bullying|trabalho infantil|pensao aliment',
  'idoso': 'idos|terceira idade|estatuto do idoso|envelheciment|asilo|longevidad',
  'cultura-esporte': 'cultura|cultural|artist|patrimonio historico| musica|cinema|teatro|esporte|esportiv|atleta|olimpic|futebol|lei rouanet',
  'agro': 'agricultura|agropecuari|agricultor| rural|agronegoci|pecuari| safra |fazend|plantio|colheita|defensivo|agrotoxico|reforma agraria',
}
const norm = s => ` ${(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()} `
const RES = Object.entries(TOPIC_KEYWORDS).map(([slug, kw]) => ({ slug, re: new RegExp(`(${kw})`, 'i') }))

export function classifyTopics(title, summary, themes) {
  const text = norm(`${title || ''} ${summary || ''} ${(themes || []).join(' ')}`)
  return RES.filter(({ re }) => re.test(text)).map(({ slug }) => slug)
}
