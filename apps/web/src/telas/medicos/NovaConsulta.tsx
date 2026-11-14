import { useQueryClient } from '@tanstack/react-query';
import { healthApi } from '@gestao/shared/api/health';
import { addDays, format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { usePerfis, useTodosOsMedicos } from '@/api/consultas';
import { mensagemDoErro } from '@/api/doses';
import { Avatar } from '@/ui/Avatar';
import botoes from '@/ui/botoes.module.css';
import { Carregando } from '@/ui/Carregando';
import { Chip, Chips } from '@/ui/Chip';
import { FormField } from '@/ui/FormField';
import { Pagina } from '@/ui/Pagina';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SurfaceCard } from '@/ui/SurfaceCard';

import form from '../medicamento/MedicamentoForm.module.css';
import { Modalidades } from './MedicoForm';
import estilos from './medicos.module.css';

const LEMBRETES: Array<{ minutos: number | null; rotulo: string }> = [
  { minutos: null, rotulo: 'Sem lembrete' },
  { minutos: 60, rotulo: '1 hora antes' },
  { minutos: 180, rotulo: '3 horas antes' },
  { minutos: 1440, rotulo: '1 dia antes' },
  { minutos: 2880, rotulo: '2 dias antes' },
];

/**
 * Nova consulta: para quem, com qual medico, quando e onde.
 *
 * No aplicativo o "quando" e um calendario com horarios de meia em meia hora.
 * Aqui sao os campos de data e de hora do proprio navegador: no computador
 * aceitam digitacao direta, no celular abrem o seletor do sistema, e qualquer
 * horario serve (nao so os de meia em meia hora).
 */
