require([
  "pagetty",
  "text!templates/option.html",
	"handlebars",
], function(pagetty, optionTemplate) {

	Controller = {
		init: function() {
			$('.url').focus();
			$(".subscribe-form").bind("submit", Controller.subscribeOptions);
			$(document).on("click", ".btn-subscribe", Controller.subscribe);
		},
		subscribeOptions: function() {
			$.ajax("/subscribe/options", {
				type: "POST",
				data: {url: $(".url").val(), _csrf: _csrf},
				dataType: "json",
				success: function(res) {
					if (res.status == "options") {
						Controller.displayOptions(res);
					}
					else if (res.status == "subscribed") {
						window.location = "/list/" + res.list_id;
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
		subscribe: function(e) {
			e.preventDefault();
			
			$.ajax("/subscribe", {
				type: "POST",
				data: {url: $(this).data("url"), _csrf: _csrf},
				dataType: "json",
				success: function(res) {
					window.location = "/list/" + res.list_id;
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

			pagetty.clearMessages();

			if (res.options.length) {
				$(".options tbody").html("");

				for (var i in res.options) {
					$(".options tbody").append(option(res.options[i]));
				}
			}
			else {
				$(".options tbody").html('<tr><td colspan="3">No RSS feeds found.</td></tr>');
			}

			$(".btn-subscribe-custom").data("url", res.url);
			$(".options").show();
		}
	};

	$(document).ready(function() {
		Controller.init();
	});

});
