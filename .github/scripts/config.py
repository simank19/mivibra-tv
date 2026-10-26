"""Escribe assets/www/config.js con los secretos del repositorio (si existen)."""
import json, os, re

out = 'app/src/main/assets/www/config.js'
fb = os.environ.get('MV_FIREBASE', '').strip()
if not fb:
    print('Sin MV_FIREBASE: la app queda sin inicio de sesión')
    raise SystemExit(0)
# Acepta lo que copia la consola de Firebase: const firebaseConfig = { apiKey: "...", ... };
body = fb[fb.find('{'):fb.rfind('}') + 1]
body = re.sub(r'//[^\n]*', '', body)
body = re.sub(r'([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:', r'\1"\2":', body)
body = re.sub(r',\s*}', '}', body).replace("'", '"')
cfg = json.loads(body)
for k in ('apiKey', 'projectId', 'appId'):
    if not cfg.get(k):
        raise SystemExit('MV_FIREBASE no tiene ' + k)
data = {
    'firebase': cfg,
    'admin': os.environ.get('MV_ADMIN_EMAIL', '').strip().lower(),
    'webClientId': os.environ.get('MV_GOOGLE_WEB_CLIENT', '').strip(),
    'tvClientId': os.environ.get('MV_GOOGLE_TV_CLIENT', '').strip(),
    'tvClientSecret': os.environ.get('MV_GOOGLE_TV_SECRET', '').strip(),
}
if not data['admin']:
    raise SystemExit('Falta el secreto MV_ADMIN_EMAIL')
with open(out, 'w') as f:
    f.write('window.MV_CONFIG = ' + json.dumps(data) + ';\n')
print('Cuenta MiVibra configurada para el proyecto', cfg['projectId'],
      '· Google:', bool(data['webClientId']), '· Código TV:', bool(data['tvClientId']))
