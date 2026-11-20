import { useQueryClient } from '@tanstack/react-query';
import { pickAvatarColor } from '@gestao/shared';
import { ApiRequestError } from '@gestao/shared/api/client';
import { healthApi, relationshipValues } from '@gestao/shared/api/health';
import {
  alturaParaCm,
  dataParaISO,
  formatarData,
  idadeDescrita,
  numeroDigitado,
  somenteDigitos,
} from '@gestao/shared/lib/pessoa';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { CHAVES } from '@/api/consultas';
import { mensagemDoErro } from '@/api/doses';
import { escolherFoto } from '@/lib/foto';
import { usePessoaAtiva } from '@/lib/pessoaAtiva';

import { Avatar } from './Avatar';
import botoes from './botoes.module.css';
import { FormField, SelectField } from './FormField';
import { Icone } from './Icone';
import estilos from './ModalNovoMembro.module.css';
import { PrimaryButton } from './PrimaryButton';

const PARENTESCOS = relationshipValues.map((v) => ({
  valor: v as string,
  rotulo: v.charAt(0).toUpperCase() + v.slice(1),
}));

/**
 * "Adicionar membro" direto do cabecalho: o cadastro num modal, sem sair da
 * tela em que a pessoa esta.
 *
 * As MESMAS regras da tela /membro/novo (telas/conta/Membro.tsx): nome
 * obrigatorio, nascimento, peso e altura conferidos, a cor do avatar
 * resolvida pelo nome. Depois de salvar, o novo membro ja fica escolhido no
 * seletor — quem acabou de cadastrar quer ver a pessoa.
 *
 * Usa o <dialog> nativo com showModal(): o navegador prende o foco dentro, e
 * Esc fecha. Clique fora NAO fecha, para nao perder o que foi digitado.
 */
