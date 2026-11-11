// Home | microanimacoes naturais SOMENTE na cena de terapia (#ensaio-atendimentos).
//
// A foto (ambiente.webp) continua sendo a unica imagem da cena. Um <canvas> WebGL2, do mesmo tamanho
// da foto, e sobreposto a ela e redesenha a MESMA foto com dois efeitos localizados:
//   1. folhas da planta alta: deslocamento minimo e continuo (brisa leve), modulado por uma mascara
//      pequena (ambiente-viva-mascara.webp) e por ondas lentas fora de fase - nada se move em bloco;
//   2. vela: oscilacao lateral da chama + brilho aditivo bem discreto ao redor dela.
// Fora dessas regioes o deslocamento e exatamente zero (pixel identico a foto original).
// Como o desenho e "backward warp" (cada pixel le a foto original), nao ha duplicacao nem fantasma.
//
// Cuidados: so inicia com a cena visivel; pausa fora da tela ou com a aba oculta; limita a ~30 quadros
// por segundo; respeita prefers-reduced-motion (nada e criado); sem WebGL2 ou em qualquer falha a
// foto estatica segue exatamente como estava.

const CENA = "ensaio-atendimentos";
const MASCARA = "media/atendimentos-conceito/ambiente-viva-mascara.webp";
const INTERVALO_MS = 1000 / 30;
const LIMITE_DT_MEDIO_MS = 100; // media acima disso (< 10 quadros/s) desliga o efeito

// Posicao da chama na foto (fracao da largura/altura de 1600x900).
const CHAMA = [0.6115, 0.3955];

const VERTICE = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAGMENTO = `#version 300 es
precision highp float;
in vec2 uv; out vec4 cor;
uniform sampler2D foto; uniform sampler2D mascara;
uniform float t; uniform vec2 tam;
uniform vec2 chama; uniform float oscila; uniform float brilho;
void main(){
  vec2 q = vec2(uv.x, 1.0 - uv.y);                // coordenada na foto (origem no topo)
  float m = texture(mascara, q).r;                // 0 fora da folhagem
  vec2 px = 1.0 / tam;
  vec2 d = vec2(0.0);

  if (m > 0.002) {
    float rajada = 0.55 + 0.45 * sin(t * 0.37 + 1.3) * sin(t * 0.23 + 0.4);
    float a = sin(t * 0.83 + q.x * 31.0 + q.y * 17.0);
    float b = sin(t * 1.27 + q.x * 53.0 - q.y * 41.0 + 2.1);
    float c = sin(t * 0.52 + q.y * 23.0 - q.x * 11.0 + 4.0);
    d.x = (a * 0.62 + b * 0.38) * rajada * 2.6 * m;      // px da foto original
    d.y = (c * 0.6 + b * 0.4) * rajada * 0.9 * m;
    d *= px;
  }

  // chama: deslocamento lateral crescente com a altura, apenas num raio de ~9 px.
  vec2 rel = (q - chama) * tam;                    // px relativos a base da chama
  float perto = 1.0 - smoothstep(5.0, 11.0, length(vec2(rel.x, rel.y + 3.0)));
  float alt = clamp((-rel.y + 2.0) / 9.0, 0.0, 1.0);
  d.x += oscila * 1.4 * alt * perto * px.x;

  vec3 c0 = texture(foto, q - d).rgb;

  // brilho aditivo discreto (halo quente) + leve variacao do nucleo da chama
  float r = length(rel + vec2(0.0, 4.0));
  float halo = exp(-r * r / (2.0 * 26.0 * 26.0));
  float nucleo = exp(-r * r / (2.0 * 5.0 * 5.0));
  c0 += vec3(1.0, 0.62, 0.28) * (halo * 0.07 + nucleo * 0.10) * brilho;
  cor = vec4(c0, 1.0);
}`;

function ruido(t) {
  // soma de senos incomensuraveis: variacao natural, sem repeticao mecanica evidente
  return (
    Math.sin(t * 5.1) * 0.45 +
    Math.sin(t * 8.7 + 1.7) * 0.3 +
    Math.sin(t * 13.3 + 0.6) * 0.15 +
    Math.sin(t * 2.3 + 3.1) * 0.1
  );
}

function carregar(src) {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => ok(img);
    img.onerror = erro;
    img.src = src;
  });
}

function compilar(gl, tipo, fonte) {
  const s = gl.createShader(tipo);
  gl.shaderSource(s, fonte);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

function textura(gl, unidade, imagem) {
  const tx = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unidade);
  gl.bindTexture(gl.TEXTURE_2D, tx);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imagem);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tx;
}

