/**
 * Nome do estado -> sigla.
 *
 * Existe porque o MapTiler nao devolve a sigla na geocodificacao reversa: o
 * campo `subregion` traz o nome por extenso ("Sao Paulo") e `region` traz uma
 * agregacao inutil para endereco ("Regiao Sudeste"). Sao 27 entradas fixas,
 * mais barato que depender de um campo que a API nao tem.
 *
 * As chaves ficam sem acento e em minusculas — ver `siglaDoEstado`.
 */
const SIGLAS: Record<string, string> = {
  acre: 'AC',
  alagoas: 'AL',
  amapa: 'AP',
  amazonas: 'AM',
  bahia: 'BA',
  ceara: 'CE',
  'distrito federal': 'DF',
  'espirito santo': 'ES',
  goias: 'GO',
  maranhao: 'MA',
  'mato grosso': 'MT',
  'mato grosso do sul': 'MS',
  'minas gerais': 'MG',
  para: 'PA',
  paraiba: 'PB',
  parana: 'PR',
  pernambuco: 'PE',
  piaui: 'PI',
  'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN',
  'rio grande do sul': 'RS',
  rondonia: 'RO',
  roraima: 'RR',
  'santa catarina': 'SC',
  'sao paulo': 'SP',
  sergipe: 'SE',
  tocantins: 'TO',
};

function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Devolve a sigla, ou null quando o nome nao e de um estado brasileiro. */
export function siglaDoEstado(nome: string | null | undefined): string | null {
  if (!nome) return null;
  return SIGLAS[semAcento(nome)] ?? null;
}

/** Monta "Sao Paulo, SP". Sem a sigla, devolve so a cidade. */
export function rotuloDeLugar(cidade: string | null, estado: string | null): string | null {
  if (!cidade) return estado ?? null;
  const sigla = siglaDoEstado(estado);
  return sigla ? `${cidade}, ${sigla}` : cidade;
}
