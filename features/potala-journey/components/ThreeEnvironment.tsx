"use client";

import { type MutableRefObject, useEffect, useRef } from "react";

import { advanceAmbientClock, createAmbientClock, suspendAmbientClock } from "../lib/ambient-clock";
import { disposeThreeEnvironment } from "../lib/dispose-three-environment";
import { ambientFrame } from "../lib/ambient-motion";
import { selectAmbientProfile } from "../lib/ambient-profile";
import styles from "./potala-experience.module.css";

type ThreeModule = typeof import("three");

const fogVertex = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const fogFragment = `
  uniform float uTime; uniform float uIntensity; uniform float uWindX; uniform float uWindY; uniform float uAspect; uniform float uLayer; uniform float uWarmth;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p) { vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0)),f.x),f.y); }
  float fbm(vec2 p) { float sum=0.0, amp=0.62; for(int i=0;i<2;i++){sum+=noise(p)*amp;p=p*2.03+vec2(8.3,4.1);amp*=0.5;} return sum; }
  void main() {
    vec2 uv=vUv-0.5; uv.x*=uAspect; float layer=uLayer+1.0;
    vec2 flow=vec2(uTime*(0.014+layer*0.004)+uWindX*0.24,uTime*(0.004+layer*0.0014)+uWindY*0.18);
    float pockets=fbm(uv*(1.65+layer*0.55)+flow); float wisps=noise(uv*(4.1+layer)-flow*0.62);
    float shape=smoothstep(0.42,0.74,pockets*0.74+wisps*0.26);
    float horizon=smoothstep(0.72,0.08,vUv.y)*smoothstep(1.0,0.56,vUv.y);
    float edges=smoothstep(0.0,0.14,vUv.x)*smoothstep(1.0,0.86,vUv.x);
    vec3 color=mix(vec3(0.58,0.68,0.68),vec3(0.86,0.70,0.49),uWarmth);
    gl_FragColor=vec4(color,shape*horizon*edges*uIntensity);
  }`;
const shaftFragment = `
  uniform float uTime; uniform float uIntensity; uniform float uWarmth; uniform float uOffset; varying vec2 vUv;
  void main() { float center=0.32+uOffset+sin(uTime*0.045+uOffset*8.0)*0.045; float ray=exp(-pow((vUv.x-center)*7.2,2.0)); float vertical=smoothstep(0.0,0.22,vUv.y)*smoothstep(1.0,0.28,vUv.y); vec3 color=mix(vec3(0.69,0.77,0.73),vec3(1.0,0.76,0.42),uWarmth); gl_FragColor=vec4(color,ray*vertical*uIntensity); }`;
const particleVertex = `
  attribute float aPhase; attribute float aSize; attribute float aSpeed; attribute float aOpacity;
  uniform float uTime; uniform float uWindX; uniform float uWindY; uniform float uIntensity; varying float vOpacity;
  void main() { vec3 p=position; float drift=sin(uTime*(0.11+aSpeed*0.19)+aPhase)+cos(uTime*(0.057+aSpeed*0.08)+aPhase*1.7)*0.55; p.x+=uWindX*(0.38+aSpeed*0.45)+drift*(0.055+aSpeed*0.05); p.y+=uWindY*(0.32+aSpeed*0.3)+sin(uTime*(0.09+aSpeed*0.13)+aPhase)*0.045; vec4 mv=modelViewMatrix*vec4(p,1.0); gl_PointSize=aSize*(110.0/max(1.0,-mv.z)); gl_Position=projectionMatrix*mv; vOpacity=aOpacity*uIntensity; }`;
const particleFragment = `varying float vOpacity; void main() { float d=length(gl_PointCoord-0.5); float alpha=smoothstep(0.5,0.08,d)*vOpacity; gl_FragColor=vec4(vec3(1.0,0.86,0.64),alpha); }`;

function createFogLayer(THREE: ThreeModule, index: number) {
  const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, vertexShader: fogVertex, fragmentShader: fogFragment, uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 }, uWindX: { value: 0 }, uWindY: { value: 0 }, uAspect: { value: 1 }, uLayer: { value: index }, uWarmth: { value: 0.6 } } });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(24 + index * 3, 13 + index * 1.5), material);
  mesh.position.set((index - 1) * 0.45, -0.55 + index * 0.18, -6 - index * 3.5);
  return { mesh, geometry: mesh.geometry, material };
}

