import { addDays, endOfDay, isSameDay, startOfDay } from 'date-fns';

import type { Appointment, Medication, Profile } from '@/api/health';
import type { Consentimento } from '@/api/conta';
import { agoraLocalISO } from '@/lib/horaLocal';
import { idadeDescrita } from '@/lib/pessoa';
import {
  diaCurto,
  doseNoSlot,
  hora,
  proximaDose,
  slotsDoDia,
  tituloDoMedicamento,
  vigenteHoje,
} from '@/lib/posologia';

/**
 * O catalogo de avisos.
 *
 * Modulo PURO: sem React, sem rede, sem armazenamento. Entra o que o
 * aplicativo ja baixou, sai a lista ordenada. E o unico pedaco desta entrega
 * conferivel sem aparelho, e e justamente onde moram os numeros que decidem se
 * a pessoa confia ou ignora os avisos.
 *
 * NAO E UM HISTORICO. Cada aviso e uma condicao que vale AGORA; resolvida a
 * condicao, o item some. O aplicativo tem um usuario por conta, entao registrar
 * "movimentacoes" seria devolver a pessoa o que ela mesma acabou de fazer.
 */

export type TipoDeAviso =
  | 'dose-atrasada'
  | 'dose-agora'
  | 'consulta-hoje'
  | 'consulta-amanha'
  | 'tratamento-terminando'
  | 'tratamento-terminado'
  | 'peso-desatualizado'
  | 'politica-desatualizada';

/** Os tres grupos dos chips do mockup. */
export type CategoriaDeAviso = 'medicamentos' | 'consultas' | 'lembretes';

export type Aviso = {
  /** Estavel entre renderizacoes: e o que permite marcar como lido. */
  id: string;
  tipo: TipoDeAviso;
  categoria: CategoriaDeAviso;
  titulo: string;
  subtitulo: string;
  /**
   * Quando a condicao PASSOU A VALER — nao quando o servidor mandou algo,
   * porque nao ha servidor mandando nada. E o que agrupa em "Hoje" e o que o
   * carimbo de "lido ate" compara.
   *
   * Nulo so na politica: `grantedAt` e o aceite da versao ANTIGA, e a data da
   * versao nova nao vem da API. Sem instante confiavel, ela responde apenas a
   * id — senao ficaria nao lida para sempre, ou seria marcada por um carimbo
   * que nao sabe a que data se refere.
   */
  surgiuEm: Date | null;
  /** Maior primeiro. */
  prioridade: number;
  /** Nulo deixa a linha inerte: sem seta, sem toque. */
  rota: string | null;
};

// ---------------------------------------------------------------------------
// Os limiares. Cada numero tem uma razao, e ela esta escrita.
// ---------------------------------------------------------------------------

/**
 * Quanto tempo depois do horario a dose vira "atrasada".
 *
 * Nao e gosto: `doseNoSlot` ja casa uma dose REGISTRADA com o horario dentro
 * de 30 min. Abaixo disso o proprio aplicativo considera que a dose E daquele
 * horario — avisar de atraso antes seria o aplicativo se contradizendo, porque
 * a dose registrada naquele instante contaria como pontual.
 *
 * E 30 min e o tempo real de "acordar, cafe, remedio". Cobrar antes disso e
 * cobrar enquanto a pessoa vai ate a cozinha.
 */
const ATRASO_MIN = 30;

/**
 * Por quanto tempo o aviso de atraso continua aparecendo.
 *
 * Doze horas, e nunca atravessando o dia (ver `mesmoDia` abaixo). O remedio de
 * madrugada e o motivo: um de 6/6h tem horario as 02:00, e gritar as 20:00 que
 * ele esta atrasado ha 18 horas e ruido sobre algo irrecuperavel — que ainda
 * por cima afoga a dose das 20:00, essa sim acionavel.
 */
const ATRASO_MAXIMO_H = 12;

/** Janela em que a dose e "de agora" em vez de futura. */
const AGORA_ANTES_MIN = 30;
const AGORA_DEPOIS_MIN = 60;

/**
 * Quantos dias antes do fim o tratamento vira aviso.
 *
 * Dois: e o prazo em que ainda da para ligar ao medico e renovar antes de
 * acabar. Um dia e tarde — um fim de semana come o dia inteiro. Sete vira
 * ruido por uma semana.
 */
