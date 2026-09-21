import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { messageForError } from '@gestao/shared';

import { ApiRequestError } from '@/api/client';
import { healthApi, type Professional } from '@/api/health';
import { Avatar } from '@/components/Avatar';
import { FormField } from '@/components/FormField';
import { ScreenHeader } from '@/components/ScreenHeader';
import { StarRating } from '@/components/StarRating';
import { SurfaceCard } from '@/components/SurfaceCard';
import { buscarCep, formatarCep, montarEndereco, somenteDigitos } from '@/lib/cep';
import { escolherFoto } from '@/lib/foto';
import { colors, fonts, radii, spacing } from '@/theme';

export default function MedicoFormScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const novo = id === 'novo';

  const [carregando, setCarregando] = useState(!novo);
  const [salvando, setSalvando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  const [nome, setNome] = useState('');
  const [especialidade, setEspecialidade] = useState('');
  const [telefone, setTelefone] = useState('');
  const [clinica, setClinica] = useState('');
  const [modalidade, setModalidade] = useState<'presencial' | 'teleconsulta'>('presencial');
  const [nota, setNota] = useState<number | null>(null);
  const [observacoes, setObservacoes] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [processandoFoto, setProcessandoFoto] = useState(false);

  // Endereco em partes, para o CEP preencher o que der.
  const [cep, setCep] = useState('');
  const [logradouro, setLogradouro] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erroCep, setErroCep] = useState<string | undefined>();
  const [erroNome, setErroNome] = useState<string | undefined>();

  useEffect(() => {
    if (novo) return;
    let cancelado = false;
    (async () => {
      try {
        const m = await healthApi.getProfessional(id!);
        if (cancelado) return;
        preencher(m);
      } catch (e) {
        if (!cancelado) {
          setErroGeral(messageForError(e instanceof ApiRequestError ? e.code : undefined));
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [id, novo]);

  function preencher(m: Professional) {
    setNome(m.name);
    setEspecialidade(m.specialty ?? '');
    setTelefone(m.phone ?? '');
    setClinica(m.clinicName ?? '');
    setModalidade(m.defaultModality ?? 'presencial');
    setNota(m.myRating);
    setObservacoes(m.notes ?? '');
    // Sem esta linha, o estado comecaria nulo e QUALQUER salvamento apagaria
    // a foto existente — editar o telefone perderia a foto.
    setFoto(m.photo ?? null);
    // O endereco foi salvo como linha unica; mostramos nela mesma para edicao.
    setLogradouro(m.address ?? '');
  }

  function abrirEscolhaDeFoto() {
    const opcoes: { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }[] = [
      { text: 'Tirar foto', onPress: () => aplicarFoto('camera') },
      { text: 'Escolher da galeria', onPress: () => aplicarFoto('galeria') },
    ];

    if (foto) {
      opcoes.push({ text: 'Remover foto', style: 'destructive', onPress: () => setFoto(null) });
    }
    opcoes.push({ text: 'Cancelar', style: 'cancel' });

    Alert.alert('Foto do médico', undefined, opcoes);
  }

  async function aplicarFoto(origem: 'camera' | 'galeria') {
    setProcessandoFoto(true);
    const r = await escolherFoto(origem);
    setProcessandoFoto(false);

    if (r.ok) {
      setFoto(r.dataUri);
      return;
    }

    // Desistir nao e erro: nao mexe na foto atual e nao avisa nada.
    if (r.motivo === 'cancelado') return;

    Alert.alert(
      r.motivo === 'permissao' ? 'Sem acesso à câmera' : 'Não consegui usar essa imagem',
      r.motivo === 'permissao'
        ? 'Libere a câmera para este aplicativo nos ajustes do aparelho, ou escolha uma foto da galeria.'
        : 'Tente outra foto.',
    );
  }

  async function consultarCep(valor: string) {
    setCep(formatarCep(valor));
    setErroCep(undefined);

    if (somenteDigitos(valor).length !== 8) return;

    setBuscandoCep(true);
    const r = await buscarCep(valor);
    setBuscandoCep(false);

    if (r.ok) {
      setLogradouro(r.endereco.logradouro);
      setBairro(r.endereco.bairro);
      setCidade(r.endereco.cidade);
      setUf(r.endereco.uf);
      return;
    }

    // O ViaCEP e gratuito e sem garantia; o formulario segue utilizavel.
    setErroCep(
      r.motivo === 'nao_encontrado'
        ? 'CEP não encontrado. Você pode preencher o endereço à mão.'
        : 'Não consegui consultar o CEP agora. Preencha o endereço à mão.',
    );
  }

  function confirmarRemocao() {
    // Confirmacao explicita: remover um medico apaga junto o vinculo com as
    // consultas ja registradas, e nao ha como desfazer.
    Alert.alert(
      'Remover médico',
      `Remover ${nome}? As consultas já registradas com ele deixam de mostrar o nome.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              await healthApi.deleteProfessional(id!);
              router.back();
            } catch (e) {
              setErroGeral(messageForError(e instanceof ApiRequestError ? e.code : undefined));
            }
          },
        },
      ],
    );
  }

  async function salvar() {
    if (salvando) return;
    setErroGeral(null);

    if (nome.trim().length < 2) {
      setErroNome('Informe o nome do profissional');
      return;
    }
    setErroNome(undefined);

    const endereco = montarEndereco({
      logradouro,
      numero,
      complemento,
      bairro,
      cidade,
      uf,
      cep: cep || undefined,
    });

    const dados = {
      name: nome.trim(),
      specialty: especialidade.trim() || null,
      phone: telefone.trim() || null,
      clinicName: clinica.trim() || null,
      address: endereco || null,
      defaultModality: modalidade,
      myRating: nota,
      notes: observacoes.trim() || null,
      photo: foto,
    };

    setSalvando(true);
    try {
      if (novo) await healthApi.createProfessional(dados);
      else await healthApi.updateProfessional(id!, dados);
      router.back();
    } catch (e) {
      setErroGeral(messageForError(e instanceof ApiRequestError ? e.code : undefined));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <View style={styles.tela}>
      <LinearGradient
        colors={[colors.homeBackgroundTop, colors.homeBackgroundBottom]}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.conteudo,
            { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxl * 2 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ScreenHeader
            title={novo ? 'Novo médico' : 'Editar médico'}
            onBack={() => router.back()}
          />

          {carregando ? (
            <ActivityIndicator color={colors.accentGreen} style={styles.carregando} />
          ) : (
            <>
              <SurfaceCard style={styles.bloco}>
                <View style={styles.foto}>
                  <Pressable
                    onPress={abrirEscolhaDeFoto}
                    disabled={salvando || processandoFoto}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={
                      foto ? `Alterar a foto de ${nome || 'do médico'}` : 'Adicionar foto do médico'
                    }
                    accessibilityHint="Abre a câmera ou a galeria"
                  >
                    <Avatar nome={nome || '?'} photo={foto} size={72} />

                    <View style={styles.selo}>
                      {processandoFoto ? (
                        <ActivityIndicator size="small" color={colors.onAccent} />
                      ) : (
                        <Feather name="camera" size={14} color={colors.onAccent} />
                      )}
                    </View>
                  </Pressable>

                  <Text style={styles.fotoDica}>
                    {foto ? 'Toque para trocar ou remover' : 'Toque para adicionar uma foto'}
                  </Text>
                </View>

                <FormField
                  label="Nome"
                  value={nome}
                  onChangeText={setNome}
                  placeholder="Dra. Ana Costa"
                  error={erroNome}
                  autoCapitalize="words"
                  editable={!salvando}
                />
                <FormField
                  label="Especialidade"
                  value={especialidade}
                  onChangeText={setEspecialidade}
                  placeholder="Pediatria"
                  autoCapitalize="words"
                  editable={!salvando}
                />
                <FormField
                  label="Telefone"
                  value={telefone}
                  onChangeText={setTelefone}
                  placeholder="(11) 90000-0000"
                  keyboardType="phone-pad"
                  editable={!salvando}
                />
                <FormField
                  label="Clínica ou consultório"
                  value={clinica}
                  onChangeText={setClinica}
                  placeholder="Clínica Vida"
                  autoCapitalize="words"
                  editable={!salvando}
                  containerStyle={styles.ultimoCampo}
                />
              </SurfaceCard>

              <SurfaceCard style={styles.bloco}>
                <Text style={styles.blocoTitulo}>Onde atende</Text>
                <Text style={styles.blocoAjuda}>
                  O endereço é o que coloca o médico no mapa e permite traçar a rota até lá.
                </Text>

                <FormField
                  label="CEP"
                  value={cep}
                  onChangeText={consultarCep}
                  placeholder="01310-200"
                  keyboardType="number-pad"
                  maxLength={9}
                  loading={buscandoCep}
                  error={erroCep}
                  hint="Preenche o endereço automaticamente"
                  editable={!salvando}
                />
                <FormField
                  label="Rua"
                  value={logradouro}
                  onChangeText={setLogradouro}
                  placeholder="Avenida Paulista"
                  editable={!salvando}
                />
                <View style={styles.linha}>
                  <FormField
                    label="Número"
                    value={numero}
                    onChangeText={setNumero}
                    placeholder="1578"
                    keyboardType="number-pad"
                    containerStyle={styles.colunaPequena}
                    editable={!salvando}
                  />
                  <FormField
                    label="Complemento"
                    value={complemento}
                    onChangeText={setComplemento}
                    placeholder="Sala 12"
                    containerStyle={styles.colunaGrande}
                    editable={!salvando}
                  />
                </View>
                <FormField
                  label="Bairro"
                  value={bairro}
                  onChangeText={setBairro}
                  placeholder="Bela Vista"
                  editable={!salvando}
                />
                <View style={styles.linha}>
                  <FormField
                    label="Cidade"
                    value={cidade}
                    onChangeText={setCidade}
                    placeholder="São Paulo"
                    containerStyle={styles.colunaGrande}
                    editable={!salvando}
                  />
                  <FormField
                    label="UF"
                    value={uf}
                    onChangeText={(v) => setUf(v.toUpperCase().slice(0, 2))}
                    placeholder="SP"
                    autoCapitalize="characters"
                    maxLength={2}
                    containerStyle={styles.colunaPequena}
                    editable={!salvando}
                  />
                </View>
              </SurfaceCard>

              <SurfaceCard style={styles.bloco}>
                <Text style={styles.blocoTitulo}>Como costuma atender</Text>
                <View style={styles.modalidades}>
                  {(['presencial', 'teleconsulta'] as const).map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => setModalidade(m)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: modalidade === m }}
                      style={[styles.modalidade, modalidade === m && styles.modalidadeAtiva]}
                    >
                      <Feather
                        name={m === 'teleconsulta' ? 'video' : 'map-pin'}
                        size={16}
                        color={modalidade === m ? colors.onAccent : colors.sectionTitle}
                      />
                      <Text
                        style={[
                          styles.modalidadeTexto,
                          modalidade === m && styles.modalidadeTextoAtivo,
                        ]}
                      >
                        {m === 'teleconsulta' ? 'Teleconsulta' : 'Presencial'}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={[styles.blocoTitulo, styles.notaTitulo]}>Sua nota</Text>
                <Text style={styles.blocoAjuda}>
                  Só você vê esta nota. Ela não é compartilhada com ninguém.
                </Text>
                <View style={styles.nota}>
                  <StarRating value={nota} onChange={setNota} size={28} />
                </View>

                <FormField
                  label="Observações"
                  value={observacoes}
                  onChangeText={setObservacoes}
                  placeholder="Atende bem crianças, estacionamento no local…"
                  multiline
                  editable={!salvando}
                  containerStyle={styles.ultimoCampo}
                />
              </SurfaceCard>

              {erroGeral ? <Text style={styles.erroGeral}>{erroGeral}</Text> : null}

              <Pressable
                onPress={salvar}
                disabled={salvando}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.salvar,
                  (pressed || salvando) && styles.salvarPressionado,
                ]}
              >
                {salvando ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <Text style={styles.salvarTexto}>{novo ? 'Cadastrar' : 'Salvar'}</Text>
                )}
              </Pressable>

              {!novo ? (
                <Pressable onPress={confirmarRemocao} style={styles.remover}>
                  <Text style={styles.removerTexto}>Remover médico</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.homeBackgroundTop },
  flex: { flex: 1 },
  conteudo: { paddingHorizontal: spacing.xl },
  carregando: { marginTop: spacing.xxl * 2 },
  bloco: { marginTop: spacing.xl },
  foto: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  selo: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accentGreen,
    alignItems: 'center',
    justifyContent: 'center',
    // O anel na cor do card separa o selo do avatar escuro por baixo.
    borderWidth: 2,
    borderColor: colors.surface,
  },
  fotoDica: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  blocoTitulo: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.sectionTitle,
  },
  blocoAjuda: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  ultimoCampo: { marginBottom: 0 },
  linha: { flexDirection: 'row', gap: spacing.md },
  colunaPequena: { flex: 1 },
  colunaGrande: { flex: 2 },
  modalidades: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  modalidade: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.onAccent,
    borderWidth: 1,
    borderColor: 'rgba(57, 67, 44, 0.12)',
  },
  modalidadeAtiva: {
    backgroundColor: colors.accentGreen,
    borderColor: colors.accentGreen,
  },
  modalidadeTexto: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.sectionTitle,
  },
  modalidadeTextoAtivo: { color: colors.onAccent },
  notaTitulo: { marginTop: spacing.xl },
  nota: { marginBottom: spacing.xl },
  erroGeral: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.textError,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  salvar: {
    backgroundColor: colors.accentGreen,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  salvarPressionado: { opacity: 0.85 },
  salvarTexto: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.onAccent,
  },
  remover: { alignItems: 'center', paddingVertical: spacing.xl },
  removerTexto: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.textError,
  },
});
