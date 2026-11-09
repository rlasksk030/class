// Code-owned gate. Renderer input, environment variables and saved settings cannot opt in.
// Runtime execution stays disabled until permission and isolated-account evidence are reviewed.
const blockers=Object.freeze(['permission-unconfirmed','live-driver-unverified','live-publish-unverified']);
module.exports=Object.freeze({status:()=>({enabled:false,status:'blocked',blockers:[...blockers],
 message:'학교종이 자동 등록은 허용 여부와 실제 게시 검증이 완료되지 않아 잠겨 있습니다. 수동 발행 도우미는 별도로 사용할 수 있습니다.'})});
