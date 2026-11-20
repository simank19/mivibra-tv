"""MiVibra · Esqueleto propio para cuerpos anime (Tripo u otros).

Uso (Blender 5.x como módulo o en consola):
  python3 autorig.py entrada.glb salida.glb [--alto 1.62] [--prev carpeta]

Qué hace:
 1. Importa el cuerpo (GLB/FBX/OBJ), borra el esqueleto que traiga y junta las mallas.
 2. Lo endereza (de pie, mirando al frente), lo lleva al alto pedido y lo apoya en el piso.
 3. Mide el cuerpo por cortes horizontales: entrepierna, axilas, hombros, cuello, coronilla,
    puntas de los dedos, rodillas y tobillos.
 4. Arma un esqueleto con los nombres del estándar VRM (hips, spine, chest, upperChest, neck, head,
    hombros, brazos, manos, piernas, pies y dedos de los pies), así los juegos lo mueven igual que antes.
 5. Pesos automáticos (si fallan en mallas rotas, se calculan sobre una copia cerrada y se pasan).
 6. Si viene en pose A, baja la pose a T y la guarda como pose de reposo (los juegos esperan T).
 7. Exporta GLB y, si se pide, imágenes de control (frente, lado y una pose de prueba).
"""
import sys, math, json, os
import bpy, bmesh
from mathutils import Vector, Matrix

def args():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    o = {'alto': 1.62, 'prev': None, 'caras': 26000}
    pos = []
    i = 0
    while i < len(a):
        if a[i] == '--alto': o['alto'] = float(a[i + 1]); i += 2
        elif a[i] == '--prev': o['prev'] = a[i + 1]; i += 2
        elif a[i] == '--caras': o['caras'] = int(a[i + 1]); i += 2
        else: pos.append(a[i]); i += 1
    o['inp'], o['out'] = pos[0], pos[1]
    return o

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def load(path):
    ext = os.path.splitext(path)[1].lower()
    if ext in ('.glb', '.gltf', '.vrm'): bpy.ops.import_scene.gltf(filepath=path)
    elif ext == '.fbx': bpy.ops.import_scene.fbx(filepath=path)
    elif ext == '.obj': bpy.ops.wm.obj_import(filepath=path)
    else: raise SystemExit('Formato no soportado: ' + ext)

def body_mesh():
    """Aplica poses y transformaciones, borra esqueletos y deja una sola malla."""
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    for m in meshes:
        bpy.context.view_layer.objects.active = m
        if m.data.shape_keys: m.shape_key_clear()
        for md in list(m.modifiers):
            if md.type == 'ARMATURE':
                try: bpy.ops.object.modifier_apply(modifier=md.name)
                except Exception: m.modifiers.remove(md)
        m.vertex_groups.clear()
        if m.data.shape_keys:
            m.shape_key_clear()
    for o in list(bpy.data.objects):
        if o.type != 'MESH': bpy.data.objects.remove(o, do_unlink=True)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for m in meshes:
        m.select_set(True)
        mw = m.matrix_world.copy(); m.parent = None; m.matrix_world = mw
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(meshes) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = 'Cuerpo'
    return ob

def verts(ob):
    return [ob.matrix_world @ v.co for v in ob.data.vertices]

def lighten(ob, caras):
    """Los modelos de IA traen millones de caras: se bajan a un número que el TV mueve sin problema (la textura no cambia)."""
    n = len(ob.data.polygons)
    if n <= caras * 1.1: return
    bpy.context.view_layer.objects.active = ob
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(ob.data); bm.free()
    d = ob.modifiers.new('aligerar', 'DECIMATE'); d.decimate_type = 'COLLAPSE'
    d.ratio = caras / len(ob.data.polygons); d.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='aligerar')
    print('Caras: %d -> %d' % (n, len(ob.data.polygons)))

