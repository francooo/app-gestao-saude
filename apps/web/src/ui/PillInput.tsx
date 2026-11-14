import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react';

import { Icone } from './Icone';
import estilos from './PillInput.module.css';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'type'> & {
  label: string;
  icon: string;
  type?: 'text' | 'email' | 'tel';
  /** Exibe o olho de mostrar/ocultar e comeca com o texto escondido. */
  secure?: boolean;
  /** Mensagem de validacao exibida abaixo do campo. */
  error?: string;
  className?: string;
};

/**
 * Campo em formato de pilula com icone a esquerda — o das telas de entrada.
 * Mesmo desenho de apps/mobile/src/components/PillInput.tsx.
 */
export const PillInput = forwardRef<HTMLInputElement, Props>(function PillInput(
  { label, icon, type = 'text', secure = false, error, className, id, ...inputProps },
  ref,
) {
  const gerado = useId();
  const campoId = id ?? gerado;
  const erroId = `${campoId}-erro`;
  const [oculto, setOculto] = useState(secure);

  return (
    <div className={[estilos.grupo, className].filter(Boolean).join(' ')}>
      <label className={estilos.rotulo} htmlFor={campoId}>
        {label}
      </label>

      <div className={estilos.campo} data-erro={error ? '' : undefined}>
        <Icone nome={icon} size={20} className={estilos.icone} />

        <input
          ref={ref}
          id={campoId}
          className={estilos.entrada}
          type={secure ? (oculto ? 'password' : 'text') : type}
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? erroId : undefined}
          {...inputProps}
        />

        {secure ? (
          <button
            type="button"
            className={estilos.olho}
            onClick={() => setOculto((v) => !v)}
            aria-label={oculto ? 'Mostrar senha' : 'Ocultar senha'}
            aria-pressed={!oculto}
          >
            <Icone nome={oculto ? 'eye' : 'eye-off'} size={18} />
          </button>
        ) : null}
      </div>

      {error ? (
        <p id={erroId} className={estilos.erro} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
});
