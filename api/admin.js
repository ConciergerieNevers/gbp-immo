// ============================================================
//  ESTIMAKE — administration des comptes (fonction serverless Vercel)
//
//  Créer un compte utilisateur exige la clé de service Supabase, qui ne doit
//  JAMAIS se trouver côté navigateur. Cette fonction fait l'intermédiaire :
//    1. elle vérifie le jeton de l'appelant,
//    2. elle vérifie qu'il est bien administrateur (table profils),
//    3. seulement alors elle agit.
//
//  Variables Vercel déjà en place : SB_URL, SB_SERVICE_KEY.
//  Le jeton arrive dans le CORPS (body._auth) : le JWT peut être trop gros
//  pour un en-tête (erreur 494 chez Vercel).
// ============================================================

export const config = { maxDuration: 20 };

const SB = (process.env.SB_URL || '').replace(/\/$/, '');
const SK = process.env.SB_SERVICE_KEY || '';

function admin(path, init){
  return fetch(SB + path, {
    ...init,
    headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json', ...(init && init.headers) }
  });
}

// Qui appelle, et est-il administrateur ?
async function appelant(token){
  if(!token) return null;
  const r = await fetch(SB + '/auth/v1/user', { headers: { apikey: SK, Authorization: 'Bearer ' + token } });
  if(!r.ok) return null;
  const u = await r.json();
  if(!u || !u.id) return null;
  const p = await admin('/rest/v1/profils?id=eq.' + u.id + '&select=role,actif');
  const rows = p.ok ? await p.json() : [];
  const prof = rows[0] || {};
  return { id: u.id, email: u.email, admin: prof.role === 'admin' && prof.actif !== false };
}

export default async function handler(req, res){
  if(req.method !== 'POST'){ res.status(405).json({ error: 'Méthode non autorisée' }); return; }
  if(!SB || !SK){ res.status(503).json({ error: 'Administration non configurée : SB_URL et SB_SERVICE_KEY manquent dans Vercel.' }); return; }

  let body = req.body;
  if(typeof body === 'string'){ try{ body = JSON.parse(body); }catch(e){ body = {}; } }
  body = body || {};

  const moi = await appelant(body._auth);
  if(!moi){ res.status(401).json({ error: 'Connexion requise.' }); return; }
  if(!moi.admin){ res.status(403).json({ error: 'Réservé aux administrateurs.' }); return; }

  try{
    const action = body.action;

    // ---- liste des comptes, avec le volume de données de chacun
    if(action === 'liste'){
      const p = await admin('/rest/v1/profils?select=id,email,nom,role,agence,actif,created_at&order=created_at.asc');
      if(!p.ok) throw new Error(await p.text());
      const profils = await p.json();

      const tables = ['biens','contacts','estimations','ventes','taches','rdv'];
      const compte = {};
      for(const t of tables){
        const r = await admin('/rest/v1/' + t + '?select=user_id&deleted=eq.false', { headers: { Prefer: 'count=exact' } });
        if(!r.ok) continue;
        const lignes = await r.json();
        for(const l of lignes){
          if(!l.user_id) continue;
          compte[l.user_id] = compte[l.user_id] || {};
          compte[l.user_id][t] = (compte[l.user_id][t] || 0) + 1;
        }
      }
      res.status(200).json({ profils: profils.map(x => ({ ...x, volumes: compte[x.id] || {} })) });
      return;
    }

    // ---- création d'un compte
    if(action === 'creer'){
      const email = String(body.email || '').trim().toLowerCase();
      const mdp = String(body.motdepasse || '');
      const nom = String(body.nom || '').trim();
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ res.status(400).json({ error: 'Adresse e-mail invalide.' }); return; }
      if(mdp.length < 8){ res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères.' }); return; }

      const c = await admin('/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email, password: mdp, email_confirm: true, user_metadata: { nom } })
      });
      const j = await c.json().catch(() => ({}));
      if(!c.ok){ res.status(400).json({ error: (j && (j.msg || j.message || j.error_description)) || 'Création impossible.' }); return; }

      // le déclencheur SQL a créé le profil ; on complète le nom et l'agence
      if(nom || body.agence){
        await admin('/rest/v1/profils?id=eq.' + j.id, {
          method: 'PATCH',
          body: JSON.stringify({ nom: nom || null, agence: body.agence || null })
        });
      }
      res.status(200).json({ ok: true, id: j.id, email });
      return;
    }

    // ---- rôle, activation, agence
    if(action === 'majprofil'){
      const id = String(body.id || '');
      if(!id){ res.status(400).json({ error: 'Compte non précisé.' }); return; }
      if(id === moi.id && body.role && body.role !== 'admin'){
        res.status(400).json({ error: 'Tu ne peux pas retirer ton propre rôle d\'administrateur.' }); return;
      }
      if(id === moi.id && body.actif === false){
        res.status(400).json({ error: 'Tu ne peux pas désactiver ton propre compte.' }); return;
      }
      const patch = {};
      if(body.role) patch.role = (body.role === 'admin') ? 'admin' : 'agent';
      if(body.actif !== undefined) patch.actif = !!body.actif;
      if(body.nom !== undefined) patch.nom = body.nom || null;
      if(body.agence !== undefined) patch.agence = body.agence || null;
      if(!Object.keys(patch).length){ res.status(400).json({ error: 'Rien à modifier.' }); return; }

      const r = await admin('/rest/v1/profils?id=eq.' + id, { method: 'PATCH', body: JSON.stringify(patch) });
      if(!r.ok) throw new Error(await r.text());

      // un compte désactivé perd immédiatement ses sessions
      if(body.actif === false){
        await admin('/auth/v1/admin/users/' + id, { method: 'PUT', body: JSON.stringify({ ban_duration: '87600h' }) });
      } else if(body.actif === true){
        await admin('/auth/v1/admin/users/' + id, { method: 'PUT', body: JSON.stringify({ ban_duration: 'none' }) });
      }
      res.status(200).json({ ok: true });
      return;
    }

    // ---- nouveau mot de passe pour un utilisateur
    if(action === 'motdepasse'){
      const id = String(body.id || ''), mdp = String(body.motdepasse || '');
      if(!id || mdp.length < 8){ res.status(400).json({ error: 'Mot de passe trop court (8 caractères minimum).' }); return; }
      const r = await admin('/auth/v1/admin/users/' + id, { method: 'PUT', body: JSON.stringify({ password: mdp }) });
      if(!r.ok){ res.status(400).json({ error: await r.text() }); return; }
      res.status(200).json({ ok: true });
      return;
    }

    // ---- suppression définitive d'un compte (et de ses données par cascade)
    if(action === 'supprimer'){
      const id = String(body.id || '');
      if(!id){ res.status(400).json({ error: 'Compte non précisé.' }); return; }
      if(id === moi.id){ res.status(400).json({ error: 'Tu ne peux pas supprimer ton propre compte.' }); return; }
      const r = await admin('/auth/v1/admin/users/' + id, { method: 'DELETE' });
      if(!r.ok){ res.status(400).json({ error: await r.text() }); return; }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: 'Action inconnue.' });
  }catch(e){
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
