var assert = require('assert');
const qyu = require('../qyu');
const helpers = require('./_helpers');

// example job
async function waitAndSayHello() {
  await helpers.wait(30);
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
    q.on('error', helpers.throwOnErrorEvent);
    return Promise.all([
      helpers.received(q, 'drain'),
      q.start()
    ]);
  });

  it('done and drain events should fire after running one job', function() {
    const q = qyu();
    q.on('error', helpers.throwOnErrorEvent);
    q.push(waitAndSayHello);
    return Promise.all([
      helpers.received(q, 'done'),
      helpers.received(q, 'drain'),
      q.start()
    ]);
  });

  it('done and drain events should fire after running two jobs', function() {
    const q = qyu();
    q.on('error', helpers.throwOnErrorEvent);
    q.push(waitAndSayHello);
    q.push(waitAndSayHello);
    return Promise.all([
      helpers.receivedInOrder(q, ['done', 'done', 'drain']),
      q.start()
    ]);
  });

  it('pause() should resolve after job1 is done', async function() {
    const q = qyu();
    q.on('error', helpers.throwOnErrorEvent);
    var job1 = helpers.makeSpyJob();
    q.push(job1);
    assert.equal(job1.done, false);
    await q.start();
    await q.pause();
    assert.equal(job1.done, true);
  });

  it('pause() should resolve after job1 ends with an error', async function() {
    const q = qyu();
    q.push(async function job1() {
      throw 'boom!';
    });
    await q.start();
    await q.pause();
  });

  it('should be able to restart after pause()', async function() {
    const q = qyu();
    q.on('error', helpers.throwOnErrorEvent);
    var jobs = [ helpers.makeSpyJob(), helpers.makeSpyJob() ];
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

  it('job error should be passed thru an event', function() {
    const q = qyu();
    const ERROR = 'job failed';
    const finalExpectation = new Promise((resolve, reject) =>
      q.on('error', (err) => {
        if (err.error === ERROR) {
          resolve();
        } else {
          reject(`unexpected error: ${err.error}`);
        }
      })
    );
    q.push(async function failingJob() {
      throw(ERROR);
    });
    return Promise.all([
      finalExpectation,
      q.start()
    ]);
  });

});
