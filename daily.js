const ACTIVITY_NAMES = {
  shower: 'Showered', clothes: 'Changed clothes', teeth: 'Brushed my teeth',
  school: 'Did schoolwork', work: 'Did paid work'
};
const ACTIVITY_OPTIONS = ['Not logged', 'Done', 'Partly done', 'Not done', 'Not applicable'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SUBSTANCE_NAMES = { thc: 'THC', alcohol: 'Alcohol' };
const clone = value => structuredClone(value);
const uid = () => crypto.randomUUID();
const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

function planVersionsOn(date, versions) {
  const plans = new Map();
  const candidates = versions.filter(v => v.date <= date).sort(compareVersions);
  candidates.forEach(v => plans.set(v.medId, v));
  return [...plans.values()];
}

function compareVersions(a, b) {
  return a.date.localeCompare(b.date) || (a.sequence ?? 0) - (b.sequence ?? 0) ||
    (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id);
}

export function getScheduledOn(date, versions) {
  const weekday = new Date(date + 'T12:00:00').getDay();
  return planVersionsOn(date, versions)
    .filter(v => v.active && (!v.weekdays || v.weekdays.includes(weekday)))
    .sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name));
}

function snapshot(version) {
  return {
    id: version.id, medId: version.medId, name: version.name, dose: version.dose,
    time: version.time, status: 'Not logged', effect: '', sideEffects: ''
  };
}

export function timeInBedMinutes(bedtime, wakeTime) {
  if (!bedtime || !wakeTime) return null;
  const minutes = (new Date(wakeTime) - new Date(bedtime)) / 60000;
  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null;
}

function duration(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return [hours && hours + ' hr', (remainder || !hours) && remainder + ' min'].filter(Boolean).join(' ');
}

function openDay(date, versions, existing) {
  const record = existing ? clone(existing) : {};
  const day = {
    ...record, id: date, date, status: record.status || 'draft',
    anxiety: record.anxiety ?? null, depression: record.depression ?? null,
    reflection: record.reflection || '', treatment: record.treatment || '', dayKind: record.dayKind || '',
    sleep: { bedtime: '', wakeTime: '', estimatedMinutes: null, awakenings: null, naps: '', quality: '', ...record.sleep },
    scheduled: record.scheduled ?? getScheduledOn(date, versions).map(snapshot), prns: record.prns || [],
    substances: {}, activities: {}
  };
  Object.keys(ACTIVITY_NAMES).forEach(key => {
    day.activities[key] = {
      status: 'Not logged', minutes: null, breaks: '', help: '', accommodations: '', barrier: '',
      ...record.activities?.[key]
    };
  });
  Object.keys(SUBSTANCE_NAMES).forEach(key => {
    day.substances[key] = {status: 'Not logged', time: '', amount: '', units: '', notes: '', ...record.substances?.[key]};
  });
  return day;
}

function field(label, path, value, type = 'text', extra = '') {
  const name = 'data-path="' + safe(path) + '"';
  const control = type === 'textarea'
    ? `<textarea ${name} rows="3">${safe(value)}</textarea>`
    : `<input ${name} type="${type}" value="${safe(value)}" ${extra}>`;
  return `<label class="field"><span>${safe(label)}</span>${control}</label>`;
}

function select(label, path, current, values, placeholder = '') {
  const choices = placeholder ? ['', ...values] : values;
  return `<label class="field"><span>${safe(label)}</span><select data-path="${safe(path)}">${choices.map(v =>
    `<option value="${safe(v)}"${v === current ? ' selected' : ''}>${safe(v || placeholder)}</option>`
  ).join('')}</select></label>`;
}

function scoreControl(key, label, value) {
  const buttons = Array.from({length: 10}, (_, i) => {
    const score = i + 1;
    return `<button type="button" class="score-choice" data-scale="${key}" data-score="${score}"
      aria-label="${label} ${score} out of 10" aria-pressed="${score === value}">${score}</button>`;
  }).join('');
  return `<fieldset class="daily-scale"><legend>${label}</legend>
    <div class="score-choices">${buttons}</div>
    <div class="scale-captions"><span>1 · Minimal</span><span>10 · Most intense</span></div></fieldset>`;
}

