# Rutinas de mantenimiento PWA

Aplicación estática en HTML, CSS y JavaScript, preparada para GitHub Pages. Los operadores abren una rutina específica con QR y el personal autorizado la administra desde computadora o teléfono.

## Modelo de datos

- `machines/{id}`: nombre, planta, departamento, número de activo y descripción.
- `machines/{id}/images/cover`: foto de portada de la máquina, opcional y limitada a 180 KB.
- `machines/{id}/routines/{id}`: actividad, frecuencia, material, EPP, residuos y orden.
- `machines/{id}/routines/{id}/images/reference`: foto binaria WebP (máximo 180 KB).
- `usuarios/{uid}`: usuario existente con `rol: "admin"` y `estatus: "activo"` autoriza el acceso administrativo.

Las imágenes se convierten en el navegador a WebP y se rechazan si no pueden reducirse a 180 KB. El binario se guarda en un documento separado para que el texto de cada rutina sea ligero.

## Configurar Firebase

1. En Firebase Console, habilita **Authentication > Correo electrónico/contraseña**.
2. Crea desde Firebase Console la cuenta de cada administrador.
3. Crea Cloud Firestore en modo producción.
4. Copia `firestore.rules` en **Firestore Database > Rules** y publícalas.
5. El documento existente en Firestore debe usar como ID el UID de la cuenta de **Authentication > Users** y contener `rol: "admin"` y `estatus: "activo"`. La PWA utiliza la colección existente `usuarios`.
6. En Authentication > Settings > Authorized domains agrega `TU_USUARIO.github.io`.

No uses Firebase Storage: la aplicación solo usa Authentication y Firestore.

## Publicar en GitHub Pages

1. Sube esta carpeta a un repositorio GitHub separado, por ejemplo `rutinas-mantenimiento`.
2. En GitHub abre **Settings > Pages**, elige **Deploy from a branch**, selecciona `main` y la carpeta raíz.
3. Cuando esté publicada, entra a `https://TU_USUARIO.github.io/rutinas-mantenimiento/#/admin`, inicia sesión y da de alta las máquinas.
4. En cada máquina, presiona **QR** e imprime el código generado.

La app utiliza rutas con `#`, por lo que los QR funcionan correctamente en GitHub Pages sin reglas especiales de redirección.

## Manejo de versiones

La versión se define una sola vez en `js/version.js`. En cada actualización incrementa `APP_VERSION`; la pantalla de acceso, el menú lateral y el service worker usarán automáticamente el mismo valor y crearán una caché nueva.

## Prueba local

No abras `index.html` directamente. Levanta un servidor estático en esta carpeta, por ejemplo:

```powershell
npx serve .
```

Luego visita la URL que indique el comando.
