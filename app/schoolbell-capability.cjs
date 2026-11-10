// Code-owned gate. Renderer input, environment variables and saved settings cannot opt in.
// Empty-class live publication and ordinary-class nonpublishing are evidenced.
// Neither result replaces operating binding validation or Windows release gates.
const blockers=Object.freeze(['operating-binding-unverified','windows-release-gates-incomplete']);
module.exports=Object.freeze({status:()=>({enabled:false,status:'blocked',blockers:[...blockers],
 servicePermission:'unconfirmed',
 message:'학교종이 자동 입력·사진 및 테스트 게시 검증은 완료했습니다. 일반 운영 연결과 Windows 배포 검증이 끝날 때까지 정식 등록은 잠겨 있습니다.'})});
