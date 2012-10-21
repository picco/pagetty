require([
  'pagetty',
  'datatables'
], function(pagetty) {

Controller = {
  init: function() {
    $(".subscribe-form").bind("submit", Controller.subscribe);
    $(".btn-channel-subscribe").bind("click", Controller.channelSubscribe);
    $(".btn-channel-unsubscribe").bind("click", Controller.channelUnSubscribe);

    /* Default class modification */
    $.extend( $.fn.dataTableExt.oStdClasses, {
    	"sSortAsc": "header headerSortDown",
			"sSortDesc": "header headerSortUp",
			"sSortable": "header"
		});

    /* API method to get paging information */
		$.fn.dataTableExt.oApi.fnPagingInfo = function ( oSettings ) {
				return {
					"iStart":         oSettings._iDisplayStart,
					"iEnd":           oSettings.fnDisplayEnd(),
					"iLength":        oSettings._iDisplayLength,
					"iTotal":         oSettings.fnRecordsTotal(),
					"iFilteredTotal": oSettings.fnRecordsDisplay(),
					"iPage":          Math.ceil( oSettings._iDisplayStart / oSettings._iDisplayLength ),
					"iTotalPages":    Math.ceil( oSettings.fnRecordsDisplay() / oSettings._iDisplayLength )
				};
			}

    $.extend( $.fn.dataTableExt.oPagination, {
				"bootstrap": {
					"fnInit": function( oSettings, nPaging, fnDraw ) {
						var oLang = oSettings.oLanguage.oPaginate;
						var fnClickHandler = function ( e ) {
							e.preventDefault();
							if ( oSettings.oApi._fnPageChange(oSettings, e.data.action) ) {
								fnDraw( oSettings );
							}
						};

						$(nPaging).addClass('pagination').append(
							'<ul>'+
								'<li class="prev disabled"><a href="#">&larr; '+oLang.sPrevious+'</a></li>'+
								'<li class="next disabled"><a href="#">'+oLang.sNext+' &rarr; </a></li>'+
							'</ul>'
						);
						var els = $('a', nPaging);
						$(els[0]).bind( 'click.DT', { action: "previous" }, fnClickHandler );
						$(els[1]).bind( 'click.DT', { action: "next" }, fnClickHandler );
					},

					"fnUpdate": function ( oSettings, fnDraw ) {
						var iListLength = 5;
						var oPaging = oSettings.oInstance.fnPagingInfo();
						var an = oSettings.aanFeatures.p;
						var i, j, sClass, iStart, iEnd, iHalf=Math.floor(iListLength/2);

						if ( oPaging.iTotalPages < iListLength) {
							iStart = 1;
							iEnd = oPaging.iTotalPages;
						}
						else if ( oPaging.iPage <= iHalf ) {
							iStart = 1;
							iEnd = iListLength;
						} else if ( oPaging.iPage >= (oPaging.iTotalPages-iHalf) ) {
							iStart = oPaging.iTotalPages - iListLength + 1;
							iEnd = oPaging.iTotalPages;
						} else {
							iStart = oPaging.iPage - iHalf + 1;
							iEnd = iStart + iListLength - 1;
						}

						for ( i=0, iLen=an.length ; i<iLen ; i++ ) {
							// Remove the middle elements
							$('li:gt(0)', an[i]).filter(':not(:last)').remove();

							// Add the new list items and their event handlers
							for ( j=iStart ; j<=iEnd ; j++ ) {
								sClass = (j==oPaging.iPage+1) ? 'class="active"' : '';
								$('<li '+sClass+'><a href="#">'+j+'</a></li>')
									.insertBefore( $('li:last', an[i])[0] )
									.bind('click', function (e) {
										e.preventDefault();
										oSettings._iDisplayStart = (parseInt($('a', this).text(),10)-1) * oPaging.iLength;
										fnDraw( oSettings );
									} );
							}

							// Add / remove disabled classes from the static elements
							if ( oPaging.iPage === 0 ) {
								$('li:first', an[i]).addClass('disabled');
							} else {
								$('li:first', an[i]).removeClass('disabled');
							}

							if ( oPaging.iPage === oPaging.iTotalPages-1 || oPaging.iTotalPages === 0 ) {
								$('li:last', an[i]).addClass('disabled');
							} else {
								$('li:last', an[i]).removeClass('disabled');
							}
						}
					}
				}
			} );

    $('.channels').dataTable({
      "sDom": "<'row'<'span4'<'pull-left'f>><'span12'<'pull-right'p>>><'row'<'span16't>>",
			"sPaginationType": "bootstrap",
      "aaSorting": [[1, "desc"], [0, "asc"]]
		});
  },
  subscribe: function() {
      $.ajax("/subscribe", {
        type: "POST",
        data: {url: $(".subscribe-url").val(), name: $(".subscribe-name").val()},
        dataType: "json",
        success: function(data) {
          window.location = data.item_count ? ("/channel/" + data.channel_id) : ("/channel/" + data.channel_id + "/configure?empty");
        },
        error: function(xhr, status, error) {
          pagetty.error(xhr.responseText);
        },
        beforeSend: pagetty.showProgress,
        complete: pagetty.hideProgress
      });

    return false;
  },
  channelSubscribe: function() {
    var channel_id = $(this).data('channel');

    $.ajax("/subscribe/channel", {
      type: "POST",
      data: {channel_id: channel_id},
      success: function(data) {
        $('.channel-' + channel_id).removeClass('status-not-subscribed').addClass('status-subscribed');
      },
      error: function(xhr, status, error) {
        alert(xhr.responseText);
      }
    });

    return false;
  },
  channelUnSubscribe: function() {
    var channel_id = $(this).data('channel');

    $.ajax("/unsubscribe", {
      type: "POST",
      data: {channel_id: channel_id},
      success: function(data) {
        $('.channel-' + channel_id).removeClass('status-subscribed').addClass('status-not-subscribed');
      },
      error: function(xhr, status, error) {
        alert(xhr.responseText);
      }
    });

    return false;
  }
};

$(document).ready(function() {
  Controller.init();
});

});
