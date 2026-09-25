import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthContext';
import { healthApi, type Professional, type Profile } from '@/api/health';
import { Avatar } from '@/components/Avatar';
import { IconTile } from '@/components/IconTile';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionHeader } from '@/components/SectionHeader';
import { SettingsGroup } from '@/components/SettingsGroup';
import { SettingsRow } from '@/components/SettingsRow';
import { SurfaceCard } from '@/components/SurfaceCard';
import { UpdateCard } from '@/components/UpdateCard';
import {
  definirLembretesDeDose,
  definirNotificacoes,
  lembretesDeDoseLigados,
  notificacoesLigadas,
} from '@/lib/prefs';
import { cancelarTodosOsLembretes, pedirPermissao } from '@/lib/reminders';
import { backgrounds, colors, fonts, radii, spacing } from '@/theme';

/** Altura da barra de abas flutuante, na convencao das outras abas. */
const ESPACO_BARRA = 96;

/**
 * Paleta das linhas.
 *
 * Mora aqui, e nao no IconTile, porque a rotacao verde-ambar-terracota do
 * mockup e cadencia visual, nao semantica: nao ha regra por tras dela, e
 * inventar um "LADRILHO_CRITICO" global seria fabricar significado.
 *
 * Nota: o ambar aqui e PREENCHIDO com traco creme, ao contrario do
 * LADRILHO_ATENCAO (claro com traco escuro). Nesta tela o ambar e cor de
 * categoria; o sinal de "tem coisa para fazer" continua reservado aos botoes.
 */
const VERDE = { fundo: colors.pillTablet, traco: colors.sectionTitle } as const;
const AMBAR = { fundo: colors.tileSun, traco: colors.surface } as const;
const TERRACOTA = { fundo: colors.terracotta, traco: colors.surface } as const;

