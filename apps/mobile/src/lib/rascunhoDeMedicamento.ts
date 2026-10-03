import type { MedicamentoLido } from '@/api/health';
import type { ScheduleType } from '@/api/health';

/**
 * O que a tela de leitura por foto entrega ao formulario de cadastro.
 *
 * NAO E CONTEXTO E NAO E ARMAZENAMENTO: e um modulo com UMA VAGA, e a rota
 * carrega so um token opaco.
 *
 * Por que nao parametro de rota: a foto tem ate 400 000 caracteres e nao cabe
 * numa URL. Os campos caberiam, mas parametros entram no estado de navegacao,
 * que vira URL — nome de remedio e posologia de uma pessoa nao tem por que
 * morar la. E com metade do payload na URL e metade aqui, passariam a existir
 * dois mecanismos de entrega com duas vidas uteis diferentes.
 *
 * Por que nao armazenamento: o `expo-secure-store` tem teto de ~2 KB por
 * chave, e `expo-file-system` nao esta nas dependencias. Persistir exigiria
 * dependencia nova E uma imagem de receita em repouso no aparelho, que
 * passariamos a ter obrigacao de apagar.
 */

/** As formas que o servidor aceita. Precisa bater com medicationFormValues. */
export const FORMAS = ['cápsula', 'comprimido', 'ml', 'gotas', 'jato', 'outro'] as const;

/** Intervalos oferecidos. Cobrem a receita comum sem virar campo livre. O 3h
 * entrou para os inaladores ("de 3/3 h"), que não caíam em nenhum degrau. */
export const INTERVALOS = [3, 4, 6, 8, 12, 24] as const;

/**
 * Quais campos vieram MESMO da leitura.
 *
 * E o que a tela usa para marcar "confira isto". Padrao aplicado por nos NAO
 * entra: marcar um valor nosso diluiria o aviso que existe para apontar o que
 * a maquina escreveu.
 */
export type CampoLido =
  | 'nome'
  | 'concentracao'
  | 'forma'
  | 'quantidade'
  | 'embalagem'
  | 'tipo'
  | 'intervalo'
  | 'horarios'
  | 'instrucoes';

export type CamposDoRascunho = {
  nome: string;
  concentracao: string;
  forma: (typeof FORMAS)[number];
  quantidade: string;
  embalagem: string;
  tipo: ScheduleType;
  intervalo: number;
  horarios: string[];
  instrucoes: string;
  /** Calculado AQUI a partir de durationDays, com o relogio do aparelho. */
  fimDoTratamento: string | null;
};

export type RascunhoDeMedicamento = {
  campos: CamposDoRascunho;
  camposLidos: CampoLido[];
  /** Data URI JPEG ja preparado por escolherFotoDeDocumento. */
  foto: string;
  /**
   * Decide para qual campo a foto vai depois do cadastro: a receita so vira
   * anexo se a pessoa marcar; a caixa vira sempre, e e removivel no detalhe.
   */
  kind: 'receita' | 'caixa';
  readId: string;
  readItem: number;
  /** Medico ja cadastrado que o servidor reconheceu na receita, se houver. */
  prescritorId: string | null;
};

/**
 * Validade curta, e e o TETO DURO da vida da foto em memoria.
 *
 * Mesmo que uma excecao no meio da navegacao impeca o formulario de montar, a
 * imagem nao fica pendurada mais de um minuto. E a unica garantia que nao
 * depende de nenhuma tela se comportar bem.
 *
 * Fica aqui e nao em config.ts: aquele arquivo e sobre prazos de REDE; isto e
 * sobre vida util de dado sensivel em memoria.
 */
const VALIDADE_MS = 60_000;

let vaga: { token: string; em: number; rascunho: RascunhoDeMedicamento } | null = null;

/** Sobrescreve o que estiver la. Dois rascunhos pendentes nunca existem. */
export function guardarRascunho(rascunho: RascunhoDeMedicamento): string {
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  vaga = { token, em: Date.now(), rascunho };
  return token;
}

