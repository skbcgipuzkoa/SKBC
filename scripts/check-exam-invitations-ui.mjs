import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
let admin = true, sends = 0, reads = 0, publicInvitation;
const action = () => { sends++; };
const snapshot = { name: 'Synthetic Child', email: 'family@example.test', memberClass: 'kids', targetGrade: 'AMARILLO', callKey: '2099-12-01', examDate: '2099-12-20' };
const invitation = { id: 'one', exam_event_id: 'event', snapshot, subject: 'Synthetic subject', body: 'Immutable preview text', exam_fee: 10, belt_fee: 5, delivery_status: 'draft', response: null, message: null };
const batch = { id: 'batch', exam_date: '2099-12-20', invitations: [invitation] };
const services = { getExamInvitationBatch: async () => { reads++; return batch; }, listExamInvitationBatches: async () => [], listExamInvitationResponses: async () => [invitation], getPublicExamInvitation: async () => publicInvitation };
const mocks = {
  '@/lib/auth': { hasInternalAccess: async () => admin },
  'next/navigation': { redirect: (url) => { throw new Error(`REDIRECT:${url}`); } },
  '@/app/components/SidebarNav': { SidebarNav: () => null },
  '@/lib/exam-invitations': services,
  '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ returns: async () => ({ data: [{ id: 'one', family_email: snapshot.email }], error: null }) }) }) }) }) },
  '@/lib/exam-outlook-data': { loadExamOutlooks: async () => new Map([['one', { memberId: 'one', name: snapshot.name, memberClass: 'kids', targetGrade: 'AMARILLO', callDate: snapshot.callKey, candidate: true, preparationCandidate: true, currentReady: false, classification: 'notyet', deficits: ['Synthetic deficit'] }]]) },
  '@/lib/exam-calls-data': { getUpcomingExamCalls: async () => [{ id: 'call', call_date: snapshot.callKey, title: 'Invierno' }] },
  '@/lib/exam-call': { resolveCallFilter: () => ({ value: 'next', callDate: snapshot.callKey, all: false }) },
  './actions': new Proxy({}, { get: () => action }),
  '@/app/notificaciones/examenes/actions': new Proxy({}, { get: () => action }),
};
function load(file) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, require: (name) => {
    if (name.endsWith('.css')) return {};
    if (name in mocks) return mocks[name];
    if (name === './CandidatePicker') return load('src/app/notificaciones/examenes/CandidatePicker.tsx');
    if (name === './responses') return load('src/app/notificaciones/examenes/responses.tsx');
    return require(name);
  }, Date, Map, Set, process, console });
  return module.exports;
}
const page = load('src/app/notificaciones/examenes/page.tsx').default;
admin = false;
await assert.rejects(page({ searchParams: Promise.resolve({ batch: 'batch' }) }), /REDIRECT:\/skbc-interno/);
assert.equal(reads, 0, 'unauthenticated preview must not read invitations');
admin = true;
const preview = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ batch: 'batch' }) }));
assert.match(preview, /Immutable preview text/);
assert.match(preview, /family@example.test/);
assert.match(preview, /Preparación con refuerzo necesario/);
assert.match(preview, /<input(?=[^>]*name="examDate")(?=[^>]*required)[^>]*>/);
assert.match(preview, /Enviar ahora/);
assert.equal(sends, 0, 'GET preview must never invoke any action');
assert.doesNotMatch(preview, /Registrar pago|payment_status/);
const publicModule = load('src/app/convocatoria/[token]/page.tsx');
assert.equal(publicModule.metadata.referrer, 'no-referrer');
assert.equal(publicModule.metadata.robots.index, false);
const publicPage = publicModule.default;
const renderPublic = async () => renderToStaticMarkup(await publicPage({ params: Promise.resolve({ token: 'synthetic' }), searchParams: Promise.resolve({}) }));
publicInvitation = null;
assert.match(await renderPublic(), /Invitación no disponible/);
publicInvitation = { ...invitation, currentExamDate: '2099-12-22', expired: false };
let html = await renderPublic();
assert.match(html, /Fecha actual del examen: 2099-12-22/);
assert.match(html, /10 € \+ cinturón 5 € = 15 €/);
assert.match(html, /<button(?=[^>]*name="response")(?=[^>]*value="accepted")[^>]*>/);
assert.match(html, /<button(?=[^>]*name="response")(?=[^>]*value="deferred")[^>]*>/);
assert.match(html, /maxLength="2000"/);
assert.match(html, /en mano/);
assert.doesNotMatch(html, /family@example.test/);
publicInvitation = { ...publicInvitation, exam_fee: 15 };
assert.match(await renderPublic(), /15 € \+ cinturón 5 € = 20 €/);
publicInvitation = { ...publicInvitation, expired: true };
html = await renderPublic();
assert.match(html, /ha caducado/);
assert.doesNotMatch(html, /name="response"/);
publicInvitation = { ...publicInvitation, response: 'accepted', message: 'Synthetic message' };
html = await renderPublic();
assert.match(html, /reserva añadida al examen/);
assert.match(html, /Synthetic message/);
assert.doesNotMatch(html, /name="response"/);
assert.equal(sends, 0, 'all SSR paths must remain read-only');
console.log('Invitation UI SSR regressions passed (auth, preview, fees, current date, privacy, expired/missing/response and no sends).');


