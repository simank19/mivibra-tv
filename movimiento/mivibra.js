/* MiVibra sobre VRM Avatar Maker (MIT, Flemming Funch; piezas CC0 de MakeHuman).
   Pone el editor en español, con la marca MiVibra, y agrega "Guardar en MiVibra": el avatar se guarda en
   este navegador (IndexedDB, mismo sitio que los juegos de MiVibra Movimiento) para usarlo en las carreras. */
(function () {
  'use strict';
  const T = {
    // Interfaz
    'VRM Avatar Maker': 'Crea tu avatar', 'Surprise me': 'Sorpréndeme', 'Copy link': 'Copiar enlace',
    'Start from a ready-made avatar': 'Empieza con un avatar listo', 'Body': 'Cuerpo', 'Female – Male': 'Femenino – Masculino',
    'Age': 'Edad', 'Muscle': 'Músculo', 'Weight': 'Peso', 'Facial features': 'Rasgos faciales', 'African': 'Rasgos africanos',
    'Asian': 'Rasgos asiáticos', 'European': 'Rasgos europeos', 'Skin and eyes': 'Piel y ojos', 'Skin tone': 'Tono de piel',
    'Skin color': 'Color de piel', 'Eye color': 'Color de ojos', 'Hair': 'Cabello', 'Color': 'Color', 'Style': 'Estilo',
    'Face shape': 'Forma de la cara', 'Beard, glasses, eyebrows': 'Barba, gafas y cejas', 'Moustache': 'Bigote', 'Beard': 'Barba',
    'Glasses and masks': 'Gafas y máscaras', 'Eyebrows': 'Cejas', 'Height': 'Altura', 'Hat': 'Sombreros y cascos', 'Makeup': 'Maquillaje',
    'Eye shadow': 'Sombra de ojos', 'Lips': 'Labios', 'Nails': 'Uñas', 'Clothes': 'Ropa', 'Outfit': 'Conjunto completo', 'Top': 'Parte de arriba',
    'Bottom': 'Parte de abajo', 'Shoes': 'Calzado', 'Expressions': 'Expresiones', 'Neutral': 'Neutral', 'Blink and talk': 'Parpadear y hablar',
    'Download as GLB': 'Descargar como GLB', 'Download as GLB (for Blender, game engines)': 'Descargar como GLB (para Blender y motores de juegos)',
    'Avatar from elsewhere too big? Fix my VRM': '¿Tu avatar de otro sitio pesa mucho? Arréglalo aquí', 'Loading…': 'Cargando…',
    'Seated': 'Sentado', 'Standing': 'De pie', 'Preview': 'Vista previa', 'Face': 'Cara', 'Avatar name': 'Nombre del avatar',
    'Download VRM': 'Descargar VRM', 'Open VRM…': 'Abrir VRM…', 'Building…': 'Preparando…', 'Reset face shape': 'Restablecer la cara',
    'As made': 'Original', 'Other color': 'Otro color', 'Natural (skin tone slider)': 'Natural (según el tono de piel)',
    'Link copied: it opens this avatar in the maker.': 'Enlace copiado: abre este avatar en el editor.',
    "Couldn't copy the link; it's in the address bar now.": 'No se pudo copiar; el enlace quedó en la barra de direcciones.',
    'Not a VRM/GLB file': 'No es un archivo VRM o GLB',
    'A random person in one of the ready-made outfits': 'Una persona al azar con uno de los conjuntos listos',
    'A link that opens this avatar in the maker': 'Un enlace que abre este avatar en el editor',
    'See the downloaded avatar moving: hair physics, eyes that follow you, blinking': 'Mira el avatar en movimiento: pelo que se mueve, ojos que te siguen y parpadeo',
    "The same avatar as plain glTF, for Blender, game engines and 3D viewers that don't read VRM": 'El mismo avatar en glTF, para Blender, motores de juegos y visores 3D',
    // Grupos y controles de la cara
    'Ears': 'Orejas', 'Nose': 'Nariz', 'Size': 'Tamaño', 'Width': 'Ancho', 'Length': 'Largo', 'Projection': 'Proyección', 'Bridge hump': 'Tabique',
    'Tip down – up': 'Punta abajo – arriba', 'Nostrils': 'Fosas nasales', 'Face width': 'Ancho de la cara', 'Face length': 'Largo de la cara',
    'Chin width': 'Ancho del mentón', 'Chin': 'Mentón', 'Cheekbones': 'Pómulos', 'Mouth width': 'Ancho de la boca', 'Eye size': 'Tamaño de ojos',
    'Sticking out': 'Separadas', 'Pointed': 'Puntiagudas',
    // Expresiones
    'happy': 'Feliz', 'relaxed': 'Relajado', 'sad': 'Triste', 'angry': 'Enojado', 'surprised': 'Sorprendido', 'blink': 'Parpadeo',
    'blink left': 'Guiño izquierdo', 'blink right': 'Guiño derecho', 'aa': 'Boca: aa', 'ih': 'Boca: ih', 'ou': 'Boca: ou', 'ee': 'Boca: ee', 'oh': 'Boca: oh',
    // Colores
    'Black': 'Negro', 'Dark brown': 'Castaño oscuro', 'Brown': 'Castaño', 'Auburn': 'Caoba', 'Red': 'Rojo', 'Dark blonde': 'Rubio oscuro',
    'Blonde': 'Rubio', 'Light blonde': 'Rubio claro', 'Grey': 'Gris', 'White': 'Blanco', 'Blue': 'Azul', 'Teal': 'Verde azulado', 'Green': 'Verde',
    'Purple': 'Morado', 'Pink': 'Rosado', 'Silver': 'Plateado', 'Gold': 'Dorado',
    'brown': 'Café', 'brownlight': 'Café claro', 'green': 'Verde', 'bluegreen': 'Verde azulado', 'blue': 'Azul', 'lightblue': 'Azul claro',
    'deepblue': 'Azul intenso', 'grey': 'Gris', 'ice': 'Hielo',
    // Cabello
    'Short, side part': 'Corto, de lado', 'Short, swept': 'Corto, peinado', 'Short, rounded': 'Corto, redondo', 'Short, cropped': 'Corto, al ras',
    'Short, layered': 'Corto, en capas', 'Short, messy': 'Corto, despeinado', 'Afro': 'Afro', 'Curly': 'Rizado', 'Shaggy': 'Desfilado',
    'Bob': 'Bob', 'Bob, long': 'Bob largo', 'Bob, blunt': 'Bob recto', 'Bob, blunt with bangs': 'Bob recto con flequillo', 'Bob, curled under': 'Bob hacia adentro',
    'Bob, curled with bangs': 'Bob ondulado con flequillo', 'Bob, inverted': 'Bob invertido', 'Bob, inverted with bangs': 'Bob invertido con flequillo',
    'Straight with bangs': 'Liso con flequillo', 'Long, loose': 'Largo suelto', 'Long': 'Largo', 'Ponytail': 'Cola de caballo', 'Braid': 'Trenza', 'None': 'Ninguno',
    // Barba y gafas
    'Full short beard': 'Barba corta completa', 'Stubble': 'Barba de pocos días', 'Goatee': 'Candado', 'Jawline beard': 'Barba en la mandíbula', 'Long beard': 'Barba larga',
    'Black frames': 'Marco negro', 'Red frames': 'Marco rojo', 'Narrow': 'Delgadas', 'Half rim': 'Media montura', 'Rimless': 'Sin marco', 'Visor': 'Visor',
    'Slit visor': 'Visor de ranura', 'Domino mask': 'Antifaz', 'Bat mask': 'Máscara de murciélago', 'Round, tinted': 'Redondas, oscuras',
    // Sombreros
    'Fedora': 'Fedora', 'Fedora, tilted': 'Fedora inclinado', 'Cloche': 'Sombrero campana', 'Santa hat': 'Gorro navideño', 'Motorcycle helmet': 'Casco de moto',
    'Dragon helmet': 'Casco de dragón', 'Horned skull helmet': 'Casco de calavera con cuernos', 'Hero hood': 'Capucha de héroe', 'Hero hood, two-tone': 'Capucha de héroe bicolor',
    'Devil mask': 'Máscara de diablo', 'Monk hood': 'Capucha de monje', 'Wizard hood': 'Capucha de mago', 'Sorcerer hood': 'Capucha de hechicero', 'Horns': 'Cuernos', 'Faun horns': 'Cuernos de fauno',
    // Ropa
    'T-shirt and jeans': 'Camiseta y jean', 'White T-shirt and jeans': 'Camiseta blanca y jean', 'Shirt and jeans': 'Camisa y jean', 'Striped shirt and jeans': 'Camisa a rayas y jean',
    'Jacket and jeans': 'Chaqueta y jean', 'Suit and tie': 'Traje y corbata', 'Fitted T-shirt and jeans': 'Camiseta ajustada y jean', 'T-shirt and shorts': 'Camiseta y shorts',
    'Sporty top and trousers': 'Top deportivo y pantalón', 'Long-sleeve shirt and jeans': 'Camisa manga larga y jean', 'Dungarees': 'Overol', 'Blouse and skirt': 'Blusa y falda',
    'Cyborg suit': 'Traje cyborg', 'Galactic uniform': 'Uniforme galáctico', 'Black bodysuit': 'Enterizo negro', 'Space suit': 'Traje espacial', 'Neon bodysuit': 'Enterizo neón',
    'Hero suit, red and black': 'Traje de héroe rojo y negro', 'Hero suit, red': 'Traje de héroe rojo', 'Hero suit, split': 'Traje de héroe dividido', 'Hero suit, striped': 'Traje de héroe a rayas',
    'Monk robe': 'Hábito de monje', 'Wizard robe': 'Túnica de mago', 'Sorcerer robe': 'Túnica de hechicero', 'Kimono': 'Kimono', 'Halter dress': 'Vestido halter',
    'Halter dress, midi': 'Vestido halter midi', 'Fluted dress': 'Vestido con vuelo', 'Cut-out dress': 'Vestido con aberturas', 'Shift dress': 'Vestido recto',
    'Full-skirt dress': 'Vestido de falda amplia', 'Strapless dress': 'Vestido strapless', 'Bodice dress, lace': 'Vestido de encaje', 'Keyhole dress': 'Vestido con escote',
    'Tiered dress': 'Vestido de volantes', 'T-shirt': 'Camiseta', 'Fitted T-shirt': 'Camiseta ajustada', 'Tucked T-shirt': 'Camiseta por dentro', 'Polo shirt': 'Polo',
    'Sweater': 'Suéter', 'Halter top': 'Top halter', 'Tank top': 'Esqueleto', 'Bodice': 'Corpiño', 'Camisole': 'Camisola', 'Viking tunic': 'Túnica vikinga',
    'Trousers': 'Pantalón', 'Cargo trousers': 'Pantalón cargo', 'Harem trousers': 'Pantalón bombacho', 'Denim shorts': 'Shorts de jean', 'Viking trousers': 'Pantalón vikingo',
    'Long skirt': 'Falda larga', 'Lace ruffle skirt': 'Falda de encaje', 'Tiered mini skirt': 'Minifalda de volantes', 'Tiered skirt': 'Falda de volantes',
    'Sneakers': 'Tenis', 'Shoes 1': 'Zapatos 1', 'Shoes 3': 'Zapatos 2', 'Shoes 4': 'Zapatos 3', 'Shoes 5': 'Zapatos 4', 'Shoes 6': 'Zapatos 5', 'Ankle boots': 'Botines',
    'White ankle boots': 'Botines blancos', 'Cloth shoes': 'Zapatos de tela', 'Knee boots, red': 'Botas altas rojas', 'Knee boots, blue': 'Botas altas azules',
    'Thigh boots, black': 'Botas largas negras', 'Cuffed boots, green': 'Botas verdes', 'Boots, red and black': 'Botas rojo y negro', 'Viking boots': 'Botas vikingas',
    // Avatares listos
    'Office, suit': 'Oficina, traje', 'Office, blouse': 'Oficina, blusa', 'Casual, afro': 'Casual, afro', 'Casual, long hair': 'Casual, pelo largo',
    'Older, grey beard': 'Mayor, barba gris', 'Older, cardigan look': 'Mayor, con cárdigan', 'Stubble, long sleeves': 'Barba corta, manga larga',
    'Sporty, ponytail': 'Deportiva, cola de caballo', 'Dungarees, teal hair': 'Overol, pelo turquesa', 'Summer, braid': 'Verano, trenza', 'Bald, moustache': 'Calvo, bigote',
    'Older, midi dress': 'Mayor, vestido midi', 'Fedora, jawline beard': 'Fedora y barba', 'Sweater, auburn bob': 'Suéter, bob caoba', 'Hero, hood': 'Héroe con capucha',
    'Heroine, mask': 'Heroína con antifaz', 'Space officer': 'Oficial espacial', 'Cyborg': 'Cyborg', 'Monk': 'Monje', 'Viking': 'Vikingo', 'Alien, visor': 'Alien con visor',
    'Faun, fluted dress': 'Fauno, vestido', 'Tiered dress, curls': 'Vestido y rizos', 'Cloche hat, shift dress': 'Sombrero campana y vestido', 'White T-shirt, goatee': 'Camiseta blanca y candado',
    'Tilted fedora, striped shirt': 'Fedora y camisa a rayas', 'Lace dress, long hair': 'Vestido de encaje, pelo largo', 'Bodice and harem trousers': 'Corpiño y bombacho',
    'Santa hat, long beard': 'Gorro navideño y barba', 'Warrior, red crest': 'Guerrero de cresta roja', 'Hero, domino mask': 'Héroe con antifaz', 'Devil mask, red suit': 'Máscara de diablo',
    'Tiered skirt, camisole': 'Falda de volantes y camisola', 'Wizard, starry robe': 'Mago de estrellas', 'Sorceress, purple robe': 'Hechicera morada'
  };
  const tr = (s) => { const k = s.trim(); if (!k || !Object.prototype.hasOwnProperty.call(T, k)) return null; return s.replace(k, T[k]); };
  const STATUS = /^([\d.,\s]+) triangles$/;
  function fixNode(n) {
    if (n.nodeType === 3) {
      const v = n.nodeValue; let o = tr(v);
      if (o == null) { const m = STATUS.exec(v.trim()); if (m) o = m[1] + ' triángulos'; }
      if (o == null && /^\d+ y$/.test(v.trim())) o = v.replace(/ y$/, ' años');
      if (o == null && / of [\d.,]+ allowed/.test(v)) o = v.replace(/ of ([\d.,]+) allowed/, ' de $1 permitidos').replace(/ — too many for So Many Rooms; pick lighter hair, beard or clothes/, ' — demasiados: elige pelo, barba o ropa más livianos');
      if (o != null && o !== v) n.nodeValue = o;
      return;
    }
    if (n.nodeType !== 1) return;
    for (const a of ['title', 'placeholder', 'aria-label']) { const v = n.getAttribute && n.getAttribute(a); if (v) { const o = tr(v); if (o != null && o !== v) n.setAttribute(a, o); } }
    if (n.tagName === 'OPTION') { const o = tr(n.textContent.replace('_', ' ')); if (o != null) n.textContent = o; }
    for (const c of n.childNodes) fixNode(c);
  }
  const mo = new MutationObserver((list) => { mo.disconnect(); for (const m of list) { if (m.type === 'characterData') fixNode(m.target); else { m.addedNodes.forEach(fixNode); if (m.type === 'attributes') fixNode(m.target); } } watch(); });
  const watch = () => mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder'] });

  // ---------- Guardar el avatar para los juegos (IndexedDB, mismo sitio que MiVibra Movimiento) ----------
  function db() { return new Promise((res, rej) => { const r = indexedDB.open('mivibra-movimiento', 1); r.onupgradeneeded = () => r.result.createObjectStore('avatar'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  async function saveAvatar(buf, name) { const d = await db(); await new Promise((res, rej) => { const t = d.transaction('avatar', 'readwrite'); t.objectStore('avatar').put({ vrm: buf, name, at: Date.now() }, 'me'); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
  function toast(msg, ms) { let el = document.getElementById('mv-toast'); if (!el) { el = document.createElement('div'); el.id = 'mv-toast'; document.body.appendChild(el); } el.innerHTML = msg; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), ms || 3200); }

  function brand() {
    const h1 = document.querySelector('#panel h1');
    if (h1 && !h1.dataset.mv) {
      h1.dataset.mv = 1;
      h1.innerHTML = '<svg width="30" height="30" viewBox="0 0 48 48" fill="none" aria-hidden="true"><polygon points="24,3 42.2,13.5 42.2,34.5 24,45 5.8,34.5 5.8,13.5" stroke="#FF6900" stroke-width="2.8" stroke-linejoin="round"/><circle cx="24" cy="24" r="4" fill="#FF6900"/><g stroke="#FF6900" stroke-width="2.2"><path d="M24 24V10M24 24l12-7M24 24l12 7M24 24v14M24 24l-12 7M24 24l-12-7"/></g></svg><span><small>MIVIBRA MOVIMIENTO</small>Crea tu avatar</span>';
    }
    const bar = document.getElementById('bar');
    if (bar && !document.getElementById('mv-save')) {
      const save = document.createElement('button'); save.id = 'mv-save'; save.className = 'main'; save.textContent = 'Guardar en MiVibra';
      const play = document.createElement('a'); play.id = 'mv-play'; play.href = '../vallas/'; play.textContent = 'Probar en 100 m vallas';
      bar.insertBefore(save, bar.children[1]);
      bar.insertBefore(play, save.nextSibling);
      document.getElementById('download').className = 'plain';
      save.addEventListener('click', async () => {
        if (!window.MV_EXPORT) { toast('El editor todavía está cargando'); return; }
        const label = save.textContent; save.disabled = true; save.textContent = 'Guardando…';
        try {
          const buf = await window.MV_EXPORT();
          const name = (document.getElementById('name').value || 'Mi avatar').trim();
          await saveAvatar(buf, name);
          toast('<b>¡Avatar guardado!</b> Ya corre contigo en MiVibra Movimiento. <a href="../vallas/">Probar ahora</a>', 5000);
          play.classList.add('ready');
        } catch (e) { toast('No se pudo guardar: ' + (e && e.message || e)); }
        finally { save.disabled = false; save.textContent = label; }
      });
    }
    if (!document.getElementById('mv-credit')) {
      const c = document.createElement('div'); c.id = 'mv-credit';
      c.innerHTML = 'Basado en <a href="https://github.com/ffunch/vrm-avatar-maker" target="_blank" rel="noopener">VRM Avatar Maker</a> (MIT) · piezas CC0 de MakeHuman';
      document.getElementById('panel').appendChild(c);
    }
  }
  function start() { document.documentElement.lang = 'es'; document.title = 'MiVibra · Crea tu avatar'; brand(); fixNode(document.body); watch(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
