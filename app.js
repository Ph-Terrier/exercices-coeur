/* Site d'exercices quiz_generator (application statique, sans serveur).
   Produced by: written by the orchestrating model, Claude Fable 5.1, 2026-09-22 ;
   multi-course home page and hash routing added by the orchestrating model
   Claude Opus 5.5, 2026-09-23.
   modified by a sub-agent (Claude Opus 5.5, site-shell implementer), 2026-09-24:
   audiences (APS, Bachelor) read from data/courses.json schema 2 (schema 1 still read);
   home page with one panel per audience, audience pages (#/aps, #/bachelor), breadcrumbs
   and audience chips, router of docs/site_design_2026-09-24.md sections 4.2 and 4.3
   (normalised addresses, notice for unknown links, series address #/<cours>/serie,
   resumable series, #/a-propos), tab titles, focus on the view title and on the
   feedback, #sr-status announcements, restructured course page (Commencer, parts,
   details), recommended series (section 9), resume card and quiz_generator_prefs_v1,
   icon of the course "cellule", accessibility fixes of phase A for the existing types
   (section 7.7: numeric text field with label and error message, aria-pressed pills,
   check marks and hidden text, data-item-id and data-i hooks).
   modified by a sub-agent (Claude Opus 5.5, exercise-type implementer), 2026-09-24: four
   new exercise types of docs/site_design_2026-09-24.md, section 8 (two_tier, case,
   error_spot, short_answer): renderers, grading, feedback, TYPE_LABELS, texts of the
   results page; table RENDERERS and optional done() callback of renderMcq,
   renderTrueFalse, renderDirection and renderNumeric (section 8.2), used by the stages
   of a case; focus moves and #sr-status messages of the new types.
   post-generation fix by a sub-agent (Claude Opus 5.5, code reviewer), 2026-09-24: diagram
   cases reachable and selectable with the keyboard (tabindex, role "button", Enter or Space,
   accessible name "Case n : <étiquette>", aria-pressed; SVG role "group"), announcements of
   the placed labels (WCAG 2.2, 2.1.1); the home page is drawn when the page is opened at an
   anchor without "#/" (for example #contenu).
   Données : data/courses.json (index des publics et des cours) et data/<cours>.json,
   produits par R/04_export_web.R depuis le YAML pivot. Adresses : #/ (accueil),
   #/aps et #/bachelor (publics), #/<cours>, #/<cours>/serie, #/a-propos.
   Types d'exercice : mcq, true_false, direction, numeric, steps, ordering, matching,
   classify, cloze, diagram, flashcard, two_tier, case, error_spot, short_answer
   (voir schema/qcm_schema.yaml).
   Aucune donnée personnelle n'est envoyée ; la progression reste dans localStorage. */
