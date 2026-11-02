
# Contador de Efectivo CUP

Aplicación de Nova Apps para contar, registrar y administrar efectivo en pesos cubanos (CUP).

## 1. Características

- Conteo de efectivo por denominaciones.
- Cálculo automático de subtotales y total general.
- Denominaciones personalizadas.
- Historial de conteos.
- Borradores para continuar conteos posteriormente.
- Deshacer y rehacer operaciones.
- Comparación de registros.
- Recibos de conteos.
- Estadísticas e informes.
- Exportación de información a CSV.
- Registro de movimientos de caja.
- Control del saldo inicial y saldo calculado.
- Registro de máquinas contadoras, detectoras y clasificadoras.
- Configuración de preferencias.
- Copias de seguridad e importación de datos.
- Funcionamiento local sin conexión después de la primera carga correcta.
- Interfaz adaptable a dispositivos móviles y computadoras.
- Acceso a la página principal de Nova Apps.

## 2. Requisitos

- Navegador moderno compatible con módulos JavaScript.
- JavaScript habilitado.
- Almacenamiento local disponible.
- HTTPS para las funciones del navegador que lo requieran, como determinadas conexiones Bluetooth.

Para probar la aplicación localmente, utiliza un servidor web local. Abrir directamente `index.html` mediante `file://` puede impedir que funcionen los módulos JavaScript y el service worker.

## 3. Estructura del proyecto

```text
Contador-CUP/
├── index.html
├── manifest.webmanifest
├── sw.js
├── icon.png
├── assets/
│   ├── icons/
│   │   ├── icon.png
│   │   ├── icon-192.png
│   │   ├── icon-512.png
│   │   ├── icon-maskable-192.png
│   │   └── icon-maskable-512.png
│   └── css/
│       ├── variables.css
│       ├── base.css
│       ├── layout.css
│       ├── components.css
│       └── responsive.css
├── js/
│   ├── app.js
│   ├── config.js
│   ├── state.js
│   ├── storage.js
│   ├── utils.js
│   ├── navigation.js
│   ├── counter/
│   ├── history/
│   ├── reports/
│   ├── cash/
│   ├── machines/
│   ├── backup/
│   └── settings/
└── docs/
    └── MANUAL.md
```

Los iconos del proyecto utilizarán exclusivamente el formato PNG.

## 4. Instalación

1. Publica el proyecto en un servidor compatible con HTTPS.
2. Abre la dirección de la aplicación desde el navegador.
3. Espera a que termine la primera carga.
4. Utiliza la opción de instalar o añadir a la pantalla de inicio cuando esté disponible.

## 5. Funcionamiento sin conexión

La aplicación utiliza un service worker para almacenar los recursos necesarios y permitir su funcionamiento sin conexión después de una primera carga correcta.

Las funciones que dependan de servicios externos o conexiones con otros dispositivos pueden requerir Internet o permisos adicionales del navegador.

## 6. Almacenamiento y seguridad

Los datos locales se guardan en el almacenamiento del navegador. Se recomienda realizar copias de seguridad periódicas desde las opciones de la aplicación.

Borrar los datos del navegador puede eliminar información que no tenga una copia de seguridad.

## 7. Iconos

Todos los iconos e imágenes de la aplicación deben estar en formato PNG. No se deben incorporar archivos SVG ni referencias a ese formato en el código, el manifiesto o la documentación.

Los archivos PNG deben conservar el diseño original de los iconos del proyecto.
