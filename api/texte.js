// ============================================================
//  ESTIMAKE — Correction/amélioration de texte (serverless Vercel)
//  Corrige l'orthographe, la grammaire et fluidifie une description
//  de bien immobilier, sans inventer d'informations.
//  CLÉ : ANTHROPIC_API_KEY (variable d'environnement Vercel).
// ============================================================

export const config = { maxDuration: 30 };

// L'API consomme des crédits Anthropic → réservée aux utilisateurs connectés (JWT Supabase).
// NB : le jeton arrive dans le CORPS (body._auth) — le JWT Supabase peut être trop gros
// pour un en-tête (la photo de profil vit dans user_metadata → 494 REQUEST_HEADER_TOO_LARGE).
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
  var KEY = process.env.ANTHROPIC_API_KEY;
  if(!KEY){ res.status(503).json({ error: 'Correction IA non configurée : ajoute ANTHROPIC_API_KEY dans Vercel.' }); return; }
  try{
    var body = body0;
    var prompt;
    if(body && body.mode === 'rediger'){
      // « Aide-moi à rédiger » : Claude rédige la description à partir des données de l'estimation
      var fiche = JSON.stringify(body.bien || {}).slice(0, 6000);
      var notes = (body.text ? String(body.text) : '').trim().slice(0, 2000);
      prompt = 'Tu es un expert immobilier français qui rédige la partie descriptive d\'un AVIS DE VALEUR remis au propriétaire. '+
        'Voici TOUTES les données de l\'estimation (caractéristiques du bien, équipements, ajustements d\'expertise état/DPE/emplacement, marché local DVF, commodités, lots et loyers éventuels) au format JSON :\n'+fiche+
        (notes ? ('\n\nNotes/brouillon de l\'agent à intégrer en priorité : '+notes) : '')+
        '\n\nRédige en français une analyse professionnelle en 2 à 3 paragraphes (150 à 220 mots au total) : '+
        '① présentation valorisante mais factuelle du bien (type, surfaces, distribution, équipements, année) ; '+
        '② lecture d\'expert : situation et commodités, état/DPE et leur incidence, dynamique du marché local (médiane au m² et tendance si fournies, sans citer le prix du bien estimé) ; '+
        '③ pour un immeuble ou un bien loué : lots et potentiel locatif (loyers, rendement si fournis). '+
        'RÈGLES STRICTES : n\'utilise QUE les informations fournies, n\'invente RIEN (pas d\'équipement, exposition, état, quartier ou travaux non mentionnés) ; ne cite JAMAIS le prix estimé, la fourchette ni la valeur du bien ; ignore les champs vides ou nuls ; ton posé et professionnel, pas de superlatifs publicitaires. '+
        'Réponds UNIQUEMENT avec le texte, sans titre, sans préambule ni commentaire.';
    } else {
      var text = (body && body.text ? String(body.text) : '').trim().slice(0, 4000);
      if(text.length < 10){ res.status(400).json({ error: 'Texte trop court.' }); return; }
      prompt = 'Tu es le relecteur d\'une agence immobilière française. Corrige l\'orthographe, la grammaire et la ponctuation du texte suivant, et améliore légèrement la fluidité pour une annonce/avis de valeur professionnel. IMPORTANT : n\'invente AUCUNE information, ne rajoute aucun équipement ni détail qui n\'y figure pas, garde le même contenu et une longueur similaire. Réponds UNIQUEMENT avec le texte corrigé, sans préambule ni commentaire.\n\nTexte :\n' + text;
    }

    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',   // rapide et économique
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if(!r.ok){
      var t = await r.text();
      res.status(502).json({ error: 'IA texte : ' + t.slice(0, 200) });
      return;
    }
    var j = await r.json();
    var out = (j.content || []).filter(function(b){return b.type==='text';}).map(function(b){return b.text;}).join(' ').trim();
    if(!out){ res.status(502).json({ error: 'Réponse vide du modèle.' }); return; }
    res.status(200).json({ text: out });
  }catch(e){
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
