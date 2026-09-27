import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

/**
 * Tocar num lembrete do sistema leva a tela certa.
 *
 * O `data` do lembrete ja carrega `medicationId` e `appointmentId` DESDE
 * SEMPRE (ver reminders.ts) — faltava alguem ler. Ate agora, tocar num aviso
 * de dose apenas abria o aplicativo na ultima tela em que a pessoa estava.
 *
 * Mora dentro do layout de (app), DEPOIS do guard de sessao. No layout raiz, a
 * sessao ainda pode estar sendo restaurada, e navegar antes disso joga a
 * pessoa no login E PERDE O DESTINO.
 *
 * Componente sem interface em vez de hook solto: assim o efeito aparece na
 * arvore para quem for ler o layout.
 */
export function AberturaPorNotificacao() {
  const router = useRouter();

  /**
   * Respostas ja tratadas.
   *
   * ESTA GUARDA E O DEFEITO CLASSICO DESTE RECURSO. A consulta de "qual
   * notificacao abriu o aplicativo" devolve A MESMA RESPOSTA de novo ao voltar
   * do segundo plano. Sem a guarda, quem abriu pelo lembrete e navegou para o
   * Inicio e arrastado de volta ao remedio toda vez que troca de aplicativo.
   *
   * A chave inclui a DATA, e nao so o identificador: em horarios fixos o
   * gatilho e DIARIO e o identificador (`dose-<id>-08:00`) se repete todo dia,
   * entao segunda e terca teriam a mesma chave e a terca seria descartada como
   * duplicata.
   *
   * Vive em ref, nao no armazenamento: a duplicata que importa e dentro do
   * mesmo processo. Tratar de novo depois de matar e reabrir o aplicativo e
   * inofensivo — foi outro toque.
   */
  const tratadas = useRef<Set<string>>(new Set());

  const tratar = useCallback(
    (resposta: Notifications.NotificationResponse | null) => {
      if (!resposta) return;

      const pedido = resposta.notification.request;
      const chave = `${pedido.identifier}#${resposta.notification.date}`;
      if (tratadas.current.has(chave)) return;
      tratadas.current.add(chave);

      const dados = pedido.content.data as
        | { medicationId?: string; appointmentId?: string }
        | undefined;

      /**
       * Sem destino conhecido, NAO navega.
       *
       * Levar a algum lugar por padrao e pior que abrir onde a pessoa estava:
       * ela tocou num aviso especifico e cairia numa tela aleatoria.
       */
      let rota: string | null = null;
      if (dados?.medicationId) rota = `/remedios/${dados.medicationId}`;
      // Nao existe tela de detalhe de consulta ainda. A de Notificacoes tem o
      // aviso daquela consulta no topo, com hora, profissional e local — e um
      // destino que EXISTE e e util, em vez de meia tela feita as pressas.
      else if (dados?.appointmentId) rota = '/notificacoes';

      if (!rota) return;

      // setTimeout(0) protege contra "navigate before mount" na abertura a
      // frio, quando o efeito pode correr com a arvore ainda montando.
      setTimeout(() => router.push(rota as never), 0);
    },
    [router],
  );

  useEffect(() => {
    /**
     * Aplicativo MORTO: o ouvinte abaixo nao dispara, porque o JavaScript so
     * comeca a rodar depois do toque. Esta consulta devolve a resposta que
     * abriu o aplicativo.
     */
    void Notifications.getLastNotificationResponseAsync().then(tratar);

    // Aplicativo aberto ou em segundo plano.
    const assinatura = Notifications.addNotificationResponseReceivedListener(tratar);
    return () => assinatura.remove();
  }, [tratar]);

  return null;
}
