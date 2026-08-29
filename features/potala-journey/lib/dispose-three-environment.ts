type Disposable = { dispose(): void };
type RendererLike = Disposable & {
  forceContextLoss?: () => void;
  domElement?: { remove?: () => void };
};

export function disposeThreeEnvironment({
  geometry,
  material,
  renderer,
}: {
  geometry: Disposable;
  material: Disposable;
  renderer: RendererLike;
}) {
  geometry.dispose();
  material.dispose();
  renderer.dispose();
  renderer.forceContextLoss?.();
  renderer.domElement?.remove?.();
}
