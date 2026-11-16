---
layout: page
permalink: /research/
title: Research
description: Cryptographic engineering, GPU computing and efficient hardware, from algorithms down to silicon.
nav: true
nav_order: 1
---

<section class="research">
  <h2 class="section-title">Areas</h2>
  <ol class="areas areas--full">
    {% for a in site.data.research %}
      <li class="reveal" id="{{ a.key }}">
        <div class="areas__row">
          <span class="areas__no">{{ forloop.index | prepend: '0' | slice: -2, 2 }}</span>
          <div>
            <h3 class="areas__title">{{ a.title }}</h3>
            <p class="areas__desc">{{ a.description }}</p>
            <a class="btn-line btn-line--small" href="{{ '/publications/' | relative_url }}?area={{ a.key }}">Papers in this area {% include site/arrow.liquid %}</a>
          </div>
        </div>
      </li>
    {% endfor %}
  </ol>

  <h2 class="section-title" id="results">Selected results</h2>
  {% include site/results.liquid %}

  <h2 class="section-title" id="software">Open-source software</h2>
  <div class="software">
    {% for g in site.data.software %}
      <div class="software__group reveal">
        <h3 class="software__title">{{ g.group }}</h3>
        <ul>
          {% for s in g.items %}
            <li>
              <a class="software__repo link" href="https://github.com/{{ s.repo }}">{{ s.repo | split: '/' | last }}</a>
              <span class="software__text">{{ s.text }}</span>
              {% if s.paper %}<span class="software__paper">{{ s.paper }}</span>{% endif %}
            </li>
          {% endfor %}
        </ul>
      </div>
    {% endfor %}
  </div>

  <h2 class="section-title" id="projects">Funded projects</h2>
  <div class="grants">
    {% for g in site.data.grants %}
      <article class="grant reveal">
        <div class="grant__period">{{ g.period }}</div>
        <div>
          <h3 class="grant__title">{{ g.title }}</h3>
          <p class="grant__meta">{{ g.role }} · {{ g.funder }} · {{ g.amount }}</p>
          <p class="grant__out">{{ g.output }}</p>
        </div>
      </article>
    {% endfor %}
  </div>
</section>
