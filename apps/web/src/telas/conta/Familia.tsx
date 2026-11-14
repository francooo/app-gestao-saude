import type { Profile } from '@gestao/shared/api/health';
import { idadeDescrita } from '@gestao/shared/lib/pessoa';
import { Link } from 'react-router';

import { usePerfis } from '@/api/consultas';
import { mensagemDoErro } from '@/api/doses';
import { SettingsGroup, SettingsRow } from '@/ui/Ajustes';
import { Avatar } from '@/ui/Avatar';
import botoes from '@/ui/botoes.module.css';
import { Icone } from '@/ui/Icone';
import { Aviso, Pagina } from '@/ui/Pagina';
import { ScreenHeader } from '@/ui/ScreenHeader';

import estilos from './conta.module.css';

/**
 * A familia, em lista (/conta/familia). Na tela Inicio as pessoas aparecem
 * numa faixa; aqui cabem todas, com parentesco e idade.
 */
export function Familia() {
  const perfis = usePerfis();
  const lista = perfis.data ?? [];

  // Titular primeiro; o resto na ordem que o servidor mandou.
  const ordenados = [...lista].sort(
    (a, b) => Number(b.isAccountHolder) - Number(a.isAccountHolder),
  );

  /**
   * Lista vazia e ERRO, nao "familia vazia": toda conta tem ao menos o
   * titular, criado junto com o cadastro. Mostrar a familia vazia faria alguem
   * recadastrar todo mundo.
   */
  const erro = perfis.isError
    ? mensagemDoErro(perfis.error)
    : perfis.isSuccess && lista.length === 0
      ? 'Não consegui carregar as pessoas da sua família.'
      : null;

  return (
    <Pagina area="settings">
      <ScreenHeader title="Membros da família" voltar="/ajustes" />

      <div className={estilos.bloco}>
        {perfis.isPending ? (
          <SettingsGroup>
            {[0, 1, 2].map((i) => (
              <div key={i} className={estilos.esqueletoLinha}>
                <span className={estilos.esqueletoAvatar} />
                <span>
                  <span className={estilos.esqueletoBarra} style={{ width: 160 }} />
                  <span
                    className={estilos.esqueletoBarra}
                    style={{ width: 100, height: 12, marginTop: 6 }}
                  />
                </span>
              </div>
            ))}
          </SettingsGroup>
        ) : erro && lista.length === 0 ? (
          <Aviso
            icone="alert-circle"
            erro
            acao={{ rotulo: 'Tentar de novo', onClick: () => void perfis.refetch() }}
          >
            {erro}
          </Aviso>
        ) : (
          <SettingsGroup>
            {ordenados.map((p) => (
              <SettingsRow
                key={p.id}
                marcador={
                  <Avatar
                    nome={p.fullName}
                    photo={p.photo}
                    color={p.avatarColor ?? undefined}
                    size={44}
                  />
                }
                rotulo={p.fullName}
                valor={linhaDeApoio(p)}
                para={`/membro/${p.id}`}
              />
            ))}
          </SettingsGroup>
        )}
      </div>

      {/* O botao permanece mesmo com a lista falhando: cadastrar nao depende de listar. */}
      <Link to="/membro/novo" className={`${botoes.verde} ${botoes.largo} ${estilos.adicionar}`}>
        <Icone nome="plus" size={20} />
        Adicionar membro
      </Link>
    </Pagina>
  );
}

/** "Conta principal · 33 anos", "Filho(a) · 5 anos", ou nada. */
function linhaDeApoio(p: Profile): string | undefined {
  const partes = [
    p.isAccountHolder ? 'Conta principal' : maiuscula(p.relationship),
    idadeDescrita(p.birthDate),
  ].filter(Boolean);

  return partes.length > 0 ? partes.join(' · ') : undefined;
}

function maiuscula(texto: string | null | undefined): string | null {
  if (!texto) return null;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
