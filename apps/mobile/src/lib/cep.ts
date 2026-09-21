/**
 * Consulta de CEP no ViaCEP — gratuito, sem chave.
 *
 * Existe porque endereco sem CEP e justamente o que falha na geocodificacao e
 * deixa o medico fora do mapa. Preenchendo rua, bairro, cidade e estado a
 * partir do CEP, o endereco chega ao servidor em formato que o MapTiler
 * reconhece.
 *
 * Detalhe que engana: o ViaCEP responde HTTP 200 mesmo para CEP inexistente,
 * com um corpo `{ "erro": "true" }`. Conferir o status nao basta.
 */

export type EnderecoCep = {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
};

const TIMEOUT_MS = 8000;

export function somenteDigitos(cep: string): string {
  return cep.replace(/\D/g, '');
}

/** Formata para exibicao: 01310200 -> 01310-200 */
export function formatarCep(cep: string): string {
  const d = somenteDigitos(cep).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export type ResultadoCep =
  | { ok: true; endereco: EnderecoCep }
  | { ok: false; motivo: 'invalido' | 'nao_encontrado' | 'indisponivel' };

export async function buscarCep(entrada: string): Promise<ResultadoCep> {
  const cep = somenteDigitos(entrada);
  if (cep.length !== 8) return { ok: false, motivo: 'invalido' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      signal: controller.signal,
    });

    // O ViaCEP e um servico publico gratuito, sem garantia de disponibilidade.
    // Fora do ar, o formulario precisa deixar digitar o endereco a mao.
    if (!response.ok) return { ok: false, motivo: 'indisponivel' };

    const data = (await response.json()) as {
      erro?: string | boolean;
      cep?: string;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
    };

    // Aqui esta a pegadinha: erro vem com HTTP 200.
    if (data.erro === true || data.erro === 'true') {
      return { ok: false, motivo: 'nao_encontrado' };
    }

    return {
      ok: true,
      endereco: {
        cep: data.cep ?? formatarCep(cep),
        logradouro: data.logradouro ?? '',
        bairro: data.bairro ?? '',
        cidade: data.localidade ?? '',
        uf: data.uf ?? '',
      },
    };
  } catch {
    return { ok: false, motivo: 'indisponivel' };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Monta a linha unica que vai para a geocodificacao.
 *
 * A ordem importa: o MapTiler acerta muito mais com
 * "rua, numero, bairro, cidade - UF, CEP" do que com os campos embaralhados.
 */
export function montarEndereco(partes: {
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
}): string {
  const ruaComNumero = [partes.logradouro, partes.numero].filter(Boolean).join(', ');
  const cidadeUf = [partes.cidade, partes.uf].filter(Boolean).join(' - ');

  return [ruaComNumero, partes.complemento, partes.bairro, cidadeUf, partes.cep]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(', ');
}
