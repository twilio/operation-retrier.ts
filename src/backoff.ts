import { EventEmitter } from 'events';

function isDef(value): boolean {
    return value !== undefined && value !== null;
}

class Backoff extends EventEmitter {
    private readonly maxDelay: number;
    private readonly initialDelay: number;
    private readonly factor: number;
    private readonly randomisationFactor: number;
    private backoffDelay: number;
    private nextBackoffDelay: number;
    private backoffNumber: number;
    private timeoutID: any;
    private maxNumberOfRetry: number;

    constructor(options) {
      super();
      options = options || {};

      if (isDef(options.initialDelay) && options.initialDelay < 1) {
        throw new Error('The initial timeout must be equal to or greater than 1.');
      } else if (isDef(options.maxDelay) && options.maxDelay <= 1) {
        throw new Error('The maximal timeout must be greater than 1.');
      } else if (isDef(options.randomisationFactor) &&
        (options.randomisationFactor < 0 || options.randomisationFactor > 1)) {
        throw new Error('The randomisation factor must be between 0 and 1.');
      } else if (isDef(options.factor) && options.factor <= 1) {
        throw new Error(`Exponential factor should be greater than 1.`);
      }

      this.initialDelay = options.initialDelay || 100;
      this.maxDelay = options.maxDelay || 10000;
      if (this.maxDelay <= this.initialDelay) {
        throw new Error('The maximal backoff delay must be greater than the initial backoff delay.');
      }
      this.randomisationFactor = options.randomisationFactor || 0;
      this.factor = options.factor || 2;
      this.maxNumberOfRetry = -1;
      this.reset();
    }

    public static exponential(options) {
      return new Backoff(options);
    }

    public backoff(err?: any) {
      if (this.timeoutID == null) {
        if (this.backoffNumber === this.maxNumberOfRetry) {
          this.emit('fail', err);
          this.reset();
        } else {
          this.backoffDelay = this.next();
          this.timeoutID = setTimeout(this.onBackoff.bind(this), this.backoffDelay);
          this.emit('backoff', this.backoffNumber, this.backoffDelay, err);
        }
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
      return Math.min(this.maxDelay, Math.round(this.backoffDelay * randomisationMultiple));
    }

    onBackoff() {
      this.timeoutID = null;
      this.emit('ready', this.backoffNumber, this.backoffDelay);
      this.backoffNumber++;
    }
}

export { Backoff };
export default Backoff;