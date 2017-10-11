const assert = require('assert');
const helpers = require('./_helpers');
const qyu = require('../qyu');
let log = { trace: () => {}, debug: () => {} }; // helpers.createLogger()

describe('qyu job priorities', function() {

  if (process.env.TRACES) {
    beforeEach(function() {
      log = helpers.createSmartLog();
    });
  }

  it('jobs must be run in order of priority', async function() {
    const q = qyu({ log });
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
    const q = qyu({ log, statsInterval: STATS_INTERVAL });
    let counter = 0;
    q.on('stats', (res) => ++counter);
    setTimeout(() => {
      assert.equal(counter, 0);
      done();
    }, STATS_INTERVAL * 2);
  });

  it('stats must be not be emitted after pause()', async function() {
    const STATS_INTERVAL = 10;
    const q = qyu({ log, statsInterval: STATS_INTERVAL });
    q.push(helpers.makeWait(STATS_INTERVAL / 4))
    let counter = 0;
    q.on('stats', (res) => ++counter);
    await q.start();
    await q.pause();
    assert.equal(counter, 0);
  });

  it('does not run > 1 job at a time', function(done) {
    const NB_JOBS = 10, WAIT_MS = 30, RATE_LIMIT = 1;
    const q = qyu({ log });
    let running = 0;
    const incrRunningJobs = (incr) => () => {
      running += incr;
      if (running > RATE_LIMIT) {
        done(Error('rateLimit exceeded, number of jobs: ' + running));
      }
    };
    helpers.pushMultipleJobsTo(q, NB_JOBS, helpers.makeJobThenWait(incrRunningJobs(+1), WAIT_MS));
    q.on('done', incrRunningJobs(-1));
    q.on('error', incrRunningJobs(-1));
    q.on('drain', () => done());
    q.start();
  });

  it('stats are restarted after late job push (after drain)', function() {
    const WAIT_MS = 100, STATS_INTERV = 60;
    const q = qyu({ log, statsInterval: STATS_INTERV });
    const job = helpers.makeWait(WAIT_MS);
    const pushLateJob = (msBeforePush, job) => new Promise((resolve, reject) =>
      setTimeout(() => q.push(job).then(resolve), msBeforePush)
    );
    return Promise.all([
      q.push(job),
      pushLateJob(WAIT_MS * 2, job),
      q.start(),
      helpers.receivedInOrder(q, ['stats', 'done', 'drain', 'stats', 'done', 'drain'])
    ]); // will resolve when all jobs are resolved
  });

  it('stats must be reported at the correct interval', function(done) {
    const NB_JOBS = 40, WAIT_MS = 5, STATS_INTERVAL = 100;
    const EXPECTED_STATS_EVENTS = NB_JOBS * WAIT_MS / STATS_INTERVAL;
    const q = qyu({ log, statsInterval: STATS_INTERVAL });
    const wait = helpers.makeWait(WAIT_MS);
    new Array(NB_JOBS).fill(wait).map(job => q.push(job)); // push NB_JOBS jobs that wait
    let counter = 0;
    q.on('stats', (res) => ++counter);
    //q.on('stats', (res) => { ++counter; console.log(new Date().getTime(), 'stat', q.jobs.length); });
    q.on('drain', () => {
      //console.log(new Date().getTime(), 'drain', counter, EXPECTED_STATS_EVENTS);
      assert.equal(counter, EXPECTED_STATS_EVENTS);
      done();
    });
    q.start();
  });

  it('nbJobsPerSecond must be correct', function(done) {
    const NB_JOBS = 50, WAIT_MS = 10;
    const EXPECTED_JOBS_PER_SECOND = 1000 / WAIT_MS;
    const TOLERANCE = 20 / 100; // = 20%
    const q = qyu({ log, statsInterval: WAIT_MS});
    const wait = helpers.makeWait(WAIT_MS);
    new Array(NB_JOBS).fill(wait).map(job => q.push(job)); // push NB_JOBS jobs that wait
    let nbJobsPerSecond = 0;
    q.on('stats', (res) => nbJobsPerSecond = res.nbJobsPerSecond);
    q.on('drain', () => {
      console.log(helpers.PREFIX + 'nbJobsPerSecond:', nbJobsPerSecond, 'expected:', EXPECTED_JOBS_PER_SECOND);
      const error = Math.abs(nbJobsPerSecond - EXPECTED_JOBS_PER_SECOND);
      assert(error < TOLERANCE * EXPECTED_JOBS_PER_SECOND);
      done();
    });
    q.start();
  });

});