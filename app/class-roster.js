// One existing roster store shared by classroom tools; no duplicate roster keys.
window.ClassRoster={
 key:()=>`${academicYear()}:${settings.grade||''}:${settings.classroom||''}`,
 get(){
  const key=this.key(),rosters=read('classRosters',{});
  if(!rosters[key]){
   const legacy=read('randomPicker',{})[`${settings.grade||''}:${settings.classroom||''}`];
   if(legacy?.students){rosters[key]={students:legacy.students};put('classRosters',rosters);}
  }
  return rosters[key]?.students||[];
 },
 save(students){
  const rosters=read('classRosters',{}),key=this.key();
  rosters[key]={students};
  const saved=put('classRosters',rosters);
  document.dispatchEvent(new CustomEvent('class-roster-changed',{detail:{key}}));
  return saved;
 }
};
