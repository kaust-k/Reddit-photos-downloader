'use strict';

const snoowrap = require('snoowrap');
const Promise = require('bluebird');
const request = require('request');
const path = require('path');
const fs = require('fs');
const mv = require('mv');
const debug = require('debug')('log');
const inquirer = require('inquirer');
const db = require('./db');

var DEST_DIR = process.env.DEST_DIR || '/home/k2/photos';
var SUBREDDIT = (process.env.SUBREDDIT || 'MostBeautiful').toLowerCase();
var FETCH_LIMIT = parseInt(process.env.FETCH_LIMIT) || 250;
var POST_SCORE = parseInt(process.env.POST_SCORE) || 750;
var IGNORE_DB = (process.env.IGNORE_DB === 'true');

var reddit;
var photosArr = [];
var gCnt = 0;

const questions = [{
  type: 'list',
  name: 'subreddit',
  message: 'Which subreddit?',
  choices: ['MostBeautiful', 'BeAmazed', 'itookapicture', 'CozyPlaces', 'earthPorn', 'getMotivated', 'art', 'space', 'pics', 'NatureIsFuckingLit', 'oddlysatisfying'],
  default: 0
}, {
  type: 'input',
  name: 'posts',
  message: 'How many posts should I download?',
  validate: function (value) {
    var valid = !isNaN(parseInt(value));
    return valid || 'Please enter a number';
  },
  default: 750,
  filter: Number
}, {
  type: 'input',
  name: 'post_score',
  message: 'Minimum post score?',
  validate: function (value) {
    var valid = !isNaN(parseInt(value));
    return valid || 'Please enter a number';
  },
  default: 750,
  filter: Number
}];

function init_reddit() {
  var username = process.env.USERNAME;
  var password = process.env.PASSWORD;
  var clientId = process.env.CLIENTID;
  var clientSecret = process.env.CLIENTSECRET;

  reddit = new snoowrap({
    userAgent: 'test123123',
    clientId: clientId,
    clientSecret: clientSecret,
    username: username,
    password: password
  });
}

function get_photos() {
  debug("Fetching list...");
  var pr;
  if (SUBREDDIT == 'space' || SUBREDDIT == 'MostBeautiful' || process.env.GET_TOP) {
    pr = reddit.getTop(SUBREDDIT, {
      time: process.env.TOP_TIME || 'month',
      limit: FETCH_LIMIT
    });
  } else {
    pr = reddit.getHot(SUBREDDIT, {
      limit: FETCH_LIMIT
    });
  }
  return pr.then(function (submissions) {
    photosArr = [];
    gCnt = 0;
    debug("# Submissions: ", submissions.length);
    submissions.forEach(function (post) {
      debug(post.title, ' ---- ', post.score, ' ---- ', post.url);
      if (post.score > POST_SCORE) {
        db.get_post(post.name || post.id).then(function (p) {
          debug("POST: ", p, post.id, gCnt);
          if (!p)
            photosArr.push(download_photo(post, gCnt++));
        });
      }
    });
    console.log("OUT OF THEN...... ");
  });
}

function download_photo(post, cnt) {
  var title = post.title,
    url = post.url,
    id = post.id;
  return new Promise.delay((cnt || (Math.random() * 20)) * 3 * 1000).then(function () {
    return new Promise(function (resolve, reject) {
      request.head(url, function (err, res, body) {
        if (err) {
          debug("request error: ", err);
          return reject(err);
        }
        var type = res.headers['content-type'];
        debug(`**** Header for ${url}: ${type}`);
        var isGif = false;
        if ((type && type.startsWith('image/')) || url.includes('imgur.com/')) {
          if (url.endsWith('.gifv')) {
            url = url.replace('.gifv', '.mp4');
            isGif = true;
          } else if (url.endsWith('.gif')) {
            url = url.replace('.gif', '.mp4');
            isGif = true;
          }

          if (url.includes('imgur.com/') && path.extname(url) === '') {
            var tmp = url.split('/');
            if (tmp && Array.isArray(tmp) && tmp.length == 4 && tmp[2] === 'imgur.com') {
              tmp[2] = 'i.imgur.com';
              tmp[3] = isGif ? `${tmp[3]}.mp4` : `${tmp[3]}.jpg`;
              url = tmp.join('/');
            } else {
              debug("CANNOT handle imgur.com");
              return reject("Cannot handle imgur.com");
            }
          }
          var dest = `/tmp/${path.basename(url)}`;
          var extArr = type.split("/");
          var ext = path.extname(url) || (extArr && extArr[extArr.length - 1]) || (isGif ? 'mp4' : 'jpg');
          if (!ext.startsWith('.')) {
            ext = `.${ext}`;
          }
          var file = fs.createWriteStream(dest);
          file.on('finish', function () {
            debug("File finish: " + url);
            title = title.replace(/(\[|\()oc(\]|\))/i, '');
            title = title.replace(/(\[|\()?\d+[x×\s]+\d+(\]|\))?/i, '');
            title = title.replace(/^"(.+?)"$/, "$1");
            title = title.replace(/^(.*?)(\.+)$/, "$1");
            title = title.split('/').join(' ');
            title = title.split('\\').join(' ');
            title = title.trim().substring(0, 150);
            return resolve(move_file(file, dest, `${DEST_DIR}/${SUBREDDIT}/${title}${ext}`).then(function () {
              return save_post(post);
            }));
            // });
          });
          file.on('error', function (err) { // Handle errors
            debug("File error: ", err);
            fs.unlink(dest); // Delete the file async. (But we don't check the result)
            return reject(err);
          });
          request(url, function (err, response, body) {
            if (err) {
              fs.unlink(dest);
              debug("Error while downloading: ", err);
              return reject(err);
            }
          }).pipe(file);
        } else {
          reject(`## CANNOT DOWNLOAD: Content type for ${url} is ${type}`);
        }
      });
    });
  });
}

function move_file(file, fromLoc, toLoc) {
  return new Promise(function (resolve, reject) {
    mv(fromLoc, toLoc, {
      mkdirp: true
    }, function (err) {
      if (err) {
        debug('Error while moving file: ', fromLoc, toLoc);
        return reject(err);
      }
      debug('File moved to: ', toLoc);
      return resolve(true);
    });
  });
}

function get_filename(filenameWOExt, ext, suffix) {
  let filename = `${filenameWOExt}${ext}`;
  return new Promise(function (resolve, reject) {
    fs.exists(filename, function (exists) {
      if (exists) {
        suffix = ('0' + parseInt(Math.random() * 100)).slice(-2);
      } else {
        return resolve(filename);
      }
    });
  });
}

function save_post(post) {
  if (IGNORE_DB) {
    return Promise.resolve(1);
  }

  debug("Saving post to db: ", post.id);
  return db.save_post({
    subreddit: SUBREDDIT,
    id: post.name || post.id,
    url: post.url,
    score: post.score,
    title: post.title,
    permalink: post.permalink,
    time: (new Date()).getTime()
  });
}

process.stdin.resume();

init_reddit();

inquirer.prompt(questions).then(function (answers) {
  SUBREDDIT = answers.subreddit;
  FETCH_LIMIT = answers.posts;
  POST_SCORE = answers.post_score;

  return get_photos();
  process.stdin.resume();
});
