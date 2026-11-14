import estilos from './FilterChips.module.css';

export type Chip = {
  /** null e o chip "todos". */
  value: string | null;
  label: string;
};

type Props = {
  chips: Chip[];
  selected: string | null;
  onSelect: (value: string | null) => void;
  /** Nome do grupo para o leitor de tela ("Período", "Especialidade"). */
  rotulo: string;
};

/**
 * Fileira de chips de filtro, com um selecionado.
 *
 * No aplicativo a fileira rola de lado e esconde os chips alem do quarto atras
 * de "Ver mais". Aqui ela quebra linha: em tela larga cabem todos.
 */
export function FilterChips({ chips, selected, onSelect, rotulo }: Props) {
  if (chips.length <= 1) return null;

  return (
    <div className={estilos.lista} role="group" aria-label={rotulo}>
      {chips.map((chip) => (
        <button
          key={chip.value ?? '__todos__'}
          type="button"
          className={estilos.chip}
          aria-pressed={chip.value === selected}
          onClick={() => onSelect(chip.value)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