function section(ctx, icon, heading, subheading, content, key) {
  return `<details class="daily-section" data-section="${key}"><summary>
    <span class="daily-section-icon" aria-hidden="true">${ctx.icon(icon, 21)}</span>
    <span class="daily-section-heading"><strong>${heading}</strong><small>${subheading}</small></span>
    <span class="daily-chevron" aria-hidden="true"></span></summary><div class="daily-section-content">${content}</div></details>`;
}

function bedSummary(sleep) {
  if (!sleep.bedtime || !sleep.wakeTime) return '';
  const minutes = timeInBedMinutes(sleep.bedtime, sleep.wakeTime);
  if (minutes === null) return '<p class="daily-warning">The wake date and time must follow bedtime to calculate time in bed.</p>';
  return `<div class="bed-calculation"><span>Time in bed · <strong>${duration(minutes)}</strong></span>
    ${minutes <= 1440 ? '<button type="button" class="daily-link" data-use-estimate>Use as my estimate</button>' : ''}
    </div>`;
}

function sleepFields(sleep) {
  return `<p class="muted">Use the dates you went to bed and woke up, including when sleep crossed midnight.</p>
    <div class="grid-2">${field('Bedtime', 'sleep.bedtime', sleep.bedtime, 'datetime-local')}
    ${field('Woke up', 'sleep.wakeTime', sleep.wakeTime, 'datetime-local')}</div>
    <div data-bed-summary>${bedSummary(sleep)}</div><div class="grid-2">
    ${field('Estimated time asleep (minutes)', 'sleep.estimatedMinutes', sleep.estimatedMinutes, 'number', 'min="0" max="1440" step="1" inputmode="numeric"')}
    ${field('Number of awakenings', 'sleep.awakenings', sleep.awakenings, 'number', 'min="0" step="1" inputmode="numeric"')}
    ${field('Naps (times or duration)', 'sleep.naps', sleep.naps)}
    ${select('Sleep quality', 'sleep.quality', sleep.quality, ['Very poor','Poor','Fair','Good','Very good'], 'Not logged')}</div>`;
}

function activityFields(day) {
  return `<div class="activity-list">${Object.entries(ACTIVITY_NAMES).map(([key, label]) => {
    const a = day.activities[key], path = 'activities.' + key + '.';
    return `<div class="activity-item">${select(label, path + 'status', a.status, ACTIVITY_OPTIONS)}
      <details class="daily-subdetails"><summary>Time, breaks &amp; support</summary><div class="grid-2">
      ${field('Minutes spent', path + 'minutes', a.minutes, 'number', 'min="0" max="1440" step="1" inputmode="numeric"')}
      ${field('Breaks (number or length)', path + 'breaks', a.breaks)}
      ${field('Prompts or help', path + 'help', a.help)}
      ${field('Accommodations', path + 'accommodations', a.accommodations)}
      ${field('What got in the way?', path + 'barrier', a.barrier)}</div></details></div>`;
  }).join('')}</div>`;
}

function scheduledRows(day) {
  return day.scheduled.length ? day.scheduled.map((med,i) =>
    `<div class="dose-row"><div class="dose-line"><div><strong>${safe(med.name)}</strong><small>${safe([med.dose, med.time].filter(Boolean).join(' · '))}</small></div>
    ${select('Dose status', 'scheduled.' + i + '.status', med.status, ['Not logged', 'Taken', 'Skipped'])}</div>
    <details class="daily-subdetails"><summary>Effects &amp; side effects</summary><div class="grid-2">
    ${field('Effect', 'scheduled.' + i + '.effect', med.effect)}${field('Side effects', 'scheduled.' + i + '.sideEffects', med.sideEffects)}</div></details></div>`
  ).join('') : '<p class="muted">No scheduled doses in this check-in.</p>';
}

