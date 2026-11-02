(function () {
  "use strict";
  const KT = window.KitabTrace || null;
  let apiReady = false;
  let engineReady = false;
  let engineState = "loading";
  let busyNow = false;
  let lastResult = null;
  let lastDownloadedUrl = null;
  let isPaused = false;
  let isPausing = false;
  let lastKnownStage = "pages";
  let lastKnownSub = "";
  let settleTimer = null;
  const SETTLE_QUIET_MS = 12000;
  const ICON_PLAY_SM = '<svg viewBox="0 0 24 24" fill="none"><path d="M7 5.5V18.5L18 12L7 5.5Z" fill="currentColor"/></svg>';
  const ICON_PAUSE_SM = '<svg viewBox="0 0 24 24" fill="none"><rect x="7" y="5" width="3.4" height="14" rx="1" fill="currentColor"/><rect x="13.6" y="5" width="3.4" height="14" rx="1" fill="currentColor"/></svg>';
  const ICON_QUEUE_PLAY = '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="6.3" width="12" height="2.8" rx="1" fill="currentColor"/><rect x="3.5" y="10.6" width="12" height="2.8" rx="1" fill="currentColor"/><rect x="3.5" y="14.9" width="8" height="2.8" rx="1" fill="currentColor"/><path d="M16.5 8.5L20.5 12L16.5 15.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_DRAG = '<svg viewBox="0 0 10 16" fill="none"><circle cx="2.5" cy="2.5" r="1.3" fill="currentColor"/><circle cx="7.5" cy="2.5" r="1.3" fill="currentColor"/><circle cx="2.5" cy="8" r="1.3" fill="currentColor"/><circle cx="7.5" cy="8" r="1.3" fill="currentColor"/><circle cx="2.5" cy="13.5" r="1.3" fill="currentColor"/><circle cx="7.5" cy="13.5" r="1.3" fill="currentColor"/></svg>';
  const ICON_REMOVE = '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const ICON_RETRY = '<svg viewBox="0 0 24 24" fill="none"><path d="M4.5 12a7.5 7.5 0 0 1 12.6-5.5M19.5 12a7.5 7.5 0 0 1-12.6 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M17.5 4.8V8.6H13.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5 19.2V15.4H10.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_FOLDER = '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7.5C4 6.7 4.7 6 5.5 6H9.5L11.5 8H18.5C19.3 8 20 8.7 20 9.5V17.5C20 18.3 19.3 19 18.5 19H5.5C4.7 19 4 18.3 4 17.5V7.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  const ICON_OPEN_BOOK = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 6.5C10.6 5.3 8.6 4.7 6.6 4.9C5.7 5 5 5.8 5 6.7V18C5 18.8 5.7 19.5 6.6 19.4C8.5 19.2 10.5 19.8 12 21" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 6.5C13.4 5.3 15.4 4.7 17.4 4.9C18.3 5 19 5.8 19 6.7V18C19 18.8 18.3 19.5 17.4 19.4C15.5 19.2 13.5 19.8 12 21" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 6.5V21" stroke="currentColor" stroke-width="1.6"/><path d="M7.3 8.8L10.3 8.5M7.3 11.2L10.3 10.9M7.3 13.6L9.5 13.4" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity="0.75"/><path d="M13.7 8.5L16.7 8.8M13.7 10.9L16.7 11.2M14.5 13.4L16.7 13.6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity="0.75"/></svg>';
  const ICON_FLY_CHIP = '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="5" fill="currentColor"/></svg>';
  const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//;
  function ensureUrlScheme(url) {
    const u = (url || "").trim();
    if (!u) return u;
    return SCHEME_RE.test(u) ? u : "https://" + u;
  }
  function buildSnakePath(fromEl, toEl) {
    const a = fromEl.getBoundingClientRect();
    const b = toEl.getBoundingClientRect();
    const sx = a.left + a.width / 2, sy = a.top + a.height / 2;
    const tx = b.left + b.width / 2, ty = b.top + b.height / 2;
    const dx = tx - sx, dy = ty - sy;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len, py = dx / len;
    const humps = 5;
    const amplitude = Math.min(34, Math.max(18, len * 0.09));
    let d = `M ${sx} ${sy}`;
    for (let i = 0; i < humps; i++) {
      const dir = i % 2 === 0 ? -1 : 1;
      const ax = sx + dx * (i / humps), ay = sy + dy * (i / humps);
      const bx = sx + dx * ((i + 1) / humps), by = sy + dy * ((i + 1) / humps);
      const c1x = ax + (bx - ax) / 3 + px * amplitude * dir * 1.35;
      const c1y = ay + (by - ay) / 3 + py * amplitude * dir * 1.35;
      const c2x = ax + (2 * (bx - ax)) / 3 + px * amplitude * dir * 1.35;
      const c2y = ay + (2 * (by - ay)) / 3 + py * amplitude * dir * 1.35;
      d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${bx} ${by}`;
    }
    return d;
  }
  const PULSE_MS = 400;
  const pulseTimers = new Map();
  function pulseBadge(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("is-pulsing");
    void el.offsetWidth;
    el.classList.add("is-pulsing");
    clearTimeout(pulseTimers.get(id));
    pulseTimers.set(id, setTimeout(() => { el.classList.remove("is-pulsing"); pulseTimers.delete(id); }, PULSE_MS));
  }
  const FLY_DURATION = 1300;
  const FLY_TRAIL_COUNT = 20;
  const FLY_TRAIL_STEP_MS = 22;
  const FLY_FADE_STAGGER_MS = 22;
  const FLY_TOTAL_MS = FLY_DURATION + (FLY_TRAIL_COUNT + 1) * FLY_FADE_STAGGER_MS + 260;
  let flyChaseOn = true;
  function flyToQueue(sourceBadgeId, targetBadgeId) {
    if (flyChaseOn) return flyToQueueChase(sourceBadgeId, targetBadgeId);
    return flyToQueueSnake(sourceBadgeId, targetBadgeId);
  }
  const CHASE_BASE_MS = FLY_DURATION;
  const CHASE_EXTRA_MAX_MS = 500;
  const CHASE_HUMPS = 5;
  const CHASE_TRAIL_COUNT = FLY_TRAIL_COUNT;
  const CHASE_TRAIL_STEP_MS = FLY_TRAIL_STEP_MS;
  const CHASE_FADE_MS = 200;
  const CHASE_GUARD_MS = 6000;
  const CHASE_EDGE_PX = 14;
  function chaseEase(u) { return u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u); }
  function chaseStart(sx, sy, tx, ty) {
    const d0 = Math.hypot(tx - sx, ty - sy);
    return { bx: sx, by: sy, x: sx, y: sy, u: 0, T: CHASE_BASE_MS, d0,
      amp: Math.min(34, Math.max(18, d0 * 0.09)), vc: Math.max(0.2, (d0 / CHASE_BASE_MS) * 2) };
  }
  function chaseAdvance(s, tx, ty, dt) {
    const dx = tx - s.bx, dy = ty - s.by;
    const dist = Math.hypot(dx, dy);
    if (s.u < 1) {
      const rem = (1 - s.u) * s.T;
      const need = (1.5 * dist) / s.vc;
      if (need > rem) s.T = Math.min(CHASE_BASE_MS + CHASE_EXTRA_MAX_MS, Math.max(s.T, need / (1 - s.u)));
    }
    const u1 = Math.min(1, s.u + dt / s.T);
    const p0 = chaseEase(s.u), p1 = chaseEase(u1);
    if (u1 >= 1 || p0 >= 1) { s.bx = tx; s.by = ty; s.x = tx; s.y = ty; s.u = 1; return true; }
    const f = (p1 - p0) / (1 - p0);
    s.bx += dx * f; s.by += dy * f; s.u = u1;
    const len = dist || 1;
    const k = -s.amp * Math.sin(CHASE_HUMPS * Math.PI * p1) * Math.min(1, dist / 80);
    s.x = s.bx + (-dy / len) * k;
    s.y = s.by + (dx / len) * k;
    return false;
  }
  function chaseTrailPoint(hist, tq) {
    const n = hist.length;
    if (!n) return { x: 0, y: 0 };
    if (tq <= hist[0].t) return { x: hist[0].x, y: hist[0].y };
    if (tq >= hist[n - 1].t) return { x: hist[n - 1].x, y: hist[n - 1].y };
    let i = n - 1;
    while (i > 0 && hist[i - 1].t > tq) i--;
    const p = hist[i - 1], q = hist[i];
    const w = (tq - p.t) / Math.max(1, q.t - p.t);
    return { x: p.x + (q.x - p.x) * w, y: p.y + (q.y - p.y) * w };
  }
  function chaseTrailOpacity(i) { return i === 0 ? 1 : Math.max(0.1, 0.55 - i * (0.45 / CHASE_TRAIL_COUNT)); }
  function chaseClampTarget(tx, ty, vw, vh) {
    const cx = Math.max(CHASE_EDGE_PX, Math.min(vw - CHASE_EDGE_PX, tx));
    const cy = Math.max(CHASE_EDGE_PX, Math.min(vh - CHASE_EDGE_PX, ty));
    return { x: cx, y: cy, clamped: cx !== tx || cy !== ty };
  }
  function flyToQueueChase(sourceBadgeId, targetBadgeId) {
    const fromEl = document.getElementById(sourceBadgeId);
    const toEl = document.getElementById(targetBadgeId);
    if (!fromEl || !toEl) return Promise.resolve();
    pulseBadge(sourceBadgeId);
    if (document.hidden || typeof requestAnimationFrame !== "function") {
      return new Promise((res) => setTimeout(() => { pulseBadge(targetBadgeId); res(); }, 300));
    }
    const zoom = currentZoomNumber();
    const center = (el) => { const r = el.getBoundingClientRect(); return { x: (r.left + r.width / 2) / zoom, y: (r.top + r.height / 2) / zoom }; };
    const view = () => ({ w: (window.innerWidth || 1) / zoom, h: (window.innerHeight || 1) / zoom });
    const a = center(fromEl);
    let t = center(toEl);
    const st = chaseStart(a.x, a.y, t.x, t.y);
    const dots = [];
    for (let i = 0; i <= CHASE_TRAIL_COUNT; i++) {
      const el = document.createElement("div");
      el.className = i === 0 ? "fly-icon fly-chase" : "fly-icon fly-chase fly-trail";
      el.innerHTML = ICON_FLY_CHIP;
      el.style.opacity = String(chaseTrailOpacity(i));
      el.style.transform = `translate3d(${a.x - (i === 0 ? 8 : 6.5)}px, ${a.y - (i === 0 ? 8 : 6.5)}px, 0)`;
      document.body.appendChild(el);
      dots.push(el);
    }
    return new Promise((resolve) => {
      const hist = [];
      let done = false, last = 0, start = 0, headAt = -1;
      function finish() {
        if (done) return;
        done = true;
        clearTimeout(guard);
        if (headAt < 0) pulseBadge(targetBadgeId);
        dots.forEach((el) => { if (el) el.remove(); });
        resolve();
      }
      const guard = setTimeout(finish, CHASE_GUARD_MS);
      function frame(now) {
        if (done) return;
        if (!start) { start = now; last = now; }
        const dt = Math.min(50, Math.max(1, now - last));
        last = now;
        const el = now - start;
        if (headAt < 0) {
          if (toEl.isConnected) t = center(toEl);
          const v = view();
          const c = chaseClampTarget(t.x, t.y, v.w, v.h);
          if (chaseAdvance(st, c.x, c.y, dt)) { headAt = el; pulseBadge(targetBadgeId); }
        }
        hist.push({ t: el, x: st.x, y: st.y });
        while (hist.length > 2 && hist[1].t < el - (CHASE_TRAIL_COUNT + 2) * CHASE_TRAIL_STEP_MS) hist.shift();
        let alive = 0;
        for (let i = 0; i <= CHASE_TRAIL_COUNT; i++) {
          const d = dots[i];
          if (!d) continue;
          const p = chaseTrailPoint(hist, el - i * CHASE_TRAIL_STEP_MS);
          const half = i === 0 ? 8 : 6.5;
          d.style.transform = `translate3d(${p.x - half}px, ${p.y - half}px, 0)`;
          if (headAt >= 0) {
            const k = (el - (headAt + i * CHASE_TRAIL_STEP_MS)) / CHASE_FADE_MS;
            if (k >= 1) { d.remove(); dots[i] = null; continue; }
            if (k > 0) d.style.opacity = String(chaseTrailOpacity(i) * (1 - k));
          }
          alive++;
        }
        if (headAt >= 0 && !alive) { finish(); return; }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }
  function flyToQueueSnake(sourceBadgeId, targetBadgeId) {
    const fromEl = document.getElementById(sourceBadgeId);
    const toEl = document.getElementById(targetBadgeId);
    if (!fromEl || !toEl || !fromEl.animate) return Promise.resolve();
    const pathStr = buildSnakePath(fromEl, toEl);
    const dots = [];
    for (let i = 0; i <= FLY_TRAIL_COUNT; i++) {
      const isLeader = i === 0;
      const el = document.createElement("div");
      el.className = "fly-icon";
      el.innerHTML = ICON_FLY_CHIP;
      el.style.offsetPath = `path('${pathStr}')`;
      const opacity = isLeader ? 1 : Math.max(0.1, 0.55 - i * (0.45 / FLY_TRAIL_COUNT));
      el.style.opacity = String(opacity);
      if (isLeader) { el.style.width = "16px"; el.style.height = "16px"; }
      document.body.appendChild(el);
      dots.push(el);
      setTimeout(() => {
        el.animate(
          [{ offsetDistance: "0%" }, { offsetDistance: "100%" }],
          { duration: FLY_DURATION, easing: "ease-in-out", fill: "forwards" }
        );
      }, i * FLY_TRAIL_STEP_MS);
    }
    pulseBadge(sourceBadgeId);
    setTimeout(() => {
      pulseBadge(targetBadgeId);
      for (let i = dots.length - 1; i >= 0; i--) {
        const order = dots.length - 1 - i;
        setTimeout(() => {
          const el = dots[i];
          const from = el.style.opacity || "1";
          const anim = el.animate([{ opacity: from }, { opacity: 0 }], { duration: 200, easing: "ease-out", fill: "forwards" });
          anim.onfinish = () => el.remove();
        }, order * FLY_FADE_STAGGER_MS);
      }
    }, FLY_DURATION);
    return new Promise((res) => setTimeout(res, FLY_TOTAL_MS));
  }
  const ALLOWED_HOSTS = ["rekhta.org", "hindwi.org", "sufinama.org"];
  const BOOK_PATH_RE = /^\/ebooks(?:\/detail)?\/([^/]+)\/?$/i;
  const MSG_BAD_DOMAIN = "درست ویب سائٹ کا لنک فراہم کریں: ریختہ، صوفی نامہ یا ہندوی";
  const MSG_BAD_PAGE = "درست لنک فراہم کریں: جہاں اکیلی کتاب کا سرِ ورق اور تفصیلات ہوں یا اندرونی صفحات کھل رہے ہوں۔";
  function classifyBookUrl(url) {
    let u;
    try { u = new URL(ensureUrlScheme(url)); } catch (e) { return "bad-domain"; }
    const host = u.hostname.toLowerCase();
    const domainOk = ALLOWED_HOSTS.some((d) => host === d || host.endsWith("." + d));
    if (!domainOk) return "bad-domain";
    if (!BOOK_PATH_RE.test(u.pathname)) return "bad-page";
    return "ok";
  }
  const SETTINGS_ORDER = ["theme", "download_dir", "save_history", "temp_data_dir", "queue_target",
    "confirm_on_close", "default_search_site", "speed_mode", "keep_awake", "notify_on_finish", "sound_on_finish", "scroll_top_side", "text_size", "card_animation", "queue_fly_chase", "clipboard_chip", "auto_open_on_finish", "paste_start_download", "detailed_log", "settings_lang", "tray_enabled"];
  function saveSettings(changes) {
    const out = {};
    SETTINGS_ORDER.forEach((k) => { if (k in changes && changes[k] !== null && changes[k] !== undefined) out[k] = changes[k]; });
    return window.pywebview.api.save_settings(out);
  }
  const navItems = document.querySelectorAll(".nav-item[data-view]");
  const views = document.querySelectorAll(".view");
  const TAB_ORDER = ["settings", "history", "search", "queue", "download"];
  let lastLoadedTheme = null;
  let lastLoadedQueueTarget = null;
  let lastLoadedDefaultSite = null;
  let lastLoadedTextSize = null;
  let lastLoadedScrollSide = null;
  const contentEl = document.querySelector(".content");
  const viewScrollPositions = {};
  const viewFocusState = {};
  const VIEW_DEFAULT_FOCUS_ID = { download: "book-url", queue: "queue-bulk-text", search: "search-query-input" };
  let currentViewName = "download";
  let pasteStartOn = true;
  function setSingleFill(pct) {
    const p = Math.max(0, Math.min(100, Number(pct) || 0));
    progressFill.style.width = p + "%";
    progressFill.style.setProperty("--fill-p", p + "%");
    progressFill.style.setProperty("--fill-q", (100 - p) + "%");
  }
  function switchView(name, options) {
    const opts = options || {};
    const isSameTab = name === currentViewName;
    if (contentEl) viewScrollPositions[currentViewName] = contentEl.scrollTop;
    const activeEl = document.activeElement;
    const leavingViewEl = document.getElementById("view-" + currentViewName);
    if (leavingViewEl && activeEl && activeEl.id && leavingViewEl.contains(activeEl)) {
      viewFocusState[currentViewName] = activeEl.id;
    } else {
      viewFocusState[currentViewName] = null;
    }
    navItems.forEach((btn) => {
      const active = btn.dataset.view === name;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    views.forEach((v) => { v.classList.remove("view-rise"); v.classList.toggle("is-active", v.id === "view-" + name); });
    if (!isSameTab && !(name === "search" && ((document.getElementById("search-results-list") || {}).children || []).length > 36)) {
      const enteringEl = document.getElementById("view-" + name);
      if (enteringEl) {
        enteringEl.classList.add("view-rise");
        setTimeout(() => enteringEl.classList.remove("view-rise"), 260);
      }
    }
    if (name !== "search") { try { releaseSearchListHeight(); } catch (e) { } }
    currentViewName = name;
    try { requestScrollTopSync(); } catch (e) { }
    if (KT) KT.ev("view", { name: name });
    if (typeof syncRunStrip === "function") syncRunStrip();
    if (name === "download" && typeof checkClipboard === "function") setTimeout(checkClipboard, 50);
    if (name === "history") loadHistory();
    if (name === "queue") window.pywebview.api.verify_queue_files();
    if (name === "settings" && lastLoadedTheme) {
      moveThemeHighlight(lastLoadedTheme, false);
      moveQueueTargetHighlight(lastLoadedQueueTarget, false);
      try { moveScrollSideHighlight(lastLoadedScrollSide, false); } catch (e) { }
      moveDefaultSiteHighlight(lastLoadedDefaultSite, false);
      moveTextSizeHighlight(lastLoadedTextSize || "normal", false);
    }
    if (name === "search") {
      moveSearchSiteHighlight(currentSearchSite, false);
    }
    const resetToDefault = opts.viaButtonClick && isSameTab;
    if (contentEl) {
      if (resetToDefault && contentEl.scrollTop > 0) {
        contentEl.style.scrollBehavior = "";
        contentEl.scrollTop = 0;
      } else {
        contentEl.style.scrollBehavior = "auto";
        contentEl.scrollTop = resetToDefault ? 0 : (viewScrollPositions[name] || 0);
        requestAnimationFrame(() => { contentEl.style.scrollBehavior = ""; });
      }
    }
    const alreadyVisited = name in viewFocusState;
    if (resetToDefault || !alreadyVisited) {
      const defaultId = VIEW_DEFAULT_FOCUS_ID[name];
      if (defaultId) setTimeout(() => { const el = document.getElementById(defaultId); if (el) el.focus(); }, 0);
    } else {
      const savedId = viewFocusState[name];
      if (savedId) setTimeout(() => { const el = document.getElementById(savedId); if (el) el.focus(); }, 0);
    }
  }
  navItems.forEach((btn) => {
    btn.id = "tab-" + btn.dataset.view;
    btn.setAttribute("aria-controls", "view-" + btn.dataset.view);
  });
  views.forEach((v) => {
    v.setAttribute("role", "tabpanel");
    v.setAttribute("aria-labelledby", "tab-" + v.id.replace(/^view-/, ""));
  });
  document.querySelector(".topbar").addEventListener("keydown", (e) => {
    const tabs = Array.from(navItems);
    const i = tabs.indexOf(document.activeElement);
    if (i === -1) return;
    const rtl = document.documentElement.dir === "rtl";
    let j = -1;
    if (e.key === "ArrowLeft") j = i + (rtl ? 1 : -1);
    else if (e.key === "ArrowRight") j = i + (rtl ? -1 : 1);
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = tabs.length - 1;
    else return;
    e.preventDefault();
    tabs[(j + tabs.length) % tabs.length].focus();
  });
  navItems.forEach((btn) => btn.addEventListener("click", (ev) => {
    switchView(btn.dataset.view, { viaButtonClick: true });
    if (ev.detail > 0) btn.blur();
    if (btn.dataset.view === "settings" && typeof refreshAccount === "function") refreshAccount();
  }));
  ["dragover", "drop"].forEach((evName) => {
    document.addEventListener(evName, (e) => {
      const types = e.dataTransfer ? Array.from(e.dataTransfer.types || []) : [];
      if (types.includes("Files") || types.includes("text/uri-list")) e.preventDefault();
    });
  });
  function positionPill(hiEl, containerEl, btnEl) {
    const bw = btnEl.offsetWidth;
    const bh = btnEl.offsetHeight;
    const w = Math.max(bw, bh);
    const maxLeft = Math.max(0, containerEl.clientWidth - w);
    const left = Math.min(Math.max(btnEl.offsetLeft - (w - bw) / 2, 0), maxLeft);
    hiEl.style.width = w + "px";
    hiEl.style.height = bh + "px";
    hiEl.style.top = btnEl.offsetTop + "px";
    return left;
  }
  const themeSegBtns = document.querySelectorAll("#theme-segmented-brown .seg-btn, #theme-segmented-green .seg-btn");
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const brownContainer = document.getElementById("theme-segmented-brown");
  const greenContainer = document.getElementById("theme-segmented-green");
  const brownHighlight = brownContainer.querySelector(".seg-highlight");
  const greenHighlight = greenContainer.querySelector(".seg-highlight");
  let highlightedTheme = null;
  function highlightColorFor(themeKey) {
    if (themeKey === "green-light") return "#2c6141";
    if (themeKey === "green-dark") return "#21c063";
    return "var(--accent-fill)";
  }
  function containerFor(themeKey) {
    return themeKey.indexOf("green") === 0 ? greenContainer : brownContainer;
  }
  function hiFor(container) {
    return container === greenContainer ? greenHighlight : brownHighlight;
  }
  function btnFor(themeKey) {
    return document.querySelector('.seg-btn[data-theme="' + themeKey + '"]');
  }
  function moveThemeHighlight(themeKey, animate) {
    const newBtn = btnFor(themeKey);
    if (!newBtn) return;
    const newContainer = containerFor(themeKey);
    const newHi = hiFor(newContainer);
    const oldThemeKey = highlightedTheme;
    if (!animate || !oldThemeKey) {
      [brownHighlight, greenHighlight].forEach((hi) => { hi.style.transition = "none"; });
      const x = positionPill(newHi, newContainer, newBtn);
      newHi.style.transform = "translateX(" + x + "px)";
      newHi.style.background = highlightColorFor(themeKey);
      newHi.style.opacity = "1";
      const otherHi = newHi === brownHighlight ? greenHighlight : brownHighlight;
      otherHi.style.opacity = "0";
      newHi.offsetWidth;
      requestAnimationFrame(() => {
        brownHighlight.style.transition = "";
        greenHighlight.style.transition = "";
      });
      highlightedTheme = themeKey;
      return;
    }
    const oldContainer = containerFor(oldThemeKey);
    if (oldContainer === newContainer) {
      newHi.style.background = highlightColorFor(themeKey);
      const x = positionPill(newHi, newContainer, newBtn);
      newHi.style.transform = "translateX(" + x + "px)";
      highlightedTheme = themeKey;
      return;
    }
    const oldHi = hiFor(oldContainer);
    const oldRect = oldContainer.getBoundingClientRect();
    const newRect = newContainer.getBoundingClientRect();
    const targetIsRight = newRect.left > oldRect.left;
    const oldExitX = targetIsRight ? (oldContainer.offsetWidth + 46) : -46;
    const enterFromX = targetIsRight ? -46 : (newContainer.offsetWidth + 46);
    newHi.style.transition = "none";
    positionPill(newHi, newContainer, newBtn);
    newHi.style.transform = "translateX(" + enterFromX + "px)";
    newHi.style.opacity = "0";
    newHi.style.background = highlightColorFor(themeKey);
    newHi.offsetWidth;
    requestAnimationFrame(() => {
      newHi.style.transition = "";
      const x = positionPill(newHi, newContainer, newBtn);
      newHi.style.transform = "translateX(" + x + "px)";
      newHi.style.opacity = "1";
      oldHi.style.transform = "translateX(" + oldExitX + "px)";
      oldHi.style.opacity = "0";
    });
    highlightedTheme = themeKey;
  }
  const queueTargetContainer = document.getElementById("queue-target-segmented");
  const queueTargetHighlight = queueTargetContainer.querySelector(".seg-highlight");
  function moveQueueTargetHighlight(target, animate) {
    const btn = queueTargetContainer.querySelector('.seg-btn[data-target="' + target + '"]');
    if (!btn) return;
    if (!animate) {
      queueTargetHighlight.style.transition = "none";
      const x = positionPill(queueTargetHighlight, queueTargetContainer, btn);
      queueTargetHighlight.style.transform = "translateX(" + x + "px)";
      queueTargetHighlight.style.opacity = "1";
      queueTargetHighlight.offsetWidth;
      requestAnimationFrame(() => { queueTargetHighlight.style.transition = ""; });
      return;
    }
    const x = positionPill(queueTargetHighlight, queueTargetContainer, btn);
    queueTargetHighlight.style.transform = "translateX(" + x + "px)";
  }
  const scrollSideContainer = document.getElementById("scroll-side-segmented");
  const scrollSideHighlight = scrollSideContainer.querySelector(".seg-highlight");
  function moveScrollSideHighlight(side, animate) {
    const btn = scrollSideContainer.querySelector('.seg-btn[data-side="' + side + '"]');
    if (!btn) return;
    if (!animate) {
      scrollSideHighlight.style.transition = "none";
      const x0 = positionPill(scrollSideHighlight, scrollSideContainer, btn);
      scrollSideHighlight.style.transform = "translateX(" + x0 + "px)";
      scrollSideHighlight.style.opacity = "1";
      scrollSideHighlight.offsetWidth;
      requestAnimationFrame(() => { scrollSideHighlight.style.transition = ""; });
      return;
    }
    const x = positionPill(scrollSideHighlight, scrollSideContainer, btn);
    scrollSideHighlight.style.transform = "translateX(" + x + "px)";
  }
  function applyScrollTopSide(side) {
    document.documentElement.dataset.scrollSide = side === "right" ? "right" : "left";
  }
  function makeSiteHighlightMover(containerId, attr) {
    const container = document.getElementById(containerId);
    const hi = container.querySelector(".seg-highlight");
    attr = attr || "site";
    return function (site, animate) {
      const btn = container.querySelector('.seg-btn[data-' + attr + '="' + site + '"]');
      if (!btn) return;
      if (!animate) {
        hi.style.transition = "none";
        const x = positionPill(hi, container, btn);
        hi.style.transform = "translateX(" + x + "px)";
        hi.style.opacity = "1";
        hi.offsetWidth;
        requestAnimationFrame(() => { hi.style.transition = ""; });
        return;
      }
      const x = positionPill(hi, container, btn);
      hi.style.transform = "translateX(" + x + "px)";
      hi.style.opacity = "1";
    };
  }
  const moveSearchSiteHighlight = makeSiteHighlightMover("search-site-toggle");
  const moveDefaultSiteHighlight = makeSiteHighlightMover("default-site-segmented");
  const moveTextSizeHighlight = makeSiteHighlightMover("text-size-segmented", "size");
  function applyTheme(pref, animate) {
    const resolved = pref === "system" ? (media.matches ? "brown-dark" : "brown-light") : pref;
    const root = document.documentElement;
    const apply = () => {
      root.setAttribute("data-theme", resolved);
      themeSegBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.theme === pref));
    };
    if (animate && document.startViewTransition && root.getAttribute("data-theme") !== resolved
        && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.classList.add("theme-switching");
      const vt = document.startViewTransition(apply);
      vt.finished.finally(() => root.classList.remove("theme-switching"));
    } else {
      root.classList.add("theme-switching");
      apply();
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
    }
    try { localStorage.setItem("rekhta-theme", pref); } catch (e) { }
  }
  media.addEventListener("change", () => {
    const current = document.querySelector(".seg-btn.is-active");
    if (current && current.dataset.theme === "system") applyTheme("system");
  });
  themeSegBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      applyTheme(btn.dataset.theme, true);
      moveThemeHighlight(btn.dataset.theme, true);
      lastLoadedTheme = btn.dataset.theme;
      saveSettings({ theme: btn.dataset.theme });
    });
  });
  let singleDiscarded = false;
  window.onNativeEvent = function (event, payload) {
    const traceToken = KT && KT.on() ? KT.nativeStart(event, payload) : null;
    try {
      if (singleDiscarded && (event === "progress" || event === "error" || event === "done")) { }
      else if (event === "progress") handleDownloadProgress(payload);
      else if (event === "done") { handleDownloadDone(payload); forgetSingleSpace(); refreshLimitSoon(); }
      else if (event === "error") { handleDownloadError(payload); refreshLimitSoon(); }
      else if (event === "cancelled") { singleDiscarded = false; resetDownloadView(); }
      else if (event === "moved_to_queue") handleMovedToQueue();
      else if (event === "account_changed") refreshLimitSoon(250);
      else if (event === "queues_update") refreshQueues(payload);
      else if (event === "item_progress") handleItemProgress(payload);
      else if (event === "queue_gap") handleQueueGap(payload);
      else if (event === "confirm_close") handleConfirmClose();
      else if (event === "search_progress") { if (!searchCancelled) handleSearchProgress(payload); }
      else if (event === "search_done") { if (!searchCancelled) handleSearchDone(payload); }
      else if (event === "search_error") { if (!searchCancelled) handleSearchError(payload); }
      else if (event === "update_download") nativeUpdateDownload(payload);
      else if (event === "finished") { handleFinished(payload); refreshLimitSoon(); }
      else if (event === "engine_ready") setEngineState(payload && payload.ok ? "ready" : "failed");
    } catch (err) {
      console.error("onNativeEvent handler failed:", event, err);
    }
    if (traceToken) KT.nativeEnd(traceToken);
  };
  function handleConfirmClose() {
    confirmAction(
      "ڈاؤن لوڈنگ ابھی جاری ہے...! کیا آپ واقعی ایپ بند کرنا چاہتے ہیں؟",
      (dontAsk) => { window.pywebview.api.confirm_close_app(dontAsk); },
      { okLabel: "بند کریں", showDontAsk: true }
    );
  }
  const form = document.getElementById("download-form");
  const urlInput = document.getElementById("book-url");
  const urlInputField = urlInput.closest(".field");
  const urlClearBtn = document.getElementById("url-clear-btn");
  const sampleBookBtn = document.getElementById("sample-book-btn");
  const downloadBtn = document.getElementById("download-btn");
  const statusEl = document.getElementById("status");
  const statusIcon = document.getElementById("status-icon");
  const statusText = document.getElementById("status-text");
  const statusPercent = document.getElementById("status-percent");
  const statusSub = document.getElementById("status-sub");
  const STAT_ICONS = {
    pages: '<svg viewBox="0 0 24 24" fill="none"><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M14 3.5v4h4" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="13.5" r="7" stroke="currentColor" stroke-width="1.6"/><path d="M12 9.5v4l2.6 1.6M9.5 3h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    rate: '<svg viewBox="0 0 24 24" fill="none"><path d="M4.2 17a8.2 8.2 0 1 1 15.6 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="m12 15 3.6-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="15" r="1.3" fill="currentColor"/></svg>',
  };
  const STAT_CHIP_DEFS = [["pages", "صفحات"], ["left", "باقی تقریباً"], ["rate", "فی منٹ صفحات"]];
  const STAT_CHIP_TITLES = { pages: "ڈاؤن لوڈ شدہ صفحات" };
  function buildStatChips(withLabels) {
    withLabels = withLabels !== false;
    const wrap = document.createElement("div");
    wrap.className = "stat-chips";
    wrap.hidden = true;
    STAT_CHIP_DEFS.forEach(([key, label]) => {
      const chip = document.createElement("span");
      chip.className = "stat-chip";
      chip.dataset.chip = key;
      chip.title = STAT_CHIP_TITLES[key] || label;
      chip.innerHTML = withLabels
        ? `<span class="stat-label">${label}</span><span class="stat-icon">${STAT_ICONS[key]}</span><span class="stat-colon">:</span><span class="stat-value">—</span>`
        : `<span class="stat-icon">${STAT_ICONS[key]}</span><span class="stat-value">—</span>`;
      wrap.appendChild(chip);
    });
    return wrap;
  }
  function setStatChips(wrap, values) {
    wrap.querySelectorAll(".stat-chip").forEach((chip) => {
      const v = chip.querySelector(".stat-value");
      const next = values[chip.dataset.chip];
      if (v.textContent !== next) v.textContent = next;
    });
  }
  function buildRowStatChips() { return buildStatChips(false); }
  const statusChips = buildStatChips();
  statusSub.parentNode.insertBefore(statusChips, statusSub);
  const progressFill = document.getElementById("progress-fill");
  const progressTrack = progressFill.parentNode;
  function syncSingleBar() {
    progressTrack.classList.toggle("indeterminate", !(parseFloat(progressFill.style.width) > 0) && !isPausing && !isPaused);
  }
  const runStrip = document.getElementById("run-strip");
  const runStripText = document.getElementById("run-strip-text");
  const runStripPercent = document.getElementById("run-strip-percent");
  const runStripPause = document.getElementById("run-strip-pause");
  function syncRunStrip() {
    try { syncRunStripNow(); } catch (e) { }
  }
  function syncRunStripNow() {
    if (!runStrip) return;
    const live = busyNow && !statusEl.hidden && currentViewName !== "download";
    runStrip.hidden = !live;
    if (!live) return;
    runStripText.textContent = statusText.textContent;
    runStripPercent.textContent = statusPercent.textContent;
    runStripPause.hidden = pauseBtn.hidden;
    runStripPause.textContent = pauseBtnLabel.textContent;
    runStripPause.disabled = pauseBtn.disabled;
  }
  const pauseBtn = document.getElementById("pause-btn");
  const pauseBtnLabel = document.getElementById("pause-btn-label");
  const pauseBtnIcon = document.getElementById("pause-btn-icon");
  const moveToQueueBtn = document.getElementById("move-to-queue-btn");
  if (runStrip) {
    const stripObserver = new MutationObserver(syncRunStrip);
    stripObserver.observe(statusText, { childList: true, characterData: true, subtree: true });
    stripObserver.observe(statusPercent, { childList: true, characterData: true, subtree: true });
    stripObserver.observe(pauseBtnLabel, { childList: true, characterData: true, subtree: true });
    stripObserver.observe(statusEl, { attributes: true, attributeFilter: ["hidden"] });
    stripObserver.observe(pauseBtn, { attributes: true, attributeFilter: ["hidden", "disabled"] });
    runStripPause.addEventListener("click", () => { if (!pauseBtn.disabled) pauseBtn.click(); });
    document.getElementById("run-strip-open").addEventListener("click", () => switchView("download"));
  }
  const discardBtn = document.getElementById("discard-btn");
  const toastEl = document.getElementById("toast");
  const toastIcon = document.getElementById("toast-icon");
  const toastText = document.getElementById("toast-text");
  const toastUndoBtn = document.getElementById("toast-undo");
  let toastTimer = null;
  let undoTick = null;
  const TOAST_ICON_SUCCESS = '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.5" stroke="var(--success)" stroke-width="1.8"/><path d="M8 12.5L10.8 15.3L16 9.5" stroke="var(--success)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const TOAST_ICON_INFO = '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="var(--accent)" stroke-width="1.6"/><path d="M12 11V16.3" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="7.8" r="1" fill="var(--accent)"/></svg>';
  function announce(text) {
    const srLive = document.getElementById("sr-live");
    if (!srLive || !text) return;
    srLive.textContent = "";
    setTimeout(() => { srLive.textContent = String(text).replace(/<[^>]*>/g, ""); }, 60);
  }
  function showToast(text, variant, isHtml, ms) {
    announce(text);
    clearTimeout(toastTimer);
    stopUndoTick();
    toastIcon.innerHTML = variant === "success" ? TOAST_ICON_SUCCESS : TOAST_ICON_INFO;
    if (isHtml) toastText.innerHTML = text;
    else toastText.textContent = text;
    toastUndoBtn.hidden = true;
    toastUndoBtn.onclick = null;
    toastEl.hidden = false;
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms || 4200);
  }
  const UNDO_TOAST_MS = 5000;
  function stopUndoTick() { clearInterval(undoTick); undoTick = null; }
  function showUndoToast(text, onUndo) {
    showToast(text, "info", false, UNDO_TOAST_MS);
    toastUndoBtn.hidden = false;
    const endAt = Date.now() + UNDO_TOAST_MS;
    toastUndoBtn.innerHTML = 'واپس کریں <span class="toast-count"></span>';
    const countEl = toastUndoBtn.querySelector(".toast-count");
    const paintCount = () => {
      const n = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      countEl.textContent = String(n);
      if (n <= 0) stopUndoTick();
    };
    paintCount();
    undoTick = setInterval(paintCount, 250);
    toastUndoBtn.onclick = () => {
      stopUndoTick();
      clearTimeout(toastTimer);
      toastEl.hidden = true;
      toastUndoBtn.hidden = true;
      toastUndoBtn.onclick = null;
      try { onUndo(); } catch (e) { }
    };
  }
  function undoQueueRemoval(name, res, label) {
    if (!res || !res.undo || !res.undo.length) return;
    showUndoToast(label, () => {
      window.pywebview.api.restore_queue_items(name, res.undo).then((r) => {
        if (r && r.restored) showToast(`${r.restored} کتابیں واپس آ گئیں۔`, "success");
      });
    });
  }
  function handleFinished(payload) {
    const n = payload && payload.count ? payload.count : 1;
    showToast(n > 1 ? n + " کتابیں ڈاؤن لوڈ ہو گئیں" : "کتاب ڈاؤن لوڈ ہو گئی", "success");
  }
  const resultEl = document.getElementById("result");
  const resultPath = document.getElementById("result-path");
  const openFolderBtn = document.getElementById("open-folder-btn");
  const openBookBtn = document.getElementById("open-book-btn");
  const resultMissingEl = document.getElementById("result-missing");
  const redownloadBtn = document.getElementById("redownload-btn");
  const addQueueMissingBtn = document.getElementById("addqueue-missing-btn");
  const discardMissingBtn = document.getElementById("discard-missing-btn");
  const errorEl = document.getElementById("error");
  const errorText = document.getElementById("error-text");
  const STAGE_LABELS = {
    info: "کتاب کی معلومات حاصل کی جا رہی ہیں…",
    ratelimit: "ہمیں کچھ دیر رکنے کو کہا گیا ہے؛ وقفے کے بعد کام خود جاری ہو جائے گا…",
    cooldown: "کئی ناکامیوں کے بعد ہم خود کچھ دیر رک رہے ہیں؛ وقفے کے بعد کام خود جاری ہو جائے گا…",
    pages: "صفحات ڈاؤن لوڈ ہو رہے ہیں…",
    pdf: "پی ڈی ایف تیار ہو رہی ہے…",
    exists: "کتاب پہلے سے موجود ہے…",
    verify: "کچھ صفحات دوبارہ چیک کیے جا رہے ہیں…",
    linkcheck: "لنک اور سائٹ کی جانچ ہو رہی ہے…",
    connect: "سائٹ سے رابطہ کیا جا رہا ہے…",
    pageids: "صفحات کی فہرست حاصل کی جا رہی ہے…",
    offline: "انٹرنیٹ نہیں ہے یا سائٹ تک رسائی نہیں ہو رہی؛ بحال ہوتے ہی کام خود جاری ہو جائے گا…",
  };
  const WAIT_STAGES = ["ratelimit", "cooldown"];
  const RESET_WAIT_STAGES = ["offline", "connect", "pageids"];
  const SLOW_HINT_STAGES = ["connect", "info", "pageids"];
  const SLOW_HINT_MS = 8000;
  const waitDeadlines = new Map();
  let waitTicker = null;
  let singleStageSince = Date.now();
  let singleStageKey = "";
  let singleLastMessage = null;
  function setWaitDeadline(key, secs) {
    if (!(secs > 0)) return;
    waitDeadlines.set(key, Date.now() + secs * 1000);
    ensureWaitTicker();
  }
  function waitLeft(key) {
    const until = waitDeadlines.get(key);
    if (!until) return 0;
    const left = Math.ceil((until - Date.now()) / 1000);
    if (left <= 0) { waitDeadlines.delete(key); return 0; }
    return left;
  }
  function waitLabel(left) { return `سائٹ کی طرف سے وقفہ: ${left} سیکنڈ بعد دوبارہ کوشش ہو گی…`; }
  function noteWaitFromItem(item) {
    const key = "q:" + item.id;
    if (RESET_WAIT_STAGES.indexOf(item.stage) >= 0) waitDeadlines.delete(key);
    else if (item.wait_s > 0) setWaitDeadline(key, item.wait_s);
  }
  function singleStatusText(stage, message) {
    const left = waitLeft("single");
    if (left > 0) return waitLabel(left);
    let t = ((stage === "verify" || stage === "linkcheck") && message) ? message : (STAGE_LABELS[stage] || stage);
    if (SLOW_HINT_STAGES.indexOf(stage) >= 0 && Date.now() - singleStageSince > SLOW_HINT_MS) {
      t += " سائٹ سے جواب میں دیر لگ رہی ہے؛ انتظار جاری ہے۔";
    }
    return t;
  }
  function ensureWaitTicker() {
    if (waitTicker) return;
    waitTicker = setInterval(tickWaits, 1000);
  }
  function tickWaits() {
    const single = !statusEl.hidden && !isPausing && !isPaused;
    if (single && errorEl.hidden) statusText.textContent = singleStatusText(lastKnownStage, singleLastMessage);
    ["primary", "secondary"].forEach((name) => {
      const st = queueState[name];
      if (!st) return;
      st.itemsById.forEach((item, id) => {
        if (item.status !== "downloading") return;
        const li = st.rowEls.get(id);
        const stats = li && li.querySelector(".queue-row-stats");
        if (!stats || stats.hidden || !stats.lastChild) return;
        const note = rowNoteText(item);
        if (stats.lastChild.textContent !== note) stats.lastChild.textContent = note;
      });
    });
    if (!waitDeadlines.size && !(single && SLOW_HINT_STAGES.indexOf(lastKnownStage) >= 0)) {
      clearInterval(waitTicker);
      waitTicker = null;
    }
  }
  const navIconDownload = document.getElementById("nav-icon-download");
  const navIconQueue = document.getElementById("nav-icon-queue");
  function setNavIconAnimating(el, on) {
    if (el) el.classList.toggle("is-animating", !!on);
  }
  function show(el) { el.hidden = false; }
  function hide(el) { el.hidden = true; }
  function resetDownloadPanels() {
    hide(resultEl);
    hide(errorEl);
  }
  function setBusy(busy) {
    busyNow = busy;
    if (typeof syncRunStrip === "function") queueMicrotask(syncRunStrip);
    downloadBtn.disabled = busy || !apiReady || !engineReady;
    urlInput.readOnly = busy;
    urlInput.setAttribute("aria-readonly", busy ? "true" : "false");
    if (urlInputField) urlInputField.classList.toggle("is-locked", busy);
    if (sampleBookBtn) sampleBookBtn.disabled = busy || !apiReady || !engineReady;
  }
  const downloadBtnLabel = downloadBtn.querySelector(".btn-label");
  const DOWNLOAD_BTN_TEXT = downloadBtnLabel ? downloadBtnLabel.textContent : "";
  const MSG_ENGINE_LOADING = "ایپ ابھی تیار ہو رہی ہے؛ چند لمحے بعد دوبارہ کوشش کریں۔";
  const MSG_ENGINE_FAILED = "ایپ کے ضروری اجزا لوڈ نہیں ہو سکے۔ ایپ دوبارہ کھولیں؛ مسئلہ رہے تو ترتیبات سے رپورٹ بنا کر بھیجیں۔";
  function setEngineState(state) {
    if (state === engineState && (state !== "ready" || engineReady)) return;
    engineState = state;
    engineReady = state === "ready";
    if (downloadBtnLabel) {
      downloadBtnLabel.textContent = engineReady ? DOWNLOAD_BTN_TEXT : (state === "failed" ? "اجزا لوڈ نہیں ہوئے" : "تیار ہو رہا ہے…");
    }
    setBusy(busyNow);
    if (state === "failed") showToast(MSG_ENGINE_FAILED);
  }
  let engineWatchTimer = null;
  function watchEngine() {
    if (engineReady || engineWatchTimer) return;
    const poll = () => {
      engineWatchTimer = null;
      window.pywebview.api.get_engine_state().then((st) => {
        if (st === "ready" || st === "failed") setEngineState(st);
        else engineWatchTimer = setTimeout(poll, 300);
      }).catch(() => { engineWatchTimer = setTimeout(poll, 500); });
    };
    poll();
  }
  function armSettleTimer() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settlePaused, SETTLE_QUIET_MS);
  }
  function settlePaused() {
    if (KT) KT.ev("pause_settled", {});
    clearTimeout(settleTimer);
    isPausing = false;
    isPaused = true;
    pauseBtn.disabled = false;
    pauseBtnLabel.textContent = "جاری رکھیں";
    pauseBtnIcon.innerHTML = ICON_PLAY_SM;
    statusIcon.classList.remove("spin");
    setNavIconAnimating(navIconDownload, false);
    syncSingleBar();
    statusText.textContent = "ڈاؤن لوڈنگ روک دی گئی۔";
  }
  function enterAutoPause(message) {
    clearTimeout(settleTimer);
    isPausing = false;
    isPaused = true;
    pauseBtn.disabled = false;
    pauseBtnLabel.textContent = "جاری رکھیں";
    pauseBtnIcon.innerHTML = ICON_PLAY_SM;
    statusIcon.classList.remove("spin");
    setNavIconAnimating(navIconDownload, false);
    syncSingleBar();
    statusText.textContent = message;
    show(statusEl);
    show(pauseBtn);
  }
  const ETA_SAMPLES = 20;
  const etaSamples = new Map();
  function etaFeed(key, stage, current, total, now) {
    now = now === undefined ? Date.now() : now;
    if (stage !== "pages" || !(total > 0) || !(current >= 0)) { etaSamples.delete(key); return null; }
    let rec = etaSamples.get(key);
    if (!rec || current < rec.last) { rec = { last: -1, pts: [] }; etaSamples.set(key, rec); }
    if (current !== rec.last) {
      rec.last = current;
      rec.pts.push([now, current]);
      if (rec.pts.length > ETA_SAMPLES) rec.pts.shift();
    }
    const rate = etaRate(rec);
    if (!rate) return null;
    return { rate, left: Math.max(0, total - current) / rate, perMin: Math.max(1, Math.round(rate * 60)) };
  }
  function etaRate(rec) {
    const n = rec ? rec.pts.length : 0;
    if (n < 4) return 0;
    const dt = (rec.pts[n - 1][0] - rec.pts[0][0]) / 1000;
    const dp = rec.pts[n - 1][1] - rec.pts[0][1];
    if (dt < 3 || dp <= 0) return 0;
    return dp / dt;
  }
  function etaValue(left) {
    if (left < 59.5) return `${Math.max(1, Math.round(left))} سیکنڈ`;
    const m = left / 60;
    if (m < 10) return `${Math.round(m * 2) / 2} منٹ`;
    if (m < 999.5) return `${Math.round(m)} منٹ`;
    return "999+ منٹ";
  }
  function etaWhen(left) { return "تقریباً " + etaValue(left); }
  function singleChipValues(current, total, info) {
    return { pages: `\u2066${current} / ${total}\u2069`,
      left: info ? etaValue(info.left) : "—", rate: info ? String(info.perMin) : "—" };
  }
  function rowChipValues(item, info) {
    const hasPages = item.total > 0 && item.stage && item.stage !== "info";
    return hasPages ? singleChipValues(item.current, item.total, info) : { pages: "—", left: "—", rate: "—" };
  }
  const lastChipValues = new Map();
  function keepLastChips(id, values, isLive) {
    if (!isLive) { lastChipValues.delete(id); return values; }
    const mem = lastChipValues.get(id) || {};
    const out = {};
    Object.keys(values).forEach((k) => {
      if (values[k] !== "—") { mem[k] = values[k]; out[k] = values[k]; }
      else out[k] = mem[k] !== undefined ? mem[k] : "—";
    });
    lastChipValues.set(id, mem);
    return out;
  }
  function queueTotalNote(items) {
    const cur = items.find((i) => i.status === "downloading");
    if (!cur) return "";
    const pending = items.filter((i) => i.status === "pending").length;
    if (!pending) return "";
    if (cur.stage !== "pages" || !(cur.total > 0)) return "";
    const rate = etaRate(etaSamples.get("q:" + cur.id));
    if (!rate) return `${pending} کتابیں انتظار میں`;
    const pages = Math.max(0, cur.total - cur.current) + pending * cur.total;
    return `${pending} کتابیں انتظار میں · کل ${etaWhen(pages / rate)} (اندازہ، وقفے شامل نہیں)`;
  }
  function handleDownloadProgress(payload) {
    if (payload.stage === "diskfull_images" || payload.stage === "diskfull_pdf") {
      enterAutoPause(payload.message);
      return;
    }
    if (payload.stage === "paused") {
      if (isPausing) armSettleTimer();
      return;
    }
    if (payload.stage === "paused_ack") {
      if (isPausing) settlePaused();
      return;
    }
    if (WAIT_STAGES.indexOf(payload.stage) >= 0) setWaitDeadline("single", Number(payload.message));
    else if (RESET_WAIT_STAGES.indexOf(payload.stage) >= 0) waitDeadlines.delete("single");
    if (WAIT_STAGES.indexOf(payload.stage) < 0 && payload.stage !== singleStageKey) {
      singleStageKey = payload.stage;
      singleStageSince = Date.now();
    }
    singleLastMessage = payload.message;
    if (SLOW_HINT_STAGES.indexOf(payload.stage) >= 0) ensureWaitTicker();
    let sub = "";
    let chipValues = null;
    if (payload.stage === "pages") {
      chipValues = singleChipValues(payload.current, payload.total, etaFeed("single", "pages", payload.current, payload.total));
      checkFreeSpace("single:" + (payload.total || 0), payload.total);
    }
    else if (payload.stage === "pdf") sub = `${ltrIso(`${payload.current} / ${payload.total}`)} صفحات پی ڈی ایف میں شامل ہوئے`;
    else if (payload.stage === "warning") sub = `${payload.current} صفحات میں مسئلہ آیا، باقی کتاب مکمل ہے`;
    else if (payload.stage === "verify" && payload.total) sub = `${ltrIso(`${payload.current} / ${payload.total}`)} صفحات`;
    show(statusEl);
    show(pauseBtn);
    if (payload.percent !== null && payload.percent !== undefined) {
      statusPercent.textContent = payload.percent + "%";
      setSingleFill(payload.percent);
    }
    syncSingleBar();
    if (chipValues) {
      setStatChips(statusChips, chipValues);
      statusChips.hidden = false;
      statusSub.textContent = "";
    } else {
      statusChips.hidden = true;
      statusSub.textContent = sub;
    }
    if (isPausing) {
      statusText.textContent = "ڈاؤن لوڈنگ روکی جا رہی ہے…";
      return;
    }
    if (isPaused) {
      lastKnownStage = payload.stage;
      lastKnownSub = sub;
      return;
    }
    lastKnownStage = payload.stage;
    lastKnownSub = sub;
    statusIcon.classList.add("spin");
    setNavIconAnimating(navIconDownload, true);
    statusText.textContent = singleStatusText(payload.stage, payload.message);
  }
  function resetPauseState() {
    waitDeadlines.delete("single");
    singleStageKey = "";
    clearTimeout(settleTimer);
    isPaused = false;
    isPausing = false;
    isRestoredSingle = false;
    pauseBtn.disabled = false;
    pauseBtnLabel.textContent = "روکیں";
    pauseBtnIcon.innerHTML = ICON_PAUSE_SM;
    setNavIconAnimating(navIconDownload, false);
  }
  function resetDownloadView() {
    forgetSingleSpace();
    urlInput.value = "";
    hide(statusEl);
    hide(resultEl);
    hide(resultMissingEl);
    hide(errorEl);
    resetPauseState();
    setBusy(false);
  }
  function handleMovedToQueue() {
    resetDownloadView();
    showToast("فائل حالیہ قطار میں منتقل کر دی گئی۔", "success");
  }
  function handleDownloadDone(payload) {
    hide(statusEl);
    hide(pauseBtn);
    hide(resultMissingEl);
    lastResult = payload;
    resultPath.textContent = payload.path;
    show(resultEl);
    setBusy(false);
    resetPauseState();
    const autoOpen = document.getElementById("auto-open-toggle");
    if (autoOpen && autoOpen.getAttribute("aria-checked") === "true" && payload.path) window.pywebview.api.open_file(payload.path);
  }
  function handleDownloadError(payload) {
    if (payload && payload.action === "enter_code" && typeof refreshAccount === "function") {
      refreshAccount().then(() => { codeAsked = false; maybeOfferCode(); });
    }
    hide(statusEl);
    hide(pauseBtn);
    errorText.textContent = payload.message;
    const errUpdateBtn = document.getElementById("error-update-btn");
    if (errUpdateBtn) errUpdateBtn.hidden = !(payload && payload.action === "update_app");
    show(errorEl);
    setBusy(false);
    resetPauseState();
  }
  function showMissingFileUI() {
    hide(resultEl);
    show(resultMissingEl);
  }
  let isRestoredSingle = false;
  function beginDownload(url, resumeFromPercent) {
    url = ensureUrlScheme((url || "").trim());
    const verdict = classifyBookUrl(url);
    if (verdict === "bad-domain") { handleDownloadError({ message: MSG_BAD_DOMAIN }); return; }
    if (verdict !== "ok") { handleDownloadError({ message: MSG_BAD_PAGE }); return; }
    if (!apiReady) return;
    if (!engineReady) { showToast(engineState === "failed" ? MSG_ENGINE_FAILED : MSG_ENGINE_LOADING); return; }
    lastDownloadedUrl = url;
    resetDownloadPanels();
    hide(resultMissingEl);
    setBusy(true);
    resetPauseState();
    lastKnownStage = "info";
    lastKnownSub = "";
    show(statusEl);
    show(pauseBtn);
    statusIcon.classList.add("spin");
    setNavIconAnimating(navIconDownload, true);
    statusText.textContent = STAGE_LABELS.info;
    const startPercent = resumeFromPercent || 0;
    statusPercent.textContent = startPercent + "%";
    setSingleFill(startPercent);
    syncSingleBar();
    statusSub.textContent = "";
    statusChips.hidden = true;
    singleDiscarded = false;
    window.pywebview.api.start_download(url).then((res) => {
      if (!res || !res.ok) handleDownloadError({ message: (res && res.error) || "ڈاؤن لوڈ شروع نہیں ہو سکا۔" });
    });
  }
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (busyNow) return;
    const url = urlInput.value.trim();
    if (!url) { handleDownloadError({ message: "براہ کرم کتاب کا لنک درج کریں۔" }); return; }
    beginDownload(url);
  });
  if (sampleBookBtn) {
    sampleBookBtn.addEventListener("click", function () {
      if (busyNow || !apiReady || !engineReady) return;
      window.pywebview.api.get_sample_book_url().then(function (url) {
        if (!url) return;
        urlInput.value = url;
        beginDownload(url);
      });
    });
  }
  pauseBtn.addEventListener("click", function () {
    if (isPaused) {
      if (isRestoredSingle) {
        const resumePercent = parseInt(statusPercent.textContent, 10) || 0;
        isRestoredSingle = false;
        beginDownload(lastDownloadedUrl, resumePercent);
        return;
      }
      window.pywebview.api.resume_download();
      isPaused = false;
      isPausing = false;
      clearTimeout(settleTimer);
      pauseBtnLabel.textContent = "روکیں";
      pauseBtnIcon.innerHTML = ICON_PAUSE_SM;
      statusIcon.classList.add("spin");
      setNavIconAnimating(navIconDownload, true);
      statusText.textContent = STAGE_LABELS[lastKnownStage] || "جاری ہے…";
      statusSub.textContent = lastKnownSub;
      syncSingleBar();
    } else if (!isPausing) {
      isPausing = true;
      pauseBtn.disabled = true;
      statusText.textContent = "ڈاؤن لوڈنگ روکی جا رہی ہے…";
      syncSingleBar();
      armSettleTimer();
      window.pywebview.api.pause_download();
    }
  });
  moveToQueueBtn.addEventListener("click", () => {
    window.pywebview.api.move_to_queue();
  });
  if (urlClearBtn) {
    urlClearBtn.addEventListener("click", () => {
      if (!busyNow) { resetDownloadView(); urlInput.focus(); return; }
      confirmAction("یہ کتاب ابھی ڈاؤن لوڈ ہو رہی ہے، کیا آپ واقعی اسے خارج کرنا چاہتے ہیں؟", () => {
        const done = () => { resetDownloadView(); urlInput.focus(); };
        let p = null;
        singleDiscarded = true;
        try { p = window.pywebview.api.discard_download(); } catch (e) { p = null; }
        if (p && typeof p.then === "function") p.then(done, done); else done();
      });
    });
  }
  discardBtn.addEventListener("click", () => {
    if (isPaused) {
      singleDiscarded = true;
      window.pywebview.api.discard_download();
      resetDownloadView();
    } else {
      confirmAction("یہ کتاب ابھی ڈاؤن لوڈ ہو رہی ہے، کیا آپ واقعی اسے خارج کرنا چاہتے ہیں؟", () => {
        singleDiscarded = true;
        window.pywebview.api.discard_download();
        resetDownloadView();
      });
    }
  });
  openFolderBtn.addEventListener("click", () => {
    if (!lastResult) return;
    window.pywebview.api.reveal_in_folder(lastResult.path).then((res) => {
      if (!res || !res.ok) showMissingFileUI();
    });
  });
  openBookBtn.addEventListener("click", () => {
    if (!lastResult) return;
    window.pywebview.api.open_file(lastResult.path).then((res) => {
      if (!res || !res.ok) showMissingFileUI();
    });
  });
  redownloadBtn.addEventListener("click", () => {
    hide(resultMissingEl);
    if (lastDownloadedUrl) {
      urlInput.value = lastDownloadedUrl;
      beginDownload(lastDownloadedUrl);
    }
  });
  addQueueMissingBtn.addEventListener("click", () => {
    if (!lastDownloadedUrl) return;
    window.pywebview.api.add_queue_items(lastDownloadedUrl).then((res) => {
      resetDownloadView();
      toastSingleAdd(res, "لنک قطار میں شامل کر دیا گیا۔");
    });
  });
  discardMissingBtn.addEventListener("click", () => {
    resetDownloadView();
  });
  const STATUS_LABEL = { pending: "زیرِ التوا", downloading: "جاری ہے", paused: "رکا ہوا", done: "مکمل", error: "ناکام" };
  const MSG_QUEUE_FILE_MISSING = "فائل اپنی جگہ سے ہٹا دی گئی ہے۔ دوبارہ ڈاؤن لوڈ کے لیے «دوبارہ کوشش» دبائیں";
  const MSG_HISTORY_FILE_MISSING = "فائل اپنی جگہ سے ہٹا دی گئی ہے۔";
  const TITLE_LOWER_WORDS = new Set(["e", "aur", "o"]);
  function slugToTitle(slug) {
    return slug
      .split("-")
      .filter((w) => w.length > 0)
      .map((w) => {
        const lw = w.toLowerCase();
        if (TITLE_LOWER_WORDS.has(lw)) return lw;
        return lw.charAt(0).toUpperCase() + lw.slice(1);
      })
      .join(" ");
  }
  function prettifySlug(slug) {
    if (!slug) return slug;
    if (slug.indexOf("-") === -1 && slug.indexOf(" ") !== -1) {
      return slug;
    }
    const cleaned = slug.replace(/-ebooks?-?\d*$/i, "");
    return slugToTitle(cleaned) || slug;
  }
  function guessTitleFromUrl(url) {
    try {
      const u = new URL(ensureUrlScheme(url));
      const path = u.pathname
        .replace(/^\/ebooks\/detail\//i, "")
        .replace(/^\/ebooks\//i, "")
        .replace(/\/+$/, "");
      return prettifySlug(path) || url;
    } catch (e) {
      return url;
    }
  }
  function displayTitleFor(item) {
    return item.title ? prettifySlug(item.title) : guessTitleFromUrl(item.url);
  }
  function formatUrlDisplay(url) {
    try {
      const u = new URL(ensureUrlScheme(url));
      let rest = u.pathname.replace(/^\/ebooks\/detail\//i, "/").replace(/^\/ebooks\//i, "/");
      if (!rest.startsWith("/")) rest = "/" + rest;
      return "…" + rest + u.search;
    } catch (e) {
      return url;
    }
  }
  const queueBulkForm = document.getElementById("queue-bulk-form");
  const queueBulkText = document.getElementById("queue-bulk-text");
  const queueBulkPlaceholder = document.getElementById("queue-bulk-placeholder");
  function syncBulkPlaceholder() {
    queueBulkPlaceholder.classList.toggle("is-hidden", queueBulkText.value.length > 0);
  }
  queueBulkText.addEventListener("input", syncBulkPlaceholder);
  queueBulkForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = queueBulkText.value.trim();
    if (!raw) return;
    const candidates = raw.split(/\s+/).filter(Boolean);
    const valid = [];
    let badDomain = 0, badPage = 0;
    candidates.forEach((c) => {
      const schemed = ensureUrlScheme(c);
      const verdict = classifyBookUrl(schemed);
      if (verdict === "ok") valid.push(schemed);
      else if (verdict === "bad-domain") badDomain++;
      else badPage++;
    });
    const announceSkips = (duplicates) => {
      const total = badDomain + badPage + duplicates;
      if (!total) return;
      const linker = total === 1 ? "کا" : "کے";
      const parts = [];
      if (badDomain) parts.push(`${badDomain} غلط ویب سائٹ ${linker}`);
      if (badPage) parts.push(`${badPage} غیر کتابی صفحے ${linker}`);
      if (duplicates) parts.push(`${duplicates} پہلے سے قطار میں موجود`);
      const tail = total === 1 ? "لنک نظرانداز کر دیا گیا۔" : "لنکس نظرانداز کر دیے گئے۔";
      showToast(parts.join("، ") + " " + tail);
    };
    if (valid.length) {
      window.pywebview.api.add_queue_items(valid.join("\n")).then((res) => {
        queueBulkText.value = "";
        syncBulkPlaceholder();
        announceSkips(res && res.duplicates ? res.duplicates : 0);
      });
    } else {
      announceSkips(0);
    }
  });
  const primarySection = document.getElementById("queue-section-primary");
  const secondarySection = document.getElementById("queue-section-secondary");
  const primaryHeaderZone = document.querySelector('.queue-header-zone--primary');
  const secondaryHeaderZone = document.querySelector('.queue-header-zone--secondary');
  function setExpandedQueue(name) {
    const expandSec = name === "primary" ? primarySection : secondarySection;
    const collapseSec = name === "primary" ? secondarySection : primarySection;
    const expandZone = name === "primary" ? primaryHeaderZone : secondaryHeaderZone;
    const collapseZone = name === "primary" ? secondaryHeaderZone : primaryHeaderZone;
    expandSec.classList.remove("is-collapsed");
    expandSec.classList.add("is-expanded");
    expandZone.classList.add("is-active");
    expandZone.setAttribute("aria-expanded", "true");
    collapseSec.classList.add("is-collapsed");
    collapseSec.classList.remove("is-expanded");
    collapseZone.classList.remove("is-active");
    collapseZone.setAttribute("aria-expanded", "false");
    const shape = document.getElementById("queue-tab-shape");
    if (shape) shape.dataset.active = name;
  }
  let headerHoldRaf = 0;
  const holdSpacer = document.getElementById("queue-hold-spacer");
  function holdHeaderPosition(zone) {
    const host = document.querySelector(".content");
    const startTop = zone.getBoundingClientRect().top;
    const startScroll = host.scrollTop;
    const until = performance.now() + 450;
    cancelAnimationFrame(headerHoldRaf);
    (function step() {
      const natural = host.scrollHeight - holdSpacer.offsetHeight;
      holdSpacer.style.height = Math.max(0, Math.ceil(startScroll + host.clientHeight - natural)) + "px";
      const d = zone.getBoundingClientRect().top - startTop;
      if (Math.abs(d) >= 0.5) host.scrollTo({ top: host.scrollTop + d, behavior: "instant" });
      if (performance.now() < until) headerHoldRaf = requestAnimationFrame(step);
    })();
  }
  document.querySelector(".content").addEventListener("scroll", () => {
    const h = holdSpacer.offsetHeight;
    if (h && performance.now() > 0) {
      const host = document.querySelector(".content");
      if (host.scrollTop + host.clientHeight <= host.scrollHeight - h) holdSpacer.style.height = "0px";
    }
  }, { passive: true });
  document.querySelectorAll(".queue-header-zone").forEach((zone) => {
    zone.addEventListener("click", () => {
      holdHeaderPosition(zone);
      const name = zone.dataset.queue;
      const clickedSection = name === "primary" ? primarySection : secondarySection;
      const isCurrentlyExpanded = !clickedSection.classList.contains("is-collapsed");
      setExpandedQueue(isCurrentlyExpanded ? (name === "primary" ? "secondary" : "primary") : name);
    });
  });
  const queueState = {
    primary: { rowEls: new Map(), itemsById: new Map(), selected: new Set(), draggedId: null, list: document.getElementById("primary-list"), pendingFlightIds: new Set() },
    secondary: { rowEls: new Map(), itemsById: new Map(), selected: new Set(), draggedId: null, list: document.getElementById("secondary-list"), pendingFlightIds: new Set() },
  };
  let lastMode = "idle";
  function animateReorder(listEl, mutate) {
    const rows = Array.from(listEl.children);
    const firstRects = new Map(rows.map((r) => [r, r.getBoundingClientRect()]));
    mutate();
    const moved = [];
    Array.from(listEl.children).forEach((r) => {
      const first = firstRects.get(r);
      if (!first) return;
      const last = r.getBoundingClientRect();
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      if (dx || dy) moved.push([r, dx, dy]);
    });
    if (!moved.length) return;
    moved.forEach(([r, dx, dy]) => {
      r.style.transition = "none";
      r.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    listEl.getBoundingClientRect();
    requestAnimationFrame(() => {
      moved.forEach(([r]) => {
        r.style.transition = "transform 0.2s ease";
        r.style.transform = "";
      });
    });
  }
  function wireQueueContainer(name) {
    const st = queueState[name];
    st.list.addEventListener("dragover", (e) => {
      if (!st.draggedId || e.target !== st.list) return;
      e.preventDefault();
      const draggedLi = st.rowEls.get(st.draggedId);
      if (draggedLi && draggedLi.parentElement === st.list && st.list.lastElementChild !== draggedLi) {
        animateReorder(st.list, () => st.list.appendChild(draggedLi));
      }
    });
    st.list.addEventListener("drop", (e) => e.preventDefault());
  }
  wireQueueContainer("primary");
  wireQueueContainer("secondary");
  function isSelectable(li) {
    return li.dataset.status !== "downloading" && li.dataset.status !== "done" && li.dataset.status !== "error";
  }
  function updateSelectAllCheckbox(name) {
    const st = queueState[name];
    const selectableIds = Array.from(st.rowEls.keys()).filter((id) => isSelectable(st.rowEls.get(id)));
    const box = document.getElementById(name + "-select-all");
    const selectedCount = selectableIds.filter((id) => st.selected.has(id)).length;
    box.checked = selectableIds.length > 0 && selectedCount === selectableIds.length;
    box.indeterminate = selectedCount > 0 && selectedCount < selectableIds.length;
    const moveBtn = document.getElementById(name + "-move-btn");
    const otherRunning = name === "primary" && lastMode === "running";
    moveBtn.disabled = st.selected.size === 0 || otherRunning;
  }
  document.getElementById("primary-select-all").addEventListener("change", (e) => toggleSelectAll("primary", e.target.checked));
  document.getElementById("secondary-select-all").addEventListener("change", (e) => toggleSelectAll("secondary", e.target.checked));
  function toggleSelectAll(name, checked) {
    const st = queueState[name];
    st.rowEls.forEach((li, id) => {
      if (!isSelectable(li)) return;
      const cb = li.querySelector(".queue-row-check");
      cb.checked = checked;
      if (checked) st.selected.add(id); else st.selected.delete(id);
    });
    updateSelectAllCheckbox(name);
  }
  document.getElementById("primary-move-btn").addEventListener("click", () => moveSelected("primary", "secondary"));
  document.getElementById("secondary-move-btn").addEventListener("click", () => moveSelected("secondary", "primary"));
  function moveSelected(from, to) {
    const st = queueState[from];
    const ids = Array.from(st.selected);
    if (!ids.length) return;
    const flight = flyToQueue(from + "-badge", to + "-badge");
    st.flight = flight;
    ids.forEach((id) => st.pendingFlightIds.add(id));
    window.pywebview.api.move_items(ids, from, to).then((res) => {
      st.selected.clear();
      if (res && res.ok && res.moved) {
        const toLabel = to === "primary" ? "حالیہ قطار" : "ثانوی قطار";
        const msg = res.moved === 1
          ? `1 کتاب ${toLabel} میں منتقل کر دی گئی۔`
          : `${res.moved} کتابیں ${toLabel} میں منتقل کر دی گئیں۔`;
        flight.then(() => showToast(msg, "success"));
      }
    });
  }
  function clearQueueWithUndo(name, labelName) {
    const st = queueState[name];
    const busy = Array.from(st.itemsById.values()).some((it) => it.status === "downloading" || it.status === "paused");
    const run = () => window.pywebview.api.clear_queue(name).then((res) => undoQueueRemoval(name, res, `${labelName} کی فہرست صاف ہو گئی۔`));
    if (busy) confirmAction(`${labelName} میں ڈاؤن لوڈ ہوتی/رکی ہوئی کتاب بھی ہے۔ کیا فہرست صاف کریں؟`, run);
    else run();
  }
  document.getElementById("primary-clear-btn").addEventListener("click", () => clearQueueWithUndo("primary", "حالیہ قطار"));
  document.getElementById("secondary-clear-btn").addEventListener("click", () => clearQueueWithUndo("secondary", "ثانوی قطار"));
  document.getElementById("primary-retry-btn").addEventListener("click", () => {
    window.pywebview.api.retry_all_failed("primary").then((res) => {
      if (res && res.retried) showToast(`${res.retried} کتابیں دوبارہ کوشش کے لیے شامل کر دی گئیں۔`, "success");
    });
  });
  const primaryStartBtn = document.getElementById("primary-start-btn");
  const primaryStartIcon = document.getElementById("primary-start-icon");
  const primaryStartLabel = document.getElementById("primary-start-label");
  primaryStartBtn.addEventListener("click", () => {
    if (lastMode === "running") {
      window.pywebview.api.pause_primary_queue();
    } else {
      window.pywebview.api.start_primary_queue().then((res) => {
        if (res && !res.ok && res.error) showToast(res.error);
      });
    }
  });
  function refreshQueues(state) {
    if (!state) return;
    lastMode = state.mode;
    setNavIconAnimating(navIconQueue, state.mode === "running");
    renderQueueList("primary", state.primary || []);
    renderQueueList("secondary", state.secondary || []);
    const incomplete = (list) => list.filter((i) => i.status !== "done").length;
    setBadge("primary-badge", incomplete(state.primary || []));
    setBadge("secondary-badge", incomplete(state.secondary || []));
    refreshQueueSlot();
    primaryStartLabel.textContent = state.mode === "running" ? "قطار روکیں" : "قطار چلائیں";
    primaryStartIcon.innerHTML = state.mode === "running" ? ICON_PAUSE_SM : ICON_QUEUE_PLAY;
    const hasRunnable = (state.primary || []).some((i) => i.status === "pending" || i.status === "paused");
    primaryStartBtn.disabled = state.mode !== "running" && !hasRunnable;
    const primaryHasErrors = (state.primary || []).some((i) => i.status === "error");
    document.getElementById("primary-retry-btn").hidden = !primaryHasErrors;
    updateSelectAllCheckbox("primary");
    updateSelectAllCheckbox("secondary");
  }
  function handleItemProgress(payload) {
    const list = (payload && payload.items) || [];
    list.forEach((p) => {
      ["primary", "secondary"].forEach((name) => {
        const st = queueState[name];
        const item = st.itemsById.get(p.id);
        const li = st.rowEls.get(p.id);
        if (!item || !li) return;
        item.status = p.status; item.stage = p.stage; item.percent = p.percent;
        item.current = p.current; item.total = p.total;
        if ("pause_acked" in p) item.pause_acked = p.pause_acked;
        if (p.title) item.title = p.title;
        if (p.stage === "pages" && p.total) checkFreeSpace("q:" + p.id, p.total);
        updateQueueRow(name, li, item);
      });
    });
    refreshQueueTotal();
  }
  const queueTotalEl = document.getElementById("queue-total-note");
  function refreshQueueTotal() {
    if (!queueTotalEl) return;
    const st = queueState.primary;
    const txt = queueTotalNote(Array.from(st.itemsById.values()));
    queueTotalEl.hidden = !txt;
    if (queueTotalEl.dataset.txt === txt) return;
    queueTotalEl.dataset.txt = txt;
    const m = /^(.*?) · کل (.*?) (\(.*\))$/.exec(txt);
    queueTotalEl.textContent = "";
    if (!m) { queueTotalEl.textContent = txt; return; }
    [[m[1] + " · کل", "qt-pend"], [m[2], "qt-val"], [m[3], "qt-tail"]].forEach(([t, cls], i) => {
      const sp = document.createElement("span");
      sp.className = cls;
      sp.textContent = t;
      if (i) queueTotalEl.appendChild(document.createTextNode(" "));
      queueTotalEl.appendChild(sp);
    });
  }
  function setBadge(id, count) {
    const el = document.getElementById(id);
    el.hidden = false;
    el.textContent = count;
    el.classList.toggle("is-zero", count === 0);
  }
  function collapseAndRemoveAll(lis) {
    if (!lis.length) return;
    const heights = lis.map((li) => li.getBoundingClientRect().height);
    lis.forEach((li, i) => {
      li.style.overflow = "hidden";
      li.style.height = heights[i] + "px";
    });
    lis[0].getBoundingClientRect();
    requestAnimationFrame(() => {
      lis.forEach((li) => {
        li.style.transition = "height 0.22s ease, opacity 0.18s ease, padding 0.22s ease, border-width 0.22s ease, margin 0.22s ease";
        li.style.height = "0px";
        li.style.opacity = "0";
        li.style.paddingTop = "0px";
        li.style.paddingBottom = "0px";
        li.style.marginTop = "0px";
        li.style.marginBottom = "0px";
        li.style.borderTopWidth = "0px";
        li.style.borderBottomWidth = "0px";
      });
    });
    setTimeout(() => lis.forEach((li) => li.remove()), 240);
  }
  function collapseAndRemove(li) { collapseAndRemoveAll([li]); }
  function renderQueueList(name, items) {
    const st = queueState[name];
    const emptyEl = document.getElementById(name + "-empty");
    if (st.draggedId) {
      const draggedItem = items.find((i) => i.id === st.draggedId);
      if (!draggedItem || draggedItem.status === "downloading") st.draggedId = null;
    }
    const seen = new Set();
    const liveIds = new Set(items.map((i) => String(i.id)));
    const nextLive = (n) => { while (n && !liveIds.has(n.dataset.id)) n = n.nextElementSibling; return n; };
    let cursor = nextLive(st.list.firstElementChild);
    st.itemsById.clear();
    items.forEach((item) => {
      seen.add(item.id);
      st.itemsById.set(item.id, item);
      let li = st.rowEls.get(item.id);
      if (!li) {
        li = buildQueueRow(name, item);
        st.rowEls.set(item.id, li);
      } else {
        updateQueueRow(name, li, item);
      }
      if (li === cursor) cursor = nextLive(cursor.nextElementSibling);
      else st.list.insertBefore(li, cursor);
    });
    for (const [id, li] of st.rowEls.entries()) {
      if (!seen.has(id)) {
        st.rowEls.delete(id);
        st.selected.delete(id);
        if (st.pendingFlightIds.has(id)) {
          st.pendingFlightIds.delete(id);
          li.style.transition = "opacity 0.15s ease";
          li.style.opacity = "0";
          li.style.pointerEvents = "none";
          const fl = st.flight || Promise.resolve();
          Promise.race([fl, new Promise((r) => setTimeout(r, CHASE_GUARD_MS))]).then(() => collapseAndRemove(li));
        } else {
          collapseAndRemove(li);
        }
      }
    }
    emptyEl.hidden = st.list.children.length !== 0;
    syncSearchQueuedCards();
    if (name === "primary") refreshQueueTotal();
    refreshQueueUpdateBar();
  }
  function rowNoteText(item) {
    if (item.status === "paused") return item.pause_acked === false ? "ڈاؤن لوڈنگ روکی جا رہی ہے…" : "ڈاؤن لوڈنگ روک دی گئی۔";
    const left = item.status === "downloading" ? waitLeft("q:" + item.id) : 0;
    if (left > 0) return waitLabel(left);
    return STAGE_LABELS[item.stage] || (item.stage ? "جاری ہے…" : STAGE_LABELS.info);
  }
  let naturalChipsW = 0;
  function measureNaturalChipsW() {
    const holder = document.createElement("div");
    holder.className = "queue-row-stats";
    holder.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;width:max-content;max-width:none;left:-9999px;top:0";
    const probe = buildRowStatChips();
    probe.hidden = false;
    probe.style.maxWidth = "none";
    setStatChips(probe, { pages: "21 / 511", left: "35 سیکنڈ", rate: "96" });
    holder.appendChild(probe);
    document.body.appendChild(holder);
    const w = probe.getBoundingClientRect().width;
    holder.remove();
    return w;
  }
  function applyRowCompact(main) {
    if (!naturalChipsW) naturalChipsW = measureNaturalChipsW();
    const want = naturalChipsW > 0 && main.clientWidth > 0 && main.clientWidth < naturalChipsW;
    if (main.classList.contains("is-compact") !== want) main.classList.toggle("is-compact", want);
    rowStackCheck(main);
  }
  function rowStackCheck(main) {
    const li = main.parentElement;
    if (!li) return;
    const chips = main.querySelector(".queue-row-stats .stat-chips");
    let want = false;
    if (chips && !chips.hidden && main.clientWidth > 0) {
      const mainLeft = main.getBoundingClientRect().left;
      for (const k of chips.children) {
        const r = k.getBoundingClientRect();
        if (r.width > 0 && r.left < mainLeft - 0.5) { want = true; break; }
      }
    }
    if (li.classList.contains("is-stacked") !== want) li.classList.toggle("is-stacked", want);
  }
  const rowResizeObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver((entries) => entries.forEach((e) => { const m = e.target.closest(".queue-row-main"); if (m) applyRowCompact(m); }))
    : null;
  function recheckRowCompact() {
    naturalChipsW = 0;
    document.querySelectorAll(".queue-row-main").forEach(applyRowCompact);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(recheckRowCompact);
  function buildQueueRow(name, item) {
    const st = queueState[name];
    const li = document.createElement("li");
    li.className = "queue-row";
    li.dataset.id = item.id;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "queue-row-check";
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) st.selected.add(item.id); else st.selected.delete(item.id);
      updateSelectAllCheckbox(name);
    });
    li.appendChild(checkbox);
    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.innerHTML = ICON_DRAG;
    li.appendChild(handle);
    const main = document.createElement("div");
    main.className = "queue-row-main";
    if (rowResizeObserver) rowResizeObserver.observe(main);
    const title = document.createElement("p");
    title.className = "queue-row-title";
    main.appendChild(title);
    const urlLine = document.createElement("p");
    urlLine.className = "queue-row-url";
    main.appendChild(urlLine);
    const track = document.createElement("div");
    track.className = "queue-row-progress";
    const fill = document.createElement("div");
    fill.className = "queue-row-progress-fill";
    track.appendChild(fill);
    main.appendChild(track);
    const err = document.createElement("p");
    err.className = "history-missing";
    main.appendChild(err);
    li.appendChild(main);
    const statusCol = document.createElement("div");
    statusCol.className = "queue-status-col";
    const percentEl = document.createElement("span");
    percentEl.className = "queue-row-percent";
    statusCol.appendChild(percentEl);
    const badge = document.createElement("span");
    badge.className = "badge";
    statusCol.appendChild(badge);
    const pagesEl = document.createElement("div");
    pagesEl.className = "queue-row-stats";
    if (rowResizeObserver) rowResizeObserver.observe(pagesEl);
    pagesEl.hidden = true;
    const rowChips = buildRowStatChips();
    rowChips.hidden = false;
    pagesEl.appendChild(rowChips);
    const rowNote = document.createElement("span");
    rowNote.className = "queue-row-note";
    pagesEl.appendChild(rowNote);
    main.appendChild(pagesEl);
    const doneActions = document.createElement("div");
    doneActions.className = "queue-done-actions";
    doneActions.hidden = true;
    const folderBtn = document.createElement("button");
    folderBtn.type = "button";
    folderBtn.title = "فولڈر کھولیں";
    folderBtn.innerHTML = ICON_FOLDER;
    doneActions.appendChild(folderBtn);
    const bookBtn = document.createElement("button");
    bookBtn.type = "button";
    bookBtn.title = "کتاب کھولیں";
    bookBtn.innerHTML = ICON_OPEN_BOOK;
    doneActions.appendChild(bookBtn);
    statusCol.appendChild(doneActions);
    const errorActions = document.createElement("div");
    errorActions.className = "queue-error-actions";
    errorActions.hidden = true;
    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.title = "دوبارہ کوشش کریں";
    retryBtn.innerHTML = ICON_RETRY;
    errorActions.appendChild(retryBtn);
    statusCol.appendChild(errorActions);
    li.appendChild(statusCol);
    const removeBtn = document.createElement("button");
    removeBtn.className = "queue-row-icon-btn danger";
    removeBtn.type = "button";
    removeBtn.innerHTML = ICON_REMOVE;
    li.appendChild(removeBtn);
    li.addEventListener("dragstart", (e) => {
      if (li.getAttribute("draggable") !== "true") { e.preventDefault(); return; }
      st.draggedId = item.id;
      li.classList.add("is-dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("application/x-rekhta-queue-item", item.id);
    });
    li.addEventListener("dragend", () => {
      li.classList.remove("is-dragging");
      if (st.draggedId) {
        const orderedIds = Array.from(st.list.children).map((el) => el.dataset.id);
        window.pywebview.api.reorder_queue(name, orderedIds);
      }
      st.draggedId = null;
    });
    li.addEventListener("dragover", (e) => {
      if (!st.draggedId || st.draggedId === item.id) return;
      if (li.dataset.status === "downloading") return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const draggedLi = st.rowEls.get(st.draggedId);
      if (!draggedLi || draggedLi.parentElement !== st.list) return;
      const rect = li.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      if (before) {
        if (draggedLi.nextElementSibling === li) return;
        animateReorder(st.list, () => li.before(draggedLi));
      } else {
        if (draggedLi.previousElementSibling === li) return;
        animateReorder(st.list, () => li.after(draggedLi));
      }
    });
    li.addEventListener("drop", (e) => e.preventDefault());
    updateQueueRow(name, li, item);
    return li;
  }
  function updateQueueRow(name, li, item) {
    noteWaitFromItem(item);
    li.dataset.status = item.status;
    li.querySelector(".queue-row-title").textContent = displayTitleFor(item);
    li.querySelector(".queue-row-url").textContent = formatUrlDisplay(item.url);
    const track = li.querySelector(".queue-row-progress");
    const fill = li.querySelector(".queue-row-progress-fill");
    const percentEl = li.querySelector(".queue-row-percent");
    if (item.status === "downloading" || item.status === "paused") {
      track.style.display = "";
      track.classList.toggle("indeterminate", item.status === "downloading" && !(item.percent > 0));
      fill.style.width = (item.percent || 0) + "%";
      percentEl.textContent = (item.percent || 0) + "%";
      percentEl.style.display = "";
    } else {
      track.style.display = "none";
      percentEl.style.display = "none";
    }
    const pagesEl = li.querySelector(".queue-row-stats");
    const isLive = item.status === "downloading" || item.status === "paused";
    pagesEl.hidden = !isLive;
    if (!isLive) keepLastChips(item.id, {}, false);
    if (isLive) {
      const info = item.status === "downloading" ? etaFeed("q:" + item.id, item.stage, item.current, item.total) : null;
      setStatChips(pagesEl.firstChild, keepLastChips(item.id, rowChipValues(item, info), true));
      const note = rowNoteText(item);
      if (pagesEl.lastChild.textContent !== note) pagesEl.lastChild.textContent = note;
    }
    const err = li.querySelector(".history-missing");
    const isMissing = !!item.missing;
    err.classList.toggle("is-missing-note", isMissing);
    if (isMissing) {
      err.style.display = "";
      err.textContent = MSG_QUEUE_FILE_MISSING + " \u2190";
    } else if (item.error) {
      err.style.display = "";
      err.textContent = item.error;
    } else {
      err.style.display = "none";
    }
    const badge = li.querySelector(".badge");
    badge.className = "badge " + (isMissing ? "missing" : item.status);
    badge.textContent = isMissing ? "غائب" : (STATUS_LABEL[item.status] || item.status);
    const doneActions = li.querySelector(".queue-done-actions");
    doneActions.hidden = item.status !== "done";
    if (item.status === "done" && item.path) {
      const [folderBtn, bookBtn] = doneActions.querySelectorAll("button");
      folderBtn.onclick = () => {
        window.pywebview.api.reveal_in_folder(item.path).then((res) => {
          if (!res || !res.ok) {
            window.pywebview.api.check_queue_item_exists(name, item.id).then((r) => {
              if (r && r.removed && r.message) showToast(r.message, "success");
            });
          }
        });
      };
      bookBtn.onclick = () => {
        window.pywebview.api.open_file(item.path).then((res) => {
          if (!res || !res.ok) {
            window.pywebview.api.check_queue_item_exists(name, item.id).then((r) => {
              if (r && r.removed && r.message) showToast(r.message, "success");
            });
          }
        });
      };
    }
    const errorActions = li.querySelector(".queue-error-actions");
    errorActions.hidden = item.status !== "error";
    if (item.status === "error") {
      const retryBtn = errorActions.querySelector("button");
      if (retryBtn.dataset.mode !== "text") {
        retryBtn.dataset.mode = "text";
        retryBtn.classList.add("queue-retry-text");
        retryBtn.textContent = "دوبارہ کوشش";
        retryBtn.title = "";
      }
      retryBtn.onclick = () => {
        window.pywebview.api.retry_queue_item(name, item.id);
      };
    }
    const removeBtn = li.querySelector(".queue-row-icon-btn.danger");
    removeBtn.onclick = () => {
      if (item.status === "downloading") {
        confirmAction("یہ کتاب ابھی ڈاؤن لوڈ ہو رہی ہے، کیا آپ واقعی اسے خارج کرنا چاہتے ہیں؟", () => {
          window.pywebview.api.remove_queue_item(name, item.id);
        });
      } else {
        window.pywebview.api.remove_queue_item(name, item.id).then((res) => undoQueueRemoval(name, res, "کتاب قطار سے ہٹا دی گئی۔"));
      }
    };
    const checkbox = li.querySelector(".queue-row-check");
    const st = queueState[name];
    const selectable = isSelectable(li);
    checkbox.style.visibility = item.status === "done" ? "hidden" : "";
    checkbox.disabled = !selectable;
    checkbox.checked = st.selected.has(item.id) && selectable;
    if (!selectable) st.selected.delete(item.id);
    const primaryLocked = name === "primary" && lastMode === "running";
    const draggable = item.status !== "downloading" && !primaryLocked;
    li.setAttribute("draggable", draggable ? "true" : "false");
    li.classList.toggle("is-locked", !draggable);
    li.querySelector(".drag-handle").classList.toggle("is-disabled", !draggable);
  }
  const searchForm = document.getElementById("search-form");
  const searchQueryInput = document.getElementById("search-query-input");
  const searchStatus = document.getElementById("search-status");
  const searchStatusText = document.getElementById("search-status-text");
  const searchStatusPercent = document.getElementById("search-status-percent");
  const searchProgressFill = document.getElementById("search-progress-fill");
  const searchErrorEl = document.getElementById("search-error");
  const searchErrorText = document.getElementById("search-error-text");
  const searchEmptyEl = document.getElementById("search-empty");
  const searchResultCountEl = document.getElementById("search-result-count");
  const searchResultsList = document.getElementById("search-results-list");
  const CARD_SPIN_MS = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--card-spin-dur")) || 12) * 1000;
  function syncCardPhase(card) {
    if (!card) return;
    card.style.setProperty("--card-phase", "-" + ((performance.now() % CARD_SPIN_MS) / 1000).toFixed(3) + "s");
  }
  const cardOf = (t) => (t && t.closest ? t.closest(".search-card") : null);
  const CARD_FADE_MS = 450;
  function freezeCardAngle(card) {
    if (!card || !card.isConnected) return;
    const deg = ((performance.now() % CARD_SPIN_MS) / CARD_SPIN_MS) * 360;
    card.style.setProperty("--angle", deg.toFixed(2) + "deg");
    clearTimeout(card._thawTimer);
    card._thawTimer = setTimeout(() => card.style.removeProperty("--angle"), CARD_FADE_MS);
  }
  let hoverCard = null;
  let focusCard = null;
  searchResultsList.addEventListener("pointerover", (e) => {
    const card = cardOf(e.target);
    if (!card) return;
    if (hoverCard === null && focusCard && focusCard !== card) freezeCardAngle(focusCard);
    searchResultsList.classList.add("is-hovering");
    if (card !== hoverCard) {
      const wasAnimating = card === focusCard && hoverCard === null;
      hoverCard = card;
      if (!wasAnimating) syncCardPhase(card);
    }
  });
  searchResultsList.addEventListener("pointerout", (e) => {
    const leaving = cardOf(e.target);
    if (leaving && leaving !== cardOf(e.relatedTarget)) freezeCardAngle(leaving);
    if (cardOf(e.relatedTarget)) return;
    searchResultsList.classList.remove("is-hovering");
    hoverCard = null;
    if (focusCard && focusCard.isConnected) syncCardPhase(focusCard);
  });
  searchResultsList.addEventListener("focusin", (e) => {
    const card = cardOf(e.target);
    if (!card || card === focusCard) return;
    if (!e.target.matches(":focus-visible")) return;
    card.classList.add("kbd-focus");
    focusCard = card;
    if (hoverCard === null) syncCardPhase(card);
  });
  searchResultsList.addEventListener("focusout", (e) => {
    const from = cardOf(e.target);
    const to = cardOf(e.relatedTarget);
    if (from && from !== to) { freezeCardAngle(from); from.classList.remove("kbd-focus"); }
    if (!to) focusCard = null;
  });
  const scrollHost = document.querySelector(".content");
  let scrollIdleTimer = 0;
  scrollHost.addEventListener("scroll", () => {
    if (!scrollHost.classList.contains("is-scrolling")) scrollHost.classList.add("is-scrolling");
    clearTimeout(scrollIdleTimer);
    scrollIdleTimer = setTimeout(() => scrollHost.classList.remove("is-scrolling"), 140);
  }, { passive: true });
  applyScrollTopSide("left");
  const scrollTopBtn = document.getElementById("scroll-top-btn");
  const SCROLL_TOP_RULES = {
    search: { sel: "#search-form", hidden: 0.7 },
    history: { sel: "#history-list > li:first-child", hidden: 0.5 },
    queue: { sel: "#queue-bulk-text", px: 12 },
    settings: { sel: "#view-settings .settings-section", hidden: 1 },
  };
  function scrollTopShouldShow(anchorRect, hostRect, hiddenFrac, minHiddenPx) {
    if (!anchorRect || !hostRect || !(anchorRect.height > 0)) return false;
    const hiddenPx = hostRect.top - anchorRect.top;
    if (minHiddenPx != null) return hiddenPx > minHiddenPx;
    return hiddenPx >= anchorRect.height * hiddenFrac - 0.5;
  }
  let scrollTopRaf = 0;
  function syncScrollTopBtn() {
    scrollTopRaf = 0;
    if (!scrollTopBtn) return;
    let show = false;
    const rule = SCROLL_TOP_RULES[currentViewName];
    if (rule && scrollHost.scrollTop > 0) {
      const el = document.querySelector(rule.sel);
      if (el) show = scrollTopShouldShow(el.getBoundingClientRect(), scrollHost.getBoundingClientRect(), rule.hidden, rule.px);
    }
    scrollTopBtn.classList.toggle("is-visible", show);
    scrollTopBtn.tabIndex = show ? 0 : -1;
    scrollTopBtn.setAttribute("aria-hidden", show ? "false" : "true");
  }
  function requestScrollTopSync() { if (!scrollTopRaf) scrollTopRaf = requestAnimationFrame(syncScrollTopBtn); }
  scrollHost.addEventListener("scroll", requestScrollTopSync, { passive: true });
  window.addEventListener("resize", requestScrollTopSync);
  if (scrollTopBtn) scrollTopBtn.addEventListener("click", () => {
    grabStopMomentum();
    scrollHost.style.scrollBehavior = "";
    scrollHost.scrollTop = 0;
  });
  const STUCK_BAR_SELECTORS = ["#settings-sticky", "#view-history .history-bar", "#queue-note-wrap"];
  let stuckRaf = 0;
  function updateStuckBars() {
    stuckRaf = 0;
    const host = document.querySelector(".content");
    if (!host) return;
    const top = host.getBoundingClientRect().top;
    STUCK_BAR_SELECTORS.forEach((sel) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const stuck = r.height > 0 && host.scrollTop > 2 && r.top <= top + 1;
      el.classList.toggle("is-stuck", stuck);
    });
  }
  (function () {
    const host = document.querySelector(".content");
    if (!host) return;
    host.addEventListener("scroll", () => { if (!stuckRaf) stuckRaf = requestAnimationFrame(updateStuckBars); }, { passive: true });
  })();
  const GRAB_START_PX = 4;
  const GRAB_SAMPLE_MS = 100;
  const GRAB_HOLD_MS = 80;
  const GRAB_MIN_V = 0.05;
  const GRAB_STOP_V = 0.02;
  const GRAB_MAX_V = 3;
  const GRAB_DECAY = 0.998;
  const GRAB_IGNORE_CURSORS = ["pointer", "text", "grab", "grabbing", "move", "col-resize", "row-resize", "not-allowed", "crosshair", "help"];
  const GRAB_BLOCK_SELECTOR = "button, a, input, textarea, select, label, summary, option, [role=\"button\"], [role=\"switch\"], [role=\"tab\"], [contenteditable], [draggable], .queue-row, .queue-header-split, .search-card, .dialog-x";
  function grabVelocity(samples, now) {
    if (!samples || samples.length < 2) return 0;
    const recent = samples.filter((p) => now - p.t <= GRAB_SAMPLE_MS);
    if (recent.length < 2) return 0;
    const first = recent[0], last = recent[recent.length - 1];
    if (now - last.t > GRAB_HOLD_MS) return 0;
    const span = last.t - first.t;
    if (span < 8) return 0;
    let v = -(last.y - first.y) / span;
    if (Math.abs(v) < GRAB_MIN_V) return 0;
    if (v > GRAB_MAX_V) v = GRAB_MAX_V; else if (v < -GRAB_MAX_V) v = -GRAB_MAX_V;
    return v;
  }
  function grabMomentumStep(v, dt) {
    const v2 = v * Math.pow(GRAB_DECAY, dt);
    return { delta: (v + v2) / 2 * dt, v: Math.abs(v2) < GRAB_STOP_V ? 0 : v2 };
  }
  let grabSamples = [];
  let grabState = null;
  let grabMomentumRaf = 0;
  let grabSwallowClick = false;
  function grabZoomDiv() { const z = currentZoomNumber(); return z > 0 ? z : 1; }
  function grabStopMomentum() {
    if (grabMomentumRaf) { cancelAnimationFrame(grabMomentumRaf); grabMomentumRaf = 0; scrollHost.classList.remove("is-grab-scroll"); return true; }
    return false;
  }
  function grabRunMomentum(v) {
    scrollHost.classList.add("is-grab-scroll");
    let last = performance.now();
    const viewAtStart = currentViewName;
    const frame = (now) => {
      grabMomentumRaf = 0;
      if (currentViewName !== viewAtStart) { scrollHost.classList.remove("is-grab-scroll"); return; }
      const dt = Math.min(50, Math.max(1, now - last)); last = now;
      const step = grabMomentumStep(v, dt);
      const before = scrollHost.scrollTop;
      scrollHost.scrollTop = before + step.delta / grabZoomDiv();
      v = step.v;
      if (v === 0 || scrollHost.scrollTop === before) { scrollHost.classList.remove("is-grab-scroll"); return; }
      grabMomentumRaf = requestAnimationFrame(frame);
    };
    grabMomentumRaf = requestAnimationFrame(frame);
  }
  function grabTargetOk(target, e) {
    if (!target || target.nodeType !== 1) return false;
    if (scrollHost.scrollHeight <= scrollHost.clientHeight + 1) return false;
    const r = scrollHost.getBoundingClientRect();
    const left = r.left + scrollHost.clientLeft;
    if (e.clientX < left || e.clientX > left + scrollHost.clientWidth) return false;
    const blocked = target.closest(GRAB_BLOCK_SELECTOR);
    if (blocked && !(blocked.matches && blocked.matches("button.is-static, button:disabled, button[aria-disabled=\"true\"]"))) return false;
    const cur = (getComputedStyle(target).cursor || "").split(",").pop().trim();
    return GRAB_IGNORE_CURSORS.indexOf(cur) < 0;
  }
  function grabEnd(e) {
    if (!grabState) return;
    const st = grabState; grabState = null;
    window.removeEventListener("mousemove", grabMove, true);
    window.removeEventListener("mouseup", grabEnd, true);
    window.removeEventListener("blur", grabEnd, true);
    scrollHost.classList.remove("is-grabbing");
    if (!st.started) { scrollHost.classList.remove("is-grab-scroll"); return; }
    grabSwallowClick = true; setTimeout(() => { grabSwallowClick = false; }, 0);
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const v = e && e.type === "mouseup" && !reduce ? grabVelocity(grabSamples, performance.now()) : 0;
    grabSamples = [];
    if (v) grabRunMomentum(v); else scrollHost.classList.remove("is-grab-scroll");
  }
  function grabMove(e) {
    if (!grabState) return;
    if (!(e.buttons & 1)) { grabEnd(e); return; }
    const dy = e.clientY - grabState.y0;
    if (!grabState.started) {
      if (Math.abs(dy) < GRAB_START_PX) return;
      grabState.started = true;
    }
    scrollHost.scrollTop = grabState.top0 - dy / grabZoomDiv();
    const now = performance.now();
    grabSamples.push({ t: now, y: e.clientY });
    if (grabSamples.length > 12) grabSamples.shift();
    e.preventDefault();
  }
  scrollHost.addEventListener("mousedown", (e) => {
    const wasMoving = grabStopMomentum();
    if (e.button !== 0 || e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
    if (!grabTargetOk(e.target, e)) return;
    if (wasMoving) grabSwallowClick = true, setTimeout(() => { grabSwallowClick = false; }, 300);
    grabState = { y0: e.clientY, top0: scrollHost.scrollTop, started: false };
    grabSamples = [{ t: performance.now(), y: e.clientY }];
    scrollHost.classList.add("is-grabbing", "is-grab-scroll");
    window.addEventListener("mousemove", grabMove, true);
    window.addEventListener("mouseup", grabEnd, true);
    window.addEventListener("blur", grabEnd, true);
  });
  scrollHost.addEventListener("click", (e) => { if (grabSwallowClick) { e.stopPropagation(); e.preventDefault(); } }, true);
  scrollHost.addEventListener("wheel", () => { grabStopMomentum(); }, { passive: true });
  window.addEventListener("keydown", () => { grabStopMomentum(); }, true);
  const searchLoadMoreWrap = document.getElementById("search-loadmore-wrap");
  const searchLoadMoreBtn = document.getElementById("search-loadmore-btn");
  const searchLoadMoreStatus = document.getElementById("search-loadmore-status");
  const searchLoadMoreStatusText = document.getElementById("search-loadmore-status-text");
  const searchLoadMoreStatusPercent = document.getElementById("search-loadmore-status-percent");
  const searchLoadMoreProgressFill = document.getElementById("search-loadmore-progress-fill");
  const SEARCH_QUERY_MAX = 100;
  let searchBusy = false;
  let searchCancelled = false;
  let searchProgressIsLoadMore = false;
  function freshSiteSearchState() {
    return { query: "", page: 1, seenUrls: new Set(), shownCount: 0, results: [], hasMore: false, searched: false };
  }
  const siteSearchState = { rekhta: freshSiteSearchState(), sufinama: freshSiteSearchState() };
  let currentSearchSite = "rekhta";
  const searchSiteBtns = document.querySelectorAll("#search-site-toggle .seg-btn");
  const SITE_RESTORE_FIRST = 36;
  const SITE_RESTORE_CHUNK = 36;
  let userScrolledDuringRestore = false;
  function holdSearchListHeight() {
    const h = searchResultsList.offsetHeight || 0;
    if (h > 0) searchResultsList.style.minHeight = h + "px";
  }
  function releaseSearchListHeight() {
    searchResultsList.style.minHeight = "";
  }
  function shrinkSearchHold() {
    if (!searchResultsList.style.minHeight) return;
    const slack = scrollHost.scrollHeight - (scrollHost.scrollTop + scrollHost.clientHeight);
    if (!(slack > 0)) return;
    const next = (searchResultsList.offsetHeight || 0) - slack;
    if (next > 0) searchResultsList.style.minHeight = next + "px"; else releaseSearchListHeight();
  }
  scrollHost.addEventListener("scroll", shrinkSearchHold, { passive: true });
  function applySiteScroll() { }
  function renderSavedResultsInChunks(all, scrollTarget) {
    const target = scrollTarget || 0;
    renderSearchResults(all.slice(0, SITE_RESTORE_FIRST), false);
    applySiteScroll(target);
    const epoch = coverEpoch;
    let at = SITE_RESTORE_FIRST;
    const next = () => {
      if (epoch !== coverEpoch) return;
      if (at >= all.length) return;
      renderSearchResults(all.slice(at, at + SITE_RESTORE_CHUNK), true);
      applySiteScroll(target);
      at += SITE_RESTORE_CHUNK;
      setTimeout(next, 30);
    };
    if (at < all.length) setTimeout(next, 30);
  }
  function displaySiteResults(site, keepScroll) {
    const st = siteSearchState[site];
    hide(searchErrorEl);
    hide(searchLoadMoreStatus);
    hide(searchStatus);
    show(searchLoadMoreBtn);
    userScrolledDuringRestore = false;
    const scrollTarget = 0;
    if (keepScroll) holdSearchListHeight();
    searchResultsList.innerHTML = ""; resetCovers();
    if (!st.searched || st.results.length === 0) {
      hide(searchResultCountEl);
      hide(searchLoadMoreWrap);
      if (st.searched) {
        searchEmptyEl.textContent = `کوئی نتیجہ نہیں ملا۔ (تلاش کردہ الفاظ ”${st.query}“) کوئی اور لفظ آزمائیں۔`;
        show(searchEmptyEl);
      } else {
        hide(searchEmptyEl);
      }
      return;
    }
    hide(searchEmptyEl);
    renderSavedResultsInChunks(st.results, scrollTarget);
    searchResultCountEl.textContent = `کل ${st.shownCount} نتائج ملے۔ تلاش کردہ الفاظ: ”${st.query}“`;
    show(searchResultCountEl);
    if (st.hasMore) show(searchLoadMoreWrap); else hide(searchLoadMoreWrap);
  }
  function switchSearchSite(site) {
    site = site === "sufinama" ? "sufinama" : "rekhta";
    if (site === currentSearchSite) return;
    const wasBusy = cancelSearch(true);
    const fromQuery = siteSearchState[currentSearchSite].query;
    holdSearchListHeight();
    currentSearchSite = site;
    searchSiteBtns.forEach((b) => {
      const on = b.dataset.site === currentSearchSite;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
    moveSearchSiteHighlight(currentSearchSite, true);
    const toState = siteSearchState[site];
    if (!fromQuery || (toState.searched && toState.query === fromQuery)) {
      if (wasBusy) pyCancelSearch();
      displaySiteResults(site, true);
      return;
    }
    toState.query = fromQuery;
    toState.page = 1;
    toState.seenUrls = new Set();
    toState.shownCount = 0;
    toState.results = [];
    toState.searched = true;
    toState.hasMore = false;
    searchResultsList.innerHTML = ""; resetCovers();
    hide(searchResultCountEl);
    hide(searchLoadMoreWrap);
    hide(searchEmptyEl);
    runSearch(fromQuery, 1, false);
  }
  let searchSiteTouchedByUser = false;
  searchSiteBtns.forEach((b) => b.addEventListener("click", () => {
    searchSiteTouchedByUser = true;
    switchSearchSite(b.dataset.site);
  }));
  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const query = searchQueryInput.value.trim().slice(0, SEARCH_QUERY_MAX);
    if (!query || searchBusy) return;
    releaseSearchListHeight();
    const st = siteSearchState[currentSearchSite];
    st.query = query;
    st.page = 1;
    st.seenUrls = new Set();
    st.shownCount = 0;
    st.results = [];
    st.searched = true;
    st.hasMore = false;
    searchResultsList.innerHTML = ""; resetCovers();
    hide(searchLoadMoreWrap);
    hide(searchResultCountEl);
    runSearch(query, 1, false);
  });
  searchLoadMoreBtn.addEventListener("click", () => {
    const st = siteSearchState[currentSearchSite];
    if (searchBusy || !st.query) return;
    runSearch(st.query, st.page + 1, true);
  });
  const queueGapNote = document.getElementById("queue-gap-note");
  const queueSlotMain = document.getElementById("queue-slot-main") || queueGapNote;
  const QUEUE_IDLE_TEXT = "قطار فی الحال موقوف ہے";
  let queueGapTimer = null;
  let queueGapEnd = 0;
  function queueSlotStatus() {
    if (lastMode === "paused") return "قطار فی الحال موقوف ہے…";
    if (lastMode !== "running") return "";
    const cur = Array.from(queueState.primary.itemsById.values()).find((i) => i.status === "downloading");
    return cur ? `کتاب ڈاؤن لوڈ ہو رہی ہے: ${displayTitleFor(cur)}…` : "قطار چل رہی ہے…";
  }
  function refreshQueueSlot() {
    if (!queueGapNote) return;
    const live = lastMode === "running" || lastMode === "paused";
    queueGapNote.hidden = false;
    if (!live) { if (queueSlotMain.textContent !== QUEUE_IDLE_TEXT) queueSlotMain.textContent = QUEUE_IDLE_TEXT; return; }
    let txt;
    if (queueGapEnd) {
      const left = Math.max(0, Math.ceil((queueGapEnd - Date.now()) / 1000));
      txt = `اگلی کتاب ${left} سیکنڈ میں شروع ہوگی (سائٹ کے ساتھ شائستگی)`;
    } else txt = queueSlotStatus();
    if (queueSlotMain.textContent !== txt) queueSlotMain.textContent = txt;
  }
  function handleQueueGap(payload) {
    if (queueGapTimer) { clearInterval(queueGapTimer); queueGapTimer = null; }
    const secs = payload && Number(payload.seconds) > 0 ? Math.floor(Number(payload.seconds)) : 0;
    queueGapEnd = secs ? Date.now() + secs * 1000 : 0;
    refreshQueueSlot();
    if (!secs) return;
    queueGapTimer = setInterval(() => {
      refreshQueueSlot();
      if (Date.now() >= queueGapEnd && queueGapTimer) { clearInterval(queueGapTimer); queueGapTimer = null; }
    }, 500);
  }
  const searchSubmitBtn = document.getElementById("search-submit-btn");
  function setSearchStopLook(on) {
    if (!searchSubmitBtn) return;
    searchSubmitBtn.classList.toggle("is-stop", on);
    if (on) { searchSubmitBtn.type = "button"; } else { setTimeout(() => { if (!searchBusy) searchSubmitBtn.type = "submit"; }, 0); }
    const lbl = document.getElementById("search-submit-label");
    if (lbl) lbl.textContent = on ? "تلاش روکیں" : "تلاش کریں";
    const a = searchSubmitBtn.querySelector(".ic-search"); const b = searchSubmitBtn.querySelector(".ic-stop");
    if (a) a.hidden = on; if (b) b.hidden = !on;
  }
  function searchBusyUi() { if (searchSubmitBtn) searchSubmitBtn.disabled = false; setSearchStopLook(true); }
  function searchIdleUi() { if (searchSubmitBtn) searchSubmitBtn.disabled = false; setSearchStopLook(false); }
  function pyCancelSearch() {
    try { const api = window.pywebview && window.pywebview.api; if (api && api.cancel_search) api.cancel_search(); } catch (e) { }
  }
  function cancelSearch(skipPy) {
    if (!searchBusy) return false;
    clearSearchErrorTimer();
    searchRunId += 1;
    searchCancelled = true;
    if (!skipPy) pyCancelSearch();
    const wasLoadMore = searchProgressIsLoadMore;
    searchBusy = false;
    searchIdleUi();
    hide(searchStatus);
    hide(searchLoadMoreStatus);
    if (wasLoadMore) {
      show(searchLoadMoreBtn);
    } else {
      searchResultsList.innerHTML = ""; resetCovers();
      siteSearchState[currentSearchSite].searched = false;
    }
    return true;
  }
  if (searchSubmitBtn) searchSubmitBtn.addEventListener("click", () => {
    if (searchBusy && cancelSearch(false)) showToast("تلاش روک دی گئی۔");
  });
  function showSearchSkeletons() {
    searchResultsList.innerHTML = ""; resetCovers();
    for (let i = 0; i < 8; i++) {
      const li = document.createElement("li");
      li.className = "search-skeleton";
      li.setAttribute("aria-hidden", "true");
      li.innerHTML = '<div class="sk-inner"><div class="sk-cover"></div><div class="sk-body"><div class="sk-line"></div><div class="sk-line sk-line--short"></div><div class="sk-actions"><span></span><span></span></div></div></div>';
      searchResultsList.appendChild(li);
    }
  }
  const SEARCH_ERROR_MIN_MS = 400;
  let searchRunId = 0;
  let searchRunStartedAt = 0;
  let searchErrorTimer = null;
  function clearSearchErrorTimer() {
    if (searchErrorTimer) { clearTimeout(searchErrorTimer); searchErrorTimer = null; }
  }
  function searchOfflineMessage() {
    const name = currentSearchSite === "sufinama" ? "صوفی نامہ" : "ریختہ";
    return `${name} کی ویب سائٹ سے رابطہ قائم نہیں ہو سکا۔ انٹرنیٹ کنکشن چیک کریں یا کچھ دیر بعد دوبارہ کوشش کریں۔ (E-1102)`;
  }
  function runSearch(query, page, append) {
    searchCancelled = false;
    clearSearchErrorTimer();
    searchRunId += 1;
    searchRunStartedAt = performance.now();
    if (!append && typeof navigator !== "undefined" && navigator.onLine === false) {
      searchBusy = true;
      searchProgressIsLoadMore = false;
      handleSearchError({ page, message: searchOfflineMessage(), immediate: true });
      return;
    }
    searchBusy = true;
    searchProgressIsLoadMore = append;
    searchBusyUi();
    hide(searchErrorEl);
    if (!append) hide(searchEmptyEl);
    if (append) {
      hide(searchLoadMoreBtn);
      searchLoadMoreStatusText.textContent = "مزید نتائج لوڈ ہو رہے ہیں…";
      searchLoadMoreStatusPercent.hidden = true;
      searchLoadMoreProgressFill.style.width = "0%";
      searchLoadMoreProgressFill.parentElement.classList.add("indeterminate");
      show(searchLoadMoreStatus);
    } else {
      showSearchSkeletons();
      searchStatusText.textContent = "تلاش جاری ہے…";
      searchStatusPercent.hidden = true;
      searchProgressFill.style.width = "0%";
      searchProgressFill.parentElement.classList.add("indeterminate");
      show(searchStatus);
    }
    const myRun = searchRunId;
    window.pywebview.api.search_books(query, page, currentSearchSite).then((res) => {
      if (myRun !== searchRunId) return;
      if (!res || !res.ok) {
        handleSearchError({ page, message: "تلاش شروع نہیں ہو سکی، دوبارہ کوشش کریں۔" });
      }
    });
  }
  function handleSearchProgress(payload) {
    const textEl = searchProgressIsLoadMore ? searchLoadMoreStatusText : searchStatusText;
    const pctEl = searchProgressIsLoadMore ? searchLoadMoreStatusPercent : searchStatusPercent;
    const fillEl = searchProgressIsLoadMore ? searchLoadMoreProgressFill : searchProgressFill;
    const track = fillEl.parentElement;
    if (payload.percent !== null && payload.percent !== undefined) {
      track.classList.remove("indeterminate");
      fillEl.style.width = payload.percent + "%";
      pctEl.textContent = payload.percent + "%";
      pctEl.hidden = false;
    } else {
      track.classList.add("indeterminate");
      pctEl.hidden = true;
    }
    if (payload.message) textEl.textContent = payload.message;
  }
  function handleSearchDone(payload) {
    clearSearchErrorTimer();
    searchBusy = false;
    searchIdleUi();
    hide(searchStatus);
    hide(searchLoadMoreStatus);
    const st = siteSearchState[currentSearchSite];
    const results = payload.results || [];
    const page = payload.page || 1;
    const append = page > 1;
    const fresh = results.filter((b) => b.url && !st.seenUrls.has(b.url));
    fresh.forEach((b) => st.seenUrls.add(b.url));
    st.searched = true;
    if (!append && results.length === 0) {
      st.results = [];
      st.shownCount = 0;
      st.hasMore = false;
      searchResultsList.innerHTML = ""; resetCovers();
      searchEmptyEl.textContent = `کوئی نتیجہ نہیں ملا۔ (تلاش کردہ الفاظ ”${st.query}“) کوئی اور لفظ آزمائیں۔`;
      show(searchEmptyEl);
      hide(searchLoadMoreWrap);
      hide(searchResultCountEl);
      return;
    }
    if (append && fresh.length === 0) {
      st.hasMore = false;
      hide(searchLoadMoreWrap);
      showToast("مزید کوئی نتیجہ نہیں ملا۔");
      return;
    }
    st.page = page;
    st.shownCount += fresh.length;
    st.results = st.results.concat(fresh);
    renderSearchResults(fresh, append);
    searchResultCountEl.textContent = `کل ${st.shownCount} نتائج ملے۔ تلاش کردہ الفاظ: ”${st.query}“`;
    show(searchResultCountEl);
    if (results.length >= 60) {
      st.hasMore = true;
      show(searchLoadMoreWrap);
      show(searchLoadMoreBtn);
    } else {
      st.hasMore = false;
      hide(searchLoadMoreWrap);
    }
  }
  function handleSearchError(payload) {
    if (searchProgressIsLoadMore) {
      searchBusy = false;
      searchIdleUi();
      hide(searchStatus);
      hide(searchLoadMoreStatus);
      show(searchLoadMoreBtn);
      showToast((payload && payload.message) || "مزید نتائج نہیں لائے جا سکے، دوبارہ کوشش کریں۔");
      return;
    }
    const showError = () => {
      searchErrorTimer = null;
      searchBusy = false;
      searchIdleUi();
      hide(searchStatus);
      siteSearchState[currentSearchSite].searched = false;
      searchResultsList.innerHTML = ""; resetCovers();
      searchErrorText.textContent = (payload && payload.message) || "تلاش میں خرابی پیش آئی، دوبارہ کوشش کریں۔";
      show(searchErrorEl);
    };
    const shown = performance.now() - searchRunStartedAt;
    const wait = payload && payload.immediate ? 0 : Math.max(0, SEARCH_ERROR_MIN_MS - shown);
    if (wait <= 0) { clearSearchErrorTimer(); showError(); return; }
    clearSearchErrorTimer();
    const runId = searchRunId;
    searchErrorTimer = setTimeout(() => { if (runId === searchRunId) showError(); }, wait);
  }
  const COVER_PLACEHOLDER_SVG = '<svg viewBox="0 0 24 24" fill="none"><path d="M6 3.5H14L18 7.5V19.5C18 20 17.6 20.4 17.1 20.4H6.9C6.4 20.4 6 20 6 19.5V4.4C6 3.9 6.4 3.5 6.9 3.5H6Z" stroke="currentColor" stroke-width="1.4"/><path d="M9 3.5V20.4" stroke="currentColor" stroke-width="1" opacity="0.5"/></svg>';
  const COVER_BATCH = 3;
  const COVER_INFLIGHT_MAX = 2;
  const COVER_STAGGER_MS = 70;
  const COVER_PREFETCH_MARGIN = "900px 0px 900px 0px";
  const COVER_KEEP_MARGIN = "2200px 0px 2200px 0px";
  let coverEpoch = 0;
  let coverPending = [];
  let coverInflight = 0;
  let coverObserver = null;
  let coverKeepObserver = null;
  const searchViewEl = document.getElementById("view-search");
  function searchViewHidden() { return !!searchViewEl && !searchViewEl.classList.contains("is-active"); }
  function resetCovers() {
    coverEpoch += 1;
    coverPending = [];
    if (coverObserver) { coverObserver.disconnect(); coverObserver = null; }
    if (coverKeepObserver) { coverKeepObserver.disconnect(); coverKeepObserver = null; }
  }
  function evictCover(req) {
    const kids = req.wrap.children;
    for (let i = kids.length - 1; i >= 0; i--) { if (kids[i].tagName === "IMG") kids[i].remove(); }
    req.state = "idle";
  }
  function sortCoverPending() {
    if (coverPending.length < 2) return;
    const root = document.querySelector("main.content");
    const rr = root ? root.getBoundingClientRect() : null;
    const mid = rr ? (rr.top + rr.bottom) / 2 : 0;
    const dist = (r) => { const b = r.wrap.getBoundingClientRect(); return Math.abs((b.top + b.bottom) / 2 - mid); };
    const keyed = coverPending.map((r) => [dist(r), r]);
    keyed.sort((x, y) => x[0] - y[0]);
    coverPending = keyed.map((x) => x[1]);
  }
  function getCoverObserver() {
    if (coverObserver || typeof IntersectionObserver !== "function") return coverObserver;
    const root = document.querySelector("main.content");
    coverKeepObserver = new IntersectionObserver((entries) => {
      if (searchViewHidden()) return;
      entries.forEach((en) => {
        const req = en.target.__coverReq;
        if (!req || req.epoch !== coverEpoch) return;
        if (en.isIntersecting) { req.far = false; return; }
        req.far = true;
        if (req.state === "loaded") evictCover(req);
      });
    }, { root: root || null, rootMargin: COVER_KEEP_MARGIN });
    coverObserver = new IntersectionObserver((entries) => {
      if (searchViewHidden()) return;
      entries.forEach((en) => {
        const req = en.target.__coverReq;
        if (!req || req.epoch !== coverEpoch) return;
        if (en.isIntersecting) {
          req.far = false;
          if (req.state === "idle") { req.state = "queued"; coverPending.push(req); }
        } else if (req.state === "queued") {
          req.state = "idle";
        }
      });
      coverPending = coverPending.filter((r) => r.state === "queued");
      sortCoverPending();
      pumpCovers();
    }, { root: root || null, rootMargin: COVER_PREFETCH_MARGIN });
    return coverObserver;
  }
  function applyCover(wrap, uri, k) {
    if (!wrap.isConnected) return;
    if (!uri) { wrap.classList.add("cover-failed"); return; }
    const img = document.createElement("img");
    img.alt = "";
    img.style.transitionDelay = Math.min(k, 5) * COVER_STAGGER_MS + "ms";
    img.addEventListener("load", () => img.classList.add("is-loaded"));
    img.addEventListener("error", () => img.remove());
    img.src = uri;
    wrap.appendChild(img);
    if (img.complete && img.naturalWidth) img.classList.add("is-loaded");
  }
  function pumpCovers() {
    while (coverInflight < COVER_INFLIGHT_MAX && coverPending.length) {
      const epoch = coverEpoch;
      const batch = [];
      while (batch.length < COVER_BATCH && coverPending.length) {
        const req = coverPending.shift();
        if (req.epoch === epoch && req.state === "queued" && req.wrap.isConnected) { req.state = "loading"; batch.push(req); }
      }
      if (!batch.length) continue;
      coverInflight += 1;
      const done = () => { coverInflight = Math.max(0, coverInflight - 1); pumpCovers(); };
      let call;
      try {
        call = window.pywebview && window.pywebview.api && window.pywebview.api.get_covers
          ? window.pywebview.api.get_covers(batch.map((r) => r.id)) : null;
      } catch (e) { call = null; }
      if (!call || typeof call.then !== "function") { batch.forEach((r) => { r.state = "failed"; r.wrap.classList.add("cover-failed"); }); done(); continue; }
      call.then((map) => {
        if (epoch === coverEpoch && map && typeof map === "object") {
          batch.forEach((r, k) => {
            const uri = map[r.id];
            if (r.far && uri) { r.state = "idle"; return; }
            r.state = uri ? "loaded" : "failed";
            applyCover(r.wrap, uri, k);
          });
        } else {
          batch.forEach((r) => { if (r.state === "loading") r.state = "idle"; });
        }
        done();
      }, () => { batch.forEach((r) => { if (r.state === "loading") r.state = "idle"; }); done(); });
    }
  }
  function buildBookCover(book, eager) {
    const wrap = document.createElement("div");
    wrap.className = "search-card-cover";
    const placeholder = document.createElement("div");
    placeholder.className = "search-card-cover-placeholder";
    placeholder.innerHTML = COVER_PLACEHOLDER_SVG;
    wrap.appendChild(placeholder);
    if (book.cover_id) {
      const req = { wrap, id: book.cover_id, epoch: coverEpoch, state: "idle", far: false };
      wrap.__coverReq = req;
      const obs = getCoverObserver();
      if (eager || !obs) { req.state = "queued"; coverPending.push(req); }
      if (obs) { obs.observe(wrap); if (coverKeepObserver) coverKeepObserver.observe(wrap); }
    }
    return wrap;
  }
  const SITE_ICON_REKHTA = '<svg viewBox="0 0 70.21 50.37" xmlns="http://www.w3.org/2000/svg"><path fill="#010101" d="M86.9409,238.29715c-6.77884,0-13.269,3.259-16.42959,10.30281l-.06269-9.67893H67.70471c-1.57958,3.84893-3.37655,7.818-6.69695,10.91055-8.08771,6.80226-18.44215,6.51739-18.44215,6.51739v.00218H35.53582v2.94723h7.02979v25.81033H32v3.5573H81.07154l.01505-3.5573H70.5113V260.99385a28.476,28.476,0,0,1,1.72556-9.91793,15.22426,15.22426,0,0,1,14.704-10.5231c5.065,0,9.41417,2.39546,10.87691,5.18657a13.76286,13.76286,0,0,0-7.96662-2.73756,9.25936,9.25936,0,0,0-9.63545,9.44215c0,4.95885,4.42,8.73387,10.35062,8.73387,6.2515,0,11.64316-5.06776,11.64316-10.99569C102.20952,244.24392,95.78106,238.29715,86.9409,238.29715Z" transform="translate(-31.99973 -238.29659)"/></svg>';
  const SITE_ICON_SUFINAMA = '<svg viewBox="0 0 358.04 635.92" xmlns="http://www.w3.org/2000/svg"><path d="m194.33,199.47c-15.77-40.04-.1-72.53-.1-72.53L358.04,1.36l-215,125.67s-26.87,89.82,63.78,143.74C387.02,377.96,1.69,635.92,1.69,635.92c0,0,247.15-136.86,280.93-253.09,34.78-119.67-67.59-130.77-88.3-183.36Z" fill="#010101"/><path d="m91.37,250.26c41.03,55.88,84.99,53.92,112.34,92.6,36.89,52.17-46.5,141.45-46.5,141.45,0,0,99.93-97.07,68.77-149.26-31.26-52.36-57.63-43.8-95.34-84.2-32.82-35.17-26.57-104.13-26.57-104.13L0,211.56l70.27-27.53s-1.52,35.42,21.1,66.23Z" fill="#CC1F36"/><path d="m66.75,107.45s5.25-18.17,25.79-29.89c20.54-11.72,39.85-5.27,39.85-5.27L73.97,2.38s-11.23-5.83-23.54.76c-12.78,6.83-11,20.44-11,20.44l27.32,83.87Z" fill="#CC1F36"/></svg>';
  const QUEUE_LABEL = { primary: "حالیہ", secondary: "ثانوی" };
  function layoutTitlesWithAuthors(items) {
    const list = items.filter((it) => it.author);
    if (!list.length) return;
    list.forEach((it) => it.titleEl.classList.add("is-measuring"));
    list.forEach((it) => {
      it.lineHeight = parseFloat(getComputedStyle(it.titleEl).lineHeight) || 21;
      it.aloneHeight = it.titleEl.scrollHeight;
    });
    const putAuthorOnOwnLine = (it) => {
      const authorP = document.createElement("p");
      authorP.className = "search-card-author";
      authorP.textContent = it.author;
      it.titleEl.insertAdjacentElement("afterend", authorP);
    };
    const inlined = [];
    list.forEach((it) => {
      if (it.aloneHeight <= it.lineHeight * 1.4) { putAuthorOnOwnLine(it); return; }
      it.inlineAuthor = document.createElement("span");
      it.inlineAuthor.className = "search-card-author-inline";
      it.inlineAuthor.textContent = "  " + it.author;
      it.titleEl.appendChild(it.inlineAuthor);
      inlined.push(it);
    });
    inlined.forEach((it) => {
      it.tooTall = it.titleEl.scrollHeight > it.lineHeight * 2 + 2;
    });
    inlined.forEach((it) => {
      if (it.tooTall) {
        it.titleEl.removeChild(it.inlineAuthor);
        putAuthorOnOwnLine(it);
      }
    });
    list.forEach((it) => it.titleEl.classList.remove("is-measuring"));
  }
  const QUEUE_CARD_GRACE_MS = 2500;
  let searchQueuedCards = [];
  function syncSearchQueuedCards() {
    if (!searchQueuedCards.length) return;
    const inQueue = new Set();
    ["primary", "secondary"].forEach((n) => queueState[n].itemsById.forEach((it) => { if (it && it.url) inQueue.add(bookLinkKey(it.url)); }));
    const now = Date.now();
    searchQueuedCards = searchQueuedCards.filter((c) => {
      if (!c.btn.isConnected) return false;
      if (now - c.at < QUEUE_CARD_GRACE_MS || inQueue.has(c.key)) return true;
      c.reset();
      return false;
    });
  }
  function renderSearchResults(results, append) {
    if (!append) { searchResultsList.innerHTML = ""; resetCovers(); searchQueuedCards = []; }
    if (!results.length) return;
    hide(searchEmptyEl);
    const pendingAuthorLayout = [];
    results.forEach((book, bookIdx) => {
      const li = document.createElement("li");
      li.className = "search-card";
      const inner = document.createElement("div");
      inner.className = "search-card-inner";
      li.appendChild(inner);
      const cover = buildBookCover(book, !append && bookIdx < 12);
      if (book.year) {
        const yearBadge = document.createElement("span");
        yearBadge.className = "search-card-year";
        yearBadge.textContent = book.year;
        cover.appendChild(yearBadge);
      }
      if (book.genre) {
        const genreBadge = document.createElement("span");
        genreBadge.className = "search-card-genre";
        genreBadge.textContent = book.genre;
        cover.appendChild(genreBadge);
      }
      const siteChip = document.createElement("span");
      siteChip.className = "search-card-site " + (book.site === "sufinama" ? "search-card-site--sufinama" : "search-card-site--rekhta");
      siteChip.title = book.site === "sufinama" ? "صوفی نامہ" : "ریختہ";
      siteChip.innerHTML = book.site === "sufinama" ? SITE_ICON_SUFINAMA : SITE_ICON_REKHTA;
      cover.appendChild(siteChip);
      inner.appendChild(cover);
      const body = document.createElement("div");
      body.className = "search-card-body";
      const title = document.createElement("p");
      title.className = "search-card-title";
      title.textContent = book.title || "بلا عنوان";
      body.appendChild(title);
      if (book.author) pendingAuthorLayout.push({ titleEl: title, author: book.author });
      const actions = document.createElement("div");
      actions.className = "search-card-actions";
      const downloadBtn = document.createElement("button");
      downloadBtn.type = "button";
      downloadBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 4V15M12 15L7.5 10.5M12 15L16.5 10.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 18.5H19" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg><span>ڈاؤن لوڈ</span>';
      downloadBtn.addEventListener("click", () => {
        switchView("download");
        urlInput.value = book.url;
        beginDownload(book.url);
      });
      actions.appendChild(downloadBtn);
      const queueBtn = document.createElement("button");
      queueBtn.type = "button";
      queueBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5" width="12" height="2.6" rx="1" fill="currentColor"/><rect x="3.5" y="9.6" width="12" height="2.6" rx="1" fill="currentColor"/><rect x="3.5" y="14.2" width="8" height="2.6" rx="1" fill="currentColor"/><path d="M18.3 12.3V19.3M14.8 15.8H21.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><span>قطار</span>';
      let queueBtnAlreadyAdded = false;
      let queueBtnQueueLabel = null;
      const queueBtnHome = queueBtn.innerHTML;
      const markAdded = (label) => {
        queueBtnAlreadyAdded = true;
        queueBtnQueueLabel = label;
        queueBtn.innerHTML = "<span>قطار میں شامل</span>";
        queueBtn.title = label + " قطار میں شامل ہے۔";
        queueBtn.classList.add("is-static");
        searchQueuedCards.push({ key: bookLinkKey(book.url), at: Date.now(), btn: queueBtn, reset: () => {
          queueBtnAlreadyAdded = false;
          queueBtnQueueLabel = null;
          queueBtn.innerHTML = queueBtnHome;
          queueBtn.removeAttribute("title");
          queueBtn.classList.remove("is-static");
        } });
      };
      queueBtn.addEventListener("click", () => {
        if (queueBtnAlreadyAdded) {
          showToast(`پہلے سے ${queueBtnQueueLabel} قطار میں شامل ہے۔`);
          return;
        }
        window.pywebview.api.add_queue_items(book.url).then((res) => {
          if (res && res.duplicates) {
            const label = QUEUE_LABEL[res.duplicate_queue] || "حالیہ";
            showToast(`پہلے سے ${label} قطار میں شامل ہے۔`);
            markAdded(label);
          } else {
            showToast("کتاب قطار میں شامل کر دی گئی۔", "success");
            markAdded(QUEUE_LABEL[res && res.queue] || "حالیہ");
          }
        });
      });
      actions.appendChild(queueBtn);
      body.appendChild(actions);
      inner.appendChild(body);
      searchResultsList.appendChild(li);
    });
    pumpCovers();
    document.fonts.ready.then(() => {
      layoutTitlesWithAuthors(pendingAuthorLayout);
    });
  }
  const historyList = document.getElementById("history-list");
  const historyEmpty = document.getElementById("history-empty");
  const historySearchEmpty = document.getElementById("history-search-empty");
  const historySearchInput = document.getElementById("history-search-input");
  const historyClearBtn = document.getElementById("history-clear-btn");
  const historySearchCount = document.getElementById("history-search-count");
  let lastHistoryEntries = [];
  let lastHistoryQueues = { primary: [], secondary: [] };
  const HISTORY_PAGE = 30;
  let historyShown = HISTORY_PAGE;
  let historyFiltered = [];
  let historyQueryNorm = "";
  function loadHistory(keepShown) {
    Promise.all([window.pywebview.api.get_history(), window.pywebview.api.get_queues()])
      .then(([entries, queues]) => {
        lastHistoryEntries = entries || [];
        lastHistoryQueues = queues || { primary: [], secondary: [] };
        applyHistoryFilter(keepShown === true);
      });
  }
  const historySortSelect = document.getElementById("history-sort");
  function historyDisplayTitle(e) {
    return e.custom_title || (e.title ? prettifySlug(e.title) : "بلا عنوان");
  }
  function sortHistoryEntries(entries, mode) {
    const list = entries.slice();
    if (mode === "oldest") list.reverse();
    else if (mode === "name") list.sort((a, b) => historyDisplayTitle(a).localeCompare(historyDisplayTitle(b), undefined, { sensitivity: "base" }));
    else if (mode === "size") list.sort((a, b) => (b.size_bytes || 0) - (a.size_bytes || 0));
    else if (mode === "pages") list.sort((a, b) => ((b.exists === false ? -1 : (b.page_count || 0)) - (a.exists === false ? -1 : (a.page_count || 0))) || 0);
    return list;
  }
  function applyHistoryFilter(keepShown) {
    const query = normalizeQuery(historySearchInput.value);
    const matched = query
      ? lastHistoryEntries.filter((e) => {
          const title = normalizeQuery(historyDisplayTitle(e));
          const urdu = normalizeQuery(e.urdu_title);
          return title.includes(query) || urdu.includes(query);
        })
      : lastHistoryEntries;
    const bySite = historySitesAllOn() ? matched : matched.filter((e) => historySiteOn[e.site || "rekhta"] !== false);
    const filtered = sortHistoryEntries(bySite, historySortSelect.value);
    if (keepShown !== true) historyShown = HISTORY_PAGE;
    renderHistory(filtered, lastHistoryQueues, query);
    historyEmpty.hidden = lastHistoryEntries.length !== 0;
    historySearchEmpty.textContent = query ? "اس عنوان سے کوئی کتاب نہیں ملی۔" : "چنی ہوئی سائٹ کی کوئی کتاب نہیں ملی۔";
    historySearchEmpty.hidden = !(lastHistoryEntries.length !== 0 && (query || !historySitesAllOn()) && filtered.length === 0);
    historySearchCount.hidden = !query || filtered.length === 0;
    if (query && filtered.length > 0) historySearchCount.textContent = `${filtered.length} نتائج ملے`;
  }
  const historySiteOn = { rekhta: true, sufinama: true, hindwi: true };
  function historySitesAllOn() { return historySiteOn.rekhta && historySiteOn.sufinama && historySiteOn.hindwi; }
  function historyToggleSite(site) {
    if (!(site in historySiteOn)) return false;
    if (historySiteOn[site] && Object.keys(historySiteOn).filter((k) => historySiteOn[k]).length === 1) return false;
    historySiteOn[site] = !historySiteOn[site];
    return true;
  }
  (function setupHistorySiteFilters() {
    const box = document.getElementById("history-site-filters");
    if (!box) return;
    const rk = box.querySelector(".site-filter--rekhta");
    const sf = box.querySelector(".site-filter--sufinama");
    if (rk) rk.innerHTML = SITE_ICON_REKHTA;
    if (sf) sf.innerHTML = SITE_ICON_SUFINAMA;
    box.querySelectorAll(".site-filter").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!historyToggleSite(btn.dataset.site)) { showToast("کم از کم ایک سائٹ فعال رہنی چاہیے۔"); return; }
        btn.setAttribute("aria-pressed", historySiteOn[btn.dataset.site] ? "true" : "false");
        applyHistoryFilter(false);
      });
    });
  })();
  historySearchInput.addEventListener("input", () => applyHistoryFilter(false));
  historySortSelect.addEventListener("change", () => applyHistoryFilter(false));
  const SETTINGS_ENGLISH = {
    "گروپ": "group", "سائز": "size", "ٹیب": "tab", "تھیم": "theme", "فولڈر": "folder", "فولڈروں": "folder",
    "فائل": "file", "فائلوں": "file", "فائلیں": "file", "لنک": "link", "کوڈ": "code", "ڈیٹا": "data", 
    "ورژن": "version", "ایپ": "app", "اپ ڈیٹ": "update", "ڈاؤن لوڈ": "download",
    "ڈاؤن لوڈر": "downloader", "رپورٹ": "report", "لاگ": "log", "سرور": "server", "آن لائن": "online",
    "سسٹم": "system", "کلپ بورڈ": "clipboard", 
    "شارٹ کٹس": "shortcuts", "کی بورڈ": "keyboard", "ماؤس": "mouse", "بٹن": "button", "کارڈ": "card", "پیسٹ": "paste",
    "کاپی": "copy", "ڈیفالٹ": "default", "ٹاسک": "task", "ٹاسک بار": "taskbar", "اسکرین": "screen",
    "ڈیسک ٹاپ": "desktop", "اسٹارٹ": "start", "مینیو": "menu", "اسٹارٹ مینیو": "start menu",
    "آئیکن": "icon", "تھمب نیل": "thumbnail", "کمپیوٹر": "computer", "پروسیسر": "processor",
    "رام": "ram", "آواز": "sound", "ویب": "web", "سائٹ": "site", "لوکیشن": "location",
    "لوکیشنز": "locations", "پیغام": "message", "اکاؤنٹ": "account", "ٹرے": "tray", "ہسٹری": "history", "قطار": "queue",
    "زوم": "zoom", "ریختہ": "rekhta", "صوفی نامہ": "sufinama", "ہندوی": "hindwi", "پی ڈی ایف": "pdf",
    "زپ": "zip", "کنٹرول": "control", "لاک": "lock", "اپ گریڈ": "upgrade",
    "اسٹیٹس": "status", "اسٹوریج": "storage", "ڈرائیو": "drive"
  };
  function normalizeSettingsText(text) {
    return String(text || "").toLowerCase()
      .replace(/[\u064B-\u065F\u0670\u0640\u200B-\u200F\u2066-\u2069]/g, "")
      .replace(/[يىئ]/g, "ی").replace(/ك/g, "ک").replace(/[هۃە]/g, "ہ").replace(/[أإآ]/g, "ا").replace(/[ۓ]/g, "ے")
      .replace(/[،؛۔؟.,:;!?()«»"'\s\-\u2010-\u2015_]+/g, " ").trim();
  }
  let settingsEnglishNorm = null;
  function settingsEnglishMap() {
    if (!settingsEnglishNorm) {
      settingsEnglishNorm = {};
      Object.keys(SETTINGS_ENGLISH).forEach((k) => { settingsEnglishNorm[normalizeSettingsText(k)] = SETTINGS_ENGLISH[k]; });
    }
    return settingsEnglishNorm;
  }
  function settingsEnglishHints(normText) {
    const map = settingsEnglishMap();
    const words = normText.split(" ");
    const out = [];
    for (let i = 0; i < words.length; i++) {
      if (map[words[i]]) out.push(map[words[i]]);
      if (i + 1 < words.length) { const two = words[i] + " " + words[i + 1]; if (map[two]) out.push(map[two]); }
    }
    return out.join(" ");
  }
  function settingsQueryVariants(query) {
    const q = normalizeSettingsText(query);
    if (!q) return [];
    const variants = [q];
    const map = settingsEnglishMap();
    if (map[q]) variants.push(map[q]);
    return variants;
  }
  function settingsTextMatches(haystackNorm, hintsNorm, variants) {
    if (!variants.length) return true;
    return variants.some((v) => haystackNorm.includes(v) || hintsNorm.includes(v));
  }
  const settingsSearchInput = document.getElementById("settings-search-input");
  const settingsSearchClear = document.getElementById("settings-search-clear");
  const settingsSearchEmpty = document.getElementById("settings-search-empty");
  function settingsRowText(row) {
    let t = row.textContent || "";
    row.querySelectorAll("[title],[aria-label],[placeholder]").forEach((n) => {
      t += " " + (n.getAttribute("title") || "") + " " + (n.getAttribute("aria-label") || "") + " " + (n.getAttribute("placeholder") || "");
    });
    t += settingsUrduOriginals(row);
    return normalizeSettingsText(t);
  }
  function applySettingsSearch() {
    if (!settingsSearchInput) return;
    const raw = settingsSearchInput.value;
    const variants = settingsQueryVariants(raw);
    const sections = Array.from(document.querySelectorAll("#view-settings .settings-section"));
    let anyShown = false;
    sections.forEach((sec) => {
      const title = sec.querySelector(".settings-section-title");
      const titleNorm = title ? normalizeSettingsText(title.textContent + settingsUrduOriginals(title)) : "";
      const titleHit = variants.length > 0 && settingsTextMatches(titleNorm, settingsEnglishHints(titleNorm), variants);
      const items = Array.from(sec.children).filter((c) => c !== title);
      let secHit = false;
      items.forEach((it) => {
        it.classList.remove("search-hide");
        if (!variants.length) { if (!it.hidden) secHit = true; return; }
        if (it.hidden) return;
        const txt = settingsRowText(it);
        const hit = titleHit || settingsTextMatches(txt, settingsEnglishHints(txt), variants);
        if (hit) secHit = true; else it.classList.add("search-hide");
      });
      sec.classList.toggle("search-hide", variants.length > 0 && !secHit);
      if (secHit || !variants.length) anyShown = true;
    });
    if (settingsSearchEmpty) settingsSearchEmpty.hidden = !(variants.length > 0 && !anyShown);
    if (settingsSearchClear) settingsSearchClear.hidden = !raw;
  }
  if (settingsSearchInput) {
    settingsSearchInput.addEventListener("input", applySettingsSearch);
    if (settingsSearchClear) settingsSearchClear.addEventListener("click", () => {
      settingsSearchInput.value = "";
      applySettingsSearch();
      settingsSearchInput.focus({ preventScroll: true });
    });
  }
  const SETTINGS_EN = {
    "ترتیبات": "Settings",
    "اس لفظ سے کوئی ترتیب نہیں ملی۔": "No setting matches this word.",
    "اکاؤنٹ": "Account",
    "اس کمپیوٹر کی حالت": "Status of this computer",
    "گروپ": "Group",
    "حالت": "Status",
    "آج کی کتابیں": "Today’s books",
    "آج کے صفحات": "Today’s pages",
    "درخواست": "Request",
    "اپ گریڈ کی درخواست": "Upgrade request",
    "دعوتی کوڈ": "Invite code",
    "ظاہری شکل": "Appearance",
    "تھیم": "Theme",
    "ایپ کا رنگ کیسا ہو": "Choose the colours of the app",
    "تحریر کا سائز": "Text size",
    "پوری ایپ کی تحریر اور بٹن بڑے دکھانے کے لیے": "Show the text and buttons of the whole app larger",
    "معمول": "Normal",
    "بڑا": "Large",
    "بہت بڑا": "Extra large",
    "تلاش کے کارڈ پر رنگین حرکت": "Colourful motion on search cards",
    "ماؤس لے جانے پر کارڈ کے گرد رنگین بارڈر گھومتا ہے؛ بند کریں تو سادہ آؤٹ لائن آئے گی": "A colourful border circles the card when the mouse is over it; if you turn it off, a plain outline is shown",
    "قطار منتقلی کی اڑان ہدف کا پیچھا کرے": "Queue-move flight follows its target",
    "کتابیں ایک قطار سے دوسری میں بھیجتے وقت گنتی کا نقطہ ہدف کا پیچھا کرتا ہے؛ بند کریں تو پرانی لہراتی اڑان آئے گی": "When books are sent from one queue to the other, the counting dot follows its target; if you turn it off, the old wavy flight is used",
    "ڈاؤن لوڈ": "Download",
    "تلاش کے لیے پہلی ویب سائٹ": "First website for search",
    "\"تلاش کتاب\" ٹیب کھلنے پر ابتدا میں یہی ویب سائٹ فعال ہوگی": "This website is active first when the “تلاش کتاب” (Book Search) tab opens",
    "ریختہ": "Rekhta",
    "صوفی نامہ": "Sufinama",
    "نیا لنک کس قطار میں جائے؟": "Which queue should a new link go to?",
    "\"ڈاؤن لوڈ قطار\" میں نیا لنک شامل کرنے پر وہ ڈیفالٹ طور پر یہاں جائے گا": "When a new link is added in the “ڈاؤن لوڈ قطار” (Download Queue), it goes here by default",
    "حالیہ قطار": "Current queue",
    "ثانوی قطار": "Secondary queue",
    "اوپر جانے کا گول بٹن کس طرف ہو؟": "Which side should the round scroll-to-top button be on?",
    "لمبے صفحے پر نیچے آنے پر یہ بٹن اسکرین کے اسی کونے میں نظر آئے گا": "When you scroll down a long page, this button appears in this corner of the screen",
    "بائیں": "Left",
    "دائیں": "Right",
    "ڈاؤن لوڈ کے دوران کمپیوٹر سونے نہ پائے": "Keep the computer awake during downloads",
    "ٹرے میں رہیں": "Stay in the tray",
    "بند یا چھوٹی کرنے پر ایپ گھڑی کے پاس کے نشان میں چلتی رہتی ہے؛ نشان نہ دکھے تو چھوٹے تیر میں دیکھیں": "Closing or minimising keeps the app running as an icon near the clock; if you do not see it, check the small arrow",
    "رات بھر کی قطار بیچ میں نہیں رکے گی؛ ختم ہوتے ہی عام حالت بحال": "An overnight queue will not be interrupted; normal behaviour returns as soon as it finishes",
    "کلپ بورڈ میں کتاب کا لنک ہو تو بتائیں": "Tell me when the clipboard has a book link",
    "ڈاؤن لوڈ ٹیب میں ایک چھوٹا چپ آتا ہے؛ کلپ بورڈ صرف آپ کے کمپیوٹر پر پڑھا جاتا ہے، کہیں بھیجا نہیں جاتا": "A small chip appears in the Download tab; the clipboard is read only on your computer and is never sent anywhere",
    "Ctrl+V دبانے پر کتاب کا لنک خود ڈاؤن لوڈ کریں": "Download the book automatically when I press Ctrl+V on its link",
    "جب کسی خانے میں لکھ نہ رہے ہوں اور Ctrl+V دبائیں تو کلپ بورڈ میں کتاب کا لنک ملنے پر ڈاؤن لوڈ فوراً شروع ہو جاتا ہے؛ بند کریں تو کچھ نہیں ہوگا": "When you are not typing in a box and press Ctrl+V, a book link found on the clipboard starts downloading at once; if you turn it off, nothing happens",
    "اکیلی ڈاؤن لوڈ ختم ہونے پر کتاب خود کھولیں": "Open the book by itself when a single download finishes",
    "صرف ڈاؤن لوڈ ٹیب کی اکیلی کتاب پر؛ قطار کی کتابیں خود نہیں کھلتیں": "Only for a single book from the Download tab; queue books do not open by themselves",
    "ڈاؤن لوڈ مکمل ہونے پر اطلاع": "Notify me when a download finishes",
    "ٹاسک بار کا آئیکن جھپکے گا اور ایپ میں پیغام آئے گا": "The taskbar icon will blink and a message will appear in the app",
    "مکمل ہونے پر ہلکی آواز": "Soft sound when finished",
    "بند رکھی گئی ہے؛ چاہیں تو آن کریں": "Kept off; turn it on if you like",
    "ڈاؤن لوڈ چلتے ہوئے بند کرنے سے پہلے پوچھیں": "Ask before closing while a download is running",
    "ڈاؤن لوڈ یا قطار جاری/رکی ہو تو ایپ بند کرنے سے پہلے پوچھا جائے گا": "You will be asked before the app closes if a download or queue is running or paused",
    "جگہ اور ہسٹری": "Space and History",
    "ڈاؤن لوڈ لوکیشن": "Download location",
    "تبدیل کریں": "Change",
    "عارضی ڈیٹا فولڈر": "Temporary data folder",
    "کھولیں": "Open",
    "عارضی فائلوں کا صفایا کریں": "Clear temporary files",
    "عارضی فولڈر میں پڑی تمام تصاویر اور فولڈر ہمیشہ کے لیے حذف ہو جائیں گی": "All images and folders in the temporary folder will be deleted permanently",
    "عارضی فائلوں کا موجودہ حجم:": "Current size of temporary files:",
    "فولڈر": "Folder",
    "میں دستیاب جگہ:": "free space:",
    "صفایا کریں": "Clear",
    "ڈاؤن لوڈ کی ہسٹری یاد رکھیں": "Remember download history",
    "بند کرنے پر نئی کتابیں ہسٹری میں شامل نہیں ہوں گی": "If you turn it off, new books will not be added to History",
    "ہسٹری صاف کریں": "Clear history",
    "محفوظ شدہ فہرست اور تھمب نیل ہمیشہ کے لیے حذف ہوں گے": "The saved list and thumbnails will be deleted permanently",
    "صاف کریں": "Clear",
    "مدد اور ایپ کے بارے میں": "Help and About",
    "کتاب ڈاؤن لوڈر": "Kitab Downloader",
    "ورژن کی معلومات…": "Version information…",
    "کی بورڈ شارٹ کٹس": "Keyboard shortcuts",
    "رہنمائی دوبارہ دیکھیں": "View the guide again",
    "شارٹ کٹ بنائیں": "Create shortcuts",
    "ڈیسک ٹاپ اور اسٹارٹ مینیو میں ایپ کا شارٹ کٹ (پہلی بار کھلنے پر خودکار بنتا ہے؛ فولڈر منتقل کیا ہو تو یہاں سے دوبارہ بنائیں)": "A shortcut to the app on the Desktop and Start menu (created automatically the first time the app opens; if you moved the folder, create it again from here)",
    "بنائیں": "Create",
    "ایپ اپ ڈیٹ لگائیں": "Install app update",
    "آن لائن چیک کریں، یا موصول شدہ اپ ڈیٹ فائل (.zip) منتخب کریں -- ایپ خود بند ہو کر نئی فائلیں لگا کر دوبارہ کھل جائے گی۔": "Check online, or choose a received update file (.zip). The app will close itself, install the new files and open again.",
    "آن لائن چیک کریں": "Check online",
    "فائل منتخب کریں": "Choose file",
    "مسئلے کی رپورٹ": "Problem report",
    "کوئی خرابی آئے تو رپورٹ بنا کر بھیج دیں۔ اس میں صرف لاگ اور سسٹم کی سادہ معلومات ہوتی ہیں؛ آپ کی کتابیں، ہسٹری اور فولڈروں کے نام شامل نہیں ہوتے": "If something goes wrong, make a report and send it. It contains only the log and simple system information; the names of your books, history and folders are not included",
    "لاگ فولڈر": "Log folder",
    "رپورٹ بنائیں": "Make report",
    "تفصیلی لاگ (صرف مالک کے لیے)": "Detailed log (owner only)",
    "ہر کلک، ہر مرحلے کا وقت، رام اور پروسیسر کا استعمال لکھتی رہتی ہے۔ کتاب کا نام، لنک اور تلاش کا لفظ نہیں لکھا جاتا۔ ٹیسٹ ختم ہوتے ہی بند کر دیں۔ مسئلہ نظر آئے تو Ctrl+Shift+M دبا کر نشان لگائیں۔": "Records every click, the time of each step, and RAM and processor use. Book names, links and search words are not recorded. Turn it off as soon as testing ends. If you see a problem, press Ctrl+Shift+M to mark it.",
    "فولڈر کھولیں": "Open folder",
    "ڈیفالٹ ترتیبات بحال کریں": "Restore default settings",
    "تھیم، لوکیشنز اور دیگر تمام ترتیبات اپنی اصل حالت میں واپس آ جائیں گی": "Theme, locations and all other settings will return to their original state",
    "بحال کریں": "Restore",
    "ترتیبات میں تلاش کریں…": "Search settings…",
    "تلاش صاف کریں": "Clear search",
    "نظام کے مطابق": "Follow the system",
    "ہلکا": "Light",
    "گہرا": "Dark",
    "سبز ہلکا": "Green light",
    "سبز گہرا": "Green dark",
    "فعال": "Active",
    "ڈاؤن لوڈ کے لیے دعوتی کوڈ درکار ہے": "An invite code is needed to download",
    "سرور سے رابطہ نہیں ہوا؛ نیٹ ہو تو ایپ خود رجسٹر ہو جائے گی": "Could not reach the server; when the internet is available the app will register itself",
    "منظوری کا انتظار ہے؛ ڈاؤن لوڈ ابھی بند ہیں": "Waiting for approval; downloads are off for now",
    "اس کمپیوٹر پر استعمال بند ہے": "Use is turned off on this computer",
    "ڈاؤن لوڈ فی الحال بند ہیں": "Downloads are off for now",
    "کوئی نہیں": "None",
    "بھیجی جا چکی، فیصلے کا انتظار": "Sent, waiting for a decision",
    "منظور ہوئی": "Approved",
    "منظور نہیں ہوئی": "Not approved",
    "آف لائن گنتی بھیجنا باقی ہے": "The offline count is still to be sent",
    "مکمل": "Complete",
    "ڈویلپمنٹ ورژن (سورس سے چلایا گیا)": "Development version (run from source)",
    "اس ورژن سے ڈاؤن لوڈ بند ہیں؛ اپ ڈیٹ لگانا ضروری ہے۔ نئی فائل ابھی ملی نہیں تو «آن لائن چیک کریں» دبائیں۔": "Downloads are off for this version; installing the update is required. If the new file has not arrived yet, press “آن لائن چیک کریں” (Check online).",
  };
  const SETTINGS_EN_WAIT_RE = /^(?:(\d+) گھنٹے)?(?: ?(\d+) منٹ)?$/;
  function settingsEnWait(w) {
    const m = SETTINGS_EN_WAIT_RE.exec(String(w).trim());
    if (!m || (!m[1] && !m[2])) return null;
    const parts = [];
    if (m[1]) parts.push(m[1] + (m[1] === "1" ? " hour" : " hours"));
    if (m[2]) parts.push(m[2] + (m[2] === "1" ? " minute" : " minutes"));
    return parts.join(" ");
  }
  const SETTINGS_EN_RULES = [
    [/^بلڈ نمبر (.+)$/, (m) => "Build number " + m[1]],
    [/^(.+?) \(لامحدود\)$/, (m) => m[1] + " (unlimited)"],
    [/^(اپ ڈیٹ ضروری ہے۔ )?نیا ورژن دستیاب ہے؛ «اپ ڈیٹ کریں» دبائیں۔$/, (m) => (m[1] ? "Update is required. " : "") + "A new version is available; press “اپ ڈیٹ کریں” (Update)."],
    [/^آن لائن اپ ڈیٹ چیک کرنے کی موجودہ حد مکمل ہوچکی۔ (.+) بعد دوبارہ چیک کرسکتے ہیں۔$/, (m) => {
      const w = settingsEnWait(m[1]);
      return w ? "The current limit for online update checks is complete. You can check again after " + w + "." : null;
    }],
    [/^درخواست کا جواب: (.*)$/, (m) => "Reply to the request: " + m[1]],
  ];
  function settingsToEnglish(text) {
    const raw = String(text === null || text === undefined ? "" : text);
    const core = raw.trim().replace(/\s+/g, " ");
    if (!core) return null;
    const lead = raw.slice(0, raw.length - raw.replace(/^\s+/, "").length);
    const trail = raw.slice(raw.replace(/\s+$/, "").length);
    let en = null;
    if (Object.prototype.hasOwnProperty.call(SETTINGS_EN, core)) en = SETTINGS_EN[core];
    else {
      for (let i = 0; i < SETTINGS_EN_RULES.length && en === null; i++) {
        const m = SETTINGS_EN_RULES[i][0].exec(core);
        if (m) en = SETTINGS_EN_RULES[i][1](m);
      }
    }
    return en === null ? null : lead + en + trail;
  }
  const settingsViewEl = document.getElementById("view-settings");
  const settingsLangBtns = Array.from(document.querySelectorAll("#settings-lang-switch .lang-btn"));
  const settingsTextOrig = new WeakMap();
  const settingsAttrOrig = new WeakMap();
  const SETTINGS_I18N_ATTRS = ["title", "aria-label", "placeholder"];
  let settingsLang = "ur";
  let settingsObserver = null;
  function settingsTranslateTextNode(node) {
    const cur = node.nodeValue;
    const rec = settingsTextOrig.get(node);
    if (rec && rec.en === cur) return;
    const en = settingsToEnglish(cur);
    if (en === null || en === cur) return;
    settingsTextOrig.set(node, { ur: cur, en: en });
    node.nodeValue = en;
  }
  function settingsTranslateAttrs(el) {
    SETTINGS_I18N_ATTRS.forEach((a) => {
      if (!el.hasAttribute || !el.hasAttribute(a)) return;
      const cur = el.getAttribute(a);
      let rec = settingsAttrOrig.get(el);
      if (rec && rec[a] && rec[a].en === cur) return;
      const en = settingsToEnglish(cur);
      if (en === null || en === cur) return;
      if (!rec) { rec = {}; settingsAttrOrig.set(el, rec); }
      rec[a] = { ur: cur, en: en };
      el.setAttribute(a, en);
    });
  }
  function settingsTranslateTree(root) {
    const w = document.createTreeWalker(root, 4);
    let n;
    while ((n = w.nextNode())) settingsTranslateTextNode(n);
    if (root.nodeType === 1) {
      settingsTranslateAttrs(root);
      root.querySelectorAll("[title],[aria-label],[placeholder]").forEach(settingsTranslateAttrs);
    }
  }
  function settingsRestoreUrdu() {
    const w = document.createTreeWalker(settingsViewEl, 4);
    let n;
    while ((n = w.nextNode())) {
      const rec = settingsTextOrig.get(n);
      if (rec && rec.en === n.nodeValue) n.nodeValue = rec.ur;
      settingsTextOrig.delete(n);
    }
    settingsViewEl.querySelectorAll("[title],[aria-label],[placeholder]").forEach((el) => {
      const rec = settingsAttrOrig.get(el);
      if (!rec) return;
      Object.keys(rec).forEach((a) => { if (rec[a].en === el.getAttribute(a)) el.setAttribute(a, rec[a].ur); });
      settingsAttrOrig.delete(el);
    });
  }
  function settingsUrduOriginals(el) {
    if (settingsLang !== "en") return "";
    let out = "";
    const w = document.createTreeWalker(el, 4);
    let n;
    while ((n = w.nextNode())) {
      const rec = settingsTextOrig.get(n);
      if (rec && rec.en === n.nodeValue) out += " " + rec.ur;
    }
    [el].concat(Array.from(el.querySelectorAll("[title],[aria-label],[placeholder]"))).forEach((e) => {
      const rec = settingsAttrOrig.get(e);
      if (rec) Object.keys(rec).forEach((a) => { if (rec[a].en === e.getAttribute(a)) out += " " + rec[a].ur; });
    });
    return out;
  }
  function realignSettingsHighlights() {
    if (!settingsViewEl.classList.contains("is-active") || !lastLoadedTheme) return;
    try {
      moveThemeHighlight(lastLoadedTheme, false);
      moveQueueTargetHighlight(lastLoadedQueueTarget, false);
      moveScrollSideHighlight(lastLoadedScrollSide, false);
      moveDefaultSiteHighlight(lastLoadedDefaultSite, false);
      moveTextSizeHighlight(lastLoadedTextSize || "normal", false);
    } catch (e) { }
  }
  function applySettingsLang(lang) {
    const en = lang === "en";
    const next = en ? "en" : "ur";
    const changed = next !== settingsLang;
    settingsLang = next;
    settingsLangBtns.forEach((b) => {
      const on = b.dataset.lang === next;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    if (!changed) return;
    settingsViewEl.classList.toggle("settings-en", en);
    if (en) { settingsViewEl.setAttribute("dir", "ltr"); settingsViewEl.setAttribute("lang", "en"); }
    else { settingsViewEl.removeAttribute("dir"); settingsViewEl.removeAttribute("lang"); }
    if (settingsSearchInput) settingsSearchInput.setAttribute("dir", en ? "ltr" : "rtl");
    if (settingsObserver) { settingsObserver.disconnect(); settingsObserver = null; }
    if (en) {
      settingsTranslateTree(settingsViewEl);
      if (typeof MutationObserver === "function") {
        settingsObserver = new MutationObserver((muts) => {
          muts.forEach((m) => {
            if (m.type === "characterData") settingsTranslateTextNode(m.target);
            else if (m.type === "attributes") settingsTranslateAttrs(m.target);
            else m.addedNodes.forEach((nd) => {
              if (nd.nodeType === 3) settingsTranslateTextNode(nd);
              else if (nd.nodeType === 1) settingsTranslateTree(nd);
            });
          });
        });
        settingsObserver.observe(settingsViewEl, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: SETTINGS_I18N_ATTRS });
      }
    } else {
      settingsRestoreUrdu();
    }
    realignSettingsHighlights();
    applySettingsSearch();
  }
  settingsLangBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const lang = btn.dataset.lang === "en" ? "en" : "ur";
      if (lang === settingsLang) return;
      applySettingsLang(lang);
      saveSettings({ settings_lang: lang });
    });
  });
  function findQueueContaining(queues, url) {
    if ((queues.primary || []).some((i) => i.url === url)) return "primary";
    if ((queues.secondary || []).some((i) => i.url === url)) return "secondary";
    return null;
  }
  const SEARCH_SEP_RE = /[\s\-\u2010-\u2015]+/g;
  const SEARCH_SEP_CHAR_RE = /[\s\-\u2010-\u2015]/;
  function normalizeQuery(text) {
    return (text || "").toLowerCase().replace(SEARCH_SEP_RE, " ").trim();
  }
  function buildNormalized(text) {
    let norm = "";
    const starts = [], ends = [];
    let i = 0;
    while (i < text.length) {
      if (SEARCH_SEP_CHAR_RE.test(text[i])) {
        let j = i;
        while (j < text.length && SEARCH_SEP_CHAR_RE.test(text[j])) j++;
        norm += " "; starts.push(i); ends.push(j); i = j;
      } else {
        const low = text[i].toLowerCase();
        norm += low.length === 1 ? low : text[i];
        starts.push(i); ends.push(i + 1); i++;
      }
    }
    return { norm, starts, ends };
  }
  function findMatchRanges(nt, q) {
    const ranges = [];
    if (!q) return ranges;
    let from = 0;
    while (true) {
      const idx = nt.norm.indexOf(q, from);
      if (idx === -1) break;
      ranges.push([nt.starts[idx], nt.ends[idx + q.length - 1]]);
      from = idx + q.length;
    }
    return ranges;
  }
  function appendHighlighted(el, text, ranges, offset) {
    let pos = 0, lastMark = null;
    ranges.forEach(([s, e]) => {
      const cs = Math.max(s, offset) - offset;
      const ce = Math.min(e, offset + text.length) - offset;
      if (ce <= cs) return;
      if (cs > pos) el.appendChild(document.createTextNode(text.slice(pos, cs)));
      const mark = document.createElement("span");
      mark.className = "history-title-highlight";
      mark.textContent = text.slice(cs, ce);
      el.appendChild(mark);
      lastMark = mark;
      pos = ce;
    });
    if (pos < text.length) el.appendChild(document.createTextNode(text.slice(pos)));
    return lastMark;
  }
  function layoutHistoryTitles(items) {
    const withMark = [];
    items.forEach((it) => {
      it.titleEl.textContent = "";
      it.lastMark = appendHighlighted(it.titleEl, it.text, it.ranges, 0);
      if (it.lastMark) withMark.push(it);
    });
    const sliding = [];
    withMark.forEach((it) => {
      const el = it.titleEl;
      if (el.scrollWidth <= el.clientWidth + 1) return;
      const range = document.createRange();
      range.setStart(el, 0);
      range.setEndAfter(it.lastMark);
      if (range.getBoundingClientRect().width <= el.clientWidth) return;
      const style = getComputedStyle(el);
      it.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      it.maxWidth = el.clientWidth;
      sliding.push(it);
    });
    if (!sliding.length) return;
    if (!layoutHistoryTitles._canvas) layoutHistoryTitles._canvas = document.createElement("canvas");
    const ctx = layoutHistoryTitles._canvas.getContext("2d");
    sliding.forEach((it) => {
      const { text, ranges, titleEl } = it;
      const last = ranges[ranges.length - 1];
      let end = last[1];
      while (end < text.length && !/\s/.test(text[end])) end++;
      let k = end;
      while (k < text.length && /\s/.test(text[k])) k++;
      if (k < text.length) {
        end = k;
        while (end < text.length && !/\s/.test(text[end])) end++;
      }
      const wordStarts = [];
      for (let i = 0; i < text.length; i++) {
        if (!/\s/.test(text[i]) && (i === 0 || /\s/.test(text[i - 1]))) wordStarts.push(i);
      }
      const candidates = wordStarts.filter((st) => st <= last[0]);
      if (!candidates.length) candidates.push(0);
      ctx.font = it.font;
      const ELLIPSIS = "… ";
      let startIdx = candidates[candidates.length - 1];
      for (const st of candidates) {
        if (ctx.measureText(ELLIPSIS + text.slice(st, end)).width <= it.maxWidth) { startIdx = st; break; }
      }
      titleEl.textContent = "";
      titleEl.appendChild(document.createTextNode(ELLIPSIS));
      appendHighlighted(titleEl, text.slice(startIdx, end), ranges, startIdx);
    });
  }
  function makeThumbFallback() {
    const fallback = document.createElement("div");
    fallback.className = "history-thumb-fallback";
    fallback.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M6 3.5H14L18 7.5V19.5C18 20 17.6 20.4 17.1 20.4H6.9C6.4 20.4 6 20 6 19.5V4.4C6 3.9 6.4 3.5 6.9 3.5H6Z" stroke="currentColor" stroke-width="1.5"/></svg>';
    return fallback;
  }
  const failedThumbs = new Map();
  let failedThumbTimer = null;
  function thumbFailed(id, img) {
    failedThumbs.set(id, img);
    if (failedThumbTimer) return;
    failedThumbTimer = setTimeout(() => {
      failedThumbTimer = null;
      const batch = Array.from(failedThumbs.entries());
      failedThumbs.clear();
      window.pywebview.api.get_thumbnails(batch.map(([bid]) => bid)).then((map) => {
        batch.forEach(([bid, el]) => {
          const data = map && map[bid];
          if (data && el.isConnected) el.src = data;
          else if (el.isConnected) el.replaceWith(makeThumbFallback());
        });
      }).catch(() => {
        batch.forEach(([, el]) => { if (el.isConnected) el.replaceWith(makeThumbFallback()); });
      });
    }, 40);
  }
  const ICON_CALENDAR = '<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="5.5" width="16" height="14" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  const ICON_DISK = '<svg viewBox="0 0 24 24" fill="none"><path d="M5 14.5l2-8A1.5 1.5 0 0 1 8.4 5.4h7.2A1.5 1.5 0 0 1 17 6.5l2 8" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><rect x="4" y="14.5" width="16" height="5" rx="1.6" stroke="currentColor" stroke-width="1.6"/><circle cx="16.5" cy="17" r="0.9" fill="currentColor"/></svg>';
  function buildHistoryChips(entry) {
    const wrap = document.createElement("span");
    wrap.className = "history-chips";
    const defs = [
      ["pages", "صفحات", STAT_ICONS.pages, entry.page_count === 1 ? "1 صفحہ" : `${entry.page_count || 0} صفحات`],
      ["date", "تاریخ", ICON_CALENDAR, formatDate(entry.downloaded_at) || "—"],
      ["size", "سائز", ICON_DISK, entry.exists && entry.size_bytes ? ltrIso(formatSize(entry.size_bytes)) : "—"],
    ];
    defs.forEach(([key, label, icon, text]) => {
      const chip = document.createElement("span");
      chip.className = "history-chip";
      chip.dataset.chip = key;
      chip.setAttribute("aria-label", label);
      chip.innerHTML = `<span class="history-chip-icon">${icon}</span><span class="history-chip-value"></span>`;
      if (key === "date" && /\s\d{4}$/.test(text)) {
        const day = document.createTextNode(text.replace(/\s\d{4}$/, "") + " ");
        const yr = document.createElement("span");
        yr.className = "hc-year";
        yr.textContent = text.slice(-4);
        chip.lastChild.appendChild(day);
        chip.lastChild.appendChild(yr);
      } else {
        chip.lastChild.textContent = text;
      }
      if (key === "pages" && (entry.page_count || 0) > 9999) chip.classList.add("is-big");
      wrap.appendChild(chip);
    });
    return wrap;
  }
  function makeHistorySiteBall(site, extraClass) {
    const el = document.createElement("span");
    el.className = "history-meta-site" + (site === "sufinama" ? " history-meta-site--sufinama" : "") + (site === "hindwi" ? " history-meta-site--hindwi" : "") + (extraClass ? " " + extraClass : "");
    el.title = site === "sufinama" ? "صوفی نامہ" : site === "hindwi" ? "ہندوی" : "ریختہ";
    if (site === "hindwi") el.textContent = "ہ";
    else el.innerHTML = site === "sufinama" ? SITE_ICON_SUFINAMA : SITE_ICON_REKHTA;
    return el;
  }
  function setRequeueLabel(btn, full, mid, short) {
    btn.textContent = "";
    const a = document.createElement("span");
    a.className = "rq-full";
    a.textContent = full;
    const m = document.createElement("span");
    m.className = "rq-mid";
    m.textContent = mid;
    m.title = full;
    const b = document.createElement("span");
    b.className = "rq-short";
    b.textContent = short;
    b.title = full;
    btn.appendChild(a);
    btn.appendChild(m);
    btn.appendChild(b);
  }
  function buildHistoryRow(entry, queues, queryNorm, pendingFix) {
    const li = document.createElement("li");
    li.className = "history-row";
    const cover = document.createElement("span");
    cover.className = "history-cover";
    if (entry.thumbnail_url) {
      const img = document.createElement("img");
      img.className = "history-thumb";
      img.setAttribute("loading", "lazy");
      img.alt = "";
      img.addEventListener("error", () => thumbFailed(entry.id, img), { once: true });
      img.src = entry.thumbnail_url;
      cover.appendChild(img);
    } else {
      cover.appendChild(makeThumbFallback());
    }
    if (entry.site) cover.appendChild(makeHistorySiteBall(entry.site, "history-cover-site"));
    li.appendChild(cover);
    const main = document.createElement("div");
    main.className = "history-main";
    const title = document.createElement("p");
    title.className = "history-title";
    const displayTitle = historyDisplayTitle(entry);
    title.title = entry.urdu_title ? `${displayTitle}\n${entry.urdu_title}` : displayTitle;
    const ranges = queryNorm ? findMatchRanges(buildNormalized(displayTitle), queryNorm) : [];
    if (ranges.length) {
      pendingFix.push({ titleEl: title, text: displayTitle, ranges });
    } else {
      title.textContent = displayTitle;
    }
    main.appendChild(title);
    const meta = document.createElement("p");
    meta.className = "history-meta";
    if (entry.site) meta.appendChild(makeHistorySiteBall(entry.site));
    meta.appendChild(buildHistoryChips(entry));
    main.appendChild(meta);
    if (!entry.exists) {
      const missing = document.createElement("p");
      missing.className = "history-missing";
      missing.textContent = MSG_HISTORY_FILE_MISSING;
      main.appendChild(missing);
    }
    li.appendChild(main);
    const actions = document.createElement("div");
    actions.className = "history-actions";
    if (entry.exists) {
      const folderBtn = document.createElement("button");
      folderBtn.className = "btn-secondary btn-icon-only";
      folderBtn.title = "فولڈر کھولیں";
      folderBtn.innerHTML = ICON_FOLDER;
      folderBtn.addEventListener("click", () => {
        window.pywebview.api.reveal_in_folder(entry.pdf_path).then((res) => {
          if (!res || !res.ok) loadHistory();
        });
      });
      actions.appendChild(folderBtn);
      const openBtn = document.createElement("button");
      openBtn.className = "btn-secondary btn-icon-only";
      openBtn.title = "کتاب کھولیں";
      openBtn.innerHTML = ICON_OPEN_BOOK;
      openBtn.addEventListener("click", () => {
        window.pywebview.api.open_file(entry.pdf_path).then((res) => {
          if (!res || !res.ok) loadHistory();
        });
      });
      actions.appendChild(openBtn);
    } else if (entry.source_url) {
      const requeueBtn = document.createElement("button");
      requeueBtn.className = "btn-secondary";
      li.classList.add("has-requeue");
      const already = findQueueContaining(queues, entry.source_url);
      if (already) {
        const label = already === "secondary" ? "ثانوی قطار" : "حالیہ قطار";
        setRequeueLabel(requeueBtn, label + " میں شامل ہے۔", label + " میں شامل", "شاملِ قطار");
        requeueBtn.classList.add("is-static");
        requeueBtn.addEventListener("click", () => showToast(`پہلے سے ${label} میں شامل ہے۔`));
      } else {
        setRequeueLabel(requeueBtn, "دوبارہ قطار میں شامل کریں", "دوبارہ قطار میں؟", "دوبارہ قطار");
        requeueBtn.addEventListener("click", () => {
          window.pywebview.api.requeue_history_entry(entry.id).then((res) => {
            if (res && res.ok) {
              const label = res.queue === "secondary" ? "ثانوی قطار" : "حالیہ قطار";
              setRequeueLabel(requeueBtn, label + " میں شامل ہے۔", label + " میں شامل", "شاملِ قطار");
              requeueBtn.classList.add("is-static");
              showToast(`لنک ${label} میں شامل کر دیا گیا۔`, "success");
            } else if (res && res.error) {
              showToast(res.error);
            }
          });
        });
      }
      actions.appendChild(requeueBtn);
    }
    li.appendChild(actions);
    const removeBtn = document.createElement("button");
    removeBtn.className = "history-remove";
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", () => {
      window.pywebview.api.remove_history_entry(entry.id).then((res) => {
        loadHistory(true);
        if (res && res.undo) {
          showUndoToast("ہسٹری سے ہٹا دی گئی۔", () => {
            window.pywebview.api.restore_history_entry(entry.id).then(() => loadHistory(true));
          });
        }
      });
    });
    li.appendChild(removeBtn);
    return li;
  }
  const historyMoreWrap = document.getElementById("history-more-wrap");
  const historyMoreBtn = document.getElementById("history-more-btn");
  function updateHistoryMore() {
    const rest = historyFiltered.length - historyList.children.length;
    historyMoreWrap.hidden = rest <= 0;
    if (rest > 0) historyMoreBtn.textContent = `اور دکھائیں (${rest} باقی)`;
  }
  function appendHistoryRows(from, to) {
    const frag = document.createDocumentFragment();
    const pendingFix = [];
    for (let i = from; i < to; i++) frag.appendChild(buildHistoryRow(historyFiltered[i], lastHistoryQueues, historyQueryNorm, pendingFix));
    historyList.appendChild(frag);
    layoutHistoryTitles(pendingFix);
    updateHistoryMore();
  }
  function renderHistory(entries, queues, queryNorm) {
    historyList.innerHTML = "";
    historyFiltered = entries;
    historyQueryNorm = queryNorm;
    appendHistoryRows(0, Math.min(historyShown, entries.length));
  }
  function showMoreHistory() {
    const from = historyList.children.length;
    if (from >= historyFiltered.length) return;
    historyShown = Math.min(from + HISTORY_PAGE, historyFiltered.length);
    appendHistoryRows(from, historyShown);
  }
  historyMoreBtn.addEventListener("click", showMoreHistory);
  if (typeof IntersectionObserver !== "undefined") {
    new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) showMoreHistory(); }, { rootMargin: "200px" }).observe(historyMoreBtn);
  }
  var HISTORY_MONTHS = ["جنوری", "فروری", "مارچ", "اپریل", "مئی", "جون", "جولائی", "اگست", "ستمبر", "اکتوبر", "نومبر", "دسمبر"];
  function formatDate(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      return `${d.getDate()} ${HISTORY_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    } catch (e) { return String(iso); }
  }
  historyClearBtn.addEventListener("click", () => {
    confirmAction("کیا آپ پوری ہسٹری اور اس کے تھمب نیل ہمیشہ کے لیے صاف کرنا چاہتے ہیں؟", () => {
      collapseAndRemoveAll(Array.from(historyList.children));
      setTimeout(() => {
        window.pywebview.api.clear_history().then(loadHistory);
      }, 260);
    });
  });
  const downloadDirValue = document.getElementById("download-dir-value");
  const changeDirBtn = document.getElementById("change-dir-btn");
  const tempDirValue = document.getElementById("temp-dir-value");
  const changeTempDirBtn = document.getElementById("change-temp-dir-btn");
  const clearTempBtn = document.getElementById("clear-temp-btn");
  const saveHistoryToggle = document.getElementById("save-history-toggle");
  const confirmCloseToggle = document.getElementById("confirm-close-toggle");
  function applyCardAnimation(on) {
    document.documentElement.classList.toggle("no-card-anim", !on);
  }
  const EXTRA_TOGGLES = [
    [document.getElementById("keep-awake-toggle"), "keep_awake", true],
    [document.getElementById("tray-toggle"), "tray_enabled", false],
    [document.getElementById("notify-finish-toggle"), "notify_on_finish", true],
    [document.getElementById("sound-finish-toggle"), "sound_on_finish", false],
    [document.getElementById("card-anim-toggle"), "card_animation", true],
    [document.getElementById("fly-chase-toggle"), "queue_fly_chase", true],
    [document.getElementById("clipboard-chip-toggle"), "clipboard_chip", true],
    [document.getElementById("paste-start-toggle"), "paste_start_download", true],
    [document.getElementById("auto-open-toggle"), "auto_open_on_finish", false],
    [document.getElementById("detail-log-toggle"), "detailed_log", false],
  ];
  const settingsClearHistoryBtn = document.getElementById("settings-clear-history-btn");
  const queueTargetBtns = document.querySelectorAll("#queue-target-segmented .seg-btn");
  const scrollSideBtns = document.querySelectorAll("#scroll-side-segmented .seg-btn");
  const tempSizeValue = document.getElementById("temp-size-value");
  const defaultSiteBtns = document.querySelectorAll("#default-site-segmented .seg-btn");
  const TEXT_ZOOM = { normal: 1, large: 1.15, xlarge: 1.3 };
  const textSizeBtns = document.querySelectorAll("#text-size-segmented .seg-btn");
  const TEXT_SIZE_ORDER = ["normal", "large", "xlarge"];
  const ZOOM_ANIM_MS = 220;
  const WHEEL_STEP_PX = 50;
  const WHEEL_COOLDOWN_MS = 220;
  function stepTextSize(current, dir) {
    const i = TEXT_SIZE_ORDER.indexOf(current);
    const from = i < 0 ? 0 : i;
    return TEXT_SIZE_ORDER[Math.max(0, Math.min(TEXT_SIZE_ORDER.length - 1, from + (dir > 0 ? 1 : -1)))];
  }
  function zoomAt(from, to, t) {
    const k = Math.max(0, Math.min(1, t));
    return from + (to - from) * (1 - Math.pow(1 - k, 3));
  }
  function wheelStep(acc, deltaY) {
    const a = acc + deltaY;
    if (Math.abs(a) >= WHEEL_STEP_PX) return { acc: 0, dir: a < 0 ? 1 : -1 };
    return { acc: a, dir: 0 };
  }
  let zoomRaf = 0;
  function currentZoomNumber() {
    const z = parseFloat(document.documentElement.style.zoom);
    return z > 0 ? z : 1;
  }
  function cancelZoomAnim() {
    if (zoomRaf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(zoomRaf);
    zoomRaf = 0;
    document.documentElement.classList.remove("zoom-animating");
  }
  function animateZoomTo(target, done) {
    cancelZoomAnim();
    const root = document.documentElement;
    const from = currentZoomNumber();
    const finish = () => {
      root.style.zoom = target === 1 ? "" : String(target);
      root.classList.remove("zoom-animating");
      zoomRaf = 0;
      done();
    };
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || from === target || typeof requestAnimationFrame !== "function") { finish(); return; }
    root.classList.add("zoom-animating");
    const start = performance.now();
    const frame = (now) => {
      const t = ((now || performance.now()) - start) / ZOOM_ANIM_MS;
      if (t >= 1) { finish(); return; }
      root.style.zoom = String(zoomAt(from, target, t));
      zoomRaf = requestAnimationFrame(frame);
    };
    zoomRaf = requestAnimationFrame(frame);
  }
  function applyTextSize(size, animate) {
    if (!TEXT_ZOOM[size]) size = "normal";
    lastLoadedTextSize = size;
    const afterZoom = () => { if (typeof recheckRowCompact === "function") recheckRowCompact(); };
    if (animate) {
      animateZoomTo(TEXT_ZOOM[size], afterZoom);
    } else {
      cancelZoomAnim();
      document.documentElement.style.zoom = size === "normal" ? "" : String(TEXT_ZOOM[size]);
      afterZoom();
    }
    textSizeBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.size === size));
    moveTextSizeHighlight(size, true);
  }
  function userSetTextSize(size) {
    if (size === (lastLoadedTextSize || "normal")) return;
    applyTextSize(size, true);
    saveSettings({ text_size: size });
  }
  function userStepTextSize(dir) { userSetTextSize(stepTextSize(lastLoadedTextSize || "normal", dir)); }
  textSizeBtns.forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.size === lastLoadedTextSize) return;
    userSetTextSize(b.dataset.size);
  }));
  const SHORTCUT_CODE_KEYS = { Equal: "=", Minus: "-", NumpadAdd: "+", NumpadSubtract: "-", Slash: "/", NumpadDivide: "/" };
  const SLASH_KEY_CHARS = ["/", "?", ".", ",", "<", ">"];
  function shortcutKey(e) {
    const k = typeof e.key === "string" ? e.key : "";
    const c = typeof e.code === "string" ? e.code : "";
    let m = /^(?:Digit|Numpad)([0-5])$/.exec(c);
    if (m && (e.ctrlKey || e.metaKey)) return m[1];
    const ascii = k.length === 1 && k.charCodeAt(0) > 32 && k.charCodeAt(0) < 127;
    if (c === "Digit1" && e.shiftKey && !e.ctrlKey && !e.metaKey && !ascii) return "!";
    if (c === "Slash" && !e.ctrlKey && !e.metaKey && (!ascii || SLASH_KEY_CHARS.indexOf(k) !== -1)) return e.shiftKey ? "?" : "/";
    if (ascii) return k.toLowerCase();
    m = /^(?:Digit|Numpad)([0-9])$/.exec(c);
    if (m) return m[1];
    m = /^Key([A-Z])$/.exec(c);
    if (m) return m[1].toLowerCase();
    if (c === "Slash" || c === "NumpadDivide") return e.shiftKey && c === "Slash" ? "?" : "/";
    if (SHORTCUT_CODE_KEYS[c]) return SHORTCUT_CODE_KEYS[c];
    return k;
  }
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const sk = shortcutKey(e);
    if (sk === "+" || sk === "=") { e.preventDefault(); userStepTextSize(1); }
    else if (sk === "-" || sk === "_") { e.preventDefault(); userStepTextSize(-1); }
    else if (sk === "0") { e.preventDefault(); userSetTextSize("normal"); }
  }, true);
  let wheelAcc = 0;
  let wheelIdleTimer = 0;
  let wheelLastStepAt = 0;
  window.addEventListener("wheel", (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const now = Date.now();
    if (now - wheelLastStepAt < WHEEL_COOLDOWN_MS) return;
    let dy = e.deltaY || 0;
    if (e.deltaMode === 1) dy *= 16; else if (e.deltaMode === 2) dy *= 100;
    const r = wheelStep(wheelAcc, dy);
    wheelAcc = r.acc;
    clearTimeout(wheelIdleTimer);
    wheelIdleTimer = setTimeout(() => { wheelAcc = 0; }, 250);
    if (r.dir) { wheelLastStepAt = now; userStepTextSize(r.dir); }
  }, { passive: false });
  function applyDefaultSiteDisplay(site) {
    defaultSiteBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.site === site));
    moveDefaultSiteHighlight(site, true);
  }
  defaultSiteBtns.forEach((b) => b.addEventListener("click", () => {
    lastLoadedDefaultSite = b.dataset.site;
    applyDefaultSiteDisplay(b.dataset.site);
    if (!searchSiteTouchedByUser) switchSearchSite(b.dataset.site);
    saveSettings({ default_search_site: b.dataset.site });
  }));
  function forgetSingleSpace() {
    if (!spaceChecked) return;
    Array.from(spaceChecked).forEach((k) => { if (k.indexOf("single:") === 0) spaceChecked.delete(k); });
  }
  function ltrIso(t) { return "\u2066" + t + "\u2069"; }
  function formatSize(bytes) {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let val = bytes || 0, i = 0;
    while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
    return (i === 0 ? val : val.toFixed(i >= 3 ? 1 : 0)) + " " + units[i];
  }
  var spaceChecked = new Set();
  function checkFreeSpace(key, pages) {
    if (!pages || !spaceChecked || spaceChecked.has(key)) return;
    spaceChecked.add(key);
    if (spaceChecked.size > 500) spaceChecked.clear();
    let p;
    try { p = window.pywebview.api.get_free_space(pages); } catch (e) { return; }
    p.then((res) => {
      if (!res || !res.ok || !res.low || res.free == null) return;
      showToast("خالی جگہ کم ہے: ڈرائیو پر " + ltrIso(formatSize(res.free)) + " باقی ہے، اور اس کتاب کو تقریباً "
        + ltrIso(formatSize(res.need)) + " چاہییں۔ جگہ ختم ہوئی تو ڈاؤن لوڈ خود رک جائے گا اور جگہ بنتے ہی چل پڑے گا۔", "info", false, 9000);
    }).catch(() => {});
  }
  function formatBytes(bytes) {
    const b = bytes || 0;
    if (b === 0) return "خالی";
    const units = ["B", "KB", "MB", "GB"];
    let val = b, i = 0;
    while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
    const num = i === 0 ? val : val.toFixed(1);
    return `${num} ${units[i]}`;
  }
  const tempFreeValue = document.getElementById("temp-free-value");
  const tempDriveValue = document.getElementById("temp-drive-value");
  function refreshTempSize() {
    window.pywebview.api.get_temp_size().then((res) => {
      tempSizeValue.textContent = res && res.ok ? formatBytes(res.bytes) : "";
      window.pywebview.api.get_free_space(0).then((fs) => {
        if (fs && fs.ok && fs.temp_free != null) {
          tempFreeValue.textContent = formatSize(fs.temp_free);
          if (fs.temp_drive) tempDriveValue.textContent = fs.temp_drive;
        }
      }).catch(() => {});
    });
  }
  const pathOverflowEls = [];
  function setPathValue(el, fullPath) {
    el.textContent = fullPath || "";
    el.title = "";
    if (!pathOverflowEls.includes(el)) pathOverflowEls.push(el);
    requestAnimationFrame(() => {
      el.title = el.scrollWidth > el.clientWidth ? fullPath : "";
    });
  }
  window.addEventListener("resize", () => {
    pathOverflowEls.forEach((el) => {
      const full = el.textContent;
      requestAnimationFrame(() => {
        el.title = el.scrollWidth > el.clientWidth ? full : "";
      });
    });
  });
  const GUIDE_STEPS = [
    { title: "لنک پیسٹ کریں", text: "ریختہ، صوفی نامہ یا ہندوی پر کتاب کا لنک کاپی کریں، \"ڈاؤن لوڈ\" ٹیب میں پیسٹ کریں اور شروع دبائیں۔ کتاب خود PDF بن کر آپ کے فولڈر میں آ جائے گی۔" },
    { title: "یا کتاب تلاش کریں", text: "لنک نہ ہو تو \"تلاش\" ٹیب میں نام لکھیں۔ نتیجے پر کلک کرتے ہی کتاب ڈاؤن لوڈ کے لیے تیار ہو جاتی ہے۔" },
    { title: "بہت سی کتابیں؟ قطار بنائیں", text: "کئی کتابیں \"قطار\" میں ڈال دیں، ایپ ایک ایک کر کے اتارے گی۔ بیچ میں وقفے سائٹ کا خیال رکھنے کے لیے ہیں، ایپ رکی نہیں۔ مکمل کتابیں \"ہسٹری\" میں ملیں گی۔" },
  ];
  const guideOverlay = document.getElementById("guide-overlay");
  const guideTitleEl = document.getElementById("guide-title");
  const guideTextEl = document.getElementById("guide-text");
  const guideCountEl = document.getElementById("guide-step-count");
  const guideDotsEl = document.getElementById("guide-dots");
  const guideNextBtn = document.getElementById("guide-next");
  const guideSkipBtn = document.getElementById("guide-skip");
  let guideStep = 0;
  function renderGuideStep() {
    const st = GUIDE_STEPS[guideStep];
    guideTitleEl.textContent = st.title;
    guideTextEl.textContent = st.text;
    guideCountEl.textContent = `قدم ${ltrIso(`${guideStep + 1} / ${GUIDE_STEPS.length}`)}`;
    guideDotsEl.innerHTML = GUIDE_STEPS.map((_, i) => `<span class="guide-dot${i === guideStep ? " is-on" : ""}"></span>`).join("");
    guideNextBtn.textContent = guideStep === GUIDE_STEPS.length - 1 ? "شروع کریں" : "اگلا";
    guideSkipBtn.hidden = guideStep === GUIDE_STEPS.length - 1;
  }
  function openGuide() {
    guideStep = 0;
    renderGuideStep();
    guideOverlay.hidden = false;
    setTimeout(() => guideNextBtn.focus(), 0);
  }
  function closeGuide() {
    guideOverlay.hidden = true;
    window.pywebview.api.mark_guide_seen().catch(() => {});
  }
  guideNextBtn.addEventListener("click", () => {
    if (guideStep < GUIDE_STEPS.length - 1) { guideStep++; renderGuideStep(); } else closeGuide();
  });
  guideSkipBtn.addEventListener("click", closeGuide);
  document.getElementById("show-guide-btn").addEventListener("click", openGuide);
  function maybeShowGuide(tries) {
    tries = tries || 0;
    window.pywebview.api.get_first_run_guide().then((r) => {
      if (!r || !r.show) return;
      const blocked = !requestOverlay.hidden || !codeOverlay.hidden || !overlay.hidden;
      if (blocked && tries < 20) setTimeout(() => maybeShowGuide(tries + 1), 1500);
      else if (!blocked) openGuide();
    }).catch(() => {});
  }
  const aboutBuildEl = document.getElementById("about-build");
  function loadAboutInfo() {
    if (!aboutBuildEl) return;
    window.pywebview.api.get_app_info().then((info) => {
      const b = info && info.build;
      aboutBuildEl.textContent = b ? `بلڈ نمبر ${b}` : "ڈویلپمنٹ ورژن (سورس سے چلایا گیا)";
    }).catch(() => {});
  }
  function loadSettings() {
    window.pywebview.api.get_settings().then((s) => {
      loadAboutInfo();
      const theme = s.theme || "system";
      lastLoadedTheme = theme;
      applyTheme(theme);
      setPathValue(downloadDirValue, s.download_dir || "");
      setPathValue(tempDirValue, s.temp_data_dir || "");
      switchCtl.sync(saveHistoryToggle, "save_history", s.save_history !== false);
      switchCtl.sync(confirmCloseToggle, "confirm_on_close", s.confirm_on_close !== false);
      EXTRA_TOGGLES.forEach(([el, key, dflt]) => {
        switchCtl.sync(el, key, typeof s[key] === "boolean" ? s[key] : dflt);
      });
      const target = s.queue_target || "primary";
      lastLoadedQueueTarget = target;
      queueTargetBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.target === target));
      applyTextSize(s.text_size);
      applySettingsLang(s.settings_lang === "en" ? "en" : "ur");
      const sideNow = s.scroll_top_side === "right" ? "right" : "left";
      lastLoadedScrollSide = sideNow;
      applyScrollTopSide(sideNow);
      scrollSideBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.side === sideNow));
      const defSite = s.default_search_site === "sufinama" ? "sufinama" : "rekhta";
      lastLoadedDefaultSite = defSite;
      applyDefaultSiteDisplay(defSite);
      currentSearchSite = defSite;
      searchSiteBtns.forEach((b) => {
        const on = b.dataset.site === currentSearchSite;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-checked", on ? "true" : "false");
      });
      if (document.getElementById("view-settings").classList.contains("is-active")) {
        moveThemeHighlight(theme, false);
        moveQueueTargetHighlight(target, false);
        moveScrollSideHighlight(sideNow, false);
      }
    });
    refreshTempSize();
  }
  changeDirBtn.addEventListener("click", () => {
    window.pywebview.api.pick_folder().then((folder) => {
      if (folder) {
        saveSettings({ download_dir: folder }).then((s) => {
          if (s && s.error) { showToast(s.error); return; }
          setPathValue(downloadDirValue, s.download_dir);
        });
      }
    });
  });
  changeTempDirBtn.addEventListener("click", () => {
    window.pywebview.api.pick_folder().then((folder) => {
      if (folder) {
        saveSettings({ temp_data_dir: folder }).then((s) => {
          if (s && s.error) { showToast(s.error); return; }
          setPathValue(tempDirValue, s.temp_data_dir);
          refreshTempSize();
        });
      }
    });
  });
  clearTempBtn.addEventListener("click", () => {
    window.pywebview.api.get_temp_size().then((res) => {
      const bytes = res && res.ok ? res.bytes : 0;
      if (res && res.ok) tempSizeValue.textContent = formatBytes(bytes);
      const units = ["B", "KB", "MB", "GB"];
      let val = bytes, i = 0;
      while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
      const sizeText = bytes ? ` (${ltrIso(`${i === 0 ? val : val.toFixed(1)} ${units[i]}`)})` : "";
      confirmAction(
        `کیا آپ عارضی فولڈر کے ادھورے ڈاؤن لوڈ کے صفحات اور سرورق کی یادداشت${sizeText} ہمیشہ کے لیے حذف کرنا چاہتے ہیں؟ ` +
        "جو کتابیں رُکی ہوئی ہوں وہ دوبارہ شروع کرنے پر صفر سے شروع ہوں گی۔",
        () => {
          window.pywebview.api.clear_temp_data().then((r) => {
            if (r && !r.ok && r.error) showToast(r.error);
            refreshTempSize();
          });
        }
      );
    });
  });
  queueTargetBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      queueTargetBtns.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      moveQueueTargetHighlight(btn.dataset.target, true);
      lastLoadedQueueTarget = btn.dataset.target;
      saveSettings({ queue_target: btn.dataset.target });
    });
  });
  scrollSideBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      scrollSideBtns.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      moveScrollSideHighlight(btn.dataset.side, true);
      lastLoadedScrollSide = btn.dataset.side;
      applyScrollTopSide(btn.dataset.side);
      saveSettings({ scroll_top_side: btn.dataset.side });
    });
  });
  const SWITCH_TIMEOUT_MS = 8000;
  const MSG_SWITCH_FAILED = "ترتیب محفوظ نہیں ہو سکی، پچھلی حالت بحال کر دی گئی۔ دوبارہ کوشش کیجیے۔";
  function createSwitchController(deps) {
    const states = new Map();
    function st(el) {
      let x = states.get(el);
      if (!x) { x = { committed: el.getAttribute("aria-checked") === "true", saving: false, gen: 0 }; states.set(el, x); }
      return x;
    }
    function paint(el, key, v) {
      el.setAttribute("aria-checked", v ? "true" : "false");
      if (deps.onChange) deps.onChange(key, v);
    }
    function isOk(res, key, want) {
      if (!res || typeof res !== "object") return false;
      if (res.error || res.ok === false) return false;
      return !(key in res) || typeof res[key] !== "boolean" || res[key] === want;
    }
    function withTimeout(p) {
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("timeout")), deps.timeoutMs);
        Promise.resolve(p).then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
      });
    }
    function sync(el, key, v) {
      const x = st(el);
      x.committed = !!v; x.gen++;
      paint(el, key, x.committed);
    }
    function flush(el, key) {
      const x = st(el);
      if (x.saving) return Promise.resolve();
      const want = el.getAttribute("aria-checked") === "true";
      if (want === x.committed) return Promise.resolve();
      x.saving = true;
      const gen = x.gen;
      return withTimeout(deps.save(key, want)).then((res) => isOk(res, key, want), () => false).then((ok) => {
        x.saving = false;
        if (gen !== x.gen) return flush(el, key);
        if (ok) { x.committed = want; return flush(el, key); }
        paint(el, key, x.committed);
        deps.fail(key);
        return null;
      });
    }
    function click(el, key) {
      st(el);
      paint(el, key, el.getAttribute("aria-checked") !== "true");
      return flush(el, key);
    }
    return { click: click, sync: sync };
  }
  const switchCtl = createSwitchController({
    timeoutMs: SWITCH_TIMEOUT_MS,
    save: (key, val) => saveSettings({ [key]: val }),
    onChange: (key, v) => { if (key === "card_animation") applyCardAnimation(v); if (key === "queue_fly_chase") flyChaseOn = v; if (key === "paste_start_download") pasteStartOn = v; if (key === "detailed_log" && KT) KT.refreshSoon(); },
    fail: () => showToast(MSG_SWITCH_FAILED),
  });
  [[saveHistoryToggle, "save_history"], [confirmCloseToggle, "confirm_on_close"]].concat(EXTRA_TOGGLES.map(([el, key]) => [el, key]))
    .forEach(([el, key]) => el.addEventListener("click", () => { switchCtl.click(el, key); }));
  settingsClearHistoryBtn.addEventListener("click", () => {
    confirmAction("کیا آپ پوری ہسٹری اور اس کے تھمب نیل ہمیشہ کے لیے صاف کرنا چاہتے ہیں؟", () => {
      window.pywebview.api.clear_history().then(() => {
        if (document.getElementById("view-history").classList.contains("is-active")) loadHistory();
      });
    });
  });
  const updateOverlay = document.getElementById("update-overlay");
  const updateMsg = document.getElementById("update-overlay-msg");
  const updatePercent = document.getElementById("update-overlay-percent");
  const updateFill = document.getElementById("update-overlay-fill");
  let updateInstalling = false;
  const updateTrack = updateFill.parentElement;
  function setUpdateProgress(p, msg) {
    updateTrack.classList.remove("indeterminate");
    updatePercent.hidden = false;
    updatePercent.textContent = Math.round(p) + "%";
    updateFill.style.width = p + "%";
    if (msg) updateMsg.textContent = msg;
  }
  function setUpdateStage(msg) {
    updateTrack.classList.add("indeterminate");
    updatePercent.hidden = true;
    updateMsg.textContent = msg;
  }
  function startUpdateProgress() {
    updateInstalling = true;
    updateOverlay.hidden = false;
    setUpdateStage("اپ ڈیٹ فائل کی تصدیق ہو رہی ہے…");
  }
  function stopUpdateProgress() { updateInstalling = false; }
  function hideUpdateOverlay() { stopUpdateProgress(); updateOverlay.hidden = true; }
  function runInstall(zipPath) {
    runInstallWith(() => window.pywebview.api.install_update(zipPath));
  }
  function runInstallStaged() {
    runInstallWith(() => window.pywebview.api.install_staged_update());
  }
  function runInstallWith(call) {
    startUpdateProgress();
    call().then((res) => {
      if (!res || !res.ok) {
        hideUpdateOverlay();
        showToast((res && res.error) || "اپ ڈیٹ لگانے میں خرابی پیش آئی۔", null, false,
          res && res.action === "folder_not_writable" ? 20000 : undefined);
        return;
      }
      updateInstalling = true;
      setUpdateStage("ایپ بند ہو رہی ہے، اپ ڈیٹ لگتے ہی خود کھلے گی…");
    });
  }
  document.getElementById("install-update-btn").addEventListener("click", () => {
    window.pywebview.api.pick_update_file().then((zipPath) => {
      if (!zipPath) return;
      confirmAction(
        "اپ ڈیٹ لگانے کے لیے ایپ خود بند ہو کر، نئی فائلیں لگا کر، دوبارہ کھل جائے گی۔ جاری رکھیں؟",
        () => runInstall(zipPath),
        { okLabel: "ہاں، اپ ڈیٹ لگائیں" }
      );
    });
  });
  function downloadAndInstall() {
    window.pywebview.api.get_update_folder_problem().then((problem) => {
      if (problem) { showToast(problem, null, false, 20000); return; }
      updateOverlay.hidden = false;
      setUpdateProgress(1, "اپ ڈیٹ اتاری جا رہی ہے…");
      window.pywebview.api.download_online_update().then((r) => {
        if (!r || !r.ok) {
          hideUpdateOverlay();
          showToast((r && r.error) || "اپ ڈیٹ اتاری نہیں جا سکی۔");
          return;
        }
        runInstall(r.path);
      });
    });
  }
  const UPDATE_NOTE_MAX = 400;
  function quoteUpdateNote(notes, max) {
    const flat = String(notes == null ? "" : notes).replace(/\s+/g, " ").trim();
    if (!flat) return "";
    const limit = max || UPDATE_NOTE_MAX;
    const cut = flat.length > limit ? flat.slice(0, limit).trimEnd() + "..." : flat;
    return "\u201c" + cut + "\u201d";
  }
  function updateOfferText(info, required) {
    const mb = info && info.size ? " (" + (info.size / 1048576).toFixed(1) + " MB)" : "";
    return (required ? "اس ایپ کو جاری رکھنے کے لیے اپ ڈیٹ ضروری ہے۔\n" : "")
      + "نیا ورژن دستیاب ہے" + mb + "۔"
      + "\nابھی اتار کر لگائیں؟ ایپ خود بند ہو کر دوبارہ کھل جائے گی۔";
  }
  function offerOnlineUpdate(info) {
    setUpdateSign(info);
    confirmAction(updateOfferText(info, !!(account && account.update_required)), downloadAndInstall,
      { okLabel: "ہاں، اپ ڈیٹ لگائیں", note: quoteUpdateNote(info && info.notes) });
  }
  function silentUpdateOn() { return !!(account && account.update_silent); }
  let silentStaging = false;
  function silentStage() {
    if (silentStaging) return Promise.resolve();
    silentStaging = true;
    return window.pywebview.api.stage_online_update().then(() => {}).catch(() => {}).then(() => { silentStaging = false; });
  }
  function onAutoUpdateAsk(info) {
    if (silentUpdateOn() && !(account && account.update_required)) { silentStage(); return; }
    setUpdateSign(info);
    if (account && account.update_required) offerOnlineUpdate(info);
  }
  function confirmIfBusy(go) {
    window.pywebview.api.is_busy().then((busy) => {
      if (!busy) { go(); return; }
      confirmAction("ڈاؤن لوڈ چل رہا ہے۔ اپ ڈیٹ کے لیے وہ رک جائے گا اور ایپ کھلنے پر رکی حالت میں بحال ہوگا۔ جاری رکھیں؟", go,
        { okLabel: "ہاں، اپ ڈیٹ لگائیں" });
    });
  }
  let updateNowRunning = false;
  function updateAppNow() {
    if (updateNowRunning) return;
    updateNowRunning = true;
    const done = () => { updateNowRunning = false; };
    window.pywebview.api.get_staged_update().then((staged) => {
      if (staged) { done(); confirmIfBusy(() => { setUpdateSign(null); updateBar.hidden = true; runInstallStaged(); }); return null; }
      return window.pywebview.api.check_online_update().then((res) => {
        done();
        if (!res || !res.ok) { showToast((res && res.error) || "اپ ڈیٹ چیک نہیں ہو سکی۔"); return; }
        if (!res.available) { showToast("ابھی سرور پر نئی اپ ڈیٹ نہیں ملی۔ تھوڑی دیر بعد دوبارہ کوشش کریں۔"); return; }
        setUpdateSign(res);
        confirmIfBusy(() => { setUpdateSign(null); downloadAndInstall(); });
      });
    }).catch(() => { done(); showToast("اپ ڈیٹ شروع نہیں ہو سکی۔"); });
  }
  const homeUpdateSign = document.getElementById("home-update-sign");
  const homeUpdateText = document.getElementById("home-update-text");
  const homeUpdateDetails = document.getElementById("home-update-details");
  const homeUpdateMore = document.getElementById("home-update-more");
  const UPDATE_NO_NOTES = "اس ورژن کی تفصیل درج نہیں کی گئی۔";
  let availableUpdateInfo = null;
  let homeSignDismissedBuild = null;
  const homeUpdateLater = document.getElementById("home-update-later");
  const UPDATE_REQUIRED_TEXT = "اس ورژن سے ڈاؤن لوڈ بند ہیں؛ اپ ڈیٹ لگانا ضروری ہے";
  function setUpdateSign(info) {
    availableUpdateInfo = info || null;
    const req = !!(account && account.update_required);
    paintUpdateLabel();
    const hide = (!info && !req) || !updateBar.hidden || (info && !req && info.build != null && info.build === homeSignDismissedBuild);
    if (hide) { homeUpdateSign.hidden = true; homeUpdateDetails.hidden = true; homeUpdateMore.setAttribute("aria-expanded", "false"); return; }
    homeUpdateLater.hidden = req;
    if (!info) {
      homeUpdateText.textContent = UPDATE_REQUIRED_TEXT;
      homeUpdateMore.hidden = true; homeUpdateDetails.hidden = true;
      homeUpdateSign.hidden = false;
      return;
    }
    homeUpdateMore.hidden = false;
    const ver = info.version ? " (" + formatBuildTime(info.version) + ")" : "";
    homeUpdateText.textContent = (req ? "اپ ڈیٹ ضروری ہے: نیا ورژن موجود ہے" : "نئی اپ ڈیٹ موجود ہے") + ver;
    const note = quoteUpdateNote(info.notes, 400);
    homeUpdateDetails.textContent = note || UPDATE_NO_NOTES;
    homeUpdateDetails.title = note || "";
    homeUpdateSign.hidden = false;
  }
  document.getElementById("home-update-later").addEventListener("click", () => {
    if (availableUpdateInfo) homeSignDismissedBuild = availableUpdateInfo.build;
    setUpdateSign(availableUpdateInfo);
  });
  const updateStatusLabel = document.getElementById("update-status-label");
  const UPDATE_LABEL_BASE = updateStatusLabel ? updateStatusLabel.textContent : "";
  function paintUpdateLabel() {
    if (!updateStatusLabel) return;
    let t = UPDATE_LABEL_BASE;
    if (manualCheckUntil > Date.now()) t = manualCheckLimitText((manualCheckUntil - Date.now()) / 1000);
    else if (availableUpdateInfo) t = (account && account.update_required ? "اپ ڈیٹ ضروری ہے۔ " : "") + "نیا ورژن دستیاب ہے؛ «اپ ڈیٹ کریں» دبائیں۔";
    else if (account && account.update_required) t = UPDATE_REQUIRED_TEXT + "۔ نئی فائل ابھی ملی نہیں تو «آن لائن چیک کریں» دبائیں۔";
    updateStatusLabel.textContent = t;
  }
  homeUpdateMore.addEventListener("click", () => {
    homeUpdateDetails.hidden = !homeUpdateDetails.hidden;
    homeUpdateMore.setAttribute("aria-expanded", homeUpdateDetails.hidden ? "false" : "true");
  });
  document.getElementById("home-update-now").addEventListener("click", updateAppNow);
  document.getElementById("error-update-btn").addEventListener("click", updateAppNow);
  document.getElementById("queue-update-btn").addEventListener("click", updateAppNow);
  function refreshQueueUpdateBar() {
    const bar = document.getElementById("queue-update-bar");
    if (!bar) return;
    let need = false;
    ["primary", "secondary"].forEach((n) => {
      const st = queueState[n];
      if (!st) return;
      st.itemsById.forEach((it) => { if (it && it.status === "error" && it.error_action === "update_app") need = true; });
    });
    bar.hidden = !need;
  }
  function nativeUpdateDownload(payload) {
    if (!updateOverlay.hidden && !updateInstalling) {
      setUpdateProgress(Math.max(1, Math.min(100, payload.percent)), "اپ ڈیٹ اتاری جا رہی ہے…");
    }
  }
  const checkUpdateBtn = document.getElementById("check-update-btn");
  let manualCheckUntil = 0;
  let manualCheckTimer = null;
  function manualCheckLimitText(secs) {
    return "آن لائن اپ ڈیٹ چیک کرنے کی موجودہ حد مکمل ہوچکی۔ " + formatWait(secs) + " بعد دوبارہ چیک کرسکتے ہیں۔";
  }
  function applyManualCheckLimit(remainingS) {
    clearTimeout(manualCheckTimer);
    const secs = Number(remainingS) || 0;
    manualCheckUntil = secs > 0 ? Date.now() + secs * 1000 : 0;
    checkUpdateBtn.disabled = secs > 0;
    checkUpdateBtn.classList.toggle("is-limited", secs > 0);
    checkUpdateBtn.setAttribute("aria-disabled", secs > 0 ? "true" : "false");
    paintUpdateLabel();
    if (secs > 0) manualCheckTimer = setTimeout(() => applyManualCheckLimit(0), secs * 1000 + 500);
  }
  checkUpdateBtn.addEventListener("click", () => {
    if (manualCheckUntil > Date.now()) { showToast(manualCheckLimitText((manualCheckUntil - Date.now()) / 1000)); return; }
    checkUpdateBtn.disabled = true;
    window.pywebview.api.manual_check_update().then((res) => {
      checkUpdateBtn.disabled = manualCheckUntil > Date.now();
      if (res && res.limited) { applyManualCheckLimit(res.remaining_s); showToast(manualCheckLimitText(res.remaining_s)); return; }
      if (res && res.limited_now) applyManualCheckLimit(res.remaining_s);
      if (!res || !res.ok) { showToast((res && res.error) || "اپ ڈیٹ چیک نہیں ہو سکی۔"); return; }
      if (!res.available) {
        if (account && account.update_required) showToast("اس ورژن کے لیے اپ ڈیٹ ضروری ہے، مگر نئی اپ ڈیٹ ابھی سرور پر موجود نہیں۔ تھوڑی دیر بعد دوبارہ چیک کریں۔");
        else showToast("آپ کے پاس تازہ ترین دستیاب ورژن ہی ہے۔", "success");
        return;
      }
      offerOnlineUpdate(res);
    });
  });
  let manualCheckStateAsked = false;
  function askManualCheckState() {
    if (manualCheckStateAsked) return;
    manualCheckStateAsked = true;
    try { window.pywebview.api.manual_update_check_state().then((st) => { if (st && st.limited) applyManualCheckLimit(st.remaining_s); }); } catch (e) { }
  }
  let account = { enabled: false, registered: false };
  const accountRow = document.getElementById("account-row");
  const accountTitle = document.getElementById("account-title");
  const accountSub = document.getElementById("account-sub");
  const requestBtn = document.getElementById("request-btn");
  const codeBtn = document.getElementById("code-btn");
  const requestOverlay = document.getElementById("request-overlay");
  const codeOverlay = document.getElementById("code-overlay");
  let codeAsked = false;
  const limitText = (used, limit) => (limit ? ltrIso(String(used) + "/" + String(limit)) : ltrIso(String(used)) + " (لامحدود)");
  function renderSiteNotice(st) {
    const el = document.getElementById("site-notice");
    const parts = [];
    if (st.site_notice) parts.push(st.site_notice);
    const names = { rekhta: "ریختہ", sufinama: "صوفی نامہ" };
    Object.keys(st.disabled_sites || {}).forEach((k) => {
      parts.push((names[k] || k) + " سے ڈاؤن لوڈ فی الحال عارضی طور پر بند ہے۔ " + (st.disabled_sites[k] || ""));
    });
    el.textContent = parts.join(" ");
    if (st.site_notice && st.site_notice_once) {
      const ok = document.createElement("button");
      ok.type = "button";
      ok.className = "site-notice-ok";
      ok.textContent = "ٹھیک ہے";
      ok.addEventListener("click", () => {
        ok.disabled = true;
        window.pywebview.api.dismiss_site_notice().then(() => refreshAccount()).catch(() => { ok.disabled = false; });
      });
      el.appendChild(ok);
    }
    const key = parts.join(" ");
    el.classList.add("has-x");
    const src = document.querySelector('.dialog-x[data-close="confirm"]');
    if (parts.length && src) {
      const x = src.cloneNode(true);
      x.removeAttribute("data-close");
      x.addEventListener("click", () => {
        siteNoticeClosedKey = key;
        el.hidden = true;
        if (st.site_notice && st.site_notice_once) { try { window.pywebview.api.dismiss_site_notice().catch(() => {}); } catch (e) { } }
      });
      el.appendChild(x);
    }
    el.hidden = parts.length === 0 || key === siteNoticeClosedKey;
  }
  let siteNoticeClosedKey = null;
  function renderAccount(st) {
    if (!st) return;
    account = st;
    renderSiteNotice(st);
    accountRow.hidden = !st.enabled;
    checkUpdateBtn.hidden = !st.update_enabled;
    setUpdateSign(availableUpdateInfo);
    if (st.update_enabled) askManualCheckState();
    renderLimitChip();
    if (!st.enabled) return;
    const lim = st.limits || {};
    const u = st.usage || { books: 0, pages: 0 };
    const rq = st.request;
    const notes = [];
    let statusText = "فعال", reqText = "—";
    if (!st.registered) {
      statusText = st.code_required ? "ڈاؤن لوڈ کے لیے دعوتی کوڈ درکار ہے" : "سرور سے رابطہ نہیں ہوا؛ نیٹ ہو تو ایپ خود رجسٹر ہو جائے گی";
      if (st.error && !st.code_required) notes.push(st.error);
    } else {
      if (st.status === "pending") statusText = "منظوری کا انتظار ہے؛ ڈاؤن لوڈ ابھی بند ہیں";
      else if (st.status === "blocked") statusText = "اس کمپیوٹر پر استعمال بند ہے";
      else if (!st.downloads_enabled) statusText = "ڈاؤن لوڈ فی الحال بند ہیں";
      reqText = "کوئی نہیں";
      if (rq && rq.status === "new") reqText = "بھیجی جا چکی، فیصلے کا انتظار";
      else if (rq && rq.status === "approved") { reqText = "منظور ہوئی"; if (rq.reply) notes.push("درخواست کا جواب: " + rq.reply); }
      else if (rq && rq.status === "rejected") { reqText = "منظور نہیں ہوئی"; if (rq.reply) notes.push("درخواست کا جواب: " + rq.reply); }
    }
    const setCell = (id, text) => { const el = document.getElementById(id); if (el && el.textContent !== text) el.textContent = text; };
    setCell("account-group", st.registered ? String(st.group || "—") : "—");
    setCell("account-status", statusText);
    setCell("account-books", st.registered ? limitText(u.books, lim.daily_books) : "—");
    setCell("account-pages", st.registered ? limitText(u.pages, lim.daily_pages) : "—");
    setCell("account-request", reqText);
    if (st.message) notes.push(st.message);
    accountSub.textContent = notes.join(" — ");
    accountSub.hidden = notes.length === 0;
    requestBtn.disabled = !st.registered || !!(st.request && st.request.status === "new");
  }
  const limitChip = document.getElementById("limit-chip");
  const limitChipText = document.getElementById("limit-chip-text");
  const limitChipTime = document.getElementById("limit-chip-time");
  const limitChipRequest = document.getElementById("limit-chip-request");
  let limitReset = null;
  let limitTimer = null;
  function formatWait(secs) {
    const mins = Math.max(1, Math.ceil(secs / 60));
    const h = Math.floor(mins / 60), m = mins % 60;
    if (h && m) return h + " گھنٹے " + m + " منٹ";
    if (h) return h + " گھنٹے";
    return m + " منٹ";
  }
  function limitChipInfo(st) {
    if (!st || !st.enabled) return null;
    if (!st.registered) {
      const fa = st.free_allowance;
      if (!fa) return null;
      return fa.left > 0
        ? { text: "آج بغیر رجسٹریشن " + fa.left + "/" + fa.daily_books + " کتاب باقی", full: false }
        : { text: "آج کی مفت حد پوری", full: true, secs: fa.resets_in_s };
    }
    if (st.status !== "active" || !st.downloads_enabled) return null;
    const lim = st.limits || {}, u = st.usage || { books: 0, pages: 0 };
    const booksFull = lim.daily_books > 0 && u.books >= lim.daily_books;
    const pagesFull = lim.daily_pages > 0 && u.pages >= lim.daily_pages;
    const canRequest = !(st.request && st.request.status === "new");
    if (booksFull || pagesFull) {
      return { text: booksFull ? "آج کی کتابوں کی حد پوری (" + u.books + "/" + lim.daily_books + ")"
                               : "آج کے صفحات کی حد پوری (" + u.pages + "/" + lim.daily_pages + ")",
               full: true, secs: st.resets_in_s, canRequest };
    }
    if (lim.daily_books > 0) return { text: "آج: " + u.books + "/" + lim.daily_books + " کتابیں", full: false };
    return null;
  }
  function renderLimitChip() {
    const info = limitChipInfo(account);
    clearTimeout(limitTimer);
    if (!info) { limitChip.hidden = true; try { closeTodayPop(); } catch (e) { } return; }
    limitChip.hidden = false;
    limitChip.classList.toggle("is-full", !!info.full);
    if (limitChipText.textContent !== info.text) limitChipText.textContent = info.text;
    limitChipRequest.hidden = !(info.full && info.canRequest);
    if (info.full && typeof info.secs === "number") {
      if (!limitReset || limitReset.src !== info.secs) limitReset = { at: Date.now(), secs: info.secs, src: info.secs };
      const left = Math.max(0, limitReset.secs - (Date.now() - limitReset.at) / 1000);
      if (left <= 0) {
        limitChipTime.textContent = "";
        limitTimer = setTimeout(() => { refreshAccountQuiet(); }, 5000);
      } else {
        limitChipTime.textContent = "— " + formatWait(left) + " بعد دوبارہ ممکن";
        limitTimer = setTimeout(renderLimitChip, 30000);
      }
    } else {
      limitChipTime.textContent = "";
    }
  }
  const limitToggle = document.getElementById("limit-chip-toggle");
  const todayPop = document.getElementById("today-pop");
  const todayDone = document.getElementById("today-done");
  const todayStarted = document.getElementById("today-started");
  const todayLimitBox = limitChipTime.parentElement;
  function niceBookName(raw) {
    const t = String(raw == null ? "" : raw).replace(/\.pdf(\.part)?$/i, "").replace(/_+/g, " ").replace(/\s+/g, " ").trim();
    if (!t) return "نام ابھی معلوم نہیں";
    if (t.indexOf(" ") === -1) return prettifySlug(t) || t;
    return t.replace(/\s+-\s+/g, " ").replace(/\s+/g, " ").split(" ").map((w) => (w.length > 1 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");
  }
  function todayUrduTitleFor(nice) {
    try {
      const key = normalizeQuery(nice);
      const hit = (lastHistoryEntries || []).find((e) => e.urdu_title && normalizeQuery(historyDisplayTitle(e)) === key);
      return hit ? hit.urdu_title : "";
    } catch (e) { return ""; }
  }
  function fillTodayList(ul, books, emptyText) {
    ul.textContent = "";
    if (!books || !books.length) {
      const li = document.createElement("li");
      li.className = "is-empty";
      li.textContent = emptyText;
      ul.appendChild(li);
      return;
    }
    books.forEach((b) => {
      const li = document.createElement("li");
      li.textContent = niceBookName(b.title);
      const urdu = todayUrduTitleFor(li.textContent);
      li.title = urdu ? `${li.textContent}\n${urdu}` : li.textContent;
      ul.appendChild(li);
    });
  }
  function syncTodayLimitBox() {
    todayLimitBox.hidden = !limitChipTime.textContent && limitChipRequest.hidden;
  }
  function renderTodayBooks(data) {
    fillTodayList(todayDone, data && data.done, "آج ابھی کوئی کتاب مکمل نہیں ہوئی");
    fillTodayList(todayStarted, data && data.started, "کوئی نامکمل کتاب نہیں");
  }
  function closeTodayPop() {
    if (todayPop.hidden) return;
    todayPop.hidden = true;
    limitToggle.setAttribute("aria-expanded", "false");
  }
  function openTodayPop() {
    syncTodayLimitBox();
    todayPop.hidden = false;
    limitToggle.setAttribute("aria-expanded", "true");
    try {
      window.pywebview.api.get_today_books().then(renderTodayBooks).catch(() => renderTodayBooks(null));
    } catch (e) { renderTodayBooks(null); }
  }
  limitToggle.addEventListener("click", () => { if (todayPop.hidden) openTodayPop(); else closeTodayPop(); });
  document.addEventListener("click", (e) => {
    if (todayPop.hidden) return;
    if (e.target && e.target.closest && e.target.closest("#limit-chip")) return;
    closeTodayPop();
  });
  function refreshAccountQuiet() {
    try {
      return window.pywebview.api.get_account_state().then(renderAccount).catch(() => {});
    } catch (e) { return Promise.resolve(); }
  }
  let limitRefreshTimer = null;
  function refreshLimitSoon(delay) {
    clearTimeout(limitRefreshTimer);
    limitRefreshTimer = setTimeout(refreshAccountQuiet, typeof delay === "number" ? delay : 1500);
  }
  limitChipRequest.addEventListener("click", () => { if (!requestBtn.disabled) requestBtn.click(); });
  function refreshAccount(atOpen) { return window.pywebview.api.refresh_account(atOpen === true).then(renderAccount); }
  let codeLocked = false;
  let codeRetried = false;
  const CODE_LOCK_OLD = "غلط کوششیں پوری ہو گئیں؛ ایک گھنٹے تک نیا کوڈ نہیں لکھا جا سکے گا۔";
  const CODE_LOCK_NEW = "موجودہ حد مکمل ہوچکی۔ آپ ایک گھنٹے بعد دوبارہ کوشش کرسکتے ہیں۔";
  function codeLockText(secs) {
    const m = Math.ceil(secs / 60);
    return secs < 60 ? "ایک منٹ سے کم میں دوبارہ کوشش کر سکیں گے۔" : "تقریباً " + m + " منٹ بعد دوبارہ کوشش کریں۔";
  }
  function applyCodeLock(state, serverMsg) {
    const input = document.getElementById("code-input");
    const send = document.getElementById("code-send");
    const err = document.getElementById("code-error");
    const locked = !!(state && state.locked);
    const wasLocked = codeLocked;
    codeLocked = locked;
    input.disabled = locked;
    if (locked) input.value = "";
    send.textContent = locked ? "دستیابی چیک کریں" : (wasLocked || !codeRetried ? "لاگو کریں" : "دوبارہ لاگو کریں");
    err.classList.toggle("is-note", locked ? !serverMsg : (wasLocked && !serverMsg));
    if (locked) err.textContent = serverMsg || codeLockText(state.remaining_s || 0);
    else if (wasLocked) { err.textContent = "اب آپ کوشش کرسکتے ہیں۔"; input.focus(); }
  }
  function openCodeDialog(msg) {
    document.getElementById("code-msg").textContent = msg || "منتظم کا دیا ہوا دعوتی کوڈ یہاں لکھیں۔";
    document.getElementById("code-error").textContent = "";
    document.getElementById("code-input").value = "";
    codeOverlay.hidden = false;
    codeLocked = false;
    codeRetried = false;
    document.getElementById("code-input").disabled = false;
    document.getElementById("code-send").disabled = false;
    document.getElementById("code-send").textContent = "لاگو کریں";
    document.getElementById("code-error").classList.remove("is-note");
    window.pywebview.api.invite_lock_state().then((st) => { if (st && st.locked) applyCodeLock(st); else document.getElementById("code-input").focus(); });
  }
  function maybeOfferCode() {
    if (account.enabled && account.code_required && !codeAsked) {
      codeAsked = true;
      openCodeDialog("ایپ کے ڈاؤن لوڈ کے لیے دعوتی کوڈ درکار ہے۔ منتظم کا دیا ہوا کوڈ یہاں لکھیں۔");
    }
  }
  codeBtn.addEventListener("click", () => openCodeDialog());
  document.getElementById("code-cancel").addEventListener("click", () => { codeOverlay.hidden = true; });
  document.getElementById("code-send").addEventListener("click", () => {
    const code = document.getElementById("code-input").value.trim();
    const err = document.getElementById("code-error");
    if (codeLocked) {
      window.pywebview.api.invite_lock_state().then((st) => applyCodeLock(st));
      return;
    }
    if (!code) { err.textContent = "کوڈ لکھیں۔"; return; }
    err.textContent = "";
    const sendBtn = document.getElementById("code-send");
    if (sendBtn.disabled) return;
    sendBtn.disabled = true;
    const done = () => { sendBtn.disabled = false; };
    window.pywebview.api.redeem_code(code).then((res) => {
      done();
      if (res && res.state) renderAccount(res.state);
      if (res && res.ok) {
        codeOverlay.hidden = true;
        showToast("کوڈ لاگو ہو گیا۔ آپ کا گروپ: " + (account.group || ""), "success");
      } else {
        err.classList.remove("is-note");
        const msg = ((res && res.error) || "کوڈ لاگو نہیں ہو سکا۔").replace(CODE_LOCK_OLD, CODE_LOCK_NEW);
        err.textContent = msg;
        if (res && res.locked) applyCodeLock({ locked: true, remaining_s: res.remaining_s }, msg);
        else { codeRetried = true; sendBtn.textContent = "دوبارہ لاگو کریں"; }
      }
    }).catch(() => { done(); err.textContent = "کوڈ لاگو نہیں ہو سکا۔"; });
  });
  document.getElementById("code-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("code-send").click();
  });
  requestBtn.addEventListener("click", () => {
    document.getElementById("request-name").value = account.name || "";
    document.getElementById("request-contact").value = "";
    document.getElementById("request-note").value = "";
    document.getElementById("request-error").textContent = "";
    requestOverlay.hidden = false;
    document.getElementById("request-name").focus();
  });
  document.getElementById("request-cancel").addEventListener("click", () => { requestOverlay.hidden = true; });
  [requestOverlay, codeOverlay].forEach((ov) => ov.addEventListener("mousedown", (e) => { if (e.target === ov) ov.hidden = true; }));
  document.getElementById("request-send").addEventListener("click", () => {
    const name = document.getElementById("request-name").value.trim();
    const contact = document.getElementById("request-contact").value.trim();
    const note = document.getElementById("request-note").value.trim();
    const err = document.getElementById("request-error");
    if (!name || !contact) { err.textContent = "نام اور رابطے کا ذریعہ دونوں لکھیں۔"; return; }
    err.textContent = "";
    window.pywebview.api.submit_upgrade_request(name, contact, note).then((res) => {
      if (res && res.state) renderAccount(res.state);
      if (res && res.ok) {
        requestOverlay.hidden = true;
        showToast("درخواست بھیج دی گئی۔ فیصلہ ہوتے ہی یہاں نظر آ جائے گا۔", "success");
      } else {
        err.textContent = (res && res.error) || "درخواست نہیں بھیجی جا سکی۔";
      }
    });
  });
  const updateBar = document.getElementById("update-bar");
  const updateBarText = document.getElementById("update-bar-text");
  const URDU_MONTHS = ["جنوری", "فروری", "مارچ", "اپریل", "مئی", "جون", "جولائی", "اگست", "ستمبر", "اکتوبر", "نومبر", "دسمبر"];
  function urduDayPart(h) {
    if (h >= 5 && h < 12) return "صبح";
    if (h >= 12 && h < 15) return "دوپہر";
    if (h >= 15 && h < 17) return "سہ پہر";
    if (h >= 17 && h < 20) return "شام";
    return "رات";
  }
  function formatBuildTime(raw) {
    const text = String(raw == null ? "" : raw).trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::\d{2})?$/.exec(text);
    if (!m) return text;
    const y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5];
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return text;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return d + " " + URDU_MONTHS[mo - 1] + " " + y + " - " + urduDayPart(h) + " " + h12 + ":" + (mi < 10 ? "0" : "") + mi;
  }
  function showUpdateBar(info) {
    const ver = info && info.version ? " (" + formatBuildTime(info.version) + ")" : "";
    updateBarText.textContent = "نیا ورژن" + ver + " تیار ہے۔ ابھی لگائیں، یا اگلی بار ایپ کھلنے پر خود لگ جائے گا۔";
    updateBar.hidden = false;
    setUpdateSign(info);
  }
  document.getElementById("update-bar-later").addEventListener("click", () => { updateBar.hidden = true; });
  document.getElementById("update-bar-now").addEventListener("click", () => {
    window.pywebview.api.is_busy().then((busy) => {
      const go = () => { updateBar.hidden = true; runInstallStaged(); };
      if (!busy) { go(); return; }
      confirmAction("ڈاؤن لوڈ چل رہا ہے۔ اپ ڈیٹ کے لیے وہ رک جائے گا اور ایپ کھلنے پر رکی حالت میں بحال ہوگا۔ جاری رکھیں؟", go,
        { okLabel: "ہاں، اپ ڈیٹ لگائیں" });
    });
  });
  function startAutoUpdate(fromTimer) {
    if (silentUpdateOn() && !(account && account.update_required)) return silentStage();
    return window.pywebview.api.stage_online_update().then((r) => {
      if (!r || !r.ok) return;
      if (!fromTimer && account && account.update_required) { runInstallStaged(); return; }
      showUpdateBar(r);
    });
  }
  const UPDATED_NOTE_STAY_MS = 14000;
  const UPDATED_NOTE_LEAVE_MS = 2500;
  const UPDATED_NOTE_FADE_MS = 4000;
  const updatedNote = document.getElementById("updated-note");
  const updatedNoteDetails = document.getElementById("updated-note-details");
  let updatedNoteTimer = null;
  function closeUpdatedNote() {
    clearTimeout(updatedNoteTimer);
    updatedNote.hidden = true;
    updatedNote.classList.remove("fading");
  }
  function armUpdatedNote(wait) {
    clearTimeout(updatedNoteTimer);
    updatedNote.classList.remove("fading");
    updatedNoteTimer = setTimeout(() => {
      updatedNote.classList.add("fading");
      updatedNoteTimer = setTimeout(closeUpdatedNote, UPDATED_NOTE_FADE_MS);
    }, wait);
  }
  function showUpdatedNote(n) {
    const when = formatBuildTime(n.version);
    document.getElementById("updated-note-text").textContent =
      "اپ ڈیٹ لگ گئی۔ ورژن: " + ltrIso(n.build) + "  تاریخ: " + when;
    const note = quoteUpdateNote(n.notes, 400);
    updatedNoteDetails.textContent = note || UPDATE_NO_NOTES;
    updatedNoteDetails.title = note || "";
    updatedNoteDetails.hidden = true;
    updatedNote.hidden = false;
    armUpdatedNote(UPDATED_NOTE_STAY_MS);
  }
  updatedNote.addEventListener("mouseenter", () => { clearTimeout(updatedNoteTimer); updatedNote.classList.remove("fading"); });
  updatedNote.addEventListener("mouseleave", () => { if (!updatedNote.hidden) armUpdatedNote(UPDATED_NOTE_LEAVE_MS); });
  updatedNote.addEventListener("focusin", () => { clearTimeout(updatedNoteTimer); updatedNote.classList.remove("fading"); });
  document.getElementById("updated-note-more").addEventListener("click", () => { updatedNoteDetails.hidden = !updatedNoteDetails.hidden; });
  function applyStagedOrCheck() {
    return window.pywebview.api.get_staged_update().then((staged) => {
      if (staged) { runInstallStaged(); return null; }
      return window.pywebview.api.auto_check_update();
    });
  }
  const UPDATE_TICK_MS = 7 * 60 * 1000;
  const UPDATE_FOCUS_GAP_MS = 20 * 1000;
  function createUpdateTicker(deps) {
    let running = false;
    const offered = new Set();
    function tick() {
      if (running || deps.blocked()) return Promise.resolve("blocked");
      running = true;
      return Promise.resolve()
        .then(() => deps.api.is_busy())
        .then((busy) => {
          if (busy) return "busy";
          return deps.api.get_staged_update().then((staged) => {
            if (staged) return "staged";
            return deps.api.auto_check_update().then((res) => {
              if (!res || !res.ok || !res.available) return "none";
              if (res.mode === "auto") return Promise.resolve(deps.onAuto(res)).then(() => "auto");
              if (offered.has(res.build)) return "already_offered";
              offered.add(res.build);
              deps.onAsk(res);
              return "ask";
            });
          });
        })
        .catch(() => "error")
        .then((r) => { running = false; return r; });
    }
    function markOffered(build) { offered.add(build); }
    return { tick: tick, markOffered: markOffered };
  }
  const updateTicker = createUpdateTicker({
    api: {
      is_busy: () => window.pywebview.api.is_busy(),
      get_staged_update: () => window.pywebview.api.get_staged_update(),
      auto_check_update: () => window.pywebview.api.auto_check_update(),
    },
    blocked: () => !updateOverlay.hidden || !updateBar.hidden || !overlay.hidden,
    onAuto: () => startAutoUpdate(true),
    onAsk: (res) => onAutoUpdateAsk(res),
  });
  let lastUpdateFocusTick = 0;
  function maybeUpdateTickOnReturn() {
    const now = Date.now();
    if (now - lastUpdateFocusTick < UPDATE_FOCUS_GAP_MS) return;
    lastUpdateFocusTick = now;
    updateTicker.tick();
  }
  let lastActivitySent = null;
  function reportWindowActivity() {
    const active = !document.hidden && document.hasFocus();
    if (active === lastActivitySent) return;
    lastActivitySent = active;
    try {
      const r = window.pywebview && window.pywebview.api && window.pywebview.api.window_activity(active);
      if (r && r.catch) r.catch(() => {});
    } catch (e) { }
  }
  window.addEventListener("focus", reportWindowActivity);
  window.addEventListener("blur", reportWindowActivity);
  document.addEventListener("visibilitychange", reportWindowActivity);
  function startUpdateTimer() {
    setInterval(() => { updateTicker.tick(); }, UPDATE_TICK_MS);
    window.addEventListener("focus", maybeUpdateTickOnReturn);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) maybeUpdateTickOnReturn(); });
  }
  document.getElementById("create-shortcuts-btn").addEventListener("click", () => {
    window.pywebview.api.create_shortcuts().then((res) => {
      if (res && res.ok) showToast("ڈیسک ٹاپ اور اسٹارٹ مینیو میں شارٹ کٹ بنا دیے گئے۔", "success");
      else showToast((res && res.error) || "شارٹ کٹ نہیں بن سکے۔");
    });
  });
  document.getElementById("open-temp-dir-btn").addEventListener("click", () => {
    window.pywebview.api.open_special_folder("temp").then((res) => {
      if (res && !res.ok) showToast(res.error || "فولڈر نہیں کھل سکا۔");
    });
  });
  document.getElementById("detail-log-folder-btn").addEventListener("click", () => {
    window.pywebview.api.open_special_folder("detail_logs").then((res) => {
      if (res && !res.ok) showToast(res.error || "فولڈر نہیں کھل سکا۔");
    });
  });
  document.getElementById("open-logs-btn").addEventListener("click", () => {
    window.pywebview.api.open_special_folder("logs").then((res) => {
      if (res && !res.ok) showToast(res.error || "فولڈر نہیں کھل سکا۔");
    });
  });
  const makeReportBtn = document.getElementById("make-report-btn");
  makeReportBtn.addEventListener("click", () => {
    makeReportBtn.disabled = true;
    window.pywebview.api.make_report().then((res) => {
      makeReportBtn.disabled = false;
      if (res && res.ok) {
        showToast("رپورٹ بن گئی؛ فولڈر کھل رہا ہے۔ یہ فائل بھیج دیں۔", "success");
        window.pywebview.api.reveal_in_folder(res.path);
      } else {
        showToast((res && res.error) || "رپورٹ نہیں بن سکی۔");
      }
    }).catch(() => { makeReportBtn.disabled = false; showToast("رپورٹ نہیں بن سکی۔"); });
  });
  document.getElementById("reset-settings-btn").addEventListener("click", () => {
    window.pywebview.api.get_settings().then((before) => {
      window.pywebview.api.reset_settings().then(() => {
        loadSettings();
        showUndoToast("ڈیفالٹ ترتیبات بحال کر دی گئیں۔", () => {
          const changes = {};
          SETTINGS_ORDER.forEach((k) => { if (before && k in before) changes[k] = before[k]; });
          saveSettings(changes).then(() => { loadSettings(); showToast("پرانی ترتیبات واپس آ گئیں۔", "success"); });
        });
      });
    });
  });
  const overlay = document.getElementById("confirm-overlay");
  const confirmBox = overlay.querySelector(".confirm-box");
  const confirmText = document.getElementById("confirm-text");
  const confirmOk = document.getElementById("confirm-ok");
  const confirmOkLabel = document.getElementById("confirm-ok-label");
  const confirmCancel = document.getElementById("confirm-cancel");
  const confirmDontAskRow = document.getElementById("confirm-dont-ask-row");
  const confirmDontAsk = document.getElementById("confirm-dont-ask");
  let pendingConfirm = null;
  let pendingWantsDontAsk = false;
  function confirmAction(text, onConfirm, opts) {
    opts = opts || {};
    confirmText.textContent = text;
    const noteEl = document.getElementById("confirm-note");
    noteEl.textContent = opts.note || "";
    noteEl.title = opts.note || "";
    noteEl.hidden = !opts.note;
    confirmOkLabel.textContent = opts.okLabel || "ہاں، صاف کریں";
    pendingWantsDontAsk = !!opts.showDontAsk;
    confirmDontAskRow.hidden = !pendingWantsDontAsk;
    confirmDontAsk.checked = false;
    pendingConfirm = onConfirm;
    overlay.hidden = false;
    setTimeout(() => confirmCancel.focus(), 0);
  }
  function dismissConfirm() {
    overlay.hidden = true;
    pendingConfirm = null;
  }
  confirmOk.addEventListener("click", () => {
    overlay.hidden = true;
    const dontAsk = pendingWantsDontAsk && confirmDontAsk.checked;
    if (pendingConfirm) pendingConfirm(dontAsk);
    pendingConfirm = null;
  });
  confirmCancel.addEventListener("click", dismissConfirm);
  overlay.addEventListener("mousedown", (e) => {
    if (!confirmBox.contains(e.target)) dismissConfirm();
  });
  function getFocusableInConfirmBox() {
    return Array.from(confirmBox.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])'))
      .filter((el) => !el.disabled && el.offsetParent !== null);
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) {
      dismissConfirm();
      return;
    }
    if (e.key === "Escape" && !guideOverlay.hidden) { closeGuide(); return; }
    if (e.key === "Escape" && !todayPop.hidden) { closeTodayPop(); return; }
    if (e.key === "Escape") {
      const openDialog = [requestOverlay, codeOverlay].find((ov) => !ov.hidden);
      if (openDialog) { openDialog.hidden = true; return; }
    }
    if (e.ctrlKey && e.key === "Tab") {
      e.preventDefault();
      const current = document.querySelector(".nav-item.is-active");
      const currentName = current ? current.dataset.view : "download";
      let idx = TAB_ORDER.indexOf(currentName);
      if (idx === -1) idx = 0;
      idx = e.shiftKey ? (idx - 1 + TAB_ORDER.length) % TAB_ORDER.length : (idx + 1) % TAB_ORDER.length;
      switchView(TAB_ORDER[idx]);
      return;
    }
    if (e.key === "Tab" && !overlay.hidden) {
      const focusable = getFocusableInConfirmBox();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey) {
        if (activeEl === first || !confirmBox.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else if (activeEl === last || !confirmBox.contains(activeEl)) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  const ctxMenu = document.getElementById("ctx-menu");
  const ctxItems = {};
  ctxMenu.querySelectorAll(".ctx-item").forEach((b) => { ctxItems[b.dataset.act] = b; });
  let ctxTarget = null;
  function isEditableField(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === "textarea") return true;
    if (tag !== "input") return false;
    const t = (el.getAttribute("type") || "text").toLowerCase();
    return ["text", "search", "url", "tel", "email", "password", "number"].includes(t);
  }
  function setCtxActive(btn) {
    ctxMenu.querySelectorAll(".ctx-item").forEach((b) => b.classList.toggle("is-kbd-active", b === btn));
  }
  function closeCtxMenu() {
    if (ctxMenu.hidden) return;
    ctxMenu.hidden = true;
    ctxTarget = null;
    setCtxActive(null);
  }
  function openCtxMenu(field, x, y) {
    ctxTarget = field;
    field.focus();
    const hasSel = field.selectionStart !== field.selectionEnd;
    const editable = !field.readOnly && !field.disabled;
    ctxItems.undo.disabled = !editable;
    ctxItems.cut.disabled = !(hasSel && editable);
    ctxItems.copy.disabled = !hasSel;
    ctxItems.paste.disabled = !editable;
    ctxItems.selectall.disabled = !field.value;
    setCtxActive(null);
    ctxMenu.hidden = false;
    const w = ctxMenu.offsetWidth, h = ctxMenu.offsetHeight;
    const maxX = window.innerWidth - w - 6, maxY = window.innerHeight - h - 6;
    ctxMenu.style.left = Math.max(6, Math.min(x, maxX)) + "px";
    ctxMenu.style.top = Math.max(6, Math.min(y, maxY)) + "px";
  }
  function insertTextIntoField(field, text) {
    if (!text) return;
    field.focus();
    let ok = false;
    try { ok = document.execCommand("insertText", false, text); } catch (e) { ok = false; }
    if (!ok) {
      field.setRangeText(text, field.selectionStart, field.selectionEnd, "end");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  function ctxPaste(field) {
    window.pywebview.api.read_clipboard_text().then((res) => {
      if (res && res.ok) { insertTextIntoField(field, res.text); return; }
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then((t) => insertTextIntoField(field, t)).catch(() => {});
      }
    });
  }
  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const field = e.target && e.target.closest ? e.target.closest("input, textarea") : null;
    if (field && isEditableField(field)) {
      if (e.button !== 2) {
        const r = field.getBoundingClientRect();
        openCtxMenu(field, r.left + Math.min(48, r.width / 2), r.bottom - 6);
      } else {
        openCtxMenu(field, e.clientX, e.clientY);
      }
    } else {
      closeCtxMenu();
    }
  });
  ctxMenu.addEventListener("mousedown", (e) => e.preventDefault());
  ctxMenu.addEventListener("contextmenu", (e) => e.preventDefault());
  ctxMenu.addEventListener("click", (e) => {
    const btn = e.target.closest(".ctx-item");
    if (!btn || btn.disabled || !ctxTarget) return;
    const field = ctxTarget;
    const act = btn.dataset.act;
    closeCtxMenu();
    field.focus();
    if (act === "undo") document.execCommand("undo");
    else if (act === "cut") document.execCommand("cut");
    else if (act === "copy") document.execCommand("copy");
    else if (act === "paste") ctxPaste(field);
    else if (act === "selectall") field.select();
  });
  document.addEventListener("mousedown", (e) => { if (!ctxMenu.hidden && !ctxMenu.contains(e.target)) closeCtxMenu(); });
  document.addEventListener("keydown", (e) => {
    if (ctxMenu.hidden) return;
    const items = Array.from(ctxMenu.querySelectorAll(".ctx-item")).filter((b) => !b.disabled);
    const cur = items.findIndex((b) => b.classList.contains("is-kbd-active"));
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      stop();
      if (!items.length) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      const next = cur === -1 ? (step === 1 ? 0 : items.length - 1) : (cur + step + items.length) % items.length;
      setCtxActive(items[next]);
    } else if (e.key === "Home" || e.key === "End") {
      stop();
      if (items.length) setCtxActive(e.key === "Home" ? items[0] : items[items.length - 1]);
    } else if (e.key === "Enter" || e.key === " ") {
      stop();
      if (cur !== -1) items[cur].click(); else closeCtxMenu();
    } else if (e.key === "Escape") {
      stop();
      closeCtxMenu();
    } else if (e.key === "Tab" || (e.key.length === 1 && !e.ctrlKey && !e.metaKey)) {
      closeCtxMenu();
    }
  }, true);
  window.addEventListener("blur", closeCtxMenu);
  window.addEventListener("resize", closeCtxMenu);
  if (contentEl) contentEl.addEventListener("scroll", closeCtxMenu, { passive: true });
  const URL_FIND_RE = /(?:https?:\/\/)?(?:[\w-]+\.)*(?:rekhta|hindwi|sufinama)\.org\/[^\s"'<>]+/gi;
  const MAX_FOUND_LINKS = 200;
  function extractBookLinks(text) {
    const out = [];
    const found = String(text || "").slice(0, 300000).match(URL_FIND_RE) || [];
    for (const m of found) {
      const u = ensureUrlScheme(m.replace(/[)\]}.,;:!؟،۔]+$/, ""));
      if (classifyBookUrl(u) === "ok" && !out.includes(u)) out.push(u);
      if (out.length >= MAX_FOUND_LINKS) break;
    }
    return out;
  }
  function bookNameFromUrl(url) {
    try {
      const slug = new URL(url).pathname.split("/").filter(Boolean).pop() || "";
      return decodeURIComponent(slug).replace(/[-_]+/g, " ").slice(0, 48);
    } catch (e) { return ""; }
  }
  const clipChip = document.getElementById("clip-chip");
  const clipChipName = document.getElementById("clip-chip-name");
  const clipChipToggle = document.getElementById("clipboard-chip-toggle");
  let clipCurrent = "";
  let clipDismissed = "";
  function hideClipChip() { clipChip.hidden = true; }
  function linkIsInQueues(link) {
    const key = bookLinkKey(link);
    return ["primary", "secondary"].some((n) => {
      for (const it of queueState[n].itemsById.values()) { if (it && it.url && bookLinkKey(it.url) === key) return true; }
      return false;
    });
  }
  function checkClipboard() {
    if (!apiReady || currentViewName !== "download" || !clipChipToggle || clipChipToggle.getAttribute("aria-checked") !== "true") { hideClipChip(); return; }
    if (!statusEl.hidden) { hideClipChip(); return; }
    window.pywebview.api.read_clipboard_text().then((res) => {
      const link = res && res.ok ? extractBookLinks(String(res.text || "").slice(0, 2000))[0] : "";
      if (!link || link === clipDismissed || link === lastDownloadedUrl || urlInput.value.trim() === link) { hideClipChip(); return; }
      if (linkIsInQueues(link)) { hideClipChip(); return; }
      return window.pywebview.api.clip_link_in_history(link).then((known) => {
        if (known) { hideClipChip(); return; }
        clipCurrent = link;
        clipChipName.textContent = bookNameFromUrl(link);
        clipChip.hidden = false;
      });
    }).catch(() => hideClipChip());
  }
  window.addEventListener("focus", checkClipboard);
  document.getElementById("clip-chip-close").addEventListener("click", () => { clipDismissed = clipCurrent; hideClipChip(); });
  document.getElementById("clip-chip-download").addEventListener("click", () => {
    const link = clipCurrent;
    clipDismissed = link; hideClipChip();
    if (!link) return;
    urlInput.value = link;
    beginDownload(link);
  });
  document.getElementById("clip-chip-queue").addEventListener("click", () => {
    const link = clipCurrent;
    clipDismissed = link; hideClipChip();
    if (!link) return;
    window.pywebview.api.add_queue_items(link).then((res) => { toastSingleAdd(res, "لنک قطار میں شامل ہو گیا۔"); });
  });
  function notifyIfTruncated(e, text) {
    const el = e.target && e.target.closest ? e.target.closest("input[maxlength], textarea[maxlength]") : null;
    if (!el || !text) return;
    const max = Number(el.getAttribute("maxlength")) || 0;
    const selected = (el.selectionEnd || 0) - (el.selectionStart || 0);
    if (max && el.value.length - selected + text.length > max) showToast("متن حد سے لمبا تھا؛ صرف شروع کا حصہ رکھا گیا۔");
  }
  document.addEventListener("paste", (e) => notifyIfTruncated(e, e.clipboardData ? e.clipboardData.getData("text/plain") : ""), true);
  document.addEventListener("drop", (e) => notifyIfTruncated(e, e.dataTransfer && !(e.dataTransfer.files && e.dataTransfer.files.length) ? e.dataTransfer.getData("text/plain") : ""), true);
  function isInternalDrag(dt) { return !!dt && Array.from(dt.types || []).includes("application/x-rekhta-queue-item"); }
  function dropWanted(e) {
    const dt = e.dataTransfer;
    if (!dt || isInternalDrag(dt)) return false;
    const hasFiles = Array.from(dt.types || []).includes("Files");
    if (!hasFiles && e.target && e.target.closest && isEditableField(e.target.closest("input, textarea"))) return false;
    return true;
  }
  let dropHot = false, dropHotTimer = 0;
  function setDropHot(on) {
    clearTimeout(dropHotTimer);
    if (on === dropHot) { if (on) dropHotTimer = setTimeout(() => setDropHot(false), 600); return; }
    dropHot = on;
    document.body.classList.toggle("is-drop-target", on);
    if (on) dropHotTimer = setTimeout(() => setDropHot(false), 600);
  }
  window.addEventListener("dragover", (e) => { if (dropWanted(e)) { e.preventDefault(); setDropHot(true); } });
  window.addEventListener("dragleave", (e) => { if (!e.relatedTarget) setDropHot(false); });
  window.addEventListener("dragend", () => setDropHot(false));
  const DROP_FILE_MAX_BYTES = 100 * 1024;
  const DROP_MAX_FILES = 3;
  function dropFileKind(file) {
    if (!file || !/\.txt$/i.test(file.name || "")) return "type";
    if (file.size > DROP_FILE_MAX_BYTES) return "big";
    return "ok";
  }
  function looksLikeBinaryText(text) {
    const t = String(text || "").slice(0, 20000);
    if (!t) return false;
    if (t.indexOf("\u0000") !== -1) return true;
    let bad = 0;
    for (let i = 0; i < t.length; i++) if (t.charCodeAt(i) === 0xFFFD) bad++;
    return bad / t.length > 0.02;
  }
  const DROP_PROBLEM_TEXT = {
    type: "صرف «.txt» فائل قبول ہے۔",
    big: "فائل بہت بڑی ہے (زیادہ سے زیادہ 100 کلو بائٹ)۔",
    binary: "فائل کا نام «.txt» ہے مگر اندر سادہ لکھائی نہیں، اس لیے نہیں پڑھی گئی۔",
    unreadable: "فائل پڑھی نہیں جا سکی۔",
  };
  const DROP_PROBLEM_ORDER = ["big", "binary", "type", "unreadable"];
  function firstDropProblem(list) { return DROP_PROBLEM_ORDER.find((k) => list.includes(k)) || ""; }
  function readTxtFile(file) {
    return new Promise((resolve) => {
      const kind = dropFileKind(file);
      if (kind !== "ok") { resolve({ text: "", problem: kind }); return; }
      const r = new FileReader();
      r.onload = () => {
        const text = String(r.result || "");
        resolve(looksLikeBinaryText(text) ? { text: "", problem: "binary" } : { text, problem: "" });
      };
      r.onerror = () => resolve({ text: "", problem: "unreadable" });
      try { r.readAsText(file); } catch (e) { resolve({ text: "", problem: "unreadable" }); }
    });
  }
  function toastSingleAdd(res, okText) {
    if (res && res.added > 0) { showToast(okText, "success"); return true; }
    if (res && res.duplicates > 0) { showToast("یہ لنک پہلے سے قطار میں موجود ہے۔"); return false; }
    showToast("لنک قطار میں شامل نہیں ہو سکا۔");
    return false;
  }
  function queueSentText(added, ignored) {
    added = added || 0; ignored = ignored || 0;
    const sent = added === 1 ? "1 لنک قطار میں بھیجا گیا" : `${added} لنک قطار میں بھیجے گئے`;
    const skip = ignored === 1 ? "1 لنک نظر انداز کیا گیا" : `${ignored} لنک نظر انداز کیے گئے`;
    if (added && ignored) return sent + " اور " + skip + "۔";
    if (added) return sent + "۔";
    if (ignored) return "کوئی لنک قطار میں نہیں بھیجا گیا؛ " + skip + "۔";
    return "کوئی لنک قطار میں نہیں بھیجا گیا۔";
  }
  function bookLinkKey(u) {
    try {
      const x = new URL(u);
      return x.hostname.toLowerCase().replace(/^www\./, "") + x.pathname.replace(/\/+$/, "").toLowerCase();
    } catch (e) { return String(u).toLowerCase(); }
  }
  function uniqueBookLinks(links) {
    const seen = new Set();
    return links.filter((l) => { const k = bookLinkKey(l); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  function handleDroppedLinks(links, fromFile, note) {
    links = uniqueBookLinks(links);
    const extra = note ? " " + note : "";
    if (!links.length) { showToast("چھوڑے گئے مواد میں کوئی درست کتابی لنک نہیں ملا۔" + extra); return; }
    if (links.length >= MAX_FOUND_LINKS) note = (note ? note + " " : "") + "صرف پہلے " + MAX_FOUND_LINKS + " لنک لیے گئے۔";
    const tail = note ? " " + note : "";
    if (links.length === 1 && !fromFile) {
      switchView("download");
      urlInput.value = links[0];
      urlInput.focus();
      showToast("لنک ڈاؤن لوڈ کے خانے میں رکھ دیا گیا۔" + tail, "success");
      return;
    }
    window.pywebview.api.add_queue_items(links.join("\n")).then((res) => {
      if (!res || !res.ok) { showToast("لنک قطار میں نہیں بھیجے جا سکے۔"); return; }
      const added = res.added || 0;
      const lim = res.limited ? " حد کی وجہ سے باقی لنک نہیں لیے گئے۔" : "";
      showToast(queueSentText(added, res.duplicates || 0) + tail + lim, added ? "success" : undefined);
    });
  }
  window.addEventListener("drop", (e) => {
    setDropHot(false);
    if (!dropWanted(e)) return;
    e.preventDefault();
    const dt = e.dataTransfer;
    const all = Array.from(dt.files || []);
    const files = all.slice(0, DROP_MAX_FILES);
    const text = ((dt.getData("text/uri-list") || "") + "\n" + (dt.getData("text/plain") || "")).slice(0, 40000);
    Promise.all(files.map(readTxtFile)).then((res) => {
      const problems = res.map((r) => r.problem).filter(Boolean);
      const notes = [];
      if (all.length > DROP_MAX_FILES) notes.push("صرف پہلی " + DROP_MAX_FILES + " فائلیں پڑھی گئیں۔");
      const fromFile = res.some((r) => r.text);
      const bad = firstDropProblem(problems);
      if (bad && !fromFile && !text.trim()) { showToast(DROP_PROBLEM_TEXT[bad] + (notes.length ? " " + notes[0] : "")); return; }
      if (bad) notes.push(DROP_PROBLEM_TEXT[bad]);
      handleDroppedLinks(extractBookLinks(res.map((r) => r.text).join("\n") + "\n" + text), fromFile, notes.join(" "));
    });
  });
  const helpOverlay = document.getElementById("help-overlay");
  function openHelp() { helpOverlay.hidden = false; document.getElementById("help-close").focus(); }
  function closeHelp() { helpOverlay.hidden = true; }
  document.getElementById("help-close").addEventListener("click", closeHelp);
  helpOverlay.addEventListener("click", (e) => { if (e.target === helpOverlay) closeHelp(); });
  document.getElementById("show-shortcuts-btn").addEventListener("click", openHelp);
  const DIALOG_CLOSERS = {
    confirm: () => dismissConfirm(),
    request: () => { requestOverlay.hidden = true; },
    code: () => { codeOverlay.hidden = true; },
    help: () => closeHelp(),
    guide: () => closeGuide(),
    update: () => { updateBar.hidden = true; },
    updated: () => { closeUpdatedNote(); },
  };
  document.querySelectorAll(".dialog-x").forEach((b) => b.addEventListener("click", () => {
    const f = DIALOG_CLOSERS[b.dataset.close];
    if (f) f();
  }));
  document.getElementById("download-another-btn").addEventListener("click", () => { resetDownloadView(); urlInput.focus(); });
  const WELCOME_TEXTS = {
    morning: [
      "صبح بخیر! آج کون سی کتاب پڑھنی ہے؟",
      "صبح کی چائے کے ساتھ کوئی اچھی کتاب ہو جائے!",
      "سلام! نیا دن، نئی کتاب۔",
      "صبح بخیر، کتابوں کی دنیا میں خوش آمدید۔",
    ],
    noon: [
      "دوپہر بخیر! کوئی نئی کتاب ڈھونڈیں؟",
      "سلام! کتاب کا لنک تیار ہو تو شروع کریں۔",
      "خوش آمدید! آج کی پسندیدہ کتاب کون سی ہے؟",
      "دوپہر کی فرصت میں ایک اچھی کتاب ہو جائے۔",
    ],
    evening: [
      "شام بخیر! کتاب کے ساتھ اچھی شام گزاریں۔",
      "سلام! شام کی فرصت میں کوئی کتاب اتار لیں۔",
      "شام بخیر، کتابیں آپ کی منتظر ہیں۔",
      "خوش آمدید! شام کو پڑھنے کے لیے کیا چنیں گے؟",
    ],
    night: [
      "شب بخیر! رات کو پڑھنے کے لیے کتاب تیار کریں۔",
      "سلام! رات کا سکون اور ایک اچھی کتاب۔",
      "رات بخیر، آج کون سی کتاب ساتھ رہے گی؟",
      "خوش آمدید! رات کے مطالعے کی تیاری کریں۔",
    ],
  };
  function dayPartOf(hour) {
    if (hour >= 5 && hour < 12) return "morning";
    if (hour >= 12 && hour < 17) return "noon";
    if (hour >= 17 && hour < 21) return "evening";
    return "night";
  }
  function pickWelcome(hour, rnd, previous) {
    const list = WELCOME_TEXTS[dayPartOf(hour)].filter((t) => t !== previous);
    return list[Math.min(list.length - 1, Math.floor(rnd * list.length))];
  }
  const WELCOME_EMOJI = { morning: "\u2600\uFE0F", noon: "\uD83D\uDCDA", evening: "\uD83C\uDF07", night: "\uD83C\uDF19" };
  const welcomeEl = document.getElementById("welcome-line");
  let welcomePart = null;
  function refreshWelcome() {
    if (!welcomeEl) return;
    const part = dayPartOf(new Date().getHours());
    if (part === welcomePart && welcomeEl.textContent) return;
    welcomePart = part;
    const prev = welcomeEl.textContent.replace(/\s*[\u2600\uFE0F\uD83C\uD83D][\s\S]*$/, "");
    welcomeEl.textContent = pickWelcome(new Date().getHours(), Math.random(), prev) + " " + WELCOME_EMOJI[part];
  }
  refreshWelcome();
  window.addEventListener("focus", refreshWelcome);
  const SHORTCUT_VIEWS = ["settings", "history", "search", "queue", "download"];
  const TAB_SEARCH_BOX_IDS = { search: "search-query-input", history: "history-search-input", settings: "settings-search-input" };
  const QUEUE_BOX_HIDDEN_PX = 12;
  function goToSearchBox() {
    switchView("search");
    const q = document.getElementById("search-query-input");
    if (q) q.focus();
  }
  function showBoxMinimally(el) {
    if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
  }
  function focusTabSearchBox(e) {
    const id = TAB_SEARCH_BOX_IDS[currentViewName];
    const el = id ? document.getElementById(id) : null;
    if (!el || el.disabled || el.closest("[hidden]")) return false;
    e.preventDefault();
    el.focus({ preventScroll: true });
    try { const n = (el.value || "").length; el.setSelectionRange(n, n); } catch (err) { }
    showBoxMinimally(el);
    return true;
  }
  function focusLinkBox(e) {
    if (currentViewName === "download") {
      e.preventDefault();
      urlInput.focus({ preventScroll: true });
    } else if (currentViewName === "queue") {
      e.preventDefault();
      queueBulkText.focus({ preventScroll: true });
      const hidden = scrollHost.getBoundingClientRect().top - queueBulkText.getBoundingClientRect().top;
      if (hidden > QUEUE_BOX_HIDDEN_PX) showBoxMinimally(document.querySelector('label[for="queue-bulk-text"]') || queueBulkText);
    }
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !helpOverlay.hidden) { closeHelp(); return; }
    if (e.defaultPrevented) return;
    if ([overlay, guideOverlay, requestOverlay, codeOverlay, helpOverlay].some((o) => o && !o.hidden)) return;
    const field = e.target && e.target.closest ? e.target.closest("input, textarea") : null;
    const typing = !!(field && isEditableField(field));
    const sk = shortcutKey(e);
    if (e.key === "F4" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) { focusTabSearchBox(e); return; }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      if (sk === "/") { e.preventDefault(); goToSearchBox(); return; }
      if (sk === "f") { focusTabSearchBox(e); return; }
      if (sk === "e") { focusLinkBox(e); return; }
      if (/^[1-5]$/.test(sk)) { e.preventDefault(); switchView(SHORTCUT_VIEWS[Number(sk) - 1]); return; }
      if (e.key === "Enter") {
        if (currentViewName === "queue" && queueBulkText.value.trim()) {
          e.preventDefault();
          queueBulkForm.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
        } else if (currentViewName === "download" && urlInput.value.trim()) {
          e.preventDefault();
          const link = ensureUrlScheme(urlInput.value.trim());
          if (classifyBookUrl(link) !== "ok") { showToast(MSG_BAD_PAGE); return; }
          window.pywebview.api.add_queue_items(link).then((res) => { if (toastSingleAdd(res, "لنک قطار میں شامل ہو گیا۔")) urlInput.value = ""; });
        }
        return;
      }
      if (sk === "v" && !typing && apiReady && pasteStartOn) {
        e.preventDefault();
        if (downloadBtn.disabled || !statusEl.hidden) { showToast("ایک ڈاؤن لوڈ پہلے سے جاری ہے۔"); return; }
        window.pywebview.api.read_clipboard_text().then((res) => {
          const link = res && res.ok ? extractBookLinks(String(res.text || "").slice(0, 2000))[0] : "";
          if (!link) { showToast("کلپ بورڈ میں کتاب کا لنک نہیں ملا۔"); return; }
          switchView("download");
          urlInput.value = link;
          beginDownload(link);
        });
      }
      return;
    }
    if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (sk === "/") {
        e.preventDefault();
        goToSearchBox();
      } else if (sk === "?" || sk === "!" || e.key === "؟") {
        e.preventDefault();
        openHelp();
      }
    }
  });
  const TYPE_FOCUS_IDS = { search: "search-query-input", history: "history-search-input", download: "book-url", queue: "queue-bulk-text" };
  const TYPE_FOCUS_SKIP_KEYS = ["/", "?", "؟", "!", " "];
  function typeFocusTarget(e, ctx) {
    if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return null;
    if (e.ctrlKey || e.metaKey || e.altKey) return null;
    if (typeof e.key !== "string" || e.key.length !== 1 || TYPE_FOCUS_SKIP_KEYS.indexOf(e.key) !== -1) return null;
    if (ctx.blocked()) return null;
    const ae = ctx.doc.activeElement;
    const emptyFocus = !ae || ae === ctx.doc.body || ae === ctx.doc.documentElement;
    if (!emptyFocus) {
      const tag = String(ae.tagName || "").toUpperCase();
      if (tag === "SELECT" || tag === "TEXTAREA") return null;
      if (tag === "INPUT" && !/^(checkbox|radio|button|submit|reset|range|image|file)$/i.test(ae.type || "")) return null;
      if (ae.isContentEditable || (ae.getAttribute && ae.getAttribute("contenteditable") !== null)) return null;
      if (ae.closest && ae.closest("[role=dialog],[role=menu],[role=listbox],#today-pop")) return null;
    }
    const id = ctx.defaults[ctx.view()];
    const el = id ? ctx.doc.getElementById(id) : null;
    if (!el || el.disabled || el.readOnly || el.closest("[hidden]")) return null;
    return el;
  }
  document.addEventListener("keydown", (e) => {
    const el = typeFocusTarget(e, {
      doc: document,
      defaults: TYPE_FOCUS_IDS,
      view: () => currentViewName,
      blocked: () => !!document.querySelector(".overlay:not([hidden])") || !ctxMenu.hidden,
    });
    if (!el) return;
    el.focus();
    try { const n = (el.value || "").length; el.setSelectionRange(n, n); } catch (err) { }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
    if (document.querySelector(".overlay:not([hidden])") || !ctxMenu.hidden || !todayPop.hidden) return;
    const ae = document.activeElement;
    if (ae && (ae.id === "settings-search-input" || ae.id === "history-search-input") && ae.value) {
      ae.value = "";
      ae.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (ae && ae !== document.body && typeof ae.blur === "function") ae.blur();
  });
  function restoreSingleDownloadUI(data) {
    lastDownloadedUrl = data.url;
    urlInput.value = data.url;
    resetDownloadPanels();
    hide(resultMissingEl);
    setBusy(true);
    lastKnownStage = data.stage || "pages";
    lastKnownSub = "";
    show(statusEl);
    show(pauseBtn);
    statusIcon.classList.remove("spin");
    setNavIconAnimating(navIconDownload, false);
    const percent = data.percent || 0;
    statusPercent.textContent = percent + "%";
    setSingleFill(percent);
    syncSingleBar();
    statusSub.textContent = "";
    statusChips.hidden = true;
    isPaused = true;
    isPausing = false;
    isRestoredSingle = true;
    pauseBtn.disabled = false;
    pauseBtnLabel.textContent = "جاری رکھیں";
    pauseBtnIcon.innerHTML = ICON_PLAY_SM;
    statusText.textContent = "پچھلا ڈاؤن لوڈ نامکمل چھوڑا گیا تھا — رکی ہوئی حالت میں بحال کر دیا گیا ہے۔";
  }
  if (downloadBtnLabel) downloadBtnLabel.textContent = "تیار ہو رہا ہے…";
  setBusy(false);
  window.addEventListener("pywebviewready", function () {
    apiReady = true;
    if (KT) {
      KT.setTitles(() => {
        const out = [];
        ["primary", "secondary"].forEach((n) => queueState[n].itemsById.forEach((it) => { if (it && it.title) out.push(it.title); }));
        if (lastResult && lastResult.title) out.push(lastResult.title);
        return out;
      });
      KT.init().then((forMe) => { const row = document.getElementById("detail-log-row"); if (row) row.hidden = !forMe; });
    }
    setBusy(false);
    watchEngine();
    loadSettings();
    window.pywebview.api.get_queues().then(refreshQueues);
    window.pywebview.api.get_startup_notices().then((notes) => {
      if (Array.isArray(notes) && notes.length) showToast(notes.join(" "));
    }).catch(() => {});
    window.pywebview.api.get_account_state().then(renderAccount)
      .then(() => refreshAccount(true)).then(maybeOfferCode)
      .then(() => maybeShowGuide())
      .then(() => applyStagedOrCheck())
      .then((res) => {
        if (res && res.ok && res.available) {
          if (res.mode === "auto") startAutoUpdate();
          else { updateTicker.markOffered(res.build); onAutoUpdateAsk(res); }
        }
      }).catch(() => {});
    startUpdateTimer();
    window.pywebview.api.get_startup_notice().then((n) => {
      if (!n) return;
      if (n.kind === "updated" && n.version) { showUpdatedNote(n); return; }
      showToast(n.message, n.kind === "updated" ? "success" : undefined);
    });
    window.pywebview.api.get_restored_single().then((data) => {
      if (data && data.url) restoreSingleDownloadUI(data);
    });
    urlInput.focus();
  });
  function labelIconButton(el) {
    if (el.nodeType !== 1) return;
    const btns = el.tagName === "BUTTON" ? [el] : Array.from(el.querySelectorAll("button[title]"));
    btns.forEach((b) => {
      if (!b.hasAttribute("aria-label") && b.title && !b.textContent.trim()) b.setAttribute("aria-label", b.title);
    });
  }
  labelIconButton(document.body);
  new MutationObserver((records) => {
    records.forEach((r) => r.addedNodes.forEach(labelIconButton));
  }).observe(document.body, { childList: true, subtree: true });
})();
