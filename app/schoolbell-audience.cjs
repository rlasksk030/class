'use strict';
// A required administrator can be the teacher themselves. Treat that as a
// separate, explicitly scoped permission; an empty student table is not enough.
function audienceVerified(c,grant,now=Date.now()){
 if(require('./schoolbell-test-authorization.cjs').testContext(c,grant,now))return true;
 if(c?.testClassApproved!==true||c.recipientsVerified!==true||c.students!==0||c.parents!==0)return false;
 const r=c.recipientEvidence;
 if(c.externalNotifications===false&&r?.mandatoryAdministrator!==true)return true;
 const n=c.notificationEvidence,p=grant?.selfNotice;
 return c.externalNotifications===true&&r?.known===true&&r.unfiltered===true&&r.empty===true&&
  r.mandatoryAdministrator===true&&c.adminCount===1&&n?.verified===true&&n.source==='observed-service-ui'&&
  n.kind==='current-teacher-only'&&n.actorKey===c.actorKey&&n.otherTargets===0&&
  Number.isFinite(n.observedAt)&&n.observedAt<=now&&now-n.observedAt<=15000&&
  p?.allowed===true&&p.actorKey===c.actorKey&&p.boardId===c.boardId&&p.schoolId===c.schoolId&&
  p.classKey===c.classKey&&typeof p.evidenceRef==='string'&&!!p.evidenceRef.trim();
}
module.exports={audienceVerified};