def normalize(ob, alto):
    vs = verts(ob)
    xs = [v.x for v in vs]; ys = [v.y for v in vs]; zs = [v.z for v in vs]
    ext = [max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)]
    # de pie: el eje más largo es la altura (algunos exportan con Y hacia arriba)
    if ext[1] > ext[2] * 1.15 and ext[1] >= ext[0]:
        ob.rotation_euler = (math.radians(90), 0, 0); bpy.ops.object.transform_apply(rotation=True)
    vs = verts(ob)
    zs = [v.z for v in vs]; h = max(zs) - min(zs)
    s = alto / h
    ob.scale = (s, s, s); bpy.ops.object.transform_apply(scale=True)
    vs = verts(ob)
    zmin = min(v.z for v in vs)
    # centro en x/y según los pies (lo de abajo) para que quede parado sobre el origen
    low = [v for v in vs if v.z < zmin + alto * 0.08]
    cx = sum(v.x for v in low) / len(low); cy = sum(v.y for v in low) / len(low)
    for v in ob.data.vertices: v.co -= Vector((cx, cy, zmin))
    ob.data.update()
    # mirando al frente (-Y en Blender): la punta de los pies sale hacia adelante de la canilla
    vs = verts(ob)
    feet = [v for v in vs if v.z < alto * 0.03]
    shin = [v for v in vs if alto * 0.10 < v.z < alto * 0.14]
    sy = (min(v.y for v in shin) + max(v.y for v in shin)) / 2 if shin else 0
    fy = [v.y for v in feet]
    if feet and (max(fy) - sy) > (sy - min(fy)):
        for v in ob.data.vertices: v.co = Vector((-v.co.x, -v.co.y, v.co.z))
        ob.data.update()

def clusters(vals, gap):
    vals = sorted(vals)
    if not vals: return []
    out = [[vals[0], vals[0]]]
    for x in vals[1:]:
        if x - out[-1][1] > gap: out.append([x, x])
        else: out[-1][1] = x
    return out

def proxy(ob, H):
    """Copia cerrada y pareja del cuerpo (vóxeles): sin pestañas, mechones sueltos ni huecos debajo de la ropa."""
    px = ob.copy(); px.data = ob.data.copy(); bpy.context.collection.objects.link(px)
    px.modifiers.clear()
    bpy.ops.object.select_all(action='DESELECT'); px.select_set(True); bpy.context.view_layer.objects.active = px
    r = px.modifiers.new('cerrar', 'REMESH'); r.mode = 'VOXEL'; r.voxel_size = H * 0.007
    bpy.ops.object.modifier_apply(modifier='cerrar')
    # se quitan los pedacitos sueltos (menos del 1 % de la malla)
    bm = bmesh.new(); bm.from_mesh(px.data)
    seen, parts = set(), []
    for v in bm.verts:
        if v in seen: continue
        stack, comp = [v], []
        seen.add(v)
        while stack:
            a = stack.pop(); comp.append(a)
            for e in a.link_edges:
                b = e.other_vert(a)
                if b not in seen: seen.add(b); stack.append(b)
        parts.append(comp)
    big = max(len(c) for c in parts)
    bmesh.ops.delete(bm, geom=[v for c in parts if len(c) < big * 0.01 for v in c], context='VERTS')
    bm.to_mesh(px.data); bm.free()
    return px

def measure(ob, H):
    vs = verts(ob)
    def slab(z, d=H * 0.006): return [v for v in vs if abs(v.z - z) < d]
    gap = H * 0.012
    # entrepierna: subiendo desde las rodillas, el primer corte donde las piernas se juntan
    crotch = H * 0.47
    for i in range(int(H * 0.30 * 1000), int(H * 0.62 * 1000), 4):
        z = i / 1000; s = slab(z)
        cs = [c for c in clusters([v.x for v in s], gap) if c[0] < H * 0.06 and c[1] > -H * 0.06]
        if len(cs) == 1 and cs[0][0] < -H * 0.01 and cs[0][1] > H * 0.01:
            crotch = z; break
    # ancho del torso en cada altura (solo el grupo del centro)
    def torso_w(z):
        s = slab(z); cs = clusters([v.x for v in s], gap)
        mid = [c for c in cs if c[0] <= 0 <= c[1]]
        return (mid[0][1] - mid[0][0]) if mid else 0, len(cs)
    # cuello: el corte más angosto del tronco entre el pecho y la cabeza (sirve en pose T y en pose A)
    top = max(v.z for v in vs)
    neck, nw = H * 0.84, 9
    lo = crotch + (top - crotch) * 0.55
    for i in range(int(lo * 1000), int((top - H * 0.13) * 1000), 3):
        z = i / 1000; w, n = torso_w(z)
        if 0 < w < nw: nw, neck = w, z
    # hombros: un poco abajo del cuello (en anime la cabeza es grande: se mide con su alto)
    shz = neck - (top - neck) * 0.22
    armpit = shz - H * 0.07
    tw, _ = torso_w(armpit)
    shx = tw / 2 * 0.85 if tw else H * 0.09
    # punta de los dedos: el vértice más afuera (cada lado) por encima de la entrepierna
    upper = [v for v in vs if v.z > crotch]
    tipL = max(upper, key=lambda v: v.x); tipR = min(upper, key=lambda v: v.x)
    # pies
    feet = [v for v in vs if v.z < H * 0.06]
    def foot(side):
        f = [v for v in feet if (v.x > 0) == (side > 0)] or feet
        toe_y = min(v.y for v in f); heel_y = max(v.y for v in f)
        cx = sum(v.x for v in f) / len(f)
        return cx, toe_y, heel_y
    fL, fR = foot(1), foot(-1)
    # cadera: ancho de las piernas justo debajo de la entrepierna
    s = slab(crotch - H * 0.04, H * 0.01)
    legsL = [v.x for v in s if v.x > 0] or [H * 0.05]; legsR = [v.x for v in s if v.x < 0] or [-H * 0.05]
    hipx = ((sum(legsL) / len(legsL)) - (sum(legsR) / len(legsR))) / 2
    # profundidad (y) del centro del cuerpo a cada altura
    def cy(z, d=H * 0.01, xmax=None):
        s = [v for v in slab(z, d) if xmax is None or abs(v.x) < xmax]
        return (min(v.y for v in s) + max(v.y for v in s)) / 2 if s else 0
    return dict(H=H, top=top, crotch=crotch, armpit=armpit, neck=neck, shz=shz, shx=shx, tipL=tipL, tipR=tipR, fL=fL, fR=fR, hipx=hipx, cy=cy)

