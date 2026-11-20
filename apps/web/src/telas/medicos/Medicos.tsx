import { useQueryClient } from '@tanstack/react-query';
import { healthApi, type Professional } from '@gestao/shared/api/health';
import { distanciaKm, ordenarPorDistancia } from '@gestao/shared/lib/geo';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';

import { CHAVES, useConsultasFuturas, useLocalizacao, useMedicos } from '@/api/consultas';
import { mensagemDoErro } from '@/api/doses';
import medicaCrianca from '@/imagens/repag/medica-crianca.webp';
import { usePessoaAtiva } from '@/lib/pessoaAtiva';
import botoes from '@/ui/botoes.module.css';
import { Carregando } from '@/ui/Carregando';
import { useDialogos } from '@/ui/Dialogo';
import { AdicionarMedicoCard, DoctorCard } from '@/ui/DoctorCard';
import { DoctorsMap, urlDaRota } from '@/ui/DoctorsMap';
import { Icone } from '@/ui/Icone';
import { Aviso, Pagina } from '@/ui/Pagina';
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

/** Sem acento e sem caixa: "Clínico geral" e "clinico geral" sao a mesma especialidade. */
function chaveDaEspecialidade(e: string): string {
  return e.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/** Icone de cada especialidade comum; o resto usa o estetoscopio. */
function iconeDaEspecialidade(chave: string): string {
  if (chave.includes('pediat')) return 'smile';
  if (chave.includes('cardio')) return 'activity';
  if (chave.includes('derma')) return 'sun';
  if (chave.includes('oftalmo')) return 'eye';
  if (chave.includes('odonto') || chave.includes('dentist')) return 'smile';
  if (chave.includes('gineco') || chave.includes('obstet')) return 'heart';
  if (chave.includes('psic') || chave.includes('psiq') || chave.includes('neuro')) return 'mci:head-alert-outline';
  return 'mci:medical-bag';
}

/**
 * Medicos da familia (mock 04 da repaginacao): chips de especialidade, a
 * grade de cartoes com a proxima consulta de cada um e o cartao terracota de
 * adicionar. O mapa e o ponto de referencia ficam abaixo da grade.
 *
 * A pessoa vem do seletor do cabecalho (lib/pessoaAtiva).
 */
export function Medicos() {
  const queryClient = useQueryClient();
  const { avisar } = useDialogos();

  const { pessoaId: perfilId } = usePessoaAtiva();
  const [especialidade, setEspecialidade] = useState<string | null>(null);
  const [salvandoLocal, setSalvandoLocal] = useState(false);
  /** Posicao do navegador, usada so enquanto nao ha ponto de referencia fixado. */
  const [posicaoGps, setPosicaoGps] = useState<Ponto | null>(null);

  const medicos = useMedicos(perfilId);
  const consultas = useConsultasFuturas();
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

  // Uma chip por especialidade cadastrada, juntando grafias diferentes.
  const especialidades = useMemo(() => {
    const porChave = new Map<string, string>();
    for (const m of lista) {
      if (m.specialty?.trim()) {
        const chave = chaveDaEspecialidade(m.specialty);
        if (!porChave.has(chave)) porChave.set(chave, m.specialty.trim());
      }
    }
    return [...porChave.entries()]
      .map(([chave, rotulo]) => ({ chave, rotulo }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  }, [lista]);

  const visiveis = useMemo(() => {
    const filtrados = especialidade
      ? lista.filter((m) => m.specialty && chaveDaEspecialidade(m.specialty) === especialidade)
      : lista;
    // Favoritos primeiro; dentro de cada grupo, pela distancia.
    return [...ordenarPorDistancia(filtrados, ponto)].sort(
      (a, b) => Number(Boolean(b.isFavorite)) - Number(Boolean(a.isFavorite)),
    );
  }, [lista, especialidade, ponto]);

  const agora = Date.now();
  const proximaCom = (id: string) =>
    (consultas.data ?? []).find((c) => c.professionalId === id && new Date(c.scheduledAt).getTime() >= agora) ?? null;

  function distanciaAte(m: Professional): number | null {
    if (!ponto || m.latitude == null || m.longitude == null) return null;
    return distanciaKm(ponto.latitude, ponto.longitude, m.latitude, m.longitude);
  }

  /** O coracao: favoritos sobem para o comeco da grade. */
  async function favoritar(m: Professional) {
    try {
      await healthApi.updateProfessional(m.id, { isFavorite: !m.isFavorite });
      await queryClient.invalidateQueries({ queryKey: ['medicos'] });
    } catch (e) {
      void avisar('Não consegui salvar', mensagemDoErro(e));
    }
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

  return (
    <Pagina area="doctors" largura="larga">
      <ScreenHeader
        title="Médicos da família"
        subtitle="Profissionais que acompanham o cuidado da sua família."
        ilustracao={medicaCrianca}
      />

      {/* Chips de especialidade: o ativo muda de fundo, de peso E tem icone. */}
      {especialidades.length > 0 ? (
        <div className={estilos.especialidades} role="group" aria-label="Filtrar por especialidade">
          <button
            type="button"
            className={estilos.especialidade}
            aria-pressed={especialidade === null}
            onClick={() => setEspecialidade(null)}
          >
            <Icone nome="users" size={22} />
            Todos
          </button>
          {especialidades.map((e) => (
            <button
              key={e.chave}
              type="button"
              className={estilos.especialidade}
              aria-pressed={especialidade === e.chave}
              onClick={() => setEspecialidade(e.chave)}
            >
              <Icone nome={iconeDaEspecialidade(e.chave)} size={22} />
              {e.rotulo}
            </button>
          ))}
        </div>
      ) : null}

      {medicos.isPending ? (
        <Carregando />
      ) : medicos.isError && !medicos.data ? (
        <div className={estilos.secao}>
          <Aviso icone="alert-circle" erro acao={{ rotulo: 'Tentar de novo', onClick: () => void medicos.refetch() }}>
            {mensagemDoErro(medicos.error)}
          </Aviso>
        </div>
      ) : (
        <>
          {visiveis.length === 0 && lista.length > 0 ? (
            <div className={estilos.secao}>
              <Aviso icone="user-plus">Nenhum médico nesta especialidade.</Aviso>
            </div>
          ) : null}
          <div className={estilos.grade}>
            {visiveis.map((m) => (
              <DoctorCard
                key={m.id}
                doctor={m}
                distanceKm={distanciaAte(m)}
                proximaConsulta={proximaCom(m.id)}
                favorito={Boolean(m.isFavorite)}
                onFavoritar={() => void favoritar(m)}
              />
            ))}
            <AdicionarMedicoCard />
          </div>
        </>
      )}

      <div className={estilos.acoesDoTopo}>
        <Link to="/consulta/nova" className={`${botoes.contorno} ${estilos.acaoGrande}`}>
          <Icone nome="calendar" size={20} />
          Marcar nova consulta
        </Link>
      </div>

      {/* Onde atendem: o ponto de referencia e o mapa dos consultorios. */}
      <section className={estilos.secao} aria-label="Onde atendem">
        <SectionHeader
          title={ponto ? 'Médicos próximos' : 'Onde atendem'}
          icon="leaf"
          verTodos="/mapa"
          verTodosLabel="Mapa em tela cheia"
        />
        <div className={estilos.blocoPequeno}>
          <LocationBar
            location={referencia}
            onSetAddress={definirEndereco}
            onUseCurrent={usarPosicaoAtual}
            saving={salvandoLocal}
          />
        </div>
        <div className={estilos.mapa}>
          <DoctorsMap
            doctors={visiveis}
            onSelectDoctor={(m) => {
              if (m.latitude != null && m.longitude != null) {
                window.open(urlDaRota(m.latitude, m.longitude), '_blank', 'noopener');
              }
            }}
          />
        </div>
      </section>
    </Pagina>
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
