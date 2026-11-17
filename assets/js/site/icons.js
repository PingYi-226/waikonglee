---
# Jekyll renders this file so that the drawings below come from _includes/site/icon.liquid (one source for both).
---
/*
 * Icons: the hover / focus animations of the inline icons, and Site.icons for pages.
 *
 *   Site.icons.html(name, { size, class })   the SVG markup of an icon (the same drawing as icon.liquid)
 *   Site.icons.swap(container, name, { spin }) swap the icon shown inside an element for another, in place
 *
 * An icon animates when its closest a / button / [data-icon-trigger] is hovered (hover-capable fine pointers)
 * or gets keyboard focus. This file only says when: it puts .is-hot on the svg while that lasts and .is-play
 * for one gesture, taken off when the gesture's animations have finished (so a gesture always plays through,
 * and hovering again while it plays does not restart it). How each icon moves is in icons.css.
 */
(function () {
  "use strict";

  const S = window.Site;
  if (!S) return;
  const M = window.Motion;
  const TRIGGER = "a, button, [data-icon-trigger]";

  /* the drawings, rendered at build time from _includes/site/icon.liquid */
  const SVG = {
    {%- assign icon_names = "arrow-right,arrow-up-right,external,arrow-down,arrow-up,chevron-down,chevron-right,copy,check,search,menu,close,sun,moon,mail,github,scholar,orcid,scopus,download,file-text,code,quote,link,map-pin,clock,plus,minus,play,pause,zoom" | split: "," -%}
    {%- for icon_name in icon_names -%}
      {%- capture icon_svg -%}{% include site/icon.liquid name=icon_name %}{%- endcapture %}
    {{ icon_name | jsonify }}: {{ icon_svg | strip_newlines | jsonify }},
    {%- endfor %}
  };

  /* ------------------------------------------------------------ hot icons */
  const sources = new WeakMap(); // svg -> number of things keeping it hot (pointer, focus)

  /** The icons whose closest trigger is this one (an icon inside a nested button belongs to that button). */
  function iconsOf(trigger) {
    const all = trigger.querySelectorAll("svg.icon");
    const out = [];
    for (let i = 0; i < all.length; i++) {
      const p = all[i].parentElement;
      if (p && p.closest(TRIGGER) === trigger) out.push(all[i]);
    }
    if (trigger.matches("svg.icon")) out.push(trigger);
    return out;
  }

  function play(svg) {
    if (svg.classList.contains("is-play") || !svg.getAnimations) return;
    svg.classList.add("is-play");
    const anims = svg.getAnimations({ subtree: true }).filter((a) => typeof CSSAnimation === "undefined" || a instanceof CSSAnimation);
    if (!anims.length) {
      svg.classList.remove("is-play");
      return;
    }
    Promise.all(anims.map((a) => a.finished.catch(() => {}))).then(() => svg.classList.remove("is-play"));
  }

  function heat(svg, on) {
    const n = Math.max(0, (sources.get(svg) || 0) + (on ? 1 : -1));
    sources.set(svg, n);
    if (n > 0 && !svg.classList.contains("is-hot")) {
      svg.classList.add("is-hot");
      play(svg);
    } else if (n === 0) svg.classList.remove("is-hot");
  }

  /** The triggers around a node, innermost first. */
  function chain(node) {
    const out = [];
    let t = node && node.closest ? node.closest(TRIGGER) : null;
    while (t) {
      out.push(t);
      t = t.parentElement ? t.parentElement.closest(TRIGGER) : null;
    }
    return out;
  }

  function track() {
    let lit = [];
    return function (next) {
      lit.forEach((t) => {
        if (next.indexOf(t) < 0) iconsOf(t).forEach((svg) => heat(svg, false));
      });
      next.forEach((t) => {
        if (lit.indexOf(t) < 0) iconsOf(t).forEach((svg) => heat(svg, true));
      });
      lit = next;
    };
  }
  const byPointer = track();
  const byFocus = track();

  // hover: only fine pointers that can hover (rules A3); reduced motion leaves icons at rest
  document.addEventListener(
    "pointerover",
    (e) => {
      if (!S.env.hover || e.pointerType === "touch" || S.env.reduce) return;
      byPointer(chain(e.target));
    },
    true,
  );
  document.addEventListener("pointerout", (e) => {
    if (!e.relatedTarget) byPointer([]);
  });
  // focus: the keyboard animates like the pointer (rules A2)
  document.addEventListener("focusin", (e) => {
    let visible = false;
    try {
      visible = e.target.matches(":focus-visible");
    } catch (err) {
      visible = true;
    }
    byFocus(visible && !S.env.reduce ? chain(e.target) : []);
  });
  document.addEventListener("focusout", (e) => {
    if (!e.relatedTarget) byFocus([]);
  });

  /* ------------------------------------------------------------- Site.icons */
  function html(name, o) {
    let s = SVG[name];
    if (!s) return "";
    o = o || {};
    if (o.class) s = s.replace('class="icon icon--' + name + '"', 'class="icon icon--' + name + " " + o.class + '"');
    if (o.size != null) {
      const css = /^[\d.]+$/.test(String(o.size)) ? o.size + "px" : String(o.size);
      s = s.replace("<svg ", '<svg style="--icon-size:' + css + '" ');
    }
    return s;
  }

  function fromHTML(markup) {
    const t = document.createElement("template");
    t.innerHTML = markup;
    return t.content.firstElementChild;
  }

  /**
   * Swap the icon shown inside container for another one, in place (recipes/swap.md): the old one leaves to
   * scale.icon into blur.icon while the next one comes out of them, on transition.swap; with { spin: true } both
   * also turn rotate.icon the same way, on transition.spin. The next icon keeps the old one's size and extra
   * classes. Reduced motion keeps the fade and the blur. Returns a promise for the end of the swap.
   */
  function swap(container, name, o) {
    o = o || {};
    // the container is the icon's parent; given an element further out, use the parent of the icon inside it
    if (!Array.prototype.some.call(container.children, (c) => c.matches("svg.icon"))) {
      const inner = container.querySelector("svg.icon");
      if (inner) container = inner.parentElement;
    }
    const old = Array.prototype.filter.call(container.children, (c) => c.matches("svg.icon") && !c.classList.contains("is-leaving"));
    const prev = old[old.length - 1];
    if (prev && prev.classList.contains("icon--" + name)) return Promise.resolve();
    const next = fromHTML(SVG[name] || "");
    if (!next) return Promise.resolve();
    if (prev) {
      // keep the old icon's size and its extra classes
      const keep = Array.prototype.filter.call(prev.classList, (c) => c !== "icon" && c.indexOf("icon--") !== 0 && c.indexOf("is-") !== 0);
      keep.forEach((c) => next.classList.add(c));
      const size = prev.style.getPropertyValue("--icon-size");
      if (size) next.style.setProperty("--icon-size", size);
      ["width", "height"].forEach((a) => next.setAttribute(a, prev.getAttribute(a) || "24"));
    }
    const reduce = S.env.reduce;
    const spin = !!o.spin;
    const t = S.t(spin ? "transition.spin" : "transition.swap");
    const turn = spin && !reduce ? S.tokens.rotate.icon : 0;
    const sc = reduce ? 1 : S.tokens.scale.icon;
    const blur = "blur(" + S.tokens.blur.icon + "px)";
    const away = (deg) => "rotate(" + deg + "deg) scale(" + sc + ")";

    if (getComputedStyle(container).position === "static") container.style.position = "relative";
    const box = container.getBoundingClientRect();
    old.forEach((svg) => {
      // the leaving icon stops taking space and stays exactly where it is (AnimatePresence popLayout)
      const r = svg.getBoundingClientRect();
      svg.classList.add("is-leaving");
      svg.style.left = r.left - box.left - container.clientLeft + "px";
      svg.style.top = r.top - box.top - container.clientTop + "px";
      svg.classList.remove("is-hot", "is-play");
    });
    container.insertBefore(next, prev ? prev.nextSibling : null);
    if (prev && prev.classList.contains("is-hot")) next.classList.add("is-hot");

    if (S.env.static || !M) {
      old.forEach((svg) => svg.remove());
      return Promise.resolve();
    }
    old.forEach((svg) => {
      // no fixed first value: an icon caught mid-entrance leaves from where it is
      S.animate(svg, { opacity: 0, filter: blur, transform: away(turn) }, t).then(() => svg.remove());
    });
    const a = S.animate(next, { opacity: [0, 1], filter: [blur, "blur(0px)"], transform: [away(-turn), "rotate(0deg) scale(1)"] }, t);
    return Promise.resolve(a.finished || a).then(() => {
      // once Motion has committed the end state, the icon goes back to its stylesheet (no leftover transform)
      requestAnimationFrame(() => {
        if (next.classList.contains("is-leaving")) return;
        next.style.removeProperty("transform");
        next.style.removeProperty("filter");
        next.style.removeProperty("opacity");
      });
    });
  }

  S.icons = { html: html, swap: swap, names: Object.keys(SVG) };
})();
