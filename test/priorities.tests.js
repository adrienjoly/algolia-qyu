const assert = require('assert');
const helpers = require('./_helpers');
const qyu = require('../qyu');

describe('qyu job priorities', function() {

  it('jobs must be run in order of priority', async function() {
    const q = qyu(/*{ log: helpers.createLogger() }*/);
    const jobs = [ helpers.makeSpyJob(), helpers.makeSpyJob(), helpers.makeSpyJob() ];
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

});