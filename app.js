/* Site d'exercices quiz_generator (application statique, sans serveur).
   Produced by: written by the orchestrating model, Claude Fable 5.1, 2026-09-22 ;
   multi-course home page and hash routing added by the orchestrating model
   Claude Opus 5.5, 2026-09-23.
   Données : data/courses.json (index des cours) et data/<cours>.json, produits par
   R/04_export_web.R depuis le YAML pivot. Adresses : #/ (accueil), #/<cours>.
   Types d'exercice : mcq, true_false, direction, numeric, steps, ordering, matching,
   classify, cloze, diagram, flashcard (voir schema/qcm_schema.yaml).
   Aucune donnée personnelle n'est envoyée ; la progression reste dans localStorage. */
(function () {
  "use strict";

  // build stamp written by scripts/deploy_site.sh into <meta name="build">, so that a
  // new deployment fetches fresh data instead of a cached copy (GitHub Pages: max-age 600 s)
  const BUILD = (document.querySelector('meta[name="build"]') || {}).content || "dev";
  const COURSES_URL = "data/courses.json?b=" + BUILD;
  const STORE_KEY = "quiz_generator_progress_v1";
  const SERIES_SIZE = 10;
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
    flashcard: "Carte mémoire"
  };
  const DIRECTION_LABELS = { up: "Augmente", down: "Diminue", same: "Ne change pas" };
  const SVG_NS = "http://www.w3.org/2000/svg";

  let courses = [];      // index of the courses (data/courses.json)
  let data = null;       // data of the current course
  const cache = {};      // course id -> course data
  let progress = loadProgress();
  let session = null; // {items, index, answers: [{id, correct}], title}

  const $ = (id) => document.getElementById(id);
  const views = ["landing", "home", "quiz", "results", "about"];
  let currentView = "landing";

  function show(view) {
    views.forEach((v) => { $("view-" + v).hidden = v !== view; });
    if (view !== "about") currentView = view;
    window.scrollTo(0, 0);
  }

  // ---------- Page d'accueil : choix du cours ----------
  const ICONS = {
    coeur: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 41s-15-9.2-15-20.2C9 14.9 13.4 11 18.3 11c2.6 0 4.6 1.2 5.7 3.1C25.1 12.2 27.1 11 29.7 11 34.6 11 39 14.9 39 20.8 39 31.8 24 41 24 41z"/><path class="pulse" d="M9 25h8l3-6 4 11 3-7 2 2h10"/></svg>',
    neuro: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="15" cy="20" r="6"/><path d="M11 15l-5-6M10 22l-6 2M14 26l-3 7M19 15l2-7"/><path d="M21 21c6 1 10 3 13 7s5 6 9 7"/><path d="M37 32l3-4M40 36l5-1M41 36l2 5"/><path class="myelin" d="M24 22.5l4 1.6M30 25.5l3 2.6"/></svg>'
  };
  function acquiredCount(course) {
    return Object.keys(progress).filter((id) => id.indexOf(course.code + "-") === 0 && progress[id].correct > 0).length;
  }
  function renderLanding() {
    document.title = "Exercices d'entraînement · HE-Arc Santé";
    $("top-course").textContent = "";
    const box = $("course-cards");
    box.innerHTML = "";
    courses.forEach((c) => {
      const a = document.createElement("a");
      a.className = "course-card c-" + c.id;
      a.href = "#/" + c.id;
      const done = acquiredCount(c);
      a.innerHTML =
        '<div class="cc-band">' + (ICONS[c.id] || "") + '<span class="cc-code"></span></div>' +
        '<div class="cc-body"><h3></h3><p class="cc-desc"></p><ul class="cc-parts"></ul>' +
        '<div class="cc-meta"><span class="cc-count"></span><span class="cc-done"></span></div>' +
        '<div class="track"><div class="fill"></div></div>' +
        '<span class="cc-go"></span></div>';
      a.querySelector(".cc-code").textContent = c.code;
      a.querySelector("h3").textContent = c.title;
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
      box.appendChild(a);
    });
    show("landing");
  }

  // ---------- Routage (#/ et #/<cours>) ----------
  function loadCourse(id) {
    if (cache[id]) return Promise.resolve(cache[id]);
    const c = courses.find((x) => x.id === id);
    if (!c) return Promise.reject(new Error("cours inconnu : " + id));
    return fetch(c.file + "?b=" + BUILD)
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((json) => { cache[id] = json; return json; });
  }
  function route() {
    const id = (location.hash.match(/^#\/([\w-]+)/) || [])[1];
    if (!id) { data = null; renderLanding(); return; }
    loadCourse(id)
      .then((json) => { data = json; renderHome(); show("home"); })
      .catch(() => { location.hash = "#/"; });
  }
  function goCourseHome() { renderHome(); show("home"); }

  // ---------- Progression ----------
  function loadProgress() {
    try { const raw = localStorage.getItem(STORE_KEY); return raw ? JSON.parse(raw) : {}; } catch (e) { return {}; }
  }
  function saveProgress() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(progress)); } catch (e) { /* stockage indisponible */ }
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
  function parseNum(raw) { return Number(String(raw).replace(",", ".").replace(/\s/g, "").trim()); }
  function loTitle(id) {
    const lo = data.learning_objectives.find((l) => l.id === id);
    return lo ? lo.short_title : id;
  }
  function itemTitle(it) {
    switch (it.type) {
      case "true_false": case "direction": return it.statement;
      case "flashcard": return it.prompt;
      default: return (it.stem ? it.stem + " " : "") + (it.lead_in || "");
    }
  }
  function correctAnswerText(it) {
    switch (it.type) {
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

  // ---------- Accueil ----------
  function renderHome() {
    document.title = data.site_title + " · exercices";
    $("top-course").textContent = data.site_title;
    $("site-title").textContent = data.site_title;
    $("site-sub").textContent = data.course + " · " + data.program + " · " + data.institution + " · cohorte " + data.cohort;
    const cards = $("series-cards");
    cards.innerHTML = "";
    const parts = [];
    data.batches.forEach((b) => { if (parts.indexOf(b.part) < 0) parts.push(b.part); });

    parts.forEach((part) => {
      const batchIds = data.batches.filter((b) => b.part === part).map((b) => b.id);
      const partItems = data.items.filter((it) => batchIds.indexOf(it.batch) >= 0);
      const varied = partItems.filter((it) => it.type !== "mcq");
      addHeading(cards, part);
      const n = Math.min(SERIES_SIZE, partItems.length);
      addSeries(cards, "Série mélangée", n + " exercices au hasard parmi " + partItems.length, () => startSeries(shuffle(partItems).slice(0, n), part + " : série mélangée"));
      if (varied.length) {
        const m = Math.min(SERIES_SIZE, varied.length);
        addSeries(cards, "Exercices variés (sans QCM)", m + " exercices au hasard parmi " + varied.length, () => startSeries(shuffle(varied).slice(0, m), part + " : exercices variés"));
      }
      data.learning_objectives.filter((lo) => lo.part === part).forEach((lo) => {
        const loItems = partItems.filter((it) => it.lo === lo.id);
        if (!loItems.length) return;
        addSeries(cards, lo.short_title, loItems.length + " exercice" + (loItems.length > 1 ? "s" : ""), () => startSeries(shuffle(loItems), lo.short_title));
      });
    });

    addHeading(cards, "Par format");
    Object.keys(TYPE_LABELS).forEach((type) => {
      const typeItems = data.items.filter((it) => it.type === type);
      if (!typeItems.length) return;
      addSeries(cards, TYPE_LABELS[type], typeItems.length + " exercice" + (typeItems.length > 1 ? "s" : ""), () => startSeries(shuffle(typeItems), TYPE_LABELS[type]));
    });

    addHeading(cards, "Tout");
    const weak = data.items.filter((it) => { const p = progress[it.id]; return !p || p.correct === 0; });
    if (weak.length > 0 && weak.length < data.items.length) {
      addSeries(cards, "Exercices non acquis", weak.length + " exercice" + (weak.length > 1 ? "s" : "") + " jamais réussi" + (weak.length > 1 ? "s" : ""), () => startSeries(shuffle(weak), "Exercices non acquis"));
    }
    addSeries(cards, "Tous les exercices", data.items.length + " exercices, dans un ordre aléatoire", () => startSeries(shuffle(data.items), "Tous les exercices"));
    renderProgress();
  }

  function addHeading(container, text) {
    const h = document.createElement("h3");
    h.className = "series-heading";
    h.textContent = text;
    container.appendChild(h);
  }
  function addSeries(container, name, desc, onClick) {
    const b = document.createElement("button");
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
    row.innerHTML = '<span class="label"></span><div class="track"><div class="fill"></div></div><span class="num"></span>';
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
      const acquired = items.filter((it) => progress[it.id] && progress[it.id].correct > 0).length;
      box.appendChild(progressRow(lo.short_title, acquired, items.length));
    });
  }

  // ---------- Série ----------
  function startSeries(items, title) {
    if (!items.length) return;
    session = { items: items, index: 0, answers: [], title: title };
    show("quiz");
    renderQuestion();
  }

  function renderQuestion() {
    const it = session.items[session.index];
    $("quiz-counter").textContent = "Exercice " + (session.index + 1) + " / " + session.items.length;
    $("quiz-lo").textContent = loTitle(it.lo);
    $("quiz-type").textContent = TYPE_LABELS[it.type] || "";
    $("quiz-bar").style.width = (100 * session.index / session.items.length) + "%";
    let stem = it.stem, lead = it.lead_in;
    if (it.type === "true_false" || it.type === "direction") { stem = ""; lead = it.statement; }
    if (it.type === "flashcard") { stem = ""; lead = it.prompt; }
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
    switch (it.type) {
      case "numeric": renderNumeric(it, box); break;
      case "steps": renderSteps(it, box); break;
      case "ordering": renderOrdering(it, box); break;
      case "matching": renderMatching(it, box); break;
      case "classify": renderClassify(it, box); break;
      case "cloze": renderCloze(it, box); break;
      case "diagram": renderDiagram(it, box); break;
      case "true_false": renderTrueFalse(it, box); break;
      case "direction": renderDirection(it, box); break;
      case "flashcard": renderFlashcard(it, box); break;
      default: renderMcq(it, box);
    }
  }

  function finish(it, ok, html, verdict) {
    record(it.id, ok);
    session.answers.push({ id: it.id, correct: ok });
    const fb = $("q-feedback");
    fb.className = "feedback " + (ok ? "ok" : "ko");
    const v = verdict || (ok ? "Bonne réponse." : "Ce n'est pas la bonne réponse.");
    let out = '<p class="verdict">' + esc(v) + "</p>" + (html || "");
    if (it.source_slides && it.source_slides.length) {
      out += '<p class="src">Cours : slide' + (it.source_slides.length > 1 ? "s " : " ") + it.source_slides.join(", ") + "</p>";
    }
    fb.innerHTML = out;
    fb.hidden = false;
    $("btn-next").hidden = false;
    $("btn-next").focus();
  }

  function makeButton(cls, text) {
    const b = document.createElement("button");
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

  // ----- QCM -----
  function renderMcq(it, box) {
    it.options.forEach((o, i) => {
      const b = document.createElement("button");
      b.className = "opt";
      b.innerHTML = '<span class="letter"></span><span class="text"></span>';
      b.querySelector(".letter").textContent = o.letter || String.fromCharCode(65 + i);
      b.querySelector(".text").textContent = o.text;
      b.addEventListener("click", () => {
        const buttons = Array.from(box.querySelectorAll(".opt"));
        const correctIdx = it.options.findIndex((x) => x.correct);
        const ok = i === correctIdx;
        buttons.forEach((bb, k) => {
          bb.disabled = true;
          if (k === correctIdx) bb.classList.add("correct");
          if (k === i && !ok) bb.classList.add("wrong");
        });
        const right = it.options[correctIdx];
        let html = "";
        if (!ok) html += "<p><strong>" + esc(o.letter) + ".</strong> " + esc(stripPrefix(o.rationale)) + "</p>";
        html += "<p><strong>" + esc(right.letter) + ". " + esc(right.text) + "</strong> " + esc(stripPrefix(right.rationale)) + "</p>";
        finish(it, ok, html);
      });
      box.appendChild(b);
    });
  }

  // ----- Vrai ou faux -----
  function renderTrueFalse(it, box) {
    [["Vrai", true], ["Faux", false]].forEach(([label, val]) => {
      const b = document.createElement("button");
      b.className = "opt tf";
      b.innerHTML = '<span class="letter"></span><span class="text"></span>';
      b.querySelector(".letter").textContent = label[0];
      b.querySelector(".text").textContent = label;
      b.addEventListener("click", () => {
        const ok = val === it.correct;
        Array.from(box.querySelectorAll(".opt")).forEach((bb) => {
          bb.disabled = true;
          const isVal = bb.querySelector(".text").textContent === "Vrai";
          if (isVal === it.correct) bb.classList.add("correct");
          if (isVal === val && !ok) bb.classList.add("wrong");
        });
        const html = "<p><strong>" + (it.correct ? "Vrai." : "Faux.") + "</strong> " + esc(stripPrefix(it.rationale)) + "</p>";
        finish(it, ok, html);
      });
      box.appendChild(b);
    });
  }

  // ----- Augmente, diminue ou ne change pas -----
  function renderDirection(it, box) {
    const marks = { up: "+", down: "−", same: "=" };
    ["up", "down", "same"].forEach((key) => {
      const b = document.createElement("button");
      b.className = "opt tf";
      b.dataset.key = key;
      b.innerHTML = '<span class="letter"></span><span class="text"></span>';
      b.querySelector(".letter").textContent = marks[key];
      b.querySelector(".text").textContent = DIRECTION_LABELS[key];
      b.addEventListener("click", () => {
        const ok = key === it.correct;
        Array.from(box.querySelectorAll(".opt")).forEach((bb) => {
          bb.disabled = true;
          if (bb.dataset.key === it.correct) bb.classList.add("correct");
          if (bb.dataset.key === key && !ok) bb.classList.add("wrong");
        });
        const html = "<p><strong>" + esc(DIRECTION_LABELS[it.correct]) + ".</strong> " + esc(stripPrefix(it.rationale)) + "</p>";
        finish(it, ok, html);
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

  function numericInput(container, labelText, onCheck, hint) {
    const wrap = document.createElement("div");
    wrap.className = "numeric";
    wrap.innerHTML =
      '<label class="num-label">' + esc(labelText) + '</label>' +
      '<div class="num-row"><input type="number" inputmode="decimal" step="any" autocomplete="off" aria-label="' + esc(labelText) + '">' +
      '<button class="primary">Vérifier</button></div>' +
      (hint ? '<button class="link hint-btn">Indice</button><p class="hint" hidden></p>' : "");
    container.appendChild(wrap);
    const input = wrap.querySelector("input");
    const btn = wrap.querySelector(".primary");
    const check = () => {
      const raw = String(input.value).trim();
      if (raw === "") { input.focus(); return; }
      input.disabled = true; btn.disabled = true;
      onCheck(parseNum(raw), wrap);
    };
    btn.addEventListener("click", check);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") check(); });
    if (hint) {
      wrap.querySelector(".hint-btn").addEventListener("click", () => {
        const h = wrap.querySelector(".hint");
        h.textContent = hint; h.hidden = false;
      });
    }
    setTimeout(() => input.focus(), 50);
    return wrap;
  }

  function renderNumeric(it, box) {
    numericInput(box, "Réponse" + (it.answer.unit ? " (" + it.answer.unit + ")" : ""), (v) => {
      const ok = numClose(v, it.answer.value, it.answer.tolerance);
      finish(it, ok, numericFeedback(it.answer, it.formula, it.worked_solution));
    }, it.hint);
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
          showStep(k + 1);
        } else {
          const good = results.filter(Boolean).length;
          const all = good === n;
          let html = "";
          if (it.formula) html += '<p class="formula">' + esc(it.formula) + "</p>";
          if (it.worked_solution) html += '<pre class="worked">' + esc(it.worked_solution) + "</pre>";
          finish(it, all, html, all ? "Toutes les étapes sont justes." : good + " étape" + (good > 1 ? "s" : "") + " juste" + (good > 1 ? "s" : "") + " sur " + n + ".");
        }
      }, s.hint);
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
      '<ol class="placed"></ol>' +
      '<div class="pool"></div>' +
      '<div class="actions"><button class="link undo" disabled>Annuler le dernier</button></div>';
    box.appendChild(wrap);
    const placedEl = wrap.querySelector(".placed");
    const poolEl = wrap.querySelector(".pool");
    const undo = wrap.querySelector(".undo");

    function draw() {
      placedEl.innerHTML = "";
      placed.forEach((p) => {
        const li = document.createElement("li");
        li.textContent = p.text;
        placedEl.appendChild(li);
      });
      poolEl.innerHTML = "";
      pool.filter((p) => placed.indexOf(p) < 0).forEach((p) => {
        const b = makeButton("opt pool-item", p.text);
        b.addEventListener("click", () => { placed.push(p); draw(); if (placed.length === it.items.length) check(); });
        poolEl.appendChild(b);
      });
      undo.disabled = placed.length === 0;
    }
    undo.addEventListener("click", () => { placed.pop(); draw(); });

    function check() {
      const ok = placed.every((p, k) => p.idx === k);
      undo.disabled = true;
      Array.from(placedEl.children).forEach((li, k) => {
        li.classList.add(placed[k].idx === k ? "correct" : "wrong");
      });
      let html = '<p><strong>Ordre attendu :</strong></p><ol class="answer-list">' +
        it.items.map((t) => "<li>" + esc(t) + "</li>").join("") + "</ol>";
      if (it.explanation) html += "<p>" + esc(it.explanation) + "</p>";
      finish(it, ok, html);
    }
    draw();
  }

  // ----- Appariement -----
  function renderMatching(it, box) {
    const rights = shuffle(it.pairs.map((p) => p.right));
    const wrap = document.createElement("div");
    wrap.className = "matching";
    it.pairs.forEach((p, k) => {
      const row = document.createElement("div");
      row.className = "match-row";
      const label = document.createElement("label");
      label.textContent = p.left;
      label.setAttribute("for", "match-" + k);
      const sel = document.createElement("select");
      sel.id = "match-" + k;
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
    elements.forEach((e) => {
      const row = document.createElement("div");
      row.className = "cls-row";
      const t = document.createElement("div");
      t.className = "cls-text";
      t.textContent = e.text;
      row.appendChild(t);
      const btns = document.createElement("div");
      btns.className = "cls-btns";
      it.categories.forEach((cat) => {
        const b = makeButton("cls-btn", cat);
        b.addEventListener("click", () => {
          if (row.classList.contains("done")) return;
          chosen[e.i] = cat;
          Array.from(btns.children).forEach((x) => x.classList.toggle("selected", x === b));
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
        Array.from(row.querySelectorAll(".cls-btn")).forEach((b) => {
          b.disabled = true;
          if (b.textContent === e.category) b.classList.add("correct");
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
    const labels = shuffle(unique(fillable.map((n) => n.label).concat(it.distractors || [])));
    const assigned = {};
    let active = fillable.length ? fillable[0].id : null;
    let done = false;
    const byId = {};
    it.nodes.forEach((n) => { byId[n.id] = n; });

    const wrap = document.createElement("div");
    wrap.className = "diagram";
    wrap.innerHTML = '<p class="muted small">Touchez une case numérotée, puis l\'étiquette qui lui correspond.</p>';
    const svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, class: "diagram-svg", role: "img" });
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
        g.addEventListener("click", () => { if (done) return; active = n.id; redraw(); });
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
      b.addEventListener("click", () => {
        if (done || !active) return;
        Object.keys(assigned).forEach((id) => { if (assigned[id] === label) delete assigned[id]; });
        assigned[active] = label;
        const next = fillable.find((n) => !assigned[n.id]);
        active = next ? next.id : null;
        redraw();
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
      '<button class="primary reveal">Voir la réponse</button>' +
      '<div class="fc-answer" hidden></div>' +
      '<div class="fc-grade" hidden><p class="small">Aviez-vous la bonne réponse ?</p>' +
      '<button class="opt fc-yes"><span class="letter">✓</span><span class="text">Oui, je le savais</span></button>' +
      '<button class="opt fc-no"><span class="letter">✗</span><span class="text">Non, à revoir</span></button></div>';
    wrap.querySelector(".fc-answer").textContent = it.answer;
    box.appendChild(wrap);
    wrap.querySelector(".reveal").addEventListener("click", () => {
      wrap.querySelector(".reveal").hidden = true;
      wrap.querySelector(".fc-answer").hidden = false;
      wrap.querySelector(".fc-grade").hidden = false;
    });
    const grade = (ok) => {
      wrap.querySelector(".fc-yes").disabled = true;
      wrap.querySelector(".fc-no").disabled = true;
      wrap.querySelector(ok ? ".fc-yes" : ".fc-no").classList.add(ok ? "correct" : "wrong");
      finish(it, ok, "", ok ? "Réponse connue : la carte est marquée comme acquise." : "Carte à revoir : elle reviendra dans la série « Exercices non acquis ».");
    };
    wrap.querySelector(".fc-yes").addEventListener("click", () => grade(true));
    wrap.querySelector(".fc-no").addEventListener("click", () => grade(false));
  }

  function next() {
    session.index += 1;
    if (session.index < session.items.length) renderQuestion(); else renderResults();
  }

  // ---------- Résultats ----------
  function renderResults() {
    show("results");
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
  }

  // ---------- À propos ----------
  function renderAbout() {
    if (!data) {
      $("about-course").textContent = "Cours disponibles : " + courses.map((c) => c.title + " (" + c.code + ", " + c.n_items + " exercices)").join(" ; ") + ".";
      $("about-provenance").textContent = "";
      $("about-version").textContent = courses.length ? "Site mis à jour le " + courses.map((c) => c.generated_at).sort().pop() + "." : "";
      return;
    }
    $("about-course").textContent = data.site_title + " : cours " + data.course + ", " + data.program + ", " + data.institution + ", cohorte " + data.cohort + ".";
    $("about-provenance").textContent = data.produced_by;
    const lots = data.batches.map((b) => b.id + " (" + b.n_items + " exercices, généré le " + b.generated + ")").join(" ; ");
    $("about-version").textContent = "Lots : " + lots + ". Mis à jour le " + data.generated_at + ".";
  }

  // ---------- Init ----------
  function init() {
    $("btn-about").addEventListener("click", () => { renderAbout(); show("about"); });
    $("btn-about-back").addEventListener("click", () => {
      if (currentView === "landing" || !data) renderLanding();
      else if (currentView === "home") goCourseHome();
      else show(currentView);
    });
    $("btn-next").addEventListener("click", next);
    $("btn-quit").addEventListener("click", goCourseHome);
    $("btn-new-series").addEventListener("click", goCourseHome);
    $("btn-reset").addEventListener("click", () => {
      if (!data || !window.confirm("Effacer la progression de ce cours enregistrée sur cet appareil ?")) return;
      data.items.forEach((it) => { delete progress[it.id]; });
      saveProgress(); renderHome();
    });
    window.addEventListener("hashchange", route);
    fetch(COURSES_URL)
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((json) => { courses = json.courses || []; route(); })
      .catch((e) => {
        $("view-landing").innerHTML = "<h1>Chargement impossible</h1><p>Les données du site n'ont pas pu être lues (" + esc(e.message) + ").</p>";
        show("landing");
      });
  }
  document.addEventListener("DOMContentLoaded", init);
})();
