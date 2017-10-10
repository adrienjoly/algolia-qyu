const assert = require('assert');

// returns an array without duplicates
const dedup = a => [...new Set(a)];

// create a logger/tracer for a Qyu instance
exports.createLogger = function createLogger() {
  const log = require('simple-node-logger').createSimpleLogger();
  log.setLevel('trace');
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

exports.makeJobThenWait = function makeJobThenWait(fct, ms) {
  return async function job() {
    typeof fct === 'function' && fct();
    return await exports.wait(ms);
  };
};

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

exports.pushMultipleSpyJobsTo = function pushMultipleSpyJobsTo(qyu, nbJobs, milliseconds) {
  const jobs = new Array(nbJobs).fill(0).map(() => exports.makeSpyJob(milliseconds));
  jobs.shouldAllBeDone = (expected) => jobs.forEach(job => assert.equal(job.done, expected));
  jobs.shouldAllBeDone(false); // make sure that jobs are not done yet
  jobs.forEach(job => qyu.push(job)); // push jobs to queue
  return jobs;
};
