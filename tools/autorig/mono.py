"""Separa el moño del cuerpo en su propia malla 'mono' (se esconde con otro peinado).
  python3 mono.py cuerpo.glb salida.glb alto_coronilla"""
import sys, bpy, bmesh
sys.path.insert(0, __import__('os').path.dirname(__file__))
import piezas as P
src, dst, zc = sys.argv[-3], sys.argv[-2], float(sys.argv[-1])
P.CORONILLA[0] = zc
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
body = [o for o in bpy.data.objects if o.type == 'MESH'][0]
R = P.body_regions(body)
hmn, hmx = P.head_box(R)
real = max(p.z for p in R['head'])
if real - hmx.z < 0.01: print('Sin moño'); sys.exit(0)
mw = body.matrix_world
bpy.context.view_layer.objects.active = body
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.object.mode_set(mode='OBJECT')
n = 0
for v in body.data.vertices:
    p = mw @ v.co
    back = p.y > (hmn.y + hmx.y) / 2 + (hmx.y - hmn.y) * 0.2 and p.z > hmx.z - 0.045
    if (p.z > hmx.z - 0.004 or back) and abs(p.x - (hmn.x + hmx.x) / 2) < (hmx.x - hmn.x) * 0.32: v.select = True; n += 1
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.separate(type='SELECTED'); bpy.ops.object.mode_set(mode='OBJECT')
mono = [o for o in bpy.data.objects if o.type == 'MESH' and o is not body][0]; mono.name = 'mono'; mono.data.name = 'mono'
print('Moño separado:', n, 'vértices')
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.data.objects:
    if o.type in ('MESH', 'ARMATURE'): o.select_set(True)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', use_selection=True, export_skins=True, export_animations=False, export_yup=True)
