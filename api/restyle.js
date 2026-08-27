// ============================================================
//  ESTIMAKE — Home-staging IA d'une pièce (fonction serverless Vercel)
//
//  Modèle d'image : FLUX.1 Kontext (Black Forest Labs) — modèle d'ÉDITION
//  qui modifie la photo en conservant la scène (murs, fenêtres, volumes,
//  point de vue) et ne change que le mobilier/déco. C'est l'approche la
//  plus fidèle pour du home-staging virtuel. Repli : Stability structure.
//
//  Claude (vision, optionnel) rédige une consigne d'édition sur-mesure.
//
//  CLÉS (variables d'environnement Vercel, JAMAIS dans le code front) :
//    - BFL_API_KEY        (recommandé) → https://api.bfl.ai  (FLUX.1 Kontext)
//    - STABILITY_API_KEY  (repli)      → https://platform.stability.ai/
//    - ANTHROPIC_API_KEY  (optionnel)  → consigne d'édition rédigée par Claude
// ============================================================

export const config = { maxDuration: 60 };

const STYLES = {
  'Moderne':    'contemporary home-staging: warm neutral palette, clean-lined furniture, a few tasteful decor pieces, plants, soft natural daylight',
  'Scandinave': 'scandinavian home-staging: light oak wood, off-white textiles, linen and wool, calm and uncluttered',
  'Cosy':       'warm cosy home-staging: soft neutral tones, a comfortable sofa, throw blankets and a rug, plants, gentle lighting',
  'Luxe':       'understated high-end home-staging: quality natural materials, refined but restrained furniture, subtle elegant accents — no gaudy gold, no excess',
  'Épuré':      'minimalist home-staging: decluttered, neutral tones, a few well-chosen pieces, airy and spacious feel',
  'Industriel': 'soft industrial home-staging: matte black metal details, warm wood, neutral textiles, kept liveable and tasteful'
};

const ROOMS = {
  'cuisine':          'a fitted kitchen (cabinets, worktop, sink and appliances arranged along the existing walls)',
  'salon':            'a living room (sofa, armchairs, coffee table, rug and a TV unit)',
  'salle à manger':   'a dining room (a dining table with chairs and a sideboard)',
  'chambre':          'a bedroom (a double bed with bedside tables and a wardrobe)',
  "chambre d'enfant": "a child's bedroom (a single bed, storage and tasteful playful decor)",
  'dressing':         'a walk-in dressing room (open wardrobes, shelving, a bench and a mirror)',
  'salle de bain':    'a bathroom (vanity with basin, large mirror, and a walk-in shower or bathtub)',
  'bureau':           'a home office (a desk, an ergonomic chair and wall shelving)'
};

var KEEP = 'Strict rules: keep the EXACT same room — do not change the walls, windows, doors, ceiling, floor, room dimensions, proportions or camera angle. Do not add or remove windows, do not enlarge the room. Only change furniture, decor, textiles, colours and lighting. The result must look like a REAL professional real-estate home-staging photograph — believable, natural, tasteful, current interior-design trends. Not an AI render, not a fantasy or luxury-palace scene.';

var NEG = 'AI render, CGI, 3D render, fantasy, surreal, exaggerated luxury, gaudy, gold everywhere, ornate palace, different room, changed or added windows, moved walls, altered architecture, bigger room, distorted or warped perspective, fisheye, extra rooms, unrealistic proportions, oversaturated, cartoon, illustration, blurry, low quality, watermark, text, logo';

function buildPrompt(style, room, notes){
  var s = STYLES[style] || STYLES['Moderne'];
  var head;
  if(room && ROOMS[room]){
    head = 'Furnish and stage this exact room as ' + ROOMS[room] + ', in a ' + s + '. ';
  } else {
    head = 'Restage this exact room as ' + s + '. ';
  }
  var p = head + KEEP;
  if(notes){ p += ' Specific requests to respect: ' + notes + '.'; }
  return p;
}

