// proposed implementation for the "qyu" queue

const EventEmitter = require('events');

class Qyu extends EventEmitter {

  /**
   * instanciates a queue
   * @param {Object} opts
   * @param {number} opts.rateLimit - maximum number of jobs being processed by second
   */
  constructor(opts) {
    super(opts);
    // TODO
    /*
    this.emit('done', {jobId, jobResult, res});
    this.emit('error', {jobId, error});
    this.emit('drain');
    this.emit('stats', {nbJobsPerSecond});
    */
  }

  /**
   * add a job to this queue
   * @param {Promise} job is a function returning a promise to indicate when the job is done
   * @param {Object} opts
   * @param {number} opts.priority from 1 to 10, 1 being the highest priority
   * @returns {Promise} resolves with {jobId, jobResult}
   */
  push(job, opts) {
    // TODO
  }

  /**
   * pause all running jobs of this queue
   * @returns {Promise} resolves when the queue has paused (no jobs being processed)
   */
  pause() {
    // TODO
    return new Promise((resolve, reject) => resolve());
  }

  /**
   * start running jobs of this queue
   * @returns {Promise} resolves when the queue has started (first time) or unpaused
   */
  start() {
    // TODO
    new Promise((resolve, reject) => resolve());
  }

}

function qyu(opts) {
  return new Qyu(opts);
}

module.exports = qyu;
