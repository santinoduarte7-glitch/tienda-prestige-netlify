// >>> Formato de carga de SAP (una fila por empleado y material). Editar acá si cambia la plantilla. <<<
const SOLICITANTE = 500007, TIPO_DOC = 96, COD_POSTAL = 1605, CIUDAD = 'Munro';
// [título, función(pedido, ítem)] — Documento, Legajo y Teléfono van como texto, igual que la planilla actual.
const COLUMNAS = [
  ['Solicitante',    () => SOLICITANTE],
  ['Tipo Doc.',      () => TIPO_DOC],
  ['Documento',      (o) => String(o.dni)],
  ['Legajo',         (o) => String(o.legajo)],
  ['Nombre Cliente', (o) => o.name],
  ['Mail',           (o) => o.email],
  ['Teléfono',       (o) => String(o.phone)],
  ['Dirección',      () => ''],
  ['Número',         () => ''],
  ['Cód. Postal',    () => COD_POSTAL],
  ['Ciudad',         () => CIUDAD],
  ['Material',       (o, i) => i.sku],
  ['Cantidad',       (o, i) => i.qty],
];
