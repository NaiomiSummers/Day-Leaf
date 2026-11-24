import { paperPassages } from "./forms/passages.js";

// English PHQ-9 and GAD-7, developed by Robert L. Spitzer, Janet B.W. Williams,
// Kurt Kroenke and colleagues with an educational grant from Pfizer Inc.
// The authors' instruction manual places both measures in the public domain.
const scales = {
  phq: {
    name: "PHQ-9",
    title: "Patient Health Questionnaire-9",
    prompt: "Over the last 2 weeks, how often have you been bothered by any of the following problems?",
    items: [
      "Little interest or pleasure in doing things",
      "Feeling down, depressed, or hopeless",
      "Trouble falling or staying asleep, or sleeping too much",
      "Feeling tired or having little energy",
      "Poor appetite or overeating",
      "Feeling bad about yourself — or that you are a failure or have let yourself or your family down",
      "Trouble concentrating on things, such as reading the newspaper or watching television",
      "Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual",
      "Thoughts that you would be better off dead or of hurting yourself in some way"
    ]
  },
  gad: {
    name: "GAD-7",
    title: "Generalized Anxiety Disorder-7",
    prompt: "Over the last 2 weeks, how often have you been bothered by the following problems?",
    items: [
      "Feeling nervous, anxious or on edge",
      "Not being able to stop or control worrying",
      "Worrying too much about different things",
      "Trouble relaxing",
      "Being so restless that it is hard to sit still",
      "Becoming easily annoyed or irritable",
      "Feeling afraid as if something awful might happen"
    ]
  }
};

const responses = ["Not at all", "Several days", "More than half the days", "Nearly every day"];
const impactChoices = ["Not difficult at all", "Somewhat difficult", "Very difficult", "Extremely difficult"];
const impactPrompt = "If you checked off any problems, how difficult have these problems made it for you to do your work, take care of things at home, or get along with other people?";
const attribution = "Developed by Drs. Robert L. Spitzer, Janet B.W. Williams, Kurt Kroenke and colleagues, with an educational grant from Pfizer Inc.";
const columbiaHost = "https://cssrs.columbia.edu/wp-content/uploads/";
const officialForms = {
  recent: {
    version: "C-SSRS Self-Report – Recent (2026)",
    source: columbiaHost + "C-SSRS-Screener-Self-Report-Recent-2026.pdf"
  },
  followup: {
    version: "C-SSRS Self-Report – Since Last Visit (2026)",
    source: columbiaHost + "C-SSRS-Screener-Self-Report-Since-Last-Visit-2026.pdf"
  }
};

function validAnswer(value) {
  return Number.isInteger(value) && value >= 0 && value <= 3;
}

export function scoreAnswers(answers, length) {
  if (!Array.isArray(answers) || answers.length !== length) return null;
  let total = 0;
  for (const answer of answers) {
    if (!validAnswer(answer)) return null;
    total += answer;
  }
  return total;
}

export function phqNeedsSupport(answers) {
  const itemNine = answers?.[8];
  return validAnswer(itemNine) && itemNine > 0;
}

function scoreLabel(key, answers) {
  const length = scales[key].items.length;
  const total = scoreAnswers(answers, length);
  if (total === null) return `Incomplete · ${answers.filter(validAnswer).length}/${length} answered`;
  return `Score ${total}/${3 * length}`;
}

function offsetDate(date, days) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function displayDate(date) {
  return new Date(date + "T12:00:00Z").toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC"
  });
}

// Serialize an independent snapshot for each edit. A slow earlier save must
// not overwrite the status text for a later edit.
function makeSaver(ctx, host, store, record) {
  let revision = 0;
  const status = (value) => {
    const field = host.querySelector("[data-assess-save]");
    if (field) field.textContent = value;
  };
  return async () => {
    const current = ++revision;
    status("Saving…");
    try {
      await ctx.put(store, JSON.parse(JSON.stringify(record)));
      if (current === revision) status("Saved on this device");
    } catch {
      if (current === revision) status("Save failed. Keep this page open and try saving again.");
    }
  };
}

