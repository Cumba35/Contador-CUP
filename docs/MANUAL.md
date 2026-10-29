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
├── icon.svg
├── assets/
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