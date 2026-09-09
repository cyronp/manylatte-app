import { TokenBucket } from './token-bucket.js';

interface Limits {
  maxConnectionsPerIp: number;
  maxTotalConnections: number;
  maxParticipantsPerRoom: number;
}

// Reservations are synchronous and released exactly once, including failed handshakes.
export class ConnectionAdmission {
  #ips = new Map<string, number>();
  #rooms = new Map<string, number>();
  #attempts = new Map<string, { at: number; budget: TokenBucket }>();
  #total = 0;

  constructor(
    private readonly limits: Limits,
    private readonly now = Date.now,
  ) {}

  attempt(ip: string) {
    const at = this.now();
    let attempt = this.#attempts.get(ip);
    if (!attempt) {
      // Limit memory even when a caller has many source addresses.
      if (this.#attempts.size >= 10_000) return false;
      attempt = {
        at,
        budget: new TokenBucket(
          this.limits.maxConnectionsPerIp,
          Math.max(1, this.limits.maxConnectionsPerIp / 10),
          at,
        ),
      };
      this.#attempts.set(ip, attempt);
    }
    attempt.at = at;
    return attempt.budget.take(at);
  }

  reserveTransport(ip: string): (() => void) | undefined {
    const count = this.#ips.get(ip) ?? 0;
    if (
      count >= this.limits.maxConnectionsPerIp ||
      this.#total >= this.limits.maxTotalConnections
    )
      return;
    this.#ips.set(ip, count + 1);
    this.#total++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#total--;
      const next = (this.#ips.get(ip) ?? 1) - 1;
      if (next) this.#ips.set(ip, next);
      else this.#ips.delete(ip);
    };
  }

  reserveRoom(roomId: string): (() => void) | undefined {
    const count = this.#rooms.get(roomId) ?? 0;
    if (count >= this.limits.maxParticipantsPerRoom) return;
    this.#rooms.set(roomId, count + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = (this.#rooms.get(roomId) ?? 1) - 1;
      if (next) this.#rooms.set(roomId, next);
      else this.#rooms.delete(roomId);
    };
  }

  sweep() {
    for (const [ip, attempt] of this.#attempts) {
      if (this.now() - attempt.at >= 600_000) this.#attempts.delete(ip);
    }
  }

  get connections() {
    return this.#total;
  }
}
