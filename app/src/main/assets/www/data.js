/* MiVibra TV — datos fijos: avatares, sistemas de juego, fuentes gratis, temas e íconos. */
(function () {
  'use strict';
  var D = {};

  // Avatares 3D de Microsoft Fluent Emoji (Licencia MIT): [archivo, nombre, grupo p=persona h=cabello r=oficio/personaje]
  D.FLUENT = [["baby", "Bebé", "p"], ["boy", "Niño", "p"], ["child", "Infante", "p"], ["girl", "Niña", "p"], ["man", "Hombre", "p"], ["old-man", "Abuelo", "p"], ["old-woman", "Abuela", "p"], ["older-person", "Persona mayor", "p"], ["person", "Persona", "p"], ["woman", "Mujer", "p"], ["man-bald", "Hombre calvo", "h"], ["man-bald-beard", "Hombre calvo con barba", "h"], ["man-beard", "Hombre con barba", "h"], ["man-blonde-hair", "Hombre rubio", "h"], ["man-curly-hair", "Hombre rizado", "h"], ["man-red-hair", "Hombre pelirrojo", "h"], ["man-white-hair", "Hombre canoso", "h"], ["person-bald", "Persona calvo", "h"], ["person-beard", "Persona con barba", "h"], ["person-blonde-hair", "Persona rubio", "h"], ["person-curly-hair", "Persona rizado", "h"], ["person-red-hair", "Persona pelirrojo", "h"], ["person-white-hair", "Persona canoso", "h"], ["woman-bald", "Mujer calvo", "h"], ["woman-beard", "Mujer con barba", "h"], ["woman-blonde-hair", "Mujer rubio", "h"], ["woman-curly-hair", "Mujer rizado", "h"], ["woman-red-hair", "Mujer pelirrojo", "h"], ["woman-white-hair", "Mujer canoso", "h"], ["man-artist", "Artista", "r"], ["man-astronaut", "Astronauta", "r"], ["man-cook", "Chef", "r"], ["man-detective", "Detective", "r"], ["man-elf", "Elfo", "r"], ["man-fairy", "Hada (él)", "r"], ["man-farmer", "Granjero", "r"], ["man-firefighter", "Bombero", "r"], ["man-guard", "Guardia", "r"], ["man-health-worker", "Médico", "r"], ["man-judge", "Juez", "r"], ["man-mage", "Mago", "r"], ["man-mechanic", "Mecánico", "r"], ["man-office-worker", "Oficina", "r"], ["man-pilot", "Piloto", "r"], ["man-police-officer", "Policía", "r"], ["man-scientist", "Científico", "r"], ["man-singer", "Cantante", "r"], ["man-student", "Estudiante", "r"], ["man-superhero", "Superhéroe", "r"], ["man-supervillain", "Villano", "r"], ["man-teacher", "Profe", "r"], ["man-technologist", "Programador", "r"], ["man-vampire", "Vampiro", "r"], ["man-with-veil", "Con velo", "r"], ["mrs-claus", "Mamá Noel", "r"], ["ninja", "Ninja", "r"], ["person-in-tuxedo", "De gala", "r"], ["person-wearing-turban", "Con turbante", "r"], ["person-with-crown", "Con corona", "r"], ["prince", "Príncipe", "r"], ["princess", "Princesa", "r"], ["santa-claus", "Papá Noel", "r"], ["woman-artist", "Artista", "r"], ["woman-astronaut", "Astronauta", "r"], ["woman-cook", "Chef", "r"], ["woman-detective", "Detective", "r"], ["woman-elf", "Elfa", "r"], ["woman-fairy", "Hada", "r"], ["woman-farmer", "Granjera", "r"], ["woman-firefighter", "Bombera", "r"], ["woman-guard", "Guardia", "r"], ["woman-health-worker", "Médica", "r"], ["woman-judge", "Jueza", "r"], ["woman-mage", "Maga", "r"], ["woman-mechanic", "Mecánica", "r"], ["woman-office-worker", "Oficina", "r"], ["woman-pilot", "Piloto", "r"], ["woman-police-officer", "Policía", "r"], ["woman-scientist", "Científica", "r"], ["woman-singer", "Cantante", "r"], ["woman-student", "Estudiante", "r"], ["woman-superhero", "Superheroína", "r"], ["woman-supervillain", "Villana", "r"], ["woman-teacher", "Profe", "r"], ["woman-technologist", "Programadora", "r"], ["woman-vampire", "Vampira", "r"], ["woman-with-headscarf", "Con pañuelo", "r"]];
  D.FLUENT_TONES = [["default", "#FFC83D", "Amarillo"], ["light", "#F7DECE", "Clara"], ["medium-light", "#E3C29C", "Media clara"], ["medium", "#C68E6A", "Media"], ["medium-dark", "#9E5D3A", "Media oscura"], ["dark", "#5C3B2E", "Oscura"]];
  // Para el creador: posición de ojos y cabeza (en 160 px), máscaras de cabello y accesorios 3D
  D.FACE = {"man":{"l":[51,84],"r":[108,84],"top":10},"woman":{"l":[50,84],"r":[109,84],"top":10},"person":{"l":[51,83],"r":[108,83],"top":10},"boy":{"l":[48,85],"r":[111,85],"top":10},"girl":{"l":[48,85],"r":[112,85],"top":10},"child":{"l":[48,85],"r":[111,85],"top":10},"baby":{"l":[46,93],"r":[114,93],"top":10},"older-person":{"l":[51,84],"r":[108,84],"top":10},"old-man":{"l":[51,83],"r":[108,84],"top":22},"old-woman":{"l":[50,89],"r":[109,89],"top":10},"man-red-hair":{"l":[51,83],"r":[108,84],"top":10},"man-curly-hair":{"l":[51,84],"r":[108,84],"top":6},"man-white-hair":{"l":[51,84],"r":[108,83],"top":10},"man-bald":{"l":[51,83],"r":[108,84],"top":22},"man-bald-beard":{"l":[51,83],"r":[108,84],"top":22},"man-blonde-hair":{"l":[51,84],"r":[108,84],"top":10},"man-beard":{"l":[51,84],"r":[108,84],"top":10},"woman-red-hair":{"l":[50,84],"r":[109,84],"top":10},"woman-curly-hair":{"l":[50,84],"r":[109,84],"top":8},"woman-white-hair":{"l":[50,84],"r":[108,84],"top":10},"woman-bald":{"l":[50,84],"r":[109,84],"top":23},"woman-blonde-hair":{"l":[51,84],"r":[109,84],"top":10},"woman-beard":{"l":[51,84],"r":[108,84],"top":10},"person-red-hair":{"l":[51,83],"r":[108,84],"top":10},"person-curly-hair":{"l":[51,83],"r":[108,83],"top":7},"person-white-hair":{"l":[51,84],"r":[109,84],"top":10},"person-bald":{"l":[51,84],"r":[108,84],"top":20},"person-blonde-hair":{"l":[51,83],"r":[108,83],"top":10},"person-beard":{"l":[50,83],"r":[108,83],"top":10},"man-artist":{"l":[63,50],"r":[96,51],"top":10},"man-astronaut":{"l":[63,50],"r":[96,50],"top":10},"man-cook":{"l":[63,51],"r":[96,50],"top":10},"man-detective":{"l":[56,61],"r":[93,61],"top":10},"man-elf":{"l":[63,50],"r":[96,50],"top":11},"man-fairy":{"l":[62,57],"r":[104,56],"top":11},"man-farmer":{"l":[63,50],"r":[95,50],"top":10},"man-firefighter":{"l":[63,50],"r":[96,51],"top":10},"man-guard":{"l":[63,73],"r":[96,73],"top":10},"man-health-worker":{"l":[63,50],"r":[97,51],"top":10},"man-judge":{"l":[63,51],"r":[96,51],"top":10},"man-mage":{"l":[63,72],"r":[96,72],"top":10},"man-mechanic":{"l":[67,98],"r":[93,93],"top":10},"man-office-worker":{"l":[63,50],"r":[96,50],"top":10},"man-pilot":{"l":[63,50],"r":[96,51],"top":10},"man-police-officer":{"l":[62,60],"r":[99,61],"top":10},"man-singer":{"l":[59,57],"r":[92,56],"top":16},"man-student":{"l":[63,50],"r":[95,49],"top":10},"man-teacher":{"l":[63,50],"r":[96,50],"top":10},"man-technologist":{"l":[63,50],"r":[96,51],"top":10},"man-vampire":{"l":[63,50],"r":[96,51],"top":10},"man-with-veil":{"l":[63,50],"r":[96,50],"top":10},"mrs-claus":{"l":[50,89],"r":[109,89],"top":10},"ninja":{"l":[64,50],"r":[96,50],"top":10},"person-in-tuxedo":{"l":[63,50],"r":[96,51],"top":10},"person-wearing-turban":{"l":[51,84],"r":[108,84],"top":9},"person-with-crown":{"l":[63,70],"r":[96,70],"top":10},"princess":{"l":[64,70],"r":[95,69],"top":10},"santa-claus":{"l":[49,31],"r":[69,33],"top":9},"woman-artist":{"l":[63,50],"r":[96,50],"top":10},"woman-astronaut":{"l":[63,50],"r":[96,50],"top":10},"woman-cook":{"l":[63,50],"r":[96,50],"top":10},"woman-detective":{"l":[56,61],"r":[93,61],"top":10},"woman-elf":{"l":[63,50],"r":[96,50],"top":10},"woman-fairy":{"l":[61,56],"r":[104,56],"top":11},"woman-farmer":{"l":[64,50],"r":[95,50],"top":10},"woman-firefighter":{"l":[63,50],"r":[96,50],"top":10},"woman-guard":{"l":[63,74],"r":[96,74],"top":10},"woman-health-worker":{"l":[63,50],"r":[96,50],"top":10},"woman-judge":{"l":[63,50],"r":[96,50],"top":10},"woman-mage":{"l":[63,77],"r":[96,77],"top":10},"woman-mechanic":{"l":[67,95],"r":[93,91],"top":10},"woman-office-worker":{"l":[63,52],"r":[96,52],"top":12},"woman-pilot":{"l":[63,50],"r":[96,50],"top":10},"woman-police-officer":{"l":[61,61],"r":[98,61],"top":10},"woman-scientist":{"l":[65,103],"r":[107,97],"top":10},"woman-singer":{"l":[59,57],"r":[92,57],"top":15},"woman-student":{"l":[64,52],"r":[96,53],"top":10},"woman-superhero":{"l":[63,50],"r":[96,50],"top":10},"woman-teacher":{"l":[63,50],"r":[96,50],"top":10},"woman-technologist":{"l":[63,50],"r":[96,50],"top":10},"woman-vampire":{"l":[63,50],"r":[96,50],"top":10},"woman-with-headscarf":{"l":[63,53],"r":[96,53],"top":10}};
  D.HAIR_MASKS = ["boy", "child", "girl", "man", "man-artist", "man-bald-beard", "man-beard", "man-curly-hair", "man-elf", "man-farmer", "man-guard", "man-health-worker", "man-judge", "man-office-worker", "man-singer", "man-teacher", "man-technologist", "man-vampire", "person", "person-beard", "person-curly-hair", "person-in-tuxedo", "princess", "woman", "woman-artist", "woman-beard", "woman-cook", "woman-curly-hair", "woman-detective", "woman-elf", "woman-fairy", "woman-farmer", "woman-firefighter", "woman-guard", "woman-health-worker", "woman-judge", "woman-mechanic", "woman-office-worker", "woman-police-officer", "woman-scientist", "woman-singer", "woman-superhero", "woman-teacher", "woman-technologist", "woman-vampire"];
  D.HAT_MASKS = ["man-artist", "man-astronaut", "man-cook", "man-detective", "man-elf", "man-fairy", "man-farmer", "man-firefighter", "man-guard", "man-health-worker", "man-judge", "man-mage", "man-mechanic", "man-office-worker", "man-pilot", "man-police-officer", "man-singer", "man-student", "man-teacher", "man-technologist", "man-vampire", "man-with-veil", "mrs-claus", "ninja", "person-in-tuxedo", "person-wearing-turban", "person-with-crown", "princess", "santa-claus", "woman-artist", "woman-astronaut", "woman-cook", "woman-detective", "woman-elf", "woman-fairy", "woman-farmer", "woman-firefighter", "woman-guard", "woman-mage", "woman-mechanic", "woman-pilot", "woman-police-officer", "woman-scientist", "woman-student", "woman-teacher", "woman-with-headscarf"];
  D.HAIR_COLORS = [['', 'Original'], ['1E1A18', 'Negro'], ['4A2E1F', 'Castaño oscuro'], ['7A4A2A', 'Castaño'], ['C9A15B', 'Rubio'], ['E8D08A', 'Rubio claro'], ['B5432A', 'Pelirrojo'], ['8A8F99', 'Canoso'], ['F2F2F2', 'Blanco'], ['8E44AD', 'Morado'], ['2E86DE', 'Azul'], ['E84393', 'Rosado']];
  D.GLASSES = [['', 'Sin lentes'], ['glasses', 'Lentes'], ['sunglasses', 'Gafas de sol']];
  D.ACCS = [['', 'Ninguno'], ['cap', 'Gorra'], ['tophat', 'Sombrero'], ['crown', 'Corona'], ['grad', 'Birrete'], ['headphone', 'Audífonos'], ['ribbon', 'Moño'], ['flower', 'Flor']];
  D.DEFAULT_AVATARS = ['avatars/fluent/woman_light.webp', 'avatars/fluent/man_medium-light.webp', 'avatars/fluent/girl_medium.webp', 'avatars/fluent/boy_light.webp', 'avatars/fluent/person_medium-dark.webp', 'avatars/fluent/woman-curly-hair_dark.webp'];

  // Sistemas de juego → núcleo libretro (LemuroidCores)
  D.SYSTEMS = [
    { id: 'nes', name: 'NES', core: 'fceumm', exts: ['nes', 'fds', 'unf', 'unif'], color: '#FF9A4D', mono: 'NES' },
    { id: 'snes', name: 'Super Nintendo', core: 'snes9x', exts: ['smc', 'sfc', 'swc', 'fig'], color: '#A879FF', mono: 'SN' },
    { id: 'gb', name: 'Game Boy', core: 'gambatte', exts: ['gb'], color: '#9BBC0F', mono: 'GB' },
    { id: 'gbc', name: 'Game Boy Color', core: 'gambatte', exts: ['gbc'], color: '#22C7A9', mono: 'GBC' },
    { id: 'gba', name: 'Game Boy Advance', core: 'mgba', exts: ['gba'], color: '#4C8DFF', mono: 'GBA' },
    { id: 'n64', name: 'Nintendo 64', core: 'mupen64plus_next_gles3', exts: ['n64', 'z64', 'v64'], color: '#3BA55C', mono: '64' },
    { id: 'nds', name: 'Nintendo DS', core: 'melonds', exts: ['nds'], color: '#E4DFD8', mono: 'DS' },
    { id: 'md', name: 'Sega Genesis', core: 'genesis_plus_gx', exts: ['gen', 'smd', 'md', '32x'], color: '#E0447C', mono: 'MD' },
    { id: 'sms', name: 'Master System', core: 'genesis_plus_gx', exts: ['sms'], color: '#FF6B6B', mono: 'MS' },
    { id: 'gg', name: 'Game Gear', core: 'genesis_plus_gx', exts: ['gg'], color: '#F5C842', mono: 'GG' },
    { id: 'psx', name: 'PlayStation', core: 'pcsx_rearmed', exts: ['cue', 'pbp', 'chd', 'iso', 'm3u'], color: '#9AA5B1', mono: 'PS' },
    { id: 'a26', name: 'Atari 2600', core: 'stella', exts: ['a26'], color: '#C98A5E', mono: '26' },
    { id: 'a78', name: 'Atari 7800', core: 'prosystem', exts: ['a78'], color: '#B34A00', mono: '78' },
    { id: 'lynx', name: 'Atari Lynx', core: 'handy', exts: ['lnx'], color: '#F59E0B', mono: 'LX' },
    { id: 'pce', name: 'PC Engine', core: 'mednafen_pce_fast', exts: ['pce'], color: '#5E7BD6', mono: 'PCE' },
    { id: 'ngp', name: 'Neo Geo Pocket', core: 'mednafen_ngp', exts: ['ngp', 'ngc'], color: '#14A38B', mono: 'NGP' },
    { id: 'ws', name: 'WonderSwan', core: 'mednafen_wswan', exts: ['ws', 'wsc'], color: '#7A3FD1', mono: 'WS' },
    { id: 'arcade', name: 'Arcade', core: 'fbneo', exts: ['zip'], color: '#FFD15C', mono: 'ARC' },
    // Ports: juegos de PC con motores libres (núcleos del buildbot de libretro)
    { id: 'doom', name: 'Doom (PrBoom)', core: 'prboom', src: 'bb', exts: ['wad'], color: '#C2410C', mono: 'DM', port: true },
    { id: 'quake', name: 'Quake (TyrQuake)', core: 'tyrquake', src: 'bb', exts: ['pak'], match: /^pak0\.pak$/i, color: '#8B5E34', mono: 'QK', port: true },
    { id: 'wolf', name: 'Wolfenstein 3D (ECWolf)', core: 'ecwolf', src: 'bb', exts: ['wl6', 'wl1', 'sod', 'sdm', 'n3d'], color: '#6B7280', mono: 'W3D', port: true },
    { id: 'cave', name: 'Cave Story (NXEngine)', core: 'nxengine', src: 'bb', exts: ['exe'], match: /^doukutsu\.exe$/i, color: '#3B82F6', mono: 'CS', port: true }
  ];
  // Freedoom: juego libre (licencia BSD) que funciona con el port de Doom
  D.FREEDOOM = { name: 'Freedoom (gratis y libre)', url: 'https://github.com/freedoom/freedoom/releases/download/v0.13.0/freedoom-0.13.0.zip', file: 'freedoom-0.13.0.zip' };
  D.ROM_EXTS = [];
  D.SYSTEMS.forEach(function (s) { s.exts.forEach(function (e) { if (D.ROM_EXTS.indexOf(e) < 0) D.ROM_EXTS.push(e); }); });

  // Fuentes gratuitas y legales de canales
  D.PRESETS = [
    { name: 'Canales gratis del mundo (Free-TV)', url: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8', note: 'TDT y canales gratuitos oficiales, Pluto TV y más' },
    { name: 'Canales de Colombia (iptv-org)', url: 'https://iptv-org.github.io/iptv/countries/co.m3u', note: 'Canales públicos de Colombia' },
    { name: 'Canales en español (iptv-org)', url: 'https://iptv-org.github.io/iptv/languages/spa.m3u', note: 'Canales públicos en español' },
    { name: 'Infantil (iptv-org)', url: 'https://iptv-org.github.io/iptv/categories/kids.m3u', note: 'Canales para niños' },
    { name: 'Animación y anime (iptv-org)', url: 'https://iptv-org.github.io/iptv/categories/animation.m3u', note: 'Dibujos animados y anime 24/7' },
    { name: 'Películas (iptv-org)', url: 'https://iptv-org.github.io/iptv/categories/movies.m3u', note: 'Canales de cine' },
    { name: 'Documentales (iptv-org)', url: 'https://iptv-org.github.io/iptv/categories/documentary.m3u', note: 'Naturaleza, historia y ciencia' },
    { name: 'Música (iptv-org)', url: 'https://iptv-org.github.io/iptv/categories/music.m3u', note: 'Videos y conciertos' }
  ];

  // Películas ganadoras del Óscar. [año, títulos posibles separados por |, premio: p = Mejor película, a = Animada, i = Internacional, o = otros premios]
  D.OSCARS = [
    [1939, "Gone with the Wind|Lo que el viento se llevó", "p"], [1942, "Casablanca", "p"], [1959, "Ben-Hur", "p"], [1965, "The Sound of Music|La novicia rebelde|Sonrisas y lágrimas", "p"],
    [1972, "The Godfather|El padrino", "p"], [1974, "The Godfather Part II|El padrino II|El padrino parte II", "p"], [1975, "One Flew Over the Cuckoo's Nest|Atrapado sin salida|Alguien voló sobre el nido del cuco", "p"],
    [1976, "Rocky", "p"], [1977, "Annie Hall", "p"], [1978, "The Deer Hunter|El francotirador|El cazador", "p"], [1979, "Kramer vs. Kramer|Kramer contra Kramer", "p"], [1982, "Gandhi", "p"],
    [1984, "Amadeus", "p"], [1985, "Out of Africa|África mía|Memorias de África", "p"], [1986, "Platoon|Pelotón", "p"], [1987, "The Last Emperor|El último emperador", "p"], [1988, "Rain Man|Cuando los hermanos se encuentran", "p"],
    [1989, "Driving Miss Daisy|Conduciendo a Miss Daisy|Paseando a Miss Daisy", "p"], [1990, "Dances with Wolves|Danza con lobos|Bailando con lobos", "p"], [1991, "The Silence of the Lambs|El silencio de los inocentes|El silencio de los corderos", "p"],
    [1992, "Unforgiven|Los imperdonables|Sin perdón", "p"], [1993, "Schindler's List|La lista de Schindler", "p"], [1994, "Forrest Gump", "p"], [1995, "Braveheart|Corazón valiente", "p"],
    [1996, "The English Patient|El paciente inglés", "p"], [1997, "Titanic", "p"], [1998, "Shakespeare in Love|Shakespeare apasionado|Shakespeare enamorado", "p"], [1999, "American Beauty|Belleza americana", "p"],
    [1999, "All About My Mother|Todo sobre mi madre", "i"], [2000, "Gladiator|Gladiador", "p"], [2001, "A Beautiful Mind|Una mente brillante", "p"], [2001, "Shrek", "a"], [2002, "Chicago", "p"],
    [2002, "Spirited Away|El viaje de Chihiro|Sen to Chihiro no kamikakushi", "a"], [2003, "The Lord of the Rings: The Return of the King|El señor de los anillos: El retorno del rey|El señor de los anillos: el regreso del rey", "p"],
    [2003, "Finding Nemo|Buscando a Nemo", "a"], [2004, "Million Dollar Baby|Golpes del destino", "p"], [2004, "The Incredibles|Los increíbles", "a"], [2004, "The Sea Inside|Mar adentro", "i"],
    [2005, "Crash|Vidas cruzadas|Alto impacto", "p"], [2005, "Wallace & Gromit: The Curse of the Were-Rabbit|Wallace y Gromit: La batalla de los vegetales|Wallace y Gromit: la maldición de las verduras", "a"],
    [2006, "The Departed|Los infiltrados", "p"], [2006, "Happy Feet|Happy Feet: El pingüino", "a"], [2006, "Pan's Labyrinth|El laberinto del fauno", "i"], [2007, "No Country for Old Men|Sin lugar para los débiles|No es país para viejos", "p"],
    [2007, "Ratatouille", "a"], [2008, "Slumdog Millionaire|¿Quién quiere ser millonario?|Quisiera ser millonario", "p"], [2008, "WALL-E|WALL·E", "a"], [2008, "The Dark Knight|Batman: El caballero de la noche|El caballero oscuro", "o"],
    [2009, "The Hurt Locker|Vivir al límite|En tierra hostil", "p"], [2009, "Up|Up: Una aventura de altura", "a"], [2009, "The Secret in Their Eyes|El secreto de sus ojos", "i"], [2009, "Avatar", "o"],
    [2010, "The King's Speech|El discurso del rey", "p"], [2010, "Toy Story 3", "a"], [2010, "Inception|El origen|Origen", "o"], [2011, "The Artist|El artista", "p"], [2011, "Rango", "a"], [2012, "Argo", "p"],
    [2012, "Brave|Valiente", "a"], [2012, "Life of Pi|Una aventura extraordinaria|La vida de Pi", "o"], [2013, "12 Years a Slave|12 años de esclavitud", "p"], [2013, "Frozen|Frozen: Una aventura congelada|Frozen: El reino del hielo", "a"],
    [2013, "Gravity|Gravedad", "o"], [2014, "Birdman|Birdman o (La inesperada virtud de la ignorancia)", "p"], [2014, "Big Hero 6|Grandes héroes", "a"], [2014, "Whiplash|Whiplash: Música y obsesión", "o"],
    [2015, "Spotlight|En primera plana", "p"], [2015, "Inside Out|Intensa-mente|Intensamente|Del revés", "a"], [2015, "Mad Max: Fury Road|Mad Max: Furia en el camino|Mad Max: Furia en la carretera", "o"],
    [2015, "The Revenant|El renacido|El renacido (The Revenant)", "o"], [2016, "Moonlight|Luz de luna", "p"], [2016, "Zootopia|Zootrópolis", "a"], [2016, "La La Land|La La Land: Una historia de amor|La ciudad de las estrellas", "o"],
    [2017, "The Shape of Water|La forma del agua", "p"], [2017, "Coco", "a"], [2017, "A Fantastic Woman|Una mujer fantástica", "i"], [2018, "Green Book|Green Book: Una amistad sin fronteras", "p"],
    [2018, "Spider-Man: Into the Spider-Verse|Spider-Man: Un nuevo universo", "a"], [2018, "Roma", "i"], [2018, "Bohemian Rhapsody", "o"], [2018, "Black Panther|Pantera Negra", "o"], [2019, "Parasite|Parásitos|Parásito", "p"],
    [2019, "Toy Story 4", "a"], [2019, "Joker|Guasón", "o"], [2020, "Nomadland|País de nómadas", "p"], [2020, "Soul", "a"], [2021, "CODA|CODA: Señales del corazón|CODA: Los sonidos del silencio", "p"],
    [2021, "Encanto", "a"], [2021, "Dune|Duna", "o"], [2021, "Drive My Car", "i"], [2022, "Everything Everywhere All at Once|Todo en todas partes al mismo tiempo|Todo a la vez en todas partes", "p"],
    [2022, "Guillermo del Toro's Pinocchio|Pinocho de Guillermo del Toro|Pinocho", "a"], [2022, "All Quiet on the Western Front|Sin novedad en el frente", "i"], [2022, "The Whale|La ballena", "o"],
    [2023, "Oppenheimer", "p"], [2023, "The Boy and the Heron|El niño y la garza|El chico y la garza", "a"], [2023, "Poor Things|Pobres criaturas", "o"], [2023, "The Zone of Interest|Zona de interés|La zona de interés", "i"],
    [2024, "Anora", "p"], [2024, "Flow|Flow: Un mundo que salvar", "a"], [2024, "I'm Still Here|Aún estoy aquí|Ainda Estou Aqui", "i"], [2024, "Dune: Part Two|Duna: Parte dos", "o"], [2024, "Wicked", "o"], [2024, "The Brutalist|El brutalista", "o"],
    [2025, "One Battle After Another|Una batalla tras otra", "p"], [2025, "KPop Demon Hunters|Las guerreras K-pop|Guerreras del K-pop", "a"], [2025, "Sentimental Value|Valor sentimental", "i"], [2025, "Sinners|Pecadores", "o"], [2025, "Frankenstein", "o"]
  ];

  // Temas automáticos por celebración (fechas de Colombia). Se activan solos si "Temas por celebración" está encendido.
  function nthWeekday(y, m, wd, n) { // n-ésimo día de la semana (0 = domingo) del mes m (0-11); n = -1 → el último
    if (n > 0) { var d = new Date(y, m, 1); var add = (wd - d.getDay() + 7) % 7 + (n - 1) * 7; return new Date(y, m, 1 + add); }
    var e = new Date(y, m + 1, 0); return new Date(y, m, e.getDate() - ((e.getDay() - wd + 7) % 7));
  }
  function within(d, from, to) { var t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); return t >= from.getTime() && t <= to.getTime(); }
  function days(base, before, after) { return [new Date(base.getFullYear(), base.getMonth(), base.getDate() - before), new Date(base.getFullYear(), base.getMonth(), base.getDate() + (after || 0))]; }
  D.SEASONS = [
    { id: 'newyear', name: 'Año Nuevo', greet: '¡Feliz Año Nuevo!', deco: ['🎆', '🥂', '✨', '🎉'], a: '#FFC83D', text: '#FFE39A', base: '#0B0A12', glow: 'rgba(255,200,61,.42)', glow2: 'rgba(120,80,200,.35)',
      when: function (d) { var y = d.getFullYear(); return within(d, new Date(y, 0, 1), new Date(y, 0, 6)) || within(d, new Date(y, 11, 31), new Date(y, 11, 31)); } },
    { id: 'valentine', name: 'San Valentín', greet: 'Feliz San Valentín', deco: ['💘', '💖', '🌹', '💕'], a: '#FF3D7F', text: '#FFA8C6', base: '#1A0710', glow: 'rgba(255,61,127,.42)', glow2: 'rgba(150,20,60,.4)',
      when: function (d) { var y = d.getFullYear(); return within(d, new Date(y, 1, 10), new Date(y, 1, 14)); } },
    { id: 'women', name: 'Día de la Mujer', greet: 'Feliz Día de la Mujer', deco: ['💜', '🌷', '✨'], a: '#B26BFF', text: '#DCC0FF', base: '#130B1E', glow: 'rgba(178,107,255,.42)', glow2: 'rgba(90,40,150,.4)',
      when: function (d) { var y = d.getFullYear(); return within(d, new Date(y, 2, 7), new Date(y, 2, 8)); } },
    { id: 'kidsday', name: 'Día del Niño', greet: '¡Feliz Día del Niño!', deco: ['🎈', '🧸', '🪁', '🍭'], a: '#2EC4FF', text: '#A6E7FF', base: '#0A1422', glow: 'rgba(46,196,255,.42)', glow2: 'rgba(255,200,40,.3)',
      when: function (d) { var y = d.getFullYear(), k = nthWeekday(y, 3, 6, -1), r = days(k, 3, 1); return within(d, r[0], r[1]); } },
    { id: 'mothers', name: 'Día de la Madre', greet: 'Feliz Día de la Madre', deco: ['💐', '🌸', '💗', '🌷'], a: '#FF6FA8', text: '#FFC1D9', base: '#1A0B13', glow: 'rgba(255,111,168,.42)', glow2: 'rgba(170,60,120,.38)',
      when: function (d) { var y = d.getFullYear(), k = nthWeekday(y, 4, 0, 2), r = days(k, 6, 0); return within(d, r[0], r[1]); } },
    { id: 'fathers', name: 'Día del Padre', greet: 'Feliz Día del Padre', deco: ['👔', '🏆', '⚽', '💙'], a: '#3D8BFF', text: '#A9C9FF', base: '#08111F', glow: 'rgba(61,139,255,.42)', glow2: 'rgba(20,60,130,.42)',
      when: function (d) { var y = d.getFullYear(), k = nthWeekday(y, 5, 0, 3), r = days(k, 6, 0); return within(d, r[0], r[1]); } },
    { id: 'colombia', name: 'Independencia de Colombia', greet: '¡Viva Colombia! 20 de julio', deco: ['🇨🇴', '💛', '💙', '❤️'], a: '#FCD116', text: '#FFE98A', base: '#0B0F1F', glow: 'rgba(252,209,22,.38)', glow2: 'rgba(0,56,147,.45)',
      when: function (d) { var y = d.getFullYear(); return within(d, new Date(y, 6, 18), new Date(y, 6, 20)); } },
    { id: 'love', name: 'Amor y Amistad', greet: 'Feliz Amor y Amistad', deco: ['💝', '🤝', '💌', '💞'], a: '#FF4D6D', text: '#FFB3C1', base: '#1A080D', glow: 'rgba(255,77,109,.42)', glow2: 'rgba(255,150,60,.3)',
      when: function (d) { var y = d.getFullYear(), k = nthWeekday(y, 8, 6, 3), r = days(k, 6, 1); return within(d, r[0], r[1]); } },
    { id: 'halloween', name: 'Halloween', greet: '¡Feliz Halloween!', deco: ['🎃', '👻', '🦇', '🕸️', '🍬'], a: '#FF7A00', text: '#FFC07A', base: '#0E0812', glow: 'rgba(255,122,0,.45)', glow2: 'rgba(120,40,170,.45)',
      when: function (d) { var y = d.getFullYear(); return within(d, new Date(y, 9, 20), new Date(y, 9, 31)); } },
    { id: 'christmas', name: 'Navidad', greet: '¡Feliz Navidad!', deco: ['🎄', '⭐', '🎁', '❄️', '🕯️'], a: '#E8333F', text: '#FFB0B5', base: '#07120C', glow: 'rgba(232,51,63,.4)', glow2: 'rgba(20,140,70,.42)',
      when: function (d) { var y = d.getFullYear(); return within(d, new Date(y, 10, 28), new Date(y, 11, 30)); } }
  ];
  D.seasonFor = function (d) { d = d || new Date(); for (var i = 0; i < D.SEASONS.length; i++) if (D.SEASONS[i].when(d)) return D.SEASONS[i]; return null; };

  D.THEMES = [
    { id: 'mv', name: 'Naranja MiVibra', a: '#FF6900', b: '#0D0C0B' },
    { id: 'ocean', name: 'Océano', a: '#4C8DFF', b: '#0A1220' },
    { id: 'mint', name: 'Esmeralda', a: '#22C7A9', b: '#081814' },
    { id: 'grape', name: 'Uva', a: '#A879FF', b: '#120B1F' },
    { id: 'rose', name: 'Atardecer', a: '#FF5C8A', b: '#1A0A10' },
    { id: 'amoled', name: 'Negro puro', a: '#F3EFEA', b: '#000000' }
  ];

  // Detección de categorías por palabras en el grupo o el nombre
  D.RX = {
    // Infantil: se mira la CATEGORÍA (no el título: "Crímenes de familia" o "Karate Kid" no son infantiles)
    kids: /(\bkids?\b|infantil(es)?|\bniñ[oa]s\b|niñez|\bchildren|cartoons?|caricaturas|dibujos|animad[ao]s|animaci[oó]n|\banimation|\bfamiliar(es)?\b|\bfamily\b|disney ?(junior|jr|channel)|nick ?jr|nickelodeon|discovery ?kids|baby ?tv|boomerang|tooncast|pbs ?kids|zoomoo)/i,
    // Nombres que sí son infantiles aunque la categoría no lo diga (canales y series conocidas)
    kidsName: /(disney ?(junior|jr)|cartoon ?network|cartoonito|nick ?jr|nickelodeon|discovery ?kids|baby ?tv|babyfirst|boomerang|tooncast|pbs ?kids|zoomoo|duck ?tv|baby ?shark|peppa|paw patrol|patrulla canina|bluey|cocomelon|plim ?plim|mundo bita|pocoyo|barney|pinkfong|super ?wings|masha)/i,
    // Nunca infantil aunque la categoría lo parezca ("Animación para adultos", "Terror familiar"…)
    notKids: /(terror|horror|miedo|thriller|suspenso|crimen|crime|asesin|narco|mafia|guerra|\bwar\b|er[oó]tic|adult|\+18|18\+|xxx|gore|zombi|violen|polic[ií]ac|noticias|news|\barmas?\b|guns?\b|handguns?|pistol|rifle|disparo|shoot|docu|documental)/i,
    anime: /\b(anime|animes|animé|manga|otaku|japanimation|crunchy)\b/i,
    doc: /\b(docu|docus|documental(es)?|documentar(y|ies)|docuseries?|docu-?series|nat ?geo|national geographic|discovery|animal planet|vida salvaje|wildlife|naturaleza|nature doc)\b/i,
    notDoc: /ficci[oó]n|fiction|sci-?fi|ciencia ?ficci|fantas|acci[oó]n|action|terror|horror|comedia|comedy|drama|thriller|suspenso|infantil|kids|anime/i,
    kdrama: /(k-?dramas?|doramas?|coreanas?|coreanos?|korean|korea|asian drama|c-?drama|j-?drama)/i,
    adult: /(xxx|\+18|18\+|\badult|porn|erotic|er[oó]tico|hentai|playboy|sexy)/i,
    movie: /\b(pel[ií]culas?|movies?|vod|cine|films?)\b/i,
    series: /\b(series?|temporadas?|tv shows?|novelas?|telenovelas?)\b/i,
    music: /\b(m[uú]sica|music|radio)\b/i,
    sports: /\b(deportes?|sports?|f[uú]tbol|soccer|futbol)\b/i,
    news: /\b(noticias|news)\b/i,
    episode: /\b[sS](\d{1,2})\s*[eE](\d{1,3})\b|\b(\d{1,2})x(\d{1,3})\b/
  };

  // Separadores por plataforma: según el nombre de la categoría en la lista (solo texto, sin logos)
  D.PLATFORMS = [
    { id: 'netflix', name: 'Netflix', rx: /netflix/i },
    { id: 'disney', name: 'Disney+', rx: /disney/i },
    { id: 'prime', name: 'Prime Video', rx: /amazon|prime ?video|\bprime\b/i },
    { id: 'max', name: 'Max', rx: /\bhbo\b|hbo ?max|\bmax originals?\b|^max\b/i },
    { id: 'paramount', name: 'Paramount+', rx: /paramount/i },
    { id: 'apple', name: 'Apple TV+', rx: /apple ?tv/i },
    { id: 'hulu', name: 'Hulu', rx: /\bhulu\b/i },
    { id: 'crunchyroll', name: 'Crunchyroll', rx: /crunchy/i },
    { id: 'viki', name: 'Viki', rx: /\bviki\b/i },
    { id: 'star', name: 'Star+', rx: /star ?(\+|plus)/i },
    { id: 'vix', name: 'ViX', rx: /\bvix\b/i },
    { id: 'peacock', name: 'Peacock', rx: /peacock/i },
    { id: 'discovery', name: 'Discovery+', rx: /discovery ?(\+|plus)/i },
    { id: 'pluto', name: 'Pluto TV', rx: /pluto/i },
    { id: 'mubi', name: 'MUBI', rx: /\bmubi\b/i },
    { id: 'starz', name: 'Starz', rx: /\bstarz\b/i },
    { id: 'showtime', name: 'Showtime', rx: /showtime/i },
    { id: 'amc', name: 'AMC+', rx: /\bamc ?\+|amc plus/i }
  ];
  D.platformOf = function (txt) { var p = D.PLATFORMS.find(function (x) { return x.rx.test(txt); }); return p ? p.id : ''; };
  D.platformName = function (id) { var p = D.PLATFORMS.find(function (x) { return x.id === id; }); return p ? p.name : id; };

  // Clasificador de géneros: palabras en el grupo, el nombre, el género de Xtream o la ficha (TMDB/Jikan)
  D.GENRES = [
    { id: 'accion', name: 'Acción', rx: /\b(acci[oó]n|action|artes marciales|martial)\b/i },
    { id: 'aventura', name: 'Aventura', rx: /\b(aventuras?|adventure)\b/i },
    { id: 'suspenso', name: 'Suspenso', rx: /\b(suspen[sc]e?o?|thriller|intriga|misterio|mystery)\b/i },
    { id: 'terror', name: 'Terror', rx: /\b(terror|horror|miedo|zombi(e|s)?)\b/i },
    { id: 'comedia', name: 'Comedia', rx: /\b(comedias?|comedy|humor|stand ?up|sitcom)\b/i },
    { id: 'drama', name: 'Drama', rx: /\b(dramas?|melodrama)\b/i },
    { id: 'romance', name: 'Romance', rx: /\b(romance|rom[aá]ntic[ao]s?|romantic|amor)\b/i },
    { id: 'scifi', name: 'Ciencia ficción', rx: /(ciencia ficci[oó]n|sci-?fi|science fiction|cyberpunk|espacial)/i },
    { id: 'fantasia', name: 'Fantasía', rx: /\b(fantas[ií]a|fantasy|isekai|magia|magic)\b/i },
    { id: 'crimen', name: 'Crimen', rx: /\b(crimen|crime|polic[ií]ac[ao]s?|detective|mafia|narco)\b/i },
    { id: 'infantil', name: 'Infantil', rx: /\b(infantil|kids?|niñ[oa]s|children|familia(r)?|family|animaci[oó]n|animation|dibujos|cartoon)\b/i },
    { id: 'religiosa', name: 'Religiosas', rx: /\b(religios[ao]s?|religi[oó]n|religion|cristian[ao]s?|christian(ity)?|b[ií]blic[ao]s?|biblical|biblia|bible|jes[uú]s de nazaret|jesus christ|jesucristo|pasi[oó]n de cristo|faith[- ]based|gospel|evangeli\w*|cat[oó]lic[ao]s?|catholic)\b/i },
    { id: 'documental', name: 'Documental', rx: /\b(documental(es)?|documentar(y|ies)|docu|naturaleza|nature|historia real|biograf[ií]a|biography)\b/i },
    { id: 'belico', name: 'Bélico', rx: /\b(b[eé]lic[ao]s?|guerra|war|militar|military)\b/i },
    { id: 'historica', name: 'Histórica', rx: /\b(hist[oó]ric[ao]s?|historical|historia|history|[eé]poca|period)\b/i },
    { id: 'musical', name: 'Musical', rx: /\b(musical(es)?|m[uú]sica|music|conciertos?|concert)\b/i },
    { id: 'deportes', name: 'Deportes', rx: /\b(deportes?|sports?|f[uú]tbol|soccer|boxeo|boxing|ufc|nba|nfl)\b/i },
    { id: 'western', name: 'Western', rx: /\b(western|vaqueros?|oeste)\b/i },
    { id: 'reality', name: 'Reality', rx: /\b(reality|concurso|talk ?show)\b/i },
    { id: 'shonen', name: 'Shōnen', rx: /\b(sh[oō]nen|shounen)\b/i },
    { id: 'slice', name: 'Vida cotidiana', rx: /(slice of life|vida cotidiana|recuentos de la vida)/i }
  ];
  D.GAME_GENRES = [
    { id: 'plataformas', name: 'Plataformas', rx: /(mario|sonic|kirby|mega ?man|rockman|castlevania|metroid|donkey kong|crash|spyro|rayman|platform)/i },
    { id: 'pelea', name: 'Pelea', rx: /(street fighter|kombat|tekken|king of fighters|kof|fatal fury|samurai shodown|smash|fighter|fight|virtua|soul ?calibur|dragon ball)/i },
    { id: 'carreras', name: 'Carreras', rx: /(kart|racing|rally|race|racer|turbo|f-?zero|gran turismo|need for speed|outrun|road rash|ridge)/i },
    { id: 'deportes', name: 'Deportes', rx: /(fifa|pes|winning eleven|soccer|football|futbol|nba|nfl|nhl|tennis|golf|baseball|olympic|tony hawk|skate)/i },
    { id: 'rpg', name: 'RPG', rx: /(final fantasy|dragon quest|zelda|pok[eé]mon|chrono|secret of|tales of|earthbound|fire emblem|golden sun|quest|saga|rpg)/i },
    { id: 'disparos', name: 'Disparos', rx: /(doom|quake|wolfenstein|contra|metal slug|gradius|r-?type|1942|galaga|duck hunt|goldeneye|shoot|gun|shmup)/i },
    { id: 'puzle', name: 'Puzle', rx: /(tetris|puyo|dr\.? ?mario|columns|bust-?a-?move|puzzle|lemmings|2048)/i },
    { id: 'aventura', name: 'Aventura', rx: /(adventure|cave story|monkey island|tomb raider|resident evil|silent hill|prince of persia)/i },
    { id: 'arcade', name: 'Arcade clásico', rx: /(pac-?man|space invaders|donkey kong|frogger|asteroids|bomberman|dig dug|centipede)/i },
    { id: 'beatemup', name: 'Beat ’em up', rx: /(streets of rage|final fight|double dragon|tmnt|turtles|battletoads|golden axe|river city)/i }
  ];
  D.classifyGenres = function (txt, list) {
    var out = [];
    (list || D.GENRES).forEach(function (g) { if (g.rx.test(txt)) out.push(g.id); });
    return out;
  };
  D.genreName = function (id) { var g = D.GENRES.concat(D.GAME_GENRES).find(function (x) { return x.id === id; }); return g ? g.name : id; };

  // Países para subdividir los canales de TV: [código, nombre, códigos alternos, palabras]
  D.COUNTRIES = [
    ['co', 'Colombia', 'col', 'colombia|colombian'], ['mx', 'México', 'mex', 'mexico|mexican'],
    ['ar', 'Argentina', 'arg', 'argentina'], ['cl', 'Chile', 'chl|chi', 'chile'], ['pe', 'Perú', 'per', 'peru'],
    ['ve', 'Venezuela', 'ven', 'venezuela'], ['ec', 'Ecuador', 'ecu', 'ecuador'], ['bo', 'Bolivia', 'bol', 'bolivia'],
    ['py', 'Paraguay', 'par|pry', 'paraguay'], ['uy', 'Uruguay', 'uru|ury', 'uruguay'], ['cr', 'Costa Rica', 'cri|crc', 'costa rica'],
    ['pa', 'Panamá', 'pan', 'panama'], ['gt', 'Guatemala', 'gua|gtm', 'guatemala'], ['hn', 'Honduras', 'hon|hnd', 'honduras'],
    ['sv', 'El Salvador', 'slv|esa', 'el salvador|salvador'], ['ni', 'Nicaragua', 'nic', 'nicaragua'],
    ['do', 'Rep. Dominicana', 'dom|rd', 'dominicana|dominican'], ['cu', 'Cuba', 'cub', 'cuba'], ['pr', 'Puerto Rico', 'pri|pur', 'puerto rico'],
    ['us', 'Estados Unidos', 'usa', 'estados unidos|united states|eeuu|usa'], ['ca', 'Canadá', 'can', 'canada'],
    ['br', 'Brasil', 'bra', 'brasil|brazil'], ['es', 'España', 'esp|spa', 'espana|spain'], ['pt', 'Portugal', 'por|prt', 'portugal'],
    ['gb', 'Reino Unido', 'uk|gbr', 'reino unido|united kingdom|england|britain'], ['ie', 'Irlanda', 'irl', 'irlanda|ireland'],
    ['fr', 'Francia', 'fra', 'francia|france'], ['de', 'Alemania', 'ger|deu', 'alemania|germany|deutschland'],
    ['it', 'Italia', 'ita', 'italia|italy'], ['nl', 'Países Bajos', 'ned|nld|hol', 'holanda|netherlands|nederland'],
    ['be', 'Bélgica', 'bel', 'belgica|belgium'], ['ch', 'Suiza', 'sui|che', 'suiza|switzerland|schweiz'], ['at', 'Austria', 'aut', 'austria'],
    ['pl', 'Polonia', 'pol', 'polonia|poland|polska'], ['ru', 'Rusia', 'rus', 'rusia|russia'], ['ua', 'Ucrania', 'ukr', 'ucrania|ukraine'],
    ['tr', 'Turquía', 'tur', 'turquia|turkey|turkiye'], ['gr', 'Grecia', 'gre|grc', 'grecia|greece'], ['se', 'Suecia', 'swe', 'suecia|sweden'],
    ['no', 'Noruega', 'nor', 'noruega|norway'], ['dk', 'Dinamarca', 'den|dnk', 'dinamarca|denmark'], ['fi', 'Finlandia', 'fin', 'finlandia|finland'],
    ['ro', 'Rumania', 'rom|rou', 'rumania|romania'], ['hu', 'Hungría', 'hun', 'hungria|hungary'], ['cz', 'Chequia', 'cze', 'chequia|czech'],
    ['in', 'India', 'ind', 'india'], ['pk', 'Pakistán', 'pak', 'pakistan'], ['cn', 'China', 'chn', 'china'], ['jp', 'Japón', 'jpn', 'japon|japan'],
    ['kr', 'Corea del Sur', 'kor', 'corea|korea'], ['ph', 'Filipinas', 'phi|phl', 'filipinas|philippines'], ['id', 'Indonesia', 'idn', 'indonesia'],
    ['th', 'Tailandia', 'tha', 'tailandia|thailand'], ['vn', 'Vietnam', 'vie|vnm', 'vietnam'], ['my', 'Malasia', 'mys', 'malasia|malaysia'],
    ['au', 'Australia', 'aus', 'australia'], ['nz', 'Nueva Zelanda', 'nzl', 'nueva zelanda|new zealand'], ['za', 'Sudáfrica', 'zaf|rsa', 'sudafrica|south africa'],
    ['ng', 'Nigeria', 'nga', 'nigeria'], ['eg', 'Egipto', 'egy', 'egipto|egypt'], ['sa', 'Arabia Saudita', 'ksa|sau', 'arabia|saudi'],
    ['ae', 'Emiratos Árabes', 'uae|are', 'emiratos|emirates'], ['il', 'Israel', 'isr', 'israel'], ['ma', 'Marruecos', 'mar', 'marruecos|morocco'],
    ['latam', 'Latinoamérica', 'lat|latam|latino', 'latinoamerica|latam|latino|hispano']
  ];
  var CBY = {}, CWORDS = [];
  D.COUNTRIES.forEach(function (c) {
    CBY[c[0]] = c; c[2].split('|').forEach(function (a) { CBY[a] = c; });
    CWORDS.push([new RegExp('(^|[^a-z])(' + c[3] + ')([^a-z]|$)'), c[0]]);
  });
  // Todos los países del mundo (códigos ISO) con su nombre en español e inglés, si el equipo lo permite
  try {
    var dEs = new Intl.DisplayNames(['es'], { type: 'region' }), dEn = new Intl.DisplayNames(['en'], { type: 'region' });
    var AZ = 'abcdefghijklmnopqrstuvwxyz';
    for (var i1 = 0; i1 < 26; i1++) for (var i2 = 0; i2 < 26; i2++) {
      var cc = AZ[i1] + AZ[i2], up = cc.toUpperCase();
      if (CBY[cc] || /^(tv|eu|un|zz|xa|xb|qo|ez|aa|qm|qn|qp|qq|qr|qs|qt|qu|qv|qw|qx|qy|qz|xc|xd|xe|xf|xg|xh|xi|xj|xl|xm|xn|xo|xp|xq|xr|xs|xt|xu|xv|xw|xx|xy|xz)$/.test(cc)) continue;
      var es = dEs.of(up), en = dEn.of(up);
      if (!es || es === up || !en || en === up || /unknown|desconocid/i.test(es + en)) continue;
      var words = [en, es].map(function (w) { return w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, ' ').trim(); })
        .filter(function (w, k, a) { return w.length > 3 && a.indexOf(w) === k; }).join('|');
      var row = [cc, es, '', words || cc];
      D.COUNTRIES.push(row); CBY[cc] = row;
      if (words) CWORDS.push([new RegExp('(^|[^a-z])(' + words + ')([^a-z]|$)'), cc]);
    }
  } catch (e) { /* equipos antiguos: se queda la lista básica */ }
  function fold(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function codeFrom(t) {
    // "CO: Caracol", "|CO| Noticias", "[MEX] Canal 5", "COL - Deportes", "CO | Noticias"
    var m = /^\s*[\[|(]?\s*([a-z]{2,5})\s*(?:[\]|):]|\s-\s|\s\|)/.exec(fold(t));
    if (m && CBY[m[1]] && !/^(tv|hd|sd|fhd|uhd|vip|ppv|fm|new|live|24)$/.test(m[1])) return CBY[m[1]][0];
    return '';
  }
  D.countryOf = function (o) {
    var tc = fold(o.tc).split(/[;,\s]+/)[0];
    if (tc && CBY[tc]) return CBY[tc][0];
    var id = /\.([a-z]{2})(?:@|$)/.exec(fold(o.tvg));
    if (id && CBY[id[1]] && id[1] !== 'tv') return CBY[id[1]][0];
    var c = codeFrom(o.group) || codeFrom(o.name);
    if (c) return c;
    var g = fold(o.group);
    for (var i = 0; i < CWORDS.length; i++) if (CWORDS[i][0].test(g)) return CWORDS[i][1];
    return '';
  };
  D.countryName = function (code) { return CBY[code] ? CBY[code][1] : 'Otro país'; };
  D.countryFlag = function (code) {
    return '';   // sin banderas (interfaz sin emojis)
  };

  // Secciones dentro de En vivo (los canales de TV solo se subdividen aquí)
  D.TV_SECTIONS = [
    { id: 'news', name: 'Noticias', test: function (i, g) { return D.RX.news.test(g); } },
    { id: 'sports', name: 'Deportes', test: function (i, g) { return D.RX.sports.test(g); } },
    { id: 'movies', name: 'Películas', test: function (i, g) { return D.RX.movie.test(g); } },
    { id: 'series', name: 'Series', test: function (i, g) { return D.RX.series.test(g); } },
    { id: 'kids', name: 'Infantil', test: function (i) { return i.kids; } },
    { id: 'anime', name: 'Anime', test: function (i) { return i.anime; } },
    { id: 'kdrama', name: 'K-Drama', test: function (i) { return i.kdrama; } },
    { id: 'docs', name: 'Documentales', test: function (i) { return i.doc; } },
    { id: 'music', name: 'Música', test: function (i, g) { return D.RX.music.test(g); } }
  ];

  // Paleta para tarjetas sin imagen
  D.HUES = ['#FF6900', '#2F6FEB', '#14A38B', '#D9A20B', '#E0447C', '#3BA55C', '#7A3FD1', '#C2410C', '#4C8DFF', '#B34A00'];

  // Íconos (trazo, sin emojis)
  var I = function (p, fill) { return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="' + (fill ? 'currentColor' : 'none') + '" stroke="' + (fill ? 'none' : 'currentColor') + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>'; };
  D.ICON = {
    home: I('<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'),
    live: I('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 3l4 4 4-4"/>'),
    movie: I('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>'),
    series: I('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'),
    anime: I('<path d="M11 3l1.8 4.7 4.7 1.8-4.7 1.8L11 16l-1.8-4.7L4.5 9.5l4.7-1.8z"/><path d="M18.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>'),
    platforms: I('<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>'),
    kdrama: I('<path d="M12 21s-7-4.4-9.3-9A5 5 0 0 1 12 6.4 5 5 0 0 1 21.3 12C19 16.6 12 21 12 21z"/>'),
    port: I('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><path d="M8 10h3M9.5 8.5v3M15 9.5h.01M17 11h.01"/>'),
    doc: I('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>'),
    star: I('<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.3l1.1-6.2L3 9.7l6.2-.9z"/>'),
    starFill: I('<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.3l1.1-6.2L3 9.7l6.2-.9z"/>', true),
    guide: I('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 4v17"/>'),
    games: I('<path d="M7 8h10a4 4 0 0 1 4 4v2.5a2.5 2.5 0 0 1-4.6 1.4L15 14H9l-1.4 1.9A2.5 2.5 0 0 1 3 14.5V12a4 4 0 0 1 4-4z"/><path d="M8 11v3M6.5 12.5h3"/>'),
    settings: I('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
    search: I('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
    history: I('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>'),
    play: I('<path d="M7 4l13 8-13 8z"/>', true),
    back: I('<path d="M15 18l-6-6 6-6"/>'),
    plus: I('<path d="M12 5v14M5 12h14"/>'),
    lock: I('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    phone: I('<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>'),
    compass: I('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>'),
    play: I('<path d="M7 4l13 8-13 8z"/>'),
    yt: I('<rect x="2.5" y="5" width="19" height="14" rx="4"/><path d="M10 9l5 3-5 3z"/>'),
    music: I('<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'),
    radio: I('<rect x="3" y="8" width="18" height="12" rx="2"/><circle cx="8" cy="14" r="3"/><path d="M14 12h4M14 16h4M7 8l10-5"/>'),
    pause: I('<path d="M7 4h4v16H7zM13 4h4v16h-4z"/>'),
    next: I('<path d="M5 4l10 8-10 8zM17 4h2v16h-2z"/>'),
    prev: I('<path d="M19 4L9 12l10 8zM5 4h2v16H5z"/>'),
    close: I('<path d="M6 6l12 12M18 6L6 18"/>'),
    globe: I('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
    grid: I('<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>'),
    user: I('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>'),
    refresh: I('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'),
    trash: I('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
    usb: I('<path d="M12 2v14M8 6l4-4 4 4M7 12v2a5 5 0 0 0 10 0v-2"/><circle cx="12" cy="20" r="2"/>'),
    download: I('<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>'),
    kids: I('<circle cx="12" cy="8" r="4"/><path d="M5 21c1-4 4-6 7-6s6 2 7 6"/><path d="M9 7.5h.01M15 7.5h.01"/>'),
    cloud: I('<path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.5a4.5 4.5 0 0 1-.5 9.5z"/>'),
    archive: I('<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>')
  };

  window.MVD = D;
})();
