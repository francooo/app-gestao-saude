import type { ReferenceLocation } from '@gestao/shared/api/health';
import { buscarCep, formatarCep, montarEndereco, somenteDigitos } from '@gestao/shared/lib/cep';
import { useRef, useState } from 'react';

import botoes from '@/ui/botoes.module.css';
import { FormField } from '@/ui/FormField';
import { Icone } from '@/ui/Icone';

import estilos from './medicos.module.css';

type Props = {
  location: ReferenceLocation | null;
  /** Lanca se o endereco nao for localizado: a barra mostra o erro no campo. */
  onSetAddress: (address: string) => Promise<void>;
  /** Devolve false se a posicao nao pode ser obtida (o aviso e de quem chama). */
  onUseCurrent: () => Promise<boolean>;
  saving?: boolean;
};

/**
 * Barra do ponto de referencia: de onde as distancias ate os consultorios sao
 * medidas. "Alterar" abre o painel para usar a posicao atual ou fixar um endereco.
 */
export function LocationBar({ location, onSetAddress, onUseCurrent, saving }: Props) {
  const painel = useRef<HTMLDialogElement>(null);
  const [cep, setCep] = useState('');
  const [endereco, setEndereco] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | undefined>();

  const temReferencia = location?.latitude != null;

  function fechar() {
    painel.current?.close();
    setCep('');
    setEndereco('');
    setErro(undefined);
  }

  async function consultarCep(valor: string) {
    setCep(formatarCep(valor));
    setErro(undefined);
    if (somenteDigitos(valor).length !== 8) return;

    setBuscando(true);
    const r = await buscarCep(valor);
    setBuscando(false);
    if (r.ok) {
      setEndereco(montarEndereco(r.endereco));
      return;
    }
    setErro(
      r.motivo === 'nao_encontrado'
        ? 'CEP não encontrado. Digite o endereço à mão.'
        : 'Não consegui consultar o CEP. Digite o endereço à mão.',
    );
  }

  async function confirmar() {
    if (endereco.trim().length < 5) {
      setErro('Informe um endereço');
      return;
    }
    try {
      await onSetAddress(endereco.trim());
      fechar();
    } catch {
      setErro('Não consegui localizar esse endereço. Tente com mais detalhes.');
    }
  }

  return (
    <>
      <div className={estilos.barra}>
        <Icone
          nome="mci:map-marker"
          size={24}
          color={temReferencia ? 'var(--cor-accent-green)' : 'var(--cor-text-placeholder)'}
        />
        <span className={estilos.barraRotulo} data-vazio={temReferencia ? undefined : ''}>
          {location?.label ?? 'Definir ponto de referência'}
        </span>
        <button
          type="button"
          className={estilos.alterar}
          onClick={() => painel.current?.showModal()}
          aria-label="Alterar ponto de referência"
          aria-haspopup="dialog"
        >
          {saving ? <span className={botoes.girando} /> : 'Alterar'}
        </button>
      </div>

      <dialog
        ref={painel}
        className={estilos.painel}
        aria-labelledby="local-titulo"
        onClose={fechar}
        onClick={(e) => {
          if (e.target === painel.current) fechar();
        }}
      >
        <div className={estilos.painelCaixa}>
          <h2 id="local-titulo" className={estilos.painelTitulo}>
            Medir distâncias a partir de
          </h2>
          <p className={estilos.painelAjuda}>
            As distâncias até os consultórios passam a ser calculadas deste ponto.
          </p>

          <button
            type="button"
            className={estilos.opcaoAtual}
            disabled={saving}
            onClick={async () => {
              if (await onUseCurrent()) fechar();
            }}
          >
            <Icone nome="crosshair" size={18} color="var(--cor-accent-green)" />
            Usar minha localização atual
          </button>

          <p className={estilos.ou}>ou fixe um endereço</p>

          <FormField
            label="CEP"
            value={cep}
            onChangeText={(v) => void consultarCep(v)}
            placeholder="01310-200"
            inputMode="numeric"
            maxLength={9}
            loading={buscando}
          />
          <FormField
            label="Endereço"
            value={endereco}
            onChangeText={setEndereco}
            placeholder="Rua, número, cidade"
            error={erro}
          />

          <div className={estilos.painelBotoes}>
            <button type="button" className={botoes.texto} onClick={fechar}>
              Cancelar
            </button>
            <button
              type="button"
              className={botoes.verde}
              style={{ flex: 1 }}
              disabled={saving}
              onClick={() => void confirmar()}
            >
              {saving ? <span className={botoes.girando} /> : null}
              Usar este endereço
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
