// ============================================================
//  ESTIMAKE — Restyling IA d'une pièce (fonction serverless Vercel)
//  Pipeline : Claude (vision) rédige un prompt de style à partir de
//  la photo → Stability AI "structure control" produit l'image restylée
//  en conservant l'architecture de la pièce.
//
//  CLÉS (variables d'environnement Vercel, JAMAIS dans le code front) :
//    - STABILITY_API_KEY   (obligatoire) → https://platform.stability.ai/
//    - ANTHROPIC_API_KEY   (optionnel)   → améliore le prompt via Claude
//  Sans ANTHROPIC_API_KEY, un prompt par défaut est utilisé.
// ============================================================

export const config = { maxDuration: 60 };

const STYLES = {
  'Moderne':    'a bright modern interior, clean lines, neutral palette, designer furniture, warm natural light',
  'Scandinave': 'a cozy scandinavian interior, light wood, white walls, soft textiles, minimal warm decor',
  'Cosy':       'a warm cosy interior, soft ambient lighting, comfortable sofa, plants, layered textiles',
  'Luxe':       'an upscale luxury interior, elegant materials, marble and brass accents, refined furniture',
  'Épuré':      'a decluttered, tidy, professionally staged empty-feeling room, neutral tones, spacious feel'
};

function defaultPrompt(style){
  var s = STYLES[style] || STYLES['Moderne'];
  return 'Restyle this room as ' + s + '. Keep the exact same architecture, walls, windows and layout; only change furniture, decor, colors and lighting. Photorealistic, real-estate quality.';
}

async function claudePrompt(key, b64, mediaType, style){
  var r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-opus-5',   // tu peux passer à claude-haiku-4-5 pour réduire le coût
      max_tokens: 300,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
        { type: 'text', text: 'You are an interior designer. In one rich, concrete English sentence, describe how to restyle THIS room in a "' + style + '" style (furniture, colours, materials, lighting, mood), keeping the exact same architecture, walls, windows and layout. Reply with the image-generation prompt only, no preamble.' }
      ]}]
    })
  });
  if(!r.ok) return null;
  var j = await r.json();
  var t = (j.content || []).filter(function(b){return b.type==='text';}).map(function(b){return b.text;}).join(' ').trim();
  return t || null;
}

export default async function handler(req, res){
  if(req.method !== 'POST'){ res.status(405).json({ error: 'Méthode non autorisée' }); return; }
  var STAB = process.env.STABILITY_API_KEY;
  var ANTH = process.env.ANTHROPIC_API_KEY;
  if(!STAB){ res.status(503).json({ error: 'Restyling IA non configuré : ajoute STABILITY_API_KEY dans Vercel.' }); return; }
  try{
    var body = req.body;
    if(typeof body === 'string'){ try{ body = JSON.parse(body); }catch(e){ body = {}; } }
    var image = body && body.image;
    var style = (body && body.style) || 'Moderne';
    if(!image){ res.status(400).json({ error: 'Aucune image reçue.' }); return; }

    var mediaType = 'image/jpeg';
    var m = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(image);
    if(m){ mediaType = m[1]; }
    var b64 = image.split(',').pop();
    var bytes = Buffer.from(b64, 'base64');

    // 1) Prompt de style (Claude si dispo, sinon défaut)
    var prompt = defaultPrompt(style);
    if(ANTH){ try{ var p = await claudePrompt(ANTH, b64, mediaType, style); if(p) prompt = p; }catch(e){} }

    // 2) Rendu image restylée (Stability — conserve la structure de la pièce)
    var form = new FormData();
    form.append('image', new Blob([bytes], { type: mediaType }), 'room.png');
    form.append('prompt', prompt);
    form.append('control_strength', '0.7');
    form.append('output_format', 'jpeg');

    var r = await fetch('https://api.stability.ai/v2beta/stable-image/control/structure', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + STAB, 'Accept': 'image/*' },
      body: form
    });
    if(!r.ok){
      var txt = await r.text();
      res.status(502).json({ error: 'Modèle d\'image : ' + txt.slice(0, 300) });
      return;
    }
    var out = Buffer.from(await r.arrayBuffer());
    res.status(200).json({ image: 'data:image/jpeg;base64,' + out.toString('base64'), prompt: prompt });
  }catch(e){
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
