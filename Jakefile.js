/**
 * Build configuration.
 */
var buildID   = createBuildID(),
    buildRoot = __dirname + "/builds/";
    buildPath = buildRoot + buildID + "/";

/**
 * Creates a new build of the app.
 */
task("default", ["bootstrap", "iptables", "copy-files"], function() {
	complete();
});

/**
 * Bootstrap task.
 */
task("bootstrap", [], function() {
	console.log("Build ID: " + buildID);
	console.log("Build path: " + buildPath);
	complete();
});

/**
 * Iptables task.
 */
task("iptables", [], function() {
	var async = require("async"),
			exec =  require("child_process").exec;

	async.series([
			function(callback){
				exec("sudo iptables --table nat --flush", function (error, stdout, stderr) {
					if (error !== null) {
						console.log(error.message);
						throw error;
					} else {
						console.log("Iptables: NAT flushed successfully.");
						callback();
					}
				});
			},
			function(callback){
				var cmd = "\
					iptables -t nat -A PREROUTING -p tcp -d 217.146.67.170 --dport 80 -j REDIRECT --to-port 9080; \
					iptables -t nat -A PREROUTING -p tcp -d 217.146.67.170 --dport 443 -j REDIRECT --to-port 9443; \
					iptables -t nat -A PREROUTING -p tcp -d 217.146.76.229 --dport 80 -j REDIRECT --to-port 8080; \
					iptables -t nat -A PREROUTING -p tcp -d 217.146.76.229 --dport 443 -j REDIRECT --to-port 8443 \
				";

				exec(cmd, function (error, stdout, stderr) {
					if (error !== null) {
						console.log(error.message);
						throw error;
					} else {
						console.log("Iptables: NAT rules created successfully.");
						callback();
					}
				});
			},
			function(callback){
				complete();
			},
	]);
});

/**
 * Copies the files to builds/buildID folder.
 */
task("copy-files", [], function () {
	var async = require("async"),
			exec =  require("child_process").exec;

	async.series([
			function(callback){
				exec("rsync -a --exclude-from .jake_rsync_exclude . " + buildPath, function (error, stdout, stderr) {
					if (error !== null) {
						console.log(error.message);
						throw error;
					} else {
						console.log("Files copied successfully.");
						callback();
					}
				});
			},
			function(callback){
				exec("ln -s " + __dirname + "/images " + buildPath + "/images", function (error, stdout, stderr) {
					if (error !== null) {
						console.log(error.message);
						throw error;
					} else {
						console.log("Images folder symlinked successfully.");
						callback();
					}
				});
			},
			function(callback){
				exec("ln -sf " + buildPath + " " + buildRoot + "current", function (error, stdout, stderr) {
					if (error !== null) {
						console.log(error.message);
						throw error;
					} else {
						console.log("Build linked to current symlink successfully.");
						callback();
					}
				});
			},
			function(callback){
				complete();
			},
	]);
}, true);

