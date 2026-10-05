# Tienda corporativa Prestige Auto — versión 2 (Netlify)

## Novedades
- **Fotos rápidas:** se suben desde el panel (Productos → Editar → Subir foto). Se achican solas (miniatura ~15 KB y foto grande ~40 KB), se guardan en la base y se sirven con caché de 1 año. Ya no hace falta pasar por GitHub ni gastar deploys.
- **Diseño nuevo** de la tienda: portada con imagen, aviso destacado, productos destacados, ficha de producto, barra de carrito en el celular.
- **Panel de gestión nuevo** (funciona igual en celular): Resumen, Pedidos, Productos, Contenido y Ajustes.
- **Editable desde el panel:** términos y condiciones (con versión por pedido), imagen de portada, título, logo, aviso, abrir/cerrar la tienda, clave de acceso.
- **Dos monedas:** cada producto puede ser en pesos o dólares; los totales se muestran separados.

## Cómo actualizar el sitio que ya tenés publicado
1. Descomprimí el zip (Extraer todo).
2. En tu repositorio de GitHub: *Add file → Upload files* y arrastrá **las carpetas `public` y `netlify`** (las carpetas, no sus archivos). Se reemplazan los archivos con el mismo nombre y se agregan los nuevos. Commit.
3. Netlify despliega solo. En el log del deploy tienen que aparecer las migraciones (`Loading migrations`). Tus productos, pedidos y clave de acceso se conservan.
4. Podés borrar de GitHub el archivo `public/config.js`: ya no se usa (los términos ahora se editan en Gestión → Contenido).

## Uso
- **Productos:** Excel (plantilla con Código SAP, Nombre, Categoría, Descripción, Precio, Moneda, Imagen, Activo) o uno por uno. Al reimportar, si dejás la Imagen o la Moneda vacías se conservan las que ya tenía el producto.
- **Pedidos:** Resumen → «Descargar Excel SAP» baja todos los nuevos en el formato de carga y los marca como exportados. En Pedidos podés buscar, seleccionar, cancelar y volver a exportar.
- **Contenido:** portada, logo, aviso y términos y condiciones.
- **Ajustes:** abrir/cerrar la tienda, clave de acceso, respaldo de pedidos, plantilla.

## Formato del Excel para SAP
`public/admin/sap.js` (Solicitante 500007, Tipo Doc. 96, Cód. Postal 1605, Ciudad Munro y orden de columnas).

## Seguridad y datos
- Precios y monedas se toman siempre de la base. Las fotos solo aceptan JPG/PNG/WebP verificados.
- El panel exige sesión de administrador validada en el servidor; los intentos fallidos se limitan.
- Se guardan nombre, legajo, DNI, mail y teléfono: validar con RRHH/Legales.
