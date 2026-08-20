import type { Clock } from "../../shared/contracts";

/**
 * Interruttore minimo per il provider AI: dopo N fallimenti consecutivi la
 * chiamata non parte più per un intervallo. Lo stato è per isolate: basta a
 * evitare retry storm senza introdurre stato condiviso.
 */
export class CircuitBreaker {
  private failures = 0;
  private openUntil = 0;

  constructor(
    private readonly clock: Clock,
    private readonly threshold = 3,
    private readonly cooldownMs = 30_000,
  ) {}

  allows(): boolean {
    return this.clock.now().getTime() >= this.openUntil;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openUntil = 0;
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.threshold) {
      this.openUntil = this.clock.now().getTime() + this.cooldownMs;
      this.failures = 0;
    }
  }
}
