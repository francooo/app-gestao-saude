import { useQuery, useQueryClient } from '@tanstack/react-query';
import { healthApi } from '@gestao/shared/api/health';
import { quantidadeDoEstoque, validadeParaISO } from '@gestao/shared/lib/estoque';
import { formatarData, somenteDigitos } from '@gestao/shared/lib/pessoa';
import { tituloDoMedicamento } from '@gestao/shared/lib/posologia';
import { endOfDay, startOfDay } from 'date-fns';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { ApiRequestError } from '@/api/cliente';
import { CHAVES } from '@/api/consultas';
import { mensagemDoErro } from '@/api/doses';
import { Carregando } from '@/ui/Carregando';
import { FormField, SelectField } from '@/ui/FormField';
import { Aviso, Pagina } from '@/ui/Pagina';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SurfaceCard } from '@/ui/SurfaceCard';

import estilos from './Compra.module.css';
import comuns from './remedios.module.css';

/** O teto da API para as unidades de uma compra. */
const MAXIMO_DE_UNIDADES = 99999;

type Erros = Partial<Record<'remedio' | 'caixas' | 'unidades' | 'expiresOn' | 'place', string>>;

/**
 * Registrar a compra de um remedio: quantas caixas, quantas unidades em cada,
 * validade e onde foi. Com ?id= o remedio ja vem escolhido.
 */
export function Compra() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const idInicial = params.get('id');

  const consulta = useQuery({
    queryKey: [...CHAVES.remedios, 'para-compra', { idInicial }],
    queryFn: async () => {
      const agora = new Date();
      const lista = await healthApi.listMedications({
        from: startOfDay(agora),
        to: endOfDay(agora),
        includeInactive: true,
      });
      // So os ativos — mais o que veio na URL, mesmo se estiver pausado.
      return { remedios: lista.filter((m) => m.isActive || m.id === idInicial), agora };
    },
  });
  const medicamentos = consulta.data?.remedios ?? [];

  const [remedioId, setRemedioId] = useState<string | null>(idInicial);
  const [caixas, setCaixas] = useState('1');
  const [unidades, setUnidades] = useState('');
  const [validade, setValidade] = useState('');
  const [local, setLocal] = useState('');
  const [erros, setErros] = useState<Erros>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const escolhido = medicamentos.find((m) => m.id === remedioId) ?? null;

  // Ao escolher o remedio, sugere a quantidade da caixa que o cadastro ja sabe.
  useEffect(() => {
    if (escolhido?.packageAmount) setUnidades(String(escolhido.packageAmount));
  }, [escolhido?.id, escolhido?.packageAmount]);

  const nCaixas = Number(somenteDigitos(caixas)) || 0;
  const nUnidades = Number(somenteDigitos(unidades)) || 0;
  const total = nCaixas * nUnidades;

  function validar(): Erros {
    const e: Erros = {};
    if (!escolhido) e.remedio = 'Escolha o remédio.';
    if (nCaixas < 1) e.caixas = 'Pelo menos 1.';
    if (nUnidades < 1) e.unidades = 'Quantas vêm em cada caixa?';
    else if (total > MAXIMO_DE_UNIDADES) e.unidades = 'Quantidade grande demais.';
    if (validade.trim() && !validadeParaISO(validade)) {
      e.expiresOn = 'Data inválida. Use DD/MM/AAAA, de hoje em diante.';
    }
    return e;
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (salvando) return;
    const locais = validar();
    setErros(locais);
    setErroGeral(null);
    if (Object.keys(locais).length > 0 || !remedioId) return;

    setSalvando(true);
    try {
      const atualizado = await healthApi.registrarCompra(remedioId, {
        units: total,
        expiresOn: validade.trim() ? validadeParaISO(validade) : null,
        place: local.trim() || null,
      });
      queryClient.setQueryData(CHAVES.remedio(remedioId), {
        remedio: atualizado,
        agora: new Date(),
      });
      void queryClient.invalidateQueries({ queryKey: CHAVES.remedios });
      navigate(-1);
    } catch (e) {
      if (e instanceof ApiRequestError && e.fields) {
        const { units, expiresOn, place } = e.fields;
        setErros({ unidades: units, expiresOn, place });
      }
      setErroGeral(mensagemDoErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Pagina area="medications" largura="formulario">
      <ScreenHeader title="Registrar compra" voltar="historico" />

      <div className={comuns.secao}>
        {consulta.isPending ? (
          <Carregando />
        ) : consulta.isError && !consulta.data ? (
          <Aviso
            icone="alert-circle"
            erro
            acao={{ rotulo: 'Tentar de novo', onClick: () => void consulta.refetch() }}
          >
            {mensagemDoErro(consulta.error)}
          </Aviso>
        ) : medicamentos.length === 0 ? (
          <Aviso
            icone="plus-circle"
            acao={{ rotulo: 'Cadastrar remédio', onClick: () => navigate('/remedios/novo') }}
          >
            Cadastre um remédio primeiro. Depois volte aqui para registrar a compra.
          </Aviso>
        ) : (
          <SurfaceCard>
            <form onSubmit={salvar} noValidate>
              <SelectField
                label="Remédio"
                value={remedioId}
                options={medicamentos.map((m) => ({
                  valor: m.id,
                  rotulo: [tituloDoMedicamento(m), m.profileName?.split(' ')[0]]
                    .filter(Boolean)
                    .join(' · '),
                }))}
                onChange={setRemedioId}
                placeholder="Escolha o remédio"
                error={erros.remedio}
              />

              <div className={estilos.linha}>
                <FormField
                  label="Caixas"
                  value={caixas}
                  onChangeText={(t) => setCaixas(somenteDigitos(t).slice(0, 2))}
                  inputMode="numeric"
                  error={erros.caixas}
                  className={estilos.estreito}
                />
                <FormField
                  label="Unidades por caixa"
                  value={unidades}
                  onChangeText={(t) => setUnidades(somenteDigitos(t).slice(0, 5))}
                  inputMode="numeric"
                  placeholder="Ex.: 30"
                  error={erros.unidades}
                  className={estilos.largo}
                />
              </div>

              {total > 0 ? (
                <p className={estilos.total} role="status">
                  Total: {quantidadeDoEstoque(total, escolhido?.form)}
                </p>
              ) : null}

              <FormField
                label="Validade (opcional)"
                value={validade}
                onChangeText={(t) => setValidade(formatarData(t))}
                inputMode="numeric"
                placeholder="DD/MM/AAAA"
                maxLength={10}
                error={erros.expiresOn}
                hint="Está impressa na caixa. Avisamos quando faltar 30 dias."
              />

              <FormField
                label="Farmácia / cidade (opcional)"
                value={local}
                onChangeText={setLocal}
                placeholder="Ex.: Farmácia Vida · São Paulo, SP"
                maxLength={120}
                error={erros.place}
              />

              {erroGeral ? (
                <p className={estilos.erroGeral} role="alert">
                  {erroGeral}
                </p>
              ) : null}

              <PrimaryButton type="submit" title="Salvar compra" loading={salvando} />
            </form>
          </SurfaceCard>
        )}
      </div>
    </Pagina>
  );
}
