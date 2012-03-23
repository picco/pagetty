$(document).ready(function(){

    var _offsetY = 0,
    _startY = 0,
    scrollStep = 10,
    isScrollBarClick = false,
    contentDiv,
    scrubber,
    scrollHeight,
    contentHeight,
    scrollFaceHeight,
    initPosition,
    initContentPos,
    moveVal,
    scrubberY = 0;

    element = document.getElementById("updateHolder");
    if (element.addEventListener)
        /** DOMMouseScroll is for mozilla. */
        element.addEventListener('DOMMouseScroll', wheel, false);
    /** IE/Opera. */
    element.onmousewheel = document.onmousewheel = wheel;

    // To resize the height of the scroll scrubber when scroll height increases.
    setScrubberHeight();

    contentDiv = document.getElementById('updateContainer');

    scrubber = $('#updateScollScrubber');

    scrollHeight = $('#updateScollBar').outerHeight();

    contentHeight = $('#updateContent').outerHeight();

    scrollFaceHeight = scrubber.outerHeight();

    initPosition = 0;

    initContentPos = $('#updateHolder').offset().top;

    // Calculate the movement ration with content height and scrollbar height
    moveVal = (contentHeight - scrollHeight)/(scrollHeight - scrollFaceHeight);

    $('#updateHolder').bind('mousewheel', wheel);

    $("#updateScollScrubber").mouseover(function() {
        // Enable Scrollbar only when the content height is greater then the view port area.
        isScrollBarClick = false;
        if(contentHeight > scrollHeight) {
            // Show scrollbar on mouse over
            $(this).animate({opacity: 1});
            scrubber.bind("mousedown", onMouseDown);
        }
    }).mouseout(function() {
        isScrollBarClick = false;
        if(contentHeight > scrollHeight) {
            // Hide Scrollbar on mouse out.
            $(this).animate({opacity: 0.25});
            $('#updateHolder').unbind("mousemove", onMouseMove);
            scrubber.unbind("mousedown", onMouseDown);
        }
    });

    $("#updateScollBar").mousedown(function(){
        isScrollBarClick = true;
    }).mouseout(function(){
        isScrollBarClick = false;
    }).mouseup(function(event) {
        if( isScrollBarClick == false )
             return;
        if ((event.pageY - initContentPos) > (scrollHeight - scrubber.outerHeight())) {
            scrubber.css({top: (scrollHeight - scrubber.outerHeight())});
        }else{
            scrubber.css({top: (event.pageY - initContentPos) - 5});
        }
        $('#updateContent').css({top: ((initContentPos - scrubber.offset().top) * moveVal)});
    });

    function onMouseDown(event) {
        $('#updateHolder').bind("mousemove", onMouseMove);
        $('#updateHolder').bind("mouseup", onMouseUp);
        _offsetY = scrubber.offset().top;
        _startY = event.pageY + initContentPos;
        // Disable the text selection inside the update area. Otherwise the text will be selected while dragging on the scrollbar.
        contentDiv.onselectstart = function () { return false; } // ie
        contentDiv.onmousedown = function () { return false; } // mozilla
    }

    function onMouseMove(event) {

        isScrollBarClick = false;
        // Checking the upper and bottom limit of the scroll area
        if((scrubber.offset().top >= initContentPos) && (scrubber.offset().top  (initContentPos + scrollHeight - scrollFaceHeight)) {
                scrubber.css({top: (scrollHeight-scrollFaceHeight-2)});
                $('#updateContent').css({top: (scrollHeight - contentHeight + initPosition)});
            }
            $('#updateHolder').trigger('mouseup');
        }
    }

    function onMouseUp(event) {
        $('#updateHolder').unbind("mousemove", onMouseMove);
        contentDiv.onselectstart = function () { return true; } // ie
        contentDiv.onmousedown = function () { return true; } // mozilla
    }

    function setScrubberHeight() {
        cH = $('#updateContent').outerHeight();
        sH = $('#updateScollBar').outerHeight();
        if(cH > sH) {
            // Set the min height of the scroll scrubber to 20
            if(sH / ( cH / sH ) < 20) {              $('#updateScollScrubber').css({height: 20 });           }else{              $('#updateScollScrubber').css({height: sH / ( cH / sH ) });             }       }   }   function onMouseWheel(dir) {         scrubberY = scrubber.offset().top + (scrollStep * dir) - initContentPos;         if ((scrubberY) > (scrollHeight - scrubber.outerHeight())) {
            scrubber.css({top: (scrollHeight - scrubber.outerHeight())});
        }else {
            if(scrubberY < 0) scrubberY = 0;
            scrubber.css({top: scrubberY});
        }
        $('#updateContent').css({top: ((initContentPos - scrubber.offset().top) * moveVal)});
    }

    /** This is high-level function.
     * It must react to delta being more/less than zero.
     */
    function handle(delta) {
            if (delta < 0) {
                onMouseWheel(1);
            }
            else {
                onMouseWheel(-1);
            }
    }

    /** Event handler for mouse wheel event.
     */
    function wheel(event){
            var delta = 0;
            if (!event) /* For IE. */
                    event = window.event;
            if (event.wheelDelta) { /* IE/Opera. */
                    delta = event.wheelDelta/120;
            } else if (event.detail) { /** Mozilla case. */
                    /** In Mozilla, sign of delta is different than in IE.
                     * Also, delta is multiple of 3.
                     */
                    delta = -event.detail/3;
            }
            /** If delta is nonzero, handle it.
             * Basically, delta is now positive if wheel was scrolled up,
             * and negative, if wheel was scrolled down.
             */
            if (delta)
                    handle(delta);
            /** Prevent default actions caused by mouse wheel.
             * That might be ugly, but we handle scrolls somehow
             * anyway, so don't bother here..
             */
            if (event.preventDefault)
                    event.preventDefault();
            event.returnValue = false;
    }

});