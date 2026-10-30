// Client telemetry source. Inlined as a <script> in root.jsx so it runs pre-hydration and survives render crashes.

export const TELEMETRY_CLIENT_SOURCE = `
(function(){
  var BEACON='/api/telemetry/beacon';
  var lastSent=null; var errSeen={};
  var firstReferrer=ref();

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

  function skip(p){
    if (p.indexOf('/.well-known/') === 0) return true;
    if (p.indexOf('/__') === 0) return true;
    if (p.indexOf('/api/') === 0) return true;
    if (p.endsWith('.data')) return true;
    if (p === '/admin' || p.indexOf('/admin/') === 0) return true;
    if (p === '/login') {
      var s = location.search || '';
      if (s.indexOf('redirectTo=%2Fadmin') !== -1 || s.indexOf('redirectTo=/admin') !== -1) return true;
    }
    return false;
  }

  // One pageview per distinct URL. React Router calls replaceState during hydration, which must not count twice.
  function pageview(){
    var p = location.pathname;
    var key = p + location.search;
    if (key === lastSent) return;
    if (skip(p)) { lastSent = key; return; }
    var isFirst = lastSent === null;
    lastSent = key;
    send({type:'pageview',path:key,referrer:isFirst ? firstReferrer : null});
  }

  window.__trovTrack=function(eventType, metadata){
    send({type:'event',eventType:eventType,path:location.pathname,metadata:metadata||{}});
  };

  if(document.readyState==='complete' || document.readyState==='interactive'){
    setTimeout(pageview,0);
  } else {
    window.addEventListener('DOMContentLoaded',pageview,{once:true});
  }

  var origPush=history.pushState;
  history.pushState=function(){
    var r=origPush.apply(this,arguments);
    setTimeout(pageview,0);
    return r;
  };
  var origReplace=history.replaceState;
  history.replaceState=function(){
    var r=origReplace.apply(this,arguments);
    setTimeout(pageview,0);
    return r;
  };
  window.addEventListener('popstate',function(){ setTimeout(pageview,0); });

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
