(function () {
  var config = window.CHELEBI_ANALYTICS || {};
  var endpoint = String(config.endpoint || "").trim().replace(/\/+$/, "");

  if (!endpoint || shouldSkipAnalytics()) {
    return;
  }

  var eventsUrl = endpoint + "/api/events";
  var pagePath = normalizePath(window.location.pathname || "/");
  var engagedMs = 0;
  var visibleSince = document.visibilityState === "visible" ? Date.now() : 0;
  var maxScrollPercent = 0;
  var didFlush = false;
  var didSendPageview = false;

  function shouldSkipAnalytics() {
    var doNotTrack = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;
    return navigator.globalPrivacyControl === true || doNotTrack === "1" || doNotTrack === "yes";
  }

  function normalizePath(path) {
    var value = String(path || "/").trim();
    if (!value || value === "/") {
      return "/";
    }

    value = value.replace(/\\/g, "/").split("#")[0].split("?")[0].replace(/\/{2,}/g, "/");

    if (!value.startsWith("/")) {
      value = "/" + value;
    }

    if (value.slice(-11) === "/index.html") {
      value = value.slice(0, -11) || "/";
    }

    if (value.length > 1 && value.endsWith("/")) {
      value = value.slice(0, -1);
    }

    return value || "/";
  }

  function clampNumber(value, min, max) {
    var numeric = Math.round(Number(value) || 0);
    return Math.max(min, Math.min(max, numeric));
  }

  function currentScrollPercent() {
    var doc = document.documentElement;
    var body = document.body;
    var viewportHeight = window.innerHeight || doc.clientHeight || 0;
    var scrollTop = window.scrollY || doc.scrollTop || body.scrollTop || 0;
    var scrollHeight = Math.max(doc.scrollHeight || 0, body.scrollHeight || 0, viewportHeight);

    if (!scrollHeight) {
      return 100;
    }

    return clampNumber(((scrollTop + viewportHeight) / scrollHeight) * 100, 0, 100);
  }

  function updateScrollDepth() {
    maxScrollPercent = Math.max(maxScrollPercent, currentScrollPercent());
  }

  function stopTimer() {
    if (!visibleSince) {
      return;
    }

    engagedMs += Math.max(0, Date.now() - visibleSince);
    visibleSince = 0;
  }

  function startTimer() {
    if (visibleSince || document.visibilityState !== "visible") {
      return;
    }

    visibleSince = Date.now();
  }

  function send(payload, useBeacon) {
    var body = JSON.stringify(payload);

    if (useBeacon && navigator.sendBeacon) {
      try {
        var blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
        if (navigator.sendBeacon(eventsUrl, blob)) {
          return;
        }
      } catch (error) {
      }
    }

    fetch(eventsUrl, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      keepalive: true,
      headers: {
        "Content-Type": "text/plain;charset=UTF-8"
      },
      body: body
    }).catch(function () {
      return;
    });
  }

  function sendPageview() {
    if (didSendPageview) {
      return;
    }

    didSendPageview = true;
    send({
      type: "pageview",
      path: pagePath
    }, false);
  }

  function flushEngagement() {
    if (didFlush) {
      return;
    }

    didFlush = true;
    updateScrollDepth();
    stopTimer();

    send({
      type: "engagement",
      path: pagePath,
      engagedMs: engagedMs,
      scrollPercent: maxScrollPercent,
      exited: true
    }, true);
  }

  function getClosestLink(target) {
    var node = target;

    while (node && node !== document.body) {
      if (node.nodeType === 1 && node.tagName === "A" && node.hasAttribute("href")) {
        return node;
      }
      node = node.parentNode;
    }

    return null;
  }

  function describeClickTarget(link) {
    var href = String(link.getAttribute("href") || "").trim();
    var url;

    if (!href || href.charAt(0) === "#") {
      return null;
    }

    if (/^mailto:/i.test(href)) {
      return {
        targetType: "mailto",
        targetValue: "mailto"
      };
    }

    if (/^(javascript:|data:|blob:|tel:)/i.test(href)) {
      return null;
    }

    try {
      url = new URL(link.href, window.location.href);
    } catch (error) {
      return null;
    }

    if (url.origin === window.location.origin) {
      return {
        targetType: "internal",
        targetValue: normalizePath(url.pathname)
      };
    }

    if (!url.hostname) {
      return null;
    }

    return {
      targetType: "external",
      targetValue: url.hostname.toLowerCase()
    };
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      stopTimer();
      return;
    }

    startTimer();
  });

  document.addEventListener("click", function (event) {
    var link = getClosestLink(event.target);
    var target;

    if (!link) {
      return;
    }

    target = describeClickTarget(link);
    if (!target) {
      return;
    }

    send({
      type: "click",
      path: pagePath,
      targetType: target.targetType,
      targetValue: target.targetValue
    }, true);
  });

  window.addEventListener("scroll", updateScrollDepth, { passive: true });
  window.addEventListener("pagehide", flushEngagement);
  window.addEventListener("beforeunload", flushEngagement);

  updateScrollDepth();
  sendPageview();
})();
