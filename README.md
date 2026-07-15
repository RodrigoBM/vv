# Extensión de Chrome para grabar la pantalla

Extensión Manifest V3 que graba la pantalla del navegador (con audio del sistema y micrófono si está disponible) y permite descargar el video en formato `.webm`.

## Características

- Grabación de pantalla completa, ventana o pestaña
- Captura de audio del sistema
- Mezcla opcional con micrófono
- Temporizador en tiempo real
- Descarga del video grabado

## Instalación

1. Abre `chrome://extensions`
2. Activa el **Modo desarrollador** (esquina superior derecha)
3. Haz clic en **Cargar descomprimida**
4. Selecciona la carpeta `screen-recorder-extension`
5. Haz clic en el ícono de la extensión → **Iniciar grabación**
6. Elige la fuente (pantalla/ventana/pestaña) y comparte

## Estructura

```
screen-recorder-extension/
├── manifest.json      # Configuración MV3
├── background.js       # Service worker (desktopCapture + offscreen)
├── offscreen.html     # Documento offscreen
├── offscreen.js       # MediaRecorder (audio sistema + micrófono)
├── popup.html         # UI
├── popup.js           # Lógica del popup (timer, descarga)
└── icons/             # Íconos PNG
```

## Notas técnicas

- En Manifest V3, `MediaRecorder` no puede ejecutarse en el service worker, por eso se usa un documento **offscreen**.
- El formato de salida es `.webm` (VP9/VP8 + Opus), ya que Chrome no soporta grabar MP4 directamente mediante la API `MediaRecorder`.