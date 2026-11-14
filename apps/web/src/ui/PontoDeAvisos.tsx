import { useAvisos } from '@/lib/avisos';

/**
 * O ponto ambar do sino: ha aviso que ainda nao foi visto.
 *
 * Fica sobre o canto do botao que o contem — o botao precisa ter
 * `position: relative` (ou absolute). O texto escondido e o que o leitor de
 * tela diz depois de "Avisos".
 */
export function PontoDeAvisos() {
  const { temNaoLido } = useAvisos();
  if (!temNaoLido) return null;

  return (
    <span
      style={{
        position: 'absolute',
        top: 10,
        right: 11,
        width: 10,
        height: 10,
        border: '2px solid var(--cor-surface)',
        borderRadius: '50%',
        background: 'var(--cor-accent)',
        boxSizing: 'content-box',
      }}
    >
      <span className="so-leitor-de-tela">, há novidades</span>
    </span>
  );
}
