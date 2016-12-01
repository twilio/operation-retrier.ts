import { EventEmitter } from "events";

/**
 *
 */
export default class Retrier extends EventEmitter {

  minDelay: number;
  maxDelay: number;
  initialDelay: number;

  timeout: any;
  resolve: Function;
  reject: Function;
  inProgress: boolean;

  constructor(options: { min: number,
                         max: number,
                         initial?: number,
                         }) {
    super();
    this.minDelay = options.min;
    this.maxDelay = options.max;
    this.initialDelay = options.initial || 0;

    this.inProgress = false;
  }

  _attempt() {
    clearTimeout(this.timeout);
    this.timeout = null;
    this.emit("attempt");
  }


  start() {
    if (this.inProgress) {
      throw new Error('Retrier is already in progress');
    }

    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;

      this.timeout = setTimeout(() => this._attempt(), this.initialDelay) as any;
      this.inProgress = true;
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

  failed(err: Error) {
    if (this.timeout) {
      throw new Error("Retrier attempt is already in progress");
    }

    this.timeout = setTimeout(() => this._attempt(), this.minDelay) as any;
  }

}

