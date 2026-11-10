// Fixed public messages only. Never expose transport errors, DOM text, URLs or identities.
const messages=Object.freeze({
 'permission-unverified':'운영 허용 또는 현재 시험 프로필의 별도 사용자 승인 범위를 확인하지 못했습니다.',
 'context-unverified':'학교·학년도·학년·반과 현재 교사 권한을 확인하지 못했습니다.',
 'test-class-unverified':'승인된 시험 학급의 학생·학부모 수신자 없음과 필수 관리자 알림 허용 범위를 확인하지 못했습니다.',
 'structure-unverified':'학교종이 작성 요소가 누락되었거나 여러 개입니다.',
 'date-unverified':'학교종이의 게시 날짜를 확인하지 못했습니다.',
 'upload-unverified':'사진 업로드 완료·원본·순서를 확인하지 못했습니다.',
 'commit-already-submitted':'이미 사용된 보내기 시도이므로 다시 보내지 않습니다.',
 'commit-send-disabled':'학교종이 보내기 버튼이 비활성 상태입니다.',
 'commit-action-mismatch':'한 번 보내기 동작을 확인하지 못했습니다.',
 'commit-revision-mismatch':'최종 확인 이후 작성 화면의 변경 상태가 달라졌습니다.',
 'commit-title-mismatch':'학교종이 제목이 승인할 초안과 다릅니다.',
 'commit-body-mismatch':'학교종이 본문이 승인할 초안과 다릅니다.',
 'commit-body-unreadable':'학교종이 본문 구조를 안전하게 읽지 못했습니다.',
 'commit-semantic-change':'검증 중 실제 입력·첨부 또는 대상 변경이 감지됐습니다.',
 'renderer-unclassified':'작성 화면 검사 중 분류되지 않은 오류가 발생했습니다.',
 'content-unverified':'학교종이 작성 내용이 제출할 초안과 다릅니다.',
 'baseline-unverified':'기존 게시물 조회가 완료되지 않았거나 중복 여부가 불확실합니다.',
 'publication-unverified':'새 게시물의 식별정보·본문·사진 원본을 재조회로 확인하지 못했습니다.',
 'driver-state':'학교종이 검증 단계가 바뀌었거나 중단되었습니다.'
});
function fail(code){const error=new Error(messages[code]||messages['driver-state']);error.name='SchoolbellPreparationError';error.code=code;throw error;}
function publicFailure(error){return error?.name==='SchoolbellPreparationError'&&Object.hasOwn(messages,error.code)?
 {reason:error.code,message:messages[error.code]+' 초안과 사진은 유지됩니다. 자동으로 재전송하지 않습니다.'}:null;}
module.exports={fail,publicFailure};
