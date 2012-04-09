var fs = require("fs");
var pagetty = require(__dirname + "/lib/pagetty.js");
var logger = require(__dirname + "/lib/logger.js");
var sanitize = require('validator').sanitize;

var channels = [
  {name: "Delfi", url: "http://delfi.ee", parser: "delfi"},
  {name: "Postimees", url: "http://postimees.ee", parser: "postimees"},
  {name: "Õhtuleht", url: "http://ohtuleht.ee", parser: "ohtuleht"},
  {name: "TechCrunch", url: "http://techcrunch.com", parser: "techcrunch"},
  {name: "AnandTech", url: "http://www.anandtech.com", parser: "anandtech"},
  {name: "EnglishRussia", url: "http://englishrussia.com", parser: "englishrussia"},
  {name: "500px - Popular", url: "http://500px.com/popular", parser: "soopx"},
  {name: "Reddit Top", url: "http://reddit.com/top", parser: "reddit"},
  //{name: "Reddit - Gaming", url: "http://reddit.com/r/gaming", parser: "reddit"},
  {name: "Failblog", url: "http://failblog.org", parser: "failblog"},
  {name: "Smashing Magazone", url: "http://www.smashingmagazine.com/", parser: "smashingmagazine"},
  {name: "DailyJS", url: "http://dailyjs.com/", parser: "dailyjs"},
  {name: "Mashable", url: "http://mashable.com", parser: "mashable"},
  {name: "ReddPics", url: "http://reddpics.com/", parser: "reddpics"},
  {name: "Slashdot", url: "http://slashdot.org/", parser: "slashdot"},
  {name: "Planet node.js", url: "http://planetnodejs.com/", parser: "planetnodejs"},
  {name: "Youtube - most viewed today in Science", url: "http://www.youtube.com/charts/videos_views/science", parser: "youtube"},
];

var created_parsers = {};

