import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import type { ColorValue, StyleProp, TextStyle } from 'react-native';

/**
 * Icone de duas familias, com UM nome.
 *
 * O aplicativo nasceu so com Feather, e e Feather que continua valendo. Mas o
 * pacote de telas finais (assets-source/familia-saude-telas-selecionadas) usa
 * desenhos que o Feather NAO TEM — pilula, o brilho da IA, escudo com check,
 * cruz medica, sliders horizontais, lampada, WhatsApp. Esses vem do
 * MaterialCommunityIcons, que ja esta no mesmo pacote (@expo/vector-icons):
 * nenhuma dependencia nova.
 *
 * O nome com prefixo `mci:` escolhe a familia. Sem prefixo, e Feather — assim
 * todo `icone="bell"` que ja existe continua funcionando sem mudar uma linha.
 */
type NomeFeather = keyof typeof Feather.glyphMap;
type NomeMci = keyof typeof MaterialCommunityIcons.glyphMap;

export type NomeIcone = NomeFeather | `mci:${NomeMci}`;

/**
 * Os desenhos do pacote final que o Feather nao tem. Nome semantico para a tela
 * nao precisar saber de que familia vem — e para trocar num lugar so.
 */
export const ICONES = {
  pilula: 'mci:pill',
  comprimido: 'mci:minus-circle-outline',
  brilho: 'mci:star-four-points',
  escudoCheck: 'mci:shield-check-outline',
  cruzMedica: 'mci:medical-bag',
  ajustes: 'mci:tune-variant',
  lampada: 'mci:lightbulb-outline',
  whatsapp: 'mci:whatsapp',
  farmacia: 'mci:store-plus-outline',
  calendarioMais: 'mci:calendar-plus',
  termometro: 'mci:thermometer',
  pinoCheio: 'mci:map-marker',
  coracao: 'mci:heart',
  acompanhante: 'mci:account-group',
  dor: 'mci:head-alert-outline',
  nausea: 'mci:stomach',
  tosse: 'mci:lungs',
  // Feather, e nao MCI: e o mesmo desenho da aba Assistente, e a tela de
  // assinatura precisa apontar para ela com o icone que a pessoa ja conhece.
  assistente: 'message-square',
} as const satisfies Record<string, NomeIcone>;

type Props = {
  nome: NomeIcone;
  size: number;
  color: ColorValue;
  style?: StyleProp<TextStyle>;
};

export function Icone({ nome, size, color, style }: Props) {
  if (nome.startsWith('mci:')) {
    return (
      <MaterialCommunityIcons
        name={nome.slice(4) as NomeMci}
        size={size}
        color={color}
        style={style}
      />
    );
  }
  return <Feather name={nome as NomeFeather} size={size} color={color} style={style} />;
}
