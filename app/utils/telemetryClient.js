// Client telemetry source. Inlined as a <script> in root.jsx so it runs pre-hydration and survives render crashes.

export const TELEMETRY_CLIENT_SOURCE = `
(function(){
  var BEACON='/api/telemetry/beacon';
  var sent=false; var errSeen={};

  function send(body){
    try{
      var blob=new Blob([JSON.stringify(body)],{type:'application/json'});
      if(navigator.sendBeacon){ navigator.sendBeacon(BEACON,blob); }
      else { fetch(BEACON,{method:'POST',body:blob,keepalive:true,credentials:'same-origin'}).catch(function(){}); }
    }catch(e){}
  }

  function ref(){
    try{
      if(!document.referrer) return null;
      var u=new URL(document.referrer);
      if(u.host===location.host) return null;
      return document.referrer;
    }catch(e){ return null; }
  }

  // Serializes anything to a readable string. Prevents [object Object] in the error pipeline.
  function safeStr(v, fallback){
    if (v === null || v === undefined) return fallback || 'Unknown';
    if (typeof v === 'string') return v;
    if (v instanceof Error) return v.message || String(v);
    if (typeof v === 'object') {
      if (v.message) return String(v.message);
      try { return JSON.stringify(v).slice(0, 1024); } catch(e) { return fallback || 'Unknown'; }
    }
    return String(v);
  }

  function pageview(){
    if(sent) return;
    // Skip non-pageview paths: well-known probes, framework internals, API XHRs, RR v7 data fetches, admin routes.
    var p = location.pathname;
    if (p.indexOf('/.well-known/') === 0) return;
    if (p.indexOf('/__') === 0) return;
    if (p.indexOf('/api/') === 0) return;
    if (p.endsWith('.data')) return;
    if (p === '/admin' || p.indexOf('/admin/') === 0) return;
    // Login redirects targeting admin are admin traffic dressed up as auth; drop both encoded and unencoded forms.
    if (p === '/login') {
      var s = location.search || '';
      if (s.indexOf('redirectTo=%2Fadmin') !== -1) return;
      if (s.indexOf('redirectTo=/admin') !== -1) return;
    }
    sent=true;
    send({type:'pageview',path:p+location.search,referrer:ref()});
  }

  if(document.readyState==='complete' || document.readyState==='interactive'){
    setTimeout(pageview,0);
  } else {
    window.addEventListener('DOMContentLoaded',pageview,{once:true});
  }
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='hidden') pageview();
  });

  // SPA navigation hook for RR v7 client-side route changes.
  var origPush=history.pushState;
  history.pushState=function(){
    var r=origPush.apply(this,arguments);
    sent=false; setTimeout(pageview,0);
    return r;
  };
  var origReplace=history.replaceState;
  history.replaceState=function(){
    var r=origReplace.apply(this,arguments);
    sent=false; setTimeout(pageview,0);
    return r;
  };
  window.addEventListener('popstate',function(){ sent=false; setTimeout(pageview,0); });

  // Dedupe per (message+filename+line) signature within 5s.
  function fp(msg,file,line){ return (msg||'?')+'|'+(file||'?')+'|'+(line||'?'); }
  function recordErr(payload){
    var k=fp(payload.message,payload.url,payload.line);
    var now=Date.now();
    if(errSeen[k] && now-errSeen[k]<5000) return;
    errSeen[k]=now;
    send(payload);
  }

  window.addEventListener('error',function(e){
    if(!e) return;
    var msg = e.message ? String(e.message) : safeStr(e.error, 'Script error');
    recordErr({
      type:'error', kind:'client_script', severity:'error',
      message: msg.slice(0,1024),
      stack: e.error && e.error.stack ? String(e.error.stack).slice(0,8192) : null,
      url: e.filename || location.href,
      line: e.lineno || null,
      column: e.colno || null,
      path: location.pathname,
      context: { type:'window.onerror' }
    });
  });

  window.addEventListener('unhandledrejection',function(e){
    if(!e) return;
    var reason=e.reason;
    var msg = safeStr(reason, 'Unhandled rejection');
    var stk = reason && reason.stack ? String(reason.stack) : null;
    recordErr({
      type:'error', kind:'client_async', severity:'error',
      message: msg.slice(0,1024),
      stack: stk ? stk.slice(0,8192) : null,
      url: location.href,
      line: null, column: null,
      path: location.pathname,
      context: { type:'unhandledrejection' }
    });
  });
})();
`.trim();