function prnRows(rows) {
  return rows.map((med,i) => {
    const path = 'prns.' + i + '.';
    return `<fieldset class="prn-row"><legend>As-needed use ${i + 1}</legend><div class="grid-2">
      ${field('Medicine', path + 'name', med.name)}${field('Dose as taken', path + 'dose', med.dose)}
      ${field('Time', path + 'time', med.time, 'time')}${field('Reason', path + 'reason', med.reason)}
      ${field('Effect', path + 'effect', med.effect)}${field('Side effects', path + 'sideEffects', med.sideEffects)}
      </div><button type="button" class="daily-link" data-remove-prn="${i}">Remove this use</button></fieldset>`;
  }).join('');
}

function hasPrnData(row) {
  return ['name','dose','time','reason','effect','sideEffects'].some(key => String(row[key] || '').trim());
}

// Status changes hide the old fields, while the saved record contains details only for documented use.
function cleanDay(day) {
  const record = clone(day);
  record.prns = record.prns.filter(hasPrnData);
  Object.values(record.substances).forEach(row => {
    if (row.status !== 'Used') Object.assign(row, {time: '', amount: '', units: '', notes: ''});
  });
  return record;
}

function substanceFields(day) {
  return Object.entries(SUBSTANCE_NAMES).map(([key, label]) => {
    const row = day.substances[key], path = 'substances.' + key + '.';
    return `<div class="substance-row">${select(label, path + 'status', row.status, ['Not logged','None','Used'])}
      <div class="grid-2" data-substance="${key}" ${row.status !== 'Used' ? 'hidden' : ''}>
      ${field('Time', path + 'time', row.time, 'time')}${field('Amount (if known)', path + 'amount', row.amount)}
      ${field('Units (if known)', path + 'units', row.units)}${field('Notes', path + 'notes', row.notes)}</div></div>`;
  }).join('');
}

function missingDoses(day, versions) {
  const recordedVersions = new Set(day.scheduled.map(row => row.id));
  const recordedSlots = new Set(day.scheduled.map(row => row.medId));
  return getScheduledOn(day.date, versions).filter(v => !recordedSlots.has(v.medId) && !recordedVersions.has(v.id));
}

