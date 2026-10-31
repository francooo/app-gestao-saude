import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type AdminDoPainel } from './cliente';

/** Respostas das rotas de server/telas/*. */

export interface Pagina<T> {
  itens: T[];
  total: number;
  pagina: number;
  porPagina: number;
}

export interface VisaoGeral {
  numeros: {
    contas: number;
    contas_ativas_30d: number;
    assinantes: number;
    em_teste: number;
    medicamentos_ativos: number;
    profissionais: number;
    perfis: number;
  };
  meses: { mes: string; ativas: number; novas: number }[];
  medicamentos: { nome: string; cadastros: number; pessoas: number }[];
  especialidades: { nome: string; profissionais: number }[];
  atividade: { tipo: 'cadastro' | 'leitura' | 'medicamento' | 'consulta'; quando: string; quem: string; detalhe: string | null }[];
  atualizadoEm: string;
}

export type Plano = 'assinante' | 'teste' | 'sem_plano';
export type SituacaoDaConta = 'ativa' | 'inativa' | 'desativada';

export interface Usuarios {
  numeros: {
    contas: number;
    ativas_hoje: number;
    novas_no_mes: number;
    perfis: number;
    ativas_1d: number;
    ativas_7d: number;
    ativas_30d: number;
  };
  lista: Pagina<{
    id: string;
    nome: string;
    email: string;
    nascimento: string | null;
    plano: Plano;
    perfis: number;
    ultimo_acesso: string | null;
    cadastro: string;
    situacao: SituacaoDaConta;
  }>;
}

export type SituacaoDaAssinatura = 'assinante' | 'em_teste' | 'teste_encerrado' | 'assinatura_vencida' | 'sem_plano';

export interface Assinaturas {
  numeros: {
    assinantes: number;
    em_teste: number;
    teste_acabando: number;
    teste_encerrado: number;
    assinatura_vencida: number;
    sem_plano: number;
    ja_assinaram: number;
    testes_concluidos: number;
  };
  lista: Pagina<{
    id: string;
    nome: string;
    email: string;
    situacao: SituacaoDaAssinatura;
    cadastro: string;
    fim: string | null;
    origem: string | null;
    produto: string | null;
  }>;
}

export type SituacaoDoEstoque = 'estoque_baixo' | 'validade_proxima' | 'estavel' | 'sem_controle';

export interface Medicamentos {
  numeros: {
    ativos: number;
    estoque_baixo: number;
    validade_proxima: number;
    sem_controle: number;
    lidas: number;
    lidas_30d: number;
    tentativas: number;
  };
  lista: Pagina<{
    id: string;
    nome: string;
    concentracao: string | null;
    forma: string | null;
    pessoa: string;
    conta: string;
    restante: string | null;
    validade: string | null;
    situacao: SituacaoDoEstoque;
  }>;
}

export interface Medicos {
  numeros: { profissionais: number; especialidades: number; proximas_30d: number; com_receita: number };
  especialidades: { nome: string; profissionais: number }[];
  lista: Pagina<{
    id: string;
    nome: string;
    especialidade: string;
    local: string | null;
    conta: string;
    consultas: number;
    ultima_consulta: string | null;
    proxima_consulta: string | null;
    receitas: number;
  }>;
}

export type Periodo = '7d' | '30d' | '90d' | '12m';
export type CategoriaDoRelatorio =
  | 'novas_contas'
  | 'contas_com_acesso'
  | 'medicamentos'
  | 'doses'
  | 'consultas'
  | 'leituras'
  | 'mensagens';

export interface Relatorio {
  periodo: Periodo;
  faixa: 'day' | 'week' | 'month';
  inicio: string | null;
  serie: { inicio: string; ativas: number; novas: number }[];
  consolidado: { categoria: CategoriaDoRelatorio; atual: number; anterior: number }[];
  plano: { assinantes: number; em_teste: number };
  atualizadoEm: string;
}

export interface Conta {
  admin: AdminDoPainel;
  ultimo_login: string | null;
  criado: string;
  senha_alterada: string;
}

export interface SessaoAtiva {
  id: string;
  ip: string | null;
  navegador: string | null;
  criada: string;
  ultimo_uso: string;
  expira: string;
  atual: boolean;
}

export type Auditoria = Pagina<{
  id: string;
  quando: string;
  admin: string;
  acao: string;
  recurso: string;
  detalhes: Record<string, unknown> | null;
  ip: string | null;
}>;

export interface Whatsapp {
  numeros: {
    acompanhantes: number;
    tentativas_30d: number;
    enviadas_30d: number;
    falhas_30d: number;
    ultima_enviada: string | null;
    ultima_situacao: string | null;
    ultima_tentativa: string | null;
  };
  porTipo: { tipo: string; enviadas: number }[];
  falhas: { id: string; tipo: string; quando: string; motivo: string | null }[];
}

function comParametros(caminho: string, parametros: Record<string, string | number | null | undefined>): string {
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(parametros)) {
    if (valor != null && valor !== '') busca.set(chave, String(valor));
  }
  const texto = busca.toString();
  return texto ? `${caminho}?${texto}` : caminho;
}

type Parametros = Record<string, string | number | null | undefined>;

/**
 * Busca de uma tela. `keepPreviousData` segura a pagina anterior na tela
 * enquanto a proxima carrega, em vez de piscar o esqueleto a cada filtro.
 */
function useTela<T>(caminho: string, parametros: Parametros = {}) {
  return useQuery({
    queryKey: [caminho, parametros],
    queryFn: () => api<T>(comParametros(caminho, parametros)),
    placeholderData: keepPreviousData,
  });
}

export const useVisaoGeral = () => useTela<VisaoGeral>('visao-geral');
export const useUsuarios = (p: Parametros) => useTela<Usuarios>('usuarios', p);
export const useAssinaturas = (p: Parametros) => useTela<Assinaturas>('assinaturas', p);
export const useMedicamentos = (p: Parametros) => useTela<Medicamentos>('medicamentos', p);
export const useMedicos = (p: Parametros) => useTela<Medicos>('medicos', p);
export const useRelatorio = (periodo: Periodo) => useTela<Relatorio>('relatorios', { periodo });
export const useConta = () => useTela<Conta>('conta');
export const useSessoes = () => useTela<{ sessoes: SessaoAtiva[] }>('auth/sessoes');
export const useAuditoria = (p: Parametros) => useTela<Auditoria>('auditoria', p);
export const useWhatsapp = () => useTela<Whatsapp>('whatsapp');

const enviar = (metodo: string, corpo?: unknown): RequestInit => ({
  method: metodo,
  body: corpo === undefined ? undefined : JSON.stringify(corpo),
});

/** Escritas das Configuracoes. Cada uma atualiza o que a tela mostra. */
export function useEditarPerfil() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (nome: string) => api<{ admin: AdminDoPainel }>('conta', enviar('PATCH', { nome })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conta'] });
      void queryClient.invalidateQueries({ queryKey: ['auditoria'] });
    },
  });
}

export function useTrocarSenha() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: { senhaAtual: string; novaSenha: string }) =>
      api<{ encerradas: number }>('auth/senha', enviar('POST', dados)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['auth/sessoes'] });
      void queryClient.invalidateQueries({ queryKey: ['auditoria'] });
    },
  });
}

export function useEncerrarOutrasSessoes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ encerradas: number }>('auth/encerrar-outras', enviar('POST')),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['auth/sessoes'] });
      void queryClient.invalidateQueries({ queryKey: ['auditoria'] });
    },
  });
}
