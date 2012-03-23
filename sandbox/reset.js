var fs = require("fs");
var pagetty = require("./lib/pagetty.js");

var channels = [
  {name: "Delfi", url: "http://delfi.ee", rules: [{
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
    title_attribute: false},
  ]},
  {name: "Postimees", url: "http://postimees.ee", rules: [{
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
  {name: "Õhtuleht", url: "http://ohtuleht.ee", rules: [{
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
  {name: "TechCrunch", url: "http://techcrunch.com", rules: [{
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
  {name: "AnandTech", url: "http://www.anandtech.com", rules: [{
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
  {name: "English Russia", url: "http://englishrussia.com", rules: [{
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
  {name: "500px - Pupular", url: "http://500px.com/popular", rules: [{
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
  {name: "Reddit - TOP", url: "http://reddit.com/top", rules: [{
    item: "div.thing:not(.promoted)",
    image_selector: "a.thumbnail img",
    image_attribute: "src",
    score_selector: "div.midcol div.unvoted",
    score_attribute: false,
    score_target_selector: "a.comments",
    score_target_attribute: "href",
    target_selector: "a.title",
    target_attribute: "href",
    title_selector: "a.title",
    title_attribute: false}
  ]},
  {name: "FailBlog", url: "http://failblog.org", rules: [{
    item: "div.post",
    image_selector: "img.event-item-lol-image",
    image_attribute: "src",
    score_selector: "div.rating-widget div.label",
    score_attribute: false,
    score_target_selector: "li.comment a",
    score_target_attribute: "href",
    target_selector: "h2 a",
    target_attribute: "href",
    title_selector: "h2 a",
    title_attribute: false}
  ]},
  {name: "Smashing Magazine", url: "http://www.smashingmagazine.com/", rules: [{
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
  {name: "DailyJS", url: "http://dailyjs.com/", rules: [{
    item: ".post-inner",
    image_selector: "p img",
    image_attribute: "src",
    score_selector: "span.comments a",
    score_attribute: false,
    score_target_selector: "span.comments a",
    score_target_attribute: "href",
    target_selector: "h2 a",
    target_attribute: "href",
    title_selector: "h2 a",
    title_attribute: false}
  ]},
  {name: "Mashable", url: "http://mashable.com", rules: [{
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
  {name: "ReddPics - Sexy", url: "http://reddpics.com/r/sexy/", rules: [{
    item: "#images li",
    image_selector: "em img",
    image_attribute: "src",
    score_selector: ".md h3",
    score_attribute: false,
    score_target_selector: ".md a",
    score_target_attribute: "href",
    target_selector: "em a",
    target_attribute: "href",
    title_selector: "em img",
    title_attribute: "alt"}
  ]},
];

pagetty.init(function() {
  // Remove all users.
  pagetty.users.remove({});
  console.log("Removed all users.");

  // Remove all channels.
  pagetty.channels.remove({});
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
        pagetty.createChannel(channels[i], function(err, channel) {
          if (err) throw err;
          pagetty.subscribe(user._id, channel._id, function() {
            pagetty.updateChannelItems(channel, function(err) {
              if (err) throw err;
              console.log("Created channel, subscribed, updated: " + channel.name);
            });
          });
        });
      }
    });
  });
});
