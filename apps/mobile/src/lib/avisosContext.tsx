import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { addDays, endOfDay, startOfDay } from 'date-fns';

import { contaApi, type Consentimento } from '@/api/conta';
import { healthApi, type Appointment, type Medication, type Profile } from '@/api/health';
import { montarAvisos, type Aviso } from '@/lib/avisos';
import { agoraLocalISO } from '@/lib/horaLocal';
import {
  avisosLidosAte,
  definirAvisosLidosAte,
  idsDeAvisosLidos,
  marcarAvisoComoLido,
} from '@/lib/prefs';

/**
 * Os avisos, num lugar so.
 *
 * SEM ISTO A ENTREGA NAO FECHA: o sino aparece em seis telas, e cada uma
 * carregando por conta propria viraria seis vezes quatro requisicoes a cada
 * troca de aba. O provider carrega uma vez e todo mundo le.
 *
 * Duas frequencias diferentes, de proposito:
 *  - RECARGA (rede) ao voltar o aplicativo, com trava de um minuto;
 *  - RECALCULO (so contas, sem rede) a cada minuto enquanto o aplicativo esta
 *    aberto — e o que faz uma dose virar atrasada sem ninguem tocar no
 *    telefone.
 */

type Estado = {
  avisos: AvisoComLeitura[];
  temNaoLido: boolean;
  carregando: boolean;
  erro: 'rede' | 'servidor' | null;
  /** Alguma das quatro chamadas falhou, mas outras vieram. */
  parcial: boolean;
  recarregar: () => Promise<void>;
  marcarTodasComoLidas: () => Promise<void>;
  marcarComoLido: (id: string) => Promise<void>;
};

export type AvisoComLeitura = Aviso & { lido: boolean };

const AvisosContext = createContext<Estado | null>(null);

/** Quanto tempo esperar antes de bater no servidor de novo ao voltar. */
const TRAVA_DE_RECARGA_MS = 60_000;
/** De quanto em quanto tempo os limiares sao reavaliados, sem rede. */
const RECALCULO_MS = 60_000;

export function AvisosProvider({ children }: { children: ReactNode }) {
  const [medicamentos, setMedicamentos] = useState<Medication[]>([]);
  const [consultas, setConsultas] = useState<Appointment[]>([]);
  const [perfis, setPerfis] = useState<Profile[]>([]);
  const [consentimento, setConsentimento] = useState<Consentimento | null>(null);

  const [agora, setAgora] = useState(() => new Date());
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<'rede' | 'servidor' | null>(null);
  const [parcial, setParcial] = useState(false);

  const [lidoAte, setLidoAte] = useState<string | null>(null);
  const [idsLidos, setIdsLidos] = useState<Set<string>>(new Set());

  const ultimaCarga = useRef(0);

  const carregar = useCallback(async (forcar = false) => {
    if (!forcar && Date.now() - ultimaCarga.current < TRAVA_DE_RECARGA_MS) return;
    ultimaCarga.current = Date.now();

    const referencia = new Date();

    /**
     * allSettled, e nao all.
     *
     * Sao quatro chamadas e uma pode cair. Se o consentimento falhar mas os
     * remedios vierem, esconder uma DOSE ATRASADA por causa da politica de
     * privacidade seria o pior desfecho possivel num aplicativo de remedio.
     */
    const [r1, r2, r3, r4] = await Promise.allSettled([
      healthApi.listMedications({
        from: startOfDay(referencia),
        to: endOfDay(addDays(referencia, 1)),
        includeInactive: true,
      }),
      healthApi.listAppointments({ upcoming: true }),
      healthApi.listProfiles(),
      contaApi.perfil(),
    ]);

    if (r1.status === 'fulfilled') setMedicamentos(r1.value);
    if (r2.status === 'fulfilled') setConsultas(r2.value);
    if (r3.status === 'fulfilled') setPerfis(r3.value);
    if (r4.status === 'fulfilled') setConsentimento(r4.value.consent);

    const falhas = [r1, r2, r3, r4].filter((r) => r.status === 'rejected').length;

    setParcial(falhas > 0 && falhas < 4);
    setErro(falhas === 4 ? 'rede' : null);
    setAgora(referencia);
    setCarregando(false);
  }, []);

  // Primeira carga e estado de lido.
  useEffect(() => {
    void carregar(true);
    void avisosLidosAte().then(setLidoAte);
    void idsDeAvisosLidos().then(setIdsLidos);
  }, [carregar]);

  // Voltar do segundo plano: rede, com trava.
  useEffect(() => {
    const assinatura = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') void carregar();
    });
    return () => assinatura.remove();
  }, [carregar]);

  /**
   * Recalculo sem rede.
   *
   * So mexe no relogio: os limiares sao comparacoes com `agora`, entao mover
   * `agora` e o suficiente para uma dose de 14:00 virar atrasada as 14:30 com
   * o aplicativo parado na tela.
   */
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), RECALCULO_MS);
    return () => clearInterval(id);
  }, []);

  const avisos = useMemo(() => {
    const crus = montarAvisos({ medicamentos, consultas, perfis, consentimento, agora });
    const corte = lidoAte ? new Date(lidoAte) : null;

    return crus.map((a) => ({
      ...a,
      // O carimbo cobre o que ja tinha surgido quando se marcou tudo; a lista
      // cobre o que foi marcado um a um. A politica nao tem instante, entao
      // so a lista a alcanca.
      lido: idsLidos.has(a.id) || (corte != null && a.surgiuEm != null && a.surgiuEm <= corte),
    }));
  }, [medicamentos, consultas, perfis, consentimento, agora, lidoAte, idsLidos]);

  /**
   * O ponto do sino NAO acende durante a primeira carga.
   *
   * Um ponto que aparece e some em 300 ms, em toda tela, treina a pessoa a
   * ignora-lo — que e exatamente o oposto do que esta entrega conserta.
   */
  const temNaoLido = !carregando && avisos.some((a) => !a.lido);

  const marcarTodasComoLidas = useCallback(async () => {
    const carimbo = agoraLocalISO(new Date());
    setLidoAte(carimbo);
    setIdsLidos(new Set());
    await definirAvisosLidosAte(carimbo);
  }, []);

  const marcarComoLido = useCallback(async (id: string) => {
    setIdsLidos((atual) => new Set(atual).add(id));
    await marcarAvisoComoLido(id);
  }, []);

  const valor = useMemo<Estado>(
    () => ({
      avisos,
      temNaoLido,
      carregando,
      erro,
      parcial,
      recarregar: () => carregar(true),
      marcarTodasComoLidas,
      marcarComoLido,
    }),
    [avisos, temNaoLido, carregando, erro, parcial, carregar, marcarTodasComoLidas, marcarComoLido],
  );

  return <AvisosContext.Provider value={valor}>{children}</AvisosContext.Provider>;
}

export function useAvisos(): Estado {
  const ctx = useContext(AvisosContext);
  if (!ctx) throw new Error('useAvisos precisa estar dentro de AvisosProvider');
  return ctx;
}
