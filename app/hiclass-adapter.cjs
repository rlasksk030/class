// HiClass adapter: observed editor selectors; live end-to-end verification is required before release.
const visible='el=>!!(el.getClientRects().length)';
const titleSelector='textarea[placeholder="제목을 입력하세요."]';
const bodySelector='.fr-element.fr-view[contenteditable="true"]';
async function inspect(w){return w.webContents.executeJavaScript(`(()=>{const visible=${visible};return {url:location.href,login:[...document.querySelectorAll('input[type=password]')].some(visible)||(!location.pathname.startsWith('/main/')&&document.body.innerText.includes('로그인')),classTitle:[...document.querySelectorAll('strong')].find(el=>visible(el)&&el.textContent.includes('옥구초등학교'))?.textContent||''};})()`);}
async function clickText(w,labels){return w.webContents.executeJavaScript(`(()=>{const visible=${visible},labels=${JSON.stringify(labels)};const matches=[...document.querySelectorAll('button,[role=button],a')].filter(el=>visible(el)&&labels.includes(el.textContent.trim()));if(matches.length!==1)return false;matches[0].click();return true;})()`);}
const delay=()=>new Promise(resolve=>setTimeout(resolve,350));
async function wait(fn,ms=15000){const end=Date.now()+ms;while(Date.now()<end){const r=await fn();if(r)return r;await delay();}throw Error('하이클래스 화면을 확인하지 못했습니다. 연결 창을 확인해 주세요.');}
async function articleIds(w){return w.webContents.executeJavaScript(`Array.from(document.querySelectorAll('article')).map(e=>e.id||e.className)`);}
async function verifyClass(w,link){
 const state=await inspect(w);
 if(state.login)throw Error('하이클래스 로그인이 만료되었습니다.');
 const expected=new URL(link.url),actual=new URL(state.url);
 if(actual.origin!==expected.origin||actual.pathname!==expected.pathname||state.classTitle.trim()!==link.title.trim())throw Error('연결된 학급과 현재 하이클래스 학급이 달라 등록하지 않았습니다.');
}
async function prepare(w,link,payload){
 const u=new URL(link.url);if(!/^\/main\/clazzes\/[^/]+\/note\/[^/]+/.test(u.pathname))throw Error('담당 클래스의 알림장 게시판을 열고 학급을 다시 연결해 주세요.');
 await w.loadURL(link.url);await wait(async()=>{const s=await inspect(w);if(s.login)throw Error('하이클래스 로그인이 만료되었습니다. 다시 로그인해 주세요.');return s.classTitle;});
 await verifyClass(w,link);
 if(!await wait(()=>clickText(w,['게시글 쓰기'])))throw Error('알림장 작성 버튼을 찾지 못했습니다.');
 await wait(()=>w.webContents.executeJavaScript(`Boolean(document.querySelector(${JSON.stringify(titleSelector)})&&document.querySelector(${JSON.stringify(bodySelector)}))`));
 const filled=await w.webContents.executeJavaScript(`(()=>{const titles=[...document.querySelectorAll(${JSON.stringify(titleSelector)})].filter(${visible}),bodies=[...document.querySelectorAll(${JSON.stringify(bodySelector)})].filter(${visible});if(titles.length!==1||bodies.length!==1)return false;const title=titles[0],value=${JSON.stringify(payload.title)};if(title.maxLength>0&&value.length>title.maxLength)return false;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(title,value);title.dispatchEvent(new Event('input',{bubbles:true}));bodies[0].focus();return title.value===value&&document.activeElement===bodies[0];})()`);
 if(!filled)throw Error('하이클래스 입력 화면이 변경되었습니다. 초안은 유지됩니다.');
 // Native text entry updates Froala's model and treats all draft content as plain text.
 w.webContents.selectAll();await w.webContents.insertText(payload.body);
 // Read logical editor lines; innerText inserts extra visual newlines around empty blocks.
 const readLines = el => {
  const walk = node => {
   if(node.nodeType===3)return node.textContent;
   if(node.nodeName==='BR')return '\n';
   if(node.childNodes.length===1&&node.firstChild.nodeName==='BR')return '';
   let text='';for(const child of node.childNodes){if(/^(DIV|P)$/.test(child.nodeName)&&text!=='' )text+='\n';text+=walk(child);if(/^(DIV|P)$/.test(child.nodeName)&&child!==node.lastChild&&text==='')text+='\n';}return text;
  };return walk(el).replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ').trimEnd();
 };
 await wait(()=>w.webContents.executeJavaScript(`(()=>{const el=document.querySelector(${JSON.stringify(bodySelector)});return !!el&&(${readLines.toString()})(el)===${JSON.stringify(payload.body.replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ').trimEnd())};})()`));

 const targets=await w.webContents.executeJavaScript(`(()=>{for(const [id,checked] of [['target-parents-check',${JSON.stringify(payload.parents!==false)}],['target-student-check',${JSON.stringify(payload.students!==false)}]]){const el=document.getElementById(id);if(!el)return false;if(el.checked!==checked)el.click();if(el.checked!==checked)return false;}return true;})()`);if(!targets)throw Error('수신대상을 확인하지 못해 등록을 중단했습니다.');
 return articleIds(w);
}
async function verifyRecipients(w,payload){
 const match=await w.webContents.executeJavaScript(`(()=>{const parents=document.getElementById('target-parents-check'),students=document.getElementById('target-student-check');return !!parents&&!!students&&parents.checked===${JSON.stringify(payload.parents)}&&students.checked===${JSON.stringify(payload.students)};})()`);
 if(!match)throw Error('수신대상이 앱의 선택과 달라 등록을 중단했습니다.');
}
async function submit(w,payload,before,link){
 await verifyClass(w,link);
 await verifyRecipients(w,payload);
 if(!await clickText(w,['등록']))throw Error('등록 버튼을 확실하게 찾지 못했습니다.');
 const confirmation=await wait(()=>w.webContents.executeJavaScript(`(()=>{const dialog=document.querySelector('.swal2-popup[role="dialog"]');return dialog?.getClientRects().length?dialog.querySelector('.swal2-html-container')?.innerText||'':null;})()`));
 const teachersOnly=confirmation.replace(/\s+/g,' ').trim()==='수신대상이 없는 게시글은 클래스 선생님만 확인이 가능합니다. 게시글을 등록하시겠습니까?';
 const temporary=confirmation.replace(/\s+/g,' ').trim()==='임시 저장한 게시물은 클래스 구성원에게 공개되지 않습니다. 임시 저장하시겠습니까?';
 const publish=confirmation.trim()==='작성한 내용을 지금 클래스 구성원들에게 보내시겠습니까?';
 if(!temporary&&!publish&&!teachersOnly)throw Error('하이클래스 확인 내용이 변경되어 자동 등록을 중단했습니다.');
 if(teachersOnly&&(payload.parents||payload.students))throw Error('수신대상 확인에 실패했습니다. 등록하지 않았습니다.');
 if(publish&&payload.parents===false&&payload.students===false)throw Error('수신 제외 설정과 일치하지 않아 등록을 중단했습니다.');
 await verifyClass(w,link);
 await verifyRecipients(w,payload);
 await w.webContents.executeJavaScript(`document.querySelector('.swal2-popup[role="dialog"] .swal2-confirm').click()`);
 await wait(()=>w.webContents.executeJavaScript(`!document.querySelector(${JSON.stringify(titleSelector)})`));
 if(temporary)await clickText(w,['임시저장']);
 await wait(()=>w.webContents.executeJavaScript(`(()=>{const title=${JSON.stringify(payload.title)},body=${JSON.stringify(payload.body)},before=${JSON.stringify(before)};const normalize=s=>s.replace(/\\s+/g,' ').trim();return [...document.querySelectorAll('article')].some(el=>!before.includes(el.id||el.className)&&el.querySelector('strong')?.textContent.trim()===title&&normalize(el.innerText).includes(normalize(body)));})()`),20000);
 return temporary?'draft':'success';
}
module.exports={inspect,prepare,submit,verifyClass};
