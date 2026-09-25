import { addDays } from 'date-fns';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Medication } from '@/api/health';
import { lembretesDeConsultaLigados } from '@/lib/prefs';
import {
  quantidadeComUnidade,
  slotsDoDia,
  tituloDoMedicamento,
  vigenteHoje,
} from '@/lib/posologia';

/**
 * Lembretes de consulta, como notificacoes LOCAIS.
 *
 * Nao ha servidor de push: cada aparelho agenda as proprias notificacoes a
 * partir da lista de consultas. O banco guarda a INTENCAO
 * (reminderMinutesBefore); o agendamento em si vive aqui.
 *
 * LIMITACAO que decorre disso, e que o usuario conhece: o lembrete so existe
 * no aparelho onde o app foi aberto depois de a consulta ser criada.
 * Reinstalar o app tambem perde os agendamentos ate a proxima reconciliacao.
 * Resolver de verdade exigiria push pelo servidor, com tabela de tokens.
 */

export type ConsultaParaLembrar = {
  id: string;
  scheduledAt: string;
  reminderMinutesBefore: number | null;
  profileName?: string | null;
  professionalName?: string | null;
};

const PREFIXO_CONSULTA = 'consulta-';
const PREFIXO_DOSE = 'dose-';

/**
 * Identificador derivado do id da consulta — NUNCA sorteado.
 *
 * E o que impede duplicar o lembrete a cada reconciliacao: agendar de novo
 * com o mesmo identificador substitui o anterior em vez de somar.
 */
function identificadorDe(consultaId: string): string {
  return `${PREFIXO_CONSULTA}${consultaId}`;
}

/**
 * Os identificadores ja agendados que pertencem a um dominio.
 *
 * Existe porque os dois dominios convivem na mesma fila do sistema: quem
 * cancela orfaos precisa enxergar so os seus.
 */
async function agendadasComPrefixo(prefixo: string): Promise<Set<string>> {
  const agendadas = await Notifications.getAllScheduledNotificationsAsync();
  return new Set(agendadas.map((n) => n.identifier).filter((id) => id.startsWith(prefixo)));
}

export async function pedirPermissao(): Promise<boolean> {
  const atual = await Notifications.getPermissionsAsync();
  if (atual.granted) return true;
  // Ja negada antes: nao insistimos. O app funciona sem lembrete.
  if (!atual.canAskAgain) return false;

  const pedido = await Notifications.requestPermissionsAsync();
  return pedido.granted;
}

/**
 * Reconcilia as notificacoes deste aparelho com a lista de consultas.
 *
 * Cancela o que nao existe mais e reagenda o restante. Chamada ao abrir o app
 * e depois de criar ou editar uma consulta.
 */
export async function reconciliarLembretes(consultas: ConsultaParaLembrar[]): Promise<void> {
  /**
   * CANCELA ANTES DE PEDIR PERMISSAO. A ordem inversa era um defeito.
   *
   * Isto aqui comecava com `pedirPermissao()` e desistia se negada. Num
   * aparelho onde a permissao foi revogada nos ajustes do sistema, desligar os
   * avisos NAO cancelava os lembretes de consulta ja agendados — e o `return`
   * silencioso escondia o problema. A funcao das doses sempre fez o certo; as
   * duas faziam o oposto uma da outra e so uma estava certa.
   */
  const jaAgendadas = await agendadasComPrefixo(PREFIXO_CONSULTA);

  /**
   * O portao da preferencia fica AQUI DENTRO, e nao em quem chama.
   *
   * Quem chama e a tela Inicio, que nao tem — nem deveria ter — nocao de
   * preferencia de notificacao. Obrigar cada tela a lembrar de conferir
   * espalharia a decisao por telas que nao tem nada com o assunto, e bastaria
   * uma esquecer para os avisos voltarem sozinhos.
   *
   * Nas doses e o contrario: la quem chama JA passa lista vazia quando a
   * preferencia esta desligada, porque a tela precisa do valor de qualquer
   * forma para desenhar o interruptor.
   */
  const ligado = await lembretesDeConsultaLigados();

  if (consultas.length === 0 || !ligado) {
    for (const id of jaAgendadas) await Notifications.cancelScheduledNotificationAsync(id);
    return;
  }

  const permitido = await pedirPermissao();
  if (!permitido) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('consultas', {
      name: 'Lembretes de consulta',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  // So os identificadores DESTE dominio. Sem o prefixo, a varredura de
  // orfaos daqui cancelaria os lembretes de dose, e vice-versa.
  const nossas = jaAgendadas;

  const querRemos = new Set<string>();

  for (const c of consultas) {
    if (c.reminderMinutesBefore == null) continue;

    const quando = new Date(
      new Date(c.scheduledAt).getTime() - c.reminderMinutesBefore * 60 * 1000,
    );

    // Lembrete no passado nao tem para que existir.
    if (quando.getTime() <= Date.now()) continue;

    const identifier = identificadorDe(c.id);
    querRemos.add(identifier);

    const quem = c.profileName ? ` de ${c.profileName.split(' ')[0]}` : '';
    const comQuem = c.professionalName ? ` com ${c.professionalName}` : '';

    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: `Consulta${quem}`,
        body: `Você tem uma consulta${comQuem} em breve.`,
        data: { appointmentId: c.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: quando,
        channelId: Platform.OS === 'android' ? 'consultas' : undefined,
      },
    });
  }

  // Consultas apagadas ou com lembrete desligado deixam notificacao orfa.
  for (const id of nossas) {
    if (!querRemos.has(id)) {
      await Notifications.cancelScheduledNotificationAsync(id);
    }
  }
}

