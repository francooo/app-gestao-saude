import { useQuery } from '@tanstack/react-query';
import { contaApi } from '@gestao/shared/api/conta';
import { healthApi } from '@gestao/shared/api/health';
import { montarAvisos, type Aviso } from '@gestao/shared/lib/avisos';
import { agoraLocalISO } from '@gestao/shared/lib/horaLocal';
import { addDays, endOfDay, startOfDay } from 'date-fns';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { CHAVES } from '@/api/consultas';
import { useAuth } from '@/auth/AuthProvider';

/**
 * Os avisos, num lugar so — o par do AvisosProvider do aplicativo.
 *
 * NAO E CAIXA DE ENTRADA: cada aviso e uma condicao que vale agora (dose
 * atrasada, consulta amanha), calculada no navegador a partir dos dados da
 * conta. Nada chega do servidor "empurrado".
 *
 * Duas frequencias, como la:
 *  - a REDE fica com o react-query (ao abrir, ao voltar para a aba, e quando
 *    uma dose marcada ou uma consulta nova invalida a chave);
 *  - o RELOGIO anda a cada minuto, sem rede — e o que faz a dose das 14:00
 *    virar atrasada com a pagina parada na tela.
 */
export type AvisoComLeitura = Aviso & { lido: boolean };

type Estado = {
  avisos: AvisoComLeitura[];
  temNaoLido: boolean;
  carregando: boolean;
  /** Nenhuma das quatro buscas respondeu. */
  erro: boolean;
  /** Alguma falhou, mas outras vieram. */
  parcial: boolean;
  recarregar: () => void;
  marcarTodasComoLidas: () => void;
  marcarComoLido: (id: string) => void;
};

const Contexto = createContext<Estado | null>(null);

/** Os avisos nao precisam ser refeitos a cada troca de tela. */
const VALIDADE_MS = 60_000;
const RECALCULO_MS = 60_000;
/** Quantos ids marcados um a um sao lembrados; o mais antigo cai. */
const MAXIMO_DE_IDS = 24;

/**
 * O "lido" mora no localStorage: e preferencia deste navegador, sem nada de
 * saude dentro (so ids e um horario). A chave leva o id da conta, para duas
 * pessoas no mesmo computador nao herdarem o lido uma da outra.
 */
function ler(chave: string): string | null {
  try {
    return window.localStorage.getItem(chave);
  } catch {
    // Navegacao privada ou armazenamento bloqueado: segue sem lembrar.
    return null;
  }
}

function gravar(chave: string, valor: string): void {
  try {
    window.localStorage.setItem(chave, valor);
  } catch {
    // Perder a preferencia e melhor que quebrar a tela.
  }
}

export function AvisosProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const chaveAte = `gs_avisos_lidos_ate:${user?.id ?? ''}`;
  const chaveIds = `gs_avisos_lidos_ids:${user?.id ?? ''}`;

  const remedios = useQuery({
    queryKey: CHAVES.remediosParaAvisos,
    queryFn: () => {
      const agora = new Date();
      return healthApi.listMedications({
        from: startOfDay(agora),
        to: endOfDay(addDays(agora, 1)),
        includeInactive: true,
      });
    },
    staleTime: VALIDADE_MS,
  });
  const consultas = useQuery({
    queryKey: CHAVES.consultasParaAvisos,
    queryFn: () => healthApi.listAppointments({ upcoming: true }),
    staleTime: VALIDADE_MS,
  });
  const perfis = useQuery({
    queryKey: CHAVES.perfis,
    queryFn: () => healthApi.listProfiles(),
    staleTime: VALIDADE_MS,
  });
  const conta = useQuery({
    queryKey: CHAVES.conta,
    queryFn: () => contaApi.perfil(),
    staleTime: 5 * VALIDADE_MS,
  });

  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setAgora(new Date()), RECALCULO_MS);
    return () => window.clearInterval(id);
  }, []);
  // Dado novo tambem acerta o relogio: senao uma dose recem-marcada seria
  // comparada com um "agora" de ate um minuto atras.
  useEffect(() => {
    setAgora(new Date());
  }, [remedios.dataUpdatedAt, consultas.dataUpdatedAt]);

  const [lidoAte, setLidoAte] = useState<string | null>(null);
  const [idsLidos, setIdsLidos] = useState<string[]>([]);
  useEffect(() => {
    setLidoAte(ler(chaveAte) || null);
    setIdsLidos((ler(chaveIds) ?? '').split('\n').filter(Boolean));
  }, [chaveAte, chaveIds]);

  const avisos = useMemo<AvisoComLeitura[]>(() => {
    const crus = montarAvisos({
      medicamentos: remedios.data ?? [],
      consultas: consultas.data ?? [],
      perfis: perfis.data ?? [],
      consentimento: conta.data?.consent ?? null,
      plano: conta.data?.plano ?? null,
      agora,
    });
    const corte = lidoAte ? new Date(lidoAte) : null;
    const ids = new Set(idsLidos);

    return crus.map((a) => ({
      ...a,
      // O carimbo cobre o que ja tinha surgido quando se marcou tudo; a lista,
      // o que foi marcado um a um.
      lido: ids.has(a.id) || (corte != null && a.surgiuEm != null && a.surgiuEm <= corte),
    }));
  }, [remedios.data, consultas.data, perfis.data, conta.data, agora, lidoAte, idsLidos]);

  const buscas = [remedios, consultas, perfis, conta];
  const falhas = buscas.filter((b) => b.isError).length;
  const carregando = buscas.some((b) => b.isPending);

  const refazer = [remedios.refetch, consultas.refetch, perfis.refetch, conta.refetch];
  const recarregar = useCallback(() => {
    for (const r of refazer) void r();
    // As funcoes de refetch do react-query sao estaveis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const marcarTodasComoLidas = useCallback(() => {
    const carimbo = agoraLocalISO(new Date());
    // O carimbo cobre o que tem instante. O aviso sem instante (a politica)
    // so a lista alcanca — sem ele aqui, "marcar todas" deixaria um para tras.
    const semInstante = avisos.filter((a) => a.surgiuEm == null).map((a) => a.id);
    setLidoAte(carimbo);
    setIdsLidos(semInstante);
    gravar(chaveAte, carimbo);
    gravar(chaveIds, semInstante.join('\n'));
  }, [avisos, chaveAte, chaveIds]);

  const marcarComoLido = useCallback(
    (id: string) => {
      setIdsLidos((atual) => {
        const novos = [...atual.filter((x) => x !== id), id].slice(-MAXIMO_DE_IDS);
        gravar(chaveIds, novos.join('\n'));
        return novos;
      });
    },
    [chaveIds],
  );

  const valor = useMemo<Estado>(
    () => ({
      avisos,
      // O ponto do sino NAO acende durante a primeira carga: um ponto que
      // pisca em toda abertura ensina a ignora-lo.
      temNaoLido: !carregando && avisos.some((a) => !a.lido),
      carregando,
      erro: falhas === buscas.length,
      parcial: falhas > 0 && falhas < buscas.length,
      recarregar,
      marcarTodasComoLidas,
      marcarComoLido,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [avisos, carregando, falhas, recarregar, marcarTodasComoLidas, marcarComoLido],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAvisos(): Estado {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useAvisos precisa estar dentro de <AvisosProvider>');
  return ctx;
}
