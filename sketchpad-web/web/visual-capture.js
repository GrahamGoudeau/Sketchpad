const MIME_TYPES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

export function captureFileName(date = new Date()) {
  return `sketchpad-visual-${date.toISOString().replaceAll(":", "-")}.webm`;
}

export function supportedCaptureType(mediaRecorder = globalThis.MediaRecorder) {
  if (!mediaRecorder) return null;
  return MIME_TYPES.find((type) => mediaRecorder.isTypeSupported(type)) ?? "video/webm";
}

export class VisualCapture {
  constructor(canvas, overlayState = () => null, mediaRecorder = globalThis.MediaRecorder) {
    this.canvas = canvas;
    this.overlayState = overlayState;
    this.MediaRecorder = mediaRecorder;
    this.captureCanvas = null;
    this.captureContext = null;
    this.frameRequest = null;
    this.lastFrameAt = 0;
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
    this.blob = null;
    this.startedAt = null;
    this.startedOn = null;
  }

  get supported() {
    return typeof this.canvas.captureStream === "function" && Boolean(this.MediaRecorder);
  }

  get recording() {
    return this.recorder?.state === "recording";
  }

  start() {
    if (!this.supported) throw new Error("This browser cannot record the scope canvas.");
    if (this.recording) return;
    this.chunks = [];
    this.blob = null;
    this.captureCanvas = document.createElement("canvas");
    this.captureContext = this.captureCanvas.getContext("2d", { alpha: false });
    this.drawFrame(performance.now(), true);
    this.stream = this.captureCanvas.captureStream(30);
    const mimeType = supportedCaptureType(this.MediaRecorder);
    this.recorder = new this.MediaRecorder(this.stream, {
      mimeType,
      videoBitsPerSecond: 2_000_000,
    });
    this.recorder.addEventListener("dataavailable", ({ data }) => {
      if (data.size > 0) this.chunks.push(data);
    });
    this.startedAt = performance.now();
    this.startedOn = new Date();
    this.recorder.start(1000);
    this.frameRequest = requestAnimationFrame((now) => this.drawFrame(now));
  }

  drawFrame(now, initial = false) {
    if (!initial && !this.recording) return;
    if (initial || now - this.lastFrameAt >= 1000 / 30) {
      if (
        this.captureCanvas.width !== this.canvas.width
        || this.captureCanvas.height !== this.canvas.height
      ) {
        this.captureCanvas.width = this.canvas.width;
        this.captureCanvas.height = this.canvas.height;
      }
      const context = this.captureContext;
      context.drawImage(this.canvas, 0, 0);
      const state = this.overlayState();
      if (state) {
        const x = Math.max(0, Math.min(1, state.x)) * this.captureCanvas.width;
        const y = Math.max(0, Math.min(1, state.y)) * this.captureCanvas.height;
        const scale = Math.max(1, this.captureCanvas.width / 1024);
        context.strokeStyle = "rgb(76 232 255 / 0.95)";
        context.lineWidth = 1.5 * scale;
        context.beginPath();
        context.moveTo(x - 10 * scale, y);
        context.lineTo(x + 10 * scale, y);
        context.moveTo(x, y - 10 * scale);
        context.lineTo(x, y + 10 * scale);
        context.stroke();
        context.fillStyle = "rgb(2 10 8 / 0.78)";
        context.fillRect(8 * scale, this.captureCanvas.height - 30 * scale,
          465 * scale, 22 * scale);
        context.fillStyle = "rgb(76 232 255)";
        context.font = `${12 * scale}px monospace`;
        context.textBaseline = "middle";
        context.fillText(
          `INPUT ${state.active ? "DOWN" : "UP"}  ${state.penState}  X ${state.x.toFixed(4)}  Y ${state.y.toFixed(4)}  TX2 ${state.simulatedTime.toFixed(3)} s`,
          14 * scale,
          this.captureCanvas.height - 19 * scale,
        );
      }
      this.lastFrameAt = now;
    }
    if (!initial) this.frameRequest = requestAnimationFrame((next) => this.drawFrame(next));
  }

  stop() {
    if (!this.recording) return Promise.resolve(this.blob);
    return new Promise((resolve) => {
      this.recorder.addEventListener("stop", () => {
        cancelAnimationFrame(this.frameRequest);
        this.frameRequest = null;
        this.blob = new Blob(this.chunks, { type: this.recorder.mimeType });
        for (const track of this.stream.getTracks()) track.stop();
        this.stream = null;
        this.captureCanvas = null;
        this.captureContext = null;
        resolve(this.blob);
      }, { once: true });
      this.recorder.stop();
    });
  }

  download(date = this.startedOn ?? new Date()) {
    if (!this.blob) throw new Error("Stop a recording before you download it.");
    const url = URL.createObjectURL(this.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = captureFileName(date);
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
