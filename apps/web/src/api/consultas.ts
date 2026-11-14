import { useQuery, useQueryClient } from '@tanstack/react-query';
import { API_ERROR } from '@gestao/shared';
import { ApiRequestError } from '@gestao/shared/api/client';
import { acompanhantesApi } from '@gestao/shared/api/acompanhantes';
import { contaApi } from '@gestao/shared/api/conta';
import { healthApi, type Medication } from '@gestao/shared/api/health';
import { addDays, endOfDay, startOfDay } from 'date-fns';
import { useCallback } from 'react';
import { useNavigate } from 'react-router';

/**
 * As leituras da API como consultas do react-query.
 *
 * No aplicativo cada tela refaz a busca ao ganhar foco (useFocusEffect). Aqui
 * a chave da consulta e o que duas telas dividem: o Inicio e a lista de
 * Remedios leem os mesmos remedios sem buscar duas vezes, e marcar uma dose
 * invalida a chave para as duas.
 *
 * Em falha, o react-query PRESERVA o ultimo dado bom — o mesmo cuidado que as
 * telas do aplicativo tem de nunca trocar a familia por uma lista vazia.
 */
export const CHAVES = {
  perfis: ['perfis'] as const,
  conta: ['conta'] as const,
  /** Raiz de todas as LISTAS de remedios: marcar uma dose atualiza todas de uma vez. */
  remedios: ['remedios'] as const,
  remediosDeHoje: ['remedios', 'hoje'] as const,
  listaDeRemedios: (perfilId: string | null) => ['remedios', 'lista', { perfilId }] as const,
  /** Um remedio so, com horarios, doses e anexos. Raiz propria: o formato e outro. */
  remedio: (id: string) => ['remedio', id] as const,
  historico: (id: string) => ['remedio', id, 'historico'] as const,
  consultasFuturas: ['consultas', 'futuras'] as const,
  medicos: (perfilId: string | null) => ['medicos', { perfilId }] as const,
  /** Sob a raiz 'medicos': salvar ou remover um medico invalida lista e ficha juntas. */
  medico: (id: string) => ['medicos', 'um', id] as const,
  localizacao: ['localizacao'] as const,
  /** Sob 'perfis': salvar um membro invalida a lista e a ficha juntas. */
  perfil: (id: string) => ['perfis', 'um', id] as const,
  /** Sob 'remedios' e 'consultas': marcar dose ou agendar atualiza os avisos. */
  remediosParaAvisos: ['remedios', 'avisos'] as const,
  consultasParaAvisos: ['consultas', 'avisos'] as const,
  /** Sob 'conta': aceitar a politica ou trocar de plano atualiza as duas. */
  contaComContagens: ['conta', 'contagens'] as const,
  acompanhantes: ['acompanhantes'] as const,
  sintomas: (perfilId: string | null) => ['sintomas', { perfilId }] as const,
};

export function usePerfis() {
  return useQuery({ queryKey: CHAVES.perfis, queryFn: () => healthApi.listProfiles() });
}

/**
 * Remedios com as doses de hoje e de amanha.
 *
 * Ate amanha porque um remedio de 12 em 12 horas tomado a noite tem a proxima
 * dose depois da meia-noite. `agora` vem junto, fixado na hora da busca: sem
 * isso, "proxima dose" poderia mudar no meio de um quadro e a tela discordaria
 * de si mesma.
 */
export function useRemediosDeHoje() {
  return useQuery({
    queryKey: CHAVES.remediosDeHoje,
    queryFn: async (): Promise<ListaDeRemedios> => {
      const agora = new Date();
      const remedios = await healthApi.listMedications({
        from: startOfDay(agora),
        to: endOfDay(addDays(agora, 1)),
      });
      return { remedios, agora };
    },
  });
}

/** O formato de toda lista de remedios em cache: os remedios e o instante da busca. */
export type ListaDeRemedios = { remedios: Medication[]; agora: Date };

/**
 * A lista da aba Remedios: todos da pessoa (ou da familia), inclusive os
 * pausados, com as doses de hoje e de amanha.
 */
export function useListaDeRemedios(perfilId: string | null) {
  return useQuery({
    queryKey: CHAVES.listaDeRemedios(perfilId),
    queryFn: async (): Promise<ListaDeRemedios> => {
      const agora = new Date();
      const remedios = await healthApi.listMedications({
        from: startOfDay(agora),
        to: endOfDay(addDays(agora, 1)),
        profileId: perfilId,
        includeInactive: true,
      });
      return { remedios, agora };
    },
    placeholderData: (anterior) => anterior,
  });
}

