---
layout: default
permalink: /kit/snap/
title: Snap
description: Test page for the scroll stepper (Site.snap). Not linked from the navigation.
v2: true
noindex: true
sitemap: false
---
{%- comment -%}
  A stand-in for the home page and the research page: sections that are stops, a tall pinned one with points and a hold,
  one taller than the viewport, and the footer revealed from under the page at the end. "?mode=soft" switches the mode.
  Demo-only styles below (sn-*); the stepper's own CSS is assets/css/site/kit-snap.css.
{%- endcomment -%}
<style>
  .sn-sec { position: relative; min-height: 100vh; min-height: 100svh; display: grid; align-content: center; padding: calc(var(--nav-h) + 2rem) 0 3rem; border-bottom: 1px solid var(--line); }
  .sn-sec:nth-child(even) { background: var(--paper-2); }
  .sn-sec h1, .sn-sec h2 { margin: 0 0 1rem; }
  .sn-sec p { max-width: var(--measure); color: var(--ink-2); }
  .sn-row { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; margin-top: 1.5rem; }
  .sn-field { font: inherit; font-size: var(--fs-small); padding: 0.55rem 0.8rem; border: 1px solid var(--line-strong); border-radius: var(--r-2); background: var(--surface); color: var(--ink); min-width: 16rem; }
  .sn-pin { padding: 0; display: block; align-content: normal; min-height: 0; height: 320vh; }
  .sn-pin__stage { position: sticky; top: 0; height: 100vh; height: 100svh; display: grid; place-items: center; overflow: clip; }
  .sn-pin__stage svg { width: min(78vw, 64rem); height: auto; overflow: visible; }
  .sn-pin__stage circle { fill: var(--surface); stroke: var(--line-strong); }
  .sn-pin__stage .is-core { fill: none; stroke: var(--line); stroke-dasharray: 3 6; }
  .sn-pin__title { position: absolute; left: var(--gutter); top: calc(var(--nav-h) + 1.5rem); margin: 0; }
  .sn-pin__p { position: absolute; right: var(--gutter); bottom: 2rem; margin: 0; color: var(--muted); }
  .sn-tall { min-height: 0; height: auto; align-content: start; padding-top: calc(var(--nav-h) + 3rem); }
  .sn-tall .wrap > * + * { margin-top: 1.25rem; }
  .sn-tall h3 { font-family: var(--font-display); font-weight: 400; font-size: var(--fs-d3); margin: 3rem 0 0; }
  .sn-code { max-width: 40rem; max-height: 12rem; overflow: auto; margin: 0; padding: 1rem 1.2rem; font-family: var(--font-mono); font-size: var(--fs-xs); line-height: 1.6; background: var(--paper-3); border-radius: var(--r-2); }
  .sn-short { min-height: 70vh; }
  .sn-log { position: fixed; left: 1rem; bottom: 1rem; z-index: var(--z-sticky); display: grid; gap: 0.15rem; padding: 0.6rem 0.8rem; font-family: var(--font-mono); font-size: 0.7rem; line-height: 1.4; color: var(--ink-2); background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-2); box-shadow: var(--shadow-1); pointer-events: none; max-width: 22rem; }
  .sn-log b { font-weight: 500; color: var(--ink); }
  .sn-dots { position: fixed; right: 1rem; top: 50%; z-index: var(--z-sticky); display: grid; gap: 0.35rem; transform: translateY(-50%); }
  .sn-dots button { width: 0.6rem; height: 0.6rem; padding: 0; border: 1px solid var(--line-strong); border-radius: 50%; background: transparent; cursor: pointer; transition: background var(--t-color), border-color var(--t-color); }
  .sn-dots button[aria-current="true"] { background: var(--ink); border-color: var(--ink); }
  @media (max-width: 760px) { .sn-dots { display: none; } }
</style>

