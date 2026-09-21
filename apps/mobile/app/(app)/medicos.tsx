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
import {
  healthApi,
  type Profile,
  type Professional,
  type ReferenceLocation,
} from '@/api/health';
import { DoctorCard } from '@/components/DoctorCard';
import { DoctorsMap } from '@/components/DoctorsMap';
import { FilterChips, type Chip } from '@/components/FilterChips';
import { LocationBar } from '@/components/LocationBar';
import { ProfileSelector } from '@/components/ProfileSelector';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionHeader } from '@/components/SectionHeader';
import { SurfaceCard } from '@/components/SurfaceCard';
import { distanciaKm, ordenarPorDistancia } from '@/lib/geo';
import { abrirRotaPara } from '@/lib/maps';
import { colors, fonts, spacing } from '@/theme';

/** Altura da barra de abas flutuante. */
const ESPACO_BARRA = 96;

export default function MedicosScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [perfis, setPerfis] = useState<Profile[]>([]);
  const [medicos, setMedicos] = useState<Professional[]>([]);
  const [referencia, setReferencia] = useState<ReferenceLocation | null>(null);
  const [perfilId, setPerfilId] = useState<string | null>(null);
  const [especialidade, setEspecialidade] = useState<string | null>(null);

  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [salvandoLocal, setSalvandoLocal] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [posicaoGps, setPosicaoGps] = useState<{ latitude: number; longitude: number } | null>(
    null,
  );

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [listaPerfis, listaMedicos, local] = await Promise.all([
        healthApi.listProfiles(),
        healthApi.listProfessionals({ profileId: perfilId }),
        healthApi.getLocation(),
      ]);
      setPerfis(listaPerfis);
      setMedicos(listaMedicos);
      setReferencia(local);
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
   * Localizacao e opcional de verdade: negada a permissao, a tela funciona
   * igual — sem distancia e com a lista em ordem alfabetica.
   */
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelado) return;
        const pos =
          (await Location.getLastKnownPositionAsync()) ??
          (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        if (!cancelado && pos) {
          setPosicaoGps({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        }
      } catch {
        // Sem localizacao seguimos sem distancia.
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  /**
   * De onde as distancias sao medidas: a referencia fixada tem prioridade
   * sobre o GPS. Quem escolheu "minha casa" quer distancia de casa mesmo
   * estando na rua.
   */
  const pontoDeReferencia = useMemo(() => {
    if (referencia?.latitude != null && referencia.longitude != null) {
      return { latitude: referencia.latitude, longitude: referencia.longitude };
    }
    return posicaoGps;
  }, [referencia, posicaoGps]);

  // As especialidades saem dos medicos que voce tem — nao ha lista fixa.
  const chips = useMemo<Chip[]>(() => {
    const unicas = [...new Set(medicos.map((m) => m.specialty).filter(Boolean))] as string[];
    unicas.sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return [{ value: null, label: 'Todas' }, ...unicas.map((e) => ({ value: e, label: e }))];
  }, [medicos]);

  /**
   * Ordena uma vez por carregamento, e nao continuamente: uma lista que se
   * reordena enquanto a pessoa anda seria desorientadora.
   */
  const visiveis = useMemo(() => {
    const filtrados = especialidade
      ? medicos.filter((m) => m.specialty === especialidade)
      : medicos;
    return ordenarPorDistancia(filtrados, pontoDeReferencia);
  }, [medicos, especialidade, pontoDeReferencia]);

  function distanciaAte(m: Professional): number | null {
    if (!pontoDeReferencia || m.latitude == null || m.longitude == null) return null;
    return distanciaKm(
      pontoDeReferencia.latitude,
      pontoDeReferencia.longitude,
      m.latitude,
      m.longitude,
    );
  }

  async function definirEndereco(address: string) {
    setSalvandoLocal(true);
    try {
      setReferencia(await healthApi.setLocationByAddress(address));
    } finally {
      setSalvandoLocal(false);
    }
  }

  async function usarPosicaoAtual() {
    setSalvandoLocal(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Localização desativada',
          'Autorize o acesso à localização nas configurações do aparelho, ou fixe um endereço.',
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setPosicaoGps({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      setReferencia(
        await healthApi.setLocationByCoords(pos.coords.latitude, pos.coords.longitude),
      );
    } catch {
      Alert.alert('Não consegui obter sua localização', 'Tente novamente ou fixe um endereço.');
    } finally {
      setSalvandoLocal(false);
    }
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

        <View style={styles.localizacao}>
          <LocationBar
            location={referencia}
            onSetAddress={definirEndereco}
            onUseCurrent={usarPosicaoAtual}
            saving={salvandoLocal}
          />
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
              {/* O titulo so promete proximidade quando ha de onde medir. */}
              <SectionHeader
                title={pontoDeReferencia ? 'Médicos próximos' : 'Meus médicos'}
                onVerTodos={() => router.push('/mapa')}
                verTodosLabel="Mapa"
                verTodosIcon="map"
              />
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

        <View style={styles.acoes}>
          <Pressable
            onPress={() => router.push('/medico/novo')}
            accessibilityRole="button"
            style={styles.adicionar}
          >
            <Feather name="plus" size={20} color={colors.accentGreen} />
            <Text style={styles.adicionarTexto}>Cadastrar médico</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push('/consulta/nova')}
            accessibilityRole="button"
            style={styles.adicionar}
          >
            <Feather name="calendar" size={20} color={colors.accentGreen} />
            <Text style={styles.adicionarTexto}>Nova consulta</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.homeBackgroundTop },
  conteudo: { paddingHorizontal: spacing.xl },
  seletor: { marginTop: spacing.xl },
  localizacao: { marginTop: spacing.md },
  chips: { marginTop: spacing.lg },
  carregando: { marginTop: spacing.xxl * 2 },
  secao: { marginTop: spacing.xxl },
  card: { marginBottom: spacing.md },
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
  acoes: { marginTop: spacing.lg },
  adicionar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  adicionarTexto: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.accentGreen,
  },
});
