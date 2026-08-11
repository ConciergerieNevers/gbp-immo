// ============================================================
//  ESTIMAKE — Ventes réelles DVF (fonction serverless Vercel)
//  Récupère les mutations réellement enregistrées (données geo-DVF
//  ouvertes de la DGFiP) pour la commune, filtre par type de bien et
//  proximité de l'adresse, et renvoie des comparables + la médiane €/m².
//  Côté serveur → pas de blocage CORS (contrairement à un appel direct
//  depuis le navigateur). Aucune clé requise (données ouvertes).
//  Appel : /api/dvf?insee=58194&lat=46.98&lon=3.16&type=Maison&rayon=800
// ============================================================

export const config = { maxDuration: 30 };

function haversine(la1, lo1, la2, lo2){
  var R=6371000, d=Math.PI/180;
  var a=Math.sin((la2-la1)*d/2)**2 + Math.cos(la1*d)*Math.cos(la2*d)*Math.sin((lo2-lo1)*d/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
function median(arr){ if(!arr.length) return 0; var s=arr.slice().sort(function(a,b){return a-b;}); var m=Math.floor(s.length/2);
  return s.length%2 ? s[m] : (s[m-1]+s[m])/2; }
function parseLine(line){
  var out=[], cur='', q=false;
  for(var i=0;i<line.length;i++){ var c=line[i];
    if(c==='"'){ q=!q; }
    else if(c===',' && !q){ out.push(cur); cur=''; }
    else { cur+=c; } }
  out.push(cur); return out;
}

export default async function handler(req, res){
  try{
    var q = req.query || {};
    var insee = String(q.insee||'').trim();
    var lat = parseFloat(q.lat), lon = parseFloat(q.lon);
    var type = (q.type==='Appartement') ? 'Appartement' : 'Maison';
    var rayon = Math.min(parseInt(q.rayon,10)||800, 5000);
    if(!/^\d{5}$/.test(insee) || isNaN(lat) || isNaN(lon)){
      res.status(400).json({ error: 'Paramètres manquants (insee, lat, lon).' }); return;
    }
    var dept = insee.slice(0,2);

    // Récupère 2 années de données pour élargir l'échantillon
    var years = ['2024','2023'];
    var rows = [];
    for(var y=0; y<years.length; y++){
      var url = 'https://files.data.gouv.fr/geo-dvf/latest/csv/'+years[y]+'/communes/'+dept+'/'+insee+'.csv';
      try{
        var r = await fetch(url);
        if(!r.ok) continue;
        var txt = await r.text();
        var lines = txt.split('\n');
        if(lines.length<2) continue;
        var head = parseLine(lines[0]);
        var idx = function(name){ return head.indexOf(name); };
        var iId=idx('id_mutation'), iDate=idx('date_mutation'), iVal=idx('valeur_fonciere'),
            iType=idx('type_local'), iSurf=idx('surface_reelle_bati'),
            iNum=idx('adresse_numero'), iVoie=idx('adresse_nom_voie'),
            iLon=idx('longitude'), iLat=idx('latitude');
        for(var i=1;i<lines.length;i++){
          if(!lines[i]) continue;
          var f = parseLine(lines[i]);
          if(f[iType]!==type) continue;
          var val=parseFloat(f[iVal]), surf=parseFloat(f[iSurf]),
              plat=parseFloat(f[iLat]), plon=parseFloat(f[iLon]);
          if(!(val>0) || !(surf>9) || isNaN(plat) || isNaN(plon)) continue;
          rows.push({ id:f[iId], date:f[iDate], val:val, surf:surf, lat:plat, lon:plon,
            adr:((f[iNum]||'')+' '+(f[iVoie]||'')).trim() });
        }
      }catch(e){ /* année indisponible → on continue */ }
    }
    if(!rows.length){ res.status(200).json({ comparables:[], median:0, count:0, note:'Aucune vente DVF trouvée pour cette commune.' }); return; }

    // Ne garde que les mutations à un seul lot bâti de ce type (évite les €/m² faussés)
    var byId={}; rows.forEach(function(r){ (byId[r.id]=byId[r.id]||[]).push(r); });
    var clean=[];
    Object.keys(byId).forEach(function(k){ if(byId[k].length===1) clean.push(byId[k][0]); });

    // Distance + €/m², filtre rayon + valeurs aberrantes
    clean.forEach(function(r){ r.dist=haversine(lat,lon,r.lat,r.lon); r.pm2=r.val/r.surf; });
    var near = clean.filter(function(r){ return r.dist<=rayon && r.pm2>=300 && r.pm2<=9000; })
                    .sort(function(a,b){ return a.dist-b.dist; });
    if(near.length<3){ // élargit si trop peu de ventes dans le rayon
      near = clean.filter(function(r){ return r.pm2>=300 && r.pm2<=9000; })
                  .sort(function(a,b){ return a.dist-b.dist; });
    }
    var top = near.slice(0, 8);
    var med = median(top.map(function(r){ return r.pm2; }));

    res.status(200).json({
      median: Math.round(med),
      count: top.length,
      comparables: top.map(function(r){
        return { adresse:(r.adr||'Adresse non communiquée'), date:r.date, surface:Math.round(r.surf),
          prix:Math.round(r.val), pm2:Math.round(r.pm2), distance:Math.round(r.dist) };
      })
    });
  }catch(e){
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
