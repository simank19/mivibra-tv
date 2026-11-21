"""MiVibra · Ajusta peinados y accesorios (Tripo) a un cuerpo con esqueleto propio.

  python3 piezas.py cuerpo.glb piezas.json carpeta_salida [--prev carpeta]

piezas.json: [{"id": "pelo_bob", "file": "x.glb", "tipo": "pelo", "rot": 0}, ...]
tipos: pelo, gorra, audifonos, gafas, tenis, manilla, morral
Cada pieza sale como GLB en el espacio del cuerpo (pose T) y un indice.json dice a qué hueso va pegada:
en el juego se pone en su lugar y se "pega" al hueso (bone.attach), así sigue al cuerpo al moverse.
"""
import sys, os, json, math
import bpy, bmesh
from mathutils import Vector, Matrix

def args():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    o = {'prev': None}; pos = []; i = 0
    while i < len(a):
        if a[i] == '--prev': o['prev'] = a[i + 1]; i += 2
        elif a[i] == '--coronilla': CORONILLA[0] = float(a[i + 1]); i += 2
        else: pos.append(a[i]); i += 1
    o['body'], o['cfg'], o['out'] = pos
    return o

CARAS = {'pelo': 9000, 'gorra': 3000, 'audifonos': 3000, 'gafas': 2500, 'tenis': 3500, 'manilla': 1500, 'morral': 3500}
HUESO = {'pelo': 'head', 'gorra': 'head', 'audifonos': 'head', 'gafas': 'head', 'tenis': 'Foot', 'manilla': 'Hand', 'morral': 'chest'}

def bbox(pts):
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx

def body_regions(body):
    """Vértices del cuerpo agrupados por el hueso que más los mueve."""
    groups = {g.index: g.name for g in body.vertex_groups}
    reg = {}
    mw = body.matrix_world
    for v in body.data.vertices:
        if not v.groups: continue
        g = max(v.groups, key=lambda x: x.weight)
        reg.setdefault(groups[g.group], []).append(mw @ v.co)
    return reg

def import_part(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    ms = [o for o in new if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for m in ms:
        mw = m.matrix_world.copy(); m.parent = None; m.matrix_world = mw; m.select_set(True)
    for o in new:
        if o.type != 'MESH': bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.view_layer.objects.active = ms[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(ms) > 1: bpy.ops.object.join()
    return bpy.context.view_layer.objects.active

def lighten(ob, caras):
    n = len(ob.data.polygons)
    if n <= caras * 1.1: return
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bm.to_mesh(ob.data); bm.free()
    bpy.context.view_layer.objects.active = ob
    d = ob.modifiers.new('aligerar', 'DECIMATE'); d.ratio = caras / len(ob.data.polygons); d.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='aligerar')

def tex_pixels(ob):
    for s in ob.material_slots:
        if not s.material or not s.material.use_nodes: continue
        for n in s.material.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image and 'normal' not in n.image.name.lower() and '_rm' not in n.image.name.lower():
                im = n.image; return im.size[0], im.size[1], list(im.pixels)
    return None

def strip_mannequin(ob):
    """Peinados que vienen sobre una cabeza de maniquí: se mide la cabeza y se borra (piel clara en la textura)."""
    t = tex_pixels(ob)
    if not t: return None
    W, H, px = t
    uv = ob.data.uv_layers.active
    if not uv: return None
    skin = []
    for p in ob.data.polygons:
        u = sum(uv.data[i].uv.x for i in p.loop_indices) / p.loop_total; v = sum(uv.data[i].uv.y for i in p.loop_indices) / p.loop_total
        x = min(W - 1, max(0, int((u % 1) * W))); y = min(H - 1, max(0, int((v % 1) * H)))
        k = (y * W + x) * 4; r, g, b = px[k], px[k + 1], px[k + 2]
        lum = 0.3 * r + 0.59 * g + 0.11 * b
        if lum > 0.52 and r > b + 0.06 and r >= g: skin.append(p.index)
    if len(skin) < len(ob.data.polygons) * 0.06: return None
    mw = ob.matrix_world
    pts = [mw @ ob.data.vertices[vi].co for pi in skin for vi in ob.data.polygons[pi].vertices]
    box = bbox(pts)
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[i] for i in skin], context='FACES')
    bm.to_mesh(ob.data); bm.free()
    print('  maniquí quitado (%d caras de piel)' % len(skin))
    return box

