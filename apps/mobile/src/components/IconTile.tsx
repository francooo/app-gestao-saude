import { Feather } from '@expo/vector-icons';
import { StyleSheet, View, type ViewStyle } from 'react-native';

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
  icone: keyof typeof Feather.glyphMap;
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
      <Feather name={icone} size={Math.round(size * 0.45)} color={traco} />
    </View>
  );
}

/**
 * Ladrilho e traco por forma farmaceutica.
 *
 * O Feather nao tem icone de capsula nem de comprimido; "aperture" e "circle"
 * sao as aproximacoes que o projeto ja adotou. Abrir uma segunda familia de
 * icones por dois icones nao se paga.
 */
export const LADRILHO_POR_FORMA: Record<
  FormaVisual,
  { fundo: string; traco: string; icone: keyof typeof Feather.glyphMap }
> = {
  capsula: { fundo: colors.surfaceWarm, traco: colors.accent, icone: 'aperture' },
  comprimido: { fundo: colors.pillTablet, traco: colors.pillTabletIcon, icone: 'circle' },
  gotas: { fundo: colors.surfaceWarm, traco: colors.accent, icone: 'droplet' },
  ml: { fundo: colors.pillTablet, traco: colors.pillTabletIcon, icone: 'thermometer' },
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