/**
 * Le E esvazia.
 *
 * Token que nao bate devolve null SEM esvaziar: esvaziar ali apagaria um
 * rascunho mais novo que o pedinte — o caso de a pessoa voltar, fotografar de
 * novo, e o formulario antigo pedir o token velho.
 */
export function consumirRascunho(token: string): RascunhoDeMedicamento | null {
  if (!vaga || vaga.token !== token) return null;
  const { em, rascunho } = vaga;
  vaga = null;
  return Date.now() - em > VALIDADE_MS ? null : rascunho;
}

export function descartarRascunho(): void {
  vaga = null;
}

// ---------------------------------------------------------------------------
// Rascunho em LOTE (receita inteira)
//
// A leitura de uma CAIXA entrega um remedio e vai para o form unico acima. A
// leitura de uma RECEITA entrega varios, e a pessoa confere TODOS numa tela so
// antes de salvar — por isso um rascunho proprio, que guarda a leitura inteira
// e sobrevive ao vaivem de editar um item (ao contrario da vaga de cima, que e
// lida-e-esvaziada).
// ---------------------------------------------------------------------------

/** Um remedio dentro do lote, ja normalizado, com o indice da leitura. */
export type ItemDoLote = {
  campos: CamposDoRascunho;
  camposLidos: CampoLido[];
  /** O indice do item NA LEITURA. Vira photoReadItem no cadastro; preservado
   * por item para que remover um do meio nao desalinhe os outros. */
  readItem: number;
};

export type RascunhoDeReceita = {
  itens: ItemDoLote[];
  /** Data URI JPEG da receita, ja preparado por escolherFotoDeDocumento. */
  foto: string;
  readId: string;
  /** Medico ja cadastrado que o servidor reconheceu na receita, se houver. */
  prescritorId: string | null;
  /** O nome lido do prescritor — para cadastrar o medico novo ou so mostrar. */
  prescriberName: string | null;
  /** A especialidade lida — ficha do medico novo e titulo da consulta. */
  specialtyRead: string | null;
  /** AAAA-MM-DD lido, ou null. Vira a consulta cadastrada (status realizada). */
  consultationDate: string | null;
};

/**
 * Validade MAIOR que a do rascunho unico (15 min, nao 1), e o porque.
 *
 * Aqui a pessoa confere varios remedios, edita um, volta, edita outro — um
 * minuto estouraria no meio da revisao. Continua sendo um teto duro para a foto
 * da receita em memoria, so que dimensionado para a conferencia, nao para um
 * salto de tela. Ela e apagada na hora em que a receita e salva ou abandonada.
 */
const VALIDADE_RECEITA_MS = 15 * 60_000;

let lote: { em: number; receita: RascunhoDeReceita } | null = null;

/** Sobrescreve o que estiver la. Um lote pendente por vez. */
export function guardarReceita(receita: RascunhoDeReceita): void {
  lote = { em: Date.now(), receita };
}

/**
 * Espia SEM consumir — a tela de revisao le a cada foco, inclusive ao voltar
 * da edicao de um item. So some por idade (teto duro) ou por descarte
 * explicito. Vencida, zera e devolve null.
 */
export function lerReceita(): RascunhoDeReceita | null {
  if (!lote) return null;
  if (Date.now() - lote.em > VALIDADE_RECEITA_MS) {
    lote = null;
    return null;
  }
  return lote.receita;
}

/**
 * Escreve de volta o item editado no form.
 *
 * O form e dono das marcas "da foto": ele devolve os campos E a lista de
 * camposLidos ja reduzida (um campo que a pessoa mexeu deixa de ser "da foto").
 */
export function atualizarItemDoLote(
  index: number,
  campos: CamposDoRascunho,
  camposLidos: CampoLido[],
): void {
  if (!lote) return;
  const item = lote.receita.itens[index];
  if (!item) return;
  lote.receita.itens[index] = { ...item, campos, camposLidos };
}

