import { usePessoaAtiva } from '@/lib/pessoaAtiva';

import { Icone } from './Icone';

/**
 * Para as telas que precisam de UMA pessoa (Sintomas, Medicoes, Relatorio):
 * em "Todos" elas mostram o titular, e esta linha diz isso — senao a pessoa
 * acharia que viu a familia inteira.
 */
export function AvisoDoTitular({ className }: { className?: string }) {
  const { pessoa, pessoaOuTitular } = usePessoaAtiva();
  if (pessoa || !pessoaOuTitular) return null;
  const nome = pessoaOuTitular.fullName.split(' ')[0];
  return (
    <p
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginTop: 12,
        fontSize: 14,
        color: 'var(--salvia-texto)',
      }}
    >
      <Icone nome="info" size={16} />
      Mostrando {nome} (titular). Para ver outra pessoa, escolha no topo.
    </p>
  );
}
