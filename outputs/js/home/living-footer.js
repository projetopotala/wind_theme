const PLANT_KEY = "potala.plantinha.v1";
const GIFTS = {
  poema: ["Há caminhos que começam\nquando a gente permite\nque o passo seja pequeno.", "A luz não pede pressa.\nEncontra uma fresta\ne fica."],
  reflexao: ["Você não precisa levar todas as respostas. Uma boa pergunta também pode fazer companhia.", "O cuidado pode começar em um gesto que cabe no seu dia."],
  pergunta: ["O que merece um pouco da sua atenção hoje?", "Que pequeno espaço você pode abrir para si nesta semana?"],
};
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const whats = (text) => `https://wa.me/5519997766131?text=${encodeURIComponent(text)}`;

export function plantState(raw = {}) {
  const visits = Math.min(36500, Math.max(0, Math.trunc(Number(raw?.visits) || 0)));
  const lastDay = /^\d{4}-\d{2}-\d{2}$/.test(raw?.lastDay || "") ? raw.lastDay : "";
  return { visits, lastDay };
}
export function localDay(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function waterPlant(raw, day = localDay()) {
  const current = plantState(raw);
  return current.lastDay >= day ? current : { visits: current.visits + 1, lastDay: day };
}
export function plantStage(visits) {
  return visits >= 20 ? "Árvore" : visits >= 10 ? "Flores" : visits >= 5 ? "Folhas" : visits >= 1 ? "Broto" : "Semente";
}

export function renderLivingFooter(regions = []) {
  const links = regions.filter((item) => !String(item.id).startsWith("novidade-") && /^[\w-]+\.html$/.test(item.href || ""));
  const seen = new Set();
  const returns = links.filter((item) => !seen.has(item.href) && seen.add(item.href))
    .map((item) => `<a href="${esc(item.href)}">${esc(item.title)}</a>`).join("");
  return `<footer class="living-footer" id="rodape-vivo" aria-labelledby="farewell-title" data-keeps-expansion>
    <header class="living-farewell">
      <p class="living-kicker">O caminho continua em você</p>
      <h2 id="farewell-title">Obrigado por caminhar conosco.</h2>
      <p>Que tudo o que você encontrou aqui continue fazendo sentido quando esta página se fechar.</p>
      <p>Porque o verdadeiro Portal nunca esteve na tela. Sempre esteve dentro de você.</p>
    </header>
    <div class="living-grid">
      <section class="living-plant" aria-labelledby="plant-title">
        <p class="living-kicker">Aquilo que cuidamos cresce</p>
        <h3 id="plant-title">Quero regar minha plantinha</h3>
        <div class="plant-drawing" data-plant-stage="Semente" aria-hidden="true">
          <svg viewBox="0 0 200 180"><path class="plant-ground" d="M30 158 Q100 140 170 158"/>
          <ellipse class="plant-seed" cx="100" cy="145" rx="6" ry="9"/>
          <path class="plant-stem" d="M100 148 Q94 113 104 58"/>
          <path class="plant-leaf leaf-one" d="M100 118 Q55 117 63 86 Q95 85 100 118"/>
          <path class="plant-leaf leaf-two" d="M101 98 Q140 99 142 66 Q108 63 101 98"/>
          <path class="plant-leaf leaf-three" d="M102 70 Q70 64 79 40 Q104 41 102 70"/>
          <circle class="plant-flower" cx="105" cy="43" r="14"/>
          <path class="plant-crown" d="M60 104 C13 80 48 40 67 48 C66 0 133 4 136 42 C177 35 189 91 147 102Z"/></svg>
        </div>
        <p data-plant-status role="status">Uma semente para acompanhar suas visitas.</p>
        <button type="button" data-water-plant>Regar minha plantinha</button>
        <p class="living-note" data-plant-storage>Guardada apenas neste navegador, sem cadastro. Um cuidado por dia, sem pressa.</p>
      </section>
      <section class="living-gift" aria-labelledby="gift-title">
        <p class="living-kicker">Antes de partir</p>
        <h3 id="gift-title">Uma lembrança para levar</h3>
        <p>Ao sair da nossa presença, esperamos apenas uma coisa: que você esteja um pouco melhor do que estava quando chegou.</p>
        <label for="gift-kind">O que faria companhia a você?</label>
        <select id="gift-kind"><option value="poema">Um pequeno poema</option><option value="reflexao">Uma reflexão</option><option value="pergunta">Uma pergunta</option></select>
        <button type="button" data-choose-gift>Receber uma lembrança</button>
        <p class="gift-message" data-gift-message role="status"></p>
        <button type="button" data-save-gift hidden>Guardar como texto</button>
      </section>
    </div>
    <div class="living-grid living-dialogue">
      <nav aria-label="Quero voltar para"><h3>Quero voltar para…</h3><div class="living-return-links">${returns}</div><a href="transcender.html">A tranquilidade da Chegada</a></nav>
      <section aria-labelledby="dialogue-title"><h3 id="dialogue-title">A conversa fica aberta</h3>
        <p>Dúvidas, comentários, sugestões e ideias também ajudam a construir o Potala.</p>
        <a href="mailto:contato@institutopotala.com?subject=Minha%20visita%20ao%20Potala">Escrever para o Instituto ↗</a>
        <a href="${whats("Olá! Gostaria de saber como encaminhar um nome ao Mural de Luz.")}">Conversar sobre o Mural de Luz ↗</a>
        <a href="${whats("Olá! Gostaria de saber como receber as novidades do Potala.")}">Quero receber novidades ↗</a>
        <p class="living-note">Os convites abrem seu e-mail ou WhatsApp. A mensagem só é enviada por você.</p>
      </section>
    </div>
    <div class="living-contact"><p>Volte sempre. As portas do Potala permanecerão abertas.</p>
      <address>Instituto Cultural Potala · Indaiatuba, SP<br>
      <a href="tel:+551938346147">(19) 3834-6147</a> · <a href="https://wa.me/5519997766131">WhatsApp</a> · <a href="mailto:contato@institutopotala.com">E-mail</a> · <a href="recepcao.html">Recepção e contato</a></address>
    </div>
  </footer>`;
}

export function mountLivingFooter(root) {
  const footer = root.querySelector?.("#rodape-vivo");
  if (!footer) return () => {};
  let storage;
  let state = plantState();
  try { storage = globalThis.localStorage; state = plantState(JSON.parse(storage.getItem(PLANT_KEY) || "{}")); } catch { storage = null; }
  const water = footer.querySelector("[data-water-plant]");
  const status = footer.querySelector("[data-plant-status]");
  const paint = () => {
    const stage = plantStage(state.visits);
    footer.querySelector("[data-plant-stage]").dataset.plantStage = stage;
    status.textContent = state.visits ? `${stage}. ${state.lastDay >= localDay() ? "Seu cuidado de hoje já está aqui." : "Que bom receber você de novo."}` : "Uma semente para acompanhar suas visitas.";
    water.disabled = state.lastDay >= localDay();
    water.textContent = water.disabled ? "Regada por hoje" : "Regar minha plantinha";
    if (!storage) footer.querySelector("[data-plant-storage]").textContent = "Nesta visita, sua plantinha pode crescer. Este navegador não permitiu guardar seu progresso.";
  };
  let gift = "";
  const counters = {};
  const onClick = (event) => {
    if (event.target.closest("[data-water-plant]")) {
      state = waterPlant(state);
      try { storage?.setItem(PLANT_KEY, JSON.stringify(state)); } catch { storage = null; }
      paint();
    }
    if (event.target.closest("[data-choose-gift]")) {
      const kind = footer.querySelector("#gift-kind").value;
      const options = GIFTS[kind] || GIFTS.poema;
      const index = counters[kind] ?? Math.floor(Math.random() * options.length);
      gift = options[index % options.length]; counters[kind] = index + 1;
      footer.querySelector("[data-gift-message]").textContent = gift;
      footer.querySelector("[data-save-gift]").hidden = false;
    }
    if (gift && event.target.closest("[data-save-gift]")) {
      const url = URL.createObjectURL(new Blob([`${gift}\n\nUma lembrança da sua visita ao Potala.\n`], { type: "text/plain;charset=utf-8" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "lembranca-potala.txt";
      anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };
  const onStorage = (event) => {
    if (event.key !== PLANT_KEY && event.key !== null) return;
    try { state = plantState(JSON.parse(event.newValue || "{}")); } catch { state = plantState(); }
    paint();
  };
  paint(); footer.addEventListener("click", onClick);
  window.addEventListener("storage", onStorage);
  window.addEventListener("pageshow", paint);
  return () => { footer.removeEventListener("click", onClick); window.removeEventListener("storage", onStorage); window.removeEventListener("pageshow", paint); };
}
