/* Title: Examen blanc (mock exam) of the exercise site
   Author: Philippe Terrier (responsible author)
   Produced by: written by the orchestrating model, Claude Opus 5.5, without a code-generation
     model, 2026-09-29, at the author's request (docs/author_decisions.md, rows of 2026-09-29).
   Description: reads data/<body data-exam>.json (written by R/05_export_exam.R). For each
     student, a random seed draws the number of items of each block (meta.exam.blocks), then
     shuffles the questions and the options of each question (seeded PRNG, so the same seed
     gives the same exam). A timer counts down from the deadline, which is fixed when the exam
     starts: closing or reloading the page does not stop it, and the copy is handed in
     automatically at the end. Free navigation, answers can be changed or cleared, questions
     can be flagged. At the end: score, score per block, commented correction.
     State (seed, questions, answers, deadline) is kept in localStorage under
     quiz_generator_exam_<id>_v1 so that a reload resumes the same exam; nothing is sent.
   Inputs: data/<id>.json ; Outputs: DOM only (and the localStorage key above). */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const EXAM_ID = document.body.dataset.exam;
  const BUILD = (document.querySelector('meta[name="build"]') || {}).content || "dev";
  const KEY = "quiz_generator_exam_" + EXAM_ID + "_v1";
  const LETTERS = "ABCDEFGHIJ";
  const VIEWS = ["view-intro", "view-exam", "view-confirm", "view-result"];

  let data = null;
  let byId = {};
  let state = null;
  let timerId = null;
  const announced = {};

  // ---------- storage (every access may fail: private window, blocked storage) ----------
  function loadState() {
    try {
      const s = localStorage.getItem(KEY);
      return s ? JSON.parse(s) : null;
    } catch (e) {
      return null;
    }
  }
  function saveState() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* keep in memory */ }
  }
  function clearState() {
    try { localStorage.removeItem(KEY); } catch (e) { /* nothing */ }
  }

  // ---------- seeded random draw ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function newSeed() {
    try {
      const u = new Uint32Array(1);
      crypto.getRandomValues(u);
      return u[0];
    } catch (e) {
      return Math.floor(Math.random() * 4294967296);
    }
  }
  function codeOf(seed) {
    const s = seed.toString(36).toUpperCase().padStart(7, "0");
    return s.slice(0, 3) + "-" + s.slice(3);
  }
  function drawExam(seed) {
    const rnd = mulberry32(seed);
    let picked = [];
    data.exam.blocks.forEach((b) => {
      const pool = data.items.filter((it) => it.block === b.id);
      picked = picked.concat(shuffle(pool, rnd).slice(0, b.draw));
    });
    picked = shuffle(picked, rnd);
    return picked.map((it) => ({ id: it.id, order: shuffle(it.options.map((_, k) => k), rnd) }));
  }
  function freshState() {
    const seed = newSeed();
    return {
      v: 1, exam: EXAM_ID, seed: seed, code: codeOf(seed), questions: drawExam(seed),
      answers: {}, flags: {}, current: 0, started: null, deadline: null, finished: null, reason: null
    };
  }
  // a saved state is usable only if every question still exists in the bank (after a redeploy)
  function stateIsValid(s) {
    return s && s.v === 1 && s.exam === EXAM_ID && Array.isArray(s.questions) &&
      s.questions.length === data.exam.n_questions &&
      s.questions.every((q) => byId[q.id] && Array.isArray(q.order) && q.order.length === byId[q.id].options.length);
  }

  // ---------- helpers ----------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function show(view) {
    VIEWS.forEach((v) => { $(v).hidden = v !== view; });
    $("loading").hidden = true;
    $("top-timer").hidden = !(view === "view-exam" || view === "view-confirm");
  }
  function announce(msg) {
    const s = $("sr-status");
    s.textContent = "";
    setTimeout(() => { s.textContent = msg; }, 50);
  }
  function mmss(ms) {
    const t = Math.max(0, Math.ceil(ms / 1000));
    return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
  }
  function plural(n, word) { return n + " " + word + (n > 1 ? "s" : ""); }
  function nAnswered() { return state.questions.filter((q) => state.answers[q.id] !== undefined).length; }
  function isCorrect(q) {
    const a = state.answers[q.id];
    return a !== undefined && byId[q.id].options[a].correct === true;
  }
  function blockLabel(id) {
    const b = data.exam.blocks.find((x) => x.id === id);
    return b ? b.label : id;
  }

  // ---------- intro ----------
  function renderIntro() {
    const ex = data.exam;
    $("intro-eyebrow").textContent = "Examen blanc · " + (ex.cohort || "");
    $("intro-title").textContent = ex.title;
    $("intro-subtitle").textContent = ex.subtitle || "";
    const rules = $("intro-rules");
    rules.textContent = "";
    [
      ex.n_questions + " questions à choix multiple, tirées au hasard dans une banque de " + data.items.length +
        " questions : chaque participant reçoit une combinaison différente, qui couvre tous les thèmes de la partie.",
      "Une seule bonne réponse parmi " + ex.n_options + " propositions. Une réponse juste vaut 1 point ; une réponse fausse ou absente vaut 0.",
      "Durée : " + ex.duration_min + " minutes. Le minuteur démarre au clic sur « Commencer l'examen » et continue même si la page est fermée ou rechargée.",
      "À la fin du temps, la copie est remise automatiquement, avec les réponses déjà cochées.",
      "Navigation libre entre les questions ; une réponse peut être modifiée ou effacée, une question peut être marquée pour y revenir.",
      "Le score et la correction commentée s'affichent après la remise de la copie. Rien n'est enregistré ni transmis."
    ].forEach((t) => rules.appendChild(el("li", null, t)));
    const inProgress = state.started && !state.finished;
    $("intro-resume").hidden = !inProgress;
    if (inProgress) {
      $("intro-resume-text").textContent = "Un examen est en cours sur cet appareil (examen n° " + state.code +
        ") : il reste " + mmss(state.deadline - Date.now()) + ".";
    }
    $("btn-start").textContent = inProgress ? "Reprendre l'examen" : "Commencer l'examen";
    $("intro-prov").textContent = ex.produced_by || "";
    show("view-intro");
    $("contenu").focus();
  }

  function startExam() {
    if (!state.started) {
      state.started = Date.now();
      state.deadline = state.started + data.exam.duration_min * 60000;
      state.current = 0;
      saveState();
    }
    startTimer();
    renderQuestion();
    show("view-exam");
    $("q-num").focus();
  }

  // ---------- timer ----------
  function startTimer() {
    stopTimer();
    tick();
    timerId = setInterval(tick, 1000);
  }
  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }
  function tick() {
    if (!state || !state.started || state.finished) return;
    const rem = state.deadline - Date.now();
    if (rem <= 0) {
      submit("timeout");
      return;
    }
    $("timer").textContent = mmss(rem);
    const box = $("top-timer");
    box.classList.toggle("warn", rem <= 5 * 60000 && rem > 60000);
    box.classList.toggle("last", rem <= 60000);
    if (rem <= 5 * 60000 && !announced.five && rem > 60000) {
      announced.five = true;
      announce("Il reste cinq minutes.");
    }
    if (rem <= 60000 && !announced.one) {
      announced.one = true;
      announce("Il reste une minute.");
    }
  }

  // ---------- exam ----------
  function renderQuestion() {
    const n = state.questions.length;
    const i = Math.min(Math.max(state.current, 0), n - 1);
    const q = state.questions[i];
    const it = byId[q.id];
    $("exam-code").textContent = state.code;
    $("q-num").textContent = "Question " + (i + 1) + " sur " + n + (state.flags[q.id] ? " · marquée à revoir" : "");
    $("q-stem").textContent = it.stem || "";
    $("q-lead").textContent = it.lead_in;
    const box = $("q-options");
    box.textContent = "";
    q.order.forEach((k, p) => {
      const lab = el("label", "opt");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "answer";
      input.value = String(k);
      input.checked = state.answers[q.id] === k;
      if (input.checked) lab.classList.add("checked");
      input.addEventListener("change", () => {
        state.answers[q.id] = k;
        saveState();
        box.querySelectorAll(".opt").forEach((o) => o.classList.remove("checked"));
        lab.classList.add("checked");
        renderNavigator();
      });
      lab.appendChild(input);
      lab.appendChild(el("span", "letter", LETTERS[p]));
      lab.appendChild(el("span", "text", it.options[k].text));
      box.appendChild(lab);
    });
    $("btn-prev").disabled = i === 0;
    $("btn-next").disabled = i === n - 1;
    const flagged = !!state.flags[q.id];
    $("btn-flag").setAttribute("aria-pressed", flagged ? "true" : "false");
    $("btn-flag").textContent = flagged ? "Ne plus marquer" : "Marquer pour revoir";
    renderNavigator();
  }
  function renderNavigator() {
    const nav = $("navigator");
    nav.textContent = "";
    state.questions.forEach((q, i) => {
      const li = el("li");
      const b = el("button", null, String(i + 1));
      b.type = "button";
      const answered = state.answers[q.id] !== undefined;
      const flagged = !!state.flags[q.id];
      if (answered) b.classList.add("answered");
      if (flagged) b.classList.add("flagged");
      if (i === state.current) b.setAttribute("aria-current", "step");
      b.setAttribute("aria-label", "Question " + (i + 1) + (answered ? ", répondue" : ", sans réponse") + (flagged ? ", marquée à revoir" : ""));
      b.addEventListener("click", () => goTo(i));
      li.appendChild(b);
      nav.appendChild(li);
    });
    $("exam-progress").textContent = nAnswered() + " / " + state.questions.length + " réponses";
  }
  function goTo(i) {
    state.current = i;
    saveState();
    renderQuestion();
    show("view-exam");
    $("q-num").focus();
  }

  // ---------- hand-in ----------
  function renderConfirm() {
    const empty = [];
    const flagged = [];
    state.questions.forEach((q, i) => {
      if (state.answers[q.id] === undefined) empty.push(i);
      if (state.flags[q.id]) flagged.push(i);
    });
    $("confirm-text").textContent = empty.length === 0
      ? "Toutes les questions ont une réponse. Une fois la copie remise, les réponses ne peuvent plus être modifiées."
      : plural(empty.length, "question") + " sans réponse. Une fois la copie remise, les réponses ne peuvent plus être modifiées.";
    const list = $("confirm-list");
    list.textContent = "";
    const addLinks = (idx, label) => {
      if (!idx.length) return;
      const li = el("li", null, label + " : ");
      idx.forEach((i, k) => {
        const b = el("button", "btn ghost", "Question " + (i + 1));
        b.type = "button";
        b.style.margin = "4px 6px 0 0";
        b.addEventListener("click", () => goTo(i));
        li.appendChild(b);
        if (k < idx.length - 1) li.appendChild(document.createTextNode(" "));
      });
      list.appendChild(li);
    };
    addLinks(empty, "Sans réponse");
    addLinks(flagged, "Marquées à revoir");
    show("view-confirm");
    $("contenu").focus();
  }
  function submit(reason) {
    if (state.finished) return;
    stopTimer();
    state.finished = Math.min(Date.now(), state.deadline);
    state.reason = reason;
    saveState();
    renderResult();
  }

  // ---------- result and correction ----------
  function renderResult() {
    const ex = data.exam;
    const n = state.questions.length;
    const ok = state.questions.filter(isCorrect).length;
    const date = new Date(state.started || Date.now());
    $("result-eyebrow").textContent = "Examen n° " + state.code + " · " + date.toLocaleDateString("fr-CH") + " · " + ex.title;
    $("result-timeout").hidden = state.reason !== "timeout";
    $("score").textContent = ok + " / " + n;
    $("score-detail").textContent = Math.round((100 * ok) / n) + " % de réponses justes · durée : " +
      mmss(state.finished - state.started) + " sur " + ex.duration_min + " min · " +
      plural(n - nAnswered(), "question") + " sans réponse";

    const tb = $("by-block");
    tb.textContent = "";
    ex.blocks.forEach((b) => {
      const qs = state.questions.filter((q) => byId[q.id].block === b.id);
      const tr = el("tr");
      tr.appendChild(el("td", null, b.label));
      tr.appendChild(el("td", null, qs.filter(isCorrect).length + " / " + qs.length));
      tb.appendChild(tr);
    });

    const list = $("correction");
    list.textContent = "";
    state.questions.forEach((q, i) => {
      const it = byId[q.id];
      const a = state.answers[q.id];
      const good = isCorrect(q);
      const li = el("li", "corr-item " + (a === undefined ? "none" : good ? "ok" : "ko"));
      li.appendChild(el("p", "corr-status", "Question " + (i + 1) + " : " +
        (a === undefined ? "sans réponse" : good ? "juste" : "fausse") + " · " + blockLabel(it.block)));
      if (it.stem) li.appendChild(el("p", "corr-q", it.stem));
      li.appendChild(el("p", "corr-lead", it.lead_in));
      const ul = el("ul", "corr-opts");
      let correctIdx = -1;
      q.order.forEach((k, p) => {
        const o = it.options[k];
        if (o.correct) correctIdx = k;
        const oli = el("li");
        if (o.correct) {
          oli.className = "is-correct";
          oli.appendChild(el("span", "tag", a === k ? "Bonne réponse · votre réponse" : "Bonne réponse"));
        } else if (a === k) {
          oli.className = "is-wrong-choice";
          oli.appendChild(el("span", "tag", "Votre réponse"));
        }
        oli.appendChild(document.createTextNode(LETTERS[p] + ". " + o.text));
        ul.appendChild(oli);
      });
      li.appendChild(ul);
      if (a !== undefined && !good) {
        const p = el("p", "corr-why");
        p.appendChild(el("strong", null, "Votre réponse : "));
        p.appendChild(document.createTextNode(it.options[a].rationale));
        li.appendChild(p);
      }
      if (correctIdx >= 0) {
        const p = el("p", "corr-why");
        p.appendChild(el("strong", null, "Bonne réponse : "));
        p.appendChild(document.createTextNode(it.options[correctIdx].rationale));
        li.appendChild(p);
      }
      if (it.explanation) {
        const p = el("p", "corr-why");
        p.appendChild(el("strong", null, "À retenir : "));
        p.appendChild(document.createTextNode(it.explanation));
        li.appendChild(p);
      }
      if (it.source_slides && it.source_slides.length) {
        li.appendChild(el("p", "corr-slides", "Slides du cours : " + it.source_slides.join(", ")));
      }
      list.appendChild(li);
    });
    $("result-prov").textContent = ex.produced_by || "";
    show("view-result");
    $("contenu").focus();
    window.scrollTo(0, 0);
  }

  function newExam() {
    if (!window.confirm("Commencer un nouvel examen avec un nouveau tirage ? Le résultat affiché sera effacé.")) return;
    clearState();
    state = freshState();
    saveState();
    announced.five = announced.one = false;
    renderIntro();
  }

  // ---------- wiring ----------
  function wire() {
    $("btn-start").addEventListener("click", startExam);
    $("btn-prev").addEventListener("click", () => goTo(state.current - 1));
    $("btn-next").addEventListener("click", () => goTo(state.current + 1));
    $("btn-clear").addEventListener("click", () => {
      delete state.answers[state.questions[state.current].id];
      saveState();
      renderQuestion();
    });
    $("btn-flag").addEventListener("click", () => {
      const id = state.questions[state.current].id;
      if (state.flags[id]) delete state.flags[id]; else state.flags[id] = true;
      saveState();
      renderQuestion();
    });
    $("btn-finish").addEventListener("click", renderConfirm);
    $("btn-back").addEventListener("click", () => goTo(state.current));
    $("btn-submit").addEventListener("click", () => submit("submitted"));
    $("btn-new").addEventListener("click", newExam);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
  }

  function init() {
    fetch("data/" + EXAM_ID + ".json?b=" + encodeURIComponent(BUILD), { cache: "no-cache" })
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then((d) => {
        data = d;
        byId = {};
        data.items.forEach((it) => { byId[it.id] = it; });
        $("copyright").textContent = data.exam.copyright || "";
        const saved = loadState();
        state = stateIsValid(saved) ? saved : freshState();
        saveState();
        wire();
        if (state.finished) {
          renderResult();
        } else if (state.started && Date.now() >= state.deadline) {
          submit("timeout");
        } else if (state.started) {
          renderIntro();
        } else {
          renderIntro();
        }
      })
      .catch(() => {
        $("loading").textContent = "L'examen n'a pas pu être chargé. Recharger la page ; si le problème persiste, prévenir l'enseignant.";
      });
  }

  // test hook for the local check (tests/site/exam_autotest.js): read-only access
  window.__exam = { get state() { return state; }, get data() { return data; }, draw: (seed) => drawExam(seed) };

  init();
})();
