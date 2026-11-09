const {test}=require('node:test'),assert=require('node:assert/strict');
const {readEditorText}=require('./schoolbell-editor-text.cjs');
const t=value=>({nodeType:3,textContent:value}),e=(tag,...children)=>({nodeType:1,nodeName:tag,childNodes:children});
test('observed Froala P/P-BR/P represents exactly two newlines, independent of layout',()=>{
 assert.equal(readEditorText(e('DIV',e('P',t('학교종이 자동 등록 테스트입니다.')),e('P',e('BR')),e('P',t('한글과 줄바꿈 확인입니다.')))),
  '학교종이 자동 등록 테스트입니다.\n\n한글과 줄바꿈 확인입니다.');
});
test('retains text, empty paragraphs, inline markup, literal HTML and exact whitespace',()=>{
 const cases=[
  [e('DIV'),''],[e('DIV',e('P',e('BR'))),''],[e('DIV',e('P',t('첫')),e('P',e('BR'))),'첫\n'],
  [e('DIV',e('P',e('BR')),e('P',t('끝'))),'\n끝'],
  [e('DIV',t('앞'),e('DIV',e('BR')),e('DIV',t('뒤'))),'앞\n\n뒤'],
  [e('DIV',t('앞'),e('BR'),e('BR'),t('뒤')),'앞\n\n뒤'],
  [e('DIV',e('P',t('  공백  '),e('STRONG',t('<script>문자</script>')))),'  공백  <script>문자</script>'],
  [e('DIV',t('\u00a0 \n')),'\u00a0 \n']
 ];for(const [node,expected] of cases)assert.equal(readEditorText(node),expected);
});
test('unknown/non-text editor content is not silently removed from the comparison',()=>{
 for(const tag of ['IMG','VIDEO','TABLE','OL','LI','SCRIPT'])assert.throws(()=>readEditorText(e('DIV',e(tag))),/content-unverified/);
});
