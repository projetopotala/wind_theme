"use client";

import { type MutableRefObject, useEffect, useRef } from "react";

import { disposeThreeEnvironment } from "../lib/dispose-three-environment";
import styles from "./potala-experience.module.css";

export function ThreeEnvironment({
  progressRef,
  disabled,
}: {
  progressRef: MutableRefObject<number>;
  disabled: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || disabled || (navigator.hardwareConcurrency ?? 8) <= 2) return;
    let disposed = false;
    let frameId = 0;
    let cleanup: (() => void) | undefined;

    void import("three").then((THREE) => {
      if (disposed) return;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 80);
      camera.position.z = 12;
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "low-power" });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      container.appendChild(renderer.domElement);
      container.dataset.webgl = "ready";

      const geometry = new THREE.BufferGeometry();
      const points = 72;
      const positions = new Float32Array(points * 3);
      for (let index = 0; index < points; index += 1) {
        const stride = index * 3;
        const lane = (index * 37) % points;
        positions[stride] = ((lane / points) * 2 - 1) * 13;
        positions[stride + 1] = ((((index * 19) % points) / points) * 2 - 1) * 7;
        positions[stride + 2] = -((index * 11) % 32);
      }
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        color: 0xd7c6a2,
        size: 0.035,
        transparent: true,
        opacity: 0.23,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const field = new THREE.Points(geometry, material);
      scene.add(field);

      const resize = () => {
        const width = Math.max(1, container.clientWidth);
        const height = Math.max(1, container.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      let lastRender = 0;
      const render = (timestamp: number) => {
        frameId = 0;
        if (disposed || document.hidden) return;
        if (timestamp - lastRender >= 1000 / 30) {
          const progress = progressRef.current;
          field.rotation.z = (progress - 0.5) * 0.025;
          field.position.y = Math.sin(progress * Math.PI * 2) * 0.08;
          material.opacity = 0.14 + Math.sin(progress * Math.PI) * 0.1;
          renderer.render(scene, camera);
          lastRender = timestamp;
        }
        frameId = window.requestAnimationFrame(render);
      };
      const onVisibilityChange = () => {
        if (document.hidden) {
          window.cancelAnimationFrame(frameId);
          frameId = 0;
        } else if (!frameId) {
          frameId = window.requestAnimationFrame(render);
        }
      };
      resize();
      window.addEventListener("resize", resize, { passive: true });
      document.addEventListener("visibilitychange", onVisibilityChange);
      frameId = window.requestAnimationFrame(render);
      cleanup = () => {
        window.cancelAnimationFrame(frameId);
        window.removeEventListener("resize", resize);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        scene.remove(field);
        disposeThreeEnvironment({ geometry, material, renderer });
      };
    }).catch(() => {
      if (!disposed) container.dataset.webgl = "unavailable";
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [disabled, progressRef]);

  return <div ref={containerRef} className={styles.threeEnvironment} aria-hidden="true" />;
}
