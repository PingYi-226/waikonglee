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
    "arrow-right": "\u003csvg class=\"icon icon--arrow-right\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003cg class=\"k-i-a\"\u003e\u003cpath d=\"M5 12h14\"/\u003e\u003cpath d=\"m12 5 7 7-7 7\"/\u003e\u003c/g\u003e\u003c/svg\u003e",
    "arrow-up-right": "\u003csvg class=\"icon icon--arrow-up-right\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003cg class=\"k-i-a\"\u003e\u003cpath d=\"M7 7h10v10\"/\u003e\u003cpath d=\"M7 17 17 7\"/\u003e\u003c/g\u003e\u003c/svg\u003e",
    "external": "\u003csvg class=\"icon icon--external\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003cg class=\"k-i-a\"\u003e\u003cpath d=\"M7 7h10v10\"/\u003e\u003cpath d=\"M7 17 17 7\"/\u003e\u003c/g\u003e\u003c/svg\u003e",
    "arrow-down": "\u003csvg class=\"icon icon--arrow-down\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003cg class=\"k-i-a\"\u003e\u003cpath d=\"M12 5v14\"/\u003e\u003cpath d=\"m19 12-7 7-7-7\"/\u003e\u003c/g\u003e\u003c/svg\u003e",
    "arrow-up": "\u003csvg class=\"icon icon--arrow-up\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003cg class=\"k-i-a\"\u003e\u003cpath d=\"m5 12 7-7 7 7\"/\u003e\u003cpath d=\"M12 19V5\"/\u003e\u003c/g\u003e\u003c/svg\u003e",
    "chevron-down": "\u003csvg class=\"icon icon--chevron-down\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003cpath class=\"k-i-a\" d=\"m6 9 6 6 6-6\"/\u003e\u003c/svg\u003e",
    "chevron-right": "\u003csvg class=\"icon icon--chevron-right\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003cpath class=\"k-i-a\" d=\"m9 18 6-6-6-6\"/\u003e\u003c/svg\u003e",
    "copy": "\u003csvg class=\"icon icon--copy\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003crect class=\"k-i-front\" x=\"8\" y=\"8\" width=\"14\" height=\"14\" rx=\"2\"/\u003e\u003cpath class=\"k-i-back\" d=\"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2\"/\u003e\u003c/svg\u003e",
    "check": "\u003csvg class=\"icon icon--check\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003cpath class=\"k-i-a\" d=\"m4 12 5 5L20 6\" pathLength=\"1\"/\u003e\u003c/svg\u003e",
    "search": "\u003csvg class=\"icon icon--search\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003cg class=\"k-i-a\"\u003e\u003ccircle cx=\"11\" cy=\"11\" r=\"8\"/\u003e\u003cpath d=\"m21 21-4.35-4.35\"/\u003e\u003c/g\u003e\u003c/svg\u003e",
    "menu": "\u003csvg class=\"icon icon--menu\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003cpath class=\"k-i-l1\" d=\"M4 6h16\"/\u003e\u003cpath class=\"k-i-l2\" d=\"M4 12h16\"/\u003e\u003cpath class=\"k-i-l3\" d=\"M4 18h16\"/\u003e\u003c/svg\u003e",
    "close": "\u003csvg class=\"icon icon--close\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003cpath class=\"k-i-l1\" d=\"M18 6 6 18\"/\u003e\u003cpath class=\"k-i-l2\" d=\"m6 6 12 12\"/\u003e\u003c/svg\u003e",
    "sun": "\u003csvg class=\"icon icon--sun\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003ccircle class=\"k-i-core\" cx=\"12\" cy=\"12\" r=\"4\"/\u003e\u003cg class=\"k-i-rays\"\u003e\u003cpath d=\"M12 2v2\"/\u003e\u003cpath d=\"M12 20v2\"/\u003e\u003cpath d=\"m4.93 4.93 1.41 1.41\"/\u003e\u003cpath d=\"m17.66 17.66 1.41 1.41\"/\u003e\u003cpath d=\"M2 12h2\"/\u003e\u003cpath d=\"M20 12h2\"/\u003e\u003cpath d=\"m6.34 17.66-1.41 1.41\"/\u003e\u003cpath d=\"m19.07 4.93-1.41 1.41\"/\u003e\u003c/g\u003e\u003c/svg\u003e",
    "moon": "\u003csvg class=\"icon icon--moon\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003cpath class=\"k-i-a\" d=\"M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z\"/\u003e\u003c/svg\u003e",
    "mail": "\u003csvg class=\"icon icon--mail\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003cg class=\"k-i-a\"\u003e\u003cpath class=\"k-i-body\" d=\"M20 4c1.105 0 2 .895 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2l8 0a0 0 0 0 1 0 0l8 0Z\"/\u003e\u003cpath class=\"k-i-flap\" d=\"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7\"/\u003e\u003c/g\u003e\u003c/svg\u003e",
    "github": "\u003csvg class=\"icon icon--github\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003cpath d=\"M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4\"/\u003e\u003cpath class=\"k-i-tail\" d=\"M9 18c-4.51 2-5-2-7-2\"/\u003e\u003c/svg\u003e",
    "scholar": "\u003csvg class=\"icon icon--scholar\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003cpath class=\"k-i-board\" d=\"M21.42 10.92a1 1 0 0 0-.02-1.84L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.57 3.91a2 2 0 0 0 1.66 0z\"/\u003e\u003cpath d=\"M6 12.5V16a6 3 0 0 0 12 0v-3.5\"/\u003e\u003cpath class=\"k-i-tassel\" d=\"M22 10v6\"/\u003e\u003c/svg\u003e",
    "orcid": "\u003csvg class=\"icon icon--orcid\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003ccircle cx=\"12\" cy=\"12\" r=\"10\"/\u003e\u003cpath d=\"M8.5 10.5v6\"/\u003e\u003cpath class=\"k-i-dot\" d=\"M8.5 7.6v.01\"/\u003e\u003cpath class=\"k-i-d\" d=\"M12 10.5v6h1.5a3 3 0 0 0 0-6Z\"/\u003e\u003c/svg\u003e",
    "scopus": "\u003csvg class=\"icon icon--scopus\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003crect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"5\"/\u003e\u003cpath class=\"k-i-s\" d=\"M15 8.9C14.4 7.9 13.3 7.25 12 7.25c-1.8 0-3 .95-3 2.35 0 3.15 6.25 1.65 6.25 4.85 0 1.45-1.3 2.3-3.25 2.3-1.45 0-2.6-.55-3.25-1.6\" pathLength=\"1\"/\u003e\u003c/svg\u003e",
    "download": "\u003csvg class=\"icon icon--download\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003cg class=\"k-i-a\"\u003e\u003cpath d=\"M12 15V3\"/\u003e\u003cpath d=\"m7 10 5 5 5-5\"/\u003e\u003c/g\u003e\u003cpath d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/\u003e\u003c/svg\u003e",
    "file-text": "\u003csvg class=\"icon icon--file-text\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003cpath d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.7.7l3.6 3.6A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/\u003e\u003cpath d=\"M14 2v5a1 1 0 0 0 1 1h5\"/\u003e\u003cpath class=\"k-i-l1\" d=\"M8 9h2\" pathLength=\"1\"/\u003e\u003cpath class=\"k-i-l2\" d=\"M8 13h8\" pathLength=\"1\"/\u003e\u003cpath class=\"k-i-l3\" d=\"M8 17h8\" pathLength=\"1\"/\u003e\u003c/svg\u003e",
    "code": "\u003csvg class=\"icon icon--code\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003cpath class=\"k-i-r\" d=\"m16 18 6-6-6-6\"/\u003e\u003cpath class=\"k-i-l\" d=\"m8 6-6 6 6 6\"/\u003e\u003c/svg\u003e",
    "quote": "\u003csvg class=\"icon icon--quote\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003cpath class=\"k-i-q1\" d=\"M10 11H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v6c0 2.67-1.33 4.33-4 5\"/\u003e\u003cpath class=\"k-i-q2\" d=\"M19 11h-4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v6c0 2.67-1.33 4.33-4 5\"/\u003e\u003c/svg\u003e",
    "link": "\u003csvg class=\"icon icon--link\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003cpath class=\"k-i-l1\" d=\"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71\"/\u003e\u003cpath class=\"k-i-l2\" d=\"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71\"/\u003e\u003c/svg\u003e",
    "map-pin": "\u003csvg class=\"icon icon--map-pin\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003cg class=\"k-i-a\"\u003e\u003cpath d=\"M20 10c0 4.99-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0\"/\u003e\u003ccircle cx=\"12\" cy=\"10\" r=\"3\"/\u003e\u003c/g\u003e\u003c/svg\u003e",
    "clock": "\u003csvg class=\"icon icon--clock\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003ccircle cx=\"12\" cy=\"12\" r=\"10\"/\u003e\u003cpath class=\"k-i-min\" d=\"M12 12V6\"/\u003e\u003cpath class=\"k-i-hr\" d=\"m12 12 4 2\"/\u003e\u003c/svg\u003e",
    "plus": "\u003csvg class=\"icon icon--plus\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003cpath class=\"k-i-l1\" d=\"M5 12h14\"/\u003e\u003cpath class=\"k-i-l2\" d=\"M12 5v14\"/\u003e\u003c/svg\u003e",
    "minus": "\u003csvg class=\"icon icon--minus\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003cpath class=\"k-i-a\" d=\"M5 12h14\"/\u003e\u003c/svg\u003e",
    "play": "\u003csvg class=\"icon icon--play\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003cpath class=\"k-i-a\" d=\"M6.5 4.5v15L19 12Z\"/\u003e\u003c/svg\u003e",
    "pause": "\u003csvg class=\"icon icon--pause\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003crect class=\"k-i-r\" x=\"14\" y=\"4\" width=\"4\" height=\"16\" rx=\"1\"/\u003e\u003crect class=\"k-i-l\" x=\"6\" y=\"4\" width=\"4\" height=\"16\" rx=\"1\"/\u003e\u003c/svg\u003e",
    "zoom": "\u003csvg class=\"icon icon--zoom\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003ccircle class=\"k-i-lens\" cx=\"11\" cy=\"11\" r=\"8\"/\u003e\u003cpath d=\"m21 21-4.35-4.35\"/\u003e\u003cg class=\"k-i-sign\"\u003e\u003cpath d=\"M11 8v6\"/\u003e\u003cpath d=\"M8 11h6\"/\u003e\u003c/g\u003e\u003c/svg\u003e",
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
