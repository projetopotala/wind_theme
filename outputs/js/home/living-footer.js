import {
  PLANT_KEY,
  localDay,
  mergePlantStates,
  paintPlant,
  plantStage,
  plantStageData,
  plantState,
  renderPlantCare,
  waterPlant,
} from "./closing-plant.js";
import { createTakeawayController, renderTakeaway } from "./closing-takeaway.js";

export { localDay, mergePlantStates, plantStage, plantStageData, plantState, waterPlant };

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const whats = (text) => `https://wa.me/5519997766131?text=${encodeURIComponent(text)}`;

function renderJourneyEnd() {
  return `<div class="golden-journey-end" aria-hidden="true"><i></i><span></span></div>
    <header class="closing-hero">
      <p class="closing-eyebrow">O caminho continua em você</p>
      <h2 id="farewell-title">Obrigado por caminhar conosco.</h2>
      <p>Que tudo o que você encontrou aqui continue fazendo sentido quando esta página se fechar.<br>Porque o verdadeiro Portal nunca esteve na tela. Sempre esteve dentro de você.</p>
    </header>`;
}

function renderDivider() {
  return `<div class="closing-divider" aria-hidden="true">
    <span></span>
    <svg viewBox="0 0 30 42"><path d="M15 40C13 27 12 15 19 3M15 27C8 26 4 21 3 14c8 0 12 4 12 13Zm1-8c7-1 11-6 11-13-8 1-11 6-11 13Z"/></svg>
    <p>Pequenos<br>gestos<br>continuam</p>
  </div>`;
}

function renderSignature() {
  return `<div class="portal-signature" aria-label="Portal Potala — pessoas mais presentes, um mundo mais vivo">
    <div><i></i><strong>Portal Potala</strong><i></i></div>
    <p>Pessoas mais presentes <span aria-hidden="true">·</span> Um mundo mais vivo</p>
  </div>`;
}

function renderUtility(regions) {
  const seen = new Set();
  const links = regions
    .filter((item) => !String(item.id).startsWith("novidade-") && /^[\w-]+\.html$/.test(item.href || ""))
    .filter((item) => !seen.has(item.href) && seen.add(item.href));
  return `<div class="closing-utility">
    <nav aria-label="Retomar a jornada">
      <p class="closing-eyebrow">A jornada permanece aberta</p>
      <div class="living-return-links">${links.map((item) => `<a href="${esc(item.href)}">${esc(item.title)}</a>`).join("")}</div>
    </nav>
    <div class="closing-contact">
      <p class="closing-eyebrow">A conversa fica aberta</p>
      <a href="mailto:contato@institutopotala.com?subject=Minha%20visita%20ao%20Potala">Escrever para o Instituto ↗</a>
      <a href="${whats("Olá! Gostaria de saber como receber as novidades do Potala.")}">Conversar pelo WhatsApp ↗</a>
      <address>Instituto Cultural Potala · Indaiatuba, SP · <a href="tel:+551938346147">(19) 3834-6147</a></address>
      <small>Os convites abrem seu e-mail ou WhatsApp. A mensagem só é enviada por você.</small>
    </div>
  </div>`;
}

export function renderLivingFooter(regions = []) {
  return `<footer class="living-footer closing-section" id="rodape-vivo" aria-labelledby="farewell-title" data-keeps-expansion>
    <div class="closing-paper-noise" aria-hidden="true"></div>
    <div class="closing-landscape" aria-hidden="true"></div>
    <div class="closing-foliage closing-foliage--left" aria-hidden="true"></div>
    <div class="closing-foliage closing-foliage--right" aria-hidden="true"></div>
    <a class="closing-pause" href="inspiracao.html#pausa" aria-label="Faça uma pausa com a gente"><i aria-hidden="true"></i><span>Faça uma pausa com a gente</span></a>
    <div class="closing-inner">
      ${renderJourneyEnd()}
      <div class="closing-spread">
        ${renderPlantCare()}
        ${renderDivider()}
        ${renderTakeaway()}
      </div>
      <p class="closing-whisper">Leve consigo<br>o que te faz bem.<i></i></p>
      ${renderSignature()}
      ${renderUtility(regions)}
    </div>
  </footer>`;
}

function readLocalPlant(storage) {
  try { return plantState(JSON.parse(storage?.getItem(PLANT_KEY) || "{}")); }
  catch { return plantState(); }
}

