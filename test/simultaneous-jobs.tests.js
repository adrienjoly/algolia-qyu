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

  it('100 simultaneous jobs should report a 100 jobs/second', function(done) {
    const NB_JOBS = 100, WAIT_MS = 50;
    const EXPECTED_JOBS_PER_SECOND = 1000 * NB_JOBS / WAIT_MS;
    const TOLERANCE = 20 / 100; // = 20%
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
      console.log('nbJobsPerSecond:', nbJobsPerSecond, 'expected:', EXPECTED_JOBS_PER_SECOND);
      const error = Math.abs(nbJobsPerSecond - EXPECTED_JOBS_PER_SECOND);
      assert(error < TOLERANCE * EXPECTED_JOBS_PER_SECOND);
      done();
    }, WAIT_MS * 2);
    q.start();
  });

});