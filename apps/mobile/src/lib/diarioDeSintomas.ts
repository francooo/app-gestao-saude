import { Feather } from '@expo/vector-icons';
import { isSameDay, startOfDay, subDays } from 'date-fns';

import type { SymptomEntry, SymptomKind } from '@/api/health';
import { diaCurto, hora } from '@/lib/posologia';

/**
 * As regras do diario de sintomas, sem React e sem rede.
 *
 * Irmao de posologia.ts, e pelo mesmo motivo: e a unica peca desta entrega
 * conferivel sem aparelho, e e onde moram os numeros que vao precisar de
 * ajuste depois que alguem usar.
 */

export type DefinicaoDeTipo = {
  chave: SymptomKind;
  rotulo: string;
  icone: keyof typeof Feather.glyphMap;
  /** Titulo do grupo da escala. Em humor e sono nao se diz "intensidade". */
  nomeDaEscala: string;
  /** Os cinco degraus, do 1 ao 5. */
  degraus: readonly [string, string, string, string, string];
  /**
   * Em qual direcao o 5 aponta.
   *
   * 'pior' nos quatro sintomas, 'melhor' em humor e sono. E isto que impede um
   * grafico unico misturando tipos: seriam duas escalas de direcoes opostas no
   * mesmo eixo.
   */
  direcao: 'pior' | 'melhor';
};

const INTENSIDADE = ['Muito leve', 'Leve', 'Moderada', 'Forte', 'Muito forte'] as const;

/**
 * Os seis tipos.
 *
 * Pressao e glicemia NAO estao aqui de proposito: sao medicoes (120/80 mmHg,
 * 95 mg/dL) e nao cabem numa escala de 1 a 5 — guardar "pressao: 3" jogaria
 * fora o numero que o medico quer ver. Viram dominio proprio.
 *
 * Os icones sao aproximacoes onde o Feather nao tem o desenho exato (`frown`
 * para nausea e a mais fraca das seis). Abrir uma segunda familia de icones
 * por causa de um glifo faria ele destoar no meio dos outros cinco.
 */
export const TIPOS_DE_SINTOMA: readonly DefinicaoDeTipo[] = [
  { chave: 'febre', rotulo: 'Febre', icone: 'thermometer', nomeDaEscala: 'Intensidade', degraus: INTENSIDADE, direcao: 'pior' },
  { chave: 'dor', rotulo: 'Dor', icone: 'zap', nomeDaEscala: 'Intensidade', degraus: INTENSIDADE, direcao: 'pior' },
  { chave: 'nausea', rotulo: 'Náusea', icone: 'frown', nomeDaEscala: 'Intensidade', degraus: INTENSIDADE, direcao: 'pior' },
  { chave: 'tosse', rotulo: 'Tosse', icone: 'wind', nomeDaEscala: 'Intensidade', degraus: INTENSIDADE, direcao: 'pior' },
  {
    chave: 'humor',
    rotulo: 'Humor',
    icone: 'smile',
    nomeDaEscala: 'Como está o humor',
    // Adverbios, que nao tem genero: o registro pode ser de qualquer pessoa.
    degraus: ['Muito mal', 'Mal', 'Normal', 'Bem', 'Muito bem'],
    direcao: 'melhor',
  },
  {
    chave: 'sono',
    rotulo: 'Sono',
    icone: 'moon',
    nomeDaEscala: 'Como foi o sono',
    degraus: ['Péssimo', 'Ruim', 'Razoável', 'Bom', 'Ótimo'],
    direcao: 'melhor',
  },
];

export function tipoDe(chave: string): DefinicaoDeTipo | null {
  return TIPOS_DE_SINTOMA.find((t) => t.chave === chave) ?? null;
}

/** "Hoje", "Ontem", "26/09". */
export function rotuloDoDia(d: Date, agora: Date): string {
  if (isSameDay(d, agora)) return 'Hoje';
  if (isSameDay(d, subDays(agora, 1))) return 'Ontem';
  return diaCurto(d);
}

/**
 * "Febre moderada · 38,2 °C", "Humor: bem".
 *
 * Humor e sono usam dois-pontos porque "Humor bem" nao e portugues.
 */
export function descricaoDoRegistro(r: SymptomEntry): string {
  const t = tipoDe(r.kind);
  if (!t) return 'Registro';

  const grau = t.degraus[Math.min(Math.max(r.intensity, 1), 5) - 1]!.toLowerCase();
  const base = t.direcao === 'melhor' ? `${t.rotulo}: ${grau}` : `${t.rotulo} ${grau}`;

  if (r.kind === 'febre' && typeof r.temperatureC === 'number') {
    return `${base} · ${r.temperatureC.toFixed(1).replace('.', ',')} °C`;
  }
  return base;
}

export function momentoDoRegistro(r: SymptomEntry, agora: Date): string {
  const d = new Date(r.occurredAt);
  return `${rotuloDoDia(d, agora)} · ${hora(d)}`;
}

// ---------------------------------------------------------------------------
// O grafico
// ---------------------------------------------------------------------------

