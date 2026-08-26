// ============================================================
//  ESTIMAKE — Synchro Google Agenda "à vie", aller-retour (serverless Vercel)
//
//  Utilise un COMPTE DE SERVICE Google (jeton permanent, aucune reconnexion,
//  aucun popup). Aucune dépendance npm : le JWT du compte de service est signé
//  avec node:crypto, la base est écrite via l'API REST Supabase (service_role).
//
//  Sens de synchro :
//   - app → Google : action "push" (création/màj) et "delete" (appelées par l'app)
//   - Google → app : action "pull" (cron Vercel toutes les 5 min + bouton Synchro)
//
//  VARIABLES D'ENVIRONNEMENT VERCEL (jamais dans le repo) :
//   - GOOGLE_SA_KEY_JSON : contenu COMPLET du fichier .json du compte de service
//   - GCAL_ID            : identifiant du calendrier cible (souvent l'e-mail du compte)
//   - SB_URL             : URL du projet Supabase (https://xxxx.supabase.co)
//   - SB_SERVICE_KEY     : clé service_role Supabase (côté serveur uniquement)
// ============================================================

import crypto from 'node:crypto';

export const config = { maxDuration: 30 };

function pad2(n){ return (n<10?'0':'')+n; }
function b64url(buf){ return Buffer.from(buf).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_'); }

function saCreds(){
  var raw = process.env.GOOGLE_SA_KEY_JSON;
  if(!raw) return null;
  var j;
  try{ j = JSON.parse(raw); }catch(e){ return null; }
  var key = j.private_key || '';
  if(key.indexOf('\\n') !== -1) key = key.replace(/\\n/g,'\n');   // au cas où les \n sont échappés
  if(!j.client_email || !key) return null;
  return { email: j.client_email, key: key };
}

async function getToken(){
  var c = saCreds();
  if(!c) throw new Error('Compte de service manquant (GOOGLE_SA_KEY_JSON).');
  var now = Math.floor(Date.now()/1000);
  var header = { alg:'RS256', typ:'JWT' };
  var claim = { iss:c.email, scope:'https://www.googleapis.com/auth/calendar',
                aud:'https://oauth2.googleapis.com/token', iat:now, exp:now+3600 };
  var unsigned = b64url(JSON.stringify(header))+'.'+b64url(JSON.stringify(claim));
  var sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(c.key);
  var jwt = unsigned+'.'+b64url(sig);
  var r = await fetch('https://oauth2.googleapis.com/token', {
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion='+jwt
  });
  var j = await r.json();
  if(!j.access_token) throw new Error('Jeton Google refusé : '+JSON.stringify(j).slice(0,200));
  return j.access_token;
}

var SB = process.env.SB_URL, SK = process.env.SB_SERVICE_KEY;
function sbFetch(path, opts){
  opts = opts || {};
  opts.headers = Object.assign({ apikey:SK, Authorization:'Bearer '+SK, 'Content-Type':'application/json' }, opts.headers||{});
  return fetch(SB.replace(/\/$/,'')+'/rest/v1/'+path, opts);
}
function calBase(){ return 'https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(process.env.GCAL_ID||'primary')+'/events'; }

// Construit l'événement Google à partir d'une ligne rdv
function gBody(r){
  var body = { summary:r.titre||'RDV',
    description:(r.type?('['+r.type+'] '):'')+(r.note||'')+(r.lien?(' — '+r.lien):''),
    extendedProperties:{ private:{ estimakeId:String(r.id) } } };   // lien exact RDV↔événement (anti-doublon)
  if(r.heure && /^\d{2}:\d{2}/.test(r.heure)){
    var sh=parseInt(r.heure.slice(0,2),10), mm=r.heure.slice(3,5);
    body.start={ dateTime:r.date+'T'+r.heure.slice(0,5)+':00', timeZone:'Europe/Paris' };
    var eh=sh+1, ed=r.date;
    if(eh>23){ eh=0; var ndx=new Date(r.date+'T00:00:00'); ndx.setDate(ndx.getDate()+1);
      ed=ndx.getFullYear()+'-'+pad2(ndx.getMonth()+1)+'-'+pad2(ndx.getDate()); }   // 23:30 → fin le lendemain 00:30
    body.end={ dateTime:ed+'T'+pad2(eh)+':'+mm+':00', timeZone:'Europe/Paris' };
  } else {
    var nd=new Date(r.date+'T00:00:00'); nd.setDate(nd.getDate()+1);
    body.start={ date:r.date };
    body.end={ date:nd.getFullYear()+'-'+pad2(nd.getMonth()+1)+'-'+pad2(nd.getDate()) };
  }
  return body;
}

// app → Google (création / mise à jour)
async function pushOne(id){
  var rr = await sbFetch('rdv?id=eq.'+id+'&select=*'); var rows = await rr.json();
  var r = rows && rows[0]; if(!r) return { skip:'row introuvable' };
  var tok = await getToken(); var base = calBase();
  if(r.deleted){
    if(r.gcal_id){ await fetch(base+'/'+r.gcal_id, { method:'DELETE', headers:{Authorization:'Bearer '+tok} }); }
    return { deleted:true };
  }
  if(r.gcal_id){
    var pr = await fetch(base+'/'+r.gcal_id, { method:'PATCH', headers:{Authorization:'Bearer '+tok,'Content-Type':'application/json'}, body:JSON.stringify(gBody(r)) });
    if(pr.ok){ return { updated:r.gcal_id }; }
    if(pr.status !== 404){ throw new Error('Google a refusé la mise à jour ('+pr.status+') : '+(await pr.text()).slice(0,180)); }
    // 404 => l'événement n'existe plus côté Google → recréé ci-dessous
  }
  var cr = await fetch(base, { method:'POST', headers:{Authorization:'Bearer '+tok,'Content-Type':'application/json'}, body:JSON.stringify(gBody(r)) });
  var cj = await cr.json().catch(function(){ return {}; });
  if(!cr.ok || !cj.id){ throw new Error('Google a refusé la création ('+cr.status+') : '+JSON.stringify(cj).slice(0,180)); }
  await sbFetch('rdv?id=eq.'+id, { method:'PATCH', headers:{Prefer:'return=minimal'}, body:JSON.stringify({ gcal_id:cj.id }) });
  return { created:cj.id };
}

// app → Google (suppression) : supprime l'événement Google, garde la ligne (deleted=true)
async function deleteOne(id){
  var rr = await sbFetch('rdv?id=eq.'+id+'&select=gcal_id'); var r = (await rr.json())[0];
  if(r && r.gcal_id){
    var tok = await getToken();
    await fetch(calBase()+'/'+r.gcal_id, { method:'DELETE', headers:{Authorization:'Bearer '+tok} });
  }
  await sbFetch('rdv?id=eq.'+id, { method:'PATCH', headers:{Prefer:'return=minimal'}, body:JSON.stringify({ deleted:true }) });
  return { ok:true };
}

// Convertit une date ISO en date/heure locales (Europe/Paris)
function inParis(iso){
  var d = new Date(iso);
  var parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/Paris', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false }).formatToParts(d);
  var o={}; parts.forEach(function(p){ o[p.type]=p.value; });
  return { date:o.year+'-'+o.month+'-'+o.day, heure:(o.hour==='24'?'00':o.hour)+':'+o.minute };
}

/* Multi-utilisateur : cette fonction écrit avec la clé de service, donc auth.uid()
   est nul et les RDV créés n'auraient aucun propriétaire — donc invisibles.
   On résout une fois le compte propriétaire du calendrier : GCAL_USER_ID si
   la variable est posée, sinon le premier compte créé (même règle que la migration). */
var _proprio = null;
async function proprietaire(){
  if(_proprio !== null) return _proprio;
  if(process.env.GCAL_USER_ID){ _proprio = process.env.GCAL_USER_ID; return _proprio; }
  try{
    var mail = process.env.GCAL_ID || '';
    if(mail){
      var r = await fetch(SB.replace(/\/$/,'') + '/auth/v1/admin/users?page=1&per_page=200',
        { headers:{ apikey:SK, Authorization:'Bearer '+SK } });
      if(r.ok){
        var j = await r.json();
        var us = (j && j.users) || [];
        var m = us.find(function(u){ return (u.email||'').toLowerCase() === mail.toLowerCase(); });
        if(m){ _proprio = m.id; return _proprio; }
        us.sort(function(a,b){ return String(a.created_at||'').localeCompare(String(b.created_at||'')); });
        if(us[0]){ _proprio = us[0].id; return _proprio; }
      }
    }
  }catch(e){ console.warn('[gcal] propriétaire', e); }
  _proprio = false;
  return _proprio;
}

// Applique un événement Google dans la base (Google → app)
async function applyEvent(ev){
  var q = await sbFetch('rdv?gcal_id=eq.'+encodeURIComponent(ev.id)+'&select=id,deleted'); var ex = (await q.json())[0];
  // Anti-doublon : si pas de correspondance par gcal_id, retrouver le RDV d'origine
  // grâce à l'identifiant ESTIMAKE inscrit dans l'événement (créé par l'app).
  var estId = ev.extendedProperties && ev.extendedProperties.private && ev.extendedProperties.private.estimakeId;
  if(!ex && estId){
    var aq = await sbFetch('rdv?id=eq.'+encodeURIComponent(estId)+'&select=id'); var arow = (await aq.json())[0];
    if(arow) ex = arow;
  }
  if(ev.status === 'cancelled'){
    if(ex){ await sbFetch('rdv?id=eq.'+ex.id, { method:'PATCH', headers:{Prefer:'return=minimal'}, body:JSON.stringify({ deleted:true }) }); return 1; }
    return 0;
  }
  var s = ev.start||{}; var date=null, heure=null;
  if(s.dateTime){ var p=inParis(s.dateTime); date=p.date; heure=p.heure; }
  else if(s.date){ date=s.date; }
  if(!date) return 0;
  if(ex){
    // RDV déjà connu de l'app : on ne met à jour QUE titre/date/heure.
    // La note reste celle de l'app (sinon la description composée « [Type] note — lien »
    // reviendrait polluer la note à chaque cycle push/pull).
    var upd = { titre:ev.summary||'(sans titre)', date:date, heure:heure, gcal_id:ev.id, deleted:false };
    await sbFetch('rdv?id=eq.'+ex.id, { method:'PATCH', headers:{Prefer:'return=minimal'}, body:JSON.stringify(upd) });
  }
  else {
    var row = { titre:ev.summary||'(sans titre)', date:date, heure:heure, note:(ev.description||''), gcal_id:ev.id, deleted:false, type:'Autre' };
    var owner = await proprietaire();
    if(owner) row.user_id = owner;   // sans propriétaire, le RDV serait invisible dans l'app
    var ins = await sbFetch('rdv', { method:'POST', headers:{Prefer:'return=minimal'}, body:JSON.stringify(row) });
    // colonne user_id pas encore créée (migration non lancée) → on réessaie sans
    if(!ins.ok && owner){
      delete row.user_id;
      await sbFetch('rdv', { method:'POST', headers:{Prefer:'return=minimal'}, body:JSON.stringify(row) });
    }
  }
  return 1;
}

// Google → app (synchro incrémentale via syncToken)
async function pull(){
  var tok = await getToken(); var base = calBase();
  var sr = await sbFetch('gcal_sync?id=eq.1&select=sync_token'); var srows = await sr.json();
  var syncToken = srows && srows[0] && srows[0].sync_token;
  var url = base+'?singleEvents=true&showDeleted=true&maxResults=250';
  if(syncToken){ url += '&syncToken='+encodeURIComponent(syncToken); }
  else { var min=new Date(); min.setMonth(min.getMonth()-2); url += '&timeMin='+min.toISOString(); }
  var changed=0, pageToken=null, next=null, guard=0;
  while(guard++ < 40){
    var u = url + (pageToken ? ('&pageToken='+pageToken) : '');
    var r = await fetch(u, { headers:{Authorization:'Bearer '+tok} });
    if(r.status === 410){ // syncToken invalide → on repart de zéro au prochain appel
      await saveSyncToken(null);
      return { reset:true };
    }
    var j = await r.json();
    if(j.error){ throw new Error('Calendar: '+JSON.stringify(j.error).slice(0,200)); }
    var items = j.items||[];
    for(var i=0;i<items.length;i++){ changed += await applyEvent(items[i]); }
    if(j.nextPageToken){ pageToken=j.nextPageToken; continue; }
    next = j.nextSyncToken || null; break;
  }
  if(next){ await saveSyncToken(next); }
  return { changed:changed };
}

// Upsert : crée la ligne id=1 si elle n'existe pas encore (sinon le token n'était jamais stocké)
function saveSyncToken(tokenVal){
  return sbFetch('gcal_sync', { method:'POST', headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify({ id:1, sync_token:tokenVal, updated_at:new Date().toISOString() }) });
}

function readBody(req){
  var b = req.body;
  if(typeof b === 'string'){ try{ b = JSON.parse(b); }catch(e){ b = {}; } }
  return b || {};
}

export default async function handler(req, res){
  try{
    if(!saCreds()){ res.status(503).json({ error:'Synchro Google non configurée (GOOGLE_SA_KEY_JSON).' }); return; }
    if(!SB || !SK){ res.status(503).json({ error:'Base non configurée (SB_URL / SB_SERVICE_KEY).' }); return; }
    var body = readBody(req);
    var action = body.action || (req.query && req.query.action) || 'pull';
    if(action === 'push'){
      if(!body.id){ res.status(400).json({ error:'id manquant' }); return; }
      res.status(200).json(await pushOne(body.id)); return;
    }
    if(action === 'delete'){
      if(!body.id){ res.status(400).json({ error:'id manquant' }); return; }
      res.status(200).json(await deleteOne(body.id)); return;
    }
    res.status(200).json(await pull());
  }catch(e){
    res.status(500).json({ error:String((e && e.message) || e) });
  }
}
