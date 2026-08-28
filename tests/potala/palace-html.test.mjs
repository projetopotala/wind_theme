import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("o palácio tem canvas, fallback e botão acessível", async () => {
  const page = await readFile("outputs/palacio.html", "utf8");

  assert.match(page, /id="palace-scene"[^>]*aria-hidden="true"/);
  // Fallback obrigatório: se o WebGL falhar, a cena não pode virar tela preta.
  assert.match(page, /palacio-master\.webp/);
  assert.match(page, /<button[^>]*id="palace-return"/);
  assert.match(page, /palacio\.css/);
  assert.doesNotMatch(page, /<audio[^>]*autoplay/i);
});

test("o botão anuncia o gesto e o destino em texto, não só em animação", async () => {
  const page = await readFile("outputs/palacio.html", "utf8");
  assert.match(page, /aria-describedby="palace-return-hint"/);
  assert.match(page, /id="palace-return-hint"/);
});

test("o controlador reaproveita o motor da Chegada em vez de duplicar", async () => {
  const controller = await readFile("outputs/js/palacio/palace-controller.js", "utf8");
  assert.match(controller, /createArrivalScene/);
  assert.match(controller, /from "\.\.\/chegada\/arrival-scene\.js"/);
});

test("o canvas do palácio precisa de um ancestral com a classe arrival-visual", async () => {
  // `createArrivalScene()` (arrival-scene.js) revela o canvas com
  // `canvas.closest(".arrival-visual")` — é assim que ela alterna
  // `is-scene-ready` e esconde o fallback fotográfico. Essa classe não é
  // parametrizada: mexer no motor compartilhado com a Chegada por causa do
  // palácio é risco maior do que travar o acoplamento aqui. Sem a classe (por
  // exemplo, uma limpeza futura que a remova por parecer "não usada" — o
  // comentário em palacio.html avisa, mas nenhum teste travava isso até
  // agora), a cena carrega, `closest()` devolve null, `classList.add` nunca
  // roda, e o canvas fica para sempre invisível atrás do fallback, sem erro
  // nenhum no console.
  const page = await readFile("outputs/palacio.html", "utf8");
  assert.match(
    page,
    /<div class="palace-visual arrival-visual"[^>]*id="palace-visual">[\s\S]*?<canvas[^>]*id="palace-scene"/,
    "o canvas #palace-scene precisa estar dentro de um elemento com a classe arrival-visual",
  );
});
