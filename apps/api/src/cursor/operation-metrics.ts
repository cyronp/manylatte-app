export class OperationMetrics {
  commands = 0;
  writeFailures = 0;
  loadFailures = 0;
  busy = 0;
  durationMs = 0;
  maxDurationMs = 0;
  record(duration: number) {
    this.commands++;
    this.durationMs += duration;
    this.maxDurationMs = Math.max(this.maxDurationMs, duration);
  }
  snapshot() {
    return {
      commands: this.commands,
      writeFailures: this.writeFailures,
      loadFailures: this.loadFailures,
      busy: this.busy,
      averageCommandMs: this.commands ? this.durationMs / this.commands : 0,
      maxCommandMs: this.maxDurationMs,
    };
  }
}
