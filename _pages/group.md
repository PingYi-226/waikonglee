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
  (role, affiliation, joining, emails) and _config.yml (the owner's name). Markup: _includes/site/people.liquid
  (the body), _includes/site/people_band.liquid (the members' marks in the head, and the name-to-mark view behind
  the button at the end of the students' row); the marks: _includes/site/people_glyph.liquid + the "glyph" kit in
  assets/js/site/group.js.
{%- endcomment -%}
{%- assign people = site.data.people -%}
{%- assign alumni_names = people.alumni | map: 'name' | uniq -%}
{% capture head_aside %}{% include site/people_band.liquid %}{% endcapture %}
{% capture head_meta %}
  <dl class="gstats">
    <div class="stat" data-band-for="now">
      <dt class="stat__label">Current students</dt>
      <dd class="stat__value"><span data-kit="sliding-number" data-value="{{ people.current | size }}" data-delay="700">{{ people.current | size }}</span></dd>
    </div>
    <div class="stat" data-band-for="past">
      <dt class="stat__label">Alumni</dt>
      <dd class="stat__value"><span data-kit="sliding-number" data-value="{{ alumni_names | size }}" data-delay="780">{{ alumni_names | size }}</span></dd>
    </div>
  </dl>
  <nav class="gindex" aria-label="On this page" data-kit="highlight">
    <a href="#pi" data-highlight-item>Principal investigator</a>
    <a href="#students" data-highlight-item>Students</a>
    <a href="#joining" data-highlight-item>Joining</a>
    <a href="#alumni" data-highlight-item>Alumni</a>
  </nav>
{% endcapture %}
{% include site/pagehead.liquid aside=head_aside meta=head_meta %}

{% include site/people.liquid %}