export function ModalNovoMembro({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();
  const { setPessoa } = usePessoaAtiva();

  const [nome, setNome] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [parentesco, setParentesco] = useState<string | null>(null);
  const [peso, setPeso] = useState('');
  const [altura, setAltura] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [processandoFoto, setProcessandoFoto] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Abrir e fechar acompanham a prop; ao abrir, o formulario comeca limpo.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) {
      setNome('');
      setNascimento('');
      setParentesco(null);
      setPeso('');
      setAltura('');
      setObservacoes('');
      setFoto(null);
      setErros({});
      setErroGeral(null);
      d.showModal();
    } else if (!aberto && d.open) {
      d.close();
    }
  }, [aberto]);

  async function aplicarFoto() {
    setProcessandoFoto(true);
    const r = await escolherFoto({ camera: false });
    setProcessandoFoto(false);
    if (r.ok) setFoto(r.dataUri);
    else if (r.motivo === 'falha') setErroGeral('Não consegui usar essa imagem. Tente outra foto.');
  }

  function validar(): boolean {
    const novos: Record<string, string> = {};
    if (nome.trim().length < 2) novos.fullName = 'Informe o nome';
    if (somenteDigitos(nascimento).length > 0 && !dataParaISO(nascimento)) novos.birthDate = 'Data inválida';
    if (peso.trim() !== '' && numeroDigitado(peso) == null) novos.weightKg = 'Peso inválido';
    if (altura.trim() !== '' && alturaParaCm(altura) == null) novos.heightCm = 'Altura inválida';
    setErros(novos);
    return Object.keys(novos).length === 0;
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErroGeral(null);
    if (!validar()) return;
    const limpo = nome.trim();
    setSalvando(true);
    try {
      const criado = await healthApi.createProfile({
        fullName: limpo,
        birthDate: dataParaISO(nascimento),
        relationship: parentesco,
        notes: observacoes.trim() || null,
        photo: foto,
        weightKg: numeroDigitado(peso),
        heightCm: alturaParaCm(altura),
        avatarColor: pickAvatarColor(limpo),
      });
      await queryClient.invalidateQueries({ queryKey: CHAVES.perfis });
      void queryClient.invalidateQueries({ queryKey: CHAVES.medicoes });
      setPessoa(criado.id);
      onFechar();
    } catch (erro) {
      if (erro instanceof ApiRequestError && erro.fields) setErros(erro.fields);
      setErroGeral(mensagemDoErro(erro));
    } finally {
      setSalvando(false);
    }
  }

  const idade = idadeDescrita(dataParaISO(nascimento));
  const ocupado = salvando || processandoFoto;

  return (
    <dialog
      ref={ref}
      className={estilos.modal}
      aria-labelledby="novo-membro-titulo"
      onCancel={(e) => {
        // Esc fecha, mas nao no meio do salvamento.
        e.preventDefault();
        if (!salvando) onFechar();
      }}
    >
      <form onSubmit={(e) => void salvar(e)} noValidate className={estilos.caixa}>
        <div className={estilos.topo}>
          <div>
            <h2 id="novo-membro-titulo" className={estilos.titulo}>
              Adicionar membro da família
            </h2>
            <p className={estilos.subtitulo}>Mantenha sua família sempre cuidada e conectada.</p>
          </div>
          <button type="button" className={estilos.fechar} onClick={onFechar} disabled={salvando} aria-label="Fechar">
            <Icone nome="x" size={22} />
          </button>
        </div>

        <div className={estilos.foto}>
          <button
            type="button"
            className={estilos.fotoBotao}
            disabled={ocupado}
            onClick={() => void aplicarFoto()}
            aria-label={foto ? 'Trocar a foto' : 'Adicionar foto'}
          >
            {foto ? (
              <Avatar nome={nome || '?'} photo={foto} size={88} />
            ) : (
              <span className={estilos.fotoVazia}>
                <Icone nome="user" size={40} />
              </span>
            )}
            <span className={estilos.fotoSelo}>
              {processandoFoto ? <span className={botoes.girando} /> : <Icone nome="camera" size={16} />}
            </span>
          </button>
          <span className={estilos.fotoTexto}>
            {foto ? (
              <button type="button" className={botoes.texto} onClick={() => setFoto(null)} disabled={ocupado}>
                Remover foto
              </button>
            ) : (
              <>
                Clique para adicionar uma foto
                <span>JPG ou PNG. Opcional.</span>
              </>
            )}
          </span>
        </div>

        <FormField
          label="Nome completo"
          value={nome}
          onChangeText={setNome}
          placeholder="Digite o nome completo"
          autoComplete="off"
          autoCapitalize="words"
          error={erros.fullName}
          readOnly={salvando}
          autoFocus
        />

        <div className={estilos.duas}>
          <FormField
            label="Data de nascimento"
            value={nascimento}
            onChangeText={(v) => setNascimento(formatarData(v))}
            placeholder="dd/mm/aaaa"
            inputMode="numeric"
            maxLength={10}
            hint={idade ?? undefined}
            error={erros.birthDate}
            readOnly={salvando}
          />
          <SelectField
            label="Parentesco"
            value={parentesco}
            options={PARENTESCOS}
            onChange={setParentesco}
            placeholder="Selecione o parentesco"
            error={erros.relationship}
            disabled={salvando}
          />
        </div>

        <div className={estilos.duas}>
          <FormField
            label="Peso"
            value={peso}
            onChangeText={setPeso}
            placeholder="Ex.: 68 kg"
            inputMode="decimal"
            error={erros.weightKg}
            readOnly={salvando}
          />
          <FormField
            label="Altura"
            value={altura}
            onChangeText={setAltura}
            placeholder="Ex.: 1,70 m"
            inputMode="decimal"
            error={erros.heightCm}
            readOnly={salvando}
          />
        </div>

        <FormField
          label="Observações"
          value={observacoes}
          onChangeText={setObservacoes}
          placeholder="Alguma informação importante? Alergias, condições..."
          multiline
          error={erros.notes}
          readOnly={salvando}
        />

        {erroGeral ? (
          <p className={estilos.erro} role="alert">
            {erroGeral}
          </p>
        ) : null}

        <div className={estilos.acoes}>
          <button type="button" className={botoes.contorno} onClick={onFechar} disabled={salvando}>
            Cancelar
          </button>
          <PrimaryButton title="Salvar membro" tom="terracota" type="submit" loading={salvando} className={estilos.salvar} />
        </div>
      </form>
    </dialog>
  );
}