function safetyBox() {
  return `<aside class="assess-support notice" role="status">
    <strong>Support is available</strong>
    <p>Open your clinician-agreed safety plan and choose someone to contact. If you might act soon or need immediate help, contact local emergency services.</p>
    <button type="button" class="btn secondary" data-assess-safety>Open safety plan and contacts</button>
  </aside>`;
}

function scalePanel(key, record) {
  const scale = scales[key];
  const answers = record[key];
  return `<details class="card assess-panel">
    <summary class="assess-summary"><span><span class="eyebrow">${scale.name}</span>
      <strong>${key === "phq" ? "Depression questionnaire" : "Anxiety questionnaire"}</strong></span>
      <span class="pill" data-scale-progress="${key}">${scoreLabel(key, answers)}</span></summary>
    <div class="assess-body"><h3>${scale.title}</h3><p>${scale.prompt}</p>
      ${scale.items.map((item, i) => `<label class="assess-item field"><span><b>${i + 1}.</b> ${item}</span>
        <select data-scale="${key}" data-item="${i}">
          <option value="">Choose a response</option>
          ${responses.map((value, index) => `<option value="${index}" ${answers[i] === index ? "selected" : ""}>${value}</option>`).join("")}
        </select></label>${key === "phq" && i === 8 ? `<div data-item-support ${phqNeedsSupport(answers) ? "" : "hidden"}>${safetyBox()}</div>` : ""}`).join("")}
      <label class="assess-item field"><span>${impactPrompt}</span>
        <select data-impact="${key}">
          <option value="">Choose a response</option>
          ${impactChoices.map(value => `<option ${record[key + "Impact"] === value ? "selected" : ""}>${value}</option>`).join("")}
        </select><small class="muted">Functional impact is recorded separately from the symptom total.</small>
      </label>
      <p class="muted assess-source">${attribution}</p>
    </div></details>`;
}

export function renderWeekly(ctx) {
  const { date, root, esc } = ctx;
  const stored = ctx.db.weekly.find(w => w.date === date);
  const review = {
    id: date, date, phq: Array(9).fill(null), gad: Array(7).fill(null),
    phqImpact: "", gadImpact: "", improved: "", hard: "", discuss: "", treatment: "",
    ...JSON.parse(JSON.stringify(stored || {}))
  };
  const weekStart = offsetDate(date, -6);
  const lookback = offsetDate(date, -13);
  root.innerHTML = `<div class="stack assess-weekly">
    <section class="card"><p class="eyebrow">Seven-day review</p>
      <h2 class="section-title">${displayDate(weekStart)} – ${displayDate(date)}</h2>
      <div class="assess-week-summary">${ctx.summary(weekStart, date)}</div>
    </section>
    <div><h2 class="section-title">Weekly questionnaires</h2>
      <p class="muted">Both questionnaires cover ${displayDate(lookback)} through ${displayDate(date)}. Reviews taken one week apart cover seven of the same days.</p></div>
    <div data-top-support ${phqNeedsSupport(review.phq) ? "" : "hidden"}>${safetyBox()}</div>
    ${scalePanel("phq", review)}${scalePanel("gad", review)}
    <section class="card stack"><h2 class="section-title">Reflections for this week</h2>
      ${[["improved", "What improved?"], ["hard", "What stayed hard?"], ["treatment", "What changed in my treatment or support?"], ["discuss", "What would I like to discuss at my next visit?"]].map(([key, label]) => `<label class="field">${label}
        <textarea rows="2" data-review-note="${key}" placeholder="Optional">${esc(review[key] || "")}</textarea></label>`).join("")}
    </section>
    <div class="row"><button type="button" class="btn primary" data-save-review>Save review</button>
      <span class="muted" role="status" data-assess-save>${stored ? "Saved on this device" : "Changes save automatically"}</span></div>
  </div>`;
  const host = root.firstElementChild;
  const save = makeSaver(ctx, host, "weekly", review);
  host.addEventListener("change", event => {
    const { scale, item, impact } = event.target.dataset;
    if (scale && scales[scale]) {
      review[scale][Number(item)] = event.target.value === "" ? null : Number(event.target.value);
      host.querySelector(`[data-scale-progress="${scale}"]`).textContent = scoreLabel(scale, review[scale]);
      if (scale === "phq" && item === "8") {
        for (const box of host.querySelectorAll("[data-top-support], [data-item-support]")) box.hidden = !phqNeedsSupport(review.phq);
      }
      save();
    } else if (impact && scales[impact]) {
      review[impact + "Impact"] = event.target.value;
      save();
    }
  });
  host.addEventListener("input", event => {
    if (!event.target.dataset.reviewNote) return;
    review[event.target.dataset.reviewNote] = event.target.value;
    save();
  });
  host.addEventListener("click", event => {
    if (event.target.closest("[data-assess-safety]")) ctx.safety();
    if (event.target.closest("[data-save-review]")) save();
  });
}

