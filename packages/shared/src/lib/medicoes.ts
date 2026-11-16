import type { GlucoseContext, Measurement, MeasurementKind } from '../api/health';
import { diaCurto, hora } from './posologia';

/**
 * Medicoes de saude: pressao, glicemia, peso e oxigenacao.
 *
 * Modulo PURO, dividido pela web e pelo aplicativo — a validacao, os textos,
 * a serie do grafico e o resumo do periodo sao os mesmos nas duas telas e no
 * relatorio para o medico.
 *
 * REFERENCIA SEM VEREDITO (decisao do produto): o grafico mostra a faixa
 * usual, com a fonte, mas nenhum valor ganha rotulo de "alto" ou "baixo". So
 * os valores EXTREMOS recebem um aviso, sempre o mesmo texto neutro, com o
 * 192. Quem interpreta e o medico.
 */

export type Faixa = { de: number; ate: number; rotulo: string };
export type Linha = { valor: number; rotulo: string };

export type Campo = 'systolic' | 'diastolic' | 'pulse' | 'glucose' | 'weightKg' | 'spo2';

export type DefinicaoDeMedicao = {
  chave: MeasurementKind;
  rotulo: string;
  unidade: string;
  icone: string;
  /** Os campos do formulario, na ordem da tela. */
  campos: { campo: Campo; rotulo: string; opcional?: boolean; min: number; max: number; decimal?: boolean }[];
  /** O eixo do grafico nunca encolhe abaixo disto: uma serie estavel nao vira montanha. */
  eixo: { min: number; max: number };
  faixas: Faixa[];
  linhas: Linha[];
  /** A fonte da referencia, escrita ao lado do grafico. Nula quando nao ha faixa. */
  fonte: string | null;
};

export const TIPOS_DE_MEDICAO: readonly DefinicaoDeMedicao[] = [
  {
    chave: 'pressao',
    rotulo: 'Pressão',
    unidade: 'mmHg',
    icone: 'heart',
    campos: [
      { campo: 'systolic', rotulo: 'Sistólica (máxima)', min: 60, max: 260 },
      { campo: 'diastolic', rotulo: 'Diastólica (mínima)', min: 30, max: 160 },
      { campo: 'pulse', rotulo: 'Pulso (bpm)', opcional: true, min: 30, max: 220 },
    ],
    eixo: { min: 60, max: 160 },
    faixas: [],
    linhas: [
      { valor: 120, rotulo: '120' },
      { valor: 80, rotulo: '80' },
    ],
    fonte: 'Referência: pressão normal abaixo de 120/80 mmHg (Diretrizes Brasileiras de Hipertensão Arterial, 2025).',
  },
  {
    chave: 'glicemia',
    rotulo: 'Glicemia',
    unidade: 'mg/dL',
    icone: 'droplet',
    campos: [{ campo: 'glucose', rotulo: 'Glicemia (mg/dL)', min: 20, max: 600 }],
    eixo: { min: 60, max: 180 },
    faixas: [{ de: 70, ate: 99, rotulo: 'Jejum: 70 a 99' }],
    linhas: [{ valor: 140, rotulo: '2 h após comer: abaixo de 140' }],
    fonte: 'Referência: em jejum, 70 a 99 mg/dL; 2 horas depois de comer, abaixo de 140 mg/dL (Sociedade Brasileira de Diabetes).',
  },
  {
    chave: 'peso',
    rotulo: 'Peso',
    unidade: 'kg',
    icone: 'mci:scale-bathroom',
    campos: [{ campo: 'weightKg', rotulo: 'Peso (kg)', min: 0.5, max: 300, decimal: true }],
    eixo: { min: 0, max: 0 },
    faixas: [],
    linhas: [],
    fonte: null,
  },
  {
    chave: 'oxigenacao',
    rotulo: 'Oxigenação',
    unidade: '%',
    icone: 'wind',
    campos: [
      { campo: 'spo2', rotulo: 'Saturação (SpO2, %)', min: 50, max: 100 },
      { campo: 'pulse', rotulo: 'Pulso (bpm)', opcional: true, min: 30, max: 220 },
    ],
    eixo: { min: 85, max: 100 },
    faixas: [{ de: 95, ate: 100, rotulo: '95 a 100%' }],
    linhas: [],
    fonte: 'Referência usual da oximetria de pulso em repouso: 95 a 100%.',
  },
];

