(() => {
 const button=document.createElement('button');button.id='screenLock';document.querySelector('.utility-controls').append(button);
 const blocked='[data-edit],#settings,#resizeToggle,#resizeReset,#screenSettings';
 function apply(locked){
  if(locked&&document.body.classList.contains('board-size-mode'))document.getElementById('resizeToggle').click();
  window.dashboardLocked=locked;put('dashboardLocked',locked);document.body.classList.toggle('dashboard-locked',locked);button.textContent=locked?'🔒 잠금 해제':'화면 잠금';button.setAttribute('aria-pressed',String(locked));
  document.querySelectorAll(blocked).forEach(el=>el.disabled=locked);
  if(locked)for(const id of ['settingsDialog','editDialog','screenDialog','periodDialog','ddayDialog']){const d=document.getElementById(id);if(d?.open)d.close();}
 }
 button.onclick=()=>{if(window.dashboardLocked&&!confirm('대시보드 편집 잠금을 해제할까요?'))return;apply(!window.dashboardLocked);};
 document.addEventListener('click',e=>{if(window.dashboardLocked&&e.target.closest(blocked)){e.preventDefault();e.stopImmediatePropagation();}},true);
 apply(read('dashboardLocked',false)===true);
})();
