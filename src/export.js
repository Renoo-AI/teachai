// A dedicated document renderer: no editor controls, remote assets or AI calls.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const katex = require('katex');
const TPL = require('../public/templates');
const { plainToMath, texToUnicode } = require('../public/math');
const root = path.join(__dirname, '..');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const str = (v, n=30000) => String(v ?? '').slice(0,n);

function imageData(value) {
  const match = /^data:image\/(png|jpeg|webp|svg\+xml);base64,([a-z0-9+/=\r\n]+)$/i.exec(String(value || ''));
  if(!match || match[2].length>=5e6)return null;
  const data=Buffer.from(match[2],'base64');
  if(match[1]==='svg+xml' && /<script|<foreignObject|\bon\w+\s*=|(?:href|src)\s*=\s*['"](?:https?:|\/\/|javascript:)/i.test(data.toString('utf8')))return null;
  return {type:match[1],data,url:match[0]};
}

function snapshot(input, record) {
  const o = input && typeof input === 'object' ? input : record;
  const exam={};
  for (const key of ['title','school','teacher','className','subject','examDate','year','duration','coef','instructions','support','design']) exam[key]=str(o[key], key==='support'?60000:1000);
  exam.tpl=record.tpl || {lang:'en'};
  exam.paper=o.paper==='Letter'?'Letter':'A4'; exam.ministry=!!o.ministry; exam.answerSpace=o.answerSpace!==false;
  exam.logo=imageData(o.logo)?.url || null;
  exam.groups=(Array.isArray(o.groups)?o.groups:[]).slice(0,30).map(g=>({title:str(g?.title,200)}));
  if (!Array.isArray(o.questions) || o.questions.length>100) throw Object.assign(new Error('This exam cannot be exported. Use up to 100 questions.'),{status:400});
  exam.questions=o.questions.map(q=>({
    type:['mcq','tf','short','essay'].includes(q?.type)?q.type:'short',prompt:str(q?.prompt),answer:str(q?.answer),source:str(q?.source,2000),rubric:str(q?.rubric),
    choices:(Array.isArray(q?.choices)?q.choices:[]).slice(0,6).map(c=>str(c,4000)),
    group:Number.isInteger(q?.group)?Math.max(0,Math.min(exam.groups.length-1,q.group)):0,
    points:Math.max(0,Math.min(100,Number(q?.points)||0)), image:imageData(q?.image)?.url || null
  }));
  return exam;
}

let css;
function embeddedCss() {
  if (css) return css;
  const font=(pkg,file,family,weight=400)=>`@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${fs.readFileSync(path.join(root,'node_modules','@fontsource',pkg,'files',file)).toString('base64')}) format('woff2');}`;
  let mathCss=fs.readFileSync(path.join(root,'node_modules/katex/dist/katex.min.css'),'utf8');
  mathCss=mathCss.replace(/src:([^;}]+)/g,(all,sources)=>{
    const m=/url\((fonts\/[^)]+\.woff2)\) format\("woff2"\)/.exec(sources);
    return m?'src:url(data:font/woff2;base64,'+fs.readFileSync(path.join(root,'node_modules/katex/dist',m[1])).toString('base64')+') format("woff2")':all;
  });
  css=font('tinos','tinos-latin-400-normal.woff2','Paper')+font('tinos','tinos-latin-700-normal.woff2','Paper',700)+font('tinos','tinos-latin-ext-400-normal.woff2','Paper')+font('amiri','amiri-arabic-400-normal.woff2','Arabic')+font('amiri','amiri-arabic-700-normal.woff2','Arabic',700)+mathCss+fs.readFileSync(path.join(root,'public/print.css'),'utf8');
  return css;
}

