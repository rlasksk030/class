// Settings window (design I01–I03b): title and one short line on top, a list of three groups on the
// left (학교 · 학급 / 실행 · PIP / 백업 · 업데이트), the chosen group on the right, the version at the
// bottom left and [닫기][설정 저장] at the bottom right. Every control keeps its id and handler; this
// file only moves them into place after the other modules have added theirs. A first run (no class
// chosen yet) shows the same controls as one card with three steps (I06).
(() => {
 const dialog=document.getElementById('settingsDialog'),form=document.getElementById('settingsForm');
 if(!dialog||!form||form.querySelector('.settings-body'))return;
 const make=(tag,props={},parent)=>{const el=document.createElement(tag);Object.assign(el,props);if(parent)parent.append(el);return el;};
 const $=id=>document.getElementById(id);
 // 전국판 has the NEIS helper and the school search; 옥구초판 has a fixed school (I01).
 const nationwide=!!$('neisGuide'),edition=nationwide?'전국판':'옥구초판';let appVersion='';
 const fixedSchool=()=>window.OKGU_SCHOOL?.SCHUL_NM||settings.school?.SCHUL_NM||'옥구초등학교';
 window.desktop?.updateState?.().then(s=>{appVersion=s?.currentVersion||'';refresh();}).catch(()=>{});
 const title=form.querySelector(':scope>h2'),eyebrow=form.querySelector(':scope>.eyebrow'),actions=form.querySelector(':scope>.actions');
 const loose=[...form.children].filter(el=>el!==title&&el!==eyebrow&&el!==actions);
 // Head
 const head=make('div',{className:'settings-head'});form.prepend(head);
 const kicker=make('p',{className:'settings-kicker',textContent:'우리 교실 · 처음 설정 ('+edition+')'});
 head.append(kicker,title);const sub=make('p',{className:'settings-sub'},head);if(eyebrow)eyebrow.remove();
 const intro=make('p',{className:'settings-intro',textContent:'한 번만 하면 됩니다. 나중에 [설정]에서 바꿀 수 있습니다.'},head);
 // First-run steps (I06): ① NEIS 인증키 ② 학교 검색 ③ 학년 · 반
 const steps=make('ol',{className:'settings-steps'},head);
 const stepItems=[['NEIS 인증키'],['학교 검색'],['학년 · 반']].map(([name],i)=>{const li=make('li',{className:'settings-step'},steps);make('span',{className:'settings-step__no',textContent:String(i+1)},li);const text=make('span',{className:'settings-step__text'},li);make('strong',{textContent:name},text);return make('span',{className:'settings-step__state'},text);});
 // Body: list on the left, panes on the right
 const body=make('div',{className:'settings-body'});head.after(body);
 const nav=make('div',{className:'settings-nav',role:'tablist'},body);nav.setAttribute('aria-label','설정 묶음');
 const panes=make('div',{className:'settings-panes'},body);
 const groups=[['School','학교 · 학급'],['Run','실행 · PIP'],['Backup','백업 · 업데이트']].map(([id,name])=>{
  const tab=make('button',{type:'button',id:'settingsNav'+id,className:'settings-tab',textContent:name},nav);tab.setAttribute('role','tab');
  const pane=make('section',{id:'settingsPane'+id,className:'settings-pane'},panes);pane.setAttribute('role','tabpanel');pane.setAttribute('aria-labelledby',tab.id);
  make('h3',{className:'settings-pane__title',textContent:name},pane);return {id,tab,pane};
 });
 const [school,run,backup]=groups;
 // 학교 · 학급: one card with three rows; the NEIS helper and the school search stay the same details elements.
 const card=make('div',{className:'settings-card'},school.pane);
 const row=(cls,parent=card)=>make('div',{className:'settings-row '+cls},parent);
 if(!nationwide){const fixed=row('settings-row--fixed'),fh=make('div',{className:'settings-row__head'},fixed);make('strong',{className:'settings-row__label',textContent:'학교'},fh);make('span',{className:'settings-fixed-school',textContent:fixedSchool()},fh);make('span',{className:'settings-row__state',textContent:'옥구초판은 학교가 정해져 있습니다'},fh);}
 const neisRow=row('settings-row--neis'),neisHead=make('div',{className:'settings-row__head'},neisRow);
 const neisMark=make('span',{className:'settings-check'},neisHead),neisText=make('span',{className:'settings-row__text'},neisHead);
 make('strong',{textContent:'① NEIS 인증키'},neisText);const neisState=make('span',{className:'settings-row__state'},neisText);
 const neisOpen=make('button',{type:'button',className:'uc-btn--ghost settings-row__action',textContent:'연결 도우미 열기'},neisHead);
 const schoolRow=row('settings-row--school'),schoolHead=make('div',{className:'settings-row__head'},schoolRow);
 const schoolMark=make('span',{className:'settings-check'},schoolHead),schoolText=make('span',{className:'settings-row__text'},schoolHead);
 make('strong',{textContent:'② 학교'},schoolText);
 const schoolOpen=make('button',{type:'button',className:'settings-row__action',textContent:'학교 검색 · 변경'},schoolHead);
 const classRow=row('settings-row--class');make('strong',{className:'settings-row__label',textContent:nationwide?'③ 학년 · 반':'학년 · 반'},classRow);
 if(!nationwide){neisRow.remove();schoolRow.remove();steps.remove();}
 for(const el of loose){
  if(el.id==='neisGuide'){neisRow.append(el);continue;}
  if(el.id==='schoolChooser'||el.id==='schoolStatus'){schoolRow.append(el);continue;}
  if(el.id==='schoolSelected'){schoolText.append(el);continue;}
  if(el.matches('.desktop-startup')||(el.previousElementSibling?.matches?.('.desktop-startup')&&el.matches('p[role="status"]'))||el.matches('.dashboard-pip-settings')){run.pane.append(el);continue;}
  if(el.matches('.backup-settings')){backup.pane.append(el);continue;}
  if(el.matches('p')&&!el.id&&/학년과 반/.test(el.textContent)){el.remove();continue;}
  classRow.append(el);
 }
 // Keep the startup status line right after its switch.
 const startup=run.pane.querySelector('.desktop-startup');
 if(startup){const toggle=startup.querySelector('input');toggle?.classList.add('uc-switch');toggle?.setAttribute('role','switch');startup.classList.add('switch-row');}
 // 백업 · 업데이트: the [업데이트] launcher moves next to the version.
 const update=actions.querySelector('.open-update');
 if(update){const box=make('fieldset',{className:'update-settings'},backup.pane);make('legend',{textContent:'업데이트'},box);const line=make('div',{className:'update-settings__line'},box);make('span',{className:'update-settings__version'},line);line.append(update);}
 // Foot: version on the left, [닫기][설정 저장] on the right.
 const version=make('span',{className:'settings-version'});actions.prepend(version);
 const spacer=make('span',{className:'uc-spacer'});version.after(spacer);
 // Toggle buttons for the two details elements (their own summaries are hidden).
 if(nationwide){neisOpen.onclick=()=>{$('neisGuide').open=!$('neisGuide').open;};schoolOpen.onclick=()=>{$('schoolChooser').open=!$('schoolChooser').open;};}
 function select(group){for(const g of groups){const on=g===group;g.tab.setAttribute('aria-selected',String(on));g.tab.tabIndex=on?0:-1;g.pane.hidden=!on;}dialog.dataset.pane=group.id;refresh();}
 groups.forEach(g=>g.tab.onclick=()=>select(g));
 nav.onkeydown=e=>{if(!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const i=groups.findIndex(g=>g.tab.getAttribute('aria-selected')==='true'),next=groups[(i+(e.key==='ArrowDown'?1:groups.length-1))%groups.length];select(next);next.tab.focus();};
 function refresh(){
  const key=nationwide&&typeof schoolContext!=='undefined'&&!!schoolContext?.hasKey,chosen=!$('grade').disabled,classDone=!!(settings.grade&&settings.classroom);
  neisState.textContent=key?'연결됨':'연결 안 됨 · 키 없이도 학교 검색은 됩니다';neisRow.classList.toggle('is-done',key);
  schoolRow.classList.toggle('is-done',chosen);neisOpen.textContent=$('neisGuide')?.open?'도우미 닫기':'연결 도우미 열기';
  // The first-run card (I06) belongs to 전국판, which still has to pick a school.
  const first=nationwide&&!classDone;dialog.classList.toggle('settings-first',first);
  title.textContent=first?'학교와 학급을 골라 주세요':'우리 교실 설정';
  const label=nationwide?(settings.school&&classDone?`${settings.school.SCHUL_NM} ${settings.grade}학년 ${settings.classroom}반 · ${edition}`:edition):`${fixedSchool()} · ${edition}`;
  sub.textContent=nationwide&&(dialog.dataset.pane==='School'||first)?edition+' · 학교와 학급을 고른 뒤 저장해 주세요':label;
  version.textContent=appVersion?'버전 '+appVersion:'';for(const v of backup.pane.querySelectorAll('.update-settings__version'))v.textContent=appVersion?'지금 버전 '+appVersion:'';
  const step=!key&&$('neisGuide')?.open?0:!chosen?1:2;
  stepItems.forEach((state,i)=>{const li=state.closest('li');li.classList.toggle('is-done',i<step||(i===0&&key));li.classList.toggle('is-current',i===step);state.textContent=i===0&&key?'연결됨':i<step?'완료':i===step?'지금 단계':'다음 단계';});
 }
 for(const el of [$('neisGuide'),$('schoolChooser')])el?.addEventListener('toggle',refresh);
 new MutationObserver(refresh).observe($('grade'),{attributes:true,attributeFilter:['disabled']});
 new MutationObserver(refresh).observe(dialog,{attributes:true,attributeFilter:['open']});
 $('neisStatus')&&new MutationObserver(refresh).observe($('neisStatus'),{childList:true,characterData:true,subtree:true});
 // Opening the window starts on 학교 · 학급.
 new MutationObserver(()=>{if(dialog.open&&!dialog.dataset.opened){dialog.dataset.opened='';select(school);}if(!dialog.open)delete dialog.dataset.opened;}).observe(dialog,{attributes:true,attributeFilter:['open']});
 // A missing grade or class shows its group first, so the browser can point at the empty field.
 form.addEventListener('invalid',()=>{if(school.pane.hidden)select(school);},true);
 window.settingsWindow={select:id=>select(groups.find(g=>g.id===id)||school)};
 select(school);
})();
