import { Stack } from 'expo-router';

import { backgrounds } from '@/theme';

/**
 * Pilha da aba Remedios: a lista e o detalhe de um medicamento.
 *
 * Existe por um motivo visivel: o mockup mostra a barra de abas na tela de
 * detalhe, com "Remedios" aceso. Enquanto o detalhe era uma rota irma das
 * abas (com `href: null`), isso era impossivel — quando ela estava em foco,
 * NENHUMA aba acendia, e a barra aparecia apagada, parecendo defeito.
 *
 * O QUE ISSO CUSTA, e esta registrado porque vai surpreender alguem: abrir o
 * detalhe a partir da tela INICIAL agora troca a aba para Remedios, e a seta
 * de voltar leva para a LISTA de remedios, nao para o Inicio. Nao ha
 * configuracao que faca o voltar atravessar abas — a informacao de onde a
 * pessoa veio nao existe nesta arvore. E aceitavel porque a tela passou a
 * DIZER, com a barra, que mora em Remedios; voltar para a lista e o que essa
 * moldura promete, e o Inicio fica a um toque visivel. O que seria mentira e o
 * contrario: mostrar "Remedios" aceso e a seta pular para outro lugar.
 *
 * O FORMULARIO NAO ENTRA AQUI. Ele continua em `medicamento/form/[id]`, fora
 * das abas, porque a barra precisa sumir nele — o motivo esta no comentario do
 * layout de cima: abas embaixo de um formulario longo dividem a atencao e
 * convidam a sair no meio do preenchimento. Esse argumento vale para
 * formulario, nao para uma tela de leitura.
 */
export default function RemediosLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Sem isto o cartao da pilha entra branco e pisca por cima do
        // gradiente das duas telas durante o empurrao.
        contentStyle: { backgroundColor: backgrounds.medications[0] },
      }}
    />
  );
}