task("reset", [], function() {
	var fs = require("fs");
	var pagetty = require(__dirname + "/lib/pagetty.js");
	var logger = require(__dirname + "/lib/logger.js");
	var sanitize = require('validator').sanitize;

	var channels = [
		//{url: "http://www.postimees.ee/", type: "html", domain: "www.postimees.ee", name: "Postimees"},
		{url: "http://feeds.feedburner.com/SitepointFeed", type: "rss", name: "Sitepoint RSS"},
		{url: "http://rss1.smashingmagazine.com/feed/", type: "rss", name: "Smashing Magazine RSS"},
		{url: "http://feeds.feedburner.com/Techcrunch", type: "rss", name: "TechCrunch RSS"},
		{url: "http://feeds.feedburner.com/tehnokratt/pets", type: "rss", name: "Tehnokratt RSS"},
		{url: "http://feeds2.feedburner.com/webdesignerdepot", type: "rss", name: "Webdesigner Depot RSS"},
		{url: "http://blog.zone.ee/feed/", type: "rss", name: "Zone RSS"},
		{url: "http://feeds.feedburner.com/HighScalability", type: "rss", name: "High Scalability RSS"},
		{url: "http://feeds.feedburner.com/24thfloor", type: "rss", name: "Hongkiat RSS"},
		{url: "http://feeds.mashable.com/Mashable", type: "rss", name: "Mashable RSS"},
		{url: "http://syndication.thedailywtf.com/TheDailyWtf", type: "rss", name: "DailyWTF RSS"},
		{url: "http://www.awwwards.com/feed?post_type=award", type: "rss", name: "Awwwards RSS"},
		{url: "http://feeds.feedburner.com/UXM", type: "rss", name: "UXMag RSS"},
		{url: "http://nodebits.org/feed.xml", type: "rss", name: "NodeBits RSS"},
		{url: "http://www.anandtech.com/rss", type: "rss", name: "AnandTech RSS"},
		{url: "http://www.alistapart.com/site/rss", type: "rss", name: "Alistapart RSS"},
		{url: "http://feeds.feedburner.com/ADMinteractiveBlog", type: "rss", name: "ADM RSS"},
		{url: "http://feeds.feedburner.com/ArcticStartup", type: "rss", name: "Arctic Startup RSS"},
		{url: "http://feeds.feedburner.com/codinghorror/", type: "rss", name: "Coding Horror RSS"},
		{url: "http://buytaert.net/rss.xml", type: "rss", name: "Dries Personal Blog RSS"},
		{url: "http://drupal.ee/rss.xml", type: "rss", name: "Drupal.ee RSS"},
		{url: "http://drupal.org/taxonomy/term/8/0/feed", type: "rss", name: "Drupal.org News RSS"},
		{url: "http://drupal.org/security/rss.xml", type: "rss", name: "Drupal.org Security RSS"},
		{url: "http://drupal.org/planet/rss.xml", type: "rss", name: "Drupal.org aggregator RSS"},
		{url: "http://feeds.feedburner.com/dtblogi", type: "rss", name: "DT Blogi RSS"},
		{url: "http://feeds.feedburner.com/blogspot/amDG", type: "rss", name: "Google Webmaster Central RSS"},
		{url: "http://feeds.feedburner.com/ILoveTypography", type: "rss", name: "I love typography RSS"},
		{url: "http://feeds.feedburner.com/JohnResig", type: "rss", name: "John Resig RSS"},
		{url: "http://www.pilveraal.ee/feeds/posts/default?alt=rss", type: "rss", name: "Märt Ridala RSS"},
		{url: "http://feeds2.feedburner.com/nettuts", type: "rss", name: "NetTuts RSS"},
		{url: "http://feeds2.feedburner.com/OkiaBlogi?format=xml", type: "rss", name: "OKIA Blogi RSS"},
		{url: "http://feeds.feedburner.com/orderedlist", type: "rss", name: "Ordered List RSS"},
		{url: "http://feeds.feedburner.com/Inspireux", type: "rss", name: "InspireUX RSS"}
	];

	var rules = [{
		url: "http://www.postimees.ee/",
		domain: "www.postimees.ee",
		target: {selector: "a.uudise_pealkiri", url_attribute: "href", title_attribute: false},
		score: {selector: "a.komm_arv_link", url_attribute: "href", value_attribute: false},
		image: {selector: "img.uudispilt", url_attribute: "src"}}
	];

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
					pagetty.createChannel(channels[i], function(err, channel){
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
/*
				for (var i in rules) {
					pagetty.createRule(rules[i], function(){});
				}
*/
			});
		});
	});
		/*
		{name: "Postimees", url: "http://postimees.ee", profile: "postimees"},
		{name: "Õhtuleht", url: "http://ohtuleht.ee", profile: "ohtuleht"},
		{name: "TechCrunch", url: "http://techcrunch.com", profile: "techcrunch"},
		{name: "AnandTech", url: "http://www.anandtech.com", profile: "anandtech"},
		{name: "EnglishRussia", url: "http://englishrussia.com", profile: "englishrussia"},
		{name: "500px - Popular", url: "http://500px.com/popular", profile: "soopx"},
		{name: "Reddit Top", url: "http://reddit.com/top", profile: "reddit"},
		//{name: "Reddit - Gaming", url: "http://reddit.com/r/gaming", profile: "reddit"},
		{name: "Failblog", url: "http://failblog.org", profile: "failblog"},
		{name: "Smashing Magazone", url: "http://www.smashingmagazine.com/", profile: "smashingmagazine"},
		{name: "DailyJS", url: "http://dailyjs.com/", profile: "dailyjs"},
		{name: "Mashable", url: "http://mashable.com", profile: "mashable"},
		{name: "ReddPics", url: "http://reddpics.com/", profile: "reddpics"},
		{name: "Slashdot", url: "http://slashdot.org/", profile: "slashdot"},
		{name: "Planet node.js", url: "http://planetnodejs.com/", profile: "planetnodejs"},
		{name: "Youtube - most viewed today in Science", url: "http://www.youtube.com/charts/videos_views/science", profile: "youtube"},
		*/

	/*
	var created_profiles = {};

	var profiles = {
		delfi: {domain: "www.delfi.ee", rules: [{
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
			image_selector: "img.uudispilt", image_attribute: "src",
			score_selector: "a.komm_arv_link", score_attribute: false,
			score_target_selector: "a.komm_arv_link", score_target_attribute: "href",
			target_selector: "a.uudise_pealkiri", target_attribute: "href",
			title_selector: "a.uudise_pealkiri", title_attribute: false}
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
	*/

});

function createBuildID() {
	var dateFormat = require('dateformat');
	return dateFormat(new Date, "yyyy.mm.dd-HH:MM:ss");
}