export function renderToday(ctx) {
  const existing = ctx.db.daily.find(v => v.date === ctx.date);
  const day = openDay(ctx.date, ctx.db.meds, existing);
  const todayEditor = document.createElement('div');
  todayEditor.className = 'daily-editor';
  const medicationBody = `<div class="daily-subhead"><h3>Scheduled doses</h3><button type="button" class="daily-link" data-manage>Manage schedule</button></div>
    <div data-scheduled>${scheduledRows(day)}</div>
    <button type="button" class="btn secondary" data-add-doses ${missingDoses(day,ctx.db.meds).length ? '' : 'hidden'}>Add newly scheduled doses</button>
    <h3>As-needed use (PRN)</h3><div data-prns>${prnRows(day.prns)}</div>
    <button type="button" class="btn secondary" data-add-prn>+ Log as-needed use</button>`;
  const reflectionBody = `${select('How would you describe this day?', 'dayKind', day.dayKind, ['Better day','Mixed day','Harder day'], 'Not logged')}
    ${field('What did I try today, what got in the way, and what help or breaks did I need?', 'reflection', day.reflection, 'textarea')}
    ${field('Changes in treatment or support', 'treatment', day.treatment, 'textarea')}`;
  todayEditor.innerHTML = `<section class="card daily-ratings"><div class="card-head"><div><h2>Symptom check-in</h2>
    <p class="muted">How intense did each feel on this day?</p></div>
    <span class="rating-glyph" aria-hidden="true">${ctx.icon('activity', 23)}</span></div>
    ${scoreControl('anxiety','Anxiety',day.anxiety)}${scoreControl('depression','Depression',day.depression)}</section>
    <div class="daily-sections-heading"><h2>Daily details</h2><span class="muted">All optional</span></div>
    <div class="daily-sections">
    ${section(ctx, 'moon', 'Sleep', 'Rest, awakenings and naps', sleepFields(day.sleep), 'sleep')}
    ${section(ctx, 'list', 'Daily activities', 'Hygiene, schoolwork and paid work', activityFields(day), 'activities')}
    ${section(ctx, 'pill', 'Medication log', 'Scheduled doses and as-needed use', medicationBody, 'medication')}
    ${section(ctx, 'leaf', 'THC &amp; alcohol', 'Record each separately', substanceFields(day), 'substances')}
    ${section(ctx, 'pen', 'Notes &amp; reflection', 'Functioning, support and treatment changes', reflectionBody, 'reflection')}
    ${section(ctx, 'heart', 'C-SSRS safety screen', 'Assessment record and safety plan', '<div data-cssrs-host></div>', 'cssrs')}</div>
    <div class="daily-save"><div><strong>Save your check-in</strong>
      <small data-save-status aria-live="polite">${existing ? (existing.status === 'saved' ? 'Check-in saved on this device.' : 'Draft saved on this device.') : 'You can leave any fields blank and come back.'}</small></div>
      <button type="button" class="btn primary" data-save-day>Save check-in</button></div>`;
  ctx.root.replaceChildren(todayEditor);
  ctx.renderCssrs(todayEditor.querySelector('[data-cssrs-host]'), ctx.date);
  if (todayEditor.querySelector('[data-css-support]:not([hidden])')) {
    todayEditor.querySelector('[data-section="cssrs"]').open = true;
  }
  let revision = 0;
  async function persist(explicit = false) {
    const current = ++revision;
    const indicator = todayEditor.querySelector('[data-save-status]');
    indicator.textContent = 'Saving on this device…';
    try {
      const saved = await ctx.put('daily', cleanDay(day));
      if (current !== revision) return;
      day.createdAt = saved.createdAt;
      indicator.textContent = day.status === 'saved' ? 'Check-in saved on this device.' : 'Draft saved on this device.';
      if (explicit) ctx.toast('Check-in saved. You can return to it anytime.');
    } catch {
      if (current === revision) indicator.textContent = 'Could not save on this device. Keep this page open and try saving again.';
    }
  }
  todayEditor.addEventListener('input', event => {
    const el = event.target, path = el.dataset.path;
    if (!path || el.closest('[data-cssrs-host]')) return;
    if (!el.validity.valid) {
      el.setAttribute('aria-invalid','true');
      el.reportValidity();
      return;
    }
    el.removeAttribute('aria-invalid');
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((item, key) => item[key], day);
    target[lastKey] = el.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value;
    if (path === 'sleep.bedtime' || path === 'sleep.wakeTime') {
      todayEditor.querySelector('[data-bed-summary]').innerHTML = bedSummary(day.sleep);
    }
    if (keys[0] === 'substances' && lastKey === 'status') {
      todayEditor.querySelector('[data-substance="' + keys[1] + '"]').hidden = el.value !== 'Used';
    }
    persist();
  });
  todayEditor.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.closest('[data-cssrs-host]')) return;
    if (button.dataset.scale) {
      const key = button.dataset.scale, score = Number(button.dataset.score);
      day[key] = day[key] === score ? null : score;
      todayEditor.querySelectorAll('[data-scale="' + key + '"]').forEach(b =>
        b.setAttribute('aria-pressed', Number(b.dataset.score) === day[key]));
      persist();
    } else if (button.hasAttribute('data-use-estimate')) {
      day.sleep.estimatedMinutes = timeInBedMinutes(day.sleep.bedtime,day.sleep.wakeTime);
      todayEditor.querySelector('[data-path="sleep.estimatedMinutes"]').value = day.sleep.estimatedMinutes;
      persist();
    } else if (button.hasAttribute('data-manage')) {
      ctx.go('medications',ctx.date);
    } else if (button.hasAttribute('data-add-doses')) {
      day.scheduled.push(...missingDoses(day,ctx.db.meds).map(snapshot));
      todayEditor.querySelector('[data-scheduled]').innerHTML = scheduledRows(day);
      button.hidden = true;
      persist();
    } else if (button.hasAttribute('data-add-prn')) {
      day.prns.push({id: uid(), name: '', dose: '', time: '', reason: '', effect: '', sideEffects: ''});
      todayEditor.querySelector('[data-prns]').innerHTML = prnRows(day.prns);
      todayEditor.querySelector('[data-path="prns.' + (day.prns.length-1) + '.name"]').focus();
    } else if (button.hasAttribute('data-remove-prn')) {
      const index = Number(button.dataset.removePrn);
      if (hasPrnData(day.prns[index]) && !confirm('Remove this as-needed use from this check-in?')) return;
      day.prns.splice(index,1);
      todayEditor.querySelector('[data-prns]').innerHTML = prnRows(day.prns);
      todayEditor.querySelector('[data-add-prn]').focus();
      persist();
    } else if (button.hasAttribute('data-save-day')) {
      const invalid = [...todayEditor.querySelectorAll('[data-path]')].find(el => !el.validity.valid);
      if (invalid) {
        for (let parent = invalid.parentElement; parent && parent !== todayEditor; parent = parent.parentElement) {
          if (parent.tagName === 'DETAILS') parent.open = true;
        }
        invalid.reportValidity();
        return;
      }
      day.status = 'saved';
      persist(true);
    }
  });
}

