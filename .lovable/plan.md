# Rediseño visual — plataforma CEDIM IPS

Objetivo: que todas las ventanas se vean **iguales a las capturas oficiales** que enviaste. Solo es trabajo **visual/maquetado**; la lógica real (consultas, guardados, IA, permisos) se mantiene intacta. Los números que hoy salen en cero seguirán saliendo en cero hasta conectar datos.

## 1. Encabezado compartido (afecta a todas las ventanas)

Crear un componente de encabezado reutilizable que toda página use, igual a las capturas:

- **Izquierda:** saludo dinámico "Buenas tardes, OSCAR 👋" (Buenos días / Buenas tardes / Buenas noches según la hora, con el nombre real del usuario).
- **Centro:** título grande en mayúsculas + subtítulo azul (ej. "DASHBOARD GENERAL" / "Panel Inteligente de Coordinación"). Cada página define su título y subtítulo.
- **Derecha:** insignia de turno "TARDE · 01/06 13:00 – 01/06 19:00" (calculada por hora: MAÑANA/TARDE/NOCHE), botón de tema (☾) y botón "✕ Cerrar sesión".
- Mover "Cerrar sesión" a esta barra superior; en el sidebar se conserva el bloque de perfil del usuario.
- Fondo de página con degradado azul claro como en las capturas.

## 2. Estilo de tarjetas (sistema de diseño)

- Tarjetas blancas redondeadas con **borde superior de color** (azul, verde, rojo, ámbar, teal).
- Título pequeño en mayúsculas centrado, número grande en color, leyenda pequeña debajo.
- Filas horizontales de tarjetas de estado (scroll en pantallas chicas).
- Barras de búsqueda, dropdowns y botones ("+ Nuevo", "Refrescar", "Excel", "PDF") con el mismo estilo redondeado de las capturas.
- Pestañas (tabs) con subrayado azul activo.

Estos estilos se definen como tokens/clases en `src/styles.css` y un par de componentes auxiliares (tarjeta de estadística, sección) para reutilizar.

## 3. Rediseño por ventana

```text
Dashboard General   → fila de 8 tarjetas "Referencias salientes" + bloque
                      "Referencias entrantes" (6 tarjetas de colores) +
                      paneles Avisos / Pendientes de notificación +
                      Indicadores rápidos / Alertas de coordinación.
Historial de Casos  → filtros de fecha (Todos/Hoy/Semana/Mes…), selector
                      entrantes/salientes, buscador, dropdowns tipo/estado,
                      botones Excel/Actualizar, tarjetas de caso con badges.
Dashboard Operativo → bloque Entrega de turno + Exportaciones, banda Avisos
(Bitácora salientes)  operativos, fila de 8 tarjetas, tabs + filtros + tabla.
Red / Disponibilidad→ buscador + filtro "Todos", estado vacío con ícono.
Registrar Caso      → asistente de 3 pasos (Identificación/Datos/Tipo),
                      campos, zona de carga de archivos.
Seguimientos        → 5 tarjetas resumen + buscador/filtros + tarjeta de
                      seguimiento con acciones + Alertas de coordinación.
Plantillas          → buscador + filtros + botón "+ Nueva plantilla".
Indicadores         → 5 tarjetas semáforo + buscador + "+ Nuevo indicador".
Reglas Operativas   → 4 tarjetas resumen + Avisos activos + lista de reglas
                      con toggle, badges de módulo/severidad y acciones.
Catálogo / Históricos / Control de Mando / Usuarios → mismo encabezado y
                      estilo de tarjetas/tablas para que combinen.
```

## 4. Orden de trabajo

1. Encabezado compartido + tokens/estilos de tarjeta.
2. Dashboard General (la más visible).
3. Resto de ventanas una por una con el mismo patrón.

## Notas técnicas
- No se toca la autenticación, las consultas a la base de datos ni la lógica de permisos (admin/operativa).
- Reutilizo los datos que ya consulta cada página; solo cambia la presentación.
- Login ya quedó alineado en pasos previos.

¿Le doy luz verde a este plan y empiezo por el encabezado compartido + Dashboard General, o ajustamos algo antes?
