import * as THREE from "three";
import { GLTFLoader } from "../../vendor/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "../../vendor/addons/libs/meshopt_decoder.module.js";

/*
 * A PAISAGEM DA JORNADA, EM TRÊS DIMENSÕES.
 *
 * Onde antes havia uma imagem — e depois um vídeo rebobinado pela rolagem —
 * agora há um modelo, e a rolagem move a CÂMERA por dentro dele. Descer a
 * página é caminhar pela trilha.
 *
 * O ganho sobre o vídeo não é de estilo. Um vídeo tem resolução, e por isso tem
 * teto: numa tela grande ele é ampliado e amolece, que foi o que custou boa
 * parte do trabalho anterior. Uma cena não tem — ela desenha no tamanho exato
 * que a tela pede. E não tem quadros: a rolagem vira posição contínua, sem o
 * picote de "um quadro a cada 53 pixels".
 *
 * O preço é o oposto. O vídeo só trabalhava quando alguém rolava; a cena
 * desenha enquanto estiver à vista. Daí boa parte do cuidado aqui ser sobre
 * QUANDO não desenhar.
 *
 * Esta cena é SEPARADA da do trajeto, de propósito. Aquela tem câmera com
 * alcance de 30 unidades, afinada para uma fita de poucos metros; este modelo
 * tem 4183 de comprimento. Reconciliar as duas escalas num renderizador só
 * custaria mexer num módulo delicado para economizar um contexto WebGL.
 */

const MODELO = "media/home-travessia.glb";

/* Abaixo disto o fundo é a webp RETRATO, e desenhar em tempo real é o oposto de
   barato. */
const LARGURA_MINIMA = 720;

const CONEXOES_LENTAS = new Set(["slow-2g", "2g"]);

/*
 * A densidade mínima da névoa.
 *
 * O modelo é um talhão com bordas em corte reto, sem céu e sem horizonte. É a
 * névoa que engole essa borda — e é por isso que ela tem um piso. Abrir a
 * visibilidade parece uma melhoria até alguém rolar até o fim e encontrar o
 * retângulo acabando no ar.
 */
export const PISO_DA_NEVOA = 0.0012;

/*
 * Onde a câmera fica, dado o quanto se rolou.
 *
 * As folgas nas duas pontas não são margem de segurança: são o que impede a
 * câmera de nascer ou terminar em cima do corte do talhão, onde nem a névoa
 * teria distância para esconder nada.
 */
export function pontoDoCaminho(progresso, { comprimento, folgaInicial = 0, folgaFinal = 0 } = {}) {
  const p = Math.min(1, Math.max(0, Number(progresso) || 0));
  const inicio = folgaInicial;
  const fim = comprimento - folgaFinal;
  return inicio + (fim - inicio) * p;
}

/*
 * A atmosfera, que é o que transforma um talhão de grama numa paisagem.
 *
 * A cor é a mesma para a névoa e para o céu, e isso é estrutural: onde a névoa
 * satura ela PRECISA virar o céu, senão fica visível a linha em que uma termina
 * e o outro começa — exatamente onde estaria a borda do modelo.
 *
 * O tom puxa para o quente porque a home inteira foi construída sobre a hora
 * dourada da paisagem que esta cena substitui: o ouro dos cards, a fita do
 * trajeto. Um céu neutro brigaria com tudo isso.
 */
export function atmosferaDoVale({ comprimento }) {
  const cor = [0.85, 0.74, 0.55];
  return {
    ceu: { cor },
    nevoa: {
      cor,
      /* Amarrada ao tamanho do modelo: a névoa tem de fechar dentro dele, seja
         qual for a escala com que ele foi exportado. */
      densidade: Math.max(PISO_DA_NEVOA, 3.2 / comprimento),
    },
  };
}

/*
 * Se vale a pena montar a cena.
 *
 * As mesmas regras que valiam para o vídeo, e por motivos parecidos, com uma a
 * mais: sem WebGL não há o que montar. Em todos os casos o que fica é a webp que
 * já está no fundo do elemento — a página nunca fica pior do que está.
 */
export function valeAPena({ largura, movimentoReduzido, conexao, temWebGL } = {}) {
  if (!temWebGL) return false;
  if (movimentoReduzido) return false;
  if (!(largura >= LARGURA_MINIMA)) return false;
  if (conexao?.saveData) return false;
  if (conexao?.effectiveType && CONEXOES_LENTAS.has(conexao.effectiveType)) return false;
  return true;
}