def build_rig(ob, M):
    H = M['H']; cy = M['cy']
    arm = bpy.data.armatures.new('Esqueleto'); rig = bpy.data.objects.new('Esqueleto', arm)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.edit_bones
    def bone(name, h, t, parent=None, conn=False):
        b = eb.new(name); b.head = h; b.tail = t
        if parent: b.parent = eb[parent]; b.use_connect = conn
        return b
    z_hip = M['crotch'] + H * 0.06; y_hip = cy(z_hip, xmax=H * 0.08)
    z_neck = M['neck']; z_head_top = M['top']
    spine = [z_hip + (z_neck - z_hip) * k for k in (0.0, 0.22, 0.48, 0.72, 1.0)]
    p = [Vector((0, cy(z, xmax=H * 0.06), z)) for z in spine]
    bone('hips', p[0], p[1])
    bone('spine', p[1], p[2], 'hips', True)
    bone('chest', p[2], p[3], 'spine', True)
    bone('upperChest', p[3], p[4], 'chest', True)
    z_jaw = z_neck + (z_head_top - z_neck) * 0.22
    yn = cy(z_jaw, xmax=H * 0.05)
    bone('neck', p[4], Vector((0, yn, z_jaw)), 'upperChest', True)
    bone('head', Vector((0, yn, z_jaw)), Vector((0, yn, z_head_top)), 'neck', True)
    for s, S in ((1, 'left'), (-1, 'right')):
        tip = M['tipL'] if s > 0 else M['tipR']
        shz = M['shz']; sh_in = Vector((s * H * 0.02, p[4].y, shz)); sh_out = Vector((s * M['shx'], p[4].y, shz))
        # mano: el último 10 % del largo hasta la punta de los dedos
        armlen = (tip - sh_out).length
        dirv = (tip - sh_out).normalized()
        wrist = sh_out + dirv * (armlen * 0.80)
        elbow = sh_out + dirv * (armlen * 0.43)
        elbow.y += H * 0.012   # codo apenas hacia atrás para que el brazo doble bien
        bone(S + 'Shoulder', sh_in, sh_out, 'upperChest')
        bone(S + 'UpperArm', sh_out, elbow, S + 'Shoulder', True)
        bone(S + 'LowerArm', elbow, wrist, S + 'UpperArm', True)
        bone(S + 'Hand', wrist, sh_out + dirv * armlen * 0.97, S + 'LowerArm', True)
        fx, toe_y, heel_y = M['fL'] if s > 0 else M['fR']
        hip = Vector((s * M['hipx'], y_hip, M['crotch'] + H * 0.045))
        ankle = Vector((fx, heel_y + (toe_y - heel_y) * 0.22, H * 0.055))
        knee = (hip + ankle) / 2; knee.y -= H * 0.012   # rodilla apenas adelante
        ball = Vector((fx, heel_y + (toe_y - heel_y) * 0.72, H * 0.018))
        bone(S + 'UpperLeg', hip, knee, 'hips')
        bone(S + 'LowerLeg', knee, ankle, S + 'UpperLeg', True)
        bone(S + 'Foot', ankle, ball, S + 'LowerLeg', True)
        bone(S + 'Toes', ball, Vector((fx, toe_y, H * 0.012)), S + 'Foot', True)
    # giro de los huesos (roll) consistente: eje Z local hacia adelante (-Y)
    for b in eb:
        b.align_roll(Vector((0, -1, 0)) if abs(b.vector.normalized().y) < 0.9 else Vector((0, 0, 1)))
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig

