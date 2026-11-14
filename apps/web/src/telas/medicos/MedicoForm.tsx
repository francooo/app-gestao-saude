import { useQueryClient } from '@tanstack/react-query';
import { healthApi } from '@gestao/shared/api/health';
import { buscarCep, formatarCep, montarEndereco, somenteDigitos } from '@gestao/shared/lib/cep';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';

import { CHAVES, useMedico } from '@/api/consultas';
import { mensagemDoErro } from '@/api/doses';
import { escolherFoto } from '@/lib/foto';
import { Avatar } from '@/ui/Avatar';
import botoes from '@/ui/botoes.module.css';
import { Carregando } from '@/ui/Carregando';
import { useDialogos } from '@/ui/Dialogo';
import { FormField } from '@/ui/FormField';
import { Icone } from '@/ui/Icone';
import { Pagina } from '@/ui/Pagina';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { StarRating } from '@/ui/StarRating';
import { SurfaceCard } from '@/ui/SurfaceCard';

import form from '../medicamento/MedicamentoForm.module.css';
import estilos from './medicos.module.css';

type Modalidade = 'presencial' | 'teleconsulta';

/** Botoes "Presencial" e "Teleconsulta", divididos com a tela de nova consulta. */
export function Modalidades({
  valor,
  onChange,
  disabled,
}: {
  valor: Modalidade;
  onChange: (m: Modalidade) => void;
  disabled?: boolean;
}) {
  return (
    <div className={estilos.modalidades} role="group" aria-label="Tipo de atendimento">
      {(['presencial', 'teleconsulta'] as const).map((m) => (
        <button
          key={m}
          type="button"
          className={estilos.modalidade}
          aria-pressed={valor === m}
          disabled={disabled}
          onClick={() => onChange(m)}
        >
          <Icone nome={m === 'teleconsulta' ? 'video' : 'map-pin'} size={16} />
          {m === 'teleconsulta' ? 'Teleconsulta' : 'Presencial'}
        </button>
      ))}
    </div>
  );
}

/** Cadastro e edicao de um medico (/medico/novo e /medico/:id). */
export function MedicoForm() {
  const { id } = useParams();
  // A chave refaz o formulario ao trocar de medico.
  return <Formulario key={id} id={id ?? 'novo'} />;
}

