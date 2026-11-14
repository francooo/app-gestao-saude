import estilos from './BlocoDeAviso.module.css';
import botoes from './botoes.module.css';
import { Icone } from './Icone';
import { IconTile, LADRILHO_ATENCAO, LADRILHO_NEUTRO } from './IconTile';

type Acao = { rotulo: string; onClick: () => void };

type Props = {
  /** 'atencao' (ambar) pede uma acao da pessoa; 'neutro' so informa. */
  tom: 'atencao' | 'neutro';
  icone: string;
  titulo: string;
  texto: string;
  dicas?: string[];
  acaoPrincipal?: Acao & { estilo: 'preenchido' | 'contorno' };
  acaoSecundaria?: Acao;
};

/** Cartao de aviso com titulo, explicacao, dicas e ate duas acoes. */
export function BlocoDeAviso({
  tom,
  icone,
  titulo,
  texto,
  dicas,
  acaoPrincipal,
  acaoSecundaria,
}: Props) {
  return (
    <div className={estilos.cartao}>
      {/* role=status: quem usa leitor de tela fica sabendo que a leitura
          terminou e por que falhou. */}
      <div className={estilos.cabecalho} role="status">
        <IconTile
          size={44}
          icone={icone}
          {...(tom === 'atencao' ? LADRILHO_ATENCAO : LADRILHO_NEUTRO)}
        />
        <div className={estilos.textos}>
          <p className={estilos.titulo}>{titulo}</p>
          <p className={estilos.texto}>{texto}</p>
        </div>
      </div>

      {dicas?.length ? (
        <ul className={estilos.dicas}>
          {dicas.map((d) => (
            <li key={d}>
              <Icone nome="check" size={16} color="var(--cor-accent-green)" />
              {d}
            </li>
          ))}
        </ul>
      ) : null}

      {acaoPrincipal ? (
        <button
          type="button"
          className={`${acaoPrincipal.estilo === 'preenchido' ? botoes.verde : botoes.contorno} ${botoes.largo} ${estilos.acao}`}
          onClick={acaoPrincipal.onClick}
        >
          {acaoPrincipal.rotulo}
        </button>
      ) : null}

      {acaoSecundaria ? (
        <button
          type="button"
          className={`${botoes.texto} ${botoes.largo} ${estilos.secundaria}`}
          onClick={acaoSecundaria.onClick}
        >
          {acaoSecundaria.rotulo}
        </button>
      ) : null}
    </div>
  );
}
