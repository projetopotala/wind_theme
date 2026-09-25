import { useEffect, useRef } from "react";
import { movimentoReduzido } from "../movimento/consultas.js";

/*
 * NÉVOA SOBRE O VALE (three.js).
 *
 * Um plano de tela inteira com um shader de névoa quente: faixas lentas que
 * derivam sobre o vale e uma luz baixa onde nasce o sol da fotografia. A
 * rolagem dissipa a névoa (`progresso`, de 0 a 1, vem da coreografia da
 * abertura) — descer abre a paisagem, subir a encobre de novo.
 *
 * É ornamento: sem WebGL, com movimento reduzido ou fora da tela, nada é
 * desenhado e a fotografia continua inteira. O three.js chega sob demanda, do
 * mesmo arquivo em vendor/ que a Travessia usa (importmap).
 */

const VERTICE = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAGMENTO = `
precision mediump float;
varying vec2 vUv;
uniform float uTempo;
uniform float uProgresso;
uniform float uProporcao;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ruido(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * ruido(p); p *= 2.02; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = vec2(vUv.x * uProporcao, vUv.y);
  float t = uTempo * 0.0025;
  float faixa = fbm(uv * vec2(1.6, 3.2) + vec2(t, 0.0));
  float fino = fbm(uv * vec2(3.4, 6.0) - vec2(t * 1.7, t * 0.3));
  float nevoa = smoothstep(0.38, 0.86, faixa * 0.75 + fino * 0.45);
  // Mais densa no fundo do vale, rala no céu.
  float altura = smoothstep(0.95, 0.25, vUv.y);
  float dissipar = 1.0 - smoothstep(0.0, 0.85, uProgresso);
  float alfa = nevoa * altura * 0.42 * dissipar;
  // Luz baixa de amanhecer, à esquerda do centro, que também se abre com a rolagem.
  float luz = exp(-9.0 * distance(vUv, vec2(0.46, 0.68))) * (0.28 + 0.12 * dissipar);
  vec3 cor = mix(vec3(0.96, 0.9, 0.8), vec3(1.0, 0.86, 0.62), luz * 2.0);
  gl_FragColor = vec4(cor, clamp(alfa + luz * 0.5, 0.0, 0.62));
}
`;

export default function NevoaTres({ progresso }) {
  const tela = useRef(null);

  useEffect(() => {
    const canvas = tela.current;
    if (!canvas || movimentoReduzido()) return;
    let desfazer = () => {};
    let cancelado = false;

    import("three")
      .then((THREE) => {
        if (cancelado) return;
        let renderizador;
        try {
          renderizador = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "low-power" });
        } catch {
          return;
        }
        const cena = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const material = new THREE.ShaderMaterial({
          vertexShader: VERTICE,
          fragmentShader: FRAGMENTO,
          transparent: true,
          depthWrite: false,
          uniforms: { uTempo: { value: 0 }, uProgresso: { value: 0 }, uProporcao: { value: 1 } },
        });
        const geometria = new THREE.PlaneGeometry(2, 2);
        cena.add(new THREE.Mesh(geometria, material));

        const medir = () => {
          const { width, height } = canvas.getBoundingClientRect();
          if (!width || !height) return;
          renderizador.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
          renderizador.setSize(width, height, false);
          material.uniforms.uProporcao.value = width / height;
        };
        const observadorTamanho = new ResizeObserver(medir);
        observadorTamanho.observe(canvas);
        medir();

        let visivel = false;
        let quadro = 0;
        let antes = performance.now();
        const desenhar = (agora) => {
          quadro = 0;
          if (!visivel || document.hidden) return;
          material.uniforms.uTempo.value += Math.min(agora - antes, 64) / 1000 * 60;
          antes = agora;
          material.uniforms.uProgresso.value = progresso.current;
          renderizador.render(cena, camera);
          // Névoa já dissipada: um último quadro limpo e o laço descansa até a volta.
          if (progresso.current < 0.99) quadro = requestAnimationFrame(desenhar);
        };
        const acordar = () => {
          if (!quadro && visivel && !document.hidden) {
            antes = performance.now();
            quadro = requestAnimationFrame(desenhar);
          }
        };
        const observadorVisao = new IntersectionObserver(([entrada]) => {
          visivel = entrada.isIntersecting;
          acordar();
        });
        observadorVisao.observe(canvas);
        document.addEventListener("visibilitychange", acordar);
        window.addEventListener("scroll", acordar, { passive: true });

        desfazer = () => {
          cancelAnimationFrame(quadro);
          observadorTamanho.disconnect();
          observadorVisao.disconnect();
          document.removeEventListener("visibilitychange", acordar);
          window.removeEventListener("scroll", acordar);
          geometria.dispose();
          material.dispose();
          renderizador.dispose();
        };
      })
      .catch(() => {});

    return () => {
      cancelado = true;
      desfazer();
    };
  }, [progresso]);

  return <canvas ref={tela} className="abertura__nevoa" aria-hidden="true" />;
}
