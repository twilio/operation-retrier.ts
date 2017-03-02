import 'mocha';

import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';

chai.use(sinonChai);
chai.use(chaiAsPromised);
chai.should();
const expect = chai.expect;

import { Async } from 'async-test-tools';
import Retrier from '../src/retrier';

describe('Retrier', () => {
  let mockClock;

  before(() => {
    mockClock = sinon.useFakeTimers(new Date().getTime());
  });

  it('Should immediately call a function', () => {
    let retrier = new Retrier({ min: 10, max: 1000 });

    let called = false;
    retrier.on('attempt', () => { called = true; })
    retrier.start();

    mockClock.tick(0);
    expect(called).to.equal(true);
  });

  it('Should repsect an initial delay', () => {
    let retrier = new Retrier({ min: 10, max: 1000, initial: 100 });

    let called = false;
    retrier.on('attempt', () => { called = true; })
    retrier.start();

    mockClock.tick(50);
    expect(called).to.equal(false);
    mockClock.tick(60);
    expect(called).to.equal(true);
  });

  it('when succeeded should fire a "succeeded" event and resolve a promise', () => {
    let retrier = new Retrier({ min: 10, max: 1000 });
    let result = retrier.start();
    retrier.on('attempt', () => {
      retrier.succeeded({ code: 200, message: 'OK' });
    })

    mockClock.tick(0);
    return expect(result).to.become({ code: 200, message: 'OK' });
  });

  it('when cancelled should fire a "cancelled" event and reject a promise', () => {
    let retrier = new Retrier({ min: 10, max: 1000, initial: 100 });

    let called = false;
    retrier.on('attempt', () => { called = true; });
    let retrierResult = retrier.start();

    mockClock.tick(50);
    expect(called).to.equal(false);

    retrier.cancel();

    mockClock.tick(60);
    expect(called).to.equal(false); // attempt is not called
    return expect(retrierResult).to.be.rejected;
  });

  it('when failure reported should retry', () => {
    let retrier = new Retrier({ min: 10, max: 1000});

    // Failed to deal with sinon-as-promised here
    let myspy = sinon.stub();
    myspy
      .onFirstCall().returns(Promise.reject({ code: 503, message: 'Server unavailable' }))
      .onSecondCall().returns(Promise.reject({ code: 503, message: 'Server unavailable' }))
      .onThirdCall().returns(Promise.resolve({ code: 200, message: 'OK' }));

    retrier.on('attempt', () => myspy()
                                  .then(res => retrier.succeeded(res))
                                  .catch(err => retrier.failed(err)));

    let retrierResult = retrier.start();

    return Async.sequence([
      () => { mockClock.tick(0); },
      () => { mockClock.tick(20); },
      () => { mockClock.tick(20); }
    ]);
  });


  it('when failed should respect delay override', () => {
    let retrier = new Retrier({ min: 10, max: 20});

    // Failed to deal with sinon-as-promised here
    let myspy = sinon.stub();
    myspy
      .onFirstCall().returns(Promise.reject({ code: 503, message: 'Server unavailable' }))
      .onSecondCall().returns(Promise.resolve({ code: 200, message: 'OK' }));

    retrier.on('attempt', () => myspy()
                                  .then(res => retrier.succeeded(res))
                                  .catch(err => retrier.failed(err, 300)));

    let retrierResult = retrier.start();

    return Async.sequence([
      () => {
          expect(myspy).to.have.not.been.called;
          mockClock.tick(0);
          expect(myspy).to.have.been.calledOnce;
      },
      () => {
          mockClock.tick(50);
          expect(myspy).to.have.been.calledOnce;
          mockClock.tick(250);
          expect(myspy).to.have.been.calledTwice;
      }
    ]);
  });



  describe('Promise interface', () => {
    it('resolves when underlying promise is resolved', () => {
      mockClock.restore();
      let myspy = sinon.stub();
      myspy
        .onFirstCall().returns(Promise.reject({ code: 503, message: 'Server unavailable' }))
        .onSecondCall().returns(Promise.reject({ code: 503, message: 'Server unavailable' }))
        .onThirdCall().returns(Promise.resolve({ code: 200, message: 'OK' }));

      return new Retrier({ min: 10, max: 1000})
        .run(myspy).should.be.fulfilled;
    });

    it('rejects if maximum attempts count reached', () => {
      mockClock.restore();
      let myspy = sinon.stub();
      myspy
        .onFirstCall().returns(Promise.reject({ code: 503, message: 'Server unavailable' }))
        .onSecondCall().returns(Promise.reject({ code: 503, message: 'Server unavailable' }))
        .onThirdCall().returns(Promise.resolve({ code: 200, message: 'OK' }));

      return new Retrier({ min: 10, max: 100, maxAttemptsCount: 2 }).run(myspy).should.be.rejected;
    });

    it('rejects if maximum attempts time reached', () => {
      mockClock.restore();
      let myspy = sinon.stub();
      myspy
        .onFirstCall().returns(Promise.reject({ code: 503, message: 'Server unavailable' }))
        .onSecondCall().returns(Promise.reject({ code: 503, message: 'Server unavailable' }))
        .onThirdCall().returns(Promise.resolve({ code: 200, message: 'OK' }));

      return new Retrier({ min: 10, max: 100, maxAttemptsTime: 1 }).run(myspy).should.be.rejected;
    });
  });

});

