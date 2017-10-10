const EventEmitter = require('events');

const ONE_SECOND = 1000;

const RECENT_JOB_CRITERIA = (now, endDate) => now - endDate <= ONE_SECOND

const MAKE_RECENT_JOB_CHECKER = () => {
  const now = new Date();
  return RECENT_JOB_CRITERIA.bind(null, now);
};

/**
 * Counts jobs per second to provide stats and commit to rating limit.
 * @fires RateLimiter#stats
 * @fires RateLimiter#drain
 * @fires RateLimiter#avail
 */
class RateLimiter extends EventEmitter {

  /**
   * Instantiate a RateLimiter.
   * @param {Object} opts
   * @param {number} opts.rateLimit - Maximum number of jobs to be run per second. If `null`, jobs will be run sequentially.
   * @param {number} opts.statsInterval - interval for emitting `stats`, in ms
   * @param {SimpleNodeLogger} opts.log - instance of simple-node-logger (optional)

   */
  constructor(opts) {
    super(opts);
    this.opts = Object.assign({}, opts);
    this.log = this.opts.log;
    this.running = 0;             // number of jobs that are currently running
    this.recentJobs = [];         // end dates of jobs ended <=1 second ago
    this.processedJobs = 0;       // number of jobs processed since last call to start()
    this.statsInterval = null;    // will hold the interval that emits `stats` events
    this.timeOfLastStart = null;  // will hold the time of last call to start()
  }

  /**
   * @returns array of end dates of jobs ended <=1 second ago.
   * @private
   */
  _cleanRecentJobs() {
    //console.log(now, 'cleaned', this.recentJobs.filter(date => now - date <= ONE_SECOND));
    return this.recentJobs.filter(MAKE_RECENT_JOB_CHECKER());
  }

  /**
   * adds the date of last ended job in this.recentJobs, after cleaning.
   * @private
   */
  _appendEndedJob() {
    this.recentJobs = this._cleanRecentJobs().concat([ new Date() ]);
  }

  /**
   * emit a `stats` event
   * @private
   */
  _stats() {
    this.log.trace('RateLimiter ⚡️ stats');
    /**
     * Fired every `opts.statsInterval` milliseconds, to tell how many jobs are processed per second.
     * @event Qyu#stats
     * @type {object}
     * @property {number} nbJobsPerSecond - number of jobs that are processed per second
     */
    this.emit('stats', {
      nbJobsPerSecond: ONE_SECOND * this.processedJobs / (new Date() - this.timeOfLastStart)
    });
  }

  /**
   * Toggles the interval that emits `stats` events.
   * @private
   * @param {boolean} enable - true will (re)start the interval, false will stop it.
   */
  toggle(enable) {
    this.log.trace('RateLimiter:toggle ', enable || 'false');
    if (!!enable === !!this.statsInterval) return;
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
   * Informs the RateLimiter that a job has just started
   */
  jobStarted() {
    ++this.running;
    this.log.trace('RateLimiter:jobStarted => running: ', this.running || '0');
    ++this.processedJobs;
  }

  /**
   * Informs the RateLimiter that a job has just ended
   */
  jobEnded() {
    --this.running;
    this._appendEndedJob(); // mutates this.recentJobs
    const nextExpiredJobDate = this.recentJobs[0]; // must be done early, to prevent race condition
    const canRunMore = this.canRunMore();
    this.log.trace('RateLimiter:jobEnded => running: ', this.running || '0', ', canRunMore: ', canRunMore || 'false');
    if (this.running === 0) {
      this.log.trace('RateLimiter ⚡️ drain');
      process.nextTick(() => this.emit('drain'));
    }
    if (canRunMore) {
      // rate limit is not exceeded => ask Qyu for another job
      this.log.trace('RateLimiter ⚡️ avail');
      process.nextTick(() => this.emit('avail'));
    } else {
      // rate limit is temporally exceeded => wait a bit before asking Qyu for another job
      this._emitOnNextAvail(nextExpiredJobDate);
    }
  }

  /**
   * Will emit `avail` asap while respecting rate limit.
   * @private
   * @param {Date} nextExpiredJobDate - end date of the first recent job to expire.
   */
  _emitOnNextAvail(nextExpiredJobDate) {
    this.log.trace('RateLimiter:_emitOnNextAvail, nextExpiredJobDate: ', nextExpiredJobDate || '(none)');
    if (!nextExpiredJobDate) return;
    const remainingMsUntilAvail = ONE_SECOND - (new Date() - nextExpiredJobDate);
    this.log.debug('RateLimiter:_emitOnNextAvail will emit in ', remainingMsUntilAvail, ' ms ...');
    setTimeout(() => {
      const canRunMore = this.canRunMore();
      this.log.trace('RateLimiter:_emitOnNextAvail [timeout] canRunMore: ', canRunMore || 'false');
      if (canRunMore) {
        this.log.trace('RateLimiter ⚡️ avail');
        this.emit('avail');
      }
      // TODO: if still not ready, try again later?
    }, remainingMsUntilAvail);
  }

  /**
   * determines whether or not it's possible to start another job now, according to rate limits.
   * @returns true if it's possible to start another job now
   */
  canRunMore() {
    if (this.opts.rateLimit === null) {
      return this.running === 0; // run jobs sequentially, without applying rate limit
    }
    const nbJobsEndedDuringLastSecond = this._cleanRecentJobs().length;
    return this.running + nbJobsEndedDuringLastSecond < this.opts.rateLimit;
  }

  /**
   * @returns a promise that resolves when all jobs ended running.
   */
  waitForDrain() {
    return new Promise((resolve, reject) => {
      if (this.running === 0) {
        resolve();
      } else {
        this.once('drain', resolve);
      }
    });
  }

}

module.exports = RateLimiter;
