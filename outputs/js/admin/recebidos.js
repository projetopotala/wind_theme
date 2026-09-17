/*
 * O que chegou pelo site, para a Visão geral e os Relatórios do painel.
 *
 * Fica fora do estado da operação: são mensagens de visitantes, não registros
 * que um comando altera. Falhar aqui não pode travar a agenda — a tela mostra
 * o motivo no próprio cartão.
 */
export async function carregarRecebidos(client, { limite = 100 } = {}) {
  const [interesses, inscritos] = await Promise.all([
    client.from("site_interests").select("id,kind,subject,details,page,created_at").order("created_at", { ascending: false }).limit(limite),
    client.from("newsletter_subscriptions").select("id", { count: "exact", head: true }),
  ]);
  const erro = interesses.error || inscritos.error;
  if (erro) {
    const faltaTabela = ["PGRST205", "42P01"].includes(erro.code);
    return { erro: faltaTabela ? "As tabelas de participação ainda não foram instaladas no banco do Portal." : `Não foi possível ler o que chegou pelo site: ${erro.message}` };
  }
  return { interesses: interesses.data || [], inscritos: inscritos.count || 0 };
}
