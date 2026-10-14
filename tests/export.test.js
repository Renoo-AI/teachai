const test=require('node:test');
const assert=require('node:assert/strict');
const JSZip=require('jszip');
const exporter=require('../src/export');
const record={tpl:{lang:'fr',level:'b9'},title:'Devoir de contrôle',school:'Collège pilote',teacher:'Mme Test',className:'9ème année',subject:'Mathématiques',duration:'1 heure',year:'2026/2027',coef:'1',design:'lycee',paper:'A4',instructions:'Justifiez les réponses.',groups:[{title:'Exercice 1'}],questions:[{type:'short',prompt:'Calculer $\\frac{3}{4}+\\frac{1}{4}$.',answer:'ANSWER_SENTINEL $1$',source:'SOURCE_SENTINEL',rubric:'RUBRIC_SENTINEL',points:20,group:0}],answerSpace:true};
test.after(()=>exporter.close());
test('print document escapes input and separates student and answer-key content',()=>{
  const exam=exporter.snapshot({...record,title:'<script>bad</script>',logo:'https://example.com/private.png'},record);
  assert.equal(exam.logo,null);
  const svg='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="30"><rect width="100" height="30" fill="green"/></svg>').toString('base64');
  assert.ok(exporter.imageData(svg));
  assert.equal(exporter.imageData('data:image/svg+xml;base64,'+Buffer.from('<svg onload="alert(1)"></svg>').toString('base64')),null);
  const student=exporter.html(exam,'student'),key=exporter.html(exam,'key');
  assert.ok(student.includes('&lt;script&gt;bad&lt;/script&gt;'));
  assert.ok(!student.includes('ANSWER_SENTINEL')&&!student.includes('SOURCE_SENTINEL')&&!student.includes('RUBRIC_SENTINEL'));
  assert.ok(key.includes('ANSWER_SENTINEL')&&key.includes('SOURCE_SENTINEL'));
  assert.ok(!student.includes('http://')&&!student.includes('https://'));
  assert.ok(student.includes('data:font/woff2;base64,'));
});
test('PDF is a real document and DOCX contains OOXML and rendered equations', {timeout:120000},async()=>{
  const exam=exporter.snapshot({...record,logo:'data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="30"><rect width="100" height="30" fill="green"/></svg>').toString('base64')},record);
  const pdf=await exporter.render(exam,'pdf','student');assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.length>5000);
  const doc=await exporter.render(exam,'docx','student');assert.equal(doc.subarray(0,2).toString(),'PK');
  const zip=await JSZip.loadAsync(doc);const xml=await zip.file('word/document.xml').async('string');
  assert.ok(xml.includes('Devoir de contrôle'));assert.ok(!xml.includes('ANSWER_SENTINEL'));assert.ok(!xml.includes('\\frac'));
  assert.ok(Object.keys(zip.files).some(f=>f.startsWith('word/media/')&&f.endsWith('.png')));
  const ar=exporter.snapshot({...record,tpl:{lang:'ar',level:'b9'},title:'فرض مراقبة',questions:[{type:'short',prompt:'عرّف التبخر.',answer:'ANSWER_SENTINEL',points:20,group:0}]},{...record,tpl:{lang:'ar',level:'b9'}});
  const arDoc=await exporter.render(ar,'docx','student');const arZip=await JSZip.loadAsync(arDoc);assert.match(await arZip.file('word/document.xml').async('string'),/<w:bidi\/>/);
});
