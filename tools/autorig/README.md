# Esqueleto propio para los cuerpos anime

`autorig.py` toma un cuerpo (GLB de Tripo u otro), lo aligera, lo mide y le arma un esqueleto con
los nombres del estándar VRM en pose T, para que los juegos de MiVibra Movimiento lo muevan igual que
a los avatares de siempre (`movimiento/cuerpo.js` lo carga).

```sh
pip install bpy            # Blender como módulo de Python (5.x)
python3 tools/autorig/autorig.py cuerpo_tripo.glb movimiento/cuerpos/hombre.glb --alto 1.70 --prev /tmp/prev
```

- `--alto`: estatura en metros (1.70 hombre, 1.62 mujer).
- `--caras`: caras finales (26000 por defecto; el TV las mueve bien).
- `--prev`: carpeta para imágenes de control (frente, esqueleto, lado y una pose de prueba).

Sirve con pose T o pose A (la A se pasa a T). Los brazos y las piernas tienen que venir separados del cuerpo.
