const assert = require('assert');
const helpers = require('./_helpers');
const qyu = require('../qyu');

describe('simultaneous jobs', function() {

  it('must be able to run 100 jobs simultaneously', function(done) {
    const NB_JOBS = 100, WAIT_MS = 50;
    const q = qyu({ rateLimit: NB_JOBS });
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
      //log: helpers.createLogger(),
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
      console.log('nbJobsPerSecond:', nbJobsPerSecond);
      assert(nbJobsPerSecond > NB_JOBS);
      done();
    }, WAIT_MS * 2);
    q.start();
  });

  it('does not exceed the rateLimit, even for jobs > 1 second', function(done) {
    const JOB1_WAIT_MS = 1600, JOB2_WAIT_MS = 30, RATE_LIMIT = 1;
    const q = qyu({ rateLimit: RATE_LIMIT });
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
    const JOB1_WAIT_MS = 1600, JOB2_WAIT_MS = 30, RATE_LIMIT = 1;
    const q = qyu({ rateLimit: RATE_LIMIT });
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
  
  // TODO: test with ratelimit of 2, a 2-sec job + a 2nd job that should run after 1 sec

});
