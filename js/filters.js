/* Bitart Camera — per-mode render effects */
(function (global) {
  "use strict";

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  class FilterEngine {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha: false });
      this.w = 0;
      this.h = 0;
      this.dpr = 1;
      this.modeId = "raw";
      this.intensity = 1; // 0.2 – 2
      this.t = 0;
      this.mirror = true;

      // offscreen buffers
      this.buf = document.createElement("canvas");
      this.bctx = this.buf.getContext("2d", { willReadFrequently: true });
      this.buf2 = document.createElement("canvas");
      this.bctx2 = this.buf2.getContext("2d", { willReadFrequently: true });

      // particles / trails state
      this.particles = [];
      this.trails = { L: [], R: [], LA: [], RA: [] };
      this.matrixCols = null;
      this.glitchSeed = 0;
    }

    resize(cssW, cssH) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(2, Math.floor(cssW * dpr));
      const h = Math.max(2, Math.floor(cssH * dpr));
      if (w === this.w && h === this.h && dpr === this.dpr) return;
      this.w = w;
      this.h = h;
      this.dpr = dpr;
      this.canvas.width = w;
      this.canvas.height = h;
      this.buf.width = w;
      this.buf.height = h;
      this.buf2.width = w;
      this.buf2.height = h;
      this.matrixCols = null;
    }

    setMode(id) {
      this.modeId = id;
      this.particles = [];
      this.trails = { L: [], R: [], LA: [], RA: [] };
      this.matrixCols = null;
    }

    /**
     * @param {object} opts
     * @param {HTMLVideoElement} opts.video
     * @param {object} opts.ml BitartML
     * @param {number} opts.dt
     * @param {boolean} opts.mirror
     */
    render(opts) {
      const video = opts.video;
      const ml = opts.ml;
      const dt = opts.dt || 0.016;
      this.t += dt;
      const inten = this.intensity;
      this.mirror = opts.mirror !== false;
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;
      if (!w || !h || !video || !video.videoWidth) {
        ctx.fillStyle = "#0d0a12";
        ctx.fillRect(0, 0, this.canvas.width || 2, this.canvas.height || 2);
        return;
      }

      // Draw (optionally mirrored) video into working buffers
      this._layout = this._videoLayout(video, w, h);
      this._drawVideo(this.bctx, video, w, h, this.mirror);
      this.bctx2.drawImage(this.buf, 0, 0);

      const id = this.modeId;
      switch (id) {
        case "raw":
          this._blit();
          break;
        case "noir":
          this._filterNoir(inten);
          break;
        case "cyber":
          this._filterCyber(inten);
          break;
        case "thermal":
          this._filterThermal(inten);
          break;
        case "vhs":
          this._filterVhs(inten);
          break;
        case "neon":
          this._segNeon(ml, inten);
          break;
        case "ghost":
          this._segGhost(ml, inten);
          break;
        case "bokeh":
          this._segBokeh(ml, inten);
          break;
        case "glitch":
          this._segGlitch(ml, inten);
          break;
        case "cutout":
          this._segCutout(ml, inten);
          break;
        case "matrix":
          this._segMatrix(ml, inten, dt);
          break;
        case "pop":
          this._segPop(ml, inten);
          break;
        case "skeleton":
          this._poseSkeleton(ml, inten, false);
          break;
        case "energy":
          this._poseEnergy(ml, inten);
          break;
        case "sparks":
          this._poseSparks(ml, inten, dt);
          break;
        case "avatar":
          this._poseAvatar(ml, inten);
          break;
        case "trails":
          this._poseTrails(ml, inten);
          break;
        case "exo":
          this._poseExo(ml, inten);
          break;
        case "hybrid":
          this._hybrid(ml, inten);
          break;
        default:
          this._blit();
      }
    }

    _videoLayout(video, w, h) {
      const vw = video.videoWidth || w;
      const vh = video.videoHeight || h;
      const scale = Math.max(w / vw, h / vh);
      const dw = vw * scale;
      const dh = vh * scale;
      const dx = (w - dw) / 2;
      const dy = (h - dh) / 2;
      return { dx, dy, dw, dh, scale, vw, vh };
    }

    _drawVideo(c, video, w, h, mirror) {
      c.save();
      if (mirror) {
        c.translate(w, 0);
        c.scale(-1, 1);
      }
      const L = this._layout || this._videoLayout(video, w, h);
      c.drawImage(video, L.dx, L.dy, L.dw, L.dh);
      c.restore();
    }

    _blit() {
      this.ctx.drawImage(this.buf, 0, 0);
    }

    _getImageData(fromBuf) {
      const c = fromBuf ? this.bctx : this.ctx;
      const src = fromBuf ? this.buf : this.canvas;
      return c.getImageData(0, 0, src.width, src.height);
    }

    // ── Classic ───────────────────────────────────────────────
    _filterNoir(inten) {
      const img = this.bctx.getImageData(0, 0, this.w, this.h);
      const d = img.data;
      const contrast = 1 + (inten - 1) * 0.5;
      for (let i = 0; i < d.length; i += 4) {
        let y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        y = (y - 128) * contrast + 128;
        y = clamp(y, 0, 255);
        d[i] = d[i + 1] = d[i + 2] = y;
      }
      this.ctx.putImageData(img, 0, 0);
    }

    _filterCyber(inten) {
      const img = this.bctx.getImageData(0, 0, this.w, this.h);
      const d = img.data;
      const k = clamp(inten, 0.4, 2);
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i],
          g = d[i + 1],
          b = d[i + 2];
        const y = 0.299 * r + 0.587 * g + 0.114 * b;
        d[i] = clamp(y * 0.35 + r * 0.9 * k + 20, 0, 255);
        d[i + 1] = clamp(y * 0.25 + g * 0.4, 0, 255);
        d[i + 2] = clamp(y * 0.55 + b * 1.1 * k + 30, 0, 255);
      }
      this.ctx.putImageData(img, 0, 0);
    }

    _filterThermal(inten) {
      const img = this.bctx.getImageData(0, 0, this.w, this.h);
      const d = img.data;
      const boost = 0.7 + inten * 0.4;
      for (let i = 0; i < d.length; i += 4) {
        let y = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
        y = clamp(y * boost, 0, 1);
        // black-purple-red-yellow-white
        let r, g, b;
        if (y < 0.25) {
          const t = y / 0.25;
          r = 20 + 80 * t;
          g = 0;
          b = 40 + 120 * t;
        } else if (y < 0.5) {
          const t = (y - 0.25) / 0.25;
          r = 100 + 155 * t;
          g = 20 * t;
          b = 160 - 100 * t;
        } else if (y < 0.75) {
          const t = (y - 0.5) / 0.25;
          r = 255;
          g = 20 + 200 * t;
          b = 60 - 60 * t;
        } else {
          const t = (y - 0.75) / 0.25;
          r = 255;
          g = 220 + 35 * t;
          b = 0 + 255 * t;
        }
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
      }
      this.ctx.putImageData(img, 0, 0);
    }

    _filterVhs(inten) {
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;
      ctx.drawImage(this.buf, 0, 0);
      const shift = Math.floor(2 + inten * 3);
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.35;
      ctx.drawImage(this.buf, shift, 0);
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = 0.35;
      ctx.drawImage(this.buf, -shift, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;

      // scanlines
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      const step = Math.max(2, Math.floor(2 * this.dpr));
      for (let y = 0; y < h; y += step * 2) {
        ctx.fillRect(0, y, w, step);
      }
      // noise band
      const bandY = ((this.t * 40 * inten) % (h + 40)) - 20;
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(0, bandY, w, 12 * this.dpr);
      // desat overlay
      ctx.fillStyle = "rgba(20,40,30,0.12)";
      ctx.fillRect(0, 0, w, h);
    }

    // ── Segmentation helpers ──────────────────────────────────
    _maskCanvas(ml) {
      // Mirror + cover-fit mask to match the drawn video
      return ml.getMaskCanvas(this.w, this.h, this.mirror, this._layout || null);
    }

    _withPersonComposite(ml, drawBg, drawFg) {
      const mask = this._maskCanvas(ml);
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;

      // background layer
      drawBg(ctx, w, h);

      if (!mask) {
        // fallback: show video lightly
        ctx.globalAlpha = 0.85;
        ctx.drawImage(this.buf, 0, 0);
        ctx.globalAlpha = 1;
        return;
      }

      // person layer masked
      this.bctx2.clearRect(0, 0, w, h);
      drawFg(this.bctx2, w, h);
      this.bctx2.globalCompositeOperation = "destination-in";
      this.bctx2.drawImage(mask, 0, 0);
      this.bctx2.globalCompositeOperation = "source-over";
      ctx.drawImage(this.buf2, 0, 0);
    }

    _segNeon(ml, inten) {
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;
      const mask = this._maskCanvas(ml);

      // dim video
      ctx.drawImage(this.buf, 0, 0);
      ctx.fillStyle = `rgba(8,4,18,${0.45 + inten * 0.1})`;
      ctx.fillRect(0, 0, w, h);

      if (!mask) return;

      // glow passes from mask edges
      this.bctx2.clearRect(0, 0, w, h);
      this.bctx2.drawImage(mask, 0, 0);
      // colorize mask
      this.bctx2.globalCompositeOperation = "source-in";
      const g = this.bctx2.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#00f0ff");
      g.addColorStop(0.5, "#ff4fd8");
      g.addColorStop(1, "#7cff6b");
      this.bctx2.fillStyle = g;
      this.bctx2.fillRect(0, 0, w, h);
      this.bctx2.globalCompositeOperation = "source-over";

      ctx.save();
      ctx.shadowColor = "#00e5ff";
      ctx.shadowBlur = 18 * inten * this.dpr;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(this.buf2, 0, 0);
      ctx.shadowBlur = 8 * inten * this.dpr;
      ctx.shadowColor = "#ff4fd8";
      ctx.drawImage(this.buf2, 0, 0);
      ctx.restore();

      // sharp person back on top slightly
      this.bctx2.clearRect(0, 0, w, h);
      this.bctx2.drawImage(this.buf, 0, 0);
      this.bctx2.globalCompositeOperation = "destination-in";
      this.bctx2.drawImage(mask, 0, 0);
      this.bctx2.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.55;
      ctx.drawImage(this.buf2, 0, 0);
      ctx.globalAlpha = 1;
    }

    _segGhost(ml, inten) {
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;
      const mask = this._maskCanvas(ml);

      // desaturated bg
      const img = this.bctx.getImageData(0, 0, w, h);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        d[i] = d[i + 1] = d[i + 2] = y * 0.55;
      }
      ctx.putImageData(img, 0, 0);

      if (!mask) return;
      this.bctx2.clearRect(0, 0, w, h);
      this.bctx2.drawImage(this.buf, 0, 0);
      // cyan tint
      this.bctx2.globalCompositeOperation = "source-atop";
      this.bctx2.fillStyle = `rgba(80,220,255,${0.35 + inten * 0.15})`;
      this.bctx2.fillRect(0, 0, w, h);
      this.bctx2.globalCompositeOperation = "destination-in";
      this.bctx2.drawImage(mask, 0, 0);
      this.bctx2.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.9;
      ctx.drawImage(this.buf2, 0, 0);
      ctx.globalAlpha = 1;
      ctx.shadowColor = "#6ef0ff";
      ctx.shadowBlur = 12 * inten;
      ctx.drawImage(this.buf2, 0, 0);
      ctx.shadowBlur = 0;
    }

    _segBokeh(ml, inten) {
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;
      const mask = this._maskCanvas(ml);
      const blurPx = Math.round(6 + inten * 10) * this.dpr;

      // blurred full frame as bg
      this.bctx2.clearRect(0, 0, w, h);
      this.bctx2.filter = `blur(${blurPx}px)`;
      this.bctx2.drawImage(this.buf, 0, 0);
      this.bctx2.filter = "none";
      ctx.drawImage(this.buf2, 0, 0);

      if (!mask) {
        ctx.drawImage(this.buf, 0, 0);
        return;
      }
      this.bctx2.clearRect(0, 0, w, h);
      this.bctx2.drawImage(this.buf, 0, 0);
      this.bctx2.globalCompositeOperation = "destination-in";
      // slight expand via blur on mask
      this.bctx2.filter = `blur(${1.5 * this.dpr}px)`;
      this.bctx2.drawImage(mask, 0, 0);
      this.bctx2.filter = "none";
      this.bctx2.globalCompositeOperation = "source-over";
      ctx.drawImage(this.buf2, 0, 0);
    }

    _segGlitch(ml, inten) {
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;
      const mask = this._maskCanvas(ml);
      ctx.drawImage(this.buf, 0, 0);
      if (!mask) return;

      const block = Math.max(4, Math.floor((6 + inten * 10) * this.dpr));
      // pixelate person into buf2
      this.bctx2.imageSmoothingEnabled = false;
      const sw = Math.max(1, Math.floor(w / block));
      const sh = Math.max(1, Math.floor(h / block));
      this.bctx2.clearRect(0, 0, w, h);
      this.bctx2.drawImage(this.buf, 0, 0, sw, sh);
      this.bctx2.drawImage(this.buf2, 0, 0, sw, sh, 0, 0, w, h);

      // rgb split
      const shift = Math.floor(inten * 4 * this.dpr);
      const tmp = document.createElement("canvas");
      tmp.width = w;
      tmp.height = h;
      const tctx = tmp.getContext("2d");
      tctx.drawImage(this.buf2, 0, 0);
      this.bctx2.globalCompositeOperation = "screen";
      this.bctx2.fillStyle = "rgba(255,0,80,0.35)";
      this.bctx2.fillRect(0, 0, w, h);
      this.bctx2.globalCompositeOperation = "source-over";
      this.bctx2.drawImage(tmp, shift, 0);
      this.bctx2.globalCompositeOperation = "multiply";
      this.bctx2.drawImage(tmp, -shift, 0);
      this.bctx2.globalCompositeOperation = "source-over";

      this.bctx2.globalCompositeOperation = "destination-in";
      this.bctx2.drawImage(mask, 0, 0);
      this.bctx2.globalCompositeOperation = "source-over";
      ctx.drawImage(this.buf2, 0, 0);
    }

    _segCutout(ml, inten) {
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;
      const mask = this._maskCanvas(ml);
      const hue = (this.t * 20) % 360;

      ctx.fillStyle = `hsl(${(hue + 180) % 360} 45% ${25 + inten * 5}%)`;
      ctx.fillRect(0, 0, w, h);
      // paper grain
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      for (let i = 0; i < 40; i++) {
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }

      if (!mask) return;
      this.bctx2.clearRect(0, 0, w, h);
      this.bctx2.fillStyle = `hsl(${hue} 70% 55%)`;
      this.bctx2.fillRect(0, 0, w, h);
      this.bctx2.globalCompositeOperation = "destination-in";
      this.bctx2.drawImage(mask, 0, 0);
      this.bctx2.globalCompositeOperation = "source-over";
      ctx.drawImage(this.buf2, 0, 0);
      // outline
      ctx.strokeStyle = "rgba(20,10,30,0.5)";
      ctx.lineWidth = 2 * this.dpr;
    }

    _segMatrix(ml, inten, dt) {
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;
      const mask = this._maskCanvas(ml);
      const colW = Math.max(10, Math.floor(14 * this.dpr));
      const cols = Math.ceil(w / colW);

      if (!this.matrixCols || this.matrixCols.length !== cols) {
        this.matrixCols = Array.from({ length: cols }, () => Math.random() * h);
      }

      ctx.fillStyle = "#030806";
      ctx.fillRect(0, 0, w, h);
      ctx.font = `${Math.floor(12 * this.dpr)}px monospace`;
      ctx.fillStyle = `rgba(40,255,90,${0.55 + inten * 0.2})`;
      const chars = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿ01";
      for (let i = 0; i < cols; i++) {
        const x = i * colW;
        let y = this.matrixCols[i];
        const ch = chars[(Math.random() * chars.length) | 0];
        ctx.fillText(ch, x, y);
        y += (8 + inten * 10) * this.dpr;
        if (y > h + 20) y = -Math.random() * 80;
        this.matrixCols[i] = y;
      }

      if (!mask) return;
      this.bctx2.clearRect(0, 0, w, h);
      this.bctx2.drawImage(this.buf, 0, 0);
      this.bctx2.globalCompositeOperation = "destination-in";
      this.bctx2.drawImage(mask, 0, 0);
      this.bctx2.globalCompositeOperation = "source-over";
      // slight green cast on person
      this.bctx2.fillStyle = "rgba(40,255,100,0.12)";
      this.bctx2.globalCompositeOperation = "source-atop";
      this.bctx2.fillRect(0, 0, w, h);
      this.bctx2.globalCompositeOperation = "source-over";
      ctx.drawImage(this.buf2, 0, 0);
    }

    _segPop(ml, inten) {
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;
      const mask = this._maskCanvas(ml);
      ctx.fillStyle = "#1a1030";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#ff5c8a";
      ctx.fillRect(0, 0, w, h);

      if (!mask) return;
      const img = this.bctx.getImageData(0, 0, w, h);
      const d = img.data;
      const levels = Math.max(3, Math.round(3 + inten * 2));
      for (let i = 0; i < d.length; i += 4) {
        const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const q = Math.round((y / 255) * (levels - 1)) / (levels - 1);
        if (q < 0.33) {
          d[i] = 40;
          d[i + 1] = 20;
          d[i + 2] = 80;
        } else if (q < 0.66) {
          d[i] = 255;
          d[i + 1] = 90;
          d[i + 2] = 160;
        } else {
          d[i] = 255;
          d[i + 1] = 220;
          d[i + 2] = 80;
        }
      }
      this.bctx2.putImageData(img, 0, 0);
      this.bctx2.globalCompositeOperation = "destination-in";
      this.bctx2.drawImage(mask, 0, 0);
      this.bctx2.globalCompositeOperation = "source-over";
      ctx.drawImage(this.buf2, 0, 0);
    }

    // ── Pose helpers ──────────────────────────────────────────
    _lm(ml, i) {
      const ls = ml.lastLandmarks;
      if (!ls || !ls[i]) return null;
      const p = ls[i];
      if (p.visibility != null && p.visibility < 0.35) return null;
      // landmarks are normalized 0–1 in video space; map through cover layout + optional mirror
      const L = this._layout || { dx: 0, dy: 0, dw: this.w, dh: this.h };
      let x = L.dx + p.x * L.dw;
      const y = L.dy + p.y * L.dh;
      if (this.mirror) x = this.w - x;
      return {
        x,
        y,
        v: p.visibility == null ? 1 : p.visibility,
      };
    }

    _drawVideoBase(alpha) {
      this.ctx.globalAlpha = alpha == null ? 1 : alpha;
      this.ctx.drawImage(this.buf, 0, 0);
      this.ctx.globalAlpha = 1;
    }

    _poseSkeleton(ml, inten, energyStyle) {
      this._drawVideoBase(0.92);
      const conns = ml.connections || global.BitartPoseConnections;
      const ctx = this.ctx;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (const [a, b] of conns) {
        const pa = this._lm(ml, a);
        const pb = this._lm(ml, b);
        if (!pa || !pb) continue;
        ctx.strokeStyle = energyStyle
          ? `hsla(${(this.t * 80 + a * 12) % 360} 100% 65% / 0.95)`
          : "rgba(255, 220, 120, 0.9)";
        ctx.lineWidth = (energyStyle ? 4 : 3) * inten * this.dpr;
        ctx.shadowColor = energyStyle ? "#00f0ff" : "#ffd36a";
        ctx.shadowBlur = (energyStyle ? 12 : 6) * inten;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      // joints
      for (let i = 0; i < 33; i++) {
        const p = this._lm(ml, i);
        if (!p) continue;
        ctx.beginPath();
        ctx.fillStyle = energyStyle ? "#fff" : "#ff8fab";
        ctx.arc(p.x, p.y, (energyStyle ? 4 : 3.2) * inten * this.dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    _poseEnergy(ml, inten) {
      this._drawVideoBase(0.55);
      const ctx = this.ctx;
      const conns = ml.connections || global.BitartPoseConnections;
      ctx.setLineDash([8 * this.dpr, 10 * this.dpr]);
      ctx.lineDashOffset = -this.t * 40 * inten;
      for (const [a, b] of conns) {
        const pa = this._lm(ml, a);
        const pb = this._lm(ml, b);
        if (!pa || !pb) continue;
        const grad = ctx.createLinearGradient(pa.x, pa.y, pb.x, pb.y);
        grad.addColorStop(0, "#00f0ff");
        grad.addColorStop(1, "#ff4fd8");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 5 * inten * this.dpr;
        ctx.shadowColor = "#00e5ff";
        ctx.shadowBlur = 14 * inten;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      // blooms on hands + nose
      for (const idx of [0, 15, 16]) {
        const p = this._lm(ml, idx);
        if (!p) continue;
        const r = (18 + Math.sin(this.t * 6 + idx) * 6) * inten * this.dpr;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, "rgba(255,255,255,0.85)");
        g.addColorStop(0.4, "rgba(0,240,255,0.45)");
        g.addColorStop(1, "rgba(0,240,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    _poseSparks(ml, inten, dt) {
      this._drawVideoBase(0.88);
      const emitters = [0, 15, 16, 19, 20]
        .map((i) => this._lm(ml, i))
        .filter(Boolean);

      for (const e of emitters) {
        for (let n = 0; n < 2 + inten * 2; n++) {
          this.particles.push({
            x: e.x,
            y: e.y,
            vx: (Math.random() - 0.5) * 120 * inten,
            vy: (Math.random() - 0.8) * 140 * inten,
            life: 1,
            hue: (this.t * 60 + Math.random() * 60) % 360,
          });
        }
      }
      if (this.particles.length > 400) {
        this.particles.splice(0, this.particles.length - 400);
      }

      const ctx = this.ctx;
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 40 * dt;
        p.life -= dt * (0.8 + Math.random() * 0.6);
        if (p.life <= 0) {
          this.particles.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.fillStyle = `hsla(${p.hue} 100% 65% / ${p.life})`;
        ctx.arc(p.x, p.y, 2.5 * this.dpr * p.life * inten, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    _poseAvatar(ml, inten) {
      this.ctx.fillStyle = "rgba(10,6,18,0.72)";
      this.ctx.fillRect(0, 0, this.w, this.h);
      this._drawVideoBase(0.25);

      const ctx = this.ctx;
      const bone = (a, b, width, color) => {
        const pa = this._lm(ml, a);
        const pb = this._lm(ml, b);
        if (!pa || !pb) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = width * inten * this.dpr;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      };

      const skin = "#ffd6a8";
      const shirt = "#7ec8e3";
      const pants = "#5a4f72";

      bone(11, 12, 10, shirt);
      bone(11, 23, 10, shirt);
      bone(12, 24, 10, shirt);
      bone(23, 24, 10, pants);
      bone(11, 13, 8, skin);
      bone(13, 15, 8, skin);
      bone(12, 14, 8, skin);
      bone(14, 16, 8, skin);
      bone(23, 25, 9, pants);
      bone(25, 27, 9, pants);
      bone(24, 26, 9, pants);
      bone(26, 28, 9, pants);

      const nose = this._lm(ml, 0);
      const lsh = this._lm(ml, 11);
      const rsh = this._lm(ml, 12);
      if (nose && lsh && rsh) {
        const r =
          Math.hypot(lsh.x - rsh.x, lsh.y - rsh.y) * 0.35 * inten;
        ctx.fillStyle = skin;
        ctx.beginPath();
        ctx.arc(nose.x, nose.y - r * 0.2, Math.max(10, r), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#3a3028";
        ctx.lineWidth = 2 * this.dpr;
        ctx.stroke();
      }
      // hands
      for (const hi of [15, 16]) {
        const p = this._lm(ml, hi);
        if (!p) continue;
        ctx.fillStyle = skin;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7 * inten * this.dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    _poseTrails(ml, inten) {
      this._drawVideoBase(0.9);
      const maxLen = Math.floor(18 + inten * 20);
      const push = (key, idx) => {
        const p = this._lm(ml, idx);
        if (!p) return;
        const arr = this.trails[key];
        arr.push({ x: p.x, y: p.y });
        if (arr.length > maxLen) arr.shift();
      };
      push("L", 15);
      push("R", 16);
      push("LA", 27);
      push("RA", 28);

      const ctx = this.ctx;
      const strokeTrail = (arr, hue) => {
        if (arr.length < 2) return;
        for (let i = 1; i < arr.length; i++) {
          const a = arr[i - 1];
          const b = arr[i];
          const t = i / arr.length;
          ctx.strokeStyle = `hsla(${hue} 100% 65% / ${t * 0.9})`;
          ctx.lineWidth = (2 + t * 8 * inten) * this.dpr;
          ctx.lineCap = "round";
          ctx.shadowColor = `hsl(${hue} 100% 60%)`;
          ctx.shadowBlur = 8 * inten;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      };
      strokeTrail(this.trails.L, 190);
      strokeTrail(this.trails.R, 320);
      strokeTrail(this.trails.LA, 120);
      strokeTrail(this.trails.RA, 50);
    }

    _poseExo(ml, inten) {
      this._drawVideoBase(0.75);
      const ctx = this.ctx;
      const conns = ml.connections || global.BitartPoseConnections;

      for (const [a, b] of conns) {
        const pa = this._lm(ml, a);
        const pb = this._lm(ml, b);
        if (!pa || !pb) continue;
        const mx = (pa.x + pb.x) / 2;
        const my = (pa.y + pb.y) / 2;
        const ang = Math.atan2(pb.y - pa.y, pb.x - pa.x);
        const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
        const thick = 7 * inten * this.dpr;

        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(ang);
        ctx.strokeStyle = "rgba(180, 230, 255, 0.85)";
        ctx.fillStyle = "rgba(40, 80, 120, 0.45)";
        ctx.lineWidth = 1.5 * this.dpr;
        ctx.beginPath();
        ctx.rect(-len / 2, -thick / 2, len, thick);
        ctx.fill();
        ctx.stroke();
        // corner ticks
        ctx.strokeStyle = "#7ec8e3";
        ctx.beginPath();
        ctx.moveTo(-len / 2, -thick / 2);
        ctx.lineTo(-len / 2 + 6, -thick / 2);
        ctx.moveTo(len / 2, thick / 2);
        ctx.lineTo(len / 2 - 6, thick / 2);
        ctx.stroke();
        ctx.restore();
      }

      // status pips at shoulders
      for (const idx of [11, 12, 23, 24]) {
        const p = this._lm(ml, idx);
        if (!p) continue;
        ctx.fillStyle = "#5cff9a";
        ctx.shadowColor = "#5cff9a";
        ctx.shadowBlur = 8;
        ctx.fillRect(p.x - 3 * this.dpr, p.y - 3 * this.dpr, 6 * this.dpr, 6 * this.dpr);
        ctx.shadowBlur = 0;
      }
    }

    _hybrid(ml, inten) {
      this._segNeon(ml, inten * 0.9);
      // overlay skeleton without redrawing heavy video base
      const conns = ml.connections || global.BitartPoseConnections;
      const ctx = this.ctx;
      ctx.lineCap = "round";
      for (const [a, b] of conns) {
        const pa = this._lm(ml, a);
        const pb = this._lm(ml, b);
        if (!pa || !pb) continue;
        ctx.strokeStyle = "rgba(255, 240, 180, 0.95)";
        ctx.lineWidth = 2.5 * inten * this.dpr;
        ctx.shadowColor = "#ffd36a";
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      for (let i = 0; i < 33; i++) {
        const p = this._lm(ml, i);
        if (!p) continue;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.4 * this.dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  global.BitartFilters = FilterEngine;
})(typeof window !== "undefined" ? window : globalThis);