function createShaft(THREE: ThreeModule, index: number) {
  const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, vertexShader: fogVertex, fragmentShader: shaftFragment, uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 }, uWarmth: { value: 0.6 }, uOffset: { value: index * 0.23 - 0.12 } } });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(24, 13), material);
  mesh.position.set(0, 0.15 - index * 0.25, -10 - index * 1.2);
  return { mesh, geometry: mesh.geometry, material };
}

function createParticleLayer(THREE: ThreeModule, count: number, options: { near: boolean; opacity: number; size: readonly [number, number] }) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3); const phase = new Float32Array(count); const size = new Float32Array(count); const speed = new Float32Array(count); const opacity = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const seed = index * 47.37;
    positions[index * 3] = ((Math.sin(seed) + 1) * 0.5 - 0.5) * 17;
    positions[index * 3 + 1] = ((Math.cos(seed * 0.73) + 1) * 0.5 - 0.5) * 10;
    positions[index * 3 + 2] = options.near ? -1 - (index % 5) * 1.5 : -3 - (index % 17) * 1.4;
    phase[index] = seed; size[index] = options.size[0] + ((index * 19) % 100) / 100 * (options.size[1] - options.size[0]); speed[index] = 0.3 + ((index * 11) % 100) / 100; opacity[index] = options.opacity * (0.5 + ((index * 13) % 100) / 100 * 0.5);
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3)); geometry.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1)); geometry.setAttribute("aSize", new THREE.BufferAttribute(size, 1)); geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speed, 1)); geometry.setAttribute("aOpacity", new THREE.BufferAttribute(opacity, 1));
  const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexShader: particleVertex, fragmentShader: particleFragment, uniforms: { uTime: { value: 0 }, uWindX: { value: 0 }, uWindY: { value: 0 }, uIntensity: { value: 0 } } });
  return { points: new THREE.Points(geometry, material), geometry, material };
}