def xform(ob, M):
    ob.data.transform(M); ob.data.update()

def pts_of(ob): return [ob.matrix_world @ v.co for v in ob.data.vertices]

def width_at(pts, z, d):
    s = [p for p in pts if abs(p.z - z) < d]
    if not s: return 0, 0, 0
    xs = [p.x for p in s]; ys = [p.y for p in s]
    return max(xs) - min(xs), (min(ys) + max(ys)) / 2, min(ys)

def fit_head(ob, kind, R, man, it=None):
    it = it or {}
    hmn, hmx = head_box(R)
    hw, hd, hh = hmx.x - hmn.x, hmx.y - hmn.y, hmx.z - hmn.z
    hc = (hmn + hmx) / 2
    pts = pts_of(ob); mn, mx = bbox(pts)
    if man:
        mmn, mmx = man
        s = hw / max(mmx.x - mmn.x, 1e-6)
        mc = (mmn + mmx) / 2
        xform(ob, Matrix.Translation(-Vector((mc.x, mc.y, mmx.z))))
        xform(ob, Matrix.Scale(s * 1.02, 4))
        xform(ob, Matrix.Translation(Vector((hc.x, hc.y, hmx.z + hh * 0.01))))
        return
    if it.get('ancho'):
        # ajuste a mano: ancho total = veces el ancho de la cabeza; arriba apenas sobre la coronilla
        c = (mn + mx) / 2
        xform(ob, Matrix.Translation(-Vector((c.x, c.y, mx.z))))
        xform(ob, Matrix.Scale(hw * it['ancho'] / (mx.x - mn.x), 4))
        xform(ob, Matrix.Translation(Vector((hc.x, hc.y + hd * it.get('dy', 0), hmx.z + hh * it.get('dz', 0.06)))))
        return
    if kind in ('pelo', 'gorra'):
        # ancho en la parte alta (sin contar lo que cae): se ajusta al ancho de la cabeza en esa misma zona
        xform(ob, Matrix.Translation(-Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mx.z))))
        for _ in range(3):
            pts = pts_of(ob); mn, mx = bbox(pts)
            ref = hh * 0.35
            w, _, _ = width_at(pts, -ref, hh * 0.05)
            hwz, _, _ = width_at(R['head'], hmx.z - ref, hh * 0.05)
            want = hwz * (1.16 if kind == 'pelo' else 1.12)
            if w <= 0: w = mx.x - mn.x
            xform(ob, Matrix.Scale(want / w, 4))
        pts = pts_of(ob); mn, mx = bbox(pts)
        _, cyp, _ = width_at(pts, -hh * 0.3, hh * 0.06)
        _, cyh, _ = width_at(R['head'], hmx.z - hh * 0.3, hh * 0.06)
        lift = hh * it.get('alza', 0.06 if kind == 'pelo' else 0.08)
        xform(ob, Matrix.Translation(Vector((hc.x, cyh - cyp + (hh * 0.03 if kind == 'pelo' else 0), hmx.z + lift))))
    elif kind == 'audifonos':
        c = (mn + mx) / 2
        xform(ob, Matrix.Translation(-Vector((c.x, c.y, mx.z))))
        s = hw * 1.22 / (mx.x - mn.x); xform(ob, Matrix.Scale(s, 4))
        xform(ob, Matrix.Translation(Vector((hc.x, hc.y + hd * 0.05, hmx.z + hh * 0.06))))
    elif kind == 'gafas':
        c = (mn + mx) / 2
        # el frente de las gafas es el lado con los lentes (más alto); va hacia -Y
        front = [p for p in pts if p.y < c.y]; back = [p for p in pts if p.y >= c.y]
        if front and back and (max(p.z for p in back) - min(p.z for p in back)) > (max(p.z for p in front) - min(p.z for p in front)):
            xform(ob, Matrix.Rotation(math.pi, 4, 'Z')); pts = pts_of(ob); mn, mx = bbox(pts); c = (mn + mx) / 2
        xform(ob, Matrix.Translation(-Vector((c.x, mn.y, c.z))))
        s = hw * 1.04 / (mx.x - mn.x); xform(ob, Matrix.Scale(s, 4))
        eye_z = hmn.z + hh * 0.42
        _, _, fy = width_at(R['head'], eye_z, hh * 0.04)
        xform(ob, Matrix.Translation(Vector((hc.x, fy - hd * 0.03, eye_z))))

