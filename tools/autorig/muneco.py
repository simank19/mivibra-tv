"""Muñeco MiVibra: cuerpo liso de una sola pieza (cabeza grande, cuerpo de pera, manos tipo manopla,
pies grandes), en pose T para pasarlo por autorig.py.

    python3 tools/autorig/muneco.py /tmp/muneco_t.glb
    python3 tools/autorig/autorig.py /tmp/muneco_t.glb movimiento/cuerpos/muneco.glb --alto 1.5 --caras 6000

Se modela con metaballs (se funden sin costuras), luego remallado por vóxeles y suavizado.
"""
import bpy, bmesh, sys
from mathutils import Vector

out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/muneco_t.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)

K = 0.57  # radio visible / radio del elemento
mb = bpy.data.metaballs.new('muneco'); mb.resolution = 0.006; mb.render_resolution = 0.004; mb.threshold = 0.6
ob = bpy.data.objects.new('muneco', mb); bpy.context.collection.objects.link(ob)

def cap(a, b, r, stiff=2.0):
    a, b = Vector(a), Vector(b); d = b - a
    e = mb.elements.new(); e.type = 'CAPSULE'; e.co = (a + b) / 2; e.radius = r / K; e.size_x = d.length / 2; e.stiffness = stiff
    e.rotation = Vector((1, 0, 0)).rotation_difference(d.normalized())
def taper(a, b, r0, r1, n=5, stiff=2.0):
    a, b = Vector(a), Vector(b)
    for i in range(n):
        t0, t1 = i / n, (i + 1) / n
        cap(a.lerp(b, t0), a.lerp(b, t1), r0 + (r1 - r0) * (t0 + t1) / 2, stiff)
def ell(c, rx, ry, rz, stiff=2.0):
    r = max(rx, ry, rz); e = mb.elements.new(); e.type = 'ELLIPSOID'; e.co = c; e.radius = r / K
    e.size_x, e.size_y, e.size_z = rx / r, ry / r, rz / r; e.stiffness = stiff

# Alto total 1.0 (autorig lo escala). Frente hacia -Y (convención de Blender → +Z en glTF).
# Cabeza grande (~31% del alto)
ell((0, 0, 0.835), 0.152, 0.146, 0.157, 2.2)
# Cuello corto
cap((0, 0, 0.63), (0, 0, 0.68), 0.036)
# Torso en forma de pera: hombros estrechos y caídos, barriga y cadera redondeadas
ell((0, 0, 0.43), 0.128, 0.1, 0.12)
ell((0, 0, 0.53), 0.112, 0.088, 0.1)
ell((0, 0, 0.6), 0.082, 0.066, 0.06)
# Hombros redondos que salen del torso
for s in (-1, 1):
    cap((s * 0.04, 0, 0.615), (s * 0.075, 0, 0.6), 0.036)
# Brazos en pose T (afinándose hacia la muñeca)
for s in (-1, 1):
    taper((s * 0.075, 0, 0.6), (s * 0.215, 0, 0.6), 0.032, 0.03, 4)
    taper((s * 0.215, 0, 0.6), (s * 0.335, 0, 0.6), 0.03, 0.026, 4)
    # mano tipo manopla (palma hacia abajo) y pulgar al frente
    ell((s * 0.378, 0, 0.598), 0.05, 0.04, 0.028)
    cap((s * 0.35, -0.025, 0.6), (s * 0.368, -0.05, 0.604), 0.011)
# Piernas rectas y gruesas, separadas
for s in (-1, 1):
    taper((s * 0.064, 0, 0.36), (s * 0.068, 0, 0.2), 0.046, 0.044, 3, 3.5)
    taper((s * 0.068, 0, 0.2), (s * 0.07, 0, 0.065), 0.044, 0.042, 3, 3.5)
    # pie grande redondeado, hacia adelante
    ell((s * 0.082, -0.03, 0.045), 0.056, 0.094, 0.048, 3.5)

# A malla
dg = bpy.context.evaluated_depsgraph_get()
me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
mo = bpy.data.objects.new('cuerpo', me); bpy.context.collection.objects.link(mo)
bpy.data.objects.remove(ob)
bpy.context.view_layer.objects.active = mo; mo.select_set(True)
r = mo.modifiers.new('remesh', 'REMESH'); r.mode = 'VOXEL'; r.voxel_size = 0.005
sm = mo.modifiers.new('suave', 'CORRECTIVE_SMOOTH'); sm.iterations = 8; sm.smooth_type = 'SIMPLE'
for m in list(mo.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
# Apoyado en el suelo
zmin = min(v.co.z for v in me.vertices)
for v in me.vertices: v.co.z -= zmin
for p in me.polygons: p.use_smooth = True
mat = bpy.data.materials.new('cuerpo'); mat.use_nodes = True
mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.9, 0.9, 0.88, 1)
mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.6
me.materials.append(mat)
print('caras', len(me.polygons), 'alto', max(v.co.z for v in me.vertices))
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True)
print('OK', out)