def skin(ob, rig):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active = rig
    ok = True
    try: bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    except Exception: ok = False
    # ¿quedaron vértices sin peso? (mallas de IA suelen venir rotas)
    unweighted = [v for v in ob.data.vertices if not any(g.weight > 1e-4 for g in v.groups)]
    if ok and unweighted and len(unweighted) < len(ob.data.vertices) * 0.25:
        # pocos: cada uno va al hueso más cercano (y la mitad al siguiente, para que no se quiebre)
        segs = [(b.name, rig.matrix_world @ b.head_local, rig.matrix_world @ b.tail_local) for b in rig.data.bones]
        def dist(p, a, b):
            ab = b - a; t = max(0, min(1, (p - a).dot(ab) / max(ab.length_squared, 1e-9))); return (a + ab * t - p).length
        mw = ob.matrix_world
        for v in unweighted:
            p = mw @ v.co
            d = sorted((dist(p, a, b), n) for n, a, b in segs)
            w1 = 1.0 if d[1][0] > d[0][0] * 1.6 else 0.6
            ob.vertex_groups[d[0][1]].add([v.index], w1, 'REPLACE')
            if w1 < 1: ob.vertex_groups[d[1][1]].add([v.index], 1 - w1, 'REPLACE')
        print('Pesos: %d vértices sueltos asignados al hueso más cercano' % len(unweighted))
        return
    if not ok or unweighted:
        print('Pesos: usando copia cerrada (%d vértices sin peso)' % unweighted)
        for md in list(ob.modifiers):
            if md.type == 'ARMATURE': ob.modifiers.remove(md)
        ob.vertex_groups.clear(); ob.parent = None
        px = ob.copy(); px.data = ob.data.copy(); bpy.context.collection.objects.link(px)
        bpy.context.view_layer.objects.active = px
        r = px.modifiers.new('cerrar', 'REMESH'); r.mode = 'VOXEL'; r.voxel_size = M_H[0] * 0.008
        bpy.ops.object.modifier_apply(modifier='cerrar')
        bpy.ops.object.select_all(action='DESELECT'); px.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active = rig
        bpy.ops.object.parent_set(type='ARMATURE_AUTO')
        for b in rig.data.bones: ob.vertex_groups.new(name=b.name)
        dt = ob.modifiers.new('pasar', 'DATA_TRANSFER'); dt.object = px
        dt.use_vert_data = True; dt.data_types_verts = {'VGROUP_WEIGHTS'}; dt.vert_mapping = 'POLYINTERP_NEAREST'
        dt.layers_vgroup_select_src = 'ALL'; dt.layers_vgroup_select_dst = 'NAME'
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier='pasar')
        bpy.data.objects.remove(px, do_unlink=True)
        ob.parent = rig
        a = ob.modifiers.new('Esqueleto', 'ARMATURE'); a.object = rig

def to_tpose(ob, rig):
    """Si los brazos bajan (pose A), se suben a horizontal y eso queda como pose de reposo."""
    bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='POSE')
    changed = False
    for S, s in (('left', 1), ('right', -1)):
        for name in (S + 'UpperArm',):
            pb = rig.pose.bones[name]; b = rig.data.bones[name]
            v = (b.tail_local - b.head_local).normalized()
            target = Vector((s, 0, 0))
            ang = v.angle(target)
            if ang > math.radians(4):
                axis = v.cross(target).normalized()
                q = Matrix.Rotation(ang, 4, axis)
                # rotación en espacio del hueso
                bm = b.matrix_local.to_3x3()
                local = (bm.inverted() @ q.to_3x3() @ bm).to_quaternion()
                pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = local
                changed = True
    # antebrazos rectos
    bpy.context.view_layer.update()
    for S, s in (('left', 1), ('right', -1)):
        pb = rig.pose.bones[S + 'LowerArm']; up = rig.pose.bones[S + 'UpperArm']
        v = (pb.tail - pb.head).normalized(); target = (up.tail - up.head).normalized()
        ang = v.angle(target)
        if ang > math.radians(3):
            axis = v.cross(target).normalized(); q = Matrix.Rotation(ang, 4, axis)
            bm = pb.matrix.to_3x3()
            pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (bm.inverted() @ q.to_3x3() @ bm).to_quaternion() @ pb.rotation_quaternion
            bpy.context.view_layer.update(); changed = True
    bpy.ops.object.mode_set(mode='OBJECT')
    if not changed: return
    # se aplica: la malla toma la pose y el esqueleto la guarda como reposo
    bpy.context.view_layer.objects.active = ob
    md = [m for m in ob.modifiers if m.type == 'ARMATURE'][0]
    keep = md.name
    bpy.ops.object.modifier_copy(modifier=keep)
    bpy.ops.object.modifier_apply(modifier=keep)
    bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    for m in ob.modifiers:
        if m.type == 'ARMATURE': m.object = rig; m.name = 'Esqueleto'

