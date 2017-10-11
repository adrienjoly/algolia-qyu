const assert = require('assert');
const helpers = require('./_helpers');
const qyu = require('../qyu');
let log = { trace: () => {}, debug: () => {} }; // helpers.createLogger()

describe('simultaneous jobs', function() {

  if (process.env.TRACES) {
    beforeEach(function() {
      log = helpers.createSmartLog();
    });
  }

  it('must be able to run 100 jobs simultaneously', function(done) {
    const NB_JOBS = 100, WAIT_MS = 50;
    const q = qyu({ log, rateLimit: NB_JOBS });
    const jobs = helpers.pushMultipleSpyJobsTo(q, NB_JOBS, WAIT_MS);
    // make sure that all jobs will be done in time
    setTimeout(() => {
      q.pause();
      jobs.shouldAllBeDone(true);
      done();
    }, WAIT_MS * 2);
    q.start();
  });

  it('100 simultaneous jobs should report > 100 jobs/second', function(done) {
    const NB_JOBS = 100, WAIT_MS = 50;
    const q = qyu({
      log,
      rateLimit: NB_JOBS,
      statsInterval: WAIT_MS / 2
    });
    const jobs = helpers.pushMultipleSpyJobsTo(q, NB_JOBS, WAIT_MS);
    // measure and check nbJobsPerSecond
    let nbJobsPerSecond = 0;
    q.on('stats', (res) => {
      //console.log(res);
      nbJobsPerSecond = res.nbJobsPerSecond;
    });
    setTimeout(() => {
      q.pause();
      jobs.shouldAllBeDone(true);
      // make sure that jobs were run in parallel
      console.log(helpers.PREFIX + 'nbJobsPerSecond:', nbJobsPerSecond);
      assert(nbJobsPerSecond > NB_JOBS);
      done();
    }, WAIT_MS * 2);
    q.start();
  });

  it('does not exceed the rateLimit, even for jobs > 1 second', function(done) {
    this.timeout(4000); // default of 2 seconds may not be enough
    const JOB1_WAIT_MS = 1600, JOB2_WAIT_MS = 30, RATE_LIMIT = 1;
    const q = qyu({ log, rateLimit: RATE_LIMIT });
    let running = 0;
    const incrRunningJobs = (incr) => () => {
      running += incr;
      //console.log(new Date().getTime(), 'jobs running: ', running);
      if (running > RATE_LIMIT) {
        done(Error('rateLimit exceeded, number of jobs: ' + running));
      }
    };
    q.push(helpers.makeJobThenWait(incrRunningJobs(+1), JOB1_WAIT_MS));
    q.push(helpers.makeJobThenWait(incrRunningJobs(+1), JOB2_WAIT_MS));
    q.on('done', incrRunningJobs(-1));
    q.on('error', incrRunningJobs(-1));
    q.on('drain', () => done());
    q.start();
  });

  it('does not exceed the rateLimit for jobs > 1 second, with late push', function(done) {
    this.timeout(4000); // default of 2 seconds may not be enough
    const JOB1_WAIT_MS = 1600, JOB2_WAIT_MS = 30, RATE_LIMIT = 1;
    const q = qyu({ log, rateLimit: RATE_LIMIT });
    let running = 0;
    const incrRunningJobs = (incr) => () => {
      running += incr;
      //console.log(new Date().getTime(), 'jobs running: ', running);
      if (running > RATE_LIMIT) {
        done(Error('rateLimit exceeded, number of jobs: ' + running));
      }
    };
    q.push(helpers.makeJobThenWait(incrRunningJobs(+1), JOB1_WAIT_MS));
    setTimeout(() => {
      q.push(helpers.makeJobThenWait(incrRunningJobs(+1), JOB2_WAIT_MS));
    }, JOB1_WAIT_MS * 0.9);
    q.on('done', incrRunningJobs(-1));
    q.on('error', incrRunningJobs(-1));
    q.on('drain', () => done());
    q.start();
  });
  
  it('rate=2, job pushed late should be delayed after rate limit was reached', function() {
    this.timeout(4000); // default of 2 seconds may not be enough
    const JOB_DURATION = 30, RATE_LIMIT = 2, ONE_SECOND = 1000;
    const q = qyu({ log, rateLimit: RATE_LIMIT });
    const job = helpers.makeWait(JOB_DURATION);
    const t0 = new Date();
    const pushLateJob = (delay) => new Promise((resolve, reject) =>
      setTimeout(() => q.push(job).then(() => {
        const now = new Date();
        console.log(helpers.PREFIX + 'job 3 is done, ' + (now - t0));
        if (now - t0 < ONE_SECOND) {
          reject(Error('late job was run within just ' + (now - t0) + ' ms'));
        } else {
          resolve();
        }
      }), delay));
    return Promise.all([
      q.push(job),
      q.push(job),
      q.start(),
      pushLateJob(JOB_DURATION * 2) // push after the two first jobs are done
    ]); // will resolve when all jobs are resolved
  });

  it('rate=2, job pushed late should be run on top of job > 1 second', function() {
    this.timeout(4000); // default of 2 seconds may not be enough
    const JOB1_WAIT_MS = 1600, JOB2_WAIT_MS = 30, RATE_LIMIT = 2;
    const q = qyu({ log, rateLimit: RATE_LIMIT });
    const pushLateJob = (delay) => new Promise((resolve, reject) =>
      setTimeout(() => q.push(helpers.makeWait(JOB2_WAIT_MS)).then(resolve), delay)
    );
    return Promise.all([
      q.push(helpers.makeWait(JOB1_WAIT_MS)),
      q.start(),
      pushLateJob(JOB1_WAIT_MS * 0.9)
    ]); // will resolve when all jobs are resolved
  });

});