export default function AjustesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();

  const [perfis, setPerfis] = useState<Profile[]>([]);
  const [medicos, setMedicos] = useState<Professional[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erroMedicos, setErroMedicos] = useState(false);
  const [saindo, setSaindo] = useState(false);

  const [notificacoes, setNotificacoes] = useState(true);
  const [lembretesDose, setLembretesDose] = useState(true);

  const titular = perfis.find((p) => p.isAccountHolder) ?? perfis[0] ?? null;

  const carregar = useCallback(async () => {
    try {
      const [listaPerfis, listaMedicos] = await Promise.all([
        healthApi.listProfiles(),
        healthApi.listProfessionals().catch(() => {
          setErroMedicos(true);
          return [] as Professional[];
        }),
      ]);
      setPerfis(listaPerfis);
      setMedicos(listaMedicos);
    } catch {
      // Falha de carga NAO limpa o que ja estava na tela: mostrar a conta
      // vazia por causa de um tropeco de rede assusta mais do que informa.
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void carregar();
      void notificacoesLigadas().then(setNotificacoes);
      void lembretesDeDoseLigados().then(setLembretesDose);
    }, [carregar]),
  );

  /**
   * A chave geral.
   *
   * Ligando, pede a permissao do sistema ANTES de gravar: deixar o interruptor
   * ligado prometendo avisos que o Android nao vai entregar e pior que nao
   * ter o interruptor.
   */
  async function alternarNotificacoes(valor: boolean) {
    if (valor && !(await pedirPermissao())) {
      setNotificacoes(false);
      Alert.alert(
        'Sem permissão para avisar',
        'Libere as notificações deste aplicativo nos ajustes do aparelho.',
        [
          { text: 'Fechar', style: 'cancel' },
          { text: 'Abrir ajustes', onPress: () => void Linking.openSettings() },
        ],
      );
      return;
    }

    setNotificacoes(valor);
    await definirNotificacoes(valor);
    // Cancela tudo na hora. A reconciliacao das telas volta a agendar quando a
    // chave estiver ligada de novo.
    if (!valor) await cancelarTodosOsLembretes();
  }

  async function alternarLembretesDose(valor: boolean) {
    setLembretesDose(valor);
    await definirLembretesDeDose(valor);
    if (!valor) await cancelarTodosOsLembretes();
  }

  function sair() {
    /**
     * Confirmar algo que nao destroi nada tem motivo: num aplicativo de
     * familia o celular circula, e sair sem querer bloqueia o acesso aos
     * horarios de remedio de outra pessoa ate alguem lembrar a senha. O custo
     * do aviso e um toque; o do engano e uma dose perdida.
     */
    Alert.alert('Sair da conta?', 'Você vai precisar entrar de novo com seu e-mail e senha.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          setSaindo(true);
          await signOut();
        },
      },
    ]);
  }

  return (
    <View style={styles.tela}>
      <ScreenBackground colors={backgrounds.settings} />

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
        {/* Sem sino: o mockup nao o desenha nesta tela. */}
        <ScreenHeader title="Ajustes" onBack={() => router.replace('/inicio')} />

        <CartaoDoTitular
          titular={titular}
          carregando={carregando}
          onEditar={() =>
            titular ? router.push(`/membro/${titular.id}?origem=ajustes`) : undefined
          }
        />

        <View style={styles.secao}>
          <SectionHeader title="Minha conta" />
          <SettingsGroup>
            <SettingsRow
              marcador={<IconTile icone="user" {...VERDE} />}
              rotulo="Dados pessoais"
              valor="Nome, nascimento, peso e altura"
              onPress={() =>
                titular ? router.push(`/membro/${titular.id}?origem=ajustes`) : undefined
              }
              desabilitado={!titular}
            />
            <SettingsRow
              marcador={<IconTile icone="mail" {...AMBAR} />}
              rotulo="E-mail e senha"
              valor={user?.email}
              reservarValor
              onPress={() => router.push('/conta/acesso')}
            />
            <SettingsRow
              marcador={<IconTile icone="users" {...TERRACOTA} />}
              rotulo="Membros da família"
              valor={textoDeMembros(perfis, carregando)}
              reservarValor
              onPress={() => router.push('/conta/familia')}
            />
          </SettingsGroup>
        </View>

        <View style={styles.secao}>
          <SectionHeader title="Profissionais vinculados" />
          <Profissionais
            medicos={medicos}
            carregando={carregando}
            erro={erroMedicos}
            onAbrir={(id) => router.push(`/medico/${id}`)}
            onCadastrar={() => router.push('/medico/novo')}
            onGerenciar={() => router.navigate('/medicos')}
          />
        </View>

        <View style={styles.secao}>
          <SectionHeader title="Preferências" />
          <SettingsGroup>
            <SettingsRow
              marcador={<IconTile icone="bell" {...VERDE} />}
              rotulo="Notificações"
              valor="Avisos de dose e de consulta neste aparelho"
              acessorio="interruptor"
              ligado={notificacoes}
              onChange={(v) => void alternarNotificacoes(v)}
            />
            <SettingsRow
              marcador={<IconTile icone="aperture" {...AMBAR} />}
              rotulo="Lembretes de medicamentos"
              valor="Avisar nos horários das doses"
              acessorio="interruptor"
              ligado={notificacoes && lembretesDose}
              onChange={(v) => void alternarLembretesDose(v)}
              desabilitado={!notificacoes}
              motivoDesabilitado="Ative as notificações para usar"
            />
            <SettingsRow
              marcador={<IconTile icone="shield" {...TERRACOTA} />}
              rotulo="Privacidade e segurança"
              valor="Política, consentimento e exclusão da conta"
              onPress={() => router.push('/conta/privacidade')}
            />
          </SettingsGroup>
        </View>

        {/*
          O cartao de versao nao esta no mockup e fica: a pergunta "a
          atualizacao chegou?" e sobre o aplicativo inteiro e nao cabe em
          nenhuma das tres secoes.
        */}
        <UpdateCard />

        {/*
          Sair e contornado verde, largura total, por ULTIMO.

          Nao vira linha com seta: as cinco setas desta tela tem destino real,
          e quebrar isso numa envenena a leitura das outras quatro. Nao e
          ambar, que significa pendencia. Nao e texto puro, que sumiria numa
          tela com sete linhas.

          O espaco de spacing.xxl acima nao pode encolher: o UpdateCard ja tem
          um botao contornado verde dentro, e e a distancia mais a borda do
          cartao que impede os dois de lerem como um par de opcoes irmas.
        */}
        <Pressable
          onPress={sair}
          disabled={saindo}
          accessibilityRole="button"
          accessibilityLabel="Sair da conta"
          accessibilityHint="Encerra a sessão neste aparelho"
          style={({ pressed }) => [styles.sair, pressed && styles.pressionado]}
        >
          {saindo ? (
            <ActivityIndicator size="small" color={colors.accentGreen} />
          ) : (
            <>
              <Feather name="log-out" size={18} color={colors.accentGreen} />
              <Text style={styles.sairTexto}>Sair</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

function CartaoDoTitular({
  titular,
  carregando,
  onEditar,
}: {
  titular: Profile | null;
  carregando: boolean;
  onEditar: () => void;
}) {
  if (carregando && !titular) {
    return (
      <SurfaceCard style={styles.titular}>
        <View style={styles.esqueletoAvatar} />
        <View style={styles.titularTextos}>
          <View style={[styles.esqueletoBarra, { width: 150 }]} />
          <View style={[styles.esqueletoBarra, { width: 90, height: 12, marginTop: 8 }]} />
        </View>
      </SurfaceCard>
    );
  }

  /**
   * O cartao le do PERFIL titular, nunca do useAuth().
   *
   * A foto so existe em `profiles`. Ler o nome de `users` e a foto daqui
   * produziria a foto de uma pessoa ao lado do nome de outra no dia em que os
   * dois divergissem — e ate agora nada os sincronizava.
   */
  const nome = titular?.fullName ?? 'Minha conta';

  return (
    <SurfaceCard style={styles.titular}>
      <View style={styles.titularGrupo} accessible accessibilityLabel={`${nome}, conta principal`}>
        <Avatar
          nome={nome}
          photo={titular?.photo}
          color={titular?.avatarColor ?? undefined}
          recyclingKey={titular?.id}
          size={64}
        />
        <View style={styles.titularTextos}>
          <Text style={styles.titularNome} numberOfLines={2}>
            {nome}
          </Text>
          <Text style={styles.titularPapel}>
            {titular ? 'Conta principal' : 'Não consegui carregar seus dados'}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={onEditar}
        disabled={!titular}
        accessibilityRole="button"
        accessibilityLabel="Editar meus dados pessoais"
        style={({ pressed }) => [
          styles.editar,
          !titular && styles.apagado,
          pressed && styles.pressionado,
        ]}
      >
        <Feather name="edit-2" size={20} color={colors.accentGreen} />
      </Pressable>
    </SurfaceCard>
  );
}

function Profissionais({
  medicos,
  carregando,
  erro,
  onAbrir,
  onCadastrar,
  onGerenciar,
}: {
  medicos: Professional[];
  carregando: boolean;
  erro: boolean;
  onAbrir: (id: string) => void;
  onCadastrar: () => void;
  onGerenciar: () => void;
}) {
  if (carregando && medicos.length === 0 && !erro) {
    return (
      <View style={styles.medicos}>
        {[0, 1].map((i) => (
          <SurfaceCard key={i} style={styles.medicoCartao}>
            <View style={styles.esqueletoAvatarMedio} />
            <View style={[styles.esqueletoBarra, { width: 90, marginTop: spacing.sm }]} />
          </SurfaceCard>
        ))}
      </View>
    );
  }

  /**
   * Vazio ocupa espaco AQUI porque ele mesmo oferece a acao que o preenche.
   *
   * E a mesma regra que faz a secao "Instrucoes" sumir na tela do medicamento
   * quando nao ha o que mostrar: la nao havia acao, aqui ha.
   */
  if (medicos.length === 0 && !erro) {
    return (
      <SurfaceCard style={styles.vazio}>
        <IconTile icone="user-plus" size={54} {...VERDE} />
        <Text style={styles.vazioTitulo}>Nenhum médico cadastrado</Text>
        <Text style={styles.vazioAjuda}>
          Cadastre quem acompanha a família para agendar consultas e vincular receitas.
        </Text>
        <Pressable
          onPress={onCadastrar}
          accessibilityRole="button"
          style={({ pressed }) => [styles.botaoVerde, pressed && styles.pressionado]}
        >
          <Feather name="plus" size={18} color={colors.onAccent} />
          <Text style={styles.botaoVerdeTexto}>Cadastrar médico</Text>
        </Pressable>
      </SurfaceCard>
    );
  }

  return (
    <>
      {medicos.length > 0 ? (
        <View style={styles.medicos}>
          {medicos.slice(0, 2).map((m) => (
            <Pressable
              key={m.id}
              onPress={() => onAbrir(m.id)}
              accessible
              accessibilityRole="button"
              accessibilityLabel={`${m.name}, ${m.specialty ?? 'sem especialidade'}`}
              style={({ pressed }) => [styles.medicoEnvolucro, pressed && styles.pressionado]}
            >
              <SurfaceCard style={styles.medicoCartao}>
                <Avatar nome={m.name} photo={m.photo} recyclingKey={m.id} size={52} />
                <Text style={styles.medicoNome} numberOfLines={2}>
                  {m.name}
                </Text>
                {m.specialty ? (
                  <Text style={styles.medicoEspecialidade} numberOfLines={1}>
                    {m.specialty}
                  </Text>
                ) : null}
              </SurfaceCard>
            </Pressable>
          ))}
          {/* Um medico sozinho ocupa a linha inteira: meio cartao vazio ao lado
              leria como esqueleto de carga. */}
          {medicos.length === 1 ? <View style={styles.medicoEnvolucro} /> : null}
        </View>
      ) : null}

      {erro && medicos.length === 0 ? (
        <SurfaceCard style={styles.vazio}>
          <Feather name="alert-circle" size={22} color={colors.textError} />
          <Text style={styles.vazioAjuda}>Não consegui carregar os médicos agora.</Text>
        </SurfaceCard>
      ) : null}

      {/* A linha permanece mesmo com a lista falhando: gerenciar nao depende
          de listar. */}
      <SettingsGroup style={{ marginTop: spacing.md }}>
        <SettingsRow
          marcador={<IconTile icone="user-plus" {...VERDE} />}
          rotulo="Gerenciar médicos"
          valor={medicos.length > 0 ? `${medicos.length} cadastrados` : undefined}
          reservarValor
          onPress={onGerenciar}
        />
      </SettingsGroup>
    </>
  );
}

function textoDeMembros(perfis: Profile[], carregando: boolean): string | undefined {
  if (carregando && perfis.length === 0) return undefined;
  if (perfis.length === 0) return undefined;
  return perfis.length === 1 ? 'Só você' : `${perfis.length} pessoas`;
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: backgrounds.settings[0] },
  conteudo: { paddingHorizontal: spacing.xl },
  secao: { marginTop: spacing.xxl },

  titular: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  titularGrupo: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  titularTextos: { flex: 1, marginLeft: spacing.lg },
  titularNome: { fontFamily: fonts.bold, fontSize: 20, color: colors.sectionTitle },
  titularPapel: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  editar: {
    width: 48,
    height: 48,
    borderRadius: radii.card - 14,
    backgroundColor: colors.tabActive,
    alignItems: 'center',
    justifyContent: 'center',
  },

  medicos: { flexDirection: 'row', gap: spacing.md },
  medicoEnvolucro: { flex: 1 },
  medicoCartao: { flex: 1, padding: spacing.lg, alignItems: 'center' },
  medicoNome: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.sectionTitle,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  medicoEspecialidade: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.accentGreenSoft,
    textAlign: 'center',
    marginTop: 1,
  },

  vazio: { padding: spacing.xl, alignItems: 'center' },
  vazioTitulo: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.sectionTitle,
    marginTop: spacing.md,
  },
  vazioAjuda: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  botaoVerde: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    alignSelf: 'stretch',
    backgroundColor: colors.accentGreen,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    marginTop: spacing.lg,
  },
  botaoVerdeTexto: { fontFamily: fonts.bold, fontSize: 16, color: colors.onAccent },

  sair: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.accentGreen,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    minHeight: 56,
    marginTop: spacing.xxl,
  },
  sairTexto: { fontFamily: fonts.bold, fontSize: 16, color: colors.accentGreen },

  pressionado: { opacity: 0.85 },
  apagado: { opacity: 0.5 },
  esqueletoAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.starEmpty,
    opacity: 0.5,
  },
  esqueletoAvatarMedio: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.starEmpty,
    opacity: 0.5,
  },
  esqueletoBarra: {
    height: 18,
    borderRadius: 6,
    backgroundColor: colors.starEmpty,
    opacity: 0.5,
  },
});
