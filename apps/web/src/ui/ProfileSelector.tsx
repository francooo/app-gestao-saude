import { useRef } from 'react';

import { Avatar } from './Avatar';
import { Icone } from './Icone';
import estilos from './ProfileSelector.module.css';

export type SelectableProfile = {
  id: string;
  fullName: string;
  avatarColor?: string | null;
  relationship?: string | null;
};

type Props = {
  profiles: SelectableProfile[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  tituloDoPainel: string;
  /** Oferece "Todos da familia". Desligue onde uma pessoa e obrigatoria. */
  permitirTodos?: boolean;
};

const TODOS = 'Todos da família';
const ESCOLHER = 'Escolha a pessoa';

/**
 * Barra que mostra de quem sao os dados e abre a lista para trocar.
 *
 * Nome completo, e nao so o primeiro: o prenome sozinho confundia irmaos.
 */
export function ProfileSelector({
  profiles,
  selectedId,
  onSelect,
  tituloDoPainel,
  permitirTodos = true,
}: Props) {
  const painel = useRef<HTMLDialogElement>(null);
  const selecionado = profiles.find((p) => p.id === selectedId) ?? null;
  const rotulo = selecionado?.fullName ?? (permitirTodos ? TODOS : ESCOLHER);

  function escolher(id: string | null) {
    onSelect(id);
    painel.current?.close();
  }

  return (
    <>
      <button
        type="button"
        className={estilos.barra}
        onClick={() => painel.current?.showModal()}
        aria-haspopup="dialog"
        aria-label={`Filtrar por pessoa. Atual: ${rotulo}`}
      >
        {selecionado ? (
          <Avatar
            nome={selecionado.fullName}
            color={selecionado.avatarColor ?? undefined}
            size={40}
            selected
            className={estilos.avatarDaBarra}
          />
        ) : (
          <span className={estilos.todosIcone}>
            <Icone nome="users" size={20} />
          </span>
        )}
        <span className={estilos.nome}>{rotulo}</span>
        <Icone nome="chevron-down" size={22} />
      </button>

      <dialog
        ref={painel}
        className={estilos.painel}
        aria-label={tituloDoPainel}
        onClick={(e) => {
          if (e.target === painel.current) painel.current?.close();
        }}
      >
        <div className={estilos.caixa}>
          <p className={estilos.painelTitulo}>{tituloDoPainel}</p>
          <ul className={estilos.opcoes}>
            {permitirTodos ? (
              <Opcao rotulo={TODOS} ativo={selectedId === null} onClick={() => escolher(null)} />
            ) : null}
            {profiles.map((p) => (
              <Opcao
                key={p.id}
                rotulo={p.fullName}
                detalhe={p.relationship ?? undefined}
                cor={p.avatarColor ?? undefined}
                pessoa
                ativo={p.id === selectedId}
                onClick={() => escolher(p.id)}
              />
            ))}
          </ul>
        </div>
      </dialog>
    </>
  );
}

function Opcao({
  rotulo,
  detalhe,
  cor,
  pessoa = false,
  ativo,
  onClick,
}: {
  rotulo: string;
  detalhe?: string;
  cor?: string;
  pessoa?: boolean;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={estilos.opcao}
        aria-pressed={ativo}
        onClick={onClick}
        autoFocus={ativo}
      >
        {pessoa ? (
          <Avatar nome={rotulo} color={cor} size={40} />
        ) : (
          <span className={estilos.todosIcone} style={{ width: 40, height: 40 }}>
            <Icone nome="users" size={18} />
          </span>
        )}
        <span className={estilos.opcaoTextos}>
          <span className={estilos.opcaoNome}>{rotulo}</span>
          {detalhe ? <span className={estilos.opcaoDetalhe}>{detalhe}</span> : null}
        </span>
        {ativo ? <Icone nome="check" size={20} color="var(--cor-accent-green)" /> : null}
      </button>
    </li>
  );
}
