# Aviso de licencia — LiquidClass

`liquidClass.js` proviene de
[KaliforniaGator/LiquidClass](https://github.com/KaliforniaGator/LiquidClass)
y está publicado bajo **GNU AGPL-3.0**.

## Qué implica para este proyecto

La AGPL-3.0 tiene una cláusula de red (sección 13): si distribuyes el software
**o lo ofreces como servicio a través de la red**, debes poner el código fuente
completo de la obra combinada a disposición de quien la use, bajo la misma
licencia. Un teleprompter web desplegado en un dominio público entra de lleno en
ese supuesto.

## Opciones

1. **Publicar el repo bajo AGPL-3.0.** Cumples y no tocas nada.
2. **Pedir al autor una licencia alternativa** (dual licensing).
3. **Quitar la dependencia.** El proyecto ya funciona sin ella: la clase CSS
   `.liquid` en `src/styles/global.css` reproduce el glass con
   `backdrop-filter` + sombras internas, sin refracción por displacement map.
   Para desactivar la librería: pon `enabled: false` al llamar a
   `initLiquidGlass()` en `src/lib/liquid-glass/init.ts`, o simplemente no la
   importes. Ningún componente depende de que exista.

El resto del código de este repositorio es propio y no deriva de LiquidClass.