CORONILLA = [None]   # alto de la coronilla puesto a mano (p. ej. cuerpos con moño)
def head_box(R):
    hmn, hmx = bbox(R['head'])
    if CORONILLA[0]: return hmn, Vector((hmx.x, hmx.y, CORONILLA[0]))
    hp = R['head']; wmax = hmx.x - hmn.x; top = hmx.z
    z, peak = hmx.z, 0
    while z > hmx.z - (hmx.z - hmn.z) * 0.35:
        sl = [p.x for p in hp if abs(p.z - z) < 0.004]
        w = max(sl) - min(sl) if sl else 0
        if w > peak: peak = w
        elif peak and w < peak * 0.78 and peak < wmax * 0.6: top = z; break
        z -= 0.003
    return hmn, Vector((hmx.x, hmx.y, top))

def conform(ob, body, R, it):
    """El pelo se acomoda a la cabeza: arriba de las cejas, lo que queda adentro sale a la superficie y lo que
    queda flotando cerca se acerca (sin aplastar el volumen de afuera). Abajo de las cejas, los mechones que
    atraviesan la cara se quitan (en vez de aplastarlos contra ella)."""
    from mathutils.bvhtree import BVHTree
    dg = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(body, dg)
    hmn, hmx = head_box(R); hw = hmx.x - hmn.x; hh = hmx.z - hmn.z; hc = (hmn + hmx) / 2
    eye_z = hmn.z + hh * 0.42; brow_z = eye_z + hh * it.get('cejas', 0.13)
    out_off, near, pull = 0.004, hh * it.get('abrazo', 0.16), it.get('fuerza', 0.55)
    me = ob.data; mw = ob.matrix_world; inv = mw.inverted()
    for v in me.vertices:
        p = mw @ v.co
        if p.z < brow_z: continue
        loc, nrm, idx, d = bvh.find_nearest(p)
        if loc is None: continue
        side = (p - loc).dot(nrm)
        if side < out_off: v.co = inv @ (loc + nrm * out_off)
        elif side < near:
            k = (1 - side / near) ** 1.5 * pull
            v.co = inv @ (p - nrm * (side - out_off) * k)
    me.update()
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
    kill = []
    for f in bm.faces:
        c = mw @ f.calc_center_median()
        if c.z >= brow_z or c.y > hc.y or abs(c.x - hc.x) > hw * 0.45: continue
        loc, nrm, idx, d = bvh.find_nearest(c)
        if loc is not None and (c - loc).dot(nrm) < 0.006: kill.append(f)
        elif it.get('ojos') and abs(c.x - hc.x) < hw * 0.36 and eye_z - hh * 0.07 < c.z < eye_z + hh * 0.1: kill.append(f)
    bmesh.ops.delete(bm, geom=kill, context='FACES'); bm.to_mesh(me); bm.free()

