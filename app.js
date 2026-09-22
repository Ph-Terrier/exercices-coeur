/* Site d'exercices quiz_generator (application statique, sans serveur).
   Produced by: written by the orchestrating model, Claude Fable 5.1, 2026-09-22.
   Données : data/exercices.json produit par R/04_export_web.R depuis le YAML pivot.
   Types d'exercice : mcq, numeric, ordering, matching, true_false.
   Aucune donnée personnelle n'est envoyée ; la progression reste dans localStorage. */
(function () {
  "use strict";

  const DATA_URL = "data/exercices.json";
  const STORE_KEY = "quiz_generator_progress_v1";
  const SERIES_SIZE = 10;
  const TYPE_LABELS = {
    mcq: "QCM",
    numeric: "Calcul",
    ordering: "Remettre dans l'ordre",
    matching: "Associer",
    true_false: "Vrai ou faux"
  };

  let data = null;
  let progress = loadProgress();
  let session = null; // {items, index, answers: [{id, correct}], title}
  let current = null; // état de l'exercice en cours (ordering, matching)

  const $ = (id) => document.getElementById(id);
  const views = ["home", "quiz", "results", "about"];

  function show(view) {
    views.forEach((v) => { $("view-" + v).hidden = v !== view; });
    window.scrollTo(0, 0);
  }

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

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function stripPrefix(s) {
    return String(s || "").replace(/^(Correct|Incorrect|Vrai|Faux)\.\s*/u, "");
  }
  function loTitle(id) {
    const lo = data.learning_objectives.find((l) => l.id === id);
    return lo ? lo.short_title : id;
  }
  function itemTitle(it) {
    if (it.type === "true_false") return it.statement;
    return (it.stem ? it.stem + " " : "") + it.lead_in;
  }
  function correctAnswerText(it) {
    switch (it.type) {
      case "numeric": return it.answer.value + (it.answer.unit ? " " + it.answer.unit : "");
      case "ordering": return it.items.join(" → ");
      case "matching": return it.pairs.map((p) => p.left + " : " + p.right).join(" ; ");
      case "true_false": return it.correct ? "Vrai" : "Faux";
      default: { const r = it.options.find((o) => o.correct); return r ? r.text : ""; }
    }
  }

  // ---------- Accueil ----------
  function renderHome() {
    $("site-title").textContent = data.site_title;
    $("site-sub").textContent = data.course + " · " + data.program + " · " + data.institution;
    const cards = $("series-cards");
    cards.innerHTML = "";
    const parts = [];
    data.batches.forEach((b) => { if (parts.indexOf(b.part) < 0) parts.push(b.part); });

    parts.forEach((part) => {
      const batchIds = data.batches.filter((b) => b.part === part).map((b) => b.id);
      const partItems = data.items.filter((it) => batchIds.indexOf(it.batch) >= 0);
      addHeading(cards, part);
      const n = Math.min(SERIES_SIZE, partItems.length);
      addSeries(cards, "Série mélangée", n + " exercices au hasard parmi " + partItems.length, () => startSeries(shuffle(partItems).slice(0, n), part + " : série mélangée"));
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

  function renderProgress() {
    const box = $("progress");
    box.innerHTML = "";
    data.learning_objectives.forEach((lo) => {
      const items = data.items.filter((it) => it.lo === lo.id);
      const acquired = items.filter((it) => progress[it.id] && progress[it.id].correct > 0).length;
      const row = document.createElement("div");
      row.className = "progress-row";
      row.innerHTML = '<span class="label"></span><div class="track"><div class="fill"></div></div><span class="num"></span>';
      row.querySelector(".label").textContent = lo.short_title;
      row.querySelector(".fill").style.width = (items.length ? (100 * acquired / items.length) : 0) + "%";
      row.querySelector(".num").textContent = acquired + " / " + items.length;
      box.appendChild(row);
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
    current = null;
    $("quiz-counter").textContent = "Exercice " + (session.index + 1) + " / " + session.items.length;
    $("quiz-lo").textContent = loTitle(it.lo);
    $("quiz-type").textContent = TYPE_LABELS[it.type] || "";
    $("quiz-bar").style.width = (100 * session.index / session.items.length) + "%";
    const stem = it.type === "true_false" ? "" : it.stem;
    $("q-stem").textContent = stem || "";
    $("q-stem").hidden = !stem;
    $("q-lead").textContent = it.type === "true_false" ? it.statement : it.lead_in;
    const box = $("q-options");
    box.innerHTML = "";
    box.className = "options type-" + it.type;
    $("q-feedback").hidden = true;
    $("q-feedback").innerHTML = "";
    $("btn-next").hidden = true;
    $("btn-next").textContent = session.index + 1 < session.items.length ? "Suivant" : "Voir le résultat";
    switch (it.type) {
      case "numeric": renderNumeric(it, box); break;
      case "ordering": renderOrdering(it, box); break;
      case "matching": renderMatching(it, box); break;
      case "true_false": renderTrueFalse(it, box); break;
      default: renderMcq(it, box);
    }
  }

  function finish(it, ok, html) {
    record(it.id, ok);
    session.answers.push({ id: it.id, correct: ok });
    const fb = $("q-feedback");
    fb.className = "feedback " + (ok ? "ok" : "ko");
    let out = '<p class="verdict">' + (ok ? "Bonne réponse." : "Ce n'est pas la bonne réponse.") + "</p>" + html;
    if (it.source_slides && it.source_slides.length) {
      out += '<p class="src">Cours : slide' + (it.source_slides.length > 1 ? "s " : " ") + it.source_slides.join(", ") + "</p>";
    }
    fb.innerHTML = out;
    fb.hidden = false;
    $("btn-next").hidden = false;
    $("btn-next").focus();
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

  // ----- Calcul -----
  function renderNumeric(it, box) {
    const wrap = document.createElement("div");
    wrap.className = "numeric";
    wrap.innerHTML =
      '<label class="num-label" for="num-input">Réponse' + (it.answer.unit ? " (" + esc(it.answer.unit) + ")" : "") + '</label>' +
      '<div class="num-row"><input id="num-input" type="number" inputmode="decimal" step="any" autocomplete="off">' +
      '<button class="primary" id="num-check">Vérifier</button></div>' +
      (it.hint ? '<button class="link" id="num-hint">Indice</button><p class="hint" id="num-hint-text" hidden></p>' : "");
    box.appendChild(wrap);
    const input = wrap.querySelector("#num-input");
    const check = () => {
      const raw = String(input.value).replace(",", ".").trim();
      if (raw === "") { input.focus(); return; }
      const v = Number(raw);
      const ok = Number.isFinite(v) && Math.abs(v - it.answer.value) <= (it.answer.tolerance || 0) + 1e-9;
      input.disabled = true;
      wrap.querySelector("#num-check").disabled = true;
      let html = "<p><strong>Réponse attendue : " + esc(it.answer.value) + (it.answer.unit ? " " + esc(it.answer.unit) : "") + "</strong>" +
        (it.answer.tolerance ? ' <span class="muted">(tolérance ± ' + esc(it.answer.tolerance) + ")</span>" : "") + "</p>";
      if (it.formula) html += '<p class="formula">' + esc(it.formula) + "</p>";
      if (it.worked_solution) html += '<pre class="worked">' + esc(it.worked_solution) + "</pre>";
      finish(it, ok, html);
    };
    wrap.querySelector("#num-check").addEventListener("click", check);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") check(); });
    if (it.hint) {
      wrap.querySelector("#num-hint").addEventListener("click", () => {
        const h = wrap.querySelector("#num-hint-text");
        h.textContent = it.hint; h.hidden = false;
      });
    }
    setTimeout(() => input.focus(), 50);
  }

  // ----- Ordonnancement -----
  function renderOrdering(it, box) {
    current = { placed: [] };
    const pool = shuffle(it.items.map((text, idx) => ({ text: text, idx: idx })));
    const wrap = document.createElement("div");
    wrap.className = "ordering";
    wrap.innerHTML =
      '<p class="muted small">Touchez les éléments dans l\'ordre demandé.</p>' +
      '<ol class="placed" id="ord-placed"></ol>' +
      '<div class="pool" id="ord-pool"></div>' +
      '<div class="actions"><button class="link" id="ord-undo" disabled>Annuler le dernier</button></div>';
    box.appendChild(wrap);
    const placedEl = wrap.querySelector("#ord-placed");
    const poolEl = wrap.querySelector("#ord-pool");
    const undo = wrap.querySelector("#ord-undo");

    function draw() {
      placedEl.innerHTML = "";
      current.placed.forEach((p) => {
        const li = document.createElement("li");
        li.textContent = p.text;
        placedEl.appendChild(li);
      });
      poolEl.innerHTML = "";
      pool.filter((p) => current.placed.indexOf(p) < 0).forEach((p) => {
        const b = document.createElement("button");
        b.className = "opt pool-item";
        b.textContent = p.text;
        b.addEventListener("click", () => { current.placed.push(p); draw(); if (current.placed.length === it.items.length) check(); });
        poolEl.appendChild(b);
      });
      undo.disabled = current.placed.length === 0;
    }
    undo.addEventListener("click", () => { current.placed.pop(); draw(); });

    function check() {
      const ok = current.placed.every((p, k) => p.idx === k);
      undo.disabled = true;
      Array.from(placedEl.children).forEach((li, k) => {
        li.classList.add(current.placed[k].idx === k ? "correct" : "wrong");
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
      sel.addEventListener("change", () => { checkBtn.disabled = Array.from(wrap.querySelectorAll("select")).some((s) => !s.value); });
      row.appendChild(label); row.appendChild(sel);
      wrap.appendChild(row);
    });
    const checkBtn = document.createElement("button");
    checkBtn.className = "primary"; checkBtn.textContent = "Vérifier"; checkBtn.disabled = true;
    wrap.appendChild(checkBtn);
    box.appendChild(wrap);
    checkBtn.addEventListener("click", () => {
      const selects = Array.from(wrap.querySelectorAll("select"));
      let ok = true;
      selects.forEach((s, k) => {
        const good = s.value === it.pairs[k].right;
        if (!good) ok = false;
        s.disabled = true;
        s.parentElement.classList.add(good ? "correct" : "wrong");
      });
      checkBtn.disabled = true;
      let html = '<p><strong>Associations attendues :</strong></p><ul class="answer-list">' +
        it.pairs.map((p) => "<li>" + esc(p.left) + " : " + esc(p.right) + "</li>").join("") + "</ul>";
      if (it.explanation) html += "<p>" + esc(it.explanation) + "</p>";
      finish(it, ok, html);
    });
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
      const row = document.createElement("div");
      row.className = "progress-row";
      row.innerHTML = '<span class="label"></span><div class="track"><div class="fill"></div></div><span class="num"></span>';
      const ok = ans.filter((a) => a.correct).length;
      row.querySelector(".label").textContent = lo.short_title;
      row.querySelector(".fill").style.width = (100 * ok / ans.length) + "%";
      row.querySelector(".num").textContent = ok + " / " + ans.length;
      byLo.appendChild(row);
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
      li.querySelector(".q").textContent = itemTitle(it);
      li.querySelector(".a").textContent = "Réponse : " + correctAnswerText(it);
      missed.appendChild(li);
    });
    $("btn-replay-missed").hidden = !missedItems.length;
    $("btn-replay-missed").onclick = () => startSeries(shuffle(missedItems), "Exercices manqués");
  }

  // ---------- À propos ----------
  function renderAbout() {
    $("about-course").textContent = data.course + " · " + data.program + ", " + data.institution + " · cohorte " + data.cohort + ".";
    $("about-provenance").textContent = data.produced_by + (data.copyright ? " " + data.copyright : "");
    const lots = data.batches.map((b) => b.id + " (" + b.n_items + " exercices, généré le " + b.generated + ")").join(" ; ");
    $("about-version").textContent = "Lots : " + lots + ". Site mis à jour le " + data.generated_at + ".";
    $("foot-inst").textContent = data.copyright || (data.institution + " · " + data.program);
  }

  // ---------- Init ----------
  function init() {
    $("btn-home").addEventListener("click", () => { renderHome(); show("home"); });
    $("btn-about").addEventListener("click", () => { renderAbout(); show("about"); });
    $("btn-next").addEventListener("click", next);
    $("btn-quit").addEventListener("click", () => { renderHome(); show("home"); });
    $("btn-new-series").addEventListener("click", () => { renderHome(); show("home"); });
    $("btn-reset").addEventListener("click", () => {
      if (window.confirm("Effacer la progression enregistrée sur cet appareil ?")) {
        progress = {}; saveProgress(); renderProgress();
      }
    });
    fetch(DATA_URL)
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((json) => { data = json; document.title = data.site_title; renderAbout(); renderHome(); show("home"); })
      .catch((e) => {
        $("view-home").innerHTML = "<h1>Chargement impossible</h1><p>Les données du site n'ont pas pu être lues (" + esc(e.message) + ").</p>";
      });
  }
  document.addEventListener("DOMContentLoaded", init);
})();
