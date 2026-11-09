// Fixed public messages only. Never expose transport errors, DOM text, URLs or identities.
const messages=Object.freeze({
 'permission-unverified':'학교종이의 공식 자동화 허용 범위를 확인하지 못했습니다.',
 'context-unverified':'학교·학년도·학년·반과 현재 교사 권한을 확인하지 못했습니다.',
 'test-class-unverified':'승인된 시험 학급의 수신자 없음과 외부 알림 없음을 확인하지 못했습니다.',
 'structure-unverified':'학교종이 작성 요소가 누락되었거나 여러 개입니다.',
 'date-unverified':'학교종이의 게시 날짜를 확인하지 못했습니다.',
 'upload-unverified':'사진 업로드 완료·원본·순서를 확인하지 못했습니다.',
 'content-unverified':'학교종이 작성 내용이 제출할 초안과 다릅니다.',
 'baseline-unverified':'기존 게시물 조회가 완료되지 않았거나 중복 여부가 불확실합니다.',
 'publication-unverified':'새 게시물의 식별정보·본문·사진 원본을 재조회로 확인하지 못했습니다.',
 'driver-state':'학교종이 검증 단계가 바뀌었거나 중단되었습니다.'
});
function fail(code){const error=new Error(messages[code]||messages['driver-state']);error.name='SchoolbellPreparationError';error.code=code;throw error;}
function publicFailure(error){return error?.name==='SchoolbellPreparationError'&&Object.hasOwn(messages,error.code)?
 {reason:error.code,message:messages[error.code]+' 초안과 사진은 유지됩니다. 자동으로 재전송하지 않습니다.'}:null;}
module.exports={fail,publicFailure};
