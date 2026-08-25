import { SHADER_NOISE } from "./shader-noise.js";

export const ARRIVAL_FRAGMENT_SHADER = `
  precision mediump float;

  varying vec2 vUv;
  uniform sampler2D uImage;
  uniform sampler2D uDepth;
  uniform sampler2D uWaterMask;
  uniform sampler2D uWaterfallMask;
  uniform sampler2D uCanopyMask;
  uniform sampler2D uMistMask;
  uniform vec2 uPointer;
  uniform vec2 uResolution;
  uniform vec2 uImageSize;
  uniform float uCamera;
  uniform float uDepthAmount;
  uniform float uFog;
  uniform float uLight;
  uniform float uPath;
  uniform float uTime;
  uniform float uRiverMotion;
  uniform float uWind;
  uniform vec2 uWindDir;
  uniform float uSun;
  uniform float uMistReveal;
  uniform float uAttention;
  uniform vec2 uAttentionUv;
  uniform float uHasWaterMask;
  uniform float uHasWaterfallMask;
  uniform float uHasCanopyMask;
  uniform float uHasMistMask;
  uniform vec2 uRippleUv;
  uniform float uRippleTime;
  uniform float uRippleStrength;
  uniform float uOverscan;
  uniform float uCameraZoom;
  uniform float uFarParallax;
  uniform float uNearParallax;
  uniform float uCanopyMaxUv;
  uniform float uWaterMaxUv;
  uniform float uWaterfallMaxUv;
  uniform float uDebugView;
  uniform float uDebugMaskMix;

  ${SHADER_NOISE}

  vec2 coverUv(vec2 uv) {
    float viewportAspect = uResolution.x / max(uResolution.y, 1.0);
    float imageAspect = uImageSize.x / max(uImageSize.y, 1.0);
    vec2 result = uv;
    if (viewportAspect > imageAspect) {
      result.y = (uv.y - 0.5) * (imageAspect / viewportAspect) + 0.5;
    } else {
      result.x = (uv.x - 0.5) * (viewportAspect / imageAspect) + 0.5;
    }
    return result;
  }

  float maskValue(sampler2D map, vec2 uv, float enabled) {
    return mix(0.0, texture2D(map, uv).r, enabled);
  }

  void main() {
    vec2 sceneUv = 0.5 + (coverUv(vUv) - 0.5) * uOverscan;
    float zoom = 1.0 - uCamera * uCameraZoom;
    sceneUv = 0.5 + (sceneUv - 0.5) * zoom;
    sceneUv.y -= uCamera * 0.004 * (texture2D(uDepth, clamp(sceneUv, 0.002, 0.998)).r);

    float depth = texture2D(uDepth, clamp(sceneUv, 0.002, 0.998)).r;
    float nearFactor = smoothstep(0.32, 0.86, depth);
    vec2 pointerParallax = uPointer
      * mix(uFarParallax, uNearParallax, nearFactor)
      * max(uDepthAmount, 0.35);

    // DEPTH PARALLAX
    vec2 uv = sceneUv + pointerParallax;

    float waterMask = maskValue(uWaterMask, uv, uHasWaterMask);
    float waterfall = maskValue(uWaterfallMask, uv, uHasWaterfallMask);
    float canopy = maskValue(uCanopyMask, uv, uHasCanopyMask);
    float mistMask = maskValue(uMistMask, uv, uHasMistMask);

    float attentionDistance = distance(uv, uAttentionUv);
    float attentionField = uAttention * exp(-attentionDistance * attentionDistance * 42.0);

    // CANOPY
    vec2 wind = normalize(uWindDir + vec2(0.0001, 0.0));
    float branch = noise(uv * 7.0 + vec2(uTime * 0.11, 0.0));
    float leaf = noise(uv * 28.0 + vec2(uTime * 0.55, uTime * 0.18));
    vec2 canopyWarp = (
        wind * (branch - 0.5) * 0.65
        + vec2(leaf - 0.5, (leaf - 0.5) * 0.35) * 0.35
      ) * canopy * uCanopyMaxUv * (0.45 + uWind);

    // WATER
    float flow = uTime * 0.22 * max(uRiverMotion, 0.4);
    float n1 = noise(uv * vec2(18.0, 11.0) + vec2(flow * 0.8, flow * 0.15));
    float n2 = noise(uv * vec2(42.0, 26.0) - vec2(flow * 1.4, flow * 0.2));
    vec2 waterWarp = vec2(n1 - 0.5, n2 - 0.5) * waterMask * uWaterMaxUv * max(uRiverMotion, 0.4);

    float rippleAge = max(uRippleTime, 0.0);
    float rippleWave = sin(distance(uv, uRippleUv) * 70.0 - rippleAge * 7.0);
    vec2 rippleWarp = vec2(rippleWave) * 0.0007 * uRippleStrength * waterMask
      * (1.0 - smoothstep(0.0, 0.16, distance(uv, uRippleUv)));

    // WATERFALL
    vec2 fallUv = uv * vec2(22.0, 48.0);
    fallUv.y += uTime * 1.35 * max(uRiverMotion, 0.45);
    float fallNoise = noise(fallUv);
    float fallFine = noise(fallUv * 2.3 + 9.0);
    vec2 fallWarp = vec2((fallNoise - 0.5) * 0.35, fallFine - 0.5)
      * waterfall * uWaterfallMaxUv * max(uRiverMotion, 0.45);

    uv = clamp(uv + canopyWarp + waterWarp + rippleWarp + fallWarp, 0.001, 0.999);
    vec3 color = texture2D(uImage, uv).rgb;

    float glint = smoothstep(0.62, 0.9, n2) * smoothstep(0.48, 0.82, n1);
    color += waterMask * glint * vec3(0.11, 0.1, 0.08) * max(uRiverMotion, 0.4);
    color *= 1.0 - waterMask * (0.02 + n1 * 0.03);
    color += waterfall * pow(fallFine, 3.0) * vec3(0.16, 0.16, 0.15);
    color += waterfall * (fallNoise - 0.5) * 0.08;

    // MIST
    float mistA = noise(vec2(uv.x * 1.6 + uTime * 0.018, uv.y * 3.0));
    float mistB = noise(vec2(uv.x * 0.8 - uTime * 0.031, uv.y * 1.7 + uTime * 0.008));
    float mist = smoothstep(0.28, 0.78, mix(mistA, mistB, 0.48)) * mistMask * uFog;
    mist *= 1.0 - uMistReveal * 0.72;
    color = mix(color, vec3(0.86, 0.88, 0.90), mist * 0.22);

    // LIGHTING
    float sky = smoothstep(0.48, 0.16, sceneUv.y);
    color *= 1.0 + sky * uSun * 0.1;
    color += sky * uSun * vec3(0.06, 0.045, 0.016);
    color *= 0.92 + uLight * 0.2;
    color += attentionField * vec3(0.045, 0.035, 0.02);
    color = mix(color, color + vec3(0.07, 0.05, 0.025), uPath * 0.12 * (1.0 - mistMask));

    if (uDebugView > 0.5 && uDebugView < 1.5) {
      color = vec3(depth);
    } else if (uDebugView > 1.5 && uDebugView < 2.5) {
      color = mix(color, vec3(waterMask, 0.15, waterMask), max(uDebugMaskMix, 0.5));
    } else if (uDebugView > 2.5 && uDebugView < 3.5) {
      color = mix(color, vec3(waterfall, 0.2, 0.8), max(uDebugMaskMix, 0.5));
    } else if (uDebugView > 3.5 && uDebugView < 4.5) {
      color = mix(color, vec3(0.15, canopy, 0.2), max(uDebugMaskMix, 0.5));
    } else if (uDebugView > 4.5 && uDebugView < 5.5) {
      color = mix(color, vec3(mistMask), max(uDebugMaskMix, 0.5));
    } else if (uDebugView > 5.5 && uDebugView < 6.5) {
      color = texture2D(uImage, clamp(sceneUv, 0.001, 0.999)).rgb;
    }

    gl_FragColor = vec4(color, 1.0);
  }
`;
