'use strict';

var urlUtil = require('url'),
    request = require('request'),
    Promise = require('bluebird'),
    through = require('through'),
    util    = require('util'),
    extend  = require('extend'),
    levelTtl       = require('level-ttl'),
    parseRobotsTxt = require('robots-txt-parse'),
    guardRobotsTxt = require('robots-txt-guard');



// asynchronous cache that accepts promises as values. db is optional and
// expected to be a leveldb. a ttl is also expected (ms)
// It falls back to a fetch function when data is not found and automatically
// populates the cache with it
// if no db specified, the caching only happens during concurrent reads
function promiseCache(spec) {

  var DEFAULT_TTL = 0;

  var db      = spec.db && levelTtl(spec.db, {}),
      dbGet   = db && Promise.promisify(db.get, db),
      dbPut   = db && Promise.promisify(db.put, db),
      ttl     = spec.ttl || DEFAULT_TTL,
      pending = {};

  function doFetch(key, fetcher) {
    if (typeof fetcher !== 'function') {
      return Promise.reject(new Error('not found'));
    }

    if (pending[key]) {
      return pending[key];
    }

    pending[key] = fetcher()
      .tap(function (value) {
        if (dbPut) {
          return dbPut(key, value, { valueEncoding: 'json', ttl: ttl });
        }
      })
      .finally(function () {
        delete pending[key];
      });
    return pending[key];
  }

  function get(key, fetcher) {
    if (pending[key]) {
      return pending[key];
    } else if (dbGet) {
      return dbGet(key, { valueEncoding: 'json' })
        .catch(function (err) {
          if (!err.notFound) {
            throw err;
          }
          return doFetch(key, fetcher);
        });
    } else {
      return doFetch(key, fetcher);
    }
  }

  return {
    get: get
  };

}




// split in host and path
function split(url) {
  var parsed         = urlUtil.parse(url),
      isSsl          = parsed.protocol === 'https:',
      standardPort   = isSsl ? 443 : 80,
      isStandardPort = parseInt(parsed.port, 10) === standardPort,
      port           = isStandardPort ? null : parsed.port;

  var host = urlUtil.format({
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port    : port
  });

  return {
    host: host,
    path: parsed.path
  };
}

function StatusError(status) {
  this.name = 'StatusError';
  this.message = util.format('Http status %d', status);
  this.status = status;
  Error.captureStackTrace(this, this.constructor);
}
util.inherits(StatusError, Error);


function makeRobot(config) {
  config = config || {};

  var cache   = promiseCache(config),
      httpGet = Promise.promisify(request.get, request);

  function httpGetStream(options) {
    return httpGet(options)
      .spread(function (res, body) {
        if (200 <= res.statusCode && res.statusCode < 400) {
          var stream = through();
          stream.pause();
          stream.end(body);
          return stream;
        } else {
          var error = new StatusError(res.statusCode);
          throw error;
        }
      });
  }

  function getRobots(host) {
    return cache.get(host, function () {
      var robotsUrl = host + '/robots.txt',
          req = extend(true, {}, config.request, { uri: robotsUrl });

      var inStream = httpGetStream(req);
      var result = inStream.then(parseRobotsTxt);
      inStream.then(function (stream) {
        stream.resume();
      }, function () {
        // ignore
      });
      return result;
    });
  }

  function isAllowed(userAgent, url) {
    var parts = split(url);

    return getRobots(parts.host)
      .then(function (parsed) {
        var guard = guardRobotsTxt(parsed);
        return guard.isAllowed(userAgent, parts.path);
      });
  }

  return {
    StatusError: StatusError,
    isAllowed: isAllowed
  };

}

makeRobot.StatusError = StatusError;

module.exports = makeRobot;
