# Interior do Palácio Potala — placa e profundidade

Gerado em 27/08/2026 com a ferramenta integrada ImageGen. Os arquivos foram salvos localmente, sem integração ao site e sem commit.

## Arquivos

- `potala-interior-plate-1024x576.png`: placa colorida, PNG RGB, 1024 × 576.
- `potala-interior-depth-1024x576.png`: mapa de profundidade relativo, PNG em escala de cinza, 1024 × 576.

O mapa foi derivado da placa colorida. Claro representa proximidade da câmera; escuro representa distância. É uma estimativa artística para efeitos 2.5D/parallax, não profundidade métrica ou um levantamento do edifício. A cena é uma interpretação visual, não o registro de uma sala real identificada.

As duas imagens foram ajustadas à mesma dimensão com o mesmo enquadramento. A cor do sol, os reflexos e as roupas não são usados como profundidade. Revise possíveis pequenas diferenças nas silhuetas antes de usar deslocamentos intensos.

## Prompt da placa

```text
Use case: photorealistic-natural.
Asset type: color scene plate for a contemplative 2.5D website environment, to be paired with a depth map later.
Primary request: Interior of the Potala Palace in Lhasa, viewed from inside a spacious Tibetan palace hall, looking straight ahead toward one large open doorway at the far end. Warm sunlight streams inward through that doorway. Three adult visitors, seen from behind, are walking calmly toward the light.

Style/medium: photorealistic cinematic architectural scene, a tasteful artistic interpretation of the interior of Potala Palace. Authentic Tibetan visual language: thick aged red-brown timber columns, dark painted ceiling beams with restrained Tibetan ornament, worn stone floor, ochre and warm plaster walls, carved timber doorframe. Quiet and contemplative, not extravagant fantasy.
Composition/framing: one single landscape image, exactly 1024 by 576 pixels, 16:9. Frontal human-eye-level camera, natural 28mm architectural perspective, clear spatial layers. The distant open doorway is the main focal point near the horizontal center, its entire frame visible. The floor leads continuously from the lower edge toward the doorway. Visible side walls and columns frame the space. Keep the three people in the middle distance, full bodies and feet visible, naturally separated silhouettes at slightly different distances. Two women and one man in varied understated contemporary clothing, not matching outfits, no obvious brands. They are clearly walking away from us toward the doorway, not posing.
Lighting/mood: warm golden sunlight entering from outside through the distant doorway, softly visible shafts of light and subtle airborne dust; gentle shadow detail inside, warm browns and muted reds with pale golden light. Do not overexpose the entire doorway or people. Natural worn material detail, serene and believable.
Constraints: create ONLY the color scene plate. No depth map in this image, no split screen, no collage, no UI, no captions, no readable text, no logo, no watermark, no border. No extra people, no enormous foreground figures, no fisheye, no deformed anatomy, no European palace, no modern hotel lobby. Preserve a clean legible composition suitable for generating an aligned depth map from it.
```

## Prompt do mapa de profundidade

Entrada: a placa final de 1024 × 576 acima.

```text
Use case: style-transfer.
Asset type: registered grayscale relative-depth map for a 2.5D scene plate.
Input image 1 is the exact edit target, NOT a loose style reference. Convert this very image into its depth pass. Output one grayscale map only, at exactly 1024x576 pixels, with the EXACT SAME framing, projection, aspect ratio, object shapes and object positions as the input. Do not redraw or invent the composition.

Primary request: infer camera-space depth for the interior palace scene. Near objects are LIGHT/WHITE, far objects are DARK/BLACK. This is a depth map, NOT a black-and-white photo, NOT inverted photographic luminance, NOT a sketch, NOT a normal map.
Preserve exact edges of all timber columns, ceiling beams, side walls, benches, doorway and especially the three walking people. Their silhouettes, clothing outlines, heads, arms, feet and positions must match the input. Keep the gaps between arms and bodies correctly showing background depth.

Depth structure:
- Closest large columns at the extreme left and right, and the nearest bottom foreground floor, are bright gray to nearly white.
- The floor is a smooth depth gradient becoming steadily darker as it recedes toward the open doorway; sunlit patches and cast shadows do NOT change its depth.
- Each successive pair of columns and overhead beams is darker with increasing distance. Side walls and ceiling have smooth physically plausible perspective-depth gradients. Suppress painted motifs, wood grain, masonry texture, light rays and surface shading.
- The three people have smooth mostly uniform mid-dark gray depth values, standing in front of the darker doorway. The woman left is closest and slightly lighter, the man in the middle is slightly farther, the woman right is farthest. Their clothes' light/dark colors do NOT affect depth. Keep their outer silhouette crisp.
- The distant doorway frame and far wall are dark gray. The open doorway's visible exterior is darkest / nearly black even though it is bright in the color image.
- Use full continuous grayscale range with smooth surfaces and clean antialiased object boundaries; no outlines, no highlights, no glow, no material texture.
Invariants: exact registration to image 1, same camera and crop, exactly three people, no added or removed architectural elements, no silhouette displacement. No labels, scale bar, text, logo, UI, panels, border, or watermark. Output only the single depth map, not the color plate.
```

