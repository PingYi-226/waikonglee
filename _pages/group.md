---
layout: default
permalink: /group/
title: Group
description: Current postgraduate students and alumni.
nav: true
nav_order: 3
v2: true
site_css: [group]
site_js: [group]
---
{%- comment -%}
  The Group page. Everything comes from _data/people.yml (students, alumni, group_photo), _data/profile.yml
  (role, affiliation, joining, emails) and _config.yml (the owner's name). Markup: _includes/site/people.liquid;
  the marks: _includes/site/people_glyph.liquid + the "glyph" kit in assets/js/site/group.js.
{%- endcomment -%}
{%- assign people = site.data.people -%}
{%- assign pi_name = site.first_name | append: ' ' | append: site.last_name -%}
{%- assign alumni_names = people.alumni | map: 'name' | uniq -%}
{% capture head_aside %}
  <figure class="gfig">
    <div class="gfig__plate" data-glyph-host>
      <p class="gfig__read t-data" data-glyph-readout aria-hidden="true"></p>
      {% include site/people_glyph.liquid name=pi_name kind="big" trigger="load" delay="620" %}
      <label class="gfig__field js-only">
        <span class="sr-only">A name to draw in figure 1</span>
        <input class="gfig__input" type="text" value="{{ pi_name }}" maxlength="40" autocomplete="off" autocapitalize="words" spellcheck="false" data-glyph-input>
      </label>
    </div>
    <figcaption class="figcap">
      <span class="figcap__no">Fig. 1</span>
      <span>Each member's mark comes from their name: the letters pick a lattice and a short walk across it.<span class="js-only"> Edit the name to draw another.</span></span>
    </figcaption>
  </figure>
{% endcapture %}
{% capture head_meta %}
  <dl class="gstats">
    <div class="stat">
      <dt class="stat__label">Current students</dt>
      <dd class="stat__value"><span data-kit="sliding-number" data-value="{{ people.current | size }}" data-delay="700">{{ people.current | size }}</span></dd>
    </div>
    <div class="stat">
      <dt class="stat__label">Alumni</dt>
      <dd class="stat__value"><span data-kit="sliding-number" data-value="{{ alumni_names | size }}" data-delay="780">{{ alumni_names | size }}</span></dd>
    </div>
  </dl>
  <nav class="gindex" aria-label="On this page" data-kit="highlight">
    <a href="#pi" data-highlight-item>Principal investigator</a>
    <a href="#students" data-highlight-item>Students</a>
    <a href="#alumni" data-highlight-item>Alumni</a>
    <a href="#joining" data-highlight-item>Joining</a>
  </nav>
{% endcapture %}
{% include site/pagehead.liquid aside=head_aside meta=head_meta %}

{% include site/people.liquid %}
