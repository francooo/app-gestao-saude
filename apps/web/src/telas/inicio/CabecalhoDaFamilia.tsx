import { Link } from 'react-router';

import ilustracao from '@/imagens/header-mother-baby.png';
import { Avatar } from '@/ui/Avatar';
import { Icone } from '@/ui/Icone';
import { SurfaceCard } from '@/ui/SurfaceCard';

import estilos from './CabecalhoDaFamilia.module.css';

export type Membro = {
  id: string;
  nome: string;
  cor?: string | null;
  foto?: string | null;
};

type Props = {
  membros: Membro[];
  /** Quem a tela esta mostrando. null = a familia inteira. */
  selecionadoId: string | null;
  onSelecionar: (id: string) => void;
  /** Primeira carga: desenha o esqueleto em vez de uma familia vazia. */
  carregando: boolean;
  /** A busca falhou e nao ha lista anterior para mostrar. */
  erro: boolean;
};

/**
 * Primeiro nome, com a inicial do sobrenome quando dois membros dividem o
 * primeiro nome ("Ana S." e "Ana P.").
 */
function rotuloCurto(membro: Membro, todos: Membro[]): string {
  const partes = membro.nome.trim().split(/\s+/);
  const primeiro = partes[0] ?? membro.nome;
  const repete = todos.some(
    (o) => o.id !== membro.id && (o.nome.trim().split(/\s+/)[0] ?? '') === primeiro,
  );
  if (!repete) return primeiro;
  const inicial = partes[1]?.charAt(0);
  return inicial ? `${primeiro} ${inicial}.` : primeiro;
}

/**
 * Cabecalho do Inicio: as boas-vindas ilustradas e a faixa da familia, num
 * cartao so, como no aplicativo.
 *
 * Clicar num membro filtra a tela por ele; clicar de novo volta para a familia
 * inteira. No aplicativo, editar e segurar o dedo no avatar — gesto que nao
 * existe com mouse. Aqui o membro selecionado ganha um link "Editar" visivel.
 */
export function CabecalhoDaFamilia({
  membros,
  selecionadoId,
  onSelecionar,
  carregando,
  erro,
}: Props) {
  const selecionado = membros.find((m) => m.id === selecionadoId) ?? null;

  return (
    <SurfaceCard flush>
      <div className={estilos.boasVindas}>
        <div className={estilos.ilustracao} aria-hidden="true">
          <img src={ilustracao} alt="" />
        </div>
        <div className={estilos.texto}>
          <h1 className={estilos.titulo}>Bem-vinda de volta</h1>
          <p className={estilos.subtitulo}>Cuidando de quem você ama</p>
        </div>
      </div>

      {erro && membros.length === 0 ? (
        <p className={estilos.erro} role="alert">
          Não consegui carregar sua família. Recarregue a página ou tente de novo em instantes.
        </p>
      ) : (
        <div className={estilos.familia}>
          <div className={estilos.familiaTopo}>
            <h2 className={estilos.familiaTitulo}>Membros da família</h2>
            {selecionado ? (
              <Link to={`/membro/${selecionado.id}`} className={estilos.editar}>
                <Icone nome="edit-2" size={14} />
                Editar {rotuloCurto(selecionado, membros)}
              </Link>
            ) : null}
          </div>

          <ul className={estilos.lista}>
            {carregando
              ? // Esqueleto. Nunca "familia vazia": uma conta sempre tem o titular.
                [0, 1, 2].map((i) => (
                  <li key={i} className={estilos.item} aria-hidden="true">
                    <span className={estilos.esqueleto} />
                  </li>
                ))
              : membros.map((membro) => {
                  const ativo = membro.id === selecionadoId;
                  return (
                    <li key={membro.id}>
                      <button
                        type="button"
                        className={estilos.item}
                        onClick={() => onSelecionar(membro.id)}
                        aria-pressed={ativo}
                        aria-label={`Mostrar só os dados de ${membro.nome}`}
                      >
                        <Avatar
                          nome={membro.nome}
                          color={membro.cor ?? undefined}
                          photo={membro.foto}
                          size={52}
                          selected={ativo}
                        />
                        <span className={estilos.nome} data-ativo={ativo ? '' : undefined}>
                          {rotuloCurto(membro, membros)}
                        </span>
                      </button>
                    </li>
                  );
                })}

            <li>
              <Link
                to="/membro/novo"
                className={estilos.item}
                aria-label="Adicionar membro da família"
              >
                <span className={estilos.adicionar}>
                  <Icone nome="plus" size={26} />
                </span>
                <span className={estilos.nome}>Adicionar</span>
              </Link>
            </li>
          </ul>
        </div>
      )}
    </SurfaceCard>
  );
}