function writeLocalPlant(storage, state) {
  try { storage?.setItem(PLANT_KEY, JSON.stringify(state)); return true; }
  catch { return false; }
}

async function connectAccountPlant({ getState, applyState, setNotice, active }) {
  if (typeof document === "undefined" || !globalThis.supabase?.createClient) return () => {};
  try {
    const { createPlantCareRepository } = await import("./plant-care-repository.js");
    if (!active()) return () => {};
    const repository = createPlantCareRepository();
    const synchronize = async (user) => {
      if (!active() || !user) return;
      try {
        const remote = await repository.read();
        const merged = mergePlantStates(getState(), remote || {});
        applyState(merged);
        await repository.save(merged);
        setNotice("Seu cuidado está sincronizado com a sua conta.");
      } catch (error) {
        console.warn("Plantinha: não foi possível sincronizar com a conta.", error);
        setNotice("Seu cuidado continua guardado neste navegador. A sincronização será retomada quando possível.");
      }
    };
    const session = await repository.session();
    await synchronize(session?.user);
    const unsubscribe = repository.onAuthChange((user) => synchronize(user));
    connectAccountPlant.save = async (state) => {
      try { if ((await repository.session())?.user) await repository.save(state); }
      catch (error) { console.warn("Plantinha: cuidado salvo localmente; sincronização pendente.", error); }
    };
    return unsubscribe;
  } catch (error) {
    console.warn("Plantinha: armazenamento da conta indisponível.", error);
    return () => {};
  }
}
connectAccountPlant.save = async () => {};

export function mountLivingFooter(root) {
  const footer = root.querySelector?.("#rodape-vivo");
  if (!footer) return () => {};
  let storage;
  try { storage = globalThis.localStorage; } catch { storage = null; }
  let state = readLocalPlant(storage);
  let alive = true;
  let wateringTimer;
  let removeAccount = () => {};
  let sectionObserver;
  const takeaway = createTakeawayController(footer);
  const experience = footer.querySelector("[data-plant-stage]");
  const notice = footer.querySelector("[data-plant-storage]");

  const paint = (options) => paintPlant(footer, state, options);
  const applyState = (next) => {
    state = plantState(next);
    writeLocalPlant(storage, state);
    paint();
  };
  const setNotice = (message) => { if (notice) notice.textContent = message; };

  if (!storage) setNotice("Nesta visita, sua plantinha pode crescer. Este navegador não permitiu guardar seu progresso.");
  paint();

  connectAccountPlant({ getState: () => state, applyState, setNotice, active: () => alive })
    .then((remove) => { if (alive) removeAccount = remove; else remove(); });

  if (typeof IntersectionObserver !== "undefined") {
    sectionObserver = new IntersectionObserver(([entry]) => {
      document.body.classList.toggle("is-closing-section", entry.isIntersecting && entry.intersectionRatio > .08);
    }, { threshold: [.08, .2] });
    sectionObserver.observe(footer);
  }

  const onClick = (event) => {
    const target = event.target;
    if (target.closest("[data-water-plant]")) {
      if (state.lastDay >= localDay()) return;
      state = waterPlant(state);
      writeLocalPlant(storage, state);
      paint({ animate: true });
      clearTimeout(wateringTimer);
      wateringTimer = setTimeout(() => { delete experience.dataset.watering; }, 2100);
      connectAccountPlant.save(state);
      return;
    }
    const card = target.closest("[data-takeaway]");
    if (card) { takeaway.select(card.dataset.takeaway); return; }
    if (target.closest("[data-choose-gift]")) { takeaway.receive(); return; }
    if (target.closest("[data-save-gift]")) takeaway.save();
  };
  const onStorage = (event) => {
    if (event.key !== PLANT_KEY && event.key !== null) return;
    try { state = plantState(JSON.parse(event.newValue || "{}")); }
    catch { state = plantState(); }
    paint();
  };

  footer.addEventListener("click", onClick);
  window.addEventListener("storage", onStorage);
  window.addEventListener("pageshow", paint);
  return () => {
    alive = false;
    clearTimeout(wateringTimer);
    delete experience.dataset.watering;
    takeaway.destroy();
    sectionObserver?.disconnect();
    if (typeof document !== "undefined") document.body?.classList?.remove("is-closing-section");
    removeAccount();
    footer.removeEventListener("click", onClick);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("pageshow", paint);
  };
}
