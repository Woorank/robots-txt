# robots-txt [![Build Status](https://travis-ci.org/Woorank/robots-txt.svg)](https://travis-ci.org/Woorank/robots-txt)

Handles checking of robots.txt. handles concurrent requests and caching.

## usage

```js
var robots = require('robots-txt'),
    level  = require('level');

var bot = robots({
  db: level('./robots-txt-cache'),
  ttl: 1000 * 60 * 60 * 24 // one day
});

bot.isAllowed('woobot', 'http://www.woorank.com/my/path')
  .then(function (isAllowed) {
    // ...
  });

```

This module fetches robots.txt files and optionally caches them in a level-db.
parsing and checking of robots.txt files is done by secondary modules [robots-txt-parse](https://github.com/Woorank/robots-txt-parse) and [robots-txt-guard](https://github.com/Woorank/robots-txt-guard) and can be used separately.