export type Barra = {
  chave: string;
  rotulo: string;
  /** null = dia sem registro. Nao e zero: zero nao existe nesta escala. */
  valor: number | null;
  hoje: boolean;
};

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/**
 * As barras dos ultimos N dias para UM tipo.
 *
 * Sempre devolve N colunas: dia sem registro vira trilho vazio, que e
 * informacao ("nao anotei nesse dia") e nao buraco.
 *
 * COMO VARIOS REGISTROS DO MESMO DIA VIRAM UMA BARRA, e isto precisa estar na
 * legenda da tela para ninguem adivinhar:
 *  - nos quatro sintomas, o PIOR momento do dia (o maior valor);
 *  - em humor e sono, o ULTIMO registro do dia.
 * A diferenca existe porque a direcao da escala se inverte: "o pior humor do
 * dia" seria o menor numero, e mostrar o menor faria a barra encolher quando a
 * pessoa piorou.
 */
export function barrasDaJanela(
  registros: SymptomEntry[],
  tipo: DefinicaoDeTipo,
  agora: Date,
  dias: number,
): Barra[] {
  const doTipo = registros.filter((r) => r.kind === tipo.chave);
  const barras: Barra[] = [];

  for (let i = dias - 1; i >= 0; i--) {
    const dia = subDays(agora, i);
    const doDia = doTipo
      .map((r) => ({ r, quando: new Date(r.occurredAt) }))
      .filter((x) => isSameDay(x.quando, dia))
      .sort((a, b) => a.quando.getTime() - b.quando.getTime());

    let valor: number | null = null;
    if (doDia.length > 0) {
      valor =
        tipo.direcao === 'pior'
          ? Math.max(...doDia.map((x) => x.r.intensity))
          : doDia[doDia.length - 1]!.r.intensity;
    }

    barras.push({
      chave: startOfDay(dia).toISOString(),
      rotulo: i === 0 ? 'hoje' : DIAS_CURTOS[dia.getDay()]!,
      valor,
      hoje: i === 0,
    });
  }

  return barras;
}

/** Quantos registros daquele tipo existem na janela — decide se o grafico aparece. */
export function quantosNaJanela(registros: SymptomEntry[], tipo: DefinicaoDeTipo): number {
  return registros.filter((r) => r.kind === tipo.chave).length;
}

export function legendaDoGrafico(tipo: DefinicaoDeTipo): string {
  const agregacao =
    tipo.direcao === 'pior'
      ? 'Cada barra é o pior momento do dia.'
      : 'Cada barra é o último registro do dia.';
  const direcao =
    tipo.direcao === 'pior' ? 'Barra mais alta, sintoma mais forte.' : 'Barra mais alta, melhor.';
  return `${agregacao} ${direcao}`;
}

/** A serie inteira em palavras, para o leitor de tela. */
export function descricaoDoGrafico(barras: Barra[], tipo: DefinicaoDeTipo): string {
  const partes = barras.map((b) => {
    const nome = b.hoje ? 'Hoje' : b.rotulo;
    if (b.valor == null) return `${nome}: sem registro.`;
    return `${nome}: ${b.valor}, ${tipo.degraus[b.valor - 1]!.toLowerCase()}.`;
  });
  return `${tipo.rotulo} nos últimos ${barras.length} dias. ${partes.join(' ')}`;
}

// ---------------------------------------------------------------------------
// A hora digitada
// ---------------------------------------------------------------------------

/**
 * Insere o `:` enquanto se digita. Mesmo comportamento do formulario de
 * remedio, de proposito: duas mascaras de hora divergentes no mesmo aplicativo
 * custam mais do que a diferenca que elas resolveriam.
 *
 * O QUE ELA NAO FAZ, e o comentario de la afirma que faz: "830" vira "83:0",
 * nao "08:30". Quem quer 8h30 digita "0830". Tentei consertar e o conserto e
 * pior — com digitacao progressiva, "2530" passaria por "253" e saltaria para
 * "02:53" no meio do caminho. Como `horaValida` recusa e o campo diz o
 * formato, o erro e visivel e barato de corrigir.
 */
export function formatarHora(valor: string): string {
  const digitos = valor.replace(/\D/g, '').slice(0, 4);
  return digitos.length <= 2 ? digitos : `${digitos.slice(0, 2)}:${digitos.slice(2)}`;
}

export function horaValida(texto: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(texto);
}

/**
 * O instante do registro, montado com o relogio do APARELHO.
 *
 * O servidor roda em UTC e nao sabe que dia e hoje aqui — quem resolve isso e
 * quem tem o relogio. Devolve Date; quem envia chama toISOString(), que o
 * contrato aceita porque exige offset.
 */
export function momentoEscolhido(dia: 'hoje' | 'ontem', horaTexto: string, agora: Date): Date {
  const [h, m] = horaTexto.split(':').map(Number);
  const base = dia === 'hoje' ? new Date(agora) : subDays(agora, 1);
  base.setHours(h ?? 0, m ?? 0, 0, 0);
  return base;
}
