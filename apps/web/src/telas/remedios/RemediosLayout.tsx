import { useState } from 'react';
import { Outlet, useOutletContext } from 'react-router';

import { ListaDeRemedios } from './ListaDeRemedios';

/** O que a moldura da area entrega as telas de dentro. */
type Contexto = {
  /** De quem a lista mostra os remedios. null = a familia inteira. */
  perfilId: string | null;
  setPerfilId: (id: string | null) => void;
  /**
   * Sempre false agora. A lista e o detalhe lado a lado sairam: nas telas de
   * referencia da web a lista usa a largura inteira e o detalhe tem tela
   * propria. Fica no contexto para as telas de dentro continuarem decidindo o
   * "voltar" sem mudar.
   */
  doisPaineis: boolean;
};

export function useAreaDeRemedios(): Contexto {
  return useOutletContext<Contexto>();
}

/**
 * Moldura da area de Remedios: cada rota e uma tela inteira.
 *
 * O filtro de pessoa mora aqui, e nao na lista: assim ele sobrevive a ida ao
 * detalhe e a volta.
 */
export function RemediosLayout() {
  const [perfilId, setPerfilId] = useState<string | null>(null);
  return <Outlet context={{ perfilId, setPerfilId, doisPaineis: false }} />;
}

/** A rota /remedios em si: a lista. */
export function RemediosIndex() {
  const { perfilId, setPerfilId } = useAreaDeRemedios();
  return <ListaDeRemedios perfilId={perfilId} setPerfilId={setPerfilId} />;
}
