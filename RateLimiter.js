const EventEmitter = require('events');

/**
 * Counts jobs per second to provide stats and commit to rating limit.
 * @fires Qyu#stats
 */
class RateLimiter extends EventEmitter {

  /**
   * Counts jobs per second to provide stats and commit to rating limit.
   * @param {Object} opts
   * @param {number} opts.rateLimit - maximum number of jobs to be run per second
   */
  constructor(opts) {
    super(opts);
    this.opts = Object.assign({}, opts);
    this.log = this.opts.log;
    this.processedJobs = 0;   // number of jobs processed since last call to start()
    this.statsInterval = null;  // will hold the interval that emits `stats` events
    this.timeOfLastStart = null;  // will hold the time of last call to start()
  }

  /**
   * emit a `stats` event
   * @private
   */
  _stats() {
    this.log && this.log.trace('RateLimiter:_stats');
    /**
     * Fired every `opts.statsInterval` milliseconds, to tell how many jobs are processed per second.
     * @event Qyu#stats
     * @type {object}
     * @property {number} nbJobsPerSecond - number of jobs that are processed per second
     */
    this.emit('stats', {
      nbJobsPerSecond: 1000 * this.processedJobs / (new Date() - this.timeOfLastStart)
    });
  }

  /**
   * Toggles the interval that emits `stats` events.
   * @private
   * @param {boolean} enable - true will (re)start the interval, false will stop it.
   */
  toggle(enable) {
    this.log && this.log.trace('RateLimiter:_toggleStatsInterval ', enable || 'false');
    if (this.statsInterval) {
      clearInterval(this.statsInterval)
      this.statsInterval = null;
    }
    if (enable) {
      this.timeOfLastStart = new Date();
      this.processedJobs = 0;
      this.statsInterval = setInterval(this._stats.bind(this), this.opts.statsInterval);
    }
  }

  /**
   * Informs the RateLimiter that a job has just ended
   */
  jobEnded() {
    ++this.processedJobs;
  }

}

module.exports = RateLimiter;
