import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { DoctorsMap } from '@/components/DoctorsMap';
import { SurfaceCard } from '@/components/SurfaceCard';
import { healthApi, type Professional } from '@/api/health';
import { abrirRotaPara } from '@/lib/maps';
import { colors, fonts, radii, spacing } from '@/theme';

/**
 * Mapa em tela cheia dos consultorios.
 *
 * O mapa pequeno da lista serve de visao geral; aqui da para dar zoom e tocar
 * nos alfinetes com folga. Tocar num alfinete abre um cartao com o medico e o
 * botao de rota, em vez de sair direto para o Waze — no mapa pequeno o toque
 * e deliberado, mas aqui a pessoa esta explorando e um desvio imediato para
 * outro aplicativo seria hostil.
 */
export default function MapaScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [medicos, setMedicos] = useState<Professional[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [selecionado, setSelecionado] = useState<Professional | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const lista = await healthApi.listProfessionals();
        if (!cancelado) setMedicos(lista);
      } catch {
        // A tela mostra o estado vazio do proprio mapa.
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  async function irAte(m: Professional) {
    if (m.latitude == null || m.longitude == null) return;
    const ok = await abrirRotaPara(m.latitude, m.longitude, m.clinicName ?? m.name);
    if (!ok) {
      Alert.alert(
        'Não consegui abrir o mapa',
        'Nenhum aplicativo de mapas respondeu neste aparelho.',
      );
    }
  }

  return (
    <View style={styles.tela}>
      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={colors.accentGreen} />
        </View>
      ) : (
        <DoctorsMap
          doctors={medicos}
          height={undefined}
          fullScreen
          onSelectDoctor={(id) => setSelecionado(medicos.find((m) => m.id === id) ?? null)}
        />
      )}

      {/* Botao de voltar flutuando sobre o mapa. */}
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Voltar"
        style={[styles.voltar, { top: insets.top + spacing.md }]}
      >
        <Feather name="chevron-left" size={24} color={colors.sectionTitle} />
      </Pressable>

      {selecionado ? (
        <View style={[styles.cartao, { bottom: insets.bottom + spacing.xl }]}>
          <SurfaceCard style={styles.cartaoInterno}>
            <View style={styles.cartaoLinha}>
              <Avatar
                nome={selecionado.name}
                photo={selecionado.photo}
                recyclingKey={selecionado.id}
                size={48}
              />
              <View style={styles.cartaoTextos}>
                <Text style={styles.cartaoNome} numberOfLines={1}>
                  {selecionado.name}
                </Text>
                {selecionado.specialty ? (
                  <Text style={styles.cartaoEsp} numberOfLines={1}>
                    {selecionado.specialty}
                  </Text>
                ) : null}
                {selecionado.address ? (
                  <Text style={styles.cartaoEndereco} numberOfLines={2}>
                    {selecionado.address}
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => setSelecionado(null)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Fechar"
              >
                <Feather name="x" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <Pressable
              onPress={() => irAte(selecionado)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.rota, pressed && styles.rotaPressionada]}
            >
              <Feather name="navigation" size={17} color={colors.onAccent} />
              <Text style={styles.rotaTexto}>Como chegar</Text>
            </Pressable>
          </SurfaceCard>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.homeBackgroundTop },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  voltar: {
    position: 'absolute',
    left: spacing.xl,
    width: 48,
    height: 48,
    borderRadius: radii.card - 8,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2C3520',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  cartao: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
  },
  cartaoInterno: { padding: spacing.lg },
  cartaoLinha: { flexDirection: 'row', alignItems: 'flex-start' },
  cartaoTextos: { flex: 1, marginHorizontal: spacing.lg },
  cartaoNome: { fontFamily: fonts.bold, fontSize: 17, color: colors.sectionTitle },
  cartaoEsp: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.accentGreenSoft,
    marginTop: 1,
  },
  cartaoEndereco: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  rota: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accentGreen,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    marginTop: spacing.lg,
  },
  rotaPressionada: { opacity: 0.85 },
  rotaTexto: { fontFamily: fonts.bold, fontSize: 16, color: colors.onAccent },
});