function rich(value) {
  const text=plainToMath(str(value)); let last=0,out='',m; const re=/\$([^$\n]+)\$/g;
  while((m=re.exec(text))) {
    out+=esc(text.slice(last,m.index));
    try { out+='<span dir="ltr" class="formula">'+katex.renderToString(m[1],{throwOnError:false,trust:false,strict:false,output:'html',maxExpand:300})+'</span>'; }
    catch { out+=esc(m[1]); }
    last=re.lastIndex;
  }
  return out+esc(text.slice(last));
}

function html(exam, mode='student') {
  const lang=exam.tpl.lang || 'en', L=TPL.L[lang] || TPL.L.en, key=mode==='key';
  const total=exam.questions.reduce((s,q)=>s+q.points,0);
  const field=(label,value)=>`<div><b>${esc(label)} :</b> ${esc(value||'................')}</div>`;
  let body=exam.ministry?`<div class="ministry">${esc(L.republic)} · ${esc(L.ministry)}</div>`:'';
  body+=`<header class="paper-header"><div>${exam.logo?`<img class="logo" src="${exam.logo}" alt="">`:''}<strong>${esc(exam.school||TPL.schoolPlaceholder(exam.tpl.level||'b9',lang))}</strong>${field(L.year,exam.year)}${field(L.teacher,exam.teacher)}</div><div class="heading"><h1>${esc(exam.title)}</h1>${field(L.subject,exam.subject)}</div><div>${field(L.classShort,exam.className)}${field(L.duration,exam.duration)}${field(L.coef,exam.coef)}${exam.examDate?field(L.date,exam.examDate):''}</div></header>`;
  body+=`<div class="student-row"><div>${esc(L.name)} : <span class="name-line"></span> ${esc(L.num)} : ........</div><div class="note">${esc(L.note)}<br>....... / ${total}</div></div>`;
  if(exam.instructions) body+=`<p class="instructions">${rich(exam.instructions)}</p>`;
  if(exam.support) body+=`<section class="support"><b>${esc(L.support)}</b><div>${rich(exam.support)}</div></section>`;
  let group=null,n=0;
  exam.questions.forEach((q,i)=>{
    if(exam.groups.length && q.group!==group) {
      group=q.group; n=0;
      const points=exam.questions.filter(x=>x.group===group).reduce((s,x)=>s+x.points,0);
      body+=`<h2>${esc(exam.groups[group]?.title || L.exercise(group+1))}<span>${esc(L.pts(points))}</span></h2>`;
    }
    n++;
    body+=`<section class="question"><div class="question-head"><b>${esc(L.qnum(exam.groups.length?n:i+1))}</b><div class="prompt">${rich(q.prompt)}</div><i class="points">${esc(L.pts(q.points))}</i></div>`;
    if(q.image) body+=`<img class="question-image" src="${q.image}" alt="">`;
    if(q.type==='mcq') body+='<div class="choices">'+q.choices.map((c,j)=>`<div><span class="checkbox">${key&&c===q.answer?'✓':''}</span> ${esc(L.letters[j]+'.')} ${rich(c)}</div>`).join('')+'</div>';
    else if(q.type==='tf') body+=`<div class="choices tf"><div>□ ${esc(L.tf[0])}</div><div>□ ${esc(L.tf[1])}</div></div>`;
    else if(exam.answerSpace&&!key) body+='<div class="answer-lines">'+Array.from({length:q.type==='essay'?7:3},()=>'<div></div>').join('')+'</div>';
    if(key) body+=`<div class="answer"><b>${esc(L.answer)} :</b> ${rich(q.type==='tf'?L.tf[q.answer==='False'?1:0]:q.answer)}${q.rubric?`<div>${esc(L.rubric)} : ${rich(q.rubric)}</div>`:''}${q.source?`<div class="source">${esc(L.from)} : ${rich(q.source)}</div>`:''}</div>`;
    body+='</section>';
  });
  return `<!doctype html><html lang="${esc(lang)}" dir="${L.dir}"><head><meta charset="utf-8"><title>${esc(exam.title)}</title><style>${embeddedCss()}@page{size:${exam.paper==='Letter'?'Letter':'A4'};margin:14mm 15mm 16mm}</style></head><body class="design-${esc(TPL.DESIGNS.includes(exam.design)?exam.design:'college')}">${body}</body></html>`;
}

