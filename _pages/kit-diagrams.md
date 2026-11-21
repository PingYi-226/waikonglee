---
layout: default
v2: true
bare: true
sitemap: false
noindex: true
title: Diagrams
description: Seven drawings, one per research area. Each draws itself when first seen and comes alive while it has your attention.
permalink: /kit/diagrams/
site_css: [diagrams, diagrams-demo]
site_js: [diagrams, diagrams-demo]
---
{%- comment -%}
  Test page for the diagram kit (_includes/site/diagrams/*.liquid, assets/css/site/diagrams.css, assets/js/site/diagrams.js):
  every drawing at the size of a home-page card (live on hover or keyboard focus) and at the size of the research plate
  (labels shown, live always), with buttons that replay, reset and pause each one.
{%- endcomment -%}
{%- assign areas = site.data.research -%}
{% include site/pagehead.liquid %}

<section class="section dgdemo">
  <div class="wrap">
    <header class="sechead" data-inview><h2 class="sechead__title">On the home cards</h2></header>
    <p class="dgdemo__note t-label">Point at a card or tab to it: the drawing runs while it has your attention and finishes its cycle when you leave.</p>
    <ul class="dgdemo__cards">
      {%- for a in areas %}
      <li>
        <a class="dgdemo__card" href="#plate-{{ a.key }}" data-kit="press" data-press="choice">
          <span class="dgdemo__fig">{% include site/diagrams/{{ a.key }}.liquid %}</span>
          <span class="dgdemo__foot"><span class="dgdemo__title">{{ a.short | default: a.title }}</span><span class="t-data">{{ a.key }}</span></span>
        </a>
      </li>
      {%- endfor %}
    </ul>
  </div>
</section>

<section class="section dgdemo">
  <div class="wrap">
    <header class="sechead" data-inview><h2 class="sechead__title">On the research plate</h2></header>
    <p class="dgdemo__note t-label">With labels, running whenever they are on screen. Replay draws from blank; Reset leaves the drawing blank.</p>
    {%- for a in areas %}
    <figure class="dgdemo__row" id="plate-{{ a.key }}">
      <div class="dgdemo__plate">{% include site/diagrams/{{ a.key }}.liquid live="always" detail="full" %}</div>
      <figcaption class="dgdemo__cap">
        <p class="figcap">{{ a.tagline }}</p>
        <h3 class="dgdemo__name">{{ a.title }}</h3>
        <div class="dgdemo__ctl">
          <button type="button" class="btn btn--ghost btn--small" data-kit="press" data-dg-act="play">Replay</button>
          <button type="button" class="btn btn--ghost btn--small" data-kit="press" data-dg-act="reset">Reset</button>
          <button type="button" class="btn btn--ghost btn--small" data-kit="press" data-dg-act="live" aria-pressed="true">Live</button>
        </div>
      </figcaption>
    </figure>
    {%- endfor %}
  </div>
</section>
