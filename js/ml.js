/* Bitart Camera — MediaPipe Selfie Segmentation + Pose Landmarker */
(function (global) {
  "use strict";

  const WASM =
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
  const SEG_MODEL =
    "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";
  const POSE_MODEL =
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.tflite";

  // MediaPipe Pose connections (subset of full graph)
  const POSE_CONNECTIONS = [
    [11, 12],
    [11, 13],
    [13, 15],
    [12, 14],
    [14, 16],
    [11, 23],
    [12, 24],
    [23, 24],
    [23, 25],
    [25, 27],
    [24, 26],
    [26, 28],
    [15, 17],
    [15, 19],
    [15, 21],
    [16, 18],
    [16, 20],
    [16, 22],
    [27, 29],
    [27, 31],
    [28, 30],
    [28, 32],
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 7],
    [0, 4],
    [4, 5],
    [5, 6],
    [6, 8],
    [9, 10],
  ];

  class BitartML {
    constructor() {
      this.vision = null;
      this.segmenter = null;
      this.pose = null;
      this.status = "idle"; // idle | loading | ready | error
      this.error = null;
      this._loadPromise = null;
      this._segWanted = false;
      this._poseWanted = false;

      // last results
      this.maskCanvas = document.createElement("canvas");
      this.maskCtx = this.maskCanvas.getContext("2d", { willReadFrequently: true });
      this.lastMask = null; // ImageData or null
      this.lastLandmarks = null; // array of {x,y,z,visibility}
      this.lastTs = 0;
    }

    get connections() {
      return POSE_CONNECTIONS;
    }

    async ensure(needs) {
      const wantSeg = needs.includes("segment");
      const wantPose = needs.includes("pose");
      this._segWanted = this._segWanted || wantSeg;
      this._poseWanted = this._poseWanted || wantPose;
      if (!wantSeg && !wantPose) return;

      if (!this._loadPromise) {
        this._loadPromise = this._loadAll();
      }
      await this._loadPromise;

      if (wantSeg && !this.segmenter) {
        await this._initSegmenter();
      }
      if (wantPose && !this.pose) {
        await this._initPose();
      }
    }

    async _loadAll() {
      this.status = "loading";
      try {
        const mod = await import(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm"
        );
        this._FilesetResolver = mod.FilesetResolver;
        this._ImageSegmenter = mod.ImageSegmenter;
        this._PoseLandmarker = mod.PoseLandmarker;
        this.vision = await mod.FilesetResolver.forVisionTasks(WASM);
        this.status = "ready";
      } catch (err) {
        this.status = "error";
        this.error = err;
        console.error("[BitartML] load failed", err);
        throw err;
      }
    }

    async _initSegmenter() {
      if (this.segmenter) return;
      try {
        this.segmenter = await this._ImageSegmenter.createFromOptions(this.vision, {
          baseOptions: {
            modelAssetPath: SEG_MODEL,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        });
      } catch (gpuErr) {
        console.warn("[BitartML] GPU segmenter failed, trying CPU", gpuErr);
        this.segmenter = await this._ImageSegmenter.createFromOptions(this.vision, {
          baseOptions: {
            modelAssetPath: SEG_MODEL,
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        });
      }
    }

    async _initPose() {
      if (this.pose) return;
      try {
        this.pose = await this._PoseLandmarker.createFromOptions(this.vision, {
          baseOptions: {
            modelAssetPath: POSE_MODEL,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 2,
          minPoseDetectionConfidence: 0.4,
          minPosePresenceConfidence: 0.4,
          minTrackingConfidence: 0.4,
        });
      } catch (gpuErr) {
        console.warn("[BitartML] GPU pose failed, trying CPU", gpuErr);
        this.pose = await this._PoseLandmarker.createFromOptions(this.vision, {
          baseOptions: {
            modelAssetPath: POSE_MODEL,
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numPoses: 2,
          minPoseDetectionConfidence: 0.4,
          minPosePresenceConfidence: 0.4,
          minTrackingConfidence: 0.4,
        });
      }
    }

    /**
     * Run models as needed for the current mode.
     * @param {HTMLVideoElement|HTMLCanvasElement} source
     * @param {string[]} needs
     * @param {number} timestampMs
     */
    infer(source, needs, timestampMs) {
      const ts = Math.max(timestampMs, this.lastTs + 1);
      this.lastTs = ts;

      if (needs.includes("segment") && this.segmenter) {
        try {
          const result = this.segmenter.segmentForVideo(source, ts);
          this._storeMask(result, source);
          if (result && result.close) result.close();
        } catch (err) {
          console.warn("[BitartML] segment", err);
        }
      }

      if (needs.includes("pose") && this.pose) {
        try {
          const result = this.pose.detectForVideo(source, ts);
          if (result && result.landmarks && result.landmarks.length) {
            this.lastLandmarks = result.landmarks[0];
            this.lastAllPoses = result.landmarks;
          } else {
            this.lastLandmarks = null;
            this.lastAllPoses = [];
          }
        } catch (err) {
          console.warn("[BitartML] pose", err);
        }
      }
    }

    _storeMask(result, source) {
      // Prefer confidence mask (person probability 0–1). Fall back to category mask.
      let mask = null;
      let mode = "confidence";
      if (result && result.confidenceMasks && result.confidenceMasks.length) {
        mask = result.confidenceMasks[0];
        mode = "confidence";
      } else if (result && result.categoryMask) {
        mask = result.categoryMask;
        mode = "category";
      } else {
        return;
      }

      const w = mask.width;
      const h = mask.height;
      if (this.maskCanvas.width !== w || this.maskCanvas.height !== h) {
        this.maskCanvas.width = w;
        this.maskCanvas.height = h;
      }

      let floats = null;
      let bytes = null;
      try {
        floats = mask.getAsFloat32Array();
      } catch (_) {
        try {
          bytes = mask.getAsUint8Array();
        } catch (e2) {
          console.warn("[BitartML] mask read failed", e2);
          if (mask.close) mask.close();
          return;
        }
      }

      const img = this.maskCtx.createImageData(w, h);
      const out = img.data;
      const n = w * h;

      if (floats) {
        // Confidence: higher = more person-like for selfie models
        for (let i = 0; i < n; i++) {
          const a = Math.max(0, Math.min(255, (floats[i] * 255) | 0));
          const o = i * 4;
          out[o] = out[o + 1] = out[o + 2] = 255;
          out[o + 3] = a;
        }
      } else if (bytes) {
        // Category indices: treat non-zero as person (selfie_segmenter: 0=bg, 1=person)
        for (let i = 0; i < n; i++) {
          const person = bytes[i] > 0 ? 255 : 0;
          const o = i * 4;
          out[o] = out[o + 1] = out[o + 2] = 255;
          out[o + 3] = person;
        }
      }

      this.maskCtx.putImageData(img, 0, 0);
      this.lastMask = img;
      this.maskW = w;
      this.maskH = h;
      this.maskMode = mode;

      if (mask.close) mask.close();
      // Close other confidence masks if present
      if (result.confidenceMasks) {
        for (const m of result.confidenceMasks) {
          if (m !== mask && m.close) m.close();
        }
      }
      if (result.categoryMask && result.categoryMask !== mask && result.categoryMask.close) {
        result.categoryMask.close();
      }
    }

    /**
     * Draw mask alpha into a canvas matching target size.
     * @param {number} tw
     * @param {number} th
     * @param {boolean} mirror
     * @param {{dx:number,dy:number,dw:number,dh:number}|null} layout cover-fit rect
     */
    getMaskCanvas(tw, th, mirror, layout) {
      if (!this.lastMask) return null;
      if (
        !this._scaledMask ||
        this._scaledMask.width !== tw ||
        this._scaledMask.height !== th
      ) {
        this._scaledMask = document.createElement("canvas");
        this._scaledMask.width = tw;
        this._scaledMask.height = th;
        this._scaledCtx = this._scaledMask.getContext("2d");
      }
      const c = this._scaledCtx;
      c.clearRect(0, 0, tw, th);
      c.imageSmoothingEnabled = true;
      c.save();
      if (mirror) {
        c.translate(tw, 0);
        c.scale(-1, 1);
      }
      if (layout) {
        c.drawImage(this.maskCanvas, layout.dx, layout.dy, layout.dw, layout.dh);
      } else {
        c.drawImage(this.maskCanvas, 0, 0, tw, th);
      }
      c.restore();
      return this._scaledMask;
    }
  }

  global.BitartML = BitartML;
  global.BitartPoseConnections = POSE_CONNECTIONS;
})(typeof window !== "undefined" ? window : globalThis);