def fit_feet(ob, R, out_objs):
    """Un tenis: se orienta (punta hacia adelante), se ajusta al pie y se copia en espejo para el otro."""
    pts = pts_of(ob); mn, mx = bbox(pts)
    ext = mx - mn
    if ext.x > ext.y:   # viene de lado: el largo pasa a Y
        xform(ob, Matrix.Rotation(math.pi / 2, 4, 'Z')); pts = pts_of(ob); mn, mx = bbox(pts)
    # el talón es la punta más alta (cuello del zapato): va hacia +Y (atrás)
    L = mx.y - mn.y
    near = lambda y0: max((p.z for p in pts if abs(p.y - y0) < L * 0.2), default=0)
    if near(mn.y) > near(mx.y):
        xform(ob, Matrix.Rotation(math.pi, 4, 'Z')); pts = pts_of(ob); mn, mx = bbox(pts)
    res = []
    for side in ('left', 'right'):
        fp = R.get(side + 'Foot', []) + R.get(side + 'Toes', [])
        fmn, fmx = bbox(fp)
        o = ob if side == 'left' else ob.copy()
        if o is not ob: o.data = ob.data.copy(); bpy.context.collection.objects.link(o)
        p2 = pts_of(o); a, b = bbox(p2)
        c = (a + b) / 2
        xform(o, Matrix.Translation(-Vector((c.x, c.y, a.z))))
        s = (fmx.y - fmn.y) * 1.06 / (b.y - a.y); xform(o, Matrix.Scale(s, 4))
        if side == 'right': xform(o, Matrix.Scale(-1, 4, Vector((1, 0, 0))))
        fc = (fmn + fmx) / 2
        xform(o, Matrix.Translation(Vector((fc.x, fc.y, fmn.z - 0.004))))
        res.append((o, side + 'Foot'))
    return res

def fit_wrist(ob, R):
    pts = pts_of(ob); mn, mx = bbox(pts); ext = mx - mn
    ax = min(range(3), key=lambda i: ext[i])   # el hueco de la manilla
    if ax == 1: xform(ob, Matrix.Rotation(math.pi / 2, 4, 'Z'))
    elif ax == 2: xform(ob, Matrix.Rotation(math.pi / 2, 4, 'Y'))
    pts = pts_of(ob); mn, mx = bbox(pts); c = (mn + mx) / 2
    xform(ob, Matrix.Translation(-c))
    arm = R['leftLowerArm']; ax_ = max(p.x for p in arm)
    near = [p for p in arm if p.x > ax_ - 0.04]
    nmn, nmx = bbox(near)
    thick = max(nmx.y - nmn.y, nmx.z - nmn.z)
    s = thick * 1.35 / max(mx.y - mn.y, mx.z - mn.z); xform(ob, Matrix.Scale(s, 4))
    xform(ob, Matrix.Translation(Vector((ax_ - 0.035, (nmn.y + nmx.y) / 2, (nmn.z + nmx.z) / 2))))
    return [(ob, 'leftLowerArm')]

BACK_IN = [0.0]
def fit_back(ob, R, rot):
    if rot: xform(ob, Matrix.Rotation(math.radians(rot), 4, 'Z'))
    pts = pts_of(ob); mn, mx = bbox(pts)
    tor = R.get('chest', []) + R.get('upperChest', []) + R.get('spine', [])
    tmn, tmx = bbox(tor)
    s = (tmx.z - tmn.z) * 0.95 / (mx.z - mn.z);
    c = (mn + mx) / 2
    xform(ob, Matrix.Translation(-Vector((c.x, mn.y, c.z)))); xform(ob, Matrix.Scale(s, 4))
    xform(ob, Matrix.Translation(Vector(((tmn.x + tmx.x) / 2, tmx.y - 0.005 - BACK_IN[0], (tmn.z + tmx.z) / 2))))
    return [(ob, 'chest')]

def slim_materials(ob):
    """En el juego se usa sombreado anime: solo hace falta el color. Se quitan relieve y brillo (pesan el doble)."""
    for sl in ob.material_slots:
        m = sl.material
        if not m or not m.use_nodes: continue
        nt = m.node_tree
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf: continue
        for inp in ('Normal', 'Metallic', 'Roughness'):
            for l in list(bsdf.inputs[inp].links): nt.links.remove(l)

def export_one(ob, path):
    slim_materials(ob)
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_animations=False, export_skins=False,
                              export_image_format='JPEG', export_jpeg_quality=82)