function frequency(weekdays) {
  if (!weekdays || weekdays.length === 7) return 'Every day';
  return weekdays.map(i => WEEKDAYS[i]).join(', ');
}

function dateLabel(date) {
  return new Date(date + 'T12:00:00').toLocaleDateString(undefined, {year: 'numeric', month: 'short', day: 'numeric'});
}

function scheduleForm(previous, date) {
  const weekdays = previous?.weekdays || [0,1,2,3,4,5,6];
  return `<form class="med-form stack" autocomplete="off">
    <h3>${previous ? 'Record a schedule change' : 'New scheduled medicine'}</h3>
    <div class="grid-2"><label class="field"><span>Effective date</span><input name="date" type="date" value="${safe(date)}" required></label>
      ${previous ? `<label class="field"><span>Schedule status</span><select name="active"><option value="yes" ${previous.active ? 'selected' : ''}>Active</option><option value="no" ${previous.active ? '' : 'selected'}>Stopped</option></select></label>` : ''}
      <label class="field"><span>Medicine name</span><input name="name" value="${safe(previous?.name)}" required></label>
      <label class="field"><span>Scheduled dose as written</span><input name="dose" value="${safe(previous?.dose)}"></label>
      <label class="field"><span>Scheduled time</span><input name="time" type="time" value="${safe(previous?.time)}"></label>
    </div><fieldset class="med-weekdays"><legend>Scheduled days</legend>
      <div>${WEEKDAYS.map((day,i) => `<label><input type="checkbox" name="weekday" value="${i}" ${weekdays.includes(i) ? 'checked' : ''}> ${day}</label>`).join('')}</div></fieldset>
    <label class="field"><span>Change notes (optional)</span><textarea name="note" rows="2"></textarea></label>
    <p class="med-form-error" aria-live="polite"></p><div class="row"><button type="submit" class="btn primary">Save schedule</button>
      <button type="button" class="btn secondary" data-cancel-med>Cancel</button></div></form>`;
}

function reminderSetup(ctx) {
  return section(ctx, 'clock', 'Set up phone reminders', 'Generic alerts for scheduled doses and a daily check-in',
    `<ol class="reminder-steps">
      <li>In the iPhone Reminders app, create a reminder with a private title such as “Scheduled routine.”</li>
      <li>Open its details, turn on Date and Time, and set the schedule you already use. Choose Repeat and the matching frequency, then save. Add a separate reminder for another scheduled time if needed.</li>
      <li>Create a separate reminder named “Daily check-in.” Set the time you prefer and choose a daily repeat.</li></ol>
      <p>On Android, open Clock and choose Alarm. Set a time and repeat days for “Scheduled routine.” Add a separate “Daily check-in” alarm at your preferred time.</p>
      <p class="muted">Your phone delivers these alerts. Enter each dose status yourself in Today. As-needed use is recorded only when you log it.</p>
      <a href="https://support.apple.com/guide/iphone/iphec7a1de82/ios" target="_blank" rel="noopener noreferrer" class="daily-link">Apple’s Reminders guide ↗</a>`, 'reminders');
}

