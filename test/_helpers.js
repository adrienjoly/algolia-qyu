const assert = require('assert');

// returns an array without duplicates
const dedup = a => [...new Set(a)];

// to match indentation of mocha's reporter in console.log() calls
exports.PREFIX = '      ';

// create a logger/tracer for a Qyu instance
exports.createLogger = function createLogger() {
  const log = require('simple-node-logger').createSimpleLogger();
  log.setLevel('trace');
  return log;
}

// create a logger/tracer that displays elapsed time between traces
exports.createSmartLog = function createSmartLog(out = console.warn) {
  const scales = [ 5000, 4000, 3000, 2000, 1000, 500, 200, 100 ];
  const log = {};
  let prev = new Date();
  function makeLogger(str) {
    return function() {
      // update and display elapsed time
      const now = new Date();
      const elapsed = now - prev;
      const scale = scales.find(scale => elapsed >= scale);
      if (scale) {
        out(`${exports.PREFIX} (≧ ${scale} ms)`);
      }
      prev = now;
      // display actual trace
      const args = Array.prototype.slice.call(arguments);
      const parts = [ exports.PREFIX + str ].concat(args.map(JSON.stringify.bind(JSON)));
      out.apply(console, parts)
    };
  }
  log.trace = makeLogger('TRACE');
  log.debug = makeLogger('DEBUG');
  return log;
}

// throw on `error` events
exports.throwOnErrorEvent = err => { throw err.error; };

// promise that resolves if an event was received at least once
exports.received = function received(ee, eventName) {
  return new Promise(resolve => ee.on(eventName, resolve));
}

// promise that resolves if events were received as listed in the array
exports.receivedInOrder = function receivedInOrder(ee, expectedEventNames) {
  var remainingEventNames = expectedEventNames.slice(); // clone
  return new Promise((resolve, reject) => {
    dedup(expectedEventNames).forEach(eventName => ee.on(eventName, () => {
      console.log(exports.PREFIX + 'received event: ' + eventName);
      const expected = remainingEventNames.shift();
      if (eventName !== expected) {
        reject(`expected ${expected}, received ${eventName}`);
      } else if (remainingEventNames.length === 0) {
        resolve();
      }
    }));
  });
}

// returns a promise that resolves after ms milliseconds
exports.wait = function wait(ms) {
  return new Promise((resolve, reject) => setTimeout(resolve, ms));
};

// returns a job that will run fct and wait ms milliseconds
exports.makeJobThenWait = function makeJobThenWait(fct, ms) {
  return async function job() {
    typeof fct === 'function' && fct();
    return await exports.wait(ms);
  };
};

// returns a job that will wait ms milliseconds
exports.makeWait = exports.makeJobThenWait.bind(exports, null);

// accountable job generator
exports.makeSpyJob = function makeSpyJob(milliseconds, res) {
  const job = async function waitAndSayHello() {
    await exports.wait(milliseconds);
    job.done = true;
    return res || { Hello: 'world!' }; // That's the `jobResult`
  };
  job.done = false;
  return job;
};

// push nbJobs jobs to qyu, that will run fct
exports.pushMultipleJobsTo = function pushMultipleJobsTo(qyu, nbJobs, fct) {
  const jobs = new Array(nbJobs).fill(0).map(() => fct);
  jobs.forEach(job => qyu.push(job)); // push jobs to queue
  return jobs;
};

// push nbJobs jobs to qyu, that will wait milliseconds
exports.pushMultipleSpyJobsTo = function pushMultipleSpyJobsTo(qyu, nbJobs, milliseconds) {
  const jobs = new Array(nbJobs).fill(0).map(() => exports.makeSpyJob(milliseconds));
  jobs.shouldAllBeDone = (expected) => jobs.forEach(job => assert.equal(job.done, expected));
  jobs.shouldAllBeDone(false); // make sure that jobs are not done yet
  jobs.forEach(job => qyu.push(job)); // push jobs to queue
  return jobs;
};
