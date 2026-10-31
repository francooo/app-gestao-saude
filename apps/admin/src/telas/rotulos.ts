import type { Plano, SituacaoDaAssinatura, SituacaoDaConta, SituacaoDoEstoque } from '../api/telas';
import type { TomDaPill } from '../ui/componentes';

type Rotulo = { rotulo: string; tom: TomDaPill };

export const PLANO: Record<Plano, Rotulo> = {
  assinante: { rotulo: 'Assinante', tom: 'sucesso' },
  teste: { rotulo: 'Em teste', tom: 'info' },
  sem_plano: { rotulo: 'Sem plano', tom: 'neutro' },
};

export const SITUACAO_DA_CONTA: Record<SituacaoDaConta, Rotulo> = {
  ativa: { rotulo: 'Ativa', tom: 'sucesso' },
  inativa: { rotulo: 'Sem acesso há 30 dias', tom: 'neutro' },
  desativada: { rotulo: 'Desativada', tom: 'perigo' },
};

export const SITUACAO_DA_ASSINATURA: Record<SituacaoDaAssinatura, Rotulo> = {
  assinante: { rotulo: 'Assinante', tom: 'sucesso' },
  em_teste: { rotulo: 'Em teste', tom: 'info' },
  teste_encerrado: { rotulo: 'Teste encerrado', tom: 'neutro' },
  assinatura_vencida: { rotulo: 'Assinatura vencida', tom: 'perigo' },
  sem_plano: { rotulo: 'Sem plano', tom: 'neutro' },
};

export const SITUACAO_DO_ESTOQUE: Record<SituacaoDoEstoque, Rotulo> = {
  estoque_baixo: { rotulo: 'Estoque baixo', tom: 'aviso' },
  validade_proxima: { rotulo: 'Validade próxima', tom: 'info' },
  estavel: { rotulo: 'Estável', tom: 'sucesso' },
  sem_controle: { rotulo: 'Sem controle de estoque', tom: 'neutro' },
};

/** Forma do remedio (medications.form) -> unidade no plural/singular. */
const UNIDADES: Record<string, [string, string]> = {
  capsula: ['cápsula', 'cápsulas'],
  comprimido: ['comprimido', 'comprimidos'],
  gotas: ['gota', 'gotas'],
  ml: ['ml', 'ml'],
};

export function quantidade(valor: string | null, forma: string | null): string {
  if (valor == null) return '—';
  const n = Number(valor);
  const [um, varios] = UNIDADES[forma ?? ''] ?? ['unidade', 'unidades'];
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
}

/** Converte um Record de rotulos em opcoes de <Selecao>. */
export const opcoes = (mapa: Record<string, Rotulo>) =>
  Object.entries(mapa).map(([valor, { rotulo }]) => ({ valor, rotulo }));
