// proposed implementation for the "qyu" queue

const EventEmitter = require('events');
const SimpleNodeLogger = require('simple-node-logger');

const LOWEST_PRIO = 10;

const DEFAULT_QUEUE_OPTIONS = {
  rateLimit: 1,           // process no more than 1 job per second
  statsInterval: 1000,    // emit `stats` every second
};

const DEFAULT_JOB_OPTIONS = {
  priority: LOWEST_PRIO,  // low job priority by default, when calling push()
};

var nextJobId = 0; // global job counter, used to generate unique ids

/**
 * Holds, controls and reports on execution of a queue of jobs.
 * @fires Qyu#done
 * @fires Qyu#error
 * @fires Qyu#drain
 * @fires Qyu#stats
 */
class Qyu extends EventEmitter {

  /**
   * Instanciates a job queue.
   * @param {Object} opts
   * @param {number} opts.rateLimit - maximum number of jobs being processed by second
   * @param {number} opts.statsInterval - interval for emitting `stats`, in ms
   * @param {SimpleNodeLogger} opts.log - instance of simple-node-logger (optional)
   */
  constructor(opts) {
    super(opts);
    this.opts = Object.assign({}, opts);
    this.log = this.opts.log || SimpleNodeLogger.createSimpleLogger();
    this.log.trace('Qyu:constructor() ', opts);
    this.jobs = [];           // unsorted array of { job, opts } objects
    this.started = false;     // turns to `true` when client called `start()`
    this.running = 0;         // number of jobs that are running
    this.runningJob = null;   // job entry that is currently running, or null
    // NOTE: could use `Symbol` to prevent properties from being accessed/mutated externally

    // TODO
    /*
    this.emit('stats', {nbJobsPerSecond});
    */
  }

  /**
   * emit an `error` event
   * @private
   * @param {Object} err
   * @param {number} err.jobId - identifier of the job that throwed the error
   * @param {Error} err.error - error object throwed by the job
   */
  _error({jobId, error}) {
    this.log.trace('Qyu:_error ', {jobId, error});
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
    this.log.trace('Qyu:_done ', res);
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
   * called by _jobEnded() and _jobEndedWithError()
   * @private
   * @param {number} jobId - identifier of the job which execution ended
   */
  _popJob(jobId) {
    this.running = 0;
    this.jobs = this.jobs.filter(job => job.id !== jobId);
    this.runningJob = null;
  }

  /**
   * called by _processJob() when a job is done
   * @private
   * @param {*} jobResult - return value of the job function that ended
   */
  _jobEnded(jobResult) {
    this.log.trace('Qyu:_jobEnded() ', jobResult);
    const doneObj = {
      jobId: this.runningJob.id,
      jobResult,
      res: null, // TODO
    };
    this._popJob(this.runningJob.id);
    this._done(doneObj);
    this._processJob(); // run next job, if any
  }

  /**
   * called by _processJob() when a job has ended with an error
   * @private
   * @param {Error} err
   */
  _jobEndedWithError(err) {
    this.log.trace('Qyu:_jobEndedWithError()');
    this._popJob(this.runningJob.id);
    this._error(err);
    this._processJob(); // run next job, if any
  }

  /**
   * called by _processJob() when all jobs are done
   * @private
   */
  _drained() {
    this.log.trace('Qyu:_drained()');
    /**
     * Fired when no more jobs are to be run.
     * @event Qyu#drain
     */
    this.emit('drain');
  }

  /**
   * runs the next job, if any.
   * @private
   */
  _processJob() {
    this.log.trace('Qyu:_processJob() ', { started: this.started, running: this.running });
    if (this.started && this.running === 0) {
      if (this.jobs.length) {
        const priority = this.jobs.reduce((lowest, job) => Math.min(lowest, job.opts.priority), LOWEST_PRIO);
        this.runningJob = this.jobs.find(job => job.opts.priority === priority);
        this.running = 1;
        this.log.debug('Qyu.runningJob = ', this.runningJob);
        this.runningJob.job()
          .then(this._jobEnded.bind(this))
          .catch(this._jobEndedWithError.bind(this));
      } else {
        this._drained();
      }
    }
    // TODO: commit to rateLimit
  }

  /**
   * Add a job to this queue, and runs it if queue was started.
   * @param {Function} job is a function returning a promise to indicate when the job is done
   * @param {Object} opts
   * @param {number} opts.priority from 1 to 10, 1 being the highest priority
   * @returns {Promise} A promise that resolves with {jobId, jobResult}
   */
  push(job, opts) {
    this.log.trace('Qyu:push() ', job, opts);
    this.jobs.push({
      id: nextJobId++,
      job,
      opts: Object.assign(DEFAULT_JOB_OPTIONS, opts)
    });
    this._processJob();
  }

  /**
   * Pause all running jobs of this queue.
   * @returns {Promise} A promise that resolves when the queue has paused (no jobs being processed)
   */
  pause() {
    this.log.trace('Qyu:pause()');
    return new Promise((resolve, reject) => {
      this.started = false;
      if (this.running === 0) {
        resolve();
      } else {
        this.once('done', resolve);
      }
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
      this._processJob();
      resolve();
    });
  }

}

function qyu(opts) {
  return new Qyu(opts);
}

module.exports = qyu;
