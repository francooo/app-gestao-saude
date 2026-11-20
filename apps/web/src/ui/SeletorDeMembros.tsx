import { useEffect, useRef, useState } from 'react';

import { rotuloCurto, usePessoaAtiva } from '@/lib/pessoaAtiva';

import { Avatar } from './Avatar';
import { Icone } from './Icone';
import estilos from './SeletorDeMembros.module.css';

/** Quantos membros cabem na fileira antes do "+N" (tela larga). */
const NA_FILEIRA = 4;

/**
 * O seletor de membros do cabecalho: "Todos" e cada pessoa da familia com
 * avatar pequeno e primeiro nome. O escolhido contextualiza o site inteiro
 * (lib/pessoaAtiva).
 *
 * - Tela larga: a fileira inteira ate 5 itens; com mais membros, os 4 primeiros
 *   e um "+N" que abre a lista completa.
 * - Tablet: so os avatares (o nome fica no rotulo acessivel e no title).
 * - Celular: uma fileira rolavel com todos, sem "+N".
 *
 * O escolhido muda de fundo, de peso de texto E ganha o aro no avatar: o
 * estado nao depende so da cor.
 */
export function SeletorDeMembros({ formato }: { formato: 'cabecalho' | 'fileira' }) {
  const { membros, pessoaId, setPessoa, carregando } = usePessoaAtiva();
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // Clique fora ou Esc fecha a lista do "+N".
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  if (carregando && membros.length === 0) {
    return <div className={estilos.esqueleto} data-formato={formato} aria-hidden="true" />;
  }
  if (membros.length === 0) return null;

  const fileira = formato === 'fileira';
  // O escolhido nunca some atras do "+N".
  const visiveis = fileira || membros.length <= NA_FILEIRA + 1
    ? membros
    : [
        ...membros.slice(0, NA_FILEIRA),
        ...(membros.findIndex((m) => m.id === pessoaId) >= NA_FILEIRA
          ? membros.filter((m) => m.id === pessoaId)
          : []),
      ];
  const escondidos = membros.filter((m) => !visiveis.includes(m));

  const escolher = (id: string | null) => {
    setPessoa(id);
    setAberto(false);
  };

  return (
    <div ref={caixa} className={estilos.seletor} data-formato={formato} role="group" aria-label="Mostrar dados de">
      <button
        type="button"
        className={estilos.item}
        aria-pressed={pessoaId === null}
        onClick={() => escolher(null)}
        title="Família toda"
      >
        <span className={estilos.todos} aria-hidden="true">
          <Icone nome="users" size={18} />
        </span>
        <span className={estilos.nome}>Todos</span>
      </button>

      {visiveis.map((m) => {
        const nome = rotuloCurto(m.fullName, membros, m.id);
        const ativo = m.id === pessoaId;
        return (
          <button
            key={m.id}
            type="button"
            className={estilos.item}
            aria-pressed={ativo}
            onClick={() => escolher(m.id)}
            title={m.fullName}
            aria-label={m.fullName}
          >
            <Avatar nome={m.fullName} color={m.avatarColor ?? undefined} photo={m.photo ?? undefined} size={30} selected={ativo} />
            <span className={estilos.nome}>{nome}</span>
          </button>
        );
      })}

      {escondidos.length > 0 ? (
        <div className={estilos.mais}>
          <button
            type="button"
            className={estilos.item}
            aria-expanded={aberto}
            aria-haspopup="true"
            onClick={() => setAberto((a) => !a)}
            aria-label={`Mais ${escondidos.length} ${escondidos.length === 1 ? 'pessoa' : 'pessoas'}`}
          >
            <span className={estilos.todos} aria-hidden="true">
              +{escondidos.length}
            </span>
          </button>
          {aberto ? (
            <ul className={estilos.lista}>
              {escondidos.map((m) => (
                <li key={m.id}>
                  <button type="button" className={estilos.opcao} onClick={() => escolher(m.id)}>
                    <Avatar nome={m.fullName} color={m.avatarColor ?? undefined} photo={m.photo ?? undefined} size={30} />
                    {m.fullName}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