export function renderMedications(ctx) {
  const view = document.createElement('div');
  view.className = 'medications-view stack';
  const plans = planVersionsOn(ctx.date,ctx.db.meds).filter(v => v.active).sort((a,b) => a.name.localeCompare(b.name));
  const history = [...ctx.db.meds].sort((a,b) => compareVersions(b,a));
  const medLine = v => safe([v.dose, v.time, frequency(v.weekdays)].filter(Boolean).join(' · '));
  const rows = plans.map(v => `<div class="med-plan"><span class="daily-section-icon">${ctx.icon('pill',21)}</span><div>
      <strong>${safe(v.name)}</strong><small>${medLine(v)}</small></div>
      <button class="btn secondary" type="button" data-edit-plan="${safe(v.id)}">Record change</button></div>`).join('');
  const historyRows = history.map(v => `<li><div class="med-history-date">${safe(dateLabel(v.date))}</div>
    <div><strong>${safe(v.name)}</strong> · ${v.active ? 'Active' : 'Stopped'}<small>${medLine(v)}</small>
    ${v.note ? `<p>${safe(v.note)}</p>` : ''}</div>
    <button class="daily-link" type="button" data-edit-plan="${safe(v.id)}" aria-label="Create a change from ${safe(v.name)} on ${safe(dateLabel(v.date))}">Use for change</button></li>`).join('');
  view.innerHTML = `<section class="card med-schedule"><div class="card-head"><div><h2>Scheduled medicines</h2>
    <p class="muted">Schedule for ${safe(dateLabel(ctx.date))}. Record each dose time separately.</p></div>
    <button class="btn primary" type="button" data-new-med>Add medicine</button></div>
    ${rows || '<p class="med-empty">No medicines scheduled for this date.</p>'}
    <div data-med-form></div></section>
    <section class="card"><h2>Schedule history</h2><p class="muted">Each change has its own effective date. Past check-ins keep their recorded doses.</p>
      ${historyRows ? `<ol class="med-history">${historyRows}</ol>` : '<p class="med-empty">Your dated changes will appear here.</p>'}</section>
    <div class="daily-sections">${reminderSetup(ctx)}</div>`;
  ctx.root.replaceChildren(view);
  const formHost = view.querySelector('[data-med-form]');
  function edit(previous) {
    const initialDate = previous && previous.date > ctx.date ? previous.date : ctx.date;
    formHost.innerHTML = scheduleForm(previous,initialDate);
    const form = formHost.querySelector('form');
    form.querySelector('[name="name"]').focus();
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(form);
      const name = String(data.get('name') || '').trim();
      const active = data.get('active') !== 'no';
      const weekdays = data.getAll('weekday').map(Number);
      const error = form.querySelector('.med-form-error');
      if (!name || (active && !weekdays.length)) {
        error.textContent = name ? 'Choose at least one scheduled day.' : 'Enter a medicine name.';
        return;
      }
      const medId = previous?.medId || uid();
      const sequence = Math.max(0,...ctx.db.meds.filter(v => v.medId === medId).map(v => v.sequence || 0)) + 1;
      const entry = {
        id: uid(), medId, sequence, date: String(data.get('date')), name,
        active, weekdays, time: String(data.get('time')), dose: String(data.get('dose')).trim(),
        note: String(data.get('note')).trim()
      };
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        await ctx.put('meds',entry);
        if (!view.isConnected) return;
        renderMedications(ctx);
        ctx.toast('Schedule change saved on this device.');
      } catch {
        error.textContent = 'Schedule could not be saved. Keep this form open and try again.';
        submit.disabled = false;
      }
    });
  }
  view.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-new-med')) edit(null);
    else if (button.hasAttribute('data-edit-plan')) edit(ctx.db.meds.find(v => v.id === button.dataset.editPlan));
    else if (button.hasAttribute('data-cancel-med')) {
      formHost.replaceChildren();
      view.querySelector('[data-new-med]').focus();
    }
  });
}
