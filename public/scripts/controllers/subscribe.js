require([
  "pagetty",
  "text!templates/option.html",
	"handlebars",
], function(pagetty, optionTemplate) {

	Controller = {
		init: function() {
			$(".subscribe-form").bind("submit", Controller.subscribe);
		},
		subscribe: function() {
			$.ajax("/subscribe/options", {
				type: "POST",
				data: {url: $(".url").val()},
				dataType: "json",
				success: function(res) {
					if (res.status == "options") {
						Controller.displayOptions(res);
					}
					else if (res.status == "subscribed") {
						window.location = "/";
					}
					else {
						pagetty.error("Unknown error.");
					}
				},
				error: function(xhr, status, error) {
					pagetty.error(xhr.responseText);
				},
				beforeSend: pagetty.showProgress,
				complete: pagetty.hideProgress
			});

			return false;
		},
		displayOptions: function(res) {
			var option = Handlebars.compile(optionTemplate);

			if (res.options.length) {
				$(".options tbody").html("");

				for (var i in res.options) {
					$(".options tbody").append(option(res.options[i]));
				}
			}

			$(".btn-subscribe-custom").attr("href", "/subscribe?url=" + res.url);
		}
	};

	$(document).ready(function() {
		Controller.init();
	});

});
