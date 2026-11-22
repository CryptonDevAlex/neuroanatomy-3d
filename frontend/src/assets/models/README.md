# Directorio de Modelos 3D (GLTF / GLB)

## Capa nerviosa realista

`nervous_z_anatomy.glb` contiene el sistema nervioso y los órganos de los sentidos de Z-Anatomy (583 mallas), derivado de BodyParts3D.

- Fuente: https://github.com/Liyucheng1997/242_lab-human-anatomy/blob/main/public/models/nervous.glb
- Licencia de la malla: CC BY-SA 4.0 (http://creativecommons.org/licenses/by-sa/4.0/)
- Crédito mostrado en la interfaz: Z-Anatomy / BodyParts3D · CC BY-SA 4.0
- Compresión: `KHR_draco_mesh_compression`; el visor usa los decodificadores locales de `src/assets/draco/`.

Si este archivo falla, el visor mantiene como fallback las capas originales `nerves.glb` y `brain.glb`.

## Otros modelos

Los demás GLB (`skeleton.glb`, `muscles.glb`, `organs.glb`, etc.) se cargan desde el visor y se alinean con la caja delimitadora maestra calculada a partir de `skeleton.glb`.