export function tipoDeMedicao(chave: string): DefinicaoDeMedicao | null {
  return TIPOS_DE_MEDICAO.find((t) => t.chave === chave) ?? null;
}

export const MOMENTOS_DA_GLICEMIA: { chave: GlucoseContext; rotulo: string }[] = [
  { chave: 'jejum', rotulo: 'Em jejum' },
  { chave: 'antes', rotulo: 'Antes de comer' },
  { chave: 'depois', rotulo: '2 h depois de comer' },
  { chave: 'outro', rotulo: 'Outro momento' },
];

export function rotuloDoMomento(c: GlucoseContext | null | undefined): string | null {
  return MOMENTOS_DA_GLICEMIA.find((m) => m.chave === c)?.rotulo ?? null;
}

// ---------------------------------------------------------------------------
// Validacao
// ---------------------------------------------------------------------------

/** "37,8" e "37.8" viram 37.8; vazio vira null; lixo vira NaN. */
function numeroDoTexto(texto: string): number | null {
  const limpo = texto.trim().replace(',', '.');
  if (!limpo) return null;
  return /^\d+(\.\d+)?$/.test(limpo) ? Number(limpo) : Number.NaN;
}

export type ValoresDaMedicao = Partial<Record<Campo, number | null>>;

/**
 * Le os campos digitados e devolve os valores ou os erros por campo, com os
 * MESMOS textos na web e no aplicativo. A faixa aceita pega erro de digitacao
 * ("1208" no lugar de "120"), nao julga a saude de ninguem.
 */
export function validarMedicao(
  tipo: DefinicaoDeMedicao,
  textos: Partial<Record<Campo, string>>,
): { valores: ValoresDaMedicao; erros: Partial<Record<Campo, string>> } {
  const valores: ValoresDaMedicao = {};
  const erros: Partial<Record<Campo, string>> = {};

  for (const c of tipo.campos) {
    const n = numeroDoTexto(textos[c.campo] ?? '');
    if (n == null) {
      if (!c.opcional) erros[c.campo] = 'Informe o valor.';
      valores[c.campo] = null;
      continue;
    }
    if (Number.isNaN(n)) {
      erros[c.campo] = 'Digite só o número.';
      continue;
    }
    if (!c.decimal && !Number.isInteger(n)) {
      erros[c.campo] = 'Use um número inteiro.';
      continue;
    }
    if (n < c.min || n > c.max) {
      erros[c.campo] = `Confira o número: o esperado fica entre ${formatarNumero(c.min)} e ${formatarNumero(c.max)}.`;
      continue;
    }
    valores[c.campo] = c.decimal ? Math.round(n * 100) / 100 : n;
  }

  if (
    tipo.chave === 'pressao' &&
    !erros.systolic &&
    !erros.diastolic &&
    valores.systolic != null &&
    valores.diastolic != null &&
    valores.systolic <= valores.diastolic
  ) {
    erros.diastolic = 'A mínima precisa ser menor que a máxima.';
  }

  return { valores, erros };
}