export function ThreeEnvironment({ progressRef, disabled }: { progressRef: MutableRefObject<number>; disabled: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container || disabled) return;
    const profile = selectAmbientProfile({ width: window.innerWidth, devicePixelRatio: window.devicePixelRatio || 1, cores: navigator.hardwareConcurrency ?? 4, mobile: window.matchMedia("(pointer: coarse)").matches, reducedMotion: disabled });
    if (!profile.fps) return;
    let disposed = false; let frameId = 0; let cleanup: (() => void) | undefined;
    void import("three").then((THREE) => {
      if (disposed) return;
      const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 80); camera.position.z = 12;
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: profile.id === "high" ? "high-performance" : "low-power" }); const atmosphereDpr = Math.min(window.devicePixelRatio || 1, profile.id === "high" ? 1 : profile.pixelRatio); renderer.setClearColor(0x000000, 0); renderer.setPixelRatio(atmosphereDpr); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.78; container.appendChild(renderer.domElement); container.dataset.webgl = "ready"; container.dataset.quality = profile.id; container.dataset.particles = String(profile.dust + profile.motes + profile.foreground); container.dataset.dpr = String(atmosphereDpr);
      const fog = Array.from({ length: 1 }, (_, index) => createFogLayer(THREE, index)); const shafts = Array.from({ length: profile.shafts }, (_, index) => createShaft(THREE, index)); const dust = createParticleLayer(THREE, profile.dust, { near: false, opacity: 0.2, size: [1.15, 2.25] }); const motes = createParticleLayer(THREE, profile.motes, { near: false, opacity: 0.34, size: [2.2, 4.1] }); const foreground = createParticleLayer(THREE, profile.foreground, { near: true, opacity: 0.24, size: [7.5, 13] });
      fog.forEach(({ mesh }) => scene.add(mesh)); shafts.forEach(({ mesh }) => scene.add(mesh)); scene.add(dust.points, motes.points, foreground.points);
      const resize = () => { const width = Math.max(1, container.clientWidth); const height = Math.max(1, container.clientHeight); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); fog.forEach(({ material }) => { material.uniforms.uAspect.value = camera.aspect; }); };
      let lastRender = 0; let visible = true; let pointerX = 0; let pointerY = 0; let clock = createAmbientClock();
      const render = (timestamp: number) => {
        frameId = 0; if (disposed || document.hidden || !visible) return; clock = advanceAmbientClock(clock, timestamp);
        if (timestamp - lastRender >= 1000 / profile.fps) {
          const ambient = ambientFrame(clock.elapsedMs, progressRef.current, profile.id);
          fog.forEach(({ mesh, material }, index) => { const depth = index + 1; mesh.position.x = ambient.windX * depth * 0.3 + pointerX * 0.11 * depth; mesh.position.y = -0.55 + index * 0.18 + ambient.windY * depth * 0.45 + pointerY * 0.04 * depth; material.uniforms.uTime.value = ambient.time; material.uniforms.uWindX.value = ambient.windX; material.uniforms.uWindY.value = ambient.windY; material.uniforms.uWarmth.value = ambient.warmth; material.uniforms.uIntensity.value = ambient.fogDensity * 0.18; });
          shafts.forEach(({ mesh, material }, index) => { mesh.position.x = pointerX * (0.08 + index * 0.03); material.uniforms.uTime.value = ambient.time; material.uniforms.uWarmth.value = ambient.warmth; material.uniforms.uIntensity.value = ambient.light * 0.07; });
          for (const layer of [dust, motes, foreground]) { layer.material.uniforms.uTime.value = ambient.time; layer.material.uniforms.uWindX.value = ambient.windX; layer.material.uniforms.uWindY.value = ambient.windY; layer.material.uniforms.uIntensity.value = layer === dust ? ambient.effectIntensity * 0.78 : layer === motes ? ambient.moteIntensity * 0.82 : ambient.effectIntensity * 0.78; }
          if (profile.parallax) { camera.position.x += (pointerX * 0.14 - camera.position.x) * 0.022; camera.position.y += (pointerY * 0.075 - camera.position.y) * 0.022; }
          renderer.render(scene, camera); lastRender = timestamp;
        }
        frameId = window.requestAnimationFrame(render);
      };
      const resume = () => { clock = suspendAmbientClock(clock); if (!disposed && visible && !document.hidden && !frameId) frameId = window.requestAnimationFrame(render); };
      const onVisibilityChange = () => { if (document.hidden) { window.cancelAnimationFrame(frameId); frameId = 0; clock = suspendAmbientClock(clock); } else resume(); };
      const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (!visible) { window.cancelAnimationFrame(frameId); frameId = 0; clock = suspendAmbientClock(clock); } else resume(); }, { threshold: 0.01 });
      const onPointerMove = (event: PointerEvent) => { pointerX = event.clientX / window.innerWidth - 0.5; pointerY = 0.5 - event.clientY / window.innerHeight; };
      resize(); window.addEventListener("resize", resize, { passive: true }); document.addEventListener("visibilitychange", onVisibilityChange); observer.observe(container); if (profile.parallax) window.addEventListener("pointermove", onPointerMove, { passive: true }); frameId = window.requestAnimationFrame(render);
      cleanup = () => { window.cancelAnimationFrame(frameId); window.removeEventListener("resize", resize); document.removeEventListener("visibilitychange", onVisibilityChange); observer.disconnect(); window.removeEventListener("pointermove", onPointerMove); [...fog, ...shafts].forEach(({ mesh }) => scene.remove(mesh)); scene.remove(dust.points, motes.points, foreground.points); disposeThreeEnvironment({ renderer, resources: [...fog.flatMap((layer) => [layer.geometry, layer.material]), ...shafts.flatMap((layer) => [layer.geometry, layer.material]), dust.geometry, dust.material, motes.geometry, motes.material, foreground.geometry, foreground.material] }); };
    }).catch(() => { if (!disposed) container.dataset.webgl = "unavailable"; });
    return () => { disposed = true; cleanup?.(); };
  }, [disabled, progressRef]);
  return <div ref={containerRef} className={styles.threeEnvironment} aria-hidden="true" />;
}
