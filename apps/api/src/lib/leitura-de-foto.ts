import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { medicationFormValues, scheduleTypeValues } from '../contracts';
import { db } from '../db/client';
import { professionals } from '../db/schema';
import { validarPosologia } from './posologia';

/**
 * Do que o modelo devolveu para os campos do cadastro.
 *
 * NENHUM VALOR CRU ATRAVESSA ESTE ARQUIVO. O que sai daqui ou passou pelo zod
 * e pelas regras abaixo, ou e null. Tres camadas, e cada uma existe por um
 * motivo diferente:
 *
 *   1. extrair o JSON     — o modelo as vezes embrulha em crase
 *   2. zod TOLERANTE      — um campo podre derruba o CAMPO, nunca a leitura
 *   3. mapear campo a campo — com os tetos do medicationBaseSchema
 *
 * A camada 2 e tolerante de proposito, e e o oposto do que se faz num corpo de
 * requisicao: ali um campo invalido e erro do cliente e merece 400. Aqui,
 * jogar fora um envio de ate 45 s porque o modelo escreveu "oito" em vez de 8
 * seria punir a pessoa pelo erro da maquina.
 */

export type ItemLido = {
  /** Posicao na lista devolvida. Volta no POST para ligar o salvo ao proposto. */
  index: number;
  name: string;
  strength: string | null;
  form: (typeof medicationFormValues)[number] | null;
  doseAmount: number | null;
  doseUnit: string | null;
  packageAmount: number | null;
  scheduleType: (typeof scheduleTypeValues)[number] | null;
  intervalHours: number | null;
  times: string[];
  /** "por 7 dias". NAO vira endsAt aqui — ver o comentario em mapear(). */
  durationDays: number | null;
  instructions: string | null;
};

export type LeituraMapeada = {
  items: ItemLido[];
  /** Itens que o modelo devolveu e que nao dava para aproveitar (sem nome). */
  discarded: number;
  prescriber: {
    nameRead: string | null;
    professionalId: string | null;
    /** Especialidade lida da receita, para a ficha do medico novo. */
    specialtyRead: string | null;
  };
  /** Data da consulta, AAAA-MM-DD, para virar consulta cadastrada. null se ilegivel. */
  consultationDate: string | null;
};

/** O numero pode vir como texto. `catch` devolve null em vez de lancar. */
const numeroFrouxo = z.coerce.number().nullish().catch(null);

const itemDoModeloSchema = z.object({
  nome: z.string().nullish().catch(null),
  concentracao: z.string().nullish().catch(null),
  forma: z.string().nullish().catch(null),
  quantidade_na_embalagem: numeroFrouxo,
  dose_por_vez: numeroFrouxo,
  tipo_de_horario: z.string().nullish().catch(null),
  intervalo_horas: numeroFrouxo,
  vezes_ao_dia: numeroFrouxo,
  horarios: z.array(z.string()).nullish().catch(null),
  duracao_dias: numeroFrouxo,
  orientacoes: z.string().nullish().catch(null),
});

const saidaDoModeloSchema = z.object({
  medicamentos: z.array(itemDoModeloSchema).nullish().catch(null),
  prescritor: z.string().nullish().catch(null),
  especialidade: z.string().nullish().catch(null),
  data_da_consulta: z.string().nullish().catch(null),
});

/**
 * Tira o JSON de dentro do que o modelo escreveu.
 *
 * Com `response_format` estrito isto quase nunca faz nada — e o "quase" e o
 * motivo de existir. Devolve null quando nao ha JSON aproveitavel, e quem
 * chama transforma isso em PHOTO_READ_FAILED.
 */
export function extrairJson(texto: string | null): unknown | null {
  if (!texto) return null;
  const limpo = texto.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const inicio = limpo.indexOf('{');
  const fim = limpo.lastIndexOf('}');
  if (inicio === -1 || fim <= inicio) return null;
  try {
    return JSON.parse(limpo.slice(inicio, fim + 1));
  } catch {
    return null;
  }
}

/** Sem acento, sem caixa, sem espaco sobrando — igual ao assistente. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function texto(v: unknown, maximo: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  // NAO TRUNCA: "500m" no lugar de "500mg" e pior que vazio, porque parece
  // certo. O unico campo que trunca e `instructions`, que e prosa.
  if (t.length === 0 || t.length > maximo) return null;
  return t;
}

function inteiro(v: unknown, minimo: number, maximo: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n >= minimo && n <= maximo ? n : null;
}

/**
 * A forma que nao casa vira NULL, nunca 'outro'.
 *
 * Campo vazio convida a pessoa a escolher; um default errado e aceito por
 * inercia. Num cadastro de remedio, a inercia e o inimigo.
 */