function formatarNumero(n: number): string {
  return String(n).replace('.', ',');
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

/** O valor principal de uma medicao, sem unidade: "128/82", "95", "62,5". */
export function valorDaMedicao(m: Measurement): string {
  switch (m.kind) {
    case 'pressao':
      return `${m.systolic ?? '?'}/${m.diastolic ?? '?'}`;
    case 'glicemia':
      return formatarNumero(m.glucose ?? 0);
    case 'peso':
      return formatarNumero(m.weightKg ?? 0);
    case 'oxigenacao':
      return formatarNumero(m.spo2 ?? 0);
  }
}

/** "128/82 mmHg · pulso 72", "95 mg/dL · em jejum", "62,5 kg". */
export function descricaoDaMedicao(m: Measurement): string {
  const tipo = tipoDeMedicao(m.kind);
  const partes = [`${valorDaMedicao(m)} ${tipo?.unidade ?? ''}`.trim()];
  if (m.kind === 'glicemia') {
    const momento = rotuloDoMomento(m.glucoseContext);
    if (momento) partes.push(momento.toLowerCase());
  }
  if ((m.kind === 'pressao' || m.kind === 'oxigenacao') && m.pulse != null) {
    partes.push(`pulso ${m.pulse}`);
  }
  return partes.join(' · ');
}

export const TEXTO_DO_AVISO_EXTREMO =
  'Se houver falta de ar, dor no peito, confusão ou mal-estar, procure atendimento agora — ligue 192.';

/**
 * Um valor extremo pede um aviso; os demais, nenhum. O texto e sempre o mesmo
 * e neutro (TEXTO_DO_AVISO_EXTREMO): o aplicativo nao diagnostica, so lembra
 * para onde ligar.
 */
export function valorExtremo(m: Pick<Measurement, 'kind' | 'systolic' | 'diastolic' | 'glucose' | 'spo2'>): boolean {
  switch (m.kind) {
    case 'pressao':
      return (m.systolic ?? 0) >= 180 || (m.diastolic ?? 0) >= 120;
    case 'glicemia':
      return m.glucose != null && (m.glucose < 70 || m.glucose > 300);
    case 'oxigenacao':
      return m.spo2 != null && m.spo2 < 90;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Grafico
// ---------------------------------------------------------------------------

export type PontoDoGrafico = {
  id: string;
  quando: Date;
  /** 0 a 1 ao longo do periodo. */
  x: number;
  /** Um valor por serie: [sistolica, diastolica] na pressao, [valor] nos outros. */
  valores: number[];
  texto: string;
};

export type SerieDoGrafico = {
  tipo: DefinicaoDeMedicao;
  pontos: PontoDoGrafico[];
  /** Os limites do eixo vertical, ja com a folga. */
  min: number;
  max: number;
  /** Converte um valor no eixo para 0 (embaixo) a 1 (em cima). */
  y: (valor: number) => number;
  /** Rotulos do eixo X: o inicio, o meio e o fim do periodo. */
  marcas: { x: number; rotulo: string }[];
  series: string[];
};

function valoresDoPonto(m: Measurement): number[] | null {
  switch (m.kind) {
    case 'pressao':
      return m.systolic != null && m.diastolic != null ? [m.systolic, m.diastolic] : null;
    case 'glicemia':
      return m.glucose != null ? [m.glucose] : null;
    case 'peso':
      return m.weightKg != null ? [m.weightKg] : null;
    case 'oxigenacao':
      return m.spo2 != null ? [m.spo2] : null;
  }
}

/**
 * A serie de um tipo num periodo: cada medicao no seu instante (varias no
 * mesmo dia ficam lado a lado, nao somadas), o eixo com folga e as faixas.
 *
 * O eixo parte da referencia do tipo e so ALARGA para caber os valores: um
 * peso estavel de 62 kg nao pode virar uma montanha so porque variou 300 g.
 */
export function serieDoGrafico(
  medicoes: Measurement[],
  tipo: DefinicaoDeMedicao,
  inicio: Date,
  fim: Date,
): SerieDoGrafico {
  const duracao = Math.max(1, fim.getTime() - inicio.getTime());
  const pontos = medicoes
    .filter((m) => m.kind === tipo.chave)
    .map((m) => ({ m, quando: new Date(m.measuredAt), valores: valoresDoPonto(m) }))
    .filter((p): p is { m: Measurement; quando: Date; valores: number[] } =>
      p.valores != null && p.quando >= inicio && p.quando <= fim,
    )
    .sort((a, b) => a.quando.getTime() - b.quando.getTime())
    .map(({ m, quando, valores }) => ({
      id: m.id,
      quando,
      x: (quando.getTime() - inicio.getTime()) / duracao,
      valores,
      texto: `${diaCurto(quando)} ${hora(quando)}: ${descricaoDaMedicao(m)}`,
    }));

  const todos = pontos.flatMap((p) => p.valores);
  let min: number;
  let max: number;
  if (tipo.chave === 'peso') {
    // Sem referencia: a escala vem dos proprios valores, com 2 kg de folga.
    const menor = todos.length ? Math.min(...todos) : 0;
    const maior = todos.length ? Math.max(...todos) : 10;
    min = Math.max(0, Math.floor(menor - 2));
    max = Math.ceil(maior + 2);
  } else {
    // Alargado em dezenas: o eixo mostra 190, nao 187.
    min = Math.min(tipo.eixo.min, ...(todos.length ? [Math.floor((Math.min(...todos) - 5) / 10) * 10] : []));
    max = Math.max(tipo.eixo.max, ...(todos.length ? [Math.ceil((Math.max(...todos) + 5) / 10) * 10] : []));
    if (tipo.chave === 'oxigenacao') max = 100;
  }
  const amplitude = Math.max(1, max - min);

  const meio = new Date(inicio.getTime() + duracao / 2);
  return {
    tipo,
    pontos,
    min,
    max,
    y: (valor: number) => Math.max(0, Math.min(1, (valor - min) / amplitude)),
    marcas: [
      { x: 0, rotulo: diaCurto(inicio) },
      { x: 0.5, rotulo: diaCurto(meio) },
      { x: 1, rotulo: diaCurto(fim) },
    ],
    series: tipo.chave === 'pressao' ? ['Sistólica', 'Diastólica'] : [tipo.rotulo],
  };
}

/** A serie inteira em palavras, para o leitor de tela. */
export function descricaoDaSerie(s: SerieDoGrafico, dias: number): string {
  if (!s.pontos.length) return `${s.tipo.rotulo}: nenhuma medição nos últimos ${dias} dias.`;
  const ultimo = s.pontos[s.pontos.length - 1]!;
  const resumo = resumoDosValores(s.pontos.map((p) => p.valores), s.tipo);
  return `${s.tipo.rotulo} nos últimos ${dias} dias: ${s.pontos.length} ${s.pontos.length === 1 ? 'medição' : 'medições'}, de ${resumo.minimo} a ${resumo.maximo} ${s.tipo.unidade}. Última: ${ultimo.texto}.`;
}

// ---------------------------------------------------------------------------
// Resumo do periodo (tela e relatorio)
// ---------------------------------------------------------------------------

export type ResumoDeMedicao = {
  chave: MeasurementKind;
  rotulo: string;
  unidade: string;
  quantas: number;
  ultima: string | null;
  ultimaQuando: string | null;
  media: string;
  minimo: string;
  maximo: string;
};

function resumoDosValores(listas: number[][], tipo: DefinicaoDeMedicao) {
  const series = listas[0]?.length ?? 1;
  const formatar = (v: number) => (tipo.chave === 'peso' ? formatarNumero(Math.round(v * 10) / 10) : String(Math.round(v)));
  const porSerie = Array.from({ length: series }, (_, i) => listas.map((l) => l[i]!).filter((v) => v != null));
  const juntar = (f: (vs: number[]) => number) => porSerie.map((vs) => formatar(f(vs))).join('/');
  return {
    media: juntar((vs) => vs.reduce((a, b) => a + b, 0) / vs.length),
    minimo: juntar((vs) => Math.min(...vs)),
    maximo: juntar((vs) => Math.max(...vs)),
  };
}

/** Quantas, a ultima, a media e o intervalo de um tipo, no periodo dado. */
export function resumoDoTipo(medicoes: Measurement[], tipo: DefinicaoDeMedicao): ResumoDeMedicao | null {
  const doTipo = medicoes
    .filter((m) => m.kind === tipo.chave)
    .map((m) => ({ m, valores: valoresDoPonto(m) }))
    .filter((x): x is { m: Measurement; valores: number[] } => x.valores != null)
    .sort((a, b) => b.m.measuredAt.localeCompare(a.m.measuredAt));
  if (!doTipo.length) return null;
  const r = resumoDosValores(doTipo.map((x) => x.valores), tipo);
  const ultima = doTipo[0]!.m;
  const quando = new Date(ultima.measuredAt);
  return {
    chave: tipo.chave,
    rotulo: tipo.rotulo,
    unidade: tipo.unidade,
    quantas: doTipo.length,
    ultima: descricaoDaMedicao(ultima),
    ultimaQuando: `${diaCurto(quando)} às ${hora(quando)}`,
    media: r.media,
    minimo: r.minimo,
    maximo: r.maximo,
  };
}
