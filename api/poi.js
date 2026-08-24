// ============================================================
//  ESTIMAKE — Commodités à proximité (fonction serverless Vercel)
//  Interroge Overpass (OpenStreetMap) côté serveur (pas de CORS),
//  avec miroirs de secours, et renvoie la commodité la plus proche
//  par catégorie avec sa distance. Données ouvertes, aucune clé.
//  Appel : /api/poi?lat=46.98&lon=3.15
// ============================================================

export const config = { maxDuration: 20 };

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

const CATS = [
  ['school',       'École'],
  ['kindergarten', 'Crèche / maternelle'],
  ['supermarket',  'Supermarché'],
  ['bakery',       'Boulangerie'],
  ['convenience',  'Supérette'],
  ['pharmacy',     'Pharmacie'],
  ['doctors',      'Médecin'],
  ['hospital',     'Hôpital'],
  ['post_office',  'Poste'],
  ['station',      'Gare'],
  ['bus_stop',     'Arrêt de bus']
];

function hv(a1,o1,a2,o2){
  var d=Math.PI/180,R=6371000;
  var x=Math.sin((a2-a1)*d/2),y=Math.sin((o2-o1)*d/2);
  return 2*R*Math.asin(Math.sqrt(x*x+Math.cos(a1*d)*Math.cos(a2*d)*y*y));
}

export default async function handler(req, res){
  try{
    var lat=parseFloat((req.query||{}).lat), lon=parseFloat((req.query||{}).lon);
    if(isNaN(lat)||isNaN(lon)){ res.status(400).json({ error:'lat/lon manquants' }); return; }
    var qy='[out:json][timeout:12];('+
      'node(around:1300,'+lat+','+lon+')[amenity~"school|kindergarten|pharmacy|doctors|hospital|post_office"];'+
      'node(around:1300,'+lat+','+lon+')[shop~"supermarket|bakery|convenience"];'+
      'node(around:3000,'+lat+','+lon+')[railway=station];'+
      'node(around:900,'+lat+','+lon+')[highway=bus_stop];'+
      ');out body 100;';
    var j=null, lastErr=null;
    for(var m=0;m<MIRRORS.length && !j;m++){
      try{
        var r=await fetch(MIRRORS[m], { method:'POST',
          headers:{'Content-Type':'application/x-www-form-urlencoded'},
          body:'data='+encodeURIComponent(qy) });
        if(r.ok){ j=await r.json(); }
        else { lastErr='HTTP '+r.status; }
      }catch(e){ lastErr=String((e&&e.message)||e); }
    }
    if(!j){ res.status(502).json({ error:'Overpass indisponible ('+lastErr+')' }); return; }
    var best={};
    (j.elements||[]).forEach(function(el){
      var t=el.tags||{};
      var key=t.amenity||t.shop||(t.railway==='station'?'station':(t.highway==='bus_stop'?'bus_stop':null));
      if(!key||el.lat===undefined) return;
      var dist=hv(lat,lon,el.lat,el.lon);
      if(best[key]===undefined||dist<best[key]) best[key]=dist;
    });
    var out=[];
    CATS.forEach(function(c){
      if(best[c[0]]!==undefined){ out.push({ label:c[1], m:Math.round(best[c[0]]/10)*10 }); }
    });
    res.status(200).json({ poi:out });
  }catch(e){
    res.status(500).json({ error:String((e&&e.message)||e) });
  }
}
