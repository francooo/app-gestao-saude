import { useId, type ReactNode } from 'react';

import estilos from './ConsentCheckbox.module.css';
import { Icone } from './Icone';

type Props = {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: ReactNode;
  error?: string;
  disabled?: boolean;
};

/**
 * Aceite do consentimento LGPD.
 *
 * Nasce SEMPRE desmarcado, e o clique na linha inteira alterna o estado — a
 * lei pede manifestacao ativa, entao nao existe versao pre-marcada disto.
 */
export function ConsentCheckbox({ checked, onChange, children, error, disabled }: Props) {
  const id = useId();
  const erroId = `${id}-erro`;

  return (
    <div>
      <label className={estilos.linha} htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          className={estilos.nativo}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? erroId : undefined}
        />
        <span className={estilos.caixa} data-erro={error ? '' : undefined} aria-hidden="true">
          {checked ? <Icone nome="check" size={15} /> : null}
        </span>
        <span className={estilos.texto}>{children}</span>
      </label>

      {error ? (
        <p id={erroId} className={estilos.erro} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