// Delivery retry controls are available only for safely failed SMTP attempts.
invitation.delivery_status = 'failed';
let retryPreview = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ batch: 'batch' }) }));
assert.match(retryPreview, /Reintentar solo los envíos fallidos/);
assert.match(retryPreview, /name="retryFailed" value="true"/);
invitation.delivery_status = 'sending';
retryPreview = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ batch: 'batch' }) }));
assert.match(retryPreview, /Entrega sin confirmar/);
assert.doesNotMatch(retryPreview, /name="retryFailed"/);
assert.equal(sends, 0);
console.log('Failed-only retry and unconfirmed-delivery SSR regressions passed.');
const { ExamCallAttribution } = load('src/app/examenes/components/ExamCallAttribution.tsx');
assert.equal(renderToStaticMarkup(React.createElement(ExamCallAttribution, { event: { exam_date: '2026-01-20' } })), '', 'unknown history must not be attributed');
assert.match(renderToStaticMarkup(React.createElement(ExamCallAttribution, { event: { exam_date: '2027-01-20', call_month: '2026-12', is_retake: false } })), /Convocatoria 2026-12/);
assert.match(renderToStaticMarkup(React.createElement(ExamCallAttribution, { event: { exam_date: '2027-02-20', call_month: '2027-02', is_retake: true } })), /Recuperación · convocatoria 2027-02/);
console.log('Explicit exam call attribution SSR regressions passed.');
publicInvitation = { ...publicInvitation, expired: false, response: null };
const errorHtml = renderToStaticMarkup(await publicPage({ params: Promise.resolve({ token: 'synthetic' }), searchParams: Promise.resolve({ error: 'sensitive-raw-error' }) }));
assert.match(errorHtml, /No se pudo registrar tu respuesta/);
assert.doesNotMatch(errorHtml, /sensitive-raw-error/);
assert.match(errorHtml, /Sí, me inscribo/);
assert.match(errorHtml, /Lo dejo para la siguiente convocatoria/);
const resultHtml = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ sent: '1', failed: '0', unconfirmed: '2' }) }));
assert.match(resultHtml, /Enviados confirmados: 1. Fallidos: 0. Entregas sin confirmar: 2/);
assert.equal(sends, 0);
console.log('Safe response errors, exact response labels and unconfirmed-delivery summary regressions passed.');
const invitationCss = fs.readFileSync('src/app/notificaciones/examenes/invitations.css', 'utf8');
assert.match(preview, /main exam-invitations-main/);
assert.match(invitationCss, /\.exam-invitations-main \.filters\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto/);
assert.match(invitationCss, /\.exam-invitations-main \.filters select\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0/);
assert.match(invitationCss, /\.exam-invitations-main \.filters label\s*\{[^}]*min-width:\s*0/);
assert.match(invitationCss, /@media \(max-width: 600px\)[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
console.log('Scoped mobile invitation-filter layout regressions passed.');