/** Remove um item do lote. A tela garante o minimo de 1. */
export function removerItemDoLote(index: number): void {
  if (!lote) return;
  lote.receita.itens = lote.receita.itens.filter((_, i) => i !== index);
}

export function descartarReceita(): void {
  lote = null;
}

// ---------------------------------------------------------------------------
// Foto escolhida na Home, a caminho da leitura
//
// O cartao "Ler receita com IA" abre o seletor NA PROPRIA Home e so navega
// quando ha imagem — assim cancelar nao joga ninguem numa tela intermediaria. A
// foto escolhida (~400 KB) nao cabe em parametro de rota (mesmo motivo do topo),
// entao viaja por esta vaga ate a tela de leitura consumi-la.
// ---------------------------------------------------------------------------

let fotoPendente: { em: number; foto: string } | null = null;

/** Sobrescreve o que estiver la. Uma foto a caminho por vez. */
export function guardarFotoParaLeitura(foto: string): void {
  fotoPendente = { em: Date.now(), foto };
}

/** Espia SEM consumir — para a tela de leitura ja nascer em "lendo", sem flash. */
export function temFotoParaLeitura(): boolean {
  if (!fotoPendente) return false;
  if (Date.now() - fotoPendente.em > VALIDADE_MS) {
    fotoPendente = null;
    return false;
  }
  return true;
}

/** Le e esvazia. Vencida, devolve null. */
export function consumirFotoParaLeitura(): string | null {
  if (!fotoPendente) return null;
  const { em, foto } = fotoPendente;
  fotoPendente = null;
  return Date.now() - em > VALIDADE_MS ? null : foto;
}

/**
 * O formulario avisa que o cadastro terminou, e a tela de leitura se dispensa.
 *
 * Existe porque `router.replace` atravessando abas E UM NO-OP SILENCIOSO: o
 * roteador de abas do expo-router nao trata a acao REPLACE, e ela nao borbulha
 * quando o alvo e o proprio navegador. Sem erro, sem navegacao.
 *
 * Entao a tela de leitura fica na pilha, e sem isto o "voltar" depois de
 * salvar cairia nela — a pessoa salva o remedio e reencontra a camera. A
 * marca e lida na RENDERIZACAO (para a tela ja sair em branco) e consumida no
 * efeito, que e o que evita o quadro piscado.
 */
let cadastroConcluido = false;

export function marcarCadastroConcluido(): void {
  cadastroConcluido = true;
}

/** Espia sem consumir. Para a tela decidir o que renderizar. */
export function temCadastroConcluido(): boolean {
  return cadastroConcluido;
}

export function consumirCadastroConcluido(): boolean {
  const tinha = cadastroConcluido;
  cadastroConcluido = false;
  return tinha;
}

/** Sem acento, sem caixa. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function forma(v: string | null | undefined): (typeof FORMAS)[number] | null {
  if (!v) return null;
  if ((FORMAS as readonly string[]).includes(v)) return v as (typeof FORMAS)[number];
  const n = normalizar(v).replace(/s$/, '');
  if (n.startsWith('capsula')) return 'cápsula';
  if (n.startsWith('comprimido')) return 'comprimido';
  if (n.startsWith('gota')) return 'gotas';
  if (n === 'ml') return 'ml';
  // Inalador: dose em "jatos" (puffs). spray/aerossol/inalador/HFA caem aqui.
  if (
    n.startsWith('jato') ||
    n.startsWith('spray') ||
    n.startsWith('aeross') ||
    n.startsWith('inalad') ||
    n.startsWith('inalat') ||
    n === 'puff' ||
    n === 'hfa'
  ) {
    return 'jato';
  }
  return null;
}

/**
 * Encaixa no degrau mais proximo dos INTERVALOS oferecidos.
 *
 * Nao e preciosismo: se o modelo devolver 5 e a tela so oferece 4/6/8/12/24,
 * NENHUM chip fica aceso — e uma tela sem nada selecionado le-se como defeito,
 * nao como "a IA nao soube".
 */
