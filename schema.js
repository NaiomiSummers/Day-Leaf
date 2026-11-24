// Schema 1 is the journal payload shared by the original app and the vault.
export const stores = ['daily','meds','weekly','cssrs','workbook','settings'];
export const emptyRecords = () => Object.fromEntries(stores.map(name => [name, []]));

const text = value => typeof value === 'string';
const nonempty = value => text(value) && value.length > 0;
const bool = value => typeof value === 'boolean';
const member = (...values) => value => values.includes(value);
const integer = (min, max = Number.MAX_SAFE_INTEGER) =>
  value => Number.isSafeInteger(value) && value >= min && value <= max;
const nullable = check => value => value === null || check(value);
const list = check => value => Array.isArray(value) && Array.from(value).every(check);
const timestamp = value => text(value) && Number.isFinite(Date.parse(value));
const plain = value => value !== null && typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
function date(value) {
  if (!text(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const t = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0,10) === value;
}
const optionalDate = value => value === '' || date(value);
function object(fields, required = []) {
  return value => plain(value) && required.every(k => Object.hasOwn(value,k)) &&
    Object.keys(value).every(k => Object.hasOwn(fields,k) && fields[k](value[k]));
}
const activity = object({
  status:member('Not logged','Done','Partly done','Not done','Not applicable'),
  minutes:nullable(integer(0,1440)), breaks:text, help:text, accommodations:text, barrier:text
});
const substance = object({
  status:member('Not logged','None','Used'), time:text, amount:text, units:text, notes:text
});
const fieldsByName = (names, check) => Object.fromEntries(names.map(key => [key, check]));
const dated = {id:nonempty, date, createdAt:timestamp, updatedAt:timestamp};
const datedRequired = ['id','date','createdAt','updatedAt'];
const answers = length => value => Array.isArray(value) && value.length === length &&
  Array.from(value).every(nullable(integer(0,3)));
const workbookAnswers = value => plain(value) && Object.entries(value).every(([k,v]) =>
  !['__proto__','constructor','prototype'].includes(k) && text(v));
const shapes = {
  daily: object({
    ...dated, status:member('draft','saved'), anxiety:nullable(integer(1,10)), depression:nullable(integer(1,10)),
    reflection:text, treatment:text, dayKind:member('','Better day','Mixed day','Harder day'),
    sleep:object({bedtime:text,wakeTime:text,estimatedMinutes:nullable(integer(0,1440)),awakenings:nullable(integer(0)),naps:text,quality:text}),
    activities:object(fieldsByName(['shower','clothes','teeth','school','work'],activity)),
    substances:object({thc:substance,alcohol:substance}),
    scheduled:list(object({id:nonempty,medId:nonempty,name:text,dose:text,time:text,status:member('Not logged','Taken','Skipped'),effect:text,sideEffects:text})),
    prns:list(object({id:nonempty,name:text,dose:text,time:text,reason:text,effect:text,sideEffects:text}))
  }, datedRequired),
  meds: object({
    ...dated, medId:nonempty, sequence:integer(0), name:nonempty, active:bool, weekdays:list(integer(0,6)),
    time:text, dose:text, note:text
  }, [...datedRequired,'medId','active','name','time']),
  weekly: object({
    ...dated, phq:answers(9), gad:answers(7), phqImpact:text, gadImpact:text, improved:text, hard:text,
    treatment:text, discuss:text
  }, datedRequired),
  cssrs: object({
    ...dated, method:member('worksheet','manual'), status:nullable(member('incomplete','completed')),
    formKey:member('recent','followup'), version:text, source:text, priorDate:optionalDate, priorTime:text,
    answers:object(fieldsByName(['q1','q2','q3','q4','q5','q6','q6recent'],member('yes','no'))),
    concern:nullable(bool), note:text, time:text
  }, datedRequired),
  workbook: object({
    ...dated, type:member('chain','dear','diary','facts','opposite','pros'), status:member('draft','finished'),
    dailyDate:optionalDate, answers:workbookAnswers, links:list(text)
  }, [...datedRequired,'type']),
  settings: object({
    id:member('safety'), createdAt:timestamp, updatedAt:timestamp, steps:text, contacts:list(object({name:text,phone:text}))
  }, ['id','createdAt','updatedAt'])
};

export function validateRecord(store,row) {
  if (!Object.hasOwn(shapes,store) || !shapes[store](row) ||
      (['daily','weekly','cssrs'].includes(store) && row.id !== row.date)) {
    throw Error('Invalid journal record. Check the backup format.');
  }
  return row;
}
export function validateSnapshot(data) {
  if (!plain(data) || data.app !== 'Dayleaf' || data.schema !== 1 ||
      !timestamp(data.exportedAt) || !plain(data.records) ||
      Object.keys(data.records).length !== stores.length) {
    throw Error('This file does not contain a supported Dayleaf journal.');
  }
  for (const name of stores) {
    if (!Object.hasOwn(data.records,name) || !Array.isArray(data.records[name])) throw Error('A journal collection is missing.');
    const ids = new Set();
    for (const row of data.records[name]) {
      validateRecord(name,row);
      if (ids.has(row.id)) throw Error('The backup contains duplicate records.');
      ids.add(row.id);
    }
  }
  return data;
}

