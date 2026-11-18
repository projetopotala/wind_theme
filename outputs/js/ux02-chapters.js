import { JOURNEY_REGIONS } from "./home/journey-data.js";
import { createLandscapeVideo } from "./home/landscape-video.js";

const chapters = JOURNEY_REGIONS.filter((item) => !String(item.id).startsWith("novidade-")).slice(0, 12);
const root = document.querySelector("#chapters-root");
const list = document.querySelector("#chapters-list");
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

list.innerHTML = chapters.map((chapter, index) => `
  <li class="chapter" id="chapter-${esc(chapter.id)}" data-chapter-id="${esc(chapter.id)}">
    <button class="chapter-marker" type="button" data-jump="${esc(chapter.id)}" aria-label="Ir para ${String(index + 1).padStart(2, "0")} — ${esc(chapter.title)}">
      <span>${String(index + 1).padStart(2, "0")}</span>
    </button>
    <article class="chapter-card" aria-labelledby="chapter-title-${esc(chapter.id)}">
      <div class="chapter-image" style="background-image:url('${esc(chapter.media || "media/home-travessia.webp")}')" role="img" aria-label="${esc(chapter.alt || chapter.title)}"></div>
      <div class="chapter-copy">
        <p class="chapter-number">${String(index + 1).padStart(2, "0")} / 12 · ${esc(chapter.category)}</p>
        <h2 id="chapter-title-${esc(chapter.id)}">${esc(chapter.title)}</h2>
        <p>${esc(chapter.description)}</p>
        <a class="chapter-action" href="${esc(chapter.href)}">Conhecer ${esc(chapter.title)} <span aria-hidden="true">→</span></a>
      </div>
    </article>
  </li>`).join("");

const items = [...list.querySelectorAll(".chapter")];
const markers = [...list.querySelectorAll("[data-jump]")];
const setActive = (item) => {
  items.forEach((chapter) => chapter.classList.toggle("is-active", chapter === item));
  markers.forEach((marker) => marker.setAttribute("aria-current", marker.dataset.jump === item?.dataset.chapterId ? "step" : "false"));
  const activeIndex = Math.max(0, items.indexOf(item));
  root.dataset.activeChapter = item?.dataset.chapterId || "";
  root.style.setProperty("--chapter-progress", `${activeIndex / Math.max(1, items.length - 1)}`);
  root.style.setProperty("--chapter-light-x", activeIndex % 2 ? "72%" : "28%");
};

const observer = new IntersectionObserver((entries) => {
  const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (visible) setActive(visible.target);
}, { rootMargin: "-35% 0px -45%", threshold: [0.2, 0.55, 0.8] });
items.forEach((item) => observer.observe(item));
markers.forEach((marker) => marker.addEventListener("click", () => document.querySelector(`#chapter-${CSS.escape(marker.dataset.jump)}`)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" })));
setActive(items[0]);

const landscape = document.querySelector("#chapters-landscape");
const landscapeVideo = createLandscapeVideo(landscape, { lerProgresso: () => Number.parseFloat(root.style.getPropertyValue("--chapter-progress") || "0") });
let frame = 0;
const updateLandscape = () => {
  frame = 0;
  const limit = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  const progress = Math.min(1, Math.max(0, scrollY / limit));
  document.body.classList.toggle("chapters-started", scrollY > innerHeight * 0.72);
  root.style.setProperty("--journey-scroll-progress", String(progress));
  landscape.style.setProperty("--chapters-parallax", `${progress * -18}px`);
  landscapeVideo.setProgress(progress);
};
addEventListener("scroll", () => { if (!frame) frame = requestAnimationFrame(updateLandscape); }, { passive: true });
updateLandscape();