function encaixarIntervalo(horas: number): number {
  return INTERVALOS.reduce((melhor, atual) => {
    const d = Math.abs(atual - horas);
    const dMelhor = Math.abs(melhor - horas);
    /**
     * EMPATE VAI PARA O INTERVALO MAIOR, e isso nao e detalhe.
     *
     * "A cada 10 horas" fica a mesma distancia de 8 e de 12. Escolher 8 faria
     * a pessoa tomar o remedio MAIS vezes por dia do que a receita pediu — e
     * entre errar para mais e errar para menos dose, a segunda e a recuperavel.
     */
    return d < dMelhor || (d === dMelhor && atual > melhor) ? atual : melhor;
  });
}

const TIPOS_VALIDOS: ScheduleType[] = ['interval', 'fixed_times', 'as_needed'];

/** O estado inicial do formulario, para a leitura preencher o que souber. */
export function camposVazios(): CamposDoRascunho {
  return {
    nome: '',
    concentracao: '',
    forma: 'cápsula',
    quantidade: '1',
    embalagem: '',
    tipo: 'interval',
    intervalo: 8,
    horarios: ['08:00'],
    instrucoes: '',
    fimDoTratamento: null,
  };
}

/**
 * Do que o servidor leu para os campos do formulario.
 *
 * E a unica peca desta entrega conferivel sem aparelho, e a que mais vai mudar
 * quando o modelo surpreender. Concentra-la aqui e deliberado.
 */
export function normalizarLeitura(
  lido: MedicamentoLido,
  agora = new Date(),
): { campos: CamposDoRascunho; camposLidos: CampoLido[] } {
  const campos = camposVazios();
  const lidos: CampoLido[] = [];

  campos.nome = lido.name.trim().slice(0, 120);
  lidos.push('nome');

  if (lido.strength) {
    campos.concentracao = lido.strength.trim().slice(0, 40);
    lidos.push('concentracao');
  }

  const f = forma(lido.form);
  if (f) {
    campos.forma = f;
    // So marca quando CASOU. Cair no padrao 'cápsula' e decisao nossa, nao
    // leitura da foto — marcar seria mentira.
    lidos.push('forma');
  }

  if (typeof lido.doseAmount === 'number' && lido.doseAmount > 0) {
    campos.quantidade = String(lido.doseAmount);
    lidos.push('quantidade');
  }

  if (typeof lido.packageAmount === 'number' && lido.packageAmount > 0) {
    campos.embalagem = String(lido.packageAmount);
    lidos.push('embalagem');
  }

  const horarios = lido.times.filter((h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h));
  const tipo = TIPOS_VALIDOS.includes(lido.scheduleType as ScheduleType)
    ? (lido.scheduleType as ScheduleType)
    : null;

  if (tipo) {
    campos.tipo = tipo;
    lidos.push('tipo');

    if (tipo === 'fixed_times' && horarios.length > 0) {
      campos.horarios = horarios.slice(0, 8);
      lidos.push('horarios');
    }
    if (tipo === 'interval' && typeof lido.intervalHours === 'number') {
      campos.intervalo = encaixarIntervalo(lido.intervalHours);
      lidos.push('intervalo');
    }
  }

  if (lido.instructions) {
    campos.instrucoes = lido.instructions.trim().slice(0, 1000);
    lidos.push('instrucoes');
  }

  /**
   * "Por 7 dias" vira data AQUI, com o relogio do APARELHO.
   *
   * O servidor devolve o numero de dias de proposito: ele roda em UTC e nao
   * sabe que dia e hoje aqui. Converter la daria o dia errado a partir das 21h
   * de Brasilia, em silencio.
   */
  if (typeof lido.durationDays === 'number' && lido.durationDays > 0) {
    const fim = new Date(agora);
    fim.setDate(fim.getDate() + lido.durationDays);
    campos.fimDoTratamento = fim.toISOString();
  }

  return { campos, camposLidos: lidos };
}
