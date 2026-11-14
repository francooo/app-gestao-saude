import estilos from './cartoesDeLista.module.css';
import { Icone } from './Icone';

type Props = {
  /** A nota privada da pessoa, de 1 a 5, ou null sem nota. */
  value: number | null;
  /** Com isto, cada estrela vira um botao de dar nota. */
  onChange?: (value: number) => void;
  size?: number;
  /** Texto exibido quando nao ha nota. */
  label?: string;
};

const ESTRELAS = [1, 2, 3, 4, 5];

/** As cinco estrelas da nota privada: so leitura nos cartoes, clicaveis no formulario. */
export function StarRating({ value, onChange, size = 18, label = 'Sem nota' }: Props) {
  const cor = (n: number) =>
    value !== null && n <= value ? 'var(--cor-star)' : 'var(--cor-star-empty)';
  const texto = (
    <span className={estilos.notaTexto} aria-hidden="true">
      {value === null ? label : `${value},0`}
    </span>
  );

  if (!onChange) {
    return (
      <p className={estilos.estrelas} aria-label={value === null ? label : `Sua nota: ${value} de 5`}>
        {ESTRELAS.map((n) => (
          <Icone key={n} nome="star" size={size} color={cor(n)} />
        ))}
        {texto}
      </p>
    );
  }

  return (
    <div className={estilos.estrelas} role="group" aria-label="Sua nota">
      {ESTRELAS.map((n) => (
        <button
          key={n}
          type="button"
          className={estilos.estrelaBotao}
          onClick={() => onChange(n)}
          aria-label={`Dar nota ${n} de 5`}
          aria-pressed={value === n}
        >
          <Icone nome="star" size={size} color={cor(n)} />
        </button>
      ))}
      {texto}
    </div>
  );
}
