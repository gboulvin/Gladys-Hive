# Hive

Controle sus dispositivos **Hive** (Centrica / British Gas) desde Gladys
Assistant: calefacción, agua caliente, válvulas termostáticas, luces,
enchufes, sensores de movimiento y de puertas/ventanas, además de las
automatizaciones («acciones») de la aplicación Hive.

Es una integración **en la nube**: Gladys se comunica con la nube de Hive, la
misma que usa la aplicación Hive, y necesita conexión a Internet.

## Dispositivos compatibles

| Producto Hive                                  | En Gladys                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| Active Heating (termostato)                    | Termostato: temperatura, consigna, modo, calefacción, batería      |
| Zona de válvulas termostáticas (TRV)           | Termostato: temperatura, consigna, modo, calefacción, batería      |
| Agua caliente                                  | Calentador: modo (programa / encendido / apagado), boost, calienta |
| Active Light (blanco cálido, regulable, color) | Luz: encendido/apagado, brillo, tono de blanco, color              |
| Active Plug                                    | Enchufe: encendido/apagado, potencia (W)                           |
| Sensor de movimiento                           | Movimiento, temperatura, batería                                   |
| Sensor de puerta / ventana                     | Apertura, batería                                                  |
| Acciones Hive (automatizaciones)               | Un interruptor para activar o desactivar cada acción               |

Modos del termostato: **Programa** (sigue el programa de Hive), **Manual**
(mantiene la consigna) y **Apagado** (antiheladas). Fijar una temperatura con
la calefacción apagada la pasa a Manual.

## Configuración

1. Abra la pestaña **Configuración** de la integración.
2. Introduzca el **correo electrónico** y la **contraseña** de su cuenta Hive
   y guarde.
3. Hive suele confirmar un nuevo inicio de sesión con un **código enviado por
   SMS**. El estado de conexión lo indica: escriba el código en el campo
   **Código SMS** y guarde **en menos de 3 minutos**.
4. Gladys pasa a ser un _dispositivo recordado_ de su cuenta Hive (aparece
   como «Gladys Assistant» en la lista de dispositivos de la cuenta): los
   siguientes inicios de sesión ya no piden código, incluso tras un reinicio.
5. Sus dispositivos aparecen en la pestaña **Descubrimiento**, listos para
   añadirse.

Otros ajustes:

- **Intervalo de actualización** (60 s por defecto, 30 s como mínimo):
  frecuencia de lectura de la nube Hive. Los sensores se ven con este retraso:
  Hive no envía sus eventos a terceros.
- **Duración / temperatura del boost por defecto**: usadas por el boost del
  agua caliente, los botones de los widgets y las acciones de escena vacías.
- **Umbral de batería baja**: nivel por debajo del cual se dispara el
  activador «Batería Hive baja».

### Botones

- **Probar la conexión** — vuelve a iniciar sesión (puede enviar un nuevo
  código SMS) y cuenta los dispositivos.
- **Actualizar los dispositivos Hive** — vuelve a leer el hogar, por ejemplo
  tras añadir una bombilla en la aplicación Hive.
- **Olvidar la sesión de Hive** — olvida el dispositivo recordado y la sesión:
  el próximo inicio de sesión pedirá un nuevo código SMS.

## Escenas

La integración añade sus propias tarjetas al editor de escenas (Gladys 5.1 o
posterior).

Activadores: **Movimiento detectado (Hive)**, **Puerta o ventana (Hive)**
(abierta / cerrada), **Fin del boost Hive**, **Dispositivo Hive en línea /
sin conexión**, **Batería Hive baja** (`{{triggerEvent.data.battery}}`). El
nombre del dispositivo está en `{{triggerEvent.data.device_name}}`.

Acciones: **Activar boost de calefacción Hive** (zona, duración, temperatura)
y cancelarlo, **Activar boost de agua caliente Hive** (duración) y
cancelarlo, **Cambiar el modo de calefacción Hive** (programa, manual con
temperatura, apagado), **Cambiar el modo de agua caliente Hive** (programa,
siempre encendida, apagada). Una zona vacía designa la primera del hogar.
Cada acción indica si ha funcionado.

## Panel

- Widget **Calefacción Hive**: temperatura y consigna en vivo de una zona,
  modo, tiempo de boost restante, actividad de la caldera, batería, con los
  botones **Boost** / **Cancelar boost** / **Volver al programa**.
- Widget **Hogar Hive**: conexión, agua caliente, luces encendidas, puertas y
  ventanas abiertas, dispositivos desconectados y baterías bajas, con un botón
  de boost del agua caliente.

## Solución de problemas

- **«Hive ha rechazado el correo electrónico o la contraseña»**: compruébelos
  en la aplicación Hive.
- **«Código SMS incorrecto»** / **«El código SMS ha caducado»**: use **Probar
  la conexión** para recibir un nuevo código.
- **Un dispositivo aparece «inaccesible»**: Hive lo indica sin conexión.

La sesión (dispositivo recordado, token de renovación) se guarda en el volumen
privado `/data` de la integración, nunca la contraseña.