var parsers = {
  delfi: {name: "Delfi", rules: [{
    item: "div.fp_huge_block",
    image_selector: "img",
    image_attribute: "src",
    score_selector: "a.commentCount",
    score_attribute: false,
    score_target_selector: "a.commentCount",
    score_target_attribute: "href",
    target_selector: "a.CBarticleTitle",
    target_attribute: "href",
    title_selector: "a.CBarticleTitle",
    title_attribute: false}, {

    item: "div.fp_big_block",
    image_selector: "img",
    image_attribute: "src",
    score_selector: "a.commentCount",
    score_attribute: false,
    score_target_selector: "a.commentCount",
    score_target_attribute: "href",
    target_selector: "a.CBarticleTitle",
    target_attribute: "href",
    title_selector: "a.CBarticleTitle",
    title_attribute: false}, {

    item: "div.fp_small_block",
    image_selector: "img",
    image_attribute: "src",
    score_selector: "a.commentCount",
    score_attribute: false,
    score_target_selector: "a.commentCount",
    score_target_attribute: "href",
    target_selector: "a.CBarticleTitle",
    target_attribute: "href",
    title_selector: "a.CBarticleTitle",
    title_attribute: false}, {

    item: "div.news_big_wrap",
    image_selector: "img",
    image_attribute: "src",
    score_selector: "a.commentCount",
    score_attribute: false,
    score_target_selector: "a.commentCount",
    score_target_attribute: "href",
    target_selector: "a.CBarticleTitle",
    target_attribute: "href",
    title_selector: "a.CBarticleTitle",
    title_attribute: false}, {

    item: "div.news_small_wrap",
    image_selector: "img",
    image_attribute: "src",
    score_selector: "a.commentCount",
    score_attribute: false,
    score_target_selector: "a.commentCount",
    score_target_attribute: "href",
    target_selector: "a.CBarticleTitle",
    target_attribute: "href",
    title_selector: "a.CBarticleTitle",
    title_attribute: false}
  ]},
  postimees: {name: "Postimees", rules: [{
    item: "div.uudise_kast",
    image_selector: "img.uudispilt",
    image_attribute: "src",
    score_selector: "a.komm_arv_link",
    score_attribute: false,
    score_target_selector: "a.komm_arv_link",
    score_target_attribute: "href",
    target_selector: "a.uudise_pealkiri",
    target_attribute: "href",
    title_selector: "a.uudise_pealkiri",
    title_attribute: false}
  ]},
  ohtuleht: {name: "Õhtuleht", rules: [{
    item: "div.article",
    image_selector: "div.img img",
    image_attribute: "src",
    score_selector: "a.red",
    score_attribute: false,
    score_target_selector: "a.red",
    score_target_attribute: "href",
    target_selector: "h2 a",
    target_attribute: "href",
    title_selector: "h2 a",
    title_attribute: false}
  ]},
  techcrunch: {name: "TechCrunch", rules: [{
    item: "div.post",
    image_selector: "div.media-container img",
    image_attribute: "data-src",
    score_selector: "span.fb_comments_count",
    score_attribute: false,
    target_selector: "h2.headline a",
    target_attribute: "href",
    title_selector: "h2 a",
    title_attribute: false}
  ]},
  anandtech: {name: "AnandTech", rules: [{
    item: "div.newsitem",
    image_selector: "img",
    image_attribute: "src",
    score_selector: "a.other",
    scoe_attribute: false,
    score_target_selector: "a.other",
    score_target_attribute: "href",
    target_selector: "a.b",
    target_attribute: "href",
    title_selector: "a.b",
    title_attribute: false}
  ]},
  englishrussia: {name: "English Russia", rules: [{
    item: "div.post",
    image_selector: "img",
    image_attribute: "src",
    score_selector: ".comments-link a",
    score_attribute: false,
    score_target_selector: ".comments-link a",
    score_target_attribute: "href",
    target_selector: "h2.entry-title a",
    target_attribute: "href",
    title_selector: "h2.entry-title a",
    title_attribute: "title"}
  ]},
  soopx: {name: "500px", rules: [{
    item: ".photo",
    image_selector: "a img",
    image_attribute: "src",
    score_selector: ".rating",
    score_attribute: false,
    target_selector: ".title a",
    target_attribute: "href",
    title_selector: ".title a",
    title_attribute: false}
  ]},
  reddit: {name: "Reddit", rules: [{
    item: "div.thing",
    image_selector: "a.thumbnail img",
    image_attribute: "src",
    score_selector: "div.score.unvoted",
    score_attribute: false,
    score_target_selector: "a.comments",
    score_target_attribute: "href",
    target_selector: "a.title",
    target_attribute: "href",
    title_selector: "a.title",
    title_attribute: false}
  ]},
  failblog: {name: "FailBlog", rules: [{
    item: "div.post",
    image_selector: "img.event-item-lol-image",
    image_attribute: "src",
    score_selector: "li.comment a span",
    score_attribute: false,
    score_target_selector: "li.comment a",
    score_target_attribute: "href",
    target_selector: "h2 a",
    target_attribute: "href",
    title_selector: "h2 a",
    title_attribute: false}
  ]},
  smashingmagazine: {name: "Smashing Magazine frontpage", rules: [{
    item: "article",
    image_selector: "p a img",
    image_attribute: "src",
    score_selector: "li.comments a",
    score_attribute: false,
    score_target_selector: "li.comments a",
    score_target_attribute: "href",
    target_selector: "h2 a",
    target_attribute: "href",
    title_selector: "h2 a",
    title_attribute: false}
  ]},
  dailyjs: {name: "DailyJS", rules: [{
    item: ".post-inner",
    image_selector: "p img",
    image_attribute: "src",
    score_selector: "span.comments a",
    score_attribute: false,
    target_selector: "h2 a",
    target_attribute: "href",
    title_selector: "h2 a",
    title_attribute: false}
  ]},
  mashable: {name: "Mashable", rules: [{
    item: "div.featured",
    image_selector: "a.frame img",
    image_attribute: "src",
    score_selector: "a.comment_count",
    score_attribute: false,
    score_target_selector: "a.comment_count",
    score_target_attribute: "href",
    target_selector: "h2.summary a",
    target_attribute: "href",
    title_selector: "h2.summary a",
    title_attribute: false}, {

    item: "article",
    image_selector: ".image-frame img",
    image_attribute: "src",
    score_selector: "a.comment_count",
    score_attribute: false,
    score_target_selector: "a.comment_count",
    score_target_attribute: "href",
    target_selector: ".entry-title h2 a",
    target_attribute: "href",
    title_selector: ".entry-title h2 a",
    title_attribute: false}
  ]},
  reddpics: {name: "ReddPics", rules: [{
    item: "#images li",
    image_selector: "em img",
    image_attribute: "src",
    score_selector: ".md h3",
    score_attribute: false,
    score_target_selector: ".md>a",
    score_target_attribute: "href",
    target_selector: "em a",
    target_attribute: "href",
    title_selector: "em img",
    title_attribute: "alt"}
  ]},
  slashdot: {name: "Slashdot", rules: [{
    item: "article",
    image_selector: "div.body img",
    image_attribute: "src",
    score_selector: "strong.comments",
    score_attribute: false,
    score_target_selector: "footer a.read-more",
    score_target_attribute: "href",
    target_selector: "h2.story a",
    target_attribute: "href",
    title_selector: "h2.story a",
    title_attribute: false}
  ]},
  torrentfreak: {name: "TorrentFreak", rules: [{
    item: "div",
    title_selector: "h4 a",
    title_attribute: false,
    target_selector: "h4 a",
    target_attribute: "href",
    score_selector: "li.comments a span",
    score_attribute: false,
    score_target_selector: "li.comments a",
    score_target_attribute: "href"}
  ]},
  planetnodejs: {name: "Planet node.js", rules: [{
    item: "div.post",
    title_selector: ".post-title a",
    title_attribute: false,
    target_selector: ".post-title a",
    target_attribute: "href",
    image_selector: ".c img",
    image_attribute: "src"}
  ]},
  youtube: {name: "Youtube", rules: [{
    item: ".browse-header .video-card",
    title_selector: "a.video-title",
    title_attribute: false,
    target_selector: "a.video-title",
    target_attribute: "href",
    score_selector: "span.viewcount",
    score_attribute: false,
    score_target_selector: "a.video-title",
    score_target_attribute: "href"}
  ]},
};