function Formulario({ id }: { id: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirmar, avisar } = useDialogos();
  const novo = id === 'novo';
  const existente = useMedico(novo ? undefined : id);

  const [salvando, setSalvando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [erroNome, setErroNome] = useState<string | undefined>();

  const [nome, setNome] = useState('');
  const [especialidade, setEspecialidade] = useState('');
  const [telefone, setTelefone] = useState('');
  const [clinica, setClinica] = useState('');
  const [modalidade, setModalidade] = useState<Modalidade>('presencial');
  const [nota, setNota] = useState<number | null>(null);
  const [observacoes, setObservacoes] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [processandoFoto, setProcessandoFoto] = useState(false);

  // O endereco e montado a partir destes campos na hora de salvar.
  const [cep, setCep] = useState('');
  const [logradouro, setLogradouro] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erroCep, setErroCep] = useState<string | undefined>();

  // Edicao: preenche UMA vez; uma nova busca nao passa por cima da digitacao.
  const m = existente.data;
  const [preenchido, setPreenchido] = useState(false);
  useEffect(() => {
    if (!m || preenchido) return;
    setPreenchido(true);
    setNome(m.name);
    setEspecialidade(m.specialty ?? '');
    setTelefone(m.phone ?? '');
    setClinica(m.clinicName ?? '');
    setModalidade(m.defaultModality ?? 'presencial');
    setNota(m.myRating);
    setObservacoes(m.notes ?? '');
    setFoto(m.photo ?? null);
    // O servidor guarda o endereco numa linha so: ela volta inteira no campo Rua.
    setLogradouro(m.address ?? '');
  }, [m, preenchido]);

  /** Abre o seletor de arquivo. Chamado direto do clique. */
  async function aplicarFoto() {
    setProcessandoFoto(true);
    const r = await escolherFoto({ camera: false });
    setProcessandoFoto(false);
    if (r.ok) setFoto(r.dataUri);
    else if (r.motivo === 'falha') void avisar('Não consegui usar essa imagem', 'Tente outra foto.');
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
    setErroCep(
      r.motivo === 'nao_encontrado'
        ? 'CEP não encontrado. Você pode preencher o endereço à mão.'
        : 'Não consegui consultar o CEP agora. Preencha o endereço à mão.',
    );
  }

  const depoisDeMudar = () => {
    void queryClient.invalidateQueries({ queryKey: ['medicos'] });
    navigate('/medicos', { replace: true });
  };

  async function remover() {
    const confirmou = await confirmar(
      'Remover médico',
      `Remover ${nome}? As consultas já registradas com ele deixam de mostrar o nome.`,
      'Remover',
    );
    if (!confirmou) return;
    try {
      await healthApi.deleteProfessional(id);
      // A ficha deixa de existir: sem isto, a invalidacao abaixo a buscaria de novo (404).
      queryClient.removeQueries({ queryKey: CHAVES.medico(id) });
      depoisDeMudar();
    } catch (e) {
      setErroGeral(mensagemDoErro(e));
    }
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
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
      else await healthApi.updateProfessional(id, dados);
      depoisDeMudar();
    } catch (e) {
      setErroGeral(mensagemDoErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Pagina area="family" largura="formulario">
      <ScreenHeader title={novo ? 'Novo médico' : 'Editar médico'} voltar="historico" />

      {!novo && existente.isPending ? (
        <Carregando />
      ) : !novo && !m ? (
        <p className={form.erroGeral} role="alert">
          {existente.isError ? mensagemDoErro(existente.error) : 'Médico não encontrado.'}
        </p>
      ) : (
        <form onSubmit={salvar} noValidate>
          <SurfaceCard className={form.bloco}>
            <div className={estilos.foto}>
              <button
                type="button"
                className={estilos.fotoBotao}
                disabled={salvando || processandoFoto}
                onClick={() => void aplicarFoto()}
                aria-label={
                  foto
                    ? `Alterar a foto${nome ? ` de ${nome}` : ' do médico'}`
                    : 'Adicionar foto do médico'
                }
              >
                <Avatar nome={nome || '?'} photo={foto} size={72} />
                <span className={estilos.fotoSelo}>
                  {processandoFoto ? (
                    <span className={botoes.girando} style={{ width: 12, height: 12 }} />
                  ) : (
                    <Icone nome="camera" size={14} />
                  )}
                </span>
              </button>
              {foto ? (
                <button
                  type="button"
                  className={botoes.perigo}
                  style={{ fontSize: 13 }}
                  disabled={salvando || processandoFoto}
                  onClick={() => setFoto(null)}
                >
                  Remover foto
                </button>
              ) : (
                <p className={estilos.fotoDica}>Clique para adicionar uma foto</p>
              )}
            </div>

            <FormField
              label="Nome"
              value={nome}
              onChangeText={setNome}
              placeholder="Dra. Ana Costa"
              error={erroNome}
              autoCapitalize="words"
              readOnly={salvando}
            />
            <FormField
              label="Especialidade"
              value={especialidade}
              onChangeText={setEspecialidade}
              placeholder="Pediatria"
              autoCapitalize="words"
              readOnly={salvando}
            />
            <FormField
              label="Telefone"
              type="tel"
              value={telefone}
              onChangeText={setTelefone}
              placeholder="(11) 90000-0000"
              autoComplete="off"
              readOnly={salvando}
            />
            <FormField
              label="Clínica ou consultório"
              value={clinica}
              onChangeText={setClinica}
              placeholder="Clínica Vida"
              autoCapitalize="words"
              readOnly={salvando}
              className={form.ultimo}
            />
          </SurfaceCard>

          <SurfaceCard className={form.bloco}>
            <h2 className={form.blocoTitulo}>Onde atende</h2>
            <p className={form.blocoAjuda} style={{ margin: '-8px 0 16px' }}>
              O endereço é o que coloca o médico no mapa e permite traçar a rota até lá.
            </p>

            <FormField
              label="CEP"
              value={cep}
              onChangeText={(v) => void consultarCep(v)}
              placeholder="01310-200"
              inputMode="numeric"
              maxLength={9}
              loading={buscandoCep}
              error={erroCep}
              hint="Preenche o endereço automaticamente"
              readOnly={salvando}
            />
            <FormField
              label="Rua"
              value={logradouro}
              onChangeText={setLogradouro}
              placeholder="Avenida Paulista"
              readOnly={salvando}
            />
            <div className={estilos.linha}>
              <FormField
                label="Número"
                value={numero}
                onChangeText={setNumero}
                placeholder="1578"
                inputMode="numeric"
                className={estilos.colunaPequena}
                readOnly={salvando}
              />
              <FormField
                label="Complemento"
                value={complemento}
                onChangeText={setComplemento}
                placeholder="Sala 12"
                className={estilos.colunaGrande}
                readOnly={salvando}
              />
            </div>
            <FormField
              label="Bairro"
              value={bairro}
              onChangeText={setBairro}
              placeholder="Bela Vista"
              readOnly={salvando}
            />
            <div className={estilos.linha}>
              <FormField
                label="Cidade"
                value={cidade}
                onChangeText={setCidade}
                placeholder="São Paulo"
                className={`${estilos.colunaGrande} ${form.ultimo}`}
                readOnly={salvando}
              />
              <FormField
                label="UF"
                value={uf}
                onChangeText={(v) => setUf(v.toUpperCase().slice(0, 2))}
                placeholder="SP"
                maxLength={2}
                className={`${estilos.colunaPequena} ${form.ultimo}`}
                readOnly={salvando}
              />
            </div>
          </SurfaceCard>

          <SurfaceCard className={form.bloco}>
            <h2 className={form.blocoTitulo}>Como costuma atender</h2>
            <Modalidades valor={modalidade} onChange={setModalidade} disabled={salvando} />

            <h2 className={form.blocoTitulo} style={{ marginBottom: 4 }}>
              Sua nota
            </h2>
            <p className={form.blocoAjuda}>
              Só você vê esta nota. Ela não é compartilhada com ninguém.
            </p>
            <div className={estilos.nota}>
              <StarRating value={nota} onChange={setNota} size={28} />
            </div>

            <FormField
              label="Observações"
              value={observacoes}
              onChangeText={setObservacoes}
              placeholder="Atende bem crianças, estacionamento no local…"
              multiline
              readOnly={salvando}
              className={form.ultimo}
            />
          </SurfaceCard>

          {erroGeral ? (
            <p className={form.erroGeral} role="alert">
              {erroGeral}
            </p>
          ) : null}

          <button
            type="submit"
            className={`${botoes.verde} ${botoes.largo} ${form.salvar}`}
            disabled={salvando}
            aria-busy={salvando || undefined}
          >
            {salvando ? <span className={botoes.girando} /> : null}
            {novo ? 'Cadastrar' : 'Salvar'}
          </button>

          {!novo ? (
            <button
              type="button"
              className={`${botoes.perigo} ${botoes.largo} ${estilos.remover}`}
              disabled={salvando}
              onClick={() => void remover()}
            >
              Remover médico
            </button>
          ) : null}
        </form>
      )}
    </Pagina>
  );
}
