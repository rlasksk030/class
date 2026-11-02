// Where the teacher is in the HiClass connection window. Same safety rules as before: only a note board
// (https://www.hiclass.net/main/clazzes/{classId}/note/{noteId}) with a visible class title can be linked.
const NOTE=/^\/main\/clazzes\/[a-zA-Z0-9-]+\/note\/[a-zA-Z0-9-]+$/;
const CLASS=/^\/main\/clazzes\/[a-zA-Z0-9-]+(\/.*)?$/;
const GUIDE='하이클래스에서 로그인한 뒤 담당 학급의 알림장 게시판을 열어 주세요.';
function classify(state){
 let url;try{url=new URL(state?.url||'');}catch{url=null;}
 const title=String(state?.classTitle||'').trim();
 if(state?.login||!url||url.protocol!=='https:'||url.hostname!=='www.hiclass.net')return {step:1,state:'login',message:'하이클래스 창에서 로그인해 주세요.'};
 if(NOTE.test(url.pathname)&&title)return {step:4,state:'note',message:`${title} 알림장 게시판을 찾았습니다.`,url:url.origin+url.pathname,title};
 if(CLASS.test(url.pathname))return {step:3,state:'class',message:title?`${title} 학급은 확인했습니다. 이제 해당 학급의 알림장 게시판을 열어 주세요.`:'학급은 확인했습니다. 이제 해당 학급의 알림장 게시판을 열어 주세요.'};
 return {step:2,state:'home',message:'로그인되었습니다. 담당 학급을 선택해 주세요.'};
}
// A class title such as "옥구초등학교 6학년 1반" that names another grade or class is flagged in the confirmation.
function titleMatches(title,grade,classroom){
 const m=String(title||'').match(/(\d+)\s*학년\s*(\d+)\s*반/);
 return !m||(m[1]===String(grade)&&m[2]===String(classroom));
}
module.exports={NOTE,GUIDE,classify,titleMatches};
