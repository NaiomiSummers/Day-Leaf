import {db,put,openStore,vaultExists,createVault,unlockVault,lockVault,isUnlocked} from './store.js';
import {drawGate} from './vault-screen.js';
import {startOffline} from './offline.js';
import {icon,mark} from './icons.js';
import {renderToday,renderMedications} from './daily.js';
import {renderWeekly,renderCssrs,scoreAnswers} from './assess.js';
import {renderHistory,renderReports,renderWorkbook,summary,rangeData,clearWorksheetSession} from './review.js';
import {renderSettings,showSafety} from './settings.js';

const $ = selector=>document.querySelector(selector);
const pages={
  today:['Today','sun',renderToday],
  weekly:['Weekly Review','calendar',renderWeekly,'Review your past seven days and complete the two-week questionnaires.'],
  medications:['Medications','pill',renderMedications,'Manage your scheduled doses and dated treatment changes.'],
  history:['History','history',renderHistory,'Revisit your dated entries and continue a draft.'],
  workbook:['DBT Workbook','book',renderWorkbook,'Practice a skill in a private, dated worksheet.'],
  reports:['Reports','chart',renderReports,'Choose a date range and preview what you want to share.'],
  settings:['Settings','settings',renderSettings,'Manage your safety plan, local storage and encrypted backups.']
};
export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const localISO=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const today=()=>localISO(new Date());
const dateBefore=(value,days)=>{const d=new Date(value+'T12:00:00');d.setDate(d.getDate()-days);return localISO(d);};
const pretty=value=>new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(new Date(value+'T12:00:00'));
let screen='today',activeDate=today(),lastScrollFocus=null,offlineStatus='Preparing offline copy',ready=false,toastTimer,opened=false;
const idleLimit = 5 * 60 * 1000;
const visitedDates = new Map();
let viewLifetime = new AbortController();
let generation = 0, idleTimer, lastActivity = 0, nativeActionUntil = 0;
let exists = false, initialized = false, authenticating = false;
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value) && localISO(new Date(value+'T12:00:00'))===value;
function routeFromUrl(){
  const [page,raw]=location.hash.slice(1).split('/');
  screen=Object.hasOwn(pages,page)?page:'today';
  activeDate=visitedDates.get(history.state?.dayleafVisit) || today();
  // Keep activity dates in this window's memory, outside browser history.
  if(raw)history.replaceState(null,'','#'+screen);
}
function go(page,date){
  if(!opened || !Object.hasOwn(pages,page))return;
  closeDialog();
  screen=page;activeDate=validDate(date)?date:today();
  const hash='#'+page;
  if(location.hash!==hash || visitedDates.get(history.state?.dayleafVisit)!==activeDate){
    const dayleafVisit=crypto.randomUUID();
    visitedDates.set(dayleafVisit,activeDate);
    history.pushState({dayleafVisit},'',hash);
  }
  render();
  window.scrollTo(0,0);
}
function toast(message){
  if(!opened)return;
  $('#toast').textContent=message;clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{$('#toast').textContent='';},3800);
}
function openDialog(title,body){
  if(!opened)throw Error('Unlock your vault to continue.');
  const d=$('#dialog');
  if(!d.open)lastScrollFocus=document.activeElement;
  $('#dialog-body').innerHTML='<div class="dialog-header"><h2 id="dialog-title">'+esc(title)+'</h2><button class="icon-btn" data-close aria-label="Close dialog">'+icon('close',18)+'</button></div>'+body;
  d.setAttribute('aria-labelledby','dialog-title');if(!d.open)d.showModal();
  return $('#dialog-body');
}
function closeDialog(){if($('#dialog').open)$('#dialog').close();}
$('#dialog').addEventListener('close',()=>{
  if($('#dialog').open)return;
  $('#dialog-body').replaceChildren();
  if(opened)lastScrollFocus?.focus?.({preventScroll:true});
  lastScrollFocus=null;
});
function context(){
  const signal=viewLifetime.signal;
  const live=handler=>(...args)=>{if(opened && !signal.aborted)return handler(...args);};
  return {
  root:$('#content'),db,date:activeDate,today,signal,lockNow,go:live(go),esc,icon,refresh:live(render),toast:live(toast),openDialog:live(openDialog),closeDialog:live(closeDialog),
  put:(...args)=>opened && !signal.aborted ? put(...args) : Promise.reject(Error('Unlock the current journal to save.')),
  setDate:date=>go(screen,date),safety:()=>showSafety(context()),summary:(start,end)=>summary(context(),start,end),
  renderCssrs:(host,date)=>renderCssrs(context(),host,date),offlineStatus:()=>offlineStatus
  };
}
function navLink(key){
  const [label,symbol]=pages[key];return '<button class="nav-link '+(screen===key?'active':'')+'" data-go="'+key+'" '+(screen===key?'aria-current="page"':'')+'>'+icon(symbol)+'<span>'+label+'</span></button>';
}
function nav(){
  $('#rail').innerHTML='<div class="brand">'+mark+'<div><strong>Dayleaf</strong><small>Personal journal</small></div></div><nav aria-label="Main"><div class="nav-group">My journal</div><div class="nav-list">'+['today','weekly','medications','history'].map(navLink).join('')+'</div><div class="nav-group">Tools</div><div class="nav-list">'+['workbook','reports'].map(navLink).join('')+'</div></nav><div class="rail-bottom">'+navLink('settings')+'<div class="offline-box"><span class="status-dot" data-status-dot></span><span data-offline-status></span></div></div>';
  $('#breadcrumb').innerHTML='<span class="crumb">'+icon('book',16)+' My journal <span class="divider">/</span><strong>'+pages[screen][0]+'</strong></span><span class="mobile-brand">'+mark+'Dayleaf</span>';
  $('#top [data-safety]').innerHTML=icon('heart',16)+'Safety plan';
  $('#top [data-lock-now]').innerHTML=icon('lock',16)+'<span>Lock now</span>';
  $('#mobile-nav').innerHTML=[['today','Today','sun'],['weekly','Weekly','calendar'],['history','History','history'],['more','More','menu']].map(([k,l,i])=>{
    const active=k==='more'?!['today','weekly','history'].includes(screen):screen===k;
    return '<button class="mobile-tab '+(active?'active':'')+'" '+(k==='more'?'data-more aria-haspopup="dialog"':'data-go="'+k+'"')+(active?' aria-current="page"':'')+'>'+icon(i,20)+l+'</button>';}).join('');
  updateStatus();
}
function dateButton(){
  return '<button class="hero-date" data-date aria-label="Change activity date, '+esc(pretty(activeDate))+'">'+icon('calendar',16)+esc(pretty(activeDate))+icon('chevron',12)+'</button>';
}
function tiles(){
  const area=$('#metrics');
  if(!opened || screen!=='today'){area.innerHTML='';return;}
  const current=db.daily.find(d=>d.date===activeDate);
  const seven=rangeData(db,dateBefore(activeDate,6),activeDate);
  const lastReview=[...seven.weekly].sort((a,b)=>b.date.localeCompare(a.date))[0];
  const completed=lastReview && scoreAnswers(lastReview.phq,9)!==null && scoreAnswers(lastReview.gad,7)!==null;
  const values=[
    ['clipboard','', 'Daily entry',current?(current.status==='saved'?'Saved':'Draft saved'):'Not started',''],
    ['bars','ochre','Days logged',seven.days.length+' of 7 days','history'],
    ['book','mauve','Weekly review',lastReview?(completed?'View review':'Continue review'):'Start review','weekly']
  ];
  area.innerHTML=values.map(([i,color,label,value,target])=>{
    const tag=target?'button':'div';return '<'+tag+' class="metric '+(target?'button':'')+'" '+(target?'data-tile="'+target+'"':'')+'><span class="tile-icon '+color+'">'+icon(i,22)+'</span><span><span class="label">'+label+'</span><b>'+value+'</b></span>'+(target?icon('chevron',13):'')+'</'+tag+'>';
  }).join('');
  const review=area.querySelector('[data-tile="weekly"]');review.onclick=()=>go('weekly',lastReview?.date || activeDate);
  area.querySelector('[data-tile="history"]').onclick=()=>go('history',activeDate);
}
function render(){
  if(!opened)return;
  viewLifetime.abort();
  viewLifetime=new AbortController();
  nav();
  $('#page-head').innerHTML= screen==='today'?
    '<div class="hero">'+dateButton()+'<h1>'+(activeDate===today()?'Today’s check-in':'Daily check-in')+'</h1><p>Log what you can. Your draft saves as you go.</p></div>':
    '<div class="screen-heading">'+(screen==='weekly'?dateButton():'')+'<h1>'+pages[screen][0]+'</h1><p>'+pages[screen][3]+'</p></div>';
  tiles();
  $('#content').replaceChildren();
  pages[screen][2](context());
  updateStatus();
  $('#foot').innerHTML=icon('lock',13)+'Stored on this device';
  document.title=pages[screen][0]+' · Dayleaf';
}
function showError(e){
  if(!opened)return;
  if(!isUnlocked()){void lockNow();return;}
  const area=$('#failure');area.hidden=false;area.textContent=e?.message||'The journal could not save. Keep this window open and check available storage.';
}
document.addEventListener('click',event=>{
  if(!opened)return;
  const el=event.target.closest('button,a');
  if(!el)return;
  if(el.classList.contains('skip')){
    event.preventDefault();
    $('#content').focus();
    return;
  }
  if(el.hasAttribute('data-lock-now')){void lockNow();return;}
  if(el.hasAttribute('data-go'))go(el.dataset.go);
  else if(el.hasAttribute('data-close'))closeDialog();
  else if(el.hasAttribute('data-safety'))showSafety(context());
  else if(el.hasAttribute('data-more'))openDialog('My journal','<nav class="nav-list">'+Object.keys(pages).map(navLink).join('')+'</nav>');
  else if(el.hasAttribute('data-date')){
    const dialog=openDialog(screen==='weekly'?'Review date':'Activity date','<form class="stack" data-date-form><label class="field">Date<input type="date" required value="'+activeDate+'" max="'+today()+'"></label><div class="row"><button type="submit" class="btn primary">Open date</button><button type="button" class="btn" data-go="'+screen+'">Go to today</button></div></form>');
    dialog.querySelector('form').onsubmit=e=>{e.preventDefault();go(screen,dialog.querySelector('input').value);};
  }
});
// Dynamically added worksheet, medication and safety-plan fields use the same
// form-history policy as the initial editor.
document.addEventListener('focusin',event=>{
  if(event.target.matches?.('input, textarea, select')){
    event.target.setAttribute('autocomplete','off');
    event.target.closest('form')?.setAttribute('autocomplete','off');
  }
},true);
window.addEventListener('popstate',()=>{if(opened){closeDialog();routeFromUrl();render();}});
function updateStatus(){
  document.querySelectorAll('[data-offline-status]').forEach(el=>el.textContent=offlineStatus);
  document.querySelectorAll('[data-status-dot]').forEach(el=>el.classList.toggle('ready',ready));
}
function scheduleLock(){
  clearTimeout(idleTimer);
  if(!opened)return;
  const remaining=idleLimit-(Date.now()-lastActivity);
  if(remaining<=0){void lockNow();return;}
  idleTimer=setTimeout(scheduleLock,remaining);
}

