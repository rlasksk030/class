// Renderer keeps only small immutable references in localStorage, never image bytes.
window.ClassPhotos={
 limit:20,
 help:'PNG·JPEG · 한 장 10 MB / 1600만 픽셀 이하 · 앱 전체 보관 128 MB',
 files(event){return [...(event.clipboardData?.items||[])].filter(i=>i.kind==='file').map(i=>i.getAsFile()).filter(f=>f&&(f.type.startsWith('image/')||/\.(png|jpe?g|gif|webp|bmp|heic|tiff?)$/i.test(f.name)));},
 async add(file){if(!window.desktop?.mediaAdd)throw Error('사진 저장은 우리 교실 데스크톱 앱에서 사용할 수 있습니다.');if(file.size>10*1024*1024)throw Error('사진은 한 장당 10 MB 이하로 추가해 주세요.');return window.desktop.mediaAdd({name:file.name,bytes:new Uint8Array(await file.arrayBuffer())});},
 async preview(img,photo){try{const b=await window.desktop.mediaRead(photo);if(!img.isConnected)return;const url=URL.createObjectURL(new Blob([b],{type:photo.id.endsWith('.png')?'image/png':'image/jpeg'}));img.onload=img.onerror=()=>URL.revokeObjectURL(url);img.src=url;}catch{img.alt='사진을 읽을 수 없습니다. 원본 또는 백업을 확인해 주세요.';img.classList.add('photo-missing');}},
 message(error){return String(error?.message||'사진을 저장하지 못했습니다.').replace(/^Error invoking remote method '[^']+': Error: /,'');}
};