export function requiredCssrs(formKey, answers = {}) {
  if (!Object.hasOwn(officialForms, formKey)) return [];
  const keys = ["q1", "q2"];
  if (answers.q2 === "yes") keys.push("q3", "q4", "q5");
  keys.push("q6");
  if (formKey === "recent" && answers.q6 === "yes") keys.push("q6recent");
  return keys;
}

export function cssrsComplete(formKey, answers = {}) {
  const required = requiredCssrs(formKey, answers);
  return required.length > 0 && required.every(key => answers[key] === "yes" || answers[key] === "no");
}

export function cssrsNeedsSupport(record) {
  if (!record) return false;
  if (record.concern === true) return true;
  if (record.method !== "worksheet") return false;
  return requiredCssrs(record.formKey, record.answers).some(key => record.answers?.[key] === "yes");
}

export function previousCssrs(records, date) {
  return records.filter(row => row.date < date && row.status === "completed")
    .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}

export function changeCssrsAnswer(formKey, previous, key, value) {
  const answers = { ...previous };
  if (!requiredCssrs(formKey, answers).includes(key)) return answers;
  if (value === "yes" || value === "no") answers[key] = value;
  else delete answers[key];
  const applicable = requiredCssrs(formKey, answers);
  for (const field of Object.keys(answers)) {
    if (!applicable.includes(field)) delete answers[field];
  }
  return answers;
}

function sourceParagraph(passage) {
  // Fit original image fragments to the reader's text size and wrap them
  // at word boundaries. The PDF stays intact and the text is accessible.
  const images = passage.fragments.map(([x, y, w, h]) =>
    `<svg width="${w / 28}em" height="${h / 28}em" viewBox="${x} ${y} ${w} ${h}" focusable="false" aria-hidden="true"><use href="#assess-source-page"></use></svg>`
  ).join("");
  return `<span class="assess-sr">${passage.text}</span><span class="assess-fragments" aria-hidden="true">${images}</span>`;
}

function answerRows(formKey, record) {
  const answers = record.answers || {};
  return requiredCssrs(formKey, answers).map(key => {
    const name = key === "q6" ? (formKey === "recent" ? "q6recentForm" : "q6followupForm") : key;
    const passages = paperPassages[name];
    return `<fieldset class="assess-question" aria-labelledby="cssrs-prompt-${key}">
      <legend class="assess-sr">Question ${key === "q6recent" ? "6 follow-up" : key.slice(1)}</legend>
      <div id="cssrs-prompt-${key}">${passages.map(sourceParagraph).join("")}</div>
      <div class="assess-response-group">
      ${["yes", "no"].map(value => `<label class="assess-option">
        <input type="radio" name="cssrs-${key}" data-css-answer="${key}" value="${value}" ${answers[key] === value ? "checked" : ""}>
        <span>${value === "yes" ? "Yes" : "No"}</span></label>`).join("")}
      ${answers[key] ? `<button type="button" class="btn secondary" data-css-clear="${key}" aria-label="Clear answer to question ${key.slice(1)}">Clear</button>` : ""}
      ${answers[key] === "yes" ? '<button type="button" class="btn secondary" data-assess-safety>Open safety plan</button>' : ""}</div>
    </fieldset>`;
  }).join("");
}