def main():
    o = args(); os.makedirs(o['out'], exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=o['body'])
    body = max([x for x in bpy.data.objects if x.type == 'MESH'], key=lambda x: len(x.data.vertices))
    R = body_regions(body)
    cfg = json.load(open(o['cfg']))
    idx = []
    for it in cfg:
        for k, extra in (it.get('por_cuerpo') or {}).items():
            if k in os.path.basename(o['body']): it = dict(it, **extra)
        kind = it['tipo']; print('Pieza', it['id'], kind)
        ob = import_part(it['file'])
        if it.get('rot'): xform(ob, Matrix.Rotation(math.radians(it['rot']), 4, 'Z'))
        lighten(ob, CARAS.get(kind, 3000))
        man = strip_mannequin(ob) if kind == 'pelo' else None
        if kind in ('pelo', 'gorra', 'audifonos', 'gafas'): fit_head(ob, kind, R, man, it); outs = [(ob, 'head')]
        if kind == 'pelo' and not it.get('sin_ajuste'): conform(ob, body, R, it)
        if it.get('tapar_huecos'):
            bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.holes_fill(bm, edges=bm.edges, sides=it['tapar_huecos']); bm.to_mesh(ob.data); bm.free()
        if it.get('cortar_cara'):
            # pelo que tapa la cara: se abre el frente (desde las cejas hasta el mentón)
            hmn, hmx = bbox(R['head']); hw = hmx.x - hmn.x; hh = hmx.z - hmn.z; cy = (hmn.y + hmx.y) / 2
            bm = bmesh.new(); bm.from_mesh(ob.data); bm.faces.ensure_lookup_table()
            kill = [f for f in bm.faces if (lambda c: c.y < cy and abs(c.x - (hmn.x + hmx.x) / 2) < hw * 0.4 and hmn.z - hh * 0.7 < c.z < hmx.z - hh * 0.3)(ob.matrix_world @ f.calc_center_median())]
            bmesh.ops.delete(bm, geom=kill, context='FACES'); bm.to_mesh(ob.data); bm.free()
        elif kind == 'tenis': outs = fit_feet(ob, R, None)
        elif kind == 'manilla': outs = fit_wrist(ob, R)
        elif kind == 'morral': BACK_IN[0] = it.get('adentro', 0.0); outs = fit_back(ob, R, it.get('rot2', 0))
        files = []
        for k, (x, bone) in enumerate(outs):
            fn = it['id'] + ('' if len(outs) == 1 else '_' + bone) + '.glb'
            x.name = it['id']; export_one(x, os.path.join(o['out'], fn)); files.append({'f': fn, 'hueso': bone})
        idx.append({'id': it['id'], 'tipo': kind, 'nombre': it.get('nombre', it['id']), 'archivos': files})
        if not o['prev']:
            for x, _ in outs: bpy.data.objects.remove(x, do_unlink=True)
    json.dump(idx, open(os.path.join(o['out'], 'indice.json'), 'w'), ensure_ascii=False, indent=1)
    if o['prev']:
        os.makedirs(o['prev'], exist_ok=True)
        sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.render.resolution_x = 700; sc.render.resolution_y = 900
        sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
        cd = bpy.data.cameras.new('c'); cam = bpy.data.objects.new('c', cd); sc.collection.objects.link(cam); sc.camera = cam
        parts = [x for x in bpy.data.objects if x.type == 'MESH' and x is not body]
        H = max(p.z for p in pts_of(body))
        def shot(name, show, loc, rot, ortho, ctr):
            for x in parts: x.hide_render = x.name.split('.')[0] not in show
            cd.type = 'ORTHO'; cd.ortho_scale = ortho; cam.location = loc; cam.rotation_euler = rot
            sc.render.filepath = os.path.join(o['prev'], name); bpy.ops.render.render(write_still=True)
        hz = max(p.z for p in R['head'])
        for it in cfg:
            if it['tipo'] in ('pelo', 'gorra', 'audifonos', 'gafas'):
                shot('cab_' + it['id'] + '.png', [it['id']], (0.9, -1.5, hz - 0.08), (math.radians(90), 0, math.radians(31)), 0.55, None)
        shot('todo.png', [it['id'] for it in cfg if it['tipo'] in ('tenis', 'manilla', 'morral')] + [cfg[0]['id']], (2.2, -3.2, H / 2), (math.radians(90), 0, math.radians(34)), H * 1.25, None)
        shot('espalda.png', [it['id'] for it in cfg if it['tipo'] in ('morral',)], (2.2, 3.2, H / 2), (math.radians(90), 0, math.radians(146)), H * 1.25, None)

if __name__ == '__main__':
    main()
