/*global describe, it, beforeEach, afterEach*/

'use strict';

var robots  = require('../'),
    level   = require('level'),
    nock    = require('nock'),
    Promise = require('bluebird'),
    assert  = require('chai').assert;



describe('parser', function () {

  var db = null;

  beforeEach(function (done) {
    db = level('./test-db', function () {
      done();
    });
  });

  afterEach(function (done) {
    db.close(function () {
      db = null;
      level.destroy('./test-db', done);
    });
  });
  
  it('should fetch a robots file', function (done) {
    var scope = nock('http://www.example.com')
      .get('/robots.txt')
      .replyWithFile(200, __dirname + '/fixtures/robots1.txt')
      .get('/robots.txt')
      .replyWithFile(200, __dirname + '/fixtures/robots1.txt');

    var bot = robots();

    bot.isAllowed('woobot/1.0', 'http://www.example.com/allowed')
      .then(function (allowed) {
        assert.ok(allowed);
        return bot.isAllowed('woobot/1.0', 'http://www.example.com/disallowed');
      })
      .then(function (disallowed) {
        assert.notOk(disallowed);
        scope.done();
        done();
      })
      .catch(done);

  });
  
  it('should cache a robots file while fetching', function (done) {
    var scope = nock('http://www.example.com')
      .get('/robots.txt')
      .replyWithFile(200, __dirname + '/fixtures/robots1.txt');

    var bot = robots();

    Promise.join(
      bot.isAllowed('woobot/1.0', 'http://www.example.com/allowed'),
      bot.isAllowed('woobot/1.0', 'http://www.example.com/disallowed'),
      bot.isAllowed('googlebot', 'http://www.example.com/')
    )
      .spread(function (allowed, disallowed, googlebot) {
        assert.ok(allowed);
        assert.notOk(disallowed);
        assert.ok(googlebot);
        scope.done();
        done();
      })
      .catch(done);

  });
  
  it('should cache a robots file in db', function (done) {
    var scope = nock('http://www.example.com')
      .get('/robots.txt')
      .replyWithFile(200, __dirname + '/fixtures/robots1.txt');

    var bot = robots({
      db: db
    });

    bot.isAllowed('woobot/1.0', 'http://www.example.com/allowed')
      .then(function (allowed) {
        assert.ok(allowed);
        return bot.isAllowed('woobot/1.0', 'http://www.example.com/disallowed');
      })
      .then(function (disallowed) {
        assert.notOk(disallowed);
        scope.done();
        done();
      })
      .catch(done);

  });
  
  it('should fail when error', function (done) {
    var scope = nock('http://www.example.com')
      .get('/robots.txt')
      .replyWithFile(500, __dirname + '/fixtures/robots1.txt');

    var bot = robots();

    Promise.join(
      bot.isAllowed('woobot/1.0', 'http://www.example.com/allowed'),
      bot.isAllowed('woobot/1.0', 'http://www.example.com/disallowed'),
      bot.isAllowed('googlebot', 'http://www.example.com/')
    )
      .spread(function () {
        done(new Error('Expected to fail'));
      })
      .catch(robots.StatusError, function () {
        scope.done();
        done();
      })
      .catch(done);

  });
  
});