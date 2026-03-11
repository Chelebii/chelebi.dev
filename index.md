---
layout: default
---

<table class="post-list">
  <thead class="visually-hidden">
    <tr>
      <th scope="col" class="col-date">Date</th>
      <th scope="col" class="col-icon">Link</th>
      <th scope="col" class="col-title">Title</th>
    </tr>
  </thead>
  <tbody>
    {% for post in site.posts %}
    <tr>
      <td class="post-date">{{ post.date | date: "%Y-%m-%d" }}</td>
      <td class="post-icon">
        {% if post.external_url contains 'x.com' or post.external_url contains 'twitter.com' %}
        <a href="{{ post.external_url }}" target="_blank" rel="noreferrer" aria-label="Open X link for {{ post.title }}" title="X link">
          <span class="icon-link" aria-hidden="true"><i class="fa-brands fa-x-twitter"></i></span>
        </a>
        {% elsif post.external_url %}
        <a href="{{ post.external_url }}" target="_blank" rel="noreferrer" aria-label="Open external link for {{ post.title }}" title="External link">
          <span class="icon-link" aria-hidden="true"><i class="fa-solid fa-arrow-up-right-from-square"></i></span>
        </a>
        {% else %}
        <span class="icon-link" aria-hidden="true"><i class="fa-regular fa-file-lines"></i></span>
        {% endif %}
      </td>
      <td class="post-title">
        <a href="{{ post.url | relative_url }}">{{ post.title }}</a>
      </td>
    </tr>
    {% endfor %}
  </tbody>
</table>
