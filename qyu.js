const EventEmitter = require('events');
const RateLimiter = require('./RateLimiter');

const LOWEST_PRIO = 10;

const DEFAULT_QUEUE_OPTIONS = {
  log: { trace: () => {}, debug: () => {} }, // can be replaced by instance of simple-node-logger
  rateLimit: null,        // falsy => process in series. otherwise: max number of jobs to run within 1 second
  statsInterval: 500,    // emit `stats` every second
};

const DEFAULT_JOB_OPTIONS = {
  priority: LOWEST_PRIO,  // low job priority by default, when calling push()
};

var nextJobId = 0; // global job counter, used to generate unique ids

/**
 * Holds, controls and reports on execution of a queue of asynchronous jobs.
 * @fires Qyu#done
 * @fires Qyu#error
 * @fires Qyu#drain
 * @fires Qyu#stats
 */
class Qyu extends EventEmitter {

  /**
   * Instanciates a job queue.
   * @param {Object} opts
   * @param {number} opts.rateLimit - Maximum number of jobs to be run per second. If `null`, jobs will be run sequentially.
   * @param {number} opts.statsInterval - interval for emitting `stats`, in ms
   * @param {SimpleNodeLogger} opts.log - instance of simple-node-logger (optional)
   */
  constructor(opts) {
    super(opts);
    this.opts = Object.assign({}, DEFAULT_QUEUE_OPTIONS, opts);
    this.log = this.opts.log;
    this.log.trace('Qyu:constructor() ', opts);
    this.jobs = [];           // unsorted array of { job, opts } objects
    this.started = false;     // turns to `true` when client called `start()`
    // NOTE: could use `Symbol` to prevent properties from being accessed/mutated externally
    this.rateLimiter = new RateLimiter(this.opts);
    this.rateLimiter.on('stats', (stats) => {
      this.log.trace('Qyu ⚡️ stats ', stats);
      /**
       * Fired every `opts.statsInterval` milliseconds, to tell how many jobs are processed per second.
       * @event Qyu#stats
       * @type {object}
       * @property {number} nbJobsPerSecond - number of jobs that are processed per second
       */
      this.emit('stats', stats);
      this._processJobs();
    });
  }

  /**
   * emit an `error` event
   * @private
   * @param {Object} err
   * @param {number} err.jobId - identifier of the job that throwed the error
   * @param {Error} err.error - error object throwed by the job
   */
  _error({jobId, error}) {
    this.log.trace('Qyu ⚡️ error ', {jobId, error});
    /**
     * Fired every time a job fails by throwing an error.
     * @event Qyu#error
     * @type {Object}
     * @property {number} jobId - identifier of the job that throwed the error
     * @property {Error} error - error object throwed by the job
     */
    this.emit('error', {jobId, error});
  }

  /**
   * emit a `done` event
   * @private
   * @param {Object} res
   * @param {Object} res.jobId - identifier of the job which execution ended
   * @param {Object} res.jobResult - return value of the job function
   * @param {Object} res.res - TBD
   */
  _done(res) {
    this.log.trace('Qyu ⚡️ done ', res);
    /**
     * Fired every time a job's execution has ended succesfully.
     * @event Qyu#done
     * @type {object}
     * @property {number} jobId - identifier of the job which execution ended
     * @property {*} jobResult - return value of the job function
     * @property {*} res - TBD
     */
    this.emit('done', res);
  }

  /**
   * called by _processJob() when a job has ended (with or without error)
   * @private
   * @param {Object} job
   * @param {number} job.id - id of the job function that ended
   * @param {boolean} withError - true if the job ended becaused of an error
   * @param {*} jobResultOrError - return value of the job function that ended, or error
   */
  _jobEnded(job, withError, jobResultOrError) {
    this.log.trace('Qyu:_jobEnded() ', Array.prototype.slice.call(arguments));
    this.rateLimiter.jobEnded();
    const jobObj = { jobId: job.id };
    if (withError) {
      const failObj = Object.assign(jobObj, { error: jobResultOrError });
      this._error(failObj);
      //job.pushPromise.reject(failObj); // TODO: uncomment if push() should resolve in case of error
    } else {
      const doneObj = Object.assign(jobObj, { jobResult: jobResultOrError });
      this._done(doneObj);
      job.pushPromise.resolve(doneObj);
    }
    this._drainIfNoMore();
    this._processJobs();
  }

