// Read-only structure observed on the real Schoolbell composer, 2026-11-09.
// Reused by the gated Electron composer; this probe alone never authorizes publication.
// No values, body text, account/class identifiers, URLs or file objects leave this probe.
// Keep self-contained so a reviewed DOM-only inspection can use the same function.
function probeComposer(document) {
 const roots=Array.from(document.querySelectorAll('app-boards-write'));
 const root=roots.length===1?roots[0]:null;
 const find=selector=>root?Array.from(root.querySelectorAll(selector)):[];
 const enabled=nodes=>nodes.length===1?
  !nodes[0].hasAttribute('disabled')&&nodes[0].getAttribute('aria-disabled')!=='true':null;
 const title=find('input[placeholder="제목을 입력해 주세요."]');
 const body=find('div.fr-element.fr-view[contenteditable="true"]');
 const photos=find('input[type="file"]');
 const send=find('button.btn-with-description').filter(e=>(e.textContent||'').replace(/\s+/g,'').startsWith('보내기'));
 const save=find('button').filter(e=>(e.textContent||'').replace(/\s+/g,'')==='임시저장');
 const accept=photos.length===1?(photos[0].getAttribute('accept')||'').toLowerCase().split(',').map(s=>s.trim()):[];
 return {
  schema:1,kind:'schoolbell-composer-structure',composerCount:roots.length,
  structureMatched:roots.length===1&&[title,body,photos,send,save].every(nodes=>nodes.length===1),
  title:{count:title.length,enabled:enabled(title)},
  body:{count:body.length,enabled:enabled(body)},
  photos:{count:photos.length,enabled:enabled(photos),multiple:photos.length===1?photos[0].hasAttribute('multiple'):null,
   accepts:{jpeg:accept.includes('.jpg')||accept.includes('.jpeg'),png:accept.includes('.png'),heic:accept.includes('.heic')||accept.includes('.heif')}},
  send:{count:send.length,enabled:enabled(send)},saveDraft:{count:save.length,enabled:enabled(save)},
  // Never infer identity, authority, successful upload or publication from available controls.
  date:'unverified',identity:'unverified',teacherPermission:'unverified',recipients:'unverified',
  attachmentsVerified:false,publishReady:false
 };
}
// Actual upload rows include a separate rounded size label. Do not append that
// label to the filename, or use it as proof of the uploaded original's bytes.
function probeAttachments(document) {
 const roots=document.querySelectorAll('app-boards-write');
 const lists=roots.length===1?roots[0].querySelectorAll('app-letter-write-file-list'):[];
 const rows=lists.length===1?Array.from(lists[0].querySelectorAll('app-file-row')):[];
 return {listKnown:lists.length===1,
  uploading:!!document.querySelector('app-file-upload-list,app-progress-bar'),
  names:rows.map(row=>{
   const names=row.querySelectorAll('app-file-name-text');if(names.length!==1)return null;
   const base=names[0].querySelectorAll('span.text-truncate');
   const extension=names[0].querySelectorAll('span.flex-shrink-0:not(.small)');
   return base.length===1&&extension.length===1?base[0].textContent+extension[0].textContent:null;
  }),originalsVerified:false};
}
module.exports={probeComposer,probeAttachments};
