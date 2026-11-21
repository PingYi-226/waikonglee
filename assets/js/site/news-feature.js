/*
 * A featured news item (news_feature.liquid): the row and its detail view.
 *   - the days left until the deadline are written into the view before it is first opened (none once it has passed)
 *   - when the view opens, its inside follows the panel a beat later: the text rises word by word, the days roll,
 *     the topics come in one after another, the buttons are wiped in
 * The row's own motion is the kits' (expand, hover-fill, press, shine-text) and news-feature.css.
 */
(function () {
  "use strict";

  var Site = window.Site;
  if (!Site) return;
  var DAY = 86400000;
  // after the panel starts to grow (ms): the text, the days, the topics, the buttons. Own values, tuned on films:
  // the text starts while the panel is still landing, the rest follows the view's own blocks (120 ms + 70 ms apart).
  var AT = { text: 160, days: 380, topics: 420, buttons: 560 };

  function all(scope, selector) {
    return Array.prototype.slice.call(scope.querySelectorAll(selector));
  }

  /* days left until the end of the deadline's day (the advisor's time zone, +08:00); null once it has passed */
  function daysLeft(iso) {
    var end = Date.parse(iso + "T23:59:59+08:00");
    if (isNaN(end)) return null;
    var left = Math.ceil((end - Date.now()) / DAY);
    return left > 0 ? left : null;
  }

  function prepare(trigger) {
    var ref = trigger.getAttribute("data-expand");
    var tpl = ref ? document.querySelector(ref) : null;
    if (!tpl || !tpl.content) return;
    var left = tpl.content.querySelector(".nfv__left");
    var days = tpl.content.querySelector(".nfv__days");
    var unit = tpl.content.querySelector(".nfv__unit");
    var n = daysLeft(trigger.getAttribute("data-deadline") || "");
    if (!left || !days || n == null) return;
    days.textContent = String(n);
    days.setAttribute("data-value", String(n));
    if (unit) unit.textContent = n === 1 ? "day" : "days";
    left.hidden = false;
  }

  Site.ready(function () {
    all(document, ".nfeat[data-expand]").forEach(prepare);
  });

  /* the view's inside, a beat after the panel */
  var timers = [];
  function later(ms, fn) {
    if (Site.env.static || Site.env.reduce) fn();
    else timers.push(setTimeout(fn, ms * Site.tempo));
  }
  function clear() {
    timers.forEach(clearTimeout);
    timers = [];
  }
  function play(el, kit) {
    var c = el ? Site.get(el, kit) : null;
    if (c && c.play) c.play();
  }

  document.addEventListener("kit:expand-open", function (e) {
    var trigger = e.target;
    if (!trigger.classList || !trigger.classList.contains("nfeat")) return;
    var body = e.detail && e.detail.body;
    if (!body) return;
    clear();
    later(AT.text, function () {
      play(body.querySelector(".nfv__text"), "split");
    });
    later(AT.days, function () {
      play(body.querySelector(".nfv__days"), "sliding-number");
    });
    later(AT.topics, function () {
      play(body.querySelector(".nfv__topics"), "reveal-group");
    });
    all(body, ".nfv__actions .btn").forEach(function (btn, i) {
      later(AT.buttons + i * 90, function () {
        play(btn, "reveal");
      });
    });
  });
  document.addEventListener("kit:expand-close", function (e) {
    if (e.target.classList && e.target.classList.contains("nfeat")) clear();
  });
})();