function forma(v: unknown): (typeof medicationFormValues)[number] | null {
  const t = texto(v, 40);
  if (!t) return null;
  const n = normalizar(t).replace(/s$/, '');
  if (medicationFormValues.includes(t as never)) return t as (typeof medicationFormValues)[number];
  if (n.startsWith('capsula') || n === 'cap') return 'cápsula';
  if (n.startsWith('comprimido') || n === 'cp' || n === 'comp') return 'comprimido';
  if (n.startsWith('gota')) return 'gotas';
  if (n === 'ml' || n.startsWith('solucao') || n.startsWith('xarope') || n.startsWith('suspensao')) {
    return 'ml';
  }
  return null;
}

/** "8h", "8:00", "08h00" → "08:00". Fora disso, descarta o horario. */
function horario(v: string): string | null {
  const m = /^(\d{1,2})\s*[h:]?\s*(\d{2})?/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (!Number.isInteger(h) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * A data da consulta, AAAA-MM-DD, validada.
 *
 * Rejeita o que nao e data de calendario real (2026-02-31), ano implausivel, ou
 * futuro — a receita ja aconteceu. Nao e sensivel a fuso: compara ao dia, com
 * um dia de tolerancia. Ilegivel vira null, e a pessoa preenche na revisao.
 */
function dataDaConsulta(v: unknown): string | null {
  const t = texto(v, 10);
  if (!t) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (ano < 2015 || ano > new Date().getUTCFullYear() + 1) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return null;
  }
  if (d.getTime() > Date.now() + 24 * 60 * 60 * 1000) return null;
  return t;
}

/** Quantas vezes ao dia cabem num intervalo inteiro de horas. */
const VEZES_QUE_VIRAM_INTERVALO: Record<number, number> = {
  1: 24,
  2: 12,
  3: 8,
  4: 6,
  6: 4,
  8: 3,
  12: 2,
};

type Posologia = {
  scheduleType: (typeof scheduleTypeValues)[number] | null;
  intervalHours: number | null;
  times: string[];
};

/**
 * A posologia proposta, e o INVARIANTE que fecha o arquivo.
 *
 * Nunca devolvemos uma proposta que o nosso proprio POST /api/medications
 * recusaria. Sem isso, a pessoa revisa, toca em "Cadastrar remedio" e toma um
 * 400 por um campo que ela nao digitou — e o `validarPosologia` recusa
 * justamente o erro mais provavel de um modelo, que e mandar horarios junto de
 * um tipo que nao os aceita.
 */
function posologia(item: z.infer<typeof itemDoModeloSchema>): Posologia {
  const vazio: Posologia = { scheduleType: null, intervalHours: null, times: [] };

  const horarios = [...new Set((item.horarios ?? []).map(horario).filter((h): h is string => !!h))]
    .sort()
    .slice(0, 8);
  const tipo = texto(item.tipo_de_horario, 20);
  const intervalo = inteiro(item.intervalo_horas, 1, 72);
  const vezes = inteiro(item.vezes_ao_dia, 1, 24);

  let proposta: Posologia = vazio;

  if (tipo === 'fixed_times' && horarios.length > 0) {
    proposta = { scheduleType: 'fixed_times', intervalHours: null, times: horarios };
  } else if (tipo === 'as_needed') {
    proposta = { scheduleType: 'as_needed', intervalHours: null, times: [] };
  } else if (intervalo) {
    proposta = { scheduleType: 'interval', intervalHours: intervalo, times: [] };
  } else if (vezes && VEZES_QUE_VIRAM_INTERVALO[vezes]) {
    // "3x ao dia" vira 8/8h AQUI, e nao na cabeca do modelo. Uma frequencia
    // que nao da hora inteira (5x ao dia) fica sem tipo: a frase original
    // segue em `instructions` e a pessoa decide.
    proposta = {
      scheduleType: 'interval',
      intervalHours: VEZES_QUE_VIRAM_INTERVALO[vezes]!,
      times: [],
    };
  }

  if (!proposta.scheduleType) return vazio;
  return validarPosologia(proposta as never) ? vazio : proposta;
}

/**
 * De quem receitou, para o chip de medico que o formulario ja tem.
 *
 * So devolve `professionalId` quando casa com um profissional JA CADASTRADO:
 * criar o cadastro a partir da foto seria a IA escrevendo no banco. E o empate
 * NAO e resolvido no chute, pelo mesmo motivo do `resolverPessoa` — com dois
 * medicos de nome parecido, escolher um pre-selecionaria o errado com toda a
 * confianca do mundo.
 *
 * O nome lido volta para a tela poder dizer de quem e a receita, e nao e
 * gravado em lugar nenhum.
 */
async function casarPrescritor(
  userId: string,
  nomeLido: string | null,
  especialidadeLida: string | null,
): Promise<{ nameRead: string | null; professionalId: string | null; specialtyRead: string | null }> {
  const specialtyRead = texto(especialidadeLida, 60);
  if (!nomeLido) return { nameRead: null, professionalId: null, specialtyRead };

  const alvo = normalizar(nomeLido)
    .replace(/^(dr|dra)\.?\s+/, '')
    .replace(/\s*crm.*$/, '')
    .trim();
  if (alvo.length < 3) return { nameRead: nomeLido, professionalId: null, specialtyRead };

  const cadastrados = await db
    .select({ id: professionals.id, name: professionals.name })
    .from(professionals)
    .where(eq(professionals.userId, userId));

  const exatos = cadastrados.filter((p) => normalizar(p.name) === alvo);
  const parciais = cadastrados.filter((p) => {
    const n = normalizar(p.name);
    return n.includes(alvo) || alvo.includes(n);
  });
  const achados = exatos.length > 0 ? exatos : parciais;

  return {
    nameRead: nomeLido,
    professionalId: achados.length === 1 ? achados[0]!.id : null,
    specialtyRead,
  };
}

/**
 * O mapeamento inteiro.
 *
 * Para `kind: 'caixa'` os campos de posologia, duracao e prescritor sao zerados
 * INDEPENDENTEMENTE do que voltou. O prompt ja pede isso; aqui e a garantia.
 * Uma embalagem nao tem a receita de ninguem, e um horario vindo do rotulo
 * viraria lembrete de remedio com a autoridade de algo que a pessoa aprovou.
 */
export async function mapearLeitura(
  userId: string,
  kind: 'receita' | 'caixa',
  cru: unknown,
): Promise<LeituraMapeada | null> {
  const analisado = saidaDoModeloSchema.safeParse(cru);
  if (!analisado.success) return null;

  const brutos = analisado.data.medicamentos ?? [];
  const items: ItemLido[] = [];
  let discarded = 0;

  for (const bruto of brutos) {
    // Sem nome nao ha o que preencher: o formulario exige 2 caracteres e a
    // pessoa veria um campo vazio marcado como "veio da IA".
    const name = texto(bruto.nome, 120);
    if (!name || name.length < 2) {
      discarded += 1;
      continue;
    }

    const p = kind === 'caixa' ? { scheduleType: null, intervalHours: null, times: [] } : posologia(bruto);
    const f = forma(bruto.forma);

    items.push({
      index: items.length,
      name,
      strength: texto(bruto.concentracao, 40),
      form: f,
      doseAmount: kind === 'caixa' ? null : inteiro(bruto.dose_por_vez, 1, 9999),
      // A unidade da dose E a forma. Sem forma lida, fica em branco em vez de
      // inventar "comprimido".
      doseUnit: kind === 'caixa' || !f || f === 'outro' ? null : f,
      packageAmount: inteiro(bruto.quantidade_na_embalagem, 1, 9999),
      scheduleType: p.scheduleType,
      intervalHours: p.intervalHours,
      times: p.times,
      /**
       * Duracao volta em DIAS, e o servidor nao a converte em endsAt.
       *
       * Ele roda em UTC e nao sabe que dia e hoje no aparelho. "Por 7 dias"
       * virando data aqui decidiria a meia-noite de alguem a partir de UTC, e
       * daria o dia errado a partir das 21h de Brasilia, em silencio. Quem
       * calcula e o aplicativo, onde ele ja calcula todo o resto.
       */
      durationDays: kind === 'caixa' ? null : inteiro(bruto.duracao_dias, 1, 365),
      instructions: typeof bruto.orientacoes === 'string' ? bruto.orientacoes.trim().slice(0, 1000) || null : null,
    });
  }

  const prescriber =
    kind === 'caixa'
      ? { nameRead: null, professionalId: null, specialtyRead: null }
      : await casarPrescritor(
          userId,
          texto(analisado.data.prescritor, 120),
          analisado.data.especialidade ?? null,
        );

  // Zerada para caixa, como o prescritor: uma embalagem nao tem consulta.
  const consultationDate = kind === 'caixa' ? null : dataDaConsulta(analisado.data.data_da_consulta);

  return { items, discarded, prescriber, consultationDate };
}
