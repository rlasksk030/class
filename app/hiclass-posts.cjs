// PostCard / ImagePackGrid contract from the public production bundle, 2026-10-26.
// Self-contained: executed in the service page, returns identities, never post text.
function postState(payload){
 const normalize=s=>String(s||'').replace(/\s+/g,' ').trim();
 const cardId=e=>[...e.classList].find(c=>/^board-post-card-.+/.test(c));
 const modern=[...document.querySelectorAll('[class*="board-post-card-"]')].filter(cardId);
 const legacy=[...document.querySelectorAll('article')].filter(e=>!modern.some(c=>c===e||c.contains(e)||e.contains(c)));
 const cards=[...modern,...legacy];
 const matches=cards.filter(e=>{
  if(e.querySelector('strong')?.textContent.trim()!==payload.title.trim())return false;
  const body=e.querySelector('.class-fr-editor.fr-view-content');
  if(cardId(e))return !normalize(payload.body)||(body?normalize(body.innerText).includes(normalize(payload.body)):normalize(payload.body)===normalize(payload.title));
  return normalize(e.innerText).includes(normalize(payload.body));
 }).map(e=>({id:cardId(e)||e.id||'',modern:!!cardId(e),images:[...e.querySelectorAll('.img-list-inner a[aria-label^="묶음 사진 "]')].map((a,i)=>({label:a.getAttribute('aria-label'),src:a.querySelector('img')?.src||'',loaded:!!a.querySelector('img')?.complete&&a.querySelector('img').naturalWidth>0,index:i}))}));
 return {ids:cards.map(e=>cardId(e)||e.id).filter(Boolean),matching:matches.length,matches};
}
module.exports={postState};
