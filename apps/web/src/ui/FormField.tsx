import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';

import botoes from './botoes.module.css';
import estilos from './FormField.module.css';
import { Icone } from './Icone';

type Comum = {
  label: string;
  value: string;
  /** Recebe o texto, como o onChangeText do aplicativo. */
  onChangeText: (texto: string) => void;
  error?: string;
  /** Ajuda neutra abaixo do campo. Some quando ha erro ou aviso. */
  hint?: string;
  /** Selo ao lado do rotulo (ex.: "Lido pela IA"). */
  selo?: ReactNode;
  /** Atencao que nao impede salvar (ex.: "confira este campo"). */
  aviso?: string;
  /** Rodinha dentro do campo (ex.: buscando o CEP). */
  loading?: boolean;
  className?: string;
};

type DeLinha = Comum &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'className' | 'type'> & {
    multiline?: false;
    type?: 'text' | 'email' | 'tel' | 'date' | 'time';
    /** Campo de senha, com o olho de mostrar/ocultar. */
    secure?: boolean;
  };

type DeTexto = Comum &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'className'> & {
    multiline: true;
  };

/**
 * Campo de formulario da area logada: rotulo em cima, caixa creme arredondada,
 * e uma linha de erro, aviso ou ajuda embaixo. O irmao do PillInput, que e o
 * das telas de entrada.
 */
export function FormField(props: DeLinha | DeTexto) {
  const { label, value, onChangeText, error, hint, selo, aviso, loading, className, id } = props;
  const gerado = useId();
  const campoId = id ?? gerado;
  const apoioId = `${campoId}-apoio`;
  const [oculto, setOculto] = useState(true);

  const apoio = error ?? aviso ?? hint;
  const aria = {
    id: campoId,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': apoio ? apoioId : undefined,
  } as const;

  let campo: ReactNode;
  if (props.multiline) {
    const { label: _l, onChangeText: _o, error: _e, hint: _h, selo: _s, aviso: _a, loading: _lo,
      className: _c, multiline: _m, ...resto } = props;
    campo = (
      <textarea
        {...resto}
        {...aria}
        className={estilos.entrada}
        value={value}
        onChange={(e) => onChangeText(e.target.value)}
      />
    );
  } else {
    const { label: _l, onChangeText: _o, error: _e, hint: _h, selo: _s, aviso: _a, loading: _lo,
      className: _c, multiline: _m, secure, type = 'text', ...resto } = props;
    campo = (
      <>
        <input
          {...resto}
          {...aria}
          className={estilos.entrada}
          type={secure ? (oculto ? 'password' : 'text') : type}
          value={value}
          onChange={(e) => onChangeText(e.target.value)}
        />
        {secure ? (
          <button
            type="button"
            className={estilos.olho}
            onClick={() => setOculto((v) => !v)}
            aria-label={oculto ? 'Mostrar senha' : 'Ocultar senha'}
            aria-pressed={!oculto}
          >
            <Icone nome={oculto ? 'eye' : 'eye-off'} size={20} />
          </button>
        ) : null}
      </>
    );
  }

  return (
    <div className={[estilos.grupo, className].filter(Boolean).join(' ')}>
      <div className={estilos.linhaDoRotulo}>
        <label className={estilos.rotulo} htmlFor={campoId}>
          {label}
        </label>
        {selo}
      </div>

      <div
        className={estilos.campo}
        data-erro={error ? '' : undefined}
        data-multilinha={props.multiline ? '' : undefined}
      >
        {campo}
        {loading ? <span className={`${botoes.girando} ${estilos.girando}`} /> : null}
      </div>

      {error ? (
        <p id={apoioId} className={estilos.erro} role="alert">
          {error}
        </p>
      ) : aviso ? (
        <p id={apoioId} className={estilos.aviso}>
          <Icone nome="alert-circle" size={14} />
          {aviso}
        </p>
      ) : hint ? (
        <p id={apoioId} className={estilos.ajuda}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export type Opcao = { valor: string; rotulo: string };

type PropsDoSelect = {
  label: string;
  value: string | null;
  options: Opcao[];
  onChange: (valor: string) => void;
  /** Texto enquanto nada foi escolhido. */
  placeholder?: string;
  error?: string;
  hint?: string;
  selo?: ReactNode;
  disabled?: boolean;
  className?: string;
};

/**
 * Campo de escolha. No aplicativo abre um painel proprio; no navegador o
 * <select> nativo ja faz isso melhor — com teclado, busca por letra e a lista
 * do proprio sistema no celular.
 */
export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = 'Escolha',
  error,
  hint,
  selo,
  disabled,
  className,
}: PropsDoSelect) {
  const id = useId();
  const apoioId = `${id}-apoio`;
  const apoio = error ?? hint;

  return (
    <div className={[estilos.grupo, className].filter(Boolean).join(' ')}>
      <div className={estilos.linhaDoRotulo}>
        <label className={estilos.rotulo} htmlFor={id}>
          {label}
        </label>
        {selo}
      </div>

      <div className={estilos.campo} data-erro={error ? '' : undefined}>
        <select
          id={id}
          className={`${estilos.entrada} ${estilos.select}`}
          data-vazio={value ? undefined : ''}
          value={value ?? ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={apoio ? apoioId : undefined}
        >
          {value ? null : (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
        <Icone nome="chevron-down" size={20} className={estilos.seta} />
      </div>

      {error ? (
        <p id={apoioId} className={estilos.erro} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={apoioId} className={estilos.ajuda}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
