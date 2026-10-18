import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ICONES, type NomeIcone } from '@/components/Icone';
import { IconTile, LADRILHO_NEUTRO } from '@/components/IconTile';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionHeader } from '@/components/SectionHeader';
import { SurfaceCard } from '@/components/SurfaceCard';
import { usePlano } from '@/lib/avisosContext';
import { estadoDoPlano } from '@/lib/plano';
import { backgrounds, colors, fonts, radii, spacing } from '@/theme';

/**
 * O que a assinatura traz. Sao exatamente as tres rotas que o servidor bloqueia
 * (mensagem, ler-foto, posologia) — nenhum item promete o que o 403 nao cobre.
 */
const BENEFICIOS: { icone: NomeIcone; titulo: string; texto: string }[] = [
  {
    icone: 'camera',
    titulo: 'Ler receita e caixinha por foto',
    texto: 'A IA lê a foto e preenche o cadastro do remédio para você conferir.',
  },
  {
    icone: ICONES.brilho,
    titulo: 'Descreva como tomar',
    texto: 'Escreva do seu jeito e a IA transforma em horários e doses.',
  },
  {
    icone: ICONES.assistente,
    titulo: 'Assistente de Saúde',
    texto: 'Tire dúvidas sobre os remédios, doses e consultas da família.',
  },
];

/** O que nao depende de plano. Dito por extenso para ninguem achar que perde o basico. */
const GRATIS = ['Remédios', 'Lembretes', 'Consultas', 'Diário de sintomas', 'Estoque', 'Médicos'];

/**
 * Assinatura: o estado do plano e o que ele libera.
 *
 * A COMPRA AINDA NAO EXISTE NESTA VERSAO. Ela vem pela Google Play numa versao
 * nova do aplicativo (biblioteca nativa, nao cabe numa atualizacao pelo ar).
 * Ate la o botao fica visivel e desabilitado, dizendo isso: esconde-lo faria a
 * tela parecer um beco sem saida, e habilita-lo prometeria uma compra que nao
 * acontece.
 *
 * "Ja assinei" so reconsulta o servidor. E o caminho de quem assinou por outro
 * aparelho, ou de quem teve o plano liberado pelo suporte.
 */
