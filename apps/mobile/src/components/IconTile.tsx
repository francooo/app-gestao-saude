import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Icone, ICONES, type NomeIcone } from '@/components/Icone';
import { colors, radii } from '@/theme';
import type { FormaVisual } from '@/lib/posologia';

/**
 * O ladrilho quadrado com icone, que marca categoria em todo o aplicativo.
 *
 * Nasceu de uma duplicacao real: o mapa de cores por forma farmaceutica morava
 * DENTRO do MedicationCard, e a tela de detalhe precisa exatamente dele em
 * dois lugares. Copiar garantiria que um dia a capsula ficasse ambar na lista
 * e verde no detalhe.
 *
 * Decorativo por padrao. Ele nunca e a unica fonte da informacao nesta base —
 * a forma do remedio tambem esta escrita ao lado, em "1 capsula" — entao
 * anuncia-lo faria o leitor de tela gastar um gesto para nada.
 */

type Props = {
  icone: NomeIcone;
  fundo: string;
  traco: string;
  /** 54 em destaque, 44 em linha de lista. */
  size?: number;
  style?: ViewStyle;
};

/** Raios calibrados para o ladrilho acompanhar a curva do cartao que o contem. */
const RAIO: Record<number, number> = {
  44: radii.card - 14,
  54: radii.card - 12,
};

export function IconTile({ icone, fundo, traco, size = 44, style }: Props) {
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: RAIO[size] ?? Math.round(size * 0.3),
          backgroundColor: fundo,
        },
        style,
      ]}
    >
      <Icone nome={icone} size={Math.round(size * 0.45)} color={traco} />
    </View>
  );
}

/**
 * Ladrilho e traco por forma farmaceutica.
 *
 * Capsula e comprimido vem do MaterialCommunityIcons (ver Icone.tsx): o
 * Feather nao tem nenhum dos dois, e o pacote final de telas desenha a pilula
 * de verdade. Antes eram "aperture" e "circle", aproximacoes.
 */
export const LADRILHO_POR_FORMA: Record<
  FormaVisual,
  { fundo: string; traco: string; icone: NomeIcone }
> = {
  capsula: { fundo: colors.surfaceWarm, traco: colors.accent, icone: ICONES.pilula },
  comprimido: { fundo: colors.pillTablet, traco: colors.pillTabletIcon, icone: ICONES.comprimido },
  gotas: { fundo: colors.surfaceWarm, traco: colors.accent, icone: 'droplet' },
  ml: { fundo: colors.pillTablet, traco: colors.pillTabletIcon, icone: 'thermometer' },
  // Inalador: "wind" é a aproximação do Feather para spray/bombinha.
  jato: { fundo: colors.surfaceWarm, traco: colors.accent, icone: 'wind' },
};

/** Ladrilho neutro, para quando o elemento nao pede atencao. */
export const LADRILHO_NEUTRO = {
  fundo: colors.pillTablet,
  traco: colors.pillTabletIcon,
} as const;

/** Ladrilho ambar: em todo o aplicativo, significa "tem coisa para fazer". */
export const LADRILHO_ATENCAO = {
  fundo: colors.surfaceWarm,
  traco: colors.accent,
} as const;

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