(function () {
  "use strict";

  // build stamp written by scripts/deploy_site.sh into <meta name="build">, so that a
  // new deployment fetches fresh data instead of a cached copy (GitHub Pages: max-age 600 s)
  const BUILD = (document.querySelector('meta[name="build"]') || {}).content || "dev";
  const COURSES_URL = "data/courses.json?b=" + BUILD;
  const STORE_KEY = "quiz_generator_progress_v1";
  const PREFS_KEY = "quiz_generator_prefs_v1";
  const SERIES_SIZE = 10;
  const SITE = "HE-Arc Santé";
  const RESERVED = ["a-propos", "serie"];
  const TYPE_LABELS = {
    mcq: "QCM",
    true_false: "Vrai ou faux",
    direction: "Augmente ou diminue ?",
    numeric: "Calcul",
    steps: "Calcul guidé",
    ordering: "Remettre dans l'ordre",
    matching: "Associer",
    classify: "Classer",
    cloze: "Texte à trous",
    diagram: "Schéma à compléter",
    flashcard: "Carte mémoire",
    two_tier: "Réponse et justification",
    case: "Situation en étapes",
    error_spot: "Trouver l'erreur",
    short_answer: "Explication écrite"
  };
  // long exercises, at most 2 in the recommended series
  const LONG_TYPES = ["case", "short_answer"];
  // default instruction of a case (situation en étapes) without lead_in
  const CASE_LEAD = "Répondre aux questions de la situation, étape par étape.";
  const DIRECTION_LABELS = { up: "Augmente", down: "Diminue", same: "Ne change pas" };
  const SVG_NS = "http://www.w3.org/2000/svg";
  // texts of the audience pages (docs/site_design_2026-09-24.md, section 6.1); an
  // audience absent from this table uses its label and description from courses.json
  const AUD_TEXTS = {
    aps: {
      more: "Tous les cours de l'APS",
      lead: "L'APS prépare à une formation dans une haute école spécialisée du domaine de la santé. Exercices des cours de l'année 2026-27."
    },
    bachelor: {
      more: "Tous les cours du bachelor",
      lead: "Exercices des cours du Bachelor of Science HES-SO en Soins infirmiers."
    }
  };

  let courses = [];      // course entries of data/courses.json
  let audiences = [];    // audiences of data/courses.json (schema 2); empty for schema 1
  let data = null;       // data of the current course
  let current = null;    // index entry of the current course
  const cache = {};      // course id -> course data
  let progress = loadProgress();
  // series in memory only: {course, items, index, answers: [{id, correct}], title, fromCourse, finished}
  let session = null;
  let booted = false;    // no focus move on the first render of the page
  let routeToken = 0;    // ignores the result of an outdated course load
  let lastDepth = -1;    // depth of the displayed history entry (history.state.d)

  const $ = (id) => document.getElementById(id);
  const views = ["landing", "audience", "home", "quiz", "results", "about"];

  // show one view; focus its title (h1 or the given element) except on the first render
  function show(view, focusEl) {
    views.forEach((v) => { $("view-" + v).hidden = v !== view; });
    if (booted) {
      const target = focusEl === undefined ? $("view-" + view).querySelector("h1") : focusEl;
      if (target) {
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
      }
    }
    booted = true;
    window.scrollTo(0, 0);
  }
  function setTitle(t) { document.title = t; }
  function announce(msg) {
    const el = $("sr-status");
    el.textContent = "";
    window.setTimeout(() => { el.textContent = msg; }, 60);
  }

  // ---------- Publics et cours ----------
  function audienceOf(c) { return audiences.find((a) => a.id === (c && c.audience)) || null; }
  function yearLabel(y) {
    const n = Number(y);
    if (!n) return "";
    return n === 1 ? "1re année" : n + "e année";
  }
  function courseChip(c) {
    const a = audienceOf(c);
    if (!a) return "";
    return a.chip + (a.has_years && c.year ? " · " + yearLabel(c.year) : "");
  }
  function shortTitle(c) { return (c && (c.short_title || c.title)) || ""; }
  function audienceCourses(a) {
    return courses.filter((c) => c.audience === a.id);
  }
  // one line of text such as "cours 2026-27" when all courses of an audience share a cohort year
  function cohortYears(list) {
    const ys = [];
    list.forEach((c) => { const m = String(c.cohort || "").match(/\d{4}-\d{2}/); if (m && ys.indexOf(m[0]) < 0) ys.push(m[0]); });
    return ys.length === 1 ? ys[0] : "";
  }
  function stripDot(s) { return String(s || "").replace(/\.\s*$/, ""); }

  // ---------- Icônes des cours (SVG en ligne, sans figure du cours) ----------
  const ICONS = {
    coeur: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 41s-15-9.2-15-20.2C9 14.9 13.4 11 18.3 11c2.6 0 4.6 1.2 5.7 3.1C25.1 12.2 27.1 11 29.7 11 34.6 11 39 14.9 39 20.8 39 31.8 24 41 24 41z"/><path class="pulse" d="M9 25h8l3-6 4 11 3-7 2 2h10"/></svg>',
    neuro: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="15" cy="20" r="6"/><path d="M11 15l-5-6M10 22l-6 2M14 26l-3 7M19 15l2-7"/><path d="M21 21c6 1 10 3 13 7s5 6 9 7"/><path d="M37 32l3-4M40 36l5-1M41 36l2 5"/><path class="myelin" d="M24 22.5l4 1.6M30 25.5l3 2.6"/></svg>',
    cellule: '<svg viewBox="0 0 48 48" aria-hidden="true"><ellipse cx="24" cy="24" rx="19" ry="16"/><circle cx="20" cy="21" r="6"/><circle class="nucleolus" cx="20" cy="21" r="1.8"/><rect x="28" y="27" width="11" height="6" rx="3"/><path d="M30 30l1.5-1.5 1.5 1.5 1.5-1.5 1.5 1.5"/></svg>'
  };
  function acquiredCount(course) {
    return Object.keys(progress).filter((id) => id.indexOf(course.code + "-") === 0 && progress[id].correct > 0).length;
  }

  // ---------- Accueil : choix de la formation ----------
  function renderLanding(msg) {
    setTitle("Exercices d'entraînement · " + SITE);
    $("top-course").textContent = "";
    const notice = $("route-msg");
    notice.textContent = msg || "";
    notice.hidden = !msg;
    renderResumeCard();
    const box = $("aud-panels");
    box.innerHTML = "";
    const panels = [];
    if (audiences.length) {
      audiences.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).forEach((a) => {
        panels.push({ aud: a, list: audienceCourses(a) });
      });
      const others = courses.filter((c) => !audienceOf(c));
      if (others.length) panels.push({ aud: null, title: "Autres cours", list: others });
    } else {
      panels.push({ aud: null, title: "Cours", list: courses });
    }
    panels.forEach((p, k) => box.appendChild(audiencePanel(p, k)));
    show("landing");
  }

  function audiencePanel(p, k) {
    const a = p.aud;
    const sec = document.createElement("section");
    sec.className = "aud-panel" + (a ? " aud-" + a.id : "");
    const hid = "aud-h-" + (a ? a.id : "autres-" + k);
    sec.setAttribute("aria-labelledby", hid);
    const head = document.createElement("div");
    head.className = "ap-head";
    if (a) {
      const chip = document.createElement("span");
      chip.className = "aud-chip aud-" + a.id;
      chip.setAttribute("aria-hidden", "true");
      chip.textContent = a.short_label;
      head.appendChild(chip);
    }
    const h3 = document.createElement("h3");
    h3.id = hid;
    h3.textContent = a ? a.label : p.title;
    head.appendChild(h3);
    sec.appendChild(head);
    if (a) {
      const desc = document.createElement("p");
      desc.className = "ap-desc";
      const yrs = a.has_years ? "" : cohortYears(p.list);
      desc.textContent = stripDot(a.description) + (yrs ? " · cours " + yrs : "");
      sec.appendChild(desc);
    }
    const ul = document.createElement("ul");
    ul.className = "course-rows";
    p.list.forEach((c) => {
      const li = document.createElement("li");
      li.appendChild(courseRow(c, a));
      ul.appendChild(li);
    });
    if (!p.list.length) {
      const none = document.createElement("p");
      none.className = "ap-empty";
      none.textContent = "Aucun cours pour le moment.";
      sec.appendChild(none);
    } else {
      sec.appendChild(ul);
    }
    if (a) {
      const more = document.createElement("a");
      more.className = "aud-more";
      more.href = "#/" + a.id;
      more.innerHTML = '<span></span> <span aria-hidden="true">→</span>';
      more.firstChild.textContent = (AUD_TEXTS[a.id] || {}).more || "Tous les cours : " + a.short_label;
      sec.appendChild(more);
    }
    return sec;
  }

  function courseRow(c, a) {
    const link = document.createElement("a");
    link.className = "course-row c-" + c.id;
    link.href = "#/" + c.id;
    const done = acquiredCount(c);
    link.innerHTML = '<span class="cr-title"></span><span class="cr-meta"></span>' +
      '<span class="track" aria-hidden="true"><span class="fill"></span></span>';
    link.querySelector(".cr-title").textContent = shortTitle(c);
    const meta = [c.code];
    if (a && a.has_years && c.year) meta.push(yearLabel(c.year));
    meta.push(c.n_items + " exercices");
    if (done) meta.push(done + " acquis");
    link.querySelector(".cr-meta").textContent = meta.join(" · ");
    link.querySelector(".fill").style.width = (c.n_items ? 100 * done / c.n_items : 0) + "%";
    return link;
  }

  function renderResumeCard() {
    const card = $("resume");
    const id = loadPrefs().last_course;
    const c = courses.find((x) => x.id === id);
    if (!c) { card.hidden = true; return; }
    card.className = "resume-card c-" + c.id;
    card.href = "#/" + c.id;
    card.innerHTML = '<span class="rc-title"><span></span> <span aria-hidden="true">→</span></span>' +
      '<span class="rc-meta"><span class="rc-chip"></span><span class="rc-done"></span></span>';
    card.querySelector(".rc-title span").textContent = "Reprendre : " + shortTitle(c);
    const chipText = courseChip(c);
    const chip = card.querySelector(".rc-chip");
    if (chipText) { chip.className = "aud-chip aud-" + c.audience; chip.textContent = chipText; } else chip.remove();
    card.querySelector(".rc-done").textContent = acquiredCount(c) + " exercices acquis sur " + c.n_items;
    card.hidden = false;
  }

  // ---------- Page d'un public ----------
  function breadcrumb(ol, items) {
    ol.innerHTML = "";
    items.forEach((it, k) => {
      const li = document.createElement("li");
      if (k > 0) {
        const sep = document.createElement("span");
        sep.className = "sep";
        sep.setAttribute("aria-hidden", "true");
        sep.textContent = "›";
        li.appendChild(sep);
      }
      if (it.href) {
        const a = document.createElement("a");
        a.href = it.href;
        a.textContent = it.text;
        li.appendChild(a);
      } else {
        const s = document.createElement("span");
        s.setAttribute("aria-current", "page");
        s.textContent = it.text;
        li.appendChild(s);
      }
      ol.appendChild(li);
    });
  }

  function renderAudience(a) {
    setTitle(a.label + " · Exercices " + SITE);
    $("top-course").textContent = a.short_label;
    breadcrumb($("aud-crumbs"), [{ text: "Accueil", href: "#/" }, { text: a.short_label }]);
    const chip = $("aud-chip");
    chip.className = "aud-chip aud-" + a.id;
    chip.textContent = a.short_label;
    $("aud-title").textContent = a.label;
    $("aud-lead").textContent = (AUD_TEXTS[a.id] || {}).lead || a.description || "";
    const box = $("aud-courses");
    box.innerHTML = "";
    const list = audienceCourses(a);
    if (!list.length) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = "Aucun cours pour le moment.";
      box.appendChild(p);
    } else if (a.has_years) {
      const years = unique(list.map((c) => Number(c.year) || 0)).sort((x, y) => x - y);
      years.forEach((y) => {
        const h2 = document.createElement("h2");
        h2.className = "year-heading";
        h2.textContent = y ? yearLabel(y) : "Autres cours";
        box.appendChild(h2);
        box.appendChild(courseCards(list.filter((c) => (Number(c.year) || 0) === y), "h3"));
      });
    } else {
      box.appendChild(courseCards(list, "h2"));
    }
    show("audience");
  }

  function courseCards(list, headingTag) {
    const grid = document.createElement("div");
    grid.className = "course-cards";
    list.forEach((c) => {
      const a = document.createElement("a");
      a.className = "course-card c-" + c.id;
      a.href = "#/" + c.id;
      const done = acquiredCount(c);
      a.innerHTML =
        '<div class="cc-band">' + (ICONS[c.id] || "") + '<span class="cc-code"></span></div>' +
        '<div class="cc-body"><' + headingTag + ' class="cc-title"></' + headingTag + '><p class="cc-desc"></p><ul class="cc-parts"></ul>' +
        '<div class="cc-meta"><span class="cc-count"></span><span class="cc-done"></span></div>' +
        '<div class="track" aria-hidden="true"><div class="fill"></div></div>' +
        '<span class="cc-go"></span></div>';
      a.querySelector(".cc-code").textContent = c.code;
      a.querySelector(".cc-title").textContent = c.title;
      a.querySelector(".cc-desc").textContent = c.description || "";
      const ul = a.querySelector(".cc-parts");
      (c.parts || []).forEach((p) => {
        const li = document.createElement("li");
        li.textContent = p.name + " · " + p.n_items + " exercices";
        ul.appendChild(li);
      });
      a.querySelector(".cc-count").textContent = c.n_items + " exercices · " + c.n_formats + " formats";
      a.querySelector(".cc-done").textContent = done ? done + " acquis" : "";
      a.querySelector(".fill").style.width = (c.n_items ? 100 * done / c.n_items : 0) + "%";
      a.querySelector(".cc-go").textContent = done ? "Continuer →" : "Commencer →";
      grid.appendChild(a);
    });
    return grid;
  }

  // ---------- Routage (sections 4.2 et 4.3 de la spécification) ----------
  function loadCourse(id) {
    if (cache[id]) return Promise.resolve(cache[id]);
    const c = courses.find((x) => x.id === id);
    if (!c) return Promise.reject(new Error("cours inconnu : " + id));
    return fetch(c.file + "?b=" + BUILD)
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((json) => { cache[id] = json; return json; });
  }
  function replaceHash(h) {
    try { history.replaceState(history.state, "", h); } catch (e) { /* ignored */ }
  }
  // depth of each history entry, kept in history.state, so that "Retour" and
  // "Quitter la série" know whether a previous entry of the site exists
  function trackDepth() {
    const st = history.state;
    if (st && typeof st.d === "number") { lastDepth = st.d; return; }
    lastDepth += 1;
    try { history.replaceState({ d: lastDepth }, ""); } catch (e) { /* ignored */ }
  }
  function canGoBack() { return lastDepth > 0; }

  function route() {
    const h = location.hash;
    // an anchor without "#/" (skip link) does not change the view; on the first render
    // (page opened at such an anchor) the home page is drawn, otherwise it would stay empty
    if (h && h !== "#" && h.indexOf("#/") !== 0) {
      if (!booted) renderLanding();
      return;
    }
    trackDepth();
    const raw = h.indexOf("#/") === 0 ? h.slice(2) : "";
    let rest = raw;
    try { rest = decodeURIComponent(rest); } catch (e) { /* keep as is */ }
    rest = rest.toLowerCase().replace(/\/+$/, "");
    const segs = rest.split("/");
    const seg0 = segs[0] || "";
    const seg1 = segs[1] || "";
    if (h.indexOf("#/") === 0 && rest !== raw) replaceHash("#/" + rest);
    const token = ++routeToken;

    if (!seg0) { data = null; current = null; renderLanding(); return; }
    if (seg0 === "a-propos") {
      if (segs.length > 1) replaceHash("#/a-propos");
      renderAbout();
      return;
    }
    const aud = audiences.find((a) => a.id === seg0);
    if (aud) {
      if (segs.length > 1) replaceHash("#/" + aud.id);
      data = null; current = null;
      renderAudience(aud);
      return;
    }
    const c = courses.find((x) => x.id === seg0);
    if (c && RESERVED.indexOf(seg0) < 0) {
      loadCourse(c.id)
        .then((json) => {
          if (token !== routeToken) return;
          data = json; current = c;
          if (seg1 === "serie" && segs.length === 2 && session && session.course === c.id) {
            showSeries();
            return;
          }
          if (segs.length > 1) replaceHash("#/" + c.id);
          renderHome();
        })
        .catch(() => {
          if (token !== routeToken) return;
          data = null; current = null;
          replaceHash("#/");
          renderLanding("Le cours n'a pas pu être chargé. Vérifiez la connexion, puis réessayez.");
        });
      return;
    }
    data = null; current = null;
    replaceHash("#/");
    renderLanding("Ce lien ne correspond à aucun cours. Choisissez votre formation ci-dessous.");
  }
  function goCourse() {
    if (!current) { location.hash = "#/"; return; }
    location.hash = "#/" + current.id;
  }
  // leave the series (Quitter la série, Nouvelle série): back to the course page entry
  function leaveSeries() {
    const fromCourse = session && session.fromCourse;
    session = null;
    if (fromCourse && canGoBack() && /\/serie$/.test(location.hash)) history.back();
    else goCourse();
  }

  // ---------- Progression et préférences ----------
  function loadProgress() {
    try { const raw = localStorage.getItem(STORE_KEY); return raw ? JSON.parse(raw) || {} : {}; } catch (e) { return {}; }
  }
  function saveProgress() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(progress)); } catch (e) { /* stockage indisponible */ }
  }
  function loadPrefs() {
    try { const raw = localStorage.getItem(PREFS_KEY); const p = raw ? JSON.parse(raw) : {}; return p && typeof p === "object" ? p : {}; } catch (e) { return {}; }
  }
  function savePrefs(p) {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) { /* stockage indisponible */ }
  }
  function record(id, correct) {
    const p = progress[id] || { attempts: 0, correct: 0 };
    p.attempts += 1;
    if (correct) p.correct += 1;
    p.last = correct;
    progress[id] = p;
    saveProgress();
  }

  // ---------- Utilitaires ----------
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function unique(arr) { return arr.filter((x, i) => arr.indexOf(x) === i); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function stripPrefix(s) {
    return String(s || "").replace(/^(Correct|Incorrect|Vrai|Faux|Augmente|Diminue|Ne change pas)\.\s*/u, "");
  }
  function fmtNum(v) { return String(v).replace(".", ","); }
  function numClose(v, target, tol) {
    return Number.isFinite(v) && Math.abs(v - target) <= (tol || 0) + 1e-9;
  }
  // "3,5", "3.5", "− 2", "1 000" are read as numbers; anything else gives NaN
  function parseNum(raw) {
    const s = String(raw).replace(/[\s  ]/g, "").replace(/[−–]/g, "-").replace(",", ".");
    if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return NaN;
    return Number(s);
  }
  function plural(n, word) { return n + " " + word + (n > 1 ? "s" : ""); }
  function loTitle(id) {
    const lo = data.learning_objectives.find((l) => l.id === id);
    return lo ? lo.short_title : id;
  }
  function itemTitle(it) {
    switch (it.type) {
      case "true_false": case "direction": return it.statement;
      case "flashcard": return it.prompt;
      case "two_tier": return (it.stem ? it.stem + " " : "") + ((it.tier1 && it.tier1.lead_in) || "");
      case "case": return it.stem || it.lead_in || "";
      default: return (it.stem ? it.stem + " " : "") + (it.lead_in || "");
    }
  }
  function correctOptionText(options) {
    const r = (options || []).find((o) => o.correct);
    return r ? r.text : "";
  }
  function correctAnswerText(it) {
    switch (it.type) {
      case "two_tier": return correctOptionText(it.tier1 && it.tier1.options) + " ; raison : " + correctOptionText(it.tier2 && it.tier2.options);
      case "case": return (it.stages || []).map((s) => correctAnswerText(s)).join(" ; ");
      case "error_spot": return (it.segments || []).filter((s) => s.error).map((s) => s.correction).join(" ; ");
      case "short_answer": return it.model_answer || "";
      case "numeric": return fmtNum(it.answer.value) + (it.answer.unit ? " " + it.answer.unit : "");
      case "steps": return it.steps.map((s) => fmtNum(s.answer.value) + (s.answer.unit ? " " + s.answer.unit : "")).join(" ; ");
      case "ordering": return it.items.join(" → ");
      case "matching": return it.pairs.map((p) => p.left + " : " + p.right).join(" ; ");
      case "classify": return it.categories.map((c) => c + " : " + it.elements.filter((e) => e.category === c).map((e) => e.text).join(", ")).join(" ; ");
      case "cloze": return it.blanks.join(", ");
      case "diagram": return it.nodes.filter((n) => !n.fixed).map((n) => n.label).join(", ");
      case "true_false": return it.correct ? "Vrai" : "Faux";
      case "direction": return DIRECTION_LABELS[it.correct] || it.correct;
      case "flashcard": return it.answer;
      default: { const r = (it.options || []).find((o) => o.correct); return r ? r.text : ""; }
    }
  }
  function isAcquired(it) { return !!(progress[it.id] && progress[it.id].correct > 0); }

  // ---------- Série recommandée (section 9 de la spécification) ----------
  function recommendedSeries(items, n) {
    const groups = { ko: [], new: [], ok: [] };
    items.forEach((it) => {
      const p = progress[it.id];
      if (!p) groups.new.push(it);
      else if (p.last === false || p.correct === 0) groups.ko.push(it);
      else groups.ok.push(it);
    });
    const pool = shuffle(groups.ko).concat(shuffle(groups.new), shuffle(groups.ok));
    const chosen = pool.slice(0, n);
    const rest = pool.slice(n);
    const isMcq = (it) => it.type === "mcq";
    const isLong = (it) => LONG_TYPES.indexOf(it.type) >= 0;
    // replace the last retained item matching `bad` while more than `max` are retained
    function cap(bad, max, acceptable) {
      while (chosen.filter(bad).length > max) {
        const k = rest.findIndex((it) => !bad(it) && acceptable(it));
        if (k < 0) break;
        let last = -1;
        chosen.forEach((it, i) => { if (bad(it)) last = i; });
        chosen[last] = rest.splice(k, 1)[0];
      }
    }
    cap(isMcq, 3, () => true);
    cap(isLong, 2, (it) => !isMcq(it) || chosen.filter(isMcq).length < 3);
    // greedy order: alternate types and objectives
    const ordered = [];
    const left = chosen.slice();
    while (left.length) {
      const prev = ordered[ordered.length - 1];
      let k = 0;
      if (prev) {
        k = left.findIndex((it) => it.type !== prev.type && it.lo !== prev.lo);
        if (k < 0) k = left.findIndex((it) => it.type !== prev.type);
        if (k < 0) k = 0;
      }
      ordered.push(left.splice(k, 1)[0]);
    }
    return ordered;
  }

  // ---------- Page d'un cours ----------
  function renderHome() {
    const c = current || {};
    const a = audienceOf(c);
    const st = shortTitle(c) || data.site_title;
    setTitle(st + (a ? " · " + a.short_label + (a.has_years && c.year ? " " + yearLabel(c.year) : "") : "") + " · " + SITE);
    $("top-course").textContent = st;
    const crumbs = [{ text: "Accueil", href: "#/" }];
    if (a) crumbs.push({ text: a.short_label, href: "#/" + a.id });
    crumbs.push({ text: data.course || c.code || st });
    breadcrumb($("course-crumbs"), crumbs);
    const chip = $("course-chip");
    const chipText = courseChip(c);
    chip.className = "aud-chip" + (a ? " aud-" + a.id : "");
    chip.textContent = chipText;
    chip.hidden = !chipText;
    $("site-title").textContent = c.title || data.site_title;
    $("site-sub").textContent = [data.course, data.cohort ? "cohorte " + data.cohort : "", data.items.length + " exercices"].filter(Boolean).join(" · ");
    if (c.id) { const p = loadPrefs(); p.last_course = c.id; savePrefs(p); }

    // Commencer
    const resumeBtn = $("btn-resume-series");
    if (session && session.course === c.id && !session.finished) {
      const answered = session.answers.length > session.index;
      const pos = Math.min(session.index + (answered ? 2 : 1), session.items.length);
      resumeBtn.textContent = "Reprendre la série en cours · exercice " + pos + " sur " + session.items.length;
      resumeBtn.hidden = false;
    } else {
      resumeBtn.hidden = true;
    }
    const nRec = Math.min(SERIES_SIZE, data.items.length);
    const rec = $("btn-recommended");
    rec.querySelector(".name").textContent = "Série recommandée · " + plural(nRec, "exercice");
    rec.querySelector(".desc").textContent = "Exercices manqués et jamais faits en priorité, formats mélangés.";
    rec.disabled = !nRec;
    const weak = data.items.filter((it) => !isAcquired(it));
    const weakBtn = $("btn-weak");
    weakBtn.hidden = !(weak.length > 0 && weak.length < data.items.length);
    weakBtn.querySelector(".name").textContent = "Exercices non acquis (" + weak.length + ")";
    weakBtn.querySelector(".desc").textContent = weak.length + " exercice" + (weak.length > 1 ? "s" : "") + " jamais réussi" + (weak.length > 1 ? "s" : "") + ", dans un ordre aléatoire";

    // Par partie du cours
    const partsBox = $("parts");
    partsBox.innerHTML = "";
    const parts = [];
    data.batches.forEach((b) => { if (parts.indexOf(b.part) < 0) parts.push(b.part); });
    parts.forEach((part) => {
      const batchIds = data.batches.filter((b) => b.part === part).map((b) => b.id);
      const partItems = data.items.filter((it) => batchIds.indexOf(it.batch) >= 0);
      const varied = partItems.filter((it) => it.type !== "mcq");
      const sec = document.createElement("section");
      sec.className = "part";
      const h3 = document.createElement("h3");
      h3.textContent = part;
      sec.appendChild(h3);
      const meta = document.createElement("p");
      meta.className = "part-meta";
      const done = partItems.filter(isAcquired).length;
      meta.textContent = plural(partItems.length, "exercice") + " · " + done + " acquis";
      sec.appendChild(meta);
      const grid = document.createElement("div");
      grid.className = "cards";
      const n = Math.min(SERIES_SIZE, partItems.length);
      addSeries(grid, "Série mélangée", n + " exercices au hasard parmi " + partItems.length, () => startSeries(shuffle(partItems).slice(0, n), part + " : série mélangée"));
      if (varied.length) {
        const m = Math.min(SERIES_SIZE, varied.length);
        addSeries(grid, "Exercices variés, sans QCM", m + " exercices au hasard parmi " + varied.length, () => startSeries(shuffle(varied).slice(0, m), part + " : exercices variés"));
      }
      sec.appendChild(grid);
      const los = data.learning_objectives.filter((lo) => lo.part === part && partItems.some((it) => it.lo === lo.id));
      if (los.length) {
        const det = document.createElement("details");
        det.className = "by-lo";
        const sum = document.createElement("summary");
        sum.textContent = "Par objectif (" + los.length + ")";
        det.appendChild(sum);
        const g2 = document.createElement("div");
        g2.className = "cards";
        los.forEach((lo) => {
          const loItems = partItems.filter((it) => it.lo === lo.id);
          addSeries(g2, lo.short_title, plural(loItems.length, "exercice"), () => startSeries(shuffle(loItems), lo.short_title));
        });
        det.appendChild(g2);
        sec.appendChild(det);
      }
      partsBox.appendChild(sec);
    });

    // Par format d'exercice
    const fmt = $("format-cards");
    fmt.innerHTML = "";
    const types = Object.keys(TYPE_LABELS).filter((t) => data.items.some((it) => it.type === t));
    types.forEach((type) => {
      const typeItems = data.items.filter((it) => it.type === type);
      addSeries(fmt, TYPE_LABELS[type], plural(typeItems.length, "exercice"), () => startSeries(shuffle(typeItems), TYPE_LABELS[type]));
    });
    $("by-format-summary").textContent = "Par format d'exercice (" + types.length + ")";
    $("by-format").hidden = !types.length;
    $("btn-all").textContent = "Tous les exercices (" + data.items.length + ")";
    renderProgress();
    show("home");
  }

  function addSeries(container, name, desc, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "series";
    b.innerHTML = '<span class="name"></span><span class="desc"></span>';
    b.querySelector(".name").textContent = name;
    b.querySelector(".desc").textContent = desc;
    b.addEventListener("click", onClick);
    container.appendChild(b);
  }

  function progressRow(label, done, total) {
    const row = document.createElement("div");
    row.className = "progress-row";
    row.innerHTML = '<span class="label"></span><div class="track" aria-hidden="true"><div class="fill"></div></div><span class="num"></span>';
    row.querySelector(".label").textContent = label;
    row.querySelector(".fill").style.width = (total ? (100 * done / total) : 0) + "%";
    row.querySelector(".num").textContent = done + " / " + total;
    return row;
  }

  function renderProgress() {
    const box = $("progress");
    box.innerHTML = "";
    data.learning_objectives.forEach((lo) => {
      const items = data.items.filter((it) => it.lo === lo.id);
      const acquired = items.filter(isAcquired).length;
      box.appendChild(progressRow(lo.short_title, acquired, items.length));
    });
  }

  // ---------- Série ----------
  function startSeries(items, title) {
    if (!items.length || !current) return;
    const prev = session;
    const target = "#/" + current.id + "/serie";
    const already = location.hash === target;
    session = {
      course: current.id, items: items, index: 0, answers: [], title: title,
      fromCourse: already ? !!(prev && prev.fromCourse) : true, finished: false
    };
    if (already) showSeries();
    else location.hash = target;
  }

  // display the series in memory: the current exercise, or the next one if it was answered
  function showSeries() {
    if (session.finished) { renderResults(); return; }
    if (session.answers.length > session.index) session.index += 1;
    if (session.index >= session.items.length) { renderResults(); return; }
    $("quiz-title").textContent = session.title;
    $("quiz-title").title = session.title;
    renderQuestion();
  }

  function renderQuestion() {
    const it = session.items[session.index];
    setTitle("Série · " + (shortTitle(current) || data.site_title));
    $("top-course").textContent = shortTitle(current) || data.site_title;
    $("q-article").dataset.itemId = it.id;
    $("quiz-counter").textContent = "Exercice " + (session.index + 1) + " / " + session.items.length;
    $("quiz-lo").textContent = loTitle(it.lo);
    $("quiz-type").textContent = TYPE_LABELS[it.type] || "";
    $("quiz-bar").style.width = (100 * session.index / session.items.length) + "%";
    let stem = it.stem, lead = it.lead_in;
    if (it.type === "true_false" || it.type === "direction") { stem = ""; lead = it.statement; }
    if (it.type === "flashcard") { stem = ""; lead = it.prompt; }
    if (it.type === "two_tier") lead = (it.tier1 && it.tier1.lead_in) || it.lead_in;
    if (it.type === "case") lead = it.lead_in || CASE_LEAD;
    $("q-stem").textContent = stem || "";
    $("q-stem").hidden = !stem;
    $("q-lead").textContent = lead || "";
    const box = $("q-options");
    box.innerHTML = "";
    box.className = "options type-" + it.type;
    $("q-feedback").hidden = true;
    $("q-feedback").innerHTML = "";
    $("btn-next").hidden = true;
    $("btn-next").textContent = session.index + 1 < session.items.length ? "Suivant" : "Voir le résultat";
    (RENDERERS[it.type] || renderMcq)(it, box);
    // the instruction receives the focus; no field is focused on first display
    show("quiz", $("q-lead"));
  }

  // one renderer per exercise type (spec section 8.2); an unknown type is shown as a QCM.
  // Function declarations are hoisted: the table can be built before their definitions.
  const RENDERERS = {
    mcq: renderMcq, true_false: renderTrueFalse, direction: renderDirection, numeric: renderNumeric,
    steps: renderSteps, ordering: renderOrdering, matching: renderMatching, classify: renderClassify,
    cloze: renderCloze, diagram: renderDiagram, flashcard: renderFlashcard,
    two_tier: renderTwoTier, case: renderCase, error_spot: renderErrorSpot, short_answer: renderShortAnswer
  };
  // stage types of a case (situation en étapes); each renderer accepts done(ok, html, verdict)
  const STAGE_RENDERERS = { mcq: renderMcq, true_false: renderTrueFalse, direction: renderDirection, numeric: renderNumeric };
  // default end of an exercise: record and show the feedback of the whole item
  function doneFor(it, done) {
    return done || ((ok, html, verdict) => finish(it, ok, html, verdict));
  }
  function focusEl(el) {
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
  }

  function finish(it, ok, html, verdict) {
    record(it.id, ok);
    session.answers.push({ id: it.id, correct: ok });
    const fb = $("q-feedback");
    fb.className = "feedback " + (ok ? "ok" : "ko");
    const v = verdict || (ok ? "Bonne réponse." : "Ce n'est pas la bonne réponse.");
    let out = '<p class="verdict">' + esc(v) + "</p>" + (html || "");
    if (it.source_slides && it.source_slides.length) {
      out += '<p class="src">Cours : slide' + (it.source_slides.length > 1 ? "s " : " ") + esc(it.source_slides.join(", ")) + "</p>";
    }
    fb.innerHTML = out;
    fb.hidden = false;
    $("btn-next").hidden = false;
    try { fb.focus({ preventScroll: true }); } catch (e) { fb.focus(); }
    fb.scrollIntoView({ block: "nearest" });
  }

  function makeButton(cls, text) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.textContent = text;
    return b;
  }
  function checkButton(container) {
    const b = makeButton("primary check", "Vérifier");
    b.disabled = true;
    container.appendChild(b);
    return b;
  }
  function srText(text) {
    const s = document.createElement("span");
    s.className = "sr-only";
    s.textContent = text;
    return s;
  }
  // corrected option: ✓ or ✗ in the letter pill and a hidden text (colour is not the only cue);
  // sr replaces the hidden text, "" adds none (the option already shows "Votre choix")
  function markOpt(btn, state, sr) {
    btn.classList.add(state);
    const letter = btn.querySelector(".letter");
    if (letter) letter.textContent = state === "correct" ? "✓" : "✗";
    const text = sr === undefined ? (state === "correct" ? " (bonne réponse)" : " (votre réponse)") : sr;
    if (text) btn.appendChild(srText(text));
  }
  // ✓ or ✗ after a corrected element (row, list item, blank)
  function markEl(ok) {
    const m = document.createElement("span");
    m.className = "mark " + (ok ? "mark-ok" : "mark-ko");
    const g = document.createElement("span");
    g.setAttribute("aria-hidden", "true");
    g.textContent = ok ? "✓" : "✗";
    m.appendChild(g);
    m.appendChild(srText(ok ? "juste" : "à corriger"));
    return m;
  }

  // ----- QCM -----
  function letterOf(opt, k) { return opt.letter || String.fromCharCode(65 + k); }
  // option button with a letter pill (QCM, paliers of two_tier)
  function optionButton(o, i) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "opt";
    b.dataset.i = i;
    b.innerHTML = '<span class="letter" aria-hidden="true"></span><span class="text"></span>';
    b.querySelector(".letter").textContent = letterOf(o, i);
    b.querySelector(".text").textContent = o.text;
    return b;
  }
  // done(ok, html, verdict) is optional: a stage of a case passes its own (spec section 8.2)
  function renderMcq(it, box, done) {
    done = doneFor(it, done);
    it.options.forEach((o, i) => {
      const b = optionButton(o, i);
      b.addEventListener("click", () => {
        const buttons = Array.from(box.querySelectorAll(".opt"));
        const correctIdx = it.options.findIndex((x) => x.correct);
        const ok = i === correctIdx;
        buttons.forEach((bb, k) => {
          bb.disabled = true;
          if (k === correctIdx) markOpt(bb, "correct");
          if (k === i && !ok) markOpt(bb, "wrong");
        });
        const right = it.options[correctIdx];
        let html = "";
        if (!ok) html += "<p><strong>" + esc(letterOf(o, i)) + ".</strong> " + esc(stripPrefix(o.rationale)) + "</p>";
        html += "<p><strong>" + esc(letterOf(right, correctIdx)) + ". " + esc(right.text) + "</strong> " + esc(stripPrefix(right.rationale)) + "</p>";
        done(ok, html);
      });
      box.appendChild(b);
    });
  }

  // ----- Vrai ou faux -----
  function renderTrueFalse(it, box, done) {
    done = doneFor(it, done);
    [["Vrai", true], ["Faux", false]].forEach(([label, val]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "opt tf";
      b.dataset.value = String(val);
      b.innerHTML = '<span class="letter" aria-hidden="true"></span><span class="text"></span>';
      b.querySelector(".letter").textContent = label[0];
      b.querySelector(".text").textContent = label;
      b.addEventListener("click", () => {
        const ok = val === it.correct;
        Array.from(box.querySelectorAll(".opt")).forEach((bb) => {
          bb.disabled = true;
          const isVal = bb.dataset.value === "true";
          if (isVal === it.correct) markOpt(bb, "correct");
          if (isVal === val && !ok) markOpt(bb, "wrong");
        });
        const html = "<p><strong>" + (it.correct ? "Vrai." : "Faux.") + "</strong> " + esc(stripPrefix(it.rationale)) + "</p>";
        done(ok, html);
      });
      box.appendChild(b);
    });
  }

  // ----- Augmente, diminue ou ne change pas -----
  function renderDirection(it, box, done) {
    done = doneFor(it, done);
    const marks = { up: "+", down: "−", same: "=" };
    ["up", "down", "same"].forEach((key) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "opt tf";
      b.dataset.key = key;
      b.innerHTML = '<span class="letter" aria-hidden="true"></span><span class="text"></span>';
      b.querySelector(".letter").textContent = marks[key];
      b.querySelector(".text").textContent = DIRECTION_LABELS[key];
      b.addEventListener("click", () => {
        const ok = key === it.correct;
        Array.from(box.querySelectorAll(".opt")).forEach((bb) => {
          bb.disabled = true;
          if (bb.dataset.key === it.correct) markOpt(bb, "correct");
          if (bb.dataset.key === key && !ok) markOpt(bb, "wrong");
        });
        const html = "<p><strong>" + esc(DIRECTION_LABELS[it.correct]) + ".</strong> " + esc(stripPrefix(it.rationale)) + "</p>";
        done(ok, html);
      });
      box.appendChild(b);
    });
  }

  // ----- Calcul -----
  function numericFeedback(answer, formula, worked) {
    let html = "<p><strong>Réponse attendue : " + esc(fmtNum(answer.value)) + (answer.unit ? " " + esc(answer.unit) : "") + "</strong>" +
      (answer.tolerance ? ' <span class="muted">(tolérance ± ' + esc(fmtNum(answer.tolerance)) + ")</span>" : "") + "</p>";
    if (formula) html += '<p class="formula">' + esc(formula) + "</p>";
    if (worked) html += '<pre class="worked">' + esc(worked) + "</pre>";
    return html;
  }

  let numSeq = 0;
  // text field with inputmode="decimal": "3,5" and "3.5" are accepted; an unreadable entry
  // shows a message under the field. autofocus only for the next step of a guided calculation.
  function numericInput(container, labelText, onCheck, hint, autofocus) {
    const k = ++numSeq;
    const wrap = document.createElement("div");
    wrap.className = "numeric";
    wrap.innerHTML =
      '<label class="num-label" for="num-' + k + '"></label>' +
      '<div class="num-row"><input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" id="num-' + k + '" aria-describedby="num-err-' + k + '">' +
      '<button type="button" class="primary">Vérifier</button></div>' +
      '<p class="num-error" id="num-err-' + k + '" hidden></p>' +
      (hint ? '<button type="button" class="link hint-btn">Indice</button><p class="hint" hidden></p>' : "");
    wrap.querySelector("label").textContent = labelText;
    container.appendChild(wrap);
    const input = wrap.querySelector("input");
    const btn = wrap.querySelector(".primary");
    const err = wrap.querySelector(".num-error");
    const check = () => {
      const raw = String(input.value).trim();
      if (raw === "") { input.focus(); return; }
      const v = parseNum(raw);
      if (!Number.isFinite(v)) {
        err.textContent = "Entrez un nombre, par exemple 3,5";
        err.hidden = false;
        input.setAttribute("aria-invalid", "true");
        announce("Entrez un nombre, par exemple 3,5");
        input.focus();
        return;
      }
      err.hidden = true;
      input.removeAttribute("aria-invalid");
      input.disabled = true; btn.disabled = true;
      onCheck(v, wrap);
    };
    btn.addEventListener("click", check);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); check(); } });
    if (hint) {
      wrap.querySelector(".hint-btn").addEventListener("click", () => {
        const h = wrap.querySelector(".hint");
        h.textContent = hint; h.hidden = false;
      });
    }
    if (autofocus) setTimeout(() => input.focus(), 50);
    return wrap;
  }

  function renderNumeric(it, box, done) {
    done = doneFor(it, done);
    numericInput(box, "Réponse" + (it.answer.unit ? " (" + it.answer.unit + ")" : ""), (v) => {
      const ok = numClose(v, it.answer.value, it.answer.tolerance);
      done(ok, numericFeedback(it.answer, it.formula, it.worked_solution));
    }, it.hint, false);
  }

  // ----- Calcul guidé par étapes -----
  function renderSteps(it, box) {
    const wrap = document.createElement("div");
    wrap.className = "steps";
    box.appendChild(wrap);
    const results = [];
    const n = it.steps.length;
    function showStep(k) {
      const s = it.steps[k];
      const stepEl = document.createElement("div");
      stepEl.className = "step";
      wrap.appendChild(stepEl);
      numericInput(stepEl, "Étape " + (k + 1) + " / " + n + " : " + s.prompt, (v, inputWrap) => {
        const ok = numClose(v, s.answer.value, s.answer.tolerance);
        results.push(ok);
        stepEl.classList.add(ok ? "correct" : "wrong");
        const res = document.createElement("p");
        res.className = "step-result";
        res.textContent = (ok ? "Juste : " : "Valeur attendue : ") + fmtNum(s.answer.value) + (s.answer.unit ? " " + s.answer.unit : "");
        inputWrap.appendChild(res);
        if (k + 1 < n) {
          announce(res.textContent);
          showStep(k + 1);
        } else {
          const good = results.filter(Boolean).length;
          const all = good === n;
          let html = "";
          if (it.formula) html += '<p class="formula">' + esc(it.formula) + "</p>";
          if (it.worked_solution) html += '<pre class="worked">' + esc(it.worked_solution) + "</pre>";
          finish(it, all, html, all ? "Toutes les étapes sont justes." : good + " étape" + (good > 1 ? "s" : "") + " juste" + (good > 1 ? "s" : "") + " sur " + n + ".");
        }
      }, s.hint, k > 0);
    }
    showStep(0);
  }

  // ----- Ordonnancement -----
  function renderOrdering(it, box) {
    const placed = [];
    const pool = shuffle(it.items.map((text, idx) => ({ text: text, idx: idx })));
    const wrap = document.createElement("div");
    wrap.className = "ordering";
    wrap.innerHTML =
      '<p class="muted small">Touchez les éléments dans l\'ordre demandé.</p>' +
      '<ol class="placed" aria-label="Ordre choisi"></ol>' +
      '<div class="pool"></div>' +
      '<div class="actions"><button type="button" class="link undo" disabled>Annuler le dernier</button></div>';
    box.appendChild(wrap);
    const placedEl = wrap.querySelector(".placed");
    const poolEl = wrap.querySelector(".pool");
    const undo = wrap.querySelector(".undo");

    function draw(focusFirst) {
      placedEl.innerHTML = "";
      placed.forEach((p) => {
        const li = document.createElement("li");
        li.textContent = p.text;
        placedEl.appendChild(li);
      });
      poolEl.innerHTML = "";
      pool.filter((p) => placed.indexOf(p) < 0).forEach((p) => {
        const b = makeButton("opt pool-item", p.text);
        b.dataset.i = p.idx;
        b.addEventListener("click", () => {
          placed.push(p);
          announce("Position " + placed.length + " : " + p.text);
          if (placed.length === it.items.length) { draw(false); check(); } else draw(true);
        });
        poolEl.appendChild(b);
      });
      undo.disabled = placed.length === 0;
      if (focusFirst) {
        const first = poolEl.querySelector("button");
        if (first) first.focus();
      }
    }
    undo.addEventListener("click", () => { placed.pop(); draw(false); undo.disabled ? poolEl.querySelector("button").focus() : undo.focus(); });

    function check() {
      const ok = placed.every((p, k) => p.idx === k);
      undo.disabled = true;
      Array.from(placedEl.children).forEach((li, k) => {
        const good = placed[k].idx === k;
        li.classList.add(good ? "correct" : "wrong");
        li.appendChild(markEl(good));
      });
      let html = '<p><strong>Ordre attendu :</strong></p><ol class="answer-list">' +
        it.items.map((t) => "<li>" + esc(t) + "</li>").join("") + "</ol>";
      if (it.explanation) html += "<p>" + esc(it.explanation) + "</p>";
      finish(it, ok, html);
    }
    draw(false);
  }

  // ----- Appariement -----
  function renderMatching(it, box) {
    const rights = shuffle(it.pairs.map((p) => p.right));
    const wrap = document.createElement("div");
    wrap.className = "matching";
    const base = "match-" + (++numSeq) + "-";
    it.pairs.forEach((p, k) => {
      const row = document.createElement("div");
      row.className = "match-row";
      const label = document.createElement("label");
      label.textContent = p.left;
      label.setAttribute("for", base + k);
      const sel = document.createElement("select");
      sel.id = base + k;
      sel.innerHTML = '<option value="">Choisir…</option>' + rights.map((r) => '<option value="' + esc(r) + '">' + esc(r) + "</option>").join("");
      sel.addEventListener("change", () => { btn.disabled = Array.from(wrap.querySelectorAll("select")).some((s) => !s.value); });
      row.appendChild(label); row.appendChild(sel);
      wrap.appendChild(row);
    });
    const btn = checkButton(wrap);
    box.appendChild(wrap);
    btn.addEventListener("click", () => {
      const selects = Array.from(wrap.querySelectorAll("select"));
      let ok = true;
      selects.forEach((s, k) => {
        const good = s.value === it.pairs[k].right;
        if (!good) ok = false;
        s.disabled = true;
        s.parentElement.classList.add(good ? "correct" : "wrong");
        s.parentElement.querySelector("label").appendChild(markEl(good));
      });
      btn.disabled = true;
      let html = '<p><strong>Associations attendues :</strong></p><ul class="answer-list">' +
        it.pairs.map((p) => "<li>" + esc(p.left) + " : " + esc(p.right) + "</li>").join("") + "</ul>";
      if (it.explanation) html += "<p>" + esc(it.explanation) + "</p>";
      finish(it, ok, html);
    });
  }

  // ----- Classer dans des catégories -----
  function renderClassify(it, box) {
    const elements = shuffle(it.elements.map((e, i) => ({ text: e.text, category: e.category, i: i })));
    const chosen = {};
    const wrap = document.createElement("div");
    wrap.className = "classify";
    const base = "cls-" + (++numSeq) + "-";
    elements.forEach((e) => {
      const row = document.createElement("div");
      row.className = "cls-row";
      row.setAttribute("role", "group");
      row.setAttribute("aria-labelledby", base + e.i);
      const t = document.createElement("div");
      t.className = "cls-text";
      t.id = base + e.i;
      t.textContent = e.text;
      row.appendChild(t);
      const btns = document.createElement("div");
      btns.className = "cls-btns";
      it.categories.forEach((cat) => {
        const b = makeButton("cls-btn", cat);
        b.setAttribute("aria-pressed", "false");
        b.dataset.category = cat;
        b.addEventListener("click", () => {
          if (row.classList.contains("done")) return;
          chosen[e.i] = cat;
          Array.from(btns.children).forEach((x) => {
            x.classList.toggle("selected", x === b);
            x.setAttribute("aria-pressed", x === b ? "true" : "false");
          });
          btn.disabled = Object.keys(chosen).length < it.elements.length;
        });
        btns.appendChild(b);
      });
      row.appendChild(btns);
      row.dataset.i = e.i;
      wrap.appendChild(row);
    });
    const btn = checkButton(wrap);
    box.appendChild(wrap);
    btn.addEventListener("click", () => {
      let ok = true;
      Array.from(wrap.querySelectorAll(".cls-row")).forEach((row) => {
        const e = it.elements[Number(row.dataset.i)];
        const good = chosen[row.dataset.i] === e.category;
        if (!good) ok = false;
        row.classList.add("done", good ? "correct" : "wrong");
        row.querySelector(".cls-text").appendChild(markEl(good));
        Array.from(row.querySelectorAll(".cls-btn")).forEach((b) => {
          b.disabled = true;
          if (b.dataset.category === e.category) { b.classList.add("correct"); b.appendChild(srText(" (bonne catégorie)")); }
        });
      });
      btn.disabled = true;
      let html = "";
      it.categories.forEach((cat) => {
        html += "<p><strong>" + esc(cat) + " :</strong> " + esc(it.elements.filter((e) => e.category === cat).map((e) => e.text).join(" ; ")) + "</p>";
      });
      if (it.explanation) html += "<p>" + esc(it.explanation) + "</p>";
      finish(it, ok, html);
    });
  }

  // ----- Texte à trous -----
  function renderCloze(it, box) {
    const parts = it.text.split("___");
    const bank = shuffle(unique(it.blanks.concat(it.distractors || [])));
    const wrap = document.createElement("div");
    wrap.className = "cloze";
    const p = document.createElement("p");
    p.className = "cloze-text";
    parts.forEach((part, k) => {
      p.appendChild(document.createTextNode(part));
      if (k < parts.length - 1) {
        const sel = document.createElement("select");
        sel.className = "blank";
        sel.setAttribute("aria-label", "Trou " + (k + 1));
        sel.innerHTML = '<option value="">…</option>' + bank.map((w) => '<option value="' + esc(w) + '">' + esc(w) + "</option>").join("");
        sel.addEventListener("change", () => { btn.disabled = Array.from(p.querySelectorAll("select")).some((s) => !s.value); });
        p.appendChild(sel);
      }
    });
    wrap.appendChild(p);
    const btn = checkButton(wrap);
    box.appendChild(wrap);
    btn.addEventListener("click", () => {
      const selects = Array.from(p.querySelectorAll("select"));
      let ok = true;
      selects.forEach((s, k) => {
        const good = s.value === String(it.blanks[k]);
        if (!good) ok = false;
        s.disabled = true;
        s.classList.add(good ? "correct" : "wrong");
        s.insertAdjacentElement("afterend", markEl(good));
      });
      btn.disabled = true;
      let filled = "";
      parts.forEach((part, k) => {
        filled += esc(part);
        if (k < parts.length - 1) filled += "<strong>" + esc(it.blanks[k]) + "</strong>";
      });
      let html = '<p class="cloze-answer">' + filled + "</p>";
      if (it.explanation) html += "<p>" + esc(it.explanation) + "</p>";
      finish(it, ok, html);
    });
  }

  // ----- Schéma à compléter -----
  function wrapLabel(text, maxChars) {
    // keep a parenthetical group on one line when it fits (post-generation fix by Claude Opus 5.5, 2026-09-23)
    const words = String(text).match(/\([^)]*\)|\S+/g) || [];
    const lines = [];
    let cur = "";
    words.forEach((w) => {
      if (cur && (cur + " " + w).length > maxChars) { lines.push(cur); cur = w; }
      else cur = cur ? cur + " " + w : w;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function svgEl(name, attrs) {
    const el = document.createElementNS(SVG_NS, name);
    Object.keys(attrs || {}).forEach((k) => el.setAttribute(k, attrs[k]));
    return el;
  }
  function renderDiagram(it, box) {
    const W = it.width || 100, H = it.height || 60;
    const FS = 3.1, LH = 3.6;
    const fillable = it.nodes.filter((n) => !n.fixed);
    const baseLabels = unique(fillable.map((n) => n.label).concat(it.distractors || []));
    const labels = shuffle(baseLabels);
    const assigned = {};
    let active = fillable.length ? fillable[0].id : null;
    let done = false;
    const byId = {};
    it.nodes.forEach((n) => { byId[n.id] = n; });

    const wrap = document.createElement("div");
    wrap.className = "diagram";
    wrap.innerHTML = '<p class="muted small">Touchez une case numérotée, puis l\'étiquette qui lui correspond.</p>';
    // role "group" (not "img"): the numbered cases inside are keyboard buttons, and the texts
    // of the fixed boxes stay readable by a screen reader
    const svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, class: "diagram-svg", role: "group", "aria-label": "Schéma : " + fillable.length + " case" + (fillable.length > 1 ? "s" : "") + " à compléter" });
    const defs = svgEl("defs");
    const marker = svgEl("marker", { id: "dg-arrow", viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "4", markerHeight: "4", orient: "auto-start-reverse" });
    marker.appendChild(svgEl("path", { d: "M 0 0 L 10 5 L 0 10 z", class: "dg-arrowhead" }));
    defs.appendChild(marker);
    svg.appendChild(defs);

    // edges (drawn first, under the nodes)
    (it.edges || []).forEach(([a, b]) => {
      const na = byId[a], nb = byId[b];
      if (!na || !nb) return;
      if (it.edge_style === "elbow") {
        const x1 = na.x + na.w / 2, y1 = na.y + na.h;
        const x2 = nb.x + nb.w / 2, y2 = nb.y;
        const ym = (y1 + y2) / 2;
        svg.appendChild(svgEl("polyline", { points: x1 + "," + y1 + " " + x1 + "," + ym + " " + x2 + "," + ym + " " + x2 + "," + (y2 - 0.6), class: "dg-edge", "marker-end": "url(#dg-arrow)" }));
      } else {
        const cax = na.x + na.w / 2, cay = na.y + na.h / 2, cbx = nb.x + nb.w / 2, cby = nb.y + nb.h / 2;
        const dx = cbx - cax, dy = cby - cay;
        const border = (n, sx, sy) => { // distance from the centre of n to its border along (sx, sy)
          const tx = sx !== 0 ? (n.w / 2) / Math.abs(sx) : Infinity;
          const ty = sy !== 0 ? (n.h / 2) / Math.abs(sy) : Infinity;
          return Math.min(tx, ty);
        };
        const ta = border(na, dx, dy), tb = border(nb, dx, dy);
        const x1 = cax + dx * ta, y1 = cay + dy * ta;
        const x2 = cbx - dx * tb * 1.02, y2 = cby - dy * tb * 1.02;
        svg.appendChild(svgEl("line", { x1: x1, y1: y1, x2: x2, y2: y2, class: "dg-edge", "marker-end": "url(#dg-arrow)" }));
      }
    });

    // nodes
    const groups = {};
    it.nodes.forEach((n) => {
      const g = svgEl("g", { class: "dg-node " + (n.fixed ? "fixed" : "fill") });
      g.appendChild(svgEl("rect", { x: n.x, y: n.y, width: n.w, height: n.h, rx: 1.6, ry: 1.6 }));
      const text = svgEl("text", { x: n.x + n.w / 2, y: n.y + n.h / 2, "text-anchor": "middle", "font-size": FS });
      g.appendChild(text);
      if (!n.fixed) {
        n.num = fillable.indexOf(n) + 1;
        // keyboard: each numbered case is a button (Tab, then Enter or Space); focus then
        // moves to the first label of the palette (WCAG 2.2, 2.1.1)
        g.setAttribute("tabindex", "0");
        g.setAttribute("role", "button");
        const pick = (fromKey) => {
          if (done) return;
          active = n.id;
          redraw();
          announce("Case " + n.num + " sélectionnée : choisissez son étiquette.");
          if (fromKey) { const first = palette.querySelector("button"); if (first) focusEl(first); }
        };
        g.addEventListener("click", () => pick(false));
        g.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); pick(true); }
        });
      }
      svg.appendChild(g);
      groups[n.id] = { g: g, text: text };
    });
    wrap.appendChild(svg);

    const palette = document.createElement("div");
    palette.className = "palette";
    labels.forEach((label) => {
      const b = makeButton("opt pool-item", label);
      b.dataset.label = label;
      b.dataset.i = baseLabels.indexOf(label);
      b.addEventListener("click", () => {
        if (done) return;
        if (!active) { announce("Choisissez d'abord une case du schéma."); return; }
        Object.keys(assigned).forEach((id) => { if (assigned[id] === label) delete assigned[id]; });
        assigned[active] = label;
        const placedIn = byId[active];
        const next = fillable.find((n) => !assigned[n.id]);
        active = next ? next.id : null;
        redraw();
        announce("Case " + placedIn.num + " : " + label + (next ? ". Case suivante : " + next.num + "." : ". Toutes les cases sont remplies."));
      });
      palette.appendChild(b);
    });
    wrap.appendChild(palette);
    const btn = checkButton(wrap);
    box.appendChild(wrap);

    function setText(textEl, lines, cls) {
      textEl.innerHTML = "";
      textEl.setAttribute("class", cls || "");
      const y0 = Number(textEl.getAttribute("y")) - (lines.length - 1) * LH / 2 + FS * 0.35;
      lines.forEach((line, i) => {
        const ts = svgEl("tspan", { x: textEl.getAttribute("x"), y: y0 + i * LH });
        ts.textContent = line;
        textEl.appendChild(ts);
      });
    }
    function redraw() {
      it.nodes.forEach((n) => {
        const maxChars = Math.max(6, Math.floor(n.w / (FS * 0.56)));
        const gt = groups[n.id];
        if (n.fixed) { setText(gt.text, wrapLabel(n.label, maxChars), "dg-label"); return; }
        gt.g.classList.toggle("active", active === n.id && !done);
        gt.g.classList.toggle("filled", !!assigned[n.id]);
        // accessible name and state of the case button (the SVG text is only its number)
        const verdict = gt.g.classList.contains("correct") ? " (juste)" : gt.g.classList.contains("wrong") ? " (à corriger)" : "";
        gt.g.setAttribute("aria-label", "Case " + n.num + " : " + (assigned[n.id] || "vide") + verdict);
        gt.g.setAttribute("aria-pressed", active === n.id && !done ? "true" : "false");
        if (done) { gt.g.removeAttribute("tabindex"); gt.g.setAttribute("aria-disabled", "true"); }
        if (assigned[n.id]) setText(gt.text, wrapLabel(assigned[n.id], maxChars), "dg-label");
        else setText(gt.text, [String(n.num)], "dg-num");
      });
      Array.from(palette.children).forEach((b) => {
        b.classList.toggle("used", Object.keys(assigned).some((id) => assigned[id] === b.dataset.label));
      });
      btn.disabled = fillable.some((n) => !assigned[n.id]);
    }
    redraw();

    // nodes sharing a `group` are interchangeable: any label of the group fits any of its cases
    const groupLabels = {};
    fillable.forEach((n) => { if (n.group) (groupLabels[n.group] = groupLabels[n.group] || []).push(n.label); });
    btn.addEventListener("click", () => {
      done = true;
      let ok = true;
      fillable.forEach((n) => {
        const good = n.group ? groupLabels[n.group].indexOf(assigned[n.id]) >= 0 : assigned[n.id] === n.label;
        if (!good) ok = false;
        groups[n.id].g.classList.add(good ? "correct" : "wrong");
      });
      redraw();
      btn.disabled = true;
      palette.hidden = true;
      const seen = {};
      const lines = [];
      fillable.forEach((n) => {
        if (!n.group) { lines.push("Case " + n.num + " : " + esc(n.label)); return; }
        if (seen[n.group]) return;
        seen[n.group] = true;
        const members = fillable.filter((m) => m.group === n.group);
        lines.push("Cases " + members.map((m) => m.num).join(", ") + " (ordre indifférent) : " + esc(groupLabels[n.group].join(" ; ")));
      });
      let html = '<p><strong>Étiquettes attendues :</strong></p><ul class="answer-list">' +
        lines.map((l) => "<li>" + l + "</li>").join("") + "</ul>";
      if (it.explanation) html += "<p>" + esc(it.explanation) + "</p>";
      finish(it, ok, html);
    });
  }

  // ----- Carte mémoire (rappel libre puis auto-évaluation) -----
  function renderFlashcard(it, box) {
    const wrap = document.createElement("div");
    wrap.className = "flash";
    wrap.innerHTML =
      '<p class="muted small">Formulez la réponse dans votre tête (ou à voix haute), puis comparez.</p>' +
      '<button type="button" class="primary reveal">Voir la réponse</button>' +
      '<div class="fc-answer" tabindex="-1" hidden></div>' +
      '<div class="fc-grade" hidden><p class="small">Aviez-vous la bonne réponse ?</p>' +
      '<button type="button" class="opt fc-yes"><span class="letter" aria-hidden="true">✓</span><span class="text">Oui, je le savais</span></button>' +
      '<button type="button" class="opt fc-no"><span class="letter" aria-hidden="true">✗</span><span class="text">Non, à revoir</span></button></div>';
    wrap.querySelector(".fc-answer").textContent = it.answer;
    box.appendChild(wrap);
    wrap.querySelector(".reveal").addEventListener("click", () => {
      wrap.querySelector(".reveal").hidden = true;
      const ans = wrap.querySelector(".fc-answer");
      ans.hidden = false;
      wrap.querySelector(".fc-grade").hidden = false;
      ans.focus();
    });
    const grade = (ok) => {
      wrap.querySelector(".fc-yes").disabled = true;
      wrap.querySelector(".fc-no").disabled = true;
      const chosen = wrap.querySelector(ok ? ".fc-yes" : ".fc-no");
      chosen.classList.add(ok ? "correct" : "wrong");
      chosen.appendChild(srText(" (votre réponse)"));
      finish(it, ok, "", ok ? "Réponse connue : la carte est marquée comme acquise." : "Carte à revoir : elle reviendra dans la série « Exercices non acquis ».");
    };
    wrap.querySelector(".fc-yes").addEventListener("click", () => grade(true));
    wrap.querySelector(".fc-no").addEventListener("click", () => grade(false));
  }

  // ---------- Types ajoutés le 2026-09-24 (docs/site_design_2026-09-24.md, section 8) ----------
  function helpLine(box, text) {
    const p = document.createElement("p");
    p.className = "muted small type-help";
    p.textContent = text;
    box.appendChild(p);
    return p;
  }
  // visible tag on the option chosen in a two_tier (read by screen readers too)
  function chosenTag(btn) {
    const tag = document.createElement("span");
    tag.className = "chosen-tag";
    tag.textContent = "Votre choix";
    btn.appendChild(tag);
  }

  // ----- Réponse, puis justification (two_tier, section 8.1) -----
  // The second tier stays hidden until a first-tier option is chosen: its reasons would
  // reveal the answer. One record() for both tiers.
  function renderTwoTier(it, box) {
    const t1 = it.tier1 || { options: [] };
    const t2 = it.tier2 || { options: [] };
    let i1 = -1;
    let graded = false;
    helpLine(box, "Deux choix : d'abord la réponse, puis la raison qui la justifie.");
    const tier1 = document.createElement("div");
    tier1.className = "tier tier1";
    box.appendChild(tier1);
    const sec2 = document.createElement("section");
    sec2.className = "tier tier2";
    sec2.hidden = true;
    const hid = "tier2-h-" + (++numSeq);
    sec2.setAttribute("aria-labelledby", hid);
    const h3 = document.createElement("h3");
    h3.className = "tier2-lead";
    h3.id = hid;
    h3.tabIndex = -1;
    h3.textContent = t2.lead_in || "Quelle raison justifie cette réponse ?";
    sec2.appendChild(h3);
    const tier2 = document.createElement("div");
    tier2.className = "tier tier-opts";
    tier2.setAttribute("role", "group");
    tier2.setAttribute("aria-labelledby", hid);
    sec2.appendChild(tier2);
    box.appendChild(sec2);

    t1.options.forEach((o, i) => {
      const b = optionButton(o, i);
      b.dataset.tier = "1";
      b.addEventListener("click", () => {
        if (i1 >= 0) return;
        i1 = i;
        Array.from(tier1.querySelectorAll(".opt")).forEach((bb) => { bb.disabled = true; });
        b.classList.add("chosen");
        chosenTag(b);
        sec2.hidden = false;
        focusEl(h3);
        sec2.scrollIntoView({ block: "nearest" });
      });
      tier1.appendChild(b);
    });
    t2.options.forEach((o, i) => {
      const b = optionButton(o, i);
      b.dataset.tier = "2";
      b.addEventListener("click", () => { if (!graded && i1 >= 0) grade(i, b); });
      tier2.appendChild(b);
    });

    function grade(i2, chosenBtn) {
      graded = true;
      const c1 = t1.options.findIndex((o) => o.correct);
      const c2 = t2.options.findIndex((o) => o.correct);
      const ok1 = i1 === c1;
      const ok2 = i2 === c2;
      chosenBtn.classList.add("chosen");
      chosenTag(chosenBtn);
      Array.from(tier1.querySelectorAll(".opt")).forEach((bb, k) => {
        if (k === c1) markOpt(bb, "correct");
        if (k === i1 && !ok1) markOpt(bb, "wrong", "");
      });
      Array.from(tier2.querySelectorAll(".opt")).forEach((bb, k) => {
        bb.disabled = true;
        if (k === c2) markOpt(bb, "correct");
        if (k === i2 && !ok2) markOpt(bb, "wrong", "");
      });
      const r1 = t1.options[c1] || {};
      const r2 = t2.options[c2] || {};
      const w1 = t1.options[i1] || {};
      const ch2 = t2.options[i2] || {};
      const verdict = ok1 && ok2 ? "Réponse et raison justes."
        : ok1 ? "Réponse juste, mais la raison choisie est erronée."
        : ok2 ? "La raison choisie est juste, mais la réponse ne correspond pas."
        : "Réponse et raison à revoir.";
      let html = "";
      if (!ok1 && w1.rationale) html += "<p><strong>" + esc(letterOf(w1, i1)) + ".</strong> " + esc(stripPrefix(w1.rationale)) + "</p>";
      html += "<p><strong>Réponse attendue : " + esc(letterOf(r1, c1)) + ". " + esc(r1.text) + "</strong>" +
        (r1.rationale ? " " + esc(stripPrefix(r1.rationale)) : "") + "</p>";
      html += "<p><strong>Raison attendue : " + esc(letterOf(r2, c2)) + ". " + esc(r2.text) + "</strong>" +
        (r2.rationale ? " " + esc(stripPrefix(r2.rationale)) : "") + "</p>";
      if (!ok2) {
        html += '<p class="misconception"><strong>Idée à corriger :</strong> ' + esc(ch2.misconception || ch2.text) + "</p>";
        if (ch2.rationale) html += "<p>" + esc(stripPrefix(ch2.rationale)) + "</p>";
      }
      if (it.explanation) html += "<p>" + esc(it.explanation) + "</p>";
      finish(it, ok1 && ok2, html, verdict);
    }
  }

  // ----- Situation en étapes (case, section 8.2) -----
  // Each stage is corrected when answered and shows its expected answer before the next
  // stage (Haladyna rule 4, independence). The last stage's correction goes into the
  // feedback of the item, which receives the focus. One record() for the whole case.
  function renderCase(it, box) {
    const stages = it.stages || [];
    const n = stages.length;
    const results = [];
    const wrap = document.createElement("div");
    wrap.className = "case";
    box.appendChild(wrap);

    function showStage(k, focusTitle) {
      const s = stages[k];
      const sec = document.createElement("section");
      sec.className = "case-stage";
      sec.dataset.stage = k;
      const hid = "case-h-" + (++numSeq);
      sec.setAttribute("aria-labelledby", hid);
      const h3 = document.createElement("h3");
      h3.id = hid;
      h3.tabIndex = -1;
      h3.textContent = "Étape " + (k + 1) + " sur " + n;
      sec.appendChild(h3);
      if (s.add) {
        const add = document.createElement("p");
        add.className = "case-add";
        const strong = document.createElement("strong");
        strong.textContent = "Nouvelle information :";
        add.appendChild(strong);
        add.appendChild(document.createTextNode(" " + s.add));
        sec.appendChild(add);
      }
      const q = document.createElement("p");
      q.className = "case-q";
      q.id = "case-q-" + numSeq;
      q.textContent = s.statement || s.lead_in || "";
      sec.appendChild(q);
      const controls = document.createElement("div");
      controls.className = "options case-controls type-" + s.type;
      controls.setAttribute("role", "group");
      controls.setAttribute("aria-labelledby", hid + " " + q.id);
      sec.appendChild(controls);
      wrap.appendChild(sec);

      (STAGE_RENDERERS[s.type] || renderMcq)(s, controls, (ok, html) => {
        results.push(ok);
        sec.classList.add(ok ? "correct" : "wrong");
        if (k + 1 < n) {
          const fb = document.createElement("div");
          fb.className = "stage-feedback " + (ok ? "ok" : "ko");
          fb.tabIndex = -1;
          fb.innerHTML = '<p class="verdict">' + (ok ? "Étape juste." : "Étape fausse.") + "</p>" + (html || "");
          sec.appendChild(fb);
          const nextBtn = makeButton("primary next-stage", "Étape suivante");
          sec.appendChild(nextBtn);
          nextBtn.addEventListener("click", () => { nextBtn.remove(); showStage(k + 1, true); });
          focusEl(fb);
          fb.scrollIntoView({ block: "nearest" });
        } else {
          const good = results.filter(Boolean).length;
          const all = good === n;
          let out = '<div class="stage-final"><p><strong>Étape ' + n + " sur " + n + " : " + (ok ? "juste." : "fausse.") + "</strong></p>" + (html || "") + "</div>";
          if (it.explanation) out += '<p class="case-synthesis"><strong>Synthèse :</strong> ' + esc(it.explanation) + "</p>";
          finish(it, all, out, all ? "Toutes les étapes sont justes." : good + " étape" + (good > 1 ? "s" : "") + " juste" + (good > 1 ? "s" : "") + " sur " + n + ".");
        }
      });
      if (focusTitle) {
        focusEl(h3);
        sec.scrollIntoView({ block: "start" });
      }
    }
    if (n) showStage(0, false);
  }

  // ----- Trouver les erreurs d'une explication (error_spot, section 8.3) -----
  function esMark(state) {
    const m = document.createElement("span");
    m.className = "mark " + (state === "found" ? "mark-ok" : state === "missed" ? "mark-miss" : "mark-ko");
    const g = document.createElement("span");
    g.setAttribute("aria-hidden", "true");
    g.textContent = state === "found" ? "✓" : state === "missed" ? "!" : "✗";
    m.appendChild(g);
    m.appendChild(srText(state === "found" ? " erreur repérée" : state === "missed" ? " erreur non repérée" : " phrase exacte"));
    return m;
  }
  function renderErrorSpot(it, box) {
    const segs = it.segments || [];
    const nErr = segs.filter((s) => s.error).length;
    const selected = [];
    let done = false;
    const wrap = document.createElement("div");
    wrap.className = "error-spot";
    const help = document.createElement("p");
    help.className = "es-help";
    wrap.appendChild(help);
    const limit = document.createElement("p");
    limit.className = "es-limit";
    limit.hidden = true;
    wrap.appendChild(limit);
    const ol = document.createElement("ol");
    ol.className = "es-list";
    wrap.appendChild(ol);
    const buttons = segs.map((s, k) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "es-seg";
      b.dataset.i = k;
      b.setAttribute("aria-pressed", "false");
      b.innerHTML = '<span class="es-box" aria-hidden="true"></span><span class="es-text"></span>';
      b.querySelector(".es-text").textContent = s.text;
      b.addEventListener("click", () => toggle(k, b));
      li.appendChild(b);
      ol.appendChild(li);
      return b;
    });
    const btn = checkButton(wrap);
    box.appendChild(wrap);

    function updateHelp() {
      help.textContent = (nErr > 1 ? nErr + " phrases à trouver" : "1 phrase à trouver") + " · sélectionnées : " + selected.length;
      btn.disabled = selected.length !== nErr;
    }
    function toggle(k, b) {
      if (done) return;
      const pos = selected.indexOf(k);
      if (pos >= 0) {
        selected.splice(pos, 1);
        b.setAttribute("aria-pressed", "false");
        limit.hidden = true;
      } else if (selected.length >= nErr) {
        limit.textContent = nErr > 1
          ? nErr + " phrases sont déjà sélectionnées : en retirer une pour en choisir une autre."
          : "Une phrase est déjà sélectionnée : la retirer pour en choisir une autre.";
        limit.hidden = false;
        announce(limit.textContent);
      } else {
        selected.push(k);
        b.setAttribute("aria-pressed", "true");
        limit.hidden = true;
      }
      updateHelp();
    }
    updateHelp();

    btn.addEventListener("click", () => {
      if (done || selected.length !== nErr) return;
      done = true;
      btn.disabled = true;
      limit.hidden = true;
      let found = 0, falseAlarms = 0;
      buttons.forEach((b, k) => {
        b.disabled = true;
        const isErr = !!segs[k].error;
        const sel = selected.indexOf(k) >= 0;
        let state = null;
        if (isErr && sel) { state = "found"; found += 1; }
        else if (!isErr && sel) { state = "false-alarm"; falseAlarms += 1; }
        else if (isErr) state = "missed";
        if (state) { b.classList.add(state); b.appendChild(esMark(state)); }
      });
      const ok = found === nErr && falseAlarms === 0;
      let verdict;
      if (ok) verdict = nErr > 1 ? "Les " + nErr + " erreurs sont repérées." : "L'erreur est repérée.";
      else {
        verdict = found + " erreur" + (found > 1 ? "s" : "") + " repérée" + (found > 1 ? "s" : "") + " sur " + nErr;
        if (falseAlarms) verdict += ", " + falseAlarms + " phrase" + (falseAlarms > 1 ? "s" : "") + " exacte" + (falseAlarms > 1 ? "s" : "") + " sélectionnée" + (falseAlarms > 1 ? "s" : "") + " à tort";
        verdict += ".";
      }
      let html = "<p><strong>" + (nErr > 1 ? "Phrases erronées et corrections :" : "Phrase erronée et correction :") + '</strong></p><ul class="es-fixes">';
      segs.forEach((s) => {
        if (!s.error) return;
        html += '<li><p class="es-fix"><del><span class="sr-only">Phrase erronée : </span>' + esc(s.text) + "</del></p>" +
          '<p class="es-fix"><ins><span class="sr-only">Correction : </span>' + esc(s.correction) + "</ins></p>" +
          (s.rationale ? "<p>" + esc(stripPrefix(s.rationale)) + "</p>" : "") + "</li>";
      });
      html += "</ul>";
      if (it.explanation) html += "<p>" + esc(it.explanation) + "</p>";
      finish(it, ok, html, verdict);
    });
  }

  // ----- Explication écrite et grille d'auto-évaluation (short_answer, section 8.4) -----
  // The text typed stays in the page: it is never stored, sent, or inserted elsewhere.
  function renderShortAnswer(it, box) {
    const criteria = it.criteria || [];
    const k = ++numSeq;
    const wrap = document.createElement("div");
    wrap.className = "short-answer";
    wrap.innerHTML =
      '<label class="sa-label" for="sa-input"></label>' +
      '<p class="sa-note muted small" id="sa-note-' + k + '"></p>' +
      '<textarea id="sa-input" class="sa-input" rows="5" maxlength="800" lang="fr" spellcheck="true" autocomplete="off" aria-describedby="sa-note-' + k + '"></textarea>' +
      '<p class="sa-min muted small" id="sa-min-' + k + '"></p>' +
      '<button type="button" class="primary sa-compare" disabled aria-describedby="sa-min-' + k + '"></button>' +
      '<div class="sa-model" hidden><h3 tabindex="-1">Réponse attendue</h3><p class="sa-model-text"></p></div>' +
      '<fieldset class="sa-criteria" hidden><legend>Votre réponse contient-elle ces éléments ?</legend><div class="sa-crit-list"></div></fieldset>' +
      '<button type="button" class="primary sa-validate" hidden>Valider mon auto-évaluation</button>';
    wrap.querySelector(".sa-label").textContent = "Votre réponse";
    wrap.querySelector(".sa-note").textContent = "Ce texte reste sur cette page : il n'est ni enregistré ni envoyé.";
    const minNote = wrap.querySelector(".sa-min");
    minNote.textContent = "Écrivez au moins quelques mots pour pouvoir comparer.";
    const input = wrap.querySelector(".sa-input");
    const compare = wrap.querySelector(".sa-compare");
    compare.textContent = "Comparer avec la réponse attendue";
    const model = wrap.querySelector(".sa-model");
    model.querySelector(".sa-model-text").textContent = it.model_answer || "";
    const fs = wrap.querySelector(".sa-criteria");
    const list = wrap.querySelector(".sa-crit-list");
    const validate = wrap.querySelector(".sa-validate");
    const boxes = criteria.map((c, i) => {
      const label = document.createElement("label");
      label.className = "sa-crit";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.i = i;
      const body = document.createElement("span");
      body.className = "sa-crit-body";
      const kind = document.createElement("span");
      kind.className = "sa-kind " + (c.kind === "relation" ? "relation" : "element");
      kind.textContent = c.kind === "relation" ? "Lien" : "Élément";
      body.appendChild(kind);
      body.appendChild(document.createTextNode(" " + c.text));
      label.appendChild(cb);
      label.appendChild(body);
      list.appendChild(label);
      return cb;
    });
    box.appendChild(wrap);

    const enough = () => input.value.replace(/\s/g, "").length >= 15;
    input.addEventListener("input", () => {
      compare.disabled = !enough();
      minNote.hidden = enough();
    });
    compare.addEventListener("click", () => {
      if (!enough()) return;
      input.readOnly = true;
      compare.hidden = true;
      minNote.hidden = true;
      model.hidden = false;
      fs.hidden = false;
      validate.hidden = false;
      focusEl(model.querySelector("h3"));
      model.scrollIntoView({ block: "start" });
    });
    validate.addEventListener("click", () => {
      validate.disabled = true;
      const checked = boxes.map((cb) => cb.checked);
      boxes.forEach((cb, i) => {
        cb.disabled = true;
        const lab = cb.parentElement;
        lab.classList.add(checked[i] ? "present" : "absent");
        const m = document.createElement("span");
        m.className = "mark " + (checked[i] ? "mark-ok" : "mark-ko");
        const g = document.createElement("span");
        g.setAttribute("aria-hidden", "true");
        g.textContent = checked[i] ? "✓" : "✗";
        m.appendChild(g);
        m.appendChild(srText(checked[i] ? " présent" : " absent"));
        lab.querySelector(".sa-crit-body").appendChild(m);
      });
      const n = criteria.length;
      const kc = checked.filter(Boolean).length;
      const ok = n > 0 && kc === n;
      const elementsAll = criteria.every((c, i) => c.kind !== "element" || checked[i]);
      const hasElement = criteria.some((c) => c.kind === "element");
      const relationMissing = criteria.some((c, i) => c.kind === "relation" && !checked[i]);
      let verdict;
      if (ok) verdict = "Tous les éléments attendus sont présents.";
      else if (hasElement && elementsAll && relationMissing) verdict = "Les éléments sont présents, mais le lien entre eux manque. Reformuler le mécanisme en une phrase à partir de la réponse attendue.";
      else verdict = kc + " élément" + (kc > 1 ? "s" : "") + " attendu" + (kc > 1 ? "s" : "") + " sur " + n + ".";
      finish(it, ok, it.explanation ? "<p>" + esc(it.explanation) + "</p>" : "", verdict);
    });
  }

  function next() {
    session.index += 1;
    if (session.index < session.items.length) renderQuestion(); else renderResults();
  }

  // ---------- Résultats ----------
  function renderResults() {
    session.finished = true;
    setTitle("Résultat · " + (shortTitle(current) || data.site_title));
    const total = session.answers.length;
    const good = session.answers.filter((a) => a.correct).length;
    $("res-score").textContent = good + " / " + total + " (" + session.title + ")";
    const byLo = $("res-by-lo");
    byLo.innerHTML = "";
    data.learning_objectives.forEach((lo) => {
      const ans = session.answers.filter((a) => (session.items.find((it) => it.id === a.id) || {}).lo === lo.id);
      if (!ans.length) return;
      byLo.appendChild(progressRow(lo.short_title, ans.filter((a) => a.correct).length, ans.length));
    });
    const missed = $("res-missed");
    missed.innerHTML = "";
    const missedItems = session.answers.filter((a) => !a.correct).map((a) => session.items.find((it) => it.id === a.id));
    if (!missedItems.length) {
      const li = document.createElement("li");
      li.textContent = "Aucun : toutes les réponses étaient correctes.";
      missed.appendChild(li);
    }
    missedItems.forEach((it) => {
      const li = document.createElement("li");
      li.innerHTML = '<div class="q"></div><div class="a"></div>';
      li.querySelector(".q").textContent = "[" + (TYPE_LABELS[it.type] || it.type) + "] " + itemTitle(it);
      li.querySelector(".a").textContent = "Réponse : " + correctAnswerText(it);
      missed.appendChild(li);
    });
    $("btn-replay-missed").hidden = !missedItems.length;
    $("btn-replay-missed").onclick = () => startSeries(shuffle(missedItems), "Exercices manqués");
    show("results");
  }

  // ---------- À propos ----------
  function renderAbout() {
    setTitle("À propos · Exercices " + SITE);
    $("top-course").textContent = "";
    const box = $("about-courses");
    box.innerHTML = "";
    const groups = [];
    if (audiences.length) {
      audiences.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).forEach((a) => groups.push({ title: a.label, list: audienceCourses(a) }));
      const others = courses.filter((c) => !audienceOf(c));
      if (others.length) groups.push({ title: "Autres cours", list: others });
    } else {
      groups.push({ title: "Cours", list: courses });
    }
    groups.forEach((g) => {
      if (!g.list.length) return;
      const sec = document.createElement("section");
      sec.className = "about-aud";
      const h2 = document.createElement("h2");
      h2.textContent = g.title;
      sec.appendChild(h2);
      const ul = document.createElement("ul");
      ul.className = "about-list";
      g.list.forEach((c) => {
        const li = document.createElement("li");
        li.innerHTML = '<span class="al-title"></span> <span class="al-meta"></span><span class="al-prov"></span>';
        li.querySelector(".al-title").textContent = c.title;
        li.querySelector(".al-meta").textContent = "(" + c.code + (c.year ? ", " + yearLabel(c.year) : "") + ", " + c.n_items + " exercices, mis à jour le " + c.generated_at + ")";
        li.querySelector(".al-prov").textContent = c.produced_by || "";
        ul.appendChild(li);
      });
      sec.appendChild(ul);
      box.appendChild(sec);
    });
    $("about-version").textContent = courses.length ? "Site mis à jour le " + courses.map((c) => c.generated_at || "").sort().pop() + "." : "";
    show("about");
  }

  // ---------- Init ----------
  function init() {
    $("skip-link").addEventListener("click", (e) => {
      e.preventDefault();
      const m = $("contenu");
      try { m.focus({ preventScroll: true }); } catch (err) { m.focus(); }
      m.scrollIntoView();
    });
    $("btn-about-back").addEventListener("click", () => {
      if (canGoBack()) history.back(); else location.hash = "#/";
    });
    $("btn-next").addEventListener("click", next);
    $("btn-quit").addEventListener("click", leaveSeries);
    $("btn-new-series").addEventListener("click", leaveSeries);
    $("btn-resume-series").addEventListener("click", () => {
      if (!session || !current) return;
      session.fromCourse = true;
      location.hash = "#/" + current.id + "/serie";
    });
    $("btn-recommended").addEventListener("click", () => {
      if (!data) return;
      startSeries(recommendedSeries(data.items, SERIES_SIZE), "Série recommandée");
    });
    $("btn-weak").addEventListener("click", () => {
      if (!data) return;
      startSeries(shuffle(data.items.filter((it) => !isAcquired(it))), "Exercices non acquis");
    });
    $("btn-all").addEventListener("click", () => {
      if (!data) return;
      startSeries(shuffle(data.items), "Tous les exercices");
    });
    $("btn-reset").addEventListener("click", () => {
      if (!data || !window.confirm("Effacer la progression de ce cours enregistrée sur cet appareil ?")) return;
      data.items.forEach((it) => { delete progress[it.id]; });
      saveProgress(); renderHome();
    });
    window.addEventListener("hashchange", route);
    fetch(COURSES_URL)
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((json) => {
        courses = (json.courses || []).filter((c) => c && c.id);
        audiences = Array.isArray(json.audiences) ? json.audiences : [];
        route();
      })
      .catch((e) => {
        $("view-landing").innerHTML = '<h1 tabindex="-1">Chargement impossible</h1><p>Les données du site n\'ont pas pu être lues (' + esc(e.message) + ").</p>";
        show("landing");
      });
  }
  document.addEventListener("DOMContentLoaded", init);
})();
