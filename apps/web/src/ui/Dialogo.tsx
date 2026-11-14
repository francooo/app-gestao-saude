import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import estilos from './Dialogo.module.css';

/**
 * As caixas de dialogo da versao web: o lugar do `Alert.alert` do aplicativo.
 *
 * `confirmar` pergunta e devolve true ou false; `avisar` so informa. As duas
 * sao promessas, para caber no fluxo com await — a mesma assinatura que
 * `alternarDose` (em @gestao/shared) pede de quem chama.
 *
 * Usa o <dialog> nativo com showModal(): o navegador prende o foco dentro,
 * fecha com Esc e devolve o foco a quem abriu.
 */
type Pedido = {
  titulo: string;
  mensagem: string;
  /** Rotulo do botao de acao. Ausente = so um "Entendi" (aviso). */
  rotulo?: string;
  /** A acao apaga ou desfaz algo: o botao fica terracota. */
  destrutiva?: boolean;
  resolver: (confirmou: boolean) => void;
};

type Dialogos = {
  confirmar: (
    titulo: string,
    mensagem: string,
    rotulo: string,
    opcoes?: { destrutiva?: boolean },
  ) => Promise<boolean>;
  avisar: (titulo: string, mensagem: string) => Promise<void>;
};

const Contexto = createContext<Dialogos | null>(null);

export function DialogoProvider({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (pedido && el && !el.open) el.showModal();
  }, [pedido]);

  const responder = useCallback(
    (confirmou: boolean) => {
      pedido?.resolver(confirmou);
      ref.current?.close();
      setPedido(null);
    },
    [pedido],
  );

  const valor = useMemo<Dialogos>(
    () => ({
      confirmar: (titulo, mensagem, rotulo, opcoes) =>
        new Promise((resolver) =>
          // Desfazer e apagar sao o caso comum de confirmacao: destrutiva por padrao.
          setPedido({ titulo, mensagem, rotulo, destrutiva: opcoes?.destrutiva ?? true, resolver }),
        ),
      avisar: (titulo, mensagem) =>
        new Promise((resolver) => setPedido({ titulo, mensagem, resolver: () => resolver() })),
    }),
    [],
  );

  return (
    <Contexto.Provider value={valor}>
      {children}
      <dialog
        ref={ref}
        className={estilos.dialogo}
        aria-labelledby="dialogo-titulo"
        aria-describedby="dialogo-mensagem"
        // Esc e clique fora contam como "Cancelar".
        onCancel={(e) => {
          e.preventDefault();
          responder(false);
        }}
        onClick={(e) => {
          if (e.target === ref.current) responder(false);
        }}
      >
        {pedido ? (
          <div className={estilos.caixa}>
            <h2 id="dialogo-titulo" className={estilos.titulo}>
              {pedido.titulo}
            </h2>
            <p id="dialogo-mensagem" className={estilos.mensagem}>
              {pedido.mensagem}
            </p>
            <div className={estilos.acoes}>
              {pedido.rotulo ? (
                <>
                  <button
                    type="button"
                    className={estilos.cancelar}
                    onClick={() => responder(false)}
                    autoFocus
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className={estilos.acao}
                    data-destrutiva={pedido.destrutiva ? '' : undefined}
                    onClick={() => responder(true)}
                  >
                    {pedido.rotulo}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={estilos.acao}
                  onClick={() => responder(true)}
                  autoFocus
                >
                  Entendi
                </button>
              )}
            </div>
          </div>
        ) : null}
      </dialog>
    </Contexto.Provider>
  );
}

export function useDialogos(): Dialogos {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useDialogos precisa estar dentro de <DialogoProvider>');
  return ctx;
}
