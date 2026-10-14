const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

test('HTTP creation, validation, private fields, editing and assistant scope', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teachai-test-'));
  Object.assign(process.env, { PORT:'0', TEACHAI_DATA_DIR:dir, NVIDIA_API_KEY:'', DEEPSEEK_TOKEN:'', AI_PROVIDER:'none', ACCESS_REQUIRED:'0' });
  const server = require('../src/server');
  if (!server.listening) await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = (url, body, method='POST', key) => fetch(base+url,{method,headers:{'content-type':'application/json',...(key?{'x-edit-key':key}:{})},body:body?JSON.stringify(body):undefined});
  const payload={lesson:'Evaporation turns liquid water into water vapour. The sun supplies energy that heats water and causes evaporation. Condensation turns water vapour into liquid droplets. Precipitation returns water to the ground as rain. Rivers carry water towards oceans.',header:{school:'Test school',teacher:'Test teacher'},answerSpace:false,options:{counts:{mcq:1,short:2},tpl:{level:'b9',subject:'svt',lang:'en',exercises:3}}};
  try {
    const r=await request('/api/exams/generate',payload); assert.equal(r.status,201); const created=await r.json();
    assert.equal(created.exam.school,'Test school'); assert.equal(created.exam.answerSpace,false);
    assert.equal(created.exam.questions.reduce((s,q)=>s+q.points,0),20);
    assert.equal(created.exam.lessonText,undefined); assert.equal(created.exam.editKeyHash,undefined);
    const url='/api/exams/'+created.id;
    assert.equal((await request(url,{title:'Forbidden'},'PUT')).status,403);
    const saved=await request(url,{...created.exam,title:'Edited'},'PUT',created.editKey); assert.equal(saved.status,200);
    assert.equal((await (await fetch(base+url)).json()).title,'Edited');
    const out=await request(url+'/assistant',{message:'Build a website',exam:created.exam},'POST',created.editKey);
    assert.equal(out.status,200); assert.deepEqual((await out.json()).actions,[]);
    const exported=await request(url+'/export',{format:'docx',mode:'student',exam:{...created.exam,title:'Latest unsaved title'}},'POST',created.editKey);
    assert.equal(exported.status,200);assert.match(exported.headers.get('content-type'),/wordprocessingml/);assert.equal(Buffer.from(await exported.arrayBuffer()).subarray(0,2).toString(),'PK');
    assert.equal((await request(url+'/export',{format:'pdf',exam:created.exam})).status,403);
    const stream=await request('/api/exams/generate?stream=1',payload);
    const events=(await stream.text()).trim().split('\n').map(JSON.parse);
    assert.equal(events[0].type,'stage');assert.equal(events.at(-1).type,'complete');assert.ok(events.at(-1).editKey);
    for (const counts of [{mcq:999},{short:-1},{short:1},{short:2.5},{mcq:30,short:30}]) {
      assert.equal((await request('/api/exams/generate',{...payload,options:{...payload.options,counts}})).status,400);
    }
    const css=await fetch(base+'/studio.css'); assert.equal(css.status,200);
  } finally {
    await new Promise(resolve=>server.close(resolve));
    await require('../src/export').close(); // the server warms the PDF browser at start-up
    // Delete only the exact disposable directory created by this test.
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'teachai-test-'));
    for (const name of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir,name));
    fs.rmdirSync(dir);
  }
});
