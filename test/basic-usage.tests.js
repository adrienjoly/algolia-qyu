var assert = require('assert');
const qyu = require('../qyu');

// helper to create a logger (for diagnostics)
function createLogger() {
  const log = require('simple-node-logger').createSimpleLogger(/*{
    timestampFormat: '[[QYU-LOG]]'
  }*/);
  log.setLevel('trace');
  return log;
}

// helper to throw on `error` events
const throwOnErrorEvent = err => { throw err.error; };

// helper to resolve a promise after several events were fired
function received(ee, eventName){
  return new Promise(resolve => ee.on(eventName, resolve));
}

// helper: wait
function wait(ms) {
  return new Promise((resolve, reject) => setTimeout(resolve, ms));
}

// example job
async function waitAndSayHello() {
  await wait(30);
  return {Hello: 'world!'} // That's the `jobResult`
}

describe('basic qyu usage', function() {

  it('qyu() can be instantiated without options', function() {
    qyu();
  });

  it('start() should return a promise', function() {
    const q = qyu();
    assert(q.start().then);
  });

  it('start() should resolve immediately if no jobs were pushed', function() {
    const q = qyu();
    return q.start();
  });

  it('drain event should fire immediately if no jobs were pushed', function() {
    return new Promise((resolve, reject) => {
      const q = qyu();
      q.on('error', reject);
      q.on('drain', resolve);
      q.start().catch(reject);
    });
  });

  it('drain event should fire immediately if no jobs were pushed (2)', function() {
    const q = qyu();
    q.on('error', throwOnErrorEvent);
    return Promise.all([
      received(q, 'drain'),
      q.start()
    ]);
  });

  it('done and drain events should fire after running one job', function() {
    const q = qyu({ log: createLogger() });
    q.on('error', throwOnErrorEvent);
    q.push(waitAndSayHello);
    return Promise.all([
      received(q, 'done'),
      received(q, 'drain'),
      q.start()
    ]);
  });

  it('done and drain events should fire after running two jobs', function() {
    const q = qyu({ log: createLogger() });
    q.on('error', throwOnErrorEvent);
    q.push(waitAndSayHello);
    q.push(waitAndSayHello);
    return Promise.all([
      received(q, 'done'),
      received(q, 'drain'),
      q.start()
    ]);
  });

});