<div class="sn" data-kit="snap" data-snap-mode="deck" id="sn">
  <section class="sn-sec" data-snap id="sn-top" aria-labelledby="sn-h1">
    <div class="wrap">
      <h1 class="t-d1" id="sn-h1">Snap</h1>
      <p>The page moves one section at a time. A wheel notch, a trackpad swipe, Page Down, Space or the arrow keys go to the next stop; a gesture the other way during a move turns it round. Home and End go to the ends.</p>
      <p class="sn-row"><a class="link" href="?mode=deck">Deck mode</a> <a class="link" href="?mode=soft">Soft mode</a> <a class="link" href="#sn-pin">To the pinned section</a> <a class="link" href="#sn-deep">Into the tall section</a></p>
    </div>
  </section>

  <section class="sn-sec" data-snap id="sn-two" aria-labelledby="sn-h2">
    <div class="wrap">
      <h2 class="t-d2" id="sn-h2">A plain stop</h2>
      <p>Tab moves focus; a control in another section brings that section in. Keys typed into the field stay in the field.</p>
      <div class="sn-row">
        <button type="button" class="btn btn--ghost" data-kit="press" onclick="Site.snap.prev()"><span data-kit="sliding-text">Previous</span></button>
        <button type="button" class="btn" data-kit="press ripple" onclick="Site.snap.next()"><span data-kit="sliding-text">Next</span></button>
        <input class="sn-field" type="text" placeholder="Arrow keys and Space type here" aria-label="A text field">
      </div>
    </div>
  </section>

  <section class="sn-sec sn-pin" data-snap data-snap-points="0.35 1" data-snap-top="true" data-snap-hold="1" id="sn-pin" aria-labelledby="sn-h3">
    <div class="sn-pin__stage">
      <h2 class="sn-pin__title t-d2" id="sn-h3">A pinned section</h2>
      <svg viewBox="0 0 1000 600" aria-hidden="true" data-sn-pic>
        <circle class="is-core" cx="500" cy="300" r="220"></circle>
        <circle r="34"></circle><circle r="34"></circle><circle r="34"></circle><circle r="34"></circle><circle r="34"></circle><circle r="34"></circle><circle r="34"></circle>
      </svg>
      <p class="sn-pin__p t-data" data-sn-progress>0.00</p>
    </div>
  </section>

  <section class="sn-sec sn-tall" data-snap id="sn-tall" aria-labelledby="sn-h4">
    <div class="wrap">
      <h2 class="t-d2" id="sn-h4">A section taller than the screen</h2>
      <p>Here a gesture moves by most of a screen, so everything can be read; the next section is landed on exactly once it is within reach.</p>
      <p>Lattice-based cryptography rests on the hardness of finding short vectors in high-dimensional lattices. Schemes such as Kyber and Dilithium compute with polynomials in rings, and the number-theoretic transform turns their multiplication into pointwise products. On graphics processors the transform runs in thousands of threads at once; on microcontrollers every cycle and every byte of memory counts.</p>
      <pre class="sn-code" tabindex="0" aria-label="A scrollable code block"><code>// the wheel scrolls this block while it can
for (int len = 128; len >= 2; len >>= 1) {
  for (int start = 0; start &lt; 256; start = j + len) {
    int16_t zeta = zetas[k++];
    for (j = start; j &lt; start + len; j++) {
      int16_t t = fqmul(zeta, r[j + len]);
      r[j + len] = r[j] - t;
      r[j] = r[j] + t;
    }
  }
}
// Barrett reduction keeps coefficients small
int16_t barrett_reduce(int16_t a) {
  int16_t t;
  const int16_t v = ((1 &lt;&lt; 26) + KYBER_Q / 2) / KYBER_Q;
  t = ((int32_t)v * a + (1 &lt;&lt; 25)) &gt;&gt; 26;
  t *= KYBER_Q;
  return a - t;
}</code></pre>
      <p>Homomorphic encryption lets a server compute on data it cannot read. Bootstrapping, the step that refreshes a ciphertext's noise, dominates the cost; keeping a GPU busy through it is a matter of memory layout as much as arithmetic.</p>
      <h3 id="sn-deep">Deep inside</h3>
      <p>A link to this heading lands here, inside the tall section, not at its top.</p>
      <p>Side-channel resistance asks that the time, power and electromagnetic traces of a computation say nothing about its secrets. Masking splits every secret into random shares; constant-time code removes branches and memory accesses that depend on secret data.</p>
      <p>Deep learning on encrypted data combines both worlds: the network's layers become polynomial approximations, and the accelerator's job is to evaluate them fast enough to be useful.</p>
      <p>The end of the tall section. The next stop follows.</p>
    </div>
  </section>

  <section class="sn-sec" data-snap id="sn-five" aria-labelledby="sn-h5">
    <div class="wrap">
      <h2 class="t-d2" id="sn-h5">Another stop</h2>
      <p>After the next one the page ends; a further gesture gives a little and comes back, and the wrapper hears <code>kit:snap-end</code>.</p>
      <p class="sn-row"><a class="link" href="#sn-top">Back to the top</a></p>
    </div>
  </section>

  <section class="sn-sec sn-short" data-snap id="sn-last" aria-labelledby="sn-h6">
    <div class="wrap">
      <h2 class="t-d2" id="sn-h6">The last section</h2>
      <p>Shorter than the screen. The footer lies under the page; the last stop is the very end of the page.</p>
    </div>
  </section>