async function claudePrompt(key, b64, mediaType, style, room, notes){
  var target = (room && ROOMS[room])
    ? ('furnish and stage it as ' + ROOMS[room] + ', in a "' + style + '" home-staging style')
    : ('restage it in a "' + style + '" home-staging style');
  var extra = notes ? (' Also respect these requests: ' + notes + '.') : '';
  var r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-opus-5',
      max_tokens: 320,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
        { type: 'text', text: 'You are writing an image-EDITING instruction for a real-estate virtual home-staging tool. Looking at THIS exact room, write ONE concrete English instruction to ' + target + ' — name the furniture, materials, colours, textiles and lighting to add.' + extra + ' You MUST insist that the walls, windows, doors, ceiling, floor, proportions and camera angle stay exactly the same and that the result looks like a real, natural, tasteful staging photo (not an AI render). Reply with the editing instruction only, no preamble.' }
      ]}]
    })
  });
  if(!r.ok) return null;
  var j = await r.json();
  var t = (j.content || []).filter(function(b){return b.type==='text';}).map(function(b){return b.text;}).join(' ').trim();
  return t ? (t + ' ' + KEEP) : null;
}

function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

// FLUX.1 Kontext (Black Forest Labs) — édition fidèle à la structure
async function fluxKontext(key, prompt, b64){
  var submit = await fetch('https://api.bfl.ai/v1/flux-kontext-max', {
    method: 'POST',
    headers: { 'x-key': key, 'Content-Type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify({ prompt: prompt, input_image: b64, output_format: 'jpeg', safety_tolerance: 2 })
  });
  var sj = await submit.json().catch(function(){ return {}; });
  if(!submit.ok || !sj.polling_url){ throw new Error('FLUX: ' + JSON.stringify(sj).slice(0, 200)); }
  for(var i=0; i<45; i++){
    await sleep(1400);
    var pr = await fetch(sj.polling_url, { headers: { 'x-key': key, 'accept': 'application/json' } });
    var pj = await pr.json().catch(function(){ return {}; });
    var st = pj.status;
    if(st === 'Ready' && pj.result && pj.result.sample){ return pj.result.sample; } // URL de l'image
    if(st === 'Error' || st === 'Failed' || st === 'Request Moderated' || st === 'Content Moderated'){
      throw new Error('FLUX: ' + st);
    }
  }
  throw new Error('FLUX: délai dépassé');
}

async function urlToDataURL(url){
  var r = await fetch(url);
  if(!r.ok) throw new Error('Image FLUX inaccessible');
  var buf = Buffer.from(await r.arrayBuffer());
  return 'data:image/jpeg;base64,' + buf.toString('base64');
}

// Stability structure control — repli
async function stability(key, prompt, bytes, mediaType){
  var form = new FormData();
  form.append('image', new Blob([bytes], { type: mediaType }), 'room.png');
  form.append('prompt', prompt);
  form.append('negative_prompt', NEG);
  form.append('control_strength', '0.9');
  form.append('output_format', 'jpeg');
  var r = await fetch('https://api.stability.ai/v2beta/stable-image/control/structure', {
    method: 'POST', headers: { 'Authorization': 'Bearer ' + key, 'Accept': 'image/*' }, body: form
  });
  if(!r.ok){ throw new Error('Stability : ' + (await r.text()).slice(0, 250)); }
  var out = Buffer.from(await r.arrayBuffer());
  return 'data:image/jpeg;base64,' + out.toString('base64');
}

// L'API consomme des crédits BFL/Stability/Anthropic → réservée aux utilisateurs connectés (JWT Supabase).
// NB : le jeton arrive dans le CORPS (body._auth) — le JWT peut être trop gros pour un en-tête (494).
async function requireUser(req, body){
  var SB = process.env.SB_URL, SK = process.env.SB_SERVICE_KEY;
  if(!SB || !SK) return true;   // pas configuré → on ne casse pas l'app
  var tok = String(req.headers.authorization||'').replace(/^Bearer\s+/i,'') || String((body&&body._auth)||'');
  if(!tok) return false;
  try{
    var r = await fetch(SB.replace(/\/$/,'')+'/auth/v1/user', { headers:{ apikey:SK, Authorization:'Bearer '+tok } });
    if(!r.ok) return false;
    return await compteActif(SB, SK, tok);
  }catch(e){ return false; }
}

// Un compte désactivé garde un jeton valide jusqu'à son expiration (~1 h) : on vérifie
// donc AUSSI son état dans profils, sinon il continuerait à consommer des crédits.
async function compteActif(SB, SK, tok){
  try{
    var r = await fetch(SB.replace(/\/$/,'') + '/auth/v1/user', { headers:{ apikey:SK, Authorization:'Bearer '+tok } });
    if(!r.ok) return false;
    var u = await r.json(); if(!u || !u.id) return false;
    var p = await fetch(SB.replace(/\/$/,'') + '/rest/v1/profils?id=eq.'+u.id+'&select=actif',
      { headers:{ apikey:SK, Authorization:'Bearer '+SK } });
    if(!p.ok) return true;                 // table absente → on ne bloque pas
    var rows = await p.json();
    return !rows.length || rows[0].actif !== false;
  }catch(e){ return true; }
}


export default async function handler(req, res){
  if(req.method !== 'POST'){ res.status(405).json({ error: 'Méthode non autorisée' }); return; }
  var body0 = req.body;
  if(typeof body0 === 'string'){ try{ body0 = JSON.parse(body0); }catch(e){ body0 = {}; } }
  if(!(await requireUser(req, body0))){ res.status(401).json({ error: 'Connexion requise — reconnecte-toi dans l\'app.' }); return; }
  var BFL  = process.env.BFL_API_KEY;
  var STAB = process.env.STABILITY_API_KEY;
  var ANTH = process.env.ANTHROPIC_API_KEY;
  if(!BFL && !STAB){ res.status(503).json({ error: 'Home-staging IA non configuré : ajoute BFL_API_KEY (recommandé) ou STABILITY_API_KEY dans Vercel.' }); return; }
  try{
    var body = body0;
    var image = body && body.image;
    var style = (body && body.style) || 'Moderne';
    var room  = (body && body.room) || '';
    var notes = (body && body.notes ? String(body.notes) : '').trim().slice(0, 400);
    if(!image){ res.status(400).json({ error: 'Aucune image reçue.' }); return; }

    var mediaType = 'image/jpeg';
    var m = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(image);
    if(m){ mediaType = m[1]; }
    var b64 = image.split(',').pop();

    // 1) Consigne d'édition (Claude si dispo, sinon défaut)
    var prompt = buildPrompt(style, room, notes);
    if(ANTH){ try{ var p = await claudePrompt(ANTH, b64, mediaType, style, room, notes); if(p) prompt = p; }catch(e){} }

    // 2) Rendu — FLUX.1 Kontext en priorité, Stability en repli
    var dataUrl, engine, fallbackReason = BFL ? null : 'BFL_API_KEY absente';
    if(BFL){
      try{ var sample = await fluxKontext(BFL, prompt, b64); dataUrl = await urlToDataURL(sample); engine = 'flux-kontext-max'; }
      catch(e){ fallbackReason = String((e && e.message) || e); if(!STAB) throw e; }
    }
    if(!dataUrl && STAB){
      dataUrl = await stability(STAB, prompt, Buffer.from(b64, 'base64'), mediaType); engine = 'stability-structure';
    }
    if(!dataUrl){ res.status(502).json({ error: 'Génération impossible.' }); return; }

    res.status(200).json({ image: dataUrl, prompt: prompt, engine: engine, fallback_reason: fallbackReason });
  }catch(e){
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