  /**
   * @private
   * @returns true if a job can be processed right now.
   */
  _readyToRunJobs() {
    return this.started && this.jobs.length && this.rateLimiter.canRunMore();
  }

  /**
   * runs the next job, if any, and if allowed by rate limiter.
   * @private
   */
  _processJob() {
    const readyToRunJobs = this._readyToRunJobs();
    this.log.trace('Qyu:_processJob() ', {
      started: this.started,
      running: this.rateLimiter.running,
      remaining: this.jobs.map(j => j.id),
      readyToRunJobs
    });
    if (readyToRunJobs) {
      //this.rateLimiter.toggle(true); // necessary for jobs pushed after drain
      const priority = Math.min.apply(Math, this.jobs.map(job => job.opts.priority));
      const job = this.jobs.find(job => job.opts.priority === priority);
      this.jobs = this.jobs.filter(j => j.id !== job.id); // remove job from queue
      this.log.debug('Qyu starting job ', job);
      this.rateLimiter.jobStarted();
      job.job()
        .then(this._jobEnded.bind(this, job, false))
        .catch(this._jobEnded.bind(this, job, true));
    }
  }

  /**
   * runs as many jobs as allowed by rate limiter.
   * @private
   */
  _processJobs() {
    do {
      this._processJob();
    } while (this._readyToRunJobs());
  }

  _drainIfNoMore() {
    this.log.trace('Qyu:_drainIfNoMore() ', {
      started: this.started,
      running: this.rateLimiter.running,
      remaining: this.jobs.map(j => j.id)
    });
    if (!this.jobs.length && !this.rateLimiter.running) {
      this.log.trace('Qyu ⚡️ drain');
      /**
       * Fired when no more jobs are to be run.
       * @event Qyu#drain
       */
      this.emit('drain');
      this.rateLimiter.toggle(false);
    }
  }

  /**
   * Add a job to this queue, and runs it if queue was started.
   * @param {Function} job is a function returning a promise to indicate when the job is done
   * @param {Object} opts
   * @param {number} opts.priority from 1 to 10, 1 being the highest priority
   * @returns {Promise} A promise that resolves with {jobId, jobResult}
   */
  push(job, opts) {
    return new Promise((resolve, reject) => {
      const id = nextJobId++;
      this.log.trace(`Qyu:push() id: ${id}, opts:`, opts);
      this.jobs.push({
        id,
        job,
        opts: Object.assign({}, DEFAULT_JOB_OPTIONS, opts),
        pushPromise: { resolve, reject }
      });
      if (this.started) {
        this.rateLimiter.toggle(true); // necessary for jobs pushed after drain
      }
      this._processJobs(); // useful for when jobs were pushed after Qyu was started
    });
  }

  /**
   * Pause all running jobs of this queue.
   * @returns {Promise} A promise that resolves when the queue has paused (no jobs being processed)
   */
  pause() {
    this.log.trace('Qyu:pause()');
    this.started = false; // prevent next jobs from being processed
    return this.rateLimiter.waitForDrain().then(() => {
      this.rateLimiter.toggle(false);
    });
  }

  /**
   * Start running jobs of this queue.
   * @returns {Promise} A promise that resolves when the queue has started (first time) or unpaused
   */
  start() {
    this.log.trace('Qyu:start()');
    return new Promise((resolve, reject) => {
      this.started = true;
      // throw 'dumm2'; // for testing
      this.rateLimiter.toggle(true); // makes sure that the interval is started asap
      this._drainIfNoMore();
      this._processJobs();
      resolve();
    });
  }

}

function qyu(opts) {
  return new Qyu(opts);
}

module.exports = qyu;

// useful to get stack traces from UnhandledPromiseRejectionWarning errors:
//process.on('unhandledRejection', r => console.error(r));
// see https://github.com/nodejs/node/issues/9523#issuecomment-259303079
