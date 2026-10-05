# Tienda corporativa Prestige Auto — versión Netlify (gratis)

Dos páginas separadas en un mismo proyecto:
- **`/` Tienda** (empleados): clave de acceso compartida. Catálogo, carrito, datos, TyC por producto, pedido.
- **`/admin` Gestión** (solo vos): contraseña propia. Pedidos, Excel para SAP, catálogo por Excel, cambio de clave.

Tecnología: Netlify (hosting + funciones) y Netlify Database (Postgres incluido). Costo: US$0 en el plan gratuito
(300 créditos por mes; al superarlos Netlify pausa el sitio, no cobra). Verificá los límites vigentes en netlify.com.

## Consumo del plan gratuito (300 créditos/mes, tope duro)
Tarifas oficiales de Netlify (verificar en netlify.com/pricing): ancho de banda 20 créditos/GB, pedidos web 2 créditos cada 10.000,
funciones 10 créditos/GB-hora, **cada deploy de producción 15 créditos**. Al llegar a 300 el sitio se pausa hasta el mes siguiente.
- **Fotos livianas:** que cada foto pese ≤100 KB (formato WebP o JPG comprimido). Es lo que más consume.
- **Pocos deploys:** cada cambio subido a GitHub (fotos, config, logo) es un deploy. Juntá los cambios en una sola subida.
  Cargar o editar productos desde el Excel NO genera deploy.
- **Lanzamiento escalonado:** avisá por áreas en lugar de a los 2000 a la vez.
- Revisá el consumo en Netlify (Usage) la primera semana. Si se queda corto, el plan Personal ofrece más créditos.

## Qué es manual (a propósito)
- Los empleados no tienen usuario: usan una **clave compartida** (Gestión → Acceso). SAP valida legajo/DNI al cargar el Excel.
- Catálogo: se carga **desde un Excel** (Gestión → Productos → plantilla). Las fotos se copian a `public/img/`.
- Logo: subir el archivo como `public/logo.png`. Términos y condiciones: editar `public/config.js`.
- Respaldo: Gestión → Pedidos → «Respaldo de todos los pedidos» (cada tanto).

## Publicación

### 1. Subir a GitHub
Repositorio **privado**. Subí el contenido de esta carpeta de modo que en la raíz queden `public`, `netlify`,
`netlify.toml` y `package.json` (usar github.dev o GitHub Desktop; la subida por navegador aplana las carpetas).

### 2. Crear el sitio en Netlify
1. Cuenta gratuita en app.netlify.com (mail compartido del área).
2. **Add new project → Import an existing project → GitHub** → elegir el repositorio.
3. Configuración: *Build command* vacío; *Publish directory* `public` (ya viene en `netlify.toml`).
4. **Antes de desplegar**, en *Environment variables* (Site configuration) cargá, marcadas como secretas:
   - `ADMIN_PASSWORD` = tu contraseña de administrador (larga).
   - `SESSION_SECRET` = frase aleatoria de 40+ caracteres.
5. Deploy. La base de datos Postgres se crea sola en el deploy (por incluir `@netlify/database`) y la migración
   `netlify/database/migrations/…/migration.sql` crea las tablas y la clave inicial `prestige2026`.
6. En el log del deploy tienen que aparecer líneas como «Netlify Database setup completed». Si el deploy falla con
   un error `401` al crear la base (puede pasar en el primer deploy de un sitio nuevo): volvé a lanzar el deploy; si persiste,
   creá la base desde la interfaz de Netlify (sección Database del sitio) y relanzá. Si no se resuelve, hay que consultar
   a soporte de Netlify.

### 3. Primer uso
1. Entrá a `tu-sitio.netlify.app/admin` con tu contraseña.
2. **Acceso** → cambiá la clave inicial `prestige2026`.
3. **Productos** → descargá la plantilla, completala (Código SAP, Nombre, Categoría, Descripción, Precio, Imagen, Activo) y subila.
4. Hacé 2–3 pedidos de prueba, descargá el Excel y probalo en SAP.
5. Compartí link y clave con los empleados.

## Formato del Excel para SAP
`public/admin/sap.js` (Solicitante 500007, Tipo Doc. 96, Cód. Postal 1605, Ciudad Munro y orden de columnas).

## Seguridad y datos personales
- Los precios se toman siempre de la base. El panel y su API exigen sesión de administrador validada en el servidor.
- Los intentos fallidos de clave se limitan por IP.
- Se guardan nombre, legajo, DNI, mail y teléfono: validar con RRHH/Legales y borrar pedidos viejos ya cargados en SAP.
- Quien tenga la clave compartida puede pedir a nombre de otro: cambiala con frecuencia.