export async function cancelarLembrete(consultaId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(identificadorDe(consultaId));
}

// ---------------------------------------------------------------------------
// Lembretes de dose
// ---------------------------------------------------------------------------

/**
 * Teto de notificacoes agendadas de dose.
 *
 * O iOS guarda no maximo 64 pendentes no total, e silenciosamente descarta o
 * excedente. Uma familia com 5 remedios de 8 em 8 horas por uma semana passa
 * disso facil — por isso a janela curta mais a reconciliacao a cada foco, e
 * nao "agende tudo de uma vez".
 */
const MAXIMO_DE_DOSES = 40;

/** Ate onde agendar as ocorrencias de um remedio "a cada N horas". */
const HORIZONTE_HORAS = 48;

/**
 * Reconcilia os avisos de dose deste aparelho.
 *
 * Duas estrategias, porque os dois tipos de horario sao diferentes de
 * verdade:
 *
 *  - `fixed_times` vira gatilho DIARIO (hora e minuto). Ele se repete sozinho,
 *    sobrevive a reinicializacao e nao depende de o aplicativo ser aberto.
 *  - `interval` nao tem hora do dia fixa, entao nao cabe num gatilho diario:
 *    agendamos as ocorrencias concretas das proximas 48 horas e completamos
 *    de novo a cada foco da tela.
 *  - `as_needed` nao gera aviso nenhum, e o texto do card nao promete que gera.
 *
 * Passar uma lista vazia desliga tudo — e assim que o interruptor funciona.
 */
export async function reconciliarLembretesDeDose(medicamentos: Medication[]): Promise<void> {
  const jaAgendadas = await agendadasComPrefixo(PREFIXO_DOSE);

  // Nada a agendar: cancela o que sobrou e nem pede permissao.
  if (medicamentos.length === 0) {
    for (const id of jaAgendadas) await Notifications.cancelScheduledNotificationAsync(id);
    return;
  }

  const permitido = await pedirPermissao();
  if (!permitido) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('doses', {
      name: 'Lembretes de remédio',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const canal = Platform.OS === 'android' ? 'doses' : undefined;
  const agora = new Date();
  const queremos = new Set<string>();
  let restantes = MAXIMO_DE_DOSES;

  for (const m of medicamentos) {
    if (restantes <= 0) break;
    if (m.scheduleType === 'as_needed' || !vigenteHoje(m, agora)) continue;

    const titulo = tituloDoMedicamento(m);
    const quem = m.profileName ? ` de ${m.profileName.split(' ')[0]}` : '';
    const corpo = `Está na hora${quem}: ${[quantidadeComUnidade(m.doseAmount ?? null, m.doseUnit ?? null), titulo].filter(Boolean).join(' de ')}.`;

    if (m.scheduleType === 'fixed_times') {
      for (const hhmm of m.times) {
        if (restantes <= 0) break;
        const [h, min] = hhmm.split(':').map(Number);
        // O identificador inclui o horario: um remedio de 08:00 e 20:00 sao
        // dois avisos, e sem isso o segundo substituiria o primeiro.
        const identifier = `${PREFIXO_DOSE}${m.id}-${hhmm}`;
        queremos.add(identifier);
        restantes--;

        await Notifications.scheduleNotificationAsync({
          identifier,
          content: { title: titulo, body: corpo, data: { medicationId: m.id } },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: h!,
            minute: min!,
            channelId: canal,
          },
        });
      }
      continue;
    }

    // interval
    const limite = new Date(agora.getTime() + HORIZONTE_HORAS * 3_600_000);
    const proximos = [...slotsDoDia(m, agora), ...slotsDoDia(m, addDays(agora, 1))].filter(
      (s) => s > agora && s <= limite,
    );

    for (const slot of proximos) {
      if (restantes <= 0) break;
      const identifier = `${PREFIXO_DOSE}${m.id}-${slot.getTime()}`;
      queremos.add(identifier);
      restantes--;

      await Notifications.scheduleNotificationAsync({
        identifier,
        content: { title: titulo, body: corpo, data: { medicationId: m.id } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: slot,
          channelId: canal,
        },
      });
    }
  }

  // Remedio apagado, encerrado, ou horario que mudou deixam aviso orfao.
  for (const id of jaAgendadas) {
    if (!queremos.has(id)) await Notifications.cancelScheduledNotificationAsync(id);
  }
}

/**
 * Cancela TUDO, nos dois dominios.
 *
 * Chamada pela tela de Ajustes ao desligar a chave geral. Explicita, e nao
 * "reconciliar com lista vazia" nos dois: quem desliga a chave nao tem as
 * listas em maos, e obrigar a tela a busca-las so para poder cancelar seria
 * uma ida ao servidor para nao fazer nada.
 */
export async function cancelarTodosOsLembretes(): Promise<void> {
  const ids = [
    ...(await agendadasComPrefixo(PREFIXO_CONSULTA)),
    ...(await agendadasComPrefixo(PREFIXO_DOSE)),
  ];
  for (const id of ids) await Notifications.cancelScheduledNotificationAsync(id);
}
