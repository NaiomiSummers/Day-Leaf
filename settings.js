import {exportDat, replaceAll, stores, vaultRevision} from './store.js';
import {decryptBackup} from './backup.js';

const getPlan=ctx=>ctx.db.settings.find(s=>s.id==='safety') || {};
export function showSafety(ctx){
  const p=getPlan(ctx), contacts=p.contacts||[];
  const body=ctx.openDialog('My safety plan','<p class="muted">Nobody is monitoring this app. It is not an emergency response tool. If there is immediate danger, contact local emergency services.</p>'+
    '<h3>Clinician-agreed steps</h3><p class="lines">'+ctx.esc(p.steps || 'You haven’t added your plan yet.')+'</p>'+
    '<h3>Support contacts</h3>'+ (contacts.some(c=>c.name||c.phone)?contacts.filter(c=>c.name||c.phone).map(c=>{
      const phone=(c.phone||'').replace(/[^+0-9*#]/g,'');
      return '<div class="support-contact">'+ctx.icon('phone',18)+'<div><strong>'+ctx.esc(c.name||'Support contact')+'</strong><br>'+(phone?'<a href="tel:'+encodeURIComponent(phone)+'">'+ctx.esc(c.phone)+'</a>':'')+'</div></div>';
    }).join(''):'<p class="muted">No contacts added yet.</p>')+'<button type="button" class="btn secondary" data-edit-plan>Edit plan and contacts</button>');
  body.querySelector('[data-edit-plan]').onclick=()=>{ctx.go('settings');document.querySelector('[name="steps"]').focus();};
}
export function renderSettings(ctx){
  const plan=getPlan(ctx), e=ctx.esc;
  ctx.root.innerHTML='<div class="settings-grid"><section class="card"><h2>My safety plan</h2><p class="muted">Keep the steps you agreed on with your clinician and the people you can contact.</p><form data-plan class="stack"><label class="field"><span>Clinician-agreed steps</span><textarea name="steps" rows="4">'+e(plan.steps)+'</textarea></label><div class="stack" data-contacts></div><div><button type="button" class="btn secondary" data-add-contact>Add support contact</button></div><div class="row"><button class="btn primary">Save safety plan</button><span role="status" data-plan-status></span></div></form></section>'+
    '<section class="card"><h2>Encrypted backup</h2><p class="muted">Your entries live in this browser or installed app. Clearing site data, removing the app or losing the device can remove them. Save a password-protected copy somewhere you control.</p>'+
    '<details class="backup-form"><summary>Create a backup</summary><form data-export class="stack"><p>Your current vault password protects the .dat file. Keep the password so you can open this file on another device.</p><div><button class="btn primary">Create encrypted file</button></div><div data-backup-link></div></form></details>'+
    '<details class="backup-form"><summary>Restore a backup</summary><form data-import class="stack"><label class="field">Encrypted backup file<input type="file" name="file" required accept=".dat,application/octet-stream"></label><label class="field">Password for this backup<input type="password" name="password" required autocomplete="off"></label><div><button class="btn secondary">Preview restore</button></div></form></details><p class="backup-result" role="status" data-backup-result></p></section>'+
    '<section class="card"><h2>Offline and privacy</h2><p class="muted">Open the installed Home Screen app once while online, then check its offline status below.</p><div class="row"><span class="status-dot" data-status-dot></span><strong data-offline-status>'+e(ctx.offlineStatus())+'</strong></div><p>Local entries and drafts are encrypted before they are stored. Your vault reopens locked and locks after five minutes of inactivity.</p><p>Exported report PDFs contain readable health information and are not password-protected. Choose a private location when saving a PDF or backup.</p><p class="muted">Nobody is monitoring this app. It is not an emergency response tool.</p></section></div>';
  const root=ctx.root,form=root.querySelector('[data-plan]'),contactList=form.querySelector('[data-contacts]');
  const addContact=(c={})=>{
    const area=document.createElement('div');area.className='notice stack';area.dataset.contact='';
    area.innerHTML='<div class="grid-2"><label class="field">Contact name or role<input name="contactName" value="'+e(c.name)+'"></label><label class="field">Phone number<input name="contactPhone" type="tel" value="'+e(c.phone)+'"></label></div><div><button class="btn" type="button" data-remove>Remove contact</button></div>';
    area.querySelector('button').onclick=()=>area.remove();contactList.append(area);
  };
  (plan.contacts||[]).forEach(addContact);
  form.querySelector('[data-add-contact]').onclick=()=>{addContact();contactList.lastElementChild.querySelector('input').focus();};
  form.onsubmit=async ev=>{
    ev.preventDefault();
    const contacts=Array.from(contactList.children,c=>({name:c.querySelector('[name="contactName"]').value.trim(),phone:c.querySelector('[name="contactPhone"]').value.trim()})).filter(c=>c.name||c.phone);
    try{await ctx.put('settings',{id:'safety',steps:form.elements.steps.value,contacts});form.querySelector('[data-plan-status]').textContent='Saved on this device';}
    catch{form.querySelector('[data-plan-status]').textContent='Save failed. Keep this page open and retry.';}
  };
  const message=root.querySelector('[data-backup-result]');
  const exportForm=root.querySelector('[data-export]');
  let downloadUrl;
  const signal = ctx.signal;
  function provideDownload(target, text, filename, label) {
    if (signal.aborted) return;
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(new Blob([text], {type:'application/octet-stream'}));
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    link.className = 'btn primary';
    link.textContent = label;
    target.replaceChildren(link);
  }
  signal.addEventListener('abort', () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    const password = root.querySelector('[data-import] [name=password]');
    if (password) password.value = '';
  }, {once:true});
  exportForm.onsubmit=async ev=>{
    ev.preventDefault();
    if (signal.aborted) return;
    exportForm.querySelector('button').disabled=true;
    try{
      message.textContent='Encrypting the backup…';
      const encrypted=await exportDat();
      if (signal.aborted) return;
      provideDownload(exportForm.querySelector('[data-backup-link]'), encrypted,
        'dayleaf-'+ctx.today()+'.dat', 'Save encrypted backup');
      message.textContent='Backup is ready. Use Save encrypted backup to choose a destination.';exportForm.reset();
    }catch(error){message.textContent=error.message;}finally{exportForm.querySelector('button').disabled=false;}
  };
  const importForm=root.querySelector('[data-import]');
  importForm.onsubmit=async ev=>{
    ev.preventDefault();const file=importForm.elements.file.files[0];
    if(!file || signal.aborted)return;
    importForm.querySelector('button').disabled=true;
    try{
      message.textContent='Checking the encrypted file…';
      // A concurrent edit or tab restore invalidates the confirmation.
      const expectedRevision = vaultRevision();
      const text = await file.text();
      if (signal.aborted) return;
      const decrypting = decryptBackup(text, importForm.elements.password.value);
      importForm.elements.password.value = '';
      let data = await decrypting;
      if (signal.aborted) return;
      const labels={daily:'Daily entries',weekly:'Weekly reviews',cssrs:'C-SSRS records',meds:'Medication versions',workbook:'Worksheets',settings:'Settings records'};
      const counts=stores.map(name=>'<li>'+labels[name]+': '+data.records[name].length+'</li>').join('');
      const dialog=ctx.openDialog('Replace local journal?','<p>This backup was created '+e(new Date(data.exportedAt).toLocaleString())+'. Restoring it replaces all entries, contacts and settings in this copy of Dayleaf. The restored records use your current vault password.</p><ul>'+counts+'</ul><p>Save a backup of your current entries first if you want to keep them.</p><div class="row"><button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-restore>Replace local records</button></div><p role="status" data-restore-message></p>');
      const dialogElement = dialog.closest('dialog');
      const discard = () => {
        data = null;
        dialogElement.removeEventListener('close', discard);
        signal.removeEventListener('abort', discard);
      };
      dialogElement.addEventListener('close', discard, {once:true});
      signal.addEventListener('abort', discard, {once:true});
      dialog.querySelector('[data-restore]').onclick=async ev=>{
        if (!data || signal.aborted || !dialogElement.open) return;
        ev.target.disabled=true;
        try{
          await replaceAll(data, expectedRevision);
          if (signal.aborted) return;
          ctx.closeDialog();ctx.toast('Backup restored on this device.');ctx.refresh();
        }catch(error){
          if (signal.aborted) return;
          dialog.querySelector('[data-restore-message]').textContent=error.message;
          ev.target.disabled=false;
        }
      };
      message.textContent='Backup opened. Review its contents before restoring.';importForm.elements.password.value='';
    }catch(error){message.textContent=error.message;}finally{importForm.querySelector('button').disabled=false;}
  };
}
