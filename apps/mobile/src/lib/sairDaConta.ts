import * as Notifications from 'expo-notifications';

import { esquecerAvisosLidos } from '@/lib/prefs';
import { cancelarTodosOsLembretes } from '@/lib/reminders';

/**
 * Apaga do APARELHO o que e da conta que esta saindo.
 *
 * Os dados de saude nao ficam no celular (vivem no estado das telas, que some
 * com a sessao). O que fica sao as notificacoes ja agendadas — "Ana: tomar
 * Amoxicilina as 08:00" — que o sistema dispara sozinho, com ou sem app aberto.
 * Sem esta limpeza, elas seguiam tocando depois do logout, inclusive com OUTRA
 * conta entrando no mesmo aparelho.
 *
 * Nunca lanca: falhar aqui nao pode impedir ninguem de sair.
 */
export async function limparDadosLocaisDaConta(): Promise<void> {
  await Promise.allSettled([
    cancelarTodosOsLembretes(),
    Notifications.dismissAllNotificationsAsync(),
    esquecerAvisosLidos(),
  ]);
}