</div>
<script>
  // demo: "?mode=soft" (runs while the page is parsed, before the kit reads the wrapper)
  (function () {
    var m = /[?&]mode=(soft|deck)/.exec(location.search);
    if (m) document.getElementById("sn").setAttribute("data-snap-mode", m[1]);
  })();
</script>

<nav class="sn-dots" aria-label="Stops" data-sn-dots></nav>
<div class="sn-log" aria-hidden="true" data-sn-log><span>index <b data-sn-index>-</b></span><span data-sn-events></span></div>

<script>
  document.addEventListener("DOMContentLoaded", function () {
    if (!window.Site) return;
    Site.ready(function () {
      var wrap = document.getElementById("sn");
      var pin = document.getElementById("sn-pin");
      var pic = pin.querySelector("[data-sn-pic]");
      var dots = Array.prototype.slice.call(pic.querySelectorAll("circle:not(.is-core)"));
      var core = pic.querySelector(".is-core");
      var out = pin.querySelector("[data-sn-progress]");
      var grid = [[200, 210], [400, 210], [600, 210], [800, 210], [300, 400], [500, 400], [700, 400]];
      function mix(a, b, t) { return a + (b - a) * t; }
      function draw() {
        var r = pin.getBoundingClientRect();
        var range = pin.offsetHeight - window.innerHeight;
        var p = range > 0 ? Site.util.clamp(-r.top / range, 0, 1) : 0;
        var enter = Site.util.smooth(Site.util.map(p, 0, 0.35, 0, 1));
        var flat = Site.util.smooth(Site.util.map(p, 0.35, 1, 0, 1));
        dots.forEach(function (c, i) {
          var a = (i / dots.length) * Math.PI * 2 - Math.PI / 2;
          var rx = 500 + Math.cos(a) * 220 * mix(1.9, 1, enter);
          var ry = 300 + Math.sin(a) * 220 * mix(1.9, 1, enter);
          c.setAttribute("cx", mix(rx, grid[i][0], flat).toFixed(1));
          c.setAttribute("cy", mix(ry, grid[i][1], flat).toFixed(1));
          c.style.opacity = mix(0.25, 1, enter).toFixed(3);
        });
        core.style.opacity = (enter * (1 - flat)).toFixed(3);
        out.textContent = p.toFixed(2);
      }
      window.addEventListener("scroll", Site.util.throttle(draw), { passive: true });
      Site.on("resize", draw);
      draw();
      // the hold: the dots answer the absorbed gesture with a quick wave
      pin.addEventListener("kit:snap-hold", function () {
        dots.forEach(function (c, i) {
          if (c.animate) c.animate([{ transform: "translateY(0)" }, { transform: "translateY(-14px)" }, { transform: "translateY(0)" }], { duration: 420, delay: i * 50, easing: "ease-in-out" });
        });
      });
      // demo readout: the stops as dots, the index and the last events
      var nav = document.querySelector("[data-sn-dots]");
      var idx = document.querySelector("[data-sn-index]");
      var ev = document.querySelector("[data-sn-events]");
      var log = [];
      function build() {
        nav.textContent = "";
        Site.snap.stops.forEach(function (s, i) {
          var b = document.createElement("button");
          b.type = "button";
          b.setAttribute("aria-label", "Stop " + (i + 1));
          b.addEventListener("click", function () { Site.snap.go(i); });
          nav.appendChild(b);
        });
        mark();
      }
      function mark() {
        Array.prototype.forEach.call(nav.children, function (b, i) { b.setAttribute("aria-current", i === Site.snap.index ? "true" : "false"); });
        idx.textContent = Site.snap.index + " / " + Site.snap.stops.length + (Site.snap.active ? " " + Site.snap.mode : " native");
      }
      ["snap-change", "snap-arrive", "snap-leave", "snap-hold", "snap-end", "snap-start"].forEach(function (n) {
        wrap.addEventListener("kit:" + n, function (e) {
          log.unshift(n.replace("snap-", "") + " " + e.detail.index + (e.detail.point ? "." + e.detail.point : ""));
          log.length = Math.min(log.length, 4);
          ev.textContent = log.join("  ");
          mark();
        });
      });
      Site.on("resize", function () { setTimeout(build, 200); });
      window.addEventListener("load", function () { setTimeout(build, 100); });
      build();
    });
  });
</script>
