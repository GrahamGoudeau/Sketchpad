// Renders the emulated unit-60 output into a raw gray8 frame stream for
// making films of a regression.  It reads the scope point events the
// machine emits and nothing else: no geometry, no state, no overlays.
// Set SCOPE_RECORD=<prefix> on a regression to write <prefix>.gray
// (512 by 512, 8-bit, one frame per 1/30 s of simulated time) and
// <prefix>.frames.jsonl (frame number, simulated time, phase).
import fs from "node:fs";

export class ScopeRecorder {
  constructor(prefix, { size = 512, fps = 30, decay = 0.55, gain = 170 } = {}) {
    this.size = size;
    this.fps = fps;
    this.decay = decay;
    this.gain = gain;
    this.canvas = new Float32Array(size * size);
    this.frameBytes = Buffer.alloc(size * size);
    this.nextFrameAt = 0;
    this.frame = 0;
    this.lastTime = 0;
    this.video = fs.openSync(`${prefix}.gray`, "w");
    this.index = fs.openSync(`${prefix}.frames.jsonl`, "w");
  }

  // Emit frames up to `seconds`, decaying the phosphor between them.
  advance(seconds, phase) {
    while (this.nextFrameAt <= seconds) {
      const { canvas, frameBytes, decay } = this;
      for (let i = 0; i < canvas.length; i += 1) {
        const v = canvas[i];
        frameBytes[i] = v > 255 ? 255 : v;
        canvas[i] = v * decay;
      }
      fs.writeSync(this.video, frameBytes);
      fs.writeSync(this.index, `${JSON.stringify({ frame: this.frame, time: this.nextFrameAt, phase })}\n`);
      this.frame += 1;
      this.nextFrameAt += 1 / this.fps;
    }
    this.lastTime = seconds;
  }

  consume(events, phase) {
    const scale = this.size / 1024;
    for (const event of events) {
      if (event?.kind !== "scope_point" || event.unit !== 0o60) continue;
      this.advance(event.at_seconds, phase);
      // Scope y is upward; image rows run downward.
      const x = Math.floor(event.physical_x * scale);
      const y = this.size - 1 - Math.floor(event.physical_y * scale);
      if (x < 0 || x >= this.size || y < 0 || y >= this.size) continue;
      this.canvas[y * this.size + x] += this.gain * (1 + event.intensity);
    }
  }
}