function iniciar() {
  const cena = document.getElementById(CENA);
  const foto = cena?.querySelector(".home-scene__photo");
  const base = foto?.querySelector(".home-scene__main-image");
  if (!cena || !foto || !base) return;
  if (typeof window.matchMedia !== "function") return;
  const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reduzido.matches) return;
  if (!/(^|\/)ambiente\.webp(\?|$)/.test(base.getAttribute("src") || "")) return;

  let estado = null; // { canvas, gl, ... }
  let visivel = false;
  let rodando = false;
  let ultimo = 0;
  let pronto = false;
  let iniciando = false;
  let desativado = false;
  let somaDt = 0;
  let amostras = 0;

  const ajustarEncaixe = () => {
    if (!estado) return;
    const cs = getComputedStyle(base);
    const c = estado.canvas.style;
    c.objectFit = cs.objectFit;
    c.objectPosition = cs.objectPosition;
    c.filter = cs.filter;
  };

  const parar = () => {
    rodando = false;
  };

  // Remove o canvas e impede nova tentativa (falha de GPU, movimento reduzido, imagem trocada).
  const desligar = (definitivo = false) => {
    parar();
    estado?.canvas.remove();
    estado = null;
    pronto = false;
    if (definitivo) desativado = true;
  };

  const quadro = (agora) => {
    if (!rodando || !estado) return;
    requestAnimationFrame(quadro);
    const dt = agora - ultimo;
    if (dt < INTERVALO_MS) return;
    // Vigia de desempenho: se, em media, a pagina nao consegue ~10 quadros/s (maquina sem GPU, por
    // exemplo), o efeito se desliga e a foto estatica fica - melhor parada do que travada.
    if (ultimo && dt < 1000) {
      somaDt += dt;
      amostras += 1;
      if (amostras === 60) {
        if (somaDt / amostras > LIMITE_DT_MEDIO_MS) return desligar(true);
        somaDt = 0;
        amostras = 0;
      }
    }
    ultimo = agora;
    const { gl, u } = estado;
    const t = agora / 1000;
    const f = ruido(t);
    gl.uniform1f(u.t, t);
    gl.uniform1f(u.oscila, f);
    gl.uniform1f(u.brilho, 0.85 + 0.15 * ruido(t * 0.7 + 9.0));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const retomar = () => {
    if (rodando || !pronto || !visivel || document.hidden || reduzido.matches) return;
    rodando = true;
    ultimo = 0;
    requestAnimationFrame(quadro);
  };

  const montar = async () => {
    if (iniciando || estado || desativado) return;
    iniciando = true;
    try {
      if (!base.complete || !base.naturalWidth) await base.decode().catch(() => {});
      const [imgFoto, imgMascara] = await Promise.all([carregar(base.currentSrc || base.src), carregar(MASCARA)]);
      const canvas = document.createElement("canvas");
      canvas.className = "home-scene__live";
      canvas.setAttribute("aria-hidden", "true");
      canvas.width = imgFoto.naturalWidth;
      canvas.height = imgFoto.naturalHeight;
      const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, powerPreference: "low-power" });
      if (!gl) {
        desativado = true;
        return;
      }
      // Sem aceleracao de GPU (renderizador por software) o efeito pesaria na CPU: mantem a foto estatica.
      const infoGpu = gl.getExtension("WEBGL_debug_renderer_info");
      const placa = infoGpu ? String(gl.getParameter(infoGpu.UNMASKED_RENDERER_WEBGL)) : "";
      if (/swiftshader|llvmpipe|software|basic render/i.test(placa)) {
        desativado = true;
        return;
      }
      const prog = gl.createProgram();
      gl.attachShader(prog, compilar(gl, gl.VERTEX_SHADER, VERTICE));
      gl.attachShader(prog, compilar(gl, gl.FRAGMENT_SHADER, FRAGMENTO));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "p");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      textura(gl, 0, imgFoto);
      textura(gl, 1, imgMascara);
      const u = {
        t: gl.getUniformLocation(prog, "t"),
        oscila: gl.getUniformLocation(prog, "oscila"),
        brilho: gl.getUniformLocation(prog, "brilho"),
      };
      gl.uniform1i(gl.getUniformLocation(prog, "foto"), 0);
      gl.uniform1i(gl.getUniformLocation(prog, "mascara"), 1);
      gl.uniform2f(gl.getUniformLocation(prog, "tam"), canvas.width, canvas.height);
      gl.uniform2f(gl.getUniformLocation(prog, "chama"), CHAMA[0], CHAMA[1]);
      gl.viewport(0, 0, canvas.width, canvas.height);

      // O canvas ocupa o mesmo retangulo da <img> e usa o mesmo enquadramento (object-fit/position).
      const cs = canvas.style;
      cs.position = "absolute";
      cs.inset = "0";
      cs.width = "100%";
      cs.height = "100%";
      cs.display = "block";
      cs.pointerEvents = "none";
      estado = { canvas, gl, u };
      // Perda de contexto (memoria da GPU, troca de placa, aba em segundo plano): desliga o efeito e a
      // foto estatica, que ja esta embaixo, volta a ser a unica imagem. Nao tenta recriar.
      canvas.addEventListener("webglcontextlost", (ev) => {
        ev.preventDefault();
        desligar(true);
      });
      ajustarEncaixe();
      gl.uniform1f(u.t, 0);
      gl.uniform1f(u.oscila, 0);
      gl.uniform1f(u.brilho, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3); // primeiro quadro (identico a foto) antes de aparecer
      base.after(canvas);
      pronto = true;
      retomar();
    } catch {
      desligar(true);
    } finally {
      iniciando = false;
    }
  };

  new IntersectionObserver(
    (entradas) => {
      visivel = entradas.some((e) => e.isIntersecting);
      if (visivel) {
        if (!estado) montar();
        else retomar();
      } else parar();
    },
    { threshold: 0.15 },
  ).observe(cena);

  document.addEventListener("visibilitychange", () => (document.hidden ? parar() : retomar()));
  reduzido.addEventListener?.("change", () => {
    if (reduzido.matches) desligar(true);
  });
  // Ao sair da pagina o laco para; se ela voltar do cache de navegacao, retoma se a cena estiver visivel.
  window.addEventListener("pagehide", parar);
  window.addEventListener("pageshow", (ev) => {
    if (ev.persisted) retomar();
  });
  window.addEventListener("resize", ajustarEncaixe, { passive: true });
  // Se a imagem principal for trocada pelo editor, a foto estatica nova prevalece.
  new MutationObserver(() => {
    if (!/(^|\/)ambiente\.webp(\?|$)/.test(base.getAttribute("src") || "")) {
      desligar(true);
    }
  }).observe(base, { attributes: true, attributeFilter: ["src"] });
}

iniciar();
