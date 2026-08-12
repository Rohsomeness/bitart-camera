/* Bitart Camera — getUserMedia helper */
(function (global) {
  "use strict";

  class BitartCamera {
    constructor() {
      this.stream = null;
      this.video = document.createElement("video");
      this.video.setAttribute("playsinline", "");
      this.video.setAttribute("webkit-playsinline", "");
      this.video.muted = true;
      this.video.autoplay = true;
      this.video.playsInline = true;
      this.ready = false;
      this.facingMode = "user";
      this._onEnded = null;
    }

    get live() {
      return !!(this.stream && this.ready && !this.video.paused);
    }

    get width() {
      return this.video.videoWidth || 0;
    }

    get height() {
      return this.video.videoHeight || 0;
    }

    async start(opts) {
      const facingMode = (opts && opts.facingMode) || this.facingMode || "user";
      this.facingMode = facingMode;

      if (this.stream) {
        this.stop();
      }

      const constraints = {
        audio: false,
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        // Fallback without ideal size
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode },
        });
      }

      this.stream = stream;
      this.video.srcObject = stream;
      this.ready = false;

      await new Promise((resolve, reject) => {
        const onReady = () => {
          cleanup();
          this.ready = true;
          resolve();
        };
        const onErr = (e) => {
          cleanup();
          reject(e || new Error("video error"));
        };
        const cleanup = () => {
          this.video.removeEventListener("loadeddata", onReady);
          this.video.removeEventListener("error", onErr);
        };
        this.video.addEventListener("loadeddata", onReady);
        this.video.addEventListener("error", onErr);
        this.video.play().catch(() => {});
      });

      // Detect hard stop from browser UI
      this.stream.getTracks().forEach((t) => {
        t.addEventListener("ended", () => {
          if (this._onEnded) this._onEnded();
        });
      });

      return this;
    }

    stop() {
      if (this.stream) {
        this.stream.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch (_) {}
        });
      }
      this.stream = null;
      this.video.srcObject = null;
      this.ready = false;
    }

    async flip() {
      const next = this.facingMode === "user" ? "environment" : "user";
      if (!this.stream) {
        this.facingMode = next;
        return;
      }
      await this.start({ facingMode: next });
    }

    onEnded(fn) {
      this._onEnded = fn;
    }
  }

  global.BitartCamera = BitartCamera;
})(typeof window !== "undefined" ? window : globalThis);
