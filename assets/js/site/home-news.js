/*
 * Home page, news block (one slide of the deck). The rows arrive when the slide does: a beat after the stepper starts
 * the move toward it (kit:snap-change), or when the block is first seen where the stepper does not run (touch, portrait,
 * narrow screens, reduced motion). Once only. The rows' own behaviour comes from the kits in the markup; the featured
 * row is news-feature's.
 */
(function () {
  "use strict";

  var Site = window.Site;
  if (!Site) return;
  // Own value (ms after the move begins): a one-screen move takes about 950 ms on an in-out curve; at 520 ms the slide
  // is more than half in, so the rows rise on screen as it lands (measured: at 360 ms they had arrived off screen).
  var LEAD = 520;
  // Own value: share of the list in view that starts the entrance without the stepper.
  var SEEN = 0.35;

  Site.ready(function () {
    var section = document.querySelector(".hnews");
    var body = section && section.querySelector(".hnews__body");
    if (!body) return;
    var played = false;
    var timer = 0;
    var io = null;

    function play() {
      if (played) return;
      played = true;
      clearTimeout(timer);
      if (io) io.disconnect();
      var group = Site.get(body, "reveal-group");
      if (group && group.play) group.play();
    }

    section.addEventListener("kit:snap-change", function () {
      if (played || timer) return;
      timer = setTimeout(play, Site.env.reduce ? 0 : LEAD * Site.tempo);
    });
    section.addEventListener("kit:snap-arrive", play);

    if (window.IntersectionObserver) {
      io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            // with the stepper the move's own event leads; this catches scrolls it did not make
            if (e.isIntersecting && !(document.documentElement.classList.contains("is-snapping") && timer)) play();
          });
        },
        { threshold: SEEN },
      );
      io.observe(body);
    } else play();
  });
})();
