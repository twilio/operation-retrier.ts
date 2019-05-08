import { EventEmitter } from 'events';

/**
 * Provides retrier service
 */
class Retrier extends EventEmitter {
  private minDelay: number;
  private maxDelay: number;
  private initialDelay: number;
  private maxAttemptsCount: number;
  private maxAttemptsTime: number;
  private randomness: number;

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
  constructor(options: {
    min: number,
    max: number,
    initial?: number,
    maxAttemptsCount?: number,
    maxAttemptsTime?: number,
    randomness?: number
  }) {
    super();

    this.minDelay = options.min;
    this.maxDelay = options.max;
    this.initialDelay = options.initial || 0;
    this.maxAttemptsCount = options.maxAttemptsCount || 0;
    this.maxAttemptsTime = options.maxAttemptsTime || 0;
    this.randomness = options.randomness || 0;

    this.inProgress = false;
    this.attemptNum = 0;

    this.prevDelay = 0;
    this.currDelay = 0;
  }

  private attempt() {
    clearTimeout(this.timeout);

    this.attemptNum++;

    this.timeout = null;
    this.emit('attempt', this);
  }

  private nextDelay(delayOverride?: number): number {
    if (typeof delayOverride === 'number') {
      this.prevDelay = 0;
      this.currDelay = delayOverride;
      return delayOverride;
    }

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

  private randomize(delay: number) {
    let area = delay * this.randomness;
    let corr = Math.round(Math.random() * area * 2 - area);
    return Math.max(0, delay + corr);
  }

  private scheduleAttempt(delayOverride?: number) {
    if (this.maxAttemptsCount && this.attemptNum >= this.maxAttemptsCount) {
      this.cleanup();
      this.emit('failed', new Error('Maximum attempt count limit reached'));
      this.reject(new Error('Maximum attempt count reached'));
      return;
    }

    let delay = this.nextDelay(delayOverride);
    delay = this.randomize(delay);
    if (this.maxAttemptsTime && (this.startTimestamp + this.maxAttemptsTime < Date.now() + delay)) {
      this.cleanup();
      this.emit('failed', new Error('Maximum attempt time limit reached'));
      this.reject(new Error('Maximum attempt time limit reached'));
      return;
    }

    this.timeout = setTimeout(() => this.attempt(), delay) as any;
  }

  private cleanup() {
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

      this.emit('cancelled');
      this.reject(new Error('Cancelled'));
    }
  }

  succeeded(arg?: any) {
    this.emit('succeeded', arg);
    this.resolve(arg);
  }

  failed(err: Error, nextAttemptDelayOverride?: number) {
    if (this.timeout) {
      throw new Error('Retrier attempt is already in progress');
    }

    this.scheduleAttempt(nextAttemptDelayOverride);
  }

  run<T>(handler: () => Promise<T>): Promise<T> {
    this.on('attempt', () => {
      handler().then(v => this.succeeded(v)).catch(e => this.failed(e));
    });

    return this.start() as Promise<T>;
  }

}

class Backoff extends EventEmitter {

  private readonly maxDelay: number;
  private readonly initialDelay: number;
  private readonly factor: number;
  private randomisationFactor: number;
  private backoffDelay: number;
  private nextBackoffDelay: number;
  private backoffNumber: number;
  private timeoutID: any;
  private maxNumberOfRetry: number;

  constructor(options) {
    super();
    options = options || {};

    if (this.isDef(options.initialDelay) && options.initialDelay < 1) {
      throw new Error('The initial timeout must be greater than 0.');
    } else if (this.isDef(options.maxDelay) && options.maxDelay < 1) {
      throw new Error('The maximal timeout must be greater than 0.');
    }

    this.timeoutID = null;
    this.initialDelay = options.initialDelay || 100;
    this.maxDelay = options.maxDelay || 10000;

    if (this.isDef(options.randomisationFactor) &&
        (options.randomisationFactor < 0 || options.randomisationFactor > 1)) {
      throw new Error('The randomisation factor must be between 0 and 1.');
    }
    this.randomisationFactor = options.randomisationFactor || 0;

    if (this.maxDelay <= this.initialDelay) {
      throw new Error('The maximal backoff delay must be greater than the initial backoff delay.');
    }
    this.backoffDelay = 0;
    this.nextBackoffDelay = this.initialDelay;

    this.maxNumberOfRetry = -1;
    this.backoffNumber = 0;

    if (options && options.factor !== undefined) {
      if (options.factor <= 1) {
        throw new Error(`Exponential factor should be greater than 1 but got ${options.factor}.`);
      }
    }
    this.factor = options.factor || 2;
  }

  public static exponential(options) {
    return new Backoff(options);
  }

  public backoff(err?: any) {
    if (this.timeoutID !== null) {
      throw new Error('Backoff in progress.');
    }

    if (this.backoffNumber === this.maxNumberOfRetry) {
      this.emit('fail', err);
      this.reset();
    } else {
      this.backoffDelay = this.next();
      this.timeoutID = setTimeout(this.onBackoff.bind(this), this.backoffDelay);
      this.emit('backoff', this.backoffNumber, this.backoffDelay, err);
    }
  }

  public reset() {
    this.backoffDelay = 0;
    this.nextBackoffDelay = this.initialDelay;

    this.backoffNumber = 0;
    clearTimeout(this.timeoutID);
    this.timeoutID = null;
  }

  public failAfter(maxNumberOfRetry) {
    if (maxNumberOfRetry <= 0) {
      throw new Error(`Expected a maximum number of retry greater than 0 but got ${maxNumberOfRetry}`);
    }

    this.maxNumberOfRetry = maxNumberOfRetry;
  }

  next(): number {
    this.backoffDelay = Math.min(this.nextBackoffDelay, this.maxDelay);
    this.nextBackoffDelay = this.backoffDelay * this.factor;
    let randomisationMultiple = 1 + Math.random() * this.randomisationFactor;
    return Math.min(this.backoffDelay, Math.round(this.backoffDelay * randomisationMultiple));
  }

  onBackoff() {
    this.timeoutID = null;
    this.emit('ready', this.backoffNumber, this.backoffDelay);
    this.backoffNumber++;
  }

  private isDef(value) {
    return value !== undefined && value !== null;
  }

}

export { Retrier, Backoff };
export default Retrier;
