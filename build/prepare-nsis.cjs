// Preserve the published v1.8.4 same-directory upgrade fix in every local/CI build.
// The release was built with this change to electron-builder 26.15.3's NSIS template.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const builder=path.dirname(require.resolve('app-builder-lib/package.json'));
assert.equal(require(path.join(builder,'package.json')).version,'26.15.3','Re-audit NSIS templates before changing electron-builder');
const file=path.join(builder,'templates/nsis/include/installUtil.nsh');
const marker='  StrCpy $uninstallerFileNameTemp "$PLUGINSDIR\\old-uninstaller.exe"';
const patch=`  # Same-directory upgrades preserve the app profile and replace package files directly.
  # A legacy uninstaller may belong to a different installation scope/version.
  StrCmp $installationDir $INSTDIR 0 runLegacyUninstaller
  IfFileExists "$INSTDIR\\\${APP_EXECUTABLE_FILENAME}" 0 runLegacyUninstaller
  IfFileExists "$INSTDIR\\resources\\app.asar" 0 runLegacyUninstaller
    DetailPrint "Updating application files in the existing installation directory."
    StrCpy $R0 0
    ClearErrors
    Return
  runLegacyUninstaller:
`;
const original=fs.readFileSync(file,'utf8'),normalized=original.replace(/\r\n/g,'\n');
if(normalized.includes(patch+marker)){console.log('v1.8.4 NSIS upgrade fix already applied');}
else {
 assert.equal(normalized.split(marker).length,2,'Unexpected NSIS template');
 assert.ok(!normalized.includes('runLegacyUninstaller'),'Unknown existing installer patch');
 // Refuse to apply against an altered uninstall function.
 assert.ok(normalized.includes('!insertmacro readReg $installationDir "$rootKey" "${INSTALL_REGISTRY_KEY}" InstallLocation'));
 fs.writeFileSync(file,normalized.replace(marker,patch+marker));
 console.log('Applied published v1.8.4 NSIS same-directory upgrade fix');
}
