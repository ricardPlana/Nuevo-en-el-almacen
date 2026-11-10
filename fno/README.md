# F&O — lo que hay que hacer en Dynamics 365 SCM

Orden recomendado. Hazlo en el Tier-1 de demo **antes** de que el código de la API llegue a la Tarea 6, así cuando el cliente F&O esté listo solo hay que apuntar la URL.

## 0. Versión y feature

- Necesitas **10.0.49 o posterior con la feature *Warehouse spatial location*** (la doc de Learn la marca como preview). Compruébalo en *Feature management* buscando "spatial".
- Si tu Tier-1 no la tiene: actualiza la VM, o pide un sandbox al partner. **Sin esto no hay ruta de F&O**, así que es lo primero del día 1 (la demo en mock sigue funcionando).
- Referencia: [spatial-location-overview](https://learn.microsoft.com/dynamics365/supply-chain/warehousing/spatial-location-overview) y [spatial-locations-setup](https://learn.microsoft.com/dynamics365/supply-chain/warehousing/spatial-locations-setup).

### Cómo decide F&O la ruta (lo que contamos en la sesión)

- Lo hace el paso de ola **Sort picking work lines**, después de crear el work. Ordena **cada work por separado** y solo las **líneas de pick anteriores al primer put**; las de después y el propio put no se mueven. Renumera las líneas, así que el orden es el de `LineNum`.
- Si el work tiene menos de 2 picks, o el put / los picks no tienen coordenadas, se salta el work y deja el orden original.
- *Fast calculation*: empieza en el put, va eligiendo la ubicación de pick más cercana sin visitar y al final invierte la lista. Resultado: el último pick es el más cercano al muelle. *Optimized route*: lo mismo y luego intenta mejorar invirtiendo tramos.
- Distancia *City Block*: `|x2−x1| + |y2−y1| + |z1| + |z2|`. La altura se suma entera en origen y destino (de nivel 2 a nivel 2 cuenta 4, no 0).
- **Cargas**: una carga tiene uno o varios works (por envío, por plantilla, por cortes). No hay "ruta de la carga": hay una ruta por work. Eso es lo que devuelve `getLoadRoutes`.

## 1. Datos de demo (USMF, almacén 24)

1. *Warehouse management > Setup > Warehouse > Warehouses* → almacén **24**, FastTab *Warehouse*, sección *Warehouse coordinates configuration*: *Distance calculation strategy* = **City Block**, *Coordinate retrieval strategy* = **Location coordinates**, *Location sorting algorithm* = **Fast calculation**.
2. *Warehouse management > Setup > Warehouse > Locations*: crea en el 24 las ubicaciones de la demo **con los mismos IDs del mock** (C-08-0, A-08-2, B-06-0, A-05-1, A-02-0, B-08-1, B-02-0 y DOCK-01), rellena **X coordinate / Y coordinate / Z coordinate** y pon stock en ellas (diario de movimientos o recuento). Con los mismos IDs, el layout 3D puede seguir saliendo del mock y solo la ruta viene de F&O. Coordenadas del mock `swa/public/mock/layout-24.json`: pasillos A/B/C en X = 6/12/18, racks 1–8 en Y = 4 + (rack−1)·2,5, Z = nivel. DOCK-01 en (4, −2, 0).
3. *Warehouse management > Setup > Waves > Wave templates* → plantilla de envío del 24 → *Methods*: añade **Sort picking work lines** después de crear el work y antes de liberar.
4. Crea los pedidos de venta, libera al almacén y procesa la ola. En *Work details* comprueba dos cosas:
   - Que el work sale como **Pick, Pick, …, Put** (todos los picks antes del put). Si sale Pick/Put/Pick/Put, F&O no tiene nada que ordenar: revisa el work template.
   - Que los picks han quedado reordenados (`LineNum`). Apunta los IDs reales de work y carga en `docs/demo-runbook.md`.
5. **Caso raro de la demo**: un pedido con los artículos en C-08-0, A-08-2, B-06-0, A-05-1 y A-02-0, con put en DOCK-01. Con *Fast calculation* el mock predice A-08-2 → C-08-0 → B-06-0 → A-05-1 → A-02-0 (sin contar la altura, A-08-2 iría la tercera). **Si F&O da otro orden, manda F&O**: se cambia el mock y el guion, no el código.

## 2. Microsoft Entra application (acceso de la API)

*System administration > Setup > Microsoft Entra applications* → Client Id de `wh3d-app` (la misma app de todo el proyecto, ver `infra/entra-apps.md`), usuario `WH3DSVC` con rol Warehouse manager (o rol custom con lectura de las entidades que lista `docs/architecture.md`). Comprueba con Postman: token client credentials y `GET {FNO}/data/Warehouses?$top=1`.

## 3. Custom service X++ (`WHS3DRouteService.xpp`)

> **Opcional, no hace falta para la demo.** La API lee F&O solo por OData estándar (`WarehouseWorkLines`, `ProjInventoryOnHand`, `WarehouseLocations`…) y no llama a este service. Queda como esqueleto por si algún día se quiere que F&O devuelva la ruta ya montada. En el modelo basta con las dos extensiones de form (secciones 4 y 4b).

Modelo propio `WH3D` en un package nuevo (*Create new package*: extensiones, sin overlayering), layer **VAR**. Referencias:

- **ApplicationSuite:** tablas y enums WHS (`WHSWorkTable`, `WHSWorkLine`, `WHSWorkType`…), `WMSLocation`, `InventTable` y los forms `WHSWorkTable` e `InventLocation` que se extienden.
- **ApplicationPlatform:** `xUserInfo`, `curUserId()`, `DataContract`/`DataMember` y los controles de form.
- **Directory:** lo exige la extensión del form `InventLocation`, cuyo datasource `LogisticsEntityPostalAddressView` usa `LogisticsPostalAddressView` y el enum `LogisticsLocationEntityType` de ese package. Sin él: *refers to a nonexistent table or view named 'LogisticsPostalAddressView'*.
- **ApplicationFoundation:** atributos de custom service (`AifCollectionTypeAttribute`). Lo pide el compilador aunque ApplicationSuite ya dependa de él.

Nada más: si al compilar falta un tipo, añade el package que indique el error. Contiene:

- `WHS3DRouteContract`, `WHS3DRouteLineContract`, `WHS3DPutContract` (data contracts con `[DataMember]`, nombres de miembro iguales al `Route` del OpenAPI, en camelCase vía `DataMemberAttribute("workId")`).
- `WHS3DRouteService` con `getRoute(str _workId)`, `getLoadRoutes(str _loadId)` y, opcional, `getLayout(str _warehouseId)` (si no da tiempo, el layout sale del mock).
- Service `WHS3DRouteService` + Service group `WHS3DServiceGroup` (AutoDeploy = Yes).
- Privilegio `WHS3DRouteServiceRead` con los operations del service, añadido a un duty y al rol de `WH3DSVC`.

Endpoint resultante: `POST {FNO}/api/services/WHS3DServiceGroup/WHS3DRouteService/getRoute` body `{ "_workId": "W-1203" }`.

> ⚠ Los nombres de los campos XYZ en `WMSLocation` y de los parámetros de estrategia/algoritmo en `InventLocation` (o la tabla de parámetros de la feature) **hay que comprobarlos en tu versión** con el AOT; el `.xpp` del pack los deja marcados con `// TODO`. Es media hora de Visual Studio.

## 4. Ruta 3D desde *Trabajo* (`WHSWorkTable`)

El form de trabajo es lista arriba + líneas abajo; el hueco de abajo es bajo (~380 px) para el 3D. Por eso la opción buena es un botón:

**A. Botón "Ruta 3D" con diálogo encima (`WHS3DWorkRouteDialog.xpp`, recomendado).** Form `WHS3DWorkRoute` con patrón *Dialog - Read Only*, `Style = Dialog` y **`Dialog Size = Full`** (casi todo el ancho del navegador), un `WebsiteHostControl` `WH3DWebsite` con ancho y alto `SizeToAvailable` y un botón *Cerrar*. Display menu item `WHS3DWorkRoute` y, en la extensión de `WHSWorkTable`, un *Menu Item Button* en el Action Pane con `Data Source = WHSWorkTable` y `Needs Record = Yes`. El form toma el work de `args().record()` y monta el mismo URL que la pestaña. Al cerrar, vuelves al trabajo tal como estaba.

**B. Pestaña en el form (`WHS3DWorkTable_Extension.xpp`, opcional).** TabPage "Ruta 3D" junto a *Lines* con un `WebsiteHostControl` que sigue al work seleccionado (event handler de `Activated`). El work va **detrás de `#`**: al pasar a otro work del mismo almacén solo cambia el fragmento, el iframe no se recarga y la SPA pide solo la ruta. Otro almacén → recarga entera; mismo URL (guardar, refrescar) → no se toca.

URL en los dos casos: `https://<swa>/?warehouseId=<InventLocationId>&company=<DataAreaId>&upn=<usuario>&present=1#workId=<WorkId>`. La SPA sigue aceptando `?workId=` (pestaña nueva, Teams, enlaces del agente).

## 4b. Vista de almacén en *Almacenes* (`WHS3DInventLocation_Extension.xpp`)

Misma idea en el form `InventLocation` (*Gestión de almacenes > Configurar > Almacén > Almacenes*): pestaña "Almacén 3D" con un `WebsiteHostControl` (`WH3DWebsite`) y URL `https://<swa>/?warehouseId=<InventLocationId>&upn=<usuario>&present=1`, recalculada en `activated()` del datasource. La SPA abre la **vista de almacén**: cajas con altura y color según el stock disponible (relativo a la ubicación más llena), huecos vacíos en fantasma, insignia roja con los picks pendientes y ficha por ubicación con contenido, matrícula y works abiertos ("Ver ruta" salta a la ruta).

Datos (OData, sin X++ de lectura): `ProjInventoryOnHand` (disponible físico por ubicación y matrícula; si hay reservas la ubicación parece más vacía) y `WarehouseWorkLines` Pick abiertas. Los perfiles de ubicación no tienen capacidad (volumen 0), por eso la ocupación es relativa y no un %.

## 4c. Plano de la nave: medidas y zonas

Con esto el 3D pinta la nave real y coloca las ubicaciones aunque no tengan coordenadas XYZ.

- **Medidas** en el almacén (extensión de `InventLocation` y de la entidad `Warehouses`): `D365_Largo`, `D365_Ancho`, `D365_AlturaLibre`, `D365_AlturaEstanterias`, `D365_Superficie`.
- **Zonas**: tabla `D365_InventLocationZones` (índice único `InventLocationId + Number`, *Delete action* en cascada desde el almacén) y entidad pública `InventLocationZones` con `WarehouseId`, `ZoneNumber`, `ZoneName`, `Length`, `Width`, `Area` y **`Function`** (la API también acepta `ZoneFunction`).
- **Función de la zona**: enum `D365_WarehouseZoneFunction` con los valores (nombre del símbolo, que es lo que lee la API) `Receiving`, `PutAway`, `Storage`, `Consolidation`, `Shipping`. Si una zona no lo tiene, la API lo deduce del nombre ("recepción", "put", "stock", "consolidación", "expedición") y, si no, del orden.
- En el form *Almacenes*: grupo con las medidas y grid de zonas (data source con JoinSource `InventLocation`, LinkType `Delayed`, Insert If Empty = No; **el grid con Data Source = `D365_InventLocationZones`**). `Number` se asigna en el `InitValue` del data source y en el `insert()` de la tabla.

Cómo coloca la API cada ubicación (`api/Data/AutoLayout.cs`):

| Ubicación | Dónde va |
|---|---|
| Con coordenadas XYZ (muelles, staging) | En sus coordenadas |
| Con coordenadas XYZ (almacenaje) | **X = cara de picking** (el borde del pasillo por donde se coge); la estantería queda detrás. Dos filas a ≤ 2,6 m y solapadas en Y son una estantería de doble fondo: la de la izquierda se coge desde el pasillo de su izquierda y la otra desde el de su derecha. Los pasillos salen entre bloques y se numeran 1, 2… de izquierda a derecha. Nivel = orden de la Z en la fila (la Z puede ir en metros). |
| Tipo de expedición final (parámetros WHS) o nombre tipo `Out_`/`BAYDOOR` | Contra la pared de la zona *Shipping* |
| Recepción (`RECV`, `In_`…) | Contra la pared de la zona *Receiving* |
| Tipos de staging y packing (parámetros WHS) | Zonas pintadas en *Consolidation* |
| Perfil de ubicación de usuario (parámetros WHS) | No se pinta |
| El resto | Pasillos de doble cara en *Storage*: un pasillo de F&O (`WarehouseAisles`, orden por `AisleNumber`) = un pasillo; rack impar a la izquierda y par a la derecha, posición `ceil(rack/2)`; estante = nivel; hueco = posición dentro del rack. Sin estructura (rack 0), se agrupan por zona de WHS. |

**Medidas de cada hueco**: las del perfil de ubicación (`WarehouseLocationProfiles`: `ActualLocationHeight`, `ActualLocationWidth`, `ActualLocationDepth`). Alto = altura del nivel; ancho = a lo largo del pasillo; fondo = hacia dentro de la estantería. Cada ubicación empieza donde acaban las de debajo en su columna (orden por `level`/estante si está relleno en toda la fila; si no, por Z), así un rack puede tener niveles de cajas de 0,6 m y de palés de 1,6–2,2 m. Si algún perfil de la columna no tiene altura, esa columna usa `D365_AlturaEstanterias` / nº de niveles (entre 1 y 3 m; sin altura de estanterías, 1,2 m).

Campos de estructura: la entidad publica los de `WMSLocation` con otro nombre: `aisleId` → `WarehouseAisleId`, `rack` → `RackId`, `level` → `ShelfId`, `position` → `BinId`, `zoneId` → `WarehouseZoneId`. Con XYZ, si todas las caras que dan a un pasillo comparten `aisleId`, el pasillo se rotula con él («Pasillo 02»); si no, 1, 2…

**Ubicación de inicio** (de dónde sale el picker en la ruta): campo `D365_UbicacionInicio` en la extensión de `InventLocation`, EDT `WMSLocationId`, con relación a `WMSLocation` (`InventLocationId` = `InventLocationId`, `wMSLocationId` = `D365_UbicacionInicio`) para que el lookup solo enseñe ubicaciones de ese almacén. Va al grupo de medidas del form y a la extensión de la entidad `Warehouses` (campo + staging; build, sync y *Refresh entity list*). Si el entorno no lo tiene, la API sigue igual (sin tramo de salida). F&O no lo usa al ordenar: el 3D dibuja el tramo hasta el primer pick y la explicación lo dice aparte.

**Muelle/staging sin coordenadas**: el 3D lo coloca en su zona, pero el *Sort picking work lines* de F&O mide desde el put; con el put en (0, 0) ordena como si estuviera en la esquina. Ponle en F&O las coordenadas que le da el plano (ficha de la ubicación en el 3D).

Para probar sin datos propios: almacenes **22** y **23** de usmf (6 pasillos × 15 racks × 3 estantes, más `In_01…05` y `Out_01…05`); basta con rellenar sus medidas y zonas.

## 4d. Vista 3D V2 (parámetro)

Una sola SWA con dos aspectos: la V1 (la de siempre) en la raíz y la **V2** en `/v2/`: luz de estudio, sombras suaves (se quitan solas si el equipo baja de FPS), cajas con textura de cartón, palés de madera, entrada de cámara y el operario que rebota al andar. Mismos datos y misma API; el código de la V2 va en un fichero aparte que la V1 no descarga.

- Parámetro **Vista 3D V2** (`D365_WH3DVistaV2`, NoYes) en *Parámetros de gestión de almacenes* (`WHSParameters`, por empresa).
- Clase `WHS3DUrl::baseUrl()` (`WHS3DUrl.xpp`): devuelve la raíz o `…/v2/` según el parámetro. Las tres pantallas (Almacenes, pestaña de Trabajo, diálogo Ruta 3D) la usan en vez de la constante.
- Para probar sin tocar F&O: `/v2/` tras el dominio o `&look=v2`; `&look=v1` fuerza la V1.

## 4e. Información, QR y 3D desde *Ubicaciones* (`WHS3DLocationDialog.xpp`)

Tres botones en el formulario de ubicaciones (form `WHSLocation`, `mi=WHSLocation`; la tabla es `WMSLocation`) que abren un diálogo encima, como «Ruta 3D»:

- **Información**: la ficha de la ubicación del hub sin su barra (`/hub/?embed=location`): qué contiene (artículo, cantidad, matrícula, estado), picks pendientes y dónde está (plano desde arriba y alzado con la altura real).
- **QR**: las etiquetas de **todas las filas marcadas** del mismo almacén (`/hub/?embed=qr&locs=…`). Cada una lleva un QR que abre la ficha en el móvil y un **Code 128 con el código de la ubicación** para la app móvil de almacén. Formato 50×30 mm, 100×50 mm o A4 de 21; «Imprimir» abre el diálogo de impresión del navegador (las impresoras a las que tienes acceso).
- **Ver en 3D**: la vista 3D de siempre con la ubicación marcada.

Un form (`WHS3DLocation`), tres menu items con `Parameters` = `info` / `qr` / `3d`, la extensión del form `WHSLocation` y un método nuevo `WHS3DUrl::hubUrl()`. Sin campos nuevos ni DB sync. Solo lectura.

## 5. Checklist de que F&O está listo

- [ ] Feature activa y almacén 24 con estrategia + algoritmo.
- [ ] Ubicaciones de la demo + muelle con XYZ.
- [ ] Un work con 5 picks antes del put, reordenados, IDs anotados en `docs/demo-runbook.md`.
- [ ] Postman: `getRoute` devuelve JSON con `lines` en orden.
- [ ] *Work details* abre la SWA en mock con el workId en la URL (aunque la API aún no esté).
