task("reset", [], function() {
	var fs = require("fs");
	var pagetty = require(__dirname + "/lib/pagetty.js");
	var logger = require(__dirname + "/lib/logger.js");
	var sanitize = require('validator').sanitize;
	var Channel = require('./lib/channel.js');

	var channels = [
		{name: "EnglishRussia", url: "http://englishrussia.com", domain: "englishrussia.com"},
		{name: "DELFI", url: "http://www.delfi.ee/", domain: "www.delfi.ee"},
		{name: "Õhtuleht", url: "http://www.ohtuleht.ee", domain: "www.ohtuleht.ee"},
		{name: "TechCrunch", url: "http://techcrunch.com", domain: "techcrunch.com"},
		{name: "AnandTech", url: "http://www.anandtech.com", domain: "www.anandtech.com"},
		{name: "500px - Popular", url: "http://500px.com/popular", domain: "500px.com"},
		{name: "Reddit Top", url: "http://www.reddit.com/top", domain: "www.reddit.com"},
		{name: "Reddit - Gaming", url: "http://www.reddit.com/r/gaming", domain: "www.reddit.com"},
		{name: "Failblog", url: "http://failblog.org", domain: "failblog.org"},
		{name: "Smashing Magazone", url: "http://www.smashingmagazine.com/", domain: "www.smashingmagazine.com"},
		{name: "DailyJS", url: "http://dailyjs.com/", domain: "dailyjs.com"},
		{name: "Mashable", url: "http://mashable.com", domain: "mashable.com"},
		{name: "Slashdot", url: "http://slashdot.org/", domain: "slashdot.org"},
		{name: "Planet node.js", url: "http://planetnodejs.com/", domain: "planetnodejs.com"},
		{name: "Youtube - most viewed today in Science", url: "http://www.youtube.com/charts/videos_views/science", domain: "www.youtube.com"}
	];

	var rules = [{
		domain: "www.reddit.com",
		item: "div.thing:not(.promoted)",
		target: {selector: "a.title", url_attribute: "href", title_attribute: null},
		image: {selector: "a.thumbnail img", attribute: "src"},
		score: {selector: "div.score.unvoted", attribute: null},
		comments: {selector: "a.comments", attribute: "href"}
	}, {
		domain: "www.delfi.ee",
		item: "div.fp_huge_block, div.fp_big_block, div.fp_small_block, div.fp_small_block, div.news_big_wrap, div.news_small_wrap",
		target: {selector: "a.CBarticleTitle", url_attribute: "href", title_attribute: null},
		image: {selector: "img", attribute: "src"},
		score: {selector: "a.commentCount", attribute: null},
		comments: {selector: "a.commentCount", attribute: "href"}
	}, {
		domain: "www.ohtuleht.ee",
		item: "div.article",
		target: {selector: "h2 a", url_attribute: "href", title_attribute: null},
		image: {selector: "div.img img", attribute: "data-original"},
		score: {selector: "a.red", attribute: null},
		comments: {selector: "a.red", attribute: "href"}
	}, {
		domain: "techcrunch.com",
		item: "div.post",
		target: {selector: "h2.headline a", url_attribute: "href", title_attribute: null},
		image: {selector: "div.media-container img", attribute: "data-src"},
		score: {selector: "span.fb_comments_count", attribute: null},
		comments: {selector: null, attribute: null}
	}, {
		domain: "www.anandtech.com",
		item: "div.newsitem",
		target: {selector: "a.b", url_attribute: "href", title_attribute: null},
		image: {selector: "img:not(.newsLabel)", attribute: "src"},
		score: {selector: "a.other", attribute: null},
		comments: {selector: "a.other", attribute: "href"}
	}, {
		domain: "englishrussia.com",
		item: "div.post",
		target: {selector: "h2.entry-title a", url_attribute: "href", title_attribute: "title"},
		image: {selector: "img", attribute: "src"},
		score: {selector: ".comments-link a", attribute: null},
		comments: {selector: ".comments-link a", attribute: "href"}
	}, {
		domain: "500px.com",
		item: ".photo",
		target: {selector: ".title a", url_attribute: "href", title_attribute: null},
		image: {selector: "a img", attribute: "src"},
		score: {selector: ".rating", attribute: null},
		comments: {selector: null, attribute: null}
	}, {
		domain: "failblog.org",
		item: "div.post",
		target: {selector: "h2 a", url_attribute: "href", title_attribute: null},
		image: {selector: "img.event-item-lol-image", attribute: "src"},
		score: {selector: "li.comment a span", attribute: null},
		comments: {selector: "li.comment a", attribute: "href"}
	}, {
		domain: "www.smashingmagazine.com",
		item: "article",
		target: {selector: "h2 a", url_attribute: "href", title_attribute: null},
		image: {selector: "p a img", attribute: "src"},
		score: {selector: "li.comments a", attribute: null},
		comments: {selector: "li.comments a", attribute: "href"}
	}, {
		domain: "dailyjs.com",
		item: ".post-inner",
		target: {selector: "h2 a", url_attribute: "href", title_attribute: null},
		image: {selector: "p img", attribute: "src"},
		score: {selector: "span.comments a", attribute: null},
		comments: {selector: null, attribute: null}
	}, {
		domain: "mashable.com",
		item: "div.featured",
		target: {selector: "h2.summary a", url_attribute: "href", title_attribute: null},
		image: {selector: "a.frame img", attribute: "src"},
		score: {selector: "a.comment_count", attribute: null},
		comments: {selector: "a.comment_count", attribute: "href"}
	}, {
		domain: "mashable.com",
		item: "article",
		target: {selector: ".entry-title h2 a", url_attribute: "href", title_attribute: null},
		image: {selector: ".image-frame img", attribute: "src"},
		score: {selector: "a.comment_count", attribute: null},
		comments: {selector: "a.comment_count", attribute: "href"}
	}, {
		domain: "slashdot.org",
		item: "article",
		target: {selector: "h2.story a", url_attribute: "href", title_attribute: null},
		image: {selector: "div.body img", attribute: "src"},
		score: {selector: "strong.comments", attribute: null},
		comments: {selector: "footer a.read-more", attribute: "href"}
	}, {
		domain: "planetnodejs.com",
		item: "div.post",
		target: {selector: ".post-title a", url_attribute: "href", title_attribute: null},
		image: {selector: ".post-description p img", attribute: "src"},
		score: {selector: null, attribute: null},
		comments: {selector: null, attribute: null}
	}, {
		domain: "www.youtube.com",
		item: ".browse-header .video-card",
		target: {selector: "a.video-title", url_attribute: "href", title_attribute: null},
		image: {selector: "img", attribute: "src"},
		score: {selector: "span.viewcount", attribute: null},
		comments: {selector: null, attribute: null}
	}];

	pagetty.init(function() {
		// Remove all channels.
		pagetty.channels.remove({});
		console.log("Removed all channels.");

		// Remove all rules.
		pagetty.rules.remove({});
		console.log("Removed all rules.");

		// Remove all users.
		pagetty.users.remove({});
		console.log("Removed all users.");

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

				for (var i in channels) {
					var channel = new Channel(channels[i]);
					
					channel.save(function(err) {
						if (err) {
							console.log(err);
						}
						else {
							pagetty.subscribe({user_id: user._id, url: channels[i].url, name: channels[i].name}, function(err) {
								if (err) console.log(err);
								//console.log("Reset done for: " + channel.url);
							});
						}
					});
				}

				for (var i in rules) {
					pagetty.createRule(rules[i], function(){});
				}

			});
		});
	});
});
