import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { IconTile, LADRILHO_NEUTRO } from '@/components/IconTile';
import { ImageViewerModal } from '@/components/ImageViewerModal';
import { SurfaceCard } from '@/components/SurfaceCard';
import { colors, fonts, radii, spacing } from '@/theme';

type Props = {
  /** Data URI JPEG, ou null quando nao ha receita anexada. */
  foto: string | null;
  /** Nome do remedio, para o leitor de tela saber de que receita se trata. */
  doQue: string;
  /** Quem receitou, quando o cadastro souber. */
  prescritor?: string | null;
  ocupado?: boolean;
  onAdicionar: () => void;
  onTrocar: () => void;
  onRemover: () => void;
};

/**
 * O bloco "Prescricao medica" do mockup.
 *
 * Tres estados, e o vazio e o unico estado vazio que ganha espaco nesta tela:
 * ele traz consigo a acao que o resolve. Um cartao dizendo "sem informacao" e
 * nada mais gastaria rolagem para comunicar um nada sem saida — e por isso que
 * a secao "Instrucoes" simplesmente some quando esta vazia, em vez de mostrar
 * um aviso.
 *
 * O botao ambar de largura cheia SO existe enquanto nao ha receita. O peso
 * maximo de botao se justifica pelo trabalho por fazer; feito o trabalho, ele
 * da lugar a duas acoes discretas.
 */
export function PrescriptionCard({
  foto,
  doQue,
  prescritor,
  ocupado = false,
  onAdicionar,
  onTrocar,
  onRemover,
}: Props) {
  const [ampliada, setAmpliada] = useState(false);

  if (!foto) {
    return (
      <SurfaceCard style={styles.cartao}>
        <View style={styles.linha}>
          <IconTile icone="file-text" {...LADRILHO_NEUTRO} />
          <View style={styles.textos}>
            <Text style={styles.titulo}>Nenhuma prescrição anexada</Text>
            <Text style={styles.ajuda}>
              Guarde a foto da receita para ter em mãos na farmácia. Ela fica só na sua conta e
              é apagada junto com o remédio.
            </Text>
          </View>
        </View>

        <Pressable
          onPress={onAdicionar}
          disabled={ocupado}
          accessibilityRole="button"
          accessibilityLabel="Adicionar prescrição"
          accessibilityHint="Escolhe entre tirar uma foto e usar a galeria"
          style={({ pressed }) => [
            styles.botao,
            pressed && styles.botaoPressionado,
            ocupado && styles.apagado,
          ]}
        >
          {ocupado ? (
            <ActivityIndicator size="small" color={colors.onAccent} />
          ) : (
            <Feather name="camera" size={18} color={colors.onAccent} />
          )}
          <Text style={styles.botaoTexto}>Adicionar prescrição</Text>
        </Pressable>
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard style={styles.cartao}>
      <Pressable
        onPress={() => setAmpliada(true)}
        disabled={ocupado}
        accessibilityRole="imagebutton"
        accessibilityLabel={`Foto da receita de ${doQue}`}
        accessibilityHint="Toque duas vezes para ver em tela cheia"
      >
        <Image source={{ uri: foto }} contentFit="cover" transition={120} style={styles.miniatura} />
        <View style={styles.lupa}>
          <Feather name="maximize-2" size={15} color={colors.onAccent} />
        </View>
        {ocupado ? (
          <View style={styles.veu}>
            <ActivityIndicator color={colors.accentGreen} />
          </View>
        ) : null}
      </Pressable>

      <View style={[styles.linha, styles.legenda]}>
        <IconTile icone="file-text" {...LADRILHO_NEUTRO} />
        <View style={styles.textos}>
          <Text style={styles.titulo}>Receita anexada</Text>
          <Text style={styles.ajuda}>
            {prescritor ? `Receitada por ${prescritor}.` : 'Toque na imagem para ver de perto.'}
          </Text>
        </View>
      </View>

      <View style={styles.acoes}>
        <Pressable
          onPress={onTrocar}
          disabled={ocupado}
          accessibilityRole="button"
          accessibilityLabel="Trocar a foto da receita"
          style={({ pressed }) => [
            styles.contorno,
            pressed && styles.apagado,
            ocupado && styles.apagado,
          ]}
        >
          <Feather name="refresh-cw" size={15} color={colors.accentGreen} />
          <Text style={styles.contornoTexto}>Trocar</Text>
        </Pressable>

        <Pressable
          onPress={onRemover}
          disabled={ocupado}
          accessibilityRole="button"
          accessibilityLabel="Remover a foto da receita"
          style={({ pressed }) => [styles.remover, (pressed || ocupado) && styles.apagado]}
        >
          <Text style={styles.removerTexto}>Remover</Text>
        </Pressable>
      </View>

      <ImageViewerModal
        uri={foto}
        visivel={ampliada}
        descricao={`Receita de ${doQue}`}
        onClose={() => setAmpliada(false)}
      />
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  cartao: { padding: spacing.lg },
  linha: { flexDirection: 'row', alignItems: 'flex-start' },
  legenda: { marginTop: spacing.md },
  textos: { flex: 1, marginLeft: spacing.md },
  titulo: { fontFamily: fonts.bold, fontSize: 16, color: colors.sectionTitle },
  ajuda: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    marginTop: 2,
  },
  miniatura: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radii.card - 12,
    backgroundColor: colors.pillTablet,
  },
  lupa: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
  },
  veu: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.card - 12,
    backgroundColor: 'rgba(248, 243, 222, 0.75)',
  },
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    marginTop: spacing.lg,
  },
  botaoPressionado: { backgroundColor: colors.accentPressed },
  botaoTexto: { fontFamily: fonts.bold, fontSize: 16, color: colors.onAccent },
  acoes: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  contorno: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.accentGreen,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
  },
  contornoTexto: { fontFamily: fonts.semibold, fontSize: 15, color: colors.accentGreen },
  remover: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  removerTexto: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textError },
  apagado: { opacity: 0.55 },
});