export function NovaConsulta() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();

  const perfis = usePerfis();
  const medicos = useTodosOsMedicos();
  const listaDeMedicos = medicos.data ?? [];

  const [salvando, setSalvando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [erroPerfil, setErroPerfil] = useState<string | undefined>();
  const [erroQuando, setErroQuando] = useState<string | undefined>();

  const [perfilId, setPerfilId] = useState<string | null>(null);
  const [medicoId, setMedicoId] = useState<string | null>(params.get('professionalId'));
  // Padrao: amanha as 9h, como no aplicativo.
  const [dia, setDia] = useState(() => format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [hora, setHora] = useState('09:00');
  const [modalidade, setModalidade] = useState<'presencial' | 'teleconsulta'>('presencial');
  const [local, setLocal] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [lembrete, setLembrete] = useState<number | null>(1440);

  useEffect(() => {
    if (!perfilId && perfis.data?.[0]) setPerfilId(perfis.data[0].id);
  }, [perfilId, perfis.data]);

  // Ao escolher o medico, herda o tipo de atendimento e a clinica dele.
  const medico = listaDeMedicos.find((m) => m.id === medicoId) ?? null;
  useEffect(() => {
    if (!medico) return;
    if (medico.defaultModality) setModalidade(medico.defaultModality);
    if (medico.clinicName) setLocal((atual) => atual || medico.clinicName!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medico?.id]);

  const quando = new Date(`${dia}T${hora}:00`);
  const quandoValido = Boolean(dia && hora) && isValid(quando);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (salvando) return;
    setErroGeral(null);

    if (!perfilId) {
      setErroPerfil('Escolha para quem é a consulta');
      return;
    }
    setErroPerfil(undefined);
    if (!quandoValido) {
      setErroQuando('Informe o dia e a hora da consulta');
      return;
    }
    setErroQuando(undefined);

    setSalvando(true);
    try {
      await healthApi.createAppointment({
        profileId: perfilId,
        professionalId: medicoId,
        scheduledAt: quando.toISOString(),
        modality: modalidade,
        location: local.trim() || null,
        address: medico?.address ?? null,
        reminderMinutesBefore: lembrete,
        notes: observacoes.trim() || null,
      });
      void queryClient.invalidateQueries({ queryKey: ['consultas'] });
      navigate(-1);
    } catch (e) {
      setErroGeral(mensagemDoErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Pagina area="family" largura="formulario">
      <ScreenHeader title="Nova consulta" voltar="historico" />

      {perfis.isPending || medicos.isPending ? (
        <Carregando />
      ) : (
        <form onSubmit={salvar} noValidate>
          <SurfaceCard className={form.bloco}>
            <h2 className={form.blocoTitulo}>Para quem</h2>
            <div className={estilos.pessoas} role="group" aria-label="Para quem">
              {(perfis.data ?? []).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={estilos.pessoa}
                  aria-pressed={p.id === perfilId}
                  aria-label={p.fullName}
                  disabled={salvando}
                  onClick={() => setPerfilId(p.id)}
                >
                  <Avatar
                    nome={p.fullName}
                    color={p.avatarColor ?? undefined}
                    photo={p.photo}
                    size={52}
                    selected={p.id === perfilId}
                  />
                  <span>{p.fullName.split(' ')[0]}</span>
                </button>
              ))}
            </div>
            {erroPerfil ? (
              <p className={form.erroGeral} role="alert">
                {erroPerfil}
              </p>
            ) : null}
          </SurfaceCard>

          <SurfaceCard className={form.bloco}>
            <h2 className={form.blocoTitulo}>Com qual médico</h2>
            {listaDeMedicos.length === 0 ? (
              <p className={form.blocoAjuda}>
                Você ainda não cadastrou médicos. A consulta pode ser criada sem um.
              </p>
            ) : (
              <div className={estilos.listaDeMedicos} role="group" aria-label="Com qual médico">
                {listaDeMedicos.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={estilos.medico}
                    aria-pressed={m.id === medicoId}
                    disabled={salvando}
                    // Clicar de novo no escolhido desfaz a escolha.
                    onClick={() => setMedicoId(m.id === medicoId ? null : m.id)}
                  >
                    <span className={estilos.medicoNome}>{m.name}</span>
                    {m.specialty ? <span className={estilos.medicoEsp}>{m.specialty}</span> : null}
                  </button>
                ))}
              </div>
            )}
          </SurfaceCard>

          <SurfaceCard className={form.bloco}>
            <h2 className={form.blocoTitulo}>Quando</h2>
            {quandoValido ? (
              <p className={estilos.quandoResumo} role="status">
                {format(quando, "EEEE',' d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
              </p>
            ) : null}
            <div className={estilos.linha}>
              <FormField
                label="Dia"
                type="date"
                value={dia}
                onChangeText={setDia}
                min={format(new Date(), 'yyyy-MM-dd')}
                error={erroQuando}
                readOnly={salvando}
                className={`${estilos.colunaGrande} ${form.ultimo}`}
              />
              <FormField
                label="Hora"
                type="time"
                value={hora}
                onChangeText={setHora}
                readOnly={salvando}
                className={`${estilos.colunaPequena} ${form.ultimo}`}
              />
            </div>
          </SurfaceCard>

          <SurfaceCard className={form.bloco}>
            <h2 className={form.blocoTitulo} style={{ marginBottom: 4 }}>
              Lembrete
            </h2>
            {/* O banco guarda a antecedencia; quem agenda o aviso e o celular,
                na proxima vez que o aplicativo for aberto. */}
            <p className={form.blocoAjuda} style={{ marginBottom: 16 }}>
              O aviso toca no aplicativo do celular. Abra o aplicativo depois de marcar, para o
              lembrete ser agendado no aparelho.
            </p>
            <div className={form.ultimo}>
              <Chips rotulo="Lembrete">
                {LEMBRETES.map((l) => (
                  <Chip
                    key={l.rotulo}
                    rotulo={l.rotulo}
                    ativo={l.minutos === lembrete}
                    disabled={salvando}
                    onClick={() => setLembrete(l.minutos)}
                  />
                ))}
              </Chips>
            </div>
          </SurfaceCard>

          <SurfaceCard className={form.bloco}>
            <Modalidades valor={modalidade} onChange={setModalidade} disabled={salvando} />
            <FormField
              label="Local"
              value={local}
              onChangeText={setLocal}
              placeholder="Clínica Vida"
              readOnly={salvando}
            />
            <FormField
              label="Observações"
              value={observacoes}
              onChangeText={setObservacoes}
              placeholder="Levar exames anteriores…"
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
            Marcar consulta
          </button>
        </form>
      )}
    </Pagina>
  );
}
