import fs from "node:fs";

const files = {
  nav: fs.readFileSync("src/components/class-section-nav.tsx", "utf8"),
  dojo: fs.readFileSync("src/app/dojo/[legacyId]/page.tsx", "utf8"),
  classes: fs.readFileSync("src/app/clases/[legacyId]/page.tsx", "utf8"),
  css: fs.readFileSync("src/app/globals.css", "utf8"),
};
const saveCurrentBody = files.nav.match(/function saveCurrent\(\) \{([\s\S]*?)\n  \}\n\n  function discardAndContinue/)?.[1] ?? "";

const checks = [
  ["shared navigation renders a contextual action bar", /class-context-actions/.test(files.nav)],
  ["contextual actions include previous, save, next, and close controls", ["Anterior", "Guardar", "Siguiente", "Cerrar clase"].every((label) => files.nav.includes(label))],
  ["the shared save control submits the active form", /activeForm\.requestSubmit\(\)/.test(files.nav)],
  ["save targets exactly one explicitly marked primary form", /querySelectorAll<HTMLFormElement>\(`form\[data-class-primary-form=[^`]+form:has\(\[data-class-primary-form=[^`]+`\)[\s\S]*forms\.length === 1/.test(files.nav)],
  ["global save is gated by an existing active primary form", /const \[hasActivePrimaryForm, setHasActivePrimaryForm\] = useState\(false\)/.test(files.nav) && /setHasActivePrimaryForm\(Boolean\(findActiveForm\(current\)\)\)/.test(files.nav) && /canSave && hasActivePrimaryForm/.test(files.nav)],
  ["dialog save validates and submits its single dirty form", /function saveCurrent\(\) \{[\s\S]*const activeForm = dirtyForms\[0\];[\s\S]*if \(!activeForm\) return;[\s\S]*submitPrimaryForm\(activeForm\);[\s\S]*\}/.test(files.nav)],
  ["dialog save does not replace the dirty form with the section primary form", !saveCurrentBody.includes("findActiveForm(current)")],
  ["dirty tracking includes explicitly marked forms without returnTo", /form\.querySelector\('\[data-class-primary-form\]'\)/.test(files.nav)],
  ["invalid primary forms remain dirty and report validation errors", /if \(!activeForm\.checkValidity\(\)\)[\s\S]*activeForm\.reportValidity\(\)[\s\S]*return;[\s\S]*activeForm\.requestSubmit\(\)/.test(files.nav)],
  ["save does not clear dirty before validation or submission", !/activeForm\.dataset\.classDirty\s*=\s*"false"/.test(files.nav)],
  ["submit events never clear dirty state before navigation succeeds", !/clearDirtyAfterValidSubmit|addEventListener\("submit"|dataset\.classDirty\s*=\s*"false";\s*\n\s*activeForm\.requestSubmit/.test(files.nav)],
  ["dirty state is only cleared by explicit discard", (files.nav.match(/dataset\.classDirty\s*=\s*"false"/g) ?? []).length === 1 && /function discardAndContinue\(\)[\s\S]*dataset\.classDirty = "false"/.test(files.nav)],
  ["dirty-change dialog has an accessible heading association", /<dialog[^>]*aria-labelledby="class-navigation-dialog-title"/.test(files.nav) && /<h2 id="class-navigation-dialog-title">/.test(files.nav)],
  ["normal saves do not rewrite returnTo before submission", !/returnTo\.value\s*=/.test(files.nav)],
  ["the action bar has mobile safe-area spacing", /class-context-actions[\s\S]*env\(safe-area-inset-bottom\)/.test(files.css)],
  ["mobile pages reserve space for the fixed action bar", /@media\s*\(max-width:\s*760px\)[\s\S]*class-workspace-with-actions[\s\S]*padding-bottom/.test(files.css)],
  ["Dojo child attendance saves in child attendance", /name="returnTo" value=\{`\/dojo\/\$\{mainClass\.legacy_id \?\? legacyId\}\?step=kids&saved=kids`\}/.test(files.dojo)],
  ["Dojo adult techniques save in adult techniques", /name="returnTo" value=\{`\/dojo\/\$\{adultClass\.legacy_id \?\? legacyId\}\?step=techniques&saved=techniques`\}/.test(files.dojo)],
  ["Dojo adult attendance saves in adult attendance", /name="returnTo" value=\{`\/dojo\/\$\{adultClass\.legacy_id \?\? legacyId\}\?step=adults&saved=adults`\}/.test(files.dojo)],
  ["Dojo declares a primary form marker for every editable section", ["kids-attendance", "kids-technical", "adult-technical", "adult-attendance"].every((section) => files.dojo.includes(`"${section}"`))],
  ["Dojo child attendance is primary only while children are pending", /pendingKids\.length \? <input type="hidden" data-class-primary-form="kids-attendance" \/> : null/.test(files.dojo)],
  ["Dojo adult attendance is primary only while adults are pending", /data-class-primary-form=\{pendingAdults\.length \? "adult-attendance" : undefined\}/.test(files.dojo)],
  ["Dojo adult plan is primary only when the grouped plan is populated", /data-class-primary-form=\{groupedPlan\.length \? "adult-technical" : undefined\}/.test(files.dojo)],
  ["Dojo primary save labels do not promise automatic advancement", !/Guardar (?:niños|ninos|técnicas|tecnicas|adultos)[^<\n]*(?:seguir|pasar|revisar)/i.test(files.dojo)],
  ["full-class adult technical saves remain in the technical section", /name="returnTo" value=\{isCorrectionMode \?[^:]+: `\/clases\/\$\{legacyId\}\?step=tecnicas&saved=techniques#plan-tecnico`\}/.test(files.classes)],
  ["full-class marks primary forms for all editable sections", ["kids-attendance", "kids-technical", "adult-technical", "adult-attendance"].every((section) => files.classes.includes(`data-class-primary-form="${section}"`))],
  ["full-class early child attendance is primary only with pending children", /data-class-primary-form=\{pendingKidsDayMembers\.length \? "kids-attendance" : undefined\}/.test(files.classes)],
  ["full-class grouped attendance is primary only with editable pending attendees", /const hasPendingAttendance = attendancePanelClasses\.some[\s\S]*hasPendingAttendance \?[\s\S]*data-class-primary-form="kids-attendance"[\s\S]*data-class-primary-form="adult-attendance"/.test(files.classes)],
  ["full-class quick attendance is primary only with pending members", /data-class-primary-form=\{pendingClassMembers\.length \? \(clase\.class_group === "kids" \? "kids-attendance" : "adult-attendance"\) : undefined\}/.test(files.classes)],
  ["full-class adult plan is primary only when editable and populated", /canEditClosedClass && groupedPlan\.length \? <input type="hidden" data-class-primary-form="adult-technical" \/> : null/.test(files.classes)],
  ["full-class child attendance has an in-place returnTo", /className="attendance-day-form"[\s\S]*name="returnTo" value=\{`\/clases\/\$\{legacyId\}\?saved=kids-attendance#asistencia`\}/.test(files.classes)],
  ["correction section is normalized against available sections", /availableCorrectionSections\.includes\(requestedCorrectionSection\)[\s\S]*availableCorrectionSections\[0\]/.test(files.classes)],
  ["correction normalization is disabled outside correction mode", /const correctionSection = isCorrectionMode\s*\? availableCorrectionSections\.includes\(requestedCorrectionSection\)[\s\S]*: "";/.test(files.classes)],
  ["open combined classes derive adult technique visibility from combinedStep", /const showAdultTechniques =[\s\S]*!isCorrectionMode[\s\S]*combinedStep === "techniques"/.test(files.classes)],
  ["correction mode renders the shared navigation", /<ClassSectionNav[\s\S]*links=\{classSectionLinks\}[\s\S]*correctionLabel=\{isCorrectionMode \? "En correccion" : undefined\}/.test(files.classes)],
  ["correction links use the shared ordered section model", /const classSectionLinks[\s\S]*isCorrectionMode[\s\S]*kids-attendance[\s\S]*kids-technical[\s\S]*adult-technical[\s\S]*adult-attendance[\s\S]*close/.test(files.classes)],
  ["correction close copy is explicit", files.classes.includes("Guardar correcciones y cerrar clase")],
];

const failures = checks.filter(([, passed]) => !passed);

if (failures.length) {
  for (const [message] of failures) console.error(`FAIL: ${message}`);
  process.exit(1);
}

console.log(`PASS: ${checks.length} class free-editing structural checks`);
