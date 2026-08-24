// ============================================================
//  ESTIMAKE — Réaménagement IA d'une pièce (fonction serverless Vercel)
//  Pipeline : Claude (vision) rédige un prompt de style à partir de la
//  photo → Stability AI "structure control" restyle la pièce EN CONSERVANT
//  l'architecture réelle (murs, fenêtres, volumes, point de vue).
//  On peut aussi transformer la pièce en un autre usage (cuisine, chambre,
//  dressing…) tout en gardant la structure.
//
//  CLÉS (variables d'environnement Vercel, JAMAIS dans le code front) :
//    - STABILITY_API_KEY   (obligatoire) → https://platform.stability.ai/
//    - ANTHROPIC_API_KEY   (optionnel)   → améliore le prompt via Claude
// ============================================================

export const config = { maxDuration: 60 };

const STYLES = {
  'Moderne':    'a bright modern interior, clean lines, neutral palette, designer furniture, warm natural light',
  'Scandinave': 'a cozy scandinavian interior, light wood, white walls, soft textiles, minimal warm decor',
  'Cosy':       'a warm cosy interior, soft ambient lighting, comfortable seating, plants, layered textiles',
  'Luxe':       'an upscale luxury interior, elegant materials, marble and brass accents, refined designer furniture',
  'Épuré':      'a decluttered, minimalist, professionally staged interior, neutral tones, spacious airy feel',
  'Industriel': 'a warm industrial interior, exposed brick and concrete, black metal frames, wood and leather'
};

// Aménagements cibles (transformer l'usage de la pièce sans toucher à la structure)
const ROOMS = {
  'cuisine':          'a fully fitted kitchen: cabinets, worktop, sink, hob and appliances along the existing walls',
  'salon':            'a living room: sofa, armchairs, coffee table, rug and a TV unit',
  'salle à manger':   'a dining room: a dining table with chairs and a sideboard',
  'chambre':          'a bedroom: a double bed with bedside tables and a wardrobe',
  "chambre d'enfant": "a child's bedroom: a single bed, storage and playful yet tasteful decor",
  'dressing':         'a walk-in dressing room: open wardrobes, shelving, a bench and a mirror',
  'salle de bain':    'a bathroom: vanity unit with basin, large mirror, and a walk-in shower or bathtub',
  'bureau':           'a home office: a desk, an ergonomic chair and wall shelving'
};

var KEEP = 'ABSOLUTE PRIORITY: keep the EXACT same room — identical walls, windows, doors, ceiling, floor surface, room size and camera viewpoint. Do NOT invent a different, larger or fancier room. Change only the furniture, fixtures, materials, colours and lighting. Photorealistic professional real-estate interior photograph, realistic perspective, high detail.';
var NEG  = 'different room, changed or added windows, moved walls, altered architecture, bigger room, distorted or warped perspective, fisheye, extra rooms, unrealistic proportions, cartoon, illustration, blurry, low quality, watermark, text, logo';

function defaultPrompt(style, room){
  var s = STYLES[style] || STYLES['Moderne'];
  var head;
  if(room && ROOMS[room]){
    head = 'Redesign this exact room into ' + ROOMS[room] + ', decorated as ' + s + '. ';
  } else {
    head = 'Restyle this exact room as ' + s + '. ';
  }
  return head + KEEP;
}

async function claudePrompt(key, b64, mediaType, style, room){
  var target = (room && ROOMS[room])
    ? ('transform it into ' + ROOMS[room] + ', decorated in a "' + style + '" style')
    : ('restyle it in a "' + style + '" style');
  var r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-opus-5',
      max_tokens: 320,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
        { type: 'text', text: 'You are an interior designer preparing a real-estate virtual-staging prompt. Looking at THIS exact room, write ONE rich concrete English sentence describing how to ' + target + ' — specify furniture, materials, colours, textiles and lighting. You MUST keep the exact same walls, windows, doors, ceiling, floor area and camera viewpoint; never enlarge or replace the room. Reply with the image-generation prompt only, no preamble.' }
      ]}]
    })
  });
  if(!r.ok) return null;
  var j = await r.json();
  var t = (j.content || []).filter(function(b){return b.type==='text';}).map(function(b){return b.text;}).join(' ').trim();
  return t ? (t + ' ' + KEEP) : null;
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
    var room  = (body && body.room) || '';
    var notes = (body && body.notes ? String(body.notes) : '').trim().slice(0, 400);
    if(!image){ res.status(400).json({ error: 'Aucune image reçue.' }); return; }

    var mediaType = 'image/jpeg';
    var m = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(image);
    if(m){ mediaType = m[1]; }
    var b64 = image.split(',').pop();
    var bytes = Buffer.from(b64, 'base64');

    // 1) Prompt de style (Claude si dispo, sinon défaut)
    var prompt = defaultPrompt(style, room);
    if(ANTH){ try{ var p = await claudePrompt(ANTH, b64, mediaType, style, room); if(p) prompt = p; }catch(e){} }
    if(notes){ prompt += ' Specific client requests to respect: ' + notes + '.'; }

    // 2) Rendu image restylée (Stability — conserve la structure de la pièce)
    //    control_strength élevé = colle fortement à l'architecture réelle.
    var form = new FormData();
    form.append('image', new Blob([bytes], { type: mediaType }), 'room.png');
    form.append('prompt', prompt);
    form.append('negative_prompt', NEG);
    form.append('control_strength', '0.86'); // colle fortement à l'architecture réelle (murs/fenêtres/proportions)
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
