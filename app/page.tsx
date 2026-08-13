"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Star = {
  x: number;
  y: number;
  z: number;
  color: string;
  alpha: number;
  width: number;
};

const STAR_COLORS = [
  "245,244,255",
  "220,205,255",
  "173,126,255",
  "118,66,255",
  "255,134,225",
  "255,213,248",
];

function createStar(width: number, height: number, depth = Math.random() * 1100 + 20): Star {
  return {
    x: (Math.random() - 0.5) * width * 2.1,
    y: (Math.random() - 0.5) * height * 2.1,
    z: depth,
    color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
    alpha: Math.random() * 0.72 + 0.24,
    width: Math.random() * 1.35 + 0.45,
  };
}

function StarTunnel({ boosted }: { boosted: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boostedRef = useRef(boosted);

  useEffect(() => {
    boostedRef.current = boosted;
  }, [boosted]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let stars: Star[] = [];
    let frame = 0;
    let lastTime = performance.now();
    let speed = reducedMotion ? 2.2 : 6.2;
    let centerX = 0;
    let centerY = 0;
    let targetCenterX = 0;
    let targetCenterY = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      centerX = targetCenterX = width / 2;
      centerY = targetCenterY = height / 2;
      const density = reducedMotion ? 0.00028 : 0.00068;
      const count = Math.max(260, Math.min(920, Math.round(width * height * density)));
      stars = Array.from({ length: count }, () => createStar(width, height));
    };

    const aim = (event: PointerEvent) => {
      targetCenterX = width / 2 + (event.clientX - width / 2) * 0.035;
      targetCenterY = height / 2 + (event.clientY - height / 2) * 0.035;
    };

    const draw = (time: number) => {
      const delta = Math.min((time - lastTime) / 16.667, 2.2);
      lastTime = time;

      const targetSpeed = boostedRef.current
        ? reducedMotion
          ? 8
          : 46
        : reducedMotion
          ? 2.2
          : 6.2;
      speed += (targetSpeed - speed) * (boostedRef.current ? 0.075 : 0.04) * delta;
      centerX += (targetCenterX - centerX) * 0.035 * delta;
      centerY += (targetCenterY - centerY) * 0.035 * delta;

      context.fillStyle = boostedRef.current ? "rgba(3, 2, 8, 0.4)" : "rgba(3, 2, 8, 0.72)";
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";

      const focal = Math.min(width, height) * 0.96;
      for (const star of stars) {
        star.z -= speed * delta;

        const tailDepth = star.z + speed * (boostedRef.current ? 3.5 : 1.35);
        const x = centerX + (star.x / star.z) * focal;
        const y = centerY + (star.y / star.z) * focal;
        const previousX = centerX + (star.x / tailDepth) * focal;
        const previousY = centerY + (star.y / tailDepth) * focal;

        if (
          star.z < 5 ||
          x < -width * 0.25 ||
          x > width * 1.25 ||
          y < -height * 0.25 ||
          y > height * 1.25
        ) {
          Object.assign(star, createStar(width, height, 1100));
          continue;
        }

        const proximity = 1 - Math.min(star.z / 1100, 1);
        const brightness = Math.min(1, star.alpha * (0.24 + proximity * 1.4));
        context.beginPath();
        context.moveTo(previousX, previousY);
        context.lineTo(x, y);
        context.strokeStyle = `rgba(${star.color}, ${brightness})`;
        context.lineWidth = star.width * (0.35 + proximity * 2.1) * (boostedRef.current ? 1.16 : 1);
        context.lineCap = "round";
        context.stroke();
      }

      context.globalCompositeOperation = "source-over";
      frame = window.requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", aim, { passive: true });
    frame = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", aim);
    };
  }, []);

  return <canvas aria-hidden="true" className="star-canvas" ref={canvasRef} />;
}

export default function Home() {
  const [isHolding, setIsHolding] = useState(false);
  const [inputMode, setInputMode] = useState<"screen" | "button" | null>(null);

  const stopHolding = useCallback(() => {
    setIsHolding(false);
    setInputMode(null);
  }, []);

  useEffect(() => {
    window.addEventListener("pointerup", stopHolding);
    window.addEventListener("pointercancel", stopHolding);
    window.addEventListener("blur", stopHolding);
    return () => {
      window.removeEventListener("pointerup", stopHolding);
      window.removeEventListener("pointercancel", stopHolding);
      window.removeEventListener("blur", stopHolding);
    };
  }, [stopHolding]);

  return (
    <main
      className={`experience${isHolding ? " is-holding" : ""}`}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        event.preventDefault();
        setInputMode("screen");
        setIsHolding(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse" && event.buttons === 0) stopHolding();
      }}
      onPointerUp={stopHolding}
    >
      <StarTunnel boosted={isHolding} />
      <div aria-hidden="true" className="space-vignette" />
      <div aria-hidden="true" className="portal-core">
        <span />
        <span />
        <span />
      </div>

      <header className="site-mark" aria-label="Potala">
        <span className="mark-dot" />
        <span>POTALA</span>
        <span className="mark-index">03</span>
      </header>

      <p className="screen-instruction">
        {isHolding ? "MANTENHA O FLUXO" : "PRESSIONE E SEGURE EM QUALQUER LUGAR"}
      </p>

      <section className="transcend-control" aria-label="Controle de velocidade">
        <button
          aria-describedby="hold-instruction"
          aria-pressed={isHolding && inputMode === "button"}
          className="transcend-button"
          onClick={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if ((event.key === " " || event.key === "Enter") && !event.repeat) {
              event.preventDefault();
              setInputMode("button");
              setIsHolding(true);
            }
          }}
          onKeyUp={(event) => {
            if (event.key === " " || event.key === "Enter") stopHolding();
          }}
          onPointerDown={(event) => {
            if (event.pointerType === "mouse" && event.button !== 0) return;
            event.stopPropagation();
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            setInputMode("button");
            setIsHolding(true);
          }}
          onPointerUp={(event) => {
            event.stopPropagation();
            stopHolding();
          }}
          onPointerCancel={stopHolding}
          type="button"
        >
          <span className="button-orbit" aria-hidden="true" />
          <span className="button-label">TRANSCENDER</span>
        </button>
        <span id="hold-instruction" className="control-caption">
          {isHolding && inputMode === "button" ? "SOLTE PARA RETORNAR" : "SEGURE PARA ACELERAR"}
        </span>
      </section>

      <div className="status" aria-live="polite">
        <span className="status-line" />
        <span>{isHolding ? "VELOCIDADE EXPANDIDA" : "ESTADO CONTEMPLATIVO"}</span>
      </div>
    </main>
  );
}