function resetActivity(event){
  if(!opened || !event.isTrusted || document.hidden)return;
  if(Date.now()-lastActivity>=idleLimit){
    if(event.cancelable)event.preventDefault();
    event.stopImmediatePropagation();
    void lockNow();
    return;
  }
  lastActivity=Date.now();
  scheduleLock();
}
for(const type of ['pointerdown','keydown','input','wheel','touchstart','click']){
  document.addEventListener(type,resetActivity,{capture:true});
}
// Native Files and print sheets can temporarily hide Safari. A user-initiated
// handoff covers the journal immediately and keeps the normal idle deadline.
document.addEventListener('click',event=>{
  if(!opened || !event.isTrusted)return;
  const native=event.target.closest('input[type=file],a[download],[data-print],[data-save-pdf]');
  nativeActionUntil=native ? Date.now()+2000 : 0;
},true);
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    document.body.classList.add('privacy-covered');
    if((opened && Date.now()>nativeActionUntil) || authenticating)void lockNow();
    return;
  }
  nativeActionUntil=0;
  if(opened)scheduleLock();
  document.body.classList.remove('privacy-covered');
});
window.addEventListener('pagehide',()=>{
  document.body.classList.add('privacy-covered');
  if(initialized)void lockNow();
});
window.addEventListener('pageshow',event=>{
  if(event.persisted && initialized && (opened || authenticating))void lockNow();
  if(!document.hidden)document.body.classList.remove('privacy-covered');
});

