const assert = require('assert');
const helpers = require('./_helpers');
const qyu = require('../qyu');

describe('qyu job priorities', function() {

  it('jobs must be run in order of priority', async function() {
    const q = qyu(/*{ log: helpers.createLogger() }*/);
    const jobs = [ helpers.makeSpyJob(30), helpers.makeSpyJob(30), helpers.makeSpyJob(30) ];
    q.push(jobs[0], { priority: 8 }); // should be run third
    q.push(jobs[1], { priority: 1 }); // should be run first
    q.push(jobs[2], { priority: 7 }); // should be run second
    await q.start();
    await q.pause();
    assert.deepEqual(jobs.map(job => job.done), [ false, true, false ]);
    await q.start();
    await q.pause();
    assert.deepEqual(jobs.map(job => job.done), [ false, true, true ]);
    await q.start();
    await q.pause();
    assert.deepEqual(jobs.map(job => job.done), [ true, true, true ]);
  });

  it('stats must be not be emitted before start()', function(done) {
    const STATS_INTERVAL = 10;
    const q = qyu({ statsInterval: STATS_INTERVAL });
    let counter = 0;
    q.on('stats', (res) => ++counter);
    setTimeout(() => {
      assert.equal(counter, 0);
      done();
    }, STATS_INTERVAL * 2);
  });

  it('stats must be not be emitted after pause()', async function() {
    const STATS_INTERVAL = 10;
    const q = qyu({ statsInterval: STATS_INTERVAL });
    q.push(helpers.makeWait(STATS_INTERVAL / 4))
    let counter = 0;
    q.on('stats', (res) => ++counter);
    await q.start();
    await q.pause();
    assert.equal(counter, 0);
  });

  it('stats must be reported at the correct interval', function(done) {
    const NB_JOBS = 40, WAIT_MS = 5, STATS_INTERVAL = 100;
    const q = qyu({ statsInterval: STATS_INTERVAL });
    const wait = helpers.makeWait(WAIT_MS);
    new Array(NB_JOBS).fill(wait).map(job => q.push(job)); // push 100 jobs that wait 10 seconds
    let counter = 0;
    q.on('stats', (res) => ++counter);
    q.on('drain', () => {
      assert.equal(counter, NB_JOBS * WAIT_MS / STATS_INTERVAL);
      done();
    });
    q.start();
  });

  it('nbJobsPerSecond must be correct', function(done) {
    const NB_JOBS = 50, WAIT_MS = 10;
    const EXPECTED_JOBS_PER_SECOND = 1000 / WAIT_MS;
    const TOLERANCE = 20 / 100; // = 20%
    const q = qyu({ statsInterval: NB_JOBS * WAIT_MS / 2});
    const wait = helpers.makeWait(WAIT_MS);
    new Array(NB_JOBS).fill(wait).map(job => q.push(job)); // push 100 jobs that wait 10 seconds
    let nbJobsPerSecond = 0;
    q.on('stats', (res) => nbJobsPerSecond = res.nbJobsPerSecond);
    q.on('drain', () => {
      console.log('nbJobsPerSecond:', nbJobsPerSecond, 'expected:', EXPECTED_JOBS_PER_SECOND);
      const error = Math.abs(nbJobsPerSecond - EXPECTED_JOBS_PER_SECOND);
      assert(error < TOLERANCE * EXPECTED_JOBS_PER_SECOND);
      done();
    });
    q.start();
  });

});