export default function AssinaturaScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { plano, premium, carregado, recarregar } = usePlano();

  const [conferindo, setConferindo] = useState(false);
  /** A pessoa tocou em "Ja assinei" e a resposta voltou. */
  const [conferido, setConferido] = useState(false);

  // A cada entrada: o plano pode ter mudado desde a ultima carga do provider
  // (o teste venceu, alguem assinou em outro aparelho).
  useFocusEffect(
    useCallback(() => {
      setConferido(false);
      void recarregar();
    }, [recarregar]),
  );

  async function jaAssinei() {
    setConferindo(true);
    try {
      await recarregar();
    } finally {
      setConferindo(false);
      setConferido(true);
    }
  }

  const assinante = plano?.motivo === 'assinatura';
  const estado = estadoDoPlano(plano);

  return (
    <View style={styles.tela}>
      <ScreenBackground colors={backgrounds.settings} />

      <ScrollView
        contentContainerStyle={[
          styles.conteudo,
          { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title="Assinatura" onBack={() => router.back()} />

        <SurfaceCard style={styles.estado}>
          {!carregado && !plano ? (
            <ActivityIndicator color={colors.accentGreen} style={styles.carregando} />
          ) : (
            <View style={styles.linha} accessible accessibilityLabel={`${estado.titulo}. ${estado.apoio}`}>
              <IconTile
                size={54}
                icone={premium && plano ? ICONES.brilho : 'lock'}
                {...(premium && plano
                  ? { fundo: colors.accentGreen, traco: colors.onAccent }
                  : LADRILHO_NEUTRO)}
              />
              <View style={styles.textos}>
                <Text style={styles.estadoTitulo}>{estado.titulo}</Text>
                <Text style={styles.estadoApoio}>{estado.apoio}</Text>
              </View>
            </View>
          )}
        </SurfaceCard>

        <View style={styles.secao}>
          <SectionHeader title="Com a assinatura" />
          <SurfaceCard style={styles.lista}>
            {BENEFICIOS.map((b, i) => (
              <View
                key={b.titulo}
                style={[styles.beneficio, i > 0 && styles.beneficioSeguinte]}
                accessible
                accessibilityLabel={`${b.titulo}. ${b.texto}`}
              >
                <IconTile icone={b.icone} fundo={colors.surfaceWarm} traco={colors.accent} />
                <View style={styles.textos}>
                  <Text style={styles.beneficioTitulo}>{b.titulo}</Text>
                  <Text style={styles.beneficioTexto}>{b.texto}</Text>
                </View>
              </View>
            ))}
          </SurfaceCard>
        </View>

        <View style={styles.secao}>
          <SectionHeader title="Continua grátis" />
          <SurfaceCard style={styles.lista}>
            <View
              style={styles.chips}
              accessible
              accessibilityLabel={`Continua grátis: ${GRATIS.join(', ')}.`}
            >
              {GRATIS.map((rotulo) => (
                <View key={rotulo} style={styles.chip}>
                  <Feather name="check" size={12} color={colors.accentGreen} />
                  <Text style={styles.chipTexto}>{rotulo}</Text>
                </View>
              ))}
            </View>
          </SurfaceCard>
        </View>

        {/* Quem ja assina nao precisa do convite nem do "Ja assinei". */}
        {assinante ? null : (
          <>
            <PrimaryButton
              title="Em breve pela Google Play"
              onPress={() => undefined}
              disabled
              style={styles.assinar}
            />
            <Text style={styles.explicacao}>
              A assinatura chega numa próxima versão do aplicativo. Até lá, nada é cobrado.
            </Text>

            <Pressable
              onPress={() => void jaAssinei()}
              disabled={conferindo}
              accessibilityRole="button"
              accessibilityLabel="Já assinei"
              accessibilityHint="Confere de novo o plano desta conta"
              accessibilityState={{ busy: conferindo }}
              style={({ pressed }) => [styles.jaAssinei, pressed && styles.pressionado]}
            >
              {conferindo ? (
                <ActivityIndicator size="small" color={colors.accentGreen} />
              ) : (
                <Text style={styles.jaAssineiTexto}>Já assinei</Text>
              )}
            </Pressable>

            {conferido && !conferindo && plano && !plano.premium ? (
              <Text style={styles.explicacao} accessibilityLiveRegion="polite">
                Ainda não encontramos uma assinatura nesta conta.
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: backgrounds.settings[0] },
  conteudo: { paddingHorizontal: spacing.xl },
  secao: { marginTop: spacing.xxl },

  estado: { marginTop: spacing.xl, padding: spacing.lg },
  carregando: { marginVertical: spacing.lg },
  linha: { flexDirection: 'row', alignItems: 'center' },
  textos: { flex: 1, marginLeft: spacing.md },
  estadoTitulo: { fontFamily: fonts.bold, fontSize: 18, color: colors.sectionTitle },
  estadoApoio: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    marginTop: 2,
  },

  lista: { padding: spacing.lg },
  beneficio: { flexDirection: 'row', alignItems: 'flex-start' },
  beneficioSeguinte: { marginTop: spacing.lg },
  beneficioTitulo: { fontFamily: fonts.bold, fontSize: 15, color: colors.sectionTitle },
  beneficioTexto: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: 2,
  },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.pillTablet,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  chipTexto: { fontFamily: fonts.semibold, fontSize: 13, color: colors.accentGreen },

  assinar: { marginTop: spacing.xxl },
  explicacao: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  jaAssinei: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.accentGreen,
    borderRadius: radii.pill,
    minHeight: 52,
    marginTop: spacing.xl,
  },
  jaAssineiTexto: { fontFamily: fonts.bold, fontSize: 16, color: colors.accentGreen },
  pressionado: { opacity: 0.85 },
});
