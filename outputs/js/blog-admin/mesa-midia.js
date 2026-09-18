/*
 * A BIBLIOTECA DE IMAGENS.
 *
 * Um lugar só para escolher foto: as que a equipe enviou (guardadas no banco
 * do Portal) e as que o site já usa. Enviar é arrastar ou clicar; cada envio
 * mostra o progresso, e um envio que falhou fica na tela com "Tentar de novo"
 * — nunca some calado. A mesma imagem enviada duas vezes é reaproveitada.
 */
import { icone } from "../admin/icones.js";
import { validarImagem } from "../blog/blog-remoto.js";
import { esc } from "./mesa-ui.js";

export const CAMINHO_MANIFESTO = "media/manifest.json";

/* Máscaras e camadas de efeito da Home não são fotos: ficam fora da escolha. */
const NAO_E_FOTO = /(mask|overlay|depth|canopy|chegada-water|-copia|copia\.|potala-mark|grama-borda|medieval-road)/i;
const LARGURA_BOA = 1200;

const normalizar = (texto) => String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const tamanho = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/* Versões para celular e PNGs que já têm um WEBP gêmeo são a mesma foto: aparecem uma vez só. */
export function fotosDoSite(manifesto) {
  const imagens = Array.isArray(manifesto?.imagens) ? manifesto.imagens : [];
  const nomes = new Set(imagens.map((item) => item.arquivo));
  return imagens
    .filter((item) => /\.(webp|jpe?g|png)$/i.test(item.arquivo) && !NAO_E_FOTO.test(item.arquivo))
    .filter((item) => !/-mobile\.\w+$/i.test(item.arquivo))
    .filter((item) => !(/\.png$/i.test(item.arquivo) && nomes.has(item.arquivo.replace(/\.png$/i, ".webp"))))
    .map((item) => ({ nome: item.arquivo, url: `media/${item.arquivo}`, largura: item.largura, altura: item.altura, bytes: item.bytes, origem: "site" }));
}

async function medir(arquivo) {
  try {
    const bitmap = await createImageBitmap(arquivo);
    const medida = { largura: bitmap.width, altura: bitmap.height };
    bitmap.close?.();
    return medida;
  } catch {
    return null;
  }
}