let browserPromise;
function browserPath() {
  const candidates=[process.env.TEACHAI_BROWSER_PATH, process.env.PROGRAMFILES&&path.join(process.env.PROGRAMFILES,'Google/Chrome/Application/chrome.exe'),process.env['PROGRAMFILES(X86)']&&path.join(process.env['PROGRAMFILES(X86)'],'Microsoft/Edge/Application/msedge.exe'), '/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  return candidates.find(p=>p&&fs.existsSync(p));
}
// Some hosts (restricted Windows sessions, containers) stop Chrome/Edge's sandbox from starting and the browser
// exits at once. The second attempt drops the sandbox; it only ever loads our own HTML with JavaScript and the
// network switched off (see pageFor), so that is safe here.
const LAUNCH_ARGS=[
  ['--disable-background-networking','--disable-extensions','--no-first-run','--no-default-browser-check'],
  ['--disable-background-networking','--disable-extensions','--no-first-run','--no-default-browser-check','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-zygote'],
];
async function browser() {
  if(!browserPromise) browserPromise=(async()=>{
    const executablePath=browserPath();
    if(!executablePath) throw Object.assign(new Error('PDF export needs Chrome or Edge on the server. Set TEACHAI_BROWSER_PATH to the browser executable.'),{status:503});
    const puppeteer=await import('puppeteer-core');
    let lastErr;
    for(const args of LAUNCH_ARGS) {
      try {
        const b=await puppeteer.launch({executablePath,headless:true,args,timeout:30000});
        b.on('disconnected',()=>{browserPromise=null;}); return b;
      } catch(e) { lastErr=e; console.warn('[export] browser launch failed'+(args.includes('--no-sandbox')?' without sandbox':'')+': '+String(e.message).split('\n')[0]); }
    }
    throw Object.assign(new Error('The PDF engine could not start on this computer. Use Print and choose "Save as PDF".'),{status:503,cause:lastErr});
  })().catch(e=>{browserPromise=null;throw e;});
  return browserPromise;
}
// Start the browser in the background so the first download is not slow.
function warm(){ if(browserPath()) browser().catch(()=>{}); }
async function pageFor(content) {
  const page=await (await browser()).newPage();
  try {
    await page.setRequestInterception(true);
    page.on('request',req=>/^(data:|about:)/.test(req.url())?req.continue():req.abort());
    await page.setJavaScriptEnabled(false);
    await page.setContent(content,{waitUntil:'load',timeout:15000});
    return page;
  } catch(e) { await page.close(); throw e; }
}
async function pdf(exam,mode) {
  const page=await pageFor(html(exam,mode));
  try { return Buffer.from(await page.pdf({format:exam.paper,preferCSSPageSize:true,printBackground:true,waitForFonts:true,timeout:30000,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font-size:9px;text-align:center;width:100%;color:#555"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'})); }
  finally { await page.close(); }
}

async function rasterImage(im,width,height) {
  const page=await pageFor(`<style>body{margin:0}img{max-width:${width}px;max-height:${height}px;object-fit:contain;display:block}</style><img src="${im.url}">`);
  try { const item=await page.$('img'),box=await item.boundingBox();return {data:await item.screenshot({type:'png'}),width:box.width,height:box.height}; }
  finally { await page.close(); }
}

async function docx(exam,mode) {
  const {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,WidthType,AlignmentType,BorderStyle,ImageRun,Footer,PageNumber}=require('docx');
  const L=TPL.L[exam.tpl.lang]||TPL.L.en,rtl=L.dir==='rtl',key=mode==='key';
  const font=rtl?'Arial':'Times New Roman', size=rtl?26:22;
  const textRuns=(value,props={})=>str(value).split('\n').map((line,i)=>new TextRun({text:line,break:i?1:undefined,font,size,rightToLeft:rtl,...props}));
  let mathPage, noBrowser=false;
  const mathCache=new Map();
  // Formulas become images rendered by the browser. If the browser cannot start, Word still gets a document:
  // formulas fall back to Unicode text (x², H₂O, √) and pictures are left out.
  async function browserOr(fallback,work) {
    if(noBrowser)return fallback;
    try { return await work(); }
    catch(e) { if(e.status!==503)throw e; noBrowser=true; return fallback; }
  }
  async function runs(value,props={}) {
    const out=[];let last=0,m;const re=/\$([^$\n]+)\$/g;const text=plainToMath(str(value));
    while((m=re.exec(text))) {
      out.push(...textRuns(text.slice(last,m.index),props));
      if(!mathCache.has(m[1])) mathCache.set(m[1],await browserOr(null,async()=>{
        if(!mathPage) mathPage=await pageFor('<style>'+embeddedCss()+'body{margin:0;padding:8px;font-size:20px}</style><div id="math"></div>');
        // Only server-generated KaTeX markup reaches this isolated renderer.
        await mathPage.setJavaScriptEnabled(true);
        await mathPage.evaluate(markup=>{document.getElementById('math').innerHTML=markup;},rich('$'+m[1]+'$'));
        const item=await mathPage.$('#math .formula');const box=await item.boundingBox();
        return {data:await item.screenshot({type:'png'}),width:Math.max(1,box.width*.7),height:Math.max(1,box.height*.7)};
      }));
      const image=mathCache.get(m[1]);
      out.push(image?new ImageRun({type:'png',data:image.data,transformation:{width:Math.min(600,image.width),height:image.height*Math.min(1,600/image.width)}}):new TextRun({text:texToUnicode(m[1]),font:'Cambria Math',size,...props}));
      last=re.lastIndex;
    }
    out.push(...textRuns(text.slice(last),props));return out;
  }
  const para=(children,extra={})=>new Paragraph({children,bidirectional:rtl,alignment:rtl?AlignmentType.RIGHT:AlignmentType.LEFT,spacing:{after:90,line:rtl?330:285},...extra});
  const line=(v,props={},extra={})=>para(textRuns(v,props),extra);
  const children=[];
  try {
    const border={style:BorderStyle.SINGLE,size:6,color:'333333'};
    const cell=(lines,width)=>new TableCell({width:{size:width,type:WidthType.PERCENTAGE},margins:{top:100,bottom:100,left:120,right:120},children:lines});
    const identity=[line(exam.school||TPL.schoolPlaceholder(exam.tpl.level||'b9',exam.tpl.lang),{bold:true}),line(L.year+' : '+exam.year,{size:18}),line(L.teacher+' : '+(exam.teacher||'................'),{size:18})];
    const logo=imageData(exam.logo);if(logo){const image=await browserOr(null,()=>rasterImage(logo,48,48));if(image)identity.unshift(para([new ImageRun({type:'png',data:image.data,transformation:{width:image.width,height:image.height}})]));}
    if(exam.ministry) children.push(line(L.republic+' · '+L.ministry,{size:18},{alignment:AlignmentType.CENTER}));
    children.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},borders:{top:border,bottom:border,left:border,right:border,insideVertical:border,insideHorizontal:border},rows:[new TableRow({cantSplit:true,children:[cell(identity,32),cell([line(exam.title,{bold:true,size:28},{alignment:AlignmentType.CENTER}),line(L.subject+' : '+exam.subject,{size:20},{alignment:AlignmentType.CENTER})],36),cell([line(L.classShort+' : '+exam.className,{size:18}),line(L.duration+' : '+exam.duration,{size:18}),line(L.coef+' : '+exam.coef,{size:18}),...(exam.examDate?[line(L.date+' : '+exam.examDate,{size:18})]:[])],32)]})]}));
    children.push(line(L.name+' : ........................................................     '+L.num+' : ........      / '+exam.questions.reduce((s,q)=>s+q.points,0),{size:20},{spacing:{before:150,after:160}}));
    if(exam.instructions)children.push(para(await runs(exam.instructions),{spacing:{after:160}}));
    if(exam.support) {children.push(line(L.support,{bold:true},{keepNext:true}));children.push(para(await runs(exam.support)));}
    let group=null,n=0;
    for(const [i,q] of exam.questions.entries()) {
      if(exam.groups.length&&q.group!==group) {
        group=q.group;n=0;const points=exam.questions.filter(x=>x.group===group).reduce((s,x)=>s+x.points,0);
        children.push(line((exam.groups[group]?.title||L.exercise(group+1))+'   ('+L.pts(points)+')',{bold:true,size:25},{keepNext:true,spacing:{before:230,after:120},border:{bottom:border}}));
      }
      n++;
      children.push(para([...textRuns(L.qnum(exam.groups.length?n:i+1)+' ',{bold:true}),...await runs(q.prompt),...textRuns('  ('+L.pts(q.points)+')',{size:18,italics:true})],{keepNext:true}));
      const im=imageData(q.image);
      if(im) {
        const image=await browserOr(null,()=>rasterImage(im,600,240));
        if(image)children.push(para([new ImageRun({type:'png',data:image.data,transformation:{width:image.width,height:image.height}})]));
      }
      if(q.type==='mcq')for(const [j,c] of q.choices.entries())children.push(para([...textRuns((key&&c===q.answer?'☑':'☐')+' '+L.letters[j]+'. '),...await runs(c)]));
      else if(q.type==='tf')children.push(line('☐ '+L.tf[0]+'      ☐ '+L.tf[1]));
      else if(exam.answerSpace&&!key)for(let j=0;j<(q.type==='essay'?7:3);j++)children.push(line('........................................................................................................',{color:'AAAAAA',size:18},{spacing:{after:90}}));
      if(key) {
        children.push(para([...textRuns(L.answer+' : ',{bold:true}),...await runs(q.type==='tf'?L.tf[q.answer==='False'?1:0]:q.answer)]));
        if(q.rubric)children.push(para([...textRuns(L.rubric+' : ',{bold:true}),...await runs(q.rubric)]));
        if(q.source)children.push(line(L.from+' : '+q.source,{size:18,color:'555555'}));
      }
    }
    const doc=new Document({creator:'Teach.ai',title:exam.title,styles:{default:{document:{run:{font,size},paragraph:{bidirectional:rtl}}}},sections:[{properties:{page:{size:exam.paper==='Letter'?{width:12240,height:15840}:{width:11906,height:16838},margin:{top:794,bottom:907,left:850,right:850}}},footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({children:[PageNumber.CURRENT],size:18})]})]})},children}]});
    return await Packer.toBuffer(doc);
  } finally {if(mathPage)await mathPage.close();}
}

const cache=new Map();let active=0;
async function render(exam,format,mode) {
  if(format==='html')return Buffer.from(html(exam,mode));
  const id=crypto.createHash('sha256').update(JSON.stringify({exam,format,mode})).digest('hex');
  const old=cache.get(id);if(old)return old;
  if(active>=2)throw Object.assign(new Error('Two documents are already being prepared. Try again in a moment.'),{status:429});
  active++;
  const pending=(format==='pdf'?pdf(exam,mode):docx(exam,mode)).catch(e=>{cache.delete(id);throw e;}).finally(()=>active--);
  cache.set(id,pending);if(cache.size>6)cache.delete(cache.keys().next().value);
  return pending;
}
async function close(){if(browserPromise){const p=browserPromise;browserPromise=null;try{await (await p).close();}catch{/* it never started */}}}
module.exports={snapshot,html,render,close,warm,rich,imageData};
