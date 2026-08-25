#!/bin/sh
# Vérifie la syntaxe de tous les scripts inline de index.html avec JavaScriptCore.
# À lancer AVANT chaque commit : ./verif-syntaxe.sh
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
python3 - <<'PY'
import io,re
src=io.open('index.html',encoding='utf-8').read()
for i,s in enumerate(re.findall(r'<script>(.*?)</script>', src, re.S)):
    code=s.replace('\\','\\\\').replace('`','\\`').replace('$','\\$')
    io.open('/tmp/_chk-%d.test.js'%i,'w',encoding='utf-8').write(
        'try{ new Function(`'+code+'`); print("script %d : OK"); }catch(e){ print("script %d : ERREUR — "+e.message); }'%(i,i))
PY
FAIL=0
for f in /tmp/_chk-*.test.js; do
  OUT=$($JSC "$f" 2>&1 | tail -1); echo "$OUT"
  case "$OUT" in *ERREUR*) FAIL=1;; esac
done
rm -f /tmp/_chk-*.test.js
[ $FAIL -eq 0 ] && echo "✅ Syntaxe OK — publication autorisée" || { echo "❌ NE PAS PUBLIER"; exit 1; }