def export(path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.data.objects:
        if o.type in ('MESH', 'ARMATURE'): o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_skins=True, export_animations=False,
                              export_yup=True, export_apply=False, export_texcoords=True, export_normals=True)

def preview(ob, rig, folder):
    os.makedirs(folder, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'; sc.render.resolution_x = 640; sc.render.resolution_y = 900
    sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
    rig.show_in_front = True; rig.data.display_type = 'STICK'
    cam_d = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
    cam_d.type = 'ORTHO'; cam_d.ortho_scale = M_H[0] * 1.15
    def shot(name, loc, rot):
        cam.location = loc; cam.rotation_euler = rot
        sc.render.filepath = os.path.join(folder, name); bpy.ops.render.render(write_still=True)
    H = M_H[0]
    # huesos dibujados como varillas rojas (solo para las imágenes de control)
    mat = bpy.data.materials.new('hueso'); mat.diffuse_color = (1, 0.1, 0.05, 1)
    sticks = []
    for b in rig.data.bones:
        h = rig.matrix_world @ b.head_local; t = rig.matrix_world @ b.tail_local; d = t - h
        bpy.ops.mesh.primitive_cylinder_add(radius=H * 0.006, depth=d.length, location=(h + t) / 2)
        c = bpy.context.active_object; c.rotation_mode = 'QUATERNION'; c.rotation_quaternion = d.to_track_quat('Z', 'Y')
        c.data.materials.append(mat); c.show_in_front = True; sticks.append(c)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=H * 0.011, location=h); j = bpy.context.active_object; j.data.materials.append(mat); sticks.append(j)
    sc.display.shading.color_type = 'MATERIAL'
    ob.hide_render = True
    shot('esqueleto.png', (0, -4, H / 2), (math.radians(90), 0, 0))
    ob.hide_render = False
    for c in sticks: c.hide_render = True
    sc.display.shading.color_type = 'TEXTURE'
    shot('frente.png', (0, -4, H / 2), (math.radians(90), 0, 0))
    shot('lado.png', (4, 0, H / 2), (math.radians(90), 0, math.radians(90)))
    # pose de prueba: brazos arriba, una rodilla doblada, cabeza girada
    bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='POSE')
    def rot(n, axis, deg):
        pb = rig.pose.bones[n]; pb.rotation_mode = 'XYZ'; e = list(pb.rotation_euler); e['XYZ'.index(axis)] = math.radians(deg); pb.rotation_euler = e
    rot('leftUpperArm', 'Z', 0); rot('leftLowerArm', 'X', -70); rot('rightUpperArm', 'X', 60)
    rot('leftUpperLeg', 'X', 60); rot('leftLowerLeg', 'X', -90); rot('head', 'Y', 25); rot('spine', 'X', 12)
    bpy.ops.object.mode_set(mode='OBJECT')
    shot('pose.png', (2.6, -3.2, H / 2), (math.radians(90), 0, math.radians(39)))
    bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='POSE')
    for pb in rig.pose.bones: pb.rotation_euler = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0)
    bpy.ops.object.mode_set(mode='OBJECT')
    # lo de las imágenes no va en el archivo
    for c in sticks + [cam]: bpy.data.objects.remove(c, do_unlink=True)

M_H = [1.62]
def main():
    o = args(); M_H[0] = o['alto']
    reset(); load(o['inp'])
    ob = body_mesh()
    lighten(ob, o['caras'])
    normalize(ob, o['alto'])
    px = proxy(ob, o['alto'])
    M = measure(px, o['alto'])
    bpy.data.objects.remove(px, do_unlink=True)
    print(json.dumps({k: (round(v, 3) if isinstance(v, float) else str(v)) for k, v in M.items() if k != 'cy'}, ensure_ascii=False))
    rig = build_rig(ob, M)
    skin(ob, rig)
    to_tpose(ob, rig)
    if o['prev']: preview(ob, rig, o['prev'])
    export(o['out'])
    print('Listo:', o['out'])

if __name__ == '__main__':
    main()
