var assert = require('assert');
const qyu = require('../qyu');

// returns an array without duplicates
const dedup = a => [...new Set(a)];

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
function received(ee, eventName) {
  return new Promise(resolve => ee.on(eventName, resolve));
}

// promise that resolves if events were received as listed in the array
function receivedInOrder(ee, expectedEventNames) {
  var remainingEventNames = expectedEventNames.slice(); // clone
  return new Promise((resolve, reject) => {
    dedup(expectedEventNames).forEach(eventName => ee.on(eventName, () => {
      const expected = remainingEventNames.shift();
      if (eventName !== expected) {
        reject(`expected ${expected}, received ${eventName}`);
      } else if (remainingEventNames.length === 0) {
        resolve();
      }
    }));
  });
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

// example job
function makeSpyJob() {
  const job = async function waitAndSayHello() {
    await wait(30);
    job.done = true;
    return {Hello: 'world!'} // That's the `jobResult`
  };
  job.done = false;
  return job;
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
    const q = qyu(/*{ log: createLogger() }*/);
    q.on('error', throwOnErrorEvent);
    q.push(waitAndSayHello);
    return Promise.all([
      received(q, 'done'),
      received(q, 'drain'),
      q.start()
    ]);
  });

  it('done and drain events should fire after running two jobs', function() {
    const q = qyu();
    q.on('error', throwOnErrorEvent);
    q.push(waitAndSayHello);
    q.push(waitAndSayHello);
    return Promise.all([
      receivedInOrder(q, ['done', 'done', 'drain']),
      q.start()
    ]);
  });

  it('pause() should resolve after job1 is done', async function() {
    const q = qyu();
    q.on('error', throwOnErrorEvent);
    var job1 = makeSpyJob();
    q.push(job1);
    assert.equal(job1.done, false);
    await q.start();
    await q.pause();
    assert.equal(job1.done, true);
    await q.start();
  });

  it('should be able to restart after pause()', async function() {
    const q = qyu({ log: createLogger() });
    q.on('error', throwOnErrorEvent);
    var jobs = [ makeSpyJob(), makeSpyJob() ];
    jobs.forEach(q.push.bind(q)); // push all jobs to queue
    assert.equal(jobs[0].done, false);
    assert.equal(jobs[1].done, false);
    await q.start();
    await q.pause();
    assert.equal(jobs[0].done, true);
    assert.equal(jobs[1].done, false);
    const finalExpectation = new Promise((resolve, reject) =>
      q.on('drain', () => {
        assert.equal(jobs[0].done, true);
        assert.equal(jobs[1].done, true);
        resolve();
      })
    );
    await q.start();
    return finalExpectation;
  });

  // TODO: test error
  // TODO: test priority
  // TODO: test rateLimit
  // TODO: test stats with statsInterval

});
