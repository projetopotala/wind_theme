import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { invitationsFor, nextInvitationIndex } from "../../outputs/js/home/invitations.js";
import { DEFAULT_HOME_BLOCKS } from "../../outputs/js/home/journey-data.js";

test("cada convite é uma frase inteira, não um título com prefixo", () => {
  const convites = invitationsFor(DEFAULT_HOME_BLOCKS);
  assert.equal(convites.length, DEFAULT_HOME_BLOCKS.length);

  /*
   * Montar "Conheça " + título produziria "Conheça Atendimentos" e "Conheça
   * Programação" — frases que ninguém diria, porque em português o artigo muda
   * com o gênero e o número. Escrever as nove custa nove linhas.
   */
  const porId = Object.fromEntries(convites.map(({ id, text }) => [id, text]));
  assert.equal(porId["quem-somos"], "Conheça quem somos");
  assert.equal(porId.atendimentos, "Conheça nossos atendimentos");
  assert.equal(porId.atividades, "Conheça nossas atividades");
  assert.equal(porId.profissionais, "Conheça nossos profissionais");

  // Nenhum convite pode sair com o artigo errado colado no título cru.
  for (const { text } of convites) {
    assert.doesNotMatch(text, /^Conheça (Atendimentos|Programação|Atividades|Cursos)$/);
  }
});

test("um bloco novo, criado no painel, ainda recebe convite", () => {
  // O conteúdo é editável: um bloco fora da lista não pode deixar o canto da
  // tela mudo. Frase torta é melhor que convite vazio.
  const convites = invitationsFor([{ id: "novo", title: "Retiros" }]);
  assert.deepEqual(convites, [{ id: "novo", text: "Conheça Retiros" }]);
});

test("bloco sem destino não vira convite", () => {
  // Um convite que não leva a lugar nenhum é promessa quebrada no canto da tela.
  assert.deepEqual(invitationsFor([{ title: "Sem id" }, { id: "sem-titulo" }, null]), []);
  assert.deepEqual(invitationsFor("não é lista"), []);
});

test("a roda de convites volta ao começo", () => {
  assert.equal(nextInvitationIndex(0, 3), 1);
  assert.equal(nextInvitationIndex(2, 3), 0);
  assert.equal(nextInvitationIndex(-1, 3), 0);
  assert.equal(nextInvitationIndex(0, 0), 0, "sem convites não pode dividir por zero");
});

test("o convite gira sozinho, mas para quando alguém olha", async () => {
  const controlador = await readFile(
    new URL("../../outputs/js/home/home-controller.js", import.meta.url),
    "utf8",
  );

  /*
   * Texto que se troca sozinho é conteúdo em movimento: quem está lendo pode
   * ser interrompido no meio da frase. Pausar no ponteiro e no foco é o mínimo,
   * e com movimento reduzido ele não gira de jeito nenhum — girar mais devagar
   * não resolveria, continuaria trocando sob os olhos de quem pediu para nada
   * se mexer.
   */
  assert.match(controlador, /if \(reducedMotion \|\| convites\.length < 2/);
  assert.match(controlador, /addEventListener\("pointerenter", pauseInvitation\)/);
  assert.match(controlador, /addEventListener\("focus", pauseInvitation\)/);
  assert.match(controlador, /addEventListener\("blur", resumeInvitation\)/);

  // E o relógio é desligado ao destruir, senão segue trocando texto num DOM morto.
  const limpeza = controlador.slice(controlador.indexOf("destroy() {"));
  assert.match(limpeza, /clearTimeout\(inviteTimer\)/);
});

test("o convite nasce escrito no HTML, não à espera do script", async () => {
  const cenas = await readFile(new URL("../../outputs/js/home/home-scenes.js", import.meta.url), "utf8");

  // Um retângulo em branco no canto é pior que retângulo nenhum, e quem abrir a
  // página com o JavaScript lento vê o convite mesmo assim.
  assert.match(cenas, /export function renderInvitation/);
  assert.match(cenas, /data-invite-target="\$\{primeiro\.id\}"/);
  assert.match(cenas, /escapeHtml\(primeiro\.text\)/);
});