const FIM_PROXIMO_DIAS = 2;

/**
 * Por quantos dias o tratamento encerrado continua sendo lembrado.
 *
 * Existe porque NADA no banco desativa um tratamento sozinho: o remedio com
 * `endsAt` vencido fica ativo para sempre, sumido da tela de hoje mas vivo no
 * cadastro. Este aviso e o unico lugar do aplicativo que oferece arrumar isso.
 * Para sempre seria uma lista de entulho crescendo; sete dias da uma semana de
 * chance.
 */
const FIM_PASSADO_DIAS = 7;

/** Teto de avisos de tratamento encerrado, para nao virar lista de entulho. */
const MAXIMO_TERMINADOS = 3;

/**
 * Quando o peso cadastrado fica velho demais para calcular dose.
 *
 * Cento e oitenta dias: adulto estavel nao muda de peso a ponto de mudar dose
 * em menos disso, e nesse intervalo quase toda consulta de rotina ja
 * aconteceu. Noventa geraria quatro avisos por pessoa por ano num aplicativo
 * cujo estado saudavel e lista vazia.
 */
const PESO_VELHO_DIAS = 180;

export type EntradaDeAvisos = {
  medicamentos: Medication[];
  consultas: Appointment[];
  perfis: Profile[];
  consentimento: Consentimento | null;
  /** Fixado por quem chama, para todos os avisos concordarem sobre "agora". */
  agora: Date;
};

export function montarAvisos(entrada: EntradaDeAvisos): Aviso[] {
  const { medicamentos, consultas, perfis, consentimento, agora } = entrada;

  // Com mais de uma pessoa na casa, o nome entra no subtitulo: "a dose" de
  // quem? Com uma so, o nome e ruido.
  const varias = perfis.filter((p) => p.isActive !== false).length > 1;

  return [
    ...avisosDeDose(medicamentos, agora, varias),
    ...avisosDeConsulta(consultas, agora),
    ...avisosDeTratamento(medicamentos, agora),
    ...avisosDePeso(perfis, agora),
    ...avisoDePolitica(consentimento),
  ].sort(ordenar);
}

/**
 * Ordem: prioridade, depois o mais recente, depois o id.
 *
 * O terceiro criterio nao e enfeite: sem ele, dois avisos de mesma prioridade
 * e mesmo instante trocam de lugar entre renderizacoes, e o dedo erra o alvo.
 */
function ordenar(a: Aviso, b: Aviso): number {
  if (a.prioridade !== b.prioridade) return b.prioridade - a.prioridade;
  const ta = a.surgiuEm?.getTime() ?? 0;
  const tb = b.surgiuEm?.getTime() ?? 0;
  if (ta !== tb) return tb - ta;
  return a.id.localeCompare(b.id);
}

// ---------------------------------------------------------------------------
// Doses
// ---------------------------------------------------------------------------