pagetty.init(function() {
  // Remove all users.
  pagetty.users.remove({});
  console.log("Removed all users.");

  // Remove all channels.
  pagetty.channels.remove({});
  console.log("Removed all channels.");

  // Remove all parsers.
  pagetty.parsers.remove({});
  console.log("Removed all parsers.");

  // Remove all history.
  pagetty.history.remove({});
  console.log("Removed all channels.");

  // Remove all sessions.
  pagetty.sessions.remove({});
  console.log("Removed all sessions.");

  // Clear image cache.
  images = fs.readdirSync("./images");

  for (var i in images) {
    fs.unlinkSync("./images/" + images[i]);
  }
  console.log("Removed all cached images.");

  // Create a new user and import channels.
  pagetty.signup("ivo@pagetty.com", function(err, user) {
    if (err) throw err;
    pagetty.activate({user_id: user._id.toString(), name: "ivo", pass: "ivonellis", pass2: "ivonellis"}, function(err) {
      if (err) throw err;
      console.log("Created an user account for you, dear Ivo.");
      for (var i in channels) {
        createParser(channels[i].parser, i, function(err, i, parser) {
          var channel = channels[i];
          channel.parser = parser._id;
          pagetty.createChannel(channel, function(err, channel) {
            if (err) throw err;
            pagetty.subscribe(user._id, channel._id, function() {
              console.log("Reset done for: " + channel.url);
            });
          });
        });
      }
    });
  });
});

function createParser(parser_name, i, callback) {
  if (created_parsers[parser_name]) {
    callback(false, i, created_parsers[parser_name]);
  }
  else {
    pagetty.createParser(parsers[parser_name], function(err, parser) {
      created_parsers[parser_name] = parser._id;
      callback(err, i, parser);
    });
  }
}
