// Code-owned availability; availability alone never permits publication.
// Main adds a registered, session-bound ordinary-class authorization before
// exposing enabled=true. Renderer input and saved settings cannot opt in.
module.exports=Object.freeze({status:()=>({available:true,enabled:false,status:'connection-required',
 blockers:['current-class-connection-required'],servicePermission:'unconfirmed',
 message:'앱 전용 창에서 로그인한 뒤 담당 학급 연결을 확인해 주세요. 게시할 때마다 대상·내용·사진을 검증하고 최종 확인합니다.'})});
