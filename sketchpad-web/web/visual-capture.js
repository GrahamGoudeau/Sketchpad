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
  constructor(canvas, mediaRecorder = globalThis.MediaRecorder) {
    this.canvas = canvas;
    this.MediaRecorder = mediaRecorder;
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
    this.stream = this.canvas.captureStream(30);
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
  }

  stop() {
    if (!this.recording) return Promise.resolve(this.blob);
    return new Promise((resolve) => {
      this.recorder.addEventListener("stop", () => {
        this.blob = new Blob(this.chunks, { type: this.recorder.mimeType });
        for (const track of this.stream.getTracks()) track.stop();
        this.stream = null;
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
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
