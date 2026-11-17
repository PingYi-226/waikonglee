/* The test page of the diagram kit (/kit/diagrams/): replay, reset and pause buttons beside each plate. */
(function () {
  "use strict";
  var Site = window.Site;
  if (!Site) return;
  Site.ready(function () {
    Array.prototype.forEach.call(document.querySelectorAll("[data-dg-act]"), function (b) {
      b.addEventListener("click", function () {
        var row = b.closest(".dgdemo__row");
        var svg = row && row.querySelector("svg.diagram");
        var d = svg && Site.get(svg, "diagram");
        if (!d) return;
        var act = b.getAttribute("data-dg-act");
        if (act === "play") d.play();
        else if (act === "reset") d.reset();
        else {
          var on = b.getAttribute("aria-pressed") !== "true";
          b.setAttribute("aria-pressed", String(on));
          d.live(on);
        }
      });
    });
  });
})();
