/**
 * Client telemetry IIFE source.
 *
 * Inlined into root.jsx as a <script dangerouslySetInnerHTML>. Stays
 * outside the React bundle so:
 *   1. It runs before hydration completes (catches early errors).
 *   2. It survives a React render crash (the React tree may be broken
 *      but window.onerror still fires; we still want the event).
 *   3. No bundler involvement; the source here matches what ships.
 *
 * Capabilities:
 *   - One pageview beacon per route, sent on first paint OR on
 *     visibilitychange→hidden (whichever fires first). Ensures we
 *     always get the beacon even if the user closes the tab fast.
 *   - window.error and unhandledrejection capture, debounced to
 *     dedupe repeated errors of the same shape within 5s.
 *   - SPA route changes detected via the History API hook so RR v7
 *     client-side navigations also get a pageview beacon.
 *
 * Privacy:
 *   - We collect path, referrer (cross-origin only), UTM params, and
 *     for errors the message + stack + filename + line. No emails,
 *     no clipboard, no form values.
 *
 * Constraints:
 *   - Must be valid JS in a browser. No template literals with
 *     ${...} expressions when read by a server (inline is fine).
 *   - Must work without optional-chaining? Modern browsers support it.
 *     We target evergreens; IE is dead.
 */

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
  function pageview(){
    if(sent) return;
    // Skip framework / browser probe paths that aren't real pageviews:
    //   /.well-known/*           - Chrome devtools, ACME challenges, etc
    //   /__*                     - convention for internal/diagnostic routes
    //   /api/*                   - never a pageview, that's an XHR
    //   *.data                   - RR v7 client-nav data fetch
    var p = location.pathname;
    if (p.indexOf('/.well-known/') === 0) return;
    if (p.indexOf('/__') === 0) return;
    if (p.indexOf('/api/') === 0) return;
    if (p.endsWith('.data')) return;
    sent=true;
    send({type:'pageview',path:p+location.search,referrer:ref()});
  }
  // Send on first paint OR earliest of visibility-hidden.
  if(document.readyState==='complete' || document.readyState==='interactive'){
    setTimeout(pageview,0);
  } else {
    window.addEventListener('DOMContentLoaded',pageview,{once:true});
  }
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='hidden') pageview();
  });

  // SPA navigation hook for React Router client-side route changes.
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

  // Error capture with 5s dedupe per (message+filename+line) signature.
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
    recordErr({
      type:'error', kind:'client_script', severity:'error',
      message:(e.message||String(e.error||'Script error')).slice(0,1024),
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
    var msg = reason && reason.message ? reason.message : String(reason||'Unhandled rejection');
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
