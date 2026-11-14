import estilos from './DoseButton.module.css';
import { Icone } from './Icone';

type Props = {
  /** A dose do horario ja foi registrada. */
  checked: boolean;
  /** Remedio "se necessario": cada clique registra mais uma dose, sem desfazer. */
  repetivel?: boolean;
  disabled?: boolean;
  enviando?: boolean;
  label: string;
  onClick: () => void;
  size?: number;
  className?: string;
};

/**
 * O circulo de marcar a dose: anel verde quando pendente, cheio com check
 * quando tomada, "+" nos remedios de uso se necessario.
 */
export function DoseButton({
  checked,
  repetivel = false,
  disabled = false,
  enviando = false,
  label,
  onClick,
  size = 34,
  className,
}: Props) {
  return (
    <button
      type="button"
      className={[estilos.botao, className].filter(Boolean).join(' ')}
      role={repetivel ? undefined : 'checkbox'}
      aria-checked={repetivel ? undefined : checked}
      aria-label={label}
      aria-busy={enviando || undefined}
      disabled={disabled || enviando}
      onClick={onClick}
      title={repetivel ? 'Registrar uma dose agora' : checked ? 'Desfazer' : 'Marcar como tomada'}
    >
      <span
        className={estilos.circulo}
        data-cheio={checked ? '' : undefined}
        data-apagado={disabled ? '' : undefined}
        style={{ width: size, height: size }}
      >
        {enviando ? (
          <span className={estilos.girando} />
        ) : checked ? (
          <Icone nome="check" size={size * 0.55} />
        ) : repetivel ? (
          <Icone nome="plus" size={size * 0.55} />
        ) : null}
      </span>
    </button>
  );
}
