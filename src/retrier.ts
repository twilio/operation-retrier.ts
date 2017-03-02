import { EventEmitter } from "events";

/**
 *
 */
class Retrier extends EventEmitter {
  private minDelay: number;
  private maxDelay: number;
  private initialDelay: number;
  private maxAttemptsCount: number;
  private maxAttemptsTime: number;

  // fibonacci strategy
  private prevDelay: number;
  private currDelay: number;

  private timeout: any;
  private resolve: Function;
  private reject: Function;
  private inProgress: boolean;
  private attemptNum: number;
  private startTimestamp: number;

  /**
   * Creates a new Retrier instance
   */
  constructor(options: { min: number,
                         max: number,
                         initial?: number,
                         maxAttemptsCount?: number
                         maxAttemptsTime?: number
                       })
  {
    super();

    this.minDelay = options.min;
    this.maxDelay = options.max;
    this.initialDelay = options.initial || 0;
    this.maxAttemptsCount = options.maxAttemptsCount || 0;
    this.maxAttemptsTime = options.maxAttemptsTime || 0;

    this.inProgress = false;
    this.attemptNum = 0;

    this.prevDelay = 0;
    this.currDelay = 0;
  }

  protected attempt() {
    clearTimeout(this.timeout);

    this.attemptNum++;

    this.timeout = null;
    this.emit("attempt", this);
  }

  protected nextDelay() : number {
    if (this.attemptNum == 0) {
      return this.initialDelay;
    }

    if (this.attemptNum == 1) {
      this.currDelay = this.minDelay;
      return this.currDelay;
    }

    let delay = this.currDelay + this.prevDelay;
    this.prevDelay = this.currDelay;
    this.currDelay = delay;
    return delay;
  }

  protected scheduleAttempt(delayOverride?: number) {
    if (this.maxAttemptsCount && this.attemptNum >= this.maxAttemptsCount) {
      this.cleanup();
      this.emit('failed', new Error('Maximum attempt count limit reached'));
      this.reject(new Error('Maximum attempt count reached'));
      return;
    }

    let delay = (typeof delayOverride === 'number') ? delayOverride : this.nextDelay();
    if (this.maxAttemptsTime && (this.startTimestamp + this.maxAttemptsTime < Date.now() + delay)) {
      this.cleanup();
      this.emit('failed', new Error('Maximum attempt time limit reached'));
      this.reject(new Error('Maximum attempt time limit reached'));
    }

    this.timeout = setTimeout(() => this.attempt(), delay) as any;
  }

  protected cleanup() {
    clearTimeout(this.timeout);
    this.timeout = null;
    this.inProgress = false;

    this.attemptNum = 0;
    this.prevDelay = 0;
    this.currDelay = 0;
  }

  start() {
    if (this.inProgress) {
      throw new Error('Retrier is already in progress');
    }

    this.inProgress = true;
    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;

      this.startTimestamp = Date.now();
      this.scheduleAttempt(this.initialDelay);
    });
  }

  cancel() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
      this.inProgress = false;

      this.emit("cancelled");
      this.reject(new Error("Cancelled"));
    }
  }

  succeeded(arg: any) {
    this.emit("succeeded", arg);
    this.resolve(arg);
  }

  failed(err: Error, nextAttemptDelayOverride?: number) {
    if (this.timeout) {
      throw new Error("Retrier attempt is already in progress");
    }

    this.scheduleAttempt(nextAttemptDelayOverride);
  }

  run<T>(handler: () => Promise<T>) : Promise<T> {
    this.on('attempt', () => {
      handler().then(v => this.succeeded(v)).catch(e => this.failed(e));
    });

    return this.start();
  }
}

export { Retrier };
export default Retrier;

