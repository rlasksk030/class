'use strict';
const path=require('node:path');
const metadata=require('./package.json');
const validation=metadata.classroomValidation===true;
function userData(appData,testProfile){
 // A packaged validation build must never use a supplied production profile.
 return validation?path.join(appData,'classroom-dashboard-validation'):
  testProfile||path.join(appData,'classroom-dashboard');
}
module.exports={validation,userData};
