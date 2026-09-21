import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

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

/**
 * Identificador derivado do id da consulta — NUNCA sorteado.
 *
 * E o que impede duplicar o lembrete a cada reconciliacao: agendar de novo
 * com o mesmo identificador substitui o anterior em vez de somar.
 */
function identificadorDe(consultaId: string): string {
  return `consulta-${consultaId}`;
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
  const permitido = await pedirPermissao();
  if (!permitido) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('consultas', {
      name: 'Lembretes de consulta',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const agendadas = await Notifications.getAllScheduledNotificationsAsync();
  const nossas = new Set(
    agendadas
      .map((n) => n.identifier)
      .filter((id) => id.startsWith('consulta-')),
  );

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
