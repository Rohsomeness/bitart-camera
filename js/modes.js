/* Bitart Camera — filter mode catalog + tidbits */
(function (global) {
  "use strict";

  /**
   * kind: "classic" | "segment" | "pose" | "hybrid"
   * needs: which ML systems to warm (segment / pose)
   */
  const MODES = [
    // ── Classic canvas filters (no ML) ──────────────────────────
    {
      id: "raw",
      name: "Raw Cam",
      kind: "classic",
      needs: [],
      thumb: "assets/thumbs/raw.svg",
      blurb: "Unfiltered live camera",
      tidbit:
        "Passthrough. Frames from your webcam are drawn to a canvas (mirrored for a selfie feel). No ML, no pixels rewritten — just the feed with the retro shell around it.",
    },
    {
      id: "noir",
      name: "Noir",
      kind: "classic",
      needs: [],
      thumb: "assets/thumbs/noir.svg",
      blurb: "High-contrast black & white",
      tidbit:
        "Classic film-noir grade. Each RGB pixel is converted to luminance (0.299R + 0.587G + 0.114B), then contrast is stretched so shadows crush and highlights pop — all on the CPU via ImageData.",
    },
    {
      id: "cyber",
      name: "Cyber",
      kind: "classic",
      needs: [],
      thumb: "assets/thumbs/cyber.svg",
      blurb: "Magenta / cyan color grade",
      tidbit:
        "A dual-tone cyberpunk grade. Shadows lean into deep cyan/teal and highlights into hot magenta by remapping channels — pure pixel math, no person detection.",
    },
    {
      id: "thermal",
      name: "Thermal",
      kind: "classic",
      needs: [],
      thumb: "assets/thumbs/thermal.svg",
      blurb: "Heat-map palette on luminance",
      tidbit:
        "Luminance is mapped through a false-color ramp (black → purple → red → yellow → white), the same idea as IR thermography. Brighter = 'hotter' in the look, not actual temperature.",
    },
    {
      id: "vhs",
      name: "VHS",
      kind: "classic",
      needs: [],
      thumb: "assets/thumbs/vhs.svg",
      blurb: "Tracking glitch + scanlines",
      tidbit:
        "Simulates analog tape: horizontal RGB channel splits (chromatic aberration), rolling scanline noise, slight desaturation, and jitter. All canvas composites — no models involved.",
    },

    // ── Segmentation filters ────────────────────────────────────
    {
      id: "neon",
      name: "Neon",
      kind: "segment",
      needs: ["segment"],
      thumb: "assets/thumbs/neon.svg",
      blurb: "Glowing outline of you",
      tidbit:
        "Selfie Segmentation builds a per-pixel person mask. We extract edges of that mask, stroke them in cyan/magenta, and add a soft glow. Background is dimmed so the outline reads as neon signage.",
    },
    {
      id: "ghost",
      name: "Ghost",
      kind: "segment",
      needs: ["segment"],
      thumb: "assets/thumbs/ghost.svg",
      blurb: "Spectral person, grey world",
      tidbit:
        "The mask splits the frame: your body is tinted cool cyan with a soft multiply, while everything else is desaturated. Same MediaPipe Selfie Segmentation mask as Neon — different composite recipe.",
    },
    {
      id: "bokeh",
      name: "Bokeh",
      kind: "segment",
      needs: ["segment"],
      thumb: "assets/thumbs/bokeh.svg",
      blurb: "Blurred background, sharp you",
      tidbit:
        "Portrait-mode effect. Background pixels are drawn from a heavily blurred copy of the frame; person pixels stay sharp. The mask is slightly feathered so the cutout edge softens like a real lens.",
    },
    {
      id: "glitch",
      name: "Glitch",
      kind: "segment",
      needs: ["segment"],
      thumb: "assets/thumbs/glitch.svg",
      blurb: "Pixelate + RGB-split you",
      tidbit:
        "Only the person region is pixelated and RGB-shifted; the room stays normal. Segmentation decides the cut. Pixel size scales with the INTEN slider for chunkier glitches.",
    },
    {
      id: "cutout",
      name: "Cutout",
      kind: "segment",
      needs: ["segment"],
      thumb: "assets/thumbs/cutout.svg",
      blurb: "Stencil silhouette on paper",
      tidbit:
        "Your silhouette is filled with a solid duotone paper texture while the background becomes a flat colored field. Classic stencil / paper-cut look driven purely by the person mask.",
    },
    {
      id: "matrix",
      name: "Matrix",
      kind: "segment",
      needs: ["segment"],
      thumb: "assets/thumbs/matrix.svg",
      blurb: "Code rain outside your body",
      tidbit:
        "Green digital rain fills the background. The person mask punches a 'window' so you stay (mostly) real while the world becomes code. Rain columns scroll on a separate offscreen buffer each frame.",
    },
    {
      id: "pop",
      name: "Pop Art",
      kind: "segment",
      needs: ["segment"],
      thumb: "assets/thumbs/pop.svg",
      blurb: "Posterized you, flat bg",
      tidbit:
        "Person pixels are posterized into a few loud color bands (Warhol energy); background collapses to a flat complementary color. Mask from Selfie Segmentation, colors from hard luminance thresholds.",
    },

    // ── Pose playground ─────────────────────────────────────────
    {
      id: "skeleton",
      name: "Skeleton",
      kind: "pose",
      needs: ["pose"],
      thumb: "assets/thumbs/skeleton.svg",
      blurb: "Bones & joints overlay",
      tidbit:
        "MediaPipe Pose Landmarker finds ~33 body landmarks (shoulders, elbows, wrists, hips, knees…). We connect them with the standard bone graph and draw joints as glowing dots over the live feed.",
    },
    {
      id: "energy",
      name: "Energy",
      kind: "pose",
      needs: ["pose"],
      thumb: "assets/thumbs/energy.svg",
      blurb: "Pulsing power lines",
      tidbit:
        "Same pose landmarks, different ink: thick animated energy strokes with a moving dash pattern, plus soft radial blooms at hands and head. Feels like a power-up HUD from a fighting game.",
    },
    {
      id: "sparks",
      name: "Sparks",
      kind: "pose",
      needs: ["pose"],
      thumb: "assets/thumbs/sparks.svg",
      blurb: "Particles from hands & head",
      tidbit:
        "Each frame, particle emitters attach to wrists and nose. Particles drift, fade, and recycle. Move your hands to paint trails in the air — pure pose tracking, no segmentation.",
    },
    {
      id: "avatar",
      name: "Avatar",
      kind: "pose",
      needs: ["pose"],
      thumb: "assets/thumbs/avatar.svg",
      blurb: "Stick figure puppet",
      tidbit:
        "Your pose drives a simple drawn character: head circle, torso, limbs as thick strokes, hands as mitts. The live video dims underneath so the avatar reads clearly — a tiny motion-capture puppet.",
    },
    {
      id: "trails",
      name: "Trails",
      kind: "pose",
      needs: ["pose"],
      thumb: "assets/thumbs/trails.svg",
      blurb: "Motion ribbons on wrists",
      tidbit:
        "Wrist (and optional ankle) positions are pushed into a short history buffer every frame. We stroke the polyline with fading width/alpha — classic light-painting / motion-ribbon effect.",
    },
    {
      id: "exo",
      name: "Exo HUD",
      kind: "pose",
      needs: ["pose"],
      thumb: "assets/thumbs/exo.svg",
      blurb: "Exoskeleton armor plates",
      tidbit:
        "Bones become hard-edged armor segments with corner ticks and status pips. Landmark confidence can tint segments. Sci-fi suit-up look without replacing your body.",
    },

    // ── Hybrid ──────────────────────────────────────────────────
    {
      id: "hybrid",
      name: "Hybrid",
      kind: "hybrid",
      needs: ["segment", "pose"],
      thumb: "assets/thumbs/hybrid.svg",
      blurb: "Neon body + skeleton",
      tidbit:
        "Runs both models: Selfie Segmentation for the glowing person cutout, Pose Landmarker for bones on top. Heaviest mode — if it stutters, drop INTEN or pick a lighter filter.",
    },
  ];

  global.BitartCameraModes = MODES;
})(typeof window !== "undefined" ? window : globalThis);
