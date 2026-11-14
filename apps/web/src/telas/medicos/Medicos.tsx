import { useQueryClient } from '@tanstack/react-query';
import { healthApi, type Professional } from '@gestao/shared/api/health';
import { distanciaKm, ordenarPorDistancia } from '@gestao/shared/lib/geo';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';

import { CHAVES, useLocalizacao, useMedicos, usePerfis } from '@/api/consultas';
import { mensagemDoErro } from '@/api/doses';
import { FundoDeTela } from '@/layout/FundoDeTela';
import { LARGURA_DE_DOIS_PAINEIS, useLarguraMinima } from '@/lib/useLargura';
import botoes from '@/ui/botoes.module.css';
import { Carregando } from '@/ui/Carregando';
import { useDialogos } from '@/ui/Dialogo';
import { DoctorCard } from '@/ui/DoctorCard';
import { DoctorsMap, urlDaRota } from '@/ui/DoctorsMap';
import { FilterChips, type Chip } from '@/ui/FilterChips';
import { Icone } from '@/ui/Icone';
import { Aviso, EmPainel, Pagina } from '@/ui/Pagina';
import { ProfileSelector } from '@/ui/ProfileSelector';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SectionHeader } from '@/ui/SectionHeader';

import { LocationBar } from './LocationBar';
import estilos from './medicos.module.css';

type Ponto = { latitude: number; longitude: number };

function posicaoDoNavegador(): Promise<Ponto> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('sem geolocalizacao'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      reject,
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 5 * 60_000 },
    );
  });
}

/**
 * Medicos: quem atende a familia, onde, e a que distancia.
 *
 * No celular e no tablet o mapa e uma faixa acima da lista, como no aplicativo.
 * Em tela larga ele ocupa o painel da direita, e clicar num alfinete mostra o
 * cartao do medico ali mesmo.
 */
