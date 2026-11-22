import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { renderFamilyBillingPdf } from '../src/lib/family-billing-pdf.ts';
import { calculateFamilyBilling } from '../src/lib/family-billing.ts';
fs.mkdirSync('output/pdf',{recursive:true});
for(const count of [1,2,3,4,6,8,12])for(const trial of [true,false]){
 const members=Array.from({length:count},(_,i)=>({id:String(i),legacy_id:String(i),display_name:`ALUMNO ${i+1} APELLIDO COMPUESTO DE EJEMPLO`,class:i%2?'adults':'kids',status:'active',joined_on:'2026-10-01',free_trial_started_on:trial?'2026-10-01':null,free_trial_ends_on:null,free_trial_enabled:trial}));
 if(count===6)members[0].display_name='ALUMNO CON NOMBRE Y DOS APELLIDOS MUY LARGOS PARA COMPROBAR QUE NO SE CORTA NI SE SOLAPA CON EL CAMPO DNI';
 const billing=calculateFamilyBilling(members);
 const bytes=await renderFamilyBillingPdf({unitId:null,unitName:null,billing});
 const pdf=await PDFDocument.load(bytes);
 assert.equal(pdf.getPageCount(),1,`${count} members trial=${trial}`);
 assert.deepEqual(pdf.getPage(0).getSize(),{width:595,height:842});
 const fragments=[];
 const seen=new Set();
 for(const [,object] of pdf.context.enumerateIndirectObjects()){
  if(!(object instanceof PDFRawStream))continue;
  let content;try{content=Buffer.from(decodePDFRawStream(object).decode()).toString('latin1');}catch{continue;}
  if(seen.has(content))continue;seen.add(content);
  for(const match of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g))fragments.push(Buffer.from(match[1],'hex').toString('latin1'));
 }
 const text=fragments.join('').replace(/\s+/g,'');
 for(const member of members)assert.ok(text.includes(member.display_name.replace(/\s+/g,'')),member.display_name);
 for(const label of ['IBAN completo','Firma del titular de la cuenta','Firma del tesorero del club','NUEVA CUOTA MENSUAL UNIFICADA','Ley Organica 3/2018',`${(billing.totalCents/100).toFixed(2).replace('.',',')} EUR`])assert.ok(text.includes(label.replace(/\s+/g,'')),label);
 assert.ok((text.match(/DNI:/g)||[]).length>=count);
 fs.writeFileSync(`output/pdf/hoja-familiar-${count}-${trial?'con':'sin'}-promocion.pdf`,bytes);
}
console.log('Single-page A4 PDFs preserve all members, DNI fields, amounts, privacy and signatures: 1–12 members, with/without trial, long names.');
