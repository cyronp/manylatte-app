export class CanvasBusyError extends Error {
  constructor() {
    super('The board is busy. Please try again shortly.');
  }
}

export class WorkBudget {
  #pending = 0;
  #peak = 0;
  constructor(readonly limit = 512) {}
  reserve() {
    if (this.#pending >= this.limit) throw new CanvasBusyError();
    this.#pending++;
    this.#peak = Math.max(this.#peak, this.#pending);
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.#pending--;
      }
    };
  }
  get pending() {
    return this.#pending;
  }
  get peak() {
    return this.#peak;
  }
}
