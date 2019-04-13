var Promise = require('bluebird');
var Datastore = require('nedb'),
  db = {};

db.posts = new Datastore({
  filename: __dirname + '/db/posts.db',
  autoload: true
});

function get_posts(cb) {
  db.posts.find({}, function(err, docs) {
    console.log("ERR ", err, docs);
    if (docs && cb)
      cb(docs);
  });
}

function get_post(id) {
  return new Promise(function(resolve, reject) {
    db.posts.findOne({
      _id: id
    }, function(err, doc) {
      console.log("get_post: ", id, err, doc);
      if (err) {
        return reject(false);
      }
      return resolve(doc ? true : false);
    });
  });
}

function save_posts(posts) {
  if (!posts || posts.length == 0)
    return;

  var tmpPost;
  for (var i = 0; i < posts.length; i++) {
    tmpPost = posts[i];
    tmpPost._id = tmpPost.id;
    delete tmpPost.id;
    db.posts.update({
      '_id': tmpPost._id
    }, tmpPost, {
      upsert: true
    });
  }
}

function save_post(post) {
  return new Promise(function(resolve, reject) {
    if (!post)
      return reject(false);

    post._id = post.id;
    delete post.id;
    db.posts.update({
      '_id': post._id
    }, post, {
      upsert: true
    }, function(err, numAffected, affectedDocuments, upsert) {
      if (err)
        return reject(err);

      return resolve(true);
    });
  });
}

module.exports = {
  get_post,
  save_post,
  save_posts
};
