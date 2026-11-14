import { useState } from 'react';
import { Outlet, useOutletContext } from 'react-router';

import { FundoDeTela } from '@/layout/FundoDeTela';
import { LARGURA_DE_DOIS_PAINEIS, useLarguraMinima } from '@/lib/useLargura';
import { IconTile, LADRILHO_NEUTRO } from '@/ui/IconTile';
import { EmPainel } from '@/ui/Pagina';

import { ListaDeRemedios } from './ListaDeRemedios';
import estilos from './remedios.module.css';

/** O que a moldura da area entrega as telas de dentro. */
type Contexto = {
  /** De quem a lista mostra os remedios. null = a familia inteira. */
  perfilId: string | null;
  setPerfilId: (id: string | null) => void;
  doisPaineis: boolean;
};

export function useAreaDeRemedios(): Contexto {
  return useOutletContext<Contexto>();
}

/**
 * Moldura da area de Remedios.
 *
 * No celular e no tablet cada rota e uma tela inteira, como no aplicativo. Em
 * tela larga a lista fica fixa a esquerda e a rota aberta (detalhe, estoque,
 * formulario) ocupa o painel da direita — a pessoa troca de remedio sem
 * perder a lista de vista.
 *
 * O filtro de pessoa mora aqui, e nao na lista: assim ele sobrevive a ida ao
 * detalhe e a volta.
 */
export function RemediosLayout() {
  const doisPaineis = useLarguraMinima(LARGURA_DE_DOIS_PAINEIS);
  const [perfilId, setPerfilId] = useState<string | null>(null);
  const contexto: Contexto = { perfilId, setPerfilId, doisPaineis };

  if (!doisPaineis) return <Outlet context={contexto} />;

  return (
    <EmPainel.Provider value>
      <FundoDeTela area="medications" />
      <div className={estilos.doisPaineis}>
        <section className={estilos.painelDaLista} aria-label="Lista de medicamentos">
          <ListaDeRemedios perfilId={perfilId} setPerfilId={setPerfilId} />
        </section>
        <main className={estilos.painelDoDetalhe}>
          <Outlet context={contexto} />
        </main>
      </div>
    </EmPainel.Provider>
  );
}

/**
 * A rota /remedios em si: a lista, quando ela e a tela; ou um convite a
 * escolher um remedio, quando a lista ja esta ao lado.
 */
export function RemediosIndex() {
  const { perfilId, setPerfilId, doisPaineis } = useAreaDeRemedios();

  if (!doisPaineis) return <ListaDeRemedios perfilId={perfilId} setPerfilId={setPerfilId} />;

  return (
    <div className={estilos.painelVazio}>
      <IconTile size={54} icone="mci:pill" {...LADRILHO_NEUTRO} />
      <p className={estilos.painelVazioTexto}>
        Escolha um remédio na lista para ver a posologia, o estoque e o histórico de doses.
      </p>
    </div>
  );
}
