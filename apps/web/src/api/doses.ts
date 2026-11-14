import { useQueryClient } from '@tanstack/react-query';
import { messageForError } from '@gestao/shared';
import type { Medication } from '@gestao/shared/api/health';
import { alternarDose, comDose, semDose } from '@gestao/shared/lib/marcarDose';
import { useCallback, useRef, useState } from 'react';

import { useDialogos } from '@/ui/Dialogo';

import { ApiRequestError } from './cliente';
import { CHAVES, type ListaDeRemedios } from './consultas';

/** Mensagem em portugues para qualquer erro vindo de uma chamada a API. */
export function mensagemDoErro(e: unknown): string {
  return messageForError(e instanceof ApiRequestError ? e.code : undefined);
}

/**
 * Marcar e desfazer dose, para qualquer tela.
 *
 * A regra — idempotencia, confirmacao antes de apagar registro, o horario que
 * a dose preenche — e a `alternarDose` compartilhada com o aplicativo. Aqui
 * fica so o que e da web: a confirmacao pelo Dialogo e a atualizacao do cache.
 *
 * O estado na tela vira SO depois da resposta, nunca antes: num aplicativo de
 * remedio, um "tomado" falso e o pior resultado possivel. Depois de salvo, a
 * dose entra em TODAS as listas em cache e no detalhe — o Inicio, a lista e o
 * painel aberto mostram a mesma coisa sem buscar de novo.
 */
export function useMarcarDose() {
  const queryClient = useQueryClient();
  const { confirmar, avisar } = useDialogos();
  const [emVoo, setEmVoo] = useState<ReadonlySet<string>>(new Set());
  // O clique duplo chega antes do estado renderizar; o ref barra na hora.
  const bloqueados = useRef(new Set<string>());

  const marcar = useCallback(
    async (m: Medication, agora: Date) => {
      if (bloqueados.current.has(m.id)) return;
      bloqueados.current.add(m.id);
      setEmVoo(new Set(bloqueados.current));

      try {
        const r = await alternarDose(m, agora, confirmar);
        if (r.tipo === 'nada') return;

        const aplicar = (x: Medication) =>
          r.tipo === 'registrada' ? comDose(x, r.dose) : semDose(x, r.doseId);

        // Sob a raiz 'remedios' ha dois formatos: as listas das telas
        // ({ remedios, agora }) e as buscas dos Avisos e do Assistente (so o
        // array). As duas recebem a dose — e o aviso de "dose atrasada" some
        // na hora, sem esperar a proxima busca.
        const trocar = (lista: Medication[]) =>
          lista.map((x) => (x.id === m.id ? aplicar(x) : x));
        queryClient.setQueriesData<ListaDeRemedios | Medication[]>(
          { queryKey: CHAVES.remedios },
          (lista) =>
            !lista
              ? lista
              : Array.isArray(lista)
                ? trocar(lista)
                : { ...lista, remedios: trocar(lista.remedios) },
        );
        queryClient.setQueryData<{ remedio: Medication; agora: Date }>(
          CHAVES.remedio(m.id),
          (d) => (d ? { ...d, remedio: aplicar(d.remedio) } : d),
        );
        // A dose muda a contagem do historico e o estoque, que so o servidor calcula.
        void queryClient.invalidateQueries({ queryKey: CHAVES.remedio(m.id) });
      } catch (e) {
        void avisar('Não consegui registrar', mensagemDoErro(e));
      } finally {
        bloqueados.current.delete(m.id);
        setEmVoo(new Set(bloqueados.current));
      }
    },
    [queryClient, confirmar, avisar],
  );

  return { marcar, emVoo };
}