function avisosDeDose(medicamentos: Medication[], agora: Date, varias: boolean): Aviso[] {
  const avisos: Aviso[] = [];

  for (const m of medicamentos) {
    if (!vigenteHoje(m, agora) || m.scheduleType === 'as_needed') continue;

    const quem = varias && m.profileName ? `${m.profileName.split(' ')[0]} · ` : '';

    /**
     * UM aviso de atraso por medicamento, no maximo.
     *
     * Um remedio de 4/4h num dia em que ninguem abriu o aplicativo geraria
     * cinco linhas identicas, afogando a consulta de amanha. O aviso e um so,
     * com o horario mais recente, e o titulo conta quantos. E exatamente assim
     * que se ensina alguem a ignorar avisos.
     */
    const atrasados = slotsDoDia(m, agora).filter(
      (s) =>
        !doseNoSlot(m, m.doses, s) &&
        s <= new Date(agora.getTime() - ATRASO_MIN * 60_000) &&
        s >= new Date(agora.getTime() - ATRASO_MAXIMO_H * 3_600_000) &&
        // A dose de ontem NAO pode mais ser tomada: tomar a das 22h as 8h da
        // manha seguinte encavala com a das 8h. E a mesma fronteira que a aba
        // Remedios usa — um aviso de ontem contradiria a tela.
        isSameDay(s, agora),
    );

    if (atrasados.length > 0) {
      const ultimo = atrasados.at(-1)!;
      avisos.push({
        id: `dose-atrasada:${m.id}:${agoraLocalISO(ultimo)}`,
        tipo: 'dose-atrasada',
        categoria: 'medicamentos',
        titulo: atrasados.length === 1 ? 'Dose atrasada' : `${atrasados.length} doses atrasadas`,
        subtitulo: `${quem}${tituloDoMedicamento(m)} · era às ${hora(ultimo)}`,
        surgiuEm: new Date(ultimo.getTime() + ATRASO_MIN * 60_000),
        prioridade: 100,
        rota: `/remedios/${m.id}`,
      });
      continue;
    }

    const proxima = proximaDose(m, agora);
    if (!proxima) continue;

    const dentroDaJanela =
      proxima > new Date(agora.getTime() - AGORA_ANTES_MIN * 60_000) &&
      proxima <= new Date(agora.getTime() + AGORA_DEPOIS_MIN * 60_000);

    if (dentroDaJanela) {
      avisos.push({
        id: `dose-agora:${m.id}:${agoraLocalISO(proxima)}`,
        tipo: 'dose-agora',
        categoria: 'medicamentos',
        titulo: 'Hora do medicamento',
        subtitulo: `${quem}${tituloDoMedicamento(m)} · às ${hora(proxima)}`,
        surgiuEm: new Date(proxima.getTime() - AGORA_DEPOIS_MIN * 60_000),
        prioridade: 80,
        rota: `/remedios/${m.id}`,
      });
    }
  }

  return avisos;
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

function avisosDeConsulta(consultas: Appointment[], agora: Date): Aviso[] {
  const avisos: Aviso[] = [];
  const fimDeHoje = endOfDay(agora);
  const amanha = addDays(agora, 1);

  for (const c of consultas) {
    /**
     * O filtro de situacao e NOSSO, e e obrigatorio.
     *
     * `GET /api/appointments?upcoming=true` so compara a data — consulta
     * CANCELADA no futuro volta na lista. Avisar sobre ela seria mandar a
     * pessoa a um consultorio que ela mesma desmarcou.
     */
    if (c.status !== 'agendada') continue;

    const quando = new Date(c.scheduledAt);
    // Ja passou hoje: nao ha o que fazer, e nao existe "marcar como realizada".
    if (quando <= agora) continue;

    const hoje = quando <= fimDeHoje;
    const ehAmanha = isSameDay(quando, amanha);
    if (!hoje && !ehAmanha) continue;

    const onde = c.location ?? (c.modality === 'teleconsulta' ? 'Teleconsulta' : null);
    const quem = c.professionalName ?? c.title ?? 'Consulta';

    avisos.push({
      id: `consulta:${c.id}:${c.scheduledAt}`,
      tipo: hoje ? 'consulta-hoje' : 'consulta-amanha',
      categoria: 'consultas',
      titulo: hoje ? 'Consulta hoje' : 'Consulta amanhã',
      subtitulo: [quem, hora(quando), onde].filter(Boolean).join(' · '),
      surgiuEm: startOfDay(addDays(quando, -1)),
      prioridade: hoje ? 90 : 70,
      /**
       * Nao existe tela de detalhe de consulta. Com profissional vinculado, a
       * ficha dele e o destino mais util (telefone, endereco); sem ele, a
       * linha fica INERTE — um cartao com seta que nao vai a lugar nenhum e
       * pior que um cartao parado.
       */
      rota: c.professionalId ? `/medico/${c.professionalId}` : null,
    });
  }

  return avisos;
}

// ---------------------------------------------------------------------------
// Tratamentos
// ---------------------------------------------------------------------------

function avisosDeTratamento(medicamentos: Medication[], agora: Date): Aviso[] {
  const terminando: Aviso[] = [];
  const terminados: Aviso[] = [];

  const inicioDeHoje = startOfDay(agora);
  const limiteProximo = endOfDay(addDays(agora, FIM_PROXIMO_DIAS));
  const limitePassado = startOfDay(addDays(agora, -FIM_PASSADO_DIAS));

  for (const m of medicamentos) {
    if (!m.isActive || !m.endsAt) continue;
    const fim = new Date(m.endsAt);

    if (fim >= inicioDeHoje && fim <= limiteProximo) {
      terminando.push({
        id: `tratamento-fim:${m.id}:${m.endsAt}`,
        tipo: 'tratamento-terminando',
        categoria: 'medicamentos',
        titulo: isSameDay(fim, agora) ? 'Tratamento termina hoje' : 'Tratamento terminando',
        subtitulo: `${tituloDoMedicamento(m)} · até ${diaCurto(fim)}`,
        surgiuEm: startOfDay(addDays(fim, -FIM_PROXIMO_DIAS)),
        prioridade: 60,
        rota: `/remedios/${m.id}`,
      });
    } else if (fim < inicioDeHoje && fim >= limitePassado) {
      terminados.push({
        id: `tratamento-fim:${m.id}:${m.endsAt}`,
        tipo: 'tratamento-terminado',
        categoria: 'medicamentos',
        titulo: 'Tratamento encerrado',
        subtitulo: `${tituloDoMedicamento(m)} · terminou em ${diaCurto(fim)}`,
        surgiuEm: startOfDay(addDays(fim, 1)),
        prioridade: 40,
        rota: `/remedios/${m.id}`,
      });
    }
  }

  // Os mais recentes primeiro, e so os tres — o resto seria entulho.
  terminados.sort((a, b) => (b.surgiuEm?.getTime() ?? 0) - (a.surgiuEm?.getTime() ?? 0));
  return [...terminando, ...terminados.slice(0, MAXIMO_TERMINADOS)];
}

// ---------------------------------------------------------------------------
// Peso
// ---------------------------------------------------------------------------

function avisosDePeso(perfis: Profile[], agora: Date): Aviso[] {
  const limite = new Date(agora.getTime() - PESO_VELHO_DIAS * 24 * 3_600_000);

  return perfis
    .filter((p) => {
      if (p.isActive === false) return false;

      /**
       * Peso AUSENTE nao gera aviso.
       *
       * Tentador, mas `Profile` nao expoe `createdAt`: o aviso apareceria no
       * segundo seguinte ao cadastro de um membro, cobrando o campo que a
       * pessoa acabou de decidir deixar em branco.
       */
      if (p.weightKg == null) return false;

      /**
       * Peso SEM DATA tambem nao.
       *
       * E o perfil anterior a coluna da data existir — o peso pode ter sido
       * anotado ontem e o aplicativo nao sabe. Pior: emitir aqui faria TODO
       * MUNDO receber o aviso no dia do lancamento, de uma vez. A data volta a
       * existir na primeira vez que alguem salvar o peso.
       */
      if (!p.weightMeasuredAt) return false;

      return new Date(p.weightMeasuredAt) < limite;
    })
    .map((p) => {
      const medido = new Date(p.weightMeasuredAt!);
      const idade = idadeDescrita(p.birthDate);

      return {
        id: `peso:${p.id}:${p.weightMeasuredAt}`,
        tipo: 'peso-desatualizado' as const,
        categoria: 'lembretes' as const,
        titulo: 'Peso desatualizado',
        subtitulo: [
          p.fullName.split(' ')[0],
          idade,
          `${p.weightKg} kg anotado em ${diaCurto(medido)}`,
        ]
          .filter(Boolean)
          .join(' · '),
        surgiuEm: new Date(medido.getTime() + PESO_VELHO_DIAS * 24 * 3_600_000),
        prioridade: 30,
        rota: `/membro/${p.id}`,
      };
    });
}

// ---------------------------------------------------------------------------
// Politica
// ---------------------------------------------------------------------------

function avisoDePolitica(consentimento: Consentimento | null): Aviso[] {
  if (consentimento && consentimento.atual) return [];

  return [
    {
      id: `politica:${consentimento?.policyVersion ?? 'sem-registro'}`,
      tipo: 'politica-desatualizada',
      categoria: 'lembretes',
      titulo: consentimento
        ? 'Política de privacidade atualizada'
        : 'Aceite da política não registrado',
      subtitulo: consentimento
        ? 'Leia e aceite a versão mais recente'
        : 'Não encontramos o registro do seu aceite',
      // Sem instante: ver o comentario do campo, em `Aviso`.
      surgiuEm: null,
      prioridade: 20,
      rota: '/conta/privacidade',
    },
  ];
}