export function Medicos() {
  const largo = useLarguraMinima(LARGURA_DE_DOIS_PAINEIS);
  const queryClient = useQueryClient();
  const { avisar } = useDialogos();

  const [perfilId, setPerfilId] = useState<string | null>(null);
  const [especialidade, setEspecialidade] = useState<string | null>(null);
  const [salvandoLocal, setSalvandoLocal] = useState(false);
  /** Posicao do navegador, usada so enquanto nao ha ponto de referencia fixado. */
  const [posicaoGps, setPosicaoGps] = useState<Ponto | null>(null);

  const perfis = usePerfis();
  const medicos = useMedicos(perfilId);
  const local = useLocalizacao();
  const lista = useMemo(() => medicos.data ?? [], [medicos.data]);
  const referencia = local.data ?? null;

  /**
   * O aplicativo pede a localizacao ao abrir a tela. No navegador, um pedido
   * de permissao que ninguem provocou e mal visto (e costuma ser negado): a
   * posicao so e lida aqui se a pessoa JA autorizou antes. O pedido em si
   * acontece no botao "Usar minha localizacao atual".
   */
  useEffect(() => {
    let cancelado = false;
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((estado) => (estado.state === 'granted' ? posicaoDoNavegador() : null))
      .then((p) => {
        if (p && !cancelado) setPosicaoGps(p);
      })
      .catch(() => {
        // Distancia e conveniencia: sem ela a lista fica em ordem alfabetica.
      });
    return () => {
      cancelado = true;
    };
  }, []);

  /** O ponto fixado na conta vale mais que a posicao do navegador. */
  const ponto = useMemo<Ponto | null>(() => {
    if (referencia?.latitude != null && referencia.longitude != null) {
      return { latitude: referencia.latitude, longitude: referencia.longitude };
    }
    return posicaoGps;
  }, [referencia, posicaoGps]);

  const chips = useMemo<Chip[]>(() => {
    const unicas = [...new Set(lista.map((m) => m.specialty).filter(Boolean))] as string[];
    unicas.sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return [{ value: null, label: 'Todas' }, ...unicas.map((e) => ({ value: e, label: e }))];
  }, [lista]);

  const visiveis = useMemo(() => {
    const filtrados = especialidade ? lista.filter((m) => m.specialty === especialidade) : lista;
    return ordenarPorDistancia(filtrados, ponto);
  }, [lista, especialidade, ponto]);

  function distanciaAte(m: Professional): number | null {
    if (!ponto || m.latitude == null || m.longitude == null) return null;
    return distanciaKm(ponto.latitude, ponto.longitude, m.latitude, m.longitude);
  }

  async function definirEndereco(address: string) {
    setSalvandoLocal(true);
    try {
      queryClient.setQueryData(CHAVES.localizacao, await healthApi.setLocationByAddress(address));
    } finally {
      setSalvandoLocal(false);
    }
  }

  async function usarPosicaoAtual(): Promise<boolean> {
    setSalvandoLocal(true);
    try {
      const p = await posicaoDoNavegador();
      setPosicaoGps(p);
      queryClient.setQueryData(
        CHAVES.localizacao,
        await healthApi.setLocationByCoords(p.latitude, p.longitude),
      );
      return true;
    } catch (e) {
      const negada = typeof GeolocationPositionError !== 'undefined' && e instanceof GeolocationPositionError && e.code === e.PERMISSION_DENIED;
      void avisar(
        negada ? 'Localização desativada' : 'Não consegui obter sua localização',
        negada
          ? 'Autorize o acesso à localização para este site nas configurações do navegador, ou fixe um endereço.'
          : 'Tente novamente ou fixe um endereço.',
      );
      return false;
    } finally {
      setSalvandoLocal(false);
    }
  }

  const conteudo = (
    <>
      <ScreenHeader title="Médicos" mostrarSino />

      <div className={estilos.bloco}>
        <ProfileSelector
          profiles={perfis.data ?? []}
          selectedId={perfilId}
          onSelect={setPerfilId}
          tituloDoPainel="Ver médicos de"
        />
      </div>

      <div className={estilos.blocoPequeno}>
        <LocationBar
          location={referencia}
          onSetAddress={definirEndereco}
          onUseCurrent={usarPosicaoAtual}
          saving={salvandoLocal}
        />
      </div>

      <div className={estilos.bloco}>
        <FilterChips
          rotulo="Especialidade"
          chips={chips}
          selected={especialidade}
          onSelect={setEspecialidade}
        />
      </div>

      {medicos.isPending ? (
        <Carregando />
      ) : medicos.isError && !medicos.data ? (
        <div className={estilos.secao}>
          <Aviso
            icone="alert-circle"
            erro
            acao={{ rotulo: 'Tentar de novo', onClick: () => void medicos.refetch() }}
          >
            {mensagemDoErro(medicos.error)}
          </Aviso>
        </div>
      ) : (
        <section className={estilos.secao}>
          {/* O titulo so promete proximidade quando ha de onde medir. */}
          <SectionHeader
            title={ponto ? 'Médicos próximos' : 'Meus médicos'}
            icon="leaf"
            verTodos={largo ? undefined : '/mapa'}
            verTodosLabel="Mapa"
          />

          {/* Na faixa da lista, o alfinete leva direto a rota, como no aplicativo. */}
          {largo ? null : (
            <div className={estilos.miniMapa}>
              <DoctorsMap
                doctors={visiveis}
                onSelectDoctor={(m) => {
                  if (m.latitude != null && m.longitude != null) {
                    window.open(urlDaRota(m.latitude, m.longitude), '_blank', 'noopener');
                  }
                }}
              />
            </div>
          )}

          {visiveis.length === 0 ? (
            <Aviso icone="user-plus">
              {lista.length === 0
                ? 'Você ainda não cadastrou nenhum médico.'
                : 'Nenhum médico nesta especialidade.'}
            </Aviso>
          ) : (
            <div className={estilos.pilha}>
              {visiveis.map((m) => (
                <DoctorCard key={m.id} doctor={m} distanceKm={distanciaAte(m)} />
              ))}
            </div>
          )}
        </section>
      )}

      <div className={estilos.acoes}>
        <Link to="/medico/novo" className={`${botoes.contorno} ${botoes.largo}`}>
          <Icone nome="plus" size={20} />
          Cadastrar médico
        </Link>
        <Link to="/consulta/nova" className={`${botoes.contorno} ${botoes.largo}`}>
          <Icone nome="calendar" size={20} />
          Nova consulta
        </Link>
      </div>
    </>
  );

  if (!largo) return <Pagina area="doctors">{conteudo}</Pagina>;

  return (
    <EmPainel.Provider value>
      <FundoDeTela area="doctors" />
      <div className={estilos.doisPaineis}>
        <main className={estilos.painelDaLista}>
          <Pagina area="doctors">{conteudo}</Pagina>
        </main>
        <aside className={estilos.painelDoMapa} aria-label="Mapa dos consultórios">
          <DoctorsMap doctors={visiveis} cheio />
        </aside>
      </div>
    </EmPainel.Provider>
  );
}

/** O mapa em tela cheia (celular e tablet): clicar num alfinete abre o cartao do medico. */
export function Mapa() {
  const medicos = useMedicos(null);

  return (
    <div className={estilos.mapaCheio}>
      {medicos.isPending ? <Carregando telaCheia /> : <DoctorsMap doctors={medicos.data ?? []} cheio />}
      <Link to="/medicos" className={estilos.voltarDoMapa} aria-label="Voltar">
        <Icone nome="chevron-left" size={24} />
      </Link>
    </div>
  );
}
