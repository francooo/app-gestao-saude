import type { SerieDoGrafico } from '@gestao/shared/lib/medicoes';
import { useEffect, useRef, useState } from 'react';

import estilos from './GraficoDeMedicoes.module.css';

const ALTURA = 200;
const MARGEM = { topo: 10, direita: 14, base: 26, esquerda: 38 };
/** Uma cor por serie: sistolica e diastolica na pressao, uma so nos outros. */
const CORES = ['var(--cor-accent-green)', 'var(--cor-terracotta)'];

/**
 * O grafico de uma medicao ao longo do periodo, em SVG.
 *
 * Desenhado na largura REAL do contêiner (ResizeObserver), e nao num viewBox
 * esticado: num celular estreito o texto dos eixos ficaria minusculo.
 *
 * REFERENCIA SEM VEREDITO: a faixa usual aparece como um fundo claro e as
 * linhas de referencia tracejadas, com a fonte embaixo. Nenhum ponto muda de
 * cor por estar fora da faixa — quem interpreta e o medico.
 *
 * Para o leitor de tela, o grafico e UMA imagem com a serie descrita em
 * palavras (descricaoDaSerie).
 */
export function GraficoDeMedicoes({ serie, descricao }: { serie: SerieDoGrafico; descricao: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setLargura(Math.floor(el.getBoundingClientRect().width));
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const { tipo, pontos } = serie;
  const area = {
    x: MARGEM.esquerda,
    y: MARGEM.topo,
    w: Math.max(0, largura - MARGEM.esquerda - MARGEM.direita),
    h: ALTURA - MARGEM.topo - MARGEM.base,
  };
  const px = (x: number) => area.x + x * area.w;
  const py = (v: number) => area.y + (1 - serie.y(v)) * area.h;

  // Rotulos do eixo Y: os limites e as referencias, sem repetir valor.
  const marcasY = Array.from(
    new Set([serie.min, serie.max, ...tipo.linhas.map((l) => l.valor), ...tipo.faixas.flatMap((f) => [f.de, f.ate])]),
  ).filter((v) => v >= serie.min && v <= serie.max);

  return (
    <figure className={estilos.figura}>
      <div ref={caixa} className={estilos.caixa}>
        {largura > 0 ? (
          <svg width={largura} height={ALTURA} role="img" aria-label={descricao} className={estilos.svg}>
            {/* Faixa usual: fundo claro, sem rotulo de bom ou ruim. */}
            {tipo.faixas.map((f) => (
              <rect
                key={f.rotulo}
                x={area.x}
                width={area.w}
                y={py(Math.min(f.ate, serie.max))}
                height={Math.max(0, py(Math.max(f.de, serie.min)) - py(Math.min(f.ate, serie.max)))}
                className={estilos.faixa}
              />
            ))}

            {/* Grade leve nos rotulos do eixo Y. */}
            {marcasY.map((v) => (
              <g key={v}>
                <line x1={area.x} x2={area.x + area.w} y1={py(v)} y2={py(v)} className={estilos.grade} />
                <text x={area.x - 6} y={py(v)} className={estilos.rotuloY}>
                  {String(v).replace('.', ',')}
                </text>
              </g>
            ))}

            {tipo.linhas.map((l) =>
              l.valor >= serie.min && l.valor <= serie.max ? (
                <line
                  key={l.rotulo}
                  x1={area.x}
                  x2={area.x + area.w}
                  y1={py(l.valor)}
                  y2={py(l.valor)}
                  className={estilos.referencia}
                />
              ) : null,
            )}

            {serie.marcas.map((m, i) => (
              <text
                key={m.x}
                x={px(m.x)}
                y={ALTURA - 6}
                className={estilos.rotuloX}
                textAnchor={i === 0 ? 'start' : i === serie.marcas.length - 1 ? 'end' : 'middle'}
              >
                {m.rotulo}
              </text>
            ))}

            {serie.series.map((nome, s) => {
              const cor = CORES[s] ?? CORES[0];
              const caminho = pontos.map((p) => `${px(p.x).toFixed(1)},${py(p.valores[s]!).toFixed(1)}`).join(' ');
              return (
                <g key={nome}>
                  {pontos.length > 1 ? (
                    <polyline points={caminho} fill="none" stroke={cor} className={estilos.linha} />
                  ) : null}
                  {pontos.map((p) => (
                    <circle key={p.id} cx={px(p.x)} cy={py(p.valores[s]!)} r={4.5} fill={cor} className={estilos.ponto}>
                      {/* Passar o mouse mostra a medicao inteira. */}
                      <title>{p.texto}</title>
                    </circle>
                  ))}
                </g>
              );
            })}
          </svg>
        ) : (
          <div style={{ height: ALTURA }} />
        )}
      </div>

      <figcaption className={estilos.legenda}>
        {serie.series.length > 1 ? (
          <span className={estilos.series}>
            {serie.series.map((nome, s) => (
              <span key={nome} className={estilos.serie}>
                <span className={estilos.amostra} style={{ background: CORES[s] }} aria-hidden="true" />
                {nome}
              </span>
            ))}
          </span>
        ) : null}
        {tipo.faixas.length ? (
          <span className={estilos.serie}>
            <span className={`${estilos.amostra} ${estilos.amostraFaixa}`} aria-hidden="true" />
            Faixa usual: {tipo.faixas.map((f) => f.rotulo).join('; ')}
          </span>
        ) : null}
        {tipo.linhas.length ? (
          <span className={estilos.serie}>
            <span className={`${estilos.amostra} ${estilos.amostraLinha}`} aria-hidden="true" />
            Linha de referência: {tipo.linhas.map((l) => l.rotulo).join(' e ')}
          </span>
        ) : null}
        {tipo.fonte ? <span className={estilos.fonte}>{tipo.fonte}</span> : null}
      </figcaption>
    </figure>
  );
}
