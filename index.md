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
          <span class="icon-link" aria-hidden="true"><svg class="icon-svg" viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H21l-4.6 5.27L22 22h-4.4l-3.45-4.5L10.2 22H8.1l4.92-5.63L2 2h4.51l3.12 4.1L13.1 2h2.08l-4.6 5.26 7.32 9.53h-1.65l-6.5-8.47L5.44 20h13.1l-7-9.16L18.9 2Z"></path></svg></span>
        </a>
        {% elsif post.external_url %}
        <a href="{{ post.external_url }}" target="_blank" rel="noreferrer" aria-label="Open external link for {{ post.title }}" title="External link">
          <span class="icon-link" aria-hidden="true"><svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"></path><path d="M9 7h8v8"></path><path d="M17 13v5H4V5h5"></path></svg></span>
        </a>
        {% else %}
        <span class="icon-link" aria-hidden="true"><svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3.5h6l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5A1.5 1.5 0 0 1 7.5 3.5Z"></path><path d="M14 3.5V8h4"></path><path d="M9 12h6"></path><path d="M9 16h6"></path></svg></span>
        {% endif %}
      </td>
      <td class="post-title">
        <a href="{{ post.url | relative_url }}">{{ post.title }}</a>
      </td>
    </tr>
    {% endfor %}
  </tbody>
</table>