export function criarBiblioteca({ dialogo, repositorio, avisos, carregarManifesto = () => fetch(CAMINHO_MANIFESTO).then((resposta) => resposta.json()) }) {
  let aba = "enviadas";
  let termo = "";
  let multiplo = false;
  let selecionados = [];
  let enviadas = [];
  let site = [];
  let falhaAoLer = "";
  let envios = [];
  let resolver = null;
  let sequencia = 0;

  const demonstracao = () => Boolean(repositorio.demonstracao);

  async function carregar() {
    falhaAoLer = "";
    const [daMesa, doSite] = await Promise.allSettled([repositorio.listarMidia(), carregarManifesto()]);
    if (daMesa.status === "fulfilled") enviadas = daMesa.value;
    else falhaAoLer = daMesa.reason?.message || "Não foi possível ler as imagens enviadas.";
    site = doSite.status === "fulfilled" ? fotosDoSite(doSite.value) : [];
  }

  function itensDaAba() {
    const lista = aba === "site" ? site : enviadas;
    const alvo = normalizar(termo).trim();
    return alvo ? lista.filter((item) => normalizar(item.nome).includes(alvo)) : lista;
  }

  function envioHtml(envio) {
    const pronto = Math.round((envio.progresso || 0) * 100);
    return `<li class="mesa-envio${envio.erro ? " is-erro" : ""}" data-envio="${envio.id}">
      ${icone(envio.erro ? "circle-alert" : envio.progresso >= 1 ? "check" : "loader-circle", { classe: `mesa-icone${!envio.erro && envio.progresso < 1 ? " is-girando" : ""}` })}
      <span class="mesa-envio__nome">${esc(envio.nome)}</span>
      ${envio.erro
        ? `<span class="mesa-envio__erro">${esc(envio.erro)}</span>${envio.podeRepetir ? `<button type="button" class="mesa-botao mesa-botao--contorno mesa-botao--pequeno" data-midia-repetir="${envio.id}">${icone("rotate-ccw", { classe: "mesa-icone" })}Tentar de novo</button>` : ""}<button type="button" class="mesa-envio__tirar" data-midia-tirar="${envio.id}" aria-label="Tirar da lista">${icone("x", { classe: "mesa-icone" })}</button>`
        : `<span class="mesa-envio__barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pronto}" aria-label="Enviando ${esc(envio.nome)}"><span style="width:${pronto}%"></span></span>`}
      ${envio.nota ? `<small class="mesa-envio__nota">${esc(envio.nota)}</small>` : ""}
    </li>`;
  }

  function gradeHtml() {
    if (aba === "enviadas" && demonstracao()) {
      return `<div class="mesa-vazio">${icone("upload", { classe: "mesa-icone" })}<p>Na demonstração o envio de imagens fica desligado.</p><button type="button" class="mesa-botao mesa-botao--contorno" data-midia-aba="site">Ver as fotos do site</button></div>`;
    }
    if (aba === "enviadas" && falhaAoLer) {
      return `<div class="mesa-vazio is-erro" role="alert">${icone("circle-alert", { classe: "mesa-icone" })}<p>${esc(falhaAoLer)}</p><button type="button" class="mesa-botao mesa-botao--contorno" data-midia-recarregar>Tentar de novo</button></div>`;
    }
    const itens = itensDaAba();
    if (!itens.length) {
      return termo
        ? `<div class="mesa-vazio">${icone("search", { classe: "mesa-icone" })}<p>Nenhuma imagem com “${esc(termo)}”.</p></div>`
        : `<div class="mesa-vazio">${icone("images", { classe: "mesa-icone" })}<p>${aba === "site" ? "Nenhuma foto do site disponível." : "Nenhuma imagem enviada ainda. Arraste uma foto para cá."}</p></div>`;
    }
    return `<ul class="mesa-midia__grade" role="listbox" aria-label="Imagens" ${multiplo ? 'aria-multiselectable="true"' : ""}>${itens.map((item) => {
      const escolhida = selecionados.includes(item.url);
      const medida = item.largura ? `${item.largura}×${item.altura}` : item.bytes ? tamanho(item.bytes) : "";
      return `<li><button type="button" role="option" aria-selected="${escolhida}" data-midia-url="${esc(item.url)}" class="${escolhida ? "is-escolhida" : ""}">
        <img src="${esc(item.url)}" alt="" loading="lazy" decoding="async">
        <span class="mesa-midia__nome">${esc(item.nome.replace(/^[0-9a-f]{16}-/, ""))}</span>
        ${medida ? `<small>${esc(medida)}</small>` : ""}
        <span class="mesa-midia__marca" aria-hidden="true">${icone("check", { classe: "mesa-icone" })}</span>
      </button></li>`;
    }).join("")}</ul>`;
  }

  function desenharEnvios() {
    const lista = dialogo.querySelector("[data-midia-envios]");
    if (lista) lista.innerHTML = envios.map(envioHtml).join("");
  }

  function desenharGrade() {
    const alvo = dialogo.querySelector("[data-midia-grade]");
    if (alvo) alvo.innerHTML = gradeHtml();
    for (const botao of dialogo.querySelectorAll("[data-midia-aba]")) botao.setAttribute("aria-selected", String(botao.dataset.midiaAba === aba));
    const usar = dialogo.querySelector("[data-midia-usar]");
    if (usar) {
      usar.disabled = !selecionados.length;
      usar.textContent = multiplo && selecionados.length > 1 ? `Usar ${selecionados.length} imagens` : "Usar imagem";
    }
  }

  function desenhar() {
    dialogo.innerHTML = `<div class="mesa-midia">
      <header class="mesa-midia__topo">
        <h2 data-midia-titulo>Escolher imagem</h2>
        <button type="button" class="mesa-botao-icone" data-midia-fechar aria-label="Fechar">${icone("x", { classe: "mesa-icone" })}</button>
      </header>
      <div class="mesa-midia__barra">
        <div class="mesa-abas" role="tablist" aria-label="Origem das imagens">
          <button type="button" role="tab" data-midia-aba="enviadas">Enviadas</button>
          <button type="button" role="tab" data-midia-aba="site">Do site</button>
        </div>
        <label class="mesa-busca">${icone("search", { classe: "mesa-icone" })}<span class="sr-only">Buscar imagem</span><input type="search" data-midia-busca placeholder="Buscar pelo nome" value="${esc(termo)}"></label>
      </div>
      <label class="mesa-midia__soltar" data-midia-soltar>
        ${icone("upload", { classe: "mesa-icone" })}
        <span><strong>Arraste imagens aqui</strong> ou clique para enviar</span>
        <small>JPG, PNG ou WEBP · até 5 MB · de preferência com 1600 px de largura</small>
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple data-midia-arquivo class="sr-only">
      </label>
      <ul class="mesa-midia__envios" data-midia-envios aria-live="polite"></ul>
      <div class="mesa-midia__corpo" data-midia-grade></div>
      <footer class="mesa-midia__rodape">
        <button type="button" class="mesa-botao mesa-botao--contorno" data-midia-fechar>Cancelar</button>
        <button type="button" class="mesa-botao mesa-botao--principal" data-midia-usar disabled>Usar imagem</button>
      </footer>
    </div>`;
    desenharEnvios();
    desenharGrade();
  }

  async function enviarUm(envio) {
    envio.erro = "";
    envio.progresso = 0;
    desenharEnvios();
    const barra = () => dialogo.querySelector(`[data-envio="${envio.id}"] .mesa-envio__barra`);
    try {
      const { url, repetida } = await repositorio.enviarImagem(envio.arquivo, {
        aoProgresso(fracao) {
          envio.progresso = fracao;
          const alvo = barra();
          if (alvo) {
            alvo.firstElementChild.style.width = `${Math.round(fracao * 100)}%`;
            alvo.setAttribute("aria-valuenow", String(Math.round(fracao * 100)));
          }
        },
      });
      envio.progresso = 1;
      if (!enviadas.some((item) => item.url === url)) {
        enviadas = [{ nome: url.split("/").pop(), url, bytes: envio.arquivo.size, largura: envio.medida?.largura, altura: envio.medida?.altura, origem: "enviada" }, ...enviadas];
      }
      if (repetida) avisos.mostrar("Essa imagem já estava na biblioteca: usamos a mesma.", { tipo: "info" });
      selecionados = multiplo ? [...new Set([...selecionados, url])] : [url];
      aba = "enviadas";
      envios = envios.filter((item) => item !== envio || item.nota);
      if (envio.nota) envio.concluido = true;
      desenharEnvios();
      desenharGrade();
    } catch (erro) {
      envio.erro = erro.message || "O envio falhou.";
      envio.podeRepetir = true;
      desenharEnvios();
    }
  }

  async function receber(arquivos) {
    const lista = [...(arquivos || [])];
    for (const arquivo of lista) {
      const envio = { id: `envio-${(sequencia += 1)}`, nome: arquivo.name || "imagem", arquivo, progresso: 0 };
      const problema = validarImagem(arquivo);
      if (problema) {
        envio.erro = problema;
        envios.push(envio);
        continue;
      }
      envio.medida = await medir(arquivo);
      if (envio.medida && envio.medida.largura < LARGURA_BOA) {
        envio.nota = `A imagem tem ${envio.medida.largura} px de largura: pode ficar borrada em tela grande.`;
      }
      envios.push(envio);
    }
    desenharEnvios();
    for (const envio of envios.filter((item) => !item.erro && !item.concluido && item.progresso === 0)) {
      if (demonstracao()) {
        envio.erro = "Na demonstração o envio de imagens fica desligado.";
        continue;
      }
      await enviarUm(envio);
    }
    desenharEnvios();
  }

  function fechar(resultado) {
    const aoFechar = resolver;
    resolver = null;
    if (dialogo.open) dialogo.close();
    aoFechar?.(resultado);
  }

  dialogo.addEventListener("click", (evento) => {
    const alvo = evento.target;
    if (alvo === dialogo) { fechar(null); return; }
    if (alvo.closest("[data-midia-fechar]")) { fechar(null); return; }
    const trocaDeAba = alvo.closest("[data-midia-aba]");
    if (trocaDeAba) { aba = trocaDeAba.dataset.midiaAba; desenharGrade(); return; }
    if (alvo.closest("[data-midia-recarregar]")) { carregar().then(desenharGrade); return; }
    const repetir = alvo.closest("[data-midia-repetir]");
    if (repetir) { const envio = envios.find((item) => item.id === repetir.dataset.midiaRepetir); if (envio) enviarUm(envio); return; }
    const tirar = alvo.closest("[data-midia-tirar]");
    if (tirar) { envios = envios.filter((item) => item.id !== tirar.dataset.midiaTirar); desenharEnvios(); return; }
    const imagem = alvo.closest("[data-midia-url]");
    if (imagem) {
      const url = imagem.dataset.midiaUrl;
      if (multiplo) selecionados = selecionados.includes(url) ? selecionados.filter((item) => item !== url) : [...selecionados, url];
      else selecionados = [url];
      desenharGrade();
      dialogo.querySelector(`[data-midia-url="${CSS.escape(url)}"]`)?.focus();
      return;
    }
    if (alvo.closest("[data-midia-usar]") && selecionados.length) fechar([...selecionados]);
  });
  dialogo.addEventListener("dblclick", (evento) => {
    const imagem = evento.target.closest("[data-midia-url]");
    if (imagem && !multiplo) fechar([imagem.dataset.midiaUrl]);
  });
  dialogo.addEventListener("input", (evento) => {
    if (!evento.target.matches("[data-midia-busca]")) return;
    termo = evento.target.value;
    desenharGrade();
  });
  dialogo.addEventListener("change", (evento) => {
    if (!evento.target.matches("[data-midia-arquivo]")) return;
    receber(evento.target.files);
    evento.target.value = "";
  });
  dialogo.addEventListener("dragover", (evento) => {
    if (![...(evento.dataTransfer?.types || [])].includes("Files")) return;
    evento.preventDefault();
    dialogo.querySelector("[data-midia-soltar]")?.classList.add("is-sobre");
  });
  dialogo.addEventListener("dragleave", (evento) => {
    if (!dialogo.contains(evento.relatedTarget)) dialogo.querySelector("[data-midia-soltar]")?.classList.remove("is-sobre");
  });
  dialogo.addEventListener("drop", (evento) => {
    if (!evento.dataTransfer?.files?.length) return;
    evento.preventDefault();
    dialogo.querySelector("[data-midia-soltar]")?.classList.remove("is-sobre");
    receber(evento.dataTransfer.files);
  });
  dialogo.addEventListener("cancel", (evento) => { evento.preventDefault(); fechar(null); });

  return {
    /* Abre a biblioteca e devolve os endereços escolhidos (ou null). */
    async escolher({ titulo = "Escolher imagem", varias = false, atual = "", arquivos = null } = {}) {
      if (resolver) fechar(null);
      multiplo = varias;
      selecionados = atual ? [atual] : [];
      termo = "";
      envios = [];
      aba = demonstracao() ? "site" : "enviadas";
      if (atual && site.some((item) => item.url === atual)) aba = "site";
      desenhar();
      dialogo.querySelector("[data-midia-titulo]").textContent = titulo;
      dialogo.showModal();
      const resultado = new Promise((resolverPromessa) => { resolver = resolverPromessa; });
      await carregar();
      if (atual && site.some((item) => item.url === atual)) aba = "site";
      desenharGrade();
      if (arquivos?.length) receber(arquivos);
      return resultado;
    },
  };
}
