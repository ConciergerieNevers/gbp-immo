// ============================================================
//  ESTIMAKE — Correction/amélioration de texte (serverless Vercel)
//  Corrige l'orthographe, la grammaire et fluidifie une description
//  de bien immobilier, sans inventer d'informations.
//  CLÉ : ANTHROPIC_API_KEY (variable d'environnement Vercel).
// ============================================================

export const config = { maxDuration: 30 };

// L'API consomme des crédits Anthropic → réservée aux utilisateurs connectés (JWT Supabase).
async function requireUser(req){
  var SB = process.env.SB_URL, SK = process.env.SB_SERVICE_KEY;
  if(!SB || !SK) return true;   // pas configuré → on ne casse pas l'app
  var tok = String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!tok) return false;
  try{
    var r = await fetch(SB.replace(/\/$/,'')+'/auth/v1/user', { headers:{ apikey:SK, Authorization:'Bearer '+tok } });
    return r.ok;
  }catch(e){ return false; }
}

export default async function handler(req, res){
  if(req.method !== 'POST'){ res.status(405).json({ error: 'Méthode non autorisée' }); return; }
  if(!(await requireUser(req))){ res.status(401).json({ error: 'Connexion requise — reconnecte-toi dans l\'app.' }); return; }
  var KEY = process.env.ANTHROPIC_API_KEY;
  if(!KEY){ res.status(503).json({ error: 'Correction IA non configurée : ajoute ANTHROPIC_API_KEY dans Vercel.' }); return; }
  try{
    var body = req.body;
    if(typeof body === 'string'){ try{ body = JSON.parse(body); }catch(e){ body = {}; } }
    var text = (body && body.text ? String(body.text) : '').trim().slice(0, 4000);
    if(text.length < 10){ res.status(400).json({ error: 'Texte trop court.' }); return; }

    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',   // rapide et économique pour de la correction
        max_tokens: 1200,
        messages: [{ role: 'user', content:
          'Tu es le relecteur d\'une agence immobilière française. Corrige l\'orthographe, la grammaire et la ponctuation du texte suivant, et améliore légèrement la fluidité pour une annonce/avis de valeur professionnel. IMPORTANT : n\'invente AUCUNE information, ne rajoute aucun équipement ni détail qui n\'y figure pas, garde le même contenu et une longueur similaire. Réponds UNIQUEMENT avec le texte corrigé, sans préambule ni commentaire.\n\nTexte :\n' + text }]
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
