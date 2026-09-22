/* Site d'exercices quiz_generator (application statique, sans serveur).
   Produced by: written by the orchestrating model, Claude Fable 5.1, 2026-09-22.
   Données : data/exercices.json produit par R/04_export_web.R depuis le YAML pivot.
   Aucune donnée personnelle n'est envoyée ; la progression reste dans localStorage. */
(function () {
  "use strict";

  const DATA_URL = "data/exercices.json";
  const STORE_KEY = "quiz_generator_progress_v1";
  const SERIES_SIZE = 10;

  let data = null;
  let progress = loadProgress();
  let session = null; // {items, index, answers: [{id, correct}], title}

  const $ = (id) => document.getElementById(id);
  const views = ["home", "quiz", "results", "about"];

  function show(view) {
    views.forEach((v) => { $("view-" + v).hidden = v !== view; });
    window.scrollTo(0, 0);
  }

  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
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

  function loTitle(id) {
    const lo = data.learning_objectives.find((l) => l.id === id);
    return lo ? lo.short_title : id;
  }

  // ---------- Accueil ----------
  function renderHome() {
    $("site-title").textContent = data.site_title;
    $("site-sub").textContent = data.course + " · " + data.program + " · " + data.institution;
    const cards = $("series-cards");
    cards.innerHTML = "";
    const n = Math.min(SERIES_SIZE, data.items.length);
    addSeries(cards, "Série mélangée", n + " questions tirées au hasard parmi les " + data.items.length, () => startSeries(shuffle(data.items).slice(0, n), "Série mélangée"));
    data.learning_objectives.forEach((lo) => {
      addSeries(cards, lo.short_title, lo.n_items + " question" + (lo.n_items > 1 ? "s" : "") + " sur cet objectif", () => startSeries(shuffle(data.items.filter((it) => it.lo === lo.id)), lo.short_title));
    });
    const weak = data.items.filter((it) => { const p = progress[it.id]; return !p || p.correct === 0; });
    if (weak.length > 0 && weak.length < data.items.length) {
      addSeries(cards, "Questions non acquises", weak.length + " question" + (weak.length > 1 ? "s" : "") + " encore jamais réussie" + (weak.length > 1 ? "s" : ""), () => startSeries(shuffle(weak), "Questions non acquises"));
    }
    addSeries(cards, "Toutes les questions", data.items.length + " questions, dans un ordre aléatoire", () => startSeries(shuffle(data.items), "Toutes les questions"));
    renderProgress();
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
    $("quiz-counter").textContent = "Question " + (session.index + 1) + " / " + session.items.length;
    $("quiz-lo").textContent = loTitle(it.lo);
    $("quiz-bar").style.width = (100 * session.index / session.items.length) + "%";
    $("q-stem").textContent = it.stem || "";
    $("q-stem").hidden = !it.stem;
    $("q-lead").textContent = it.lead_in;
    const box = $("q-options");
    box.innerHTML = "";
    it.options.forEach((o, i) => {
      const b = document.createElement("button");
      b.className = "opt";
      b.innerHTML = '<span class="letter"></span><span class="text"></span>';
      b.querySelector(".letter").textContent = o.letter || String.fromCharCode(65 + i);
      b.querySelector(".text").textContent = o.text;
      b.addEventListener("click", () => answer(i));
      box.appendChild(b);
    });
    $("q-feedback").hidden = true;
    $("q-feedback").innerHTML = "";
    $("btn-next").hidden = true;
    $("btn-next").textContent = session.index + 1 < session.items.length ? "Suivant" : "Voir le résultat";
  }

  function answer(choice) {
    const it = session.items[session.index];
    const buttons = Array.from($("q-options").querySelectorAll(".opt"));
    const correctIdx = it.options.findIndex((o) => o.correct);
    const ok = choice === correctIdx;
    buttons.forEach((b, i) => {
      b.disabled = true;
      if (i === correctIdx) b.classList.add("correct");
      if (i === choice && !ok) b.classList.add("wrong");
    });
    record(it.id, ok);
    session.answers.push({ id: it.id, correct: ok, choice: choice });

    const fb = $("q-feedback");
    fb.className = "feedback " + (ok ? "ok" : "ko");
    const chosen = it.options[choice];
    const right = it.options[correctIdx];
    let html = '<p class="verdict">' + (ok ? "Bonne réponse." : "Ce n'est pas la bonne réponse.") + "</p>";
    if (!ok) {
      html += "<p><strong>" + esc(chosen.letter) + ".</strong> " + esc(stripPrefix(chosen.rationale)) + "</p>";
    }
    html += "<p><strong>" + esc(right.letter) + ". " + esc(right.text) + "</strong> " + esc(stripPrefix(right.rationale)) + "</p>";
    if (it.source_slides && it.source_slides.length) {
      html += '<p class="src">Cours : slide' + (it.source_slides.length > 1 ? "s " : " ") + it.source_slides.join(", ") + "</p>";
    }
    fb.innerHTML = html;
    fb.hidden = false;
    $("btn-next").hidden = false;
    $("btn-next").focus();
  }

  function stripPrefix(s) {
    return String(s || "").replace(/^(Correct|Incorrect)\.\s*/u, "");
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function next() {
    session.index += 1;
    if (session.index < session.items.length) {
      renderQuestion();
    } else {
      renderResults();
    }
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
      li.textContent = "Aucune : toutes les réponses étaient correctes.";
      missed.appendChild(li);
    }
    missedItems.forEach((it) => {
      const right = it.options.find((o) => o.correct);
      const li = document.createElement("li");
      li.innerHTML = '<div class="q"></div><div class="a"></div>';
      li.querySelector(".q").textContent = (it.stem ? it.stem + " " : "") + it.lead_in;
      li.querySelector(".a").textContent = "Réponse : " + right.text;
      missed.appendChild(li);
    });
    $("btn-replay-missed").hidden = !missedItems.length;
    $("btn-replay-missed").onclick = () => startSeries(shuffle(missedItems), "Questions manquées");
  }

  // ---------- À propos ----------
  function renderAbout() {
    $("about-course").textContent = data.course + " · " + data.program + ", " + data.institution + " · cohorte " + data.cohort + ".";
    $("about-provenance").textContent = data.produced_by + (data.copyright ? " " + data.copyright : "");
    const lots = data.batches.map((b) => b.id + " (" + b.n_items + " questions, généré le " + b.generated + ")").join(" ; ");
    $("about-version").textContent = "Lots : " + lots + ". Site mis à jour le " + data.generated_at + ".";
    $("foot-inst").textContent = (data.copyright || (data.institution + " · " + data.program));
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
