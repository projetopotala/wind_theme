/*
 * PARA ONDE VAI QUEM TEM PAPEL ADMINISTRATIVO.
 *
 * Owner, admin e editor do Blog entram pela Central (/admin/). Só o OWNER que
 * também tem vínculo profissional ATIVO fica no Meu Potala, para chegar à própria
 * área profissional; o acesso à Central continua pelo painel da conta.
 *
 * O vínculo é decidido no banco (my_appointment_professional_profiles usa
 * auth.uid()): esta função só LÊ o resultado, não concede nada. Owner sem vínculo,
 * ou com qualquer falha na leitura, segue para a Central, como antes.
 */

export const PAPEIS_ADMINISTRATIVOS = Object.freeze(["owner", "admin", "blog_editor"]);

/*
 * O guarda que o Meu Potala liga na sessão. Devolve true quando a tela NÃO deve
 * ser desenhada para esta sessão (papel administrativo que segue para a Central).
 * O Owner é consultado uma vez por conta; enquanto a leitura não volta, a tela
 * desenha normalmente e, se o destino for a Central, a página é trocada.
 */
export function criarGuardaDeDestino({ sessao, janela, habilitado = true } = {}) {
  let redirecionando = false;
  let verificado = null;
  return (estado) => {
    if (redirecionando || !PAPEIS_ADMINISTRATIVOS.includes(estado.papelPortal)) return false;
    const quem = estado.usuario?.id;
    if (quem && quem !== verificado) {
      verificado = quem;
      destinoDoPapel({ papelPortal: estado.papelPortal, perfisProfissionais: () => sessao.perfisProfissionais(), habilitado })
        .then((destino) => {
          if (destino !== "admin" || redirecionando || sessao.obter().usuario?.id !== quem) return;
          redirecionando = true;
          janela.location.assign?.("/admin/");
        });
    }
    return estado.papelPortal !== "owner";
  };
}

export async function destinoDoPapel({ papelPortal, perfisProfissionais, habilitado = true } = {}) {
  if (!PAPEIS_ADMINISTRATIVOS.includes(papelPortal)) return "ficar";
  if (papelPortal !== "owner" || !habilitado || typeof perfisProfissionais !== "function") return "admin";
  try {
    const perfis = await perfisProfissionais();
    return Array.isArray(perfis) && perfis.length > 0 ? "ficar" : "admin";
  } catch {
    return "admin";
  }
}
