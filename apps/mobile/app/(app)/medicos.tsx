import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { messageForError } from '@gestao/shared';

import { ApiRequestError } from '@/api/client';
import { healthApi, type Profile, type Professional } from '@/api/health';
import { DoctorCard } from '@/components/DoctorCard';
import { DoctorsMap } from '@/components/DoctorsMap';
import { FilterChips, type Chip } from '@/components/FilterChips';
import { ProfileSelector } from '@/components/ProfileSelector';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionHeader } from '@/components/SectionHeader';
import { SurfaceCard } from '@/components/SurfaceCard';
import { abrirRotaPara } from '@/lib/maps';
import { colors, fonts, spacing } from '@/theme';

/** Altura da barra de abas flutuante. */
const ESPACO_BARRA = 96;

export default function MedicosScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [perfis, setPerfis] = useState<Profile[]>([]);
  const [medicos, setMedicos] = useState<Professional[]>([]);
  const [perfilId, setPerfilId] = useState<string | null>(null);
  const [especialidade, setEspecialidade] = useState<string | null>(null);

  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [minhaPosicao, setMinhaPosicao] = useState<Location.LocationObjectCoords | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [listaPerfis, listaMedicos] = await Promise.all([
        healthApi.listProfiles(),
        healthApi.listProfessionals({ profileId: perfilId }),
      ]);
      setPerfis(listaPerfis);
      setMedicos(listaMedicos);
    } catch (e) {
      setErro(messageForError(e instanceof ApiRequestError ? e.code : undefined));
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, [perfilId]);

  useFocusEffect(
    useCallback(() => {
      void carregar();
    }, [carregar]),
  );

  /**
   * Localizacao e opcional de verdade: se a permissao for negada, a tela
   * funciona igual, apenas sem a distancia nos cards. Nao insistimos nem
   * bloqueamos nada.
   */
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelado) return;
        const pos = await Location.getLastKnownPositionAsync();
        const atual = pos ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        if (!cancelado && atual) setMinhaPosicao(atual.coords);
      } catch {
        // Sem localizacao seguimos sem distancia.
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  // As especialidades saem dos medicos que voce tem — nao ha lista fixa.
  const chips = useMemo<Chip[]>(() => {
    const unicas = [...new Set(medicos.map((m) => m.specialty).filter(Boolean))] as string[];
    unicas.sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return [{ value: null, label: 'Todas' }, ...unicas.map((e) => ({ value: e, label: e }))];
  }, [medicos]);

  const visiveis = useMemo(
    () => (especialidade ? medicos.filter((m) => m.specialty === especialidade) : medicos),
    [medicos, especialidade],
  );

  function distanciaAte(m: Professional): number | null {
    if (!minhaPosicao || m.latitude == null || m.longitude == null) return null;
    return distanciaKm(minhaPosicao.latitude, minhaPosicao.longitude, m.latitude, m.longitude);
  }

  function emBreve(titulo: string) {
    Alert.alert(titulo, 'Esta parte do aplicativo ainda está sendo construída.');
  }

  /** Toque no alfinete: abre o app de mapas do celular com a rota pronta. */
  async function irAte(medicoId: string) {
    const m = medicos.find((x) => x.id === medicoId);
    if (!m || m.latitude == null || m.longitude == null) return;

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
      <LinearGradient
        colors={[colors.homeBackgroundTop, colors.homeBackgroundBottom]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={[
          styles.conteudo,
          { paddingTop: insets.top + spacing.md, paddingBottom: ESPACO_BARRA + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={atualizando}
            onRefresh={() => {
              setAtualizando(true);
              void carregar();
            }}
            tintColor={colors.accentGreen}
          />
        }
      >
        <ScreenHeader
          title="Médicos"
          onNotifications={() => emBreve('Notificações')}
          hasNotifications
        />

        <View style={styles.seletor}>
          <ProfileSelector profiles={perfis} selectedId={perfilId} onSelect={setPerfilId} />
        </View>

        <View style={styles.chips}>
          <FilterChips chips={chips} selected={especialidade} onSelect={setEspecialidade} />
        </View>

        {carregando ? (
          <ActivityIndicator color={colors.accentGreen} style={styles.carregando} />
        ) : erro ? (
          <SurfaceCard style={styles.aviso}>
            <Feather name="alert-circle" size={26} color={colors.textError} />
            <Text style={styles.avisoTexto}>{erro}</Text>
            <Pressable onPress={() => void carregar()} style={styles.tentarDeNovo}>
              <Text style={styles.tentarDeNovoTexto}>Tentar de novo</Text>
            </Pressable>
          </SurfaceCard>
        ) : (
          <>
            <View style={styles.secao}>
              <SectionHeader title="Onde eles atendem" />
              <DoctorsMap doctors={visiveis} onSelectDoctor={irAte} />
            </View>

            <View style={styles.secao}>
              {visiveis.length === 0 ? (
                <SurfaceCard style={styles.aviso}>
                  <Feather name="user-plus" size={26} color={colors.accentGreen} />
                  <Text style={styles.avisoTexto}>
                    {medicos.length === 0
                      ? 'Você ainda não cadastrou nenhum médico.'
                      : 'Nenhum médico nesta especialidade.'}
                  </Text>
                </SurfaceCard>
              ) : (
                visiveis.map((m) => (
                  <View key={m.id} style={styles.card}>
                    <DoctorCard
                      doctor={m}
                      distanceKm={distanciaAte(m)}
                      onPress={() => router.push(`/medico/${m.id}`)}
                      onAction={() =>
                        router.push({
                          pathname: '/consulta/nova',
                          params: { professionalId: m.id },
                        })
                      }
                    />
                  </View>
                ))
              )}
            </View>
          </>
        )}

        <Pressable
          onPress={() => router.push('/medico/novo')}
          accessibilityRole="button"
          style={styles.adicionar}
        >
          <Feather name="plus" size={20} color={colors.accentGreen} />
          <Text style={styles.adicionarTexto}>Cadastrar médico</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/**
 * Distancia em linha reta pela formula de Haversine.
 *
 * E a distancia "de passaro", nao a de trajeto: serve para dar nocao de perto
 * ou longe, e nao para navegar ate o consultorio.
 */
function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.homeBackgroundTop },
  conteudo: { paddingHorizontal: spacing.xl },
  seletor: { marginTop: spacing.xl },
  chips: { marginTop: spacing.lg },
  carregando: { marginTop: spacing.xxl * 2 },
  secao: { marginTop: spacing.xxl },
  card: { marginBottom: spacing.lg },
  aviso: { alignItems: 'center', paddingVertical: spacing.xxl },
  avisoTexto: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  tentarDeNovo: { marginTop: spacing.lg },
  tentarDeNovoTexto: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.accentGreen,
    textDecorationLine: 'underline',
  },
  adicionar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingVertical: spacing.lg,
  },
  adicionarTexto: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.accentGreen,
  },
});
