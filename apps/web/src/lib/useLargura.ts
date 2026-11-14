import { useSyncExternalStore } from 'react';

/**
 * true enquanto a janela tiver pelo menos `minimo` px de largura.
 *
 * Para o que o CSS sozinho nao resolve: decidir se um painel EXISTE (e busca
 * dados), e nao so se aparece.
 */
export function useLarguraMinima(minimo: number): boolean {
  const consulta = `(min-width: ${minimo}px)`;
  return useSyncExternalStore(
    (avisar) => {
      const mq = window.matchMedia(consulta);
      mq.addEventListener('change', avisar);
      return () => mq.removeEventListener('change', avisar);
    },
    () => window.matchMedia(consulta).matches,
    () => false,
  );
}

/** A partir daqui, Remedios e Medicos mostram lista e detalhe lado a lado. */
export const LARGURA_DE_DOIS_PAINEIS = 1280;