/** Um remedio, com o instante da busca fixado junto. */
export function useRemedio(id: string | undefined) {
  return useQuery({
    queryKey: CHAVES.remedio(id ?? ''),
    queryFn: async () => {
      const agora = new Date();
      return { remedio: await healthApi.getMedication(id!), agora };
    },
    enabled: Boolean(id),
  });
}

/**
 * Proximas consultas, so as AGENDADAS.
 *
 * A API filtra apenas por data: consulta cancelada no futuro volta na lista.
 */
export function useConsultasFuturas() {
  return useQuery({
    queryKey: CHAVES.consultasFuturas,
    queryFn: async () => {
      const consultas = await healthApi.listAppointments({ upcoming: true });
      return consultas.filter((c) => c.status === 'agendada');
    },
  });
}

/** Medicos da pessoa, ou de todos. O vinculo medico-pessoa so o servidor sabe. */
export function useMedicos(perfilId: string | null) {
  return useQuery({
    queryKey: CHAVES.medicos(perfilId),
    queryFn: () => healthApi.listProfessionals({ profileId: perfilId }),
    // Ao trocar de pessoa, a lista anterior fica na tela ate a nova chegar.
    placeholderData: (anterior) => anterior,
  });
}

/**
 * O nivel de acesso da conta.
 *
 * `premium` e OTIMISTA enquanto o plano nao chegou (ou se a busca falhar):
 * mostrar cadeado por causa de uma falha de rede castigaria justamente quem
 * paga. Quem bloqueia de verdade e o servidor, com 403 SUBSCRIPTION_REQUIRED.
 */
export function usePlano() {
  const consulta = useQuery({
    queryKey: CHAVES.conta,
    queryFn: () => contaApi.perfil(),
    // O plano muda raramente; nao precisa ser refeito a cada troca de tela.
    staleTime: 5 * 60_000,
  });
  const plano = consulta.data?.plano ?? null;
  return {
    plano,
    premium: plano ? plano.premium : true,
    carregado: !consulta.isPending,
    /** Busca o plano de novo agora ("Ja assinei", entrada na tela de assinatura). */
    recarregar: consulta.refetch,
    /**
     * O aceite da politica de privacidade nao e o da versao atual (ou nao
     * existe). So vale com a conta carregada: sem resposta, nao se acusa nada.
     */
    politicaVelha: consulta.data ? !consulta.data.consent?.atual : false,
  };
}

/**
 * Trata o 403 de assinatura em qualquer chamada de IA.
 *
 * Devolve uma funcao para o `catch`: se o erro for de assinatura, recarrega o
 * plano (ele pode ter vencido com a tela aberta), leva a tela de assinatura e
 * devolve true — quem chamou nao mostra mais nada.
 */
export function useAssinaturaExigida(): (e: unknown) => boolean {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useCallback(
    (e: unknown) => {
      if (!(e instanceof ApiRequestError) || e.code !== API_ERROR.SUBSCRIPTION_REQUIRED) {
        return false;
      }
      void queryClient.invalidateQueries({ queryKey: CHAVES.conta });
      navigate('/conta/assinatura');
      return true;
    },
    [queryClient, navigate],
  );
}

/** Todos os medicos da conta, para os formularios. */
export function useTodosOsMedicos() {
  return useMedicos(null);
}

/** Um medico, para a ficha de edicao. */
export function useMedico(id: string | undefined) {
  return useQuery({
    queryKey: CHAVES.medico(id ?? ''),
    queryFn: () => healthApi.getProfessional(id!),
    enabled: Boolean(id),
  });
}

/** O ponto de referencia da conta: de onde as distancias ate os consultorios sao medidas. */
export function useLocalizacao() {
  return useQuery({ queryKey: CHAVES.localizacao, queryFn: () => healthApi.getLocation() });
}

/** Uma pessoa da familia com as contagens do que esta ligado a ela. */
export function usePerfil(id: string | undefined) {
  return useQuery({
    queryKey: CHAVES.perfil(id ?? ''),
    queryFn: () => healthApi.getProfile(id!),
    enabled: Boolean(id),
  });
}

/** Quem recebe os avisos por WhatsApp, e se o envio esta ativado no servidor. */
export function useAcompanhantes() {
  return useQuery({ queryKey: CHAVES.acompanhantes, queryFn: () => acompanhantesApi.listar() });
}
