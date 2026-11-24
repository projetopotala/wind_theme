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