function gate(){
  drawGate(exists,async password=>{
    const ticket=++generation;
    authenticating=true;
    try{
      if(exists)await unlockVault(password);
      else await createVault(password);
      if(ticket!==generation || !isUnlocked())return;
      exists=true;
      $('#vault').replaceChildren();
      opened=true;
      routeFromUrl();
      document.body.classList.remove('vault-locked');
      render();
      lastActivity=Date.now();
      scheduleLock();
    }catch(error){
      if(ticket!==generation)return;
      // A second window may have finished setting up the same vault.
      const current=await vaultExists();
      if(current!==exists){exists=current;gate();return;}
      throw error;
    }finally{
      if(ticket===generation)authenticating=false;
    }
  });
  updateStatus();
}

async function lockNow(){
  const ticket=++generation;
  opened=false;
  authenticating=false;
  document.body.classList.add('vault-locked');
  clearTimeout(idleTimer);
  clearTimeout(toastTimer);
  nativeActionUntil=0;
  viewLifetime.abort();
  clearWorksheetSession();
  lastScrollFocus=null;
  closeDialog();
  $('#dialog-body').replaceChildren();
  // Detach editor nodes and their closures before waiting for accepted saves.
  $('#content').replaceWith($('#content').cloneNode(false));
  for(const id of ['rail','breadcrumb','mobile-nav','page-head','metrics','toast','foot','failure'])$('#'+id).replaceChildren();
  $('#failure').hidden=true;
  $('#vault').innerHTML='<div class="vault-wrap" role="status">Locking your vault…</div>';
  screen='today';activeDate=today();visitedDates.clear();
  history.replaceState(null,'',location.pathname);
  document.title='Dayleaf · Locked';
  try{
    await lockVault();
    exists=await vaultExists();
    if(ticket===generation)gate();
  }catch{
    if(ticket!==generation)return;
    gate();
    $('#vault [data-vault-message]').textContent='The vault is locked. A recent change may not have been saved. Check your entries after unlocking.';
  }
}

try{
  if(!window.isSecureContext || !window.indexedDB || !crypto.subtle)throw Error('Open the HTTPS address in Safari on iPhone or Chrome on Android. Dayleaf needs secure browser storage on this device.');
  startOffline((label,verified)=>{
    offlineStatus=label;ready=verified;updateStatus();
  });
  exists=await openStore(()=>{if(opened)tiles();},showError);
  initialized=true;
  gate();
}catch(error){
  $('#vault').replaceChildren();
  const area=document.createElement('p');
  area.className='vault-wrap notice warning';
  area.textContent=error.message || 'Dayleaf could not open local storage. Reopen the HTTPS address in your browser.';
  $('#vault').append(area);
}