export function openCssrs(records, date) {
  const stored = records.find(r => r.date === date);
  const previous = previousCssrs(records, date);
  // Freeze the form and reference assessment on the first entry. Backfilling
  // a different day must not reinterpret the timeframe of past responses.
  const formKey = stored?.formKey || (previous ? "followup" : "recent");
  const form = officialForms[formKey];
  return {
    id: date, date, method: "worksheet", status: null, formKey,
    version: form.version, source: form.source,
    priorDate: previous?.date || "", priorTime: previous?.time || "",
    answers: {}, concern: null, note: "", time: "",
    ...JSON.parse(JSON.stringify(stored || {}))
  };
}

export function renderCssrs(ctx, host, date = ctx.date) {
  const record = openCssrs(ctx.db.cssrs, date);
  const stored = ctx.db.cssrs.some(r => r.date === date);
  const { formKey } = record;
  const form = officialForms[formKey];
  const baseline = formKey === "recent";
  const recordedTime = record.priorTime ? " at " + record.priorTime : "";
  const last = record.priorDate ? displayDate(record.priorDate) + recordedTime : "";
  const formatStatus = () => record.status === "completed" ? "Completed" : record.status === "incomplete" ? "Incomplete" : "Not logged";
  host.innerHTML = `<div class="stack assess-cssrs">
    <div><p class="eyebrow">Columbia Lighthouse Project</p><h3>${form.version}</h3>
      <p class="muted">${baseline
        ? "First recorded assessment. Use the Recent form. If you have an earlier completed screen, enter it under its original date first."
        : "Use the period since the previous completed assessment on " + ctx.esc(last) + ". Days without a screen remain unassessed."}</p>
    </div>
    <p class="assess-monitor">Nobody monitors this app. It is not an emergency response tool.</p>
    <div class="row"><button class="btn secondary" type="button" data-assess-safety>Safety plan and contacts</button>
      <span class="pill" aria-live="polite" data-css-status>${formatStatus()}</span></div>
    <div data-css-support ${cssrsNeedsSupport(record) ? "" : "hidden"}>${safetyBox()}</div>
    <details class="assess-original"><summary>View complete official form</summary>
      <p><a href="./forms/${formKey}.pdf" target="_blank" rel="noopener">Open original, selectable-text PDF (offline)</a></p>
      <img class="assess-page-image" src="./forms/${formKey}.png" width="1428" height="1848"
        alt="Complete blank ${form.version}. The original PDF and the numbered answer sheet contain the accessible text." loading="lazy">
    </details>
    <svg width="0" height="0" aria-hidden="true" class="assess-svg-source"><defs>
      <image id="assess-source-page" href="./forms/${formKey}.png" width="1428" height="1848"></image></defs></svg>
    <label class="field">How would you like to record this screen?
      <select data-css-mode><option value="worksheet">Record answers by question number</option>
        <option value="manual" ${record.method === "manual" ? "selected" : ""}>Record paper completion only</option></select></label>
    <div data-answer-pane ${record.method === "worksheet" ? "" : "hidden"}>
      <h4>${baseline ? "In the past Month" : "Since Last Visit"}</h4>
      <p class="muted">${baseline ? "Questions 1–5 cover the past month. Question 6 asks about your lifetime." : "Consider the whole period since " + ctx.esc(last) + "."}</p>
      <p>Please answer questions 1 and 2</p>
      <div class="assess-answers" data-answer-rows>${answerRows(formKey, record)}</div></div>
    <div data-manual-pane ${record.method === "manual" ? "" : "hidden"}><label class="field">Paper form status
      <select data-css-manual><option value="">Not logged</option><option value="incomplete">Incomplete</option>
        <option value="completed">Completed</option></select></label></div>
    <label class="field">Assessment time, if known<input type="time" data-css-time value="${ctx.esc(record.time || "")}"></label>
    <label class="assess-flag"><input type="checkbox" data-css-concern ${record.concern === true ? "checked" : ""}>
      <span>I want support with something on this screen</span></label>
    <div data-css-inline-support ${cssrsNeedsSupport(record) ? "" : "hidden"}>${safetyBox()}</div>
    <label class="field">Note for my clinician<textarea rows="2" placeholder="Optional" data-css-note>${ctx.esc(record.note || "")}</textarea></label>
    <div class="row"><button type="button" class="btn secondary" data-css-save>Save screen record</button>
      <span class="muted" role="status" data-assess-save>${stored ? "Saved on this device" : "Changes save automatically"}</span></div>
  </div>`;
  // Attach listeners to the new child, since Today can reuse the host
  // element when switching between activity dates.
  const panel = host.firstElementChild;
  const selector = query => panel.querySelector(query);
  const save = makeSaver(ctx, panel, "cssrs", record);
  const syncSupport = () => {
    const show = cssrsNeedsSupport(record);
    selector("[data-css-support]").hidden = !show;
    selector("[data-css-inline-support]").hidden = !show;
  };
  const sync = () => {
    selector("[data-css-status]").textContent = formatStatus();
    selector("[data-answer-pane]").hidden = record.method !== "worksheet";
    selector("[data-manual-pane]").hidden = record.method !== "manual";
    selector("[data-css-manual]").value = record.method === "manual" ? record.status || "" : "";
    syncSupport();
  };
  function recordAnswer(key, value) {
    record.answers = changeCssrsAnswer(formKey, record.answers, key, value);
    record.status = cssrsComplete(formKey, record.answers) ? "completed" : "incomplete";
    selector("[data-answer-rows]").innerHTML = answerRows(formKey, record);
    selector(`[data-css-answer="${key}"][value="${value || "yes"}"]`)?.focus({preventScroll: true});
    sync();
    save();
  }
  sync();
  panel.addEventListener("change", event => {
    const target = event.target;
    if (target.hasAttribute("data-css-mode")) {
      const hasRecord = record.status || Object.keys(record.answers).length;
      if (hasRecord && !window.confirm("Changing the recording method will clear this screen’s answers and completion status. Continue?")) {
        target.value = record.method;
        return;
      }
      record.method = target.value;
      record.answers = {};
      record.status = null;
      selector("[data-answer-rows]").innerHTML = answerRows(formKey, record);
    } else if (target.dataset.cssAnswer) {
      recordAnswer(target.dataset.cssAnswer, target.value);
      return;
    } else if (target.hasAttribute("data-css-manual")) {
      record.status = target.value || null;
    } else if (target.hasAttribute("data-css-concern")) {
      record.concern = target.checked ? true : null;
    } else if (target.hasAttribute("data-css-time")) {
      record.time = target.value;
    } else return;
    sync();
    save();
  });
  panel.addEventListener("input", event => {
    if (!event.target.hasAttribute("data-css-note")) return;
    record.note = event.target.value;
    save();
  });
  panel.addEventListener("click", event => {
    if (event.target.closest("[data-assess-safety]")) ctx.safety();
    const clear = event.target.closest("[data-css-clear]");
    if (clear) recordAnswer(clear.dataset.cssClear, "");
    if (event.target.closest("[data-css-save]")) save();
  });
}
