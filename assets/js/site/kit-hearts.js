/*
 * kit-hearts: hearts on a picture frame (ROUND2_SPEC 4.6, the owner's point 25). Docs: _work/agent_notes/kit-text.md.
 *
 *   <div class="about__frame" data-kit="tilt hearts"> <img ...> </div>
 *
 * A click or tap puts a small heart where it landed: it pops on a spring, drifts up and fades. Clicks in quick
 * succession (each within COMBO_GAP of the last) build a combo, counted beside the heart from the second click
 * ("×2" ...). The tenth beats twice and brings one quiet full-screen moment (small hearts rising with a sway, about
 * 2.5 s, at most once per page load). Past ten the same combo gives no heart, only the frame's faint press: a hint
 * to stop. A pause longer than COMBO_GAP starts a new combo. Nothing is stored.
 *
 * Coexists with `tilt` on the same element: tilt owns `transform` (and adds .k-tilt__shine), so the hearts live in
 * a layer of their own on the document (not clipped by the frame or its reveal) and the press uses the separate
 * `scale` property, which composes with tilt's transform. Every layer is pointer-transparent.
 * Reduced motion: hearts fade in and out in place, the moment is one soft fade. ?static: no hearts.
 */
(function () {
  "use strict";

  const S = window.Site;
  const M = window.Motion;
  if (!S) return;
  const env = S.env;

  /* ------------------------------------------------------------ constants */
  const COMBO_GAP = 1200; // ms between two clicks of one combo (spec: "each within about 1.2 s")
  const COMBO_TOP = 10; // the click that brings the full-screen moment; past it, no more hearts
  const HEART = 22; // px, a heart at the click
  const HEART_TOP = 1.45; // the tenth heart's size, relative
  const DRIFT = 54; // px a heart rises while it fades
  const SWAY = 10; // px of sideways drift, at most
  const TILT = 14; // deg a heart leans, at most
  const LIFE = 1.2; // s from the pop to gone
  const BEAT = { scale: [0.3, 1.22, 0.96, 1.14, 1], times: [0, 0.22, 0.42, 0.62, 1], duration: 0.75 }; // lub-dub
  // the full-screen moment: "a few dozen small hearts in --heart and ink rising with a sway for about 2.5 s"
  const RAIN = 34; // hearts
  const RAIN_INK = 0.32; // share drawn in ink outline, the rest filled in --heart
  const RAIN_SIZE = [9, 19]; // px
  const RAIN_RISE = [0.55, 1.05]; // share of the viewport's height a heart rises (the highest leave at the top)
  const RAIN_LIFE = [1.7, 2.25]; // s per heart
  const RAIN_SPREAD = 0.5; // s over which the hearts set off (so the whole moment is over by 2.75 s)
  const RAIN_SWAY = [8, 22]; // px
  const RAIN_SOFT = { in: 0.45, hold: 0.7, out: 0.65 }; // s: reduced motion, one fade in, a rest, one fade out
  const PATH =
    "M12 20.6c-.3 0-.6-.1-.8-.3C7.4 17 3 13.4 3 8.9 3 6.2 5.1 4.2 7.6 4.2c1.8 0 3.3.9 4.4 2.4 1.1-1.5 2.6-2.4 4.4-2.4 2.5 0 4.6 2 4.6 4.7 0 4.5-4.4 8.1-8.2 11.4-.2.2-.5.3-.8.3z";

  let rained = false; // the full-screen moment plays at most once per page load
  let layer = null; // one document-level layer holds every frame's hearts

  const rand = (a, b) => a + Math.random() * (b - a);

  function heartSvg(cls) {
    return '<svg class="' + cls + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + PATH + '"/></svg>';
  }

  function getLayer() {
    if (!layer || !layer.isConnected) {
      layer = document.createElement("div");
      layer.className = "k-hearts";
      layer.setAttribute("aria-hidden", "true");
      document.body.appendChild(layer);
    }
    return layer;
  }

  /** Run a Motion animation (or jump to its end without the library) and resolve when it is over. */
  function play(el, keyframes, options) {
    const a = S.animate(el, keyframes, options);
    return a && a.finished ? a.finished : Promise.resolve();
  }

  /** One heart at a point of the viewport. n > 1 shows the combo count beside it; n === COMBO_TOP beats. */
  function heart(x, y, n) {
    const host = getLayer();
    const box = host.getBoundingClientRect(); // the layer sits at the document's origin; this keeps the heart on the page
    const top = n === COMBO_TOP;
    const size = Math.round(HEART * (top ? HEART_TOP : 1));
    const h = document.createElement("span");
    h.className = "k-heart" + (top ? " k-heart--top" : "");
    h.style.left = (x - box.left - size / 2).toFixed(1) + "px";
    h.style.top = (y - box.top - size / 2).toFixed(1) + "px";
    h.style.width = h.style.height = size + "px";
    h.innerHTML = heartSvg("k-heart__g");
    let count = null;
    if (n > 1) {
      count = document.createElement("span");
      count.className = "k-heart__n";
      count.textContent = "×" + n;
      h.appendChild(count);
    }
    host.appendChild(h);

    if (env.reduce || !M) {
      // in place: a fade in, a rest, a fade out
      return play(h, { opacity: [0, 1] }, S.t("transition.reveal"))
        .then(() => play(h, { opacity: 0 }, S.t("transition.overlay", { delay: LIFE * 0.4 })))
        .then(() => h.remove());
    }

    const lean = rand(-TILT, TILT);
    const sway = rand(-SWAY, SWAY);
    const life = LIFE * (top ? 1.35 : 1);
    const scale = top ? { scale: BEAT.scale } : { scale: [0.3, 1] };
    const popT = top ? S.t({ duration: BEAT.duration, times: BEAT.times, ease: S.tokens.ease.out }) : S.t("spring.checkPop");
    const pop = play(h, Object.assign({ rotate: [lean * 0.4, lean] }, scale), { scale: popT, rotate: S.t("spring.bounce") });
    const rise = play(h, { y: [0, -DRIFT * (top ? 1.25 : 1)], x: [0, sway] }, S.t({ duration: life, ease: S.tokens.ease.out }));
    const fade = play(h, { opacity: [1, 0] }, S.t({ duration: life * 0.5, delay: life * 0.5, ease: S.tokens.ease.leave }));
    if (count) play(count, { scale: [0.5, 1], opacity: [0, 1] }, { scale: S.t("spring.bounce"), opacity: S.t("transition.fade") });
    return Promise.all([pop, rise, fade]).then(() => h.remove());
  }

  /** The full-screen moment: small hearts rising from below with a sway, over in under three seconds. */
  function rain() {
    if (rained) return;
    rained = true;
    const veil = document.createElement("div");
    veil.className = "k-hearts-rain";
    veil.setAttribute("aria-hidden", "true");
    document.body.appendChild(veil);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const soft = env.reduce || !M;
    const runs = [];
    for (let i = 0; i < RAIN; i++) {
      const size = Math.round(rand(RAIN_SIZE[0], RAIN_SIZE[1]));
      const ink = Math.random() < RAIN_INK;
      const h = document.createElement("span");
      h.className = "k-heart k-heart--rain" + (ink ? " k-heart--ink" : "");
      h.style.width = h.style.height = size + "px";
      h.innerHTML = heartSvg("k-heart__g");
      // spread evenly across the width, each with a little jitter, so no clump and no gap
      const x = ((i + rand(0.15, 0.85)) / RAIN) * vw;
      h.style.left = (x - size / 2).toFixed(1) + "px";
      veil.appendChild(h);
      if (soft) {
        h.style.top = rand(0.15, 0.85) * vh + "px";
        h.style.opacity = ink ? "0.7" : "0.85";
        continue;
      }
      h.style.top = vh + size + "px";
      const life = rand(RAIN_LIFE[0], RAIN_LIFE[1]);
      const rise = -(rand(RAIN_RISE[0], RAIN_RISE[1]) * vh + size);
      const amp = rand(RAIN_SWAY[0], RAIN_SWAY[1]) * (Math.random() < 0.5 ? -1 : 1);
      const lean = rand(-12, 12);
      // a sway: four turns of a sine on the way up, leaning into each swing
      const xs = [0, amp, -amp * 0.6, amp * 0.8, -amp * 0.3];
      const rs = xs.map((v) => lean + (v / (Math.abs(amp) || 1)) * 9);
      const ys = [0, 0.25, 0.5, 0.75, 1].map((f) => rise * (1 - Math.pow(1 - f, 1.3)));
      const delay = (i % 2 ? rand(0, RAIN_SPREAD) : rand(0, RAIN_SPREAD * 0.6)) * S.tempo;
      const opts = { duration: life * S.tempo, delay: delay, ease: "linear" };
      runs.push(play(h, { x: xs, y: ys, rotate: rs }, opts));
      runs.push(
        play(h, { opacity: [0, ink ? 0.7 : 0.85, ink ? 0.7 : 0.85, 0], scale: [0.6, 1, 1, 0.9] }, Object.assign({}, opts, { times: [0, 0.15, 0.7, 1] })),
      );
    }
    if (soft) {
      veil.style.opacity = "0";
      runs.push(
        play(veil, { opacity: [0, 1] }, S.t({ duration: RAIN_SOFT.in, ease: S.tokens.ease.soft })).then(() =>
          play(veil, { opacity: 0 }, S.t({ duration: RAIN_SOFT.out, ease: S.tokens.ease.soft, delay: RAIN_SOFT.hold })),
        ),
      );
    }
    Promise.all(runs).then(() => veil.remove());
  }

  S.register("hearts", function (el) {
    let count = 0;
    let last = -Infinity;
    let press = null;
    let base = null; // the frame's own `scale` (none, usually), read when it is not pressed

    /** The frame gives a little under the click and comes back on a spring (the `scale` property: tilt owns transform). */
    function pressFrame() {
      if (env.reduce || env.static || !el.animate) return;
      let from = 1;
      if (press) {
        const s = getComputedStyle(el).scale;
        from = s && s !== "none" ? parseFloat(s) || 1 : 1;
        press.cancel();
      } else {
        base = getComputedStyle(el).scale;
      }
      const rest = base && base !== "none" ? parseFloat(base) || 1 : 1;
      const down = S.t("transition.popOut"); // 0.15 s ease.out
      const back = S.css("spring.press");
      const total = down.duration * 1000 + back.duration;
      const a = (press = el.animate(
        [
          { scale: String(from), easing: "cubic-bezier(" + down.ease.join(",") + ")" },
          { scale: String(rest * S.tokens.scale.choice), offset: (down.duration * 1000) / total, easing: back.easing },
          { scale: String(rest) },
        ],
        { duration: total },
      ));
      a.onfinish = a.oncancel = () => {
        if (press === a) press = null;
      };
    }

    function onClick(e) {
      if (env.static || e.button !== 0) return;
      // a control inside the frame keeps its own click
      const ctl = e.target.closest && e.target.closest("a, button, input, select, textarea, [role='button']");
      if (ctl && ctl !== el && el.contains(ctl)) return;
      const now = performance.now();
      count = now - last > COMBO_GAP * S.tempo ? 1 : count + 1;
      last = now;
      pressFrame();
      if (count > COMBO_TOP) return; // past ten: no heart, only the press
      let x = e.clientX;
      let y = e.clientY;
      if (!e.detail && !x && !y) {
        // a click without a pointer position: the frame's centre
        const r = el.getBoundingClientRect();
        x = r.left + r.width / 2;
        y = r.top + r.height / 2;
      }
      heart(x, y, count);
      if (count === COMBO_TOP) rain();
    }

    el.classList.add("k-hearts-frame");
    el.addEventListener("click", onClick);
    return {
      /** clicks in the current combo (0 after a pause) */
      get combo() {
        return performance.now() - last > COMBO_GAP * S.tempo ? 0 : count;
      },
      destroy: () => {
        el.removeEventListener("click", onClick);
        el.classList.remove("k-hearts-frame");
        if (press) press.cancel();
      },
    };
  });
})();
