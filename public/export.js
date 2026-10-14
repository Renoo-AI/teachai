// Exports the current exam snapshot without depending on the editor DOM or remote assets.
// PDF and DOCX are built on the server. Printing loads the same print-ready document into a frame and prints
// that frame, so there is no popup to block and nothing heavy is rewritten into a new window.
(function () {
  var T=function(k){return I18N.t(k);}, busy=false, open=null;
  function node(tag,cls,key){var e=document.createElement(tag);e.className=cls||'';if(key)e.textContent=T(key);return e;}
  async function request(config,format,mode,signal){
    var response=await fetch('/api/exams/'+config.id+'/export',{method:'POST',headers:{'content-type':'application/json',...(config.key?{'x-edit-key':config.key}:{})},body:JSON.stringify({format:format,mode:mode,exam:config.key?config.exam():undefined}),signal:signal});
    if(!response.ok){var j={};try{j=await response.json();}catch(_){}throw Object.assign(new Error(j.error||T('export.failed')),{status:response.status});}
    return response;
  }
  function download(blob,name){
    var url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},60000);
  }
  function setBusy(button,on){
    if(!button)return;
    button.disabled=on;button.classList.toggle('is-busy',on);button.setAttribute('aria-busy',on?'true':'false');
  }
  async function save(config,format,mode,button){
    if(busy)return;busy=true;setBusy(button,true);
    config.toast&&config.toast(T('export.preparing'),'busy');
    var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},90000);
    try{
      var r=await request(config,format,mode,controller.signal),blob=await r.blob();
      download(blob,(/filename="([^"]+)"/.exec(r.headers.get('content-disposition')||'')||[])[1]||'exam.'+format);
      config.toast&&config.toast(T('export.done'),'ok');
    }catch(e){
      // No PDF engine on this computer: the print preview gives the same document through "Save as PDF".
      if(format==='pdf'&&e.status===503){config.toast&&config.toast(T('export.viaprint'),'info');busy=false;setBusy(button,false);clearTimeout(timer);return print(config,mode,true);}
      config.toast&&config.toast(e.name==='AbortError'?T('export.timeout'):e.message,'error');
    }
    finally{clearTimeout(timer);busy=false;setBusy(button,false);}
  }
  async function print(config,mode,asPdf){
    if(open)open.close();
    var dlg=node('dialog','print-dialog dlg');open=dlg;
    var head=node('div','dlg-head');
    var title=node('h2','','ed.print');head.appendChild(title);
    var tabs=node('div','seg');
    [['student','ed.cs'],['key','ed.ck']].forEach(function(p){var b=node('button',p[0]===mode?'on':'',p[1]);b.type='button';b.onclick=function(){if(p[0]!==mode){dlg.close();print(config,p[0],asPdf);}};tabs.appendChild(b);});
    head.appendChild(tabs);
    var close=node('button','dlg-x');close.type='button';close.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';close.setAttribute('aria-label',T('set.close'));head.appendChild(close);
    var stage=node('div','print-stage');
    var loader=node('div','print-loading');loader.innerHTML='<span class="spinner"></span><span>'+T('export.loading')+'</span>';
    var frame=node('iframe','print-frame');frame.title=T('export.preview');frame.setAttribute('sandbox','allow-same-origin allow-modals');
    stage.append(loader,frame);
    var footer=node('div','print-actions');var hint=node('span','hint',asPdf?'export.pdfhint':'export.printhint');
    var pdf=node('button','btn quiet','export.pdf');pdf.type='button';
    var go=node('button','btn primary','export.print');go.type='button';go.disabled=true;
    if(asPdf)footer.append(hint,go);else footer.append(hint,pdf,go);
    dlg.append(head,stage,footer);document.body.appendChild(dlg);dlg.showModal();
    var controller=new AbortController();
    close.onclick=function(){dlg.close();};
    dlg.addEventListener('click',function(e){if(e.target===dlg)dlg.close();});
    dlg.addEventListener('close',function(){controller.abort();dlg.remove();if(open===dlg)open=null;});
    pdf.onclick=function(){save(config,'pdf',mode,pdf);};
    go.onclick=function(){try{frame.contentWindow.focus();frame.contentWindow.print();}catch(e){config.toast&&config.toast(e.message,'error');}};
    try{
      var response=await request(config,'html',mode,controller.signal);var content=await response.text();
      frame.onload=async function(){
        var doc=frame.contentDocument;
        try{await Promise.race([Promise.all([doc.fonts.ready,Promise.all(Array.from(doc.images).map(function(im){return im.decode?im.decode().catch(function(){}):Promise.resolve();}))]),new Promise(function(resolve){setTimeout(resolve,4000);})]);}catch(_){}
        if(!dlg.isConnected)return;
        stage.classList.add('ready');go.disabled=false;go.focus();
      };
      frame.srcdoc=content;
    }catch(e){if(e.name!=='AbortError'){loader.innerHTML='';loader.appendChild(document.createTextNode(e.message));loader.classList.add('error');}}
  }
  window.ExamExport={save:save,print:print};
})();
