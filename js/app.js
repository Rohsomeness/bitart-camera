/* Bitart Camera — UI + main loop */
(function () {
  "use strict";

  const modes = window.BitartCameraModes;
  const camera = new window.BitartCamera();
  const ml = new window.BitartML();
  const canvas = document.getElementById("viz");
  const filters = new window.BitartFilters(canvas);

  let modeIndex = 0;
  let raf = 0;
  let lastT = performance.now();
  let mlBusy = false;
  let modelsReadyFor = new Set();
  let dragging = false;
  let dragOffX = 0;
  let dragOffY = 0;

  const $ = (id) => document.getElementById(id);
  const lcdMode = $("lcdMode");
  const lcdStatus = $("lcdStatus");
  const lcdKind = $("lcdKind");
  const eq = $("eq");
  const brandDot = $("brandDot");
  const btnCam = $("btnCam");
  const camIcon = $("camIcon");
  const intenSlider = $("intenSlider");
  const intenVal = $("intenVal");
  const sceneRail = $("sceneRail");
  const sceneModal = $("sceneModal");
  const sceneModalGrid = $("sceneModalGrid");
  const sceneModalCount = $("sceneModalCount");
  const player = $("player");
  const tidbitEl = $("tidbit");
  const tidbitTitle = $("tidbitTitle");
  const tidbitBody = $("tidbitBody");
  const idleHint = $("idleHint");

  function modeFromUrl() {
    const params = new URLSearchParams(location.search);
    const q = params.get("mode") || params.get("scene") || params.get("filter");
    const hash = location.hash.replace(/^#/, "");
    const id = q || hash || null;
    if (!id) return 0;
    const i = modes.findIndex((m) => m.id === id);
    return i >= 0 ? i : 0;
  }

  function setUrlMode(id) {
    const url = new URL(location.href);
    url.searchParams.set("mode", id);
    history.replaceState(null, "", url.pathname + url.search);
  }

  function currentMode() {
    return modes[modeIndex];
  }

  function kindLabel(kind) {
    if (kind === "classic") return "FILTER";
    if (kind === "segment") return "SEGMENT";
    if (kind === "pose") return "POSE";
    if (kind === "hybrid") return "HYBRID";
    return kind.toUpperCase();
  }

  function setMode(index, opts) {
    modeIndex = (index + modes.length) % modes.length;
    const m = modes[modeIndex];
    filters.setMode(m.id);
    lcdMode.textContent = m.name.toUpperCase();
    if (lcdKind) lcdKind.textContent = kindLabel(m.kind);
    document.body.dataset.mode = m.id;
    document.body.dataset.kind = m.kind;

    if (tidbitTitle) tidbitTitle.textContent = m.name;
    if (tidbitBody) tidbitBody.textContent = m.tidbit;
    if (tidbitEl) {
      tidbitEl.dataset.kind = m.kind;
    }

    document.querySelectorAll(".scene-btn, .scene-modal-item").forEach((el) => {
      el.classList.toggle("active", el.dataset.id === m.id);
    });
    const activeBtn = sceneRail.querySelector(`.scene-btn[data-id="${m.id}"]`);
    if (activeBtn && !(opts && opts.skipScroll)) {
      activeBtn.scrollIntoView({
        inline: "center",
        block: "nearest",
        behavior: "smooth",
      });
    }
    if (!(opts && opts.skipUrl)) setUrlMode(m.id);

    // Warm ML for this mode when camera is live
    if (camera.live && m.needs.length) {
      warmModels(m).catch(() => {});
    }
  }

  function buildRail() {
    sceneRail.innerHTML = "";
    modes.forEach((m) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "scene-btn";
      btn.dataset.id = m.id;
      btn.dataset.kind = m.kind;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-label", `${m.name}: ${m.blurb}`);
      btn.title = m.blurb;
      btn.innerHTML = `<img class="scene-thumb" src="${m.thumb}" alt="" loading="lazy" /><span class="scene-name">${m.name}</span>`;
      btn.addEventListener("click", () =>
        setMode(modes.findIndex((x) => x.id === m.id))
      );
      sceneRail.appendChild(btn);
    });
  }

  function buildModal() {
    sceneModalGrid.innerHTML = "";
    sceneModalCount.textContent = String(modes.length);
    modes.forEach((m) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "scene-modal-item";
      btn.dataset.id = m.id;
      btn.dataset.kind = m.kind;
      btn.setAttribute("role", "option");
      btn.innerHTML = `
        <img src="${m.thumb}" alt="" loading="lazy" />
        <span class="modal-name">${m.name}</span>
        <span class="modal-blurb">${m.blurb}</span>
        <span class="modal-kind">${kindLabel(m.kind)}</span>
      `;
      btn.addEventListener("click", () => {
        setMode(modes.findIndex((x) => x.id === m.id));
        closeModal();
      });
      sceneModalGrid.appendChild(btn);
    });
  }

  function openModal() {
    sceneModal.hidden = false;
    sceneModal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    sceneModal.hidden = true;
    sceneModal.setAttribute("aria-hidden", "true");
  }

  function setLiveUI() {
    const live = camera.live;
    document.body.classList.toggle("is-live", live);
    btnCam.classList.toggle("is-playing", live);
    camIcon.textContent = live ? "■" : "▶";
    brandDot.classList.toggle("live", live);
    eq.classList.toggle("live", live);
    lcdStatus.classList.toggle("playing", live);

    if (!live) {
      lcdStatus.textContent = "READY";
      return;
    }

    const m = currentMode();
    if (m.needs.length && ml.status === "loading") {
      lcdStatus.textContent = "LOADING ML";
    } else if (m.needs.length && ml.status === "error") {
      lcdStatus.textContent = "ML ERR";
    } else if (m.needs.length && !modelsReadyFor.has(m.id)) {
      lcdStatus.textContent = "WARMING";
    } else {
      lcdStatus.textContent = "LIVE";
    }
  }

  async function warmModels(m) {
    if (!m.needs.length) {
      modelsReadyFor.add(m.id);
      setLiveUI();
      return;
    }
    setLiveUI();
    try {
      await ml.ensure(m.needs);
      modelsReadyFor.add(m.id);
    } catch (err) {
      console.error(err);
      lcdStatus.textContent = "ML ERR";
    }
    setLiveUI();
  }

  async function toggleCamera() {
    if (camera.live) {
      camera.stop();
      setLiveUI();
      return;
    }
    try {
      lcdStatus.textContent = "ASK CAM";
      await camera.start();
      resize();
      setLiveUI();
      await warmModels(currentMode());
      if (!raf) loop(performance.now());
    } catch (err) {
      console.error(err);
      lcdStatus.textContent = "DENIED";
      alert(
        "Camera access was blocked or unavailable.\n\nUse HTTPS (or localhost), allow the camera permission, and try again."
      );
      setLiveUI();
    }
  }

  function resize() {
    const stage = $("stage");
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    filters.resize(rect.width, rect.height);
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    if (!camera.ready) {
      return;
    }

    const m = currentMode();
    // Run ML occasionally when needed
    if (m.needs.length && ml.status === "ready" && !mlBusy) {
      mlBusy = true;
      try {
        ml.infer(camera.video, m.needs, now);
      } finally {
        mlBusy = false;
      }
    }

    filters.intensity = (Number(intenSlider.value) || 100) / 100;
    filters.render({
      video: camera.video,
      ml,
      dt,
      mirror: camera.facingMode === "user",
    });
    setLiveUI();
  }

  // ── Controls ──────────────────────────────────────────────
  btnCam.addEventListener("click", () => toggleCamera());
  $("btnPrev").addEventListener("click", () => setMode(modeIndex - 1));
  $("btnNext").addEventListener("click", () => setMode(modeIndex + 1));
  $("btnScenePrev").addEventListener("click", () => {
    sceneRail.scrollBy({ left: -160, behavior: "smooth" });
  });
  $("btnSceneNext").addEventListener("click", () => {
    sceneRail.scrollBy({ left: 160, behavior: "smooth" });
  });
  $("btnSceneGrid").addEventListener("click", openModal);
  $("btnSceneModalClose").addEventListener("click", closeModal);
  $("sceneModalBackdrop").addEventListener("click", closeModal);

  intenSlider.addEventListener("input", () => {
    intenVal.textContent = intenSlider.value;
    filters.intensity = Number(intenSlider.value) / 100;
  });

  $("btnFlip").addEventListener("click", async () => {
    if (!camera.stream) {
      camera.facingMode =
        camera.facingMode === "user" ? "environment" : "user";
      return;
    }
    try {
      await camera.flip();
      resize();
    } catch (err) {
      console.warn("flip failed", err);
    }
  });

  $("btnInfo").addEventListener("click", () => {
    document.body.classList.toggle("tidbit-open");
    $("btnInfo").setAttribute(
      "aria-pressed",
      document.body.classList.contains("tidbit-open") ? "true" : "false"
    );
  });

  $("btnFs").addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (_) {}
  });

  document.addEventListener("fullscreenchange", () => {
    document.body.classList.toggle("fullscreen", !!document.fullscreenElement);
    resize();
  });

  $("btnHide").addEventListener("click", () => {
    document.body.classList.add("player-collapsed");
  });
  $("btnShow").addEventListener("click", () => {
    document.body.classList.remove("player-collapsed");
  });

  camera.onEnded(() => {
    camera.stop();
    setLiveUI();
  });

  // Keyboard
  window.addEventListener("keydown", (e) => {
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      toggleCamera();
    } else if (e.key === "ArrowLeft") {
      setMode(modeIndex - 1);
    } else if (e.key === "ArrowRight") {
      setMode(modeIndex + 1);
    } else if (e.key === "g" || e.key === "G") {
      if (sceneModal.hidden) openModal();
      else closeModal();
    } else if (e.key === "h" || e.key === "H") {
      document.body.classList.toggle("player-collapsed");
    } else if (e.key === "f" || e.key === "F") {
      $("btnFs").click();
    } else if (e.key === "i" || e.key === "I") {
      $("btnInfo").click();
    } else if (e.key === "Escape") {
      closeModal();
    }
  });

  // Fullscreen drag of player (same as bitart)
  function onPointerDown(e) {
    if (!document.body.classList.contains("fullscreen")) return;
    if (e.target.closest("button, input, .scene-rail, .scene-scroll")) return;
    dragging = true;
    player.classList.add("is-dragging");
    const rect = player.getBoundingClientRect();
    dragOffX = e.clientX - rect.left;
    dragOffY = e.clientY - rect.top;
    player.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e) {
    if (!dragging) return;
    const x = e.clientX - dragOffX;
    const y = e.clientY - dragOffY;
    player.style.left = x + "px";
    player.style.top = y + "px";
    player.style.bottom = "auto";
    player.style.transform = "none";
  }
  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    player.classList.remove("is-dragging");
    try {
      player.releasePointerCapture?.(e.pointerId);
    } catch (_) {}
  }
  player.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);

  window.addEventListener("resize", resize);

  // Boot
  buildRail();
  buildModal();
  setMode(modeFromUrl(), { skipUrl: false });
  resize();
  setLiveUI();
  // Idle draw loop so stage isn't black before cam
  if (!raf) {
    lastT = performance.now();
    raf = requestAnimationFrame(loop);
  }

  // Default tidbit open on desktop for discovery
  if (window.matchMedia("(min-width: 720px)").matches) {
    document.body.classList.add("tidbit-open");
    $("btnInfo").setAttribute("aria-pressed", "true");
  }
})();
