import type { Professional } from '@gestao/shared/api/health';
import type { Map as MapaGL } from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Avatar } from './Avatar';
import botoes from './botoes.module.css';
import estilos from './DoctorsMap.module.css';
import { Icone } from './Icone';

/**
 * Chave PUBLICA do MapTiler, so para desenhar o mapa. Vai embutida no pacote:
 * a protecao e restringi-la ao dominio do site no painel do MapTiler. A chave
 * de geocodificacao e outra e vive so na API.
 */
const CHAVE = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
/** O mesmo estilo do aplicativo. */
const ESTILO = `https://api.maptiler.com/maps/pastel/style.json?key=${CHAVE}`;

/** O primeiro da lista (o mais proximo) ganha o alfinete verde e maior. */
const COR_DESTAQUE = 'var(--cor-accent-green)';
const CORES_DEMAIS = ['var(--cor-accent)', 'var(--cor-tile-clock)', 'var(--cor-tile-sun)'];

type ComCoordenada = Professional & { latitude: number; longitude: number };

/** Endereco do Google Maps com a rota ate o ponto. Abre em qualquer aparelho. */
export function urlDaRota(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}

function alfinete(size: number, cor: string): string {
  // O pino cheio do aplicativo (mci:map-marker), com o miolo creme.
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="${cor}" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7z"/>
    <circle cx="12" cy="9" r="3" fill="var(--cor-surface)"/>
  </svg>`;
}

type Props = {
  doctors: Professional[];
  /** Clique num alfinete. Sem isto, o mapa mostra o proprio cartao do medico. */
  onSelectDoctor?: (doctor: Professional) => void;
  /** Ocupa toda a altura do lugar onde esta, em vez da faixa baixa da lista. */
  cheio?: boolean;
};

/**
 * Mapa dos consultorios. Cada medico com endereco reconhecido e um alfinete.
 *
 * A biblioteca do mapa so e baixada quando o mapa aparece: quem abre o site
 * para conferir um remedio nao paga por ela.
 */
export function DoctorsMap({ doctors, onSelectDoctor, cheio = false }: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const aoSelecionar = useRef(onSelectDoctor);
  aoSelecionar.current = onSelectDoctor;

  const [selecionado, setSelecionado] = useState<Professional | null>(null);
  const [falhou, setFalhou] = useState(false);

  const comCoordenada = useMemo(
    () => doctors.filter((d): d is ComCoordenada => d.latitude != null && d.longitude != null),
    [doctors],
  );
  // O mapa so e refeito quando os PONTOS mudam, e nao a cada busca da lista.
  const assinatura = comCoordenada.map((d) => `${d.id}:${d.latitude},${d.longitude}`).join('|');

  useEffect(() => {
    if (!CHAVE || comCoordenada.length === 0 || !caixa.current) return;
    let cancelado = false;
    let mapa: MapaGL | null = null;

    (async () => {
      try {
        const [maplibre, worker] = await Promise.all([
          import('maplibre-gl'),
          // A biblioteca desenha num worker a parte. Sem dizer onde ele esta, ela
          // o procura ao lado do proprio arquivo — que o empacotador mudou de lugar.
          import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
          import('maplibre-gl/dist/maplibre-gl.css'),
        ]);
        if (cancelado || !caixa.current) return;
        maplibre.setWorkerUrl(worker.default);

        const primeiro = comCoordenada[0]!;
        const m = new maplibre.Map({
          container: caixa.current,
          style: ESTILO,
          center: [primeiro.longitude, primeiro.latitude],
          zoom: 14,
          attributionControl: { compact: true },
        });
        mapa = m;
        m.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
        m.on('error', (e) => {
          // Chave recusada ou estilo indisponivel: mostra o aviso em vez de um quadro cinza.
          if (!m.isStyleLoaded()) {
            console.warn('[mapa]', e.error?.message);
            setFalhou(true);
          }
        });

        const limites = new maplibre.LngLatBounds();
        comCoordenada.forEach((d, i) => {
          const el = document.createElement('button');
          el.type = 'button';
          el.className = estilos.alfinete!;
          el.setAttribute('aria-label', `${d.name}${d.specialty ? `, ${d.specialty}` : ''}`);
          el.innerHTML = alfinete(
            i === 0 ? 44 : 32,
            i === 0 ? COR_DESTAQUE : CORES_DEMAIS[(i - 1) % CORES_DEMAIS.length]!,
          );
          el.addEventListener('click', () => {
            if (aoSelecionar.current) aoSelecionar.current(d);
            else setSelecionado(d);
          });
          new maplibre.Marker({ element: el, anchor: 'bottom' })
            .setLngLat([d.longitude, d.latitude])
            .addTo(m);
          limites.extend([d.longitude, d.latitude]);
        });
        if (comCoordenada.length > 1) {
          m.fitBounds(limites, { padding: 64, maxZoom: 14, animate: false });
        }
      } catch {
        if (!cancelado) setFalhou(true);
      }
    })();

    return () => {
      cancelado = true;
      mapa?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura]);

  const molde = `${estilos.mapa} ${cheio ? estilos.cheio : ''}`;

  if (!CHAVE || falhou) {
    return <Aviso molde={molde} texto="Mapa indisponível no momento." />;
  }
  if (comCoordenada.length === 0) {
    return (
      <Aviso
        molde={molde}
        texto="Nenhum endereço reconhecido ainda. Adicione o endereço do consultório para vê-lo no mapa."
      />
    );
  }

  return (
    <div className={molde}>
      <div ref={caixa} className={estilos.tela} role="region" aria-label="Mapa dos consultórios" />

      {selecionado ? (
        <div className={estilos.cartao}>
          <div className={estilos.cartaoLinha}>
            <Avatar nome={selecionado.name} photo={selecionado.photo} size={48} />
            <div className={estilos.cartaoTextos}>
              <p className={estilos.cartaoNome}>{selecionado.name}</p>
              {selecionado.specialty ? (
                <p className={estilos.cartaoEsp}>{selecionado.specialty}</p>
              ) : null}
              {selecionado.address ? (
                <p className={estilos.cartaoEndereco}>{selecionado.address}</p>
              ) : null}
            </div>
            <button
              type="button"
              className={estilos.fechar}
              onClick={() => setSelecionado(null)}
              aria-label="Fechar"
            >
              <Icone nome="x" size={20} />
            </button>
          </div>
          <a
            href={urlDaRota(selecionado.latitude!, selecionado.longitude!)}
            target="_blank"
            rel="noopener noreferrer"
            className={`${botoes.verde} ${botoes.largo} ${estilos.rota}`}
          >
            <Icone nome="navigation" size={17} />
            Como chegar
          </a>
        </div>
      ) : null}
    </div>
  );
}

function Aviso({ molde, texto }: { molde: string; texto: string }) {
  return (
    <div className={`${molde} ${estilos.aviso}`}>
      <Icone nome="map" size={26} />
      <p>{texto}</p>
    </div>
  );
}
