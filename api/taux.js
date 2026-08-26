// ============================================================
//  ESTIMAKE — taux de référence des crédits à l'habitat
//
//  Source : statistiques MIR (taux d'intérêt des IFM) publiées par la
//  Banque de France et diffusées par la BCE — accès public, aucune clé.
//  Série M.FR.B.A2C.P.R.A.2250.EUR.N = France, contrats nouveaux,
//  crédits à l'habitat aux ménages, taux fixé pour plus de 10 ans.
//
//  ⚠️ C'est une MOYENNE NATIONALE publiée avec ~6 semaines de retard.
//  Elle est renvoyée comme SUGGESTION : l'agent la valide ou la corrige
//  dans Paramètres avant qu'elle ne s'imprime dans un dossier acquéreur.
// ============================================================

export const config = { maxDuration: 20 };

const SERIES = 'M.FR.B.A2C.P.R.A.2250.EUR.N';   // PFIT > 10 ans (le plus proche d'un prêt immobilier)
const FALLBACK = 'M.FR.B.A2C.A.R.A.2250.EUR.N'; // toutes maturités, si la première ne répond pas

async function lireSerie(cle){
  const url = 'https://data-api.ecb.europa.eu/service/data/MIR/' + cle +
    '?lastNObservations=1&format=jsondata';
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if(!r.ok) throw new Error('BCE ' + r.status);
  const j = await r.json();
  const series = j && j.dataSets && j.dataSets[0] && j.dataSets[0].series;
  if(!series) throw new Error('réponse inattendue');
  const obs = Object.values(series)[0].observations;
  const idx = Object.keys(obs)[0];
  const valeur = obs[idx][0];
  const periodes = j.structure.dimensions.observation[0].values;
  const p = periodes[Number(idx)] || periodes[periodes.length - 1];
  if(typeof valeur !== 'number') throw new Error('valeur absente');
  return { taux: valeur, periode: p && p.id };
}

// « 2026-06 » → « juin 2026 »
const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
function moisFr(p){
  const m = /^(\d{4})-(\d{2})$/.exec(String(p || ''));
  if(!m) return p || '';
  return MOIS[Number(m[2]) - 1] + ' ' + m[1];
}

export default async function handler(req, res){
  try{
    let d;
    try{ d = await lireSerie(SERIES); }
    catch(e){ d = await lireSerie(FALLBACK); }

    const ref = Math.round(d.taux * 100) / 100;
    // La statistique officielle est un taux moyen toutes durées confondues.
    // On en dérive un ordre de grandeur par durée (écart usuel de ±0,20 point),
    // explicitement présenté comme une suggestion à valider.
    const arr = v => Math.round(v * 100) / 100;
    res.setHeader('Cache-Control', 's-maxage=43200, stale-while-revalidate=86400');
    res.status(200).json({
      reference: ref,
      periode: d.periode,
      periode_fr: moisFr(d.periode),
      t15: arr(ref - 0.20),
      t20: arr(ref),
      t25: arr(ref + 0.20),
      source: 'Banque de France / BCE — taux moyen des crédits nouveaux à l\'habitat, ' + moisFr(d.periode),
      avertissement: 'Moyenne nationale publiée avec environ six semaines de retard. Les écarts par durée sont une estimation : ajuste avec le barème de ton courtier avant de les diffuser.'
    });
  }catch(e){
    res.status(503).json({ error: 'Taux indisponibles pour le moment — saisis-les à la main : ' + String((e && e.message) || e) });
  }
}
