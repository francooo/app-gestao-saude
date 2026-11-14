import { Icone } from './Icone';
import estilos from './SummaryTile.module.css';

type Props = {
  icone: string;
  corDoLadrilho: string;
  rotulo: string;
  valor: string;
  detalhe: string;
};

/** Cartao de resumo: ladrilho colorido, rotulo, o numero em destaque e um detalhe. */
export function SummaryTile({ icone, corDoLadrilho, rotulo, valor, detalhe }: Props) {
  return (
    <div className={estilos.cartao}>
      <span className={estilos.ladrilho} style={{ background: corDoLadrilho }} aria-hidden="true">
        <Icone nome={icone} size={22} />
      </span>
      <div className={estilos.textos}>
        <p className={estilos.rotulo}>{rotulo}</p>
        <p className={estilos.valor}>{valor}</p>
        <p className={estilos.detalhe}>{detalhe}</p>
      </div>
    </div>
  );
}
