// Mudanças curtas e assimétricas: a linha procura o próximo encontro sem
// serpentear de um lado ao outro a cada tela.
const X_PATTERN = [-0.06, 0.06, -0.08, 0.04, 0.12, -0.04, -0.09, 0.07, -0.03];

export function buildHomePathLayout(blocks = []) {
  /*
   * Um ponto de curva por PAR, não por bloco.
   *
   * Os dois blocos de um par dividem a mesma passagem de rolagem, então dois
   * pontos ali dariam à curva duas dobras onde o visitante percorre uma só — a
   * linha serpentearia duas vezes por tela enquanto a página anda uma.
   */
  const todos = Array.isArray(blocks) ? blocks : [];
  const safeBlocks = todos.filter((_, index) => index % 2 === 0);
  const count = Math.max(1, safeBlocks.length);
  const spacing = 2.15;
  const checkpoints = safeBlocks.map((block, index) => ({
    id: block.id,
    side: block.side === "right" ? "right" : "left",
    progress: (index + 0.5) / count,
    x: X_PATTERN[index % X_PATTERN.length],
    y: -index * spacing,
    z: Math.sin(index * 0.8) * 0.06,
  }));

  const first = checkpoints[0] || { x: 0, y: 0, z: 0 };
  const last = checkpoints.at(-1) || first;
  const points = [
    { x: 0, y: first.y + spacing * 0.9, z: 0 },
    ...checkpoints.map(({ x, y, z }) => ({ x, y, z })),
    { x: 0.03, y: last.y - spacing * 0.9, z: 0 },
  ];

  return { points, checkpoints };
}
