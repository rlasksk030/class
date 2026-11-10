'use strict';
// Plain text from the observed Froala paragraph DOM. innerText counts visual
// paragraph margins as extra line breaks; textContent loses the boundaries.
// Self-contained, read-only: may also be used in an approved live DOM probe.
function readEditorText(root){
 const blocks=new Set(['P','DIV']);
 const inline=new Set(['SPAN','B','STRONG','I','EM','U','S','STRIKE','A','FONT','SUB','SUP','CODE']);
 function content(node,isParagraph=false){
  const children=Array.from(node.childNodes);
  if(isParagraph&&children.length===1&&children[0].nodeName==='BR')return '';
  const groups=[];let run='',hasRun=false;
  const flush=()=>{if(hasRun)groups.push(run);run='';hasRun=false;};
  for(const child of children){
   if(child.nodeType===3){const value=child.textContent||'';if(value){run+=value;hasRun=true;}continue;}
   if(child.nodeType===8)continue;
   if(child.nodeType!==1)throw Error('content-unverified');
   const tag=child.nodeName;
   if(blocks.has(tag)){flush();groups.push(content(child,true));}
   else if(tag==='BR'){run+='\n';hasRun=true;}
   else if(inline.has(tag)){run+=content(child);hasRun=true;}
   // Images, lists, tables and unknown formatting require a separate reviewed
   // interpretation. Never silently discard a non-text part of the editor.
   else throw Error('content-unverified');
  }
  flush();return groups.join('\n');
 }
 return content(root).replace(/\r\n?/g,'\n');
}
module.exports={readEditorText};