function suportaWebGL(documento) {
  try {
    const teste = documento.createElement("canvas");
    return Boolean(teste.getContext("webgl2") || teste.getContext("webgl"));
  } catch {
    return false;
  }
}

export function createLandscapeScene(paisagem, {
  janela = globalThis,
  documento = paisagem?.ownerDocument,
} = {}) {
  const inerte = { setProgress() {}, resize() {}, destroy() {} };
  const canvas = paisagem?.querySelector?.("canvas");
  if (!canvas || !documento) return inerte;

  const reduzido = janela.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  if (!valeAPena({
    largura: janela.innerWidth,
    movimentoReduzido: reduzido,
    conexao: janela.navigator?.connection,
    temWebGL: suportaWebGL(documento),
  })) return inerte;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch {
    return inerte;
  }

  /* Teto de 2: acima disso o custo por pixel dobra sem ganho que se veja num
     fundo enevoado. */
  renderer.setPixelRatio(Math.min(janela.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, 1, 1, 6000);

  /* Luz de céu e um sol rasante — o mínimo para o material ler, sem o peso de
     um HDRI. O modelo já traz boa parte da luz assada nas texturas. */
  cena.add(new THREE.HemisphereLight(0xffe9c4, 0x5b4a33, 2.2));
  const sol = new THREE.DirectionalLight(0xffd9a0, 3.2);
  sol.position.set(-40, 30, 40);
  cena.add(sol);

  let caminho = null;
  let progressoAtual = 0;
  let pedido = 0;
  let vivo = true;

  function medir() {
    const largura = Math.max(1, canvas.clientWidth || janela.innerWidth || 1);
    const altura = Math.max(1, canvas.clientHeight || janela.innerHeight || 1);
    renderer.setSize(largura, altura, false);
    camera.aspect = largura / altura;
    camera.updateProjectionMatrix();
  }

  /*
   * O CHÃO é procurado, e não deduzido da caixa.
   *
   * A primeira versão punha a câmera a uma fração da altura da caixa acima do
   * seu fundo, e ficou rasa: o `min.y` do modelo não é a superfície da trilha,
   * é o ponto mais baixo de QUALQUER geometria — a base do talhão, uma raiz, um
   * detalhe solto embaixo. Medido assim, o olho nascia dentro da grama, olhando
   * terra.
   *
   * Um raio lançado de cima para baixo responde a pergunta certa: onde está a
   * superfície NESTE ponto do caminho. Serve a qualquer modelo, em qualquer
   * escala, sem números escritos à mão.
   */
  const raio = new THREE.Raycaster();
  const paraBaixo = new THREE.Vector3(0, -1, 0);

  function alturaDoChao(x, z, padrao) {
    if (!caminho?.alvos?.length) return padrao;
    raio.set(new THREE.Vector3(x, caminho.teto, z), paraBaixo);
    const encontro = raio.intersectObjects(caminho.alvos, true)[0];
    return encontro ? encontro.point.y : padrao;
  }

  function posicionar() {
    if (!caminho) return;
    const z = caminho.origemZ + pontoDoCaminho(progressoAtual, caminho);
    const chao = alturaDoChao(caminho.centroX, z, caminho.chaoPadrao);
    const olho = chao + caminho.alturaDoOlho;

    camera.position.set(caminho.centroX, olho, z);

    /*
     * A mira é quase reta, e essa foi a correção que faltava.
     *
     * Apontando para o chão logo à frente, o quadro enche de terra e o horizonte
     * sobe para fora da tela — deixa de ser paisagem e vira close de trilha.
     * Mirando LONGE e na altura do próprio olho, o horizonte volta ao lugar e o
     * caminho tem para onde recuar, que é o que dá a sensação de avanço.
     */
    const adiante = z + caminho.comprimento * 0.9;
    camera.lookAt(caminho.centroX, olho * 0.995 + chao * 0.005, adiante);
  }

  function desenhar() {
    pedido = 0;
    if (!vivo || !caminho) return;

    /*
     * Com um bloco aberto, a cena PARA.
     *
     * O véu cobre a paisagem a 80% — o que se desenha ali quase não se vê. E é
     * justo esse o instante em que o painel amplia de zero à tela inteira, a
     * animação mais pesada da página. Desenhar o campo por trás dela disputa o
     * mesmo quadro, e quem perde é a animação, que está em primeiro plano.
     */
    if (documento.querySelector?.(".journey-region.is-expanded")) return;

    posicionar();
    renderer.render(cena, camera);
  }

  /* Um quadro por pedido, e só quando algo muda. Um laço contínuo desenharia a
     mesma imagem enquanto ninguém rola — a cena é movida pela mão, não pelo
     relógio. */
  function agendar() {
    if (pedido || !vivo) return;
    pedido = janela.requestAnimationFrame?.(desenhar) ?? 0;
  }

  const carregador = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  carregador.load(MODELO, (gltf) => {
    if (!vivo) return;
    cena.add(gltf.scene);

    /*
     * A cena é medida, e não configurada à mão.
     *
     * O modelo pode ser reexportado noutra escala ou reenquadrado, e números
     * escritos aqui envelheceriam em silêncio — a câmera acabaria dentro do
     * chão ou fora do talhão. A caixa que ele ocupa responde tudo: onde a
     * trilha começa, quanto ela anda e a que altura fica o olho.
     */
    const caixa = new THREE.Box3().setFromObject(gltf.scene);
    const tamanho = caixa.getSize(new THREE.Vector3());
    const centro = caixa.getCenter(new THREE.Vector3());

    caminho = {
      comprimento: tamanho.z,
      /*
       * As folgas são desiguais, e a da frente é grande de propósito.
       *
       * Ela não é margem: é a DISTÂNCIA que a névoa precisa para engolir a borda
       * do talhão. Com a névoa exponencial usada aqui, o corte só desaparece por
       * volta de 1,7 vezes o inverso da densidade — cerca de 1400 unidades neste
       * modelo. Parando a 376 da ponta, como na primeira tentativa, o retângulo
       * terminava à vista de quem chegasse ao pé da jornada.
       *
       * O preço é que a câmera percorre 57% do talhão em vez de 85%. Vale: o
       * trecho perdido é justamente o que não teria como ser mostrado.
       */
      folgaInicial: tamanho.z * 0.08,
      folgaFinal: tamanho.z * 0.35,
      centroX: centro.x,
      origemZ: caixa.min.z,
      /* De onde o raio parte: acima de tudo, para nunca começar dentro da
         geometria e perder a superfície. */
      teto: caixa.max.y + tamanho.y,
      chaoPadrao: centro.y,
      /*
       * A altura do olho sai do COMPRIMENTO do talhão, não da altura dele.
       *
       * A altura da caixa é acidental — depende de uma árvore alta ou de uma
       * touceira solta. O comprimento é a medida da paisagem, e é dela que sai
       * uma proporção estável entre o olho e o que se vê à frente.
       */
      alturaDoOlho: tamanho.z * 0.02,
      alvos: [gltf.scene],
    };

    const atmosfera = atmosferaDoVale({ comprimento: tamanho.z });
    const cor = new THREE.Color(...atmosfera.ceu.cor);
    cena.background = cor;
    cena.fog = new THREE.FogExp2(cor, atmosfera.nevoa.densidade);

    paisagem.dataset.cenaPronta = "true";
    medir();
    agendar();
  }, undefined, () => {
    /* Um modelo que não carrega não deixa buraco: a webp está por baixo, e o
       atributo que a esconderia nunca chega a ser posto. */
    delete paisagem.dataset.cenaPronta;
  });

  return {
    setProgress(progresso) {
      progressoAtual = progresso;
      agendar();
    },
    resize() {
      medir();
      agendar();
    },
    destroy() {
      vivo = false;
      if (pedido) janela.cancelAnimationFrame?.(pedido);
      delete paisagem.dataset.cenaPronta;
      cena.traverse((obj) => {
        obj.geometry?.dispose?.();
        const materiais = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of materiais) {
          if (!m) continue;
          /* As texturas ficam espalhadas em campos de nome variável do material
             (`map`, `normalMap`, `roughnessMap`…), e cada uma segura memória de
             GPU até ser descartada explicitamente. */
          for (const chave of Object.keys(m)) {
            if (m[chave]?.isTexture) m[chave].dispose();
          }
          m.dispose?.();
        }
      });
      renderer.dispose();
    },
  };
}
