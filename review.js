// Local journal views. All date ranges are inclusive activity dates.
import { requiredCssrs, scoreAnswers } from './assess.js';
const oneDay = 86400000;
const activities = { shower: 'Shower', clothes: 'Change clothes', teeth: 'Brush teeth', school: 'Schoolwork', work: 'Paid work' };
const activityStates = ['Done', 'Partly done', 'Not done', 'Not applicable'];
const substances = { thc: 'THC', alcohol: 'Alcohol' };
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const dayFormatter = new Intl.DateTimeFormat(undefined, { month:'short', day:'numeric', year:'numeric', timeZone:'UTC' });
const has = value => value !== null && value !== undefined && String(value).trim() !== '';
const number = value => has(value) && Number.isFinite(Number(value));
const dayCount = n => n + (n === 1 ? ' day' : ' days');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const sortDate = (a, b) => a.date.localeCompare(b.date);
const inRange = (records, start, end) => records.filter(row => row.date >= start && row.date <= end).sort(sortDate);

function validDate(value) {
  if (!datePattern.test(value)) return false;
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function shift(date, days) {
  return new Date(Date.parse(date + 'T00:00:00Z') + days * oneDay).toISOString().slice(0, 10);
}

function fmtDate(date) {
  if (!validDate(date)) return 'Date unavailable';
  return dayFormatter.format(new Date(date + 'T12:00:00Z'));
}

function clockStamp(timestamp) {
  const time = new Date(timestamp);
  return Number.isNaN(time.valueOf()) ? 'Unavailable' : time.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function duration(minutes) {
  if (!number(minutes)) return 'Not logged';
  const n = Math.round(Number(minutes));
  const h = Math.floor(n / 60);
  return [h ? h + 'h' : '', n % 60 || !h ? n % 60 + 'm' : ''].filter(Boolean).join(' ');
}

function details(obj, fields) {
  return fields.filter(([key]) => has(obj?.[key])).map(([key, label]) => '<span class="jr-detail"><b>' + esc(label) + '</b> ' + esc(obj[key]) + '</span>').join(' ');
}

function hasDailyData(day) {
  return [day.anxiety, day.depression, day.reflection, day.treatment, day.dayKind].some(has)
    || Object.values(day.sleep || {}).some(value => has(value) && value !== 'Not logged')
    || Object.values(day.activities || {}).some(row => row && ((has(row.status) && row.status !== 'Not logged') || ['minutes','breaks','help','accommodations','barrier'].some(key => has(row[key]))))
    || (day.scheduled || []).some(row => row.status === 'Taken' || row.status === 'Skipped' || has(row.effect) || has(row.sideEffects))
    || (day.prns || []).some(row => ['name','dose','time','reason','effect','sideEffects'].some(key => has(row[key])))
    || Object.values(day.substances || {}).some(row => ['None','Used'].includes(row?.status));
}

export function rangeData(db, start, end) {
  if (!validDate(start) || !validDate(end) || start > end) return null;
  const days = inRange(db.daily, start, end).filter(hasDailyData);
  const total = Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / oneDay) + 1;
  return { start, end, total, days, weekly: inRange(db.weekly, start, end), meds: inRange(db.meds, start, end), cssrs: inRange(db.cssrs, start, end), workbook: inRange(db.workbook, start, end) };
}

function metricRow(label, value, coverage) {
  return '<div class="jr-stat"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong><small>' + esc(coverage) + '</small></div>';
}

function average(days, extract, format) {
  const values = days.map(extract).filter(number).map(Number);
  return [values.length ? format(values.reduce((acc, v) => acc + v, 0) / values.length) : '—', values.length];
}

function metrics(range) {
  const { total, days } = range;
  const rating = v => Number(v.toFixed(1)) + ' / 10';
  const metrics = [
    ['Anxiety average', ...average(days, d => d.anxiety, rating)],
    ['Depression average', ...average(days, d => d.depression, rating)],
    ['Average time asleep', ...average(days, d => d.sleep?.estimatedMinutes, duration)]
  ];
  return '<div class="jr-stats">' + metricRow('Days logged', days.length + ' / ' + total, dayCount(total - days.length) + ' without daily observations') + metrics.map(([label,value,count]) => metricRow(label, value, count + ' of ' + dayCount(total) + ' recorded')).join('') + '</div>';
}

const empty = message => '<p class="muted jr-empty">' + esc(message) + '</p>';
function table(headers, rows, caption) {
  return '<div class="jr-table-wrap" role="region" aria-label="' + esc(caption) + '" tabindex="0"><table class="jr-table"><caption class="jr-sr">' + esc(caption) + '</caption><thead><tr>' + headers.map(h => '<th scope="col">' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' + rows.map(row => '<tr>' + row.map((cell,i) => i ? '<td>' + cell + '</td>' : '<th scope="row">' + cell + '</th>').join('') + '</tr>').join('') + '</tbody></table></div>';
}

function ratingTable(days) {
  const rows = days.map(d => [
    esc(fmtDate(d.date)), esc(d.anxiety ?? '—'), esc(d.depression ?? '—'), duration(d.sleep?.estimatedMinutes), esc(d.sleep?.quality || '—')
  ]);
  return rows.length ? table(['Activity date','Anxiety / 10','Depression / 10','Time asleep','Sleep quality'], rows, 'Daily self-ratings and sleep') : empty('No daily self-ratings or sleep recorded.');
}

function activityOverview(range) {
  const rows = Object.entries(activities).map(([key,label]) => {
    const counts = activityStates.map(s => range.days.filter(d => d.activities?.[key]?.status === s).length);
    return [esc(label), ...counts, range.total - counts.reduce((sum,n) => sum+n,0)];
  });
  return table(['Activity',...activityStates,'Not logged'], rows, 'Activity status by calendar day');
}

function substanceOverview(range) {
  const rows = Object.entries(substances).map(([key,label]) => {
    const used = range.days.filter(day => day.substances?.[key]?.status === 'Used').length;
    const none = range.days.filter(day => day.substances?.[key]?.status === 'None').length;
    return [esc(label), used, none, range.total - used - none, range.total];
  });
  return table(['Substance','Used','None','Not logged','Days in range'], rows, 'Substance status by calendar day');
}

function medicineTimeline(range) {
  const rows = range.meds.map(m => [m.date, '<b>' + esc(m.name || 'Scheduled medication') + '</b> · ' + (m.active === false ? 'Discontinued' : 'Schedule recorded') + ' ' + details(m,[['dose','Dose'],['time','Scheduled time'],['note','Note']])]);
  range.days.filter(d => has(d.treatment)).forEach(d => rows.push([d.date, esc(d.treatment)]));
  range.weekly.filter(w => has(w.treatment)).forEach(w => rows.push([w.date, 'Weekly review · ' + esc(w.treatment)]));
  rows.sort((a,b) => a[0].localeCompare(b[0]));
  return rows.length ? table(['Effective or review date','Treatment entry'], rows.map(([d,s]) => [esc(fmtDate(d)),s]), 'Patient-reported treatment changes') : empty('No treatment changes recorded in this range.');
}

function medLog(range) {
  const scheduled = range.days.flatMap(d => (d.scheduled || []).map(m => ({...m,date:d.date})));
  const prns = range.days.flatMap(d => (d.prns || []).filter(m => ['name','dose','time','reason','effect','sideEffects'].some(k => has(m[k]))).map(m => ({...m,date:d.date})));
  const taken = scheduled.filter(m => m.status === 'Taken').length;
  const skipped = scheduled.filter(m => m.status === 'Skipped').length;
  const scheduleSummary = scheduled.length ? taken + ' taken · ' + skipped + ' skipped · ' + (scheduled.length - taken - skipped) + ' not logged across ' + scheduled.length + ' scheduled dose' + (scheduled.length === 1 ? '' : 's') + ' listed on check-ins.' : 'No scheduled doses listed on check-ins.';
  const lead = '<p>' + scheduleSummary + ' ' + prns.length + ' PRN administration' + (prns.length === 1 ? '' : 's') + ' recorded.</p>';
  const records = [...scheduled.map(m => ({...m,type:'Scheduled'})), ...prns.map(m => ({...m,type:'PRN'}))].sort(sortDate);
  return lead + (records.length ? table(['Activity date','Medication','Record'], records.map(m => [
    esc(fmtDate(m.date)), '<b>' + esc(m.name || 'Name not logged') + '</b><br>' + esc(m.type),
    (m.type === 'Scheduled' ? esc(m.status || 'Not logged') + ' ' : '') + details(m,[['dose','Dose'],['time','Time'],['reason','Reason'],['effect','Effect'],['sideEffects','Side effects']])
  ]), 'Dated scheduled and PRN medication entries') : '');
}

function helpLog(range) {
  const rows = range.days.flatMap(d => Object.entries(activities).flatMap(([key,label]) => {
    const row = d.activities?.[key];
    const text = details(row, [['breaks','Breaks'],['help','Help or prompts'],['accommodations','Accommodations']]);
    return text ? [[esc(fmtDate(d.date)),esc(label),text]] : [];
  }));
  return rows.length ? table(['Activity date','Activity','Assistance recorded'], rows, 'Assistance and breaks') : empty('No help, breaks or accommodations described.');
}

function disclosure(title, content, open = false) {
  return '<details class="jr-disclosure"' + (open ? ' open' : '') + '><summary>' + esc(title) + '</summary><div>' + content + '</div></details>';
}

export function summary(ctx, start, end) {
  const range = rangeData(ctx.db,start,end);
  if (!range) return empty('Choose a valid date range.');
  return '<div class="jr-summary"><p class="muted">' + esc(fmtDate(start)) + ' – ' + esc(fmtDate(end)) + ' · Daily observations, including partial check-ins.</p>' + metrics(range) +
    disclosure('Daily ratings and sleep',ratingTable(range.days) + '<p class="muted">A dash marks an unanswered field. Days without observations are included in the coverage count.</p>') +
    disclosure('Hygiene, schoolwork and paid work',activityOverview(range) + helpLog(range)) +
    disclosure('Scheduled and PRN medications',medLog(range)) + disclosure('THC and alcohol',substanceOverview(range)) + disclosure('Treatment changes',medicineTimeline(range)) + '</div>';
}

const templates = {
  chain: {
    title: 'Behavior Chain Analysis', icon: 'activity', blurb: 'Trace a difficult moment, one step at a time.',
    fields: [
      ['vulnerabilities','Vulnerabilities','What was already making the day difficult before this began?'],
      ['event','Prompting event','Where were you, and what happened just before the chain began?'],
      ['links','Links in the chain','Add the thoughts, feelings, body sensations and actions in the order you remember them.'],
      ['behavior','Behavior','Describe the action you want to understand. What would someone have seen?'],
      ['consequences','Consequences','What changed right away? What did you notice later?'],
      ['alternatives','Skillful alternatives','Choose a link where you could try a different skill or ask for support.']
    ]
  },
  dear: {
    title:'DEAR MAN', icon:'pen', blurb:'Prepare for a request or a boundary.',
    fields:[
      ['describe','Describe','What specific situation do you want to bring up?'],
      ['express','Express','What feeling or need would you like the other person to understand?'],
      ['assert','Assert','Write the request or boundary in your own words.'],
      ['reinforce','Reinforce','How could honoring this request help the people involved?'],
      ['mindful','Stay mindful','What phrase could bring you back to your request if the topic shifts?'],
      ['appear','Appear confident','What posture, pace or tone would feel steady enough for you?'],
      ['negotiate','Negotiate','Which parts are flexible? What alternative could work?'],
      ['rehearse','Rehearsal','Practice the conversation here, including how you might respond.']
    ]
  },
  diary: {
    title:'DBT Diary Card',icon:'book',blurb:'Record emotions, urges and the skills you practiced.',
    fields:[
      ['emotions','Emotions','Which feelings stood out, and how intense did they feel?'],
      ['urges','Urges','What did you feel pulled to do?'],
      ['actions','Actions','What did you actually do when an urge showed up?'],
      ['skills','Skills practiced','Which skill did you try, and in what situation?'],
      ['result','What followed','How did the situation or your experience change afterward?'],
      ['support','Support for next time','What support or skill would you like to have ready?']
    ]
  },
  facts: {
    title:'Check the Facts',icon:'clipboard',blurb:'Separate observations from interpretations.',
    fields:[
      ['event','What happened','Describe what you could directly observe.'],
      ['emotion','Emotion','Name the feeling and describe its strength.'],
      ['interpretation','Your interpretation','What meaning did you give those observations?'],
      ['evidence','Evidence','Which facts support your interpretation? Which point in another direction?'],
      ['other','Other explanations','Write another account that also fits the facts.'],
      ['next','Next step','Given what you know now, how would you like to respond?']
    ]
  },
  opposite: {
    title:'Opposite Action',icon:'sprout',blurb:'Explore a different response to an emotion.',
    fields:[
      ['emotion','Emotion and situation','What are you feeling, and what brought it on?'],
      ['urge','Action urge','What does this feeling urge you to do?'],
      ['fit','Fit and effectiveness','How well does this feeling fit the facts? What might following the urge do?'],
      ['alternative','Opposite action','What different action would move you toward your goal?'],
      ['practice','Practice','How could you try this with your words, body and attention?'],
      ['after','Afterward','What did you notice during or after trying it?']
    ]
  },
  pros: {
    title:'Pros & Cons',icon:'list',blurb:'Consider what an action and its alternative might bring.',
    fields:[
      ['choice','The choice','Which urge or decision are you weighing?'],
      ['actPros','Benefits of acting','What might you gain right away or over time?'],
      ['actCons','Costs of acting','Which difficulties could follow now or later?'],
      ['resistPros','Benefits of resisting','What could improve if you pause or choose another action?'],
      ['resistCons','Costs of resisting','What would feel difficult about taking that path?'],
      ['decision','Your next step','Which option fits your priorities today?']
    ]
  }
};

let openWorksheet = null;
export function clearWorksheetSession() { openWorksheet = null; }
function worksheetTitle(row) { return templates[row.type]?.title || 'Worksheet'; }
function templateIcon(ctx, name) { return ctx.icon(name,22); }
function dayChoices(ctx, linkedDate) {
  const dates = new Set(ctx.db.daily.map(d => d.date));
  if (linkedDate) dates.add(linkedDate);
  return '<option value="">No linked entry</option>' + [...dates].sort().reverse().map(date => '<option value="' + esc(date) + '"' + (linkedDate === date ? ' selected' : '') + '>' + esc(fmtDate(date)) + '</option>').join('');
}

function linkFields(links) {
  return links.map((link,i) => '<div class="jr-chain-step"><label class="field"><span>Link ' + (i+1) + '</span><textarea rows="2" data-link="' + i + '">' + esc(link) + '</textarea></label>' + (links.length > 1 ? '<button class="btn secondary jr-small" type="button" data-remove-link="' + i + '">Remove link ' + (i+1) + '</button>' : '') + '</div>').join('');
}

function worksheetEditor(ctx, row) {
  const t = templates[row.type];
  if (!t) { openWorksheet = null; renderWorkbook(ctx); return; }
  const root = ctx.root;
  const fields = t.fields.map(([key,label,prompt]) => key === 'links'
    ? '<fieldset class="jr-links"><legend>Links in the chain</legend><p class="muted">' + esc(prompt) + '</p><div data-link-list>' + linkFields(row.links) + '</div><button type="button" class="btn secondary" data-add-link>Add a link</button></fieldset>'
    : '<label class="field"><strong>' + esc(label) + '</strong><small class="muted">' + esc(prompt) + '</small><textarea data-answer="' + key + '" rows="3">' + esc(row.answers[key]) + '</textarea></label>').join('');
  const status = row.status === 'finished' ? 'Finished' : 'Draft';
  const stamp = row.updatedAt ? 'Last edited ' + esc(clockStamp(row.updatedAt)) : '';
  root.innerHTML = [
    '<div class="stack jr-view"><button class="btn secondary jr-back" data-workbook-home>← All worksheets</button>',
    '<section class="card stack"><div class="card-head"><h2>' + esc(t.title) + '</h2><span class="pill" data-stage>' + status + '</span></div>',
    '<p class="muted">Write as much or as little as you like. Edits save on this device.</p>',
    '<form class="stack" data-sheet-form><div class="grid-2">',
    '<label class="field">Worksheet date<input required type="date" data-sheet-date value="' + esc(row.date) + '"></label>',
    '<label class="field">Linked daily entry <small class="muted">Optional</small><select data-sheet-link>' + dayChoices(ctx,row.dailyDate) + '</select></label></div>',
    fields, '<div class="row"><button class="btn primary" type="button" data-finish>Finish worksheet</button>',
    '<button class="btn secondary" type="button" data-draft>Save draft</button></div>',
    '<small class="muted" role="status" data-write-state>' + stamp + '</small></form></section></div>'
  ].join('');
  const form = root.querySelector('[data-sheet-form]');
  const writeState = form.querySelector('[data-write-state]');
  const stage = root.querySelector('[data-stage]');
  let serial = 0;
  async function save() {
    if (!validDate(row.date)) return;
    const n = ++serial;
    writeState.textContent = 'Saving…';
    try {
      const stored = await ctx.put('workbook',{...row,answers:{...row.answers},links:[...row.links]});
      if (n === serial) {
        row.createdAt = stored.createdAt;
        row.updatedAt = stored.updatedAt;
        writeState.textContent = 'Saved on this device · ' + clockStamp(stored.updatedAt);
        stage.textContent = row.status === 'finished' ? 'Finished' : 'Draft';
      }
    } catch {
      if (n === serial) writeState.textContent = 'Save failed. Keep this worksheet open and try Save draft again.';
    }
  }
  root.querySelector('[data-workbook-home]').onclick = () => { openWorksheet = null; renderWorkbook(ctx); };
  form.onsubmit = e => e.preventDefault();
  form.oninput = e => {
    const field = e.target;
    if (field.hasAttribute('data-sheet-date')) {
      if (!validDate(field.value)) { writeState.textContent = 'Enter a worksheet date to save this change.'; return; }
      row.date = field.value;
    } else if (field.hasAttribute('data-sheet-link')) row.dailyDate = field.value;
    else if (field.dataset.answer) row.answers[field.dataset.answer] = field.value;
    else if (field.dataset.link !== undefined) row.links[Number(field.dataset.link)] = field.value;
    else return;
    void save();
  };
  form.onclick = e => {
    const button = e.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-add-link') || button.hasAttribute('data-remove-link')) {
      if (button.hasAttribute('data-add-link')) row.links.push('');
      else row.links.splice(Number(button.dataset.removeLink),1);
      form.querySelector('[data-link-list]').innerHTML = linkFields(row.links);
      if (button.hasAttribute('data-add-link')) form.querySelector('[data-link="' + (row.links.length-1) + '"]').focus();
      void save();
    } else if (button.hasAttribute('data-finish') || button.hasAttribute('data-draft')) {
      if (!form.reportValidity()) return;
      row.status = button.hasAttribute('data-finish') ? 'finished' : 'draft';
      void save();
    }
  };
}

function editWorksheet(ctx, record) {
  openWorksheet = {...record,answers:{...record.answers},links:[...(record.links || [''])]};
  worksheetEditor(ctx,openWorksheet);
}

export function renderWorkbook(ctx) {
  if (openWorksheet) {
    const stored = ctx.db.workbook.find(row => row.id === openWorksheet.id);
    // Backups can replace the journal while this module stays loaded.
    if (stored) return editWorksheet(ctx,stored);
    openWorksheet = null;
  }
  const rows = [...ctx.db.workbook].sort((a,b) => sortDate(b,a) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const library = Object.entries(templates).map(([type,t]) => '<button class="jr-template" data-start="' + type + '"><span class="jr-template-icon" aria-hidden="true">' + templateIcon(ctx,t.icon) + '</span><span><strong>' + esc(t.title) + '</strong><small>' + esc(t.blurb) + '</small></span><span class="jr-chevron" aria-hidden="true">›</span></button>').join('');
  const saved = rows.length ? '<div class="jr-entries">' + rows.map(row => '<button class="jr-entry" data-worksheet="' + esc(row.id) + '"><span><strong>' + esc(worksheetTitle(row)) + '</strong><small>' + esc(fmtDate(row.date)) + (row.dailyDate ? ' · Linked to ' + esc(fmtDate(row.dailyDate)) : '') + '</small></span><span class="pill">' + (row.status === 'finished' ? 'Finished' : 'Draft') + '</span></button>').join('') + '</div>' : empty('Your drafts and finished worksheets will appear here.');
  ctx.root.innerHTML = '<div class="stack jr-view"><section class="card"><h2>Start a worksheet</h2><div class="jr-library">' + library + '</div></section><section class="card"><div class="card-head"><h2>My worksheets</h2><span class="pill">' + rows.length + '</span></div>' + saved + '</section></div>';
  ctx.root.querySelectorAll('[data-start]').forEach(b => b.onclick = () => editWorksheet(ctx,{id:crypto.randomUUID(),type:b.dataset.start,date:ctx.date || ctx.today(),status:'draft',dailyDate:'',answers:{},links:['']}));
  ctx.root.querySelectorAll('[data-worksheet]').forEach(b => b.onclick = () => editWorksheet(ctx,ctx.db.workbook.find(row => row.id === b.dataset.worksheet)));
}

const historyKinds = {daily:'Daily check-in',weekly:'Weekly review',cssrs:'C-SSRS record',workbook:'DBT worksheet',meds:'Medication change'};
function screenStatus(row) {
  return ({completed:'Completed',incomplete:'Incomplete'})[row.status] || 'Not logged';
}
export function renderHistory(ctx) {
  const records = Object.entries(historyKinds).flatMap(([store]) => ctx.db[store].map(row => ({store,row})))
    .sort((a,b) => sortDate(b.row,a.row) || String(b.row.updatedAt).localeCompare(String(a.row.updatedAt)));
  ctx.root.innerHTML = '<section class="card stack jr-view"><div class="card-head"><h2>Entry history</h2><label class="field jr-filter"><span class="jr-sr">Filter entries by type</span><select data-history-filter><option value="">All entries</option>' + Object.entries(historyKinds).map(([k,v]) => '<option value="' + k + '">' + esc(v) + '</option>').join('') + '</select></label></div><div data-journal-history></div></section>';
  const area = ctx.root.querySelector('[data-journal-history]');
  const filter = ctx.root.querySelector('[data-history-filter]');
  let visibleCount = 25;
  function draw() {
    const filtered = records.filter(({store}) => !filter.value || filter.value === store);
    let previousDate = null;
    area.innerHTML = filtered.slice(0,visibleCount).map(({store,row}) => {
      const newDate = row.date !== previousDate;
      previousDate = row.date;
      let name = historyKinds[store];
      if (store === 'workbook') name = worksheetTitle(row);
      if (store === 'meds') name = row.name || name;
      let badge = row.status === 'draft' ? 'Draft' : '';
      if (store === 'meds') badge = row.active === false ? 'Discontinued' : 'Schedule';
      if (store === 'cssrs') badge = screenStatus(row);
      if (store === 'workbook') badge = row.status === 'finished' ? 'Finished' : 'Draft';
      return (newDate ? '<h3 class="jr-history-date">' + esc(fmtDate(row.date)) + '</h3>' : '') + '<button class="jr-entry" data-store="' + store + '" data-id="' + esc(row.id) + '"><span><strong>' + esc(name) + '</strong><small>Entered ' + esc(clockStamp(row.createdAt)) + ' · Edited ' + esc(clockStamp(row.updatedAt)) + '</small></span>' + (badge ? '<span class="pill">' + esc(badge) + '</span>' : '') + '<span class="jr-chevron" aria-hidden="true">›</span></button>';
    }).join('') || empty('No entries to show. Saved records and drafts will appear by activity date.');
    if (filtered.length > visibleCount) area.innerHTML += '<button class="btn secondary jr-more" data-history-more>Show more entries</button>';
  }
  filter.onchange = () => { visibleCount = 25; draw(); };
  area.onclick = e => {
    const more = e.target.closest('[data-history-more]');
    if (more) { visibleCount += 25; draw(); return; }
    const btn = e.target.closest('[data-store]');
    if (!btn) return;
    const store = btn.dataset.store;
    const row = ctx.db[store].find(r => r.id === btn.dataset.id);
    if (!row) return;
    if (store === 'workbook') openWorksheet = row;
    ctx.go(({daily:'today',cssrs:'today',weekly:'weekly',workbook:'workbook',meds:'medications'})[store],row.date);
    if (store === 'cssrs') requestAnimationFrame(() => {
      const section = ctx.root.querySelector('[data-section="cssrs"]');
      if (section) { section.open = true; section.scrollIntoView({block:'start'}); }
    });
  };
  draw();
}

function clinicalReviews(range) {
  if (!range.weekly.length) return empty('No weekly assessments recorded in this range.');
  function scale(row, key, count, max) {
    const answers = row[key] || [];
    const score = scoreAnswers(answers,count);
    const answered = answers.filter(n => Number.isInteger(n) && n >= 0 && n <= 3).length;
    const impact = row[key + 'Impact'];
    return (score === null ? 'Incomplete (' + answered + '/' + count + ' answered)' : score + ' / ' + max) + (has(impact) ? '<br><small>Impact · ' + esc(impact) + '</small>' : '');
  }
  return '<p>Each questionnaire covers the past two weeks. Weekly administrations overlap. Functional impact is reported separately from the total.</p>' + table(['Assessment date','PHQ-9','GAD-7'],range.weekly.map(r => [esc(fmtDate(r.date)),scale(r,'phq',9,27),scale(r,'gad',7,21)]),'Weekly questionnaire totals');
}

function doctorSleep(range) {
  const rows = range.days.filter(d => ['bedtime','wakeTime','awakenings','naps'].some(key => has(d.sleep?.[key]))).map(d => [
    esc(fmtDate(d.date)), esc((d.sleep.bedtime || '—').replace('T',' ')), esc((d.sleep.wakeTime || '—').replace('T',' ')), esc(d.sleep.awakenings ?? '—'), esc(d.sleep.naps || '—')
  ]);
  return rows.length ? table(['Activity date','Bedtime','Wake time','Awakenings','Naps'],rows,'Sleep details') : '';
}

function substanceLog(range) {
  const rows = range.days.flatMap(d => Object.entries(substances).flatMap(([key,label]) => {
    const s = d.substances?.[key];
    if (s?.status !== 'Used') return [];
    const amount = [s.amount,s.units].filter(has).join(' ');
    return [[esc(fmtDate(d.date)),label,esc(s.time || '—'),esc(amount || 'Unknown'),esc(s.notes || '—')]];
  }));
  return substanceOverview(range) + (rows.length ? table(['Activity date','Used','Time','Amount','Notes'],rows,'Details of recorded use') : '');
}

function functioning(range) {
  if (!range.days.length) return empty('No daily functioning entries in this range.');
  return range.days.map(day => {
    const rows = Object.entries(activities).flatMap(([key,label]) => {
      const a = day.activities?.[key];
      if (!a) return [];
      const notes = details(a,[['minutes','Minutes spent'],['breaks','Breaks'],['help','Prompts or help'],['accommodations','Accommodations'],['barrier','What got in the way']]);
      if ((!has(a.status) || a.status === 'Not logged') && !notes) return [];
      return [[esc(label),esc(a.status || 'Not logged'),notes || '—']];
    });
    return '<section class="jr-day"><h4>' + esc(fmtDate(day.date)) + (day.dayKind ? ' · ' + esc(day.dayKind) : '') + '</h4>' +
      (day.createdAt ? '<p class="muted"><small>Entered ' + esc(clockStamp(day.createdAt)) + (day.updatedAt ? ' · Last edited ' + esc(clockStamp(day.updatedAt)) : '') + '</small></p>' : '') +
      (rows.length ? table(['Activity','Completion','Time, breaks and support'],rows,'Functioning on ' + fmtDate(day.date)) : empty('No activity details recorded.')) +
      (has(day.reflection) ? '<p><b>Daily reflection</b> · ' + esc(day.reflection) + '</p>' : '') + '</section>';
  }).join('');
}

function functionChanges(range) {
  const groups = ['Better day','Mixed day','Harder day'];
  const dayLines = groups.map(label => {
    const dates = range.days.filter(d => d.dayKind === label).map(d => fmtDate(d.date)).join(', ');
    return '<li><b>' + esc(label) + 's</b> · ' + esc(dates || 'None labeled') + '</li>';
  }).join('');
  const narratives = range.weekly.filter(r => has(r.improved) || has(r.hard)).map(r => [esc(fmtDate(r.date)),esc(r.improved || '—'),esc(r.hard || '—')]);
  return '<p>Day descriptions below are self-selected. Daily examples include all logged days in the range.</p><ul>' + dayLines + '</ul>' + (narratives.length ? table(['Weekly review','What improved','What stayed hard'],narratives,'Patient-reported changes in functioning') : '');
}

function optionalRecords(range) {
  const records = [];
  for (const r of range.cssrs) {
    const parts = [
      {id:'record',label:'Completion and timeframe',value:[screenStatus(r), r.priorDate ? 'Previous completed assessment on ' + fmtDate(r.priorDate) : 'Previous assessment date not recorded'].join('. ')}
    ];
    if (r.method === 'worksheet' && r.answers) {
      for (const key of requiredCssrs(r.formKey,r.answers)) {
        const answer = r.answers[key];
        if (!['yes','no'].includes(answer)) continue;
        const label = key === 'q6recent' ? 'Item 6 follow-up · Past 3 months' : 'Item ' + key.slice(1) + ' response';
        parts.push({id:key,label,value:answer});
      }
    }
    if (r.concern === true) parts.push({id:'concern',label:'Self-reported safety concern',value:'A concern was marked.'});
    if (has(r.note)) parts.push({id:'note',label:'Personal note',value:r.note});
    records.push({key:'cssrs-' + r.id,title:'C-SSRS · ' + (r.version || 'Version unspecified'),date:r.date,parts});
  }
  for (const r of range.workbook) {
    const t = templates[r.type];
    if (!t) continue;
    const parts = t.fields.flatMap(([id,label]) => {
      const value = id === 'links' ? (r.links || []).filter(has).map((text,i) => (i+1) + '. ' + text).join('\n') : r.answers?.[id];
      return has(value) ? [{id,label,value}] : [];
    });
    if (parts.length) records.push({key:'dbt-' + r.id,title:t.title + (r.status === 'finished' ? '' : ' (draft)'),date:r.date,parts});
  }
  return records;
}

function section(title, body) { return '<section class="jr-report-section"><h3>' + esc(title) + '</h3>' + body + '</section>'; }
const titles = {doctor:'Doctor Summary',cdr:'SSDI CDR Function Summary'};

export function reportHtml(db, type, start, end, selected = new Set()) {
  const r = rangeData(db,start,end);
  if (!r || !Object.hasOwn(titles,type)) return '';
  const intro = '<header class="jr-report-head"><span>Patient-reported journal</span><h2>' + titles[type] + '</h2><p>' + esc(fmtDate(start)) + ' – ' + esc(fmtDate(end)) + '</p></header><p>Patient-reported information. This report is not a clinician’s assessment or an SSA determination. Dates refer to activities, assessments or treatment changes. Partial check-ins are included when they contain observations.</p>';
  let body;
  if (type === 'doctor') {
    const prompts = r.weekly.filter(w => has(w.improved) || has(w.hard) || has(w.discuss)).map(w => [esc(fmtDate(w.date)),details(w,[['improved','Improved'],['hard','Stayed hard'],['discuss','For discussion']])]);
    body = metrics(r) + section('Daily self-ratings and sleep',ratingTable(r.days) + doctorSleep(r) + '<p>A dash marks an unanswered field. Daily ratings use a 1–10 scale.</p>') + section('Weekly assessments',clinicalReviews(r)) +
      section('Medications and effects',medLog(r)) + section('THC and alcohol',substanceLog(r)) + section('Treatment changes',medicineTimeline(r)) +
      (prompts.length ? section('Weekly reflections',table(['Review date','Patient notes'],prompts,'Weekly reflections')) : '');
    const extra = optionalRecords(r).flatMap(row => {
      const parts = row.parts.filter(part => selected.has(row.key + '/' + part.id));
      return parts.length ? ['<h4>' + esc(fmtDate(row.date)) + ' · ' + esc(row.title) + '</h4>' + parts.map(p => '<p><b>' + esc(p.label) + '</b> · <span class="jr-preserve">' + esc(p.value) + '</span></p>').join('')] : [];
    }).join('');
    if (extra) body += section('Selected additional details',extra);
  } else {
    body = '<p><strong>' + r.days.length + ' of ' + dayCount(r.total) + ' logged</strong> · ' + dayCount(r.total - r.days.length) + ' without daily observations.</p>' + section('Functioning across the date range',functionChanges(r) + activityOverview(r)) +
      section('Dated activity examples',functioning(r)) + section('Treatment changes',medicineTimeline(r));
  }
  return '<article id="print-report" class="card jr-report">' + intro + body + '</article>';
}

export function renderReports(ctx) {
  const end = ctx.today();
  const start = shift(end,-6);
  ctx.root.innerHTML = [
    '<div class="stack jr-view"><section class="card stack jr-controls"><h2>Prepare a report</h2>',
    '<label class="field"><span>Report type</span><select data-report-type>',
    '<option value="doctor">Doctor Summary</option><option value="cdr">SSDI CDR Function Summary</option></select></label>',
    '<div class="grid-2"><label class="field">From<input required type="date" data-range-start value="' + start + '"></label>',
    '<label class="field">Through<input required type="date" data-range-end value="' + end + '"></label></div>',
    '<div data-optional></div><p class="muted" role="status" data-range-message></p>',
    '<div><button class="btn primary" type="button" data-preview>Preview report</button></div>',
    '</section><div class="stack" data-preview-area></div></div>'
  ].join('');
  const root = ctx.root;
  const startInput = root.querySelector('[data-range-start]');
  const endInput = root.querySelector('[data-range-end]');
  const type = root.querySelector('[data-report-type]');
  const optional = root.querySelector('[data-optional]');
  const preview = root.querySelector('[data-preview-area]');
  const message = root.querySelector('[data-range-message]');
  const previewBtn = root.querySelector('[data-preview]');
  function reset() {
    preview.replaceChildren();
    const range = rangeData(ctx.db,startInput.value,endInput.value);
    previewBtn.disabled = !range;
    message.textContent = range ? '' : 'Enter both dates, with From on or before Through.';
    if (!range || type.value !== 'doctor') { optional.replaceChildren(); return; }
    const choices = optionalRecords(range).map(row => {
      const options = row.parts.map(part => '<label class="jr-check"><input type="checkbox" value="' + esc(row.key + '/' + part.id) + '"><span>' + esc(part.label) + '</span></label>').join('');
      return '<fieldset class="jr-optional-group"><legend>' + esc(fmtDate(row.date)) + ' · ' + esc(row.title) + '</legend>' + options + '</fieldset>';
    }).join('');
    optional.innerHTML = disclosure('Add selected C-SSRS or DBT details', choices ? '<p class="muted">Only checked details will appear in this report.</p>' + choices : empty('No C-SSRS or workbook details recorded in this range.'));
  }
  type.onchange = reset;
  startInput.oninput = reset;
  endInput.oninput = reset;
  optional.onchange = () => preview.replaceChildren();
  previewBtn.onclick = () => {
    const selected = new Set([...optional.querySelectorAll('input:checked')].map(box => box.value));
    const html = reportHtml(ctx.db,type.value,startInput.value,endInput.value,selected);
    if (!html) { reset(); return; }
    preview.innerHTML = '<section class="card stack jr-controls"><div class="card-head"><h2 tabindex="-1" data-preview-heading>Report preview</h2><button type="button" class="btn primary" data-print>Print / Save PDF</button></div><p class="muted">Exported PDFs are not password-protected. On iPhone, open the print preview and choose Share → Save to Files → On My iPhone. On Android, choose Save as PDF in the print destination list and select a local folder.</p></section>' + html;
    preview.querySelector('[data-print]').onclick = () => window.print();
    preview.querySelector('[data-preview-heading]').focus();
  };
  reset();
}
